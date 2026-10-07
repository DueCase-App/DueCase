import { Modal as NativeModal, KeyboardAvoidingView, Platform, View, type ModalProps } from 'react-native';
import { KeyboardViewport } from './KeyboardViewport';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
/** One safe viewport for every dialog, including Android edge-to-edge navigation. */
export function SafeModal({children,...props}: ModalProps): React.JSX.Element {
 const insets=useSafeAreaInsets();
 return <NativeModal {...props} statusBarTranslucent={false} navigationBarTranslucent={false}>
  <KeyboardViewport>
   <View style={{flex:1,paddingTop:Math.max(insets.top,12),paddingBottom:Math.max(insets.bottom,16)}}>{children}</View>
  </KeyboardViewport>
 </NativeModal>;
}
