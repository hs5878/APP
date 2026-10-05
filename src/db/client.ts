import { drizzle } from 'drizzle-orm/expo-sqlite';
import { getRandomBytes } from 'expo-crypto';
import { deleteDatabaseAsync, openDatabaseAsync } from 'expo-sqlite';
import { getSecret, setSecret } from '@/platform/secureStore';
import { runMigrations } from './migrate';

export const DB_NAME = 'app.db';
export const DB_KEY_NAME = 'db.key';

export class DbOpenError extends Error {
  constructor(cause: unknown) {
    super('DB를 열 수 없습니다(키가 없거나 맞지 않음).', { cause });
    this.name = 'DbOpenError';
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SecureStore의 `db.key`를 돌려준다. 없으면 OS 난수로 256비트 키를 만들어 저장한다. */
export async function getOrCreateDbKey(): Promise<string> {
  const existing = await getSecret(DB_KEY_NAME);
  if (existing) return existing;
  const key = toHex(getRandomBytes(32));
  await setSecret(DB_KEY_NAME, key);
  return key;
}

/** 키로 DB를 열고 실제로 읽어 본다. SQLCipher는 키가 틀려도 open은 성공하므로 읽기에서 실패한다. */
export async function openEncryptedDb(key: string) {
  const sqlite = await openDatabaseAsync(DB_NAME);
  try {
    await sqlite.execAsync(`PRAGMA key = "x'${key}'"`);
    await sqlite.getAllAsync('SELECT count(*) FROM sqlite_master');
  } catch (e) {
    await sqlite.closeAsync().catch(() => {});
    throw new DbOpenError(e);
  }
  return sqlite;
}

let opening: ReturnType<typeof initDb> | null = null;
let current: Awaited<ReturnType<typeof openEncryptedDb>> | null = null;

async function initDb() {
  const sqlite = await openEncryptedDb(await getOrCreateDbKey());
  current = sqlite;
  await runMigrations(sqlite);
  return drizzle(sqlite);
}

/** 연결을 닫고 DB 파일을 지운다. 다음 getDb()가 새 파일을 만든다. 재설치 정리용. */
export async function resetDb(): Promise<void> {
  const pending = opening;
  opening = null;
  await pending?.catch(() => {});
  await current?.closeAsync().catch(() => {});
  current = null;
  await deleteDatabaseAsync(DB_NAME).catch(() => {});
}

/** 앱 전체에서 공유하는 DB. 처음 호출할 때 열고 마이그레이션한다. 실패하면 다음 호출에서 다시 시도한다. */
export function getDb() {
  opening ??= initDb().catch((e) => {
    opening = null;
    throw e;
  });
  return opening;
}
