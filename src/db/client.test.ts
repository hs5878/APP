import { openDatabaseAsync } from 'expo-sqlite';
import { getSecret, setSecret } from '@/platform/secureStore';
import { DbOpenError, getOrCreateDbKey, openEncryptedDb } from './client';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('drizzle-orm/expo-sqlite', () => ({ drizzle: jest.fn() }));
jest.mock('@/platform/secureStore', () => ({ getSecret: jest.fn(), setSecret: jest.fn() }));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(n).fill(0xab),
}));

describe('getOrCreateDbKey', () => {
  beforeEach(() => jest.resetAllMocks());

  it('키가 없으면 256비트(hex 64자) 키를 만들어 db.key에 저장한다', async () => {
    jest.mocked(getSecret).mockResolvedValue(null);
    const key = await getOrCreateDbKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(setSecret).toHaveBeenCalledWith('db.key', key);
  });

  it('키가 있으면 그대로 쓰고 새로 저장하지 않는다', async () => {
    jest.mocked(getSecret).mockResolvedValue('existing');
    expect(await getOrCreateDbKey()).toBe('existing');
    expect(setSecret).not.toHaveBeenCalled();
  });
});

describe('openEncryptedDb', () => {
  it('키가 맞지 않아 읽기에 실패하면 DbOpenError를 던지고 연결을 닫는다', async () => {
    const closeAsync = jest.fn().mockResolvedValue(undefined);
    jest.mocked(openDatabaseAsync).mockResolvedValue({
      execAsync: jest.fn().mockResolvedValue(undefined),
      getAllAsync: jest.fn().mockRejectedValue(new Error('file is not a database')),
      closeAsync,
    } as never);
    await expect(openEncryptedDb('00')).rejects.toBeInstanceOf(DbOpenError);
    expect(closeAsync).toHaveBeenCalled();
  });
});
