// 사진 스캔의 순수 규칙(SPEC F2, D-007): 스캔 범위, 스크린샷 판정, 오프셋 해석, 상태 기계.
import { addDays, toEpochDay, type Ymd } from './dates';
import type { Cluster, PhotoMeta } from './clustering';

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;
export const INCREMENTAL_OVERLAP_DAYS = 7;

export type ScanMode = 'full' | 'incremental';

export type ScanWindow = {
  mode: ScanMode;
  /** 이 시각 이전에 찍힌 사진은 대상이 아니다(사귄 날 또는 사용자가 바꾼 시작일의 0시). */
  floorMs: number;
  /** 증분일 때만. 이 시각 이후에 만들어졌거나 바뀐 사진을 훑는다. 전체 스캔이면 null. */
  discoverFromMs: number | null;
};

function startOfDayMs(ymd: Ymd, offsetMin: number): number {
  return toEpochDay(ymd) * DAY_MS - offsetMin * MIN_MS;
}

/**
 * 스캔 범위. 마지막 스캔 날짜(`scan_cursor`)가 없거나 `forceFull`이면 전체 스캔이다.
 * 증분은 "마지막 스캔 날짜 − 7일"부터 본다. 카톡 등으로 나중에 저장된 옛 사진은 촬영 시각이 아니라
 * 기기에 들어온(수정) 시각으로 찾는다.
 */
export function planScanWindow(input: {
  startedOn: Ymd;
  startFrom?: Ymd | null;
  cursor: Ymd | null;
  offsetMin: number;
  forceFull?: boolean;
}): ScanWindow {
  const floorMs = startOfDayMs(input.startFrom ?? input.startedOn, input.offsetMin);
  if (!input.cursor || input.forceFull) return { mode: 'full', floorMs, discoverFromMs: null };
  const from = startOfDayMs(addDays(input.cursor, -INCREMENTAL_OVERLAP_DAYS), input.offsetMin);
  return { mode: 'incremental', floorMs, discoverFromMs: from };
}

const SCREENSHOT_NAME = /^screen[\s_-]?shot|스크린샷|화면 ?캡처/i;
const SCREENSHOT_ALBUM = /screen[\s_-]?shots?|스크린샷|화면 ?캡처/i;

export function isScreenshotAlbumTitle(title: string): boolean {
  return SCREENSHOT_ALBUM.test(title);
}

/** iOS는 mediaSubtypes, Android는 Screenshots 앨범·파일명으로 가린다. */
export function isScreenshot(a: {
  mediaSubtypes?: readonly string[] | null;
  filename?: string | null;
  inScreenshotAlbum?: boolean;
}): boolean {
  return (
    a.mediaSubtypes?.includes('screenshot') === true ||
    a.inScreenshotAlbum === true ||
    (a.filename != null && SCREENSHOT_NAME.test(a.filename))
  );
}

/** `+09:00`, `-03:30`, `Z`를 분으로. 형식이 다르면 null. */
export function parseOffsetString(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (t === 'Z') return 0;
  const m = /^([+-])(\d{1,2}):?(\d{2})$/.exec(t);
  if (!m) return null;
  const hours = Number(m[2]);
  const mins = Number(m[3]);
  if (hours > 14 || mins > 59) return null;
  const v = hours * 60 + mins;
  return m[1] === '-' ? -v : v;
}

const OFFSET_KEYS = ['OffsetTimeOriginal', 'OffsetTimeDigitized', 'OffsetTime'] as const;

function findOffset(obj: Record<string, unknown>): number | null {
  for (const k of OFFSET_KEYS) {
    const v = parseOffsetString(obj[k]);
    if (v !== null) return v;
  }
  return null;
}

/** EXIF(평평한 객체 또는 iOS의 `{Exif}` 하위 객체)의 오프셋. 없으면 스캔 시점 기기 오프셋. */
export function resolveTzOffset(exif: unknown, deviceOffsetMin: number): number {
  if (exif && typeof exif === 'object') {
    const flat = exif as Record<string, unknown>;
    const direct = findOffset(flat);
    if (direct !== null) return direct;
    for (const key of ['{Exif}', 'Exif']) {
      const nested = flat[key];
      if (nested && typeof nested === 'object') {
        const v = findOffset(nested as Record<string, unknown>);
        if (v !== null) return v;
      }
    }
  }
  return deviceOffsetMin;
}

export type ScanRowState = 'seen' | 'detailed' | 'in_card' | 'skipped' | 'ignored';

/** 2단계 대상: 3장 이상 묶음 안에서 아직 1단계에 머문(`seen`) 사진. */
export function pickDetailTargets(
  clusters: readonly Cluster<PhotoMeta>[],
  stateById: ReadonlyMap<string, ScanRowState>,
): string[] {
  const out: string[] = [];
  for (const c of clusters) {
    for (const p of c.photos) if (stateById.get(p.id) === 'seen') out.push(p.id);
  }
  return out;
}

// ---- 상태 기계 ----

export type PhotoAccess = 'all' | 'limited' | 'none';

export type ScanState =
  | { phase: 'idle' }
  | { phase: 'denied'; canAskAgain: boolean }
  | { phase: 'stage1'; scanned: number }
  | { phase: 'stage2'; done: number; total: number }
  | { phase: 'done'; clusters: number; detailed: number; failed: number; limited: boolean }
  | { phase: 'error'; message: string };

export type ScanEvent =
  | { type: 'permission'; access: PhotoAccess; canAskAgain: boolean }
  | { type: 'stage1Page'; count: number }
  | { type: 'stage1Done'; detailTotal: number }
  | { type: 'detail' }
  | { type: 'finished'; clusters: number; failed: number; limited: boolean }
  | { type: 'failed'; message: string }
  | { type: 'reset' };

/** 권한 확인 후 `stage1` → `stage2` → `done`. 끊긴 스캔을 이어 하면 같은 흐름을 다시 탄다. */
export function scanReducer(state: ScanState, ev: ScanEvent): ScanState {
  if (ev.type === 'reset') return { phase: 'idle' };
  if (ev.type === 'failed') return { phase: 'error', message: ev.message };
  switch (state.phase) {
    case 'idle':
    case 'denied':
    case 'error':
      if (ev.type !== 'permission') return state;
      return ev.access === 'none'
        ? { phase: 'denied', canAskAgain: ev.canAskAgain }
        : { phase: 'stage1', scanned: 0 };
    case 'stage1':
      if (ev.type === 'stage1Page') return { phase: 'stage1', scanned: state.scanned + ev.count };
      if (ev.type === 'stage1Done') return { phase: 'stage2', done: 0, total: ev.detailTotal };
      return state;
    case 'stage2':
      if (ev.type === 'detail') return { ...state, done: state.done + 1 };
      if (ev.type === 'finished') {
        return {
          phase: 'done',
          clusters: ev.clusters,
          detailed: state.done,
          failed: ev.failed,
          limited: ev.limited,
        };
      }
      return state;
    case 'done':
      return state;
  }
}

/** 진행률 0~1. 1단계는 전체 장수를 미리 알 수 없어 `stage1Total`이 있을 때만 계산한다. */
export function scanFraction(state: ScanState, stage1Total?: number): number {
  switch (state.phase) {
    case 'stage1':
      return stage1Total ? Math.min(0.5, (state.scanned / stage1Total) * 0.5) : 0;
    case 'stage2':
      return state.total === 0 ? 0.5 : 0.5 + (state.done / state.total) * 0.5;
    case 'done':
      return 1;
    default:
      return 0;
  }
}
