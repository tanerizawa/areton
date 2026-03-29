import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  RefreshControl,
} from 'react-native';
import Animated, { FadeInDown, FadeInRight, FadeOut, Layout } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { BadgePill } from '../../components/ui/BadgePill';
import { AvatarWithStatus } from '../../components/ui/AvatarWithStatus';
import { COLORS, SPACING, RADIUS, SHADOWS, TIER_COLORS, resolvePhotoUrl } from '../../constants/theme';
import { useHaptic } from '../../hooks/useHaptic';
import api from '../../lib/api';
import Toast from 'react-native-toast-message';

interface FavoriteEscort {
  id: string;
  escortId: string;
  escort: {
    id: string;
    firstName: string;
    lastName: string;
    profilePhoto?: string;
    escortProfile?: {
      tier: string;
      hourlyRate: number;
      ratingAvg: number;
      totalBookings: number;
      bio?: string;
      languages: string[];
    };
  };
  createdAt: string;
}

export function FavoritesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [favorites, setFavorites] = useState<FavoriteEscort[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { selection, success } = useHaptic();

  const fetchFavorites = useCallback(async () => {
    try {
      const { data } = await api.get('/users/favorites');
      const items = data.data?.data || data.data || [];
      setFavorites(items);
    } catch {
      Toast.show({ type: 'error', text1: 'Gagal memuat favorit' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchFavorites(); }, [fetchFavorites]);

  const handleRefresh = () => { setRefreshing(true); fetchFavorites(); };

  const handleRemove = (favoriteId: string, name: string) => {
    selection();
    Alert.alert(
      'Hapus Favorit',
      `Hapus ${name} dari daftar favorit?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/users/favorites/${favoriteId}`);
              setFavorites((prev) => prev.filter((f) => f.id !== favoriteId));
              success();
              Toast.show({ type: 'success', text1: 'Dihapus dari favorit' });
            } catch {
              Toast.show({ type: 'error', text1: 'Gagal menghapus favorit' });
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item, index }: { item: FavoriteEscort; index: number }) => {
    const escort = item.escort;
    const profile = escort?.escortProfile;
    const photoUri = resolvePhotoUrl(escort?.profilePhoto);
    const tierColor = TIER_COLORS[profile?.tier || 'SILVER'] || COLORS.textMuted;

    return (
      <Animated.View
        entering={FadeInRight.delay(index * 80).duration(400)}
        exiting={FadeOut.duration(200)}
        layout={Layout.springify()}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => {
            selection();
            navigation.navigate('EscortDetail', { escortId: item.escortId });
          }}
        >
          <AvatarWithStatus uri={photoUri} size={64} borderColor={tierColor} />

          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {escort.firstName} {escort.lastName}
              </Text>
              {profile?.tier && <BadgePill tier={profile.tier as any} />}
            </View>

            {profile?.bio && (
              <Text style={styles.bio} numberOfLines={1}>{profile.bio}</Text>
            )}

            <View style={styles.metaRow}>
              {profile?.ratingAvg != null && (
                <View style={styles.metaItem}>
                  <Ionicons name="star" size={12} color={COLORS.gold} />
                  <Text style={styles.metaText}>{profile.ratingAvg.toFixed(1)}</Text>
                </View>
              )}
              {profile?.hourlyRate != null && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaText}>
                    Rp {Number(profile.hourlyRate).toLocaleString('id-ID')}/jam
                  </Text>
                </View>
              )}
              {(profile?.languages?.length ?? 0) > 0 && (
                <View style={styles.metaItem}>
                  <Ionicons name="globe-outline" size={12} color={COLORS.textMuted} />
                  <Text style={styles.metaText}>{profile?.languages?.slice(0, 2).join(', ')}</Text>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => handleRemove(item.id, `${escort.firstName} ${escort.lastName}`)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="heart" size={22} color={COLORS.error} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} style={{ marginHorizontal: SPACING.base, marginTop: SPACING.md }} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={favorites}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.gold}
            colors={[COLORS.gold]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="heart-outline"
            title="Belum ada favorit"
            subtitle="Escort yang Anda sukai akan muncul di sini"
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  list: { padding: SPACING.base, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
    ...SHADOWS.sm,
  },
  info: { flex: 1, marginLeft: SPACING.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, flexShrink: 1 },
  bio: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: COLORS.textMuted },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.error + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
  },
  separator: { height: SPACING.md },
});

