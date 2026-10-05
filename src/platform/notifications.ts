import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { PlannedNotification } from '@/domain/notificationPlan';

const ANDROID_CHANNEL = 'anniversary';

/** 앱이 열려 있을 때도 알림을 보여 준다. 앱 시작 때 한 번 부른다. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** 권한이 있으면 true. 아직 묻지 않았고 물을 수 있으면 요청한다. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** 예약된 알림을 모두 취소하고 계획대로 다시 건다. */
export async function replaceScheduledNotifications(plan: readonly PlannedNotification[]) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (plan.length === 0) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: '기념일',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  for (const n of plan) {
    const [year, month, day] = n.date.split('-').map(Number) as [number, number, number];
    await Notifications.scheduleNotificationAsync({
      identifier: n.identifier,
      content: { title: '연애기록', body: n.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(year, month - 1, day, n.hour, n.minute),
        channelId: ANDROID_CHANNEL,
      },
    });
  }
}
