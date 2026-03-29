import React, { useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { useAuthStore } from '../../stores/auth';
import { Input } from '../../components/Input';
import { GradientButton } from '../../components/ui/GradientButton';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import Toast from 'react-native-toast-message';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading } = useAuthStore();
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleLogin = async () => {
    setEmailError('');
    setPasswordError('');
    if (!email.trim()) { setEmailError('Email harus diisi'); return; }
    if (!/\S+@\S+\.\S+/.test(email.trim())) { setEmailError('Format email tidak valid'); return; }
    if (!password) { setPasswordError('Password harus diisi'); return; }
    if (password.length < 6) { setPasswordError('Password minimal 6 karakter'); return; }
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Login gagal. Periksa email dan password Anda.';
      Toast.show({ type: 'error', text1: 'Login Gagal', text2: msg });
    }
  };

  return (
    <LinearGradient
      colors={[COLORS.dark, COLORS.darkElevated, COLORS.dark]}
      style={styles.gradient}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Brand Header */}
          <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.header}>
            <View style={styles.logoGlow}>
              <Text style={styles.brand}>ARETON</Text>
            </View>
            <Text style={styles.tagline}>Prestige Companion Service</Text>
            <View style={styles.decorLine}>
              <View style={styles.line} />
              <Ionicons name="diamond" size={10} color={COLORS.gold} />
              <View style={styles.line} />
            </View>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeInUp.delay(300).duration(500)} style={styles.form}>
            <Input
              label="Email"
              placeholder="email@contoh.com"
              value={email}
              onChangeText={(t) => { setEmail(t); setEmailError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              icon="mail-outline"
              error={emailError}
            />
            <Input
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={(t) => { setPassword(t); setPasswordError(''); }}
              secureTextEntry={!showPassword}
              icon="lock-closed-outline"
              rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
              onRightIconPress={() => setShowPassword(!showPassword)}
              error={passwordError}
            />

            <GradientButton title="Masuk" onPress={handleLogin} loading={isLoading} size="lg" style={{ marginTop: SPACING.sm }} />

            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.link}>
              <Text style={styles.linkText}>Lupa Password?</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Divider */}
          <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>atau</Text>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* Register */}
          <Animated.View entering={FadeInUp.delay(600).duration(400)}>
            <GradientButton title="Daftar Akun Baru" onPress={() => navigation.navigate('Register')} variant="outline" size="lg" />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xl },
  header: { alignItems: 'center', marginBottom: SPACING.xxxl },
  logoGlow: {
    backgroundColor: COLORS.goldGlow,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  brand: { fontSize: 40, fontWeight: '800', color: COLORS.gold, letterSpacing: 8 },
  tagline: {
    fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.sm,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  decorLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md },
  line: { width: 40, height: 1, backgroundColor: COLORS.gold + '40' },
  form: { gap: 4 },
  link: { alignSelf: 'center', marginTop: SPACING.base, paddingVertical: SPACING.sm },
  linkText: { color: COLORS.gold, fontSize: 14, fontWeight: '500' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.xl, gap: SPACING.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.darkBorder },
  dividerText: { color: COLORS.textMuted, fontSize: 13 },
});
