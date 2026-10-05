import { StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { formatYmdInput } from '@/domain/startedOn';

interface Props {
  value: string;
  onChange(value: string): void;
  error?: string | null;
  label?: string;
}

/** YYYY-MM-DD 입력칸. 숫자만 치면 하이픈을 넣어 준다. */
export function DateField({ value, onChange, error, label = '사귄 날' }: Props) {
  const dark = useColorScheme() === 'dark';
  return (
    <View>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(t) => onChange(formatYmdInput(t))}
        keyboardType="number-pad"
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#999"
        maxLength={10}
        style={[
          styles.input,
          { color: dark ? '#fff' : '#111', borderColor: error ? '#d33' : dark ? '#444' : '#ccc' },
        ]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 20, textAlign: 'center' },
  error: { color: '#d33', marginTop: 8, textAlign: 'center' },
});
