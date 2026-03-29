import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { GradientButton } from '../../components/ui/GradientButton';
import { AvatarWithStatus } from '../../components/ui/AvatarWithStatus';
import { Input } from '../../components/Input';
import { COLORS, SPACING, RADIUS, SHADOWS, resolvePhotoUrl } from '../../constants/theme';
import { useAuthStore } from '../../stores/auth';
import { useHaptic } from '../../hooks/useHaptic';
import api from '../../lib/api';
import Toast from 'react-native-toast-message';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export function EditProfileScreen({ navigation }: Props) {
  const { user, fetchProfile } = useAuthStore();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const { selection, success } = useHaptic();

  const photoUri = localPhotoUri || resolvePhotoUrl(user?.profilePhoto);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Toast.show({ type: 'error', text1: 'Nama depan dan belakang harus diisi' });
      return;
    }
    setLoading(true);
    try {
      await api.patch('/auth/profile', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
      });
      await fetchProfile();
      success();
      Toast.show({ type: 'success', text1: 'Profil berhasil diperbarui' });
      navigation.goBack();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.response?.data?.message || 'Gagal menyimpan profil' });
    } finally {
      setLoading(false);
    }
  };

  const uploadPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    setLocalPhotoUri(asset.uri);
    setUploadingPhoto(true);
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      type: 'image/jpeg',
      name: 'profile.jpg',
    } as any);
    try {
      await api.post('/auth/profile/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await fetchProfile();
      success();
      Toast.show({ type: 'success', text1: 'Foto profil diperbarui' });
    } catch (err: any) {
      setLocalPhotoUri(null);
      Toast.show({ type: 'error', text1: err?.response?.data?.message || 'Gagal upload foto' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePickGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Izin Ditolak', 'Izinkan akses galeri untuk mengganti foto profil.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) uploadPhoto(result.assets[0]);
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Izin Ditolak', 'Izinkan akses kamera untuk mengambil foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) uploadPhoto(result.assets[0]);
  };

  const showPhotoOptions = () => {
    selection();
    Alert.alert('Foto Profil', 'Pilih sumber foto', [
      { text: 'Kamera', onPress: handleTakePhoto },
      { text: 'Galeri', onPress: handlePickGallery },
      { text: 'Batal', style: 'cancel' },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        {/* Avatar Section */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.avatarSection}>
          <TouchableOpacity onPress={showPhotoOptions} activeOpacity={0.8} style={styles.avatarWrap}>
            <AvatarWithStatus uri={photoUri} size={100} borderColor={COLORS.gold} />
            <View style={styles.cameraIcon}>
              <Ionicons name="camera" size={16} color={COLORS.dark} />
            </View>
            {uploadingPhoto && (
              <View style={styles.uploadingOverlay}>
                <Text style={styles.uploadingText}>...</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.changePhotoText}>Ketuk untuk mengganti foto</Text>
        </Animated.View>

        {/* Form */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <Text style={styles.sectionTitle}>Informasi Pribadi</Text>
          <View style={styles.card}>
            <Input
              label="Nama Depan"
              value={firstName}
              onChangeText={setFirstName}
              icon="person-outline"
              placeholder="Masukkan nama depan"
              containerStyle={styles.inputGap}
            />
            <Input
              label="Nama Belakang"
              value={lastName}
              onChangeText={setLastName}
              icon="person-outline"
              placeholder="Masukkan nama belakang"
              containerStyle={styles.inputGap}
            />
            <Input
              label="No. Telepon"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              icon="call-outline"
              placeholder="+62 812 3456 7890"
            />
          </View>
        </Animated.View>

        {/* Email (read-only) */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <Text style={styles.sectionTitle}>Akun</Text>
          <View style={styles.card}>
            <View style={styles.readOnlyField}>
              <Ionicons name="mail-outline" size={18} color={COLORS.textMuted} />
              <View style={styles.readOnlyInfo}>
                <Text style={styles.readOnlyLabel}>Email</Text>
                <Text style={styles.readOnlyValue}>{user?.email}</Text>
              </View>
              {user?.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              )}
            </View>
            <View style={[styles.readOnlyField, styles.readOnlyFieldBorder]}>
              <Ionicons name="shield-outline" size={18} color={COLORS.textMuted} />
              <View style={styles.readOnlyInfo}>
                <Text style={styles.readOnlyLabel}>Role</Text>
                <Text style={styles.readOnlyValue}>{user?.role === 'ESCORT' ? 'Escort' : 'Client'}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Save Button */}
        <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.saveSection}>
          <GradientButton
            title="Simpan Perubahan"
            onPress={handleSave}
            loading={loading}
            size="lg"
          />
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.dark },
  scroll: { padding: SPACING.base, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', paddingVertical: SPACING.xl },
  avatarWrap: { position: 'relative' },
  cameraIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.dark,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingText: { color: '#fff', fontWeight: '700' },
  changePhotoText: { fontSize: 13, color: COLORS.gold, marginTop: SPACING.sm, fontWeight: '500' },
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
  inputGap: { marginBottom: SPACING.md },
  readOnlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  readOnlyFieldBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.darkBorder + '50',
    paddingTop: SPACING.md,
  },
  readOnlyInfo: { flex: 1 },
  readOnlyLabel: { fontSize: 12, color: COLORS.textMuted },
  readOnlyValue: { fontSize: 15, color: COLORS.textPrimary, fontWeight: '500', marginTop: 2 },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.success + '15',
  },
  verifiedText: { fontSize: 11, fontWeight: '600', color: COLORS.success },
  saveSection: { marginTop: SPACING.xl },
});
