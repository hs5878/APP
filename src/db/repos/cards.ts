import { and, asc, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { CandidateDraft, CardWindow } from '@/domain/candidatePlan';
import { cardCandidates, cardNotes, dateCards, photos, placeStops } from '../schema';

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

// ── 기록 탭(읽기) ──────────────────────────────────────────────

export type TimelineRow = {
  id: string;
  date: string;
  startAt: number | null;
  summary: string;
  photoCount: number;
  /** 표지로 보여 줄 사진 id. 표지 지정이 없거나 지워졌으면 카드 안 첫 사진. 사진이 없으면 null. */
  coverId: string | null;
};

/** 삭제되지 않은 카드 전부와 사진 수·표지. 사진 수와 표지는 하위 쿼리로 한 번에 읽는다(카드마다 따로 묻지 않는다). */
export async function listTimelineCards(db: Db, spaceId: string): Promise<TimelineRow[]> {
  const rows = await db
    .select({
      id: dateCards.id,
      date: dateCards.date,
      startAt: dateCards.startAt,
      summary: dateCards.summary,
      photoCount: sql<number>`(select count(*) from photos p where p.card_id = date_cards.id and p.deleted_at is null)`,
      coverId: sql<
        string | null
      >`coalesce((select p.id from photos p where p.id = date_cards.cover_photo_id and p.card_id = date_cards.id and p.deleted_at is null), (select p.id from photos p where p.card_id = date_cards.id and p.deleted_at is null order by p.sort asc, p.taken_at asc limit 1))`,
    })
    .from(dateCards)
    .where(and(eq(dateCards.spaceId, spaceId), isNull(dateCards.deletedAt)));
  return rows.map((r) => ({ ...r, photoCount: Number(r.photoCount) }));
}

export type PhotoRow = typeof photos.$inferSelect;

/** 카드 안 사진, 카드 안 순서대로. */
export async function listCardPhotos(db: Db, cardId: string): Promise<PhotoRow[]> {
  return db
    .select()
    .from(photos)
    .where(and(eq(photos.cardId, cardId), isNull(photos.deletedAt)))
    .orderBy(asc(photos.sort), asc(photos.takenAt));
}

// ── 카드 편집(S) ───────────────────────────────────────────────
// 편집은 모두 updatedAt을 올리고 dirty = 1로 둔다. 삭제는 deletedAt만 채우는 소프트 삭제다(§5.1: 삭제 고정).

const touched = (now: number) => ({ updatedAt: now, dirty: 1 });

export async function getPhoto(db: Db, id: string): Promise<PhotoRow | null> {
  const rows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, id), isNull(photos.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** 사진 없이 직접 만드는 카드. 시간대는 null, 요약은 비워 둔다. */
export async function insertManualCard(
  db: Db,
  input: Owner & { id: string; date: string },
): Promise<void> {
  await db.insert(dateCards).values({
    id: input.id,
    date: input.date,
    startAt: null,
    endAt: null,
    summary: '',
    summarySource: 'manual',
    coverPhotoId: null,
    spaceId: input.spaceId,
    createdBy: input.userId,
    createdAt: input.now,
    updatedAt: input.now,
    dirty: 1,
  });
}

export async function updateCardDate(db: Db, id: string, date: string, now: number): Promise<void> {
  await db
    .update(dateCards)
    .set({ date, ...touched(now) })
    .where(and(eq(dateCards.id, id), isNull(dateCards.deletedAt)));
}

/** 표지 사진을 정한다. null이면 지정을 풀어 카드 안 첫 사진이 표지가 된다. */
export async function setCardCover(
  db: Db,
  id: string,
  photoId: string | null,
  now: number,
): Promise<void> {
  await db
    .update(dateCards)
    .set({ coverPhotoId: photoId, ...touched(now) })
    .where(and(eq(dateCards.id, id), isNull(dateCards.deletedAt)));
}

export async function updateCardSummary(
  db: Db,
  id: string,
  summary: string,
  now: number,
): Promise<void> {
  await db
    .update(dateCards)
    .set({ summary, ...touched(now) })
    .where(and(eq(dateCards.id, id), isNull(dateCards.deletedAt)));
}

/** 카드와 그 안의 사진·장소 스톱·한 줄 메모를 소프트 삭제한다. 트랜잭션 안에서 부른다. */
export async function softDeleteCard(db: Db, id: string, now: number): Promise<void> {
  const patch = { deletedAt: now, ...touched(now) };
  await db
    .update(dateCards)
    .set(patch)
    .where(and(eq(dateCards.id, id), isNull(dateCards.deletedAt)));
  await db
    .update(photos)
    .set(patch)
    .where(and(eq(photos.cardId, id), isNull(photos.deletedAt)));
  await db
    .update(placeStops)
    .set(patch)
    .where(and(eq(placeStops.cardId, id), isNull(placeStops.deletedAt)));
  await db
    .update(cardNotes)
    .set(patch)
    .where(and(eq(cardNotes.cardId, id), isNull(cardNotes.deletedAt)));
}

export async function softDeletePhotos(db: Db, ids: readonly string[], now: number): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(photos)
    .set({ deletedAt: now, ...touched(now) })
    .where(and(inArray(photos.id, [...ids]), isNull(photos.deletedAt)));
}

/**
 * 사진을 다른 카드로 옮겨 그 카드 사진 순서의 끝에 붙인다(`ids` 순서대로).
 * 장소 스톱은 카드에 속하므로 연결을 푼다. 원래 카드의 순서는 `resortPhotos`로 다시 매긴다.
 */
export async function movePhotos(
  db: Db,
  ids: readonly string[],
  toCardId: string,
  now: number,
): Promise<void> {
  let sort = (await maxPhotoSort(db, toCardId)) + 1;
  for (const id of ids) {
    await db
      .update(photos)
      .set({ cardId: toCardId, sort: sort++, placeStopId: null, ...touched(now) })
      .where(and(eq(photos.id, id), isNull(photos.deletedAt)));
  }
}

/** 카드 안 사진 `sort`를 현재 순서대로 0부터 이어 붙인다. 바뀐 행만 dirty로 올린다. */
export async function resortPhotos(db: Db, cardId: string, now: number): Promise<void> {
  const list = await listCardPhotos(db, cardId);
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    if (p.sort === i) continue;
    await db
      .update(photos)
      .set({ sort: i, ...touched(now) })
      .where(eq(photos.id, p.id));
  }
}

/** 사진의 첫·마지막 촬영 시각으로 카드 시간대를 맞춘다. 사진이 없으면 그대로 둔다. */
export async function refreshCardSpan(db: Db, cardId: string, now: number): Promise<void> {
  const rows = await db
    .select({
      lo: sql<number | null>`min(${photos.takenAt})`,
      hi: sql<number | null>`max(${photos.takenAt})`,
    })
    .from(photos)
    .where(and(eq(photos.cardId, cardId), isNull(photos.deletedAt)));
  const lo = rows[0]?.lo;
  const hi = rows[0]?.hi;
  if (lo == null || hi == null) return;
  await db
    .update(dateCards)
    .set({ startAt: Number(lo), endAt: Number(hi), ...touched(now) })
    .where(and(eq(dateCards.id, cardId), isNull(dateCards.deletedAt)));
}
