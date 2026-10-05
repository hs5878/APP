import { DbOpenError, getDb, resetDb } from '@/db/client';
import { kvGet, kvSet, type KvDb } from '@/db/kv';
import { uuidv7 } from '@/domain/id';
import { clearAllSecrets } from '@/platform/secureStore';

export const INSTALL_ID_KEY = 'install.id';

export type BootReason = 'no-install-id' | 'db-unopenable';

/** existing: 이어서 시작. fresh: 새 설치로 시작(SecureStore·DB를 비웠다). 이후 승인·Drive 복원 분기는 T04 밖. */
export type BootResult = { kind: 'existing' } | { kind: 'fresh'; reason: BootReason };

export interface BootDeps {
  openDb(): Promise<KvDb>;
  /** SecureStore 항목을 모두 지우고 DB 파일을 지운다. */
  wipe(): Promise<void>;
  newInstallId(): string;
}

/**
 * 시작 분기.
 * - DB를 못 열면(키 없음·불일치) 새 설치로 본다.
 * - `kv['install.id']`가 없으면 새 설치다. iOS는 앱을 지워도 키체인이 남아 옛 db.key가 살아 있을 수 있으므로
 *   비밀값과 DB를 모두 비우고 새 키로 다시 연다.
 * DB 열기 실패 중 DbOpenError가 아닌 것(마이그레이션 오류 등)은 데이터를 지우지 않고 그대로 던진다.
 */
export async function runBoot(deps: BootDeps): Promise<BootResult> {
  let reason: BootReason;
  try {
    const db = await deps.openDb();
    if (await kvGet(db, INSTALL_ID_KEY)) return { kind: 'existing' };
    reason = 'no-install-id';
  } catch (e) {
    if (!(e instanceof DbOpenError)) throw e;
    reason = 'db-unopenable';
  }

  await deps.wipe();
  const db = await deps.openDb();
  await kvSet(db, INSTALL_ID_KEY, deps.newInstallId());
  return { kind: 'fresh', reason };
}

const realDeps: BootDeps = {
  openDb: getDb,
  wipe: async () => {
    await resetDb();
    await clearAllSecrets();
  },
  newInstallId: () => uuidv7(),
};

export function boot(): Promise<BootResult> {
  return runBoot(realDeps);
}
