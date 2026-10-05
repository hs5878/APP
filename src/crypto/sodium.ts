import sodium from 'react-native-libsodium';

export type Sodium = typeof sodium;

/** libsodium 초기화를 기다린 뒤 모듈을 돌려준다. 암호 기본 요소는 이 모듈로만 쓴다. */
export async function getSodium(): Promise<Sodium> {
  await sodium.ready;
  return sodium;
}

/** 키·AAD가 맞지 않거나 암호문이 바뀌어 복호화(인증)에 실패했다. */
export class DecryptError extends Error {
  constructor(message = '복호화에 실패했습니다.') {
    super(message);
    this.name = 'DecryptError';
  }
}

// XChaCha20-Poly1305 상수. 네이티브 바인딩이 ABYTES를 내보내지 않아 값을 적어 둔다.
export const AEAD_KEY_BYTES = 32;
export const AEAD_NONCE_BYTES = 24;
export const AEAD_TAG_BYTES = 16;

function assertKey(key: Uint8Array): void {
  if (key.length !== AEAD_KEY_BYTES) throw new Error(`키는 ${AEAD_KEY_BYTES}바이트여야 합니다.`);
}

/**
 * 단발 AEAD(XChaCha20-Poly1305) 암호화. 결과 = `nonce(24B) ‖ ciphertext`.
 * 네이티브 바인딩은 AAD를 문자열로만 받아 UTF-8 바이트로 넘긴다(wasm 구현도 같다).
 */
export async function aeadSeal(
  plain: Uint8Array | string,
  aad: string,
  key: Uint8Array,
): Promise<Uint8Array> {
  assertKey(key);
  const s = await getSodium();
  const nonce = s.randombytes_buf(AEAD_NONCE_BYTES);
  const cipher = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plain, aad, null, nonce, key);
  const out = new Uint8Array(AEAD_NONCE_BYTES + cipher.length);
  out.set(nonce, 0);
  out.set(cipher, AEAD_NONCE_BYTES);
  return out;
}

/** `aeadSeal`의 역. 인증에 실패하면 `DecryptError`. */
export async function aeadOpen(
  sealed: Uint8Array,
  aad: string,
  key: Uint8Array,
): Promise<Uint8Array> {
  assertKey(key);
  if (sealed.length < AEAD_NONCE_BYTES + AEAD_TAG_BYTES)
    throw new DecryptError('암호문이 너무 짧습니다.');
  const s = await getSodium();
  try {
    return s.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      sealed.subarray(AEAD_NONCE_BYTES),
      aad,
      sealed.subarray(0, AEAD_NONCE_BYTES),
      key,
    );
  } catch {
    throw new DecryptError();
  }
}

/**
 * AAD 필드 하나를 문자열로 검사한다. 네이티브 바인딩이 AAD를 UTF-8 문자열로만 받으므로
 * 문자 하나 = 바이트 하나가 되도록 출력 가능한 ASCII만 허용한다.
 */
export function assertAadField(name: string, value: string, maxLength: number): void {
  if (value.length > maxLength || !/^[\x20-\x7e]*$/.test(value)) {
    throw new Error(`AAD 필드 ${name}는 ${maxLength}자 이하의 ASCII여야 합니다.`);
  }
}

/** key_id: 1 이상의 정수. AAD에는 10진 문자열로 들어간다. */
export function assertKeyId(keyId: number): void {
  if (!Number.isSafeInteger(keyId) || keyId < 1)
    throw new Error('key_id는 1 이상의 정수여야 합니다.');
}
