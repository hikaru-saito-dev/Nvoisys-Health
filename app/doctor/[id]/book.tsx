import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.docCard}>
            <View style={styles.docAvatar}>
              <Text style={styles.docAvatarText}>{(doctor?.name || 'DR').slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.docName}>{doctor?.name || 'Doctor'}</Text>
              <Text style={styles.sub}>{doctor?.specialty || ''}</Text>
            </View>
          </View>

          <Text style={styles.label}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
            {days.map((d, i) => {
              const active = dayIndex === i;
              return (
                <Pressable
                  key={d.toISOString()}
                  style={[styles.dayChip, active && styles.dayChipOn]}
                  onPress={() => setDayIndex(i)}>
                  <Text style={[styles.dayDow, active && styles.dayChipOnMuted]}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
                  <Text style={[styles.dayNum, active && styles.dayChipOnText]}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Time</Text>
          <View style={styles.slotGrid}>
            {TIME_SLOTS.map((t) => {
              const active = slot === t;
              return (
                <Pressable key={t} style={[styles.slot, active && styles.slotOn]} onPress={() => setSlot(t)}>
                  <Text style={[styles.slotText, active && styles.slotTextOn]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Consult type</Text>
          <View style={styles.slotGrid}>
            {CONSULT_TYPES.map((c) => {
              const active = consultType === c;
              return (
                <Pressable key={c} style={[styles.slot, active && styles.slotOn]} onPress={() => setConsultType(c)}>
                  <Text style={[styles.slotText, active && styles.slotTextOn]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={styles.notes}
            multiline
            placeholder="Symptoms, goals for this visit…"
            placeholderTextColor={T.textMuted}
            value={notes}
            onChangeText={setNotes}
          />

          <Pressable style={[styles.primary, busy && styles.disabled]} onPress={confirm} disabled={busy}>
            <Ionicons name="checkmark-circle" size={22} color="#fff" style={styles.primaryIcon} />
            <Text style={styles.primaryText}>{busy ? 'Saving…' : 'Confirm booking'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  docCard: {
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
  docAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: T.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  docAvatarText: { fontSize: 18, fontWeight: '800', color: T.brand },
  docName: { fontSize: 20, fontWeight: '800', color: T.text },
  sub: { fontSize: 14, color: T.textSecondary, marginTop: 4 },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 10,
  },
  rowScroll: { paddingBottom: 4 },
  dayChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: T.radiusMd,
    backgroundColor: T.bgElevated,
    borderWidth: 1,
    borderColor: T.border,
    marginRight: 10,
    alignItems: 'center',
    minWidth: 68,
    ...T.shadowSoft,
  },
  dayChipOn: { backgroundColor: T.brand, borderColor: T.brand },
  dayDow: { fontSize: 11, fontWeight: '700', color: T.textMuted, textTransform: 'uppercase' },
  dayChipOnMuted: { color: 'rgba(255,255,255,0.85)' },
  dayNum: { fontSize: 20, fontWeight: '800', color: T.text, marginTop: 4 },
  dayChipOnText: { color: '#fff' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  slot: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: T.radiusMd,
    backgroundColor: T.bgElevated,
    borderWidth: 1,
    borderColor: T.border,
    marginRight: 8,
    marginBottom: 8,
    ...T.shadowSoft,
  },
  slotOn: { borderColor: T.brand, backgroundColor: T.brandMuted },
  slotText: { fontSize: 13, fontWeight: '700', color: T.textSecondary },
  slotTextOn: { color: T.brandDark },
  notes: {
    minHeight: 88,
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusMd,
    borderWidth: 1,
    borderColor: T.border,
    padding: 14,
    fontSize: 16,
    color: T.text,
    textAlignVertical: 'top',
    marginBottom: 22,
    ...T.shadowSoft,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.brand,
    borderRadius: T.radiusMd,
    paddingVertical: 16,
    ...T.shadowCard,
  },
  primaryIcon: { marginRight: 8 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  disabled: { opacity: 0.55 },
});
