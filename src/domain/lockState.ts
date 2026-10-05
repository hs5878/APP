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

/** 백그라운드에서 돌아왔을 때 잠그는 기준(초). DATA_MODEL `lock.timeout`. 0은 즉시. */
export const LOCK_TIMEOUTS_SEC = [0, 60, 300] as const;
export type LockTimeoutSec = (typeof LOCK_TIMEOUTS_SEC)[number];
export const DEFAULT_LOCK_TIMEOUT_SEC: LockTimeoutSec = 0;

/** 저장된 문자열을 옵션 값으로. 없거나 모르는 값이면 가장 엄격한 즉시(0). */
export function parseLockTimeout(raw: string | null): LockTimeoutSec {
  const n = raw === null ? NaN : Number(raw);
  return LOCK_TIMEOUTS_SEC.find((t) => t === n) ?? DEFAULT_LOCK_TIMEOUT_SEC;
}

export interface ResumeCheck {
  enabled: boolean;
  timeoutSec: LockTimeoutSec;
  /** 앱이 백그라운드로 간 시각(ms). 기록이 없으면 null. */
  leftAt: number | null;
  now: number;
}

/** 앱이 다시 앞으로 왔을 때 잠금 화면을 보여야 하는가. 시계가 되돌려졌으면(경과가 음수) 잠근다. */
export function shouldLockOnResume({ enabled, timeoutSec, leftAt, now }: ResumeCheck): boolean {
  if (!enabled || leftAt === null) return false;
  const elapsedMs = now - leftAt;
  return elapsedMs < 0 || elapsedMs >= timeoutSec * 1000;
}
