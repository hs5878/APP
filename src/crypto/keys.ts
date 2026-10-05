import { isUuid } from '@/domain/id';
import { getSecret, setSecret } from '@/platform/secureStore';
import { AEAD_KEY_BYTES, assertKeyId, getSodium } from './sodium';

// 공간 키와 기기 키쌍(D-019). 값은 SecureStore에 base64로 둔다.

export const DEVICE_SK_KEY = 'device.sk';

const BOX_KEY_BYTES = 32;

// 같은 이름을 동시에 만들면 서로 다른 키가 생겨 하나가 덮인다. 쓰기는 한 줄로 세운다.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

export function spaceKeyName(spaceId: string, keyId: number): string {
  if (!isUuid(spaceId)) throw new Error('space_id는 UUID여야 합니다.');
  assertKeyId(keyId);
  return `space.${spaceId}.key.${keyId}`;
}

async function decodeKey(name: string, raw: string, length: number): Promise<Uint8Array> {
  const s = await getSodium();
  let bytes: Uint8Array;
  try {
    bytes = s.from_base64(raw);
  } catch {
    throw new Error(`SecureStore ${name} 값이 손상되었습니다.`);
  }
  if (bytes.length !== length) throw new Error(`SecureStore ${name} 값의 길이가 맞지 않습니다.`);
  return bytes;
}

/** 저장된 공간 키. 없으면 null. */
export async function getSpaceKey(spaceId: string, keyId: number): Promise<Uint8Array | null> {
  const name = spaceKeyName(spaceId, keyId);
  const raw = await getSecret(name);
  return raw === null ? null : decodeKey(name, raw, AEAD_KEY_BYTES);
}

/**
 * 공간 키를 보관한다(승인으로 받은 키 등). 이미 다른 키가 있으면 덮지 않고 실패한다.
 * 키를 잃으면 그 공간의 암호문을 영영 못 읽기 때문이다.
 */
export async function storeSpaceKey(
  spaceId: string,
  keyId: number,
  key: Uint8Array,
): Promise<void> {
  const name = spaceKeyName(spaceId, keyId);
  if (key.length !== AEAD_KEY_BYTES)
    throw new Error(`공간 키는 ${AEAD_KEY_BYTES}바이트여야 합니다.`);
  return serialize(async () => {
    const s = await getSodium();
    const encoded = s.to_base64(key);
    const existing = await getSecret(name);
    if (existing === encoded) return;
    if (existing !== null) throw new Error(`${name}에 다른 키가 이미 있습니다.`);
    await setSecret(name, encoded);
  });
}

/** 새 공간 키(무작위 256비트)를 만들어 보관하고 돌려준다. 이미 있으면 실패한다. */
export async function createSpaceKey(spaceId: string, keyId: number): Promise<Uint8Array> {
  const name = spaceKeyName(spaceId, keyId);
  return serialize(async () => {
    if ((await getSecret(name)) !== null) throw new Error(`${name}가 이미 있습니다.`);
    const s = await getSodium();
    const key = s.randombytes_buf(AEAD_KEY_BYTES);
    await setSecret(name, s.to_base64(key));
    return key;
  });
}

export type DeviceKeyPair = { publicKey: Uint8Array; secretKey: Uint8Array };

// `device.sk` 값 = base64(개인키 32B ‖ 공개키 32B).
// 네이티브 바인딩에 개인키에서 공개키를 계산하는 함수(crypto_scalarmult_base)가 없어 공개키를 함께 둔다.
async function readDeviceKeyPair(): Promise<DeviceKeyPair | null> {
  const raw = await getSecret(DEVICE_SK_KEY);
  if (raw === null) return null;
  const bytes = await decodeKey(DEVICE_SK_KEY, raw, BOX_KEY_BYTES * 2);
  return { secretKey: bytes.slice(0, BOX_KEY_BYTES), publicKey: bytes.slice(BOX_KEY_BYTES) };
}

/** 이 기기의 X25519 키쌍. 없으면 null. */
export function getDeviceKeyPair(): Promise<DeviceKeyPair | null> {
  return readDeviceKeyPair();
}

/** 이 기기의 X25519 키쌍. 없으면 `crypto_box_keypair`로 만들어 보관한다. */
export function getOrCreateDeviceKeyPair(): Promise<DeviceKeyPair> {
  return serialize(async () => {
    const existing = await readDeviceKeyPair();
    if (existing) return existing;
    const s = await getSodium();
    const { publicKey, privateKey } = s.crypto_box_keypair();
    const packed = new Uint8Array(BOX_KEY_BYTES * 2);
    packed.set(privateKey, 0);
    packed.set(publicKey, BOX_KEY_BYTES);
    await setSecret(DEVICE_SK_KEY, s.to_base64(packed));
    return { secretKey: privateKey, publicKey };
  });
}
