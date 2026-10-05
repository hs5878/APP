import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { mediaScan } from '../schema';

type Db = BaseSQLiteDatabase<'async' | 'sync', unknown, Record<string, never>>;
export type MediaScanRow = typeof mediaScan.$inferSelect;
export type MediaScanState = MediaScanRow['state'];

export interface SeenInput {
  assetId: string;
  takenAt: number;
  state?: 'seen' | 'ignored';
}

// SQLite 변수 한도(기본 999)를 넘지 않게 나눈다. 행당 3개.
const CHUNK = 200;

/**
 * 1단계 결과를 저장한다. 이미 있는 사진은 건드리지 않는다(카드에 들어갔거나 건너뛴 사진을
 * 다시 제안하지 않으려고). 새로 들어간 장수를 돌려준다.
 */
export async function insertSeen(db: Db, rows: readonly SeenInput[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await db
      .insert(mediaScan)
      .values(
        chunk.map((r) => ({ assetId: r.assetId, takenAt: r.takenAt, state: r.state ?? 'seen' })),
      )
      .onConflictDoNothing()
      .returning({ id: mediaScan.assetId });
    inserted += res.length;
  }
  return inserted;
}

/** 후보로 묶을 수 있는 사진(`seen`·`detailed`)의 촬영 시각 이후 행. */
export async function listScannable(db: Db, fromMs: number): Promise<MediaScanRow[]> {
  return db
    .select()
    .from(mediaScan)
    .where(and(gte(mediaScan.takenAt, fromMs), inArray(mediaScan.state, ['seen', 'detailed'])));
}

/** 2단계 결과. `seen`일 때만 올린다(이미 카드에 들어간 사진 상태를 덮지 않는다). */
export async function markDetailed(
  db: Db,
  assetId: string,
  detail: { lat: number | null; lng: number | null; tzOffsetMin: number },
): Promise<void> {
  await db
    .update(mediaScan)
    .set({ state: 'detailed', lat: detail.lat, lng: detail.lng, tzOffsetMin: detail.tzOffsetMin })
    .where(and(eq(mediaScan.assetId, assetId), eq(mediaScan.state, 'seen')));
}

export async function setStates(
  db: Db,
  assetIds: readonly string[],
  state: MediaScanState,
): Promise<void> {
  for (let i = 0; i < assetIds.length; i += 500) {
    await db
      .update(mediaScan)
      .set({ state })
      .where(inArray(mediaScan.assetId, assetIds.slice(i, i + 500)));
  }
}

export async function countByState(db: Db): Promise<Record<MediaScanState, number>> {
  const rows = await db
    .select({ state: mediaScan.state, n: sql<number>`count(*)` })
    .from(mediaScan)
    .groupBy(mediaScan.state);
  const out: Record<MediaScanState, number> = {
    seen: 0,
    detailed: 0,
    in_card: 0,
    skipped: 0,
    ignored: 0,
  };
  for (const r of rows) out[r.state] = Number(r.n);
  return out;
}
