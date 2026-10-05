import * as SecureStore from 'expo-secure-store';
import { clearAllSecrets, deleteSecret, setSecret } from './secureStore';

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

describe('secureStore', () => {
  beforeEach(() => mockStore.clear());

  it('모든 쓰기에 AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY를 건다', async () => {
    await setSecret('db.key', 'v');
    for (const call of jest.mocked(SecureStore.setItemAsync).mock.calls) {
      expect(call[2]).toEqual({ keychainAccessible: 'afterFirstUnlockThisDeviceOnly' });
    }
  });

  it('clearAllSecrets는 동적 키를 포함해 우리가 쓴 항목을 모두 지운다', async () => {
    await Promise.all([
      setSecret('db.key', 'a'),
      setSecret('space.s1.key.1', 'b'),
      setSecret('device.sk', 'c'),
    ]);
    await clearAllSecrets();
    expect(mockStore.size).toBe(0);
  });

  it('deleteSecret은 인덱스에서도 뺀다', async () => {
    await setSecret('pin.hash', 'a');
    await deleteSecret('pin.hash');
    expect(JSON.parse(mockStore.get('secure.index') ?? '[]')).toEqual([]);
  });
});
