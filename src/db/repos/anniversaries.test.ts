import { runMigrations } from '../migrate';
import { createTestDb } from '../testing';
import {
  createAnniversary,
  deleteAnniversary,
  listAnniversaries,
  updateAnniversary,
} from './anniversaries';

async function setup() {
  const t = createTestDb();
  await runMigrations(t.runner);
  return t.db;
}
const base = { spaceId: 's1', userId: 'u1', now: 1000 };
const input = { title: '첫 여행', date: '2025-05-05', repeat: 'yearly', notify: 'd1' } as const;

describe('anniversaries repo', () => {
  it('만들면 dirty = 1로 목록에 나온다', async () => {
    const db = await setup();
    await createAnniversary(db, { ...base, ...input, id: 'a1' });
    expect(await listAnniversaries(db, 's1')).toEqual([
      expect.objectContaining({
        id: 'a1',
        ...input,
        spaceId: 's1',
        createdBy: 'u1',
        createdAt: 1000,
        updatedAt: 1000,
        deletedAt: null,
        dirty: 1,
      }),
    ]);
  });

  it('날짜순으로 정렬하고 다른 공간은 제외한다', async () => {
    const db = await setup();
    await createAnniversary(db, { ...base, ...input, id: 'a1', date: '2025-09-01' });
    await createAnniversary(db, { ...base, ...input, id: 'a2', date: '2025-01-01' });
    await createAnniversary(db, { ...base, ...input, id: 'a3', spaceId: 's2' });
    expect((await listAnniversaries(db, 's1')).map((r) => r.id)).toEqual(['a2', 'a1']);
  });

  it('수정하면 값, updated_at, dirty가 바뀐다', async () => {
    const db = await setup();
    await createAnniversary(db, { ...base, ...input, id: 'a1' });
    await updateAnniversary(
      db,
      'a1',
      { title: '둘째 여행', date: '2025-06-06', repeat: 'none', notify: 'none' },
      2000,
    );
    const [row] = await listAnniversaries(db, 's1');
    expect(row).toMatchObject({
      title: '둘째 여행',
      date: '2025-06-06',
      repeat: 'none',
      notify: 'none',
      createdAt: 1000,
      updatedAt: 2000,
      dirty: 1,
    });
  });

  it('삭제는 소프트 삭제라 목록에서만 빠진다', async () => {
    const db = await setup();
    await createAnniversary(db, { ...base, ...input, id: 'a1' });
    await deleteAnniversary(db, 'a1', 2000);
    expect(await listAnniversaries(db, 's1')).toEqual([]);
  });

  it('삭제된 행은 수정·재삭제해도 되살아나거나 바뀌지 않는다', async () => {
    const db = await setup();
    await createAnniversary(db, { ...base, ...input, id: 'a1' });
    await deleteAnniversary(db, 'a1', 2000);
    await updateAnniversary(db, 'a1', { ...input, title: '되살림' }, 3000);
    await deleteAnniversary(db, 'a1', 4000);
    expect(await listAnniversaries(db, 's1')).toEqual([]);
  });
});
