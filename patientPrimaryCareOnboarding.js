/**
 * Package-doctor first setup: pharmacy → package doctor + tier → pay → dashboard.
 * Shown when the patient chose Package doctor mode and paths are not completed yet,
 * or after upgrading from Casual to Package.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CARE_MODE,
  createPatientSelectedPackageOffer,
  packageSlotDisplayName,
  patientPayPackageOfferStub,
  persistPatientCareMode,
  resolvePackageSlotAmountInr,
  writePatientPrimaryCarePaths,
} from "./productSpecApi";

const S = { pad: 16, title: 18, body: 14, small: 12 };

function formatConcernsLine(doctor) {
  const raw = doctor?.concerns;
  if (!Array.isArray(raw) || !raw.length) return "";
  const parts = raw
    .map((c) => String(c || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!parts.length) return "";
  return parts.join(", ");
}

export function PatientPrimaryCareOnboardingScreen({
  theme,
  currentUser,
  patientProfile,
  fetchPackageModeDoctors,
  fetchPharmacies,
  onPaySelectedPackage,
  onFinished,
}) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("pharmacy_pick");
  const [pkgDoctors, setPkgDoctors] = useState([]);
  const [pharmacyList, setPharmacyList] = useState([]);
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [search, setSearch] = useState("");
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingPharmacies, setLoadingPharmacies] = useState(false);
  const [specDoctor, setSpecDoctor] = useState(null);
  const [specSlot, setSpecSlot] = useState(null);

  const uid = currentUser?.id;
  const profileId = patientProfile?.id;

  const pharmacyPathFields = () => ({
    pharmacyUserId: selectedPharmacy?.userId || null,
    pharmacyName: selectedPharmacy?.name || null,
  });

  const loadPackageDoctors = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const pkg = await fetchPackageModeDoctors?.();
      setPkgDoctors(Array.isArray(pkg) ? pkg : []);
    } catch (e) {
      Alert.alert("Doctors", e?.message || "Could not load doctors.");
      setPkgDoctors([]);
    } finally {
      setLoadingDocs(false);
    }
  }, [fetchPackageModeDoctors]);

  useEffect(() => {
    if (step === "specialist_pick") {
      void loadPackageDoctors();
    }
  }, [step, loadPackageDoctors]);

  const loadPharmacies = useCallback(async () => {
    setLoadingPharmacies(true);
    try {
      const list = await fetchPharmacies?.();
      const arr = Array.isArray(list) ? list : [];
      const medsOk = arr.filter((p) => p && p.receivesMedicineOrders);
      setPharmacyList(medsOk.length ? medsOk : arr);
    } catch (e) {
      Alert.alert("Pharmacies", e?.message || "Could not load pharmacies.");
      setPharmacyList([]);
    } finally {
      setLoadingPharmacies(false);
    }
  }, [fetchPharmacies]);

  useEffect(() => {
    if (step === "pharmacy_pick") {
      void loadPharmacies();
    }
  }, [step, loadPharmacies]);

  const filteredPharmacies = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = pharmacyList || [];
    if (!q) return base;
    return base.filter((p) =>
      `${p.name || ""} ${p.address || ""} ${p.district || ""} ${p.state || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [pharmacyList, search]);

  const filteredPkg = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = pkgDoctors || [];
    if (!q) return base;
    return base.filter((d) =>
      `${d.name || ""} ${d.specialty || ""} ${formatConcernsLine(d)}`
        .toLowerCase()
        .includes(q),
    );
  }, [pkgDoctors, search]);

  const card = {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: S.pad,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.cardBorder,
  };

  const finishPaths = async (payload) => {
    if (!uid) return;
    await writePatientPrimaryCarePaths(uid, { ...payload, completed: true });
    onFinished?.();
  };

  const paySpecialistPackage = async () => {
    if (!uid || !specDoctor?.userId || !specSlot) {
      Alert.alert("Incomplete", "Choose a package doctor and a package.");
      return;
    }
    try {
      setBusy(true);
      const offer = await createPatientSelectedPackageOffer({
        patientUserId: uid,
        doctorUserId: specDoctor.userId,
        slot: specSlot,
        packageSlotIndex: specSlot.slot,
      });
      if (typeof onPaySelectedPackage === "function") {
        await onPaySelectedPackage(offer, specDoctor.userId);
      } else {
        await patientPayPackageOfferStub(offer.id, specDoctor.userId);
      }
      await persistPatientCareMode({
        profileId,
        userId: uid,
        mode: CARE_MODE.PACKAGE,
      });
      await finishPaths({
        ...pharmacyPathFields(),
        wantsGeneral: false,
        wantsSpecialist: true,
        generalDoctorUserId: null,
        specialistDoctorUserId: specDoctor.userId,
        specialistPackageSlot: specSlot.slot,
        specialistOfferId: offer?.id || null,
      });
    } catch (e) {
      Alert.alert("Payment", e?.message || "Could not complete payment.");
    } finally {
      setBusy(false);
    }
  };

  const slots = Array.isArray(specDoctor?.packageSlots)
    ? specDoctor.packageSlots
    : [];

  if (step === "pharmacy_pick") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.bg,
          paddingTop: insets.top + 12,
        }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: S.pad,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: 22,
              fontWeight: "800",
            }}
          >
            Choose your pharmacy
          </Text>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.body,
              marginTop: 8,
              marginBottom: 16,
              lineHeight: 20,
            }}
          >
            Select the pharmacy for medicine orders and chat. You can change this
            later from your profile.
          </Text>
          <TextInput
            placeholder="Search pharmacies..."
            placeholderTextColor={theme.textTertiary}
            value={search}
            onChangeText={setSearch}
            style={{
              marginBottom: 12,
              backgroundColor: theme.card,
              borderRadius: 12,
              padding: 12,
              color: theme.textPrimary,
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          />
          {loadingPharmacies ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={theme.accent} />
          ) : null}
          {!loadingPharmacies && filteredPharmacies.length === 0 ? (
            <Text style={{ color: theme.textSecondary, marginTop: 12 }}>
              No pharmacies are listed yet. Try again later or contact support.
            </Text>
          ) : null}
          {filteredPharmacies.map((p) => {
            const sel = selectedPharmacy?.userId === p.userId;
            return (
              <TouchableOpacity
                key={p.profileId || p.userId || p.id}
                onPress={() => setSelectedPharmacy(p)}
                style={{
                  ...card,
                  borderColor: sel ? theme.accent : theme.cardBorder,
                  backgroundColor: sel ? theme.accentLight : theme.card,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons
                    name={sel ? "radio-button-on" : "radio-button-off"}
                    size={22}
                    color={theme.accent}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontWeight: "800",
                        fontSize: S.title,
                      }}
                    >
                      {p.name || "Pharmacy"}
                    </Text>
                    {p.address || p.district || p.state ? (
                      <Text
                        style={{
                          color: theme.textSecondary,
                          marginTop: 4,
                          fontSize: S.small,
                        }}
                      >
                        {[p.address, p.district, p.state]
                          .filter(Boolean)
                          .join(", ")}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => {
              if (!selectedPharmacy?.userId) {
                Alert.alert("Pharmacy", "Please select a pharmacy to continue.");
                return;
              }
              setSearch("");
              setStep("specialist_pick");
            }}
            disabled={busy}
            style={{
              marginTop: 8,
              backgroundColor: theme.accent,
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              opacity: selectedPharmacy?.userId ? 1 : 0.5,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
              Next
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (step === "specialist_pick") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.bg,
          paddingTop: insets.top + 12,
        }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: S.pad,
            paddingBottom: insets.bottom + 40,
          }}
        >
          <TouchableOpacity
            onPress={() => {
              setSearch("");
              setStep("pharmacy_pick");
            }}
            style={{ marginBottom: 12 }}
          >
            <Text style={{ color: theme.accent, fontWeight: "800" }}>Back</Text>
          </TouchableOpacity>
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: 22,
              fontWeight: "800",
            }}
          >
            Package doctor & package
          </Text>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              marginTop: 6,
              marginBottom: 10,
            }}
          >
            Pick a doctor, then choose Basic / Gold / Premium and pay to activate.
          </Text>
          <TextInput
            placeholder="Search doctors..."
            placeholderTextColor={theme.textTertiary}
            value={search}
            onChangeText={setSearch}
            style={{
              marginTop: 12,
              backgroundColor: theme.card,
              borderRadius: 12,
              padding: 12,
              color: theme.textPrimary,
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          />
          {loadingDocs ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={theme.accent} />
          ) : null}
          {filteredPkg.map((d) => {
            const sel = specDoctor?.userId === d.userId;
            const concerns = formatConcernsLine(d);
            return (
              <TouchableOpacity
                key={d.profileId || d.userId}
                onPress={() => {
                  setSpecDoctor(d);
                  const first = Array.isArray(d.packageSlots)
                    ? d.packageSlots[0]
                    : null;
                  setSpecSlot(first || null);
                }}
                style={{
                  ...card,
                  borderColor: sel ? theme.accent : theme.cardBorder,
                  backgroundColor: sel ? theme.accentLight : theme.card,
                }}
              >
                <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>
                  {d.name}
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    marginTop: 4,
                    fontSize: S.small,
                  }}
                >
                  {d.specialty}
                </Text>
                {concerns ? (
                  <Text
                    style={{
                      color: theme.textSecondary,
                      marginTop: 6,
                      fontSize: S.small,
                    }}
                  >
                    Concerns: {concerns}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}

          {specDoctor ? (
            <View style={{ marginTop: 8 }}>
              <Text
                style={{
                  color: theme.textPrimary,
                  fontWeight: "900",
                  marginBottom: 8,
                }}
              >
                Select package
              </Text>
              {slots.map((slot) => {
                const selected = specSlot?.slot === slot.slot;
                const amount = resolvePackageSlotAmountInr(slot);
                return (
                  <TouchableOpacity
                    key={slot.slot}
                    onPress={() => setSpecSlot(slot)}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: selected ? theme.accent : theme.cardBorder,
                      backgroundColor: selected ? theme.accentLight : theme.card,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>
                      {slot.name || packageSlotDisplayName(slot.slot)}
                    </Text>
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: S.small,
                        marginTop: 4,
                      }}
                    >
                      Pay ₹{amount}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => void paySpecialistPackage()}
                disabled={busy || !specSlot}
                style={{
                  marginTop: 8,
                  backgroundColor: theme.success,
                  borderRadius: 16,
                  padding: 16,
                  alignItems: "center",
                  opacity: busy || !specSlot ? 0.55 : 1,
                }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "900" }}>
                    Pay with Cashfree
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  return null;
}
