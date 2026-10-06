import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { LoginScreen } from './LoginScreen';
import { SignUpScreen } from './SignUpScreen';

type AuthStackParamList = {
  Register: undefined;
  Login: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

type RegisterRouteProps = NativeStackScreenProps<AuthStackParamList, 'Register'>;
type LoginRouteProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;

function RegisterRoute({ navigation }: RegisterRouteProps): React.JSX.Element {
  return <SignUpScreen onShowLogin={() => navigation.navigate('Login')} />;
}

function LoginRoute({ navigation }: LoginRouteProps): React.JSX.Element {
  return <LoginScreen onShowRegister={() => navigation.navigate('Register')} />;
}

export function RegisterScreen(_: { onShowLogin: () => void }): React.JSX.Element {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Register"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="Register" component={RegisterRoute} />
        <Stack.Screen name="Login" component={LoginRoute} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}