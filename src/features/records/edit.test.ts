import { eq } from 'drizzle-orm';
import { runMigrations } from '@/db/migrate';
import { getCard, insertCard, listCardPhotos, type NewPhoto } from '@/db/repos/cards';
import { insertSeen, transitionStates } from '@/db/repos/mediaScan';
import { createTestDb } from '@/db/testing';
import { dateCards, mediaScan, photos } from '@/db/schema';
import type { ImageHandle, PhotoFilesApi } from '@/platform/photoFiles';
import type { PickedPhoto } from '@/platform/photoPicker';
import {
  addPhotos,
  changeCardDate,
  createEmptyCard,
  deleteCard,
  movePhotosToCard,
  removePhotos,
  setCover,
  type EditDeps,
} from './edit';

const KST = 540;

let seq = 0;
const newId = () => `id-${String(++seq).padStart(4, '0')}`;

function fakeFiles(unreadable: ReadonlySet<string> = new Set()) {
  const removed: string[] = [];
  const api: PhotoFilesApi = {
    resolveAssetUri: async () => null,
    openImage: async (uri): Promise<ImageHandle> => {
      if (unreadable.has(uri)) throw new Error('unreadable');
      return {
        width: 4032,
        height: 3024,
        saveJpeg: async (maxEdge) => ({
          uri: `file:///tmp/${uri.split('/').pop()}`,
          width: Math.min(4032, maxEdge),
          height: 100,
        }),
      };
    },
    store: async (_tmp, kind, id) =>
      kind === 'archive' ? `file:///documents/photos/${id}.jpg` : `file:///cache/thumbs/${id}.jpg`,
    remove: async (uri) => {
      removed.push(uri);
    },
  };
  return { api, removed };
}

const photo = (id: string, sort: number, takenAt = 1000 + sort): NewPhoto => ({
  id,
  takenAt,
  tzOffsetMin: KST,
  width: 10,
  height: 10,
  placeStopId: null,
  sort,
  localAssetId: `a-${id}`,
  localPath: `/p/${id}.jpg`,
  lat: null,
  lng: null,
});

async function setup(unreadable?: ReadonlySet<string>) {
  const t = createTestDb();
  await runMigrations(t.runner);
  const files = fakeFiles(unreadable);
  let clock = 5000;
  const deps: EditDeps = {
    db: t.db,
    files: files.api,
    spaceId: 's1',
    userId: 'u1',
    now: () => ++clock,
    offsetMin: () => KST,
    newId,
  };
  const owner = { spaceId: 's1', userId: 'u1', now: 1 };
  const addCard = async (id: string, ids: string[], source: 'template' | 'manual' = 'template') => {
    await insertCard(t.db, {
      ...owner,
      id,
      date: '2026-09-20',
      startAt: 1000,
      endAt: 1000 + ids.length,
      summary: source === 'template' ? `사진 ${ids.length}장` : '내가 쓴 글',
      coverPhotoId: ids[0] ?? null,
      stops: [],
      photos: ids.map((p, i) => photo(p, i)),
    });
    if (source === 'manual') {
      await t.db.update(dateCards).set({ summarySource: 'manual' }).where(eq(dateCards.id, id));
    }
  };
  const inCard = async (assetIds: string[]) => {
    await insertSeen(
      t.db,
      assetIds.map((assetId) => ({ assetId, takenAt: 1 })),
    );
    await transitionStates(t.db, assetIds, ['seen'], 'in_card');
  };
  return { ...t, files, deps, addCard, inCard };
}

const pick = (name: string, takenAt: number | null = 2000): PickedPhoto => ({
  uri: `file:///picked/${name}.jpg`,
  assetId: `asset-${name}`,
  takenAt,
  lat: 37.5,
  lng: 127.1,
});

