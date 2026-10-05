import { eq } from 'drizzle-orm';
import { runMigrations } from '../migrate';
import { cardNotes, dateCards, photos, placeStops } from '../schema';
import { createTestDb } from '../testing';
import {
  getCard,
  getPhoto,
  insertCard,
  insertManualCard,
  listCardPhotos,
  movePhotos,
  refreshCardSpan,
  resortPhotos,
  setCardCover,
  softDeleteCard,
  softDeletePhotos,
  updateCardDate,
  type NewPhoto,
} from './cards';

async function setup() {
  const t = createTestDb();
  await runMigrations(t.runner);
  return t.db;
}
type Db = Awaited<ReturnType<typeof setup>>;

const owner = { spaceId: 's1', userId: 'u1', now: 1000 };
const photo = (id: string, sort: number, takenAt = 100 + sort): NewPhoto => ({
  id,
  takenAt,
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

async function addCard(db: Db, id: string, ids: string[]) {
  await insertCard(db, {
    ...owner,
    id,
    date: '2026-09-20',
    startAt: 1,
    endAt: 2,
    summary: `s-${id}`,
    coverPhotoId: null,
    stops: [{ id: `st-${id}`, seq: 1, arrivedAt: 1, leftAt: 2, latC: null, lngC: null }],
    photos: ids.map((p, i) => photo(p, i)),
  });
}

/** 편집 뒤에 dirty를 확인하려고 모든 행을 동기화된 상태로 되돌린다. */
async function markClean(db: Db) {
  await db.update(dateCards).set({ dirty: 0 });
  await db.update(photos).set({ dirty: 0 });
  await db.update(placeStops).set({ dirty: 0 });
  await db.update(cardNotes).set({ dirty: 0 });
}

const dirtyOf = async (db: Db, id: string) =>
  (await db.select().from(photos).where(eq(photos.id, id)))[0]!.dirty;

describe('카드 날짜·표지', () => {
  it('날짜 수정은 dirty = 1과 updatedAt을 올린다', async () => {
    const db = await setup();
    await addCard(db, 'c1', ['p1']);
    await markClean(db);
    await updateCardDate(db, 'c1', '2026-09-21', 2000);
    expect(await getCard(db, 'c1')).toMatchObject({
      date: '2026-09-21',
      dirty: 1,
      updatedAt: 2000,
    });
  });

  it('표지 지정과 해제도 dirty = 1', async () => {
    const db = await setup();
    await addCard(db, 'c1', ['p1', 'p2']);
    await markClean(db);
    await setCardCover(db, 'c1', 'p2', 2000);
    expect(await getCard(db, 'c1')).toMatchObject({ coverPhotoId: 'p2', dirty: 1 });
    await markClean(db);
    await setCardCover(db, 'c1', null, 3000);
    expect(await getCard(db, 'c1')).toMatchObject({ coverPhotoId: null, dirty: 1 });
  });
});

describe('사진 없이 만드는 카드', () => {
  it('시간대 없이 manual 카드로 dirty = 1', async () => {
    const db = await setup();
    await insertManualCard(db, { ...owner, id: 'm1', date: '2026-10-01' });
    expect(await getCard(db, 'm1')).toMatchObject({
      date: '2026-10-01',
      startAt: null,
      endAt: null,
      summary: '',
      summarySource: 'manual',
      dirty: 1,
    });
    expect(await listCardPhotos(db, 'm1')).toEqual([]);
  });
});

describe('소프트 삭제', () => {
  it('사진 삭제는 행을 남기고 deletedAt·dirty를 채운다', async () => {
    const db = await setup();
    await addCard(db, 'c1', ['p1', 'p2']);
    await markClean(db);
    await softDeletePhotos(db, ['p1'], 2000);
    expect(await getPhoto(db, 'p1')).toBeNull();
    const raw = (await db.select().from(photos).where(eq(photos.id, 'p1')))[0]!;
    expect(raw).toMatchObject({ deletedAt: 2000, updatedAt: 2000, dirty: 1 });
    expect(await dirtyOf(db, 'p2')).toBe(0);
    expect((await listCardPhotos(db, 'c1')).map((p) => p.id)).toEqual(['p2']);
  });

  it('카드 삭제는 사진·스톱·메모까지 소프트 삭제하고 다른 카드는 건드리지 않는다', async () => {
    const db = await setup();
    await addCard(db, 'c1', ['p1', 'p2']);
    await addCard(db, 'c2', ['q1']);
    await db.insert(cardNotes).values({
      id: 'n1',
      cardId: 'c1',
      text: '좋았다',
      spaceId: 's1',
      createdBy: 'u1',
      createdAt: 1,
      updatedAt: 1,
    });
    await markClean(db);
    await softDeleteCard(db, 'c1', 2000);

    expect(await getCard(db, 'c1')).toBeNull();
    const card = (await db.select().from(dateCards).where(eq(dateCards.id, 'c1')))[0]!;
    expect(card).toMatchObject({ deletedAt: 2000, dirty: 1 });
    for (const t of [photos, placeStops, cardNotes] as const) {
      const rows = await db.select().from(t).where(eq(t.cardId, 'c1'));
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r).toMatchObject({ deletedAt: 2000, dirty: 1 });
    }
    expect(await getCard(db, 'c2')).toMatchObject({ deletedAt: null, dirty: 0 });
    expect(await dirtyOf(db, 'q1')).toBe(0);
  });

  it('이미 지운 행의 deletedAt은 다시 쓰지 않는다', async () => {
    const db = await setup();
    await addCard(db, 'c1', ['p1']);
    await softDeletePhotos(db, ['p1'], 2000);
    await softDeleteCard(db, 'c1', 3000);
    const raw = (await db.select().from(photos).where(eq(photos.id, 'p1')))[0]!;
    expect(raw.deletedAt).toBe(2000);
  });
});

describe('사진 이동과 재정렬', () => {
  it('옮긴 사진은 대상 카드 끝에 붙고 스톱 연결이 풀리며 dirty = 1', async () => {
    const db = await setup();
    await addCard(db, 'c1', ['p1', 'p2', 'p3']);
    await addCard(db, 'c2', ['q1', 'q2']);
    await db.update(photos).set({ placeStopId: 'st-c1' }).where(eq(photos.id, 'p2'));
    await markClean(db);

    await movePhotos(db, ['p2', 'p3'], 'c2', 2000);

    const moved = await listCardPhotos(db, 'c2');
    expect(moved.map((p) => [p.id, p.sort])).toEqual([
      ['q1', 0],
      ['q2', 1],
      ['p2', 2],
      ['p3', 3],
    ]);
    expect(moved.find((p) => p.id === 'p2')).toMatchObject({ placeStopId: null, dirty: 1 });
    expect(await dirtyOf(db, 'q1')).toBe(0);
  });

  it('원래 카드는 resortPhotos로 0부터 다시 매기고 바뀐 행만 dirty로 올린다', async () => {
    const db = await setup();
    await addCard(db, 'c1', ['p1', 'p2', 'p3', 'p4']);
    await addCard(db, 'c2', []);
    await markClean(db);

    await movePhotos(db, ['p2'], 'c2', 2000);
    await resortPhotos(db, 'c1', 2000);

    const rest = await listCardPhotos(db, 'c1');
    expect(rest.map((p) => [p.id, p.sort])).toEqual([
      ['p1', 0],
      ['p3', 1],
      ['p4', 2],
    ]);
    expect(await dirtyOf(db, 'p1')).toBe(0); // sort 0 그대로
    expect(await dirtyOf(db, 'p3')).toBe(1);
    expect(await dirtyOf(db, 'p4')).toBe(1);
  });
});

describe('refreshCardSpan', () => {
  it('사진의 첫·마지막 촬영 시각으로 맞추고 사진이 없으면 그대로 둔다', async () => {
    const db = await setup();
    await insertCard(db, {
      ...owner,
      id: 'c1',
      date: '2026-09-20',
      startAt: 1,
      endAt: 2,
      summary: '',
      coverPhotoId: null,
      stops: [],
      photos: [photo('p1', 0, 500), photo('p2', 1, 900), photo('p3', 2, 700)],
    });
    await softDeletePhotos(db, ['p1'], 1500);
    await refreshCardSpan(db, 'c1', 2000);
    expect(await getCard(db, 'c1')).toMatchObject({ startAt: 700, endAt: 900 });

    await softDeletePhotos(db, ['p2', 'p3'], 1500);
    await refreshCardSpan(db, 'c1', 3000);
    expect(await getCard(db, 'c1')).toMatchObject({ startAt: 700, endAt: 900 });
  });
});
