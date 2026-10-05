import { getDb } from '@/db/client';
import { kvGet, kvSet, type KvDb } from '@/db/kv';
import {
  DEFAULT_LOCK_TIMEOUT_SEC,
  parseLockTimeout,
  type LockTimeoutSec,
} from '@/domain/lockState';
import { hasPin } from './pin';

// DATA_MODEL kv: `lock.enabled`, `lock.biometric`, `lock.timeout`(0/60/300)
export const LOCK_ENABLED_KEY = 'lock.enabled';
export const LOCK_BIOMETRIC_KEY = 'lock.biometric';
export const LOCK_TIMEOUT_KEY = 'lock.timeout';

export interface LockSettings {
  enabled: boolean;
  biometric: boolean;
  timeoutSec: LockTimeoutSec;
}

export const defaultLockSettings: LockSettings = {
  enabled: false,
  biometric: false,
  timeoutSec: DEFAULT_LOCK_TIMEOUT_SEC,
};

export async function loadLockSettings(db: KvDb): Promise<LockSettings> {
  return {
    enabled: (await kvGet(db, LOCK_ENABLED_KEY)) === '1',
    biometric: (await kvGet(db, LOCK_BIOMETRIC_KEY)) === '1',
    timeoutSec: parseLockTimeout(await kvGet(db, LOCK_TIMEOUT_KEY)),
  };
}

export async function saveLockSettings(db: KvDb, patch: Partial<LockSettings>): Promise<void> {
  if (patch.enabled !== undefined) await kvSet(db, LOCK_ENABLED_KEY, patch.enabled ? '1' : '0');
  if (patch.biometric !== undefined)
    await kvSet(db, LOCK_BIOMETRIC_KEY, patch.biometric ? '1' : '0');
  if (patch.timeoutSec !== undefined) await kvSet(db, LOCK_TIMEOUT_KEY, String(patch.timeoutSec));
}

/**
 * 실제로 적용할 잠금 설정.
 * - PIN이 없으면 풀 방법이 없으므로 잠그지 않는다.
 * - 설정을 읽지 못하면 PIN이 있는 한 잠근다(실패 시 닫는 쪽).
 */
export async function resolveLockSettings(
  readSettings: () => Promise<LockSettings> = async () => loadLockSettings(await getDb()),
  pinExists: () => Promise<boolean> = hasPin,
): Promise<LockSettings> {
  let settings: LockSettings;
  try {
    settings = await readSettings();
  } catch {
    settings = { ...defaultLockSettings, enabled: true };
  }
  if (!settings.enabled) return settings;
  return (await pinExists()) ? settings : { ...settings, enabled: false };
}
