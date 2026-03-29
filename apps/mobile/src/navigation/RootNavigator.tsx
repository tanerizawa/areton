import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/auth';
import { LoadingScreen } from '../components/LoadingScreen';
import { COLORS } from '../constants/theme';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { EscortDetailScreen } from '../screens/client/EscortDetailScreen';
import { BookingCreateScreen } from '../screens/client/BookingCreateScreen';
import { BookingDetailScreen } from '../screens/common/BookingDetailScreen';
import { ChatScreen } from '../screens/common/ChatScreen';
import { PaymentScreen } from '../screens/client/PaymentScreen';
import { ReviewScreen } from '../screens/common/ReviewScreen';
import { SOSScreen } from '../screens/common/SOSScreen';
import { MapScreen } from '../screens/common/MapScreen';
import { EditProfileScreen } from '../screens/common/EditProfileScreen';
import { NotificationsScreen } from '../screens/common/NotificationsScreen';
import { SecurityScreen } from '../screens/common/SecurityScreen';
import { FavoritesScreen } from '../screens/client/FavoritesScreen';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  EscortDetail: { escortId: string };
  BookingCreate: { escortId: string; escortName: string; hourlyRate: number };
  BookingDetail: { bookingId: string };
  Chat: { bookingId: string; participantName: string; participantPhoto?: string; participantTier?: string };
  Payment: { bookingId: string; amount: number; bookingStatus?: string };
  Review: { bookingId: string; revieweeName: string };
  SOS: { bookingId: string };
  Map: { bookingId?: string; lat?: number; lng?: number };
  EditProfile: undefined;
  Notifications: undefined;
  Security: undefined;
  Favorites: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.gold,
    background: COLORS.dark,
    card: COLORS.darkCard,
    text: COLORS.textPrimary,
    border: COLORS.darkBorder,
    notification: COLORS.gold,
  },
};

export function RootNavigator() {
  const { isAuthenticated, isInitialized } = useAuthStore();

  if (!isInitialized) return <LoadingScreen />;

  return (
    <NavigationContainer theme={AppTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.dark },
          animation: 'slide_from_right',
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabNavigator} />
            <Stack.Screen
              name="EscortDetail"
              component={EscortDetailScreen}
              options={{ headerShown: true, headerTitle: 'Detail Escort', headerTintColor: COLORS.gold, headerStyle: { backgroundColor: COLORS.darkCard } }}
            />
            <Stack.Screen
              name="BookingCreate"
              component={BookingCreateScreen}
              options={{ headerShown: true, headerTitle: 'Buat Booking', headerTintColor: COLORS.gold, headerStyle: { backgroundColor: COLORS.darkCard } }}
            />
            <Stack.Screen
              name="BookingDetail"
              component={BookingDetailScreen}
              options={{ headerShown: true, headerTitle: 'Detail Booking', headerTintColor: COLORS.gold, headerStyle: { backgroundColor: COLORS.darkCard } }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={({ route }) => ({
                headerShown: true,
                headerTitle: route.params.participantName,
                headerTintColor: COLORS.gold,
                headerStyle: { backgroundColor: COLORS.darkCard },
              })}
            />
            <Stack.Screen
              name="Payment"
              component={PaymentScreen}
              options={{ headerShown: true, headerTitle: 'Pembayaran', headerTintColor: COLORS.gold, headerStyle: { backgroundColor: COLORS.darkCard } }}
            />
            <Stack.Screen
              name="Review"
              component={ReviewScreen}
              options={{ headerShown: true, headerTitle: 'Beri Review', headerTintColor: COLORS.gold, headerStyle: { backgroundColor: COLORS.darkCard } }}
            />
            <Stack.Screen
              name="SOS"
              component={SOSScreen}
              options={{ headerShown: true, headerTitle: 'SOS Darurat', headerTintColor: COLORS.error, headerStyle: { backgroundColor: COLORS.darkCard } }}
            />
            <Stack.Screen
              name="Map"
              component={MapScreen}
              options={{ headerShown: true, headerTitle: 'Lokasi', headerTintColor: COLORS.gold, headerStyle: { backgroundColor: COLORS.darkCard } }}
            />
            <Stack.Screen
              name="EditProfile"
              component={EditProfileScreen}
              options={{ headerShown: true, headerTitle: 'Edit Profil', headerTintColor: COLORS.gold, headerStyle: { backgroundColor: COLORS.darkCard } }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ headerShown: true, headerTitle: 'Notifikasi', headerTintColor: COLORS.gold, headerStyle: { backgroundColor: COLORS.darkCard } }}
            />
            <Stack.Screen
              name="Security"
              component={SecurityScreen}
              options={{ headerShown: true, headerTitle: 'Keamanan', headerTintColor: COLORS.gold, headerStyle: { backgroundColor: COLORS.darkCard } }}
            />
            <Stack.Screen
              name="Favorites"
              component={FavoritesScreen}
              options={{ headerShown: true, headerTitle: 'Favorit', headerTintColor: COLORS.gold, headerStyle: { backgroundColor: COLORS.darkCard } }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
