import { StyleSheet, Text, useColorScheme, View } from 'react-native';

/** 앱 전환기·백그라운드 스냅샷에 내용이 보이지 않게 화면 전체를 덮는다. */
export function PrivacyCover() {
  const dark = useColorScheme() === 'dark';
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: dark ? '#000' : '#fff' }]}
      pointerEvents="auto"
    >
      <Text style={[styles.title, { color: dark ? '#fff' : '#111' }]}>연애기록</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
  title: { fontSize: 24, fontWeight: '700' },
});
