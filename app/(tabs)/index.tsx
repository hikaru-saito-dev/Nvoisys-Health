import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
} from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePatientUi } from '@/constants/patient-theme';
import { usePatientAuth } from '@/contexts/PatientAuthContext';
import { deletePatientWound, fetchPatientAppointments, fetchPatientWounds } from '@/lib/patient/api';
import type { AppointmentRecord, WoundSummary } from '@/lib/patient/types';

type AuthMode = 'signin' | 'register';

const HOME_HEADER = { light: '#A1CEDC', dark: '#1D3D47' } as const;

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
  const T = usePatientUi();
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
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={T.brand} />
      </ThemedView>
    );
  }

  if (!user) {
    return (
      <ParallaxScrollView
        headerBackgroundColor={HOME_HEADER}
        headerImage={
          <Image source={require('@/assets/images/partial-react-logo.png')} style={styles.reactLogo} />
        }>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">Nvoisys Health</ThemedText>
          <HelloWave />
        </ThemedView>
        <ThemedView style={styles.stepContainer}>
          <ThemedText type="subtitle">Patient sign in</ThemedText>
          <ThemedText>Your care, appointments, and reports in one place.</ThemedText>
        </ThemedView>

        <ThemedView style={[styles.segment, { backgroundColor: T.border }]}>
          <Pressable
            style={[
              styles.segmentBtn,
              authMode === 'signin' && { backgroundColor: T.bgElevated, ...T.shadowSoft },
            ]}
            onPress={() => {
              setAuthMode('signin');
              setAuthError('');
            }}>
            <ThemedText type="defaultSemiBold" style={{ color: authMode === 'signin' ? T.brand : T.textSecondary }}>
              Sign in
            </ThemedText>
          </Pressable>
          <Pressable
            style={[
              styles.segmentBtn,
              authMode === 'register' && { backgroundColor: T.bgElevated, ...T.shadowSoft },
            ]}
            onPress={() => {
              setAuthMode('register');
              setAuthError('');
            }}>
            <ThemedText type="defaultSemiBold" style={{ color: authMode === 'register' ? T.brand : T.textSecondary }}>
              Register
            </ThemedText>
          </Pressable>
        </ThemedView>

        {authMode === 'register' ? (
          <>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Full name
            </ThemedText>
            <TextInput
              style={[styles.input, { borderColor: T.border, color: T.text, backgroundColor: T.bgElevated }, T.shadowSoft]}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={T.textMuted}
              autoComplete="name"
            />
          </>
        ) : null}

        <ThemedText type="defaultSemiBold" style={styles.label}>
          Email
        </ThemedText>
        <TextInput
          style={[styles.input, { borderColor: T.border, color: T.text, backgroundColor: T.bgElevated }, T.shadowSoft]}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={T.textMuted}
          autoComplete="email"
        />
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Password
        </ThemedText>
        <TextInput
          style={[styles.input, { borderColor: T.border, color: T.text, backgroundColor: T.bgElevated }, T.shadowSoft]}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder={authMode === 'register' ? 'At least 8 characters' : '••••••••'}
          placeholderTextColor={T.textMuted}
          autoComplete={authMode === 'register' ? 'password-new' : 'password'}
        />
        {authMode === 'register' ? (
          <>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Confirm password
            </ThemedText>
            <TextInput
              style={[styles.input, { borderColor: T.border, color: T.text, backgroundColor: T.bgElevated }, T.shadowSoft]}
              secureTextEntry
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              placeholder="Repeat password"
              placeholderTextColor={T.textMuted}
              autoComplete="password-new"
            />
            <ThemedText style={{ color: T.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 18 }}>
              Creating a patient account. Your organisation must allow sign-up on the server.
            </ThemedText>
          </>
        ) : null}

        {authError ? (
          <ThemedText style={{ color: T.danger, marginBottom: 12, fontSize: 14 }}>{authError}</ThemedText>
        ) : null}

        {authMode === 'signin' ? (
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: T.brand }, T.shadowCard, busy && styles.disabled]}
            onPress={onSignIn}
            disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.primaryBtnText}>Sign in</ThemedText>}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: T.brand }, T.shadowCard, busy && styles.disabled]}
            onPress={onRegister}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.primaryBtnText}>Create patient account</ThemedText>
            )}
          </Pressable>
        )}
      </ParallaxScrollView>
    );
  }

  return (
    <ParallaxScrollView
      headerBackgroundColor={HOME_HEADER}
      headerImage={
        <Image source={require('@/assets/images/partial-react-logo.png')} style={styles.reactLogo} />
      }
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={T.brand} />}>
      <ThemedView style={styles.headerRow}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">Hello{user.name ? `, ${user.name}` : ''}</ThemedText>
          <HelloWave />
        </ThemedView>
        <Pressable
          onPress={signOut}
          style={[styles.outlineBtn, { borderColor: T.border, backgroundColor: T.bgElevated }]}>
          <ThemedText type="defaultSemiBold" style={{ color: T.textSecondary, fontSize: 13 }}>
            Sign out
          </ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedText style={{ color: T.textSecondary, marginBottom: 18 }}>
        {isPatient ? 'Patient account' : `Role: ${String(user.role)}`}
      </ThemedText>

      {!isPatient ? (
        <ThemedView
          style={{
            backgroundColor: '#fffbeb',
            borderRadius: T.radiusMd,
            padding: 14,
            marginBottom: 18,
            borderWidth: 1,
            borderColor: '#fde68a',
          }}>
          <ThemedText style={{ color: '#92400e', fontSize: 13, lineHeight: 19 }}>
            You are signed in as {String(user.role)}. Use a patient account for wound reports and appointments.
          </ThemedText>
        </ThemedView>
      ) : null}

      <ThemedText type="defaultSemiBold" style={[styles.section, { color: T.textSecondary }]}>
        Quick actions
      </ThemedText>
      <ThemedView style={styles.row}>
        <Link href={'/(tabs)/doctors' as Href} asChild>
          <Pressable
            style={[
              styles.actionCard,
              { backgroundColor: T.bgElevated, borderColor: T.border, marginRight: 10 },
              T.shadowCard,
            ]}>
            <ThemedView style={[styles.actionIcon, { backgroundColor: T.brandMuted }]}>
              <Ionicons name="search" size={22} color={T.brand} />
            </ThemedView>
            <ThemedText type="defaultSemiBold">Find doctors</ThemedText>
            <ThemedText style={{ fontSize: 12, color: T.textSecondary, marginTop: 4, lineHeight: 17 }}>
              Search and book visits
            </ThemedText>
          </Pressable>
        </Link>
        <Link href={'/(tabs)/wound-check' as Href} asChild>
          <Pressable
            style={[styles.actionCard, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowCard]}>
            <ThemedView style={[styles.actionIcon, { backgroundColor: T.brandMuted }]}>
              <Ionicons name="camera" size={22} color={T.brand} />
            </ThemedView>
            <ThemedText type="defaultSemiBold">Wound check</ThemedText>
            <ThemedText style={{ fontSize: 12, color: T.textSecondary, marginTop: 4, lineHeight: 17 }}>
              Photo and clinical notes
            </ThemedText>
          </Pressable>
        </Link>
      </ThemedView>

      <ThemedText type="defaultSemiBold" style={[styles.section, { color: T.textSecondary }]}>
        Upcoming appointments
      </ThemedText>
      {appointments.length === 0 ? (
        <ThemedText style={{ color: T.textMuted, fontSize: 14, marginBottom: 12 }}>
          No appointments yet. Book from a doctor profile.
        </ThemedText>
      ) : (
        appointments.slice(0, 5).map((a) => (
          <ThemedView
            key={a.id}
            style={[styles.listItem, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft]}>
            <ThemedText type="defaultSemiBold">{a.doctorName || 'Doctor'}</ThemedText>
            <ThemedText style={{ fontSize: 13, color: T.textSecondary, marginTop: 6, lineHeight: 18 }}>
              {a.scheduledAt || '—'} · {a.slotLabel || '—'} · {a.status}
            </ThemedText>
          </ThemedView>
        ))
      )}

      <ThemedText type="defaultSemiBold" style={[styles.section, { color: T.textSecondary }]}>
        Your wound reports
      </ThemedText>
      {wounds.length === 0 ? (
        <ThemedText style={{ color: T.textMuted, fontSize: 14, marginBottom: 12 }}>
          No wound reports yet.
        </ThemedText>
      ) : (
        wounds.slice(0, 5).map((w) => (
          <ThemedView
            key={w.id}
            style={[
              styles.woundRow,
              { backgroundColor: T.bgElevated, borderColor: T.border },
              T.shadowSoft,
            ]}>
            <ThemedView style={styles.woundRowBody}>
              <ThemedText type="defaultSemiBold" numberOfLines={1}>
                {w.description || 'Wound case'}
              </ThemedText>
              <ThemedText style={{ fontSize: 13, color: T.textSecondary, marginTop: 6, lineHeight: 18 }}>
                {woundStatusLabel(w.status)} · {w.created?.slice(0, 10) || ''}
              </ThemedText>
            </ThemedView>
            <Pressable
              onPress={() => confirmDeleteWound(w)}
              style={({ pressed }) => [styles.woundDelete, pressed && { opacity: 0.65, backgroundColor: T.dangerMuted }]}
              hitSlop={10}
              accessibilityLabel="Delete wound report">
              <Ionicons name="trash-outline" size={22} color={T.danger} />
            </Pressable>
          </ThemedView>
        ))
      )}
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 22,
  },
  segmentBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12 },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  section: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 12,
    fontWeight: '800',
  },
  row: { flexDirection: 'row', marginBottom: 8 },
  actionCard: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    minHeight: 112,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  listItem: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  woundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
    marginBottom: 10,
    borderWidth: 1,
  },
  woundRowBody: { flex: 1, minWidth: 0, paddingRight: 8 },
  woundDelete: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
