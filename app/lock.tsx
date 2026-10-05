import { Pressable, StyleSheet, Text, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PinPad } from '@/components/PinPad';
import { PIN_LENGTH } from '@/features/lock/pin';
import { useUnlock } from '@/features/lock/useUnlock';

export default function LockScreen() {
  const dark = useColorScheme() === 'dark';
  const fg = dark ? '#fff' : '#111';
  const u = useUnlock();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: dark ? '#000' : '#fff' }]}>
      <Text style={[styles.title, { color: fg }]}>PIN을 입력해 주세요</Text>
      <Text
        style={[styles.message, { color: dark ? '#ff6b6b' : '#c0392b' }]}
        accessibilityLiveRegion="polite"
      >
        {u.waitingSec > 0
          ? `${u.message ?? ''} ${u.waitingSec}초 뒤에 다시 입력할 수 있어요.`.trim()
          : (u.message ?? ' ')}
      </Text>
      <PinPad
        length={PIN_LENGTH}
        filled={u.pinLength}
        disabled={u.disabled}
        onDigit={u.onDigit}
        onDelete={u.onDelete}
        leftSlot={
          u.biometricReady ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="생체인증으로 열기"
              onPress={u.tryBiometric}
            >
              <Text style={[styles.bio, { color: fg }]}>생체</Text>
            </Pressable>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  message: {
    fontSize: 14,
    minHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  bio: { fontSize: 16, fontWeight: '600' },
});
