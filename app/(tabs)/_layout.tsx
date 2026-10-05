import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="records" options={{ title: '기록', headerShown: false }} />
      <Tabs.Screen name="anniversaries" options={{ title: '기념일', headerShown: false }} />
      <Tabs.Screen name="settings" options={{ title: '설정', headerShown: false }} />
    </Tabs>
  );
}
