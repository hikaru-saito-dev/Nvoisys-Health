import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  androidKeyboardPad,
  scheduleScrollAfterTypingLayout,
  scrollInputAboveImeAndroid,
  useKeyboardBottomInset,
} from "./keyboardScrollUtils";
import { formatCurrencyFromInr, getUserCurrencyInfo } from "./currency";
import { getAuthUser, pb } from "./pocketbase";
import {
  acceptQuickHelpOffer,
  cancelQuickRequest,
  CARE_MODE,
  buildConsultationTimeWindowFromStartDate,
  closeQuickRequest,
  createPatientSelectedPackageOffer,
  createPackageMeetingRequest,
  createQuickCounsellingRequest,
  createQuickSolutionRequest,
  pickRandomQuickCareRecipient,
  entitlementsForConsumerPlan,
  displayQuickCounsellingTopic,
  displayQuickSolutionNotes,
  doctorAcceptPackageMeetingInitial,
  doctorConfirmPatientRescheduleChoice,
  doctorPackageFeeErrors,
  doctorPackagesSetupComplete,
  doctorProposePackageMeetingReschedule,
  doctorSendPackageOfferFromSlot,
  doctorTierEligibleForPackageMode,
  doctorTierEligibleForQuickService,
  doctorWithdrawCoinsStub,
  fetchMedicalRecordsForPatient,
  getFixedPackageDefinitionForSlot,
  getAiAssistantUsageToday,
  getCoinBalanceForUser,
  fetchUsersAuthByIds,
  hydrateRowsPatientAuthUsers,
  resolveListingDisplayName,
  incrementAiAssistantUsageToday,
  getDoctorCoinBalance,
  getDoctorCoinBucketBalances,
  listActivePackagePairsForDoctor,
  listActivePackagePairsForPatient,
  listActiveQuickRequestsForPatient,
  listCoinLedgerForUser,
  listPackageMeetingsForDoctor,
  listPackageMeetingsForPatient,
  listPackageOffersForPatient,
  listQueuedQuickCounsellingRequestsForProvider,
  listQueuedQuickSolutionRequestsForProvider,
  listPackageReferralsForDoctor,
  mergeLocalFeesOntoSlots,
  normalizeDoctorPackageSlots,
  packageSlotDisplayName,
  packageSlotMinimumFeeInr,
  packageSlotScheduledConsultationBlockHours,
  parseLeadingTime12hToReferenceDate,
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
  deleteMedicalRecord,
  getMedicalRecordFileDownloadUrl,
  listDoctorsForMedicalRecordShare,
  WALLET_TOPUP_MAX_INR,
  WALLET_TOPUP_MIN_INR,
} from "./productSpecApi";

const S = {
  title: 18,
  body: 14,
  small: 12,
  pad: 16,
};

/** Extra bottom padding while the keyboard is open so ScrollView can scroll past it. */
function useKeyboardBottomPad() {
  const [pad, setPad] = useState(0);
  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e) => {
      const raw = Number(e?.endCoordinates?.height);
      setPad(Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0);
    };
    const onHide = () => setPad(0);
    const subA = Keyboard.addListener(showEvt, onShow);
    const subB = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subA.remove();
      subB.remove();
    };
  }, []);
  return pad;
}

/**
 * Extra ScrollView content paddingBottom while the keyboard is open (additive to base inset).
 * iOS: 0 — use ScrollView.automaticallyAdjustKeyboardInsets (avoids stacking with manual height).
 * Android + softwareKeyboardLayoutMode resize: window already shrinks; add bounded slack for
 * IME strip + scrollToEnd so the focused field clears the keyboard without a huge empty band.
 */
function keyboardExtraScrollPad(keyboardPad) {
  if (!keyboardPad || keyboardPad <= 0) return 0;
  if (Platform.OS === "ios") return 0;
  // Android (incl. API 28): IME + resize timing often needs a larger scroll tail than a tiny strip.
  return Math.min(380, Math.round(keyboardPad * 0.62) + 40);
}

