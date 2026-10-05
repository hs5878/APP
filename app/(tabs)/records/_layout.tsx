import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Screen name="index" options={{ title: '기록' }} />
      <Stack.Screen name="candidates" options={{ title: '데이트 후보' }} />
      <Stack.Screen name="[cardId]/index" options={{ title: '기록' }} />
    </Stack>
  );
}
