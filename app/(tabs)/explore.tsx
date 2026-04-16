import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Collapsible } from '@/components/ui/collapsible';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePatientUi } from '@/constants/patient-theme';
import { Fonts } from '@/constants/theme';

const EXPLORE_HEADER = { light: '#D0D0D0', dark: '#353636' } as const;

export default function MoreScreen() {
  const T = usePatientUi();
  const version =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? Constants.nativeBuildVersion ?? '—';

  return (
    <ParallaxScrollView
      headerBackgroundColor={EXPLORE_HEADER}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="chevron.left.forwardslash.chevron.right"
          style={styles.headerImage}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText
          type="title"
          style={{
            fontFamily: Fonts.rounded,
          }}>
          Explore
        </ThemedText>
      </ThemedView>
      <ThemedText>Shortcuts and information for your care in Nvoisys Health.</ThemedText>

      <Collapsible title="Care">
        <Link href={'/(tabs)/doctors' as Href} asChild>
          <Pressable
            style={[styles.row, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft]}>
            <View style={[styles.rowIcon, { backgroundColor: T.brandMuted }]}>
              <Ionicons name="search" size={22} color={T.brand} />
            </View>
            <View style={styles.rowBody}>
              <ThemedText type="defaultSemiBold">Find doctors</ThemedText>
              <ThemedText style={{ fontSize: 13, marginTop: 4, lineHeight: 18, color: T.textSecondary }}>
                Search profiles and book a visit
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={T.textMuted} />
          </Pressable>
        </Link>
        <Link href={'/(tabs)/wound-check' as Href} asChild>
          <Pressable
            style={[styles.row, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft]}>
            <View style={[styles.rowIcon, { backgroundColor: T.brandMuted }]}>
              <Ionicons name="camera-outline" size={22} color={T.brand} />
            </View>
            <View style={styles.rowBody}>
              <ThemedText type="defaultSemiBold">Wound check</ThemedText>
              <ThemedText style={{ fontSize: 13, marginTop: 4, lineHeight: 18, color: T.textSecondary }}>
                Add photos and notes for your care team
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={T.textMuted} />
          </Pressable>
        </Link>
      </Collapsible>

      <Collapsible title="Using the app">
        <ThemedText style={{ marginBottom: 10 }}>
          Sign in on Home to see appointments and wound reports pulled from your organisation.
        </ThemedText>
        <ThemedText style={{ marginBottom: 10 }}>
          Book from a doctor&apos;s profile; your upcoming visits appear on Home.
        </ThemedText>
        <ThemedText>
          Use Wound check when your clinician has asked for follow-up images or descriptions.
        </ThemedText>
      </Collapsible>

      <Collapsible title="Images">
        <ThemedText>
          Static images in this template use <ThemedText type="defaultSemiBold">@2x</ThemedText> and{' '}
          <ThemedText type="defaultSemiBold">@3x</ThemedText> suffixes for different densities.
        </ThemedText>
        <Image
          source={require('@/assets/images/react-logo.png')}
          style={{ width: 100, height: 100, alignSelf: 'center', marginTop: 8 }}
        />
      </Collapsible>

      <ThemedText type="defaultSemiBold" style={[styles.section, { color: T.textSecondary }]}>
        About
      </ThemedText>
      <ThemedView style={[styles.aboutCard, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowCard]}>
        <View style={[styles.brandMark, { backgroundColor: T.brandMuted }]}>
          <Ionicons name="heart" size={22} color={T.brand} />
        </View>
        <View style={styles.aboutBody}>
          <ThemedText type="defaultSemiBold">Nvoisys Health</ThemedText>
          <ThemedText style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>Patient app · Version {version}</ThemedText>
        </View>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  section: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 12,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowBody: { flex: 1, minWidth: 0 },
  aboutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  aboutBody: { flex: 1 },
});
