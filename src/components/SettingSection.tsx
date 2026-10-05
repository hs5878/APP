import { StyleSheet, Text, View, useColorScheme } from 'react-native';

interface SettingSectionProps {
  title?: string;
  children: React.ReactNode;
}

export function SettingSection({ title, children }: SettingSectionProps) {
  const dark = useColorScheme() === 'dark';
  const titleColor = dark ? '#999' : '#666';

  return (
    <View style={styles.root}>
      {title && <Text style={[styles.title, { color: titleColor }]}>{title}</Text>}
      <View
        style={[
          styles.container,
          { backgroundColor: dark ? '#1a1a1a' : '#fff', borderColor: dark ? '#333' : '#e0e0e0' },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginVertical: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 8,
    letterSpacing: 0.5,
  },
  container: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
});
