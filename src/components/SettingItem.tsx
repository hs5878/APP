import { Pressable, StyleSheet, Switch, Text, View, useColorScheme } from 'react-native';

interface SettingItemProps {
  label: string;
  description?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  disabled?: boolean;
}

export function SettingItem({
  label,
  description,
  onPress,
  rightElement,
  disabled = false,
}: SettingItemProps) {
  const dark = useColorScheme() === 'dark';
  const labelColor = dark ? '#fff' : '#111';
  const descColor = dark ? '#999' : '#666';
  const borderColor = dark ? '#333' : '#e0e0e0';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.root,
        {
          backgroundColor: dark ? (pressed ? '#1a1a1a' : '#000') : pressed ? '#f5f5f5' : '#fff',
          borderBottomColor: borderColor,
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
        {description && (
          <Text style={[styles.description, { color: descColor }]}>{description}</Text>
        )}
      </View>
      {rightElement}
    </Pressable>
  );
}

export interface ToggleSettingProps extends Omit<SettingItemProps, 'rightElement'> {
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function ToggleSetting({ value, onValueChange, onPress, ...rest }: ToggleSettingProps) {
  return (
    <SettingItem
      {...rest}
      onPress={() => {
        onPress?.();
        onValueChange(!value);
      }}
      rightElement={<Switch value={value} onValueChange={onValueChange} disabled={rest.disabled} />}
    />
  );
}

export interface ButtonSettingProps extends Omit<SettingItemProps, 'rightElement'> {
  buttonText: string;
}

export function ButtonSetting({ buttonText, ...rest }: ButtonSettingProps) {
  const dark = useColorScheme() === 'dark';
  const btnColor = dark ? '#4a9eff' : '#0066cc';

  return (
    <SettingItem
      {...rest}
      rightElement={<Text style={[styles.button, { color: btnColor }]}>{buttonText}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  description: {
    fontSize: 13,
    marginTop: 4,
  },
  button: {
    fontSize: 14,
    fontWeight: '600',
  },
});
