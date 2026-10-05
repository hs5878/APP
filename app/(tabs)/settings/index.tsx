import { ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { useEffect, useState } from 'react';
import { useLock } from '@/features/lock/LockProvider';
import { saveLockSettings } from '@/features/lock/settings';
import { saveNotificationSettings, type NotificationSettings } from '@/features/notifications/settings';
import { getDb } from '@/db/client';
import { SettingSection } from '@/components/SettingSection';
import { ToggleSetting, ButtonSetting } from '@/components/SettingItem';

export default function SettingsScreen() {
  const dark = useColorScheme() === 'dark';
  const lock = useLock();
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    hideContent: false,
    anniversaryEnabled: true,
  });

  // Load notification settings on mount
  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const { loadNotificationSettings } = await import('@/features/notifications/settings');
        const loaded = await loadNotificationSettings(db);
        setNotifSettings(loaded);
      } catch (e) {
        console.error('Failed to load notification settings:', e);
      }
    })();
  }, []);

  const handleLockToggle = async (value: boolean) => {
    try {
      const db = await getDb();
      await saveLockSettings(db, { enabled: value });
    } catch (e) {
      console.error('Failed to save lock settings:', e);
    }
  };

  const handleNotifHideToggle = async (value: boolean) => {
    const next = { ...notifSettings, hideContent: value };
    setNotifSettings(next);
    try {
      const db = await getDb();
      await saveNotificationSettings(db, { hideContent: value });
    } catch (e) {
      console.error('Failed to save notification settings:', e);
    }
  };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: dark ? '#000' : '#f5f5f5' }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* 잠금 섹션 */}
      <SettingSection title="보안">
        <ToggleSetting
          label="앱 잠금"
          description="PIN으로 앱을 잠급니다"
          value={lock.settings.enabled}
          onValueChange={handleLockToggle}
          disabled={false}
        />
        <ButtonSetting
          label="PIN 설정"
          description={lock.settings.enabled ? '변경하려면 탭하세요' : '탭하여 PIN을 설정하세요'}
          buttonText="설정"
          onPress={() => {}}
          disabled={true}
        />
      </SettingSection>

      {/* 알림 섹션 */}
      <SettingSection title="알림">
        <ToggleSetting
          label="알림 내용 숨김"
          description="알림 문구가 '새 알림이 있어요'로 표시됩니다"
          value={notifSettings.hideContent}
          onValueChange={handleNotifHideToggle}
        />
        <ToggleSetting
          label="기념일 알림"
          description="기념일 당일 09:00에 알림을 받습니다"
          value={notifSettings.anniversaryEnabled}
          onValueChange={() => {}}
          disabled={true}
        />
      </SettingSection>

      {/* AI·장소 섹션 */}
      <SettingSection title="AI 및 장소">
        <ToggleSetting
          label="AI 초안 쓰기"
          description="준비 중입니다"
          value={false}
          onValueChange={() => {}}
          disabled={true}
        />
        <ToggleSetting
          label="장소 이름 찾기"
          description="준비 중입니다"
          value={false}
          onValueChange={() => {}}
          disabled={true}
        />
      </SettingSection>

      {/* 백업 섹션 */}
      <SettingSection title="백업">
        <ButtonSetting
          label="Google Drive 백업"
          description="준비 중입니다"
          buttonText="설정"
          onPress={() => {}}
          disabled={true}
        />
        <ButtonSetting
          label="백업 상태"
          description="준비 중입니다"
          buttonText="보기"
          onPress={() => {}}
          disabled={true}
        />
      </SettingSection>

      {/* 내보내기 섹션 */}
      <SettingSection title="내 데이터">
        <ButtonSetting
          label="내보내기"
          description="준비 중입니다"
          buttonText="내보내기"
          onPress={() => {}}
          disabled={true}
        />
        <ButtonSetting
          label="저장 공간"
          description="준비 중입니다"
          buttonText="정리"
          onPress={() => {}}
          disabled={true}
        />
      </SettingSection>

      {/* 연결 섹션 */}
      <SettingSection title="연결">
        <ButtonSetting
          label="사귄 날"
          description="준비 중입니다"
          buttonText="수정"
          onPress={() => {}}
          disabled={true}
        />
        <ButtonSetting
          label="내 별명"
          description="준비 중입니다"
          buttonText="수정"
          onPress={() => {}}
          disabled={true}
        />
        <ButtonSetting
          label="연결 해제"
          description="준비 중입니다"
          buttonText="해제"
          onPress={() => {}}
          disabled={true}
        />
      </SettingSection>

      {/* 동기화 및 기타 섹션 */}
      <SettingSection title="기타">
        <ButtonSetting
          label="동기화 상태"
          description="준비 중입니다"
          buttonText="보기"
          onPress={() => {}}
          disabled={true}
        />
        <ButtonSetting
          label="데이터 약속"
          description="준비 중입니다"
          buttonText="보기"
          onPress={() => {}}
          disabled={true}
        />
      </SettingSection>

      {/* 계정 섹션 */}
      <SettingSection title="계정">
        <ButtonSetting
          label="로그아웃"
          description="준비 중입니다"
          buttonText="로그아웃"
          onPress={() => {}}
          disabled={true}
        />
        <ButtonSetting
          label="계정 삭제"
          description="준비 중입니다"
          buttonText="삭제"
          onPress={() => {}}
          disabled={true}
        />
      </SettingSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
