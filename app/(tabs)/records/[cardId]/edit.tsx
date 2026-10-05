import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { isValidYmd } from '@/domain/dates';
import { formatCardDate } from '@/domain/timeline';
import { CardPhoto } from '@/features/records/CardPhoto';
import { useCardEdit } from '@/features/records/useCardEdit';

const COLUMNS = 3;
const GAP = 4;
const PAD = 16;
const ACCENT = '#e0457b';

export default function CardEditScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const router = useRouter();
  const edit = useCardEdit(cardId);
  const { state, busy } = edit;
  const [selected, setSelected] = useState<string[]>([]);
  const [dateDraft, setDateDraft] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const { width } = useWindowDimensions();
  const dark = useColorScheme() === 'dark';
  const bg = dark ? '#000' : '#fff';
  const fg = dark ? '#fff' : '#111';
  const sub = dark ? '#aaa' : '#666';
  const line = dark ? '#444' : '#ccc';

  if (state === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (state === null) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Text style={{ color: sub }}>이 기록을 찾을 수 없어요.</Text>
      </View>
    );
  }

  const { card, photos, others } = state;
  const cell = Math.floor((width - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const date = dateDraft ?? card.date;
  const dateValid = isValidYmd(date);
  const dateChanged = dateValid && date !== card.date;
  const onlyOne = selected.length === 1 ? selected[0]! : null;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const saveDate = async () => {
    await edit.setDate(date);
    setDateDraft(null);
  };

  const addPhotos = async () => {
    const r = await edit.addFromGallery();
    if (r && !r.ok) Alert.alert('사진을 더하지 못했어요', '고른 사진을 읽을 수 없었어요.');
    else if (r?.ok && r.failed > 0) Alert.alert(`${r.failed}장은 더하지 못했어요`);
  };

  const confirmRemove = () =>
    Alert.alert(
      `사진 ${selected.length}장을 이 카드에서 뺄까요?`,
      '갤러리의 사진은 지워지지 않아요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '빼기',
          style: 'destructive',
          onPress: async () => {
            await edit.remove(selected);
            setSelected([]);
          },
        },
      ],
    );

  const moveTo = async (toCardId: string) => {
    setMoving(false);
    await edit.move(selected, toCardId);
    setSelected([]);
  };

  const confirmDeleteCard = () =>
    Alert.alert(
      '이 카드를 지울까요?',
      '카드와 안의 사진 기록이 지워져요. 갤러리의 사진은 그대로예요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '지우기',
          style: 'destructive',
          onPress: async () => {
            const r = await edit.removeCard();
            if (r?.ok) router.dismissTo('/records' as Href);
          },
        },
      ],
    );

  return (
    <ScrollView
      style={{ backgroundColor: bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: '카드 편집' }} />

      <View style={styles.section}>
        <Text style={[styles.heading, { color: fg }]}>날짜</Text>
        <View style={styles.dateRow}>
          <TextInput
            value={date}
            onChangeText={setDateDraft}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={sub}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            maxLength={10}
            accessibilityLabel="카드 날짜"
            style={[styles.input, { color: fg, borderColor: dateValid ? line : '#d33' }]}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!dateChanged || busy}
            onPress={saveDate}
            style={[styles.button, (!dateChanged || busy) && styles.disabled]}
          >
            <Text style={styles.buttonText}>날짜 바꾸기</Text>
          </Pressable>
        </View>
        <Text style={{ color: dateValid ? sub : '#d33', fontSize: 12 }}>
          {dateValid ? formatCardDate(date) : '2026-09-20처럼 입력해 주세요.'}
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.headingRow}>
          <Text style={[styles.heading, { color: fg }]}>사진 {photos.length}장</Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={addPhotos}>
            <Text style={styles.link}>사진 더하기</Text>
          </Pressable>
        </View>

        {photos.length === 0 ? (
          <Text style={{ color: sub }}>이 카드에는 사진이 없어요.</Text>
        ) : (
          <>
            <Text style={{ color: sub, fontSize: 12 }}>
              사진을 눌러 고른 뒤 표지로 정하거나 빼거나 다른 카드로 옮길 수 있어요.
            </Text>
            <View style={styles.grid}>
              {photos.map((p, i) => {
                const on = selected.includes(p.id);
                const isCover = (card.coverPhotoId ?? photos[0]?.id) === p.id;
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`사진 ${i + 1}${isCover ? ' (표지)' : ''}`}
                    onPress={() => toggle(p.id)}
                  >
                    <CardPhoto
                      photoId={p.id}
                      fullUri={p.localPath}
                      style={[
                        { width: cell, height: cell, backgroundColor: '#8883' },
                        on && styles.selectedPhoto,
                      ]}
                    />
                    {isCover ? <Text style={styles.coverBadge}>표지</Text> : null}
                    {on ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            {selected.length > 0 ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!onlyOne || busy}
                  onPress={() => onlyOne && edit.setCover(onlyOne)}
                  style={[styles.button, (!onlyOne || busy) && styles.disabled]}
                >
                  <Text style={styles.buttonText}>표지로</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={others.length === 0 || busy}
                  onPress={() => setMoving(true)}
                  style={[styles.button, (others.length === 0 || busy) && styles.disabled]}
                >
                  <Text style={styles.buttonText}>다른 카드로</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={confirmRemove}
                  style={[styles.button, styles.danger, busy && styles.disabled]}
                >
                  <Text style={styles.buttonText}>빼기 ({selected.length})</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={confirmDeleteCard}
        style={styles.deleteCard}
      >
        <Text style={styles.deleteCardText}>카드 지우기</Text>
      </Pressable>

      <Modal visible={moving} animationType="slide" onRequestClose={() => setMoving(false)}>
        <View style={[styles.modal, { backgroundColor: bg }]}>
          <Text style={[styles.heading, { color: fg }]}>
            사진 {selected.length}장을 어느 카드로 옮길까요?
          </Text>
          <ScrollView>
            {others.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => moveTo(c.id)}
                style={[styles.pick, { borderColor: line }]}
              >
                <Text style={{ color: fg, fontWeight: '700' }}>{formatCardDate(c.date)}</Text>
                <Text style={{ color: sub }} numberOfLines={1}>
                  {c.summary || '요약 없음'} · 사진 {c.photoCount}장
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={() => setMoving(false)}>
            <Text style={[styles.link, styles.cancel]}>취소</Text>
          </Pressable>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: PAD, gap: 28 },
  section: { gap: 10 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: 15, fontWeight: '700' },
  link: { color: ACCENT, fontSize: 15, fontWeight: '700' },
  dateRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  danger: { backgroundColor: '#c33' },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  selectedPhoto: { opacity: 0.55, borderWidth: 3, borderColor: ACCENT },
  coverBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    backgroundColor: '#000a',
    color: '#fff',
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  check: {
    position: 'absolute',
    right: 6,
    top: 4,
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  deleteCard: { alignItems: 'center', padding: 14 },
  deleteCardText: { color: '#d33', fontWeight: '700' },
  modal: { flex: 1, padding: PAD, paddingTop: 56, gap: 16 },
  pick: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  cancel: { textAlign: 'center', padding: 12 },
});
