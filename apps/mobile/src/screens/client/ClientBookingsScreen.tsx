import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { AvatarWithStatus } from '../../components/ui/AvatarWithStatus';
import { EmptyState } from '../../components/ui/EmptyState';
import { COLORS, SPACING, RADIUS, SHADOWS, BOOKING_STATUS_COLORS, SERVICE_TYPE_LABELS, resolvePhotoUrl } from '../../constants/theme';
import { Booking, BookingStatus } from '../../constants/types';
import { useAuthStore } from '../../stores/auth';
import { useHaptic } from '../../hooks/useHaptic';
import api from '../../lib/api';
import dayjs from 'dayjs';

const STATUS_TABS: { key: BookingStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Semua' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'CONFIRMED', label: 'Dikonfirmasi' },
  { key: 'ONGOING', label: 'Berlangsung' },
  { key: 'COMPLETED', label: 'Selesai' },
  { key: 'CANCELLED', label: 'Dibatalkan' },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu',
  CONFIRMED: 'Dikonfirmasi',
  ONGOING: 'Berlangsung',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
  DISPUTED: 'Sengketa',
};

export function ClientBookingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'ALL'>('ALL');
  const { selection } = useHaptic();

  const fetchBookings = useCallback(async () => {
    try {
      const params: any = { limit: 50 };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const { data } = await api.get('/bookings', { params });
      setBookings(data.data?.data || data.data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchBookings();
  }, [statusFilter, fetchBookings]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  const getPartnerName = (b: Booking) => {
    const partner = user?.role === 'ESCORT' ? b.client : b.escort;
    return partner ? `${partner.firstName} ${partner.lastName}` : '-';
  };

  const renderBooking = ({ item, index }: { item: Booking; index: number }) => {
    const partnerPhoto = (() => {
      const partner = user?.role === 'ESCORT' ? item.client : item.escort;
      return resolvePhotoUrl(partner?.profilePhoto);
    })();
    return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(350)}>
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: (BOOKING_STATUS_COLORS[item.status] || COLORS.textMuted) + '25' }]}>
          <Text style={[styles.statusText, { color: BOOKING_STATUS_COLORS[item.status] || COLORS.textMuted }]}>
            {STATUS_LABELS[item.status] || item.status}
          </Text>
        </View>
        <Text style={styles.serviceType}>{SERVICE_TYPE_LABELS[item.serviceType] || item.serviceType}</Text>
      </View>

      <View style={styles.partnerRow}>
        <AvatarWithStatus uri={partnerPhoto} size={36} />
        <Text style={styles.partnerName}>{getPartnerName(item)}</Text>
      </View>

      <View style={styles.detailRow}>
        <Ionicons name="calendar-outline" size={14} color={COLORS.textMuted} />
        <Text style={styles.detailText}>
          {dayjs(item.startTime).format('DD MMM YYYY, HH:mm')} - {dayjs(item.endTime).format('HH:mm')}
        </Text>
      </View>

      <View style={styles.detailRow}>
        <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
        <Text style={styles.detailText} numberOfLines={1}>{item.location}</Text>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.amount}>Rp {item.totalAmount.toLocaleString('id-ID')}</Text>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      </View>
    </TouchableOpacity>
    </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.delay(50).duration(400)} style={styles.header}>
        <Text style={styles.title}>Booking Saya</Text>
      </Animated.View>

      {/* Status Filter */}
      <FlatList
        horizontal
        data={STATUS_TABS}
        keyExtractor={(i) => i.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}
        renderItem={({ item: t }) => (
          <TouchableOpacity
            style={[styles.filterChip, statusFilter === t.key && styles.filterChipActive]}
            onPress={() => { setStatusFilter(t.key); selection(); }}
          >
            <Text style={[styles.filterText, statusFilter === t.key && styles.filterTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={renderBooking}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} progressBackgroundColor={COLORS.darkCard} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="calendar-outline"
              title="Belum ada booking"
              subtitle="Mulai cari escort dan buat booking pertamamu"
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  header: { paddingHorizontal: SPACING.base, paddingTop: 56, paddingBottom: SPACING.sm },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
  filterList: { paddingHorizontal: SPACING.base, paddingBottom: SPACING.md },
  filterChip: {
    height: 34,
    paddingHorizontal: 14,
    marginRight: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.darkCard,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: COLORS.gold + '20', borderColor: COLORS.gold },
  filterText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  filterTextActive: { color: COLORS.gold, fontWeight: '600' },
  list: { paddingHorizontal: SPACING.base, paddingBottom: 20 },
  card: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
    ...SHADOWS.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusBadge: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
  serviceType: { fontSize: 12, color: COLORS.textMuted, lineHeight: 16 },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  partnerName: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  detailText: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.darkBorder },
  amount: { fontSize: 16, fontWeight: '700', color: COLORS.gold },
});
