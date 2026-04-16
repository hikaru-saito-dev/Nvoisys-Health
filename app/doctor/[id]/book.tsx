import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePatientUi } from '@/constants/patient-theme';
import { usePatientAuth } from '@/contexts/PatientAuthContext';
import { createAppointment, formatAppointmentBookingError, getDoctorDetail } from '@/lib/patient/api';
import type { DoctorListItem } from '@/lib/patient/types';

const TIME_SLOTS = ['9:00 AM', '10:30 AM', '1:00 PM', '3:30 PM', '5:00 PM'];
const CONSULT_TYPES = ['Video consult', 'In-person', 'Follow-up'];

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export default function BookAppointmentScreen() {
  const T = usePatientUi();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isPatient } = usePatientAuth();
  const [doctor, setDoctor] = useState<DoctorListItem | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [consultType, setConsultType] = useState(CONSULT_TYPES[0]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)), []);

  useEffect(() => {
    if (!id) return;
    getDoctorDetail(String(id)).then(setDoctor).catch(() => setDoctor(null));
  }, [id]);

  const selectedDate = days[dayIndex];
  const iso = selectedDate.toISOString();

  const confirm = async () => {
    if (!user?.id) {
      Alert.alert('Sign in', 'Sign in on the Home tab first.');
      return;
    }
    if (!isPatient) {
      Alert.alert('Patients only', 'Book appointments with a patient account.');
      return;
    }
    if (!id || !slot) {
      Alert.alert('Time slot', 'Please choose a time slot.');
      return;
    }
    setBusy(true);
    try {
      await createAppointment({
        doctorUserId: String(id),
        scheduledAt: iso,
        slotLabel: slot,
        consultType,
        notes,
      });
      Alert.alert('Booked', 'Your appointment request was sent.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      const hint = formatAppointmentBookingError(e);
      Alert.alert('Could not book', hint);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Book', headerShadowVisible: false, headerStyle: { backgroundColor: T.bg } }} />
      <ThemedView style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <ThemedView style={[styles.docCard, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft]}>
              <View style={[styles.docAvatar, { backgroundColor: T.brandMuted }]}>
                <ThemedText type="defaultSemiBold" style={{ fontSize: 18, color: T.brand }}>
                  {(doctor?.name || 'DR').slice(0, 2).toUpperCase()}
                </ThemedText>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="title" style={{ fontSize: 20, lineHeight: 24 }}>
                  {doctor?.name || 'Doctor'}
                </ThemedText>
                <ThemedText style={{ fontSize: 14, color: T.textSecondary, marginTop: 4 }}>
                  {doctor?.specialty || ''}
                </ThemedText>
              </View>
            </ThemedView>

            <ThemedText type="defaultSemiBold" style={[styles.label, { color: T.textSecondary }]}>
              Date
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
              {days.map((d, i) => {
                const active = dayIndex === i;
                return (
                  <Pressable
                    key={d.toISOString()}
                    style={[styles.dayChip, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft, active && { backgroundColor: T.brand, borderColor: T.brand }]}
                    onPress={() => setDayIndex(i)}>
                    <ThemedText
                      style={{ fontSize: 11, fontWeight: '700', color: active ? 'rgba(255,255,255,0.85)' : T.textMuted, textTransform: 'uppercase' }}>
                      {d.toLocaleDateString(undefined, { weekday: 'short' })}
                    </ThemedText>
                    <ThemedText
                      type="defaultSemiBold"
                      style={{ fontSize: 20, marginTop: 4, color: active ? '#fff' : T.text }}>
                      {d.getDate()}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ThemedText type="defaultSemiBold" style={[styles.label, { color: T.textSecondary }]}>
              Time
            </ThemedText>
            <View style={styles.slotGrid}>
              {TIME_SLOTS.map((t) => {
                const active = slot === t;
                return (
                  <Pressable
                    key={t}
                    style={[styles.slot, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft, active && { borderColor: T.brand, backgroundColor: T.brandMuted }]}
                    onPress={() => setSlot(t)}>
                    <ThemedText type="defaultSemiBold" style={{ fontSize: 13, color: active ? T.brandDark : T.textSecondary }}>
                      {t}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <ThemedText type="defaultSemiBold" style={[styles.label, { color: T.textSecondary }]}>
              Consult type
            </ThemedText>
            <View style={styles.slotGrid}>
              {CONSULT_TYPES.map((c) => {
                const active = consultType === c;
                return (
                  <Pressable
                    key={c}
                    style={[styles.slot, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft, active && { borderColor: T.brand, backgroundColor: T.brandMuted }]}
                    onPress={() => setConsultType(c)}>
                    <ThemedText type="defaultSemiBold" style={{ fontSize: 13, color: active ? T.brandDark : T.textSecondary }}>
                      {c}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <ThemedText type="defaultSemiBold" style={[styles.label, { color: T.textSecondary }]}>
              Notes (optional)
            </ThemedText>
            <TextInput
              style={[styles.notes, { backgroundColor: T.bgElevated, borderColor: T.border, color: T.text }, T.shadowSoft]}
              multiline
              placeholder="Symptoms, goals for this visit…"
              placeholderTextColor={T.textMuted}
              value={notes}
              onChangeText={setNotes}
            />

            <Pressable style={[styles.primary, { backgroundColor: T.brand }, T.shadowCard, busy && styles.disabled]} onPress={confirm} disabled={busy}>
              <Ionicons name="checkmark-circle" size={22} color="#fff" style={styles.primaryIcon} />
              <ThemedText style={styles.primaryText}>{busy ? 'Saving…' : 'Confirm booking'}</ThemedText>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
  },
  docAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 10,
  },
  rowScroll: { paddingBottom: 4 },
  dayChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 10,
    alignItems: 'center',
    minWidth: 68,
  },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  slot: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  notes: {
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    textAlignVertical: 'top',
    marginBottom: 22,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryIcon: { marginRight: 8 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  disabled: { opacity: 0.55 },
});
