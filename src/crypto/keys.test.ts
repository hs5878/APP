import {
  createSpaceKey,
  DEVICE_SK_KEY,
  getDeviceKeyPair,
  getOrCreateDeviceKeyPair,
  getSpaceKey,
  spaceKeyName,
  storeSpaceKey,
} from './keys';
import { getSodium } from './sodium';

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

jest.mock('react-native-libsodium', () => ({
  __esModule: true,
  default: jest.requireActual('libsodium-wrappers-sumo'),
}));

const SPACE = '01900000-0000-7000-8000-000000000a02';

describe('공간 키', () => {
  beforeEach(() => mockStore.clear());

  it('이름은 space.{id}.key.{key_id}', () => {
    expect(spaceKeyName(SPACE, 1)).toBe(`space.${SPACE}.key.1`);
    expect(() => spaceKeyName('x', 1)).toThrow();
    expect(() => spaceKeyName(SPACE, 0)).toThrow();
  });

  it('32바이트 무작위 키를 만들어 SecureStore에 두고 다시 읽는다', async () => {
    const key = await createSpaceKey(SPACE, 1);
    expect(key.length).toBe(32);
    expect(mockStore.has(`space.${SPACE}.key.1`)).toBe(true);
    expect(await getSpaceKey(SPACE, 1)).toEqual(key);
    expect(await getSpaceKey(SPACE, 2)).toBeNull();
  });

  it('이미 있는 키는 덮지 않는다', async () => {
    const key = await createSpaceKey(SPACE, 1);
    await expect(createSpaceKey(SPACE, 1)).rejects.toThrow();
    await expect(storeSpaceKey(SPACE, 1, new Uint8Array(32).fill(1))).rejects.toThrow();
    await storeSpaceKey(SPACE, 1, key); // 같은 키는 그대로 통과
    expect(await getSpaceKey(SPACE, 1)).toEqual(key);
  });

  it('동시에 만들어도 하나만 성공한다', async () => {
    const results = await Promise.allSettled([createSpaceKey(SPACE, 1), createSpaceKey(SPACE, 1)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('길이가 틀린 키는 저장하지 않고, 손상된 값은 읽기에서 실패한다', async () => {
    await expect(storeSpaceKey(SPACE, 1, new Uint8Array(31))).rejects.toThrow();
    mockStore.set(`space.${SPACE}.key.1`, 'AAAA');
    await expect(getSpaceKey(SPACE, 1)).rejects.toThrow();
  });
});

describe('기기 키쌍', () => {
  beforeEach(() => mockStore.clear());

  it('없으면 null', async () => {
    expect(await getDeviceKeyPair()).toBeNull();
  });

  it('한 번 만들고 이후에는 같은 키쌍을 돌려준다', async () => {
    const [a, b] = await Promise.all([getOrCreateDeviceKeyPair(), getOrCreateDeviceKeyPair()]);
    expect(a.publicKey.length).toBe(32);
    expect(a.secretKey.length).toBe(32);
    expect(b).toEqual(a);
    expect(await getOrCreateDeviceKeyPair()).toEqual(a);
    expect(await getDeviceKeyPair()).toEqual(a);
    expect(mockStore.has(DEVICE_SK_KEY)).toBe(true);
  });

  it('보관한 공개키와 개인키가 짝이 맞는다(봉인 상자로 확인)', async () => {
    const { publicKey, secretKey } = await getOrCreateDeviceKeyPair();
    const s = await getSodium();
    const spaceKey = s.randombytes_buf(32);
    const sealed = s.crypto_box_seal(spaceKey, publicKey);
    expect(s.crypto_box_seal_open(sealed, publicKey, secretKey)).toEqual(spaceKey);
  });
});
