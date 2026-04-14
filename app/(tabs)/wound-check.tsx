import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PatientTheme as T } from '@/constants/patient-theme';
import { usePatientAuth } from '@/contexts/PatientAuthContext';
import { fetchDoctors, formatWoundSubmitError, submitWoundReport } from '@/lib/patient/api';
import type { DoctorListItem } from '@/lib/patient/types';

export default function WoundCheckScreen() {
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="camera" size={24} color={T.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Wound check</Text>
            <Text style={styles.sub}>Securely share photos and details with your clinical team.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Clinical notes</Text>
          <TextInput
            style={styles.area}
            multiline
            placeholder="Location, appearance, pain level, when it started…"
            placeholderTextColor={T.textMuted}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Photo (optional)</Text>
          <View style={styles.photoRow}>
            <Pressable style={styles.photoBtn} onPress={pickImage}>
              <Ionicons name="images-outline" size={22} color={T.brand} style={styles.photoBtnIcon} />
              <Text style={styles.photoBtnText}>Gallery</Text>
            </Pressable>
            <Pressable style={[styles.photoBtn, styles.photoBtnLast]} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={22} color={T.brand} style={styles.photoBtnIcon} />
              <Text style={styles.photoBtnText}>Camera</Text>
            </Pressable>
          </View>
          {imageUri ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: imageUri }} style={styles.preview} />
              <Pressable style={styles.removePhoto} onPress={() => setImageUri(null)}>
                <Ionicons name="close-circle" size={28} color="#fff" />
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Notify (optional)</Text>
          <Text style={styles.hint}>Choose a doctor to prioritise, or leave as all providers on duty.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.docChips}>
            <Pressable
              style={[styles.docChip, doctorId === null && styles.docChipOn]}
              onPress={() => setDoctorId(null)}>
              <Text style={[styles.docChipText, doctorId === null && styles.docChipTextOn]}>All on duty</Text>
            </Pressable>
            {doctors.map((d) => (
              <Pressable
                key={d.id}
                style={[styles.docChip, doctorId === d.id && styles.docChipOn]}
                onPress={() => setDoctorId(d.id)}>
                <Text style={[styles.docChipText, doctorId === d.id && styles.docChipTextOn]} numberOfLines={1}>
                  {d.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Pressable
          style={[styles.primary, (busy || !user) && styles.disabled]}
          onPress={onSubmit}
          disabled={busy || !user}>
          <Ionicons name="paper-plane" size={20} color="#fff" style={styles.primaryIcon} />
          <Text style={styles.primaryText}>{busy ? 'Sending…' : 'Submit to clinical team'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusLg,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: T.border,
    ...T.shadowSoft,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: T.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  title: { fontSize: 22, fontWeight: '800', color: T.text, letterSpacing: -0.3 },
  sub: { fontSize: 14, color: T.textSecondary, marginTop: 6, lineHeight: 20 },
  section: { marginBottom: 22 },
  label: { fontSize: 12, fontWeight: '700', color: T.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  area: {
    minHeight: 120,
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusMd,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    fontSize: 16,
    color: T.text,
    textAlignVertical: 'top',
    ...T.shadowSoft,
  },
  photoRow: { flexDirection: 'row' },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusMd,
    borderWidth: 1,
    borderColor: T.border,
    paddingVertical: 14,
    ...T.shadowSoft,
  },
  photoBtnLast: { marginRight: 0 },
  photoBtnIcon: { marginRight: 8 },
  photoBtnText: { fontSize: 15, fontWeight: '700', color: T.brand },
  primaryIcon: { marginRight: 8 },
  previewWrap: { marginTop: 14, position: 'relative' },
  preview: { width: '100%', height: 200, borderRadius: T.radiusMd, backgroundColor: T.border },
  removePhoto: { position: 'absolute', top: 10, right: 10 },
  hint: { fontSize: 13, color: T.textMuted, marginBottom: 12, lineHeight: 18 },
  docChips: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  docChip: {
    paddingHorizontal: 14,
    height: 36,
    justifyContent: 'center',
    borderRadius: T.radiusFull,
    backgroundColor: T.bgElevated,
    borderWidth: 1,
    borderColor: T.border,
    marginRight: 8,
    maxWidth: 160,
  },
  docChipOn: { backgroundColor: T.brand, borderColor: T.brand },
  docChipText: { fontSize: 13, fontWeight: '600', color: T.textSecondary },
  docChipTextOn: { color: '#fff' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.brand,
    borderRadius: T.radiusMd,
    paddingVertical: 16,
    marginTop: 8,
    ...T.shadowCard,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.5 },
});
