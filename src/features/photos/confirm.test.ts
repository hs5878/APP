import { eq } from 'drizzle-orm';
import { runMigrations } from '@/db/migrate';
import { countPendingCandidates, listCardStops, listPendingCandidates } from '@/db/repos/cards';
import { countByState, insertSeen, markDetailed } from '@/db/repos/mediaScan';
import { createTestDb } from '@/db/testing';
import { dateCards, mediaScan, photos, placeStops } from '@/db/schema';
import type { MediaApi, RawAsset } from '@/platform/media';
import type { ImageHandle, PhotoFilesApi } from '@/platform/photoFiles';
import { refreshCandidates, type CandidateDeps } from './candidates';
import { confirmCandidate, skipCandidate, type ConfirmDeps } from './confirm';
import { runScan } from './scan';

const KST = 540;
const MIN = 60_000;
const kst = (d: number, h: number, mi = 0) => Date.UTC(2026, 8, d, h, mi) - KST * MIN;
const NOW = kst(25, 12); // 9/25 낮: 9/20~9/24 묶음은 후보, 9/25 묶음은 보류

let seq = 0;
const newId = () => `id-${String(++seq).padStart(4, '0')}`;

function fakeFiles(unreadable: ReadonlySet<string> = new Set()) {
  const stored = new Map<string, string>();
  const removed: string[] = [];
  const saved: { maxEdge: number; quality: number }[] = [];
  const api: PhotoFilesApi = {
    resolveAssetUri: async (id) => (unreadable.has(id) ? null : `file:///gallery/${id}.heic`),
    openImage: async (): Promise<ImageHandle> => ({
      width: 4032,
      height: 3024,
      saveJpeg: async (maxEdge, quality) => {
        saved.push({ maxEdge, quality });
        const w = Math.min(4032, maxEdge);
        return {
          uri: `file:///tmp/${saved.length}.jpg`,
          width: w,
          height: Math.round((w * 3024) / 4032),
        };
      },
    }),
    store: async (_tmp, kind, id) => {
      const uri =
        kind === 'archive'
          ? `file:///documents/photos/${id}.jpg`
          : `file:///cache/thumbs/${id}.jpg`;
      stored.set(uri, kind);
      return uri;
    },
    remove: async (uri) => {
      removed.push(uri);
    },
  };
  return { api, stored, removed, saved };
}

function dateAssets(prefix: string, day: number, hour = 14, withGps = true): Partial<RawAsset>[] {
  return [0, 20, 40].map((m, i) => ({
    id: `${prefix}${i}`,
    takenAt: kst(day, hour, m),
    detail: withGps
      ? { lat: 37.5 + i * 0.00005, lng: 127.123456, exif: null }
      : { lat: null, lng: null, exif: null },
  }));
}

function fakeMedia(assets: ReturnType<typeof dateAssets>): MediaApi {
  const full = assets.map((a) => ({
    modifiedAt: a.takenAt!,
    filename: `IMG_${a.id}.jpg`,
    mediaSubtypes: [],
    albumId: null,
    ...a,
  })) as (RawAsset & { detail: { lat: number | null; lng: number | null; exif: unknown } })[];
  return {
    getPermission: async () => ({ access: 'all', canAskAgain: true }),
    requestPermission: async () => ({ access: 'all', canAskAgain: true }),
    presentLimitedPicker: async () => {},
    listPage: async ({ after, first }) => {
      const sorted = [...full].sort((a, b) => b.modifiedAt - a.modifiedAt);
      const start = after ? Number(after) : 0;
      const slice = sorted.slice(start, start + first);
      const end = start + slice.length;
      return {
        assets: slice,
        endCursor: end < sorted.length ? String(end) : null,
        hasNextPage: end < sorted.length,
      };
    },
    getDetail: async (id) => full.find((a) => a.id === id)?.detail ?? null,
    getScreenshotAlbumIds: async () => new Set(),
  };
}

