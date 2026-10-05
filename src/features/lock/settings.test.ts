import { runMigrations } from '@/db/migrate';
import { createTestDb } from '@/db/testing';
import {
  defaultLockSettings,
  loadLockSettings,
  resolveLockSettings,
  saveLockSettings,
} from './settings';

// settings.ts가 끌어오는 네이티브 모듈은 Jest에서 쓰지 않는다.
jest.mock('@/db/client', () => ({ getDb: jest.fn() }));
jest.mock('./pin', () => ({ hasPin: jest.fn() }));

async function setup() {
  const t = createTestDb();
  await runMigrations(t.runner);
  return t.db;
}

describe('lock settings', () => {
  it('저장하지 않았으면 꺼짐·즉시', async () => {
    expect(await loadLockSettings(await setup())).toEqual(defaultLockSettings);
  });

  it('저장하고 다시 읽는다', async () => {
    const db = await setup();
    await saveLockSettings(db, { enabled: true, biometric: true, timeoutSec: 300 });
    expect(await loadLockSettings(db)).toEqual({ enabled: true, biometric: true, timeoutSec: 300 });
    await saveLockSettings(db, { biometric: false });
    expect(await loadLockSettings(db)).toEqual({
      enabled: true,
      biometric: false,
      timeoutSec: 300,
    });
  });
});

describe('resolveLockSettings', () => {
  const on = { enabled: true, biometric: false, timeoutSec: 60 as const };

  it('켜져 있고 PIN이 있으면 그대로 적용한다', async () => {
    expect(
      await resolveLockSettings(
        async () => on,
        async () => true,
      ),
    ).toEqual(on);
  });

  it('PIN이 없으면 잠그지 않는다', async () => {
    const r = await resolveLockSettings(
      async () => on,
      async () => false,
    );
    expect(r.enabled).toBe(false);
  });

  it('꺼져 있으면 PIN이 있어도 잠그지 않는다', async () => {
    const r = await resolveLockSettings(
      async () => defaultLockSettings,
      async () => true,
    );
    expect(r.enabled).toBe(false);
  });

  it('설정을 못 읽으면 PIN이 있는 한 즉시 잠금으로 닫는다', async () => {
    const fail = async () => {
      throw new Error('db');
    };
    expect(await resolveLockSettings(fail, async () => true)).toMatchObject({
      enabled: true,
      timeoutSec: 0,
    });
    expect((await resolveLockSettings(fail, async () => false)).enabled).toBe(false);
  });
});