function scrollToEndAfterKeyboard(scrollRef, animated = true) {
  requestAnimationFrame(() => {
    scrollRef.current?.scrollToEnd({ animated });
    if (Platform.OS === "android") {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 200);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 420);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 700);
    }
  });
}

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
  onBack,
  onDone,
  onCommitPackageDoctor,
  onHasExistingPackage,
  onUseExistingPackage,
  onHasExistingCasualCoins,
  onUseExistingCasualMode,
  onLoadPackageDoctors,
  onPaySelectedPackage,
  onWalletTopUp,
  paymentMode,
  startInPackageStep = false,
  packageOnly = false,
}) {
  const insets = useSafeAreaInsets();
  const currencyInfo = getUserCurrencyInfo();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [packageStep, setPackageStep] = useState(Boolean(startInPackageStep));
  const [packageDoctors, setPackageDoctors] = useState([]);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [packageDoctorsLoaded, setPackageDoctorsLoaded] = useState(false);
  const [existingPackageAvailable, setExistingPackageAvailable] =
    useState(false);
  const [checkingExistingPackage, setCheckingExistingPackage] = useState(false);
  const [casualStep, setCasualStep] = useState(false);
  const [existingCasualAvailable, setExistingCasualAvailable] =
    useState(false);
  const [checkingExistingCasual, setCheckingExistingCasual] = useState(false);
  const [casualAmount, setCasualAmount] = useState(
    String(WALLET_TOPUP_MIN_INR),
  );

  const loadPackageDoctors = useCallback(async () => {
    if (typeof onLoadPackageDoctors !== "function") {
      setPackageDoctorsLoaded(true);
      return [];
    }
    setLoadingDoctors(true);
    try {
      const list = await onLoadPackageDoctors();
      const next = Array.isArray(list) ? list : [];
      setPackageDoctors(next);
      setPackageDoctorsLoaded(true);
      return next;
    } catch (e) {
      Alert.alert("Doctors", e?.message || "Could not load package doctors.");
      setPackageDoctors([]);
      setPackageDoctorsLoaded(true);
      return [];
    } finally {
      setLoadingDoctors(false);
    }
  }, [onLoadPackageDoctors]);

  useEffect(() => {
    if (!packageStep || loadingDoctors || packageDoctorsLoaded) return;
    void loadPackageDoctors();
  }, [packageStep, loadingDoctors, packageDoctorsLoaded, loadPackageDoctors]);

  useEffect(() => {
    if (!packageStep || typeof onHasExistingPackage !== "function") {
      setExistingPackageAvailable(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        setCheckingExistingPackage(true);
        const hasPackage = await onHasExistingPackage();
        if (!cancelled) setExistingPackageAvailable(Boolean(hasPackage));
      } catch (e) {
        console.log("check existing package skipped:", e?.message);
        if (!cancelled) setExistingPackageAvailable(false);
      } finally {
        if (!cancelled) setCheckingExistingPackage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packageStep, onHasExistingPackage]);

  useEffect(() => {
    if (!casualStep || typeof onHasExistingCasualCoins !== "function") {
      setExistingCasualAvailable(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        setCheckingExistingCasual(true);
        const hasCoins = await onHasExistingCasualCoins();
        if (!cancelled) setExistingCasualAvailable(Boolean(hasCoins));
      } catch (e) {
        console.log("check existing casual coins skipped:", e?.message);
        if (!cancelled) setExistingCasualAvailable(false);
      } finally {
        if (!cancelled) setCheckingExistingCasual(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [casualStep, onHasExistingCasualCoins]);

  const confirm = async () => {
    if (!selected) {
      Alert.alert(
        "Choose a mode",
        "Select Casual or Package doctor, then tap Confirm.",
      );
      return;
    }
    if (selected === "package") {
      setPackageStep(true);
      void loadPackageDoctors();
      return;
    }
    if (selected === "casual") {
      setCasualStep(true);
      return;
    }
    try {
      setBusy(true);
      const mode = selected === "skip" ? CARE_MODE.SKIP : CARE_MODE.CASUAL;
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
      await persistPatientCareMode({
        profileId: patientProfile?.id,
        userId: currentUser?.id,
        mode: CARE_MODE.PACKAGE,
      });
      onDone?.(CARE_MODE.PACKAGE, {
        offer,
        doctor: selectedDoctor,
        slot: selectedSlot,
      });
      Alert.alert(
        "Package active",
        "Payment confirmed. This doctor is fixed for structured care.",
      );
    } catch (e) {
      Alert.alert("Package payment", e?.message || "Could not start package.");
    } finally {
      setBusy(false);
    }
  };

  const useExistingPackage = async () => {
    if (typeof onUseExistingPackage !== "function") return;
    try {
      setBusy(true);
      const reused = await onUseExistingPackage();
      if (!reused) {
        setExistingPackageAvailable(false);
        Alert.alert(
          "Package",
          "No active paid package was found. Please choose a doctor and pay for a package.",
        );
      }
    } catch (e) {
      Alert.alert("Package", e?.message || "Could not open existing package.");
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

  const payCasualTopup = async () => {
    const amount = Math.floor(Number(String(casualAmount || "").trim()));
    if (
      !Number.isFinite(amount) ||
      amount < WALLET_TOPUP_MIN_INR ||
      amount > WALLET_TOPUP_MAX_INR
    ) {
      Alert.alert(
        "Top up coins",
        `Enter a whole number from ${WALLET_TOPUP_MIN_INR} to ${WALLET_TOPUP_MAX_INR} coins.`,
      );
      return;
    }
    if (typeof onWalletTopUp !== "function") {
      Alert.alert("Top up coins", "Wallet top-up is not available right now.");
      return;
    }
    try {
      setBusy(true);
      await onWalletTopUp(amount);
      await persistPatientCareMode({
        profileId: patientProfile?.id,
        userId: currentUser?.id,
        mode: CARE_MODE.CASUAL,
      });
      onDone?.(CARE_MODE.CASUAL);
      Alert.alert("Coins added", `${amount} coins were added to your wallet.`);
    } catch (e) {
      Alert.alert("Top up coins", e?.message || "Could not complete top-up.");
    } finally {
      setBusy(false);
    }
  };

  const useExistingCasualCoins = async () => {
    if (typeof onUseExistingCasualMode !== "function") return;
    try {
      setBusy(true);
      const reused = await onUseExistingCasualMode();
      if (!reused) {
        setExistingCasualAvailable(false);
        Alert.alert(
          "Casual mode",
          "No casual coins were found. Please top up to continue.",
        );
      }
    } catch (e) {
      Alert.alert("Casual mode", e?.message || "Could not enter casual mode.");
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

  const cardStyle = (key) => ({
    ...card,
    borderColor: selected === key ? theme.accent : theme.cardBorder,
    borderWidth: selected === key ? 2 : StyleSheet.hairlineWidth,
    backgroundColor: selected === key ? theme.accentLight : theme.card,
  });

  if (casualStep) {
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
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => setCasualStep(false)}
            disabled={busy}
            style={{ marginBottom: 14, alignSelf: "flex-start" }}
          >
            <Text style={{ color: theme.accent, fontWeight: "800" }}>Back</Text>
          </TouchableOpacity>
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: 24,
              fontWeight: "800",
            }}
          >
            Top up for Casual mode
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
            Enter {WALLET_TOPUP_MIN_INR}-{WALLET_TOPUP_MAX_INR} coins. Cashfree
            charges roughly {formatCurrencyFromInr(WALLET_TOPUP_MIN_INR, currencyInfo)}-
            {formatCurrencyFromInr(WALLET_TOPUP_MAX_INR, currencyInfo)}. Quick Solution costs 10 coins and Quick Counselling costs 25 coins.
          </Text>
          <TextInput
            placeholder="e.g. 500"
            placeholderTextColor={theme.textTertiary}
            value={casualAmount}
            onChangeText={setCasualAmount}
            keyboardType="numeric"
            editable={!busy}
            style={slotInput(theme)}
          />
          {checkingExistingCasual ? (
            <Text
              style={{
                color: theme.textTertiary,
                fontSize: S.small,
                marginBottom: 10,
              }}
            >
              Checking your casual coin wallet...
            </Text>
          ) : existingCasualAvailable ? (
            <TouchableOpacity
              onPress={useExistingCasualCoins}
              disabled={busy}
              style={{
                backgroundColor: theme.accent,
                borderRadius: 16,
                padding: 16,
                alignItems: "center",
                marginBottom: 12,
                opacity: busy ? 0.65 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  Go in with existing casual coins
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={payCasualTopup}
            disabled={busy}
            style={{
              backgroundColor: theme.success,
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              opacity: busy ? 0.65 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "900" }}>
                {paymentMode === "cashfree" ? "Pay with Cashfree" : "Add coins"}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (packageStep) {
    const slots = Array.isArray(selectedDoctor?.packageSlots)
      ? selectedDoctor.packageSlots
      : [];
    const existingPackageAction = checkingExistingPackage ? (
      <Text
        style={{
          color: theme.textTertiary,
          fontSize: S.small,
          marginTop: 12,
          marginBottom: 10,
          textAlign: "center",
        }}
      >
        Checking your existing package wallet...
      </Text>
    ) : existingPackageAvailable ? (
      <TouchableOpacity
        onPress={useExistingPackage}
        disabled={busy}
        style={{
          backgroundColor: theme.success,
          borderRadius: 16,
          padding: 16,
          alignItems: "center",
          marginTop: 14,
          opacity: busy ? 0.65 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "900" }}>
            Go in with existing package
          </Text>
        )}
      </TouchableOpacity>
    ) : null;
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
            onPress={() => {
              if (packageOnly) onBack?.();
              else setPackageStep(false);
            }}
            disabled={busy}
            style={{ marginBottom: 14, alignSelf: "flex-start" }}
          >
            <Text style={{ color: theme.accent, fontWeight: "800" }}>Back</Text>
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
            Package mode is for professional or specialist doctors only. Pick a
            doctor, choose Basic / Gold / Premium, then pay with Cashfree.
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
              No package doctors are available right now.
            </Text>
          ) : null}
          {filteredPackageDoctors.map((d) => {
            const active = selectedDoctor?.userId === d.userId;
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
                  borderColor: active ? theme.accent : theme.cardBorder,
                  backgroundColor: active ? theme.accentLight : theme.card,
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
                  {d.specialty || "Package doctor"}
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
                const active = selectedSlot?.slot === slot.slot;
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
                      borderColor: active ? theme.accent : theme.cardBorder,
                      backgroundColor: active ? theme.accentLight : theme.card,
                      marginBottom: 10,
                    }}
                  >
                    <Text
                      style={{ color: theme.textPrimary, fontWeight: "800" }}
                    >
                      {slot.name || packageSlotDisplayName(slot.slot)}
                    </Text>
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: S.small,
                        marginTop: 4,
                      }}
                    >
                      Pay {formatCurrencyFromInr(amount, currencyInfo)}
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
                    Pay package with Cashfree
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
          {existingPackageAction}
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
          Choose your care mode
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
          Pick Casual or Package doctor, then tap Confirm. Package setup
          continues with pharmacy, doctor, and payment.
        </Text>

        <TouchableOpacity
          style={cardStyle("package")}
          disabled={busy}
          onPress={() => setSelected("package")}
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
              Package doctor mode
            </Text>
            {selected === "package" ? (
              <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
            ) : null}
          </View>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              lineHeight: 20,
            }}
          >
            Choose a pharmacy, then a package doctor and tier, pay with Cashfree,
            and unlock structured care, telemedicine, and package coins.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={cardStyle("casual")}
          disabled={busy}
          onPress={() => setSelected("casual")}
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
              Casual mode
            </Text>
            {selected === "casual" ? (
              <Ionicons
                name="checkmark-circle"
                size={22}
                color={theme.success}
              />
            ) : null}
          </View>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              lineHeight: 20,
            }}
          >
            Quick Solution and Quick Counselling with verified clinics and RMP
            doctors. You can upgrade to Package doctor mode anytime from Home.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={cardStyle("skip")}
          disabled={busy}
          onPress={() => setSelected("skip")}
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
              Skip for now
            </Text>
            {selected === "skip" ? (
              <Ionicons
                name="checkmark-circle"
                size={22}
                color={theme.textTertiary}
              />
            ) : null}
          </View>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              lineHeight: 20,
            }}
          >
            Browse the app first. You can pick a mode later from Profile.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => void confirm()}
          disabled={busy || !selected}
          style={{
            marginTop: 8,
            backgroundColor: theme.accent,
            borderRadius: 16,
            padding: 16,
            alignItems: "center",
            opacity: busy || !selected ? 0.55 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
              Confirm
            </Text>
          )}
        </TouchableOpacity>

        {busy && !selected ? (
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

/** Shown to doctors as valid 12-hour window examples (Basic / Gold). Premium is 24/7 in-app. */
const PACKAGE_CONSULT_TIME_EXAMPLES = Object.freeze({
  1: "9:00 AM to 12:00 PM",
  2: "12:00 PM to 5:00 PM",
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
  const keyboardInset = useKeyboardBottomInset();
  const keyboardPad = useKeyboardBottomPad();
  const packageFeeScrollRef = useRef(null);
  const packageFeeScrollYRef = useRef(0);
  const focusedFeeSlotIndexRef = useRef(-1);
  const activePackageFeeFieldRef = useRef("fee");
  const feeInputRefs = useRef([]);
  const feeScrollMeasureRef = useRef(null);
  const [slots, setSlots] = useState(() =>
    normalizeDoctorPackageSlots(packageTemplatesRawFromRecord(initialRecord)),
  );
  const [busy, setBusy] = useState(false);
  const [consultTimePickerIdx, setConsultTimePickerIdx] = useState(null);
  const [consultTimeDraft, setConsultTimeDraft] = useState(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMilliseconds(0);
    d.setHours(9, 0, 0, 0);
    return d;
  });

  const scrollFocusedFeeAboveIme = useCallback(() => {
    if (Platform.OS !== "android") {
      return;
    }
    const idx = focusedFeeSlotIndexRef.current;
    if (idx < 0) return;
    const inputEl = feeInputRefs.current[idx];
    if (!inputEl) return;
    if (keyboardInset.height <= 0 && keyboardInset.screenY == null) return;
    feeScrollMeasureRef.current = inputEl;
    scrollInputAboveImeAndroid({
      scrollRef: packageFeeScrollRef,
      scrollYRef: packageFeeScrollYRef,
      inputRef: feeScrollMeasureRef,
      keyboardHeight: keyboardInset.height,
      keyboardScreenY: keyboardInset.screenY,
      extraClearance: 52,
      breathing: 10,
    });
  }, [keyboardInset.height, keyboardInset.screenY]);

  const scheduleFeeVisibleWhileTyping = useCallback(() => {
    if (focusedFeeSlotIndexRef.current < 0) return;
    scheduleScrollAfterTypingLayout(() => {
      scrollFocusedFeeAboveIme();
    });
  }, [scrollFocusedFeeAboveIme]);

  useEffect(() => {
    if (Platform.OS !== "android" || keyboardInset.height <= 0) return;
    if (focusedFeeSlotIndexRef.current < 0) return;
    const t = setTimeout(scrollFocusedFeeAboveIme, 48);
    return () => clearTimeout(t);
  }, [keyboardInset.height, keyboardInset.screenY, scrollFocusedFeeAboveIme]);

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
      const lines = doctorPackageFeeErrors(slots);
      Alert.alert(
        "Package fees",
        lines.length
          ? lines.join("\n")
          : "Enter fees for Basic, Gold, and Premium (minimums apply; no maximum).",
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
          "Your fees and consultation windows are saved. Patients see the app-defined features with your prices and scheduled hours on your profile.",
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

  const consultTimePickerMetaRef = useRef({ index: -1, slot: 1 });

  const openConsultTimePicker = (index) => {
    Keyboard.dismiss();
    const slot = slots[index];
    const n = Number(slot?.slot) || 1;
    consultTimePickerMetaRef.current = { index, slot: n };
    const parsed = parseLeadingTime12hToReferenceDate(
      String(slot?.consultation_time_window || ""),
    );
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMilliseconds(0);
    if (parsed && !Number.isNaN(parsed.getTime())) {
      d.setTime(parsed.getTime());
    } else if (n === 2) {
      d.setHours(12, 0, 0, 0);
    } else {
      d.setHours(9, 0, 0, 0);
    }
    setConsultTimeDraft(d);
    setConsultTimePickerIdx(index);
  };

  const closeConsultTimePicker = () => {
    setConsultTimePickerIdx(null);
    consultTimePickerMetaRef.current = { index: -1, slot: 1 };
  };

  const applyConsultTimeFromDraft = () => {
    const { index, slot } = consultTimePickerMetaRef.current;
    if (index < 0) return;
    const tw = buildConsultationTimeWindowFromStartDate(
      consultTimeDraft,
      slot,
    );
    if (tw) patchSlot(index, { consultation_time_window: tw });
    closeConsultTimePicker();
  };

  const onConsultTimeAndroidChange = (event, selectedDate) => {
    const { index, slot } = consultTimePickerMetaRef.current;
    closeConsultTimePicker();
    if (event?.type !== "set" || !selectedDate || index < 0) return;
    const tw = buildConsultationTimeWindowFromStartDate(selectedDate, slot);
    if (tw) patchSlot(index, { consultation_time_window: tw });
  };

  const consultTimePickerOpen = consultTimePickerIdx != null;
  const consultTimeBlockHours = consultTimePickerOpen
    ? packageSlotScheduledConsultationBlockHours(
        consultTimePickerMetaRef.current.slot,
      )
    : 0;
  const consultTimeEndPreview =
    consultTimePickerOpen && consultTimeBlockHours > 0
      ? new Date(
          consultTimeDraft.getTime() +
            consultTimeBlockHours * 60 * 60 * 1000,
        ).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "";

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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={packageFeeScrollRef}
          style={{ flex: 1 }}
          onScroll={(e) => {
            packageFeeScrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          nestedScrollEnabled
          contentContainerStyle={{
            padding: S.pad,
            paddingBottom:
              insets.bottom +
              32 +
              androidKeyboardPad(keyboardInset) +
              keyboardExtraScrollPad(keyboardPad),
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
            marginBottom: 12,
            lineHeight: 20,
          }}
        >
          Enter your INR fee for each tier. For Basic and Gold, pick your usual
          scheduled consultation start time with the clock; the end time is set
          automatically (Basic 3 hours, Gold 5 hours). Premium is 24/7 in the app
          — no time window. Skip and finish later from Profile.
        </Text>
        <View
          style={{
            backgroundColor: theme.accentLight,
            borderRadius: 14,
            padding: 14,
            marginBottom: 20,
            borderLeftWidth: 4,
            borderLeftColor: theme.accent,
          }}
        >
          <Text
            style={{
              color: theme.accent,
              fontWeight: "900",
              fontSize: 13,
              marginBottom: 8,
            }}
          >
            Examples
          </Text>
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: 12,
              fontWeight: "700",
              marginBottom: 4,
              lineHeight: 18,
            }}
          >
            • Basic — {PACKAGE_CONSULT_TIME_EXAMPLES[1]}
          </Text>
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: 12,
              fontWeight: "700",
              marginBottom: 4,
              lineHeight: 18,
            }}
          >
            • Gold — {PACKAGE_CONSULT_TIME_EXAMPLES[2]}
          </Text>
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: 12,
              fontWeight: "700",
              lineHeight: 18,
            }}
          >
            • Premium — 24/7 access (no daily hours; patients see this tier as
            anytime care).
          </Text>
        </View>

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
              {slot.name || packageSlotDisplayName(slot.slot)}
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 11,
                marginBottom: 6,
              }}
            >
              Minimum ₹
              {packageSlotMinimumFeeInr(slot.slot).toLocaleString("en-IN")} · no
              maximum
            </Text>
            <Text
              style={{
                color: theme.textPrimary,
                fontSize: S.small,
                marginBottom: 10,
                lineHeight: 20,
                fontWeight: "500",
              }}
            >
              {slot.description}
            </Text>
            {Array.isArray(slot.features) && slot.features.length > 0 ? (
              <View
                style={{
                  marginBottom: 14,
                  backgroundColor: theme.accentLight,
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderLeftWidth: 3,
                  borderLeftColor: theme.accent,
                }}
              >
                <Text
                  style={{
                    color: theme.accent,
                    fontWeight: "800",
                    fontSize: 11,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Package features
                </Text>
                {slot.features.map((line, fi) => (
                  <Text
                    key={`${slot.slot}-${fi}`}
                    style={{
                      color: theme.textPrimary,
                      fontSize: 13,
                      fontWeight: "600",
                      marginBottom: 6,
                      lineHeight: 20,
                    }}
                  >
                    • {line}
                  </Text>
                ))}
              </View>
            ) : null}
            {Number(slot.slot) !== 3 &&
            PACKAGE_CONSULT_TIME_EXAMPLES[slot.slot] ? (
              <View
                style={{
                  marginBottom: 12,
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: theme.inputBg,
                  borderWidth: 1,
                  borderColor: theme.inputBorder,
                }}
              >
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontSize: 12,
                    fontWeight: "800",
                  }}
                >
                  Example for this tier
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    marginTop: 4,
                    fontWeight: "600",
                  }}
                >
                  {PACKAGE_CONSULT_TIME_EXAMPLES[slot.slot]}
                </Text>
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
              placeholder={`e.g. ${packageSlotMinimumFeeInr(slot.slot)}`}
              placeholderTextColor={theme.textTertiary}
              keyboardType="numeric"
              ref={(el) => {
                feeInputRefs.current[index] = el;
              }}
              value={String(slot.total_amount_inr ?? "")}
              onChangeText={(t) => {
                patchSlot(index, { total_amount_inr: t });
                scheduleFeeVisibleWhileTyping();
              }}
              onFocus={() => {
                activePackageFeeFieldRef.current = "fee";
                focusedFeeSlotIndexRef.current = index;
                if (Platform.OS === "android") {
                  requestAnimationFrame(() => {
                    scrollFocusedFeeAboveIme();
                    setTimeout(scrollFocusedFeeAboveIme, 140);
                  });
                }
              }}
              onBlur={() => {
                if (focusedFeeSlotIndexRef.current === index) {
                  focusedFeeSlotIndexRef.current = -1;
                }
              }}
              style={slotInput(theme)}
            />
            {Number(slot.slot) === 3 ? (
              <View
                style={{
                  marginTop: 12,
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: theme.successLight,
                  borderWidth: 1,
                  borderColor: theme.success,
                }}
              >
                <Text
                  style={{
                    color: theme.success,
                    fontWeight: "900",
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  Premium — 24/7
                </Text>
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontSize: 12,
                    lineHeight: 18,
                    fontWeight: "600",
                  }}
                >
                  You do not need to enter office hours. This tier is shown to
                  patients as round-the-clock access; your fee above is all that
                  is required here.
                </Text>
              </View>
            ) : (
              <>
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontSize: 12,
                    fontWeight: "700",
                    marginBottom: 6,
                    marginTop: 4,
                  }}
                >
                  Scheduled consultation window
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 11,
                    marginBottom: 8,
                    lineHeight: 16,
                  }}
                >
                  Pick your usual start time with the clock. The end time is set
                  for you (
                  {packageSlotScheduledConsultationBlockHours(slot.slot)} hours
                  for {packageSlotDisplayName(slot.slot)}
                  {
                    " — same length as this package's scheduled doctor time)."
                  }
                </Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: theme.inputBorder,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    backgroundColor: theme.inputBg,
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: theme.textPrimary,
                      fontWeight: "700",
                    }}
                  >
                    {String(slot.consultation_time_window || "").trim()
                      ? slot.consultation_time_window
                      : "Not set yet"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => openConsultTimePicker(index)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.accent,
                    paddingVertical: 12,
                    borderRadius: 14,
                  }}
                >
                  <Ionicons
                    name="time-outline"
                    size={20}
                    color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      color: "#fff",
                      fontWeight: "800",
                      fontSize: 14,
                    }}
                  >
                    Set start time
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}

        <TouchableOpacity
          onPress={save}
          disabled={busy || !doctorPackagesSetupComplete(slots)}
          style={{
            backgroundColor: theme.accent,
            padding: 16,
            borderRadius: 16,
            alignItems: "center",
            opacity: busy || !doctorPackagesSetupComplete(slots) ? 0.55 : 1,
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
        {Platform.OS === "android" && consultTimePickerOpen ? (
          <DateTimePicker
            value={consultTimeDraft}
            mode="time"
            display="default"
            is24Hour={false}
            onChange={onConsultTimeAndroidChange}
          />
        ) : null}
        {Platform.OS === "ios" && consultTimePickerOpen ? (
          <Modal
            transparent
            animationType="fade"
            visible
            onRequestClose={closeConsultTimePicker}
          >
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
                  padding: 16,
                  paddingBottom: 28,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <TouchableOpacity onPress={closeConsultTimePicker}>
                    <Text style={{ color: theme.warning, fontWeight: "700" }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{ color: theme.textPrimary, fontWeight: "800" }}
                  >
                    Start time
                  </Text>
                  <TouchableOpacity onPress={applyConsultTimeFromDraft}>
                    <Text style={{ color: theme.accent, fontWeight: "800" }}>
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    marginBottom: 8,
                    textAlign: "center",
                  }}
                >
                  End time: {consultTimeEndPreview || "—"}
                </Text>
                <DateTimePicker
                  value={consultTimeDraft}
                  mode="time"
                  display="spinner"
                  is24Hour={false}
                  locale="en-US"
                  onChange={(_, d) => {
                    if (d && !Number.isNaN(d.getTime())) setConsultTimeDraft(d);
                  }}
                />
              </View>
            </View>
          </Modal>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

export function MedicalRecordsScreen({
  theme,
  onBack,
  patientUserId,
  patientProfileId = null,
  patientCareMode = null,
  onShareMedicalRecordToDoctor,
  scrollContentBottomInset = 100,
}) {
  const insets = useSafeAreaInsets();
  const keyboardPad = useKeyboardBottomPad();
  const scrollRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareRecord, setShareRecord] = useState(null);
  const [shareDoctors, setShareDoctors] = useState([]);
  const [shareDoctorsLoading, setShareDoctorsLoading] = useState(false);
  const [shareSendingId, setShareSendingId] = useState(null);

  const effectiveCareMode = patientCareMode || CARE_MODE.CASUAL;

  const tabAndSafe = scrollContentBottomInset + Math.max(insets.bottom, 8);
  const keyboardScrollPad = keyboardExtraScrollPad(keyboardPad);
  const scrollBottomPad = S.pad + tabAndSafe + keyboardScrollPad;

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchMedicalRecordsForPatient(patientUserId);
    setRows(list);
    setLoading(false);
  }, [patientUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadWithPart = async (filePart) => {
    if (!patientUserId) {
      Alert.alert("Upload", "Please sign in again.");
      return;
    }
    setBusy(true);
    try {
      await uploadMedicalRecord({
        patientUserId,
        title: title.trim() || "Medical record",
        filePart,
      });
      setTitle("");
      await load();
      Alert.alert(
        "Saved",
        "Your record is stored on your profile. Use Open to view, or Send to share it in chat with a doctor.",
      );
    } catch (e) {
      Alert.alert("Upload", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const pickImageAndUpload = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission", "Photo access is needed to upload images.");
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
      await uploadWithPart(part);
    } catch (e) {
      Alert.alert("Upload", e?.message || "Failed");
    }
  };

  const pickDocumentAndUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      if (!asset?.uri) return;
      const uri = asset.uri;
      const mime =
        asset.mimeType && String(asset.mimeType).includes("/")
          ? asset.mimeType
          : "application/pdf";
      const part = {
        uri: Platform.OS === "ios" ? uri.replace("file://", "") : uri,
        name: asset.name || `record_${Date.now()}.pdf`,
        type: mime,
      };
      await uploadWithPart(part);
    } catch (e) {
      Alert.alert("Upload", e?.message || "Failed");
    }
  };

  const openRecord = async (record) => {
    const url = getMedicalRecordFileDownloadUrl(record);
    if (!url) {
      Alert.alert(
        "Cannot open",
        "No file is attached to this record, or your server uses a different field name than `file`.",
      );
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      Alert.alert("Open", e?.message || "Could not open this file.");
    }
  };

  const confirmDeleteRecord = (record) => {
    const label = String(record?.title || "this record").trim() || "this record";
    Alert.alert(
      "Delete record",
      `Remove “${label}” from your profile? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMedicalRecord(record.id);
              await load();
            } catch (e) {
              Alert.alert("Delete", e?.message || "Could not delete.");
            }
          },
        },
      ],
    );
  };

  const beginShareToDoctor = async (record) => {
    if (!onShareMedicalRecordToDoctor) {
      Alert.alert("Send to doctor", "Sharing from this screen is not available.");
      return;
    }
    setShareRecord(record);
    setShareModalVisible(true);
    setShareDoctors([]);
    setShareDoctorsLoading(true);
    try {
      const list = await listDoctorsForMedicalRecordShare({
        careMode: effectiveCareMode,
        patientAuthUserId: patientUserId,
        patientProfileId,
      });
      setShareDoctors(list);
      if (!list.length) {
        Alert.alert(
          "No doctors available",
          effectiveCareMode === CARE_MODE.PACKAGE
            ? "You need an active care package with a doctor to share from package mode."
            : "No RMP / quick-consult doctors are listed yet. Try again after doctors are approved in your system.",
        );
        setShareModalVisible(false);
        setShareRecord(null);
      }
    } catch (e) {
      Alert.alert("Doctors", e?.message || "Could not load doctor list.");
    } finally {
      setShareDoctorsLoading(false);
    }
  };

  const sendShareToDoctor = async (doctorUserId) => {
    if (!shareRecord || !onShareMedicalRecordToDoctor) return;
    setShareSendingId(doctorUserId);
    try {
      await onShareMedicalRecordToDoctor({
        record: shareRecord,
        doctorUserId,
      });
      setShareModalVisible(false);
      setShareRecord(null);
      setShareDoctors([]);
    } catch (e) {
      Alert.alert("Send", e?.message || "Could not send.");
    } finally {
      setShareSendingId(null);
    }
  };

  const shareDoctorHint =
    effectiveCareMode === CARE_MODE.PACKAGE
      ? "Only doctors linked to your active care packages appear here."
      : "Only RMP / quick-consult doctors you can message from this care mode.";

  const formatRecordDate = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return String(iso).slice(0, 10);
    }
  };

  const cardShadow = {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: S.pad,
          paddingBottom: 14,
          paddingTop: (insets.top || 0) + 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.cardBorder,
          backgroundColor: theme.bg,
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: theme.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.cardBorder,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: 20,
              fontWeight: "800",
              letterSpacing: -0.3,
            }}
          >
            Medical records
          </Text>
          <Text
            style={{
              color: theme.textTertiary,
              fontSize: 12,
              marginTop: 2,
              fontWeight: "500",
            }}
          >
            Private to your profile
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: S.pad,
          paddingBottom: scrollBottomPad,
        }}
      >
        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: 16,
            padding: 16,
            marginBottom: 20,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.cardBorder,
            ...cardShadow,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: theme.accentLight,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Ionicons name="cloud-upload-outline" size={22} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: 16,
                  fontWeight: "800",
                }}
              >
                New upload
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  marginTop: 2,
                  lineHeight: 17,
                }}
              >
                Add a title, then choose photos or a PDF. You can open, delete,
                or share with a doctor anytime.
              </Text>
            </View>
          </View>

          <Text
            style={{
              color: theme.textSecondary,
              fontSize: 12,
              fontWeight: "700",
              marginBottom: 6,
            }}
          >
            Record title
          </Text>
          <TextInput
            placeholder="e.g. Lab report — December 2025"
            placeholderTextColor={theme.textTertiary}
            value={title}
            onChangeText={setTitle}
            onFocus={() => {
              requestAnimationFrame(() =>
                scrollRef.current?.scrollTo({ y: 0, animated: true }),
              );
            }}
            style={{
              backgroundColor: theme.inputBg,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: theme.textPrimary,
              borderWidth: 1,
              borderColor: theme.inputBorder,
              fontSize: 15,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              gap: 10,
              marginTop: 14,
            }}
          >
            <TouchableOpacity
              onPress={() => void pickImageAndUpload()}
              disabled={busy}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 13,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.cardBorder,
                backgroundColor: theme.inputBg,
                opacity: busy ? 0.55 : 1,
              }}
            >
              <Ionicons name="images-outline" size={20} color={theme.accent} />
              <Text
                style={{
                  color: theme.textPrimary,
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                Photos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void pickDocumentAndUpload()}
              disabled={busy}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 13,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.cardBorder,
                backgroundColor: theme.inputBg,
                opacity: busy ? 0.55 : 1,
              }}
            >
              <Ionicons name="document-text-outline" size={20} color={theme.accent} />
              <Text
                style={{
                  color: theme.textPrimary,
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                PDF / file
              </Text>
            </TouchableOpacity>
          </View>

          {busy ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 14,
                gap: 10,
              }}
            >
              <ActivityIndicator color={theme.accent} />
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                Uploading…
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
            paddingHorizontal: 2,
          }}
        >
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: 15,
              fontWeight: "800",
              letterSpacing: -0.2,
            }}
          >
            Your library
          </Text>
          {!loading ? (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: theme.accentLight,
              }}
            >
              <Text
                style={{
                  color: theme.accent,
                  fontSize: 12,
                  fontWeight: "800",
                }}
              >
                {rows.length} {rows.length === 1 ? "file" : "files"}
              </Text>
            </View>
          ) : null}
        </View>

        {loading ? (
          <View
            style={{
              paddingVertical: 40,
              alignItems: "center",
            }}
          >
            <ActivityIndicator size="large" color={theme.accent} />
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 13,
                marginTop: 12,
              }}
            >
              Loading your records…
            </Text>
          </View>
        ) : rows.length === 0 ? (
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: 16,
              padding: 28,
              alignItems: "center",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.cardBorder,
              ...cardShadow,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: theme.accentLight,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Ionicons name="folder-open-outline" size={32} color={theme.accent} />
            </View>
            <Text
              style={{
                color: theme.textPrimary,
                fontSize: 16,
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              No files yet
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 13,
                textAlign: "center",
                marginTop: 8,
                lineHeight: 20,
                maxWidth: 280,
              }}
            >
              Upload prescriptions, lab PDFs, or photos. They stay on your
              profile until you remove them.
            </Text>
          </View>
        ) : (
          rows.map((r) => (
            <View
              key={r.id}
              style={{
                backgroundColor: theme.card,
                borderRadius: 12,
                marginBottom: 8,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.cardBorder,
                overflow: "hidden",
                ...cardShadow,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  gap: 10,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: theme.accentLight,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="document-attach-outline" size={20} color={theme.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={2}
                    style={{
                      color: theme.textPrimary,
                      fontWeight: "800",
                      fontSize: 15,
                      lineHeight: 20,
                    }}
                  >
                    {r.title || "Untitled record"}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 3,
                      gap: 4,
                    }}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={13}
                      color={theme.textTertiary}
                    />
                    <Text
                      style={{
                        color: theme.textTertiary,
                        fontSize: 11,
                        fontWeight: "600",
                      }}
                    >
                      {formatRecordDate(r.created)}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flexShrink: 0,
                    gap: 2,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => void openRecord(r)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel="View record"
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={{
                      padding: 8,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="eye-outline" size={22} color={theme.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmDeleteRecord(r)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel="Remove record"
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={{
                      padding: 8,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={22}
                      color={theme.danger || "#DC2626"}
                    />
                  </TouchableOpacity>
                  {onShareMedicalRecordToDoctor ? (
                    <TouchableOpacity
                      onPress={() => void beginShareToDoctor(r)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel="Share record with doctor"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={{
                        padding: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name="paper-plane-outline"
                        size={22}
                        color={theme.accent}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        visible={shareModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShareModalVisible(false);
          setShareRecord(null);
        }}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              setShareModalVisible(false);
              setShareRecord(null);
              setShareDoctors([]);
            }}
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: "rgba(15, 23, 42, 0.55)",
            }}
          />
          <View
            style={{
              backgroundColor: theme.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingHorizontal: S.pad,
              paddingTop: 10,
              paddingBottom: (insets.bottom || 0) + S.pad,
              maxHeight: "78%",
            }}
          >
              <View
                style={{
                  alignSelf: "center",
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: theme.cardBorder,
                  marginBottom: 16,
                }}
              />
              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: 18,
                  fontWeight: "800",
                }}
              >
                Share with a doctor
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  marginTop: 6,
                  lineHeight: 19,
                }}
              >
                {shareDoctorHint}
              </Text>
              {shareRecord ? (
                <View
                  style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: theme.inputBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.cardBorder,
                  }}
                >
                  <Text
                    style={{
                      color: theme.textTertiary,
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Selected file
                  </Text>
                  <Text
                    style={{
                      color: theme.textPrimary,
                      fontSize: 14,
                      fontWeight: "700",
                      marginTop: 4,
                    }}
                    numberOfLines={2}
                  >
                    {shareRecord.title || "Untitled"}
                  </Text>
                </View>
              ) : null}
              {shareDoctorsLoading ? (
                <View style={{ paddingVertical: 28, alignItems: "center" }}>
                  <ActivityIndicator color={theme.accent} />
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 13,
                      marginTop: 12,
                    }}
                  >
                    Finding your doctors…
                  </Text>
                </View>
              ) : (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  style={{ marginTop: 12 }}
                  showsVerticalScrollIndicator={false}
                >
                  {shareDoctors.map((d) => (
                    <TouchableOpacity
                      key={d.doctorUserId}
                      disabled={!!shareSendingId}
                      onPress={() => void sendShareToDoctor(d.doctorUserId)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 14,
                        paddingHorizontal: 4,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.cardBorder,
                      }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          backgroundColor: theme.accentLight,
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 12,
                        }}
                      >
                        <Ionicons name="person" size={22} color={theme.accent} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            color: theme.textPrimary,
                            fontWeight: "800",
                            fontSize: 15,
                          }}
                          numberOfLines={1}
                        >
                          {d.label}
                        </Text>
                        <Text
                          style={{
                            color: theme.textTertiary,
                            fontSize: 12,
                            marginTop: 3,
                          }}
                          numberOfLines={2}
                        >
                          {d.subtitle}
                        </Text>
                      </View>
                      {shareSendingId === d.doctorUserId ? (
                        <ActivityIndicator color={theme.accent} style={{ marginLeft: 8 }} />
                      ) : (
                        <Ionicons
                          name="chevron-forward"
                          size={22}
                          color={theme.textTertiary}
                          style={{ marginLeft: 4 }}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity
                onPress={() => {
                  setShareModalVisible(false);
                  setShareRecord(null);
                  setShareDoctors([]);
                }}
                style={{
                  marginTop: 8,
                  padding: 15,
                  alignItems: "center",
                  borderRadius: 14,
                  backgroundColor: theme.inputBg,
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                }}
              >
                <Text style={{ color: theme.textPrimary, fontWeight: "800", fontSize: 15 }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
      </Modal>
    </View>
  );
}

/** Premium: daily diet / meal log as medical_records with `[Diet log]` title prefix. */
export function DietMonitoringScreen({
  theme,
  onBack,
  patientUserId,
  doctorName = "",
  /** Bottom inset above tab bar (see App.js tab bar height). */
  scrollContentBottomInset = 100,
}) {
  const insets = useSafeAreaInsets();
  const keyboardPad = useKeyboardBottomPad();
  const scrollRef = useRef(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const pickAndUpload = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission", "Photo access is needed to upload a meal photo.");
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
        name: asset.fileName || `diet_${Date.now()}.jpg`,
        type: mime,
      };
      const day = new Date().toISOString().slice(0, 10);
      const note = String(description || "").trim();
      const title = `[Diet log] ${day}${note ? ` — ${note.slice(0, 80)}` : ""}`;
      setBusy(true);
      await uploadMedicalRecord({
        patientUserId,
        title,
        filePart: part,
      });
      setDescription("");
      Alert.alert(
        "Uploaded",
        doctorName
          ? `${doctorName} can review diet-tagged uploads under Medical records and in chat.`
          : "Your doctor can review diet-tagged uploads under Medical records.",
      );
      onBack?.();
    } catch (e) {
      Alert.alert("Diet log", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const tabAndSafe = scrollContentBottomInset + Math.max(insets.bottom, 8);
  const keyboardScrollPad = keyboardExtraScrollPad(keyboardPad);
  const bottomPad = S.pad + tabAndSafe + keyboardScrollPad;

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
          Diet monitoring
        </Text>
      </View>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={{
          padding: S.pad,
          paddingBottom: bottomPad,
        }}
      >
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              marginBottom: 12,
              lineHeight: 20,
            }}
          >
            Premium: upload today’s meals or diet plan as a photo. Entries are
            stored like other medical files so your package doctor can review and
            warn you in follow-up or chat.
          </Text>
          <TextInput
            placeholder="Short note (optional), e.g. Lunch — rice, dal, salad"
            placeholderTextColor={theme.textTertiary}
            value={description}
            onChangeText={setDescription}
            onFocus={() => scrollToEndAfterKeyboard(scrollRef)}
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
              opacity: busy ? 0.75 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                Upload meal / diet photo
              </Text>
            )}
          </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function QuickRecipientPickerPanel({
  theme,
  doctors,
  pharmacies = [],
  listsLoading,
  selectedDoctorUserId,
  selectedPharmacyUserId,
  onSelectDoctor,
  onSelectPharmacy,
  onClearSelection,
  /** Wound report etc.: show pharmacy block. Quick Solution / Counselling: false. */
  showPharmacySection = true,
  panelTitle = "Recipient",
  doctorSectionTitle,
  helpText,
  doctorEmptyHint,
}) {
  const [doctorOpen, setDoctorOpen] = useState(true);
  const [pharmacyOpen, setPharmacyOpen] = useState(false);

  const toggleDoctors = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDoctorOpen((o) => !o);
  };
  const togglePharmacies = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPharmacyOpen((o) => !o);
  };

  const doctorLocked = showPharmacySection && Boolean(selectedPharmacyUserId);
  const pharmacyLocked = Boolean(selectedDoctorUserId);

  const flatDoctorOnly = !showPharmacySection;

  const defaultDoctorSectionTitle = showPharmacySection
    ? "Doctors"
    : "RMP & clinic doctors";
  const doctorTitle = doctorSectionTitle ?? defaultDoctorSectionTitle;

  const defaultHelp = showPharmacySection
    ? "Pick one doctor or one pharmacy. Use Clear recipient before switching category."
    : "Quick Solution and Quick Counselling go only to RMP and clinic doctors. Package doctors and pharmacies are not available here—pick one doctor below.";

  const help = helpText ?? defaultHelp;

  const defaultDoctorEmpty = showPharmacySection
    ? "No approved doctor profiles returned yet. Check PocketBase rules or try again later."
    : "No doctors matched this filter yet. When an approved RMP or clinic doctor is available, they will appear here.";

  const emptyDoctors = doctorEmptyHint ?? defaultDoctorEmpty;

  const sectionShell = {
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.cardBorder,
    marginBottom: 12,
    overflow: "hidden",
  };

  const renderDoctorRows = () => {
    if (listsLoading) {
      return (
        <ActivityIndicator
          style={{ paddingVertical: 20 }}
          color={theme.accent}
        />
      );
    }
    if (doctors.length === 0) {
      return (
        <Text
          style={{
            padding: 14,
            color: theme.textSecondary,
            fontSize: S.small,
          }}
        >
          {emptyDoctors}
        </Text>
      );
    }
    return doctors.map((d) => {
      const id = String(d.userId || "").trim();
      const active = selectedDoctorUserId === id;
      return (
        <TouchableOpacity
          key={id || d.profileId}
          disabled={doctorLocked}
          onPress={() => onSelectDoctor(id)}
          style={{
            marginHorizontal: 10,
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: active ? theme.accent : theme.cardBorder,
            backgroundColor: active ? theme.accentLight : theme.bg,
          }}
        >
          <Text
            style={{
              color: theme.textPrimary,
              fontWeight: "800",
              fontSize: S.small,
            }}
          >
            {d.name || "Doctor"}
          </Text>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: 11,
              marginTop: 4,
            }}
          >
            {d.specialty || "General"} · {d.practitionerTier || ""}
          </Text>
        </TouchableOpacity>
      );
    });
  };

  return (
    <View style={{ marginBottom: 4 }}>
      {flatDoctorOnly ? (
        <View style={sectionShell}>
          <View
            style={{
              paddingHorizontal: 14,
              paddingTop: 14,
              paddingBottom: 10,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.cardBorder,
            }}
          >
            <Text
              style={{
                color: theme.textPrimary,
                fontWeight: "800",
                fontSize: S.body,
              }}
            >
              {panelTitle}
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: S.small,
                marginTop: 6,
                lineHeight: 18,
              }}
            >
              {help}
            </Text>
            {!listsLoading ? (
              <Text
                style={{ color: theme.textTertiary, fontSize: 11, marginTop: 8 }}
              >
                {`${doctors.length} available`}
              </Text>
            ) : null}
          </View>
          <View style={{ paddingBottom: 8 }}>{renderDoctorRows()}</View>
        </View>
      ) : (
        <>
          <Text
            style={{
              color: theme.textPrimary,
              fontWeight: "800",
              marginBottom: 6,
              fontSize: S.body,
            }}
          >
            {panelTitle}
          </Text>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: S.small,
              marginBottom: 12,
              lineHeight: 18,
            }}
          >
            {help}
          </Text>

          <View style={sectionShell}>
            <TouchableOpacity
              onPress={toggleDoctors}
              activeOpacity={0.85}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 14,
                backgroundColor: doctorLocked
                  ? theme.bgSolid || theme.bg
                  : theme.card,
                opacity: doctorLocked ? 0.55 : 1,
              }}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontWeight: "800",
                    fontSize: S.body,
                  }}
                >
                  {doctorTitle}
                </Text>
                <Text
                  style={{ color: theme.textTertiary, fontSize: 11, marginTop: 4 }}
                >
                  {listsLoading
                    ? "Loading…"
                    : `${doctors.length} doctor${doctors.length === 1 ? "" : "s"}`}
                </Text>
              </View>
              <Ionicons
                name={doctorOpen ? "chevron-up" : "chevron-down"}
                size={22}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
            {doctorOpen ? (
              <View
                style={{
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.cardBorder,
                  paddingBottom: 8,
                }}
              >
                {renderDoctorRows()}
              </View>
            ) : null}
          </View>
        </>
      )}

      {showPharmacySection ? (
        <View style={sectionShell}>
          <TouchableOpacity
            onPress={togglePharmacies}
            activeOpacity={0.85}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 14,
              backgroundColor: pharmacyLocked
                ? theme.bgSolid || theme.bg
                : theme.card,
              opacity: pharmacyLocked ? 0.55 : 1,
            }}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text
                style={{
                  color: theme.textPrimary,
                  fontWeight: "800",
                  fontSize: S.body,
                }}
              >
                Pharmacies
              </Text>
              <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 4 }}>
                {listsLoading
                  ? "Loading…"
                  : `${pharmacies.length} pharmacy profile${pharmacies.length === 1 ? "" : "s"}`}
              </Text>
            </View>
            <Ionicons
              name={pharmacyOpen ? "chevron-up" : "chevron-down"}
              size={22}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
          {pharmacyOpen ? (
            <View
              style={{
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.cardBorder,
                paddingBottom: 8,
              }}
            >
              {listsLoading ? (
                <ActivityIndicator
                  style={{ paddingVertical: 20 }}
                  color={theme.accent}
                />
              ) : pharmacies.length === 0 ? (
                <Text
                  style={{
                    padding: 14,
                    color: theme.textSecondary,
                    fontSize: S.small,
                  }}
                >
                  No pharmacy profiles found yet.
                </Text>
              ) : (
                pharmacies.map((p) => {
                  const id = String(p.userId || "").trim();
                  const active = selectedPharmacyUserId === id;
                  return (
                    <TouchableOpacity
                      key={id || p.profileId}
                      disabled={pharmacyLocked}
                      onPress={() => onSelectPharmacy(id)}
                      style={{
                        marginHorizontal: 10,
                        marginTop: 8,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: active ? theme.accent : theme.cardBorder,
                        backgroundColor: active ? theme.accentLight : theme.bg,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.textPrimary,
                          fontWeight: "800",
                          fontSize: S.small,
                        }}
                      >
                        {p.name || "Pharmacy"}
                      </Text>
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontSize: 11,
                          marginTop: 4,
                        }}
                      >
                        {[p.district, p.state].filter(Boolean).join(", ") ||
                          p.address ||
                          ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {selectedDoctorUserId || selectedPharmacyUserId ? (
        <TouchableOpacity
          onPress={onClearSelection}
          style={{ alignSelf: "flex-start", marginTop: 4, paddingVertical: 8 }}
        >
          <Text style={{ color: theme.accent, fontWeight: "800" }}>
            Clear recipient
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function QuickSolutionScreen({
  theme,
  onBack,
  patientUserId,
  /** Optional package binding (consult minutes hint only). */
  quickCareBinding = null,
  consultMinutesUsed = 0,
  consultMinutesLimit = 0,
  /** async (question: string) => reply text */
  onAskAi,
  scrollContentBottomInset = 100,
}) {
  const insets = useSafeAreaInsets();
  const keyboardPad = useKeyboardBottomPad();
  const scrollRef = useRef(null);
  const [notes, setNotes] = useState("");
  const [privateMode, setPrivateMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [imagePart, setImagePart] = useState(null);

  const ent = useMemo(
    () =>
      quickCareBinding?.consumerPlan != null
        ? entitlementsForConsumerPlan(quickCareBinding.consumerPlan)
        : null,
    [quickCareBinding?.consumerPlan],
  );

  const runAi = async () => {
    const q = String(aiQuestion || "").trim();
    if (!q) {
      Alert.alert("AI", "Type a question first.");
      return;
    }
    if (!onAskAi) {
      Alert.alert("AI", "Assistant is not configured on this build.");
      return;
    }
    const limit = ent?.aiChatDailyLimit;
    if (typeof limit === "number" && limit > 0) {
      try {
        const used = await getAiAssistantUsageToday(patientUserId);
        if (used >= limit) {
          Alert.alert(
            "Daily limit",
            "You have reached today's AI message limit for your plan.",
          );
          return;
        }
      } catch {
        /* ignore */
      }
    }
    setAiBusy(true);
    try {
      const reply = await onAskAi(q);
      const text = String(reply || "").trim();
      setAiReply(text || "(empty reply)");
      if (typeof limit === "number" && limit > 0) {
        try {
          await incrementAiAssistantUsageToday(patientUserId);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      setAiReply(e?.message || "Could not get AI answer.");
    } finally {
      setAiBusy(false);
    }
  };

  const pickOptionalImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission", "Photo access is needed to attach an image.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const uri = asset.uri;
      const nameGuess = uri.split("/").pop() || "upload.jpg";
      const lower = nameGuess.toLowerCase();
      const mime = lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
      setImagePart({ uri, name: nameGuess, type: mime });
    } catch (e) {
      Alert.alert("Image", e?.message || "Could not pick a photo.");
    }
  };

  const submit = async () => {
    const body = String(notes || "").trim();
    if (!body && !imagePart?.uri) {
      Alert.alert("Details", "Add a short description or attach a photo.");
      return;
    }
    try {
      setBusy(true);
      const route = await pickRandomQuickCareRecipient(patientUserId);
      await createQuickSolutionRequest({
        patientUserId,
        notes,
        privateMode,
        imagePart,
        targetDoctorUserId:
          route.kind === "doctor" ? route.userId : undefined,
        targetPharmacyUserId:
          route.kind === "pharmacy" ? route.userId : undefined,
      });
      Alert.alert(
        "Submitted",
        privateMode
          ? "Private mode is on: your name, photo, and contact details are hidden from the provider side."
          : "Your request was sent. 10 coins are charged only when the provider responds/prescribes.",
      );
      onBack?.();
    } catch (e) {
      Alert.alert("Quick Solution", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const tabAndSafe = scrollContentBottomInset + Math.max(insets.bottom, 8);
  const keyboardScrollPad = keyboardExtraScrollPad(keyboardPad);
  const scrollBottomPad = S.pad + tabAndSafe + keyboardScrollPad;

  const consultHint =
    ent && consultMinutesLimit > 0 && quickCareBinding?.doctorUserId
      ? `Consultation time this week with ${quickCareBinding.doctor || "your doctor"}: about ${consultMinutesUsed} / ${consultMinutesLimit} minutes used (scheduled sessions).`
      : "";

  const hasBody = Boolean(String(notes || "").trim() || imagePart?.uri);
  const canSubmit = hasBody && !busy;

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
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={{
          padding: S.pad,
          paddingBottom: scrollBottomPad,
        }}
      >
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: S.small,
            marginBottom: 12,
            lineHeight: 18,
          }}
        >
          Add details and an optional photo, then send. The app picks
          a random RMP doctor (non–package setup) or pharmacy to receive your
          request — coins are charged only after a provider responds.
        </Text>

        {consultHint ? (
          <Text
            style={{
              color: theme.textTertiary,
              marginBottom: 12,
              fontSize: 11,
              lineHeight: 16,
            }}
          >
            {consultHint}
          </Text>
        ) : null}

        <Text
          style={{
            color: theme.textPrimary,
            fontWeight: "800",
            marginBottom: 8,
            fontSize: S.body,
          }}
        >
          Doctor / clinic review (10 coins)
        </Text>
        <Text
          style={{
            color: theme.textSecondary,
            marginBottom: 12,
            fontSize: S.small,
          }}
        >
          ₹10 (10 coins) per snap or query — charged on provider response;
          platform 5 coins, provider 5 coins.
        </Text>
        <TouchableOpacity
          onPress={() => setPrivateMode((v) => !v)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: privateMode ? theme.accentLight : theme.card,
            padding: 14,
            borderRadius: 14,
            marginBottom: 8,
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
          onFocus={() => scrollToEndAfterKeyboard(scrollRef)}
          style={{
            minHeight: 72,
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
          onPress={pickOptionalImage}
          style={{
            marginTop: 10,
            padding: 14,
            borderRadius: 14,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.cardBorder,
            backgroundColor: theme.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: theme.textPrimary, fontWeight: "700" }}>
            {imagePart?.uri ? "Change attached photo" : "Attach photo (optional)"}
          </Text>
          <Ionicons name="image-outline" size={22} color={theme.accent} />
        </TouchableOpacity>
        {imagePart?.uri ? (
          <Text
            style={{
              marginTop: 6,
              fontSize: 11,
              color: theme.textTertiary,
            }}
            numberOfLines={2}
          >
            {imagePart.name || "Image selected"}
          </Text>
        ) : null}
        <TouchableOpacity
          onPress={submit}
          disabled={!canSubmit}
          style={{
            marginTop: 12,
            backgroundColor: theme.success || "#059669",
            padding: 16,
            borderRadius: 16,
            alignItems: "center",
            opacity: canSubmit ? 1 : 0.45,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              Submit request
            </Text>
          )}
        </TouchableOpacity>

        <Text
          style={{
            color: theme.textPrimary,
            fontWeight: "800",
            marginBottom: 8,
            marginTop: 28,
            fontSize: S.body,
          }}
        >
          Instant AI guidance
        </Text>
        <Text
          style={{
            color: theme.textSecondary,
            marginBottom: 10,
            fontSize: S.small,
          }}
        >
          AI-assisted answers for common concerns. This does not replace your
          doctor; urgent issues need emergency care.
        </Text>
        <TextInput
          placeholder="Ask anything (symptoms, medicines, lifestyle)…"
          placeholderTextColor={theme.textTertiary}
          multiline
          value={aiQuestion}
          onChangeText={setAiQuestion}
          onFocus={() => {
            if (Platform.OS === "ios") {
              requestAnimationFrame(() =>
                scrollRef.current?.scrollTo({ y: 0, animated: true }),
              );
            }
          }}
          style={{
            minHeight: 100,
            backgroundColor: theme.card,
            borderRadius: 14,
            padding: 14,
            color: theme.textPrimary,
            borderWidth: 1,
            borderColor: theme.cardBorder,
            textAlignVertical: "top",
            marginBottom: 10,
          }}
        />
        <TouchableOpacity
          onPress={runAi}
          disabled={aiBusy}
          style={{
            backgroundColor: theme.accent,
            padding: 14,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          {aiBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              Get AI answer
            </Text>
          )}
        </TouchableOpacity>
        {aiReply ? (
          <View
            style={{
              backgroundColor: theme.card,
              padding: 14,
              borderRadius: 14,
              marginBottom: 20,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.cardBorder,
            }}
          >
            <Text
              style={{
                color: theme.textTertiary,
                fontSize: 11,
                fontWeight: "700",
                marginBottom: 6,
              }}
            >
              AI REPLY
            </Text>
            <Text style={{ color: theme.textPrimary, lineHeight: 22 }}>
              {aiReply}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function QuickCounsellingScreen({
  theme,
  onBack,
  patientUserId,
  quickCareBinding = null,
  consultMinutesUsed = 0,
  consultMinutesLimit = 0,
  scrollContentBottomInset = 100,
}) {
  const insets = useSafeAreaInsets();
  const keyboardPad = useKeyboardBottomPad();
  const scrollRef = useRef(null);
  const tabAndSafe = scrollContentBottomInset + Math.max(insets.bottom, 8);
  const keyboardScrollPad = keyboardExtraScrollPad(keyboardPad);
  const scrollBottomPad = S.pad + tabAndSafe + keyboardScrollPad;
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!String(topic || "").trim()) {
      Alert.alert(
        "Description",
        "Please describe what you would like to discuss.",
      );
      return;
    }
    try {
      setBusy(true);
      const route = await pickRandomQuickCareRecipient(patientUserId);
      await createQuickCounsellingRequest({
        patientUserId,
        topic,
        targetDoctorUserId:
          route.kind === "doctor" ? route.userId : undefined,
        targetPharmacyUserId:
          route.kind === "pharmacy" ? route.userId : undefined,
      });
      Alert.alert(
        "Queued",
        "Quick Counselling queued. 25 coins are charged only when the provider responds/prescribes. Platform 10, provider 15.",
      );
      onBack?.();
    } catch (e) {
      Alert.alert("Counselling", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const hasTopic = Boolean(String(topic || "").trim());
  const canSubmit = hasTopic && !busy;

  const ent = useMemo(
    () =>
      quickCareBinding?.consumerPlan != null
        ? entitlementsForConsumerPlan(quickCareBinding.consumerPlan)
        : null,
    [quickCareBinding?.consumerPlan],
  );
  const consultHint =
    ent && consultMinutesLimit > 0 && quickCareBinding?.doctorUserId
      ? `Consultation time this week with ${quickCareBinding.doctor || "your doctor"}: about ${consultMinutesUsed} / ${consultMinutesLimit} minutes used (scheduled sessions).`
      : "";

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
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={{
          padding: S.pad,
          paddingBottom: scrollBottomPad,
        }}
      >
        <Text
          style={{
            color: theme.textSecondary,
            marginBottom: 12,
            fontSize: S.small,
            lineHeight: 18,
          }}
        >
          Text-only request. The app assigns a random RMP doctor (non–package
          setup) or pharmacy — coins are charged only after a provider responds.
        </Text>

        {consultHint ? (
          <Text
            style={{
              color: theme.textTertiary,
              marginBottom: 12,
              fontSize: 11,
              lineHeight: 16,
            }}
          >
            {consultHint}
          </Text>
        ) : null}

        <TextInput
          placeholder="What would you like to talk about?"
          placeholderTextColor={theme.textTertiary}
          value={topic}
          onChangeText={setTopic}
          multiline
          textAlignVertical="top"
          onFocus={() => scrollToEndAfterKeyboard(scrollRef)}
          style={{
            minHeight: 120,
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
          disabled={!canSubmit}
          style={{
            marginTop: 20,
            backgroundColor: theme.success,
            padding: 16,
            borderRadius: 16,
            alignItems: "center",
            opacity: canSubmit ? 1 : 0.45,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              Start request
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
  const currencyInfo = getUserCurrencyInfo();
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
        "Payment recorded and a chat with this doctor is now open in the Chat tab. Open the Chat tab or tap Chat on the appointment card to continue.",
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
        doctor: doctorName(meeting.doctor_user_id),
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
          style={{
            color: theme.textTertiary,
            marginTop: sectionTitle ? 8 : 0,
            fontSize: 13,
            lineHeight: 20,
            fontWeight: "500",
          }}
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
              : `Doctor suggested ${String(x.package_request_label || linkedOffer.title || "a package").trim()}. Payment: ${formatCurrencyFromInr(linkedOffer.amount_inr ?? 0, currencyInfo)}.`;
          const doctorDisplayName = doctorName(x.doctor_user_id);
          const doctorInitial = String(doctorDisplayName || "?")
            .trim()
            .charAt(0)
            .toUpperCase();
          const payAmountLabel = formatCurrencyFromInr(
            linkedOffer?.amount_inr ?? x.consultation_fee ?? x.fee ?? 500,
            currencyInfo,
          );
          const meetingCardShadow =
            Platform.OS === "ios"
              ? {
                  shadowColor: "#0f172a",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 6,
                }
              : { elevation: 2 };
          return (
            <View
              key={x.id}
              style={{
                marginTop: 8,
                padding: 12,
                paddingBottom: 12,
                borderRadius: 14,
                backgroundColor: theme.card,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.cardBorder,
                ...meetingCardShadow,
              }}
            >
              {x.localOnly ? (
                <View
                  style={{
                    backgroundColor: (theme.warning || "#f59e0b") + "18",
                    borderRadius: 10,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    marginBottom: 10,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.warning || "#f59e0b",
                  }}
                >
                  <Text
                    style={{
                      color: theme.warning,
                      fontSize: 11,
                      fontWeight: "700",
                      lineHeight: 15,
                    }}
                  >
                    On this device only - could not save to PocketBase
                    `appointments`.
                  </Text>
                </View>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: theme.accentLight,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Text
                    style={{
                      color: theme.accent,
                      fontWeight: "800",
                      fontSize: 17,
                      letterSpacing: -0.5,
                    }}
                  >
                    {doctorInitial}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontWeight: "800",
                        fontSize: 16,
                        letterSpacing: -0.2,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {doctorDisplayName}
                    </Text>
                    <View
                      style={{
                        backgroundColor: badgeBg,
                        paddingHorizontal: 9,
                        paddingVertical: 3,
                        borderRadius: 999,
                        flexShrink: 0,
                      }}
                    >
                      <Text
                        style={{
                          color: badgeFg,
                          fontWeight: "800",
                          fontSize: 10,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                        }}
                      >
                        {badgeText}
                      </Text>
                    </View>
                  </View>
                  {meetingTimeIso ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginTop: 5,
                        gap: 6,
                      }}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={14}
                        color={theme.textTertiary}
                      />
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {meetingDateLabel} · {meetingTimeLabel}
                      </Text>
                      <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                        ·
                      </Text>
                      <Ionicons
                        name={
                          x.call_kind === "chat"
                            ? "chatbubbles-outline"
                            : "videocam-outline"
                        }
                        size={14}
                        color={theme.textTertiary}
                      />
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {methodLabel}
                      </Text>
                    </View>
                  ) : null}
                  {x.description ? (
                    <Text
                      numberOfLines={3}
                      style={{
                        color: theme.textPrimary,
                        fontSize: 13,
                        lineHeight: 18,
                        marginTop: 8,
                        fontWeight: "500",
                      }}
                    >
                      <Text style={{ color: theme.textTertiary, fontWeight: "700" }}>
                        Reason{" "}
                      </Text>
                      {x.description}
                    </Text>
                  ) : null}
                  {isConfirmed && !isPaid ? (
                    <Text
                      numberOfLines={4}
                      style={{
                        color: theme.textTertiary,
                        fontSize: 12,
                        lineHeight: 17,
                        marginTop: 6,
                        fontWeight: "500",
                      }}
                    >
                      {packageLine}
                    </Text>
                  ) : null}
                  {showRescheduleUI ? (
                    <View style={{ marginTop: 10 }}>
                      <Text
                        style={{
                          color: theme.textPrimary,
                          fontWeight: "800",
                          marginBottom: 8,
                          fontSize: 13,
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
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 10,
                              marginBottom: 6,
                              borderWidth: StyleSheet.hairlineWidth,
                              borderColor: selected
                                ? theme.accent
                                : theme.cardBorder,
                              backgroundColor: selected
                                ? theme.accentLight
                                : theme.inputBg || theme.bg,
                            }}
                          >
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontWeight: "700",
                                fontSize: 13,
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
                          paddingVertical: 11,
                          paddingHorizontal: 14,
                          borderRadius: 12,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                          Send chosen time to doctor
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginTop: 10,
                      gap: 8,
                    }}
                  >
                    {isConfirmed && !isPaid ? (
                      <TouchableOpacity
                        onPress={() => {
                          if (linkedOffer) payOffer(linkedOffer);
                          else payAppointment(x);
                        }}
                        disabled={busy || !payEnabled}
                        accessibilityRole="button"
                        accessibilityLabel={`Pay ${payAmountLabel}`}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          backgroundColor: theme.success,
                          paddingHorizontal: 14,
                          paddingVertical: 9,
                          borderRadius: 999,
                          opacity: busy || !payEnabled ? 0.45 : 1,
                        }}
                      >
                        <Ionicons name="wallet-outline" size={17} color="#fff" />
                        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                          Pay {payAmountLabel}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {showGoToChat ? (
                      <TouchableOpacity
                        onPress={() => goToChatWithMeetingDoctor(x)}
                        accessibilityRole="button"
                        accessibilityLabel="Open chat with doctor"
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          backgroundColor: theme.accent,
                          paddingHorizontal: 14,
                          paddingVertical: 9,
                          borderRadius: 999,
                        }}
                      >
                        <Ionicons
                          name="chatbubble-ellipses-outline"
                          size={17}
                          color="#fff"
                        />
                        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                          Chat
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
                        accessibilityRole="button"
                        accessibilityLabel="Cancel meeting request"
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          borderRadius: 999,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: theme.cardBorder,
                          backgroundColor: theme.inputBg || theme.bg,
                        }}
                      >
                        <Text
                          style={{
                            color: theme.danger || "#b91c1c",
                            fontWeight: "800",
                            fontSize: 13,
                          }}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
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
                marginTop: 18,
                fontWeight: "800",
                color: theme.textPrimary,
                fontSize: 15,
                letterSpacing: -0.2,
              }}
            >
              Other package offers
            </Text>
            {orphans.map((o) => {
              const isPaid = ["paid", "active", "started"].includes(
                String(o.status || "").toLowerCase(),
              );
              const orphanPay = formatCurrencyFromInr(
                o.amount_inr ?? 0,
                currencyInfo,
              );
              return (
                <View
                  key={o.id}
                  style={{
                    marginTop: 8,
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: theme.card,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.cardBorder,
                    ...(Platform.OS === "ios"
                      ? {
                          shadowColor: "#0f172a",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.06,
                          shadowRadius: 6,
                        }
                      : { elevation: 2 }),
                  }}
                >
                  <Text
                    style={{
                      color: theme.textPrimary,
                      fontWeight: "800",
                      fontSize: 16,
                      letterSpacing: -0.2,
                    }}
                  >
                    {o.title || "Package"}
                  </Text>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 12,
                      marginTop: 4,
                      lineHeight: 17,
                      fontWeight: "600",
                    }}
                  >
                    Service fee {orphanPay} ·{" "}
                    {isPaid ? "Paid" : "Awaiting payment"}
                  </Text>
                  {!isPaid ? (
                    <TouchableOpacity
                      onPress={() => payOffer(o)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`Pay ${orphanPay}`}
                      style={{
                        marginTop: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        backgroundColor: theme.success,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 999,
                        alignSelf: "flex-start",
                        opacity: busy ? 0.45 : 1,
                      }}
                    >
                      <Ionicons name="wallet-outline" size={17} color="#fff" />
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                        Pay {orphanPay}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() =>
                        onOpenChatWithDoctor?.(offerDoctorUserId(o), null, o)
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Open chat with doctor"
                      style={{
                        marginTop: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        backgroundColor: theme.accent,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 999,
                        alignSelf: "flex-start",
                      }}
                    >
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={17}
                        color="#fff"
                      />
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                        Chat
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
  const currencyInfo = getUserCurrencyInfo();
  const [search, setSearch] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [meetingDateTime, setMeetingDateTime] = useState(null);
  const [pickerMode, setPickerMode] = useState(null);
  const [meetingDesc, setMeetingDesc] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [packageDetailSlot, setPackageDetailSlot] = useState(null);

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
            <Text
              style={{
                color: theme.textTertiary,
                fontSize: 11,
                marginBottom: 8,
              }}
            >
              Tap a package to see what is included, then pay when you are ready.
            </Text>
            {(selectedDoctor.packageSlots || []).map((slot) => {
              const amount = resolvePackageSlotAmountInr(slot);
              const selected = selectedSlot?.slot === slot.slot;
              const usesDefault = packageSlotUsesDefaultAmount(slot);
              return (
                <TouchableOpacity
                  key={slot.slot}
                  onPress={() => {
                    setSelectedSlot(slot);
                    setPackageDetailSlot(Number(slot.slot) || 1);
                  }}
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
                    {slot.name || packageSlotDisplayName(slot.slot)}
                  </Text>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: S.small,
                      marginTop: 4,
                    }}
                  >
                    Pay {formatCurrencyFromInr(amount, currencyInfo)}
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

      <Modal
        animationType="fade"
        transparent
        visible={packageDetailSlot != null}
        onRequestClose={() => setPackageDetailSlot(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setPackageDetailSlot(null)}
          />
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: 18,
              padding: 16,
              maxHeight: "88%",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.cardBorder,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  paddingRight: 8,
                  color: theme.textPrimary,
                  fontSize: S.title,
                  fontWeight: "900",
                }}
              >
                {packageDetailSlot != null
                  ? getFixedPackageDefinitionForSlot(packageDetailSlot).name
                  : ""}
              </Text>
              <TouchableOpacity
                onPress={() => setPackageDetailSlot(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close package details"
              >
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={theme.textTertiary}
                />
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {packageDetailSlot != null ? (
                <>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: S.small,
                      lineHeight: 22,
                      marginBottom: 12,
                    }}
                  >
                    {
                      getFixedPackageDefinitionForSlot(packageDetailSlot)
                        .description
                    }
                  </Text>
                  {(
                    getFixedPackageDefinitionForSlot(packageDetailSlot)
                      .features || []
                  ).map((line, i) => (
                    <Text
                      key={i}
                      style={{
                        color: theme.textPrimary,
                        fontSize: S.body,
                        marginBottom: 8,
                        lineHeight: 22,
                      }}
                    >
                      • {line}
                    </Text>
                  ))}
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    const minFee = packageSlotMinimumFeeInr(slotNum);
    const draftAmt = Number(
      String(draftSlot.total_amount_inr || "")
        .replace(/,/g, "")
        .trim() || 0,
    );
    if (!Number.isFinite(draftAmt) || draftAmt < minFee) {
      Alert.alert(
        "Minimum fee",
        `${packageSlotDisplayName(slotNum)} requires at least ₹${minFee.toLocaleString("en-IN")} (no maximum).`,
      );
      return;
    }
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
        Pick Basic, Gold, or Premium (fees from your profile). The patient gets the
        breakdown and Pay now. Company receives payment first; your share is
        credited as coins after service delivery.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {[0, 1, 2].map((i) => {
          const s = catalogSlots[i];
          const label = s?.name || packageSlotDisplayName(i + 1);
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
                Your service fee (INR) · minimum ₹
                {packageSlotMinimumFeeInr(
                  Number(draftSlot?.slot) || 1,
                ).toLocaleString("en-IN")}
              </Text>
              <TextInput
                keyboardType="numeric"
                value={String(draftSlot?.total_amount_inr ?? "")}
                onChangeText={(t) =>
                  setDraftSlot((d) => ({ ...d, total_amount_inr: t }))
                }
                style={slotInput(theme)}
                placeholder={`e.g. ${packageSlotMinimumFeeInr(Number(draftSlot?.slot) || 1)}`}
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
  const [openTracks, setOpenTracks] = useState({
    pending: true,
    discussing: false,
    confirmedDemo: false,
    closed: false,
  });

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
            Local-only (not synced to server).
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
                Waiting for patient.
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
              Confirmed · reminder 30 min before.
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const toggleTrackSection = (key) => {
    setOpenTracks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderTrackSection = (sectionKey, title, list, readOnly) => {
    const expanded = !!openTracks[sectionKey];
    const count = list.length;
    const isFirst = sectionKey === "pending";
    return (
      <View
        key={sectionKey}
        style={{
          borderTopWidth: isFirst ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: theme.cardBorder,
          paddingTop: isFirst ? 0 : 10,
          marginTop: isFirst ? 0 : 10,
        }}
      >
        <TouchableOpacity
          onPress={() => toggleTrackSection(sectionKey)}
          activeOpacity={0.75}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 4,
          }}
        >
          <Ionicons
            name={expanded ? "chevron-down" : "chevron-forward"}
            size={18}
            color={theme.textSecondary}
            style={{ marginRight: 8 }}
          />
          <Text
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            {title}
          </Text>
          <View
            style={{
              minWidth: 28,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 10,
              backgroundColor: theme.bg,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "800",
                color: theme.textSecondary,
              }}
            >
              {count}
            </Text>
          </View>
        </TouchableOpacity>
        {expanded ? (
          count === 0 ? (
            <Text
              style={{
                color: theme.textTertiary,
                fontSize: S.small,
                paddingVertical: 8,
                paddingLeft: 26,
              }}
            >
              None
            </Text>
          ) : (
            <ScrollView
              nestedScrollEnabled
              style={{ maxHeight: 320, marginTop: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {list.map((x) => renderMeetingCard(x, { readOnly }))}
            </ScrollView>
          )
        ) : null}
      </View>
    );
  };

  return (
    <View
      style={{
        marginBottom: 16,
        backgroundColor: theme.card,
        borderRadius: 16,
        padding: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.cardBorder,
        shadowColor: theme.shadowColor,
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: rows.length === 0 ? 10 : 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: theme.accentLight,
              justifyContent: "center",
              alignItems: "center",
              marginRight: 10,
            }}
          >
            <Ionicons name="calendar" size={22} color={theme.accent} />
          </View>
          <Text
            style={{
              fontSize: S.title,
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            Booking Tracks
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => void onRefresh()}
          disabled={refreshing}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.accentLight,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons
            name="refresh"
            size={22}
            color={theme.accent}
            style={{ opacity: refreshing ? 0.45 : 1 }}
          />
        </TouchableOpacity>
      </View>
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
          <Text
            style={{
              color: theme.textTertiary,
              fontSize: S.small,
              textAlign: "center",
              paddingVertical: 6,
            }}
          >
            No package meetings yet.
          </Text>
        ) : (
          <>
            {renderTrackSection("pending", "Pending", pending, false)}
            {renderTrackSection("discussing", "Discussing", discussing, false)}
            {renderTrackSection(
              "confirmedDemo",
              "Confirmed demo",
              confirmedDemo,
              false,
            )}
            {renderTrackSection("closed", "Declined & cancelled", closed, true)}
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
  return resolveListingDisplayName(u, u.expand?.user) || "Patient";
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

/** Fingerprint queued rows by id/status/updated only — avoids silent refresh loops when hydrate() fills `expand` without the queue actually changing. */
function buildQueueIdentitySnapshot(sol, cou) {
  const solPart = (sol || [])
    .map((r) => {
      const st = String(r?.status || "queued").toLowerCase();
      const ver = String(r?.updated || r?.created || "");
      return `s:${r?.id}:${st}:${ver}`;
    })
    .sort()
    .join("|");
  const couPart = (cou || [])
    .map((r) => {
      const st = String(r?.status || "queued").toLowerCase();
      const ver = String(r?.updated || r?.created || "");
      return `c:${r?.id}:${st}:${ver}`;
    })
    .sort()
    .join("|");
  return `${solPart}~${couPart}`;
}

/** Survives ScrollView remounts so queue cards do not flash empty while a background fetch runs. */
const quickQueuePanelCache = new Map();

/**
 * Primary action per card: **Prescribe** until PocketBase `status` is no longer
 * `queued`, then **Open chat** (opens the direct thread by patient id).
 *
 *   onPrescribeQuickRequest({ kind, record })
 *
 * `onOpenHelpChat(conversationId, patientUserId)` — pass empty conversationId to
 * resolve by patient user id when only the peer is known.
 *
 * `combined` — single “Quick Queues” card (default).
 * `split_tracks` — two dashboard cards: Quick Solution Tracks + Quick Counselling Tracks.
 */
export function DoctorQuickRequestsPanel({
  theme,
  doctorUserId,
  onOpenHelpChat,
  onPrescribeQuickRequest,
  /** When true, hide the manual Refresh control and keep lists fresh via poll + PocketBase realtime. */
  autoRefreshQuickQueues = false,
  /**
   * `combined` — single “Quick Queues” card (default).
   * `split_tracks` — two dashboard cards: Quick Solution Tracks + Quick Counselling Tracks.
   */
  layout = "combined",
}) {
  const user = getAuthUser();
  const effectiveDoctorId = doctorUserId || user?.id || "";
  const cacheSeed = effectiveDoctorId
    ? quickQueuePanelCache.get(effectiveDoctorId)
    : null;
  const [solutionRows, setSolutionRows] = useState(() => cacheSeed?.sol || []);
  const [counsellingRows, setCounsellingRows] = useState(() => cacheSeed?.cou || []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(() => cacheSeed?.err || "");
  const lastQueueSnapshotRef = useRef(cacheSeed?.snapshot || "");
  const bumpTimerRef = useRef(null);
  const loadGenerationRef = useRef(0);
  const [expandedQueueKeys, setExpandedQueueKeys] = useState({});

  const load = useCallback(async (opts = {}) => {
    const silent = !!opts.silent;
    if (!effectiveDoctorId) return;
    const myGeneration = ++loadGenerationRef.current;
    if (!silent) {
      setErr("");
      setLoading(true);
    }
    try {
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
      try {
        sol = await hydrateRowsPatientAuthUsers(sol || []);
      } catch (e) {
        console.log("hydrateRowsPatientAuthUsers (solution) skipped:", e?.message);
      }
      try {
        cou = await hydrateRowsPatientAuthUsers(cou || []);
      } catch (e) {
        console.log("hydrateRowsPatientAuthUsers (counselling) skipped:", e?.message);
      }

      if (myGeneration !== loadGenerationRef.current) {
        return;
      }

      const queueSnapshot = buildQueueIdentitySnapshot(sol, cou);
      const errText = parts.length ? parts.join("\n") : "";

      if (queueSnapshot === lastQueueSnapshotRef.current) {
        if (errText) setErr(errText);
        return;
      }
      lastQueueSnapshotRef.current = queueSnapshot;

      if (myGeneration !== loadGenerationRef.current) {
        return;
      }

      quickQueuePanelCache.set(effectiveDoctorId, {
        sol: sol || [],
        cou: cou || [],
        snapshot: queueSnapshot,
        err: errText,
      });

      setSolutionRows(sol || []);
      setCounsellingRows(cou || []);
      setErr(errText);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [effectiveDoctorId]);

  useEffect(() => {
    if (!effectiveDoctorId) return;
    const hasCache = quickQueuePanelCache.has(effectiveDoctorId);
    void load({ silent: autoRefreshQuickQueues || hasCache });
  }, [effectiveDoctorId, load, autoRefreshQuickQueues]);

  useEffect(() => {
    if (!effectiveDoctorId) return;
    const cached = quickQueuePanelCache.get(effectiveDoctorId);
    if (!cached || cached.snapshot === lastQueueSnapshotRef.current) return;
    lastQueueSnapshotRef.current = cached.snapshot;
    setSolutionRows(cached.sol || []);
    setCounsellingRows(cached.cou || []);
    setErr(cached.err || "");
  }, [effectiveDoctorId]);

  useEffect(() => {
    if (!autoRefreshQuickQueues) return undefined;
    let cancelled = false;
    const debounceMs = 1400;
    const scheduleSilentReload = () => {
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
      bumpTimerRef.current = setTimeout(() => {
        bumpTimerRef.current = null;
        if (!cancelled) void load({ silent: true });
      }, debounceMs);
    };
    (async () => {
      try {
        await pb.collection("quick_solution_requests").subscribe("*", scheduleSilentReload);
        await pb.collection("quick_counselling_requests").subscribe("*", scheduleSilentReload);
      } catch (e) {
        console.log("quick queue subscribe skipped:", e?.message);
      }
    })();
    const slowPoll = setInterval(() => {
      if (!cancelled) void load({ silent: true });
    }, 60000);
    return () => {
      cancelled = true;
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
      bumpTimerRef.current = null;
      clearInterval(slowPoll);
      try {
        pb.collection("quick_solution_requests").unsubscribe("*");
      } catch {
        // ignore
      }
      try {
        pb.collection("quick_counselling_requests").unsubscribe("*");
      } catch {
        // ignore
      }
    };
  }, [autoRefreshQuickQueues, load]);

  const toggleQueueRow = useCallback((key) => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedQueueKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const quickRequestStatusLabel = (record) =>
    String(record?.status || "queued").toLowerCase();

  const renderPrescribeOrChat = (record, kind) => {
    const patientUserId = quickRequestPatientUserId(record);
    const status = quickRequestStatusLabel(record);
    const showChat = status !== "queued";

    if (showChat) {
      return (
        <TouchableOpacity
          onPress={() => {
            if (typeof onOpenHelpChat === "function") {
              onOpenHelpChat("", patientUserId);
            } else {
              Alert.alert(
                "Chat unavailable",
                "Open the Chat tab manually to continue this conversation.",
              );
            }
          }}
          style={{
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
            name="checkmark-circle-outline"
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
        onPress={() => {
          if (typeof onPrescribeQuickRequest !== "function") {
            Alert.alert(
              "Prescribe unavailable",
              "This screen is not wired for prescribing yet.",
            );
            return;
          }
          onPrescribeQuickRequest({ kind, record });
        }}
        style={{
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
          name="reader-outline"
          size={14}
          color="#FFF"
          style={{ marginRight: 6 }}
        />
        <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 12 }}>
          Prescribe
        </Text>
      </TouchableOpacity>
    );
  };

  const renderQuickActionsRow = (record, kind) => (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        marginTop: 10,
      }}
    >
      {renderPrescribeOrChat(record, kind)}
    </View>
  );

  const renderSolutionCard = (r) => {
    const key = `s:${r.id}`;
    const open = !!expandedQueueKeys[key];
    return (
      <View
        key={r.id}
        style={{
          marginBottom: 10,
          borderRadius: 14,
          overflow: "hidden",
          backgroundColor: theme.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
        }}
      >
        <TouchableOpacity
          onPress={() => toggleQueueRow(key)}
          activeOpacity={0.85}
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
              Quick Solution · {quickRequestStatusLabel(r)}
            </Text>
            <Text
              style={{
                color: theme.textPrimary,
                fontWeight: "700",
                marginTop: 4,
              }}
              numberOfLines={1}
            >
              {quickRequestPatientLabel(r)}
            </Text>
          </View>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={20}
            color={theme.textTertiary}
          />
        </TouchableOpacity>
        {open ? (
          <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: S.small,
                marginTop: 2,
              }}
            >
              {truncateOneLine(displayQuickSolutionNotes(r), 160) || "-"}
            </Text>
            <Text
              style={{ color: theme.textTertiary, fontSize: 10, marginTop: 6 }}
            >
              {r.created ? new Date(r.created).toLocaleString() : ""}
            </Text>
            {renderQuickActionsRow(r, "solution")}
          </View>
        ) : null}
      </View>
    );
  };

  const renderCounsellingCard = (r) => {
    const key = `c:${r.id}`;
    const open = !!expandedQueueKeys[key];
    return (
      <View
        key={r.id}
        style={{
          marginBottom: 10,
          borderRadius: 14,
          overflow: "hidden",
          backgroundColor: theme.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
        }}
      >
        <TouchableOpacity
          onPress={() => toggleQueueRow(key)}
          activeOpacity={0.85}
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
              Quick Counselling · {quickRequestStatusLabel(r)}
            </Text>
            <Text
              style={{
                color: theme.textPrimary,
                fontWeight: "700",
                marginTop: 4,
              }}
              numberOfLines={1}
            >
              {quickRequestPatientLabel(r)}
            </Text>
          </View>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={20}
            color={theme.textTertiary}
          />
        </TouchableOpacity>
        {open ? (
          <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: S.small,
                marginTop: 2,
              }}
            >
              Topic:{" "}
              {truncateOneLine(displayQuickCounsellingTopic(r), 120) || "-"}
            </Text>
            <Text
              style={{ color: theme.textTertiary, fontSize: 10, marginTop: 6 }}
            >
              {r.created ? new Date(r.created).toLocaleString() : ""}
            </Text>
            {renderQuickActionsRow(r, "counselling")}
          </View>
        ) : null}
      </View>
    );
  };

  const trackCardShell = (children, { icon, title, testId } = {}) => (
    <View
      key={title}
      collapsable={false}
      renderToHardwareTextureAndroid={Platform.OS === "android"}
      style={{
        marginBottom: 16,
        backgroundColor: theme.card,
        borderRadius: 16,
        padding: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.cardBorder,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: theme.warningLight,
              justifyContent: "center",
              alignItems: "center",
              marginRight: 10,
            }}
          >
            <Ionicons name={icon || "flash"} size={22} color={theme.warning} />
          </View>
          <Text
            style={{ color: theme.textPrimary, fontWeight: "800", fontSize: 16 }}
          >
            {title}
          </Text>
        </View>
        {!autoRefreshQuickQueues ? (
          <TouchableOpacity
            onPress={() => void load()}
            disabled={loading}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: theme.accentLight,
            }}
          >
            <Text
              style={{ color: theme.accent, fontWeight: "800", fontSize: 12 }}
            >
              {loading ? "…" : "Refresh"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );

  if (layout === "split_tracks") {
    return (
      <View
        style={{ marginTop: 0 }}
        collapsable={false}
        renderToHardwareTextureAndroid={Platform.OS === "android"}
      >
        {err ? (
          <Text
            style={{
              color: theme.danger,
              fontSize: S.small,
              marginBottom: 8,
              paddingHorizontal: 4,
            }}
          >
            {err}
          </Text>
        ) : null}
        {trackCardShell(
          <>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: S.small,
                marginBottom: 10,
              }}
            >
              Queued Quick Solution requests (including wound-related notes when
              patients route them here).
            </Text>
            <Text
              style={{
                color: theme.textPrimary,
                fontWeight: "700",
                marginBottom: 6,
              }}
            >
              In queue ({solutionRows.length})
            </Text>
            {solutionRows.length === 0 ? (
              <Text style={{ color: theme.textTertiary, fontSize: S.small }}>
                {err
                  ? "Nothing to show, or the list could not load (see message above)."
                  : "No Quick Solution requests right now."}
              </Text>
            ) : (
              solutionRows.map(renderSolutionCard)
            )}
          </>,
          { icon: "medkit-outline", title: "Quick Solution tracks" },
        )}
        {trackCardShell(
          <>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: S.small,
                marginBottom: 10,
              }}
            >
              Queued counselling conversations waiting for a doctor to respond.
            </Text>
            <Text
              style={{
                color: theme.textPrimary,
                fontWeight: "700",
                marginBottom: 6,
              }}
            >
              In queue ({counsellingRows.length})
            </Text>
            {counsellingRows.length === 0 ? (
              <Text style={{ color: theme.textTertiary, fontSize: S.small }}>
                No Quick Counselling requests right now.
              </Text>
            ) : (
              counsellingRows.map(renderCounsellingCard)
            )}
          </>,
          { icon: "chatbubbles-outline", title: "Quick Counselling tracks" },
        )}
      </View>
    );
  }

  return (
    <View
      collapsable={false}
      renderToHardwareTextureAndroid={Platform.OS === "android"}
      style={{
        marginTop: 0,
        marginBottom: 16,
        backgroundColor: theme.card,
        borderRadius: 16,
        padding: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.cardBorder,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: theme.warningLight,
              justifyContent: "center",
              alignItems: "center",
              marginRight: 10,
            }}
          >
            <Ionicons name="flash" size={22} color={theme.warning} />
          </View>
          <Text
            style={{ color: theme.textPrimary, fontWeight: "800", fontSize: 16 }}
          >
            Quick Queues
          </Text>
        </View>
        {!autoRefreshQuickQueues ? (
          <TouchableOpacity
            onPress={() => void load()}
            disabled={loading}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: theme.accentLight,
            }}
          >
            <Text
              style={{ color: theme.accent, fontWeight: "800", fontSize: 12 }}
            >
              {loading ? "…" : "Refresh"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
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
          {err
            ? "No queued requests, or the list could not be loaded (see message above)."
            : "No queued requests."}
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
    </View>
  );
}

/**
 * Patient-side tracking for Quick Solution / Quick Counselling requests already
 * submitted (distinct from the “send new request” tiles in General).
 */
export function PatientQuickRequestsTrackerPanel({
  theme,
  patientUserId,
  onOpenConversation,
  refreshTrigger,
}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyRowId, setBusyRowId] = useState(null);
  const [err, setErr] = useState("");
  /** `null` = closed; which kind's tracking list to show in the modal. */
  const [trackingModalKind, setTrackingModalKind] = useState(null);

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

  const handleOpenOffer = async (row, offer) => {
    const conversationId =
      (typeof offer?.conversation === "string" ? offer.conversation : "") ||
      offer?.conversation?.id ||
      offer?.expand?.conversation?.id ||
      "";
    const doctorId =
      offer?.expand?.doctor?.id ||
      (typeof offer?.doctor === "string" ? offer.doctor : offer?.doctor?.id) ||
      "";
    if (!conversationId) {
      Alert.alert(
        "Chat unavailable",
        "Open the Chat tab to find this conversation manually.",
      );
      return;
    }
    try {
      setBusyRowId(`${row.kind}::${row.id}`);
      await acceptQuickHelpOffer({
        offer,
        requestId: row.id,
        kind: row.kind,
        patientUserId,
      });
      removeRowLocally(row.kind, row.id);
      setTrackingModalKind(null);
      if (typeof onOpenConversation === "function") {
        onOpenConversation(conversationId, doctorId);
      }
    } catch (e) {
      Alert.alert("Could not open offer", e?.message || "Please try again.");
    } finally {
      setBusyRowId(null);
    }
  };

  const renderOffer = (offer, row) => {
    const doctor = offer?.expand?.doctor;
    const doctorName = resolveListingDisplayName({}, doctor) || "Doctor";
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
          onPress={() => handleOpenOffer(row, offer)}
          disabled={busyRowId === `${row.kind}::${row.id}`}
          accessibilityLabel="Open chat with this doctor"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: theme.success,
            opacity: busyRowId === `${row.kind}::${row.id}` ? 0.6 : 1,
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
        ? `Topic: ${truncateOneLine(displayQuickCounsellingTopic(row), 140) || "General"}`
        : truncateOneLine(displayQuickSolutionNotes(row), 200) || "-";
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

        {offers.map((offer) => renderOffer(offer, row))}

        <View style={{ flexDirection: "row", marginTop: 12 }}>
          {!hasOffers ? (
            <TouchableOpacity
              onPress={() => handleClose(row)}
              disabled={isBusy}
              style={{
                flex: 1,
                marginRight: 6,
                paddingVertical: 10,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: theme.accentLight,
                opacity: isBusy ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  color: theme.accent,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                Close
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => handleCancel(row)}
            disabled={isBusy}
            style={{
              flex: 1,
              marginLeft: hasOffers ? 0 : 6,
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

  const solutionItems = items.filter((row) => row.kind === "solution");
  const counsellingItems = items.filter((row) => row.kind === "counselling");
  const modalItems =
    trackingModalKind === "counselling"
      ? counsellingItems
      : trackingModalKind === "solution"
        ? solutionItems
        : [];

  const trackingEntryRow = ({
    onPress,
    iconName,
    accentColor,
    title,
    subtitle,
  }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 12,
        marginBottom: 10,
        borderRadius: 14,
        backgroundColor: theme.card,
        borderWidth: 1,
        borderColor: theme.cardBorder,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
        borderRadius: 10,
        borderWidth: 2,
        borderStyle: "solid",
        borderColor: accentColor,
          justifyContent: "center",
          alignItems: "center",
          marginRight: 12,
          backgroundColor: theme.bg,
        }}
      >
        <Ionicons name={iconName} size={20} color={accentColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            {title}
          </Text>
          <View
            style={{
              marginLeft: 8,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 8,
              backgroundColor: theme.accentLight,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "800",
                color: theme.accent,
                letterSpacing: 0.4,
              }}
            >
              TRACKING
            </Text>
          </View>
        </View>
        <Text
          style={{
            fontSize: 12,
            color: theme.textSecondary,
            marginTop: 4,
          }}
        >
          {subtitle}
        </Text>
      </View>
      <Ionicons name="albums-outline" size={20} color={theme.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <View
      style={{
        marginTop: 4,
        borderRadius: 18,
        padding: 14,
        borderLeftWidth: 5,
        borderLeftColor: theme.accent,
        backgroundColor: theme.inputBg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.cardBorder,
        borderRightColor: theme.cardBorder,
        borderBottomColor: theme.cardBorder,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: theme.accent,
            justifyContent: "center",
            alignItems: "center",
            marginRight: 10,
          }}
        >
          <Ionicons name="pulse-outline" size={20} color="#FFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: theme.textPrimary, fontWeight: "800", fontSize: 15 }}>
            My Quick requests
          </Text>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: 11,
              marginTop: 2,
              fontWeight: "600",
            }}
          >
            Track requests you already sent — not where you start new ones.
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => void load()}
          disabled={loading}
          accessibilityLabel="Refresh quick requests"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: theme.card,
            justifyContent: "center",
            alignItems: "center",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.cardBorder,
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <Ionicons name="refresh-outline" size={22} color={theme.accent} />
          )}
        </TouchableOpacity>
      </View>
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: S.small,
          marginBottom: 12,
          lineHeight: 17,
        }}
      >
        See status, doctor offers, and close or cancel from here.
      </Text>
      {err ? (
        <Text
          style={{ color: theme.danger, fontSize: S.small, marginBottom: 8 }}
        >
          {err}
        </Text>
      ) : null}

      {trackingEntryRow({
        onPress: () => setTrackingModalKind("solution"),
        iconName: "medkit-outline",
        accentColor: theme.accent,
        title: "Quick Solution",
        subtitle:
          solutionItems.length > 0
            ? `${solutionItems.length} active — open to manage`
            : "No active solution requests",
      })}
      {trackingEntryRow({
        onPress: () => setTrackingModalKind("counselling"),
        iconName: "chatbubbles-outline",
        accentColor: theme.success,
        title: "Quick Counselling",
        subtitle:
          counsellingItems.length > 0
            ? `${counsellingItems.length} active — open to manage`
            : "No active counselling requests",
      })}

      <Modal
        visible={trackingModalKind !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTrackingModalKind(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.bg,
            paddingTop: insets.top,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.cardBorder,
              backgroundColor: theme.card,
            }}
          >
            <TouchableOpacity
              onPress={() => setTrackingModalKind(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="close" size={26} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text
              style={{
                flex: 1,
                marginLeft: 4,
                fontSize: S.title,
                fontWeight: "800",
                color: theme.textPrimary,
              }}
              numberOfLines={1}
            >
              {trackingModalKind === "counselling"
                ? "Quick Counselling"
                : "Quick Solution"}
            </Text>
            <TouchableOpacity
              onPress={() => void load()}
              disabled={loading}
              accessibilityLabel="Refresh list"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: theme.accentLight,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {loading ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Ionicons
                  name="refresh-outline"
                  size={22}
                  color={theme.accent}
                />
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: S.pad,
              paddingBottom: insets.bottom + 28,
            }}
          >
            {loading && modalItems.length === 0 ? (
              <Text
                style={{
                  color: theme.textTertiary,
                  fontSize: S.small,
                  marginTop: 8,
                }}
              >
                Loading…
              </Text>
            ) : null}
            {!loading && modalItems.length === 0 ? (
              <Text
                style={{
                  color: theme.textTertiary,
                  fontSize: S.small,
                  marginTop: 8,
                }}
              >
                {trackingModalKind === "counselling"
                  ? "No active Quick Counselling requests."
                  : "No active Quick Solution requests."}
              </Text>
            ) : (
              modalItems.map(renderCard)
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

export function CoinWalletDoctorPanel({
  theme,
  hideWithdrawSection = false,
  /**
   * `combined` — legacy single balance (default, pharmacy portal).
   * `quick` — Quick Solution / Counselling share of your ledger.
   * `package` — package sessions, referrals, and other non-quick ledger totals.
   */
  walletChannel = "combined",
}) {
  const user = getAuthUser();
  const [withdraw, setWithdraw] = useState("");
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState(0);
  const [pairs, setPairs] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [packageDoctors, setPackageDoctors] = useState([]);
  const [referralTargets, setReferralTargets] = useState({});

  const refreshBalance = useCallback(async () => {
    if (walletChannel === "combined") {
      const [coins, activePairs, referralRows] = await Promise.all([
        getDoctorCoinBalance(user?.id),
        listActivePackagePairsForDoctor(user?.id),
        listPackageReferralsForDoctor(user?.id),
      ]);
      setBalance(coins);
      setPairs(activePairs || []);
      setReferrals(referralRows || []);
      return;
    }
    const [buckets, activePairs, referralRows] = await Promise.all([
      getDoctorCoinBucketBalances(user?.id),
      listActivePackagePairsForDoctor(user?.id),
      listPackageReferralsForDoctor(user?.id),
    ]);
    const coins =
      walletChannel === "quick" ? buckets.quickCoins : buckets.packageCoins;
    setBalance(coins);
    setPairs(activePairs || []);
    setReferrals(referralRows || []);
  }, [user?.id, walletChannel]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    if (walletChannel === "quick") {
      setPackageDoctors([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await pb.collection("doctor_profile").getFullList({
          requestKey: null,
          filter: `status="approved"`,
          expand: "user",
        });
        if (cancelled) return;
        const allUids = [
          ...new Set(
            (rows || [])
              .map((row) =>
                typeof row.user === "string" ? row.user : row.user?.id,
              )
              .filter(Boolean),
          ),
        ];
        const byId =
          allUids.length > 0 ? await fetchUsersAuthByIds(allUids) : new Map();
        const mapped = (rows || [])
          .map((row) => {
            const uid = typeof row.user === "string" ? row.user : row.user?.id;
            const expU0 = row.expand?.user;
            const expNorm0 = Array.isArray(expU0) ? expU0[0] : expU0;
            const expandObj =
              expNorm0 &&
              typeof expNorm0 === "object" &&
              !Array.isArray(expNorm0)
                ? expNorm0
                : null;
            const fetched = uid ? byId.get(uid) : null;
            const fetchObj =
              fetched &&
              typeof fetched === "object" &&
              !Array.isArray(fetched)
                ? fetched
                : null;
            const uNorm = fetchObj || expandObj;
            const merged = {
              ...row,
              expand: { ...(row.expand || {}), ...(uNorm ? { user: uNorm } : {}) },
            };
            const specRaw = String(merged.specialty || "").trim();
            const specLow = specRaw.toLowerCase();
            const spec =
              !specRaw ||
              specLow === "n/a" ||
              specLow === "na" ||
              specLow === "-" ||
              specLow === "none" ||
              specLow === "unknown" ||
              specLow === "nil"
                ? "General Physician"
                : specRaw;
            return {
              profileId: merged.id,
              userId: merged.user || merged.expand?.user?.id || "",
              name:
                resolveListingDisplayName(merged, merged.expand?.user) ||
                "Doctor",
              specialty: spec,
              practitionerTier: String(
                merged.practitioner_tier ||
                  merged.tier ||
                  merged.doctor_class ||
                  "",
              ).toLowerCase(),
              clinicOrHospital: merged.clinic_or_hospital || "",
              raw: merged,
            };
          })
          .filter(
            (doctor) =>
              doctor.userId &&
              doctor.userId !== user?.id &&
              doctorTierEligibleForPackageMode(doctor.practitionerTier) &&
              !doctorTierEligibleForQuickService(doctor),
          );
        setPackageDoctors(mapped);
      } catch {
        setPackageDoctors([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, walletChannel]);

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
      Alert.alert(
        "Withdraw request submitted",
        "Your withdraw request has been made and will be processed soon.",
      );
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

  const walletTitle =
    walletChannel === "quick"
      ? "Quick care coins (1 coin = ₹1)"
      : walletChannel === "package"
        ? "Package care coins (1 coin = ₹1)"
        : "Coin wallet (1 coin = ₹1)";
  const showPackagePairUi = walletChannel !== "quick";
  const showWithdrawBlock = !hideWithdrawSection && walletChannel !== "quick";

  return (
    <View style={{ marginTop: 0 }}>
      <Text
        style={{ color: theme.textPrimary, fontWeight: "800", marginBottom: 8 }}
      >
        {walletTitle}
      </Text>
      <Text
        style={{ color: theme.textPrimary, fontSize: S.title, fontWeight: "900" }}
      >
        {balance} coins available
      </Text>
      {walletChannel === "quick" ? (
        <Text
          style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 4 }}
        >
          Credited when you respond/prescribe on a Quick Solution or Quick
          Counselling request. Withdrawals use your combined balance (see
          package wallet if you also run care packages).
        </Text>
      ) : (
        <Text
          style={{ color: theme.textSecondary, fontSize: S.small, marginTop: 4 }}
        >
          Active package pairs: {pairs.length}
        </Text>
      )}
      {showPackagePairUi
        ? pairs.slice(0, 5).map((pair) => {
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
      })
        : null}
      {showWithdrawBlock ? (
        <>
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
        </>
      ) : null}
      <Text
        style={{ color: theme.textTertiary, fontSize: S.small, marginTop: 10 }}
      >
        See Payment history below for ledger lines.
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

const COIN_VARIANT_STYLES = {
  profile: {
    front: ["#E8E4DC", "#B8A882", "#6B6348"],
    frontEnd: { x: 0.82, y: 0.92 },
    rim: "rgba(255,255,255,0.35)",
    symbol: "#2C2820",
    back: ["#3A3528", "#5C5542", "#7A7260"],
    backSymbol: "rgba(248,250,252,0.85)",
    spec: "rgba(255,255,255,0.28)",
  },
  casual: {
    front: ["#EDE8DE", "#C4B08A", "#7D6E4F"],
    frontEnd: { x: 0.78, y: 0.88 },
    rim: "rgba(255,255,255,0.38)",
    symbol: "#2A261E",
    back: ["#353028", "#524A3A", "#6E6654"],
    backSymbol: "rgba(255,250,240,0.88)",
    spec: "rgba(255,255,255,0.3)",
  },
  package: {
    front: ["#E4E7F5", "#6B73B5", "#2C3158"],
    frontEnd: { x: 0.75, y: 0.9 },
    rim: "rgba(255,255,255,0.42)",
    symbol: "#F4F6FC",
    back: ["#1E2238", "#3D4568", "#5A6290"],
    backSymbol: "rgba(226,232,255,0.9)",
    spec: "rgba(255,255,255,0.28)",
  },
};

/**
 * Slow 3D Y-rotation coin (obverse / reverse) for wallet + profile.
 * `variant`: metallic gold tone (profile/casual) vs indigo (package).
 */
export function PatientBalanceRotatingCoin3D({
  compact = false,
  variant = "profile",
  size: sizeProp,
  noSideMargin = false,
}) {
  const palette = COIN_VARIANT_STYLES[variant] || COIN_VARIANT_STYLES.profile;
  const size =
    sizeProp ?? (compact ? 38 : 44);
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 5600, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rotation]);
  const spinStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 480 },
      { rotateY: `${rotation.value}deg` },
    ],
  }));
  const inner = size - 4;
  const r = inner / 2;
  const specH = Math.max(6, inner * 0.26);

  return (
    <View
      style={{
        width: size,
        height: size,
        marginRight: noSideMargin ? 0 : compact ? 8 : 10,
      }}
    >
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
          },
          spinStyle,
        ]}
      >
        <View
          style={{
            position: "absolute",
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
            backfaceVisibility: "hidden",
          }}
        >
          <LinearGradient
            colors={palette.front}
            start={{ x: 0.12, y: 0.08 }}
            end={palette.frontEnd || { x: 0.85, y: 0.92 }}
            style={{
              width: inner,
              height: inner,
              borderRadius: r,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: palette.rim,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#0F172A",
              shadowOpacity: 0.35,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 3 },
              elevation: 6,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={[palette.spec, "transparent"]}
              start={{ x: 0.4, y: 0 }}
              end={{ x: 0.6, y: 0.55 }}
              style={{
                position: "absolute",
                left: inner * 0.12,
                right: inner * 0.12,
                top: inner * 0.08,
                height: specH,
                borderRadius: specH / 2,
              }}
            />
            <Text
              style={{
                fontSize: size * 0.3,
                fontWeight: "700",
                color: palette.symbol,
                letterSpacing: -1,
              }}
            >
              ₹
            </Text>
          </LinearGradient>
        </View>
        <View
          style={{
            position: "absolute",
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
            backfaceVisibility: "hidden",
            transform: [{ rotateY: "180deg" }],
          }}
        >
          <LinearGradient
            colors={palette.back}
            start={{ x: 0.15, y: 0.2 }}
            end={{ x: 0.85, y: 0.85 }}
            style={{
              width: inner,
              height: inner,
              borderRadius: r,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: "rgba(255,255,255,0.12)",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                position: "absolute",
                width: inner * 0.55,
                height: StyleSheet.hairlineWidth * 2,
                backgroundColor: "rgba(255,255,255,0.2)",
                borderRadius: 2,
                transform: [{ rotate: "-38deg" }],
              }}
            />
            <Text
              style={{
                fontSize: size * 0.22,
                fontWeight: "800",
                color: palette.backSymbol,
                letterSpacing: 2,
              }}
            >
              ···
            </Text>
          </LinearGradient>
        </View>
      </Animated.View>
    </View>
  );
}

export function PatientCoinHistoryPanel({ theme, userId, compact = false }) {
  const [rows, setRows] = useState([]);
  const [balance, setBalance] = useState(0);
  const [pairs, setPairs] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const insets = useSafeAreaInsets();
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

  const pairsShown = compact ? pairs.slice(0, 2) : pairs;

  const sectionLabelStyle = {
    color: theme.textTertiary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    marginBottom: 4,
  };

  const surfaceGradientColors = useMemo(() => {
    if (
      Array.isArray(theme.surfaceGradient) &&
      theme.surfaceGradient.length >= 2
    ) {
      return theme.surfaceGradient;
    }
    return [theme.card, theme.bgSolid || theme.bg || theme.card];
  }, [theme.surfaceGradient, theme.card, theme.bg, theme.bgSolid]);

  const elevatedWrap = useMemo(
    () => ({
      borderRadius: 12,
      marginBottom: 8,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.cardBorder || "#E2E8F0",
      shadowColor: theme.shadowColor || "#000",
      shadowOpacity:
        typeof theme.elevatedShadowOpacity === "number"
          ? theme.elevatedShadowOpacity
          : 0.12,
      shadowRadius:
        typeof theme.elevatedShadowRadius === "number"
          ? theme.elevatedShadowRadius
          : 16,
      shadowOffset: { width: 0, height: 8 },
      elevation:
        typeof theme.elevatedElevation === "number"
          ? theme.elevatedElevation
          : 8,
    }),
    [theme],
  );

  const balanceGradientColors = useMemo(
    () => [
      theme.accentLight || "#EEF2FF",
      theme.card,
      theme.bg || "#F8FAFC",
    ],
    [theme.accentLight, theme.card, theme.bg],
  );

  return (
    <View style={{ marginTop: 6 }}>
      <Text
        style={{
          color: theme.textPrimary,
          fontWeight: "800",
          fontSize: compact ? 14 : 15,
          marginBottom: 8,
        }}
      >
        Coin & payments history
      </Text>

      <View style={elevatedWrap}>
        <LinearGradient
          colors={balanceGradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingVertical: compact ? 6 : 7,
            paddingHorizontal: compact ? 9 : 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <PatientBalanceRotatingCoin3D
              compact={compact}
              variant="profile"
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={sectionLabelStyle}>Remaining balance</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                style={{
                  color: theme.textPrimary,
                  fontSize: compact ? 12 : 13,
                  fontWeight: "700",
                  letterSpacing: -0.15,
                  marginTop: 1,
                }}
              >
                {balance} coins
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={elevatedWrap}>
        <LinearGradient
          colors={surfaceGradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{
            padding: compact ? 9 : 10,
          }}
        >
        <Text style={[sectionLabelStyle, { marginBottom: 6 }]}>
          Active packages
        </Text>
        {pairs.length === 0 ? (
          <Text style={{ color: theme.textTertiary, fontSize: 11, lineHeight: 16 }}>
            No active package pairs.
          </Text>
        ) : (
          pairsShown.map((pair) => (
            <Text
              key={pair.offerId}
              style={{
                color: theme.textSecondary,
                fontSize: 11,
                lineHeight: 16,
                marginBottom: 4,
              }}
            >
              {pair.title} · doctor {String(pair.doctor_user_id || "").slice(-6)}{" "}
              · pool {pair.doctor_coins} coins
            </Text>
          ))
        )}
        {compact && pairs.length > pairsShown.length ? (
          <Text style={{ color: theme.textTertiary, fontSize: 10, marginTop: 2 }}>
            +{pairs.length - pairsShown.length} more in full profile
          </Text>
        ) : null}
        </LinearGradient>
      </View>

      <TouchableOpacity
        onPress={() => setHistoryOpen(true)}
        activeOpacity={0.9}
        style={{
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 2,
          shadowColor: theme.shadowColor || "#000",
          shadowOpacity: 0.28,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 9,
        }}
      >
        <LinearGradient
          colors={[
            theme.accentBg || theme.accent,
            theme.accent,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: compact ? 9 : 10,
            paddingHorizontal: 14,
          }}
        >
          <Ionicons
            name="receipt-outline"
            size={17}
            color="#fff"
            style={{ marginRight: 7 }}
          />
          <Text
            style={{
              color: "#fff",
              fontWeight: "800",
              fontSize: compact ? 12 : 13,
              letterSpacing: 0.2,
            }}
          >
            See details…
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      <Modal
        visible={historyOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "flex-end",
          }}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setHistoryOpen(false)}
          />
          <View
            style={{
              maxHeight: "88%",
              backgroundColor: theme.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: Math.max(insets.bottom, 12) + 8,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={[theme.accent, theme.accentBg || theme.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ height: 4, width: "100%" }}
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 8,
              }}
            >
              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: 18,
                  fontWeight: "800",
                }}
              >
                Payment history
              </Text>
              <TouchableOpacity
                onPress={() => setHistoryOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close payment history"
              >
                <Ionicons name="close" size={26} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ paddingHorizontal: 16 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {rows.length === 0 ? (
                <Text
                  style={{
                    color: theme.textTertiary,
                    fontSize: S.small,
                    paddingVertical: 12,
                  }}
                >
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
            </ScrollView>
          </View>
        </View>
      </Modal>
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
