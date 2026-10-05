import { and, eq, isNull } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { spaces } from '../schema';

type Db = BaseSQLiteDatabase<'async' | 'sync', unknown, Record<string, never>>;
export type SpaceRow = typeof spaces.$inferSelect;

/** 이 기기의 공간. 연결 전에는 1인 공간 하나뿐이다. */
export async function getLocalSpace(db: Db): Promise<SpaceRow | null> {
  const rows = await db.select().from(spaces).where(isNull(spaces.deletedAt)).limit(1);
  return rows[0] ?? null;
}

/**
 * 1인 공간을 로컬에 만든다. 서버 create-space는 로그인(T20) 이후이므로 dirty = 1로 남긴다.
 * 이미 공간이 있으면 새로 만들지 않고 그것을 돌려준다.
 */
export async function createLocalSpace(
  db: Db,
  input: { spaceId: string; userId: string; startedOn: string; now: number },
): Promise<SpaceRow> {
  const existing = await getLocalSpace(db);
  if (existing) return existing;
  await db.insert(spaces).values({
    id: input.spaceId,
    startedOn: input.startedOn,
    spaceId: input.spaceId,
    createdBy: input.userId,
    createdAt: input.now,
    updatedAt: input.now,
    dirty: 1,
  });
  return (await getLocalSpace(db))!;
}

export async function updateStartedOn(
  db: Db,
  spaceId: string,
  startedOn: string,
  now: number,
): Promise<void> {
  await db
    .update(spaces)
    .set({ startedOn, updatedAt: now, dirty: 1 })
    .where(and(eq(spaces.id, spaceId), isNull(spaces.deletedAt)));
}
