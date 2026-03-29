import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Vibration } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { Button } from '../../components/Button';
import { COLORS } from '../../constants/theme';
import api from '../../lib/api';

type Props = NativeStackScreenProps<RootStackParamList, 'SOS'>;

export function SOSScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [confirmed, setConfirmed] = useState(false);


  const triggerSOS = async () => {
    setLoading(true);
    Vibration.vibrate([0, 500, 200, 500]);
    try {
      let locationData: { lat?: number; lng?: number } = {};
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        locationData = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      }

      await api.post('/safety/sos', {
        bookingId,
        type: 'SOS',
        description: 'SOS Emergency triggered from mobile app',
        severity: 5,
        ...locationData,
      });
      setSent(true);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Gagal mengirim SOS');
    } finally {
      setLoading(false);
    }
  };

  const triggerSOSRef = React.useRef(triggerSOS);
  triggerSOSRef.current = triggerSOS;

  useEffect(() => {
    if (!confirmed) return;
    if (countdown <= 0) {
      triggerSOSRef.current();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, confirmed]);

  if (sent) {
    return (
      <View style={styles.container}>
        <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
        <Text style={styles.sentTitle}>SOS Terkirim!</Text>
        <Text style={styles.sentSubtitle}>
          Tim keamanan Areton telah dihubungi dan akan segera menghubungi Anda.
        </Text>
        <Button title="Kembali" onPress={() => navigation.goBack()} variant="outline" style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (confirmed) {
    return (
      <View style={styles.container}>
        <View style={styles.countdownCircle}>
          <Text style={styles.countdownNum}>{countdown}</Text>
        </View>
        <Text style={styles.countdownText}>Mengirim SOS dalam {countdown} detik...</Text>
        <Button title="Batalkan" onPress={() => { setConfirmed(false); setCountdown(5); }} variant="outline" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Ionicons name="warning" size={80} color={COLORS.error} />
      <Text style={styles.title}>Tombol Darurat SOS</Text>
      <Text style={styles.subtitle}>
        Tekan tombol di bawah jika Anda dalam bahaya. Tim keamanan akan segera dihubungi.
      </Text>

      <Button
        title="KIRIM SOS"
        onPress={() => setConfirmed(true)}
        variant="danger"
        size="lg"
        loading={loading}
        style={styles.sosBtn}
      />

      <Button title="Kembali" onPress={() => navigation.goBack()} variant="outline" style={{ marginTop: 16 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.error, marginTop: 16 },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  sosBtn: { marginTop: 40, width: '100%' },
  countdownCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  countdownNum: { fontSize: 48, fontWeight: '800', color: COLORS.error },
  countdownText: { fontSize: 16, color: COLORS.textSecondary, marginBottom: 24 },
  sentTitle: { fontSize: 24, fontWeight: '700', color: COLORS.success, marginTop: 16 },
  sentSubtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22 },
});