async function setup(assets: ReturnType<typeof dateAssets>, files = fakeFiles()) {
  const t = createTestDb();
  await runMigrations(t.runner);
  const media = fakeMedia(assets);
  const scan = () =>
    runScan(
      { db: t.db, media, now: () => NOW, offsetMin: () => KST },
      { startedOn: '2026-01-01', forceFull: true },
    );
  const cand: CandidateDeps = {
    db: t.db,
    spaceId: 'space-1',
    now: () => NOW,
    offsetMin: () => KST,
    newId,
  };
  const deps: ConfirmDeps = {
    db: t.db,
    files: files.api,
    spaceId: 'space-1',
    userId: 'user-1',
    now: () => NOW,
    offsetMin: () => KST,
    newId,
  };
  await scan();
  await refreshCandidates(cand);
  return { ...t, files, scan, cand, deps };
}

describe('후보 만들기', () => {
  it('묶음을 후보로 만들고 오늘 묶음은 보류한다', async () => {
    const t = await setup([...dateAssets('a', 20), ...dateAssets('today', 25)]);
    const list = await listPendingCandidates(t.db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ date: '2026-09-20', status: 'pending', targetCardId: null });
    expect(JSON.parse(list[0]!.assetIds)).toEqual(['a0', 'a1', 'a2']);
  });

  it('다시 계산해도 같은 후보의 id를 지킨다', async () => {
    const t = await setup(dateAssets('a', 20));
    const [before] = await listPendingCandidates(t.db);
    await refreshCandidates(t.cand);
    const after = await listPendingCandidates(t.db);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(before!.id);
  });

  it('후보 단계에서는 카드·사진·스톱이 만들어지지 않는다(L 테이블에만 있다)', async () => {
    const t = await setup(dateAssets('a', 20));
    expect(await countPendingCandidates(t.db)).toBe(1);
    expect(await t.db.select().from(dateCards)).toHaveLength(0);
    expect(await t.db.select().from(photos)).toHaveLength(0);
    expect(await t.db.select().from(placeStops)).toHaveLength(0);
  });
});

