import { Pressable, StyleSheet, Text } from 'react-native';

interface Props {
  label: string;
  onPress(): void;
  disabled?: boolean;
  secondary?: boolean;
}

export function PrimaryButton({ label, onPress, disabled, secondary }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.root,
        secondary ? styles.secondary : styles.primary,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, secondary && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  primary: { backgroundColor: '#e8576f' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e8576f' },
  disabled: { opacity: 0.4 },
  label: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryLabel: { color: '#e8576f' },
});
