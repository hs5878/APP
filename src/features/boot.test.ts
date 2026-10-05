import { DbOpenError } from '@/db/client';
import { kvGet, kvSet, type KvDb } from '@/db/kv';
import { INSTALL_ID_KEY, runBoot, type BootDeps } from './boot';

jest.mock('@/db/client', () => ({
  DbOpenError: class DbOpenError extends Error {},
  getDb: jest.fn(),
  resetDb: jest.fn(),
}));
jest.mock('@/platform/secureStore', () => ({ clearAllSecrets: jest.fn() }));
jest.mock('@/db/kv', () => ({ kvGet: jest.fn(), kvSet: jest.fn() }));

const db = {} as KvDb;

function makeDeps(openDb: BootDeps['openDb']) {
  const deps = {
    openDb: jest.fn(openDb),
    wipe: jest.fn().mockResolvedValue(undefined),
    newInstallId: jest.fn(() => 'new-id'),
  };
  return deps;
}

describe('runBoot', () => {
  beforeEach(() => jest.resetAllMocks());

  it('install.id가 있으면 그대로 이어 시작하고 아무것도 지우지 않는다', async () => {
    jest.mocked(kvGet).mockResolvedValue('abc');
    const deps = makeDeps(async () => db);
    expect(await runBoot(deps)).toEqual({ kind: 'existing' });
    expect(deps.wipe).not.toHaveBeenCalled();
    expect(kvSet).not.toHaveBeenCalled();
  });

  it('install.id가 없으면(키체인만 남은 재설치) 비우고 새 install.id로 시작한다', async () => {
    jest.mocked(kvGet).mockResolvedValue(null);
    const deps = makeDeps(async () => db);
    expect(await runBoot(deps)).toEqual({ kind: 'fresh', reason: 'no-install-id' });
    expect(kvGet).toHaveBeenCalledWith(db, INSTALL_ID_KEY);
    expect(deps.wipe).toHaveBeenCalledTimes(1);
    expect(deps.openDb).toHaveBeenCalledTimes(2); // 비운 뒤 새 키로 다시 연다
    expect(kvSet).toHaveBeenCalledWith(db, INSTALL_ID_KEY, 'new-id');
    expect(deps.wipe.mock.invocationCallOrder[0]!).toBeLessThan(
      jest.mocked(kvSet).mock.invocationCallOrder[0]!,
    );
  });

  it('DB를 못 열면 새 설치로 처리한다', async () => {
    let calls = 0;
    const deps = makeDeps(async () => {
      if (calls++ === 0) throw new DbOpenError('x');
      return db;
    });
    expect(await runBoot(deps)).toEqual({ kind: 'fresh', reason: 'db-unopenable' });
    expect(deps.wipe).toHaveBeenCalledTimes(1);
    expect(kvSet).toHaveBeenCalledWith(db, INSTALL_ID_KEY, 'new-id');
  });

  it('DbOpenError가 아닌 오류는 데이터를 지우지 않고 던진다', async () => {
    const deps = makeDeps(async () => {
      throw new Error('migration failed');
    });
    await expect(runBoot(deps)).rejects.toThrow('migration failed');
    expect(deps.wipe).not.toHaveBeenCalled();
  });
});
