import { kvGet, kvSet, type KvDb } from '@/db/kv';

export const NOTIF_HIDE_KEY = 'notif.hide';
export const NOTIF_ANNIVERSARY_KEY = 'notif.anniversary';

export interface NotificationSettings {
  hideContent: boolean;
  anniversaryEnabled: boolean;
}

export const defaultNotificationSettings: NotificationSettings = {
  hideContent: false,
  anniversaryEnabled: true,
};

export async function loadNotificationSettings(db: KvDb): Promise<NotificationSettings> {
  return {
    hideContent: (await kvGet(db, NOTIF_HIDE_KEY)) === '1',
    anniversaryEnabled: (await kvGet(db, NOTIF_ANNIVERSARY_KEY)) !== '0',
  };
}

export async function saveNotificationSettings(
  db: KvDb,
  patch: Partial<NotificationSettings>,
): Promise<void> {
  if (patch.hideContent !== undefined)
    await kvSet(db, NOTIF_HIDE_KEY, patch.hideContent ? '1' : '0');
  if (patch.anniversaryEnabled !== undefined)
    await kvSet(db, NOTIF_ANNIVERSARY_KEY, patch.anniversaryEnabled ? '1' : '0');
}
