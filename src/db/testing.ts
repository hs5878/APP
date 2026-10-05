// 테스트 전용: node:sqlite(암호화 없음)로 expo-sqlite와 같은 모양의 DB를 흉내 낸다.
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { DatabaseSync } from 'node:sqlite';
import type { SqlRunner } from './migrate';

export function createTestDb() {
  const raw = new DatabaseSync(':memory:');
  const runner: SqlRunner = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async getAllAsync<T>(sql: string) {
      return raw.prepare(sql).all() as T[];
    },
    async withExclusiveTransactionAsync(task) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const db = drizzle(async (sql, params, method) => {
    const stmt = raw.prepare(sql);
    if (method === 'run') {
      stmt.run(...(params as never[]));
      return { rows: [] };
    }
    stmt.setReturnArrays(true);
    const rows = stmt.all(...(params as never[])) as unknown as unknown[][];
    return { rows: method === 'get' ? (rows[0] ?? []) : rows };
  });
  return { raw, runner, db };
}
