import { eq } from 'drizzle-orm';
import { runMigrations } from '../migrate';
import { dateCards, photos } from '../schema';
import { createTestDb } from '../testing';
import { insertCard, listCardPhotos, listTimelineCards, type NewPhoto } from './cards';

async function setup() {
  const t = createTestDb();
  await runMigrations(t.runner);
  return t.db;
}

const owner = { spaceId: 's1', userId: 'u1', now: 1000 };
const photo = (id: string, sort: number): NewPhoto => ({
  id,
  takenAt: 100 + sort,
  tzOffsetMin: 540,
  width: 10,
  height: 10,
  placeStopId: null,
  sort,
  localAssetId: `a-${id}`,
  localPath: `/p/${id}.jpg`,
  lat: null,
  lng: null,
});

async function addCard(
  db: Awaited<ReturnType<typeof setup>>,
  id: string,
  date: string,
  ids: string[],
  cover: string | null = null,
) {
  await insertCard(db, {
    ...owner,
    id,
    date,
    startAt: 1,
    endAt: 2,
    summary: `s-${id}`,
    coverPhotoId: cover,
    stops: [],
    photos: ids.map((p, i) => photo(p, i)),
  });
}

describe('listTimelineCards', () => {
  it('사진 수와 표지(지정 → 없으면 첫 사진)를 한 번에 읽는다', async () => {
    const db = await setup();
    await addCard(db, 'c1', '2026-09-20', ['p1', 'p2', 'p3'], 'p2');
    await addCard(db, 'c2', '2026-09-21', ['q1', 'q2']);
    await addCard(db, 'c3', '2026-09-22', []);
    const rows = Object.fromEntries((await listTimelineCards(db, 's1')).map((r) => [r.id, r]));
    expect(rows.c1).toMatchObject({ photoCount: 3, coverId: 'p2' });
    expect(rows.c2).toMatchObject({ photoCount: 2, coverId: 'q1' });
    expect(rows.c3).toMatchObject({ photoCount: 0, coverId: null });
  });

  it('삭제된 카드·사진, 다른 공간 카드는 빼고 지워진 표지는 첫 사진으로 바꾼다', async () => {
    const db = await setup();
    await addCard(db, 'c1', '2026-09-20', ['p1', 'p2'], 'p2');
    await addCard(db, 'c2', '2026-09-21', ['q1']);
    await db.update(photos).set({ deletedAt: 5 }).where(eq(photos.id, 'p2'));
    await db.update(dateCards).set({ deletedAt: 5 }).where(eq(dateCards.id, 'c2'));
    const rows = await listTimelineCards(db, 's1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'c1', photoCount: 1, coverId: 'p1' });
    expect(await listTimelineCards(db, 'other')).toEqual([]);
  });
});

describe('listCardPhotos', () => {
  it('카드 안 순서대로, 삭제된 사진은 뺀다', async () => {
    const db = await setup();
    await addCard(db, 'c1', '2026-09-20', ['p1', 'p2', 'p3']);
    await db.update(photos).set({ deletedAt: 5 }).where(eq(photos.id, 'p2'));
    expect((await listCardPhotos(db, 'c1')).map((p) => p.id)).toEqual(['p1', 'p3']);
  });
});
