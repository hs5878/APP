import { kvGet, kvSet } from '@/db/kv';
import { runMigrations } from '@/db/migrate';
import { countByState, listScannable } from '@/db/repos/mediaScan';
import { createTestDb } from '@/db/testing';
import type { ScanState } from '@/domain/mediaScan';
import type { AssetDetail, MediaApi, PhotoPermission, RawAsset } from '@/platform/media';
import { runScan, SCAN_CURSOR_KEY, SCAN_PROGRESS_KEY, type ScanDeps } from './scan';

const KST = 540;
const MIN = 60_000;
const kst = (y: number, mo: number, d: number, h: number, mi = 0) =>
  Date.UTC(y, mo - 1, d, h, mi) - KST * MIN;

type FakeAsset = Partial<RawAsset> & { id: string; takenAt: number; detail?: AssetDetail | null };

function fakeMedia(
  assets: FakeAsset[],
  perm: PhotoPermission = { access: 'all', canAskAgain: true },
) {
  const calls = { pages: 0, details: [] as string[] };
  const full: (RawAsset & { detail: AssetDetail | null })[] = assets.map((a) => ({
    modifiedAt: a.takenAt,
    filename: `IMG_${a.id}.jpg`,
    mediaSubtypes: [],
    albumId: null,
    detail: { lat: null, lng: null, exif: null },
    ...a,
  }));
  const api: MediaApi = {
    getPermission: async () => perm,
    requestPermission: async () => perm,
    presentLimitedPicker: async () => {},
    listPage: async ({ after, first, createdAfter }) => {
      calls.pages += 1;
      const sorted = full
        .filter((a) => createdAfter === undefined || a.takenAt >= createdAfter)
        .sort((a, b) => b.modifiedAt - a.modifiedAt);
      const start = after ? Number(after) : 0;
      const slice = sorted.slice(start, start + first);
      const end = start + slice.length;
      const hasNextPage = end < sorted.length;
      return { assets: slice, endCursor: hasNextPage ? String(end) : null, hasNextPage };
    },
    getDetail: async (id) => {
      calls.details.push(id);
      return full.find((a) => a.id === id)?.detail ?? null;
    },
    getScreenshotAlbumIds: async () => new Set(['shots']),
  };
  return { api, calls };
}

async function setup(media: MediaApi, now: number, states: ScanState[] = []) {
  const t = createTestDb();
  await runMigrations(t.runner);
  const deps: ScanDeps = {
    db: t.db,
    media,
    now: () => now,
    offsetMin: () => KST,
    onState: (s) => states.push(s),
  };
  return { db: t.db, deps };
}

const opts = { startedOn: '2026-01-01' };
// 9/20 데이트 사진 3장 + 9/21 혼자 1장
const date = (prefix: string, d: number) =>
  [0, 20, 40].map((m, i): FakeAsset => ({
    id: `${prefix}${i}`,
    takenAt: kst(2026, 9, d, 14, m),
    detail: { lat: 37.5 + i * 0.0001, lng: 127, exif: { OffsetTimeOriginal: '+09:00' } },
  }));

