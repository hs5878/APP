import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

interface Props {
  length: number;
  /** 지금까지 입력한 자릿수. */
  filled: number;
  disabled?: boolean;
  onDigit(digit: string): void;
  onDelete(): void;
  /** 0 왼쪽 빈 칸에 들어갈 버튼(생체인증 등). */
  leftSlot?: ReactNode;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

export function PinPad({ length, filled, disabled, onDigit, onDelete, leftSlot }: Props) {
  const dark = useColorScheme() === 'dark';
  const fg = dark ? '#fff' : '#111';
  const key = (label: string, onPress: () => void, a11y: string) => (
    <Pressable
      key={a11y}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        { backgroundColor: pressed ? (dark ? '#333' : '#e5e5ea') : 'transparent' },
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.keyText, { color: fg }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={styles.dots} accessibilityLabel={`${length}자리 중 ${filled}자리 입력`}>
        {Array.from({ length }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, { borderColor: fg }, i < filled && { backgroundColor: fg }]}
          />
        ))}
      </View>
      {ROWS.map((row) => (
        <View key={row[0]} style={styles.row}>
          {row.map((d) => key(d, () => onDigit(d), d))}
        </View>
      ))}
      <View style={styles.row}>
        <View style={styles.key}>{leftSlot}</View>
        {key('0', () => onDigit('0'), '0')}
        {key('⌫', onDelete, '지우기')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 16, marginBottom: 32 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  row: { flexDirection: 'row', gap: 20, marginBottom: 12 },
  key: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 28, fontWeight: '500' },
  disabled: { opacity: 0.4 },
});
