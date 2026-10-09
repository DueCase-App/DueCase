import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ui } from '../theme/ui';

const BASE_URL = 'https://duecaseununicasquadra.com';

const links = [
  { label: 'Assistenza', url: `${BASE_URL}/assistenza.html` },
  { label: 'Privacy', url: `${BASE_URL}/privacy.html` },
  { label: 'Termini e condizioni', url: `${BASE_URL}/termini.html` },
  { label: 'Cookie Policy', url: `${BASE_URL}/cookie.html` },
] as const;

export function LegalLinks(): React.JSX.Element {
  return (
    <View style={styles.wrap} accessibilityLabel="Collegamenti legali DueCase">
      {links.map((item, index) => (
        <View key={item.label} style={styles.itemWrap}>
          {index > 0 ? <Text style={styles.separator}>·</Text> : null}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={item.label}
            onPress={() => void Linking.openURL(item.url)}
            hitSlop={8}
          >
            <Text style={styles.link}>{item.label}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export const legalUrls = {
  assistance: links[0].url,
  privacy: links[1].url,
  terms: links[2].url,
  cookies: links[3].url,
} as const;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 7,
    rowGap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  itemWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  separator: { color: ui.colors.muted, fontSize: 12 },
  link: {
    color: ui.colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
