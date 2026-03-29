import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { GradientButton } from '../../components/ui/GradientButton';
import { Input } from '../../components/Input';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { useHaptic } from '../../hooks/useHaptic';
import api from '../../lib/api';
import Toast from 'react-native-toast-message';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

export function ReviewScreen({ route, navigation }: Props) {
  const { bookingId, revieweeName } = route.params;
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [attitude, setAttitude] = useState(5);
  const [punctuality, setPunctuality] = useState(5);
  const [professionalism, setProfessionalism] = useState(5);
  const [loading, setLoading] = useState(false);
  const { selection, success } = useHaptic();

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await api.post('/reviews', {
        bookingId,
        rating,
        comment: comment.trim() || undefined,
        attitudeScore: attitude,
        punctualityScore: punctuality,
        professionalismScore: professionalism,
      });
      success();
      Toast.show({ type: 'success', text1: 'Review berhasil dikirim!', text2: `Terima kasih telah memberikan review untuk ${revieweeName}` });
      navigation.goBack();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.response?.data?.message || 'Gagal mengirim review' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.header}>
          <Text style={styles.subtitle}>Bagaimana pengalaman Anda dengan</Text>
          <Text style={styles.revieweeName}>{revieweeName}?</Text>
        </Animated.View>

        {/* Overall Rating */}
        <Animated.View entering={FadeInDown.delay(150).duration(400)}>
          <View style={styles.card}>
            <Text style={styles.ratingTitle}>Rating Keseluruhan</Text>
            <StarRow value={rating} onChange={(v) => { selection(); setRating(v); }} size={40} />
            <Text style={styles.ratingLabel}>
              {rating === 5 ? '⭐ Luar biasa!' : rating === 4 ? '👍 Sangat baik' : rating === 3 ? '😊 Cukup baik' : rating === 2 ? '😐 Kurang memuaskan' : '😞 Mengecewakan'}
            </Text>
          </View>
        </Animated.View>

        {/* Sub-scores */}
        <Animated.View entering={FadeInDown.delay(250).duration(400)}>
          <Text style={styles.sectionTitle}>Penilaian Detail</Text>
          <View style={styles.card}>
            <SubScore
              icon="happy-outline"
              label="Sikap"
              value={attitude}
              onChange={(v) => { selection(); setAttitude(v); }}
            />
            <View style={styles.divider} />
            <SubScore
              icon="time-outline"
              label="Ketepatan Waktu"
              value={punctuality}
              onChange={(v) => { selection(); setPunctuality(v); }}
            />
            <View style={styles.divider} />
            <SubScore
              icon="briefcase-outline"
              label="Profesionalisme"
              value={professionalism}
              onChange={(v) => { selection(); setProfessionalism(v); }}
            />
          </View>
        </Animated.View>

        {/* Comment */}
        <Animated.View entering={FadeInDown.delay(350).duration(400)}>
          <Text style={styles.sectionTitle}>Komentar</Text>
          <View style={styles.card}>
            <Input
              placeholder="Bagikan pengalaman Anda... (opsional)"
              value={comment}
              onChangeText={setComment}
              multiline
              style={{ minHeight: 100, textAlignVertical: 'top' }}
              icon="chatbubble-outline"
            />
          </View>
        </Animated.View>

        {/* Submit */}
        <Animated.View entering={FadeInDown.delay(450).duration(400)} style={styles.submitSection}>
          <GradientButton
            title="Kirim Review"
            onPress={handleSubmit}
            loading={loading}
            size="lg"
          />
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StarRow({ value, onChange, size = 32 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <View style={starStyles.row}>
      {[1, 2, 3, 4, 5].map((s) => (
        <TouchableOpacity key={s} onPress={() => onChange(s)} activeOpacity={0.7}>
          <Ionicons
            name={s <= value ? 'star' : 'star-outline'}
            size={size}
            color={s <= value ? COLORS.gold : COLORS.darkBorder}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function SubScore({ icon, label, value, onChange }: {
  icon: string; label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <View style={subStyles.row}>
      <View style={subStyles.labelRow}>
        <Ionicons name={icon as any} size={16} color={COLORS.textSecondary} />
        <Text style={subStyles.label}>{label}</Text>
        <Text style={subStyles.value}>{value}/5</Text>
      </View>
      <StarRow value={value} onChange={onChange} size={22} />
    </View>
  );
}

const starStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
});

const subStyles = StyleSheet.create({
  row: { gap: 8, paddingVertical: SPACING.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.textPrimary },
  value: { fontSize: 13, fontWeight: '600', color: COLORS.gold },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.dark },
  scroll: { padding: SPACING.base, paddingBottom: 40 },
  header: { alignItems: 'center', paddingVertical: SPACING.lg },
  subtitle: { fontSize: 15, color: COLORS.textSecondary },
  revieweeName: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, marginTop: 4 },
  card: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
    ...SHADOWS.sm,
  },
  ratingTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.md },
  ratingLabel: { fontSize: 14, color: COLORS.gold, textAlign: 'center', marginTop: SPACING.md, fontWeight: '500' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
    marginLeft: 4,
  },
  divider: { height: 1, backgroundColor: COLORS.darkBorder + '50' },
  submitSection: { marginTop: SPACING.xl },
});
