import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Screen name="index" options={{ title: '기념일' }} />
      <Stack.Screen name="edit" options={{ title: '기념일' }} />
    </Stack>
  );
}
