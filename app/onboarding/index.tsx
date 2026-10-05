import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';

export default function AgeConfirmScreen() {
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const [checked, setChecked] = useState(false);
  const fg = dark ? '#fff' : '#111';
  return (
    <View style={[styles.root, { backgroundColor: dark ? '#000' : '#fff' }]}>
      <Text style={[styles.title, { color: fg }]}>시작하기 전에</Text>
      <Text style={[styles.body, { color: dark ? '#aaa' : '#666' }]}>
        만 14세 미만은 이용할 수 없어요.
      </Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => setChecked((c) => !c)}
        style={styles.check}
      >
        <Text style={[styles.box, { color: fg }]}>{checked ? '☑' : '☐'}</Text>
        <Text style={[styles.checkLabel, { color: fg }]}>만 14세 이상입니다</Text>
      </Pressable>
      <View style={styles.footer}>
        <PrimaryButton
          label="다음"
          disabled={!checked}
          onPress={() => router.push('/onboarding/date')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, paddingTop: 96 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { marginTop: 8, fontSize: 15 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 40 },
  box: { fontSize: 28 },
  checkLabel: { fontSize: 18 },
  footer: { marginTop: 'auto', marginBottom: 24 },
});
