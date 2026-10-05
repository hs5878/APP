import { and, asc, eq, isNull } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { anniversaries } from '../schema';

type Db = BaseSQLiteDatabase<'async' | 'sync', unknown, Record<string, never>>;
export type AnniversaryRow = typeof anniversaries.$inferSelect;

export interface AnniversaryInput {
  title: string;
  date: string;
  repeat: AnniversaryRow['repeat'];
  notify: AnniversaryRow['notify'];
}

/** 삭제되지 않은 사용자 기념일. 날짜순(같으면 생성순). */
export async function listAnniversaries(db: Db, spaceId: string): Promise<AnniversaryRow[]> {
  return db
    .select()
    .from(anniversaries)
    .where(and(eq(anniversaries.spaceId, spaceId), isNull(anniversaries.deletedAt)))
    .orderBy(asc(anniversaries.date), asc(anniversaries.id));
}

/** 새 기념일. 서버 동기화 전이므로 dirty = 1. */
export async function createAnniversary(
  db: Db,
  input: AnniversaryInput & { id: string; spaceId: string; userId: string; now: number },
): Promise<void> {
  await db.insert(anniversaries).values({
    id: input.id,
    title: input.title,
    date: input.date,
    repeat: input.repeat,
    notify: input.notify,
    spaceId: input.spaceId,
    createdBy: input.userId,
    createdAt: input.now,
    updatedAt: input.now,
    dirty: 1,
  });
}

/** 삭제된 행은 되살리지 않으므로 수정하지 않는다(DATA_MODEL §1). */
export async function updateAnniversary(
  db: Db,
  id: string,
  input: AnniversaryInput,
  now: number,
): Promise<void> {
  await db
    .update(anniversaries)
    .set({ ...input, updatedAt: now, dirty: 1 })
    .where(and(eq(anniversaries.id, id), isNull(anniversaries.deletedAt)));
}

/** 소프트 삭제. 이미 삭제된 행의 deleted_at은 유지한다. */
export async function deleteAnniversary(db: Db, id: string, now: number): Promise<void> {
  await db
    .update(anniversaries)
    .set({ deletedAt: now, updatedAt: now, dirty: 1 })
    .where(and(eq(anniversaries.id, id), isNull(anniversaries.deletedAt)));
}
