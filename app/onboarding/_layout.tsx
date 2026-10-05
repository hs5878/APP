import { Stack } from 'expo-router';

// 로그인 단계는 T20에서 index(만 14세 확인) 앞에 끼운다.
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
