import { sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

type Db = BaseSQLiteDatabase<'async' | 'sync', unknown, Record<string, never>>;

// 한 연결에서 BEGIN이 겹치지 않게 한 줄로 세운다.
let queue: Promise<unknown> = Promise.resolve();

/**
 * 여러 쓰기를 한 트랜잭션으로 묶는다. drizzle의 `db.transaction`은 expo-sqlite(동기 드라이버)에서
 * 비동기 콜백을 기다리지 않고 커밋해 버려서 BEGIN/COMMIT을 직접 건다.
 */
export function withTransaction<T>(db: Db, task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    await db.run(sql`BEGIN`);
    try {
      const result = await task();
      await db.run(sql`COMMIT`);
      return result;
    } catch (e) {
      try {
        await db.run(sql`ROLLBACK`);
      } catch {
        // 롤백 실패보다 원래 오류가 중요하다.
      }
      throw e;
    }
  });
  queue = run.catch(() => {});
  return run;
}
