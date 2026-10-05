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

// 실패 상태도 SecureStore에 둬서 앱을 다시 켜도 대기가 이어진다(DB 모듈을 쓰지 않는다).
export const PIN_LOCK_KEY = 'pin.lock';

export async function getLockState(): Promise<LockState> {
  const raw = await getSecret(PIN_LOCK_KEY);
  if (!raw) return initialLockState;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return initialLockState;
    const { failures, lockedUntil } = v as Record<string, unknown>;
    if (
      typeof failures !== 'number' ||
      !(lockedUntil === null || typeof lockedUntil === 'number')
    ) {
      return initialLockState;
    }
    return { failures, lockedUntil };
  } catch {
    return initialLockState;
  }
}

async function saveLockState(state: LockState): Promise<void> {
  if (state === initialLockState) await deleteSecret(PIN_LOCK_KEY);
  else await setSecret(PIN_LOCK_KEY, JSON.stringify(state));
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
  await saveLockState(recordSuccess());
}

export async function hasPin(): Promise<boolean> {
  return (await getSecret(PIN_HASH_KEY)) !== null;
}

export async function clearPin(): Promise<void> {
  await deleteSecret(PIN_HASH_KEY);
  await saveLockState(recordSuccess());
}

export async function verifyPin(pin: string, now: number = Date.now()): Promise<VerifyResult> {
  const state = await getLockState();
  if (!canAttempt(state, now)) {
    return { ok: false, reason: 'locked', retryAfterMs: remainingLockMs(state, now) };
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
    await saveLockState(recordSuccess());
    return { ok: true };
  }
  const next = recordFailure(state, now);
  await saveLockState(next);
  if (!canAttempt(next, now)) {
    return { ok: false, reason: 'locked', retryAfterMs: remainingLockMs(next, now) };
  }
  return { ok: false, reason: 'wrong', remainingFailures: MAX_FAILURES - next.failures };
}
