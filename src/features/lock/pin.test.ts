import { readFileSync } from 'fs';
import { join } from 'path';
import * as SecureStore from 'expo-secure-store';
import { LOCKOUT_MS } from '@/domain/lockState';
import { PIN_HASH_KEY, resetLockState, setPin, verifyPin } from './pin';

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

// 네이티브(JSI) 모듈은 Jest에서 못 쓰므로 같은 API의 wasm 구현(libsodium-wrappers-sumo)으로 바꾼다.
jest.mock('react-native-libsodium', () => ({
  __esModule: true,
  default: jest.requireActual('libsodium-wrappers-sumo'),
}));

describe('PIN', () => {
  beforeEach(() => {
    mockStore.clear();
    resetLockState();
    jest.clearAllMocks();
  });

  it('맞는 PIN은 통과한다', async () => {
    await setPin('123456');
    expect(await verifyPin('123456', 0)).toEqual({ ok: true });
  });

  it('틀린 PIN은 실패한다', async () => {
    await setPin('123456');
    expect(await verifyPin('654321', 0)).toEqual({
      ok: false,
      reason: 'wrong',
      remainingFailures: 4,
    });
    expect(await verifyPin('12345', 0)).toMatchObject({ ok: false, reason: 'wrong' });
  });

  it('5회 실패하면 30초 동안 맞는 PIN도 거부하고, 지나면 다시 받는다', async () => {
    await setPin('123456');
    for (let i = 0; i < 4; i++) await verifyPin('000000', 1000);
    expect(await verifyPin('000000', 1000)).toEqual({
      ok: false,
      reason: 'locked',
      retryAfterMs: LOCKOUT_MS,
    });
    expect(await verifyPin('123456', 1000 + LOCKOUT_MS - 1)).toMatchObject({
      ok: false,
      reason: 'locked',
    });
    expect(await verifyPin('123456', 1000 + LOCKOUT_MS)).toEqual({ ok: true });
  });

  it('성공하면 실패 횟수가 초기화된다', async () => {
    await setPin('123456');
    for (let i = 0; i < 4; i++) await verifyPin('000000', 0);
    await verifyPin('123456', 0);
    expect(await verifyPin('000000', 0)).toMatchObject({ remainingFailures: 4 });
  });

  it('PIN 설정 전에는 not-set', async () => {
    expect(await verifyPin('123456', 0)).toEqual({ ok: false, reason: 'not-set' });
  });

  it('6자리 숫자가 아니면 설정을 거부한다', async () => {
    await expect(setPin('12345')).rejects.toThrow();
    await expect(setPin('12345a')).rejects.toThrow();
  });

  it('같은 PIN도 salt가 달라 저장값이 다르고, 평문 PIN을 저장하지 않는다', async () => {
    await setPin('123456');
    const first = mockStore.get(PIN_HASH_KEY);
    await setPin('123456');
    expect(mockStore.get(PIN_HASH_KEY)).not.toBe(first);
    expect(first).not.toContain('123456');
    expect(first?.startsWith('argon2id13$')).toBe(true);
  });

  describe('DB 키와 무관(D-011)', () => {
    it('PIN 설정·검증은 SecureStore에서 pin.hash 외 키를 읽거나 쓰지 않는다', async () => {
      mockStore.set('db.key', 'DBKEY');
      await setPin('123456');
      await verifyPin('123456', 0);
      await verifyPin('000000', 0);
      const touched = [
        ...jest.mocked(SecureStore.getItemAsync).mock.calls,
        ...jest.mocked(SecureStore.setItemAsync).mock.calls,
        ...jest.mocked(SecureStore.deleteItemAsync).mock.calls,
      ].map((c) => c[0]);
      expect(touched).not.toContain('db.key');
      expect(mockStore.get('db.key')).toBe('DBKEY');
    });

    it('소스에 db.key·DB 모듈 참조가 없다', () => {
      const src = readFileSync(join(__dirname, 'pin.ts'), 'utf8');
      expect(src).not.toMatch(/db\.key|@\/db/);
    });
  });
});
