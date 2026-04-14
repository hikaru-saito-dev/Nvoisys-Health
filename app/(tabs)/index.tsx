import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PatientTheme as T } from '@/constants/patient-theme';
import { usePatientAuth } from '@/contexts/PatientAuthContext';
import { deletePatientWound, fetchPatientAppointments, fetchPatientWounds } from '@/lib/patient/api';
import type { AppointmentRecord, WoundSummary } from '@/lib/patient/types';

type AuthMode = 'signin' | 'register';

function woundStatusLabel(raw: string) {
  const map: Record<string, string> = {
    review_pending: 'Review pending',
    reviewed: 'Reviewed',
    closed: 'Closed',
  };
  if (map[raw]) return map[raw];
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PatientDashboardScreen() {
  const { ready, user, isPatient, signIn, signUpPatient, signOut } = usePatientAuth();
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [wounds, setWounds] = useState<WoundSummary[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [a, w] = await Promise.all([fetchPatientAppointments(), fetchPatientWounds()]);
      setAppointments(a);
      setWounds(w);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDeleteWound = (w: WoundSummary) => {
    const preview = (w.description || 'this report').trim().slice(0, 72);
    Alert.alert('Delete wound report', `Remove “${preview}”? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePatientWound(w.id);
            await load();
          } catch (e: unknown) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Delete failed.');
          }
        },
      },
    ]);
  };

  const onSignIn = async () => {
    setAuthError('');
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'Sign in failed';
      setAuthError(msg);
    } finally {
      setBusy(false);
    }
  };

  const onRegister = async () => {
    setAuthError('');
    if (!name.trim()) {
      setAuthError('Please enter your name.');
      return;
    }
    if (!email.trim()) {
      setAuthError('Please enter your email.');
      return;
    }
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }
    if (password !== passwordConfirm) {
      setAuthError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await signUpPatient({ name: name.trim(), email: email.trim(), password });
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'Registration failed';
      setAuthError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Ionicons name="heart" size={22} color={T.brand} />
            </View>
            <View>
              <Text style={styles.title}>Nvoisys Health</Text>
              <Text style={styles.sub}>Your care, appointments, and reports in one place.</Text>
            </View>
          </View>

          <View style={styles.segment}>
            <Pressable
              style={[styles.segmentBtn, authMode === 'signin' && styles.segmentBtnActive]}
              onPress={() => {
                setAuthMode('signin');
                setAuthError('');
              }}>
              <Text style={[styles.segmentText, authMode === 'signin' && styles.segmentTextActive]}>Sign in</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, authMode === 'register' && styles.segmentBtnActive]}
              onPress={() => {
                setAuthMode('register');
                setAuthError('');
              }}>
              <Text style={[styles.segmentText, authMode === 'register' && styles.segmentTextActive]}>Register</Text>
            </Pressable>
          </View>

          {authMode === 'register' ? (
            <>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                autoComplete="name"
              />
            </>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder={authMode === 'register' ? 'At least 8 characters' : '••••••••'}
            autoComplete={authMode === 'register' ? 'password-new' : 'password'}
          />
          {authMode === 'register' ? (
            <>
              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                placeholder="Repeat password"
                autoComplete="password-new"
              />
              <Text style={styles.hint}>
                Creating a patient account. Your organisation must allow sign-up on the server.
              </Text>
            </>
          ) : null}

          {authError ? <Text style={styles.error}>{authError}</Text> : null}

          {authMode === 'signin' ? (
            <Pressable style={[styles.primaryBtn, busy && styles.disabled]} onPress={onSignIn} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign in</Text>}
            </Pressable>
          ) : (
            <Pressable style={[styles.primaryBtn, busy && styles.disabled]} onPress={onRegister} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create patient account</Text>}
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Hello{user.name ? `, ${user.name}` : ''}</Text>
            <Text style={styles.sub}>{isPatient ? 'Patient account' : `Role: ${String(user.role)}`}</Text>
          </View>
          <Pressable onPress={signOut} style={styles.outlineBtn}>
            <Text style={styles.outlineBtnText}>Sign out</Text>
          </Pressable>
        </View>

        {!isPatient ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              You are signed in as {String(user.role)}. Use a patient account for wound reports and appointments.
            </Text>
          </View>
        ) : null}

        <Text style={styles.section}>Quick actions</Text>
        <View style={styles.row}>
          <Link href="/(tabs)/doctors" asChild>
            <Pressable style={styles.actionCard}>
              <View style={styles.actionIcon}>
                <Ionicons name="search" size={22} color={T.brand} />
              </View>
              <Text style={styles.cardTitle}>Find doctors</Text>
              <Text style={styles.cardHint}>Search and book visits</Text>
            </Pressable>
          </Link>
          <Link href="/(tabs)/wound-check" asChild>
            <Pressable style={[styles.actionCard, styles.actionCardLast]}>
              <View style={styles.actionIcon}>
                <Ionicons name="camera" size={22} color={T.brand} />
              </View>
              <Text style={styles.cardTitle}>Wound check</Text>
              <Text style={styles.cardHint}>Photo and clinical notes</Text>
            </Pressable>
          </Link>
        </View>

        <Text style={styles.section}>Upcoming appointments</Text>
        {appointments.length === 0 ? (
          <Text style={styles.empty}>No appointments yet. Book from a doctor profile.</Text>
        ) : (
          appointments.slice(0, 5).map((a) => (
            <View key={a.id} style={styles.listItem}>
              <Text style={styles.listTitle}>{a.doctorName || 'Doctor'}</Text>
              <Text style={styles.listMeta}>
                {a.scheduledAt || '—'} · {a.slotLabel || '—'} · {a.status}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.section}>Your wound reports</Text>
        {wounds.length === 0 ? (
          <Text style={styles.empty}>No wound reports yet.</Text>
        ) : (
          wounds.slice(0, 5).map((w) => (
            <View key={w.id} style={styles.woundRow}>
              <View style={styles.woundRowBody}>
                <Text style={styles.listTitle} numberOfLines={1}>
                  {w.description || 'Wound case'}
                </Text>
                <Text style={styles.listMeta}>
                  {woundStatusLabel(w.status)} · {w.created?.slice(0, 10) || ''}
                </Text>
              </View>
              <Pressable
                onPress={() => confirmDeleteWound(w)}
                style={({ pressed }) => [styles.woundDelete, pressed && styles.woundDeletePressed]}
                hitSlop={10}
                accessibilityLabel="Delete wound report">
                <Ionicons name="trash-outline" size={22} color={T.danger} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  authScroll: { padding: 24, paddingTop: 40 },
  scroll: { padding: 20, paddingBottom: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: T.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  title: { fontSize: 26, fontWeight: '800', color: T.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: T.textSecondary, marginTop: 4, maxWidth: 260, lineHeight: 20 },
  segment: {
    flexDirection: 'row',
    backgroundColor: T.border,
    borderRadius: T.radiusMd,
    padding: 4,
    marginBottom: 22,
  },
  segmentBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
  segmentBtnActive: { backgroundColor: T.bgElevated, ...T.shadowSoft },
  segmentText: { fontSize: 15, fontWeight: '600', color: T.textSecondary },
  segmentTextActive: { color: T.brand },
  label: { fontSize: 12, fontWeight: '700', color: T.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  hint: { fontSize: 12, color: T.textMuted, marginBottom: 12, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.radiusMd,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: T.text,
    backgroundColor: T.bgElevated,
    marginBottom: 14,
    ...T.shadowSoft,
  },
  error: { color: T.danger, marginBottom: 12, fontSize: 14 },
  primaryBtn: {
    backgroundColor: T.brand,
    borderRadius: T.radiusMd,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    ...T.shadowCard,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.radiusSm,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: T.bgElevated,
  },
  outlineBtnText: { color: T.textSecondary, fontWeight: '700', fontSize: 13 },
  banner: {
    backgroundColor: '#fffbeb',
    borderRadius: T.radiusMd,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  bannerText: { color: '#92400e', fontSize: 13, lineHeight: 19 },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', marginBottom: 8 },
  actionCard: {
    flex: 1,
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusLg,
    padding: 16,
    borderWidth: 1,
    borderColor: T.border,
    marginRight: 10,
    minHeight: 112,
    ...T.shadowCard,
  },
  actionCardLast: { marginRight: 0 },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: T.text },
  cardHint: { fontSize: 12, color: T.textSecondary, marginTop: 4, lineHeight: 17 },
  empty: { color: T.textMuted, fontSize: 14, marginBottom: 12 },
  listItem: {
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusMd,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: T.border,
    ...T.shadowSoft,
  },
  woundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusMd,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: T.border,
    ...T.shadowSoft,
  },
  woundRowBody: { flex: 1, minWidth: 0, paddingRight: 8 },
  woundDelete: {
    width: 44,
    height: 44,
    borderRadius: T.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  woundDeletePressed: { opacity: 0.65, backgroundColor: T.dangerMuted },
  listTitle: { fontSize: 16, fontWeight: '700', color: T.text },
  listMeta: { fontSize: 13, color: T.textSecondary, marginTop: 6, lineHeight: 18 },
});
