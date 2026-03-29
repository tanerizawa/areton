import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Pressable,
} from 'react-native';

import Animated, { FadeIn, FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, interpolate } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { GradientButton } from '../../components/ui/GradientButton';
import { SkeletonProfile } from '../../components/ui/SkeletonLoader';
import { BadgePill, VerifiedBadge } from '../../components/ui/BadgePill';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { PhotoCarousel } from '../../components/ui/PhotoCarousel';
import { COLORS, SPACING, RADIUS, SHADOWS, TIER_COLORS, HIT_SLOP, resolvePhotoUrl } from '../../constants/theme';
import { EscortProfile, Review } from '../../constants/types';
import { useHaptic } from '../../hooks/useHaptic';
import api from '../../lib/api';
import Toast from 'react-native-toast-message';
import { usePresenceStore } from '../../stores/presence';

type Props = NativeStackScreenProps<RootStackParamList, 'EscortDetail'>;
const { width: SCREEN_W } = Dimensions.get('window');
const HERO_H = 380;

export function EscortDetailScreen({ route, navigation }: Props) {
  const { escortId } = route.params;
  const [escort, setEscort] = useState<EscortProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const isOnline = usePresenceStore((s) => s.isOnline(escort?.userId || ''));
  const checkOnline = usePresenceStore((s) => s.checkOnline);
  const [loading, setLoading] = useState(true);
  const [bioExpanded, setBioExpanded] = useState(false);
  const { light } = useHaptic();

  // Parallax scroll handler — must be before any early return
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });
  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [-100, 0, HERO_H], [-50, 0, HERO_H * 0.4], 'clamp') }],
  }));
  const headerOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [HERO_H - 120, HERO_H - 60], [0, 1], 'clamp'),
    backgroundColor: COLORS.dark,
  }));

  useEffect(() => {
    (async () => {
      try {
        const [escortRes, reviewsRes] = await Promise.all([
          api.get(`/escorts/${escortId}`),
          api.get(`/reviews/escort/${escortId}?limit=5`),
        ]);
        const escortData = escortRes.data.data;
        setEscort(escortData);
        setReviews(reviewsRes.data.data?.data || reviewsRes.data.data || []);
        // Check online status via REST API as fallback
        if (escortData?.userId) {
          checkOnline(escortData.userId);
        }
      } catch {
        Toast.show({ type: 'error', text1: 'Gagal memuat profil escort' });
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [escortId]);

  if (loading || !escort) {
    return (
      <View style={styles.container}>
        <SkeletonProfile />
      </View>
    );
  }

  const user = escort.user;
  const photoUri = resolvePhotoUrl(user?.profilePhoto);
  const photos = photoUri ? [photoUri] : [];
  const bioLong = (escort.bio?.length || 0) > 150;

  return (
    <View style={styles.container}>
      {/* Collapse Header on scroll */}
      <Animated.View style={[styles.stickyHeader, headerOpacity]}>
        <TouchableOpacity onPress={() => { light(); navigation.goBack(); }} hitSlop={HIT_SLOP}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.stickyName} numberOfLines={1}>{user?.firstName} {user?.lastName}</Text>
        <View style={{ width: 22 }} />
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* Hero Photo with Parallax */}
        <Animated.View style={[styles.heroWrap, heroStyle]}>
          {photos.length > 0 ? (
            <PhotoCarousel images={photos} height={HERO_H} />
          ) : (
            <View style={[styles.heroImg, { backgroundColor: COLORS.darkCard, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={80} color={COLORS.textMuted} />
            </View>
          )}
          <LinearGradient colors={['transparent', COLORS.dark]} style={styles.heroGradient} />
          {/* Back button */}
          <TouchableOpacity
            onPress={() => { light(); navigation.goBack(); }}
            style={styles.backBtn}
            hitSlop={HIT_SLOP}
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          {/* Tier badge on image */}
          <View style={styles.heroBadge}>
            <BadgePill tier={escort.tier} />
          </View>
        </Animated.View>

        {/* Content */}
        <View style={styles.content}>
          {/* Name + Verified */}
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
                <VerifiedBadge />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOnline ? COLORS.online : COLORS.offline }} />
                  <Text style={{ fontSize: 12, color: isOnline ? COLORS.online : COLORS.textMuted, fontWeight: '500' }}>
                    {isOnline ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>
              <Text style={styles.rate}>
                Rp {escort.hourlyRate.toLocaleString('id-ID')}
                <Text style={styles.rateUnit}>/jam</Text>
              </Text>
            </View>
          </Animated.View>

          {/* Animated Stats Row */}
          <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.statsRow}>
            <View style={styles.statBox}>
              <Ionicons name="star" size={18} color={COLORS.gold} />
              <AnimatedCounter value={escort.ratingAvg} decimals={1} style={styles.statVal} />
              <Text style={styles.statLabel}>{escort.totalReviews.toLocaleString('id-ID')} review</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Ionicons name="calendar" size={18} color={COLORS.info} />
              <AnimatedCounter value={escort.totalBookings} style={styles.statVal} />
              <Text style={styles.statLabel}>booking</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Ionicons name="time" size={18} color={COLORS.success} />
              <AnimatedCounter value={98} suffix="%" style={styles.statVal} />
              <Text style={styles.statLabel}>on-time</Text>
            </View>
          </Animated.View>

          {/* Bio — Expandable */}
          {escort.bio && (
            <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.section}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} /> Tentang
              </Text>
              <View style={styles.bioCard}>
                <Text style={styles.bio} numberOfLines={bioExpanded ? undefined : 4}>
                  {escort.bio}
                </Text>
                {bioLong && (
                  <Pressable
                    onPress={() => {
                      setBioExpanded(!bioExpanded);
                    }}
                    style={styles.readMoreBtn}
                  >
                    <Text style={styles.readMore}>
                      {bioExpanded ? 'Sembunyikan' : 'Baca selengkapnya'}
                    </Text>
                    <Ionicons name={bioExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.gold} />
                  </Pressable>
                )}
              </View>
            </Animated.View>
          )}

          {/* Skills */}
          {escort.skills?.length > 0 && (
            <Animated.View entering={FadeIn.delay(350).duration(400)} style={styles.section}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="sparkles-outline" size={16} color={COLORS.gold} /> Keahlian
              </Text>
              <View style={styles.tags}>
                {escort.skills.map((s) => (
                  <View key={s} style={styles.tag}>
                    <Text style={styles.tagText}>{s}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* Languages */}
          {escort.languages?.length > 0 && (
            <Animated.View entering={FadeIn.delay(400).duration(400)} style={styles.section}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="globe-outline" size={16} color={COLORS.gold} /> Bahasa
              </Text>
              <View style={styles.tags}>
                {escort.languages.map((l) => (
                  <View key={l} style={styles.tag}>
                    <Text style={styles.tagText}>{l}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <Animated.View entering={FadeIn.delay(450).duration(400)} style={styles.section}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={COLORS.gold} /> Review Terbaru
              </Text>
              {reviews.map((r, ri) => (
                <Animated.View key={r.id} entering={FadeInDown.delay(480 + ri * 60).duration(300)}>
                  <View style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewerName}>
                        {r.reviewer?.firstName} {r.reviewer?.lastName}
                      </Text>
                      <View style={styles.ratingBadge}>
                        <Ionicons name="star" size={11} color={COLORS.gold} />
                        <Text style={styles.ratingText}>{r.rating}</Text>
                      </View>
                    </View>
                    {r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
                  </View>
                </Animated.View>
              ))}
            </Animated.View>
          )}
        </View>
      </Animated.ScrollView>

      {/* Sticky Book Bar */}
      <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.bookBar}>
        <View style={styles.bookBarInner}>
          <View>
            <Text style={styles.bookPrice}>Rp {escort.hourlyRate.toLocaleString('id-ID')}</Text>
            <Text style={styles.bookUnit}>per jam</Text>
          </View>
          <GradientButton
            title="Book Sekarang"
            onPress={() =>
              navigation.navigate('BookingCreate', {
                escortId: escort.id,
                escortName: `${user?.firstName} ${user?.lastName}`,
                hourlyRate: escort.hourlyRate,
              })
            }
            style={{ flex: 1, marginLeft: SPACING.md }}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  stickyName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  heroWrap: { position: 'relative' },
  heroImg: { width: SCREEN_W, height: HERO_H },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: HERO_H * 0.5,
  },
  backBtn: {
    position: 'absolute',
    top: 48,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.dark + 'B0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: { position: 'absolute', top: 48, right: 16 },
  content: { paddingHorizontal: SPACING.base, marginTop: -40 },
  nameRow: { marginBottom: SPACING.md },
  name: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary },
  rate: { fontSize: 18, fontWeight: '700', color: COLORS.gold, marginTop: 4 },
  rateUnit: { fontSize: 13, fontWeight: '400', color: COLORS.textMuted },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
    ...SHADOWS.sm,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statVal: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  statLabel: { fontSize: 11, color: COLORS.textMuted },
  statDivider: { width: 1, backgroundColor: COLORS.darkBorder, marginVertical: 4 },
  section: { marginBottom: SPACING.lg + 4 },
  bioCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  readMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.darkBorder,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10 },
  bio: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  readMore: { fontSize: 13, color: COLORS.gold, fontWeight: '600', marginTop: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: COLORS.darkCard,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  tagText: { fontSize: 13, color: COLORS.textSecondary },
  reviewCard: {
    backgroundColor: COLORS.darkCard,
    padding: 14,
    borderRadius: RADIUS.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  reviewerName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.gold + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm },
  ratingText: { fontSize: 12, fontWeight: '700', color: COLORS.gold },
  reviewComment: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
  bookBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.darkCard,
    borderTopWidth: 1,
    borderTopColor: COLORS.darkBorder,
    ...SHADOWS.lg,
  },
  bookBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    paddingBottom: 28,
  },
  bookPrice: { fontSize: 18, fontWeight: '800', color: COLORS.gold },
  bookUnit: { fontSize: 11, color: COLORS.textMuted },
});
