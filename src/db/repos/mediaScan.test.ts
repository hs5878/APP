import { runMigrations } from '../migrate';
import { createTestDb } from '../testing';
import { countByState, insertSeen, listScannable, markDetailed, setStates } from './mediaScan';

async function setup() {
  const t = createTestDb();
  await runMigrations(t.runner);
  return t.db;
}

describe('mediaScan repo', () => {
  it('새 사진만 넣고 이미 있는 행은 건드리지 않는다', async () => {
    const db = await setup();
    expect(
      await insertSeen(db, [
        { assetId: 'a', takenAt: 1 },
        { assetId: 'b', takenAt: 2 },
      ]),
    ).toBe(2);
    await setStates(db, ['a'], 'skipped');
    expect(
      await insertSeen(db, [
        { assetId: 'a', takenAt: 1 },
        { assetId: 'c', takenAt: 3 },
      ]),
    ).toBe(1);
    expect(await countByState(db)).toEqual({
      seen: 2,
      detailed: 0,
      in_card: 0,
      skipped: 1,
      ignored: 0,
    });
  });

  it('많은 행도 나눠서 넣는다', async () => {
    const db = await setup();
    const rows = Array.from({ length: 1234 }, (_, i) => ({ assetId: `p${i}`, takenAt: i }));
    expect(await insertSeen(db, rows)).toBe(1234);
  });

  it('listScannable: seen·detailed만, 시각 이후', async () => {
    const db = await setup();
    await insertSeen(db, [
      { assetId: 'old', takenAt: 5 },
      { assetId: 'a', takenAt: 10 },
      { assetId: 'shot', takenAt: 11, state: 'ignored' },
      { assetId: 'b', takenAt: 12 },
    ]);
    await markDetailed(db, 'b', { lat: 37.5, lng: 127, tzOffsetMin: 540 });
    await setStates(db, ['a'], 'in_card');
    const rows = await listScannable(db, 10);
    expect(rows).toEqual([
      { assetId: 'b', takenAt: 12, lat: 37.5, lng: 127, tzOffsetMin: 540, state: 'detailed' },
    ]);
  });

  it('markDetailed는 seen만 올린다', async () => {
    const db = await setup();
    await insertSeen(db, [{ assetId: 'a', takenAt: 1 }]);
    await setStates(db, ['a'], 'skipped');
    await markDetailed(db, 'a', { lat: 1, lng: 2, tzOffsetMin: 0 });
    expect((await countByState(db)).skipped).toBe(1);
  });
});
