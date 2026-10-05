import { kvGet, kvSet } from '@/db/kv';
import {
  loadNotificationSettings,
  saveNotificationSettings,
  defaultNotificationSettings,
} from './settings';

jest.mock('@/db/kv');

describe('notification settings', () => {
  const mockDb = {} as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadNotificationSettings', () => {
    it('should load default settings when no values stored', async () => {
      (kvGet as jest.Mock).mockResolvedValue(undefined);

      const result = await loadNotificationSettings(mockDb);

      expect(result).toEqual(defaultNotificationSettings);
    });

    it('should load hideContent as true when stored as "1"', async () => {
      (kvGet as jest.Mock).mockImplementation((db, key) => {
        if (key === 'notif.hide') return Promise.resolve('1');
        return Promise.resolve(undefined);
      });

      const result = await loadNotificationSettings(mockDb);

      expect(result.hideContent).toBe(true);
      expect(result.anniversaryEnabled).toBe(true);
    });

    it('should load hideContent as false when not stored', async () => {
      (kvGet as jest.Mock).mockResolvedValue(undefined);

      const result = await loadNotificationSettings(mockDb);

      expect(result.hideContent).toBe(false);
    });

    it('should load anniversaryEnabled as false when stored as "0"', async () => {
      (kvGet as jest.Mock).mockImplementation((db, key) => {
        if (key === 'notif.anniversary') return Promise.resolve('0');
        return Promise.resolve(undefined);
      });

      const result = await loadNotificationSettings(mockDb);

      expect(result.anniversaryEnabled).toBe(false);
    });
  });

  describe('saveNotificationSettings', () => {
    it('should save hideContent as "1" when true', async () => {
      await saveNotificationSettings(mockDb, { hideContent: true });

      expect(kvSet).toHaveBeenCalledWith(mockDb, 'notif.hide', '1');
    });

    it('should save hideContent as "0" when false', async () => {
      await saveNotificationSettings(mockDb, { hideContent: false });

      expect(kvSet).toHaveBeenCalledWith(mockDb, 'notif.hide', '0');
    });

    it('should save anniversaryEnabled as "1" when true', async () => {
      await saveNotificationSettings(mockDb, { anniversaryEnabled: true });

      expect(kvSet).toHaveBeenCalledWith(mockDb, 'notif.anniversary', '1');
    });

    it('should save anniversaryEnabled as "0" when false', async () => {
      await saveNotificationSettings(mockDb, { anniversaryEnabled: false });

      expect(kvSet).toHaveBeenCalledWith(mockDb, 'notif.anniversary', '0');
    });

    it('should only save modified fields', async () => {
      await saveNotificationSettings(mockDb, { hideContent: true });

      expect(kvSet).toHaveBeenCalledTimes(1);
      expect(kvSet).toHaveBeenCalledWith(mockDb, 'notif.hide', '1');
    });
  });
});
