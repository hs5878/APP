import * as SecureStore from 'expo-secure-store';

// iOS: 화면이 잠긴 동안에도 백그라운드 백업이 읽을 수 있고, 기기 밖으로 복사되지 않는다.
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// SecureStore는 키 목록을 못 준다. `space.{id}.key.{n}`처럼 동적인 키까지 지우려고
// 우리가 쓴 키 이름을 같은 저장소의 이 항목에 적어 둔다(키체인과 함께 남고 함께 지워진다).
const INDEX_KEY = 'secure.index';

// 인덱스 읽기-쓰기가 겹쳐 키가 빠지지 않게 한 줄로 세운다.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

async function readIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY, options);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(keys: string[]): Promise<void> {
  return SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(keys), options);
}

export function getSecret(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key, options);
}

export function setSecret(key: string, value: string): Promise<void> {
  return serialize(async () => {
    // 인덱스를 먼저 적는다. 값 저장 중에 죽어도 지울 대상이 빠지지 않는다.
    const keys = await readIndex();
    if (!keys.includes(key)) await writeIndex([...keys, key]);
    await SecureStore.setItemAsync(key, value, options);
  });
}

export function deleteSecret(key: string): Promise<void> {
  return serialize(async () => {
    await SecureStore.deleteItemAsync(key, options);
    const keys = await readIndex();
    if (keys.includes(key)) await writeIndex(keys.filter((k) => k !== key));
  });
}

/** 이 앱이 SecureStore에 쓴 항목을 모두 지운다(재설치 정리). */
export function clearAllSecrets(): Promise<void> {
  return serialize(async () => {
    const keys = await readIndex();
    for (const key of keys) await SecureStore.deleteItemAsync(key, options);
    await SecureStore.deleteItemAsync(INDEX_KEY, options);
  });
}
