import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { COLORS, SPACING, RADIUS, resolvePhotoUrl } from '../../constants/theme';
import { AvatarWithStatus } from '../../components/ui/AvatarWithStatus';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonChatItem } from '../../components/ui/SkeletonLoader';
import { ChatRoom } from '../../constants/types';
import { useHaptic } from '../../hooks/useHaptic';
import api from '../../lib/api';
import dayjs from 'dayjs';

export function ChatListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { selection } = useHaptic();

  const fetchRooms = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/conversations');
      setRooms(data.data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchRooms(); }, []);
  const handleRefresh = () => { setRefreshing(true); fetchRooms(); };

  const renderRoom = ({ item, index }: { item: ChatRoom; index: number }) => {
    const hasUnread = item.unreadCount > 0;
    const photoUri = resolvePhotoUrl(item.participant.profilePhoto);

    return (
      <Animated.View entering={FadeInDown.delay(index * 60).duration(350)}>
        <TouchableOpacity
          style={[styles.room, hasUnread && styles.roomUnread]}
          onPress={() => {
            selection();
            navigation.navigate('Chat', {
              bookingId: item.bookingId,
              participantName: `${item.participant.firstName} ${item.participant.lastName}`,
              participantPhoto: item.participant.profilePhoto,
            } as any);
          }}
          activeOpacity={0.7}
        >
          <AvatarWithStatus
            uri={photoUri}
            size={48}
            status={item.participant.isOnline ? 'online' : undefined}
          />
          <View style={styles.roomInfo}>
            <View style={styles.roomTop}>
              <Text style={[styles.roomName, hasUnread && styles.roomNameUnread]} numberOfLines={1}>
                {item.participant.firstName} {item.participant.lastName}
              </Text>
              {item.lastMessage && (
                <Text style={[styles.roomTime, hasUnread && { color: COLORS.gold }]}>
                  {dayjs(item.lastMessage.createdAt).format('HH:mm')}
                </Text>
              )}
            </View>
            <View style={styles.roomBottom}>
              <Text style={[styles.roomMsg, hasUnread && styles.roomMsgUnread]} numberOfLines={1}>
                {item.lastMessage?.content || 'Belum ada pesan'}
              </Text>
              {hasUnread && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unreadCount.toLocaleString('id-ID')}</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chat</Text>
        <Ionicons name="search-outline" size={22} color={COLORS.textMuted} />
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(item) => item.bookingId}
        renderItem={renderRoom}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} progressBackgroundColor={COLORS.darkCard} />}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 0 }}>
              {[0, 1, 2, 3].map((i) => <SkeletonChatItem key={i} />)}
            </View>
          ) : (
            <EmptyState
              icon="chatbubbles-outline"
              title="Belum ada percakapan"
              subtitle="Pesan akan muncul setelah booking aktif"
            />
          )
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
  list: { paddingBottom: 20 },
  room: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.darkBorder + '60',
  },
  roomUnread: {
    backgroundColor: COLORS.gold + '08',
  },
  roomInfo: { flex: 1 },
  roomTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  roomName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary, flex: 1 },
  roomNameUnread: { fontWeight: '700' },
  roomTime: { fontSize: 11, color: COLORS.textMuted },
  roomBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomMsg: { fontSize: 13, color: COLORS.textMuted, flex: 1 },
  roomMsgUnread: { color: COLORS.textSecondary, fontWeight: '500' },
  badge: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: COLORS.dark },
});
