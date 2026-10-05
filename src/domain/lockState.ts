/** PIN 입력 잠금 상태 기계. 시계는 호출자가 `now`(ms)로 넘긴다. */

export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 30_000;

export interface LockState {
  /** 연속 실패 횟수. 대기가 시작되면 0으로 돌아간다. */
  failures: number;
  /** 이 시각(ms)까지 입력을 거부한다. 대기 중이 아니면 null. */
  lockedUntil: number | null;
}

export const initialLockState: LockState = { failures: 0, lockedUntil: null };

/** 입력을 받을 수 있으면 0, 아니면 남은 대기 시간(ms). */
export function remainingLockMs(state: LockState, now: number): number {
  if (state.lockedUntil === null) return 0;
  return Math.max(0, state.lockedUntil - now);
}

export function canAttempt(state: LockState, now: number): boolean {
  return remainingLockMs(state, now) === 0;
}

export function recordFailure(state: LockState, now: number): LockState {
  const failures = state.failures + 1;
  if (failures >= MAX_FAILURES) return { failures: 0, lockedUntil: now + LOCKOUT_MS };
  return { failures, lockedUntil: null };
}

export function recordSuccess(): LockState {
  return initialLockState;
}
