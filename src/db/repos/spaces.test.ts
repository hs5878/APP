import { runMigrations } from '../migrate';
import { createTestDb } from '../testing';
import { createLocalSpace, getLocalSpace, updateStartedOn } from './spaces';

async function setup() {
  const t = createTestDb();
  await runMigrations(t.runner);
  return t.db;
}
const input = { spaceId: 's1', userId: 'u1', startedOn: '2025-03-14', now: 1000 };

describe('spaces repo', () => {
  it('공간이 없으면 null', async () => {
    expect(await getLocalSpace(await setup())).toBeNull();
  });

  it('1인 공간을 만들고 dirty로 표시한다', async () => {
    const db = await setup();
    const s = await createLocalSpace(db, input);
    expect(s).toMatchObject({
      id: 's1',
      spaceId: 's1',
      createdBy: 'u1',
      startedOn: '2025-03-14',
      keyId: 1,
      status: 'active',
      dirty: 1,
    });
  });

  it('두 번 만들어도 공간은 하나', async () => {
    const db = await setup();
    await createLocalSpace(db, input);
    const again = await createLocalSpace(db, { ...input, spaceId: 's2', startedOn: '2020-01-01' });
    expect(again.id).toBe('s1');
    expect(again.startedOn).toBe('2025-03-14');
  });

  it('사귄 날 수정', async () => {
    const db = await setup();
    await createLocalSpace(db, input);
    await updateStartedOn(db, 's1', '2025-04-01', 2000);
    expect(await getLocalSpace(db)).toMatchObject({
      startedOn: '2025-04-01',
      updatedAt: 2000,
      dirty: 1,
    });
  });
});
