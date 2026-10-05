import sodium from 'react-native-libsodium';

/** libsodium 초기화를 기다린 뒤 모듈을 돌려준다. 암호 기본 요소는 이 모듈로만 쓴다. */
export async function getSodium(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}
