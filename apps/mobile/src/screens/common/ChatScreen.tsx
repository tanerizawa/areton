import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Pressable, Image,
} from 'react-native';
import Animated, { FadeIn, ZoomIn, FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { COLORS, SPACING, RADIUS, SHADOWS, TIER_COLORS, resolvePhotoUrl } from '../../constants/theme';
import { TypingIndicator } from '../../components/ui/ChatBubble';
import { BadgePill } from '../../components/ui/BadgePill';
import { ChatMessage } from '../../constants/types';
import { useAuthStore } from '../../stores/auth';
import { useHaptic } from '../../hooks/useHaptic';
import { getSocket, connectSocket } from '../../lib/socket';
import api from '../../lib/api';
import Toast from 'react-native-toast-message';
import dayjs from 'dayjs';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

function DateSeparator({ date }: { date: string }) {
  const d = dayjs(date);
  const today = dayjs();
  let label = d.format('DD MMM YYYY');
  if (d.isSame(today, 'day')) label = 'Hari Ini';
  else if (d.isSame(today.subtract(1, 'day'), 'day')) label = 'Kemarin';
  return (
    <View style={sepStyles.row}>
      <View style={sepStyles.line} />
      <Text style={sepStyles.text}>{label}</Text>
      <View style={sepStyles.line} />
    </View>
  );
}

const sepStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, paddingHorizontal: 20 },
  line: { flex: 1, height: 1, backgroundColor: COLORS.darkBorder },
  text: { fontSize: 11, color: COLORS.textMuted, marginHorizontal: 10, fontWeight: '500' },
});

export function ChatScreen({ route, navigation }: Props) {
  const { bookingId, participantName, participantPhoto, participantTier } = route.params as any;
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const { light, selection } = useHaptic();

  // Custom header
  useEffect(() => {
    const photoUri = resolvePhotoUrl(participantPhoto);
    navigation.setOptions({
      headerTitle: () => (
        <View style={headerStyles.wrap}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={headerStyles.avatar} />
          ) : (
            <View style={[headerStyles.avatar, headerStyles.avatarPlaceholder]}>
              <Ionicons name="person" size={16} color={COLORS.textMuted} />
            </View>
          )}
          <View style={headerStyles.info}>
            <View style={headerStyles.nameRow}>
              <Text style={headerStyles.name} numberOfLines={1}>{participantName}</Text>
              <View style={headerStyles.onlineDot} />
            </View>
            {participantTier && (
              <Text style={[headerStyles.tier, { color: TIER_COLORS[participantTier] || COLORS.textMuted }]}>
                {participantTier}
              </Text>
            )}
          </View>
        </View>
      ),
    });
  }, [participantName, participantPhoto, participantTier]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Ensure socket is connected for real-time messaging
        await connectSocket();

        const { data } = await api.get(`/chat/${bookingId}/messages`);
        if (!cancelled) setMessages((data.data?.data || data.data || []).reverse());
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const socket = getSocket();
    socket.emit('join_room', { bookingId });
    const handleNewMessage = (msg: ChatMessage) => {
      if (msg.bookingId === bookingId) {
        setMessages((prev) => [...prev, msg]);
        setIsTyping(false);
      }
    };
    const handleTyping = (data: any) => {
      if (data.bookingId === bookingId && data.userId !== user?.id) {
        setIsTyping(true);
        setTimeout(() => setIsTyping(false), 3000);
      }
    };
    socket.on('new_message', handleNewMessage);
    socket.on('typing', handleTyping);
    return () => {
      cancelled = true;
      socket.emit('leave_room', { bookingId });
      socket.off('new_message', handleNewMessage);
      socket.off('typing', handleTyping);
    };
  }, [bookingId]);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content) return;
    light();
    setText('');

    const socket = getSocket();
    if (socket.connected) {
      socket.emit('send_message', { bookingId, content, type: 'TEXT' });
    } else {
      // REST fallback when socket is not connected
      try {
        const { data } = await api.post(`/chat/${bookingId}/messages`, { content, type: 'TEXT' });
        const msg = data.data;
        if (msg) setMessages((prev) => [...prev, msg]);
      } catch {
        Toast.show({ type: 'error', text1: 'Gagal mengirim pesan' });
      }
    }
  }, [text, bookingId, light]);

  const handleTextChange = useCallback((t: string) => {
    setText(t);
    const socket = getSocket();
    socket.emit('typing', { bookingId });
  }, [bookingId]);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollDown(distanceFromBottom > 150);
  }, []);

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isMe = item.senderId === user?.id;
    const prev = index > 0 ? messages[index - 1] : null;
    const showDate = !prev || dayjs(item.createdAt).format('YYYY-MM-DD') !== dayjs(prev.createdAt).format('YYYY-MM-DD');

    return (
      <>
        {showDate && <DateSeparator date={item.createdAt} />}
        <Animated.View entering={ZoomIn.duration(250).springify()} style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={styles.msgText}>{item.content}</Text>
          <View style={styles.msgMeta}>
            <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>
              {dayjs(item.createdAt).format('HH:mm')}
            </Text>
            {isMe && (
              <Ionicons
                name={(item as any).read || (item as any).readAt ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={(item as any).read || (item as any).readAt ? COLORS.info : COLORS.textMuted}
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        </Animated.View>
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        ListFooterComponent={isTyping ? <TypingIndicator /> : null}
      />

      {/* Scroll-to-bottom FAB */}
      {showScrollDown && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.scrollFab}>
          <TouchableOpacity onPress={scrollToBottom} style={styles.scrollFabBtn}>
            <Ionicons name="chevron-down" size={20} color={COLORS.gold} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Quick Actions + Input Bar */}
      <View style={styles.inputBar}>
        <View style={styles.quickActions}>
          <TouchableOpacity onPress={() => selection()} style={styles.quickBtn}>
            <Ionicons name="camera-outline" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => selection()} style={styles.quickBtn}>
            <Ionicons name="attach-outline" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ketik pesan..."
            placeholderTextColor={COLORS.textMuted}
            value={text}
            onChangeText={handleTextChange}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, text.trim() ? styles.sendBtnActive : null]}
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Ionicons name="send" size={18} color={text.trim() ? COLORS.dark : COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const headerStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.darkElevated },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.online },
  tier: { fontSize: 11, fontWeight: '600', marginTop: 1 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  list: { padding: SPACING.base, paddingBottom: SPACING.sm },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
  },
  bubbleMe: {
    backgroundColor: COLORS.gold + '20',
    alignSelf: 'flex-end',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.gold + '15',
  },
  bubbleOther: {
    backgroundColor: COLORS.darkCard,
    alignSelf: 'flex-start',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  msgText: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 20 },
  msgMeta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 4 },
  msgTime: { fontSize: 10, color: COLORS.textMuted },
  msgTimeMe: { color: COLORS.goldDark },
  inputBar: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.darkBorder,
    backgroundColor: COLORS.darkCard,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
  },
  quickBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.darkInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollFab: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
  },
  scrollFabBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.darkCard,
    borderWidth: 1,
    borderColor: COLORS.gold + '30',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.darkInput,
    borderRadius: RADIUS.xl,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.darkInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: COLORS.gold,
  },
});
