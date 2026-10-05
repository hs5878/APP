import { Stack } from 'expo-router';
import { PrivacyCover } from '@/components/PrivacyCover';
import { LockProvider, useLock } from '@/features/lock/LockProvider';

function RootStack() {
  const { ready, locked, covered } = useLock();
  // 설정을 읽기 전에는 내용을 그리지 않는다. 잠긴 동안은 잠금 화면만 있어 따로 가릴 내용이 없다.
  if (!ready) return <PrivacyCover />;
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!locked}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={locked}>
          <Stack.Screen name="lock" options={{ gestureEnabled: false }} />
        </Stack.Protected>
      </Stack>
      {covered && !locked && <PrivacyCover />}
    </>
  );
}

export default function RootLayout() {
  return (
    <LockProvider>
      <RootStack />
    </LockProvider>
  );
}
