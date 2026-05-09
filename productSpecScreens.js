import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuthUser, pb } from "./pocketbase";
import {
  cancelQuickRequest,
  CARE_MODE,
  closeQuickRequest,
  createPatientSelectedPackageOffer,
  createPackageMeetingRequest,
  createQuickCounsellingRequest,
  createQuickSolutionRequest,
  doctorAcceptPackageMeetingInitial,
  doctorConfirmPatientRescheduleChoice,
  doctorPackagesSetupComplete,
  doctorProposePackageMeetingReschedule,
  doctorSendPackageOfferFromSlot,
  doctorTierEligibleForPackageMode,
  doctorWithdrawCoinsStub,
  fetchMedicalRecordsForPatient,
  getCoinBalanceForUser,
  getDoctorCoinBalance,
  listActivePackagePairsForDoctor,
  listActivePackagePairsForPatient,
  listActiveQuickRequestsForPatient,
  listCoinLedgerForUser,
  listInferredOffersByDoctor,
  listPackageMeetingsForDoctor,
  listPackageMeetingsForPatient,
  listPackageOffersForPatient,
  listQueuedQuickCounsellingRequestsForProvider,
  listQueuedQuickSolutionRequestsForProvider,
  listQuickHelpOffersByDoctor,
  listPackageReferralsForDoctor,
  mergeLocalFeesOntoSlots,
  normalizeDoctorPackageSlots,
  PACKAGE_MEETING_STATUS,
  packageMeetingClosedLabel,
  packageMeetingDoctorListBucket,
  packageMeetingStatusLabel,
  packageSlotUsesDefaultAmount,
  packageTemplatesRawFromRecord,
  patientCancelPackageDemoMeeting,
  patientChooseRescheduleSlot,
  patientPayPackageOfferStub,
  persistPackageSetupSkip,
  persistPatientCareMode,
  readLocalDoctorPackageFees,
  referPackagePatientToDoctor,
  requestPackageDoctorChange,
  resolvePackageSlotAmountInr,
  saveDoctorPackageTemplates,
  settleDueReferralMonthlyCommissions,
  uploadMedicalRecord,
} from "./productSpecApi";

const S = {
  title: 18,
  body: 14,
  small: 12,
  pad: 16,
};

