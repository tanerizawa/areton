import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { Button } from '../../components/Button';
import { GradientButton } from '../../components/ui/GradientButton';
import { SkeletonProfile } from '../../components/ui/SkeletonLoader';
import { AvatarWithStatus } from '../../components/ui/AvatarWithStatus';
import { StepProgress } from '../../components/ui/ProgressBar';
import { COLORS, SPACING, RADIUS, SHADOWS, BOOKING_STATUS_COLORS, PAYMENT_STATUS_COLORS, GRADIENTS, SERVICE_TYPE_LABELS, resolvePhotoUrl } from '../../constants/theme';
import { Booking } from '../../constants/types';
import { useAuthStore } from '../../stores/auth';
import { useHaptic } from '../../hooks/useHaptic';
import api from '../../lib/api';
import Toast from 'react-native-toast-message';
import dayjs from 'dayjs';

type Props = NativeStackScreenProps<RootStackParamList, 'BookingDetail'>;

export function BookingDetailScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const user = useAuthStore((s) => s.user);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { selection, success } = useHaptic();

  const fetchBooking = useCallback(async (isMounted = { current: true as boolean }) => {
    try {
      const { data } = await api.get(`/bookings/${bookingId}`);
      if (isMounted.current) setBooking(data.data);
    } catch {
      if (isMounted.current) {
        Toast.show({ type: 'error', text1: 'Gagal memuat booking' });
        navigation.goBack();
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [bookingId, navigation]);

  useEffect(() => {
    const isMounted = { current: true };
    fetchBooking(isMounted);
    return () => { isMounted.current = false; };
  }, [fetchBooking]);

  const handleAction = async (action: string) => {
    const labels: Record<string, string> = {
      accept: 'terima', cancel: 'batalkan', checkin: 'check-in', checkout: 'check-out',
    };
    Alert.alert('Konfirmasi', `Apakah Anda yakin ingin ${labels[action] || action} booking ini?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya', onPress: async () => {
          setActionLoading(true);
          try {
            await api.patch(`/bookings/${bookingId}/${action}`);
            success();
            await fetchBooking();
          } catch (err: any) {
            Toast.show({ type: 'error', text1: err?.response?.data?.message || 'Aksi gagal' });
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  if (loading || !booking) {
    return <View style={styles.container}><SkeletonProfile /></View>;
  }

  const isEscort = user?.role === 'ESCORT';
  const partner = isEscort ? booking.client : booking.escort;
  const statusColor = BOOKING_STATUS_COLORS[booking.status] || COLORS.textMuted;
  const partnerPhoto = resolvePhotoUrl(partner?.profilePhoto);

  const STEPS = ['PENDING', 'CONFIRMED', 'ONGOING', 'COMPLETED'];
  const STATUS_LABELS: Record<string, string> = {
    PENDING: 'Menunggu',
    CONFIRMED: 'Dikonfirmasi',
    ONGOING: 'Berlangsung',
    COMPLETED: 'Selesai',
    CANCELLED: 'Dibatalkan',
    DISPUTED: 'Sengketa',
  };
  const currentStep = STEPS.indexOf(booking.status) >= 0 ? STEPS.indexOf(booking.status) + 1 : booking.status === 'CANCELLED' ? 0 : 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      {/* Status */}
      <Animated.View entering={FadeInDown.delay(100).duration(400)} style={[styles.statusBar, { backgroundColor: statusColor + '12', borderColor: statusColor + '30' }]}>
        <Ionicons name="ellipse" size={10} color={statusColor} />
        <Text style={[styles.statusLabel, { color: statusColor }]}>{STATUS_LABELS[booking.status] || booking.status}</Text>
      </Animated.View>

      {/* Step Progress */}
      {booking.status !== 'CANCELLED' && (
        <Animated.View entering={FadeInDown.delay(120).duration(400)} style={styles.stepSection}>
          <StepProgress total={4} current={currentStep} />
          <View style={styles.stepLabels}>
            {STEPS.map((s) => (
              <Text key={s} style={[styles.stepLabel, STEPS.indexOf(s) < currentStep && styles.stepLabelActive]}>
                {STATUS_LABELS[s]}
              </Text>
            ))}
          </View>
        </Animated.View>
      )}

      {/* Partner */}
      <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.section}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="person-outline" size={14} color={COLORS.gold} /> {isEscort ? 'Client' : 'Escort'}
        </Text>
        <View style={styles.partnerRow}>
          <AvatarWithStatus uri={partnerPhoto} size={44} />
          <Text style={styles.partnerName}>{partner?.firstName} {partner?.lastName}</Text>
        </View>
      </Animated.View>

      {/* Details */}
      <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.section}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="document-text-outline" size={14} color={COLORS.gold} /> Detail Booking
        </Text>
        <InfoRow icon="briefcase-outline" label="Tipe" value={SERVICE_TYPE_LABELS[booking.serviceType] || booking.serviceType} />
        <InfoRow icon="calendar-outline" label="Tanggal" value={dayjs(booking.startTime).format('DD MMM YYYY')} />
        <InfoRow icon="time-outline" label="Waktu" value={`${dayjs(booking.startTime).format('HH:mm')} - ${dayjs(booking.endTime).format('HH:mm')}`} />
        <InfoRow icon="location-outline" label="Lokasi" value={booking.location} />
        {booking.specialRequests && <InfoRow icon="chatbox-outline" label="Request" value={booking.specialRequests} />}
        {booking.checkinAt && <InfoRow icon="enter-outline" label="Check-in" value={dayjs(booking.checkinAt).format('HH:mm')} />}
        {booking.checkoutAt && <InfoRow icon="exit-outline" label="Check-out" value={dayjs(booking.checkoutAt).format('HH:mm')} />}
      </Animated.View>

      {/* Payment */}
      <Animated.View entering={FadeInDown.delay(250).duration(400)}>
        <LinearGradient
          colors={[COLORS.darkCard, COLORS.darkElevated]}
          style={[styles.section, styles.paymentSection]}
        >
          <Text style={styles.sectionTitle}>
            <Ionicons name="wallet-outline" size={14} color={COLORS.gold} /> Pembayaran
          </Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Total</Text>
            <Text style={styles.amountVal}>Rp {booking.totalAmount.toLocaleString('id-ID')}</Text>
          </View>
        {booking.payment && (
          <View style={[styles.paymentBadge, { backgroundColor: (PAYMENT_STATUS_COLORS[booking.payment.status] || COLORS.textMuted) + '15' }]}>
            <Ionicons name="ellipse" size={8} color={PAYMENT_STATUS_COLORS[booking.payment.status] || COLORS.textMuted} />
            <Text style={[styles.paymentStatus, { color: PAYMENT_STATUS_COLORS[booking.payment.status] || COLORS.textMuted }]}>
              {{ PENDING: 'Menunggu', ESCROW: 'Ditahan', RELEASED: 'Dibayarkan', REFUNDED: 'Dikembalikan', FAILED: 'Gagal' }[booking.payment.status] || booking.payment.status}
            </Text>
          </View>
        )}
        </LinearGradient>
      </Animated.View>

      {/* Actions */}
      <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.actions}>
        {/* Escort: accept pending booking */}
        {isEscort && booking.status === 'PENDING' && (
          <GradientButton title="Terima Booking" onPress={() => handleAction('accept')} loading={actionLoading} />
        )}

        {/* Client: pay when confirmed but not yet paid */}
        {!isEscort && booking.status === 'CONFIRMED' && !booking.payment && (
          <>
            <View style={styles.paymentRequiredBanner}>
              <Ionicons name="wallet-outline" size={18} color={COLORS.warning} />
              <Text style={styles.paymentRequiredText}>Selesaikan pembayaran untuk melanjutkan ke check-in</Text>
            </View>
            <GradientButton title="Bayar Sekarang" onPress={() => navigation.navigate('Payment', { bookingId: booking.id, amount: booking.totalAmount, bookingStatus: booking.status })} />
          </>
        )}

        {/* Client: pay when pending (optional early payment) */}
        {!isEscort && booking.status === 'PENDING' && !booking.payment && (
          <GradientButton
            title="Bayar Sekarang"
            onPress={() => navigation.navigate('Payment', { bookingId: booking.id, amount: booking.totalAmount, bookingStatus: booking.status })}
            variant="outline"
          />
        )}

        {/* Escort: check-in only when confirmed AND payment exists (ESCROW) */}
        {isEscort && booking.status === 'CONFIRMED' && booking.payment && ['ESCROW', 'PENDING'].includes(booking.payment.status) && (
          <GradientButton title="Check-In" onPress={() => handleAction('checkin')} loading={actionLoading} />
        )}

        {/* Escort: waiting for payment notice */}
        {isEscort && booking.status === 'CONFIRMED' && !booking.payment && (
          <View style={styles.paymentRequiredBanner}>
            <Ionicons name="time-outline" size={18} color={COLORS.info} />
            <Text style={styles.paymentRequiredText}>Menunggu client menyelesaikan pembayaran sebelum check-in</Text>
          </View>
        )}

        {/* Escort: check-out */}
        {isEscort && booking.status === 'ONGOING' && (
          <GradientButton title="Check-Out" onPress={() => handleAction('checkout')} loading={actionLoading} />
        )}

        {/* Chat — available when confirmed or ongoing */}
        {['CONFIRMED', 'ONGOING'].includes(booking.status) && partner && (
          <Button
            title="Chat"
            onPress={() => { selection(); navigation.navigate('Chat', { bookingId: booking.id, participantName: `${partner.firstName} ${partner.lastName}`, participantPhoto: (partner as any).profilePhoto }); }}
            variant="secondary"
            icon={<Ionicons name="chatbubble-outline" size={16} color={COLORS.gold} />}
          />
        )}
        {booking.status === 'COMPLETED' && partner && (
          <Button
            title="Beri Review"
            onPress={() => navigation.navigate('Review', { bookingId: booking.id, revieweeName: `${partner.firstName} ${partner.lastName}` })}
            variant="outline"
            icon={<Ionicons name="star-outline" size={16} color={COLORS.gold} />}
          />
        )}
        {booking.status === 'ONGOING' && (
          <Button title="SOS Darurat" onPress={() => navigation.navigate('SOS', { bookingId: booking.id })} variant="danger" icon={<Ionicons name="warning-outline" size={16} color={COLORS.error} />} />
        )}
        {['PENDING', 'CONFIRMED'].includes(booking.status) && (
          <Button title="Batalkan" onPress={() => handleAction('cancel')} variant="outline" />
        )}
      </Animated.View>
    </ScrollView>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={infoStyles.row}>
      <Ionicons name={icon as any} size={15} color={COLORS.textMuted} />
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value}>{value}</Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  label: { fontSize: 13, color: COLORS.textMuted, width: 70 },
  value: { fontSize: 14, color: COLORS.textPrimary, flex: 1, fontWeight: '500' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  scroll: { padding: SPACING.base, paddingBottom: 40 },
  statusBar: {
    minHeight: 44,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginBottom: SPACING.base,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
  },
  statusLabel: { fontSize: 14, fontWeight: '700' },
  stepSection: { marginBottom: SPACING.base },
  stepLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  stepLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 0.2, textAlign: 'center', flex: 1 },
  stepLabelActive: { color: COLORS.gold },
  section: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
    ...SHADOWS.sm,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10 },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  partnerName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountLabel: { fontSize: 14, color: COLORS.textSecondary },
  amountVal: { fontSize: 22, fontWeight: '800', color: COLORS.gold },
  paymentSection: { borderColor: COLORS.gold + '25' },
  paymentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentStatus: { fontSize: 13, fontWeight: '600' },
  actions: { gap: 10, marginTop: SPACING.sm },
  paymentRequiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.warning + '10',
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  paymentRequiredText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
