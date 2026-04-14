import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PatientTheme as T } from '@/constants/patient-theme';
import { usePatientAuth } from '@/contexts/PatientAuthContext';
import { DOCTOR_CATEGORIES, fetchDoctors } from '@/lib/patient/api';
import type { DoctorListItem } from '@/lib/patient/types';

function DoctorCard({ item, onPress }: { item: DoctorListItem; onPress: () => void }) {
  const initials = item.name.trim().slice(0, 2).toUpperCase() || 'DR';
  const rating =
    typeof item.rating === 'number' && !Number.isNaN(item.rating) ? item.rating.toFixed(1) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.specialty}`}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          {rating ? (
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={12} color="#b45309" />
              <Text style={styles.ratingText}>{rating}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.specialtyPill}>
          <Text style={styles.specialtyPillText}>{item.specialty}</Text>
        </View>
        {item.department ? (
          <Text style={styles.deptLine} numberOfLines={1}>
            {item.department}
          </Text>
        ) : null}
        {item.bio ? (
          <Text style={styles.bio} numberOfLines={2}>
            {item.bio}
          </Text>
        ) : (
          <Text style={styles.bioPlaceholder}>View profile and availability</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={22} color={T.textMuted} style={styles.chevron} />
    </Pressable>
  );
}

export default function DoctorSearchScreen() {
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBlock}>
        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="medical" size={26} color={T.brand} />
          </View>
          <View style={styles.heroTextCol}>
            <Text style={styles.title}>Find a doctor</Text>
            <Text style={styles.subtitle}>Search by name or filter by specialty to book care.</Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={T.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
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

        <Text style={styles.filterLabel}>Specialty</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[...DOCTOR_CATEGORIES]}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.chipsContent}
          style={styles.chipsList}
          renderItem={({ item }) => {
            const active = category === item;
            return (
              <Pressable
                onPress={() => setCategory(item)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityState={{ selected: active }}>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{item}</Text>
              </Pressable>
            );
          }}
        />

        {!user ? (
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={20} color={T.brand} style={styles.infoIcon} />
            <Text style={styles.infoBannerText}>Sign in on Home to book appointments with your care team.</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={T.danger} style={styles.errorIcon} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.resultsRow}>
          <Text style={styles.resultsLabel}>
            {loading ? 'Searching…' : `${list.length} ${list.length === 1 ? 'provider' : 'providers'}`}
          </Text>
        </View>
      </View>

      <FlatList
        style={styles.listFlex}
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="large" color={T.brand} />
              <Text style={styles.loadingHint}>Finding providers…</Text>
            </View>
          ) : (
            <View style={styles.emptyBlock}>
              <View style={styles.emptyIcon}>
                <Ionicons name="people-outline" size={40} color={T.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptySub}>Try another specialty or clear your search.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <DoctorCard
            item={item}
            onPress={() => router.push({ pathname: '/doctor/[id]', params: { id: item.id } })}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  headerBlock: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  listFlex: { flex: 1 },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusLg,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: T.border,
    ...T.shadowSoft,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: T.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroTextCol: { flex: 1 },
  title: { fontSize: 24, fontWeight: '800', color: T.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: T.textSecondary, marginTop: 6, lineHeight: 20 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusMd,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
    marginBottom: 18,
    minHeight: 50,
    ...T.shadowSoft,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: T.text, paddingVertical: 12 },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: T.textSecondary,
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
    borderRadius: T.radiusFull,
    backgroundColor: T.bgElevated,
    borderWidth: 1,
    borderColor: T.border,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: T.brand,
    borderColor: T.brand,
  },
  chipLabel: { fontSize: 13, fontWeight: '600', color: T.textSecondary },
  chipLabelActive: { color: '#fff' },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: T.brandMuted,
    borderRadius: T.radiusMd,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d8def2',
  },
  infoIcon: { marginRight: 10, marginTop: 1 },
  infoBannerText: { flex: 1, fontSize: 13, color: T.textSecondary, lineHeight: 18 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.dangerMuted,
    borderRadius: T.radiusMd,
    padding: 12,
    marginBottom: 12,
  },
  errorIcon: { marginRight: 8 },
  errorText: { flex: 1, fontSize: 13, color: T.danger, fontWeight: '500' },
  resultsRow: { marginBottom: 8 },
  resultsLabel: { fontSize: 13, fontWeight: '600', color: T.textMuted },
  listContent: { paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.bgElevated,
    borderRadius: T.radiusLg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.border,
    ...T.shadowCard,
  },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.998 }] },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: T.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: T.brand },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardName: { flex: 1, fontSize: 17, fontWeight: '700', color: T.text, marginRight: 8 },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: T.radiusFull,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  ratingText: { fontSize: 12, fontWeight: '700', color: '#9a3412', marginLeft: 4 },
  specialtyPill: {
    alignSelf: 'flex-start',
    backgroundColor: T.brandMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: T.radiusFull,
    marginBottom: 4,
  },
  specialtyPillText: { fontSize: 12, fontWeight: '700', color: T.brandDark },
  deptLine: { fontSize: 12, color: T.textMuted, marginBottom: 4 },
  bio: { fontSize: 13, color: T.textSecondary, lineHeight: 18, marginTop: 2 },
  bioPlaceholder: { fontSize: 13, color: T.textMuted, fontStyle: 'italic', marginTop: 2 },
  chevron: { marginLeft: 4 },
  loadingBlock: { paddingVertical: 48, alignItems: 'center' },
  loadingHint: { marginTop: 12, fontSize: 14, color: T.textMuted },
  emptyBlock: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: T.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: T.border,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: T.text, marginBottom: 6 },
  emptySub: { fontSize: 14, color: T.textSecondary, textAlign: 'center', lineHeight: 20 },
});
