import { Ionicons } from '@expo/vector-icons';
import { ClientResponseError } from 'pocketbase';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PatientTheme as T } from '@/constants/patient-theme';
import { getDoctorDetail } from '@/lib/patient/api';
import type { DoctorListItem } from '@/lib/patient/types';

export default function DoctorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [doctor, setDoctor] = useState<DoctorListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const d = await getDoctorDetail(String(id));
        if (!cancelled) setDoctor(d);
        if (!cancelled && !d) setError('Doctor not found.');
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof ClientResponseError ? e.message : 'Failed to load profile';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <Stack.Screen options={{ title: 'Doctor', headerShadowVisible: false, headerStyle: { backgroundColor: T.bg } }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={T.brand} />
            <Text style={styles.loadingText}>Loading profile…</Text>
          </View>
        ) : error || !doctor ? (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={48} color={T.textMuted} />
            <Text style={styles.error}>{error || 'Not found'}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{doctor.name.slice(0, 2).toUpperCase()}</Text>
              </View>
              <Text style={styles.name}>{doctor.name}</Text>
              <View style={styles.specialtyPill}>
                <Text style={styles.specialty}>{doctor.specialty}</Text>
              </View>
              {doctor.department ? <Text style={styles.dept}>{doctor.department}</Text> : null}
              <View style={styles.metaRow}>
                {typeof doctor.rating === 'number' ? (
                  <View style={styles.metaChip}>
                    <Ionicons name="star" size={14} color="#b45309" />
                    <Text style={styles.metaChipText}>{doctor.rating.toFixed(1)}</Text>
                  </View>
                ) : null}
                {typeof doctor.experienceYears === 'number' ? (
                  <View style={styles.metaChip}>
                    <Ionicons name="time-outline" size={14} color={T.brand} />
                    <Text style={styles.metaChipText}>{doctor.experienceYears}+ yrs</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>About</Text>
              <Text style={styles.bio}>{doctor.bio || 'No biography has been added yet.'}</Text>
            </View>

            {doctor.email ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Contact</Text>
                <View style={styles.contactRow}>
                  <Ionicons name="mail-outline" size={20} color={T.brand} />
                  <Text style={styles.email}>{doctor.email}</Text>
                </View>
              </View>
            ) : null}

            <Pressable
              style={styles.primary}
              onPress={() => router.push({ pathname: '/doctor/[id]/book', params: { id: String(id) } })}>
              <Ionicons name="calendar" size={20} color="#fff" style={styles.primaryIcon} />
              <Text style={styles.primaryText}>Book appointment</Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: T.textMuted },
  heroCard: {
    alignItems: 'center',
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusLg,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: T.border,
    ...T.shadowCard,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: T.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: T.brand },
  name: { fontSize: 26, fontWeight: '800', color: T.text, letterSpacing: -0.4, textAlign: 'center' },
  specialtyPill: {
    marginTop: 10,
    backgroundColor: T.brandMuted,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: T.radiusFull,
  },
  specialty: { fontSize: 14, fontWeight: '700', color: T.brandDark },
  dept: { fontSize: 14, color: T.textSecondary, marginTop: 8, textAlign: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 14 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: T.radiusFull,
    borderWidth: 1,
    borderColor: T.border,
    marginHorizontal: 4,
    marginBottom: 4,
  },
  metaChipText: { marginLeft: 6, fontSize: 13, fontWeight: '700', color: T.text },
  block: {
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusLg,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: T.border,
    ...T.shadowSoft,
  },
  blockTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  bio: { fontSize: 16, color: T.textSecondary, lineHeight: 24 },
  contactRow: { flexDirection: 'row', alignItems: 'center' },
  email: { marginLeft: 10, fontSize: 16, color: T.brand, fontWeight: '600', flex: 1 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    backgroundColor: T.brand,
    borderRadius: T.radiusMd,
    paddingVertical: 16,
    ...T.shadowCard,
  },
  primaryIcon: { marginRight: 8 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  error: { color: T.danger, marginTop: 12, textAlign: 'center', fontSize: 15 },
});
