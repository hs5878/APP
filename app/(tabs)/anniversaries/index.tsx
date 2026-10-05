import { Stack, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import {
  buildAnniversaryList,
  formatDday,
  type AnniversaryListItem,
} from '@/domain/anniversaryList';
import { useAnniversaries } from '@/features/anniversaries/useAnniversaries';
import { useSpace } from '@/features/space/SpaceProvider';
import { todayYmd } from '@/features/space/today';

export default function AnniversariesScreen() {
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const { space } = useSpace();
  const { rows } = useAnniversaries();
  if (!space) return null;

  const fg = dark ? '#fff' : '#111';
  const sub = dark ? '#aaa' : '#666';
  const items = buildAnniversaryList(space.startedOn, rows, todayYmd());

  return (
    <View style={{ flex: 1, backgroundColor: dark ? '#000' : '#fff' }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="기념일 추가"
              onPress={() => router.push('/anniversaries/edit')}
              hitSlop={8}
            >
              <Text style={styles.add}>추가</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList<AnniversaryListItem>
        data={items}
        keyExtractor={(i) => (i.kind === 'auto' ? i.key : i.id)}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          const row = (
            <View
              style={[
                styles.row,
                { backgroundColor: dark ? '#1a1a1a' : '#f5f5f5' },
                item.kind === 'user' && item.past && styles.past,
              ]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.title, { color: fg }]}>{item.label}</Text>
                <Text style={[styles.date, { color: sub }]}>
                  {item.date}
                  {item.kind === 'user' && item.repeat === 'yearly' ? ' · 매년' : ''}
                  {item.kind === 'auto' ? ' · 자동' : ''}
                </Text>
              </View>
              <Text style={[styles.dday, { color: fg }]}>{formatDday(item.daysLeft)}</Text>
            </View>
          );
          if (item.kind === 'auto') return row;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/anniversaries/edit', params: { id: item.id } })
              }
            >
              {row}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  add: { color: '#e8576f', fontSize: 16, fontWeight: '600' },
  content: { padding: 20, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16 },
  past: { opacity: 0.5 },
  rowText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '600' },
  date: { fontSize: 13, marginTop: 2 },
  dday: { fontSize: 17, fontWeight: '700' },
});
