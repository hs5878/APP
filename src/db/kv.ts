import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { kv } from './schema';

export type KvDb = BaseSQLiteDatabase<'async' | 'sync', unknown, Record<string, never>>;

export async function kvGet(db: KvDb, key: string): Promise<string | null> {
  const rows = await db.select({ value: kv.value }).from(kv).where(eq(kv.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function kvSet(db: KvDb, key: string, value: string): Promise<void> {
  await db.insert(kv).values({ key, value }).onConflictDoUpdate({ target: kv.key, set: { value } });
}

export async function kvDelete(db: KvDb, key: string): Promise<void> {
  await db.delete(kv).where(eq(kv.key, key));
}
