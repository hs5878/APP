import { kvDelete, kvGet, kvSet } from './kv';
import { runMigrations } from './migrate';
import { createTestDb } from './testing';

async function setup() {
  const t = createTestDb();
  await runMigrations(t.runner);
  return t.db;
}

describe('kv', () => {
  it('없는 키는 null', async () => {
    expect(await kvGet(await setup(), 'nope')).toBeNull();
  });

  it('쓰고 읽는다', async () => {
    const db = await setup();
    await kvSet(db, 'install.id', 'abc');
    expect(await kvGet(db, 'install.id')).toBe('abc');
  });

  it('같은 키에 쓰면 덮어쓴다', async () => {
    const db = await setup();
    await kvSet(db, 'lock.timeout', '60');
    await kvSet(db, 'lock.timeout', '300');
    expect(await kvGet(db, 'lock.timeout')).toBe('300');
  });

  it('지운다', async () => {
    const db = await setup();
    await kvSet(db, 'k', 'v');
    await kvDelete(db, 'k');
    expect(await kvGet(db, 'k')).toBeNull();
  });
});
