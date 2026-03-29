import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable,
} from 'react-native';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { COLORS, SPACING, RADIUS, SHADOWS, GRADIENTS, ANIMATION, getGreeting } from '../../constants/theme';
import { useAuthStore } from '../../stores/auth';
import { useHaptic } from '../../hooks/useHaptic';
import { EarningsSummary } from '../../constants/types';
import api from '../../lib/api';

export function EscortDashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [stats, setStats] = useState({ pending: 0, confirmed: 0, ongoing: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const { selection } = useHaptic();

  const fetchData = useCallback(async () => {
    try {
      const [earningsRes, bookingsRes] = await Promise.all([
        api.get('/payments/earnings').catch(() => ({ data: { data: null } })),
        api.get('/bookings?limit=100').catch(() => ({ data: { data: [] } })),
      ]);
      setEarnings(earningsRes.data.data);
      const bookings = bookingsRes.data.data?.data || bookingsRes.data.data || [];
      setStats({
        pending: bookings.filter((b: any) => b.status === 'PENDING').length,
        confirmed: bookings.filter((b: any) => b.status === 'CONFIRMED').length,
        ongoing: bookings.filter((b: any) => b.status === 'ONGOING').length,
      });
    } catch { /* ignore */ } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={COLORS.gold} colors={[COLORS.gold]} progressBackgroundColor={COLORS.darkCard} />}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}, {user?.firstName} 👋</Text>
          <Text style={styles.greetSub}>Dashboard Escort Anda</Text>
        </View>
        <Text style={styles.brand}>ARETON</Text>
      </Animated.View>

      {/* Quick Stats */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.statsRow}>
        <QuickStat label="Menunggu" value={stats.pending} color={COLORS.warning} icon="hourglass" />
        <QuickStat label="Dikonfirmasi" value={stats.confirmed} color={COLORS.info} icon="checkmark-circle" />
        <QuickStat label="Berlangsung" value={stats.ongoing} color={COLORS.gold} icon="play-circle" />
      </Animated.View>

      {/* Earnings Card with Gradient */}
      {earnings && (
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <LinearGradient
            colors={GRADIENTS.gold as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.earningsCard}
          >
            <View style={styles.earningsHeader}>
              <Text style={styles.earningsTitle}>Total Pendapatan</Text>
              <Ionicons name="wallet" size={22} color={COLORS.dark + '90'} />
            </View>
            <AnimatedCounter
              value={earnings.totalEarnings || 0}
              prefix="Rp "
              formatter={(val) => Math.floor(val).toLocaleString('id-ID')}
              style={styles.earningsTotal}
            />
            {/* Trend Indicator */}
            {earnings.lastMonth > 0 && (
              <View style={styles.trendRow}>
                {(() => {
                  const pctChange = Math.round(((earnings.thisMonth - earnings.lastMonth) / earnings.lastMonth) * 100);
                  const isUp = pctChange >= 0;
                  return (
                    <>
                      <Ionicons name={isUp ? 'trending-up' : 'trending-down'} size={14} color={isUp ? COLORS.success : COLORS.error} />
                      <Text style={[styles.trendText, { color: isUp ? COLORS.success : COLORS.error }]}>
                        {isUp ? '+' : ''}{pctChange}% dari bulan lalu
                      </Text>
                    </>
                  );
                })()}
              </View>
            )}
            <View style={styles.earningsRow}>
              <View style={styles.earningItem}>
                <Text style={styles.earningsLabel}>Bulan Ini</Text>
                <Text style={styles.earningsVal}>Rp {(earnings.thisMonth || 0).toLocaleString('id-ID')}</Text>
              </View>
              <View style={styles.earningItem}>
                <Text style={styles.earningsLabel}>Bulan Lalu</Text>
                <Text style={styles.earningsVal}>Rp {(earnings.lastMonth || 0).toLocaleString('id-ID')}</Text>
              </View>
              <View style={styles.earningItem}>
                <Text style={styles.earningsLabel}>Pending</Text>
                <Text style={styles.earningsVal}>Rp {(earnings.pendingPayout || 0).toLocaleString('id-ID')}</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
      )}

      {/* Quick Actions */}
      <Animated.View entering={FadeInDown.delay(350).duration(500)} style={styles.quickRow}>
        <QuickAction icon="list-outline" label="Request" color={COLORS.warning} onPress={() => { selection(); navigation.navigate('Requests' as any); }} />
        <QuickAction icon="calendar-outline" label="Booking" color={COLORS.info} onPress={() => { selection(); navigation.navigate('Bookings' as any); }} />
        <QuickAction icon="chatbubbles-outline" label="Chat" color={COLORS.success} onPress={() => { selection(); navigation.navigate('ChatList' as any); }} />
        <QuickAction icon="person-outline" label="Profil" color={COLORS.gold} onPress={() => { selection(); navigation.navigate('Profile' as any); }} />
      </Animated.View>

      {/* Earnings Chart (Simple bar) */}
      {earnings && (
        <Animated.View entering={FadeInDown.delay(380).duration(500)} style={styles.chartCard}>
          <Text style={styles.chartTitle}>
            <Ionicons name="bar-chart-outline" size={14} color={COLORS.gold} /> Perbandingan
          </Text>
          <EarningsBar label="Bulan Ini" value={earnings.thisMonth || 0} max={Math.max(earnings.thisMonth || 0, earnings.lastMonth || 0, 1)} color={COLORS.gold} delay={200} />
          <EarningsBar label="Bulan Lalu" value={earnings.lastMonth || 0} max={Math.max(earnings.thisMonth || 0, earnings.lastMonth || 0, 1)} color={COLORS.info} delay={400} />
        </Animated.View>
      )}

      {/* Performance with Ring Indicators */}
      {earnings && (
        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.perfCard}>
          <Text style={styles.perfTitle}>
            <Ionicons name="analytics-outline" size={16} color={COLORS.gold} /> Performa
          </Text>
          <View style={styles.perfRow}>
            <View style={styles.perfItem}>
              <ProgressRing value={(earnings.averageRating || 0) / 5 * 100} color={COLORS.gold} icon="star" />
              <AnimatedCounter value={earnings.averageRating || 0} decimals={1} style={styles.perfVal} />
              <Text style={styles.perfLabel}>Rating</Text>
            </View>
            <View style={styles.perfItem}>
              <ProgressRing value={Math.min((earnings.totalBookings || 0) / 50 * 100, 100)} color={COLORS.info} icon="calendar" />
              <AnimatedCounter value={earnings.totalBookings || 0} style={styles.perfVal} />
              <Text style={styles.perfLabel}>Total Booking</Text>
            </View>
            <View style={styles.perfItem}>
              <ProgressRing value={98} color={COLORS.success} icon="trending-up" />
              <AnimatedCounter value={98} suffix="%" style={styles.perfVal} />
              <Text style={styles.perfLabel}>On-Time</Text>
            </View>
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}

function ProgressRing({ value, color, icon }: { value: number; color: string; icon: string }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const opacity = useSharedValue(0.1);
  useEffect(() => { opacity.value = withDelay(300, withTiming(pct / 100, { duration: 800 })); }, [pct]);
  const ringStyle = useAnimatedStyle(() => ({
    borderColor: color,
    opacity: 0.3 + opacity.value * 0.7,
    borderWidth: 3 + opacity.value * 2,
  }));
  return (
    <Animated.View style={[ringStyles.ring, ringStyle]}>
      <Ionicons name={icon as any} size={20} color={color} />
    </Animated.View>
  );
}
const ringStyles = StyleSheet.create({
  ring: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 3, marginBottom: 4 },
});

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function QuickAction({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      style={[qaStyles.item, animStyle]}
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.9, ANIMATION.springBouncy); }}
      onPressOut={() => { scale.value = withSpring(1, ANIMATION.springSmooth); }}
    >
      <View style={[qaStyles.iconWrap, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={qaStyles.label}>{label}</Text>
    </AnimatedPressable>
  );
}

