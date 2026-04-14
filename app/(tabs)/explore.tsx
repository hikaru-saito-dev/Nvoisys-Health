import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PatientTheme as T } from '@/constants/patient-theme';

export default function MoreScreen() {
  const version =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? Constants.nativeBuildVersion ?? '—';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.sub}>Shortcuts and information for your care in Nvoisys Health.</Text>

        <Text style={styles.section}>Care</Text>
        <Link href="/(tabs)/doctors" asChild>
          <Pressable style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="search" size={22} color={T.brand} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Find doctors</Text>
              <Text style={styles.rowHint}>Search profiles and book a visit</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={T.textMuted} />
          </Pressable>
        </Link>
        <Link href="/(tabs)/wound-check" asChild>
          <Pressable style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="camera-outline" size={22} color={T.brand} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Wound check</Text>
              <Text style={styles.rowHint}>Add photos and notes for your care team</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={T.textMuted} />
          </Pressable>
        </Link>

        <Text style={styles.section}>Using the app</Text>
        <View style={styles.bulletCard}>
          <Text style={styles.bulletLine}>
            <Text style={styles.bulletMark}>• </Text>
            Sign in on Home to see appointments and wound reports pulled from your organisation.
          </Text>
          <Text style={styles.bulletLine}>
            <Text style={styles.bulletMark}>• </Text>
            Book from a doctor&apos;s profile; your upcoming visits appear on Home.
          </Text>
          <Text style={styles.bulletLine}>
            <Text style={styles.bulletMark}>• </Text>
            Use Wound check when your clinician has asked for follow-up images or descriptions.
          </Text>
        </View>

        <Text style={styles.section}>About</Text>
        <View style={styles.aboutCard}>
          <View style={styles.brandMark}>
            <Ionicons name="heart" size={22} color={T.brand} />
          </View>
          <View style={styles.aboutBody}>
            <Text style={styles.aboutTitle}>Nvoisys Health</Text>
            <Text style={styles.aboutMeta}>Patient app · Version {version}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  scroll: { padding: 20, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '800', color: T.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: T.textSecondary, marginTop: 8, marginBottom: 8, lineHeight: 20, maxWidth: 320 },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusMd,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: T.border,
    ...T.shadowSoft,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: T.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '800', color: T.text },
  rowHint: { fontSize: 13, color: T.textSecondary, marginTop: 4, lineHeight: 18 },
  bulletCard: {
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusMd,
    padding: 16,
    borderWidth: 1,
    borderColor: T.border,
    ...T.shadowSoft,
  },
  bulletLine: { fontSize: 14, color: T.textSecondary, lineHeight: 22, marginBottom: 10 },
  bulletMark: { color: T.brand, fontWeight: '800' },
  aboutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusLg,
    padding: 18,
    borderWidth: 1,
    borderColor: T.border,
    ...T.shadowCard,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: T.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  aboutBody: { flex: 1 },
  aboutTitle: { fontSize: 17, fontWeight: '800', color: T.text },
  aboutMeta: { fontSize: 13, color: T.textMuted, marginTop: 4 },
});
