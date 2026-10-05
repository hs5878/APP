import { runMigrations } from './migrate';
import { createTestDb } from './testing';

describe('runMigrations', () => {
  it('kv 테이블을 만든다', async () => {
    const { runner, raw } = createTestDb();
    await runMigrations(runner);
    const names = raw.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
    expect(names.map((r) => (r as { name: string }).name)).toEqual(
      expect.arrayContaining(['kv', '__migrations']),
    );
  });

  it('두 번 실행해도 안전하고 두 번째는 아무것도 적용하지 않는다', async () => {
    const { runner } = createTestDb();
    expect(await runMigrations(runner)).toEqual(['0001_kv']);
    expect(await runMigrations(runner)).toEqual([]);
  });

  it('실패한 마이그레이션은 롤백되고 기록되지 않는다', async () => {
    const { runner, raw } = createTestDb();
    const bad = { id: '9999_bad', statements: ['CREATE TABLE t (a)', 'NOT SQL'] };
    await expect(runMigrations(runner, [bad])).rejects.toThrow();
    const tables = raw.prepare(`SELECT name FROM sqlite_master WHERE name='t'`).all();
    expect(tables).toHaveLength(0);
    expect(raw.prepare('SELECT id FROM __migrations').all()).toHaveLength(0);
  });
});