const qaStyles = StyleSheet.create({
  item: { flex: 1, alignItems: 'center', gap: 6 },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
});

function EarningsBar({ label, value, max, color, delay: d = 0 }: { label: string; value: number; max: number; color: string; delay?: number }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 4) : 4;
  const width = useSharedValue(4);
  useEffect(() => {
    width.value = withDelay(d, withTiming(pct, { duration: 800 }));
  }, [pct]);
  const barStyle = useAnimatedStyle(() => ({ width: `${width.value}%`, backgroundColor: color }));
  return (
    <View style={barStyles.row}>
      <Text style={barStyles.label}>{label}</Text>
      <View style={barStyles.track}>
        <Animated.View style={[barStyles.fill, barStyle]} />
      </View>
      <Text style={barStyles.val}>Rp {value.toLocaleString('id-ID')}</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  label: { fontSize: 11, color: COLORS.textMuted, width: 70 },
  track: { flex: 1, height: 8, backgroundColor: COLORS.darkBorder, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  val: { fontSize: 11, color: COLORS.textSecondary, width: 90, textAlign: 'right', fontWeight: '600' },
});

function QuickStat({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <View style={[qStyles.card, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={[qStyles.val, { color }]}>{value.toLocaleString('id-ID')}</Text>
      <Text style={qStyles.label}>{label}</Text>
    </View>
  );
}

const qStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.md,
    padding: 14,
    alignItems: 'center',
    borderLeftWidth: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  val: { fontSize: 24, fontWeight: '800' },
  label: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  scroll: { padding: SPACING.base, paddingTop: 56, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  greeting: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
  greetSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  brand: { fontSize: 14, fontWeight: '800', color: COLORS.gold, letterSpacing: 3 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.lg },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  chartCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  chartTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 14 },
  earningsCard: {
    borderRadius: RADIUS.lg,
    padding: 22,
    marginBottom: SPACING.base,
    ...SHADOWS.gold,
  },
  earningsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  earningsTitle: { fontSize: 13, fontWeight: '600', color: COLORS.dark + 'B0' },
  earningsTotal: { fontSize: 30, fontWeight: '900', color: COLORS.dark, marginBottom: 6 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  trendText: { fontSize: 12, fontWeight: '600' },
  earningsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  earningItem: {},
  earningsLabel: { fontSize: 10, color: COLORS.dark + '80', fontWeight: '500' },
  earningsVal: { fontSize: 13, fontWeight: '700', color: COLORS.dark, marginTop: 2 },
  perfCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  perfTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 16 },
  perfRow: { flexDirection: 'row', justifyContent: 'space-around' },
  perfItem: { alignItems: 'center', gap: 6 },
  perfIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perfVal: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  perfLabel: { fontSize: 11, color: COLORS.textMuted },
});
