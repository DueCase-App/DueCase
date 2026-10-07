import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}): React.JSX.Element {
  const blocked = loading || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondary,
        blocked && styles.disabled,
        pressed && !blocked && styles.pressed,
      ]}
    >
      {loading ? <ActivityIndicator /> : (
        <Text style={[styles.text, variant === 'secondary' && styles.secondaryText]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: '#1769E0',
  },
  secondary: { backgroundColor: '#EAF4FF', borderWidth: 1, borderColor: '#D9E7F4' },
  text: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  secondaryText: { color: '#1769E0' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