describe('confirmCandidate: 새 카드', () => {
  it('보관본·썸네일을 만들고 카드·사진·스톱(이름 없음)을 저장한다', async () => {
    const t = await setup(dateAssets('a', 20));
    const [c] = await listPendingCandidates(t.db);
    const res = await confirmCandidate(t.deps, c!.id);
    expect(res).toMatchObject({ ok: true, mode: 'new', added: 3, failed: 0 });
    if (!res.ok) return;

    // 긴 변 2048px·JPEG 85%, 썸네일 400px
    expect(t.files.saved.filter((s) => s.maxEdge === 2048)).toHaveLength(3);
    expect(t.files.saved.filter((s) => s.maxEdge === 400)).toHaveLength(3);
    expect(t.files.saved.every((s) => s.quality === 0.85)).toBe(true);

    const [card] = await t.db.select().from(dateCards).where(eq(dateCards.id, res.cardId));
    expect(card).toMatchObject({
      date: '2026-09-20',
      startAt: kst(20, 14),
      endAt: kst(20, 14, 40),
      summary: '사진 3장',
      summarySource: 'template',
      spaceId: 'space-1',
      createdBy: 'user-1',
      dirty: 1,
    });

    const rows = await t.db.select().from(photos).where(eq(photos.cardId, res.cardId));
    expect(rows.map((p) => p.sort).sort()).toEqual([0, 1, 2]);
    expect(rows.every((p) => p.localPath?.startsWith('file:///documents/photos/'))).toBe(true);
    expect(rows.every((p) => p.uploadState === 'pending' && p.dirty === 1)).toBe(true);
    expect(rows.map((p) => p.localAssetId).sort()).toEqual(['a0', 'a1', 'a2']);
    expect(card!.coverPhotoId).toBe(rows.find((p) => p.sort === 0)!.id);

    const stops = await listCardStops(t.db, res.cardId);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({
      seq: 1,
      name: null,
      nameSource: 'auto',
      latC: 37.5,
      lngC: 127.123,
    });
    expect(rows.every((p) => p.placeStopId === stops[0]!.id)).toBe(true);
  });

  it('위치가 없는 사진은 스톱 없이 저장한다', async () => {
    const t = await setup(dateAssets('a', 20, 14, false));
    const [c] = await listPendingCandidates(t.db);
    const res = await confirmCandidate(t.deps, c!.id);
    expect(res.ok).toBe(true);
    expect(await t.db.select().from(placeStops)).toHaveLength(0);
  });

  it('확정 뒤 같은 사진은 다시 후보로 뜨지 않는다(다시 스캔해도)', async () => {
    const t = await setup(dateAssets('a', 20));
    const [c] = await listPendingCandidates(t.db);
    await confirmCandidate(t.deps, c!.id);

    expect((await countByState(t.db)).in_card).toBe(3);
    await refreshCandidates(t.cand);
    expect(await countPendingCandidates(t.db)).toBe(0);

    await t.scan();
    await refreshCandidates(t.cand);
    expect(await countPendingCandidates(t.db)).toBe(0);
  });

  it('같은 후보를 두 번 확정해도 카드는 하나다', async () => {
    const t = await setup(dateAssets('a', 20));
    const [c] = await listPendingCandidates(t.db);
    await confirmCandidate(t.deps, c!.id);
    expect(await confirmCandidate(t.deps, c!.id)).toEqual({ ok: false, reason: 'not_found' });
    expect(await t.db.select().from(dateCards)).toHaveLength(1);
  });

  it('읽을 수 없는 사진은 빼고 나머지만 기록한다', async () => {
    const t = await setup(dateAssets('a', 20), fakeFiles(new Set(['a1'])));
    const [c] = await listPendingCandidates(t.db);
    const res = await confirmCandidate(t.deps, c!.id);
    expect(res).toMatchObject({ ok: true, added: 2, failed: 1 });
    const states = await t.db.select().from(mediaScan).where(eq(mediaScan.assetId, 'a1'));
    expect(states[0]!.state).toBe('detailed'); // 못 읽은 사진은 카드에 들어가지 않았다
  });

  it('하나도 읽을 수 없으면 후보를 그대로 둔다', async () => {
    const t = await setup(dateAssets('a', 20), fakeFiles(new Set(['a0', 'a1', 'a2'])));
    const [c] = await listPendingCandidates(t.db);
    expect(await confirmCandidate(t.deps, c!.id)).toEqual({ ok: false, reason: 'no_photos' });
    expect(await countPendingCandidates(t.db)).toBe(1);
    expect(await t.db.select().from(dateCards)).toHaveLength(0);
  });

  it('저장이 실패하면 만든 파일을 지우고 후보를 그대로 둔다', async () => {
    const t = await setup(dateAssets('a', 20));
    const [c] = await listPendingCandidates(t.db);
    // 카드 id가 겹치게 해서 INSERT를 실패시킨다.
    const clash = { ...t.deps, newId: () => 'same-id' };
    await expect(confirmCandidate(clash, c!.id)).rejects.toBeDefined();
    expect(t.files.removed.length).toBe(6);
    expect(await countPendingCandidates(t.db)).toBe(1);
    expect(await t.db.select().from(dateCards)).toHaveLength(0);
  });
});

