import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { DOCTOR_CATEGORIES, fetchDoctors } from '@/lib/patient/api';
import type { DoctorListItem } from '@/lib/patient/types';

function DoctorCard({ item, onPress }: { item: DoctorListItem; onPress: () => void }) {
  const T = usePatientUi();
  const initials = item.name.trim().slice(0, 2).toUpperCase() || 'DR';
  const rating =
    typeof item.rating === 'number' && !Number.isNaN(item.rating) ? item.rating.toFixed(1) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowCard, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.specialty}`}>
      <View style={[styles.avatar, { backgroundColor: T.brandMuted }]}>
        <ThemedText type="defaultSemiBold" style={{ fontSize: 18, color: T.brand }}>
          {initials}
        </ThemedText>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <ThemedText type="defaultSemiBold" style={[styles.cardName, { color: T.text }]} numberOfLines={1}>
            {item.name}
          </ThemedText>
          {rating ? (
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={12} color="#b45309" />
              <ThemedText style={styles.ratingText}>{rating}</ThemedText>
            </View>
          ) : null}
        </View>
        <View style={[styles.specialtyPill, { backgroundColor: T.brandMuted }]}>
          <ThemedText type="defaultSemiBold" style={{ fontSize: 12, color: T.brandDark }}>
            {item.specialty}
          </ThemedText>
        </View>
        {item.department ? (
          <ThemedText style={[styles.deptLine, { color: T.textMuted }]} numberOfLines={1}>
            {item.department}
          </ThemedText>
        ) : null}
        {item.bio ? (
          <ThemedText style={[styles.bio, { color: T.textSecondary }]} numberOfLines={2}>
            {item.bio}
          </ThemedText>
        ) : (
          <ThemedText style={[styles.bioPlaceholder, { color: T.textMuted }]}>View profile and availability</ThemedText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={22} color={T.textMuted} style={styles.chevron} />
    </Pressable>
  );
}

export default function DoctorSearchScreen() {
  const T = usePatientUi();
  const router = useRouter();
  const { user } = usePatientAuth();
  const [category, setCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<DoctorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchDoctors({ category, search });
      setList(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load doctors');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    const t = setTimeout(load, 280);
    return () => clearTimeout(t);
  }, [load]);

  const header = (
    <View style={styles.headerBlock}>
      <View style={[styles.heroCard, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft]}>
        <View style={[styles.heroIconWrap, { backgroundColor: T.brandMuted }]}>
          <Ionicons name="medical" size={26} color={T.brand} />
        </View>
        <View style={styles.heroTextCol}>
          <ThemedText type="title" style={{ fontSize: 24, lineHeight: 28 }}>
            Find a doctor
          </ThemedText>
          <ThemedText style={{ fontSize: 14, color: T.textSecondary, marginTop: 6, lineHeight: 20 }}>
            Search by name or filter by specialty to book care.
          </ThemedText>
        </View>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: T.bgElevated, borderColor: T.border }, T.shadowSoft]}>
        <Ionicons name="search" size={20} color={T.textMuted} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: T.text }]}
          placeholder="Name, specialty, or clinic…"
          placeholderTextColor={T.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} hitSlop={12} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={22} color={T.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <ThemedText type="defaultSemiBold" style={[styles.filterLabel, { color: T.textSecondary }]}>
        Specialty
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
        style={styles.chipsList}>
        {DOCTOR_CATEGORIES.map((item) => {
          const active = category === item;
          return (
            <Pressable
              key={item}
              onPress={() => setCategory(item)}
              style={[styles.chip, { backgroundColor: T.bgElevated, borderColor: T.border }, active && { backgroundColor: T.brand, borderColor: T.brand }]}
              accessibilityState={{ selected: active }}>
              <ThemedText
                type="defaultSemiBold"
                style={{ fontSize: 13, color: active ? '#fff' : T.textSecondary }}>
                {item}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {!user ? (
        <View style={[styles.infoBanner, { backgroundColor: T.brandMuted, borderColor: T.border }]}>
          <Ionicons name="information-circle-outline" size={20} color={T.brand} style={styles.infoIcon} />
          <ThemedText style={[styles.infoBannerText, { color: T.textSecondary }]}>
            Sign in on Home to book appointments with your care team.
          </ThemedText>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: T.dangerMuted }]}>
          <Ionicons name="alert-circle" size={18} color={T.danger} style={styles.errorIcon} />
          <ThemedText style={[styles.errorText, { color: T.danger }]}>{error}</ThemedText>
        </View>
      ) : null}

      <View style={styles.resultsRow}>
        <ThemedText style={[styles.resultsLabel, { color: T.textMuted }]}>
          {loading ? 'Searching…' : `${list.length} ${list.length === 1 ? 'provider' : 'providers'}`}
        </ThemedText>
      </View>
    </View>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <FlatList
          style={styles.listFlex}
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          ListEmptyComponent={
            loading ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator size="large" color={T.brand} />
                <ThemedText style={[styles.loadingHint, { color: T.textMuted }]}>Finding providers…</ThemedText>
              </View>
            ) : (
              <View style={styles.emptyBlock}>
                <View style={[styles.emptyIcon, { backgroundColor: T.bgElevated, borderColor: T.border }]}>
                  <Ionicons name="people-outline" size={40} color={T.textMuted} />
                </View>
                <ThemedText type="defaultSemiBold" style={{ fontSize: 18, marginBottom: 6 }}>
                  No matches
                </ThemedText>
                <ThemedText style={{ fontSize: 14, color: T.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                  Try another specialty or clear your search.
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => (
            <DoctorCard
              item={item}
              onPress={() =>
              router.push({ pathname: '/doctor/[id]', params: { id: item.id } } as unknown as Href)
            }
            />
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  headerBlock: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  listFlex: { flex: 1 },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroTextCol: { flex: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginBottom: 18,
    minHeight: 50,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 12 },
  filterLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  chipsList: { maxHeight: 44, marginBottom: 4 },
  chipsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
  },
  chip: {
    paddingHorizontal: 16,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  infoIcon: { marginRight: 10, marginTop: 1 },
  infoBannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  errorIcon: { marginRight: 8 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500' },
  resultsRow: { marginBottom: 8 },
  resultsLabel: { fontSize: 13, fontWeight: '600' },
  listContent: { paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.998 }] },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardName: { flex: 1, fontSize: 17, marginRight: 8 },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  ratingText: { fontSize: 12, fontWeight: '700', color: '#9a3412', marginLeft: 4 },
  specialtyPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 4,
  },
  deptLine: { fontSize: 12, marginBottom: 4 },
  bio: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  bioPlaceholder: { fontSize: 13, fontStyle: 'italic', marginTop: 2 },
  chevron: { marginLeft: 4 },
  loadingBlock: { paddingVertical: 48, alignItems: 'center' },
  loadingHint: { marginTop: 12, fontSize: 14 },
  emptyBlock: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
  },
});
