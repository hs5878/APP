import {
  canAttempt,
  initialLockState,
  LOCKOUT_MS,
  parseLockTimeout,
  recordFailure,
  recordSuccess,
  remainingLockMs,
  shouldLockOnResume,
  type LockState,
  type LockTimeoutSec,
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

describe('parseLockTimeout', () => {
  it('허용된 값만 받는다', () => {
    expect(parseLockTimeout('0')).toBe(0);
    expect(parseLockTimeout('60')).toBe(60);
    expect(parseLockTimeout('300')).toBe(300);
  });

  it('없거나 이상한 값은 즉시(0)', () => {
    expect(parseLockTimeout(null)).toBe(0);
    expect(parseLockTimeout('')).toBe(0);
    expect(parseLockTimeout('120')).toBe(0);
    expect(parseLockTimeout('abc')).toBe(0);
  });
});

describe('shouldLockOnResume', () => {
  const check = (timeoutSec: LockTimeoutSec, elapsedMs: number, enabled = true) =>
    shouldLockOnResume({ enabled, timeoutSec, leftAt: 10_000, now: 10_000 + elapsedMs });

  it('즉시: 돌아오면 바로 잠근다', () => {
    expect(check(0, 0)).toBe(true);
    expect(check(0, 5)).toBe(true);
  });

  it('1분: 60초가 되기 전에는 열어 둔다', () => {
    expect(check(60, 59_999)).toBe(false);
    expect(check(60, 60_000)).toBe(true);
  });

  it('5분: 300초 기준', () => {
    expect(check(300, 299_999)).toBe(false);
    expect(check(300, 300_000)).toBe(true);
  });

  it('잠금을 껐으면 잠그지 않는다', () => {
    expect(check(0, 1_000_000, false)).toBe(false);
  });

  it('백그라운드로 간 기록이 없으면 잠그지 않는다', () => {
    expect(shouldLockOnResume({ enabled: true, timeoutSec: 0, leftAt: null, now: 1 })).toBe(false);
  });

  it('시계가 뒤로 돌아갔으면 잠근다', () => {
    expect(check(300, -1)).toBe(true);
  });
});
