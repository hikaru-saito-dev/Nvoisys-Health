import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { pb, getAuthUser } from "./pocketbase";
import {
  CARE_MODE,
  persistPatientCareMode,
  fetchMedicalRecordsForPatient,
  uploadMedicalRecord,
  createPackageMeetingRequest,
  listPackageMeetingsForPatient,
  combineDateAndTimeToIso,
  PACKAGE_MEETING_STATUS,
  packageMeetingStatusLabel,
  packageMeetingDoctorListBucket,
  packageMeetingClosedLabel,
  patientChooseRescheduleSlot,
  listPackageMeetingsForDoctor,
  doctorAcceptPackageMeetingInitial,
  doctorProposePackageMeetingReschedule,
  doctorConfirmPatientRescheduleChoice,
  listPackageOffersForPatient,
  listPackageOffersForDoctor,
  patientPayPackageOfferStub,
  normalizeDoctorPackageSlots,
  doctorPackagesSetupComplete,
  saveDoctorPackageTemplates,
  packageTemplatesRawFromRecord,
  mergeLocalFeesOntoSlots,
  readLocalDoctorPackageFees,
  persistPackageSetupSkip,
  doctorSendPackageOfferFromSlot,
  createQuickSolutionRequest,
  createQuickCounsellingRequest,
  listQueuedQuickSolutionRequestsForProvider,
  listQueuedQuickCounsellingRequestsForProvider,
  listCoinLedgerForUser,
  doctorWithdrawCoinsStub,
  requestPackageDoctorChange,
  listActiveQuickRequestsForPatient,
  closeQuickRequest,
  cancelQuickRequest,
  listQuickHelpOffersByDoctor,
  listInferredOffersByDoctor,
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

export function CareModeOnboardingScreen({ theme, patientProfile, currentUser, onDone }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const pick = async (mode) => {
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

  const card = {
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: S.pad,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.cardBorder,
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top + 12 }}>
      <ScrollView
        contentContainerStyle={{
          padding: S.pad,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <Text style={{ color: theme.textPrimary, fontSize: 24, fontWeight: "800" }}>
          How would you like to use Nvoisys?
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: S.body, marginTop: 8, marginBottom: 20 }}>
          Pick one path now (Package Doctor, Casual / Normal, or skip). You can switch later from
          Home, Profile, or the upgrade entry points — Casual users always see a way to move into
          Package Doctor Mode.
        </Text>

        <TouchableOpacity
          style={card}
          disabled={busy}
          onPress={() => pick(CARE_MODE.PACKAGE)}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Ionicons name="medkit" size={26} color={theme.accent} style={{ marginRight: 12 }} />
            <Text style={{ color: theme.textPrimary, fontSize: S.title, fontWeight: "800", flex: 1 }}>
              Package Doctor Mode
            </Text>
          </View>
          <Text style={{ color: theme.textSecondary, fontSize: S.small, lineHeight: 20 }}>
            Book a short demo with a verified professional doctor, join the voice/video call, then
            your doctor sends package options from the app — you pay to start structured care. Best
            for ongoing treatment plans.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={card}
          disabled={busy}
          onPress={() => pick(CARE_MODE.CASUAL)}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Ionicons name="flash" size={26} color={theme.success} style={{ marginRight: 12 }} />
            <Text style={{ color: theme.textPrimary, fontSize: S.title, fontWeight: "800", flex: 1 }}>
              Casual / Normal Mode
            </Text>
          </View>
          <Text style={{ color: theme.textSecondary, fontSize: S.small, lineHeight: 20 }}>
            Quick Solution (₹10) and Quick Counselling (₹25) with verified clinics and RMP doctors.
            You can upgrade to Package Doctor Mode whenever you like.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={card}
          disabled={busy}
          onPress={() => pick(CARE_MODE.SKIP)}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Ionicons name="time-outline" size={26} color={theme.textTertiary} style={{ marginRight: 12 }} />
            <Text style={{ color: theme.textPrimary, fontSize: S.title, fontWeight: "800", flex: 1 }}>
              Not planning for now
            </Text>
          </View>
          <Text style={{ color: theme.textSecondary, fontSize: S.small, lineHeight: 20 }}>
            Skip for now and go straight to Home. Switch modes later from Profile or the upgrade
            button on Home.
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
      await persistPackageSetupSkip({ profileId: doctorProfileId, userId: currentUserId });
      onSkip?.();
    } catch (e) {
      Alert.alert("Could not skip", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
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
          <Text style={{ color: theme.textSecondary, fontWeight: "800", fontSize: 13 }}>Skip</Text>
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
            <Text style={{ color: theme.accent, fontWeight: "800", fontSize: 13 }}>Log out</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: S.pad,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <Text style={{ color: theme.textPrimary, fontSize: 22, fontWeight: "900" }}>
          Set your package fees
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 8, marginBottom: 20 }}>
          Package names, periods, descriptions, and included features are fixed by the app and are
          the same for every doctor. You only set your service fee (INR) for each of the three tiers.
          Use Skip if you want to finish this later from your profile; you can return any time.
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
            <Text style={{ color: theme.accent, fontWeight: "900", marginBottom: 6 }}>
              {slot.name}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 4 }}>
              {slot.total_period} · {slot.treatment_type}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 10, lineHeight: 20 }}>
              {slot.description}
            </Text>
            {Array.isArray(slot.features) && slot.features.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                {slot.features.map((line, fi) => (
                  <Text
                    key={`${slot.slot}-${fi}`}
                    style={{ color: theme.textTertiary, fontSize: 12, marginBottom: 4 }}
                  >
                    • {line}
                  </Text>
                ))}
              </View>
            ) : null}
            <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "700", marginBottom: 6 }}>
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
      const ext = String(uri.split(".").pop() || "jpg").split("?")[0].toLowerCase();
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
      Alert.alert("Saved", "Your record is stored on your profile for sharing during consults.");
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
        <Text style={{ color: theme.textPrimary, fontSize: S.title, fontWeight: "800" }}>
          Medical records
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.pad }}>
        <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 12 }}>
          Upload prescriptions, lab reports, or images. They stay on your profile and can be shared
          during demo calls, package sessions, or quick consults.
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
            <Text style={{ color: "#fff", fontWeight: "800" }}>Upload file</Text>
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
              <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 4 }}>
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
        <Text style={{ color: theme.textPrimary, fontSize: S.title, fontWeight: "800" }}>
          Quick Solution
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.pad }}>
        <Text style={{ color: theme.textSecondary, marginBottom: 12, fontSize: S.small }}>
          ₹10 (10 coins) per snap or query — platform 5 coins, clinic 5 coins. Verified clinics and
          RMP doctors only.
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
            <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>Private mode</Text>
            <Text style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 4 }}>
              Hide your name, photo, and contact info from the clinic for sensitive issues. You still
              see the provider details.
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
            <Text style={{ color: "#fff", fontWeight: "800" }}>Submit (10 coins)</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

