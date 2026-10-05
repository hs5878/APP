import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { DateField } from '@/components/DateField';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { AnniversaryRow } from '@/db/repos/anniversaries';
import {
  ANNIVERSARY_INPUT_ERROR_MESSAGE,
  NOTIFY_LABEL,
  TITLE_MAX_LENGTH,
  validateAnniversaryInput,
} from '@/domain/anniversaryList';
import { useAnniversaries, useAnniversaryActions } from '@/features/anniversaries/useAnniversaries';
import { todayYmd } from '@/features/space/today';

const NOTIFY_OPTIONS = ['none', 'd0', 'd1', 'd7'] as const;
const REPEAT_OPTIONS = [
  ['none', '반복 안 함'],
  ['yearly', '매년'],
] as const;

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  const dark = useColorScheme() === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? '#e8576f' : dark ? '#444' : '#ccc' },
        selected && styles.chipSelected,
      ]}
    >
      <Text style={{ color: selected ? '#fff' : dark ? '#ddd' : '#333' }}>{label}</Text>
    </Pressable>
  );
}

function Form({ existing }: { existing: AnniversaryRow | null }) {
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const actions = useAnniversaryActions();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(existing?.date ?? todayYmd());
  const [repeat, setRepeat] = useState<AnniversaryRow['repeat']>(existing?.repeat ?? 'yearly');
  const [notify, setNotify] = useState<AnniversaryRow['notify']>(existing?.notify ?? 'd1');
  const [busy, setBusy] = useState(false);

  const error = validateAnniversaryInput({ title, date });
  const dateError =
    date.length === 10 && error === 'date' ? ANNIVERSARY_INPUT_ERROR_MESSAGE.date : null;
  const fg = dark ? '#fff' : '#111';

  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const input = { title: title.trim(), date, repeat, notify };
      if (existing) await actions.update(existing.id, input);
      else await actions.add(input);
    });

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert('기념일을 삭제할까요?', existing.title, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => void run(() => actions.remove(existing.id)),
      },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: dark ? '#000' : '#fff' }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: existing ? '기념일 수정' : '기념일 추가' }} />
      <Text style={[styles.label, { color: fg }]}>제목</Text>
      <TextInput
        accessibilityLabel="제목"
        value={title}
        onChangeText={setTitle}
        maxLength={TITLE_MAX_LENGTH}
        placeholder="예: 첫 여행"
        placeholderTextColor="#999"
        style={[styles.input, { color: fg, borderColor: dark ? '#444' : '#ccc' }]}
      />
      <Text style={[styles.label, { color: fg }]}>날짜</Text>
      <DateField label="날짜" value={date} onChange={setDate} error={dateError} />
      <Text style={[styles.label, { color: fg }]}>반복</Text>
      <View style={styles.chips}>
        {REPEAT_OPTIONS.map(([v, l]) => (
          <Chip key={v} label={l} selected={repeat === v} onPress={() => setRepeat(v)} />
        ))}
      </View>
      <Text style={[styles.label, { color: fg }]}>알림</Text>
      <View style={styles.chips}>
        {NOTIFY_OPTIONS.map((v) => (
          <Chip
            key={v}
            label={NOTIFY_LABEL[v]}
            selected={notify === v}
            onPress={() => setNotify(v)}
          />
        ))}
      </View>
      <View style={styles.footer}>
        <PrimaryButton label="저장" disabled={error !== null || busy} onPress={save} />
        {existing ? (
          <PrimaryButton secondary label="삭제" disabled={busy} onPress={confirmDelete} />
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function AnniversaryEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { rows } = useAnniversaries();
  if (id === undefined) return <Form key="new" existing={null} />;
  const existing = rows.find((r) => r.id === id);
  // 목록을 읽기 전이거나 이미 삭제된 id면 폼을 띄우지 않는다.
  return existing ? <Form key={id} existing={existing} /> : null;
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 10 },
  label: { fontSize: 15, fontWeight: '600', marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: '#e8576f' },
  footer: { marginTop: 24, gap: 12 },
});
