import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useSpace } from '@/features/space/SpaceProvider';

export default function NotifHideScreen() {
  const { startedOn } = useLocalSearchParams<{ startedOn: string }>();
  const { completeOnboarding } = useSpace();
  const dark = useColorScheme() === 'dark';
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // 완료하면 공간이 생겨 루트 가드가 홈으로 보낸다. 연결 없이 1인으로 시작하므로 "나중에 연결"이 된다.
  const finish = async (hideNotifications: boolean) => {
    if (busy || !startedOn) return;
    setBusy(true);
    setFailed(false);
    try {
      await completeOnboarding({ startedOn, hideNotifications });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: dark ? '#000' : '#fff' }]}>
      <Text style={[styles.title, { color: dark ? '#fff' : '#111' }]}>알림 내용을 숨길까요?</Text>
      <Text style={[styles.body, { color: dark ? '#aaa' : '#666' }]}>
        숨기면 모든 알림이 &quot;새 알림이 있어요&quot;로만 보여요. 설정에서 언제든 바꿀 수 있어요.
      </Text>
      {failed ? <Text style={styles.error}>저장하지 못했어요. 다시 시도해 주세요.</Text> : null}
      <View style={styles.footer}>
        <PrimaryButton label="숨길래요" disabled={busy} onPress={() => finish(true)} />
        <PrimaryButton
          label="그대로 볼래요"
          secondary
          disabled={busy}
          onPress={() => finish(false)}
        />
        <Text style={[styles.later, { color: dark ? '#888' : '#777' }]}>
          상대와의 연결은 나중에 할 수 있어요. 지금은 혼자 기록을 시작해요.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, paddingTop: 96 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { marginTop: 8, fontSize: 15, lineHeight: 22 },
  error: { color: '#d33', marginTop: 16 },
  footer: { marginTop: 'auto', marginBottom: 24, gap: 12 },
  later: { textAlign: 'center', fontSize: 13, marginTop: 4 },
});
