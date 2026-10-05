import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { DateField } from '@/components/DateField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { STARTED_ON_ERROR_MESSAGE, validateStartedOn } from '@/domain/startedOn';
import { useSpace } from '@/features/space/SpaceProvider';
import { todayYmd } from '@/features/space/today';

export default function StartedOnEditScreen() {
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const { space, changeStartedOn } = useSpace();
  const [value, setValue] = useState(space?.startedOn ?? '');
  const [busy, setBusy] = useState(false);
  const error = validateStartedOn(value, todayYmd());
  const shown = value.length === 10 && error ? STARTED_ON_ERROR_MESSAGE[error] : null;

  const save = async () => {
    if (error || busy) return;
    setBusy(true);
    try {
      await changeStartedOn(value);
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: dark ? '#000' : '#fff' }]}>
      <Stack.Screen options={{ title: '사귄 날' }} />
      <DateField value={value} onChange={setValue} error={shown} />
      <View style={styles.footer}>
        <PrimaryButton label="저장" disabled={error !== null || busy} onPress={save} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24 },
  footer: { marginTop: 24 },
});
