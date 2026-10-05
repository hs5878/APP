import { ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { buildHomeSummary } from '@/domain/homeSummary';
import { useSpace } from '@/features/space/SpaceProvider';
import { todayYmd } from '@/features/space/today';

export default function HomeScreen() {
  const { space } = useSpace();
  const dark = useColorScheme() === 'dark';
  if (!space) return null;
  const fg = dark ? '#fff' : '#111';
  const sub = dark ? '#aaa' : '#666';
  const card = dark ? '#1a1a1a' : '#f5f5f5';
  const summary = buildHomeSummary(space.startedOn, todayYmd());
  const { next } = summary;

  return (
    <ScrollView
      style={{ backgroundColor: dark ? '#000' : '#fff' }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.hero}>
        <Text style={[styles.dday, { color: fg }]}>D+{summary.dayCount}</Text>
        <Text style={[styles.since, { color: sub }]}>{space.startedOn}부터</Text>
      </View>

      <View style={[styles.box, { backgroundColor: card }]}>
        <Text style={[styles.boxLabel, { color: sub }]}>다음 기념일</Text>
        <Text style={[styles.boxTitle, { color: fg }]}>
          {next.label} · {next.daysLeft === 0 ? 'D-DAY' : `D-${next.daysLeft}`}
        </Text>
        <Text style={[styles.boxSub, { color: sub }]}>{next.date}</Text>
      </View>

      {/* 후보 배지 자리(사진 후보 기능에서 연결) */}
      <View style={[styles.box, { backgroundColor: card }]}>
        <Text style={[styles.boxLabel, { color: sub }]}>새 기록 후보</Text>
        <Text style={[styles.boxSub, { color: sub }]}>아직 없어요</Text>
      </View>

      {/* 최근 카드 3개 자리(기록 기능에서 연결) */}
      <Text style={[styles.section, { color: fg }]}>최근 기록</Text>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.box, { backgroundColor: card }]}>
          <Text style={[styles.boxSub, { color: sub }]}>아직 기록이 없어요</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  hero: { alignItems: 'center', paddingVertical: 32 },
  dday: { fontSize: 56, fontWeight: '800' },
  since: { marginTop: 4, fontSize: 14 },
  box: { borderRadius: 14, padding: 16 },
  boxLabel: { fontSize: 13 },
  boxTitle: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  boxSub: { fontSize: 14, marginTop: 2 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 12 },
});
