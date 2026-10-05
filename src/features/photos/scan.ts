import { kvDelete, kvGet, kvSet, type KvDb } from '@/db/kv';
import {
  insertSeen,
  listScannable,
  markDetailed,
  type MediaScanRow,
  type SeenInput,
} from '@/db/repos/mediaScan';
import { clusterByTime, type PhotoMeta } from '@/domain/clustering';
import { fromEpochDay, type Ymd } from '@/domain/dates';
import {
  isScreenshot,
  pickDetailTargets,
  planScanWindow,
  resolveTzOffset,
  scanReducer,
  type ScanEvent,
  type ScanState,
  type ScanWindow,
} from '@/domain/mediaScan';
import type { MediaApi } from '@/platform/media';

export const SCAN_CURSOR_KEY = 'scan_cursor';
export const SCAN_PROGRESS_KEY = 'scan_progress';
const PAGE_SIZE = 500;
const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

export interface ScanDeps {
  db: KvDb;
  media: MediaApi;
  now(): number;
  /** 그 시각의 기기 UTC 오프셋(분, 동쪽이 +). */
  offsetMin(at: number): number;
  onState?(state: ScanState): void;
}

export interface ScanOptions {
  startedOn: Ymd;
  /** 첫 스캔 범위를 사귄 날이 아닌 날짜부터로 바꿀 때. */
  startFrom?: Ymd | null;
  forceFull?: boolean;
  /** 앱이 백그라운드로 가는 등 중단할 때 `aborted`를 true로 바꾼다. 저장한 진행은 남는다. */
  signal?: { aborted: boolean };
}

// 끊긴 1단계를 이어 하려고 저장하는 값. 2단계는 행 상태(`seen`/`detailed`)가 곧 진행 상태다.
type Progress = { window: ScanWindow; startedAt: number; after: string | null };

function parseProgress(raw: string | null): Progress | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Progress;
    if (typeof p.startedAt === 'number' && p.window && typeof p.window.floorMs === 'number') {
      return { window: p.window, startedAt: p.startedAt, after: p.after ?? null };
    }
  } catch {
    // 깨진 값은 처음부터 다시 한다.
  }
  return null;
}

function toMeta(r: MediaScanRow): PhotoMeta {
  return { id: r.assetId, takenAt: r.takenAt, tzOffsetMin: r.tzOffsetMin, lat: r.lat, lng: r.lng };
}

export async function readScanCursor(db: KvDb): Promise<Ymd | null> {
  return kvGet(db, SCAN_CURSOR_KEY);
}

function localYmd(ms: number, offsetMin: number): Ymd {
  return fromEpochDay(Math.floor((ms + offsetMin * MIN_MS) / DAY_MS));
}

/**
 * 사진 스캔 한 번. 권한 → 1단계(시각만, 페이지마다 저장) → 묶음 → 2단계(3장 이상 묶음만 상세) → 기록.
 * 중간에 끊겨도 1단계는 저장된 커서부터, 2단계는 남은 `seen` 행부터 이어 한다.
 */
export async function runScan(deps: ScanDeps, opts: ScanOptions): Promise<ScanState> {
  let state: ScanState = { phase: 'idle' };
  const send = (ev: ScanEvent) => {
    state = scanReducer(state, ev);
    deps.onState?.(state);
  };
  const aborted = () => opts.signal?.aborted === true;

  try {
    const { db, media } = deps;

    let perm = await media.getPermission();
    if (perm.access === 'none' && perm.canAskAgain) perm = await media.requestPermission();
    send({ type: 'permission', ...perm });
    if (perm.access === 'none') return state;

    const nowMs = deps.now();
    let progress = parseProgress(await kvGet(db, SCAN_PROGRESS_KEY));
    if (!progress) {
      const window = planScanWindow({
        startedOn: opts.startedOn,
        startFrom: opts.startFrom,
        cursor: await readScanCursor(db),
        offsetMin: deps.offsetMin(nowMs),
        forceFull: opts.forceFull,
      });
      progress = { window, startedAt: nowMs, after: null };
      await kvSet(db, SCAN_PROGRESS_KEY, JSON.stringify(progress));
    }
    const { window } = progress;

    // 1단계: 촬영 시각만 읽는다. 수정 시각 내림차순이라 증분은 범위를 벗어나면 멈춘다.
    const screenshotAlbums = await media.getScreenshotAlbumIds();
    let after = progress.after;
    for (;;) {
      if (aborted()) return state;
      const page = await media.listPage({
        after,
        first: PAGE_SIZE,
        createdAfter: window.mode === 'full' ? window.floorMs : undefined,
      });
      const rows: SeenInput[] = [];
      let reachedEnd = !page.hasNextPage;
      for (const a of page.assets) {
        if (window.discoverFromMs !== null && a.modifiedAt < window.discoverFromMs) {
          reachedEnd = true;
          continue;
        }
        if (a.takenAt <= 0 || a.takenAt < window.floorMs) continue;
        const ignored = isScreenshot({
          mediaSubtypes: a.mediaSubtypes,
          filename: a.filename,
          inScreenshotAlbum: a.albumId !== null && screenshotAlbums.has(a.albumId),
        });
        rows.push({ assetId: a.id, takenAt: a.takenAt, state: ignored ? 'ignored' : 'seen' });
      }
      await insertSeen(db, rows);
      send({ type: 'stage1Page', count: page.assets.length });
      after = page.endCursor;
      await kvSet(db, SCAN_PROGRESS_KEY, JSON.stringify({ ...progress, after }));
      if (reachedEnd || after === null) break;
    }

    // 묶음: 새로 본 사진만이 아니라 범위 안의 모든 후보 사진으로 묶어야 이전 스캔의 사진과 이어진다.
    const defaultOffset = deps.offsetMin(progress.startedAt);
    const rows = await listScannable(db, window.floorMs);
    const stateById = new Map(rows.map((r) => [r.assetId, r.state] as const));
    const targets = pickDetailTargets(clusterByTime(rows.map(toMeta), defaultOffset), stateById);
    send({ type: 'stage1Done', detailTotal: targets.length });

    // 2단계: 3장 이상 묶음의 사진만 위치·EXIF를 읽는다. 사진마다 저장하므로 끊겨도 이어진다.
    let failed = 0;
    for (const id of targets) {
      if (aborted()) return state;
      const detail = await media.getDetail(id);
      if (detail) {
        await markDetailed(db, id, {
          lat: detail.lat,
          lng: detail.lng,
          tzOffsetMin: resolveTzOffset(detail.exif, defaultOffset),
        });
      } else {
        failed += 1;
      }
      send({ type: 'detail' });
    }

    const finalRows = await listScannable(db, window.floorMs);
    const clusters = clusterByTime(finalRows.map(toMeta), defaultOffset).length;
    // 스캔을 시작한 날을 기록한다. 도중에 들어온 사진은 다음 증분의 7일 겹침이 잡는다.
    await kvSet(db, SCAN_CURSOR_KEY, localYmd(progress.startedAt, defaultOffset));
    await kvDelete(db, SCAN_PROGRESS_KEY);
    send({ type: 'finished', clusters, failed, limited: perm.access === 'limited' });
    return state;
  } catch (e) {
    send({ type: 'failed', message: e instanceof Error ? e.message : String(e) });
    return state;
  }
}
