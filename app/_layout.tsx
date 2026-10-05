import { Stack } from 'expo-router';
import { PrivacyCover } from '@/components/PrivacyCover';
import { LockProvider, useLock } from '@/features/lock/LockProvider';
import { SpaceProvider, useSpace } from '@/features/space/SpaceProvider';
import { configureNotificationHandler } from '@/platform/notifications';

configureNotificationHandler();

function RootStack() {
  const { ready, locked, covered } = useLock();
  const { loaded, space } = useSpace();
  // 설정과 공간을 읽기 전에는 내용을 그리지 않는다. 잠긴 동안은 잠금 화면만 있어 따로 가릴 내용이 없다.
  if (!ready || !loaded) return <PrivacyCover />;
  const onboarded = space !== null;
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!locked && onboarded}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!locked && !onboarded}>
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
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
      <SpaceProvider>
        <RootStack />
      </SpaceProvider>
    </LockProvider>
  );
}
