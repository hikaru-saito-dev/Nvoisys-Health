/**
 * Post-registration primary care path: General doctor vs Specialist (package) doctor.
 * Patient may enable one or both; specialist path includes package selection + payment.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function PatientPrimaryCareOnboardingScreen({
  theme,
  currentUser,
  patientProfile,
  fetchAllApprovedDoctors,
  fetchPackageModeDoctors,
  onPaySelectedPackage,
  onFinished,
}) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("choose");
  const [wantGeneral, setWantGeneral] = useState(false);
  const [wantSpecialist, setWantSpecialist] = useState(false);
  const [allDoctors, setAllDoctors] = useState([]);
  const [pkgDoctors, setPkgDoctors] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [generalPick, setGeneralPick] = useState(null);
  const [specDoctor, setSpecDoctor] = useState(null);
  const [specSlot, setSpecSlot] = useState(null);
  const generalDoctorRef = useRef(null);

  const uid = currentUser?.id;
  const profileId = patientProfile?.id;

  const loadLists = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const [all, pkg] = await Promise.all([
        fetchAllApprovedDoctors?.() ?? [],
        fetchPackageModeDoctors?.() ?? [],
      ]);
      setAllDoctors(Array.isArray(all) ? all : []);
      setPkgDoctors(Array.isArray(pkg) ? pkg : []);
    } catch (e) {
      Alert.alert("Doctors", e?.message || "Could not load doctors.");
    } finally {
      setLoadingDocs(false);
    }
  }, [fetchAllApprovedDoctors, fetchPackageModeDoctors]);

  useEffect(() => {
    if (step === "general_doctors" || step === "specialist_pick") {
      void loadLists();
    }
  }, [step, loadLists]);

  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = allDoctors || [];
    if (!q) return base;
    return base.filter((d) =>
      `${d.name || ""} ${d.specialty || ""}`.toLowerCase().includes(q),
    );
  }, [allDoctors, search]);

  const filteredPkg = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = pkgDoctors || [];
    if (!q) return base;
    return base.filter((d) =>
      `${d.name || ""} ${d.specialty || ""}`.toLowerCase().includes(q),
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

  const startChooseNext = () => {
    if (!wantGeneral && !wantSpecialist) {
      Alert.alert("Choose a path", "Select General doctor, Specialist doctor, or both.");
      return;
    }
    if (wantGeneral) {
      setStep("general_doctors");
      return;
    }
    setStep("specialist_pick");
  };

  const afterGeneralChosen = async (doc) => {
    if (!uid) return;
    setBusy(true);
    try {
      setGeneralPick(doc);
      generalDoctorRef.current = doc?.userId || null;
      if (wantSpecialist) {
        setStep("specialist_pick");
        return;
      }
      await persistPatientCareMode({
        profileId,
        userId: uid,
        mode: CARE_MODE.GENERAL,
      });
      await finishPaths({
        wantsGeneral: true,
        wantsSpecialist: false,
        generalDoctorUserId: doc.userId,
        specialistDoctorUserId: null,
        specialistPackageSlot: null,
        specialistOfferId: null,
      });
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const paySpecialistPackage = async () => {
    if (!uid || !specDoctor?.userId || !specSlot) {
      Alert.alert("Incomplete", "Choose a specialist doctor and a package.");
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
      const genUid = generalDoctorRef.current || generalPick?.userId || null;
      await finishPaths({
        wantsGeneral: !!wantGeneral,
        wantsSpecialist: true,
        generalDoctorUserId: genUid,
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

  if (step === "choose") {
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
              fontSize: 24,
              fontWeight: "800",
            }}
          >
            How do you want to use care?
          </Text>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.body,
              marginTop: 8,
              marginBottom: 20,
              lineHeight: 20,
            }}
          >
            You can pick one or both. General doctors use paid appointments before
            calls. Specialist doctors use a paid package — then you can chat or call
            {
              "Basic: during your doctor's daily hours; Gold/Premium: wider access."
            }
          </Text>

          <TouchableOpacity
            style={{
              ...card,
              borderColor: wantGeneral ? theme.accent : theme.cardBorder,
              backgroundColor: wantGeneral ? theme.accentLight : theme.card,
            }}
            onPress={() => setWantGeneral(!wantGeneral)}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name={wantGeneral ? "checkbox" : "square-outline"}
                size={26}
                color={theme.accent}
                style={{ marginRight: 12 }}
              />
              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: S.title,
                  fontWeight: "800",
                  flex: 1,
                }}
              >
                General doctor
              </Text>
            </View>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: S.small,
                marginTop: 8,
                lineHeight: 18,
              }}
            >
              For common issues (headache, fever, etc.). Pick a doctor, then book
              and pay for appointments before calls.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              ...card,
              borderColor: wantSpecialist ? theme.accent : theme.cardBorder,
              backgroundColor: wantSpecialist ? theme.accentLight : theme.card,
            }}
            onPress={() => setWantSpecialist(!wantSpecialist)}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name={wantSpecialist ? "checkbox" : "square-outline"}
                size={26}
                color={theme.accent}
                style={{ marginRight: 12 }}
              />
              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: S.title,
                  fontWeight: "800",
                  flex: 1,
                }}
              >
                Specialist doctor
              </Text>
            </View>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: S.small,
                marginTop: 8,
                lineHeight: 18,
              }}
            >
              For focused care (e.g. thyroid). Pick a doctor, choose Basic / Gold /
              Premium, pay, then contact them without a separate appointment.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={startChooseNext}
            disabled={busy}
            style={{
              marginTop: 8,
              backgroundColor: theme.accent,
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
              Continue
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (step === "general_doctors") {
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
          <TouchableOpacity onPress={() => setStep("choose")} style={{ marginBottom: 12 }}>
            <Text style={{ color: theme.accent, fontWeight: "800" }}>Back</Text>
          </TouchableOpacity>
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: 22,
              fontWeight: "800",
            }}
          >
            Choose your general doctor
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
          {filteredAll.map((d) => (
            <TouchableOpacity
              key={d.profileId || d.userId}
              disabled={busy}
              onPress={() => void afterGeneralChosen(d)}
              style={{
                ...card,
                borderColor:
                  generalPick?.userId === d.userId
                    ? theme.accent
                    : theme.cardBorder,
              }}
            >
              <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>
                {d.name}
              </Text>
              <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: S.small }}>
                {d.specialty}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  const slots = Array.isArray(specDoctor?.packageSlots)
    ? specDoctor.packageSlots
    : [];

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
              if (wantGeneral && generalDoctorRef.current) {
                setStep("general_doctors");
              } else {
                setStep("choose");
              }
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
            Specialist doctor & package
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
            return (
              <TouchableOpacity
                key={d.profileId || d.userId}
                onPress={() => {
                  setSpecDoctor(d);
                  const first = Array.isArray(d.packageSlots) ? d.packageSlots[0] : null;
                  setSpecSlot(first || null);
                }}
                style={{
                  ...card,
                  borderColor: sel ? theme.accent : theme.cardBorder,
                  backgroundColor: sel ? theme.accentLight : theme.card,
                }}
              >
                <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>{d.name}</Text>
                <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: S.small }}>
                  {d.specialty}
                </Text>
              </TouchableOpacity>
            );
          })}

          {specDoctor ? (
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: theme.textPrimary, fontWeight: "900", marginBottom: 8 }}>
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
                    <Text style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 4 }}>
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
                  <Text style={{ color: "#fff", fontWeight: "900" }}>Pay with Cashfree</Text>
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
