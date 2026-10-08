import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AlertButton,
  type AlertOptions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cardShadow, ui } from '../theme/ui';

type AlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

type AlertTone = 'info' | 'success' | 'warning' | 'danger';

let sequence = 0;
let dispatcher: ((request: AlertRequest) => void) | null = null;
const pendingBeforeMount: AlertRequest[] = [];

function createRequest(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
): AlertRequest {
  return {
    id: ++sequence,
    title,
    message,
    buttons: buttons?.length ? buttons : [{ text: 'OK' }],
    options,
  };
}

function emit(request: AlertRequest): void {
  if (dispatcher) dispatcher(request);
  else pendingBeforeMount.push(request);
}

function toneFor(title: string): AlertTone {
  const value = title.toLocaleLowerCase('it-IT');
  if (/approvat|confermat|accettat|salvat|completat|riuscit|inviat/.test(value)) return 'success';
  if (/erro|rifiutat|non riusc|contestat|eliminat|annullat/.test(value)) return 'danger';
  if (/attenzione|conferma|revoca|cancell|scaden/.test(value)) return 'warning';
  return 'info';
}

function toneIcon(tone: AlertTone): keyof typeof Ionicons.glyphMap {
  if (tone === 'success') return 'checkmark-circle-outline';
  if (tone === 'warning') return 'alert-circle-outline';
  if (tone === 'danger') return 'close-circle-outline';
  return 'information-circle-outline';
}

export function BrandedAlertHost(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<AlertRequest | null>(null);
  const queue = useRef<AlertRequest[]>([]);

  const enqueue = useCallback((request: AlertRequest) => {
    setCurrent((visible) => {
      if (!visible) return request;
      queue.current.push(request);
      return visible;
    });
  }, []);

  useEffect(() => {
    const nativeAlert = Alert.alert;
    const brandedAlert: typeof Alert.alert = (title, message, buttons, options) => {
      emit(createRequest(title, message, buttons, options));
    };

    dispatcher = enqueue;
    while (pendingBeforeMount.length) {
      const request = pendingBeforeMount.shift();
      if (request) enqueue(request);
    }

    (Alert as unknown as { alert: typeof Alert.alert }).alert = brandedAlert;

    return () => {
      if ((Alert as unknown as { alert: typeof Alert.alert }).alert === brandedAlert) {
        (Alert as unknown as { alert: typeof Alert.alert }).alert = nativeAlert;
      }
      if (dispatcher === enqueue) dispatcher = null;
    };
  }, [enqueue]);

  const tone = useMemo(() => toneFor(current?.title ?? ''), [current?.title]);

  const advance = useCallback(() => {
    setCurrent(queue.current.shift() ?? null);
  }, []);

  const pressButton = useCallback((button: AlertButton) => {
    const callback = button.onPress;
    advance();
    callback?.();
  }, [advance]);

  const dismiss = useCallback(() => {
    if (!current || current.options?.cancelable === false) return;
    const callback = current.options?.onDismiss;
    advance();
    callback?.();
  }, [advance, current]);

  const buttons = current?.buttons ?? [];
  const verticalButtons = buttons.length > 2;

  return (
    <Modal
      visible={Boolean(current)}
      transparent
      animationType="fade"
      statusBarTranslucent={false}
      navigationBarTranslucent={false}
      onRequestClose={dismiss}
    >
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable
          accessibilityRole="alert"
          style={[styles.card, { marginTop: Math.max(18, insets.top), marginBottom: Math.max(18, insets.bottom) }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.accentRow}><View style={styles.blueAccent} /><View style={styles.orangeAccent} /></View>
          <View style={styles.body}>
            <View style={[
              styles.iconWrap,
              tone === 'success' ? styles.iconSuccess : tone === 'warning' ? styles.iconWarning : tone === 'danger' ? styles.iconDanger : styles.iconInfo,
            ]}>
              <Ionicons
                name={toneIcon(tone)}
                size={25}
                color={tone === 'success' ? ui.colors.success : tone === 'warning' ? ui.colors.orangeDark : tone === 'danger' ? ui.colors.danger : ui.colors.primary}
              />
            </View>
            <Text style={styles.title}>{current?.title}</Text>
            {current?.message ? (
              <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.message}>{current.message}</Text>
              </ScrollView>
            ) : null}
            <View style={[styles.actions, verticalButtons && styles.actionsVertical]}>
              {buttons.map((button, index) => {
                const destructive = button.style === 'destructive';
                const cancel = button.style === 'cancel';
                const primary = !cancel && !destructive && (buttons.length === 1 || index === buttons.length - 1);
                return (
                  <Pressable
                    key={`${current?.id ?? 0}-${index}-${button.text ?? 'OK'}`}
                    accessibilityRole="button"
                    style={[
                      styles.button,
                      verticalButtons && styles.buttonVertical,
                      cancel && styles.buttonCancel,
                      destructive && styles.buttonDestructive,
                      primary && styles.buttonPrimary,
                    ]}
                    onPress={() => pressButton(button)}
                  >
                    <Text style={[
                      styles.buttonText,
                      cancel && styles.buttonCancelText,
                      destructive && styles.buttonDestructiveText,
                      primary && styles.buttonPrimaryText,
                    ]}>{button.text ?? 'OK'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(12,43,99,.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '78%',
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: '#FFFEFB',
    ...cardShadow,
  },
  accentRow: { height: 5, flexDirection: 'row' },
  blueAccent: { flex: 1, backgroundColor: ui.colors.primary },
  orangeAccent: { flex: 1, backgroundColor: ui.colors.orange },
  body: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 19, alignItems: 'center' },
  iconWrap: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  iconInfo: { backgroundColor: ui.colors.primarySoft },
  iconSuccess: { backgroundColor: '#E7F7F0' },
  iconWarning: { backgroundColor: ui.colors.orangeSoft },
  iconDanger: { backgroundColor: '#FFF0F0' },
  title: { color: ui.colors.primaryDark, fontSize: 22, lineHeight: 28, fontWeight: '900', textAlign: 'center' },
  messageScroll: { width: '100%', maxHeight: 220, marginTop: 10 },
  messageContent: { paddingHorizontal: 2 },
  message: { color: ui.colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  actions: { width: '100%', marginTop: 20, flexDirection: 'row', gap: 10 },
  actionsVertical: { flexDirection: 'column' },
  button: { flex: 1, minHeight: 48, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  buttonVertical: { flex: 0, width: '100%' },
  buttonCancel: { backgroundColor: '#FFF', borderColor: ui.colors.border },
  buttonDestructive: { backgroundColor: '#FFF4F4', borderColor: '#FFD0D0' },
  buttonPrimary: { backgroundColor: ui.colors.primary, borderColor: ui.colors.primary },
  buttonText: { color: ui.colors.primaryDark, fontSize: 14, fontWeight: '900' },
  buttonCancelText: { color: ui.colors.muted },
  buttonDestructiveText: { color: ui.colors.danger },
  buttonPrimaryText: { color: '#FFF' },
});
