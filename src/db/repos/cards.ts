import { and, asc, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { CandidateDraft, CardWindow } from '@/domain/candidatePlan';
import { cardCandidates, dateCards, photos, placeStops } from '../schema';

type Db = BaseSQLiteDatabase<'async' | 'sync', unknown, Record<string, never>>;
export type CandidateRow = typeof cardCandidates.$inferSelect;
export type CandidateStatus = CandidateRow['status'];
export type CardRow = typeof dateCards.$inferSelect;
export type PlaceStopRow = typeof placeStops.$inferSelect;

// ── 후보(L) ────────────────────────────────────────────────────

/** 후보 한 장의 사진 asset id. */
export function candidateAssetIds(c: Pick<CandidateRow, 'assetIds'>): string[] {
  try {
    const v: unknown = JSON.parse(c.assetIds);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 최근 데이트가 위. */
export async function listPendingCandidates(db: Db): Promise<CandidateRow[]> {
  return db
    .select()
    .from(cardCandidates)
    .where(eq(cardCandidates.status, 'pending'))
    .orderBy(desc(cardCandidates.date), desc(cardCandidates.startAt));
}

export async function countPendingCandidates(db: Db): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(cardCandidates)
    .where(eq(cardCandidates.status, 'pending'));
  return Number(rows[0]?.n ?? 0);
}

export async function getCandidate(db: Db, id: string): Promise<CandidateRow | null> {
  const rows = await db.select().from(cardCandidates).where(eq(cardCandidates.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function setCandidateStatus(
  db: Db,
  id: string,
  status: CandidateStatus,
): Promise<void> {
  await db.update(cardCandidates).set({ status }).where(eq(cardCandidates.id, id));
}

const keyOf = (assetIds: readonly string[]) => JSON.stringify([...assetIds].sort());

/**
 * 대기 중인 후보를 새 계산 결과로 맞춘다. 사진 구성이 같은 후보는 id를 지키고(화면이 흔들리지 않게)
 * 대상 카드만 갱신하며, 없어진 후보는 지우고 새 후보는 만든다. 확정·건너뛴 후보는 건드리지 않는다.
 */
export async function syncPendingCandidates(
  db: Db,
  drafts: readonly CandidateDraft[],
  now: number,
  newId: () => string,
): Promise<void> {
  const existing = await listPendingCandidates(db);
  const byKey = new Map(existing.map((c) => [keyOf(candidateAssetIds(c)), c] as const));
  const keep = new Set<string>();

  for (const d of drafts) {
    const found = byKey.get(keyOf(d.assetIds));
    if (found) {
      keep.add(found.id);
      await db
        .update(cardCandidates)
        .set({
          date: d.date,
          startAt: d.startAt,
          endAt: d.endAt,
          targetCardId: d.targetCardId,
        })
        .where(eq(cardCandidates.id, found.id));
    } else {
      await db.insert(cardCandidates).values({
        id: newId(),
        date: d.date,
        startAt: d.startAt,
        endAt: d.endAt,
        assetIds: JSON.stringify(d.assetIds),
        targetCardId: d.targetCardId,
        status: 'pending',
        createdAt: now,
      });
    }
  }

  const stale = existing.filter((c) => !keep.has(c.id)).map((c) => c.id);
  if (stale.length > 0) {
    await db.delete(cardCandidates).where(inArray(cardCandidates.id, stale));
  }
}

// ── 카드(S) ────────────────────────────────────────────────────

/** 삭제되지 않은 카드의 날짜·시간대. 후보가 겹치는 카드를 찾는 데 쓴다. */
export async function listCardWindows(db: Db, spaceId: string): Promise<CardWindow[]> {
  const rows = await db
    .select({
      id: dateCards.id,
      date: dateCards.date,
      startAt: dateCards.startAt,
      endAt: dateCards.endAt,
      createdAt: dateCards.createdAt,
    })
    .from(dateCards)
    .where(and(eq(dateCards.spaceId, spaceId), isNull(dateCards.deletedAt)));
  return rows;
}

export async function getCard(db: Db, id: string): Promise<CardRow | null> {
  const rows = await db
    .select()
    .from(dateCards)
    .where(and(eq(dateCards.id, id), isNull(dateCards.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export interface NewPhoto {
  id: string;
  takenAt: number;
  tzOffsetMin: number;
  width: number;
  height: number;
  placeStopId: string | null;
  sort: number;
  localAssetId: string;
  localPath: string;
  lat: number | null;
  lng: number | null;
}

export interface NewStop {
  id: string;
  seq: number;
  arrivedAt: number;
  leftAt: number;
  latC: number | null;
  lngC: number | null;
}

type Owner = { spaceId: string; userId: string; now: number };

/** 새 카드와 그 사진·장소 스톱(이름 없음). 서버 동기화 전이므로 dirty = 1. 트랜잭션 안에서 부른다. */
export async function insertCard(
  db: Db,
  input: Owner & {
    id: string;
    date: string;
    startAt: number;
    endAt: number;
    summary: string;
    coverPhotoId: string | null;
    stops: readonly NewStop[];
    photos: readonly NewPhoto[];
  },
): Promise<void> {
  await db.insert(dateCards).values({
    id: input.id,
    date: input.date,
    startAt: input.startAt,
    endAt: input.endAt,
    summary: input.summary,
    summarySource: 'template',
    coverPhotoId: input.coverPhotoId,
    spaceId: input.spaceId,
    createdBy: input.userId,
    createdAt: input.now,
    updatedAt: input.now,
    dirty: 1,
  });
  await insertStops(db, input.id, input.stops, input);
  await insertPhotos(db, input.id, input.photos, input);
}

export async function insertStops(
  db: Db,
  cardId: string,
  stops: readonly NewStop[],
  owner: Owner,
): Promise<void> {
  for (const s of stops) {
    await db.insert(placeStops).values({
      id: s.id,
      cardId,
      seq: s.seq,
      arrivedAt: s.arrivedAt,
      leftAt: s.leftAt,
      name: null,
      nameSource: 'auto',
      latC: s.latC,
      lngC: s.lngC,
      spaceId: owner.spaceId,
      createdBy: owner.userId,
      createdAt: owner.now,
      updatedAt: owner.now,
      dirty: 1,
    });
  }
}

export async function insertPhotos(
  db: Db,
  cardId: string,
  list: readonly NewPhoto[],
  owner: Owner,
): Promise<void> {
  for (const p of list) {
    await db.insert(photos).values({
      ...p,
      cardId,
      spaceId: owner.spaceId,
      createdBy: owner.userId,
      createdAt: owner.now,
      updatedAt: owner.now,
      dirty: 1,
    });
  }
}

export async function listCardStops(db: Db, cardId: string): Promise<PlaceStopRow[]> {
  return db
    .select()
    .from(placeStops)
    .where(and(eq(placeStops.cardId, cardId), isNull(placeStops.deletedAt)))
    .orderBy(asc(placeStops.seq));
}

export async function countCardPhotos(db: Db, cardId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(photos)
    .where(and(eq(photos.cardId, cardId), isNull(photos.deletedAt)));
  return Number(rows[0]?.n ?? 0);
}

/** 카드 안 사진 순서의 끝. 사진이 없으면 -1. */
export async function maxPhotoSort(db: Db, cardId: string): Promise<number> {
  const rows = await db
    .select({ m: max(photos.sort) })
    .from(photos)
    .where(and(eq(photos.cardId, cardId), isNull(photos.deletedAt)));
  return rows[0]?.m ?? -1;
}

/** 스톱 순서를 다시 매긴다(도착 시각 순). 바뀐 행만 dirty로 올린다. */
export async function resequenceStops(
  db: Db,
  cardId: string,
  orderedIds: readonly string[],
  now: number,
): Promise<void> {
  const current = await listCardStops(db, cardId);
  const seqOf = new Map(current.map((s) => [s.id, s.seq] as const));
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    if (seqOf.get(id) === i + 1) continue;
    await db
      .update(placeStops)
      .set({ seq: i + 1, updatedAt: now, dirty: 1 })
      .where(eq(placeStops.id, id));
  }
}

/** 사진이 더해진 뒤 카드의 시간대·요약·대표 사진을 맞춘다. */
export async function updateCardAfterAppend(
  db: Db,
  id: string,
  patch: {
    startAt: number;
    endAt: number;
    summary?: string;
    coverPhotoId?: string | null;
    now: number;
  },
): Promise<void> {
  await db
    .update(dateCards)
    .set({
      startAt: patch.startAt,
      endAt: patch.endAt,
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.coverPhotoId !== undefined ? { coverPhotoId: patch.coverPhotoId } : {}),
      updatedAt: patch.now,
      dirty: 1,
    })
    .where(and(eq(dateCards.id, id), isNull(dateCards.deletedAt)));
}
