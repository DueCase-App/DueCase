import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal as NativeModal, Platform, View, type ModalProps } from 'react-native';
import { KeyboardViewport } from './KeyboardViewport';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SafeModalProps = Omit<ModalProps, 'onRequestClose'> & {
  onRequestClose?: () => void;
};

/**
 * Safe viewport for every dialog.
 * On Android the first Back press dismisses the keyboard instead of closing
 * the whole form, so users can continue filling the remaining fields.
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <KeyboardViewport>
          <View style={{ flex: 1, minHeight: 0, paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) }}>
            {children}
          </View>
        </KeyboardViewport>
      </KeyboardAvoidingView>
    </NativeModal>
  );
}
