import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export function LoadingState(): React.JSX.Element {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <Text style={styles.muted}>Caricamento…</Text>
    </View>
  );
}

export function ErrorState({ message }: { message: string }): React.JSX.Element {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Impossibile caricare i dati</Text>
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  muted: { color: '#64748B', textAlign: 'center' },
  errorTitle: { fontSize: 17, fontWeight: '700', color: '#991B1B' },
});
