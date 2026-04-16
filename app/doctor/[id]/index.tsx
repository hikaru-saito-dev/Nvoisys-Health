import { Ionicons } from '@expo/vector-icons';
import { ClientResponseError } from 'pocketbase';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePatientUi } from '@/constants/patient-theme';
import { getDoctorDetail } from '@/lib/patient/api';
import type { DoctorListItem } from '@/lib/patient/types';

export default function DoctorProfileScreen() {
  const T = usePatientUi();
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
      <ThemedView style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={T.brand} />
              <ThemedText style={[styles.loadingText, { color: T.textMuted }]}>Loading profile…</ThemedText>
            </View>
          ) : error || !doctor ? (
            <View style={styles.centered}>
              <Ionicons name="alert-circle-outline" size={48} color={T.textMuted} />
              <ThemedText style={{ color: T.danger, marginTop: 12, textAlign: 'center', fontSize: 15 }}>
                {error || 'Not found'}
              </ThemedText>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <ThemedView style={[styles.heroCard, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowCard]}>
                <View style={[styles.avatar, { backgroundColor: T.brandMuted }]}>
                  <ThemedText type="defaultSemiBold" style={{ fontSize: 32, color: T.brand }}>
                    {doctor.name.slice(0, 2).toUpperCase()}
                  </ThemedText>
                </View>
                <ThemedText type="title" style={{ fontSize: 26, textAlign: 'center', letterSpacing: -0.4 }}>
                  {doctor.name}
                </ThemedText>
                <View style={[styles.specialtyPill, { backgroundColor: T.brandMuted }]}>
                  <ThemedText type="defaultSemiBold" style={{ fontSize: 14, color: T.brandDark }}>
                    {doctor.specialty}
                  </ThemedText>
                </View>
                {doctor.department ? (
                  <ThemedText style={{ fontSize: 14, color: T.textSecondary, marginTop: 8, textAlign: 'center' }}>
                    {doctor.department}
                  </ThemedText>
                ) : null}
                <View style={styles.metaRow}>
                  {typeof doctor.rating === 'number' ? (
                    <View style={[styles.metaChip, { backgroundColor: T.bg, borderColor: T.border }]}>
                      <Ionicons name="star" size={14} color="#b45309" />
                      <ThemedText type="defaultSemiBold" style={{ marginLeft: 6, fontSize: 13, color: T.text }}>
                        {doctor.rating.toFixed(1)}
                      </ThemedText>
                    </View>
                  ) : null}
                  {typeof doctor.experienceYears === 'number' ? (
                    <View style={[styles.metaChip, { backgroundColor: T.bg, borderColor: T.border }]}>
                      <Ionicons name="time-outline" size={14} color={T.brand} />
                      <ThemedText type="defaultSemiBold" style={{ marginLeft: 6, fontSize: 13, color: T.text }}>
                        {doctor.experienceYears}+ yrs
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </ThemedView>

              <ThemedView style={[styles.block, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft]}>
                <ThemedText type="defaultSemiBold" style={[styles.blockTitle, { color: T.textSecondary }]}>
                  About
                </ThemedText>
                <ThemedText style={{ fontSize: 16, color: T.textSecondary, lineHeight: 24 }}>
                  {doctor.bio || 'No biography has been added yet.'}
                </ThemedText>
              </ThemedView>

              {doctor.email ? (
                <ThemedView style={[styles.block, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft]}>
                  <ThemedText type="defaultSemiBold" style={[styles.blockTitle, { color: T.textSecondary }]}>
                    Contact
                  </ThemedText>
                  <View style={styles.contactRow}>
                    <Ionicons name="mail-outline" size={20} color={T.brand} />
                    <ThemedText type="defaultSemiBold" style={{ marginLeft: 10, fontSize: 16, color: T.brand, flex: 1 }}>
                      {doctor.email}
                    </ThemedText>
                  </View>
                </ThemedView>
              ) : null}

              <Pressable
                style={[styles.primary, { backgroundColor: T.brand }, T.shadowCard]}
                onPress={() =>
                  router.push({
                    pathname: '/doctor/[id]/book',
                    params: { id: String(id) },
                  } as unknown as Href)
                }>
                <Ionicons name="calendar" size={20} color="#fff" style={styles.primaryIcon} />
                <ThemedText style={styles.primaryText}>Book appointment</ThemedText>
              </Pressable>
            </ScrollView>
          )}
        </SafeAreaView>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14 },
  heroCard: {
    alignItems: 'center',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  specialtyPill: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 14 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginHorizontal: 4,
    marginBottom: 4,
  },
  block: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
  },
  blockTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  contactRow: { flexDirection: 'row', alignItems: 'center' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryIcon: { marginRight: 8 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 17 },
});