describe('runScan', () => {
  it('3장 이상 묶음만 2단계 상세를 읽고 기록한다', async () => {
    const { api, calls } = fakeMedia([
      ...date('a', 20),
      { id: 'lone', takenAt: kst(2026, 9, 22, 12) },
    ]);
    const states: ScanState[] = [];
    const { db, deps } = await setup(api, kst(2026, 9, 25, 10), states);

    const end = await runScan(deps, opts);

    expect(end).toEqual({ phase: 'done', clusters: 1, detailed: 3, failed: 0, limited: false });
    expect(calls.details.sort()).toEqual(['a0', 'a1', 'a2']);
    expect(await countByState(db)).toMatchObject({ seen: 1, detailed: 3 });
    const detailed = (await listScannable(db, 0)).filter((r) => r.state === 'detailed');
    expect(detailed[0]).toMatchObject({ lng: 127, tzOffsetMin: 540 });
    expect(states.map((s) => s.phase)).toEqual([
      'stage1',
      'stage1',
      'stage2',
      'stage2',
      'stage2',
      'stage2',
      'done',
    ]);
    expect(await kvGet(db, SCAN_CURSOR_KEY)).toBe('2026-09-25');
    expect(await kvGet(db, SCAN_PROGRESS_KEY)).toBeNull();
  });

  it('EXIF 오프셋이 없으면 기기 오프셋', async () => {
    const photos = date('a', 20).map((a) => ({ ...a, detail: { lat: null, lng: null, exif: {} } }));
    const { api } = fakeMedia(photos);
    const { db, deps } = await setup(api, kst(2026, 9, 25, 10));
    await runScan(deps, opts);
    const rows = await listScannable(db, 0);
    expect(rows.every((r) => r.tzOffsetMin === KST && r.lat === null)).toBe(true);
  });

  it('스크린샷은 ignored로 기록하고 묶음에 넣지 않는다', async () => {
    const photos: FakeAsset[] = [
      { id: 's1', takenAt: kst(2026, 9, 20, 14, 0), mediaSubtypes: ['screenshot'] },
      { id: 's2', takenAt: kst(2026, 9, 20, 14, 5), filename: 'Screenshot_1.png' },
      { id: 's3', takenAt: kst(2026, 9, 20, 14, 10), albumId: 'shots' },
      { id: 'p1', takenAt: kst(2026, 9, 20, 14, 15) },
      { id: 'p2', takenAt: kst(2026, 9, 20, 14, 20) },
    ];
    const { api, calls } = fakeMedia(photos);
    const { db, deps } = await setup(api, kst(2026, 9, 25, 10));
    const end = await runScan(deps, opts);
    expect(await countByState(db)).toMatchObject({ ignored: 3, seen: 2 });
    expect(calls.details).toEqual([]);
    expect(end).toMatchObject({ phase: 'done', clusters: 0 });
  });

  it('사귄 날 이전 사진은 제외', async () => {
    const { api } = fakeMedia(date('old', 20));
    const { db, deps } = await setup(api, kst(2026, 9, 25, 10));
    await runScan(deps, { startedOn: '2026-09-21' });
    expect(await countByState(db)).toMatchObject({ seen: 0 });
  });

  it('권한 거부면 아무것도 읽지 않고 denied', async () => {
    const { api, calls } = fakeMedia(date('a', 20), { access: 'none', canAskAgain: false });
    const { db, deps } = await setup(api, kst(2026, 9, 25, 10));
    expect(await runScan(deps, opts)).toEqual({ phase: 'denied', canAskAgain: false });
    expect(calls.pages).toBe(0);
    expect(await kvGet(db, SCAN_CURSOR_KEY)).toBeNull();
  });

  it('제한 접근이면 limited 표시', async () => {
    const { api } = fakeMedia(date('a', 20), { access: 'limited', canAskAgain: true });
    const { deps } = await setup(api, kst(2026, 9, 25, 10));
    expect(await runScan(deps, opts)).toMatchObject({ phase: 'done', limited: true });
  });

  it('상세를 못 읽은 사진은 failed로 세고 seen에 남는다', async () => {
    const photos = date('a', 20);
    photos[1] = { ...photos[1]!, detail: null };
    const { api } = fakeMedia(photos);
    const { db, deps } = await setup(api, kst(2026, 9, 25, 10));
    expect(await runScan(deps, opts)).toMatchObject({ phase: 'done', detailed: 3, failed: 1 });
    expect(await countByState(db)).toMatchObject({ seen: 1, detailed: 2 });
  });

  it('중간에 끊으면 진행을 남기고 이어 할 때 읽은 사진은 다시 읽지 않는다', async () => {
    const { api, calls } = fakeMedia([...date('a', 20), ...date('b', 21)]);
    const signal = { aborted: false };
    const { db, deps } = await setup(api, kst(2026, 9, 25, 10));
    deps.onState = (s) => {
      if (s.phase === 'stage2' && s.done === 2) signal.aborted = true;
    };

    const first = await runScan(deps, { ...opts, signal });
    expect(first.phase).toBe('stage2');
    expect(await kvGet(db, SCAN_PROGRESS_KEY)).not.toBeNull();
    expect(await kvGet(db, SCAN_CURSOR_KEY)).toBeNull();
    expect(calls.details).toHaveLength(2);

    deps.onState = undefined;
    const second = await runScan(deps, opts);
    expect(second).toMatchObject({ phase: 'done', clusters: 2 });
    expect(calls.details).toHaveLength(6); // 2 + 나머지 4, 중복 없음
    expect(new Set(calls.details).size).toBe(6);
    expect(await kvGet(db, SCAN_PROGRESS_KEY)).toBeNull();
  });

  it('1단계 도중 끊겨도 저장된 커서부터 이어 한다', async () => {
    const many: FakeAsset[] = Array.from({ length: 1200 }, (_, i) => ({
      id: `p${i}`,
      takenAt: kst(2026, 9, 1 + (i % 20), 10, i % 50),
    }));
    const { api, calls } = fakeMedia(many);
    const signal = { aborted: false };
    const { db, deps } = await setup(api, kst(2026, 10, 5, 10));
    deps.onState = (s) => {
      if (s.phase === 'stage1' && s.scanned >= 500) signal.aborted = true;
    };
    expect((await runScan(deps, { ...opts, signal })).phase).toBe('stage1');
    expect(calls.pages).toBe(1);

    deps.onState = undefined;
    const end = await runScan(deps, opts);
    expect(end.phase).toBe('done');
    expect(calls.pages).toBe(1 + 2); // 이어서 2페이지만
    expect((await countByState(db)).seen + (await countByState(db)).detailed).toBe(1200);
  });

  it('증분: 나중에 저장된 옛 사진(촬영은 오래됨, 수정 시각은 최근)이 다음 스캔에 잡힌다', async () => {
    const old = date('a', 20);
    const assets: FakeAsset[] = [...old];
    const { api } = fakeMedia(assets);
    const first = await setup(api, kst(2026, 9, 25, 10));
    await runScan(first.deps, opts);
    expect(await kvGet(first.db, SCAN_CURSOR_KEY)).toBe('2026-09-25');
    expect((await countByState(first.db)).detailed).toBe(3);

    // 10/20: 카톡으로 받은 9/3 사진 3장 저장. 촬영 시각은 한 달 전, 수정 시각은 지금.
    const received = date('k', 3).map((a) => ({ ...a, modifiedAt: kst(2026, 10, 19, 21) }));
    const media2 = fakeMedia([...old, ...received]);
    first.deps.media = media2.api;
    first.deps.now = () => kst(2026, 10, 20, 10);

    const end = await runScan(first.deps, opts);

    expect(end).toMatchObject({ phase: 'done', clusters: 2 });
    expect(media2.calls.details.sort()).toEqual(['k0', 'k1', 'k2']); // 새 사진만 상세
    expect(await kvGet(first.db, SCAN_CURSOR_KEY)).toBe('2026-10-20');
  });

  it('증분은 마지막 스캔 −7일보다 오래 안 바뀐 사진은 훑지 않는다', async () => {
    const stale = date('s', 3); // modifiedAt = takenAt (9월 초)
    const { api } = fakeMedia(stale);
    const { db, deps } = await setup(api, kst(2026, 9, 25, 10));
    await kvSet(db, SCAN_CURSOR_KEY, '2026-09-25');
    await runScan(deps, opts);
    expect(await countByState(db)).toMatchObject({ seen: 0, detailed: 0 });
  });

  it('오류는 error 상태로 돌려주고 진행을 남긴다', async () => {
    const { api } = fakeMedia(date('a', 20));
    api.listPage = async () => {
      throw new Error('디스크 오류');
    };
    const { db, deps } = await setup(api, kst(2026, 9, 25, 10));
    expect(await runScan(deps, opts)).toEqual({ phase: 'error', message: '디스크 오류' });
    expect(await kvGet(db, SCAN_PROGRESS_KEY)).not.toBeNull();
  });
});
