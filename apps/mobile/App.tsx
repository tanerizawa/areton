import React, { useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/stores/auth';
import { useBookingStore } from './src/stores/booking';
import { usePushNotifications } from './src/lib/notifications';
import { useLocationTracker } from './src/lib/location';
import { usePresenceStore } from './src/stores/presence';

// Production-safe error log buffer for ErrorBoundary display
const errorLog: string[] = [];
if (__DEV__) {
  const origConsoleError = console.error;
  console.error = (...args: any[]) => {
    errorLog.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
    if (errorLog.length > 50) errorLog.shift();
    origConsoleError(...args);
  };
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string; stack: string }> {
  state = { hasError: false, error: '', stack: '' };
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err?.message || 'Unknown', stack: err?.stack?.slice(0, 800) || '' };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crash caught:', error.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0b1120', paddingTop: 60, paddingHorizontal: 16 }}>
          <Text style={{ color: '#ef4444', fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>⚠ App Crash</Text>
          <Text style={{ color: '#c9a96e', fontSize: 14, fontWeight: '600', marginBottom: 4 }}>Error:</Text>
          <Text style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }} selectable>{this.state.error}</Text>
          <Text style={{ color: '#c9a96e', fontSize: 14, fontWeight: '600', marginBottom: 4 }}>Stack:</Text>
          <ScrollView style={{ flex: 1, backgroundColor: '#131b2e', borderRadius: 8, padding: 8, marginBottom: 12 }}>
            <Text style={{ color: '#a0a8b8', fontSize: 10, fontFamily: 'monospace' }} selectable>{this.state.stack}</Text>
          </ScrollView>
          <Text style={{ color: '#c9a96e', fontSize: 14, fontWeight: '600', marginBottom: 4 }}>Recent Logs:</Text>
          <ScrollView style={{ flex: 1, backgroundColor: '#131b2e', borderRadius: 8, padding: 8, marginBottom: 16 }}>
            <Text style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace' }} selectable>{errorLog.slice(-10).join('\n---\n')}</Text>
          </ScrollView>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: '', stack: '' })}
            style={{ backgroundColor: '#c9a96e', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 30 }}
          >
            <Text style={{ color: '#0b1120', fontWeight: 'bold', fontSize: 16 }}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { initialize, isAuthenticated, isInitialized } = useAuthStore();
  const checkActive = useBookingStore((s) => s.checkActive);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Initialize auth state (check stored token, fetch profile)
  useEffect(() => {
    initialize().catch(() => {});
  }, []);

  // Push notifications
  usePushNotifications();

  // Poll active bookings when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    checkActive();
    const interval = setInterval(checkActive, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Location tracking when authenticated
  useLocationTracker(isAuthenticated);

  // Subscribe to presence events when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = usePresenceStore.getState().subscribe();
    return unsubscribe;
  }, [isAuthenticated]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          {fontsLoaded ? <RootNavigator /> : (
            <View style={{ flex: 1, backgroundColor: '#0b1120', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color="#c9a96e" />
            </View>
          )}
          <Toast />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