describe('confirmCandidate: 겹치는 카드에 추가', () => {
  async function withExistingCard() {
    const t = await setup(dateAssets('a', 20));
    const [first] = await listPendingCandidates(t.db);
    const done = await confirmCandidate(t.deps, first!.id);
    if (!done.ok) throw new Error('setup');
    // 같은 날 1시간 안쪽에 새로 들어온 사진(예: 카톡으로 받은 사진)
    return { t, cardId: done.cardId };
  }

  it('겹치는 새 후보에는 대상 카드가 붙는다', async () => {
    const { t, cardId } = await withExistingCard();
    const more = [0, 10, 20].map((m, i) => ({
      id: `late${i}`,
      takenAt: kst(20, 15, 30 + m), // 카드 끝(14:40)에서 50분 뒤
      detail: { lat: null, lng: null, exif: null },
    }));
    const t2 = await extend(t, more);
    const [c] = await listPendingCandidates(t2.db);
    expect(c!.targetCardId).toBe(cardId);
  });

  it('[이 카드에 추가]는 사진을 기존 카드에 더하고 시간대·요약을 맞춘다', async () => {
    const { t, cardId } = await withExistingCard();
    const more = [0, 10, 20].map((m, i) => ({
      id: `late${i}`,
      takenAt: kst(20, 15, 30 + m),
      detail: { lat: null, lng: null, exif: null },
    }));
    await extend(t, more);
    const [c] = await listPendingCandidates(t.db);
    const res = await confirmCandidate(t.deps, c!.id, 'append');
    expect(res).toMatchObject({ ok: true, mode: 'append', cardId, added: 3 });

    expect(await t.db.select().from(dateCards)).toHaveLength(1);
    const [card] = await t.db.select().from(dateCards);
    expect(card).toMatchObject({
      startAt: kst(20, 14),
      endAt: kst(20, 15, 50),
      summary: '사진 6장',
    });
    const rows = await t.db.select().from(photos).where(eq(photos.cardId, cardId));
    expect(rows.map((p) => p.sort).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('[새 카드로 기록]이면 대상 카드를 건드리지 않는다', async () => {
    const { t, cardId } = await withExistingCard();
    const more = [0, 10, 20].map((m, i) => ({
      id: `late${i}`,
      takenAt: kst(20, 15, 30 + m),
      detail: { lat: null, lng: null, exif: null },
    }));
    await extend(t, more);
    const [c] = await listPendingCandidates(t.db);
    const res = await confirmCandidate(t.deps, c!.id, 'new');
    expect(res).toMatchObject({ ok: true, mode: 'new' });
    expect(res.ok && res.cardId).not.toBe(cardId);
    expect(await t.db.select().from(dateCards)).toHaveLength(2);
  });

  // 같은 DB에 사진을 더 넣고 다시 스캔·후보 계산을 한다.
  async function extend(t: Awaited<ReturnType<typeof setup>>, extra: Record<string, unknown>[]) {
    await insertSeen(
      t.db,
      extra.map((e) => ({ assetId: e.id as string, takenAt: e.takenAt as number })),
    );
    for (const e of extra) {
      await markDetailed(t.db, e.id as string, { lat: null, lng: null, tzOffsetMin: KST });
    }
    await refreshCandidates(t.cand);
    return t;
  }
});

describe('skipCandidate', () => {
  it('건너뛴 사진은 다시 후보로 뜨지 않는다(다시 스캔해도)', async () => {
    const t = await setup(dateAssets('a', 20));
    const [c] = await listPendingCandidates(t.db);
    expect(await skipCandidate(t.db, c!.id)).toBe(true);

    expect((await countByState(t.db)).skipped).toBe(3);
    await refreshCandidates(t.cand);
    expect(await countPendingCandidates(t.db)).toBe(0);

    await t.scan();
    await refreshCandidates(t.cand);
    expect(await countPendingCandidates(t.db)).toBe(0);
    expect(await t.db.select().from(dateCards)).toHaveLength(0);
  });

  it('이미 처리한 후보는 다시 건너뛸 수 없다', async () => {
    const t = await setup(dateAssets('a', 20));
    const [c] = await listPendingCandidates(t.db);
    await skipCandidate(t.db, c!.id);
    expect(await skipCandidate(t.db, c!.id)).toBe(false);
  });
});
