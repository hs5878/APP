// 로그인(T20) 전까지 쓰는 개발용 임시 사용자와 공간. 고정 UUID라 재설치해도 같은 값이다.
// T20에서 실제 auth uid로 교체하면서 이 파일을 지운다.
export const DEV_USER_ID = '01900000-0000-7000-8000-00000000d001';
export const DEV_SPACE_ID = '01900000-0000-7000-8000-00000000d002';

export function getDevUser(): { userId: string; spaceId: string } {
  return { userId: DEV_USER_ID, spaceId: DEV_SPACE_ID };
}