/** Turn ledger reason keys (snake_case) into readable sentence-style labels. */
function formatCoinLedgerReasonForDisplay(reason) {
  if (reason == null || reason === "") return "";
  const spaced = String(reason).trim().replace(/_/g, " ").toLowerCase();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function CareModeOnboardingScreen({
  theme,
  patientProfile,
  currentUser,
  onDone,
  onLoadPackageDoctors,
  onPaySelectedPackage,
}) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [packageStep, setPackageStep] = useState(false);
  const [packageDoctors, setPackageDoctors] = useState([]);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  const loadPackageDoctors = useCallback(async () => {
    if (typeof onLoadPackageDoctors !== "function") return [];
    setLoadingDoctors(true);
    try {
      const list = await onLoadPackageDoctors();
      setPackageDoctors(Array.isArray(list) ? list : []);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      Alert.alert("Doctors", e?.message || "Could not load doctors.");
      setPackageDoctors([]);
      return [];
    } finally {
      setLoadingDoctors(false);
    }
  }, [onLoadPackageDoctors]);

  const pick = async (mode) => {
    if (mode === CARE_MODE.PACKAGE) {
      setPackageStep(true);
      void loadPackageDoctors();
      return;
    }
    try {
      setBusy(true);
      await persistPatientCareMode({
        profileId: patientProfile?.id,
        userId: currentUser?.id,
        mode,
      });
      onDone?.(mode);
    } catch (e) {
      Alert.alert("Could not save", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const finishPackageMode = async () => {
    try {
      setBusy(true);
      await persistPatientCareMode({
        profileId: patientProfile?.id,
        userId: currentUser?.id,
        mode: CARE_MODE.PACKAGE,
      });
      onDone?.(CARE_MODE.PACKAGE);
    } catch (e) {
      Alert.alert("Could not save", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const paySelectedPackage = async () => {
    if (!currentUser?.id) {
      Alert.alert("Sign in", "Please sign in again before paying.");
      return;
    }
    if (!selectedDoctor?.userId || !selectedSlot) {
      Alert.alert("Package", "Choose a doctor and one package.");
      return;
    }
    try {
      setBusy(true);
      const offer = await createPatientSelectedPackageOffer({
        patientUserId: currentUser.id,
        doctorUserId: selectedDoctor.userId,
        slot: selectedSlot,
        packageSlotIndex: selectedSlot.slot,
      });
      if (typeof onPaySelectedPackage === "function") {
        await onPaySelectedPackage(offer, selectedDoctor.userId);
      } else {
        await patientPayPackageOfferStub(offer.id, selectedDoctor.userId);
      }
      await finishPackageMode();
      Alert.alert(
        "Package active",
        "Your doctor is fixed for this package and your package coins are now visible on the dashboard.",
      );
    } catch (e) {
      Alert.alert("Payment", e?.message || "Could not start package.");
    } finally {
      setBusy(false);
    }
  };

  const filteredPackageDoctors = useMemo(() => {
    const q = doctorSearch.trim().toLowerCase();
    const base = packageDoctors || [];
    if (!q) return base;
    return base.filter((d) =>
      `${d.name || ""} ${d.specialty || ""}`.toLowerCase().includes(q),
    );
  }, [packageDoctors, doctorSearch]);

  const card = {
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: S.pad,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.cardBorder,
  };

  if (packageStep) {
    const slots = Array.isArray(selectedDoctor?.packageSlots)
      ? selectedDoctor.packageSlots
      : [];
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
          <TouchableOpacity
            onPress={() => setPackageStep(false)}
            disabled={busy}
            style={{ marginBottom: 14, alignSelf: "flex-start" }}
          >
            <Text style={{ color: theme.accent, fontWeight: "800" }}>
              Back
            </Text>
          </TouchableOpacity>
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: 24,
              fontWeight: "800",
            }}
          >
            Choose your package doctor
          </Text>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.body,
              marginTop: 8,
              marginBottom: 14,
              lineHeight: 20,
            }}
          >
            Pick a doctor and package now. If a doctor has not set a package
            fee yet, the app uses the default amount. After Cashfree confirms
            payment, this doctor-patient package pair becomes fixed and coins
            are loaded to your wallet.
          </Text>
          <TextInput
            placeholder="Search package doctors"
            placeholderTextColor={theme.textTertiary}
            value={doctorSearch}
            onChangeText={setDoctorSearch}
            style={slotInput(theme)}
          />
          {loadingDoctors ? (
            <ActivityIndicator color={theme.accent} style={{ margin: 12 }} />
          ) : null}
          {!loadingDoctors && filteredPackageDoctors.length === 0 ? (
            <Text style={{ color: theme.warning, fontSize: S.small }}>
              No package doctors are available right now. You can continue and
              choose one later from the dashboard.
            </Text>
          ) : null}
          {filteredPackageDoctors.map((d) => {
            const selected = selectedDoctor?.userId === d.userId;
            return (
              <TouchableOpacity
                key={d.profileId || d.userId}
                onPress={() => {
                  setSelectedDoctor(d);
                  const firstSlot = Array.isArray(d.packageSlots)
                    ? d.packageSlots[0]
                    : null;
                  setSelectedSlot(firstSlot || null);
                }}
                style={{
                  ...card,
                  borderColor: selected ? theme.accent : theme.cardBorder,
                  backgroundColor: selected ? theme.accentLight : theme.card,
                }}
              >
                <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>
                  {d.name || "Doctor"}
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: S.small,
                    marginTop: 4,
                  }}
                >
                  {d.specialty || "General Physician"}
                </Text>
              </TouchableOpacity>
            );
          })}
          {selectedDoctor ? (
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
                const selected = selectedSlot?.slot === slot.slot;
                const amount = resolvePackageSlotAmountInr(slot);
                const usesDefault = packageSlotUsesDefaultAmount(slot);
                return (
                  <TouchableOpacity
                    key={slot.slot}
                    onPress={() => setSelectedSlot(slot)}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: selected ? theme.accent : theme.cardBorder,
                      backgroundColor: selected ? theme.accentLight : theme.card,
                      marginBottom: 10,
                    }}
                  >
                    <Text
                      style={{ color: theme.textPrimary, fontWeight: "800" }}
                    >
                      {slot.name || `Package ${slot.slot}`}
                    </Text>
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: S.small,
                        marginTop: 4,
                      }}
                    >
                      Pay ₹{amount}
                      {usesDefault ? " · default amount" : " · doctor fee"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={paySelectedPackage}
                disabled={busy || !selectedSlot}
                style={{
                  backgroundColor: theme.success,
                  borderRadius: 16,
                  padding: 16,
                  alignItems: "center",
                  opacity: busy || !selectedSlot ? 0.55 : 1,
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
          <TouchableOpacity
            onPress={finishPackageMode}
            disabled={busy}
            style={{ marginTop: 16, padding: 12, alignItems: "center" }}
          >
            <Text style={{ color: theme.textSecondary, fontWeight: "800" }}>
              Choose package later from dashboard
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

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
          style={{ color: theme.textPrimary, fontSize: 24, fontWeight: "800" }}
        >
          How would you like to use Nvoisys?
        </Text>
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: S.body,
            marginTop: 8,
            marginBottom: 20,
          }}
        >
          Pick one path now (Package Doctor, Casual / Normal, or skip). You can
          switch later from Home, Profile, or the upgrade entry points - Casual
          users always see a way to move into Package Doctor Mode.
        </Text>

        <TouchableOpacity
          style={card}
          disabled={busy}
          onPress={() => pick(CARE_MODE.PACKAGE)}
          activeOpacity={0.85}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Ionicons
              name="medkit"
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
              Package Doctor Mode
            </Text>
          </View>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              lineHeight: 20,
            }}
          >
            Book a short demo with a verified professional doctor, join the
            voice/video call, then your doctor sends package options from the
            app - you pay to start structured care. Best for ongoing treatment
            plans.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={card}
          disabled={busy}
          onPress={() => pick(CARE_MODE.CASUAL)}
          activeOpacity={0.85}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Ionicons
              name="flash"
              size={26}
              color={theme.success}
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
              Casual / Normal Mode
            </Text>
          </View>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              lineHeight: 20,
            }}
          >
            Quick Solution (₹10) and Quick Counselling (₹25) with verified
            clinics and RMP doctors. You can upgrade to Package Doctor Mode
            whenever you like.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={card}
          disabled={busy}
          onPress={() => pick(CARE_MODE.SKIP)}
          activeOpacity={0.85}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Ionicons
              name="time-outline"
              size={26}
              color={theme.textTertiary}
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
              Not planning for now
            </Text>
          </View>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              lineHeight: 20,
            }}
          >
            Skip for now and go straight to Home. Switch modes later from
            Profile or the upgrade button on Home.
          </Text>
        </TouchableOpacity>

        {busy ? (
          <View style={{ alignItems: "center", marginTop: 12 }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const slotInput = (theme) => ({
  backgroundColor: theme.card,
  borderRadius: 12,
  padding: 12,
  color: theme.textPrimary,
  borderWidth: 1,
  borderColor: theme.cardBorder,
  marginBottom: 10,
});

export function DoctorPackageSetupScreen({
  theme,
  doctorProfileId,
  initialRecord,
  currentUserId,
  onComplete,
  onLogout,
  onSkip,
}) {
  const insets = useSafeAreaInsets();
  const [slots, setSlots] = useState(() =>
    normalizeDoctorPackageSlots(packageTemplatesRawFromRecord(initialRecord)),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const raw = packageTemplatesRawFromRecord(initialRecord);
    const base = normalizeDoctorPackageSlots(raw);
    if (!currentUserId) {
      setSlots(base);
      return undefined;
    }
    (async () => {
      const localFees = await readLocalDoctorPackageFees(currentUserId);
      if (cancelled) return;
      setSlots(mergeLocalFeesOntoSlots(base, localFees || []));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    initialRecord?.id,
    initialRecord?.package_templates,
    initialRecord?.packages_template,
    initialRecord?.package_slots,
    currentUserId,
  ]);

  const patchSlot = (index, patch) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const save = async () => {
    if (!doctorProfileId) {
      Alert.alert("Profile", "Doctor profile not found.");
      return;
    }
    if (!doctorPackagesSetupComplete(slots)) {
      Alert.alert(
        "Set all 3 fees",
        "Enter a service fee greater than zero (INR) for Package 1, 2, and 3.",
      );
      return;
    }
    try {
      setBusy(true);
      const { localOnly } = await saveDoctorPackageTemplates(
        doctorProfileId,
        slots,
        currentUserId || null,
      );
      if (localOnly) {
        Alert.alert(
          "Saved on this device",
          "The server did not accept the update (often fixed by allowing doctors to update their own doctor_profile in PocketBase). Your fees are stored here until sync succeeds.",
        );
      } else {
        Alert.alert(
          "Saved",
          "Your fees are saved. Patients see the app-defined features with your prices on your profile.",
        );
      }
      onComplete?.();
    } catch (e) {
      Alert.alert("Could not save", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (!doctorProfileId || !currentUserId) {
      Alert.alert("Profile", "Sign in again to continue.");
      return;
    }
    try {
      setBusy(true);
      await persistPackageSetupSkip({
        profileId: doctorProfileId,
        userId: currentUserId,
      });
      onSkip?.();
    } catch (e) {
      Alert.alert("Could not skip", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingHorizontal: S.pad,
          paddingBottom: 8,
        }}
      >
        <TouchableOpacity
          onPress={skip}
          disabled={busy}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: 20,
            marginRight: 10,
            backgroundColor: theme.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.cardBorder,
          }}
        >
          <Text
            style={{
              color: theme.textSecondary,
              fontWeight: "800",
              fontSize: 13,
            }}
          >
            Skip
          </Text>
        </TouchableOpacity>
        {typeof onLogout === "function" ? (
          <TouchableOpacity
            onPress={() => onLogout()}
            disabled={busy}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 20,
              backgroundColor: theme.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.cardBorder,
            }}
          >
            <Text
              style={{ color: theme.accent, fontWeight: "800", fontSize: 13 }}
            >
              Log out
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: S.pad,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <Text
          style={{ color: theme.textPrimary, fontSize: 22, fontWeight: "900" }}
        >
          Set your package fees
        </Text>
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: S.small,
            marginTop: 8,
            marginBottom: 20,
          }}
        >
          Package names, periods, descriptions, and included features are fixed
          by the app and are the same for every doctor. You only set your
          service fee (INR) for each of the three tiers. Use Skip if you want to
          finish this later from your profile; you can return any time.
        </Text>

        {slots.map((slot, index) => (
          <View
            key={slot.slot}
            style={{
              backgroundColor: theme.card,
              borderRadius: 16,
              padding: 14,
              marginBottom: 16,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.cardBorder,
            }}
          >
            <Text
              style={{
                color: theme.accent,
                fontWeight: "900",
                marginBottom: 6,
              }}
            >
              {slot.name}
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: S.small,
                marginBottom: 4,
              }}
            >
              {slot.total_period} · {slot.treatment_type}
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: S.small,
                marginBottom: 10,
                lineHeight: 20,
              }}
            >
              {slot.description}
            </Text>
            {Array.isArray(slot.features) && slot.features.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                {slot.features.map((line, fi) => (
                  <Text
                    key={`${slot.slot}-${fi}`}
                    style={{
                      color: theme.textTertiary,
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    • {line}
                  </Text>
                ))}
              </View>
            ) : null}
            <Text
              style={{
                color: theme.textPrimary,
                fontSize: 12,
                fontWeight: "700",
                marginBottom: 6,
              }}
            >
              Your service fee (INR)
            </Text>
            <TextInput
              placeholder="e.g. 8000"
              placeholderTextColor={theme.textTertiary}
              keyboardType="numeric"
              value={String(slot.total_amount_inr ?? "")}
              onChangeText={(t) => patchSlot(index, { total_amount_inr: t })}
              style={slotInput(theme)}
            />
          </View>
        ))}

        <TouchableOpacity
          onPress={save}
          disabled={busy}
          style={{
            backgroundColor: theme.accent,
            padding: 16,
            borderRadius: 16,
            alignItems: "center",
            opacity: busy ? 0.85 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
              Save & enter dashboard
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

export function MedicalRecordsScreen({ theme, onBack, patientUserId }) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchMedicalRecordsForPatient(patientUserId);
    setRows(list);
    setLoading(false);
  }, [patientUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pickAndUpload = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission", "Photo access is needed to upload records.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;
      const uri = asset.uri;
      const ext = String(uri.split(".").pop() || "jpg")
        .split("?")[0]
        .toLowerCase();
      const mime =
        ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg";
      const part = {
        uri: Platform.OS === "ios" ? uri.replace("file://", "") : uri,
        name: asset.fileName || `record_${Date.now()}.jpg`,
        type: mime,
      };
      setBusy(true);
      await uploadMedicalRecord({
        patientUserId,
        title: title.trim() || "Medical record",
        filePart: part,
      });
      setTitle("");
      await load();
      Alert.alert(
        "Saved",
        "Your record is stored on your profile for sharing during consults.",
      );
    } catch (e) {
      Alert.alert("Upload", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: S.pad,
          paddingBottom: S.pad,
          paddingTop: (insets.top || 0) + 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text
          style={{
            color: theme.textPrimary,
            fontSize: S.title,
            fontWeight: "800",
          }}
        >
          Medical records
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.pad }}>
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: S.small,
            marginBottom: 12,
          }}
        >
          Upload prescriptions, lab reports, or images. They stay on your
          profile and can be shared during demo calls, package sessions, or
          quick consults.
        </Text>
        <TextInput
          placeholder="Title (e.g. Lab report Dec 2025)"
          placeholderTextColor={theme.textTertiary}
          value={title}
          onChangeText={setTitle}
          style={{
            backgroundColor: theme.card,
            borderRadius: 14,
            padding: 14,
            color: theme.textPrimary,
            borderWidth: 1,
            borderColor: theme.cardBorder,
            marginBottom: 12,
          }}
        />
        <TouchableOpacity
          onPress={pickAndUpload}
          disabled={busy}
          style={{
            backgroundColor: theme.accent,
            padding: 16,
            borderRadius: 16,
            alignItems: "center",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              Upload file
            </Text>
          )}
        </TouchableOpacity>

        <Text
          style={{
            marginTop: 24,
            marginBottom: 8,
            color: theme.textTertiary,
            fontWeight: "700",
            fontSize: 11,
            letterSpacing: 0.6,
          }}
        >
          YOUR FILES
        </Text>
        {loading ? (
          <ActivityIndicator color={theme.accent} />
        ) : rows.length === 0 ? (
          <Text style={{ color: theme.textSecondary }}>No records yet.</Text>
        ) : (
          rows.map((r) => (
            <View
              key={r.id}
              style={{
                backgroundColor: theme.card,
                padding: 12,
                borderRadius: 12,
                marginBottom: 8,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.cardBorder,
              }}
            >
              <Text style={{ color: theme.textPrimary, fontWeight: "700" }}>
                {r.title || "Record"}
              </Text>
              <Text
                style={{
                  color: theme.textTertiary,
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                {r.created ? String(r.created).slice(0, 10) : ""}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

export function QuickSolutionScreen({ theme, onBack, patientUserId }) {
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState("");
  const [privateMode, setPrivateMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    try {
      setBusy(true);
      await createQuickSolutionRequest({
        patientUserId,
        notes,
        privateMode,
        imagePart: null,
      });
      Alert.alert(
        "Submitted",
        privateMode
          ? "Private mode is on: your name, photo, and contact details are hidden from the clinic side."
          : "Your query is queued for a verified clinic (10 coins / ₹10).",
      );
      onBack?.();
    } catch (e) {
      Alert.alert("Quick Solution", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: S.pad,
          paddingBottom: S.pad,
          paddingTop: (insets.top || 0) + 12,
        }}
      >
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text
          style={{
            color: theme.textPrimary,
            fontSize: S.title,
            fontWeight: "800",
          }}
        >
          Quick Solution
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.pad }}>
        <Text
          style={{
            color: theme.textSecondary,
            marginBottom: 12,
            fontSize: S.small,
          }}
        >
          ₹10 (10 coins) per snap or query - platform 5 coins, clinic 5 coins.
          Verified clinics and RMP doctors only.
        </Text>
        <TouchableOpacity
          onPress={() => setPrivateMode((v) => !v)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: privateMode ? theme.accentLight : theme.card,
            padding: 14,
            borderRadius: 14,
            marginBottom: 16,
            borderWidth: 2,
            borderColor: privateMode ? theme.accent : theme.cardBorder,
          }}
        >
          <Ionicons
            name={privateMode ? "eye-off" : "eye"}
            size={22}
            color={theme.accent}
            style={{ marginRight: 10 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>
              Private mode
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: S.small,
                marginTop: 4,
              }}
            >
              Hide your name, photo, and contact info from the clinic for
              sensitive issues. You still see the provider details.
            </Text>
          </View>
        </TouchableOpacity>
        <TextInput
          placeholder="Describe your question or symptom…"
          placeholderTextColor={theme.textTertiary}
          multiline
          value={notes}
          onChangeText={setNotes}
          style={{
            minHeight: 120,
            backgroundColor: theme.card,
            borderRadius: 14,
            padding: 14,
            color: theme.textPrimary,
            borderWidth: 1,
            borderColor: theme.cardBorder,
            textAlignVertical: "top",
          }}
        />
        <TouchableOpacity
          onPress={submit}
          disabled={busy}
          style={{
            marginTop: 20,
            backgroundColor: theme.accent,
            padding: 16,
            borderRadius: 16,
            alignItems: "center",
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              Submit (10 coins)
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

export function QuickCounsellingScreen({
  theme,
  onBack,
  patientUserId,
  /** When true, show copy tuned for Wound tab entry (same API, no image). */
  fromWoundTracker = false,
}) {
  const insets = useSafeAreaInsets();
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    try {
      setBusy(true);
      await createQuickCounsellingRequest({ patientUserId, topic });
      Alert.alert(
        "Queued",
        fromWoundTracker
          ? "Quick Counselling (25 coins). An RMP/clinic doctor will reach out for a video call. Platform 10, doctor/clinic 15 coins."
          : "Quick Counselling (25 coins). Platform 10, doctor/clinic 15.",
      );
      onBack?.();
    } catch (e) {
      Alert.alert("Counselling", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: S.pad,
          paddingBottom: S.pad,
          paddingTop: (insets.top || 0) + 12,
        }}
      >
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text
          style={{
            color: theme.textPrimary,
            fontSize: S.title,
            fontWeight: "800",
          }}
        >
          Quick Counselling
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.pad }}>
        <Text
          style={{
            color: theme.textSecondary,
            marginBottom: 12,
            fontSize: S.small,
          }}
        >
          {fromWoundTracker
            ? "₹25 (25 coins) — video call with a verified RMP/clinic doctor. Platform 10 coins, doctor/clinic 15 coins. No wound photo; describe your concerns below."
            : "₹25 (25 coins) - platform 10 coins, doctor/clinic 15 coins."}
        </Text>
        {fromWoundTracker ? (
          <Text
            style={{
              color: theme.textTertiary,
              marginBottom: 12,
              fontSize: S.small,
            }}
          >
            Separate from Quick Solution (₹10 wound snap). Use this for a full
            consultation by video call instead of uploading a wound image.
          </Text>
        ) : null}
        <TextInput
          placeholder={
            fromWoundTracker
              ? "Describe symptoms, pain, or questions for your video consultation…"
              : "What would you like to talk about?"
          }
          placeholderTextColor={theme.textTertiary}
          value={topic}
          onChangeText={setTopic}
          multiline
          textAlignVertical="top"
          style={{
            minHeight: fromWoundTracker ? 140 : 88,
            backgroundColor: theme.card,
            borderRadius: 14,
            padding: 14,
            color: theme.textPrimary,
            borderWidth: 1,
            borderColor: theme.cardBorder,
          }}
        />
        <TouchableOpacity
          onPress={submit}
          disabled={busy}
          style={{
            marginTop: 20,
            backgroundColor: theme.success,
            padding: 16,
            borderRadius: 16,
            alignItems: "center",
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              Start request (25 coins)
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/**
 * Patient: unified list of package-style demo meetings + orphan offers (same cards as former
 * “Your demo meetings” on Package Doctor). Used from the Appts tab and anywhere else we need it.
 */
export function PatientPackageMeetingsPanel({
  theme,
  patientUserId,
  patientProfileId,
  doctors = [],
  onOpenChatWithDoctor,
  onAfterPackagePayment,
  onPayPackageOffer,
  onPayAppointment,
  /** Extra ScrollView bottom inset when this sits above a floating tab bar (see App.js). */
  scrollContentBottomInset = 120,
  /** When null, no in-list title (e.g. Appts screen already has a header). */
  sectionTitle = null,
  emptyHint = "None yet. Use Book Appt on Home or Package journey to schedule.",
  /** Called after pay / cancel / reschedule reload - e.g. sync `appointments` in App state. */
  onMeetingsChanged,
}) {
  const insets = useSafeAreaInsets();
  const [meetings, setMeetings] = useState([]);
  const [offers, setOffers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pickedReschedule, setPickedReschedule] = useState({});

  const doctorName = useCallback(
    (userId) => {
      const d = (doctors || []).find((x) => x.userId === userId);
      return d?.name || "Doctor";
    },
    [doctors],
  );

  const reload = useCallback(async () => {
    if (!patientUserId) {
      setOffers([]);
      setMeetings([]);
      return;
    }
    const o = await listPackageOffersForPatient(
      patientUserId,
      patientProfileId,
    );
    setOffers(o);
    const m = await listPackageMeetingsForPatient(patientUserId);
    setMeetings(m);
  }, [patientUserId, patientProfileId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload();
    });
    return () => sub.remove();
  }, [reload]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  const offerDoctorUserId = useCallback(
    (offer) => {
      if (!offer) return null;
      const direct = String(offer.doctor_user_id || "").trim();
      if (direct) return direct;
      const raw = String(offer.doctor || "").trim();
      const match = (doctors || []).find(
        (d) => String(d.userId) === raw || String(d.profileId) === raw,
      );
      return match?.userId || raw || null;
    },
    [doctors],
  );

  const linkedOfferForMeeting = useCallback(
    (meeting) => {
      const oid = String(meeting?.package_offer_id || "").trim();
      if (!oid) return null;
      return (offers || []).find((o) => String(o.id) === oid) || null;
    },
    [offers],
  );

  const payOffer = async (offer) => {
    try {
      setBusy(true);
      const doctorUserId = offerDoctorUserId(offer);
      if (typeof onPayPackageOffer === "function") {
        await onPayPackageOffer(offer, doctorUserId);
      } else {
        await patientPayPackageOfferStub(offer.id, doctorUserId);
      }
      try {
        await onAfterPackagePayment?.({
          doctorUserId,
          packageTitle: offer.title,
          amount: offer.amount_inr,
        });
      } catch {
        // optional
      }
      await reload();
      try {
        await onMeetingsChanged?.();
      } catch {
        // ignore
      }
      Alert.alert(
        "Paid - deal started",
        "Payment recorded and a chat with this doctor is now open in the Chat tab. Tap Go to chat from your appointment card to continue the conversation.",
      );
    } catch (e) {
      Alert.alert("Payment", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const payAppointment = async (meeting) => {
    try {
      setBusy(true);
      const paid = await onPayAppointment?.({
        id: meeting.id,
        statusKey: "approved",
        doctorName: doctorName(meeting.doctor_user_id),
        doctorUserId: meeting.doctor_user_id,
        consultationType: meeting.call_kind || "video",
        consultationFee: meeting.consultation_fee || meeting.fee || 500,
      });
      if (paid === false) return;
      await reload();
      try {
        await onMeetingsChanged?.();
      } catch {
        // ignore
      }
    } catch (e) {
      Alert.alert("Payment", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const goToChatWithMeetingDoctor = async (meeting) => {
    const doctorUid = String(meeting?.doctor_user_id || "").trim();
    if (!doctorUid) {
      Alert.alert("Chat", "Doctor info missing on this meeting.");
      return;
    }
    const offer = linkedOfferForMeeting(meeting);
    try {
      await onOpenChatWithDoctor?.(doctorUid, meeting, offer);
    } catch (e) {
      Alert.alert("Chat", e?.message || "Could not open chat.");
    }
  };

  const submitRescheduleChoice = async (meetingId) => {
    const iso = pickedReschedule[meetingId];
    if (!iso) {
      Alert.alert("Time", "Choose one of your doctor’s suggested slots.");
      return;
    }
    try {
      setBusy(true);
      await patientChooseRescheduleSlot(meetingId, iso);
      setPickedReschedule((p) => ({ ...p, [meetingId]: null }));
      await reload();
      try {
        await onMeetingsChanged?.();
      } catch {
        // ignore
      }
      Alert.alert("Sent", "Your doctor will confirm this time.");
    } catch (e) {
      Alert.alert("Reschedule", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: S.pad,
        paddingTop: 4,
        paddingBottom: scrollContentBottomInset + (insets.bottom || 0) + 24,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.accent}
        />
      }
    >
      {sectionTitle ? (
        <Text
          style={{
            fontWeight: "800",
            color: theme.textPrimary,
            fontSize: S.title,
          }}
        >
          {sectionTitle}
        </Text>
      ) : null}
      {meetings.length === 0 ? (
        <Text
          style={{ color: theme.textTertiary, marginTop: sectionTitle ? 8 : 0 }}
        >
          {emptyHint}
        </Text>
      ) : (
        meetings.map((x) => {
          const st = String(x.status || "");
          const linkedOffer = linkedOfferForMeeting(x);
          const offerStatus = String(linkedOffer?.status || "").toLowerCase();
          const appointmentStatus = String(
            x.appointment_status || "",
          ).toLowerCase();
          const isPaid =
            ["paid", "active", "started"].includes(offerStatus) ||
            appointmentStatus === "paid" ||
            appointmentStatus === "completed";
          const isConfirmed = st === PACKAGE_MEETING_STATUS.CONFIRMED;
          const isDiscussing =
            st === PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS ||
            st === PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK;
          const meetingTimeIso =
            isConfirmed && x.confirmed_at
              ? x.confirmed_at
              : x.patient_selected_slot || x.proposed_at;
          const meetingDateLabel = meetingTimeIso
            ? new Date(meetingTimeIso).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "2-digit",
              })
            : "";
          const meetingTimeLabel = meetingTimeIso
            ? new Date(meetingTimeIso).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
            : "";
          const methodLabel =
            x.call_kind === "chat" ? "Chat consult" : "Video consult";
          let badgeText = "pending";
          let badgeBg = theme.bg;
          let badgeFg = theme.textTertiary;
          if (isPaid) {
            badgeText = "paid";
            badgeBg = theme.successLight;
            badgeFg = theme.success;
          } else if (isConfirmed) {
            badgeText = "approved";
            badgeBg = theme.accentLight;
            badgeFg = theme.accent;
          } else if (isDiscussing) {
            badgeText = "discussing";
            badgeBg = theme.warningLight || "#FEF3C7";
            badgeFg = theme.warning;
          }
          const showRescheduleUI =
            x.status === PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS &&
            (x.doctor_alternate_slots || []).length > 0;
          const showGoToChat = isConfirmed;
          const showCancel = !isConfirmed;
          const hasPackageSuggestion = !!linkedOffer && !isPaid;
          const canPayAppointment =
            isConfirmed &&
            !linkedOffer &&
            !isPaid &&
            typeof onPayAppointment === "function";
          const payEnabled =
            isConfirmed &&
            !isPaid &&
            (hasPackageSuggestion || canPayAppointment);
          const packageLine = isPaid
            ? ""
            : !linkedOffer
              ? "The doctor has not suggested a package option yet."
              : `Doctor suggested ${String(x.package_request_label || linkedOffer.title || "a package").trim()}. Payment: ₹${linkedOffer.amount_inr ?? "-"}.`;
          return (
            <View
              key={x.id}
              style={{
                marginTop: 10,
                padding: 14,
                borderRadius: 14,
                backgroundColor: theme.card,
                borderWidth: 1,
                borderColor: theme.cardBorder,
              }}
            >
              {x.localOnly ? (
                <View
                  style={{
                    backgroundColor: theme.warning + "22",
                    borderRadius: 10,
                    padding: 8,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: theme.warning,
                  }}
                >
                  <Text
                    style={{
                      color: theme.warning,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    On this device only - could not save to PocketBase
                    `appointments`.
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text
                  style={{
                    color: theme.accent,
                    fontWeight: "800",
                    flex: 1,
                    marginRight: 8,
                  }}
                  numberOfLines={1}
                >
                  {doctorName(x.doctor_user_id)}
                </Text>
                <View
                  style={{
                    backgroundColor: badgeBg,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                  }}
                >
                  <Text
                    style={{ color: badgeFg, fontWeight: "800", fontSize: 11 }}
                  >
                    {badgeText}
                  </Text>
                </View>
              </View>
              {meetingTimeIso ? (
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: S.small,
                    marginTop: 6,
                  }}
                >
                  {meetingDateLabel} · {meetingTimeLabel} · {methodLabel}
                </Text>
              ) : null}
              {x.description ? (
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontSize: S.small,
                    marginTop: 6,
                  }}
                >
                  <Text style={{ fontWeight: "700" }}>Reason: </Text>
                  {x.description}
                </Text>
              ) : null}
              {isConfirmed && !isPaid ? (
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: S.small,
                    marginTop: 8,
                  }}
                >
                  {packageLine}
                </Text>
              ) : null}
              {showRescheduleUI ? (
                <View style={{ marginTop: 12 }}>
                  <Text
                    style={{
                      color: theme.textPrimary,
                      fontWeight: "700",
                      marginBottom: 8,
                    }}
                  >
                    Pick one of your doctor’s times
                  </Text>
                  {(x.doctor_alternate_slots || []).map((slot) => {
                    const label = new Date(slot).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    });
                    const selected = pickedReschedule[x.id] === slot;
                    return (
                      <TouchableOpacity
                        key={slot}
                        onPress={() =>
                          setPickedReschedule((p) => ({ ...p, [x.id]: slot }))
                        }
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          marginBottom: 8,
                          borderWidth: 2,
                          borderColor: selected
                            ? theme.accent
                            : theme.cardBorder,
                          backgroundColor: selected
                            ? theme.accentLight
                            : theme.bg,
                        }}
                      >
                        <Text
                          style={{
                            color: theme.textPrimary,
                            fontWeight: "700",
                          }}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    onPress={() => submitRescheduleChoice(x.id)}
                    disabled={busy}
                    style={{
                      marginTop: 4,
                      backgroundColor: theme.warning,
                      padding: 12,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800" }}>
                      Send chosen time to doctor
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  marginTop: 12,
                }}
              >
                {isConfirmed && !isPaid ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (linkedOffer) payOffer(linkedOffer);
                      else payAppointment(x);
                    }}
                    disabled={busy || !payEnabled}
                    style={{
                      backgroundColor: theme.success,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 10,
                      marginRight: 8,
                      opacity: busy || !payEnabled ? 0.45 : 1,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800" }}>
                      Pay ₹
                      {linkedOffer?.amount_inr ??
                        x.consultation_fee ??
                        x.fee ??
                        500}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {showGoToChat ? (
                  <TouchableOpacity
                    onPress={() => goToChatWithMeetingDoctor(x)}
                    style={{
                      backgroundColor: theme.accent,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 10,
                      marginRight: 8,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800" }}>
                      Go to chat
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {showCancel ? (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        "Cancel this request?",
                        "This removes the meeting for you and your doctor.",
                        [
                          { text: "Keep", style: "cancel" },
                          {
                            text: "Cancel meeting",
                            style: "destructive",
                            onPress: async () => {
                              try {
                                setBusy(true);
                                await patientCancelPackageDemoMeeting(x.id);
                                await reload();
                                try {
                                  await onMeetingsChanged?.();
                                } catch {
                                  // ignore
                                }
                              } catch (e) {
                                Alert.alert("Cancel", e?.message || "Failed");
                              } finally {
                                setBusy(false);
                              }
                            },
                          },
                        ],
                      );
                    }}
                    disabled={busy}
                    style={{
                      backgroundColor: theme.bg,
                      borderWidth: 1,
                      borderColor: theme.cardBorder,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.danger || "#b91c1c",
                        fontWeight: "800",
                      }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })
      )}

      {(() => {
        const meetingDoctorIds = new Set(
          (meetings || [])
            .map((m) => String(m.doctor_user_id || "").trim())
            .filter(Boolean),
        );
        const orphans = (offers || []).filter((o) => {
          const did = String(offerDoctorUserId(o) || "").trim();
          return did && !meetingDoctorIds.has(did);
        });
        if (orphans.length === 0) return null;
        return (
          <>
            <Text
              style={{
                marginTop: 20,
                fontWeight: "800",
                color: theme.textPrimary,
              }}
            >
              Other package offers
            </Text>
            {orphans.map((o) => {
              const isPaid = ["paid", "active", "started"].includes(
                String(o.status || "").toLowerCase(),
              );
              return (
                <View
                  key={o.id}
                  style={{
                    marginTop: 10,
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: theme.card,
                    borderWidth: 1,
                    borderColor: theme.cardBorder,
                  }}
                >
                  <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>
                    {o.title || "Package"}
                  </Text>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: S.small,
                      marginTop: 6,
                    }}
                  >
                    Service fee ₹{o.amount_inr ?? "-"} ·{" "}
                    {isPaid ? "Paid" : "Awaiting payment"}
                  </Text>
                  {!isPaid ? (
                    <TouchableOpacity
                      onPress={() => payOffer(o)}
                      disabled={busy}
                      style={{
                        marginTop: 12,
                        backgroundColor: theme.success,
                        padding: 12,
                        borderRadius: 12,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "800" }}>
                        Pay ₹{o.amount_inr ?? "-"}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() =>
                        onOpenChatWithDoctor?.(offerDoctorUserId(o), null, o)
                      }
                      style={{
                        marginTop: 12,
                        backgroundColor: theme.accent,
                        padding: 12,
                        borderRadius: 12,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "800" }}>
                        Go to chat
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        );
      })()}
    </ScrollView>
  );
}

export function PackageDoctorJourneyScreen({
  theme,
  onBack,
  patientUserId,
  patientProfileId,
  doctors,
  /** Extra ScrollView bottom inset when this screen sits above a floating tab bar (see App.js). */
  scrollContentBottomInset = 120,
  /** Optional: open the Appts tab where all meetings are listed. */
  onGoToAppointmentsTab,
  onPaySelectedPackage,
  onPackagePaid,
}) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [meetingDateTime, setMeetingDateTime] = useState(null);
  const [pickerMode, setPickerMode] = useState(null);
  const [meetingDesc, setMeetingDesc] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = doctors || [];
    if (!q) return base;
    return base.filter((d) =>
      String(d.name || "")
        .toLowerCase()
        .includes(q),
    );
  }, [doctors, search]);

  const submitBooking = async () => {
    if (!selectedDoctor?.userId) {
      Alert.alert("Doctor", "Select a doctor first.");
      return;
    }
    if (
      !(meetingDateTime instanceof Date) ||
      Number.isNaN(meetingDateTime.getTime())
    ) {
      Alert.alert(
        "Date & time",
        "Please tap the calendar and clock to pick a date and time before sending.",
      );
      return;
    }
    if (meetingDateTime.getTime() < Date.now() - 60 * 1000) {
      Alert.alert("Date & time", "Pick a time in the future.");
      return;
    }
    const when = meetingDateTime.toISOString();
    const desc = meetingDesc.trim();
    if (!desc) {
      Alert.alert(
        "Description",
        "Describe the reason for the visit, symptoms, billing context, etc.",
      );
      return;
    }
    try {
      setBusy(true);
      const created = await createPackageMeetingRequest({
        patientUserId,
        doctorUserId: selectedDoctor.userId,
        doctorProfileId: selectedDoctor.profileId,
        proposedAtIso: when,
        description: desc,
        callKind: "video",
      });
      setMeetingDesc("");
      setMeetingDateTime(null);
      if (created?.localOnly) {
        Alert.alert(
          "Saved on this device",
          "PocketBase could not save the appointment (permissions, rules, or network). Your request is stored on this phone so you can test the flow. Fix `appointments` Create rules and try again. Track it under Appts → My appointments.",
        );
      } else {
        Alert.alert(
          "Request sent",
          "Your doctor can accept this time or suggest other slots. Track the meeting under Appts → My appointments. You will get an alert 30 minutes before the confirmed meeting.",
        );
      }
    } catch (e) {
      Alert.alert("Booking", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const paySelectedPackage = async () => {
    if (!selectedDoctor?.userId || !selectedSlot) {
      Alert.alert("Package", "Select a doctor and package first.");
      return;
    }
    try {
      setBusy(true);
      const offer = await createPatientSelectedPackageOffer({
        patientUserId,
        doctorUserId: selectedDoctor.userId,
        slot: selectedSlot,
        packageSlotIndex: selectedSlot.slot,
      });
      if (typeof onPaySelectedPackage === "function") {
        await onPaySelectedPackage(offer, selectedDoctor.userId);
      } else {
        await patientPayPackageOfferStub(offer.id, selectedDoctor.userId);
      }
      await onPackagePaid?.(offer);
      Alert.alert(
        "Package active",
        "Payment confirmed. This doctor is fixed for the package and coins are loaded to your dashboard.",
      );
    } catch (e) {
      Alert.alert("Package payment", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const requestChange = async () => {
    try {
      setBusy(true);
      await requestPackageDoctorChange({
        patientUserId,
        notes: "Patient requested reassignment via app.",
        currentDoctorUserId: selectedDoctor?.userId,
      });
      Alert.alert(
        "Request sent",
        "Doctor change requests are processed by admin. There is no refund of the package amount; the new doctor continues remaining services.",
      );
    } catch (e) {
      Alert.alert("Change doctor", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const inputBase = {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    marginBottom: 10,
  };

  const formatDateLabel = (d) =>
    d instanceof Date && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          weekday: "short",
        })
      : "Tap to pick date";
  const formatTimeLabel = (d) =>
    d instanceof Date && !Number.isNaN(d.getTime())
      ? d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "Tap to pick time";

  const openPicker = (mode) => {
    if (!(meetingDateTime instanceof Date)) {
      const seed = new Date();
      seed.setSeconds(0, 0);
      if (mode === "time") {
        seed.setMinutes(Math.ceil(seed.getMinutes() / 5) * 5);
      }
      setMeetingDateTime(seed);
    }
    setPickerMode(mode);
  };

  const applyPickerValue = (mode, value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return;
    const next =
      meetingDateTime instanceof Date &&
      !Number.isNaN(meetingDateTime.getTime())
        ? new Date(meetingDateTime)
        : new Date();
    if (mode === "date") {
      next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
    } else {
      next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    }
    setMeetingDateTime(next);
  };

  const onPickerChange = (event, value) => {
    const mode = pickerMode;
    if (Platform.OS === "android") {
      setPickerMode(null);
      if (event?.type === "set" && value) applyPickerValue(mode, value);
    } else if (value) {
      applyPickerValue(mode, value);
    }
  };

  const pickerButton = (label, valueLabel, onPress, iconName) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: theme.card,
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: theme.cardBorder,
        marginBottom: 10,
      }}
    >
      <Ionicons
        name={iconName}
        size={20}
        color={theme.accent}
        style={{ marginRight: 12 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textTertiary, fontSize: 11 }}>{label}</Text>
        <Text
          style={{
            color: theme.textPrimary,
            fontSize: 14,
            fontWeight: "700",
            marginTop: 2,
          }}
        >
          {valueLabel}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: S.pad,
          paddingBottom: S.pad,
          paddingTop: (insets.top || 0) + 12,
        }}
      >
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text
          style={{
            color: theme.textPrimary,
            fontSize: S.title,
            fontWeight: "800",
          }}
        >
          Package Doctor
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: S.pad,
          paddingBottom: scrollContentBottomInset + (insets.bottom || 0) + 24,
        }}
      >
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: S.small,
            marginBottom: 12,
          }}
        >
          Search by doctor name, choose a package and pay immediately, or book a
          demo meeting first. Payment is to the company first; the doctor’s
          share becomes withdrawable coins after they complete package duties (1
          coin = ₹1). Changing assigned doctor later has no refund; the new
          doctor continues remaining care.
        </Text>
        {(!doctors || doctors.length === 0) && (
          <Text
            style={{
              color: theme.warning,
              fontSize: S.small,
              marginBottom: 12,
              lineHeight: 20,
            }}
          >
            No approved professional or specialist doctors are available for
            package demos yet. In PocketBase, set practitioner tier to
            professional or specialist on doctor profiles you want in Package
            Doctor Mode.
          </Text>
        )}
        <TextInput
          placeholder="Search verified doctors by name…"
          placeholderTextColor={theme.textTertiary}
          value={search}
          onChangeText={setSearch}
          style={inputBase}
        />
        {filtered.slice(0, 8).map((d) => (
          <TouchableOpacity
            key={d.profileId || d.userId}
            onPress={() => {
              setSelectedDoctor(d);
              const firstSlot = Array.isArray(d.packageSlots)
                ? d.packageSlots[0]
                : null;
              setSelectedSlot(firstSlot || null);
            }}
            style={{
              padding: 12,
              borderRadius: 12,
              marginBottom: 8,
              backgroundColor:
                selectedDoctor?.userId === d.userId
                  ? theme.accentLight
                  : theme.card,
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontWeight: "700" }}>
              {d.name}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: S.small }}>
              {d.specialty}
            </Text>
            <Text
              style={{ color: theme.textTertiary, fontSize: 10, marginTop: 4 }}
            >
              Package Doctor ·{" "}
              {d.packagesSetupComplete
                ? "fees configured on profile"
                : "fees may still be completing"}
            </Text>
          </TouchableOpacity>
        ))}

        {selectedDoctor ? (
          <View
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 16,
              backgroundColor: theme.card,
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontWeight: "900" }}>
              Start package with {selectedDoctor.name || "Doctor"}
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: S.small,
                marginTop: 6,
                marginBottom: 10,
                lineHeight: 18,
              }}
            >
              Pay the doctor’s configured package fee, or the default amount if
              the fee is not configured. The paid doctor-patient pair is fixed
              for coin settlement.
            </Text>
            {(selectedDoctor.packageSlots || []).map((slot) => {
              const amount = resolvePackageSlotAmountInr(slot);
              const selected = selectedSlot?.slot === slot.slot;
              const usesDefault = packageSlotUsesDefaultAmount(slot);
              return (
                <TouchableOpacity
                  key={slot.slot}
                  onPress={() => setSelectedSlot(slot)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: selected ? theme.accent : theme.cardBorder,
                    backgroundColor: selected ? theme.accentLight : theme.bg,
                  }}
                >
                  <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>
                    {slot.name || `Package ${slot.slot}`}
                  </Text>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: S.small,
                      marginTop: 4,
                    }}
                  >
                    Pay ₹{amount}
                    {usesDefault ? " · default amount" : " · doctor fee"}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={paySelectedPackage}
              disabled={busy || !selectedSlot}
              style={{
                marginTop: 4,
                backgroundColor: theme.success,
                padding: 14,
                borderRadius: 14,
                alignItems: "center",
                opacity: busy || !selectedSlot ? 0.55 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  Pay package with Cashfree
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        <Text
          style={{ marginTop: 8, fontWeight: "800", color: theme.textPrimary }}
        >
          Proposed meeting
        </Text>
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: S.small,
            marginBottom: 6,
          }}
        >
          Describe your visit first, then pick date and time (required before
          sending).
        </Text>
        <Text
          style={{
            color: theme.textPrimary,
            fontSize: 12,
            fontWeight: "700",
            marginBottom: 4,
          }}
        >
          Your description (required)
        </Text>
        <TextInput
          placeholder="Reason for visit, symptoms, billing context, anything the doctor should know…"
          placeholderTextColor={theme.textTertiary}
          value={meetingDesc}
          onChangeText={setMeetingDesc}
          multiline
          style={[inputBase, { minHeight: 110, textAlignVertical: "top" }]}
        />
        <Text
          style={{ color: theme.textTertiary, fontSize: 11, marginBottom: 6 }}
        >
          Pick a date and time using the calendar and clock (this device’s local
          timezone).
        </Text>
        {pickerButton(
          "Date",
          formatDateLabel(meetingDateTime),
          () => openPicker("date"),
          "calendar-outline",
        )}
        {pickerButton(
          "Time",
          formatTimeLabel(meetingDateTime),
          () => openPicker("time"),
          "time-outline",
        )}
        {Platform.OS === "android" && pickerMode ? (
          <DateTimePicker
            value={
              meetingDateTime instanceof Date &&
              !Number.isNaN(meetingDateTime.getTime())
                ? meetingDateTime
                : new Date()
            }
            mode={pickerMode}
            display="default"
            is24Hour={false}
            minimumDate={pickerMode === "date" ? new Date() : undefined}
            onChange={onPickerChange}
          />
        ) : null}
        {Platform.OS === "ios" && pickerMode ? (
          <Modal
            transparent
            animationType="fade"
            visible
            onRequestClose={() => setPickerMode(null)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.4)",
                justifyContent: "flex-end",
              }}
            >
              <View
                style={{
                  backgroundColor: theme.card,
                  padding: 16,
                  paddingBottom: 28,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <TouchableOpacity onPress={() => setPickerMode(null)}>
                    <Text style={{ color: theme.warning, fontWeight: "700" }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>
                    {pickerMode === "date" ? "Pick date" : "Pick time"}
                  </Text>
                  <TouchableOpacity onPress={() => setPickerMode(null)}>
                    <Text style={{ color: theme.accent, fontWeight: "800" }}>
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={
                    meetingDateTime instanceof Date &&
                    !Number.isNaN(meetingDateTime.getTime())
                      ? meetingDateTime
                      : new Date()
                  }
                  mode={pickerMode}
                  display="spinner"
                  is24Hour={false}
                  locale="en-US"
                  minimumDate={pickerMode === "date" ? new Date() : undefined}
                  onChange={onPickerChange}
                />
              </View>
            </View>
          </Modal>
        ) : null}
        <TouchableOpacity
          onPress={submitBooking}
          disabled={busy}
          style={{
            marginTop: 4,
            backgroundColor: theme.accent,
            padding: 14,
            borderRadius: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>Send</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={requestChange}
          disabled={busy}
          style={{ marginTop: 10, padding: 12 }}
        >
          <Text
            style={{
              color: theme.warning,
              fontWeight: "700",
              textAlign: "center",
            }}
          >
            Request change of assigned doctor (no refund)
          </Text>
        </TouchableOpacity>

        <View
          style={{
            marginTop: 24,
            padding: 14,
            borderRadius: 14,
            backgroundColor: theme.accentLight,
            borderWidth: 1,
            borderColor: theme.accent,
          }}
        >
          <Text
            style={{
              color: theme.textPrimary,
              fontWeight: "800",
              marginBottom: 8,
            }}
          >
            Track your meetings
          </Text>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              lineHeight: 20,
            }}
          >
            Whether you book from here or from Book Appt on Home, every request,
            reschedule, package offer, and payment lives under the Appts tab -
            same cards and actions everywhere.
          </Text>
          {typeof onGoToAppointmentsTab === "function" ? (
            <TouchableOpacity
              onPress={onGoToAppointmentsTab}
              style={{
                marginTop: 12,
                backgroundColor: theme.accent,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                Open Appts tab
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * PDF: after demo / explanation doctor taps “Send package options” → patient sees offer + Pay now.
 * Shown on Discussing rows and Confirmed demo rows (not on the bare dashboard).
 */
function PackageSuggestAfterMeetingInline({
  theme,
  patientUserId,
  catalogSlots,
  onPackageOptionsSent,
}) {
  const user = getAuthUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [draftSlot, setDraftSlot] = useState(null);
  const [busy, setBusy] = useState(false);

  const openSuggest = (index) => {
    const base = catalogSlots[index] || { slot: index + 1 };
    setActiveSlotIndex(index);
    setDraftSlot({ ...base });
    setModalOpen(true);
  };

  const sendFromModal = async () => {
    const uid = String(patientUserId || "").trim();
    if (!uid) {
      Alert.alert("Patient", "This meeting has no linked patient id yet.");
      return;
    }
    if (!draftSlot) return;
    const slotNum = Number(draftSlot.slot) || activeSlotIndex + 1;
    try {
      setBusy(true);
      await doctorSendPackageOfferFromSlot({
        patientUserId: uid,
        doctorUserId: user?.id,
        slot: draftSlot,
        packageSlotIndex: slotNum,
      });
      setModalOpen(false);
      try {
        await onPackageOptionsSent?.();
      } catch {
        // optional parent refresh
      }
      Alert.alert(
        "Package options sent",
        "The patient sees the package breakdown and Pay now under Appts → My appointments. Payment goes to the company account first; your share accrues as coins after you fulfil the package (1 coin = ₹1).",
      );
    } catch (e) {
      Alert.alert("Send failed", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!String(patientUserId || "").trim()) return null;

  return (
    <View
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.cardBorder,
      }}
    >
      <Text
        style={{
          color: theme.textPrimary,
          fontWeight: "800",
          fontSize: 13,
          marginBottom: 4,
        }}
      >
        Send package options
      </Text>
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: 11,
          marginBottom: 10,
          lineHeight: 16,
        }}
      >
        Pick Package 1, 2, or 3 (fees from your profile). The patient gets the
        breakdown and Pay now. Company receives payment first; your share is
        credited as coins after service delivery.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {[0, 1, 2].map((i) => {
          const s = catalogSlots[i];
          const label = s?.name || `Package ${i + 1}`;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => openSuggest(i)}
              style={{
                flex: 1,
                minWidth: "28%",
                marginRight: i < 2 ? 8 : 0,
                marginBottom: 8,
                backgroundColor: theme.accentLight,
                padding: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.cardBorder,
              }}
            >
              <Text
                style={{ color: theme.accent, fontWeight: "800", fontSize: 11 }}
              >
                {label}
              </Text>
              {s?.total_amount_inr ? (
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 10,
                    marginTop: 4,
                  }}
                >
                  ₹{s.total_amount_inr}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={modalOpen} animationType="slide" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: theme.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 16,
              maxHeight: "88%",
            }}
          >
            <Text
              style={{
                color: theme.textPrimary,
                fontWeight: "900",
                marginBottom: 8,
              }}
            >
              Review & send package options
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text
                style={{
                  color: theme.textPrimary,
                  fontWeight: "800",
                  marginBottom: 4,
                }}
              >
                {draftSlot?.name}
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  marginBottom: 8,
                }}
              >
                {draftSlot?.total_period} · {draftSlot?.treatment_type}
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  marginBottom: 10,
                  lineHeight: 18,
                }}
              >
                {draftSlot?.description}
              </Text>
              {Array.isArray(draftSlot?.features) &&
              draftSlot.features.length > 0 ? (
                <View style={{ marginBottom: 12 }}>
                  {draftSlot.features.map((line, fi) => (
                    <Text
                      key={`${draftSlot.slot}-${fi}`}
                      style={{
                        color: theme.textTertiary,
                        fontSize: 12,
                        marginBottom: 3,
                      }}
                    >
                      • {line}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Text style={{ color: theme.textTertiary, fontSize: 11 }}>
                Your service fee (INR)
              </Text>
              <TextInput
                keyboardType="numeric"
                value={String(draftSlot?.total_amount_inr ?? "")}
                onChangeText={(t) =>
                  setDraftSlot((d) => ({ ...d, total_amount_inr: t }))
                }
                style={slotInput(theme)}
                placeholderTextColor={theme.textTertiary}
              />
            </ScrollView>
            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setModalOpen(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: theme.bg,
                  alignItems: "center",
                  marginRight: 10,
                }}
              >
                <Text style={{ fontWeight: "800", color: theme.textPrimary }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={sendFromModal}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: theme.accent,
                  alignItems: "center",
                }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ fontWeight: "800", color: "#fff" }}>
                    Send package options
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function PackageMeetingDoctorPanel({ theme }) {
  const user = getAuthUser();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalMeetingId, setModalMeetingId] = useState(null);
  const [altSlotTimes, setAltSlotTimes] = useState([null, null, null, null]);
  const [altPicker, setAltPicker] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const m = await listPackageMeetingsForDoctor(user.id);
    setRows(m);
  }, [user?.id]);

  /** Package options are sent from Upcoming Appointments (“Ask package”) and stored on the row. */
  const meetingHasLinkedPackageOffer = useCallback(
    (meeting) => !!String(meeting?.package_offer_id || "").trim(),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const { pending, discussing, confirmedDemo, closed } = useMemo(() => {
    const pend = [];
    const disc = [];
    const conf = [];
    const cl = [];
    const sortDesc = (a, b) =>
      String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    for (const r of rows) {
      const b = packageMeetingDoctorListBucket(r);
      if (b === "pending") pend.push(r);
      else if (b === "discussing") disc.push(r);
      else if (b === "confirmed_demo") {
        // Once an offer is sent, payment tracking moves to Upcoming Appointments
        // (clean card with paid badge + Go to chat). Keep this list focused on
        // "demo confirmed but offer not sent yet".
        if (!meetingHasLinkedPackageOffer(r)) conf.push(r);
      } else cl.push(r);
    }
    pend.sort(sortDesc);
    disc.sort(sortDesc);
    conf.sort(sortDesc);
    cl.sort(sortDesc);
    return { pending: pend, discussing: disc, confirmedDemo: conf, closed: cl };
  }, [rows, meetingHasLinkedPackageOffer]);

  const openRescheduleModal = (meetingId) => {
    setModalMeetingId(meetingId);
    setAltSlotTimes([null, null, null, null]);
    setAltPicker(null);
  };

  const submitAlternates = async () => {
    const isos = altSlotTimes
      .map((d) =>
        d instanceof Date && !Number.isNaN(d.getTime())
          ? d.toISOString()
          : null,
      )
      .filter(Boolean);
    if (isos.length < 3) {
      Alert.alert(
        "Need 3+ slots",
        "Pick a date and time for at least three slots using the calendar and clock.",
      );
      return;
    }
    if (!modalMeetingId) return;
    try {
      setBusy(true);
      await doctorProposePackageMeetingReschedule(modalMeetingId, isos);
      setModalMeetingId(null);
      await load();
      Alert.alert("Sent", "The patient can pick one of these times.");
    } catch (e) {
      Alert.alert("Reschedule", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const formatAltDateLabel = (d) =>
    d instanceof Date && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          weekday: "short",
        })
      : "Tap to pick date";
  const formatAltTimeLabel = (d) =>
    d instanceof Date && !Number.isNaN(d.getTime())
      ? d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "Tap to pick time";

  const openAltSlotPicker = (slotIdx, mode) => {
    setAltSlotTimes((prev) => {
      const next = [...prev];
      const cur = next[slotIdx];
      if (!(cur instanceof Date) || Number.isNaN(cur.getTime())) {
        const seed = new Date();
        seed.setSeconds(0, 0);
        if (mode === "time") {
          seed.setMinutes(Math.ceil(seed.getMinutes() / 5) * 5);
        }
        next[slotIdx] = seed;
      }
      return next;
    });
    setAltPicker({ idx: slotIdx, mode });
  };

  const applyAltPickerValue = (mode, value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime()) || !altPicker)
      return;
    const idx = altPicker.idx;
    setAltSlotTimes((prev) => {
      const base =
        prev[idx] instanceof Date && !Number.isNaN(prev[idx].getTime())
          ? new Date(prev[idx])
          : new Date();
      if (mode === "date") {
        base.setFullYear(
          value.getFullYear(),
          value.getMonth(),
          value.getDate(),
        );
      } else {
        base.setHours(value.getHours(), value.getMinutes(), 0, 0);
      }
      const n = [...prev];
      n[idx] = base;
      return n;
    });
  };

  const onAltPickerChange = (event, value) => {
    const mode = altPicker?.mode;
    const idx = altPicker?.idx;
    if (mode == null || idx == null) return;
    if (Platform.OS === "android") {
      setAltPicker(null);
      if (event?.type === "set" && value) applyAltPickerValue(mode, value);
    } else if (value) {
      applyAltPickerValue(mode, value);
    }
  };

  const altSlotRow = (idx) => {
    const d = altSlotTimes[idx];
    return (
      <View key={`alt-${idx}`} style={{ marginBottom: 12 }}>
        <Text
          style={{ color: theme.textTertiary, fontSize: 11, marginBottom: 6 }}
        >
          Slot {idx + 1}
        </Text>
        <TouchableOpacity
          onPress={() => openAltSlotPicker(idx, "date")}
          activeOpacity={0.85}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.bg,
            borderRadius: 10,
            padding: 10,
            borderWidth: 1,
            borderColor: theme.cardBorder,
            marginBottom: 8,
          }}
        >
          <Ionicons
            name="calendar-outline"
            size={18}
            color={theme.accent}
            style={{ marginRight: 10 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textTertiary, fontSize: 10 }}>
              Date
            </Text>
            <Text
              style={{
                color: theme.textPrimary,
                fontWeight: "700",
                marginTop: 2,
              }}
            >
              {formatAltDateLabel(d)}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.textTertiary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => openAltSlotPicker(idx, "time")}
          activeOpacity={0.85}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.bg,
            borderRadius: 10,
            padding: 10,
            borderWidth: 1,
            borderColor: theme.cardBorder,
          }}
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={theme.accent}
            style={{ marginRight: 10 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textTertiary, fontSize: 10 }}>
              Time
            </Text>
            <Text
              style={{
                color: theme.textPrimary,
                fontWeight: "700",
                marginTop: 2,
              }}
            >
              {formatAltTimeLabel(d)}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.textTertiary}
          />
        </TouchableOpacity>
      </View>
    );
  };

  const renderMeetingCard = (x, { readOnly }) => {
    return (
      <View
        key={x.id}
        style={{
          padding: 12,
          borderRadius: 14,
          marginBottom: 10,
          backgroundColor: theme.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
        }}
      >
        {x.localOnly ? (
          <Text
            style={{
              color: theme.warning,
              fontSize: 10,
              fontWeight: "700",
              marginBottom: 8,
            }}
          >
            Local test record (same device as patient) - sync requires saving to
            PocketBase `appointments`.
          </Text>
        ) : null}
        <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
          {readOnly
            ? packageMeetingClosedLabel(x)
            : packageMeetingStatusLabel(x.status)}
        </Text>
        {x.proposed_at ? (
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: S.small,
              marginTop: 4,
            }}
          >
            Patient proposed:{" "}
            {new Date(x.proposed_at).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </Text>
        ) : null}
        {x.patient_selected_slot ? (
          <Text
            style={{
              color: theme.accent,
              fontSize: S.small,
              marginTop: 4,
              fontWeight: "700",
            }}
          >
            Patient chose:{" "}
            {new Date(x.patient_selected_slot).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </Text>
        ) : null}
        {x.description ? (
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: S.small,
              marginTop: 8,
            }}
          >
            {x.description}
          </Text>
        ) : null}
        {Array.isArray(x.messages) && x.messages.length > 0 ? (
          <View style={{ marginTop: 8 }}>
            {x.messages.slice(-5).map((m, i) => (
              <Text
                key={`${x.id}-dm-${i}`}
                style={{
                  color: theme.textSecondary,
                  fontSize: 11,
                  marginBottom: 2,
                }}
              >
                [{m.role}] {m.text}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
          {!readOnly && x.status === PACKAGE_MEETING_STATUS.AWAITING_DOCTOR ? (
            <>
              <TouchableOpacity
                disabled={busy}
                onPress={async () => {
                  try {
                    setBusy(true);
                    await doctorAcceptPackageMeetingInitial(x.id);
                    await load();
                  } catch (e) {
                    Alert.alert("Accept", e?.message || "Failed");
                  } finally {
                    setBusy(false);
                  }
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: theme.success,
                  marginRight: 8,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}
                >
                  Accept time
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busy}
                onPress={() => openRescheduleModal(x.id)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: theme.warning,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}
                >
                  Reschedule (3+ slots)
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
          {!readOnly &&
          x.status ===
            PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK ? (
            <>
              <TouchableOpacity
                disabled={busy}
                onPress={async () => {
                  try {
                    setBusy(true);
                    await doctorConfirmPatientRescheduleChoice(x.id);
                    await load();
                  } catch (e) {
                    Alert.alert("Confirm", e?.message || "Failed");
                  } finally {
                    setBusy(false);
                  }
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: theme.success,
                  marginRight: 8,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}
                >
                  Confirm meeting
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
          {!readOnly &&
          x.status === PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS ? (
            <View style={{ marginTop: 4 }}>
              <Text
                style={{
                  color: theme.textTertiary,
                  fontSize: 11,
                  marginBottom: 8,
                }}
              >
                Waiting for patient to pick a slot.
              </Text>
              <TouchableOpacity
                disabled={busy}
                onPress={() => openRescheduleModal(x.id)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: theme.accent,
                  alignSelf: "flex-start",
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}
                >
                  Update suggested slots
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        {!readOnly && x.status === PACKAGE_MEETING_STATUS.CONFIRMED ? (
          <View style={{ marginTop: 8 }}>
            <Text
              style={{ color: theme.success, fontSize: 11, fontWeight: "700" }}
            >
              Confirmed - reminder 30 min before.
            </Text>
            <Text
              style={{
                color: theme.textTertiary,
                fontSize: 11,
                marginTop: 6,
                lineHeight: 16,
              }}
            >
              After your demo call, use Home → Upcoming Appointments on this
              patient’s card → Ask package to send a catalogue option (payment
              is tracked there).
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const sectionHeader = (title, blurb, noTopMargin) => (
    <View style={{ marginTop: noTopMargin ? 0 : 16, marginBottom: 8 }}>
      <Text
        style={{ fontSize: 15, fontWeight: "800", color: theme.textPrimary }}
      >
        {title}
      </Text>
      {blurb ? (
        <Text
          style={{
            color: theme.textTertiary,
            fontSize: 11,
            marginTop: 4,
            lineHeight: 16,
          }}
        >
          {blurb}
        </Text>
      ) : null}
    </View>
  );

  const emptyLine = (text) => (
    <Text
      style={{ color: theme.textTertiary, fontSize: S.small, marginBottom: 6 }}
    >
      {text}
    </Text>
  );

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: S.title,
          fontWeight: "800",
          color: theme.textPrimary,
          marginBottom: 8,
        }}
      >
        Booked package meetings
      </Text>
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: S.small,
          marginBottom: 10,
        }}
      >
        Flow: pending → discussing (alternate times) → confirmed demo → package
        offer from Upcoming Appointments → declined/cancelled history.
      </Text>
      <ScrollView
        nestedScrollEnabled
        style={{ maxHeight: 520 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent}
          />
        }
      >
        {rows.length === 0 ? (
          <Text style={{ color: theme.textTertiary, fontSize: S.small }}>
            No package meetings yet.
          </Text>
        ) : (
          <>
            {sectionHeader(
              "Pending",
              "Patient booked a time. Accept it or send at least three alternative slots.",
              true,
            )}
            {pending.length === 0
              ? emptyLine("None right now.")
              : pending.map((x) => renderMeetingCard(x, { readOnly: false }))}
            {sectionHeader(
              "Discussing",
              "Reschedule or alternate-slot negotiation. Package billing is only from Home → Upcoming Appointments after the demo time is confirmed.",
            )}
            {discussing.length === 0
              ? emptyLine("None - nothing mid-negotiation.")
              : discussing.map((x) =>
                  renderMeetingCard(x, { readOnly: false }),
                )}
            {sectionHeader(
              "Confirmed demo",
              "Demo time is confirmed (reminder 30 minutes before). After your call, use Upcoming Appointments → Ask package so the patient can pay from Package Doctor.",
            )}
            {confirmedDemo.length === 0
              ? emptyLine("None yet.")
              : confirmedDemo.map((x) =>
                  renderMeetingCard(x, { readOnly: false }),
                )}
            {sectionHeader(
              "Declined & cancelled",
              "Terminal rows from PocketBase `appointments.status` (no further actions).",
            )}
            {closed.length === 0
              ? emptyLine("None yet.")
              : closed.map((x) => renderMeetingCard(x, { readOnly: true }))}
          </>
        )}
      </ScrollView>

      <Modal visible={!!modalMeetingId} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: 16,
              padding: 16,
              maxHeight: "85%",
            }}
          >
            <Text
              style={{
                color: theme.textPrimary,
                fontWeight: "800",
                marginBottom: 10,
              }}
            >
              Propose alternate times
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {[0, 1, 2, 3].map((i) => altSlotRow(i))}
            </ScrollView>
            {Platform.OS === "android" && altPicker ? (
              <DateTimePicker
                value={
                  altSlotTimes[altPicker.idx] instanceof Date &&
                  !Number.isNaN(altSlotTimes[altPicker.idx].getTime())
                    ? altSlotTimes[altPicker.idx]
                    : new Date()
                }
                mode={altPicker.mode}
                display="default"
                is24Hour={false}
                minimumDate={altPicker.mode === "date" ? new Date() : undefined}
                onChange={onAltPickerChange}
              />
            ) : null}
            {Platform.OS === "ios" && altPicker ? (
              <Modal
                transparent
                animationType="fade"
                visible
                onRequestClose={() => setAltPicker(null)}
              >
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(0,0,0,0.4)",
                    justifyContent: "flex-end",
                  }}
                >
                  <View
                    style={{
                      backgroundColor: theme.card,
                      padding: 16,
                      paddingBottom: 28,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <TouchableOpacity onPress={() => setAltPicker(null)}>
                        <Text
                          style={{ color: theme.warning, fontWeight: "700" }}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                      <Text
                        style={{ color: theme.textPrimary, fontWeight: "800" }}
                      >
                        {altPicker.mode === "date" ? "Pick date" : "Pick time"}
                      </Text>
                      <TouchableOpacity onPress={() => setAltPicker(null)}>
                        <Text
                          style={{ color: theme.accent, fontWeight: "800" }}
                        >
                          Done
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={
                        altSlotTimes[altPicker.idx] instanceof Date &&
                        !Number.isNaN(altSlotTimes[altPicker.idx].getTime())
                          ? altSlotTimes[altPicker.idx]
                          : new Date()
                      }
                      mode={altPicker.mode}
                      display="spinner"
                      is24Hour={false}
                      locale="en-US"
                      minimumDate={
                        altPicker.mode === "date" ? new Date() : undefined
                      }
                      onChange={onAltPickerChange}
                    />
                  </View>
                </View>
              </Modal>
            ) : null}
            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setModalMeetingId(null);
                  setAltPicker(null);
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: theme.bg,
                  alignItems: "center",
                  marginRight: 8,
                }}
              >
                <Text style={{ fontWeight: "800", color: theme.textPrimary }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitAlternates}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: theme.accent,
                  alignItems: "center",
                }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ fontWeight: "800", color: "#fff" }}>
                    Send to patient
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function quickRequestPatientLabel(record) {
  if (record?.private_mode) return "Private - identity hidden";
  const u = record?.expand?.patient;
  if (!u) return "Patient";
  return u.name || u.email || u.username || "Patient";
}

function quickRequestPatientUserId(record) {
  if (!record) return null;
  const u = record?.expand?.patient;
  if (u?.id) return u.id;
  if (typeof record.patient === "string" && record.patient)
    return record.patient;
  if (record.patient?.id) return record.patient.id;
  return null;
}

function truncateOneLine(s, max) {
  const t = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * `onHelpPatient` is called when the doctor confirms the help modal. Parent
 * is responsible for: ensuring/creating the direct conversation, posting the
 * first message, recording the offer, switching to the Chat tab, and
 * selecting the right conversation. We just collect the message + identifiers.
 *
 *   onHelpPatient({ requestId, requestKind, patientUserId, message })
 *     => Promise<{ conversationId } | void>
 *
 * `onOpenHelpChat(conversationId, patientUserId)` is called when the doctor
 * presses "Open chat" on a card they already offered help on (so we don't
 * duplicate the first message or the offer row in PocketBase).
 *
 * `doctorUserId` is the current doctor's UsersAuth id, used to fetch existing
 * offers so we can flip the button to "Open chat" on previously-offered cards.
 */
export function DoctorQuickRequestsPanel({
  theme,
  doctorUserId,
  onHelpPatient,
  onOpenHelpChat,
}) {
  const user = getAuthUser();
  const effectiveDoctorId = doctorUserId || user?.id || "";
  const [solutionRows, setSolutionRows] = useState([]);
  const [counsellingRows, setCounsellingRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Map of `${kind}:${requestId}` → { conversationId, offerId } for offers
  // this doctor already made. Lets us flip Help → Open chat per card.
  const [offerMap, setOfferMap] = useState({});

  const [helpTarget, setHelpTarget] = useState(null);
  const [helpMessage, setHelpMessage] = useState("");
  const [helpBusy, setHelpBusy] = useState(false);

  const load = useCallback(async () => {
    if (!effectiveDoctorId) return;
    setErr("");
    setLoading(true);
    const parts = [];
    let sol = [];
    let cou = [];
    try {
      sol = await listQueuedQuickSolutionRequestsForProvider();
    } catch (e) {
      parts.push(`Quick Solution: ${e?.message || "list failed"}`);
    }
    try {
      cou = await listQueuedQuickCounsellingRequestsForProvider();
    } catch (e) {
      parts.push(`Quick Counselling: ${e?.message || "list failed"}`);
    }
    setSolutionRows(sol || []);
    setCounsellingRows(cou || []);

    // Build a flat tagged list for the inferred-offers helper.
    const tagged = [
      ...(sol || []).map((row) => ({ ...row, kind: "solution" })),
      ...(cou || []).map((row) => ({ ...row, kind: "counselling" })),
    ];

    // Existing offers - silently ignore if collection/rules are missing.
    let realOffers = [];
    try {
      realOffers = (await listQuickHelpOffersByDoctor(effectiveDoctorId)) || [];
    } catch (e) {
      console.log("listQuickHelpOffersByDoctor ignored:", e?.message);
    }
    // Inferred offers - works even when the optional `quick_help_offers`
    // collection is missing, by reading conversations + messages directly.
    let inferredOffers = [];
    try {
      inferredOffers =
        (await listInferredOffersByDoctor(effectiveDoctorId, tagged)) || [];
    } catch (e) {
      console.log("listInferredOffersByDoctor ignored:", e?.message);
    }

    const next = {};
    const consume = (o) => {
      const kind = o.request_kind || o.requestKind;
      const reqId = o.request_id || o.requestId;
      const convId =
        (typeof o.conversation === "string" ? o.conversation : null) ||
        o?.expand?.conversation?.id ||
        o.conversation?.id ||
        "";
      if (kind && reqId && !next[`${kind}:${reqId}`]) {
        next[`${kind}:${reqId}`] = { conversationId: convId, offerId: o.id };
      }
    };
    for (const o of realOffers) consume(o);
    for (const o of inferredOffers) consume(o);
    setOfferMap(next);

    if (parts.length) setErr(parts.join("\n"));
    setLoading(false);
  }, [effectiveDoctorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openHelpModal = (record, kind) => {
    const patientUserId = quickRequestPatientUserId(record);
    if (!patientUserId) {
      Alert.alert(
        "Cannot start chat",
        "This request does not include the patient id (private mode or expand failed). Ask the patient to resend it.",
      );
      return;
    }
    if (!user?.id) {
      Alert.alert(
        "Sign in required",
        "Please sign in again before offering help.",
      );
      return;
    }
    setHelpTarget({
      requestId: record.id,
      requestKind: kind,
      patientUserId,
      patientLabel: quickRequestPatientLabel(record),
      preview:
        kind === "solution"
          ? truncateOneLine(record.notes, 120)
          : `Topic: ${truncateOneLine(record.topic, 100) || "General"}`,
    });
    setHelpMessage(
      kind === "solution"
        ? "Hi - I saw your Quick Solution request. I can help. Could you share more details?"
        : "Hi - I saw your Quick Counselling request. Happy to help. What would you like to talk about first?",
    );
  };

  const closeHelpModal = () => {
    if (helpBusy) return;
    setHelpTarget(null);
    setHelpMessage("");
  };

  const submitHelpModal = async () => {
    const text = String(helpMessage || "").trim();
    if (!helpTarget) return;
    if (!text) {
      Alert.alert(
        "Add a message",
        "Type a short opener so the patient knows how you can help.",
      );
      return;
    }
    if (typeof onHelpPatient !== "function") {
      Alert.alert(
        "Chat unavailable",
        "Chat handler is missing on this screen. Please reload the dashboard.",
      );
      return;
    }
    try {
      setHelpBusy(true);
      const result = await onHelpPatient({
        requestId: helpTarget.requestId,
        requestKind: helpTarget.requestKind,
        patientUserId: helpTarget.patientUserId,
        message: text,
      });
      const conversationId = result?.conversationId || "";
      setOfferMap((prev) => ({
        ...prev,
        [`${helpTarget.requestKind}:${helpTarget.requestId}`]: {
          conversationId,
          offerId: "",
        },
      }));
      setHelpTarget(null);
      setHelpMessage("");
    } catch (e) {
      Alert.alert("Could not start chat", e?.message || "Please try again.");
    } finally {
      setHelpBusy(false);
    }
  };

  const renderHelpButton = (record, kind) => {
    const key = `${kind}:${record.id}`;
    const existing = offerMap[key];
    const patientUserId = quickRequestPatientUserId(record);

    if (existing) {
      return (
        <TouchableOpacity
          onPress={() => {
            if (typeof onOpenHelpChat === "function") {
              onOpenHelpChat(existing.conversationId || "", patientUserId);
            } else {
              Alert.alert(
                "Chat unavailable",
                "Open the Chat tab manually to continue this conversation.",
              );
            }
          }}
          style={{
            marginTop: 10,
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.accent,
            backgroundColor: theme.accentLight,
          }}
        >
          <Ionicons
            name="checkmark-circle"
            size={14}
            color={theme.accent}
            style={{ marginRight: 6 }}
          />
          <Text
            style={{ color: theme.accent, fontWeight: "700", fontSize: 12 }}
          >
            Open chat
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onPress={() => openHelpModal(record, kind)}
        style={{
          marginTop: 10,
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: theme.accent,
        }}
      >
        <Ionicons
          name="chatbubbles"
          size={14}
          color="#FFF"
          style={{ marginRight: 6 }}
        />
        <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 12 }}>
          Help
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSolutionCard = (r) => (
    <View
      key={r.id}
      style={{
        padding: 12,
        borderRadius: 14,
        marginBottom: 10,
        backgroundColor: theme.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.cardBorder,
      }}
    >
      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
        Quick Solution · queued
      </Text>
      <Text
        style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 4 }}
      >
        {quickRequestPatientLabel(r)}
      </Text>
      <Text
        style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 6 }}
      >
        {truncateOneLine(r.notes, 160) || "-"}
      </Text>
      <Text style={{ color: theme.textTertiary, fontSize: 10, marginTop: 6 }}>
        {r.created ? new Date(r.created).toLocaleString() : ""}
      </Text>
      {renderHelpButton(r, "solution")}
    </View>
  );

  const renderCounsellingCard = (r) => (
    <View
      key={r.id}
      style={{
        padding: 12,
        borderRadius: 14,
        marginBottom: 10,
        backgroundColor: theme.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.cardBorder,
      }}
    >
      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
        Quick Counselling · queued
      </Text>
      <Text
        style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 4 }}
      >
        {quickRequestPatientLabel(r)}
      </Text>
      <Text
        style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 6 }}
      >
        Topic: {truncateOneLine(r.topic, 120) || "-"}
      </Text>
      <Text style={{ color: theme.textTertiary, fontSize: 10, marginTop: 6 }}>
        {r.created ? new Date(r.created).toLocaleString() : ""}
      </Text>
      {renderHelpButton(r, "counselling")}
    </View>
  );

  return (
    <View style={{ marginTop: 12 }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
      >
        <Text style={{ color: theme.textPrimary, fontWeight: "800", flex: 1 }}>
          Quick queues (clinic / RMP)
        </Text>
        <TouchableOpacity
          onPress={() => void load()}
          disabled={loading}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: theme.accentLight,
          }}
        >
          <Text
            style={{ color: theme.accent, fontWeight: "700", fontSize: 12 }}
          >
            {loading ? "…" : "Refresh"}
          </Text>
        </TouchableOpacity>
      </View>
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: S.small,
          marginBottom: 10,
        }}
      >
        The app only loads rows with{" "}
        <Text style={{ fontWeight: "700" }}>status = queued</Text>. Tap{" "}
        <Text style={{ fontWeight: "700" }}>Help</Text> on a card to open a chat
        with the patient - your first message starts the thread and they will
        see “you want to help” on their tracking list. The patient can close or
        cancel the request anytime.
      </Text>
      {err ? (
        <Text
          style={{ color: theme.danger, fontSize: S.small, marginBottom: 8 }}
        >
          {err}
        </Text>
      ) : null}

      <Text
        style={{ color: theme.textPrimary, fontWeight: "700", marginBottom: 6 }}
      >
        Quick Solution ({solutionRows.length})
      </Text>
      {solutionRows.length === 0 ? (
        <Text
          style={{
            color: theme.textTertiary,
            fontSize: S.small,
            marginBottom: 14,
          }}
        >
          No queued requests (or list blocked - see red message above).
        </Text>
      ) : (
        solutionRows.map(renderSolutionCard)
      )}

      <Text
        style={{
          color: theme.textPrimary,
          fontWeight: "700",
          marginBottom: 6,
          marginTop: 4,
        }}
      >
        Quick Counselling ({counsellingRows.length})
      </Text>
      {counsellingRows.length === 0 ? (
        <Text style={{ color: theme.textTertiary, fontSize: S.small }}>
          No queued requests.
        </Text>
      ) : (
        counsellingRows.map(renderCounsellingCard)
      )}

      <Modal
        animationType="fade"
        transparent
        visible={!!helpTarget}
        onRequestClose={closeHelpModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            paddingHorizontal: 18,
          }}
        >
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: 18,
              padding: 18,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.cardBorder,
            }}
          >
            <Text
              style={{
                color: theme.textPrimary,
                fontWeight: "800",
                fontSize: 16,
                marginBottom: 4,
              }}
            >
              Offer help to{" "}
              {helpTarget?.patientLabel === "Private - identity hidden"
                ? "this patient"
                : helpTarget?.patientLabel || "this patient"}
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 12,
                marginBottom: 10,
              }}
            >
              {helpTarget?.requestKind === "counselling"
                ? "Quick Counselling"
                : "Quick Solution"}
              {helpTarget?.preview ? ` · ${helpTarget.preview}` : ""}
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 11,
                marginBottom: 6,
              }}
            >
              Your message - this becomes the first chat message in the new
              conversation.
            </Text>
            <TextInput
              value={helpMessage}
              onChangeText={setHelpMessage}
              multiline
              editable={!helpBusy}
              placeholder="Hi, how can I help?"
              placeholderTextColor={theme.textTertiary}
              style={{
                minHeight: 96,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.cardBorder,
                padding: 12,
                color: theme.textPrimary,
                backgroundColor: theme.bg,
                textAlignVertical: "top",
              }}
            />
            <View
              style={{
                flexDirection: "row",
                marginTop: 14,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={closeHelpModal}
                disabled={helpBusy}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginRight: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                }}
              >
                <Text style={{ color: theme.textPrimary, fontWeight: "700" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitHelpModal}
                disabled={helpBusy}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: helpBusy ? theme.accentLight : theme.accent,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {helpBusy ? (
                  <ActivityIndicator
                    size="small"
                    color="#FFF"
                    style={{ marginRight: 6 }}
                  />
                ) : null}
                <Text style={{ color: "#FFF", fontWeight: "700" }}>
                  {helpBusy ? "Sending…" : "Confirm"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Patient-side tracking list for Quick Solution / Quick Counselling.
 *
 * Shows the patient's active (status="queued") requests with:
 *   - request info + a Cancel button (patient no longer needs help) and a
 *     Close button (patient picked a doctor and is moving the chat into the
 *     normal Chat tab).
 *   - one alert per doctor offer ("Dr. X wants to help you") with an arrow
 *     button that pre-selects that conversation in the Chat tab.
 *
 * The parent passes:
 *   - patientUserId (string): current patient user id
 *   - onOpenConversation(conversationId, patientUserId): switch to Chat tab
 *     and open the matching conversation (no-op when missing).
 *   - refreshTrigger (any): bump to force a reload from outside (optional).
 */
export function PatientQuickRequestsTrackerPanel({
  theme,
  patientUserId,
  onOpenConversation,
  refreshTrigger,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyRowId, setBusyRowId] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!patientUserId) {
      setItems([]);
      return;
    }
    try {
      setLoading(true);
      setErr("");
      const result = await listActiveQuickRequestsForPatient(patientUserId);
      setItems(result.items || []);
    } catch (e) {
      setErr(e?.message || "Could not load your tracking list.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [patientUserId]);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  const removeRowLocally = (kind, id) => {
    setItems((prev) =>
      prev.filter((row) => !(row.id === id && row.kind === kind)),
    );
  };

  const handleClose = (row) => {
    Alert.alert(
      "Close request",
      "Use Close after you’ve picked a doctor and started chatting. The request will be removed from your tracking list (status: closed).",
      [
        { text: "Keep tracking", style: "cancel" },
        {
          text: "Close request",
          style: "default",
          onPress: async () => {
            try {
              setBusyRowId(`${row.kind}::${row.id}`);
              await closeQuickRequest({ id: row.id, kind: row.kind });
              removeRowLocally(row.kind, row.id);
            } catch (e) {
              Alert.alert("Close failed", e?.message || "Please try again.");
            } finally {
              setBusyRowId(null);
            }
          },
        },
      ],
    );
  };

  const handleCancel = (row) => {
    Alert.alert(
      "Cancel request",
      "Cancel removes this request from your tracking list (status: cancelled). Use this when you no longer need help.",
      [
        { text: "Keep tracking", style: "cancel" },
        {
          text: "Cancel request",
          style: "destructive",
          onPress: async () => {
            try {
              setBusyRowId(`${row.kind}::${row.id}`);
              await cancelQuickRequest({ id: row.id, kind: row.kind });
              removeRowLocally(row.kind, row.id);
            } catch (e) {
              Alert.alert("Cancel failed", e?.message || "Please try again.");
            } finally {
              setBusyRowId(null);
            }
          },
        },
      ],
    );
  };

  const handleOpenOffer = (offer) => {
    if (typeof onOpenConversation === "function" && offer?.conversation) {
      onOpenConversation(
        offer.conversation,
        offer?.expand?.doctor?.id || offer.doctor,
      );
    } else {
      Alert.alert(
        "Chat unavailable",
        "Open the Chat tab to find this conversation manually.",
      );
    }
  };

  const renderOffer = (offer) => {
    const doctor = offer?.expand?.doctor;
    const doctorName = doctor?.name || doctor?.email || "Doctor";
    return (
      <View
        key={offer.id}
        style={{
          marginTop: 8,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: theme.successLight,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
        }}
      >
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text
            style={{ color: theme.success, fontSize: 11, fontWeight: "700" }}
          >
            New help offer
          </Text>
          <Text
            style={{
              color: theme.textPrimary,
              fontWeight: "700",
              fontSize: 13,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {doctorName} wants to help you.
          </Text>
          {offer.first_message ? (
            <Text
              style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}
              numberOfLines={2}
            >
              “{truncateOneLine(offer.first_message, 140)}”
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => handleOpenOffer(offer)}
          accessibilityLabel="Open chat with this doctor"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: theme.success,
          }}
        >
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderCard = (row) => {
    const kindLabel =
      row.kind === "counselling" ? "Quick Counselling" : "Quick Solution";
    const summary =
      row.kind === "counselling"
        ? `Topic: ${truncateOneLine(row.topic, 140) || "General"}`
        : truncateOneLine(row.notes, 200) || "-";
    const isBusy = busyRowId === `${row.kind}::${row.id}`;
    const offers = Array.isArray(row.offers) ? row.offers : [];
    const hasOffers = offers.length > 0;
    return (
      <View
        key={`${row.kind}::${row.id}`}
        style={{
          padding: 12,
          borderRadius: 14,
          marginBottom: 10,
          backgroundColor: theme.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              color: theme.accent,
              fontSize: 11,
              fontWeight: "800",
              flex: 1,
            }}
          >
            {kindLabel} · queued
          </Text>
          <Text style={{ color: theme.textTertiary, fontSize: 10 }}>
            {row.created ? new Date(row.created).toLocaleString() : ""}
          </Text>
        </View>
        <Text
          style={{
            color: theme.textPrimary,
            fontWeight: "700",
            marginTop: 4,
            fontSize: 14,
          }}
        >
          {summary}
        </Text>
        {row.private_mode ? (
          <Text
            style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4 }}
          >
            Private mode · your identity is hidden in the queue.
          </Text>
        ) : null}

        {offers.map(renderOffer)}

        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <TouchableOpacity
            onPress={() => handleClose(row)}
            disabled={isBusy}
            style={{
              flex: 1,
              marginRight: 6,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: "center",
              backgroundColor: hasOffers ? theme.accent : theme.accentLight,
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            <Text
              style={{
                color: hasOffers ? "#FFF" : theme.accent,
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              Close
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleCancel(row)}
            disabled={isBusy}
            style={{
              flex: 1,
              marginLeft: 6,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: "center",
              borderWidth: 1,
              borderColor: theme.danger,
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            <Text
              style={{ color: theme.danger, fontWeight: "700", fontSize: 13 }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
        {!hasOffers ? (
          <Text
            style={{ color: theme.textTertiary, fontSize: 11, marginTop: 8 }}
          >
            Waiting for a doctor to offer help. You’ll see them appear here as
            alerts.
          </Text>
        ) : null}
      </View>
    );
  };

  if (!patientUserId) return null;

  return (
    <View style={{ marginTop: 4 }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
      >
        <Text style={{ color: theme.textPrimary, fontWeight: "800", flex: 1 }}>
          My Quick requests
        </Text>
        <TouchableOpacity
          onPress={() => void load()}
          disabled={loading}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: theme.accentLight,
          }}
        >
          <Text
            style={{ color: theme.accent, fontWeight: "700", fontSize: 12 }}
          >
            {loading ? "…" : "Refresh"}
          </Text>
        </TouchableOpacity>
      </View>
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: S.small,
          marginBottom: 10,
        }}
      >
        Track Quick Solution / Counselling requests you submitted. When a doctor
        offers help, an alert appears with an arrow button - tap it to open the
        chat. Use <Text style={{ fontWeight: "700" }}>Close</Text> after you’ve
        chosen a doctor or <Text style={{ fontWeight: "700" }}>Cancel</Text> if
        you no longer need help.
      </Text>
      {err ? (
        <Text
          style={{ color: theme.danger, fontSize: S.small, marginBottom: 8 }}
        >
          {err}
        </Text>
      ) : null}
      {items.length === 0 ? (
        <Text
          style={{
            color: theme.textTertiary,
            fontSize: S.small,
            marginBottom: 8,
          }}
        >
          {loading
            ? "Loading your tracking list…"
            : "No active Quick requests."}
        </Text>
      ) : (
        items.map(renderCard)
      )}
    </View>
  );
}

export function CoinWalletDoctorPanel({ theme }) {
  const user = getAuthUser();
  const [withdraw, setWithdraw] = useState("");
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState(0);
  const [pairs, setPairs] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [packageDoctors, setPackageDoctors] = useState([]);
  const [referralTargets, setReferralTargets] = useState({});

  const refreshBalance = useCallback(async () => {
    const [coins, activePairs, referralRows] = await Promise.all([
      getDoctorCoinBalance(user?.id),
      listActivePackagePairsForDoctor(user?.id),
      listPackageReferralsForDoctor(user?.id),
    ]);
    setBalance(coins);
    setPairs(activePairs || []);
    setReferrals(referralRows || []);
  }, [user?.id]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await pb.collection("doctor_profile").getFullList({
          requestKey: null,
          filter: `status="approved"`,
          expand: "user",
        });
        if (cancelled) return;
        const mapped = (rows || [])
          .map((row) => ({
            profileId: row.id,
            userId: row.user || row.expand?.user?.id || "",
            name: row.expand?.user?.name || row.full_name || "Doctor",
            specialty: row.specialty || "General Physician",
            practitionerTier: String(
              row.practitioner_tier || row.tier || row.doctor_class || "",
            ).toLowerCase(),
          }))
          .filter(
            (doctor) =>
              doctor.userId &&
              doctor.userId !== user?.id &&
              doctorTierEligibleForPackageMode(doctor.practitionerTier),
          );
        setPackageDoctors(mapped);
      } catch {
        setPackageDoctors([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void settleDueReferralMonthlyCommissions(user.id).then(() =>
      refreshBalance(),
    );
  }, [user?.id, refreshBalance]);

  const runWithdraw = async () => {
    try {
      setBusy(true);
      await doctorWithdrawCoinsStub(user?.id, Number(withdraw));
      setWithdraw("");
      await refreshBalance();
    } catch (e) {
      Alert.alert("Withdraw", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const runReferral = async (pair) => {
    const targetDoctorId = referralTargets[pair.offerId];
    if (!targetDoctorId) {
      Alert.alert("Referral", "Choose the doctor you want to refer to.");
      return;
    }
    try {
      setBusy(true);
      await referPackagePatientToDoctor({
        packageOfferId: pair.offerId,
        patientUserId: pair.patient_user_id,
        fromDoctorUserId: user?.id,
        toDoctorUserId: targetDoctorId,
      });
      setReferralTargets((prev) => ({ ...prev, [pair.offerId]: "" }));
      await refreshBalance();
      Alert.alert(
        "Referred",
        "This patient is now fixed to the referred doctor. Future package coins will settle to them, with monthly referral commission back to you.",
      );
    } catch (e) {
      Alert.alert("Referral", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const outgoingReferralOfferIds = new Set(
    (referrals || [])
      .filter((r) => String(r.from_doctor || "") === String(user?.id || ""))
      .map((r) => String(r.package_offer || "")),
  );

  return (
    <View style={{ marginTop: 12 }}>
      <Text
        style={{ color: theme.textPrimary, fontWeight: "800", marginBottom: 8 }}
      >
        Coin wallet (1 coin = ₹1)
      </Text>
      <Text
        style={{ color: theme.textPrimary, fontSize: S.title, fontWeight: "900" }}
      >
        {balance} coins available
      </Text>
      <Text
        style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 4 }}
      >
        Active package pairs: {pairs.length}
      </Text>
      {pairs.slice(0, 5).map((pair) => {
        const alreadyReferred = outgoingReferralOfferIds.has(String(pair.offerId));
        return (
          <View
            key={pair.offerId}
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.cardBorder,
              backgroundColor: theme.bg,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>
              {pair.title}
            </Text>
            <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 3 }}>
              patient {String(pair.patient_user_id || "").slice(-6)} · pool {pair.doctor_coins} coins
            </Text>
            {alreadyReferred ? (
              <Text style={{ color: theme.success, fontSize: 11, marginTop: 6 }}>
                Referred. Future coins go to the referred doctor; monthly 1000-coin commission returns to you after they earn from this patient.
              </Text>
            ) : packageDoctors.length ? (
              <View style={{ marginTop: 8 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {packageDoctors.map((doctor) => {
                    const selected = referralTargets[pair.offerId] === doctor.userId;
                    return (
                      <TouchableOpacity
                        key={`${pair.offerId}-${doctor.userId}`}
                        onPress={() =>
                          setReferralTargets((prev) => ({
                            ...prev,
                            [pair.offerId]: doctor.userId,
                          }))
                        }
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          borderRadius: 999,
                          marginRight: 8,
                          backgroundColor: selected ? theme.accent : theme.card,
                          borderWidth: 1,
                          borderColor: selected ? theme.accent : theme.cardBorder,
                        }}
                      >
                        <Text
                          style={{
                            color: selected ? "#fff" : theme.textPrimary,
                            fontWeight: "800",
                            fontSize: 11,
                          }}
                        >
                          {doctor.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity
                  onPress={() => runReferral(pair)}
                  disabled={busy || !referralTargets[pair.offerId]}
                  style={{
                    marginTop: 8,
                    alignSelf: "flex-start",
                    backgroundColor: theme.warning,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    opacity: busy || !referralTargets[pair.offerId] ? 0.55 : 1,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>
                    Refer patient
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: S.small,
          marginBottom: 8,
          marginTop: 6,
        }}
      >
        Settled package earnings appear here. Withdraw requests are checked
        against your available coins before they are sent.
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TextInput
          placeholder="Coins to withdraw"
          placeholderTextColor={theme.textTertiary}
          keyboardType="numeric"
          value={withdraw}
          onChangeText={setWithdraw}
          style={{
            flex: 1,
            backgroundColor: theme.card,
            borderRadius: 12,
            padding: 10,
            color: theme.textPrimary,
            marginRight: 8,
          }}
        />
        <TouchableOpacity
          onPress={runWithdraw}
          disabled={busy}
          style={{
            backgroundColor: theme.accent,
            padding: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>Withdraw</Text>
        </TouchableOpacity>
      </View>
      <Text
        style={{ color: theme.textTertiary, fontSize: S.small, marginTop: 10 }}
      >
        Payment history is on your Profile tab.
      </Text>
    </View>
  );
}

export function DoctorCoinPaymentHistoryPanel({ theme }) {
  const user = getAuthUser();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listCoinLedgerForUser(user?.id);
      if (!cancelled) setRows(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <View>
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: S.small,
          marginBottom: 10,
          lineHeight: 18,
        }}
      >
        Ledger entries for your coin balance (1 coin = ₹1).
      </Text>
      {rows.length === 0 ? (
        <Text style={{ color: theme.textTertiary, fontSize: S.small }}>
          No movements yet.
        </Text>
      ) : (
        rows.map((r, idx) => (
          <View
            key={r.id}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: idx === rows.length - 1 ? 0 : 10,
              paddingBottom: idx === rows.length - 1 ? 0 : 10,
              borderBottomWidth:
                idx === rows.length - 1 ? 0 : StyleSheet.hairlineWidth,
              borderBottomColor: theme.cardBorder || "#E2E8F0",
            }}
          >
            <Text
              style={{
                flex: 1,
                color: theme.textSecondary,
                fontSize: S.small,
                lineHeight: 18,
                marginRight: 10,
              }}
            >
              {formatCoinLedgerReasonForDisplay(r.reason)}
            </Text>
            <Text
              style={{
                color: theme.textPrimary,
                fontSize: S.small,
                fontWeight: "800",
              }}
            >
              {Number(r.delta) > 0 ? `+${r.delta}` : String(r.delta)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

export function PatientCoinHistoryPanel({ theme, userId, compact = false }) {
  const [rows, setRows] = useState([]);
  const [balance, setBalance] = useState(0);
  const [pairs, setPairs] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ledger, coins, activePairs] = await Promise.all([
        listCoinLedgerForUser(userId),
        getCoinBalanceForUser(userId),
        listActivePackagePairsForPatient(userId),
      ]);
      if (cancelled) return;
      setRows(ledger);
      setBalance(coins);
      setPairs(activePairs || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return (
    <View style={{ marginTop: 8 }}>
      <Text
        style={{ color: theme.textPrimary, fontWeight: "800", marginBottom: 6 }}
      >
        Coin & payments history
      </Text>
      <Text style={{ color: theme.textPrimary, fontWeight: "900", marginBottom: 6 }}>
        Balance: {balance} coins
      </Text>
      <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 6 }}>
        Active package pairs: {pairs.length}
      </Text>
      {pairs.slice(0, compact ? 2 : 4).map((pair) => (
        <Text
          key={pair.offerId}
          style={{ color: theme.textTertiary, fontSize: 11, marginBottom: 3 }}
        >
          {pair.title} · doctor {String(pair.doctor_user_id || "").slice(-6)} ·
          pool {pair.doctor_coins} coins
        </Text>
      ))}
      {compact ? null : rows.length === 0 ? (
        <Text style={{ color: theme.textTertiary, fontSize: S.small }}>
          No movements yet.
        </Text>
      ) : (
        rows.map((r) => (
          <Text
            key={r.id}
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              marginBottom: 4,
            }}
          >
            {formatCoinLedgerReasonForDisplay(r.reason)} · {r.delta}
          </Text>
        ))
      )}
    </View>
  );
}

export function AdminConsoleAppScreen({ theme, onLogout }) {
  const [tab, setTab] = useState("overview");
  const [log, setLog] = useState("");

  const run = async () => {
    const chunks = [];
    const safeList = async (name) => {
      try {
        const rows = await pb
          .collection(name)
          .getList(1, 30, { requestKey: null, sort: "-created" });
        chunks.push(`${name}: ${rows.items?.length || 0} (latest page)`);
      } catch (e) {
        chunks.push(`${name}: unavailable (${e?.message || e})`);
      }
    };
    await safeList("quick_solution_requests");
    await safeList("quick_counselling_requests");
    await safeList("package_offers");
    await safeList("appointments");
    await safeList("coin_ledger");
    await safeList("medical_records");
    setLog(chunks.join("\n"));
  };

  useEffect(() => {
    void run();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: S.pad }}>
      <Text
        style={{ color: theme.textPrimary, fontSize: 22, fontWeight: "800" }}
      >
        Admin console
      </Text>
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: S.small,
          marginTop: 8,
          marginBottom: 16,
        }}
      >
        Mobile view for monitoring. Full web dashboard should mirror this:
        consultations, quick snaps, coin movements, verifications, global
        limits, reports. Use PocketBase Admin for destructive edits until the
        web app ships.
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {["overview", "limits", "reports"].map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: tab === t ? theme.accent : theme.card,
            }}
          >
            <Text
              style={{
                color: tab === t ? "#fff" : theme.textPrimary,
                fontWeight: "700",
              }}
            >
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === "overview" ? (
        <ScrollView style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              marginBottom: 8,
            }}
          >
            Latest collections snapshot (requires API rules for admin role):
          </Text>
          <Text
            style={{
              color: theme.textPrimary,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              fontSize: 11,
            }}
          >
            {log || "Loading…"}
          </Text>
        </ScrollView>
      ) : null}
      {tab === "limits" ? (
        <Text style={{ color: theme.textSecondary, fontSize: S.small }}>
          Configure in PocketBase: max package patients per doctor (3–5), daily
          quick service caps, pricing tables. This screen is a placeholder for
          future CRUD.
        </Text>
      ) : null}
      {tab === "reports" ? (
        <Text style={{ color: theme.textSecondary, fontSize: S.small }}>
          Revenue / doctor performance / activity reports: export from
          PocketBase or connect BI. Stub UI only in the mobile app.
        </Text>
      ) : null}
      <TouchableOpacity
        onPress={onLogout}
        style={{
          marginTop: 24,
          padding: 14,
          backgroundColor: theme.dangerLight,
          borderRadius: 12,
        }}
      >
        <Text
          style={{
            color: theme.danger,
            fontWeight: "800",
            textAlign: "center",
          }}
        >
          Log out
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function UpgradePackageFAB({ theme, onPress, visible }) {
  if (!visible) return null;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{
        position: "absolute",
        right: 16,
        bottom: 88,
        backgroundColor: theme.accentBg,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderRadius: 28,
        flexDirection: "row",
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
      }}
    >
      <Ionicons
        name="rocket"
        size={18}
        color="#fff"
        style={{ marginRight: 8 }}
      />
      <Text style={{ color: "#fff", fontWeight: "800" }}>Package mode</Text>
    </TouchableOpacity>
  );
}
