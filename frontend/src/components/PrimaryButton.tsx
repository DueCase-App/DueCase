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
    backgroundColor: '#3730A3',
  },
  secondary: { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' },
  text: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  secondaryText: { color: '#3730A3' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
