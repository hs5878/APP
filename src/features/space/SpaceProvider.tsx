import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getDb } from '@/db/client';
import { createLocalSpace, getLocalSpace, updateStartedOn, type SpaceRow } from '@/db/repos/spaces';
import { getDevUser } from '@/features/devUser';
import { useLock } from '@/features/lock/LockProvider';
import { rescheduleNotifications } from '@/features/notifications/reschedule';
import { saveNotificationSettings } from '@/features/notifications/settings';

interface SpaceContextValue {
  /** 시작 때 공간을 읽는 중이면 false. */
  loaded: boolean;
  /** null이면 온보딩 전이다. */
  space: SpaceRow | null;
  /** 온보딩 마무리: 1인 공간을 만들고 알림 숨김 답을 저장한다. */
  completeOnboarding(input: { startedOn: string; hideNotifications: boolean }): Promise<void>;
  changeStartedOn(startedOn: string): Promise<void>;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

export function useSpace(): SpaceContextValue {
  const value = useContext(SpaceContext);
  if (!value) throw new Error('SpaceProvider 안에서만 쓸 수 있습니다.');
  return value;
}

/** LockProvider 안에서 쓴다. 새 설치 정리(boot)가 끝난 뒤에 DB를 읽는다. */
export function SpaceProvider({ children }: { children: ReactNode }) {
  const { ready } = useLock();
  const [loaded, setLoaded] = useState(false);
  const [space, setSpace] = useState<SpaceRow | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      // 읽기 실패를 온보딩으로 처리하면 기존 공간을 덮을 수 있어, 실패는 그대로 던진다.
      const found = await getLocalSpace(await getDb());
      if (cancelled) return;
      setSpace(found);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // 앱 실행, 온보딩 완료, 사귄 날 변경 때 알림을 다시 건다.
  const spaceId = space?.id;
  const startedOn = space?.startedOn;
  useEffect(() => {
    if (spaceId && startedOn) void rescheduleNotifications();
  }, [spaceId, startedOn]);

  const completeOnboarding = useCallback<SpaceContextValue['completeOnboarding']>(
    async ({ startedOn, hideNotifications }) => {
      const db = await getDb();
      const { userId, spaceId } = getDevUser(); // T20에서 실제 사용자로 교체
      await saveNotificationSettings(db, { hideContent: hideNotifications });
      setSpace(await createLocalSpace(db, { spaceId, userId, startedOn, now: Date.now() }));
    },
    [],
  );

  const changeStartedOn = useCallback(
    async (startedOn: string) => {
      if (!space) return;
      const db = await getDb();
      await updateStartedOn(db, space.id, startedOn, Date.now());
      setSpace(await getLocalSpace(db));
    },
    [space],
  );

  const value = useMemo(
    () => ({ loaded, space, completeOnboarding, changeStartedOn }),
    [loaded, space, completeOnboarding, changeStartedOn],
  );
  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}
