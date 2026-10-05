import {
  canAttempt,
  initialLockState,
  LOCKOUT_MS,
  recordFailure,
  recordSuccess,
  remainingLockMs,
  type LockState,
} from './lockState';

function failTimes(n: number, now: number): LockState {
  let s = initialLockState;
  for (let i = 0; i < n; i++) s = recordFailure(s, now);
  return s;
}

describe('lockState', () => {
  it('4회 실패까지는 계속 입력할 수 있다', () => {
    const s = failTimes(4, 1000);
    expect(s.failures).toBe(4);
    expect(canAttempt(s, 1000)).toBe(true);
  });

  it('5회 실패하면 30초 동안 거부한다', () => {
    const s = failTimes(5, 1000);
    expect(canAttempt(s, 1000)).toBe(false);
    expect(remainingLockMs(s, 1000)).toBe(LOCKOUT_MS);
    expect(canAttempt(s, 1000 + LOCKOUT_MS - 1)).toBe(false);
    expect(canAttempt(s, 1000 + LOCKOUT_MS)).toBe(true);
  });

  it('대기가 시작되면 실패 횟수는 새로 센다', () => {
    expect(failTimes(5, 0).failures).toBe(0);
  });

  it('성공하면 초기화한다', () => {
    expect(recordSuccess()).toEqual(initialLockState);
  });
});
