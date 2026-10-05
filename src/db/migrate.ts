import { migrations as allMigrations, type Migration } from './migrations';

/** expo-sqlite `SQLiteDatabase`의 일부. 테스트에서는 다른 구현으로 대체한다. */
export interface SqlRunner {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string): Promise<T[]>;
  withExclusiveTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** 아직 적용하지 않은 마이그레이션만 순서대로 적용한다. 여러 번 호출해도 안전하다. */
export async function runMigrations(
  db: SqlRunner,
  migrations: Migration[] = allMigrations,
): Promise<string[]> {
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS __migrations (id TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)`,
  );
  const done = new Set(
    (await db.getAllAsync<{ id: string }>(`SELECT id FROM __migrations`)).map((r) => r.id),
  );
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await db.withExclusiveTransactionAsync(async () => {
      for (const s of m.statements) await db.execAsync(s);
      await db.execAsync(
        `INSERT INTO __migrations (id, applied_at) VALUES ('${m.id}', ${Date.now()})`,
      );
    });
    applied.push(m.id);
  }
  return applied;
}
