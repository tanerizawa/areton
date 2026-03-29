import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Animated, { FadeInDown, FadeIn, useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { GradientButton } from '../../components/ui/GradientButton';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { COLORS, SPACING, RADIUS, SHADOWS, GRADIENTS, ANIMATION } from '../../constants/theme';
import { PaymentMethod, BookingStatus } from '../../constants/types';
import { useHaptic } from '../../hooks/useHaptic';
import api from '../../lib/api';
import Toast from 'react-native-toast-message';

type Props = NativeStackScreenProps<RootStackParamList, 'Payment'>;

const METHODS: { value: PaymentMethod; label: string; icon: string; section: string }[] = [
  { value: 'DOKU', label: 'Semua Metode (DOKU)', icon: 'card-outline', section: 'Transfer & E-Wallet' },
  { value: 'DOKU_VA', label: 'Virtual Account', icon: 'business-outline', section: 'Transfer & E-Wallet' },
  { value: 'DOKU_EWALLET', label: 'E-Wallet (OVO, DANA)', icon: 'phone-portrait-outline', section: 'Transfer & E-Wallet' },
  { value: 'DOKU_QRIS', label: 'QRIS (Scan QR)', icon: 'qr-code-outline', section: 'Transfer & E-Wallet' },
  { value: 'DOKU_CC', label: 'Kartu Kredit / Debit', icon: 'card', section: 'Transfer & E-Wallet' },
  { value: 'DOKU_RETAIL', label: 'Alfamart / Indomaret', icon: 'storefront-outline', section: 'Transfer & E-Wallet' },
  { value: 'CRYPTO', label: 'Semua Crypto', icon: 'wallet-outline', section: 'Cryptocurrency' },
  { value: 'CRYPTO_USDT', label: 'USDT (Tether)', icon: 'logo-usd', section: 'Cryptocurrency' },
  { value: 'CRYPTO_ETH', label: 'ETH (Ethereum)', icon: 'diamond-outline', section: 'Cryptocurrency' },
  { value: 'CRYPTO_BTC', label: 'BTC (Bitcoin)', icon: 'logo-bitcoin', section: 'Cryptocurrency' },
  { value: 'CRYPTO_SOL', label: 'SOL (Solana)', icon: 'flash-outline', section: 'Cryptocurrency' },
  { value: 'CRYPTO_XRP', label: 'XRP (Ripple)', icon: 'flash-outline', section: 'Cryptocurrency' },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function MethodItem({ m, selected, onPress, isLast }: { m: typeof METHODS[0]; selected: boolean; onPress: () => void; isLast: boolean }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      style={[styles.methodItem, selected && styles.methodItemActive, !isLast && styles.methodBorder, animStyle]}
      onPress={() => { scale.value = withSpring(0.97, ANIMATION.springBouncy); setTimeout(() => { scale.value = withSpring(1); }, 100); onPress(); }}
    >
      <View style={[styles.methodIcon, selected && styles.methodIconActive]}>
        <Ionicons name={m.icon as any} size={18} color={selected ? COLORS.gold : COLORS.textMuted} />
      </View>
      <Text style={[styles.methodLabel, selected && styles.methodLabelActive]}>{m.label}</Text>
      <View style={[styles.radio, selected && styles.radioActive]}>
        {selected && <View style={styles.radioDot} />}
      </View>
    </AnimatedPressable>
  );
}

export function PaymentScreen({ route, navigation }: Props) {
  const { bookingId, amount, bookingStatus: initialStatus } = route.params;
  const [method, setMethod] = useState<PaymentMethod>('DOKU');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>(
    (initialStatus as BookingStatus) || 'PENDING',
  );
  const { selection, success } = useHaptic();

  const isConfirmed = bookingStatus === 'CONFIRMED';
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll booking status so the button enables as soon as escort confirms
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`/bookings/${bookingId}`);
      const status = data.data?.status as BookingStatus | undefined;
      if (status) {
        setBookingStatus(status);
        // Stop polling once no longer PENDING
        if (status !== 'PENDING' && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch {
      // silent — we still have the initial status
    }
  }, [bookingId]);

  useEffect(() => {
    // Fetch once immediately, then poll every 5 s while still PENDING
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchStatus]);

  const sections = useMemo(() => {
    const map = new Map<string, typeof METHODS>();
    METHODS.forEach((m) => {
      if (!map.has(m.section)) map.set(m.section, []);
      map.get(m.section)!.push(m);
    });
    return Array.from(map.entries());
  }, []);

  const toggleSection = (name: string) => {
    selection();
    setCollapsed(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handlePay = async () => {
    setLoading(true);
    setProcessing(true);
    try {
      const { data } = await api.post('/payments', { bookingId, method });
      const payment = data.data;
      if (payment?.gateway?.redirectUrl || payment?.gateway?.invoiceUrl) {
        await WebBrowser.openBrowserAsync(payment.gateway.redirectUrl || payment.gateway.invoiceUrl);
      }
      success();
      setProcessing(false);
      setPaySuccess(true);
      setTimeout(() => {
        navigation.replace('BookingDetail', { bookingId });
      }, 1800);
    } catch (err: any) {
      setProcessing(false);
      Toast.show({ type: 'error', text1: err?.response?.data?.message || 'Pembayaran gagal' });
    } finally {
      setLoading(false);
    }
  };

  if (paySuccess) {
    return (
      <View style={styles.successContainer}>
        <Animated.View entering={FadeInDown.springify()} style={styles.successContent}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={48} color={COLORS.dark} />
          </View>
          <Text style={styles.successTitle}>Pembayaran Berhasil!</Text>
          <Text style={styles.successSub}>Terima kasih atas pembayaran Anda</Text>
        </Animated.View>
      </View>
    );
  }

  if (processing) {
    return (
      <View style={styles.successContainer}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.successContent}>
          <Animated.View style={{ transform: [{ rotate: '0deg' }] }}>
            <Ionicons name="sync-outline" size={48} color={COLORS.gold} />
          </Animated.View>
          <Text style={styles.successTitle}>Memproses Pembayaran...</Text>
          <Text style={styles.successSub}>Mohon tunggu sebentar</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      {/* Amount Card with AnimatedCounter */}
      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <LinearGradient
          colors={GRADIENTS.gold as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.amountCard}
        >
          <Ionicons name="wallet-outline" size={28} color={COLORS.dark + '80'} />
          <Text style={styles.amountLabel}>Total Pembayaran</Text>
          <AnimatedCounter
            value={amount}
            prefix="Rp "
            formatter={(val) => Math.floor(val).toLocaleString('id-ID')}
            style={styles.amountVal}
          />
        </LinearGradient>
      </Animated.View>

      {/* Status Banner */}
      {!isConfirmed && (
        <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.statusBanner}>
          <View style={styles.statusBannerIcon}>
            <Ionicons name="time-outline" size={20} color={COLORS.warning} />
          </View>
          <View style={styles.statusBannerContent}>
            <Text style={styles.statusBannerTitle}>Menunggu Konfirmasi Escort</Text>
            <Text style={styles.statusBannerDesc}>
              Pembayaran dapat dilakukan setelah escort mengonfirmasi booking Anda. Anda akan mendapat notifikasi saat dikonfirmasi.
            </Text>
          </View>
        </Animated.View>
      )}

      {isConfirmed && (
        <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.confirmedBanner}>
          <View style={styles.confirmedBannerIcon}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          </View>
          <View style={styles.statusBannerContent}>
            <Text style={styles.confirmedBannerTitle}>Booking Dikonfirmasi</Text>
            <Text style={styles.confirmedBannerDesc}>
              Escort telah mengonfirmasi. Silakan pilih metode pembayaran dan lanjutkan.
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Method Sections with Collapsible */}
      {sections.map(([sectionName, items], si) => (
        <Animated.View key={sectionName} entering={FadeInDown.delay(200 + si * 100).duration(400)}>
          <Pressable style={styles.sectionHeader} onPress={() => toggleSection(sectionName)}>
            <Text style={styles.sectionTitle}>
              <Ionicons name={si === 0 ? 'card-outline' : 'wallet-outline'} size={14} color={COLORS.gold} /> {sectionName}
            </Text>
            <Ionicons name={collapsed[sectionName] ? 'chevron-down' : 'chevron-up'} size={16} color={COLORS.textMuted} />
          </Pressable>
          {!collapsed[sectionName] && (
            <View style={styles.methodGroup}>
              {items.map((m, mi) => (
                <MethodItem
                  key={m.value}
                  m={m}
                  selected={method === m.value}
                  onPress={() => { setMethod(m.value); selection(); }}
                  isLast={mi === items.length - 1}
                />
              ))}
            </View>
          )}
        </Animated.View>
      ))}

      <Animated.View entering={FadeInDown.delay(500).duration(400)} style={{ marginTop: SPACING.lg }}>
        <GradientButton
          title={isConfirmed ? 'Bayar Sekarang' : 'Menunggu Konfirmasi...'}
          onPress={handlePay}
          loading={loading}
          disabled={!isConfirmed}
          size="lg"
        />
        {!isConfirmed && (
          <Text style={styles.disabledHint}>
            <Ionicons name="information-circle-outline" size={13} color={COLORS.textMuted} />
            {' '}Tombol aktif setelah escort mengonfirmasi booking
          </Text>
        )}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  scroll: { padding: SPACING.base, paddingBottom: 40 },
  amountCard: {
    borderRadius: RADIUS.lg,
    padding: 24,
    alignItems: 'center',
    marginBottom: SPACING.xl,
    gap: 6,
    ...SHADOWS.gold,
  },
  amountLabel: { fontSize: 13, color: COLORS.dark + 'B0', fontWeight: '500' },
  amountVal: { fontSize: 32, fontWeight: '900', color: COLORS.dark },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    letterSpacing: 0.3,
  },
  methodGroup: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
    overflow: 'hidden',
  },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 13,
    gap: 12,
  },
  methodItemActive: {
    backgroundColor: COLORS.gold + '08',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
  },
  methodBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.darkBorder + '50' },
  methodIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: COLORS.darkElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIconActive: { backgroundColor: COLORS.gold + '18' },
  methodLabel: { flex: 1, fontSize: 14, color: COLORS.textPrimary, fontWeight: '500' },
  methodLabelActive: { color: COLORS.gold, fontWeight: '600' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.darkBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: COLORS.gold },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.gold },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  successContainer: { flex: 1, backgroundColor: COLORS.dark, alignItems: 'center', justifyContent: 'center' },
  successContent: { alignItems: 'center', gap: 12 },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...SHADOWS.gold,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: COLORS.gold },
  successSub: { fontSize: 14, color: COLORS.textSecondary },
  // Status banners
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.warning + '10',
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: 12,
  },
  statusBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.warning + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  statusBannerContent: { flex: 1 },
  statusBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.warning,
    marginBottom: 4,
  },
  statusBannerDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  confirmedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.success + '10',
    borderWidth: 1,
    borderColor: COLORS.success + '30',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: 12,
  },
  confirmedBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.success + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  confirmedBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.success,
    marginBottom: 4,
  },
  confirmedBannerDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  disabledHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});
