import { getDb } from '@/db/client';
import { listAnniversaries } from '@/db/repos/anniversaries';
import { getLocalSpace } from '@/db/repos/spaces';
import { planNotifications } from '@/domain/notificationPlan';
import { loadNotificationSettings } from '@/features/notifications/settings';
import { todayYmd } from '@/features/space/today';
import {
  ensureNotificationPermission,
  replaceScheduledNotifications,
} from '@/platform/notifications';

let chain: Promise<void> = Promise.resolve();

async function run(): Promise<void> {
  const db = await getDb();
  const space = await getLocalSpace(db);
  if (!space) return;
  const settings = await loadNotificationSettings(db);
  const rows = await listAnniversaries(db, space.id);
  const now = new Date();
  const plan = planNotifications({
    startedOn: space.startedOn,
    userAnniversaries: rows,
    today: todayYmd(now),
    minutesNow: now.getHours() * 60 + now.getMinutes(),
    anniversaryEnabled: settings.anniversaryEnabled,
    hideContent: settings.hideContent,
  });
  if (plan.length > 0 && !(await ensureNotificationPermission())) return;
  await replaceScheduledNotifications(plan);
}

/**
 * 로컬 알림을 전부 취소하고 앞으로 60일 치를 다시 건다. 항상 DB의 현재 값으로 계산한다.
 * 호출 지점: 앱 실행, 기념일·설정·사귄 날 변경. 동기화 완료(T21)와 포토북(T39)도 이 함수를 부른다.
 * 겹쳐 불려도 차례대로 실행되고 실패는 로그만 남긴다.
 */
export function rescheduleNotifications(): Promise<void> {
  chain = chain.then(run).catch((e) => {
    console.error('알림 예약 실패:', e);
  });
  return chain;
}