describe('createEmptyCard / changeCardDate', () => {
  it('사진 없는 카드를 만들고, 잘못된 날짜는 거절한다', async () => {
    const t = await setup();
    expect(await createEmptyCard(t.deps, '2026-02-30')).toEqual({ ok: false, reason: 'bad_date' });
    const r = await createEmptyCard(t.deps, '2026-10-01');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await getCard(t.db, r.cardId)).toMatchObject({ date: '2026-10-01', dirty: 1 });
  });

  it('날짜를 바꾸면 dirty = 1', async () => {
    const t = await setup();
    await t.addCard('c1', ['p1']);
    await t.db.update(dateCards).set({ dirty: 0 });
    expect(await changeCardDate(t.deps, 'c1', 'nope')).toEqual({ ok: false, reason: 'bad_date' });
    expect(await changeCardDate(t.deps, 'c1', '2026-09-22')).toEqual({ ok: true });
    expect(await getCard(t.db, 'c1')).toMatchObject({ date: '2026-09-22', dirty: 1 });
    expect(await changeCardDate(t.deps, 'none', '2026-09-22')).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('addPhotos', () => {
  it('카드 끝에 이어 붙이고 시간대·템플릿 요약·dirty를 맞춘다', async () => {
    const t = await setup();
    await t.addCard('c1', ['p1', 'p2']);
    const r = await addPhotos(t.deps, 'c1', [pick('x', 5000), pick('y', 3000)]);
    expect(r).toEqual({ ok: true, added: 2, failed: 0 });

    const list = await listCardPhotos(t.db, 'c1');
    expect(list.map((p) => [p.sort, p.dirty])).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
    expect(list.slice(2).map((p) => p.takenAt)).toEqual([5000, 3000]);
    expect(list[2]).toMatchObject({ localAssetId: 'asset-x', lat: 37.5, tzOffsetMin: KST });
    expect(await getCard(t.db, 'c1')).toMatchObject({
      startAt: 1000,
      endAt: 5000,
      summary: '사진 4장',
      dirty: 1,
    });
  });

  it('직접 쓴 요약은 그대로 두고, 표지가 없으면 첫 사진을 표지로 지정하지 않는다', async () => {
    const t = await setup();
    await t.addCard('c1', ['p1'], 'manual');
    await addPhotos(t.deps, 'c1', [pick('x')]);
    expect(await getCard(t.db, 'c1')).toMatchObject({ summary: '내가 쓴 글', coverPhotoId: 'p1' });
  });

  it('촬영 시각을 모르면 카드의 마지막 사진 시각, 사진 없는 카드는 날짜 정오', async () => {
    const t = await setup();
    await t.addCard('c1', ['p1', 'p2']);
    await addPhotos(t.deps, 'c1', [pick('x', null)]);
    expect((await listCardPhotos(t.db, 'c1')).at(-1)!.takenAt).toBe(1002);

    const e = await createEmptyCard(t.deps, '2026-09-20');
    if (!e.ok) throw new Error('create');
    await addPhotos(t.deps, e.cardId, [pick('y', null)]);
    const [added] = await listCardPhotos(t.db, e.cardId);
    expect(added!.takenAt).toBe(Date.UTC(2026, 8, 20, 12) - KST * 60_000);
    expect(await getCard(t.db, e.cardId)).toMatchObject({ startAt: added!.takenAt });
  });

  it('읽을 수 없는 사진은 건너뛰고, 모두 실패하면 아무것도 바꾸지 않는다', async () => {
    const t = await setup(new Set(['file:///picked/bad.jpg']));
    await t.addCard('c1', ['p1']);
    expect(await addPhotos(t.deps, 'c1', [pick('good'), pick('bad')])).toEqual({
      ok: true,
      added: 1,
      failed: 1,
    });
    expect(await addPhotos(t.deps, 'c1', [pick('bad')])).toEqual({
      ok: false,
      reason: 'no_photos',
    });
    expect(await listCardPhotos(t.db, 'c1')).toHaveLength(2);
  });

  it('저장이 실패하면 만든 파일을 지운다', async () => {
    const t = await setup();
    await t.addCard('c1', ['p1']);
    // 같은 id를 두 번 쓰게 해서 PK 충돌로 트랜잭션을 실패시킨다.
    const deps = { ...t.deps, newId: () => 'dup' };
    await expect(addPhotos(deps, 'c1', [pick('x'), pick('y')])).rejects.toThrow();
    expect(t.files.removed.sort()).toEqual([
      'file:///cache/thumbs/dup.jpg',
      'file:///cache/thumbs/dup.jpg',
      'file:///documents/photos/dup.jpg',
      'file:///documents/photos/dup.jpg',
    ]);
    expect(await listCardPhotos(t.db, 'c1')).toHaveLength(1);
  });
});

describe('removePhotos', () => {
  it('소프트 삭제 후 sort를 다시 매기고 표지·시간대·요약을 맞춘다', async () => {
    const t = await setup();
    await t.addCard('c1', ['p1', 'p2', 'p3']);
    await t.inCard(['a-p1', 'a-p2', 'a-p3']);
    expect(await removePhotos(t.deps, 'c1', ['p1', 'p2', 'zzz'])).toEqual({
      ok: true,
      removed: 2,
    });

    const list = await listCardPhotos(t.db, 'c1');
    expect(list.map((p) => [p.id, p.sort])).toEqual([['p3', 0]]);
    const raw = (await t.db.select().from(photos).where(eq(photos.id, 'p1')))[0]!;
    expect(raw).toMatchObject({ dirty: 1 });
    expect(raw.deletedAt).not.toBeNull();
    // 표지였던 p1이 빠졌으므로 지정이 풀린다.
    expect(await getCard(t.db, 'c1')).toMatchObject({
      coverPhotoId: null,
      startAt: 1002,
      endAt: 1002,
      summary: '사진 1장',
    });
    // 갤러리 사진은 다시 후보로 뜨지 않게 skipped.
    const states = await t.db.select().from(mediaScan);
    expect(Object.fromEntries(states.map((s) => [s.assetId, s.state]))).toEqual({
      'a-p1': 'skipped',
      'a-p2': 'skipped',
      'a-p3': 'in_card',
    });
  });

  it('다른 카드의 사진은 지우지 않는다', async () => {
    const t = await setup();
    await t.addCard('c1', ['p1']);
    await t.addCard('c2', ['q1']);
    expect(await removePhotos(t.deps, 'c1', ['q1'])).toEqual({ ok: true, removed: 0 });
    expect(await listCardPhotos(t.db, 'c2')).toHaveLength(1);
  });
});

describe('movePhotosToCard', () => {
  it('대상 카드 끝에 붙이고 원래 카드 sort를 다시 매기며 양쪽 카드를 맞춘다', async () => {
    const t = await setup();
    await t.addCard('c1', ['p1', 'p2', 'p3', 'p4']);
    await t.addCard('c2', ['q1']);
    await t.db.update(dateCards).set({ dirty: 0 });

    const r = await movePhotosToCard(t.deps, 'c1', ['p3', 'p1'], 'c2');
    expect(r).toEqual({ ok: true, moved: 2 });

    expect((await listCardPhotos(t.db, 'c1')).map((p) => [p.id, p.sort])).toEqual([
      ['p2', 0],
      ['p4', 1],
    ]);
    // 카드 안 순서(p1, p3)를 지켜 붙는다.
    expect((await listCardPhotos(t.db, 'c2')).map((p) => [p.id, p.sort])).toEqual([
      ['q1', 0],
      ['p1', 1],
      ['p3', 2],
    ]);
    expect(await getCard(t.db, 'c1')).toMatchObject({
      coverPhotoId: null, // 표지 p1이 떠났다
      summary: '사진 2장',
      dirty: 1,
    });
    expect(await getCard(t.db, 'c2')).toMatchObject({ summary: '사진 3장', dirty: 1 });
  });

  it('같은 카드나 없는 카드로는 옮기지 않는다', async () => {
    const t = await setup();
    await t.addCard('c1', ['p1']);
    expect(await movePhotosToCard(t.deps, 'c1', ['p1'], 'c1')).toEqual({
      ok: false,
      reason: 'same_card',
    });
    expect(await movePhotosToCard(t.deps, 'c1', ['p1'], 'none')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await listCardPhotos(t.db, 'c1')).toHaveLength(1);
  });
});

describe('setCover', () => {
  it('그 카드 안 사진만 표지로 지정할 수 있다', async () => {
    const t = await setup();
    await t.addCard('c1', ['p1', 'p2']);
    await t.addCard('c2', ['q1']);
    expect(await setCover(t.deps, 'c1', 'q1')).toEqual({ ok: false, reason: 'not_in_card' });
    expect(await setCover(t.deps, 'c1', 'p2')).toEqual({ ok: true });
    expect(await getCard(t.db, 'c1')).toMatchObject({ coverPhotoId: 'p2', dirty: 1 });
  });
});

describe('deleteCard', () => {
  it('소프트 삭제하고 사진은 skipped로 남긴다', async () => {
    const t = await setup();
    await t.addCard('c1', ['p1']);
    await t.inCard(['a-p1']);
    expect(await deleteCard(t.deps, 'c1')).toEqual({ ok: true });
    expect(await getCard(t.db, 'c1')).toBeNull();
    const raw = (await t.db.select().from(dateCards).where(eq(dateCards.id, 'c1')))[0]!;
    expect(raw).toMatchObject({ dirty: 1 });
    expect(raw.deletedAt).not.toBeNull();
    expect((await t.db.select().from(mediaScan))[0]!.state).toBe('skipped');
    expect(await deleteCard(t.deps, 'c1')).toEqual({ ok: false, reason: 'not_found' });
  });
});