export function QuickCounsellingScreen({ theme, onBack, patientUserId }) {
  const insets = useSafeAreaInsets();
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    try {
      setBusy(true);
      await createQuickCounsellingRequest({ patientUserId, topic });
      Alert.alert("Queued", "Quick Counselling (25 coins). Platform 10, doctor/clinic 15.");
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
        <Text style={{ color: theme.textPrimary, fontSize: S.title, fontWeight: "800" }}>
          Quick Counselling
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.pad }}>
        <Text style={{ color: theme.textSecondary, marginBottom: 12, fontSize: S.small }}>
          ₹25 (25 coins) — platform 10 coins, doctor/clinic 15 coins.
        </Text>
        <TextInput
          placeholder="What would you like to talk about?"
          placeholderTextColor={theme.textTertiary}
          value={topic}
          onChangeText={setTopic}
          style={{
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
            <Text style={{ color: "#fff", fontWeight: "800" }}>Start request (25 coins)</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

export function PackageDoctorJourneyScreen({
  theme,
  onBack,
  patientUserId,
  patientProfileId,
  doctors,
  onOpenChatWithDoctor,
  onAfterPackagePayment,
  /** Extra ScrollView bottom inset when this screen sits above a floating tab bar (see App.js). */
  scrollContentBottomInset = 120,
}) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [offers, setOffers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [meetingDateTime, setMeetingDateTime] = useState(null);
  const [pickerMode, setPickerMode] = useState(null);
  const [meetingDesc, setMeetingDesc] = useState("");
  const [pickedReschedule, setPickedReschedule] = useState({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = doctors || [];
    if (!q) return base;
    return base.filter((d) => String(d.name || "").toLowerCase().includes(q));
  }, [doctors, search]);

  const doctorName = useCallback(
    (userId) => {
      const d = (doctors || []).find((x) => x.userId === userId);
      return d?.name || "Doctor";
    },
    [doctors],
  );

  const reload = useCallback(async () => {
    const o = await listPackageOffersForPatient(patientUserId, patientProfileId);
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

  const submitBooking = async () => {
    if (!selectedDoctor?.userId) {
      Alert.alert("Doctor", "Select a doctor first.");
      return;
    }
    if (!(meetingDateTime instanceof Date) || Number.isNaN(meetingDateTime.getTime())) {
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
      Alert.alert("Description", "Describe the reason for the visit, symptoms, billing context, etc.");
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
      await reload();
      if (created?.localOnly) {
        Alert.alert(
          "Saved on this device",
          "PocketBase could not save the appointment (permissions, rules, or network). Your request is stored on this phone so you can test the flow. Fix `appointments` Create rules and try again. Track it below.",
        );
      } else {
        Alert.alert(
          "Request sent",
          "Your doctor can accept this time or suggest other slots. Track progress below; you will get an alert 30 minutes before the confirmed meeting.",
        );
      }
    } catch (e) {
      Alert.alert("Booking", e?.message || "Failed");
    } finally {
      setBusy(false);
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
      Alert.alert("Sent", "Your doctor will confirm this time.");
    } catch (e) {
      Alert.alert("Reschedule", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  /** Resolve the doctor's auth user id for an offer (handles `users` vs `doctor_profile` relations). */
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

  /** Active offers for a meeting card, matched by doctor auth user id (or profile fallback). */
  const offersForMeeting = useCallback(
    (meeting) => {
      const targetUid = String(meeting?.doctor_user_id || "").trim();
      if (!targetUid) return [];
      return (offers || []).filter((o) => {
        const matchUid = String(o.doctor_user_id || "") === targetUid;
        const matchRaw = offerDoctorUserId(o) === targetUid;
        if (!matchUid && !matchRaw) return false;
        const st = String(o.status || "sent").toLowerCase();
        return st !== "cancelled" && st !== "revoked";
      });
    },
    [offers, offerDoctorUserId],
  );

  /** Prefer paid > sent > most-recent. */
  const primaryOfferForMeeting = useCallback(
    (meeting) => {
      const list = offersForMeeting(meeting);
      if (list.length === 0) return null;
      const paid = list.find((o) => String(o.status || "").toLowerCase() === "paid");
      return paid || list[0];
    },
    [offersForMeeting],
  );

  const payOffer = async (offer) => {
    try {
      setBusy(true);
      const doctorUserId = offerDoctorUserId(offer);
      await patientPayPackageOfferStub(offer.id, doctorUserId);
      try {
        await onAfterPackagePayment?.({
          doctorUserId,
          packageTitle: offer.title,
          amount: offer.amount_inr,
        });
      } catch {
        // optional — chat creation is best-effort
      }
      await reload();
      Alert.alert(
        "Paid — deal started",
        "Payment recorded and a chat with this doctor is now open in the Chat tab. Tap Go to chat from your demo card to continue the conversation.",
      );
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
    const offer = primaryOfferForMeeting(meeting);
    try {
      await onOpenChatWithDoctor?.(doctorUid, meeting, offer);
    } catch (e) {
      Alert.alert("Chat", e?.message || "Could not open chat.");
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
      meetingDateTime instanceof Date && !Number.isNaN(meetingDateTime.getTime())
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
      <Ionicons name={iconName} size={20} color={theme.accent} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textTertiary, fontSize: 11 }}>{label}</Text>
        <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: "700", marginTop: 2 }}>
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
        <Text style={{ color: theme.textPrimary, fontSize: S.title, fontWeight: "800" }}>
          Package Doctor
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: S.pad,
          paddingBottom: scrollContentBottomInset + (insets.bottom || 0) + 24,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
        }
      >
        <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 12 }}>
          Search by doctor name, book your demo date and time, and describe your visit. Your doctor
          accepts or proposes other times; once confirmed you get a reminder 30 minutes before the
          voice/video call. After the call they tap Send package options — you see the breakdown
          here with Pay now. Payment is to the company first; the doctor’s share becomes withdrawable
          coins after they complete package duties (1 coin = ₹1). Changing assigned doctor later has
          no refund; the new doctor continues remaining care.
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
            No approved professional or specialist doctors are available for package demos yet. In
            PocketBase, set practitioner tier to professional or specialist on doctor profiles you want
            in Package Doctor Mode.
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
            onPress={() => setSelectedDoctor(d)}
            style={{
              padding: 12,
              borderRadius: 12,
              marginBottom: 8,
              backgroundColor:
                selectedDoctor?.userId === d.userId ? theme.accentLight : theme.card,
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontWeight: "700" }}>{d.name}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: S.small }}>{d.specialty}</Text>
            <Text style={{ color: theme.textTertiary, fontSize: 10, marginTop: 4 }}>
              Package Doctor ·{" "}
              {d.packagesSetupComplete ? "fees configured on profile" : "fees may still be completing"}
            </Text>
          </TouchableOpacity>
        ))}

        <Text style={{ marginTop: 8, fontWeight: "800", color: theme.textPrimary }}>
          Proposed meeting
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 6 }}>
          Describe your visit first, then pick date and time (required before sending).
        </Text>
        <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "700", marginBottom: 4 }}>
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
        <Text style={{ color: theme.textTertiary, fontSize: 11, marginBottom: 6 }}>
          Pick a date and time using the calendar and clock (this device’s local timezone).
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
              meetingDateTime instanceof Date && !Number.isNaN(meetingDateTime.getTime())
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
          <Modal transparent animationType="fade" visible onRequestClose={() => setPickerMode(null)}>
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.4)",
                justifyContent: "flex-end",
              }}
            >
              <View style={{ backgroundColor: theme.card, padding: 16, paddingBottom: 28 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                  <TouchableOpacity onPress={() => setPickerMode(null)}>
                    <Text style={{ color: theme.warning, fontWeight: "700" }}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>
                    {pickerMode === "date" ? "Pick date" : "Pick time"}
                  </Text>
                  <TouchableOpacity onPress={() => setPickerMode(null)}>
                    <Text style={{ color: theme.accent, fontWeight: "800" }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={
                    meetingDateTime instanceof Date && !Number.isNaN(meetingDateTime.getTime())
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
          <Text style={{ color: theme.warning, fontWeight: "700", textAlign: "center" }}>
            Request change of assigned doctor (no refund)
          </Text>
        </TouchableOpacity>

        <Text style={{ marginTop: 20, fontWeight: "800", color: theme.textPrimary }}>
          Your demo meetings
        </Text>
        {meetings.length === 0 ? (
          <Text style={{ color: theme.textTertiary, marginTop: 6 }}>None yet.</Text>
        ) : (
          meetings.map((x) => {
            const offer = primaryOfferForMeeting(x);
            const offerStatus = String(offer?.status || "").toLowerCase();
            const isPaid = offerStatus === "paid";
            const isAwaiting = !!offer && !isPaid;
            const meetingTimeIso =
              x.confirmed_at && x.status === PACKAGE_MEETING_STATUS.CONFIRMED
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
            const methodLabel = x.call_kind === "chat" ? "Chat consult" : "Video consult";
            const badgeText = isPaid
              ? "Paid"
              : isAwaiting
                ? "Awaiting payment"
                : packageMeetingStatusLabel(x.status);
            const badgeBg = isPaid
              ? theme.successLight
              : isAwaiting
                ? (theme.warningLight || "#FEF3C7")
                : theme.bg;
            const badgeFg = isPaid
              ? theme.success
              : isAwaiting
                ? theme.warning
                : theme.textTertiary;
            const showRescheduleUI =
              x.status === PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS &&
              (x.doctor_alternate_slots || []).length > 0;
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
                    <Text style={{ color: theme.warning, fontSize: 11, fontWeight: "700" }}>
                      On this device only — could not save to PocketBase `appointments`.
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
                    <Text style={{ color: badgeFg, fontWeight: "800", fontSize: 11 }}>
                      {badgeText}
                    </Text>
                  </View>
                </View>
                {meetingTimeIso ? (
                  <Text style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 6 }}>
                    {meetingDateLabel} · {meetingTimeLabel} · {methodLabel}
                  </Text>
                ) : null}
                {x.description ? (
                  <Text style={{ color: theme.textPrimary, fontSize: S.small, marginTop: 6 }}>
                    <Text style={{ fontWeight: "700" }}>Reason: </Text>
                    {x.description}
                  </Text>
                ) : null}
                {showRescheduleUI ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ color: theme.textPrimary, fontWeight: "700", marginBottom: 8 }}>
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
                          onPress={() => setPickedReschedule((p) => ({ ...p, [x.id]: slot }))}
                          style={{
                            padding: 10,
                            borderRadius: 10,
                            marginBottom: 8,
                            borderWidth: 2,
                            borderColor: selected ? theme.accent : theme.cardBorder,
                            backgroundColor: selected ? theme.accentLight : theme.bg,
                          }}
                        >
                          <Text style={{ color: theme.textPrimary, fontWeight: "700" }}>
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
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
                  {isAwaiting ? (
                    <TouchableOpacity
                      onPress={() => payOffer(offer)}
                      disabled={busy}
                      style={{
                        backgroundColor: theme.success,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 10,
                        marginRight: 8,
                        opacity: busy ? 0.7 : 1,
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "800" }}>
                        Pay ₹{offer?.amount_inr ?? "—"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {(isPaid || isAwaiting) ? (
                    <TouchableOpacity
                      onPress={() => goToChatWithMeetingDoctor(x)}
                      style={{
                        backgroundColor: theme.accent,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 10,
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "800" }}>Go to chat</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {/*
          Standalone "Package offers" section is removed — every offer is shown
          inline on its matching demo meeting card above (Pay / Paid + Go to chat).
          Orphan offers (no matching meeting) fall back to a compact list below.
        */}
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
              <Text style={{ marginTop: 20, fontWeight: "800", color: theme.textPrimary }}>
                Other package offers
              </Text>
              {orphans.map((o) => {
                const isPaid = String(o.status || "").toLowerCase() === "paid";
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
                    <Text style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 6 }}>
                      Service fee ₹{o.amount_inr ?? "—"} ·{" "}
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
                          Pay ₹{o.amount_inr ?? "—"}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => onOpenChatWithDoctor?.(offerDoctorUserId(o), null, o)}
                        style={{
                          marginTop: 12,
                          backgroundColor: theme.accent,
                          padding: 12,
                          borderRadius: 12,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "800" }}>Go to chat</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </>
          );
        })()}
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
        "The patient sees the package breakdown and Pay now on their Package Doctor screen. Payment goes to the company account first; your share accrues as coins after you fulfil the package (1 coin = ₹1).",
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
      <Text style={{ color: theme.textPrimary, fontWeight: "800", fontSize: 13, marginBottom: 4 }}>
        Send package options
      </Text>
      <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 10, lineHeight: 16 }}>
        Pick Package 1, 2, or 3 (fees from your profile). The patient gets the breakdown and Pay now.
        Company receives payment first; your share is credited as coins after service delivery.
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
              <Text style={{ color: theme.accent, fontWeight: "800", fontSize: 11 }}>{label}</Text>
              {s?.total_amount_inr ? (
                <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 4 }}>
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
            <Text style={{ color: theme.textPrimary, fontWeight: "900", marginBottom: 8 }}>
              Review & send package options
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={{ color: theme.textPrimary, fontWeight: "800", marginBottom: 4 }}>
                {draftSlot?.name}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 8 }}>
                {draftSlot?.total_period} · {draftSlot?.treatment_type}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 10, lineHeight: 18 }}>
                {draftSlot?.description}
              </Text>
              {Array.isArray(draftSlot?.features) && draftSlot.features.length > 0 ? (
                <View style={{ marginBottom: 12 }}>
                  {draftSlot.features.map((line, fi) => (
                    <Text
                      key={`${draftSlot.slot}-${fi}`}
                      style={{ color: theme.textTertiary, fontSize: 12, marginBottom: 3 }}
                    >
                      • {line}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Text style={{ color: theme.textTertiary, fontSize: 11 }}>Your service fee (INR)</Text>
              <TextInput
                keyboardType="numeric"
                value={String(draftSlot?.total_amount_inr ?? "")}
                onChangeText={(t) => setDraftSlot((d) => ({ ...d, total_amount_inr: t }))}
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
                <Text style={{ fontWeight: "800", color: theme.textPrimary }}>Cancel</Text>
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
                  <Text style={{ fontWeight: "800", color: "#fff" }}>Send package options</Text>
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
  const [doctorOffers, setDoctorOffers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalMeetingId, setModalMeetingId] = useState(null);
  const [catalogSlots, setCatalogSlots] = useState([]);
  const [altRows, setAltRows] = useState([
    { date: "", time: "" },
    { date: "", time: "" },
    { date: "", time: "" },
    { date: "", time: "" },
  ]);

  const loadCatalog = useCallback(async () => {
    if (!user?.id) return;
    try {
      const row = await pb
        .collection("doctor_profile")
        .getFirstListItem(`user="${user.id}"`, { requestKey: null });
      const base = normalizeDoctorPackageSlots(packageTemplatesRawFromRecord(row));
      const localFees = await readLocalDoctorPackageFees(user.id);
      setCatalogSlots(mergeLocalFeesOntoSlots(base, localFees || []));
    } catch {
      setCatalogSlots(normalizeDoctorPackageSlots(null));
    }
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [m, offers] = await Promise.all([
      listPackageMeetingsForDoctor(user.id),
      listPackageOffersForDoctor(user.id),
    ]);
    setRows(m);
    setDoctorOffers(offers);
  }, [user?.id]);

  /** Active (non-cancelled) offers tied to this meeting's patient. */
  const activeOffersForMeeting = useCallback(
    (meeting) => {
      const targetUid = String(meeting?.patient_user_id || "").trim();
      const targetProfId = String(meeting?.patient_profile_id || "").trim();
      if (!targetUid && !targetProfId) return [];
      return doctorOffers.filter((o) => {
        const matchUid = targetUid && String(o.patient_user_id || "") === targetUid;
        const matchRaw =
          (targetUid && String(o.patient || "") === targetUid) ||
          (targetProfId && String(o.patient || "") === targetProfId);
        if (!matchUid && !matchRaw) return false;
        const st = String(o.status || "sent").toLowerCase();
        return st !== "cancelled" && st !== "revoked";
      });
    },
    [doctorOffers],
  );

  /** Confirmed demo where the doctor has already sent at least one offer. */
  const meetingHasActiveOffer = useCallback(
    (meeting) => activeOffersForMeeting(meeting).length > 0,
    [activeOffersForMeeting],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), loadCatalog()]);
    } finally {
      setRefreshing(false);
    }
  }, [load, loadCatalog]);

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
        if (!meetingHasActiveOffer(r)) conf.push(r);
      } else cl.push(r);
    }
    pend.sort(sortDesc);
    disc.sort(sortDesc);
    conf.sort(sortDesc);
    cl.sort(sortDesc);
    return { pending: pend, discussing: disc, confirmedDemo: conf, closed: cl };
  }, [rows, meetingHasActiveOffer]);

  const openRescheduleModal = (meetingId) => {
    setModalMeetingId(meetingId);
    setAltRows([
      { date: "", time: "" },
      { date: "", time: "" },
      { date: "", time: "" },
      { date: "", time: "" },
    ]);
  };

  const submitAlternates = async () => {
    const isos = altRows
      .map((r) => combineDateAndTimeToIso(r.date.trim(), r.time.trim()))
      .filter(Boolean);
    if (isos.length < 3) {
      Alert.alert(
        "Need 3+ slots",
        "Fill at least three rows with YYYY-MM-DD and HH:MM (24h). Extra rows optional.",
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

  const inputRow = (idx) => (
    <View key={`alt-${idx}`} style={{ marginBottom: 8 }}>
      <Text style={{ color: theme.textTertiary, fontSize: 11, marginBottom: 4 }}>Slot {idx + 1}</Text>
      <TextInput
        placeholder="YYYY-MM-DD"
        placeholderTextColor={theme.textTertiary}
        value={altRows[idx].date}
        onChangeText={(t) =>
          setAltRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], date: t };
            return next;
          })
        }
        style={{
          backgroundColor: theme.bg,
          borderRadius: 10,
          padding: 10,
          color: theme.textPrimary,
          borderWidth: 1,
          borderColor: theme.cardBorder,
          marginBottom: 6,
        }}
      />
      <TextInput
        placeholder="HH:MM"
        placeholderTextColor={theme.textTertiary}
        value={altRows[idx].time}
        onChangeText={(t) =>
          setAltRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], time: t };
            return next;
          })
        }
        style={{
          backgroundColor: theme.bg,
          borderRadius: 10,
          padding: 10,
          color: theme.textPrimary,
          borderWidth: 1,
          borderColor: theme.cardBorder,
        }}
      />
    </View>
  );

  const renderMeetingCard = (x, { readOnly, withSuggest }) => {
    const sentOffers = withSuggest ? activeOffersForMeeting(x) : [];
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
        <Text style={{ color: theme.warning, fontSize: 10, fontWeight: "700", marginBottom: 8 }}>
          Local test record (same device as patient) — sync requires saving to PocketBase
          `appointments`.
        </Text>
      ) : null}
      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
        {readOnly ? packageMeetingClosedLabel(x) : packageMeetingStatusLabel(x.status)}
      </Text>
      {x.proposed_at ? (
        <Text style={{ color: theme.textPrimary, fontSize: S.small, marginTop: 4 }}>
          Patient proposed:{" "}
          {new Date(x.proposed_at).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </Text>
      ) : null}
      {x.patient_selected_slot ? (
        <Text style={{ color: theme.accent, fontSize: S.small, marginTop: 4, fontWeight: "700" }}>
          Patient chose:{" "}
          {new Date(x.patient_selected_slot).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </Text>
      ) : null}
      {x.description ? (
        <Text style={{ color: theme.textPrimary, fontSize: S.small, marginTop: 8 }}>{x.description}</Text>
      ) : null}
      {Array.isArray(x.messages) && x.messages.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          {x.messages.slice(-5).map((m, i) => (
            <Text
              key={`${x.id}-dm-${i}`}
              style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 2 }}
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
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>Accept time</Text>
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
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>Reschedule (3+ slots)</Text>
            </TouchableOpacity>
          </>
        ) : null}
        {!readOnly && x.status === PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK ? (
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
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>Confirm meeting</Text>
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
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>New alternates</Text>
            </TouchableOpacity>
          </>
        ) : null}
        {!readOnly && x.status === PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS ? (
          <View style={{ marginTop: 4 }}>
            <Text style={{ color: theme.textTertiary, fontSize: 11, marginBottom: 8 }}>
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
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>Update suggested slots</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {!readOnly && x.status === PACKAGE_MEETING_STATUS.CONFIRMED ? (
          <Text style={{ color: theme.success, fontSize: 11, fontWeight: "700" }}>
            Confirmed — reminder 30 min before.
          </Text>
        ) : null}
      </View>
      {withSuggest ? (
        sentOffers.length > 0 ? (
          <View
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              backgroundColor: theme.successLight,
              borderWidth: 1,
              borderColor: theme.success,
            }}
          >
            <Text style={{ color: theme.success, fontWeight: "800", fontSize: 12 }}>
              Package sent — track payment
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 11,
                marginTop: 6,
                lineHeight: 16,
              }}
            >
              The patient sees this under Package Doctor → Package offers with Pay now. Status below
              reflects the offer row in PocketBase.
            </Text>
            {sentOffers.map((o) => (
              <View
                key={o.id}
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.cardBorder,
                }}
              >
                <Text style={{ color: theme.textPrimary, fontWeight: "700", fontSize: 12 }}>
                  {o.title || "Package"}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4 }}>
                  ₹{o.amount_inr ?? "—"} · Status: {String(o.status || "sent")}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <PackageSuggestAfterMeetingInline
            theme={theme}
            patientUserId={x.patient_user_id}
            catalogSlots={catalogSlots}
            onPackageOptionsSent={load}
          />
        )
      ) : null}
    </View>
    );
  };

  const sectionHeader = (title, blurb, noTopMargin) => (
    <View style={{ marginTop: noTopMargin ? 0 : 16, marginBottom: 8 }}>
      <Text style={{ fontSize: 15, fontWeight: "800", color: theme.textPrimary }}>{title}</Text>
      {blurb ? (
        <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 4, lineHeight: 16 }}>{blurb}</Text>
      ) : null}
    </View>
  );

  const emptyLine = (text) => (
    <Text style={{ color: theme.textTertiary, fontSize: S.small, marginBottom: 6 }}>{text}</Text>
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
      <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 10 }}>
        Matches the product flow: pending requests → discussing reschedules → confirmed demo (after
        the voice/video slot is locked, use Send package options so the patient sees Pay now) →
        declined/cancelled history.
      </Text>
      <ScrollView
        nestedScrollEnabled
        style={{ maxHeight: 520 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
        }
      >
        {rows.length === 0 ? (
          <Text style={{ color: theme.textTertiary, fontSize: S.small }}>No package meetings yet.</Text>
        ) : (
          <>
            {sectionHeader(
              "Pending",
              "Patient booked a time. Accept it or send at least three alternative slots.",
              true,
            )}
            {pending.length === 0
              ? emptyLine("None right now.")
              : pending.map((x) => renderMeetingCard(x, { readOnly: false, withSuggest: false }))}
            {sectionHeader(
              "Discussing",
              "Reschedule or alternate-slot negotiation — you can still send package options from here once you and the patient agree on timing.",
            )}
            {discussing.length === 0
              ? emptyLine("None — nothing mid-negotiation.")
              : discussing.map((x) => renderMeetingCard(x, { readOnly: false, withSuggest: true }))}
            {sectionHeader(
              "Confirmed demo",
              "Demo time is confirmed (reminder 30 minutes before). After your call, tap Send package options so the patient receives the breakdown and Pay now.",
            )}
            {confirmedDemo.length === 0
              ? emptyLine("None yet.")
              : confirmedDemo.map((x) => renderMeetingCard(x, { readOnly: false, withSuggest: true }))}
            {sectionHeader(
              "Declined & cancelled",
              "Terminal rows from PocketBase `appointments.status` (no further actions).",
            )}
            {closed.length === 0
              ? emptyLine("None yet.")
              : closed.map((x) => renderMeetingCard(x, { readOnly: true, withSuggest: false }))}
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
            <Text style={{ color: theme.textPrimary, fontWeight: "800", marginBottom: 10 }}>
              Propose alternate times
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {[0, 1, 2, 3].map((i) => inputRow(i))}
            </ScrollView>
            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setModalMeetingId(null)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: theme.bg,
                  alignItems: "center",
                  marginRight: 8,
                }}
              >
                <Text style={{ fontWeight: "800", color: theme.textPrimary }}>Cancel</Text>
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
                  <Text style={{ fontWeight: "800", color: "#fff" }}>Send to patient</Text>
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
  if (record?.private_mode) return "Private — identity hidden";
  const u = record?.expand?.patient;
  if (!u) return "Patient";
  return u.name || u.email || u.username || "Patient";
}

