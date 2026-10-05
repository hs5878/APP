import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { DateField } from '@/components/DateField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { STARTED_ON_ERROR_MESSAGE, validateStartedOn } from '@/domain/startedOn';
import { todayYmd } from '@/features/space/today';

export default function StartedOnScreen() {
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const [value, setValue] = useState('');
  const error = validateStartedOn(value, todayYmd());
  // 다 입력하기 전에는 오류를 보이지 않는다.
  const shown = value.length === 10 && error ? STARTED_ON_ERROR_MESSAGE[error] : null;
  return (
    <View style={[styles.root, { backgroundColor: dark ? '#000' : '#fff' }]}>
      <Text style={[styles.title, { color: dark ? '#fff' : '#111' }]}>우리가 사귄 날은?</Text>
      <Text style={[styles.body, { color: dark ? '#aaa' : '#666' }]}>
        이 날이 1일이에요. 나중에 설정에서 바꿀 수 있어요.
      </Text>
      <View style={styles.field}>
        <DateField value={value} onChange={setValue} error={shown} />
      </View>
      <View style={styles.footer}>
        <PrimaryButton
          label="다음"
          disabled={error !== null}
          onPress={() =>
            router.push({ pathname: '/onboarding/notif', params: { startedOn: value } })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, paddingTop: 96 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { marginTop: 8, fontSize: 15 },
  field: { marginTop: 40 },
  footer: { marginTop: 'auto', marginBottom: 24 },
});
