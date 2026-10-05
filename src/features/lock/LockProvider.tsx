import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { shouldLockOnResume } from '@/domain/lockState';
import { boot } from '@/features/boot';
import { defaultLockSettings, resolveLockSettings, type LockSettings } from './settings';

interface LockContextValue {
  /** 시작 때 설정을 읽는 중이면 false. 이때는 내용을 그리지 않는다. */
  ready: boolean;
  locked: boolean;
  /** 앱 전환기·백그라운드에서 내용을 가려야 하는가. */
  covered: boolean;
  settings: LockSettings;
  unlock(): void;
}

const LockContext = createContext<LockContextValue | null>(null);

export function useLock(): LockContextValue {
  const value = useContext(LockContext);
  if (!value) throw new Error('LockProvider 안에서만 쓸 수 있습니다.');
  return value;
}

export function LockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false);
  const [settings, setSettings] = useState(defaultLockSettings);
  const settingsRef = useRef(defaultLockSettings);
  const leftAt = useRef<number | null>(null);
  // 복귀 판정은 비동기라서, 그 사이 다시 백그라운드로 가면 이전 판정을 버린다.
  const seq = useRef(0);

  const apply = useCallback((next: LockSettings) => {
    settingsRef.current = next;
    setSettings(next);
  }, []);

  // 시작: 새 설치 정리(T04) 뒤 설정을 읽고, 잠금이 켜져 있으면 잠근 채로 시작한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // boot 실패(마이그레이션 오류 등)여도 설정 읽기는 PIN 기준으로 닫는 쪽으로 처리된다.
      await boot().catch(() => undefined);
      const next = await resolveLockSettings();
      if (cancelled) return;
      apply(next);
      setLocked(next.enabled);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      const id = ++seq.current;
      if (state === 'background') {
        leftAt.current ??= Date.now();
        setCovered(true);
      } else if (state === 'inactive') {
        // iOS 앱 전환기·알림 센터. 시각은 background에서만 잰다(시스템 창이 떠도 잠기지 않게).
        setCovered(true);
      } else {
        const left = leftAt.current;
        leftAt.current = null;
        (async () => {
          // 가림은 판정이 끝날 때까지 유지한다. 설정은 그 사이 바뀌었을 수 있어 다시 읽는다.
          if (left !== null) {
            const current = await resolveLockSettings().catch(() => settingsRef.current);
            if (id !== seq.current) return;
            apply(current);
            if (shouldLockOnResume({ ...current, leftAt: left, now: Date.now() })) setLocked(true);
          }
          setCovered(false);
        })();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [apply]);

  const unlock = useCallback(() => setLocked(false), []);

  const value = useMemo(
    () => ({ ready, locked, covered, settings, unlock }),
    [ready, locked, covered, settings, unlock],
  );
  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}