function quickRequestPatientUserId(record) {
  if (!record) return null;
  const u = record?.expand?.patient;
  if (u?.id) return u.id;
  if (typeof record.patient === "string" && record.patient) return record.patient;
  if (record.patient?.id) return record.patient.id;
  return null;
}

function truncateOneLine(s, max) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
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

    // Existing offers — silently ignore if collection/rules are missing.
    let realOffers = [];
    try {
      realOffers = (await listQuickHelpOffersByDoctor(effectiveDoctorId)) || [];
    } catch (e) {
      console.log("listQuickHelpOffersByDoctor ignored:", e?.message);
    }
    // Inferred offers — works even when the optional `quick_help_offers`
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
      Alert.alert("Sign in required", "Please sign in again before offering help.");
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
        ? "Hi — I saw your Quick Solution request. I can help. Could you share more details?"
        : "Hi — I saw your Quick Counselling request. Happy to help. What would you like to talk about first?",
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
          <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12 }}>
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
        <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 12 }}>Help</Text>
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
      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>Quick Solution · queued</Text>
      <Text style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 4 }}>
        {quickRequestPatientLabel(r)}
      </Text>
      <Text style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 6 }}>
        {truncateOneLine(r.notes, 160) || "—"}
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
      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>Quick Counselling · queued</Text>
      <Text style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 4 }}>
        {quickRequestPatientLabel(r)}
      </Text>
      <Text style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 6 }}>
        Topic: {truncateOneLine(r.topic, 120) || "—"}
      </Text>
      <Text style={{ color: theme.textTertiary, fontSize: 10, marginTop: 6 }}>
        {r.created ? new Date(r.created).toLocaleString() : ""}
      </Text>
      {renderHelpButton(r, "counselling")}
    </View>
  );

  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
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
          <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12 }}>
            {loading ? "…" : "Refresh"}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 10 }}>
        The app only loads rows with <Text style={{ fontWeight: "700" }}>status = queued</Text>. Tap{" "}
        <Text style={{ fontWeight: "700" }}>Help</Text> on a card to open a chat with the patient —
        your first message starts the thread and they will see “you want to help” on their tracking
        list. The patient can close or cancel the request anytime.
      </Text>
      {err ? (
        <Text style={{ color: theme.danger, fontSize: S.small, marginBottom: 8 }}>{err}</Text>
      ) : null}

      <Text style={{ color: theme.textPrimary, fontWeight: "700", marginBottom: 6 }}>
        Quick Solution ({solutionRows.length})
      </Text>
      {solutionRows.length === 0 ? (
        <Text style={{ color: theme.textTertiary, fontSize: S.small, marginBottom: 14 }}>
          No queued requests (or list blocked — see red message above).
        </Text>
      ) : (
        solutionRows.map(renderSolutionCard)
      )}

      <Text style={{ color: theme.textPrimary, fontWeight: "700", marginBottom: 6, marginTop: 4 }}>
        Quick Counselling ({counsellingRows.length})
      </Text>
      {counsellingRows.length === 0 ? (
        <Text style={{ color: theme.textTertiary, fontSize: S.small }}>No queued requests.</Text>
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
              {helpTarget?.patientLabel === "Private — identity hidden"
                ? "this patient"
                : helpTarget?.patientLabel || "this patient"}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 10 }}>
              {helpTarget?.requestKind === "counselling"
                ? "Quick Counselling"
                : "Quick Solution"}
              {helpTarget?.preview ? ` · ${helpTarget.preview}` : ""}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 6 }}>
              Your message — this becomes the first chat message in the new conversation.
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
            <View style={{ flexDirection: "row", marginTop: 14, justifyContent: "flex-end" }}>
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
                <Text style={{ color: theme.textPrimary, fontWeight: "700" }}>Cancel</Text>
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
                  <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 6 }} />
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
    setItems((prev) => prev.filter((row) => !(row.id === id && row.kind === kind)));
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
      onOpenConversation(offer.conversation, offer?.expand?.doctor?.id || offer.doctor);
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
          <Text style={{ color: theme.success, fontSize: 11, fontWeight: "700" }}>
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
    const kindLabel = row.kind === "counselling" ? "Quick Counselling" : "Quick Solution";
    const summary =
      row.kind === "counselling"
        ? `Topic: ${truncateOneLine(row.topic, 140) || "General"}`
        : truncateOneLine(row.notes, 200) || "—";
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
          style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 4, fontSize: 14 }}
        >
          {summary}
        </Text>
        {row.private_mode ? (
          <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4 }}>
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
            <Text style={{ color: theme.danger, fontWeight: "700", fontSize: 13 }}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
        {!hasOffers ? (
          <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 8 }}>
            Waiting for a doctor to offer help. You’ll see them appear here as alerts.
          </Text>
        ) : null}
      </View>
    );
  };

  if (!patientUserId) return null;

  return (
    <View style={{ marginTop: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
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
          <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12 }}>
            {loading ? "…" : "Refresh"}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 10 }}>
        Track Quick Solution / Counselling requests you submitted. When a doctor offers help, an
        alert appears with an arrow button — tap it to open the chat. Use{" "}
        <Text style={{ fontWeight: "700" }}>Close</Text> after you’ve chosen a doctor or{" "}
        <Text style={{ fontWeight: "700" }}>Cancel</Text> if you no longer need help.
      </Text>
      {err ? (
        <Text style={{ color: theme.danger, fontSize: S.small, marginBottom: 8 }}>{err}</Text>
      ) : null}
      {items.length === 0 ? (
        <Text style={{ color: theme.textTertiary, fontSize: S.small, marginBottom: 8 }}>
          {loading ? "Loading your tracking list…" : "No active Quick requests."}
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

  const runWithdraw = async () => {
    try {
      setBusy(true);
      await doctorWithdrawCoinsStub(user?.id, Number(withdraw));
      setWithdraw("");
    } catch (e) {
      Alert.alert("Withdraw", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: theme.textPrimary, fontWeight: "800", marginBottom: 8 }}>
        Coin wallet (1 coin = ₹1)
      </Text>
      <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 8 }}>
        Pending and settled package earnings appear here. Withdraw anytime (stub records a ledger
        debit).
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
          style={{ backgroundColor: theme.accent, padding: 12, borderRadius: 12 }}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>Withdraw</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: theme.textTertiary, fontSize: S.small, marginTop: 10 }}>
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
      <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 10, lineHeight: 18 }}>
        Ledger entries for your coin balance (1 coin = ₹1).
      </Text>
      {rows.length === 0 ? (
        <Text style={{ color: theme.textTertiary, fontSize: S.small }}>No movements yet.</Text>
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
              borderBottomWidth: idx === rows.length - 1 ? 0 : StyleSheet.hairlineWidth,
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
            <Text style={{ color: theme.textPrimary, fontSize: S.small, fontWeight: "800" }}>
              {Number(r.delta) > 0 ? `+${r.delta}` : String(r.delta)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

export function PatientCoinHistoryPanel({ theme, userId }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    (async () => {
      setRows(await listCoinLedgerForUser(userId));
    })();
  }, [userId]);
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: theme.textPrimary, fontWeight: "800", marginBottom: 6 }}>
        Coin & payments history
      </Text>
      {rows.length === 0 ? (
        <Text style={{ color: theme.textTertiary, fontSize: S.small }}>No movements yet.</Text>
      ) : (
        rows.map((r) => (
          <Text key={r.id} style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 4 }}>
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
        const rows = await pb.collection(name).getList(1, 30, { requestKey: null, sort: "-created" });
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
      <Text style={{ color: theme.textPrimary, fontSize: 22, fontWeight: "800" }}>Admin console</Text>
      <Text style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 8, marginBottom: 16 }}>
        Mobile view for monitoring. Full web dashboard should mirror this: consultations, quick snaps,
        coin movements, verifications, global limits, reports. Use PocketBase Admin for destructive
        edits until the web app ships.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
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
            <Text style={{ color: tab === t ? "#fff" : theme.textPrimary, fontWeight: "700" }}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === "overview" ? (
        <ScrollView style={{ flex: 1 }}>
          <Text style={{ color: theme.textSecondary, fontSize: S.small, marginBottom: 8 }}>
            Latest collections snapshot (requires API rules for admin role):
          </Text>
          <Text style={{ color: theme.textPrimary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11 }}>
            {log || "Loading…"}
          </Text>
        </ScrollView>
      ) : null}
      {tab === "limits" ? (
        <Text style={{ color: theme.textSecondary, fontSize: S.small }}>
          Configure in PocketBase: max package patients per doctor (3–5), daily quick service caps,
          pricing tables. This screen is a placeholder for future CRUD.
        </Text>
      ) : null}
      {tab === "reports" ? (
        <Text style={{ color: theme.textSecondary, fontSize: S.small }}>
          Revenue / doctor performance / activity reports: export from PocketBase or connect BI. Stub
          UI only in the mobile app.
        </Text>
      ) : null}
      <TouchableOpacity
        onPress={onLogout}
        style={{ marginTop: 24, padding: 14, backgroundColor: theme.dangerLight, borderRadius: 12 }}
      >
        <Text style={{ color: theme.danger, fontWeight: "800", textAlign: "center" }}>Log out</Text>
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
      <Ionicons name="rocket" size={18} color="#fff" style={{ marginRight: 8 }} />
      <Text style={{ color: "#fff", fontWeight: "800" }}>Package mode</Text>
    </TouchableOpacity>
  );
}
