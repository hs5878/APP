import { useCallback, useEffect, useRef, useState } from 'react';
import { remainingLockMs } from '@/domain/lockState';
import { authenticateBiometric, isBiometricAvailable } from '@/platform/biometric';
import { useLock } from './LockProvider';
import { getLockState, PIN_LENGTH, verifyPin } from './pin';

/** 잠금 화면 로직: PIN 입력, 5회 실패 대기 표시, 선택적 생체인증. */
export function useUnlock() {
  const { settings, unlock } = useLock();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [biometricReady, setBiometricReady] = useState(false);
  const biometricBusy = useRef(false);

  const waitingMs = retryAt === null ? 0 : Math.max(0, retryAt - now);
  const waiting = waitingMs > 0;

  // 앱을 다시 켜도 이어지는 대기를 화면에 반영한다.
  useEffect(() => {
    getLockState().then((state) => {
      const left = remainingLockMs(state, Date.now());
      if (left > 0) {
        setNow(Date.now());
        setRetryAt(Date.now() + left);
      }
    });
  }, []);

  useEffect(() => {
    if (retryAt === null) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= retryAt) {
        setRetryAt(null);
        setMessage(null);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [retryAt]);

  const tryBiometric = useCallback(async () => {
    if (biometricBusy.current) return;
    biometricBusy.current = true;
    try {
      if (await authenticateBiometric('앱 잠금 해제')) unlock();
    } catch {
      // 취소·실패는 PIN으로 풀면 된다.
    } finally {
      biometricBusy.current = false;
    }
  }, [unlock]);

  // 켜져 있고 쓸 수 있을 때만 열자마자 한 번 띄운다.
  useEffect(() => {
    if (!settings.biometric) return;
    let cancelled = false;
    isBiometricAvailable()
      .then((ok) => {
        if (cancelled || !ok) return;
        setBiometricReady(true);
        void tryBiometric();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [settings.biometric, tryBiometric]);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      try {
        const result = await verifyPin(value);
        if (result.ok || result.reason === 'not-set') {
          unlock();
          return;
        }
        setPin('');
        if (result.reason === 'locked') {
          setNow(Date.now());
          setRetryAt(Date.now() + result.retryAfterMs);
          setMessage('5번 틀렸어요. 잠시 후 다시 해 주세요.');
        } else {
          setMessage(`PIN이 맞지 않아요. (남은 기회 ${result.remainingFailures}번)`);
        }
      } finally {
        setBusy(false);
      }
    },
    [unlock],
  );

  const onDigit = useCallback(
    (digit: string) => {
      if (busy || waiting || pin.length >= PIN_LENGTH) return;
      const next = pin + digit;
      setPin(next);
      setMessage(null);
      if (next.length === PIN_LENGTH) void submit(next);
    },
    [busy, waiting, pin, submit],
  );

  const onDelete = useCallback(() => {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  }, [busy]);

  return {
    pinLength: pin.length,
    message,
    waitingSec: Math.ceil(waitingMs / 1000),
    disabled: busy || waiting,
    biometricReady,
    onDigit,
    onDelete,
    tryBiometric,
  };
}
