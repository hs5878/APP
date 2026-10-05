import { getSodium } from '@/crypto/sodium';
import {
  canAttempt,
  initialLockState,
  MAX_FAILURES,
  recordFailure,
  recordSuccess,
  remainingLockMs,
  type LockState,
} from '@/domain/lockState';
import { deleteSecret, getSecret, setSecret } from '@/platform/secureStore';

// PIN은 DB 키와 무관하다(D-011). 이 파일은 SecureStore의 `pin.hash`만 읽고 쓴다.
export const PIN_HASH_KEY = 'pin.hash';

const PIN_PATTERN = /^\d{6}$/;
const HASH_BYTES = 32;
const FORMAT = 'argon2id13';

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'wrong'; remainingFailures: number }
  | { ok: false; reason: 'locked'; retryAfterMs: number }
  | { ok: false; reason: 'not-set' };

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

// 실패 횟수는 메모리에만 둔다. 앱을 다시 켜면 초기화된다(영속화는 DATA_MODEL의 kv 키 확정 후).
let lockState: LockState = initialLockState;

export function getLockState(): LockState {
  return lockState;
}

export function resetLockState(): void {
  lockState = initialLockState;
}

async function derive(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const s = await getSodium();
  return s.crypto_pwhash(
    HASH_BYTES,
    pin,
    salt,
    s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
}

/** 저장 형식: `argon2id13$<salt base64>$<hash base64>` */
export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('PIN은 숫자 6자리여야 합니다.');
  const s = await getSodium();
  const salt = s.randombytes_buf(s.crypto_pwhash_SALTBYTES);
  const hash = await derive(pin, salt);
  await setSecret(PIN_HASH_KEY, `${FORMAT}$${s.to_base64(salt)}$${s.to_base64(hash)}`);
  lockState = recordSuccess();
}

export async function hasPin(): Promise<boolean> {
  return (await getSecret(PIN_HASH_KEY)) !== null;
}

export function clearPin(): Promise<void> {
  lockState = recordSuccess();
  return deleteSecret(PIN_HASH_KEY);
}

export async function verifyPin(pin: string, now: number = Date.now()): Promise<VerifyResult> {
  if (!canAttempt(lockState, now)) {
    return { ok: false, reason: 'locked', retryAfterMs: remainingLockMs(lockState, now) };
  }
  const stored = await getSecret(PIN_HASH_KEY);
  if (stored === null) return { ok: false, reason: 'not-set' };
  const [format, saltB64, hashB64, ...rest] = stored.split('$');
  if (format !== FORMAT || !saltB64 || !hashB64 || rest.length > 0) {
    return { ok: false, reason: 'not-set' };
  }

  const s = await getSodium();
  const expected = s.from_base64(hashB64);
  const match = isValidPin(pin) && s.memcmp(await derive(pin, s.from_base64(saltB64)), expected);

  if (match) {
    lockState = recordSuccess();
    return { ok: true };
  }
  lockState = recordFailure(lockState, now);
  if (!canAttempt(lockState, now)) {
    return { ok: false, reason: 'locked', retryAfterMs: remainingLockMs(lockState, now) };
  }
  return { ok: false, reason: 'wrong', remainingFailures: MAX_FAILURES - lockState.failures };
}
