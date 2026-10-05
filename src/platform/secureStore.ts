import * as SecureStore from 'expo-secure-store';

// iOS: 화면이 잠긴 동안에도 백그라운드 백업이 읽을 수 있고, 기기 밖으로 복사되지 않는다.
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export function getSecret(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key, options);
}

export function setSecret(key: string, value: string): Promise<void> {
  return SecureStore.setItemAsync(key, value, options);
}

export function deleteSecret(key: string): Promise<void> {
  return SecureStore.deleteItemAsync(key, options);
}
