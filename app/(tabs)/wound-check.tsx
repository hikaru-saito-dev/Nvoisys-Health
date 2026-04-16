import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePatientUi } from '@/constants/patient-theme';
import { usePatientAuth } from '@/contexts/PatientAuthContext';
import { fetchDoctors, formatWoundSubmitError, submitWoundReport } from '@/lib/patient/api';
import type { DoctorListItem } from '@/lib/patient/types';

const WOUND_HEADER = { light: '#D0D0D0', dark: '#353636' } as const;

export default function WoundCheckScreen() {
  const T = usePatientUi();
  const { user, isPatient } = usePatientAuth();
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<DoctorListItem[]>([]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchDoctors({}).then(setDoctors).catch(() => setDoctors([]));
  }, []);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach an image.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      setImageUri(res.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to capture a wound photo.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled && res.assets[0]?.uri) {
      setImageUri(res.assets[0].uri);
    }
  };

  const onSubmit = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Sign in required', 'Use the Home tab to sign in first.');
      return;
    }
    if (!isPatient) {
      Alert.alert('Patient only', 'Wound reports are for patient accounts.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Description', 'Please describe the wound or concern.');
      return;
    }
    setBusy(true);
    try {
      const result = await submitWoundReport({
        description: description.trim(),
        imageUri,
        doctorUserId: doctorId,
      });
      if (result.threadStarted) {
        Alert.alert('Sent', 'Your wound report was submitted for doctor review.');
      } else {
        Alert.alert(
          'Report saved',
          'Your wound report was saved and appears on Home. Starting the clinical chat thread failed (server rules or missing collections). Your care team can still see the report.',
        );
      }
      setDescription('');
      setImageUri(null);
      setDoctorId(null);
    } catch (e: unknown) {
      Alert.alert('Error', formatWoundSubmitError(e));
    } finally {
      setBusy(false);
    }
  }, [user?.id, isPatient, description, imageUri, doctorId]);

  return (
    <ParallaxScrollView
      headerBackgroundColor={WOUND_HEADER}
      headerImage={
        <IconSymbol name="photo" size={220} color="#808080" style={styles.headerImage} />
      }>
      <ThemedView style={styles.hero}>
        <View style={[styles.heroIcon, { backgroundColor: T.brandMuted }]}>
          <Ionicons name="camera" size={24} color={T.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText type="title" style={{ fontSize: 22, lineHeight: 26 }}>
            Wound check
          </ThemedText>
          <ThemedText style={{ fontSize: 14, color: T.textSecondary, marginTop: 6, lineHeight: 20 }}>
            Securely share photos and details with your clinical team.
          </ThemedText>
        </View>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="defaultSemiBold" style={[styles.label, { color: T.textSecondary }]}>
          Clinical notes
        </ThemedText>
        <TextInput
          style={[styles.area, { backgroundColor: T.bgElevated, borderColor: T.border, color: T.text }, T.shadowSoft]}
          multiline
          placeholder="Location, appearance, pain level, when it started…"
          placeholderTextColor={T.textMuted}
          value={description}
          onChangeText={setDescription}
        />
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="defaultSemiBold" style={[styles.label, { color: T.textSecondary }]}>
          Photo (optional)
        </ThemedText>
        <View style={styles.photoRow}>
          <Pressable
            style={[styles.photoBtn, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft]}
            onPress={pickImage}>
            <Ionicons name="images-outline" size={22} color={T.brand} style={styles.photoBtnIcon} />
            <ThemedText type="defaultSemiBold" style={{ fontSize: 15, color: T.brand }}>
              Gallery
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.photoBtn, styles.photoBtnLast, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft]}
            onPress={takePhoto}>
            <Ionicons name="camera-outline" size={22} color={T.brand} style={styles.photoBtnIcon} />
            <ThemedText type="defaultSemiBold" style={{ fontSize: 15, color: T.brand }}>
              Camera
            </ThemedText>
          </Pressable>
        </View>
        {imageUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: imageUri }} style={[styles.preview, { backgroundColor: T.border }]} />
            <Pressable style={styles.removePhoto} onPress={() => setImageUri(null)}>
              <Ionicons name="close-circle" size={28} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="defaultSemiBold" style={[styles.label, { color: T.textSecondary }]}>
          Notify (optional)
        </ThemedText>
        <ThemedText style={[styles.hint, { color: T.textMuted }]}>
          Choose a doctor to prioritise, or leave as all providers on duty.
        </ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.docChips}>
          <Pressable
            style={[styles.docChip, { backgroundColor: T.bgElevated, borderColor: T.border }, doctorId === null && { backgroundColor: T.brand, borderColor: T.brand }]}
            onPress={() => setDoctorId(null)}>
            <ThemedText
              type="defaultSemiBold"
              style={{ fontSize: 13, color: doctorId === null ? '#fff' : T.textSecondary }}>
              All on duty
            </ThemedText>
          </Pressable>
          {doctors.map((d) => (
            <Pressable
              key={d.id}
              style={[styles.docChip, { backgroundColor: T.bgElevated, borderColor: T.border }, doctorId === d.id && { backgroundColor: T.brand, borderColor: T.brand }]}
              onPress={() => setDoctorId(d.id)}>
              <ThemedText
                type="defaultSemiBold"
                style={{ fontSize: 13, color: doctorId === d.id ? '#fff' : T.textSecondary }}
                numberOfLines={1}>
                {d.name}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </ThemedView>

      <Pressable
        style={[styles.primary, { backgroundColor: T.brand }, T.shadowCard, (busy || !user) && styles.disabled]}
        onPress={onSubmit}
        disabled={busy || !user}>
        <Ionicons name="paper-plane" size={20} color="#fff" style={styles.primaryIcon} />
        <ThemedText style={styles.primaryText}>{busy ? 'Sending…' : 'Submit to clinical team'}</ThemedText>
      </Pressable>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    bottom: -40,
    left: 20,
    position: 'absolute',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 14,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginBottom: 22 },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  area: {
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  photoRow: { flexDirection: 'row' },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
  },
  photoBtnLast: { marginRight: 0 },
  photoBtnIcon: { marginRight: 8 },
  primaryIcon: { marginRight: 8 },
  previewWrap: { marginTop: 14, position: 'relative' },
  preview: { width: '100%', height: 200, borderRadius: 14 },
  removePhoto: { position: 'absolute', top: 10, right: 10 },
  hint: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  docChips: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  docChip: {
    paddingHorizontal: 14,
    height: 36,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    maxWidth: 160,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.5 },
});
