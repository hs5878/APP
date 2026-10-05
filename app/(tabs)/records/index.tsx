import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { usePendingCandidateCount } from '@/features/photos/useCandidates';

export default function Screen() {
  const pending = usePendingCandidateCount();
  return (
    <View style={styles.root}>
      {pending > 0 ? (
        <Link href="/records/candidates" style={styles.link}>
          데이트 후보 {pending}개 · 확인하기
        </Link>
      ) : null}
      <Text>기록</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  link: { fontSize: 16, fontWeight: '700', color: '#e0457b' },
});
