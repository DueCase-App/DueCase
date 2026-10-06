import { Ionicons } from '@expo/vector-icons';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { cardShadow, ui } from '../theme/ui';

export function ResponsivePage({
  title,
  subtitle,
  actionLabel,
  actionIcon = 'add',
  onAction,
  children,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
}>): React.JSX.Element {
  const { width } = useWindowDimensions();
  const compact = width < 700;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.content, compact && styles.contentCompact]}>
        <View style={[styles.header, compact && styles.headerCompact]}>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {actionLabel && onAction ? (
            <Pressable onPress={onAction} style={[styles.action, cardShadow]} accessibilityRole="button">
              <Ionicons name={actionIcon} size={20} color="#FFF" />
              <Text style={styles.actionText}>{actionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

export function EmptyCard({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }): React.JSX.Element {
  return (
    <View style={[styles.emptyCard, cardShadow]}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={28} color={ui.colors.primary} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function SectionCard({ children }: { children: ReactNode }): React.JSX.Element {
  return <View style={[styles.sectionCard, cardShadow]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  scrollContent: { flexGrow: 1, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 24, gap: 16 },
  contentCompact: { paddingHorizontal: 16, paddingTop: 16 },
  header: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  headerCompact: { alignItems: 'flex-start' },
  headerCopy: { flex: 1, gap: 4 },
  title: { color: ui.colors.primaryDark, fontSize: 30, fontWeight: '900', letterSpacing: -0.7 },
  titleCompact: { fontSize: 26 },
  subtitle: { color: ui.colors.muted, fontSize: 14, lineHeight: 20, maxWidth: 760 },
  action: { minHeight: 46, borderRadius: 13, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: ui.colors.primary },
  actionText: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  sectionCard: { backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, borderWidth: 1, borderColor: ui.colors.border, padding: 16 },
  emptyCard: { minHeight: 190, backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, borderWidth: 1, borderColor: ui.colors.border, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 18 },
  emptyBody: { color: ui.colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 460 },
});
