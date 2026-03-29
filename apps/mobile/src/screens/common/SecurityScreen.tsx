import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Modal, Pressable,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { Input } from '../../components/Input';
import { GradientButton } from '../../components/ui/GradientButton';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { useAuthStore } from '../../stores/auth';
import { useHaptic } from '../../hooks/useHaptic';
import api from '../../lib/api';
import Toast from 'react-native-toast-message';

type Props = NativeStackScreenProps<RootStackParamList, 'Security'>;

export function SecurityScreen({ navigation }: Props) {
  const { user, fetchProfile } = useAuthStore();
  const [twoFaEnabled, setTwoFaEnabled] = useState(user?.twoFactorEnabled || false);
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  // 2FA Setup modal state
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrUrl, setTotpQrUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);

  // 2FA Disable modal state
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Active sessions
  const [sessions, setSessions] = useState<any[]>([]);
  const { selection, success } = useHaptic();

  useEffect(() => {
    api.get('/auth/sessions').then(({ data }) => {
      setSessions(data.data || []);
    }).catch(() => {});
  }, []);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Toast.show({ type: 'error', text1: 'Semua field harus diisi' });
      return;
    }
    if (newPassword.length < 8) {
      Toast.show({ type: 'error', text1: 'Password baru minimal 8 karakter' });
      return;
    }
    if (newPassword !== confirmPassword) {
      Toast.show({ type: 'error', text1: 'Konfirmasi password tidak cocok' });
      return;
    }

    setPasswordLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      success();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Toast.show({ type: 'success', text1: 'Password berhasil diubah' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.response?.data?.message || 'Gagal mengubah password' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleToggle2FA = async (enabled: boolean) => {
    selection();
    if (enabled) {
      // Step 1: Request 2FA setup — get secret and QR
      setTwoFaLoading(true);
      try {
        const { data } = await api.post('/auth/2fa/enable');
        const result = data.data || data;
        setTotpSecret(result.secret || result.base32 || '');
        setTotpQrUrl(result.qrCodeUrl || result.otpauthUrl || result.qrCode || '');
        setVerifyCode('');
        setShowSetupModal(true);
      } catch (err: any) {
        Toast.show({ type: 'error', text1: err?.response?.data?.message || 'Gagal mengaktifkan 2FA' });
      } finally {
        setTwoFaLoading(false);
      }
    } else {
      // Show disable modal with TOTP code input
      setDisableCode('');
      setShowDisableModal(true);
    }
  };

  const handleVerify2FA = async () => {
    if (verifyCode.length < 6) {
      Toast.show({ type: 'error', text1: 'Masukkan kode 6 digit dari authenticator' });
      return;
    }
    setVerifyLoading(true);
    try {
      await api.post('/auth/2fa/verify', { code: verifyCode });
      setTwoFaEnabled(true);
      await fetchProfile();
      success();
      setShowSetupModal(false);
      Toast.show({ type: 'success', text1: '2FA berhasil diaktifkan' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.response?.data?.message || 'Kode tidak valid. Coba lagi.' });
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (disableCode.length < 6) {
      Toast.show({ type: 'error', text1: 'Masukkan kode 6 digit dari authenticator' });
      return;
    }
    setTwoFaLoading(true);
    try {
      await api.post('/auth/2fa/disable', { code: disableCode });
      setTwoFaEnabled(false);
      await fetchProfile();
      setShowDisableModal(false);
      Toast.show({ type: 'info', text1: '2FA dinonaktifkan' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.response?.data?.message || 'Kode tidak valid' });
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleLogoutAll = () => {
    selection();
    Alert.alert(
      'Logout Semua Perangkat',
      'Semua sesi aktif akan dihentikan. Anda harus login kembali.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Logout Semua',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/auth/logout-all');
              success();
              Toast.show({ type: 'success', text1: 'Semua sesi berhasil dihentikan' });
            } catch {
              Toast.show({ type: 'error', text1: 'Gagal menghentikan sesi' });
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      {/* 2FA Section */}
      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <Text style={styles.sectionTitle}>Verifikasi Dua Langkah (2FA)</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons name="shield-checkmark" size={20} color={twoFaEnabled ? COLORS.success : COLORS.textMuted} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>2FA (TOTP)</Text>
              <Text style={styles.settingDesc}>
                {twoFaEnabled ? 'Aktif — Akun Anda terlindungi' : 'Nonaktif — Disarankan untuk diaktifkan'}
              </Text>
            </View>
            <Switch
              value={twoFaEnabled}
              onValueChange={handleToggle2FA}
              trackColor={{ false: COLORS.darkBorder, true: COLORS.success + '60' }}
              thumbColor={twoFaEnabled ? COLORS.success : COLORS.textMuted}
              disabled={twoFaLoading}
            />
          </View>
        </View>
      </Animated.View>

      {/* Change Password */}
      <Animated.View entering={FadeInDown.delay(200).duration(400)}>
        <Text style={styles.sectionTitle}>Ubah Password</Text>
        <View style={styles.card}>
          <Input
            label="Password Saat Ini"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry={!showCurrentPw}
            icon="lock-closed-outline"
            rightIcon={showCurrentPw ? 'eye-off-outline' : 'eye-outline'}
            onRightIconPress={() => setShowCurrentPw(!showCurrentPw)}
            containerStyle={styles.inputGap}
          />
          <Input
            label="Password Baru"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showNewPw}
            icon="key-outline"
            rightIcon={showNewPw ? 'eye-off-outline' : 'eye-outline'}
            onRightIconPress={() => setShowNewPw(!showNewPw)}
            containerStyle={styles.inputGap}
          />
          <Input
            label="Konfirmasi Password Baru"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showNewPw}
            icon="key-outline"
            containerStyle={styles.inputGap}
          />

          {/* Password strength hints */}
          <View style={styles.hintRow}>
            <PasswordHint met={newPassword.length >= 8} label="Minimal 8 karakter" />
            <PasswordHint met={/[A-Z]/.test(newPassword)} label="Huruf kapital" />
            <PasswordHint met={/[0-9]/.test(newPassword)} label="Angka" />
            <PasswordHint met={/[^A-Za-z0-9]/.test(newPassword)} label="Simbol" />
          </View>

          <GradientButton
            title="Ubah Password"
            onPress={handleChangePassword}
            loading={passwordLoading}
            disabled={!currentPassword || !newPassword || !confirmPassword}
            style={{ marginTop: SPACING.md }}
          />
        </View>
      </Animated.View>

      {/* Active Sessions */}
      <Animated.View entering={FadeInDown.delay(300).duration(400)}>
        <Text style={styles.sectionTitle}>Sesi Aktif</Text>
        <View style={styles.card}>
          {sessions.length === 0 ? (
            <Text style={styles.noSessions}>Tidak ada data sesi</Text>
          ) : (
            sessions.slice(0, 5).map((session: any, idx: number) => (
              <View key={session.id || idx} style={[styles.sessionItem, idx < sessions.length - 1 && styles.sessionBorder]}>
                <Ionicons
                  name={session.device?.includes('Mobile') ? 'phone-portrait-outline' : 'desktop-outline'}
                  size={18}
                  color={COLORS.textSecondary}
                />
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionDevice}>{session.device || 'Unknown device'}</Text>
                  <Text style={styles.sessionMeta}>
                    {session.ip || 'Unknown IP'} • {session.lastActive ? new Date(session.lastActive).toLocaleDateString('id-ID') : '-'}
                  </Text>
                </View>
                {session.current && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentText}>Sekarang</Text>
                  </View>
                )}
              </View>
            ))
          )}

          <TouchableOpacity style={styles.logoutAllBtn} onPress={handleLogoutAll}>
            <Ionicons name="log-out-outline" size={16} color={COLORS.error} />
            <Text style={styles.logoutAllText}>Logout Semua Perangkat</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Security Tips */}
      <Animated.View entering={FadeInDown.delay(400).duration(400)}>
        <Text style={styles.sectionTitle}>Tips Keamanan</Text>
        <View style={styles.card}>
          <SecurityTip icon="checkmark-circle" text="Gunakan password yang kuat dan unik" />
          <SecurityTip icon="checkmark-circle" text="Aktifkan verifikasi 2 langkah (2FA)" />
          <SecurityTip icon="checkmark-circle" text="Jangan bagikan informasi login Anda" />
          <SecurityTip icon="checkmark-circle" text="Periksa aktivitas login secara berkala" />
        </View>
      </Animated.View>

      <View style={{ height: 40 }} />

      {/* 2FA Setup Modal */}
      <Modal visible={showSetupModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Setup 2FA</Text>
            <Text style={styles.modalDesc}>
              Buka Google Authenticator atau Authy, lalu tambahkan akun baru menggunakan kode di bawah:
            </Text>

            {/* Secret Key */}
            <View style={styles.secretBox}>
              <Text style={styles.secretLabel}>Kunci Rahasia</Text>
              <Text style={styles.secretText} selectable>{totpSecret}</Text>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={async () => {
                  try {
                    await Clipboard.setStringAsync(totpSecret);
                    Toast.show({ type: 'success', text1: 'Kunci disalin ke clipboard' });
                  } catch {
                    Toast.show({ type: 'info', text1: 'Tekan dan tahan kunci untuk menyalin' });
                  }
                }}
              >
                <Ionicons name="copy-outline" size={16} color={COLORS.gold} />
                <Text style={styles.copyText}>Salin</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalStepLabel}>Masukkan kode 6 digit dari authenticator:</Text>
            <Input
              label=""
              value={verifyCode}
              onChangeText={(t) => setVerifyCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="000000"
              maxLength={6}
              icon="key-outline"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowSetupModal(false)}>
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>
              <GradientButton
                title="Verifikasi & Aktifkan"
                onPress={handleVerify2FA}
                loading={verifyLoading}
                disabled={verifyCode.length < 6}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* 2FA Disable Modal */}
      <Modal visible={showDisableModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="warning-outline" size={32} color={COLORS.warning} style={{ alignSelf: 'center', marginBottom: 8 }} />
            <Text style={styles.modalTitle}>Nonaktifkan 2FA</Text>
            <Text style={styles.modalDesc}>
              Masukkan kode dari authenticator untuk mengonfirmasi. Ini akan mengurangi keamanan akun Anda.
            </Text>

            <Input
              label=""
              value={disableCode}
              onChangeText={(t) => setDisableCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="000000"
              maxLength={6}
              icon="key-outline"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowDisableModal(false)}>
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.disableConfirmBtn, disableCode.length < 6 && { opacity: 0.5 }]}
                onPress={handleDisable2FA}
                disabled={disableCode.length < 6 || twoFaLoading}
              >
                <Text style={styles.disableConfirmText}>{twoFaLoading ? 'Memproses...' : 'Nonaktifkan'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function PasswordHint({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={styles.hintItem}>
      <Ionicons name={met ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={met ? COLORS.success : COLORS.textMuted} />
      <Text style={[styles.hintText, met && { color: COLORS.success }]}>{label}</Text>
    </View>
  );
}

function SecurityTip({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.tipRow}>
      <Ionicons name={icon as any} size={16} color={COLORS.success} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  scroll: { padding: SPACING.base, paddingBottom: 40 },
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
  card: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
    ...SHADOWS.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.darkElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  settingDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  inputGap: { marginBottom: SPACING.md },
  hintRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  hintItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hintText: { fontSize: 11, color: COLORS.textMuted },
  noSessions: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', paddingVertical: SPACING.lg },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  sessionBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.darkBorder + '50' },
  sessionInfo: { flex: 1 },
  sessionDevice: { fontSize: 14, fontWeight: '500', color: COLORS.textPrimary },
  sessionMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.success + '20',
  },
  currentText: { fontSize: 10, fontWeight: '700', color: COLORS.success },
  logoutAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.darkBorder + '50',
  },
  logoutAllText: { fontSize: 14, fontWeight: '600', color: COLORS.error },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 6,
  },
  tipText: { fontSize: 13, color: COLORS.textSecondary },
  // 2FA Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  modalDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  secretBox: {
    backgroundColor: COLORS.darkElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  secretLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  secretText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gold,
    fontFamily: 'monospace',
    letterSpacing: 2,
    marginBottom: 8,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  copyText: { fontSize: 13, color: COLORS.gold, fontWeight: '600' },
  modalStepLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
    alignItems: 'center',
  },
  modalCancel: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.darkBorder,
  },
  modalCancelText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
  disableConfirmBtn: {
    flex: 1,
    backgroundColor: COLORS.error,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  disableConfirmText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

