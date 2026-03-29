import React, { useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity, Pressable,
} from 'react-native';
import Animated, { FadeInDown, FadeInRight, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { useAuthStore } from '../../stores/auth';
import { Input } from '../../components/Input';
import { GradientButton } from '../../components/ui/GradientButton';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { useHaptic } from '../../hooks/useHaptic';
import Toast from 'react-native-toast-message';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'CLIENT' | 'ESCORT'>('CLIENT');
  const { register, isLoading } = useAuthStore();
  const { light, selection } = useHaptic();

  const handleNext = () => {
    if (step === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        Toast.show({ type: 'error', text1: 'Nama depan dan belakang harus diisi' });
        return;
      }
    }
    if (step === 2) {
      if (!email.trim()) {
        Toast.show({ type: 'error', text1: 'Email harus diisi' });
        return;
      }
      if (!/\S+@\S+\.\S+/.test(email.trim())) {
        Toast.show({ type: 'error', text1: 'Format email tidak valid' });
        return;
      }
    }
    selection();
    setStep(step + 1);
  };

  const handleRegister = async () => {
    if (password.length < 8) {
      Toast.show({ type: 'error', text1: 'Password minimal 8 karakter' });
      return;
    }
    if (password !== confirmPassword) {
      Toast.show({ type: 'error', text1: 'Konfirmasi password tidak cocok' });
      return;
    }
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        role,
      });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Registrasi gagal', text2: err?.response?.data?.message || 'Coba lagi' });
    }
  };

  const passwordStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const strengthColors = ['transparent', COLORS.error, COLORS.warning, COLORS.success];
  const strengthLabels = ['', 'Lemah', 'Sedang', 'Kuat'];

  return (
    <LinearGradient colors={[COLORS.dark, COLORS.darkElevated, COLORS.dark]} style={{ flex: 1 }}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Back + Progress */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.topBar}>
            <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <View style={styles.progressBar}>
              {[1, 2, 3].map(s => (
                <View key={s} style={[styles.progressDot, s <= step && styles.progressDotActive]} />
              ))}
            </View>
            <Text style={styles.stepText}>{step}/3</Text>
          </Animated.View>

          {/* Step 1: Role + Name */}
          {step === 1 && (
            <Animated.View entering={SlideInRight.duration(300)} key="step1">
              <Text style={styles.title}>Bergabung dengan Areton</Text>
              <Text style={styles.subtitle}>Pilih role dan masukkan nama Anda</Text>

              {/* Role Selector */}
              <View style={styles.roleRow}>
                {(['CLIENT', 'ESCORT'] as const).map(r => (
                  <Pressable
                    key={r}
                    style={[styles.roleBtn, role === r && styles.roleBtnActive]}
                    onPress={() => { setRole(r); selection(); }}
                  >
                    <Ionicons
                      name={r === 'CLIENT' ? 'person-outline' : 'sparkles-outline'}
                      size={22}
                      color={role === r ? COLORS.gold : COLORS.textMuted}
                    />
                    <Text style={[styles.roleText, role === r && styles.roleTextActive]}>{r === 'CLIENT' ? 'Client' : 'Escort'}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.nameRow}>
                <Input label="Nama Depan" placeholder="John" value={firstName} onChangeText={setFirstName} containerStyle={{ flex: 1 }} icon="person-outline" />
                <Input label="Nama Belakang" placeholder="Doe" value={lastName} onChangeText={setLastName} containerStyle={{ flex: 1 }} />
              </View>

              <GradientButton title="Lanjutkan" onPress={handleNext} size="lg" />
            </Animated.View>
          )}

          {/* Step 2: Contact */}
          {step === 2 && (
            <Animated.View entering={SlideInRight.duration(300)} key="step2">
              <Text style={styles.title}>Informasi Kontak</Text>
              <Text style={styles.subtitle}>Kami membutuhkan email untuk verifikasi</Text>

              <Input label="Email" placeholder="email@contoh.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" icon="mail-outline" />
              <Input label="No. Telepon (opsional)" placeholder="08xxxxxxxxxx" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" />

              <GradientButton title="Lanjutkan" onPress={handleNext} size="lg" />
            </Animated.View>
          )}

          {/* Step 3: Password */}
          {step === 3 && (
            <Animated.View entering={SlideInRight.duration(300)} key="step3">
              <Text style={styles.title}>Buat Password</Text>
              <Text style={styles.subtitle}>Minimal 8 karakter</Text>

              <Input
                label="Password"
                placeholder="Min. 8 karakter"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                icon="lock-closed-outline"
                rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onRightIconPress={() => setShowPassword(!showPassword)}
              />

              {/* Password strength */}
              {password.length > 0 && (
                <View style={styles.strengthRow}>
                  {[1, 2, 3].map(s => (
                    <View key={s} style={[styles.strengthBar, { backgroundColor: s <= passwordStrength ? strengthColors[passwordStrength] : COLORS.darkBorder }]} />
                  ))}
                  <Text style={[styles.strengthLabel, { color: strengthColors[passwordStrength] }]}>{strengthLabels[passwordStrength]}</Text>
                </View>
              )}

              <Input label="Konfirmasi Password" placeholder="Ulangi password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry icon="shield-checkmark-outline" />

              <GradientButton title="Daftar" onPress={handleRegister} loading={isLoading} size="lg" />
            </Animated.View>
          )}

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.link}>
            <Text style={styles.linkText}>Sudah punya akun? <Text style={{ fontWeight: '700' }}>Masuk</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, padding: SPACING.xl, paddingTop: 56 },
  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xxl, gap: SPACING.base },
  progressBar: { flex: 1, flexDirection: 'row', gap: SPACING.xs },
  progressDot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: COLORS.darkBorder },
  progressDotActive: { backgroundColor: COLORS.gold },
  stepText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.xl },
  roleRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  roleBtn: {
    flex: 1, paddingVertical: SPACING.base, borderRadius: RADIUS.lg,
    borderWidth: 1.5, borderColor: COLORS.darkBorder, alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.darkCard,
  },
  roleBtnActive: { borderColor: COLORS.gold, backgroundColor: COLORS.gold + '10' },
  roleText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 14 },
  roleTextActive: { color: COLORS.gold },
  nameRow: { flexDirection: 'row', gap: SPACING.md },
  strengthRow: { flexDirection: 'row', gap: SPACING.xs, alignItems: 'center', marginBottom: SPACING.base, marginTop: -SPACING.sm },
  strengthBar: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '600', marginLeft: SPACING.xs },
  link: { alignSelf: 'center', marginTop: SPACING.lg, marginBottom: 40, paddingVertical: SPACING.sm },
  linkText: { color: COLORS.gold, fontSize: 14 },
});
