import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { formatCardDate } from '@/domain/timeline';
import { CardPhoto } from '@/features/records/CardPhoto';
import { stopLabel, stopTimeRange } from '@/features/records/format';
import { PhotoViewer } from '@/features/records/PhotoViewer';
import { useCardDetail } from '@/features/records/useRecords';

const COLUMNS = 3;
const GAP = 4;
const PAD = 16;

export default function CardDetailScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const router = useRouter();
  const detail = useCardDetail(cardId);
  const [viewer, setViewer] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const dark = useColorScheme() === 'dark';
  const bg = dark ? '#000' : '#fff';
  const fg = dark ? '#fff' : '#111';
  const sub = dark ? '#aaa' : '#666';

  if (detail === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (detail === null) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Text style={{ color: sub }}>이 기록을 찾을 수 없어요.</Text>
      </View>
    );
  }

  const { card, stops, photos } = detail;
  const cell = Math.floor((width - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: formatCardDate(card.date),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/records/${card.id}/edit` as Href)}
            >
              <Text style={styles.edit}>편집</Text>
            </Pressable>
          ),
        }}
      />

      <Text style={[styles.summary, { color: fg }]}>{card.summary || '요약 없음'}</Text>

      {stops.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.heading, { color: fg }]}>장소 흐름</Text>
          {stops.map((s, i) => (
            <View key={s.id} style={styles.stop}>
              <View style={styles.rail}>
                <View style={styles.dot} />
                {i < stops.length - 1 ? <View style={styles.line} /> : null}
              </View>
              <View style={styles.stopText}>
                <Text style={{ color: fg, fontWeight: '600' }}>{stopLabel(s)}</Text>
                <Text style={{ color: sub, fontSize: 12 }}>{stopTimeRange(s)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.heading, { color: fg }]}>사진 {photos.length}장</Text>
        {photos.length === 0 ? (
          <Text style={{ color: sub }}>이 카드에는 사진이 없어요.</Text>
        ) : (
          <View style={styles.grid}>
            {photos.map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="imagebutton"
                accessibilityLabel={`사진 ${i + 1}`}
                onPress={() => setViewer(i)}
              >
                <CardPhoto
                  photoId={p.id}
                  fullUri={p.localPath}
                  style={{ width: cell, height: cell, backgroundColor: '#8883' }}
                />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.heading, { color: fg }]}>한 줄 메모</Text>
        <View style={styles.memo}>
          <Text style={{ color: sub }}>한 줄 메모는 곧 쓸 수 있어요.</Text>
        </View>
      </View>

      <PhotoViewer photos={photos} index={viewer} onClose={() => setViewer(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: PAD, gap: 24 },
  edit: { color: '#e0457b', fontSize: 16, fontWeight: '700' },
  summary: { fontSize: 20, fontWeight: '800', lineHeight: 28 },
  section: { gap: 10 },
  heading: { fontSize: 15, fontWeight: '700' },
  stop: { flexDirection: 'row', gap: 12 },
  rail: { width: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e8576f', marginTop: 4 },
  line: { flex: 1, width: 2, backgroundColor: '#e8576f55', marginVertical: 2 },
  stopText: { flex: 1, paddingBottom: 14, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  memo: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8886',
    borderRadius: 10,
    padding: 14,
    borderStyle: 'dashed',
  },
});
