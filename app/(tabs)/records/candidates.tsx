import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  useAssetPreviewUris,
  useCandidates,
  type CandidateItem,
} from '@/features/photos/useCandidates';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;

function Thumbs({ assetIds }: { assetIds: string[] }) {
  const uris = useAssetPreviewUris(assetIds);
  if (uris.length === 0) return null;
  return (
    <View style={styles.thumbs}>
      {uris.map((uri) => (
        <Image key={uri} source={{ uri }} style={styles.thumb} />
      ))}
    </View>
  );
}

export default function CandidatesScreen() {
  const { items, confirm, skip } = useCandidates();
  const [busyId, setBusyId] = useState<string | null>(null);
  const dark = useColorScheme() === 'dark';
  const fg = dark ? '#fff' : '#111';
  const sub = dark ? '#aaa' : '#666';

  async function run(id: string, task: () => Promise<void>) {
    if (busyId) return;
    setBusyId(id);
    try {
      await task();
    } finally {
      setBusyId(null);
    }
  }

  const record = (c: CandidateItem, mode: 'new' | 'append') =>
    run(c.id, async () => {
      try {
        const res = await confirm(c.id, mode);
        if (!res.ok) {
          Alert.alert(
            '기록하지 못했어요',
            res.reason === 'no_photos' ? '사진을 읽을 수 없었어요.' : '이미 처리된 후보예요.',
          );
        } else if (res.failed > 0) {
          Alert.alert('일부 사진은 빠졌어요', `${res.failed}장은 읽을 수 없어 기록하지 않았어요.`);
        }
      } catch {
        Alert.alert('기록하지 못했어요', '잠시 뒤에 다시 시도해 주세요.');
      }
    });

  if (items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: dark ? '#000' : '#fff' }}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(c) => c.id}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: sub }]}>새로 기록할 데이트 후보가 없어요</Text>
      }
      renderItem={({ item: c }) => {
        const busy = busyId === c.id;
        return (
          <View style={[styles.card, { backgroundColor: dark ? '#1a1a1a' : '#f5f5f5' }]}>
            <Text style={[styles.title, { color: fg }]}>{c.date}</Text>
            <Text style={[styles.sub, { color: sub }]}>
              {hhmm(c.startAt)}–{hhmm(c.endAt)} · 사진 {c.assets.length}장
            </Text>
            <Thumbs assetIds={c.assets} />
            {c.targetCardId ? (
              <Text style={[styles.ask, { color: fg }]}>
                같은 시간에 기록한 카드가 있어요. 이 카드에 추가할까요?
              </Text>
            ) : null}
            {busy ? (
              <ActivityIndicator style={styles.busy} />
            ) : (
              <View style={styles.actions}>
                {c.targetCardId ? (
                  <>
                    <Button label="이 카드에 추가" primary onPress={() => record(c, 'append')} />
                    <Button label="새 카드로 기록" onPress={() => record(c, 'new')} />
                  </>
                ) : (
                  <Button label="기록하기" primary onPress={() => record(c, 'new')} />
                )}
                <Button label="건너뛰기" onPress={() => run(c.id, () => skip(c.id))} />
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

function Button({
  label,
  primary,
  onPress,
}: {
  label: string;
  primary?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.btn, primary ? styles.btnPrimary : styles.btnPlain]}
    >
      <Text style={primary ? styles.btnPrimaryText : styles.btnPlainText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 12 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 15 },
  card: { borderRadius: 14, padding: 16, gap: 6 },
  title: { fontSize: 18, fontWeight: '700' },
  sub: { fontSize: 14 },
  thumbs: { flexDirection: 'row', gap: 6, marginTop: 6 },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  ask: { fontSize: 14, marginTop: 8 },
  busy: { marginTop: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  btnPrimary: { backgroundColor: '#e0457b' },
  btnPlain: { backgroundColor: '#8883' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnPlainText: { color: '#888', fontWeight: '600' },
});
