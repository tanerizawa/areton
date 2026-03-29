import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type BottomSheet from '@gorhom/bottom-sheet';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { AvatarWithStatus } from '../../components/ui/AvatarWithStatus';
import { GradientButton } from '../../components/ui/GradientButton';
import { BadgePill, VerifiedBadge } from '../../components/ui/BadgePill';
import { BottomSheetWrapper } from '../../components/ui/BottomSheetWrapper';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { COLORS, SPACING, RADIUS, SHADOWS, TIER_COLORS, GRADIENTS, HIT_SLOP, resolvePhotoUrl } from '../../constants/theme';
import { useAuthStore } from '../../stores/auth';
import { useHaptic } from '../../hooks/useHaptic';
import api from '../../lib/api';

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout } = useAuthStore();
  const [escortProfile, setEscortProfile] = useState<any>(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const logoutSheetRef = useRef<BottomSheet>(null);
  const { selection } = useHaptic();

  useEffect(() => {
    if (user?.role !== 'ESCORT') return;
    let cancelled = false;
    api.get('/escorts/me')
      .then(({ data }) => { if (!cancelled) setEscortProfile(data.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.role]);

  useEffect(() => {
    let cancelled = false;
    api.get('/notifications?unreadOnly=true&limit=1')
      .then(({ data }) => {
        if (!cancelled) setUnreadNotifs(data.meta?.total ?? data.data?.length ?? 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleLogout = useCallback(() => {
    logoutSheetRef.current?.snapToIndex(0);
  }, []);

  const confirmLogout = useCallback(() => {
    logoutSheetRef.current?.close();
    logout();
  }, [logout]);

  if (!user) return null;

  const photoUri = resolvePhotoUrl(user.profilePhoto);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      {/* Cover photo gradient with avatar overlay */}
      <LinearGradient
        colors={GRADIENTS.gold as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.coverGradient}
      >
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')} hitSlop={HIT_SLOP} style={styles.notifBtn}>
          <Ionicons name="notifications-outline" size={22} color={COLORS.dark} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Avatar Section - overlapping cover */}
      <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.avatarSection}>
        <View style={styles.avatarRing}>
          <AvatarWithStatus uri={photoUri} size={90} borderColor={COLORS.gold} />
        </View>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
          {escortProfile?.isVerified && <VerifiedBadge size={18} />}
        </View>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user.role === 'ESCORT' ? '✨ Escort' : '👤 Client'}</Text>
        </View>
      </Animated.View>

      {/* Escort Stats */}
      {escortProfile && (
        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.statsCard}>
          <BadgePill tier={escortProfile.tier} />
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <AnimatedCounter value={escortProfile.ratingAvg || 0} decimals={1} style={styles.statVal} />
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <AnimatedCounter value={escortProfile.totalBookings || 0} style={styles.statVal} />
              <Text style={styles.statLabel}>Booking</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <AnimatedCounter value={escortProfile.totalReviews || 0} style={styles.statVal} />
              <Text style={styles.statLabel}>Review</Text>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Menu Group: Account */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
        <Text style={styles.menuGroupLabel}>Akun</Text>
        <View style={styles.menu}>
          <MenuItem icon="create-outline" label="Edit Profil" onPress={() => { selection(); navigation.navigate('EditProfile'); }} />
          <MenuItem icon="heart-outline" label="Favorit" onPress={() => { selection(); navigation.navigate('Favorites' as any); }} />
          <MenuItem icon="notifications-outline" label="Notifikasi" badge={unreadNotifs} onPress={() => { selection(); navigation.navigate('Notifications'); }} />
          <MenuItem icon="shield-checkmark-outline" label="Keamanan" onPress={() => { selection(); navigation.navigate('Security' as any); }} last />
        </View>
      </Animated.View>

      {/* Menu Group: Preferences */}
      <Animated.View entering={FadeInDown.delay(350).duration(500)}>
        <Text style={styles.menuGroupLabel}>Preferensi</Text>
        <View style={styles.menu}>
          <View style={[menuStyles.item, menuStyles.last]}>
            <View style={menuStyles.iconWrap}>
              <Ionicons name="moon" size={18} color={COLORS.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={menuStyles.label}>Tema Gelap</Text>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>Aktif secara default</Text>
            </View>
            <View style={{ backgroundColor: COLORS.success + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.success }}>Aktif</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Menu Group: More */}
      <Animated.View entering={FadeInDown.delay(450).duration(500)}>
        <Text style={styles.menuGroupLabel}>Lainnya</Text>
        <View style={styles.menu}>
          <MenuItem icon="help-circle-outline" label="Bantuan & FAQ" onPress={() => { selection(); Linking.openURL('https://areton.id/faq'); }} />
          <MenuItem icon="document-text-outline" label="Syarat & Ketentuan" onPress={() => { selection(); Linking.openURL('https://areton.id/terms'); }} />
          <MenuItem icon="lock-closed-outline" label="Kebijakan Privasi" onPress={() => { selection(); Linking.openURL('https://areton.id/privacy'); }} />
          <MenuItem icon="star-outline" label="Beri Rating Aplikasi" onPress={() => { selection(); Linking.openURL('https://areton.id/download'); }} last />
        </View>
      </Animated.View>

      {/* Logout */}
      <Animated.View entering={FadeInDown.delay(500).duration(500)} style={{ marginTop: SPACING.lg, marginHorizontal: SPACING.base }}>
        <GradientButton
          title="Keluar"
          onPress={handleLogout}
          variant="outline"
        />
      </Animated.View>

      <Text style={styles.version}>ARETON v1.0.0</Text>

      {/* Logout Bottom Sheet */}
      <BottomSheetWrapper
        ref={logoutSheetRef}
        title="Konfirmasi Logout"
        snapPoints={['30%']}
        onClose={() => logoutSheetRef.current?.close()}
      >
        <View style={styles.logoutSheet}>
          <Ionicons name="log-out-outline" size={40} color={COLORS.error} />
          <Text style={styles.logoutTitle}>Yakin ingin keluar?</Text>
          <Text style={styles.logoutSub}>Kamu harus login kembali untuk mengakses akunmu.</Text>
          <View style={styles.logoutActions}>
            <TouchableOpacity style={styles.logoutCancel} onPress={() => logoutSheetRef.current?.close()}>
              <Text style={styles.logoutCancelText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutConfirm} onPress={confirmLogout}>
              <Text style={styles.logoutConfirmText}>Keluar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetWrapper>
    </ScrollView>
  );
}

function MenuItem({ icon, label, onPress, last, badge }: { icon: string; label: string; onPress: () => void; last?: boolean; badge?: number }) {
  return (
    <TouchableOpacity style={[menuStyles.item, last && menuStyles.last]} onPress={onPress} activeOpacity={0.6}
      accessibilityRole="button" accessibilityLabel={label}>
      <View style={menuStyles.iconWrap}>
        <Ionicons name={icon as any} size={18} color={COLORS.textSecondary} />
      </View>
      <Text style={menuStyles.label}>{label}</Text>
      {!!badge && badge > 0 && (
        <View style={menuStyles.badge}>
          <Text style={menuStyles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const menuStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.darkBorder + '50',
  },
  last: { borderBottomWidth: 0 },
  badge: {
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.darkElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, fontSize: 15, color: COLORS.textPrimary, fontWeight: '500' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  scroll: { paddingBottom: 40 },
  coverGradient: {
    height: 140,
    paddingTop: 44,
    paddingHorizontal: SPACING.base,
    alignItems: 'flex-end',
  },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSection: { alignItems: 'center', marginTop: -50, marginBottom: SPACING.lg, paddingHorizontal: SPACING.base },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatarRing: { marginBottom: SPACING.md },
  name: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  email: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  roleBadge: {
    marginTop: SPACING.sm,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.gold + '15',
    borderWidth: 1,
    borderColor: COLORS.gold + '30',
  },
  roleText: { fontSize: 12, fontWeight: '600', color: COLORS.gold },
  statsCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    marginHorizontal: SPACING.base,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
    alignItems: 'center',
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  statsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  statLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: '100%', backgroundColor: COLORS.darkBorder },
  menuGroupLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    marginHorizontal: SPACING.base,
  },
  menu: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
    overflow: 'hidden',
    marginHorizontal: SPACING.base,
  },
  version: { textAlign: 'center', color: COLORS.textMuted, fontSize: 11, marginTop: SPACING.xl, letterSpacing: 2 },
  logoutSheet: { alignItems: 'center', paddingVertical: SPACING.lg, gap: SPACING.md },
  logoutTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  logoutSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: SPACING.lg },
  logoutActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  logoutCancel: {
    paddingHorizontal: 28, paddingVertical: 12,
    borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  logoutCancelText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
  logoutConfirm: {
    paddingHorizontal: 28, paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.error,
  },
  logoutConfirmText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
