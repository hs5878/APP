import { Link, Stack, useRouter, type Href } from 'expo-router';
import { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import type { TimelineRow } from '@/db/repos/cards';
import { formatCardDate } from '@/domain/timeline';
import { usePendingCandidateCount } from '@/features/photos/useCandidates';
import { CardPhoto } from '@/features/records/CardPhoto';
import { useCreateEmptyCard } from '@/features/records/useCardEdit';
import { useTimeline } from '@/features/records/useRecords';
import { todayYmd } from '@/features/space/today';

const THUMB = 72;

const CardRowView = memo(function CardRowView({
  card,
  fg,
  sub,
  onPress,
}: {
  card: TimelineRow;
  fg: string;
  sub: string;
  onPress(id: string): void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={() => onPress(card.id)} style={styles.row}>
      {card.coverId ? (
        <CardPhoto photoId={card.coverId} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.noPhoto]}>
          <Text style={{ color: sub }}>♡</Text>
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={[styles.date, { color: fg }]}>{formatCardDate(card.date)}</Text>
        <Text style={{ color: sub }} numberOfLines={1}>
          {card.summary || '요약 없음'}
        </Text>
        <Text style={[styles.count, { color: sub }]}>사진 {card.photoCount}장</Text>
      </View>
    </Pressable>
  );
});

export default function Screen() {
  const router = useRouter();
  const pending = usePendingCandidateCount();
  const sections = useTimeline();
  const createEmpty = useCreateEmptyCard();
  const dark = useColorScheme() === 'dark';
  const bg = dark ? '#000' : '#fff';
  const fg = dark ? '#fff' : '#111';
  const sub = dark ? '#aaa' : '#666';

  if (sections === null) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  // 타입 라우트 선언은 개발 서버가 새 화면 파일을 본 뒤에 갱신되므로 문자열로 넘긴다.
  const openCard = (id: string) => router.push(`/records/${id}` as Href);

  const newCard = async () => {
    const id = await createEmpty(todayYmd());
    if (id) router.push(`/records/${id}/edit` as Href);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={newCard}>
              <Text style={styles.add}>카드 만들기</Text>
            </Pressable>
          ),
        }}
      />
      <SectionList
        style={{ backgroundColor: bg }}
        sections={sections}
        keyExtractor={(c) => c.id}
        stickySectionHeadersEnabled
        initialNumToRender={10}
        windowSize={7}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        contentContainerStyle={sections.length === 0 ? styles.emptyContent : undefined}
        ListHeaderComponent={
          pending > 0 ? (
            <Link href="/records/candidates" style={styles.link}>
              데이트 후보 {pending}개 · 확인하기
            </Link>
          ) : null
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: sub }]}>
            아직 기록한 데이트가 없어요.{'\n'}사진에서 찾은 후보를 확인해 보세요.
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.month, { color: fg, backgroundColor: bg }]}>{section.title}</Text>
        )}
        renderItem={({ item }) => <CardRowView card={item} fg={fg} sub={sub} onPress={openCard} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  add: { color: '#e0457b', fontSize: 16, fontWeight: '700' },
  link: { fontSize: 16, fontWeight: '700', color: '#e0457b', padding: 16 },
  month: { fontSize: 18, fontWeight: '800', paddingHorizontal: 16, paddingVertical: 10 },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 10, backgroundColor: '#8883' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, justifyContent: 'center', gap: 2 },
  date: { fontSize: 16, fontWeight: '700' },
  count: { fontSize: 12 },
  emptyContent: { flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 80, lineHeight: 22 },
});
