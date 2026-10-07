import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeModal } from './SafeModal';
import { ui } from '../theme/ui';

export type PickedAttachment = {
  uri: string;
  name: string;
  type: string;
  size?: number | null;
  file?: Blob;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onPicked: (attachment: PickedAttachment) => void;
  title?: string;
  allowPdf?: boolean;
  allowImages?: boolean;
};

function fallbackImageName(prefix: string, mimeType?: string | null): string {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/heic' || mimeType === 'image/heif' ? 'heic' : 'jpg';
  return `${prefix}-${Date.now()}.${extension}`;
}

export function AttachmentSourceSheet({
  visible,
  onClose,
  onPicked,
  title = 'Aggiungi allegato',
  allowPdf = true,
  allowImages = true,
}: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  async function finish(action: () => Promise<PickedAttachment | null>): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const attachment = await action();
      if (!attachment) return;
      onPicked(attachment);
      onClose();
    } catch (error) {
      Alert.alert('Allegato', error instanceof Error ? error.message : 'Impossibile selezionare l’allegato.');
    } finally {
      setBusy(false);
    }
  }

  async function fromCamera(): Promise<PickedAttachment | null> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Fotocamera', 'Consenti a DueCase di usare la fotocamera per scattare la foto.');
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.88 });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset) return null;
    return {
      uri: asset.uri,
      name: asset.fileName ?? fallbackImageName('foto', asset.mimeType),
      type: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? null,
      file: asset.file,
    };
  }

  async function fromPhotos(): Promise<PickedAttachment | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Foto', 'Consenti a DueCase di accedere alle foto che scegli di allegare.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: false });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset) return null;
    return {
      uri: asset.uri,
      name: asset.fileName ?? fallbackImageName('foto', asset.mimeType),
      type: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? null,
      file: asset.file,
    };
  }

  async function fromFiles(): Promise<PickedAttachment | null> {
    const types: string[] = [];
    if (allowPdf) types.push('application/pdf');
    if (allowImages) types.push('image/*');
    const result = await DocumentPicker.getDocumentAsync({
      type: types.length ? types : '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset) return null;
    return {
      uri: asset.uri,
      name: asset.name ?? 'allegato',
      type: asset.mimeType ?? 'application/octet-stream',
      size: asset.size ?? null,
      file: asset.file ?? undefined,
    };
  }

  return (
    <SafeModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>Scegli da dove vuoi prendere il contenuto.</Text>
            </View>
            <Pressable disabled={busy} accessibilityLabel="Chiudi" style={styles.close} onPress={onClose}>
              <Ionicons name="close" size={22} color={ui.colors.text} />
            </Pressable>
          </View>

          {busy ? <View style={styles.loading}><ActivityIndicator color={ui.colors.primary} /><Text style={styles.subtitle}>Apertura…</Text></View> : null}

          {Platform.OS !== 'web' && allowImages ? (
            <SourceButton icon="camera-outline" title="Scatta foto" subtitle="Apri la fotocamera" onPress={() => void finish(fromCamera)} disabled={busy} />
          ) : null}
          {allowImages ? (
            <SourceButton icon="images-outline" title="Scegli foto" subtitle="Seleziona dalla galleria" onPress={() => void finish(fromPhotos)} disabled={busy} />
          ) : null}
          <SourceButton icon="document-attach-outline" title="Scegli file" subtitle={allowPdf ? 'PDF o immagine dal dispositivo' : 'Scegli un file dal dispositivo'} onPress={() => void finish(fromFiles)} disabled={busy} />

          <Pressable disabled={busy} style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Annulla</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </SafeModal>
  );
}

function SourceButton({ icon, title, subtitle, onPress, disabled }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.option, pressed && !disabled && styles.optionPressed, disabled && styles.disabled]}>
      <View style={styles.optionIcon}><Ionicons name={icon} size={25} color={ui.colors.primary} /></View>
      <View style={styles.optionCopy}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.optionSubtitle}>{subtitle}</Text></View>
      <Ionicons name="chevron-forward" size={21} color={ui.colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,43,99,.34)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: ui.colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 10 },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: ui.colors.border, alignSelf: 'center', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  headerCopy: { flex: 1 },
  title: { color: ui.colors.primaryDark, fontSize: 22, fontWeight: '900' },
  subtitle: { color: ui.colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  close: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ui.colors.border },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 4 },
  option: { minHeight: 70, borderRadius: 17, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: '#FFF', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionPressed: { opacity: .78 },
  disabled: { opacity: .55 },
  optionIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1 },
  optionTitle: { color: ui.colors.primaryDark, fontSize: 16, fontWeight: '900' },
  optionSubtitle: { color: ui.colors.muted, fontSize: 12, marginTop: 2 },
  cancel: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.colors.input, marginTop: 2 },
  cancelText: { color: ui.colors.text, fontWeight: '900' },
});
