import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal as NativeModal,
  Platform,
  ScrollView,
  View,
  type ModalProps,
} from 'react-native';
import { KeyboardViewport } from './KeyboardViewport';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SafeModalProps = Omit<ModalProps, 'onRequestClose'> & {
  onRequestClose?: () => void;
};

/**
 * Shared safe viewport for every dialog in DueCase.
 *
 * - Keeps dialogs inside the visible area when the keyboard opens.
 * - Adds a scrollable outer viewport, so long forms never overflow behind the keyboard.
 * - On Android the first Back press dismisses the keyboard instead of closing the form.
 */
export function SafeModal({ children, onRequestClose, ...props }: SafeModalProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const handleRequestClose = (): void => {
    if (keyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    onRequestClose?.();
  };

  return (
    <NativeModal
      {...props}
      onRequestClose={handleRequestClose}
      statusBarTranslucent={false}
      navigationBarTranslucent={false}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <KeyboardViewport>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View
              style={{
                flexGrow: 1,
                minHeight: 0,
                paddingTop: Math.max(insets.top, 12),
                paddingBottom: Math.max(insets.bottom, 16),
              }}
            >
              {children}
            </View>
          </ScrollView>
        </KeyboardViewport>
      </KeyboardAvoidingView>
    </NativeModal>
  );
}
