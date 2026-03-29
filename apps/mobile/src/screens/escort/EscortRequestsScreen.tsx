import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { EmptyState } from '../../components/ui/EmptyState';
import { AvatarWithStatus } from '../../components/ui/AvatarWithStatus';
import { GradientButton } from '../../components/ui/GradientButton';
import { COLORS, SPACING, RADIUS, SHADOWS, SERVICE_TYPE_LABELS, resolvePhotoUrl } from '../../constants/theme';
import { Booking } from '../../constants/types';
import { useHaptic } from '../../hooks/useHaptic';
import api from '../../lib/api';
import Toast from 'react-native-toast-message';
import dayjs from 'dayjs';

export function EscortRequestsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [requests, setRequests] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const { selection, success } = useHaptic();

  const fetchRequests = useCallback(async () => {
    try {
      const { data } = await api.get('/bookings?status=PENDING&limit=50');
      setRequests(data.data?.data || data.data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleAction = async (bookingId: string, action: 'accept' | 'cancel') => {
    const label = action === 'accept' ? 'terima' : 'tolak';
    Alert.alert('Konfirmasi', `${label} booking ini?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya',
        onPress: async () => {
          setActionId(bookingId);
          try {
            await api.patch(`/bookings/${bookingId}/${action}`);
            if (action === 'accept') success();
            Toast.show({ type: 'success', text1: `Booking berhasil di-${label}` });
            fetchRequests();
          } catch (err: any) {
            Toast.show({ type: 'error', text1: err?.response?.data?.message || 'Gagal' });
          } finally {
            setActionId(null);
          }
        },
      },
    ]);
  };

  const renderRequest = ({ item, index }: { item: Booking; index: number }) => {
    const clientPhoto = resolvePhotoUrl(item.client?.profilePhoto);
    return (
      <Animated.View entering={FadeInDown.delay(index * 60).duration(350)}>
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <AvatarWithStatus uri={clientPhoto} size={42} />
            <View style={{ flex: 1 }}>
              <Text style={styles.clientName}>{item.client?.firstName} {item.client?.lastName}</Text>
              <Text style={styles.serviceType}>{SERVICE_TYPE_LABELS[item.serviceType] || item.serviceType}</Text>
            </View>
            <Text style={styles.amount}>Rp {item.totalAmount.toLocaleString('id-ID')}</Text>
          </View>

          <View style={styles.detailSection}>
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
            {item.specialRequests && (
              <View style={styles.detailRow}>
                <Ionicons name="chatbox-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.detailText} numberOfLines={2}>{item.specialRequests}</Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => { selection(); handleAction(item.id, 'accept'); }}
              disabled={actionId === item.id}
            >
              <Ionicons name="checkmark" size={18} color={COLORS.dark} />
              <Text style={styles.acceptText}>Terima</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => { selection(); handleAction(item.id, 'cancel'); }}
              disabled={actionId === item.id}
            >
              <Ionicons name="close" size={18} color={COLORS.error} />
              <Text style={styles.rejectText}>Tolak</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.delay(50).duration(400)} style={styles.header}>
        <Text style={styles.title}>Request Masuk</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{requests.length.toLocaleString('id-ID')}</Text>
        </View>
      </Animated.View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={renderRequest}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRequests(); }} tintColor={COLORS.gold} colors={[COLORS.gold]} progressBackgroundColor={COLORS.darkCard} />
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="checkmark-done-circle-outline"
              title="Semua beres!"
              subtitle="Tidak ada request baru saat ini"
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingTop: 56,
    paddingBottom: SPACING.md,
  },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
  countBadge: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: { fontSize: 13, fontWeight: '700', color: COLORS.dark },
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
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: SPACING.md,
  },
  clientName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  serviceType: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  amount: { fontSize: 16, fontWeight: '800', color: COLORS.gold },
  detailSection: { gap: 4, marginBottom: SPACING.md },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.darkBorder,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
  },
  acceptBtn: { backgroundColor: COLORS.gold },
  rejectBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.error },
  acceptText: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  rejectText: { fontSize: 14, fontWeight: '600', color: COLORS.error },
});
