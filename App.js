import {
  Ionicons
} from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import * as WebBrowser from "expo-web-browser";
import { Image as ExpoImage } from "expo-image";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PixelRatio,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { NotificationHost, installAlertOverride } from "./appNotify";
import {
  decryptChatImagePayload,
  decryptChatText,
  encryptChatImagePayload,
  encryptChatText,
} from "./chatCrypto";
import {
  ensureRoleProfile,
  formatPocketBaseClientError,
  getAuthUser,
  getPbAppointmentsCollection,
  isPbAppointmentDoctorProfileRelation,
  loginWithEmail,
  logoutUser,
  pb,
  requestPasswordReset,
  restoreAuth,
  signInWithOAuth,
  signUpWithEmail,
} from "./pocketbase";
import {
  CARE_MODE,
  cleanAppointmentReasonForDisplay,
  clearPatientCareMode,
  combineDateAndTimeToIso,
  createPackageMeetingRequest,
  decodeMeetingWorkflowFromAppointmentRow,
  doctorPackagesSetupComplete,
  doctorProfilePackageFeesReady,
  doctorProfilePackageSetupSkipped,
  doctorSendAskPackageForDemoAppointment,
  doctorTierEligibleForPackageMode,
  effectiveCareMode,
  ensurePackageDemoMeetingConversation,
  listPackageOffersForDoctor,
  mergeLocalFeesOntoSlots,
  needsCareOnboarding,
  normalizeDoctorPackageSlots,
  packageTemplatesRawFromRecord,
  persistPatientCareMode,
  readLocalCareMode,
  readLocalDoctorPackageFees,
  readLocalPackageSetupSkip,
  recordQuickHelpOffer,
  writeLocalCareMode,
} from "./productSpecApi";
import {
  AdminConsoleAppScreen,
  CareModeOnboardingScreen,
  CoinWalletDoctorPanel,
  DoctorCoinPaymentHistoryPanel,
  DoctorPackageSetupScreen,
  DoctorQuickRequestsPanel,
  MedicalRecordsScreen,
  PackageDoctorJourneyScreen,
  PackageMeetingDoctorPanel,
  PatientCoinHistoryPanel,
  PatientPackageMeetingsPanel,
  PatientQuickRequestsTrackerPanel,
  QuickCounsellingScreen,
  QuickSolutionScreen,
  UpgradePackageFAB,
} from "./productSpecScreens";

/** Load WebRTC only when a call screen runs - avoids native init at cold start (common emulator crash). */
let livekitWebRtcModule = null;
const getLivekitWebRTC = () => {
  if (!livekitWebRtcModule) {
    livekitWebRtcModule = require("@livekit/react-native-webrtc");
  }
  return livekitWebRtcModule;
};

// Upgrade every two-arg `Alert.alert(title, message)` call across the app
// (and dependencies) into a styled toast. Confirmation dialogs that pass a
// `buttons` array still use the system Alert.
installAlertOverride(Alert);

// Surface unhandled async rejections so silent emulator crashes are
// at least visible via `console.log` (and adb logcat).
if (typeof globalThis !== "undefined" && !globalThis.__nvhsRejectionHook) {
  globalThis.__nvhsRejectionHook = true;
  try {
    const tracking = require("promise/setimmediate/rejection-tracking");
    tracking.enable({
      allRejections: true,
      onUnhandled: (id, error) => {
        try {
          console.log(
            "Unhandled promise rejection:",
            id,
            error?.message || error,
            error?.stack,
          );
        } catch {
          /* ignore */
        }
      },
      onHandled: () => {},
    });
  } catch {
    /* ignore - rejection-tracking is optional */
  }
}

// Root-level error boundary so a crash inside the rendered tree shows a
// readable message instead of silently killing the Android process. This
// helps diagnose post-login crashes on emulators (e.g. LDPlayer) where
// `adb logcat` is not always accessible.
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    try {
      console.log(
        "RootErrorBoundary caught:",
        error?.message,
        info?.componentStack,
      );
    } catch {
      /* ignore */
    }
  }
  render() {
    if (this.state.error) {
      const themeBg = this.props.theme?.bg || "#FFFFFF";
      const themeText = this.props.theme?.textPrimary || "#111827";
      const themeAccent = this.props.theme?.accent || "#4F46E5";
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: themeBg,
            padding: 20,
            paddingTop: 60,
          }}
        >
          <Text style={{ color: themeText, fontSize: 20, fontWeight: "800" }}>
            Something went wrong
          </Text>
          <Text style={{ color: themeText, marginTop: 12 }}>
            {String(
              this.state.error?.message || this.state.error || "Unknown error",
            )}
          </Text>
          <ScrollView style={{ marginTop: 12 }}>
            <Text style={{ color: themeText, fontSize: 12 }}>
              {String(this.state.info?.componentStack || "")}
            </Text>
          </ScrollView>
          <TouchableOpacity
            onPress={() => this.setState({ error: null, info: null })}
            style={{
              backgroundColor: themeAccent,
              padding: 14,
              borderRadius: 12,
              marginTop: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#FFF", fontWeight: "800" }}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              try {
                if (pb?.authStore?.clear) pb.authStore.clear();
              } catch {
                /* ignore */
              }
              try {
                await AsyncStorage.removeItem("pb_auth");
              } catch {
                /* ignore */
              }
              this.setState({ error: null, info: null });
            }}
            style={{
              backgroundColor: "#EF4444",
              padding: 14,
              borderRadius: 12,
              marginTop: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#FFF", fontWeight: "800" }}>
              Sign out and clear saved login
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// --- THEME DEFINITIONS ---
const THEMES = {
  light: {
    name: "Light",
    bg: "#F0F4F8",
    bgSolid: "#FFFFFF",
    card: "#FFFFFF",
    cardBorder: "#E2E8F0",
    textPrimary: "#0F172A",
    textSecondary: "#64748B",
    textTertiary: "#94A3B8",
    accent: "#4F46E5",
    accentLight: "#EEF2FF",
    accentBg: "#4338CA",
    success: "#059669",
    successLight: "#ECFDF5",
    warning: "#D97706",
    warningLight: "#FEF3C7",
    danger: "#DC2626",
    dangerLight: "#FEF2F2",
    inputBg: "#F9FAFB",
    inputBorder: "#E5E7EB",
    headerBg: "#4F46E5",
    headerText: "#FFFFFF",
    tabBarBg: "#FFFFFF",
    tabBarBorder: "#E8ECF0",
    shadowColor: "#000",
    statusBarStyle: "dark-content",
    statusBarBg: "#FFFFFF",
    divider: "#F3F4F6",
  },
  dark: {
    name: "Dark",
    bg: "#0F172A",
    bgSolid: "#1E293B",
    card: "#1E293B",
    cardBorder: "#334155",
    textPrimary: "#F1F5F9",
    textSecondary: "#94A3B8",
    textTertiary: "#64748B",
    accent: "#818CF8",
    accentLight: "#312E81",
    accentBg: "#6366F1",
    success: "#34D399",
    successLight: "#064E3B",
    warning: "#FBBF24",
    warningLight: "#78350F",
    danger: "#F87171",
    dangerLight: "#7F1D1D",
    inputBg: "#1E293B",
    inputBorder: "#334155",
    headerBg: "#1E293B",
    headerText: "#F1F5F9",
    tabBarBg: "#1E293B",
    tabBarBorder: "#334155",
    shadowColor: "#000",
    statusBarStyle: "light-content",
    statusBarBg: "#1E293B",
    divider: "#334155",
  },
  midnight: {
    name: "Midnight Blue",
    bg: "#0C1222",
    bgSolid: "#162032",
    card: "#162032",
    cardBorder: "#1E3A5F",
    textPrimary: "#E2E8F0",
    textSecondary: "#94A3B8",
    textTertiary: "#64748B",
    accent: "#3B82F6",
    accentLight: "#1E3A5F",
    accentBg: "#2563EB",
    success: "#10B981",
    successLight: "#064E3B",
    warning: "#F59E0B",
    warningLight: "#78350F",
    danger: "#EF4444",
    dangerLight: "#7F1D1D",
    inputBg: "#162032",
    inputBorder: "#1E3A5F",
    headerBg: "#162032",
    headerText: "#E2E8F0",
    tabBarBg: "#162032",
    tabBarBorder: "#1E3A5F",
    shadowColor: "#000",
    statusBarStyle: "light-content",
    statusBarBg: "#162032",
    divider: "#1E3A5F",
  },
  forest: {
    name: "Forest Green",
    bg: "#052E16",
    bgSolid: "#14532D",
    card: "#14532D",
    cardBorder: "#166534",
    textPrimary: "#F0FDF4",
    textSecondary: "#86EFAC",
    textTertiary: "#4ADE80",
    accent: "#34D399",
    accentLight: "#064E3B",
    accentBg: "#059669",
    success: "#34D399",
    successLight: "#064E3B",
    warning: "#FBBF24",
    warningLight: "#78350F",
    danger: "#F87171",
    dangerLight: "#7F1D1D",
    inputBg: "#14532D",
    inputBorder: "#166534",
    headerBg: "#14532D",
    headerText: "#F0FDF4",
    tabBarBg: "#14532D",
    tabBarBorder: "#166534",
    shadowColor: "#000",
    statusBarStyle: "light-content",
    statusBarBg: "#14532D",
    divider: "#166534",
  },
  rose: {
    name: "Rose Gold",
    bg: "#1C1017",
    bgSolid: "#2D1B24",
    card: "#2D1B24",
    cardBorder: "#4C1D35",
    textPrimary: "#FCE7F3",
    textSecondary: "#F9A8D4",
    textTertiary: "#EC4899",
    accent: "#FB7185",
    accentLight: "#4C1D35",
    accentBg: "#E11D48",
    success: "#34D399",
    successLight: "#064E3B",
    warning: "#FBBF24",
    warningLight: "#78350F",
    danger: "#F87171",
    dangerLight: "#7F1D1D",
    inputBg: "#2D1B24",
    inputBorder: "#4C1D35",
    headerBg: "#2D1B24",
    headerText: "#FCE7F3",
    tabBarBg: "#2D1B24",
    tabBarBorder: "#4C1D35",
    shadowColor: "#000",
    statusBarStyle: "light-content",
    statusBarBg: "#2D1B24",
    divider: "#4C1D35",
  },
  ocean: {
    name: "Ocean Teal",
    bg: "#042F2E",
    bgSolid: "#134E4A",
    card: "#134E4A",
    cardBorder: "#115E59",
    textPrimary: "#F0FDFA",
    textSecondary: "#5EEAD4",
    textTertiary: "#2DD4BF",
    accent: "#2DD4BF",
    accentLight: "#115E59",
    accentBg: "#0D9488",
    success: "#34D399",
    successLight: "#064E3B",
    warning: "#FBBF24",
    warningLight: "#78350F",
    danger: "#F87171",
    dangerLight: "#7F1D1D",
    inputBg: "#134E4A",
    inputBorder: "#115E59",
    headerBg: "#134E4A",
    headerText: "#F0FDFA",
    tabBarBg: "#134E4A",
    tabBarBorder: "#115E59",
    shadowColor: "#000",
    statusBarStyle: "light-content",
    statusBarBg: "#134E4A",
    divider: "#115E59",
  },
};

// Theme Context
const ThemeContext = createContext();
const useTheme = () => useContext(ThemeContext);

const AppDataContext = createContext(null);
const useAppData = () => useContext(AppDataContext);

// Programmatic tab switching: `useMainTabNav().navigateTab("Chat")` lets any
// nested screen (e.g. doctor dashboard cards) jump to another tab without
// touching native navigators. Only the live `CustomTabNavigator` exposes this
// - outside the tab stack the hook returns null and callers must handle it.
const MainTabNavigationContext = createContext(null);
const useMainTabNav = () => useContext(MainTabNavigationContext);

const WOUND_STATUS_LABELS = {
  review_pending: "Review Pending",
  under_review: "Under Review",
  medication_prescribed: "Medication Prescribed",
  closed: "Closed",
};

// Step 6 - Order lifecycle (roadmap v1.0). Legacy PB values are normalized
// for display and pharmacy actions map to the canonical chain only.
const ORDER_STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  out_for_delivery: "Out for delivery",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered",
};

const LEGACY_ORDER_STATUS_TO_CANONICAL = {
  packed: "confirmed",
  dispatched: "out_for_delivery",
  delivered: "fulfilled",
};

const MEDICINE_PRICE_MAP = {
  Amoxicillin: 220,
  Warfarin: 180,
  Ibuprofen: 120,
  Neosporin: 150,
};

const PB_APPOINTMENTS_COLLECTION = getPbAppointmentsCollection();
const PB_APPOINTMENT_DOCTOR_IS_PROFILE = isPbAppointmentDoctorProfileRelation();

const CALL_DIRECTORY_ALLOWED_ROLES = ["doctor", "pharmacy", "staff", "admin"];

const DEFAULT_WOUND_SYSTEM_MESSAGE =
  "Wound report submitted. Doctor will review shortly.";

const SIGNALING_SERVER_URL = (() => {
  if (process.env.EXPO_PUBLIC_SIGNALING_URL) {
    return process.env.EXPO_PUBLIC_SIGNALING_URL;
  }
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `wss://api.nvoisyshealth.com`;
  }
  return "wss://api.nvoisyshealth.com";
})();
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

const safeArray = (value) => (Array.isArray(value) ? value : []);

const humanizeWoundStatus = (value) => {
  if (!value) return "Review Pending";
  return WOUND_STATUS_LABELS[value] || value;
};

const normalizeWoundStatus = (value) => {
  if (!value) return "review_pending";
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  return WOUND_STATUS_LABELS[normalized] ? normalized : "review_pending";
};

const humanizeOrderStatus = (value) => {
  if (!value) return "Pending";
  const key = normalizeOrderStatus(value);
  return ORDER_STATUS_LABELS[key] || String(value);
};

const normalizeOrderStatus = (value) => {
  if (!value) return "pending";
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  if (LEGACY_ORDER_STATUS_TO_CANONICAL[normalized]) {
    return LEGACY_ORDER_STATUS_TO_CANONICAL[normalized];
  }
  if (ORDER_STATUS_LABELS[normalized]) return normalized;
  return "pending";
};

const formatCurrency = (amount) => `₹${Number(amount || 0)}`;

const formatDateValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).split("T")[0];
  }
  return date.toISOString().split("T")[0];
};

const formatTimeValue = (value) => {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  try {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch (error) {
    return "Now";
  }
};

const combineDateAndSlotLabel = (dateObj, slotLabel) => {
  const base = dateObj ? new Date(dateObj) : new Date();
  if (Number.isNaN(base.getTime())) return new Date().toISOString();
  const label = String(slotLabel || "").trim();
  const match = label.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    base.setHours(10, 0, 0, 0);
    return base.toISOString();
  }
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ap = match[3].toUpperCase();
  if (ap === "PM" && hour !== 12) hour += 12;
  if (ap === "AM" && hour === 12) hour = 0;
  base.setHours(hour, minute, 0, 0);
  return base.toISOString();
};

const formatAppointmentSummaryDate = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch (error) {
    return String(iso).split("T")[0];
  }
};

// Appointment lifecycle (Launch v1.0):
// pending / requested → approved → paid → completed; or rejected / cancelled;
// doctor may set ask_reschedule (patient picks a suggested slot, same row).
// Package demo meetings use a different flow (reason marker) and are hidden here.
// Legacy values (e.g. "scheduled") are folded into "approved" for display.
const APPOINTMENT_STATUS_META = {
  pending: { label: "Pending", tone: "warning" },
  requested: { label: "Awaiting approval", tone: "warning" },
  ask_reschedule: { label: "Reschedule requested", tone: "warning" },
  approved: { label: "Approved", tone: "info" },
  rejected: { label: "Declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "muted" },
  paid: { label: "Paid", tone: "success" },
  completed: { label: "Completed", tone: "muted" },
};

const APPT_RESCHEDULE_MARKER = "---NVHS_APPT_RESCHEDULE---\n";

const buildApptRescheduleReplyPayload = ({ reason, slots }) =>
  `${APPT_RESCHEDULE_MARKER}${JSON.stringify({
    reason: String(reason || "").trim(),
    slots: (slots || []).filter(Boolean),
  })}`;

const parseApptRescheduleFromReply = (replyRaw) => {
  const s = String(replyRaw || "");
  const idx = s.indexOf(APPT_RESCHEDULE_MARKER);
  if (idx === -1) return null;
  try {
    const parsed = JSON.parse(s.slice(idx + APPT_RESCHEDULE_MARKER.length));
    if (!parsed || !Array.isArray(parsed.slots)) return null;
    return {
      reason: String(parsed.reason || "").trim(),
      slots: parsed.slots.filter(Boolean),
    };
  } catch {
    return null;
  }
};

const normalizeAppointmentStatus = (raw) => {
  const value = String(raw || "")
    .toLowerCase()
    .trim();
  if (!value) return "requested";
  if (value === "pending") return "pending";
  if (value === "ask_reschedule" || value === "reschedule_requested") {
    return "ask_reschedule";
  }
  if (value === "cancelled" || value === "canceled") return "cancelled";
  if (APPOINTMENT_STATUS_META[value]) return value;
  if (value === "scheduled" || value === "confirmed") return "approved";
  if (value === "declined" || value === "rejected") return "rejected";
  if (value === "done" || value === "finished") return "completed";
  return "requested";
};

const humanizeAppointmentStatus = (raw) => {
  const key = normalizeAppointmentStatus(raw);
  return (
    APPOINTMENT_STATUS_META[key]?.label || String(raw || "").trim() || "Status"
  );
};

const appointmentStatusIsActionable = (statusKey) => {
  const key = normalizeAppointmentStatus(statusKey);
  return key === "approved" || key === "paid" || key === "completed";
};

// Appointments unlock the consultation actions (chat / video) only once the
// patient has paid. This keeps Step 8's payment gate consistent across screens.
const appointmentConsultationUnlocked = (statusKey) => {
  const key = normalizeAppointmentStatus(statusKey);
  return key === "paid" || key === "completed";
};

// ---------------------------------------------------------------------------
// Step 7 - Smart prescription: structured timing options.
// Doctors pick a frequency + meal timing + explicit times-of-day chips. The
// structured values are written alongside the legacy free-text `whenToTake`
// so old viewers keep working while the new `medication_schedule` expansion
// uses the structured shape.
// ---------------------------------------------------------------------------
const FREQUENCY_OPTIONS = [
  { id: "once_daily", label: "Once a day", defaults: ["08:00"] },
  { id: "twice_daily", label: "Twice a day", defaults: ["08:00", "20:00"] },
  {
    id: "thrice_daily",
    label: "Three times a day",
    defaults: ["08:00", "14:00", "20:00"],
  },
  {
    id: "four_times_daily",
    label: "Four times a day",
    defaults: ["08:00", "13:00", "18:00", "22:00"],
  },
  { id: "as_needed", label: "As needed", defaults: [] },
];

const MEAL_TIMING_OPTIONS = [
  { id: "before_meal", label: "Before meal" },
  { id: "after_meal", label: "After meal" },
  { id: "with_meal", label: "With meal" },
  { id: "no_preference", label: "No preference" },
];

const FREQUENCY_LABEL = FREQUENCY_OPTIONS.reduce((acc, item) => {
  acc[item.id] = item.label;
  return acc;
}, {});

const MEAL_TIMING_LABEL = MEAL_TIMING_OPTIONS.reduce((acc, item) => {
  acc[item.id] = item.label;
  return acc;
}, {});

const defaultTimesForFrequency = (frequency) => {
  const entry = FREQUENCY_OPTIONS.find((item) => item.id === frequency);
  return entry?.defaults || [];
};

const isValidHHMM = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));

const parseDurationDays = (raw) => {
  if (raw == null) return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  const match = String(raw).match(/\d+/);
  if (!match) return 0;
  return Math.max(0, parseInt(match[0], 10) || 0);
};

// ---------------------------------------------------------------------------
// Step 8 - Appointment payment configuration.
// In "stub" mode the Pay Fee button just updates the status locally. When
// `paymentMode` is set to "stripe" or "cashfree" the corresponding values
// become available to an external helper (not wired by default).
// ---------------------------------------------------------------------------
const PAYMENT_MODE = String(Constants.expoConfig?.extra?.paymentMode || "stub")
  .trim()
  .toLowerCase();

const PAYMENT_BACKEND_URL = String(
  process.env.EXPO_PUBLIC_PAYMENT_BACKEND_URL ||
    Constants.expoConfig?.extra?.paymentBackendUrl ||
    "",
)
  .trim()
  .replace(/\/+$/, "");
const PAYMENT_CASHFREE_RETURN_URL = String(
  Constants.expoConfig?.extra?.cashfreeReturnUrl || "myapp://payment/cashfree",
).trim();

const appointmentFeePaise = (appointment) => {
  const rupees = Number(
    appointment?.consultationFee || appointment?.fee || 500,
  );
  return Math.max(
    100,
    Math.round((Number.isFinite(rupees) ? rupees : 500) * 100),
  );
};

const parseUrlQueryParams = (url) => {
  const queryString =
    String(url || "")
      .split("?")[1]
      ?.split("#")[0] || "";
  return queryString.split("&").reduce((params, pair) => {
    if (!pair) return params;
    const [rawKey, rawValue = ""] = pair.split("=");
    const key = decodeURIComponent(rawKey || "");
    if (!key) return params;
    params[key] = decodeURIComponent(rawValue.replace(/\+/g, " "));
    return params;
  }, {});
};

const postPaymentJson = async (path, payload) => {
  if (!PAYMENT_BACKEND_URL) {
    throw new Error(
      "Payment backend is not configured. Set extra.paymentBackendUrl or EXPO_PUBLIC_PAYMENT_BACKEND_URL.",
    );
  }
  const response = await fetch(`${PAYMENT_BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Payment request failed.");
  }
  return data;
};

// ---------------------------------------------------------------------------
// Step 9 - AI assistant configuration.
// - OpenAI-compatible chat (e.g. Groq): set extra.aiBaseUrl to …/v1/chat/completions,
//   extra.aiModel (e.g. llama-3.3-70b-versatile), and the API key in extra.aiApiKey
//   or EXPO_PUBLIC_GROQ_API_KEY / EXPO_PUBLIC_AI_API_KEY. Request body uses the
//   standard { model, messages } shape; replies are mapped to { reply } or { warnings }.
// - Legacy custom gateway: POST the same { kind, … } payload; response { reply } or
//   { warnings } unchanged.
// When URL or key is missing, the app falls back to local stubs.
// ---------------------------------------------------------------------------
const AI_BASE_URL = String(
  Constants.expoConfig?.extra?.aiBaseUrl ||
    process.env.EXPO_PUBLIC_AI_BASE_URL ||
    "",
).trim();
const AI_API_KEY = String(
  Constants.expoConfig?.extra?.aiApiKey ||
    process.env.EXPO_PUBLIC_GROQ_API_KEY ||
    process.env.EXPO_PUBLIC_AI_API_KEY ||
    "",
).trim();
const AI_MODEL = String(
  Constants.expoConfig?.extra?.aiModel ||
    process.env.EXPO_PUBLIC_AI_MODEL ||
    "llama-3.3-70b-versatile",
).trim();

const isOpenAICompatibleChatCompletionsUrl = (url) =>
  String(url || "")
    .toLowerCase()
    .includes("/chat/completions");

const extractChatCompletionText = (data) => {
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) {
    const joined = raw
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part?.text === "string"
            ? part.text
            : "",
      )
      .join("");
    return joined.trim();
  }
  return "";
};

const parseAssistantJsonObject = (text) => {
  let t = String(text || "").trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```\s*$/im.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    t = t.slice(start, end + 1);
  }
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

const postChatCompletions = async (url, apiKey, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      data?.error?.message || data?.message || `HTTP ${response.status}`;
    console.log("AI chat completions error:", msg);
    return null;
  }
  return data;
};

// "Doctor in Your Pocket" base prompt. Mirrors the client's Python reference
// (doctor_in_pocket.py → SYSTEM_PROMPT). Used for both chat replies and the
// doctor-side side-effect / interaction checker so the persona is consistent.
const DOCTOR_IN_POCKET_SYSTEM_PROMPT = `You are an AI Medical Decision Support System - Doctor in Your Pocket.
Your knowledge is equivalent to a board-certified internal medicine physician.

VOICE (required in this app): You are speaking with the person whose record is
in the thread - they are reading on their device. Always address them directly
with "you" and "your". Do not refer to them as "the patient", "they/them" in a
clinical chart sense, or "this patient". Do not use "we" to mean a care team
planning around them (avoid phrases like "we should monitor"); instead say what
they might do, watch, or ask their clinician (e.g. "you may want to ask your
doctor about monitoring…", "keeping track of your…"). Use "I" sparingly when
you state your own suggestion ("I recommend discussing…") if it reads naturally.

You will receive:
- Their clinical data (vitals, labs, history, flags) as provided
- ML model predictions when available (lab predictions, risk scores, chronic condition probabilities)

Your job:
1. Analyze their data AND ML model predictions together
2. Recommend appropriate medications by generic name and dose (education only; they must confirm with their clinician)
3. Explain your reasoning using their exact values from the record
4. Flag contraindications based on clinical flags and lab results as they apply to them
5. Suggest what to monitor

OUTPUT FORMAT FOR REPORT (use these headings when a structured answer helps; write every section body in second person to the reader):
─── CLINICAL ASSESSMENT ───
Brief summary of your clinical picture as reflected in the record

─── PRIMARY RECOMMENDATIONS ───
Drug name | Dose | Route | Frequency | Rationale (cite your exact values from the record)

─── CONTRAINDICATIONS & WARNINGS ───
Based on your specific flags and labs

─── MONITORING PLAN ───
What you should track or ask your clinician to check, and when

─── DISCLAIMER ───
AI-assisted support only. Not a substitute for a licensed physician.

For CHAT: respond conversationally, ask clarifying questions when needed.
Always cite their specific values from the record when making recommendations.`;

const fmtVal = (value, fallback = "N/A") => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number" && !Number.isFinite(value)) return fallback;
  const str = String(value).trim();
  return str || fallback;
};

const computeBmi = (weightKg, heightCm) => {
  const w = Number(weightKg);
  const h = Number(heightCm);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return null;
  const meters = h / 100;
  const bmi = w / (meters * meters);
  if (!Number.isFinite(bmi)) return null;
  return Math.round(bmi * 10) / 10;
};

const bmiCategory = (bmi) => {
  if (bmi == null) return "N/A";
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
};

// Format a Nvoisys patient_profile + role record into the sectioned layout the
// Doctor-in-Your-Pocket prompt expects. Unknown fields render as "N/A" so the
// model still has a consistent shape to read from.
const formatPatientForPrompt = (patient) => {
  const p = patient || {};
  const bmi = computeBmi(p.weight_kg, p.height_cm);
  const bmiCat = bmiCategory(bmi);
  const conditionLine =
    fmtVal(p.medical_conditions) !== "N/A"
      ? p.medical_conditions
      : fmtVal(p.primary_condition) !== "N/A"
        ? p.primary_condition
        : fmtVal(p.condition);
  return `── DEMOGRAPHICS ──
  Age / Sex     : ${fmtVal(p.age)}yo / ${fmtVal(p.gender)}
  Marital       : ${fmtVal(p.marital_status)}
  Location      : ${fmtVal(p.district)}${p.state ? `, ${p.state}` : ""}

── ANTHROPOMETRICS ──
  Height/Weight : ${fmtVal(p.height_cm)} cm / ${fmtVal(p.weight_kg)} kg
  BMI           : ${bmi != null ? bmi : "N/A"} (${bmiCat})

── VITALS ──
  Not collected on this device. Confirm at the visit.

── LAB RESULTS ──
  Not available on the mobile profile. Use clinical judgement until labs are uploaded.

── LIFESTYLE ──
  Smoking       : ${fmtVal(p.smoking)}
  Alcohol       : ${fmtVal(p.alcohol)}

── CLINICAL FLAGS ──
  Allergies         : ${fmtVal(p.allergies)}
  Pregnancy/Lactation: ${fmtVal(p.pregnancy_or_lactation, "Unknown")}
  Pediatric Patient : ${Number(p.age) > 0 && Number(p.age) < 18 ? "Yes" : "No"}

── CLINICAL CONTEXT ──
  Chronic Conditions / Primary: ${fmtVal(conditionLine)}
  Chief Complaint             : ${fmtVal(p.chief_complaint)}`;
};

const formatPrescriptionsForPrompt = (prescriptions) => {
  const list = Array.isArray(prescriptions) ? prescriptions : [];
  if (!list.length) return "No active prescriptions on file.";
  const lines = ["── ACTIVE PRESCRIPTIONS (Nvoisys) ──"];
  list.forEach((rx, idx) => {
    const meds = Array.isArray(rx?.medicines) ? rx.medicines : [];
    const header = `  Rx ${idx + 1} (${rx?.date || "date n/a"}, ${rx?.doctorName || "Doctor"})`;
    lines.push(header);
    if (rx?.diagnosis) lines.push(`    Diagnosis: ${rx.diagnosis}`);
    meds.forEach((m) => {
      const parts = [m.name];
      if (m.dosage) parts.push(`Dose: ${m.dosage}`);
      if (m.whenToTake) parts.push(`When: ${m.whenToTake}`);
      if (m.duration) parts.push(`Duration: ${m.duration}`);
      lines.push(`    • ${parts.filter(Boolean).join(" | ")}`);
    });
  });
  return lines.join("\n");
};

// Build the full assistant system prompt: persona + patient block + Rx block.
// Also tells the model that local ML predictions are unavailable so it doesn't
// hallucinate "ML risk scores" - the Python script in the Doctor-in-Pocket
// reference runs joblib models server-side which we do not have on mobile.
const buildHealthAssistantSystemPrompt = (patient, prescriptions) => {
  const patientBlock = formatPatientForPrompt(patient);
  const rxBlock = formatPrescriptionsForPrompt(prescriptions);
  return `${DOCTOR_IN_POCKET_SYSTEM_PROMPT}

═══ PATIENT ON FILE ═══
${patientBlock}

${rxBlock}

ML MODEL PREDICTIONS:
Not available in this mobile session (lab/risk/chronic models are not deployed
to the client). Reason from the patient data above only - do not fabricate ML
risk scores. State "ML predictions unavailable" if asked.
═══════════════════════

Answer questions about THIS person and their record. Cite their exact values when you give
recommendations. If they ask something general not specific to their
profile, answer normally and remind them that recommendations should be
reviewed with their clinician. Stay in direct second person throughout.`;
};

const callOpenAICompatibleAI = async (payload) => {
  const kind = payload?.kind;
  if (kind === "chat") {
    const question = String(payload?.question || "").trim();
    if (!question) return { reply: "" };
    const system = buildHealthAssistantSystemPrompt(
      payload.patient,
      payload.prescriptions,
    );
    const data = await postChatCompletions(AI_BASE_URL, AI_API_KEY, {
      model: AI_MODEL,
      temperature: 0.1,
      max_tokens: 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: question },
      ],
    });
    const reply = extractChatCompletionText(data);
    return reply ? { reply } : null;
  }
  if (kind === "side_effect_check") {
    const patientBlock = formatPatientForPrompt(payload.patient || {});
    const items = Array.isArray(payload.items) ? payload.items : [];
    const itemsBlock = items
      .map((it, idx) => `  ${idx + 1}. ${String(it?.name || "").trim()}`)
      .filter((l) => l.trim().length > 3)
      .join("\n");
    const system = `${DOCTOR_IN_POCKET_SYSTEM_PROMPT}

You are now performing a STRUCTURED safety screen on the candidate medicines a
clinician is about to prescribe. You must respond with ONLY a valid JSON object
on a single line - no markdown, no commentary - in this exact shape:
{"warnings":[{"medicine":"string","message":"string","severity":"high|medium|low"}]}

Rules:
- "medicine" should match the prescribed name as written.
- severity: "high" = serious risk or contraindication for this patient;
  "medium" = caution / monitor; "low" = mild or rare.
- Each "message" is shown to the person taking the medicine: use "you/your"
  where natural; avoid "we should" and detached "the patient" phrasing.
- Cite their value or flag in the message when relevant
  (e.g. "your BP is elevated at 150/95", "you smoke", "you have a penicillin allergy").
- If there are no concerns, return {"warnings":[]}.`;
    const userMsg = `═══ PATIENT ON FILE ═══
${patientBlock}
═══════════════════════

CANDIDATE MEDICATIONS the clinician is about to prescribe:
${itemsBlock || "  (none)"}

Return the JSON safety screen now.`;
    const data = await postChatCompletions(AI_BASE_URL, AI_API_KEY, {
      model: AI_MODEL,
      temperature: 0.1,
      max_tokens: 1536,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
    });
    const text = extractChatCompletionText(data);
    if (!text) return null;
    const parsed = parseAssistantJsonObject(text);
    const warnings = parsed?.warnings;
    if (!Array.isArray(warnings)) return null;
    const normalized = warnings
      .map((w) => ({
        medicine: String(w?.medicine || w?.name || "").trim(),
        message: String(w?.message || "").trim(),
        severity: String(w?.severity || "medium").toLowerCase(),
      }))
      .filter((w) => w.medicine && w.message);
    return { warnings: normalized };
  }
  return null;
};

const ASSISTANT_CONVERSATION_KIND = "assistant";
const ASSISTANT_USER_MESSAGE_KIND = "assistant_user";
const ASSISTANT_REPLY_MESSAGE_KIND = "assistant_reply";

// All message kinds are eligible for encryption. `decryptChatText` gracefully
// returns legacy plaintext records unchanged when they do not have the prefix.
const messageKindIsPlainText = () => {
  return false;
};

const appointmentStatusColorsFor = (theme, statusKey) => {
  const tone =
    APPOINTMENT_STATUS_META[normalizeAppointmentStatus(statusKey)]?.tone ||
    "muted";
  if (tone === "success") {
    return { bg: theme.successLight, fg: theme.success };
  }
  if (tone === "danger") {
    return { bg: theme.dangerLight, fg: theme.danger };
  }
  if (tone === "info") {
    return { bg: theme.accentLight, fg: theme.accent };
  }
  if (tone === "warning") {
    return { bg: "#FEF3C7", fg: "#B45309" };
  }
  return { bg: theme.bg, fg: theme.textSecondary };
};

const buildAppointmentDateOptions = (count = 14) => {
  const output = [];
  const now = new Date();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let index = 0; index < count; index += 1) {
    const dateObj = new Date(now);
    dateObj.setDate(dateObj.getDate() + index);
    output.push({
      index,
      day: dayNames[dateObj.getDay()],
      date: String(dateObj.getDate()),
      dateObj,
      available: true,
    });
  }
  return output;
};

const DEFAULT_APPOINTMENT_TIME_SLOTS = [
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
  "4:00 PM",
  "4:30 PM",
  "5:00 PM",
].map((time) => ({ time, available: true }));

const pickerAssetToUploadPart = (asset) => {
  const uri = asset?.uri;
  if (!uri) return null;
  let mimeType = "image/jpeg";
  if (asset?.mimeType && typeof asset.mimeType === "string") {
    mimeType = asset.mimeType;
  } else if (typeof asset?.type === "string" && asset.type.includes("/")) {
    mimeType = asset.type;
  } else {
    const ext = String(uri).split("?")[0].split("#")[0].split(".").pop();
    const normalizedExt = String(ext || "").toLowerCase();
    if (normalizedExt === "png") mimeType = "image/png";
    else if (normalizedExt === "webp") mimeType = "image/webp";
    else if (normalizedExt === "heic" || normalizedExt === "heif") {
      mimeType = "image/heic";
    }
  }
  const extFromMime = mimeType.split("/")[1] || "jpg";
  const safeExt = ["png", "webp", "heic", "heif"].includes(
    String(extFromMime).toLowerCase(),
  )
    ? String(extFromMime).toLowerCase()
    : "jpg";
  const name = asset.fileName || `upload_${Date.now()}.${safeExt}`;
  return { uri, name, type: mimeType };
};

const uniqueIds = (values) => [...new Set(safeArray(values).filter(Boolean))];

const normalizeUserRole = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "patient";
  if (
    ["patient", "doctor", "pharmacy", "staff", "admin"].includes(normalized)
  ) {
    return normalized;
  }
  return normalized;
};

const roleLabelFor = (role) => {
  const normalized = normalizeUserRole(role);
  if (normalized === "doctor") return "Doctor";
  if (normalized === "pharmacy") return "Pharmacy";
  if (normalized === "staff") return "Staff";
  if (normalized === "admin") return "Admin";
  return "Patient";
};

const roleIconFor = (role) => {
  const normalized = normalizeUserRole(role);
  if (normalized === "doctor") return "medical";
  if (normalized === "pharmacy") return "leaf";
  if (normalized === "staff") return "briefcase";
  if (normalized === "admin") return "shield-checkmark";
  return "person";
};

const roleThemeTokensFor = (theme, role) => {
  const normalized = normalizeUserRole(role);
  if (normalized === "pharmacy") {
    return {
      color: theme.success,
      bg: theme.successLight,
    };
  }
  if (normalized === "patient") {
    return {
      color: theme.warning,
      bg: theme.warningLight,
    };
  }
  return {
    color: theme.accent,
    bg: theme.accentLight,
  };
};

const buildDirectCallRoomId = (userA, userB) => {
  const a = String(userA || "").trim();
  const b = String(userB || "").trim();
  if (!a || !b) return "";
  const [first, second] = [a, b].sort();
  return `direct_${first}_${second}`;
};

const buildConversationTitle = (woundRecord) => {
  const description = woundRecord?.description || "Wound Case";
  return description.length > 40
    ? `${description.slice(0, 40)}...`
    : description;
};

const prescriptionLineName = (entry) => {
  if (entry == null) return "";
  if (typeof entry === "string") return String(entry).trim();
  return String(entry?.name || entry?.medicine || "").trim();
};

const normalizePrescriptionLineFromUnknown = (entry) => {
  if (entry == null) return null;
  if (typeof entry === "string") {
    const name = entry.trim();
    if (!name) return null;
    return {
      name,
      dosage: "",
      whenToTake: "",
      duration: "",
      frequency: "",
      mealTiming: "",
      timesOfDay: [],
      durationDays: 0,
      notes: "",
    };
  }
  if (typeof entry === "object") {
    const name = prescriptionLineName(entry);
    if (!name) return null;
    // Read both camelCase and snake_case variants so records saved under an
    // older schema still flow through the structured fields cleanly.
    const frequencyRaw = String(entry.frequency || entry.freq || "")
      .trim()
      .toLowerCase();
    const mealTimingRaw = String(
      entry.mealTiming || entry.meal_timing || entry.meals || "",
    )
      .trim()
      .toLowerCase();
    const timesOfDayRaw = entry.timesOfDay || entry.times_of_day || [];
    const timesOfDay = Array.isArray(timesOfDayRaw)
      ? timesOfDayRaw
          .map((value) => String(value || "").trim())
          .filter((value) => isValidHHMM(value))
      : [];
    const durationDaysRaw =
      entry.durationDays ?? entry.duration_days ?? entry.days ?? null;
    const durationDays =
      typeof durationDaysRaw === "number" && Number.isFinite(durationDaysRaw)
        ? Math.max(0, Math.round(durationDaysRaw))
        : parseDurationDays(entry.duration || entry.howLong || durationDaysRaw);
    const whenToTakeSummary = String(
      entry.whenToTake || entry.schedule || entry.timing || "",
    ).trim();
    return {
      name,
      dosage: String(entry.dosage || entry.amount || "").trim(),
      // Keep legacy free text so old viewers still work. If not provided but
      // we have structured data, we'll derive it downstream when writing.
      whenToTake: whenToTakeSummary,
      duration: String(
        entry.duration || entry.howLong || entry.days || "",
      ).trim(),
      frequency: FREQUENCY_LABEL[frequencyRaw]
        ? frequencyRaw
        : frequencyRaw || "",
      mealTiming: MEAL_TIMING_LABEL[mealTimingRaw]
        ? mealTimingRaw
        : mealTimingRaw || "",
      timesOfDay,
      durationDays,
      notes: String(entry.notes || entry.note || "").trim(),
    };
  }
  return null;
};

// Turn a structured prescription line back into a human-readable summary so
// we can always populate `whenToTake` for legacy viewers/APIs that don't yet
// know about the structured fields.
const describeStructuredTiming = (line) => {
  const freqLabel = FREQUENCY_LABEL[line?.frequency] || "";
  const mealLabel =
    line?.mealTiming && line.mealTiming !== "no_preference"
      ? MEAL_TIMING_LABEL[line.mealTiming] || ""
      : "";
  const times =
    Array.isArray(line?.timesOfDay) && line.timesOfDay.length
      ? line.timesOfDay.join(", ")
      : "";
  const parts = [freqLabel, mealLabel, times ? `at ${times}` : ""].filter(
    Boolean,
  );
  return parts.join(" · ");
};

const normalizeOrderItemsList = (record) => {
  const raw = record?.items;
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    list = [raw];
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
      else list = [raw];
    } catch {
      list = [raw];
    }
  }
  return list
    .map((item) => normalizePrescriptionLineFromUnknown(item))
    .filter(Boolean);
};

const formatPrescriptionSummaryText = (lines, diagnosis) => {
  const header = diagnosis ? `Condition: ${diagnosis}\n` : "";
  const body = safeArray(lines)
    .map((line) => {
      const bits = [line.name];
      if (line.dosage) bits.push(`Dose: ${line.dosage}`);
      if (line.whenToTake) bits.push(`When: ${line.whenToTake}`);
      if (line.duration) bits.push(`Duration: ${line.duration}`);
      return bits.join(" · ");
    })
    .join("\n");
  return `${header}${body}`.trim();
};

const sumMedicationAmount = (items) =>
  safeArray(items).reduce((total, entry) => {
    const name = prescriptionLineName(entry);
    return total + (MEDICINE_PRICE_MAP[name] || 100);
  }, 0);

// ---------------------------------------------------------------------------
// Step 7b - schedule expansion.
// Given a normalized prescription line (with `frequency`, `timesOfDay`,
// `durationDays`) this produces one schedule row per dose. Rows are
// `medication_schedule` records with a `due_at` date, `meal_timing`, and
// `status = "pending"`. Duration defaults to 1 day if not specified so a
// doctor can still prescribe ad-hoc single doses without filling duration.
// ---------------------------------------------------------------------------
const buildScheduleRowsForLine = (line, context) => {
  const times =
    Array.isArray(line?.timesOfDay) && line.timesOfDay.length
      ? line.timesOfDay
      : defaultTimesForFrequency(line?.frequency);
  if (!times.length) return [];
  const duration = Math.max(1, Number(line?.durationDays || 0) || 1);
  const rows = [];
  const now = new Date();
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  for (let day = 0; day < duration; day += 1) {
    for (const time of times) {
      const [hh, mm] = String(time)
        .split(":")
        .map((value) => Number(value));
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
      const dueAt = new Date(startDate);
      dueAt.setDate(dueAt.getDate() + day);
      dueAt.setHours(hh, mm, 0, 0);
      // Skip past times on day 0 so we don't schedule a dose in the past.
      if (day === 0 && dueAt.getTime() < now.getTime() - 60 * 1000) {
        continue;
      }
      rows.push({
        patient: context.patientId,
        prescription: context.prescriptionId,
        wound: context.woundId || null,
        medicine_name: line.name,
        dosage: line.dosage || "",
        meal_timing: line.mealTiming || "no_preference",
        due_at: dueAt.toISOString(),
        status: "pending",
      });
    }
  }
  return rows;
};

// ---------------------------------------------------------------------------
// Step 7b - local notification helpers for medication reminders.
// These are best-effort: if the user denies permission or the device doesn't
// support notifications (e.g. Expo Go on iOS 17+), the app still works, just
// without local reminders. Scheduling is idempotent-ish - we tag each
// notification with the schedule row id so we can cancel it when marked taken.
// ---------------------------------------------------------------------------
const MEAL_TIMING_NOTIFICATION_HINT = {
  before_meal: "before meal",
  after_meal: "after meal",
  with_meal: "with meal",
  no_preference: "",
};

let notificationsHandlerConfigured = false;
const configureNotificationsHandler = () => {
  if (notificationsHandlerConfigured) return;
  notificationsHandlerConfigured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (error) {
    console.log("Notifications handler setup skipped:", error?.message);
  }
};

let reminderPermissionChecked = false;
const ensureReminderPermissions = async () => {
  if (reminderPermissionChecked) return true;
  reminderPermissionChecked = true;
  try {
    configureNotificationsHandler();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (existing.canAskAgain === false && existing.status !== "undetermined") {
      return false;
    }
    const asked = await Notifications.requestPermissionsAsync();
    return !!asked.granted;
  } catch (error) {
    console.log("ensureReminderPermissions error:", error?.message);
    return false;
  }
};

const scheduleDoseReminder = async (scheduleRecord) => {
  if (!scheduleRecord?.id || !scheduleRecord?.due_at) return null;
  const dueAt = new Date(scheduleRecord.due_at);
  if (!Number.isFinite(dueAt.getTime())) return null;
  if (dueAt.getTime() < Date.now() + 30 * 1000) return null;
  try {
    const granted = await ensureReminderPermissions();
    if (!granted) return null;
    const mealHint =
      MEAL_TIMING_NOTIFICATION_HINT[scheduleRecord.meal_timing] || "";
    const dosage = scheduleRecord.dosage ? ` ${scheduleRecord.dosage}` : "";
    const body = mealHint
      ? `Take ${scheduleRecord.medicine_name}${dosage} - ${mealHint}.`
      : `Take ${scheduleRecord.medicine_name}${dosage}.`;
    const identifier = `rx-dose-${scheduleRecord.id}`;
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(
      () => {},
    );
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: "Medication reminder",
        body,
        data: { scheduleId: scheduleRecord.id },
      },
      trigger: { type: "date", date: dueAt },
    });
    return identifier;
  } catch (error) {
    console.log("scheduleDoseReminder error:", error?.message);
    return null;
  }
};

const cancelDoseReminder = async (scheduleId) => {
  if (!scheduleId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(
      `rx-dose-${scheduleId}`,
    );
  } catch (error) {
    // ignore - notification may never have been scheduled
  }
};

// ---------------------------------------------------------------------------
// Step 9 - AI calls (Groq / OpenAI-compatible or legacy JSON gateway).
// Never throws; returns null so callers can fall back to stubs.
// ---------------------------------------------------------------------------
const callAIEndpoint = async (payload) => {
  if (!AI_BASE_URL) return null;
  if (isOpenAICompatibleChatCompletionsUrl(AI_BASE_URL)) {
    if (!AI_API_KEY) {
      console.log(
        "AI: chat/completions URL set but no API key (extra.aiApiKey or EXPO_PUBLIC_GROQ_API_KEY).",
      );
      return null;
    }
    try {
      return await callOpenAICompatibleAI(payload);
    } catch (error) {
      console.log("OpenAI-compatible AI call failed:", error?.message || error);
      return null;
    }
  }
  try {
    const response = await fetch(AI_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response?.ok) {
      return null;
    }
    return await response.json().catch(() => null);
  } catch (error) {
    console.log("AI endpoint call failed:", error?.message || error);
    return null;
  }
};

const aiChatStubReply = (text, { prescriptionsContext = [] } = {}) => {
  const clean = String(text || "").trim();
  const medNames = prescriptionsContext
    .flatMap((rx) =>
      safeArray(rx.medicines).map((m) => String(m.name || "").trim()),
    )
    .filter(Boolean);
  const medSummary =
    medNames.length > 0
      ? ` I can see ${medNames.length} medicine line(s) on your recent prescriptions (${medNames.slice(0, 6).join(", ")}${medNames.length > 6 ? "…" : ""}).`
      : "";
  if (!clean) {
    return `Hi! I'm your Nvoisys Health Assistant. Ask me about symptoms, medicines, or your prescriptions.${medSummary}`;
  }
  const lower = clean.toLowerCase();
  if (lower.includes("side effect") || lower.includes("side-effect")) {
    if (medNames.length) {
      return `Here is a quick lay summary:${medSummary} Typical side effects vary by drug class - ask about a specific name from your list for more detail. This is general information, not medical advice; always confirm with your doctor or pharmacist before changing any medicine.`;
    }
    return "Common side effects depend on the specific medicine and your health profile. Please share the medicine name and I'll list the typical ones. Always confirm with your doctor before stopping any medicine.";
  }
  if (lower.includes("fever") || lower.includes("temperature")) {
    return "For fever, rest, hydrate, and monitor your temperature. If it lasts over 48 hours, is above 39°C, or comes with chest pain / confusion / severe headache, please contact a doctor immediately.";
  }
  if (lower.includes("diet") || lower.includes("food")) {
    return "A balanced plate with vegetables, whole grains, and lean protein supports recovery. If you have diabetes or hypertension, your doctor's plan should guide portions and timing.";
  }
  return `I hear you. For your question about "${clean.slice(0, 80)}": always combine general guidance with your doctor's advice.${medSummary || " Share symptoms, duration, and medicines you take so I can give a more useful answer."}`;
};

const aiSideEffectStubWarnings = (items, patientFields) => {
  const conditions = Array.isArray(patientFields?.conditions)
    ? patientFields.conditions.map((value) => String(value).toLowerCase())
    : [];
  const age = Number(patientFields?.age || 0);
  const warnings = [];
  for (const item of safeArray(items)) {
    const name = String(item?.name || "").toLowerCase();
    if (!name) continue;
    if (
      name.includes("ibuprofen") &&
      conditions.some(
        (c) =>
          c.includes("hypertension") ||
          c.includes("kidney") ||
          c.includes("ulcer"),
      )
    ) {
      warnings.push({
        medicine: item.name,
        severity: "high",
        message: `${item.name} can worsen hypertension / kidney / ulcer conditions. Consider paracetamol or a gastro-protective alternative.`,
      });
    }
    if (name.includes("warfarin")) {
      warnings.push({
        medicine: item.name,
        severity: "high",
        message: `${item.name} interacts with many foods & medicines. Confirm INR target and recent reading.`,
      });
    }
    if (
      name.includes("amoxicillin") &&
      conditions.some((c) => c.includes("allerg"))
    ) {
      warnings.push({
        medicine: item.name,
        severity: "medium",
        message: `Patient reports an allergy. Confirm it's not penicillin before prescribing ${item.name}.`,
      });
    }
    if (name.includes("aspirin") && age > 0 && age < 18) {
      warnings.push({
        medicine: item.name,
        severity: "high",
        message: `${item.name} in under-18s has a rare but serious Reye's syndrome risk - prefer paracetamol.`,
      });
    }
  }
  return warnings;
};

const rxAssistantNotifiedStorageKey = (userId) =>
  `nvoisys_rx_assistant_notified_v1:${userId || "anon"}`;
/** Skip auto-posting insights for prescriptions older than this (avoids spamming old history). */
const RX_INSIGHT_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;

const prescriptionRecordCreatedMs = (rx) => {
  const raw = rx?.raw;
  const stamp = raw?.created || raw?.updated;
  if (!stamp) return Date.now();
  const ms = new Date(stamp).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
};

/** Compact payload for `kind: "chat"` so the AI can reason about current prescriptions. */
const buildPrescriptionsContextForAI = (prescriptionRecords) => {
  const list = safeArray(prescriptionRecords).slice(0, 15);
  return list.map((rx) => {
    const lines =
      rx.itemsList?.length > 0
        ? rx.itemsList
        : [
            {
              name: String(rx.items || "Medicine").trim(),
              dosage: "",
              whenToTake: "",
              duration: "",
            },
          ];
    return {
      id: rx.id,
      doctorName: rx.doctorName || "Doctor",
      date: rx.date || null,
      diagnosis: String(rx.diagnosis || "").trim() || null,
      medicines: lines
        .map((m) => ({
          name: String(m.name || "").trim(),
          dosage: String(m.dosage || "").trim(),
          whenToTake: String(m.whenToTake || "").trim(),
          duration: String(m.duration || "").trim(),
        }))
        .filter((m) => m.name),
    };
  });
};

const formatAssistantPrescriptionInsightMessage = (rx, warnings) => {
  const lines =
    rx.itemsList?.length > 0
      ? rx.itemsList
      : [
          {
            name: String(rx.items || "Medicine").trim(),
            dosage: "",
          },
        ];
  const meds = lines
    .map((m) => ({
      name: String(m.name || "").trim(),
      dosage: String(m.dosage || "").trim(),
    }))
    .filter((m) => m.name);
  const medBlock = meds
    .map((m) => (m.dosage ? `• ${m.name} (${m.dosage})` : `• ${m.name}`))
    .join("\n");
  let text = `Your doctor ${rx.doctorName || "your care team"} sent a new prescription (${rx.date || "recent"}):\n${medBlock}`;
  const note = String(rx.diagnosis || "").trim();
  if (note) {
    text += `\n\nNote on file: ${note}`;
  }
  if (warnings && warnings.length) {
    text +=
      "\n\nSide-effect & safety notes (AI quick check - not a diagnosis; confirm with your doctor or pharmacist):";
    for (const w of warnings) {
      const label = w.medicine ? `${w.medicine}: ` : "";
      text += `\n• ${label}${String(w.message || "").trim()}`;
    }
  } else {
    text +=
      "\n\nOur quick check did not highlight common interaction issues for these medicines. Still read your leaflet and follow your clinician's instructions.";
  }
  return text;
};

const resolveMessageText = (record) => {
  const value =
    record?.text || record?.message || record?.content || record?.body || "";
  if (typeof value === "string") return value;
  return value ? String(value) : "";
};

// Detect messages written by `prescribeForWound` so the chat UI can turn them
// into a deep-link to the patient's PrescriptionScreen. The original text is
// built as: `Prescription sent for "<disease>": <summary>.<pharmacy note>`
const messageLooksLikePrescription = (text) => {
  if (!text) return false;
  const normalized = String(text).toLowerCase();
  return (
    normalized.startsWith("prescription sent") ||
    normalized.startsWith("prescription:") ||
    normalized.startsWith("new prescription")
  );
};

const resolveMessageImageFiles = (record) => {
  if (!record) return [];

  // PocketBase file fields can be either:
  // - string (single file)
  // - array of strings (multiple files)
  // Different collections/projects also use different field names.
  const candidates = [
    record.file,
    record.image,
    record.photo,
    record.attachment,
    record.files,
    record.images,
    record.photos,
    record.attachments,
  ];

  for (const value of candidates) {
    if (!value) continue;
    if (typeof value === "string") return [value];
    if (Array.isArray(value) && value.length) return value.filter(Boolean);
  }

  return [];
};

const mapMessageRecord = (record) => {
  const senderRecord = record?.expand?.sender;
  const rawKind = String(record?.kind || "").toLowerCase();
  const isSystem = rawKind === "system";
  const isAssistantReply = rawKind === ASSISTANT_REPLY_MESSAGE_KIND;
  const isAssistantUser = rawKind === ASSISTANT_USER_MESSAGE_KIND;
  const rawText = resolveMessageText(record);
  // Image payload parsing is harmless for text-only encrypted messages; it
  // only returns data for the dedicated encrypted image prefix.
  const imagePayload = messageKindIsPlainText(rawKind)
    ? null
    : decryptChatImagePayload(rawText);
  const imagePayloadUrl = imagePayload?.dataUri || null;
  const imageFiles = resolveMessageImageFiles(record);
  const imageUrls = imageFiles.filter(Boolean).map((fileName) => {
    const token = pb?.authStore?.token;
    const options = token ? { token } : undefined;
    return pb.files.getUrl(record, fileName, options);
  });

  if (imagePayloadUrl) {
    imageUrls.unshift(imagePayloadUrl);
  }

  const mappedKind =
    record.kind || (imagePayloadUrl || imagePayload?.error ? "image" : "text");
  const mappedText = imagePayload
    ? imagePayload.caption || imagePayload.error || ""
    : messageKindIsPlainText(rawKind)
      ? rawText
      : decryptChatText(rawText);

  return {
    id: record.id,
    text: mappedText,
    kind: mappedKind,
    imageUrls,
    imageUrl: imageUrls[0] || null,
    senderId: record.sender || null,
    senderRole:
      senderRecord?.role ||
      (isSystem
        ? "system"
        : isAssistantReply
          ? "assistant"
          : isAssistantUser
            ? "user"
            : "user"),
    senderName:
      senderRecord?.name ||
      (isSystem
        ? "System"
        : isAssistantReply
          ? "Health Assistant"
          : isAssistantUser
            ? "You"
            : "User"),
    time: formatTimeValue(record.created),
    created: record.created,
    raw: record,
  };
};

const messagePreviewText = (mappedMessage) => {
  if (!mappedMessage) return "";
  if (mappedMessage.imageUrl) return "Photo";
  if (mappedMessage.kind === "image") return "Photo";
  if (mappedMessage.kind === "system") return mappedMessage.text || "";
  return mappedMessage.text || "";
};

const woundRecordImageUrl = (record) => {
  if (!record?.image) return null;
  const names = Array.isArray(record.image) ? record.image : [record.image];
  const first = names.find(Boolean);
  if (!first) return null;
  const token = pb?.authStore?.token;
  return pb.files.getUrl(record, first, token ? { token } : undefined);
};

const patientProfileFileUrl = (profile, fieldName) => {
  if (!profile?.[fieldName] || !profile.id) return null;
  const raw = profile[fieldName];
  const names = Array.isArray(raw) ? raw : [raw];
  const first = names.find(Boolean);
  if (!first) return null;
  const token = pb?.authStore?.token;
  return pb.files.getUrl(profile, first, token ? { token } : undefined);
};

const patientProfileAvatarUrl = (profile) =>
  patientProfileFileUrl(profile, "avatar") ||
  patientProfileFileUrl(profile, "photo") ||
  patientProfileFileUrl(profile, "profile_image");

const patientProfilePhoneRaw = (profile) =>
  profile?.phone ||
  profile?.mobile ||
  profile?.phone_number ||
  profile?.tel ||
  "";

const formatPhoneForDisplay = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (String(value || "").trim()) return String(value).trim();
  return "";
};

// Patient health profile fields shared by signup and edit-profile.
// These align with Version 1.0 launch spec (age, lifestyle, weight/height,
// marital status, medical conditions, location district/state, allergies).
const MARITAL_STATUS_OPTIONS = [
  { id: "single", label: "Single" },
  { id: "married", label: "Married" },
  { id: "divorced", label: "Divorced" },
  { id: "widowed", label: "Widowed" },
  { id: "prefer_not_to_say", label: "Prefer not to say" },
];

const SMOKING_OPTIONS = [
  { id: "never", label: "Never" },
  { id: "former", label: "Former" },
  { id: "occasionally", label: "Occasionally" },
  { id: "current", label: "Current" },
];

const ALCOHOL_OPTIONS = [
  { id: "never", label: "Never" },
  { id: "occasional", label: "Occasional" },
  { id: "regular", label: "Regular" },
];

const PATIENT_HEALTH_TEXT_KEYS = [
  "marital_status",
  "district",
  "state",
  "smoking",
  "alcohol",
  "medical_conditions",
  "allergies",
];
const PATIENT_HEALTH_NUMERIC_KEYS = ["age", "weight_kg", "height_cm"];

// Turn the UI-level values object into a plain partial payload suitable for
// PocketBase `patient_profile` create/update. Empty values are omitted.
const buildPatientHealthPayload = (values) => {
  const payload = {};
  if (!values || typeof values !== "object") return payload;
  for (const key of PATIENT_HEALTH_NUMERIC_KEYS) {
    const raw = values[key];
    if (raw === undefined || raw === null) continue;
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    const num = Number(trimmed);
    if (Number.isFinite(num)) payload[key] = num;
  }
  for (const key of PATIENT_HEALTH_TEXT_KEYS) {
    const value = String(values?.[key] ?? "").trim();
    if (value) payload[key] = value;
  }
  return payload;
};

// Step 1 - Launch v1.0: patient signup / profile save must collect every field
// the client spec lists (allergies remain optional for PB compatibility).
const validatePatientHealthProfileComplete = (values) => {
  const v = values || {};
  const missingLabels = [];
  const need = (key, label) => {
    const s = String(v[key] ?? "").trim();
    if (!s) missingLabels.push(label);
  };
  need("age", "age");
  need("weight_kg", "weight (kg)");
  need("height_cm", "height (cm)");
  need("marital_status", "marital status");
  need("district", "district");
  need("state", "state");
  need("smoking", "smoking");
  need("alcohol", "alcohol use");
  need("medical_conditions", "medical conditions");
  if (missingLabels.length) {
    return `Please complete your profile: ${missingLabels.join(", ")}.`;
  }
  const ageNum = Number(String(v.age).trim());
  if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 130) {
    return "Please enter a valid age.";
  }
  const w = Number(String(v.weight_kg).trim());
  if (!Number.isFinite(w) || w < 1 || w > 500) {
    return "Please enter a valid weight in kg.";
  }
  const h = Number(String(v.height_cm).trim());
  if (!Number.isFinite(h) || h < 30 || h > 280) {
    return "Please enter a valid height in cm.";
  }
  return null;
};

// Pull stored values back out of a PocketBase patient_profile record into the
// shape the form uses (strings, so TextInput can render them).
const patientHealthValuesFromProfile = (profile) => ({
  age: profile?.age != null ? String(profile.age) : "",
  weight_kg: profile?.weight_kg != null ? String(profile.weight_kg) : "",
  height_cm: profile?.height_cm != null ? String(profile.height_cm) : "",
  marital_status: String(profile?.marital_status || ""),
  district: String(profile?.district || ""),
  state: String(profile?.state || ""),
  smoking: String(profile?.smoking || ""),
  alcohol: String(profile?.alcohol || ""),
  medical_conditions: String(profile?.medical_conditions || ""),
  allergies: String(profile?.allergies || ""),
});

const emptyPatientHealthValues = () => ({
  age: "",
  weight_kg: "",
  height_cm: "",
  marital_status: "",
  district: "",
  state: "",
  smoking: "",
  alcohol: "",
  medical_conditions: "",
  allergies: "",
});

const PatientHealthProfileFields = ({
  palette,
  values,
  onChange,
  disabled,
}) => {
  const labelStyle = {
    fontSize: RFValue(13),
    fontWeight: "700",
    color: palette.textSecondary,
    marginBottom: RFValue(8),
  };
  const sectionStyle = {
    fontSize: RFValue(12),
    fontWeight: "800",
    color: palette.textTertiary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: RFValue(8),
    marginBottom: RFValue(10),
  };
  const inputStyle = {
    backgroundColor: palette.card,
    borderRadius: RFValue(14),
    paddingHorizontal: RFValue(16),
    paddingVertical: RFValue(14),
    marginBottom: RFValue(12),
    borderWidth: 1,
    borderColor: palette.border,
    fontSize: RFValue(15),
    color: palette.textPrimary,
  };

  const renderText = (key, label, placeholder, keyboardType) => (
    <View>
      <Text style={labelStyle}>{label}</Text>
      <TextInput
        value={String(values?.[key] ?? "")}
        onChangeText={(v) => onChange(key, v)}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        keyboardType={keyboardType || "default"}
        editable={!disabled}
        style={inputStyle}
      />
    </View>
  );

  const renderChips = (key, label, options) => (
    <View>
      <Text style={labelStyle}>{label}</Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          marginBottom: RFValue(12),
        }}
      >
        {options.map((option) => {
          const active = values?.[key] === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              onPress={() =>
                !disabled && onChange(key, active ? "" : option.id)
              }
              disabled={disabled}
              style={{
                paddingHorizontal: RFValue(14),
                paddingVertical: RFValue(9),
                borderRadius: RFValue(12),
                backgroundColor: active ? palette.accent : palette.card,
                borderWidth: 1,
                borderColor: active ? palette.accent : palette.border,
                marginRight: RFValue(8),
                marginBottom: RFValue(8),
                opacity: disabled ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: RFValue(13),
                  color: active ? palette.accentText : palette.textPrimary,
                }}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View>
      <Text style={sectionStyle}>Basics</Text>
      {renderText("age", "Age", "e.g. 34", "numeric")}
      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1, marginRight: RFValue(8) }}>
          {renderText("weight_kg", "Weight (kg)", "e.g. 72", "numeric")}
        </View>
        <View style={{ flex: 1, marginLeft: RFValue(8) }}>
          {renderText("height_cm", "Height (cm)", "e.g. 168", "numeric")}
        </View>
      </View>
      {renderChips("marital_status", "Marital status", MARITAL_STATUS_OPTIONS)}

      <Text style={sectionStyle}>Lifestyle</Text>
      {renderChips("smoking", "Smoking", SMOKING_OPTIONS)}
      {renderChips("alcohol", "Alcohol", ALCOHOL_OPTIONS)}

      <Text style={sectionStyle}>Location</Text>
      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1, marginRight: RFValue(8) }}>
          {renderText("district", "District", "e.g. Pune")}
        </View>
        <View style={{ flex: 1, marginLeft: RFValue(8) }}>
          {renderText("state", "State", "e.g. Maharashtra")}
        </View>
      </View>

      <Text style={sectionStyle}>Medical</Text>
      {renderText(
        "medical_conditions",
        "Medical conditions",
        "e.g. diabetes, hypertension, asthma",
      )}
      {renderText(
        "allergies",
        "Allergies (optional)",
        "e.g. penicillin, peanuts",
      )}
    </View>
  );
};

const mapWoundRecord = (record) => ({
  id: record.id,
  patient: record.patient || null,
  patientId: record.patient || null,
  patientName: record.expand?.patient?.name || record.patientName || "Patient",
  description: record.description || "",
  notes: record.notes || "",
  severity: record.severity || "moderate",
  status: humanizeWoundStatus(record.status),
  statusKey: normalizeWoundStatus(record.status),
  date: formatDateValue(record.created),
  image: record.image || null,
  imageUrl: woundRecordImageUrl(record),
  doctor: record.doctor || null,
  conversation: record.conversation || null,
  hasPharmacy: !!record.hasPharmacy,
  raw: record,
});

// Predefined health-concern tags for the Find Doctor chip bar. The list is
// intentionally small and user-visible; new concerns a doctor adds on their
// profile (JSON array) are merged in dynamically below.
const CONCERN_CHIP_OPTIONS = [
  { id: "diabetes", label: "Diabetes" },
  { id: "hypertension", label: "Hypertension" },
  { id: "cardiology", label: "Cardiology" },
  { id: "dermatology", label: "Dermatology / Skin" },
  { id: "pediatrics", label: "Pediatrics" },
  { id: "gynecology", label: "Gynecology" },
  { id: "orthopedics", label: "Orthopedics" },
  { id: "neurology", label: "Neurology" },
  { id: "mental_health", label: "Mental Health" },
  { id: "ent", label: "ENT" },
  { id: "general", label: "General Physician" },
];

const normalizeConcernTag = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[\s/]+/g, "_");

const parseDoctorConcerns = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(normalizeConcernTag).filter(Boolean);
  }
  if (typeof raw === "object") {
    return Object.values(raw).map(normalizeConcernTag).filter(Boolean);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeConcernTag).filter(Boolean);
      }
    } catch {
      // not JSON, fall through to csv
    }
    return trimmed
      .split(/[,;|]+/)
      .map(normalizeConcernTag)
      .filter(Boolean);
  }
  return [];
};

const mapDoctorListingRecord = (record) => {
  const user = record?.expand?.user;
  const userId = record.user || user?.id || null;
  const token = pb?.authStore?.token;
  const rawAvatar = record.avatar || record.photo || record.profile_image;
  const avatarField = Array.isArray(rawAvatar) ? rawAvatar[0] : rawAvatar;
  const avatarUrl =
    avatarField && record.id
      ? pb.files.getUrl(record, avatarField, token ? { token } : undefined)
      : null;
  const specialty =
    record.specialty ||
    record.department ||
    record.category ||
    record.field ||
    "General Physician";
  const concerns = parseDoctorConcerns(
    record.concerns ||
      record.health_concerns ||
      record.tags ||
      record.specialties,
  );
  const practitionerTier = String(
    record.practitioner_tier ||
      record.tier ||
      record.doctor_class ||
      record.verification_tier ||
      "",
  )
    .trim()
    .toLowerCase();
  const packageSlots = normalizeDoctorPackageSlots(
    packageTemplatesRawFromRecord(record),
  );
  const packagesSetupComplete = doctorProfilePackageFeesReady(record);
  const languageBuckets = [
    ...parseStringArray(record.languages || record.spoken_languages),
    ...parseStringArray(record.language),
  ];
  const languagesMerged = [];
  const languageKeysSeen = new Set();
  for (const rawLang of languageBuckets) {
    const piece = String(rawLang || "").trim();
    if (!piece) continue;
    const dedupeKey = piece.toLowerCase();
    if (languageKeysSeen.has(dedupeKey)) continue;
    languageKeysSeen.add(dedupeKey);
    languagesMerged.push(piece);
  }
  return {
    profileId: record.id,
    userId,
    name: user?.name || record.full_name || record.display_name || "Doctor",
    practitionerTier: practitionerTier || "professional",
    packageSlots,
    packagesSetupComplete,
    specialty: String(specialty),
    experience:
      record.experience_years ??
      record.years_experience ??
      record.experience ??
      null,
    fee: Number(record.consultation_fee ?? record.fee ?? 500) || 500,
    rating: Number(record.rating ?? 4.8) || 4.8,
    bio: record.bio || record.about || "",
    clinicOrHospital:
      record.clinic_or_hospital || record.workplace || record.hospital || "",
    languages: languagesMerged,
    concerns,
    avatarUrl,
    raw: record,
  };
};

// Match a doctor against a selected concern chip. Primary signal is the
// `concerns` JSON array the doctor saved on their profile. When that's empty
// or doesn't include the chip, we fall back to a case-insensitive substring
// match against the doctor's specialty / bio / clinic text so existing
// approved doctors (who haven't filled in concerns yet) still show up.
const doctorMatchesConcern = (doctor, concernId) => {
  if (!concernId) return true;
  const normalized = normalizeConcernTag(concernId);
  if (!normalized) return true;
  if ((doctor.concerns || []).includes(normalized)) return true;
  const chip = CONCERN_CHIP_OPTIONS.find((item) => item.id === concernId);
  const needles = [normalized.replace(/_/g, " "), chip?.label || ""]
    .map((value) => String(value).toLowerCase().trim())
    .filter(Boolean);
  const haystack =
    `${doctor.specialty || ""} ${doctor.bio || ""} ${doctor.clinicOrHospital || ""}`.toLowerCase();
  return needles.some((needle) => needle && haystack.includes(needle));
};

const doctorMatchesPatientHealthFocus = (doctor, patientProfile) => {
  const focus = (
    patientProfile?.primary_condition ||
    patientProfile?.condition ||
    ""
  )
    .trim()
    .toLowerCase();
  if (!focus) return true;
  const haystack =
    `${doctor.specialty || ""} ${doctor.bio || ""} ${doctor.clinicOrHospital || ""}`.toLowerCase();
  if (haystack.includes(focus)) return true;
  return focus
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .some((word) => haystack.includes(word));
};

const COMFORT_LANGUAGE_ANY = "__any__";

const normalizeComfortLanguage = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

// Patient-selected comfortable language: keep only doctors who listed that
// language on their profile. Doctors with no languages are hidden when a
// specific language is selected.
const doctorMatchesComfortLanguage = (doctor, filterToken) => {
  if (!filterToken || filterToken === COMFORT_LANGUAGE_ANY) return true;
  const want = normalizeComfortLanguage(filterToken);
  if (!want) return true;
  const spoken = (doctor.languages || [])
    .map((lang) => normalizeComfortLanguage(lang))
    .filter(Boolean);
  if (!spoken.length) return false;
  return spoken.some((lang) => {
    if (lang === want) return true;
    if (lang.length < 3 || want.length < 3) return false;
    return lang.includes(want) || want.includes(lang);
  });
};

// Generic helper that tries to read a JSON-ish value (array/object) off a
// PocketBase record field that might come back as an actual array/object,
// a JSON-encoded string, or a comma-separated string.
const parseJsonMaybe = (raw, fallback = null) => {
  if (raw === undefined || raw === null) return fallback;
  if (Array.isArray(raw) || typeof raw === "object") return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return fallback;
};

const parseStringArray = (raw) => {
  const value = parseJsonMaybe(raw);
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;|\n]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (typeof value === "object") {
    return Object.values(value)
      .map((v) => String(v || "").trim())
      .filter(Boolean);
  }
  return [];
};

// Matches PocketBase `hospitals` collection (admin-created):
//   name, address, district, state, phone, specialties, image
const mapHospitalRecord = (record) => {
  const token = pb?.authStore?.token;
  const rawImage = record.image || record.photo || record.cover;
  const imageField = Array.isArray(rawImage) ? rawImage[0] : rawImage;
  const imageUrl =
    imageField && record.id
      ? pb.files.getUrl(record, imageField, token ? { token } : undefined)
      : null;
  return {
    id: record.id,
    name: record.name || record.title || "Hospital",
    address: record.address || record.location || "",
    district: String(record.district || "").trim(),
    state: String(record.state || "").trim(),
    phone: String(record.phone || record.contact || "").trim(),
    specialties: parseStringArray(
      record.specialties || record.departments || record.tags,
    ),
    imageUrl,
    raw: record,
  };
};

// Matches PocketBase `pharmacy_profile` (existing) + Launch v1.0 additions:
//   user, (pre-existing fields)
//   + address, district, state, phone,
//   + opening_hours (JSON: { mon:"09:00-21:00", ... }),
//   + closing_days (JSON array of "mon"/"sun" etc.),
//   + products (JSON array of { name, price, notes }).
const mapPharmacyListingRecord = (record) => {
  const user = record?.expand?.user;
  const userId = record.user || user?.id || null;
  const token = pb?.authStore?.token;
  const rawLogo = record.logo || record.avatar || record.photo || record.image;
  const logoField = Array.isArray(rawLogo) ? rawLogo[0] : rawLogo;
  const logoUrl =
    logoField && record.id
      ? pb.files.getUrl(record, logoField, token ? { token } : undefined)
      : null;
  const hoursRaw = parseJsonMaybe(record.opening_hours, null);
  const openingHours =
    hoursRaw && typeof hoursRaw === "object" && !Array.isArray(hoursRaw)
      ? hoursRaw
      : null;
  const closingDays = parseStringArray(record.closing_days).map((d) =>
    String(d).toLowerCase().slice(0, 3),
  );
  const productsRaw = parseJsonMaybe(record.products, []);
  const products = Array.isArray(productsRaw)
    ? productsRaw
        .map((item) => {
          if (!item) return null;
          if (typeof item === "string") {
            const label = item.trim();
            return label ? { name: label, price: "", notes: "" } : null;
          }
          if (typeof item === "object") {
            const name = String(item.name || item.title || "").trim();
            if (!name) return null;
            const price = String(item.price || item.cost || "").trim();
            const notes = String(item.notes || item.note || "").trim();
            return { name, price, notes };
          }
          return null;
        })
        .filter(Boolean)
    : [];
  return {
    id: record.id,
    profileId: record.id,
    userId,
    name:
      record.store_name ||
      record.name ||
      user?.name ||
      record.display_name ||
      "Pharmacy",
    tagline: String(record.tagline || record.description || "").trim(),
    address: String(record.address || record.location || "").trim(),
    district: String(record.district || "").trim(),
    state: String(record.state || "").trim(),
    phone: String(record.phone || record.contact || "").trim(),
    email: user?.email || "",
    openingHours,
    closingDays,
    products,
    logoUrl,
    raw: record,
  };
};

const mapAppointmentRecord = (record) => {
  const doctor = record.expand?.doctor;
  const doctorUser = doctor?.expand?.user;
  const patient = record.expand?.patient;
  const scheduledAt =
    record.scheduled_at || record.scheduledAt || record.date || record.when;
  const rawStatus = record.status || "scheduled";
  const doctorUserIdFromExpand =
    doctorUser?.id ||
    (typeof doctor?.user === "string" ? doctor.user : null) ||
    null;
  const doctorUserIdFromRecord =
    typeof record.doctor === "string" ? record.doctor : null;
  const reasonStr = String(record.reason || "").trim();
  const replyStr = String(record.reply || record.doctor_reply || "").trim();
  const rescheduleProposal = parseApptRescheduleFromReply(replyStr);
  const isPackageDemoMeeting = reasonStr.includes("NVHS_MEETING_WORKFLOW");
  let packageOfferId = null;
  let packageRequestLabel = null;
  let demoConversationId = null;
  let meetingWorkflowStatus = null;
  if (isPackageDemoMeeting) {
    try {
      const wf = decodeMeetingWorkflowFromAppointmentRow(record);
      packageOfferId = String(wf.package_offer_id || "").trim() || null;
      packageRequestLabel =
        String(wf.package_request_label || "").trim() || null;
      demoConversationId = String(wf.demo_conversation_id || "").trim() || null;
      meetingWorkflowStatus = String(wf.status || "").trim() || null;
    } catch {
      // ignore decode issues
    }
  }
  return {
    id: record.id,
    scheduledAt,
    consultationType:
      record.consultation_type ||
      record.consultationType ||
      record.type ||
      "video",
    status: rawStatus,
    statusKey: normalizeAppointmentStatus(rawStatus),
    reason: reasonStr,
    reply: replyStr,
    rescheduleProposal,
    isPackageDemoMeeting,
    packageOfferId,
    packageRequestLabel,
    demoConversationId,
    meetingWorkflowStatus,
    conversationId: record.conversation || null,
    patientId: record.patient || null,
    patientName:
      patient?.name || patient?.full_name || record.patient_name || "Patient",
    doctorUserId: doctorUserIdFromExpand || doctorUserIdFromRecord,
    doctorName:
      doctorUser?.name ||
      doctor?.name ||
      doctor?.full_name ||
      record.doctor_name ||
      "Doctor",
    doctorId: record.doctor || null,
    consultationFee:
      Number(
        record.consultation_fee ??
          record.fee ??
          doctor?.consultation_fee ??
          doctor?.fee ??
          500,
      ) || 500,
    raw: record,
  };
};

const mapOrderRecord = (record) => {
  const itemsList = normalizeOrderItemsList(record);
  const diagnosis = String(
    record?.diagnosis ||
      record?.disease ||
      record?.condition ||
      record?.condition_for ||
      record?.prescription_for ||
      "",
  ).trim();
  const woundExpand = record.expand?.wound;
  const doctorUser =
    woundExpand?.expand?.doctor ||
    woundExpand?.expand?.assigned_doctor ||
    record.expand?.doctor;
  const doctorName =
    doctorUser?.name ||
    doctorUser?.full_name ||
    record.expand?.doctor_profile?.expand?.user?.name ||
    "Attending physician";
  const itemsText =
    itemsList.length > 0
      ? formatPrescriptionSummaryText(itemsList, diagnosis)
      : safeArray(record.items).join(", ") || "Medicine items";
  const pharmacyUser = record.expand?.pharmacy;
  const pharmacyUserId =
    (typeof record.pharmacy === "string" ? record.pharmacy : null) ||
    pharmacyUser?.id ||
    null;
  const pharmacyName =
    pharmacyUser?.name ||
    pharmacyUser?.expand?.pharmacy_profile?.store_name ||
    "";
  const note = String(record.note || record.notes || "").trim();
  // "pharmacy_order" = patient placed this with a specific pharmacy from
  // the directory. "prescription_order" = doctor's prescribe flow auto-created
  // the order for any pharmacy.
  const orderKind = pharmacyUserId ? "pharmacy_order" : "prescription_order";
  return {
    id: record.id,
    wound: record.wound || null,
    conversation: record.conversation || null,
    patient: record.expand?.patient?.name || "Patient",
    patientId: record.patient || null,
    pharmacyId: pharmacyUserId,
    pharmacyName,
    kind: orderKind,
    note,
    itemsList,
    items: itemsText,
    diagnosis: diagnosis || null,
    doctorName,
    totalAmount: Number(record.totalAmount || 0),
    total: formatCurrency(record.totalAmount || 0),
    status: humanizeOrderStatus(record.status),
    statusKey: normalizeOrderStatus(record.status),
    time: formatTimeValue(record.updated || record.created),
    raw: record,
  };
};

const mapPrescriptionRecord = (record) => {
  const itemsList = normalizeOrderItemsList(record);
  const diagnosis = String(record?.notes || "").trim();
  const doctorUser = record?.expand?.doctor;
  const doctorName =
    doctorUser?.name || doctorUser?.full_name || "Attending physician";
  const itemsText =
    itemsList.length > 0
      ? formatPrescriptionSummaryText(itemsList, diagnosis)
      : "Medicine items";
  return {
    id: record.id,
    wound: record.wound || null,
    conversation: record.conversation || null,
    patientId: record.patient || null,
    patientName: record.expand?.patient?.name || "Patient",
    doctorId: record.doctor || null,
    itemsList,
    items: itemsText,
    diagnosis: diagnosis || null,
    doctorName,
    date: formatDateValue(record.created),
    time: formatTimeValue(record.created),
    raw: record,
  };
};

const mapConversationRecord = (record, currentUserId, previewMap = {}) => {
  const members = safeArray(record.expand?.members);
  const otherMembers = members.filter((member) => member.id !== currentUserId);
  const memberRoles = uniqueIds(otherMembers.map((member) => member.role));
  const linkedWound = record.expand?.linkedWound;
  const preview = previewMap[record.id];
  // Step 9: AI assistant conversations are marked with `kind: "assistant"`
  // on the record. They carry only one member (the patient themselves) and
  // should show up first with a distinct name, icon, and role label.
  const conversationKind = String(record.kind || "").toLowerCase();
  const isAssistant = conversationKind === ASSISTANT_CONVERSATION_KIND;
  const displayName = isAssistant
    ? "Health Assistant"
    : record.title ||
      (otherMembers.length > 0
        ? otherMembers.map((member) => member.name || member.role).join(", ")
        : "Conversation");
  const fallbackTitle = linkedWound
    ? buildConversationTitle(linkedWound)
    : null;
  const linkedWoundDescription =
    linkedWound?.description || record.title || displayName;
  return {
    id: record.id,
    kind: isAssistant ? ASSISTANT_CONVERSATION_KIND : "direct",
    title: isAssistant
      ? "Health Assistant"
      : record.title || fallbackTitle || displayName,
    linkedWoundId: record.linkedWound || linkedWound?.id || null,
    linkedWoundDescription,
    members: safeArray(record.members),
    memberUsers: members,
    displayName,
    roleLabel: isAssistant
      ? "AI · Ask anything"
      : memberRoles.length > 0
        ? memberRoles.join(", ")
        : linkedWound
          ? "Wound Case"
          : "Chat",
    status: isAssistant ? "Always available" : "Online",
    image: isAssistant
      ? "sparkles"
      : linkedWound
        ? "bandage-outline"
        : memberRoles.includes("pharmacy")
          ? "leaf"
          : memberRoles.includes("doctor")
            ? "medical"
            : "chatbubble-ellipses",
    lastMsg:
      messagePreviewText(preview) ||
      (isAssistant
        ? "Ask about symptoms, medicine, or your prescriptions."
        : linkedWound?.description || "Tap to open conversation"),
    time: formatTimeValue(
      record.lastMessageAt || record.updated || record.created,
    ),
    unread: 0,
    raw: record,
  };
};

const normalizeDoctorApplicationStatus = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "pending";
  if (normalized === "approved") return "approved";
  if (normalized === "rejected" || normalized === "rejection")
    return "rejection";
  if (normalized === "pending") return "pending";
  return "pending";
};

const doctorStatusLabelFor = (value) => {
  const status = normalizeDoctorApplicationStatus(value);
  if (status === "approved") return "Approved";
  if (status === "rejection") return "Rejected";
  return "Pending";
};

const doctorStatusToneFor = (theme, value) => {
  const status = normalizeDoctorApplicationStatus(value);
  if (status === "approved") {
    return { bg: theme.successLight, color: theme.success };
  }
  if (status === "rejection") {
    return { bg: theme.dangerLight, color: theme.danger };
  }
  return { bg: theme.warningLight, color: theme.warning };
};

const DoctorApplicationStatusScreen = ({ status, onRefresh, onLogout }) => {
  const { theme } = useTheme();
  const label = doctorStatusLabelFor(status);
  const tone = doctorStatusToneFor(theme, status);
  const normalized = normalizeDoctorApplicationStatus(status);

  const title =
    normalized === "approved" ? "Account Verified" : "Account On Hold";
  const description =
    normalized === "approved"
      ? "Your doctor account is approved. On next login you will set up your three care packages before entering the dashboard."
      : normalized === "rejection"
        ? "Your application was rejected. Please contact support for next steps."
        : "Your registration is waiting for verification. Please submit your documents for verification to info@nvoisyshealth.com. When verification is complete, the agent will approve your request - then you can log in, define your three packages, and start seeing patients.";

  useEffect(() => {
    if (normalized !== "pending") return;
    let cancelled = false;
    (async () => {
      try {
        const granted = await ensureReminderPermissions();
        if (!granted || cancelled) return;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Doctor verification",
            body: "Please submit your verification documents to info@nvoisyshealth.com.",
          },
          trigger: null,
        });
      } catch (error) {
        console.log(
          "doctor verification notification skipped:",
          error?.message,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalized]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View style={{ flex: 1, justifyContent: "center", padding: RFValue(20) }}>
        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: RFValue(22),
            padding: RFValue(20),
            borderWidth: 1,
            borderColor: theme.cardBorder,
            shadowColor: theme.shadowColor,
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 16,
            elevation: 3,
          }}
        >
          <View style={{ alignItems: "center", marginBottom: RFValue(14) }}>
            <View
              style={{
                width: RFValue(74),
                height: RFValue(74),
                borderRadius: RFValue(22),
                backgroundColor: tone.bg,
                justifyContent: "center",
                alignItems: "center",
                marginBottom: RFValue(12),
              }}
            >
              <Ionicons
                name={
                  normalized === "approved"
                    ? "checkmark-circle"
                    : normalized === "rejection"
                      ? "close-circle"
                      : "time"
                }
                size={RFValue(34)}
                color={tone.color}
              />
            </View>
            <Text
              style={{
                fontSize: RFValue(20),
                fontWeight: "900",
                color: theme.textPrimary,
                textAlign: "center",
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                marginTop: RFValue(8),
                fontSize: RFValue(13),
                fontWeight: "700",
                color: theme.textSecondary,
                textAlign: "center",
              }}
            >
              Status: {label}
            </Text>
            <Text
              style={{
                marginTop: RFValue(10),
                fontSize: RFValue(13),
                color: theme.textSecondary,
                textAlign: "center",
                lineHeight: RFValue(20),
              }}
            >
              {description}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onRefresh}
            style={{
              backgroundColor: theme.accent,
              borderRadius: RFValue(16),
              paddingVertical: RFValue(14),
              alignItems: "center",
              marginTop: RFValue(10),
            }}
          >
            <Text style={{ color: "#FFF", fontWeight: "800" }}>
              Refresh Status
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onLogout}
            style={{
              backgroundColor: theme.bg,
              borderRadius: RFValue(16),
              paddingVertical: RFValue(14),
              alignItems: "center",
              marginTop: RFValue(10),
              borderWidth: 1,
              borderColor: theme.inputBorder,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontWeight: "800" }}>
              Logout
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

// --- RESPONSIVE SCALING ---
// Scale from the *smaller* of width/height vs design baseline so tablets do not
// pick up huge typography from the long edge. Tight caps on tablets/foldables.
const getDeviceTypeForWindow = (width, height) => {
  const smallestSide = Math.min(width, height);
  const largestSide = Math.max(width, height);
  if (smallestSide >= 600) return "tablet";
  if (largestSide >= 850 && smallestSide >= 400) return "foldable";
  return "phone";
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHORT_SIDE = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT);
const DEVICE_TYPE = getDeviceTypeForWindow(SCREEN_WIDTH, SCREEN_HEIGHT);

const DESIGN_WIDTH = 375;
const DESIGN_HEIGHT = 812;
const scaleByWidth = SCREEN_WIDTH / DESIGN_WIDTH;
const scaleByHeight = SCREEN_HEIGHT / DESIGN_HEIGHT;
const rawScale = Math.min(scaleByWidth, scaleByHeight);

const getUIScale = () => {
  if (DEVICE_TYPE === "tablet") {
    return Math.min(Math.max(rawScale, 0.9), 1.06);
  }
  if (DEVICE_TYPE === "foldable") {
    return Math.min(Math.max(rawScale, 0.85), 1.12);
  }
  return Math.min(Math.max(rawScale, 0.82), 1.18);
};

const UI_SCALE = getUIScale();

const RFValue = (size) =>
  Math.round(PixelRatio.roundToNearestPixel(size * UI_SCALE));

const safeHeaderPaddingTop = (base = 16) => {
  if (Platform.OS !== "android") return RFValue(base);
  return Math.max(RFValue(base), (StatusBar.currentHeight || 0) + RFValue(8));
};

/**
 * Top padding for the first visible block when the screen's outer
 * `SafeAreaView` uses `edges` without `'top'`. That way the status-bar /
 * notch region is filled by the *same* background as the header (purple,
 * white, etc.) - no separate strip of `theme.bg` above it.
 * Do not add this on top of a parent `SafeAreaView` that already includes
 * `'top'` in `edges` - that double-counts the inset and leaves a large gap.
 */
const safeTopContentPadding = (insets, extraRf = 14) => {
  const insetTop = Number(insets?.top) || 0;
  const statusH = Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0;
  return Math.max(insetTop, statusH) + RFValue(extraRf);
};

const RFText = (size, options = {}) => {
  const min = options.min ?? 0.82;
  const cap =
    options.max ??
    (DEVICE_TYPE === "tablet"
      ? 1.06
      : DEVICE_TYPE === "foldable"
        ? 1.12
        : 1.18);
  const s = Math.min(Math.max(UI_SCALE, min), cap);
  return Math.round(PixelRatio.roundToNearestPixel(size * s));
};

const rw = (percentage) => Math.round(SCREEN_WIDTH * (percentage / 100));
const rh = (percentage) => Math.round(SCREEN_HEIGHT * (percentage / 100));

const rs = (size) => Math.round(size * UI_SCALE);

const ri = (size) => {
  const iconCap = DEVICE_TYPE === "tablet" ? 1.06 : 1.14;
  const s = Math.min(UI_SCALE * 1.04, iconCap);
  return Math.round(PixelRatio.roundToNearestPixel(size * s));
};

/**
 * Scroll content gutter above the tab bar. The custom tab bar is a flex
 * sibling (not overlaying the scroll view), so only a small tail padding is
 * needed - large values created empty bands on Profile, Home, Wound detail, etc.
 */
const tabScrollBottomPadding = () => RFValue(8);

/**
 * Android IME draws a suggestion/toolbar row above the keys that
 * `adjustResize` + `KeyboardAvoidingView` often still overlap slightly.
 * Derive a small composer-only margin from the reported keyboard height
 * (clamped) so tall keyboards do not create a large empty band.
 */
const androidComposerKeyboardLift = (e) => {
  const h = Number(e?.endCoordinates?.height) || 0;
  if (h <= 0) return 0;
  const logical = Math.min(46, Math.max(22, Math.round(h * 0.088)));
  return RFValue(logical);
};

const ResponsiveInfo = {
  deviceType: DEVICE_TYPE,
  screenWidth: SCREEN_WIDTH,
  screenHeight: SCREEN_HEIGHT,
  shortSide: SHORT_SIDE,
  scale: UI_SCALE,
  isTablet: DEVICE_TYPE === "tablet",
  isFoldable: DEVICE_TYPE === "foldable",
  isPhone: DEVICE_TYPE === "phone",
};

// --- RESPONSIVE COMPONENTS ---

// Auto-adjusting card component
const ResponsiveCard = ({ children, style, ...props }) => {
  const padding = rs(16);
  const borderRadius = rs(20);
  const shadowRadius = rs(12);

  return (
    <View
      style={[
        {
          backgroundColor: "#FFFFFF",
          borderRadius,
          padding,
          marginBottom: rs(16),
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius,
          elevation: 3,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};

// Auto-adjusting text component
const ResponsiveText = ({
  children,
  style,
  size = 14,
  weight = 400,
  ...props
}) => {
  const fontSize = RFText(size);
  const lineHeight = Math.round(fontSize * 1.4);

  return (
    <Text
      style={[
        {
          fontSize,
          lineHeight,
          fontWeight:
            weight === "bold" ? "700" : weight === "semi" ? "600" : weight,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
};

// Auto-adjusting button with minimum touch target
const ResponsiveButton = ({ children, onPress, style, disabled, ...props }) => {
  const minTouchTarget = 44;
  const buttonHeight = Math.max(rs(48), minTouchTarget);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          minHeight: buttonHeight,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: rs(16),
          paddingHorizontal: rs(20),
          paddingVertical: rs(14),
        },
        style,
      ]}
      {...props}
    >
      {children}
    </TouchableOpacity>
  );
};

// Auto-adjusting grid that adapts columns based on screen width
const ResponsiveGrid = ({ children, columns = 4, spacing = 8, style }) => {
  const colWidth = 100 / columns;

  return (
    <View style={[styles.gridContainer, { flexWrap: "wrap" }, style]}>
      {React.Children.map(children, (child, index) => (
        <View
          key={index}
          style={{
            width: `${colWidth}%`,
            padding: rs(spacing) / 2,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
};

// Auto-adjusting icon container
const ResponsiveIcon = ({ name, color, size = 24, ...props }) => {
  const iconSize = ri(size);

  return (
    <View
      style={{
        width: iconSize,
        height: iconSize,
        justifyContent: "center",
        alignItems: "center",
      }}
      {...props}
    >
      <Ionicons name={name} size={iconSize} color={color} />
    </View>
  );
};

// Inline styles for grid container
const styles = {
  gridContainer: {
    flexDirection: "row",
  },
};

// --- ANIMATION WRAPPERS ---
const EASE_OUT_CUBIC = Easing.out(Easing.cubic);

// Calm entrance: short travel + cubic ease-out (avoids “linear slide” feel).
const FadeInView = ({ children, style, delay = 0 }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay,
        easing: EASE_OUT_CUBIC,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay,
        easing: EASE_OUT_CUBIC,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, fadeAnim, slideAnim]);

  return (
    <Animated.View
      style={[
        style,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const AnimatedTouchable = ({ children, style, onPress, ...props }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pressSpring = {
    useNativeDriver: true,
    friction: 7,
    tension: 220,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.01,
  };

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      ...pressSpring,
      toValue: 0.97,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      ...pressSpring,
      toValue: 1,
      friction: 8,
      tension: 180,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={style}
        {...props}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

const PulseView = ({ children, style }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.04,
          duration: 1400,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1400,
          easing: ease,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  return (
    <Animated.View style={[style, { transform: [{ scale: pulseAnim }] }]}>
      {children}
    </Animated.View>
  );
};

const HeartbeatView = ({ children, style }) => {
  const heartAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const up = Easing.out(Easing.quad);
    const down = Easing.in(Easing.quad);
    const beat = Animated.sequence([
      Animated.timing(heartAnim, {
        toValue: 1.12,
        duration: 180,
        easing: up,
        useNativeDriver: true,
      }),
      Animated.timing(heartAnim, {
        toValue: 1,
        duration: 160,
        easing: down,
        useNativeDriver: true,
      }),
      Animated.timing(heartAnim, {
        toValue: 1.06,
        duration: 200,
        easing: up,
        useNativeDriver: true,
      }),
      Animated.timing(heartAnim, {
        toValue: 1,
        duration: 520,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    Animated.loop(beat, { iterations: -1 }).start();
  }, [heartAnim]);

  return (
    <Animated.View style={[style, { transform: [{ scale: heartAnim }] }]}>
      {children}
    </Animated.View>
  );
};

const GlowView = ({ children, style, glowColor = "#5B21B6", size = 200 }) => {
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const breathe = Easing.inOut(Easing.sin);
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.55,
          duration: 2200,
          easing: breathe,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.08,
          duration: 2200,
          easing: breathe,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [glowAnim]);

  return (
    <View style={[style, { position: "relative" }]}>
      <Animated.View
        style={{
          position: "absolute",
          top: -size / 6,
          left: -size / 6,
          right: -size / 6,
          bottom: -size / 6,
          borderRadius: size / 2,
          backgroundColor: glowColor,
          opacity: glowAnim,
        }}
      />
      {children}
    </View>
  );
};

const AnimatedProgressBar = ({
  progress,
  color = "#111827",
  width = "100%",
}) => {
  const [animatedWidth] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: progress,
      duration: 880,
      delay: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedWidth, progress]);

  return (
    <View
      style={{
        height: RFValue(8),
        backgroundColor: "#E5E7EB",
        borderRadius: RFValue(4),
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={{
          height: "100%",
          width: animatedWidth.interpolate({
            inputRange: [0, 100],
            outputRange: ["0%", "100%"],
          }),
          backgroundColor: color,
          borderRadius: RFValue(4),
        }}
      />
    </View>
  );
};

const BounceView = ({ children, style }) => {
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(bounceAnim, {
      toValue: 1,
      friction: 6,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [bounceAnim]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            {
              scale: bounceAnim.interpolate({
                inputRange: [0, 0.55, 1],
                outputRange: [0.88, 1.03, 1],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const ShakeView = ({ children, style, trigger }) => {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger) {
      const ease = Easing.out(Easing.sin);
      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 8,
          duration: 70,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -8,
          duration: 70,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 5,
          duration: 60,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 90,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [trigger]);

  return (
    <Animated.View style={[style, { transform: [{ translateX: shakeAnim }] }]}>
      {children}
    </Animated.View>
  );
};

const FloatView = ({ children, style, floatRange = 10 }) => {
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 2200,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2200,
          easing: ease,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [floatAnim]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            {
              translateY: floatAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -floatRange],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const RotateView = ({ children, style, duration = 2000 }) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [duration, rotateAnim]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            {
              rotate: rotateAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "360deg"],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

/** Splash logo asset: `assets/logo-nvoisys.svg` (loaded via expo-image, not `uri`). */
const NVOISYS_SPLASH_LOGO = require("./assets/logo-nvoisys.svg");

const COLORS = {
  primary: "#4338CA", // Indigo 700
  primaryLight: "#E0E7FF", // Indigo 100
  success: "#10B981",
  successLight: "#D1FAE5",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  danger: "#EF4444",
  dangerLight: "#FEE2E2",
  background: "#F8FAFC", // Gray 50
  surface: "#FFFFFF",
  textHigh: "#0F172A", // Slate 900
  textMedium: "#475569", // Slate 600
  textLow: "#94A3B8", // Slate 400
  border: "#E2E8F0", // Slate 200
  accent: "#06B6D4",
};

const STYLES = {
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RFValue(20),
    padding: RFValue(20),
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: RFValue(0), height: RFValue(4) },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  title: {
    fontSize: RFValue(11),
    fontWeight: "700",
    color: COLORS.textHigh,
    marginBottom: RFValue(4),
  },
  subtitle: {
    fontSize: RFValue(15),
    color: COLORS.textMedium,
  },
};

const localStyles = {
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: RFValue(16),
  },
  headerTitle: {
    fontSize: RFValue(20),
    fontWeight: "800",
    color: "#1E1B4B",
  },
  headerSubtitle: {
    fontSize: RFValue(12),
    color: "#6B7280",
    marginTop: RFValue(4),
  },
  headerIcon: {
    width: RFValue(36),
    height: RFValue(36),
    borderRadius: RFValue(10),
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: RFValue(12),
  },
  sectionTitle: {
    fontSize: RFValue(16),
    fontWeight: "800",
    color: "#1E1B4B",
  },
  sectionAction: {
    fontSize: RFValue(12),
    fontWeight: "700",
    color: "#4338CA",
  },
};

// --- COMPONENTS ---
const Header = ({ title, subtitle, rightIcon }) => (
  <View style={localStyles.header}>
    <View>
      <Text style={localStyles.headerTitle}>{title}</Text>
      {subtitle && <Text style={localStyles.headerSubtitle}>{subtitle}</Text>}
    </View>
    {rightIcon && (
      <TouchableOpacity style={localStyles.headerIcon}>
        {rightIcon}
      </TouchableOpacity>
    )}
  </View>
);

const SectionTitle = ({ title, actionText, onAction }) => (
  <View style={localStyles.sectionTitleContainer}>
    <Text style={localStyles.sectionTitle}>{title}</Text>
    {actionText && (
      <TouchableOpacity onPress={onAction}>
        <Text style={localStyles.sectionAction}>{actionText}</Text>
      </TouchableOpacity>
    )}
  </View>
);

// --- SLIDE SCREEN (drill-down transition) ---
// Wraps any full-screen drill-down with a spring slide-in from the right.
// Overrides the child's onBack prop so it slides out before unmounting.
const SlideScreen = ({ onBack, children }) => {
  const translateX = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: 0,
      damping: 22,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const slideBack = useCallback(() => {
    Animated.timing(translateX, {
      toValue: SCREEN_WIDTH,
      duration: 220,
      easing: EASE_OUT_CUBIC,
      useNativeDriver: true,
    }).start(() => onBack());
  }, [onBack, translateX]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}
    >
      {React.cloneElement(children, { onBack: slideBack })}
    </Animated.View>
  );
};

// --- PRESS CARD (scale micro-feedback) ---
// Drop-in replacement for TouchableOpacity on any card element.
// Applies a quick scale: 0.98 spring on press so cards feel alive.
const PressCard = ({ onPress, style, children }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () =>
    Animated.spring(scale, {
      toValue: 0.98,
      useNativeDriver: true,
      damping: 15,
      stiffness: 350,
    }).start();

  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      damping: 12,
      stiffness: 200,
    }).start();

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      activeOpacity={1}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

// --- SKELETON SHIMMER ---
// Pulsing placeholder block for loading states.
const SkeletonShimmer = ({ width, height, borderRadius = 8, style }) => {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: "#E5E7EB", opacity },
        style,
      ]}
    />
  );
};

// --- GLASS OVERLAY ---
// Semi-transparent frosted overlay for modal backdrops.
const GlassOverlay = ({ children, style }) => (
  <View
    style={[
      {
        flex: 1,
        backgroundColor: "rgba(8, 12, 28, 0.62)",
        justifyContent: "center",
        alignItems: "center",
        padding: RFValue(24),
      },
      style,
    ]}
  >
    {children}
  </View>
);

// --- SCREENS ---

// 1. Home Dashboard
const PatientPlaceholderScreen = () => (
  <View style={{ flex: 1, backgroundColor: "#F8F9FA" }} />
);

const PatientHomeScreen = () => {
  const { theme } = useTheme();
  const {
    appointments,
    refreshAllData,
    hospitals,
    fetchHospitals,
    patientProfile,
    fetchApprovedDoctors,
    patientCareMode,
    dataLoading,
    CARE_MODE,
    currentUser,
    upgradeToPackageMode,
    requestOpenConversation,
    ensureDirectConversation,
    sendConversationMessage,
    loadConversationMessages,
  } = useAppData();
  const tabNav = useMainTabNav();
  const [quickRequestsRefreshKey, setQuickRequestsRefreshKey] = useState(0);

  const handleOpenOfferConversation = useCallback(
    (conversationId, peerUserId) => {
      requestOpenConversation?.(conversationId, { patientUserId: peerUserId });
      tabNav?.navigateTab?.("Chat");
    },
    [requestOpenConversation, tabNav],
  );

  /**
   * Patient → Doctor chat opener. If the conversation does not exist yet it
   * is created via `ensureDirectConversation`; if it has zero messages we
   * seed it with the meeting/offer history (reason, demo time, package,
   * payment status) so the chat is immediately useful instead of empty.
   */
  const handleOpenChatWithDoctor = useCallback(
    async (doctorUserId, meeting = null, offer = null) => {
      if (!doctorUserId) {
        Alert.alert("Chat", "Doctor info missing on this meeting.");
        return;
      }
      try {
        // Prefer the conversation already linked to this package/demo meeting.
        // Falling back to ensureDirectConversation guarantees a chat exists
        // even for older meetings created before we started linking
        // conversations.
        let cid =
          meeting?.demo_conversation_id || meeting?.conversation_id || null;
        if (!cid && meeting?.id) {
          try {
            cid = await ensurePackageDemoMeetingConversation(meeting.id);
          } catch (e) {
            console.log("ensurePackageDemoMeetingConversation:", e?.message);
          }
        }
        if (!cid) {
          const conv = await ensureDirectConversation(doctorUserId);
          cid = conv?.id || null;
        }
        if (!cid) {
          Alert.alert("Chat", "Could not open the chat with this doctor.");
          return;
        }
        try {
          const existing = await loadConversationMessages(cid);
          if (!existing || existing.length === 0) {
            const lines = [];
            if (meeting?.description) {
              lines.push(`Reason: ${meeting.description}`);
            }
            const meetingTime =
              meeting?.confirmed_at ||
              meeting?.patient_selected_slot ||
              meeting?.proposed_at ||
              null;
            if (meetingTime) {
              const when = new Date(meetingTime).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              });
              lines.push(`Demo confirmed: ${when}.`);
            }
            if (offer?.title) {
              lines.push(
                `Package: ${offer.title} - ₹${offer.amount_inr ?? "-"}.`,
              );
            }
            if (String(offer?.status || "").toLowerCase() === "paid") {
              lines.push(
                `Payment received${
                  offer?.amount_inr ? ` (₹${offer.amount_inr})` : ""
                }. Looking forward to working with you.`,
              );
            }
            for (const line of lines) {
              try {
                await sendConversationMessage(cid, line);
              } catch {
                // best-effort seed
              }
            }
          }
        } catch (seedErr) {
          console.log("handleOpenChatWithDoctor seed:", seedErr?.message);
        }
        requestOpenConversation?.(cid, { patientUserId: doctorUserId });
        tabNav?.navigateTab?.("Chat");
      } catch (error) {
        Alert.alert(
          "Chat",
          error?.message || "Could not open chat with this doctor.",
        );
      }
    },
    [
      ensureDirectConversation,
      ensurePackageDemoMeetingConversation,
      loadConversationMessages,
      sendConversationMessage,
      requestOpenConversation,
      tabNav,
    ],
  );

  const handleAfterPackagePayment = useCallback(
    async ({ doctorUserId, packageTitle, amount }) => {
      if (!doctorUserId) return null;
      try {
        const conv = await ensureDirectConversation(doctorUserId);
        const cid = conv?.id;
        if (cid) {
          try {
            await sendConversationMessage(
              cid,
              `Payment confirmed for ${packageTitle || "the package"}${
                amount ? ` (₹${amount})` : ""
              }. Looking forward to working with you.`,
            );
          } catch {
            // chat row exists; first-message failure is non-fatal
          }
        }
        return cid || null;
      } catch (error) {
        console.log("handleAfterPackagePayment:", error?.message);
        return null;
      }
    },
    [ensureDirectConversation, sendConversationMessage],
  );
  const [selectedEmoji, setSelectedEmoji] = useState(null);
  const [startCallType, setStartCallType] = useState(null);
  const [showFindDoctor, setShowFindDoctor] = useState(false);
  const [showPrescription, setShowPrescription] = useState(false);
  const [showMeds, setShowMeds] = useState(false);
  const [showFamily, setShowFamily] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [showHospital, setShowHospital] = useState(false);
  const [showPharmacy, setShowPharmacy] = useState(false);
  const [showAppointments, setShowAppointments] = useState(false);
  const [showMedical, setShowMedical] = useState(false);
  const [showQuickSol, setShowQuickSol] = useState(false);
  const [showQuickCounselling, setShowQuickCounselling] = useState(false);
  const [showPackageJourney, setShowPackageJourney] = useState(false);
  const [packageDoctors, setPackageDoctors] = useState([]);

  useEffect(() => {
    void fetchHospitals();
  }, []);

  useEffect(() => {
    if (!showPackageJourney) return;
    let cancelled = false;
    (async () => {
      const list = await fetchApprovedDoctors({ packageModeOnly: true });
      if (!cancelled) setPackageDoctors(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [showPackageJourney, fetchApprovedDoctors]);

  const upcomingAppointments = (appointments || [])
    .filter((appointment) => {
      if (appointment.isPackageDemoMeeting) return false;
      if (!appointment.scheduledAt) return false;
      const time = new Date(appointment.scheduledAt).getTime();
      return !Number.isNaN(time) && time >= Date.now() - 60 * 60 * 1000;
    })
    .sort(
      (left, right) =>
        new Date(left.scheduledAt).getTime() -
        new Date(right.scheduledAt).getTime(),
    );

  useEffect(() => {
    const handleBack = () => {
      if (startCallType) {
        setStartCallType(null);
        return true;
      }
      if (showFindDoctor) {
        setShowFindDoctor(false);
        return true;
      }
      if (showPrescription) {
        setShowPrescription(false);
        return true;
      }
      if (showMeds) {
        setShowMeds(false);
        return true;
      }
      if (showFamily) {
        setShowFamily(false);
        return true;
      }
      if (showSOS) {
        setShowSOS(false);
        return true;
      }
      if (showHospital) {
        setShowHospital(false);
        return true;
      }
      if (showPharmacy) {
        setShowPharmacy(false);
        return true;
      }
      if (showAppointments) {
        setShowAppointments(false);
        return true;
      }
      if (showMedical) {
        setShowMedical(false);
        return true;
      }
      if (showQuickSol) {
        setShowQuickSol(false);
        return true;
      }
      if (showQuickCounselling) {
        setShowQuickCounselling(false);
        return true;
      }
      if (showPackageJourney) {
        setShowPackageJourney(false);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBack,
    );
    return () => subscription.remove();
  }, [
    startCallType,
    showFindDoctor,
    showPrescription,
    showMeds,
    showFamily,
    showSOS,
    showHospital,
    showPharmacy,
    showAppointments,
    showMedical,
    showQuickSol,
    showQuickCounselling,
    showPackageJourney,
  ]);

  if (showMedical)
    return (
      <MedicalRecordsScreen
        theme={theme}
        onBack={() => setShowMedical(false)}
        patientUserId={currentUser?.id}
      />
    );
  if (showQuickSol)
    return (
      <QuickSolutionScreen
        theme={theme}
        onBack={() => {
          setShowQuickSol(false);
          setQuickRequestsRefreshKey((k) => k + 1);
        }}
        patientUserId={currentUser?.id}
      />
    );
  if (showQuickCounselling)
    return (
      <QuickCounsellingScreen
        theme={theme}
        onBack={() => {
          setShowQuickCounselling(false);
          setQuickRequestsRefreshKey((k) => k + 1);
        }}
        patientUserId={currentUser?.id}
      />
    );
  if (showPackageJourney)
    return (
      <PackageDoctorJourneyScreen
        theme={theme}
        onBack={() => setShowPackageJourney(false)}
        patientUserId={currentUser?.id}
        patientProfileId={patientProfile?.id}
        doctors={packageDoctors}
        scrollContentBottomInset={Math.max(
          tabScrollBottomPadding(),
          Math.round(88 * UI_SCALE + 40),
        )}
        onGoToAppointmentsTab={() => {
          setShowPackageJourney(false);
          tabNav?.navigateTab?.("Appts");
        }}
      />
    );

  if (startCallType)
    return (
      <SlideScreen onBack={() => setStartCallType(null)}>
        <StartCallScreen callType={startCallType} onBack={null} />
      </SlideScreen>
    );
  if (showFindDoctor)
    return (
      <SlideScreen
        onBack={() => {
          setShowFindDoctor(false);
          refreshAllData();
        }}
      >
        <PatientDoctorBookingFlow onBack={null} />
      </SlideScreen>
    );
  if (showPrescription)
    return (
      <SlideScreen onBack={() => setShowPrescription(false)}>
        <PrescriptionScreen onBack={null} />
      </SlideScreen>
    );
  if (showMeds)
    return (
      <SlideScreen onBack={() => setShowMeds(false)}>
        <MedicationTrackerScreen onBack={null} />
      </SlideScreen>
    );
  if (showFamily)
    return (
      <SlideScreen onBack={() => setShowFamily(false)}>
        <FamilyHealthScreen onBack={null} />
      </SlideScreen>
    );
  if (showSOS)
    return (
      <SlideScreen onBack={() => setShowSOS(false)}>
        <EmergencySOScreen onBack={null} />
      </SlideScreen>
    );
  if (showHospital)
    return (
      <SlideScreen onBack={() => setShowHospital(false)}>
        <HospitalDirectoryScreen onBack={null} />
      </SlideScreen>
    );
  if (showPharmacy)
    return (
      <SlideScreen onBack={() => setShowPharmacy(false)}>
        <PharmacyDirectoryScreen onBack={null} />
      </SlideScreen>
    );
  if (showAppointments)
    return (
      <SlideScreen onBack={() => setShowAppointments(false)}>
        <PatientAppointmentsScreen onBack={null} />
      </SlideScreen>
    );

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.bg }}
        edges={["left", "right"]}
      >
        <StatusBar barStyle="light-content" backgroundColor={theme.accent} />
        {dataLoading ? (
          <View
            style={{
              paddingVertical: RFValue(10),
              alignItems: "center",
              backgroundColor: theme.bgSolid,
            }}
          >
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : null}
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{
            paddingBottom: tabScrollBottomPadding(),
            flexGrow: 1,
          }}
        >
          <FadeInView delay={60}>
            <View
              style={{
                backgroundColor: theme.accent,
                padding: RFValue(24),
                paddingBottom: RFValue(28),
                borderBottomLeftRadius: RFValue(28),
                borderBottomRightRadius: RFValue(28),
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: RFValue(20),
                }}
              >
                <View>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.7)",
                      fontSize: RFValue(13),
                      fontWeight: "600",
                      marginBottom: RFValue(4),
                    }}
                  >
                    {new Date().getHours() < 12
                      ? "Good Morning"
                      : new Date().getHours() < 17
                        ? "Good Afternoon"
                        : "Good Evening"}
                  </Text>
                  <Text
                    style={{
                      color: "#FFF",
                      fontSize: RFValue(24),
                      fontWeight: "800",
                    }}
                  >
                    Patient
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TouchableOpacity
                    style={{
                      width: RFValue(40),
                      height: RFValue(40),
                      borderRadius: RFValue(12),
                      backgroundColor: "rgba(255,255,255,0.15)",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: RFValue(10),
                    }}
                  >
                    <Ionicons
                      name="notifications-outline"
                      size={RFValue(22)}
                      color="#FFF"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      width: RFValue(40),
                      height: RFValue(40),
                      borderRadius: RFValue(12),
                      backgroundColor: "#EF4444",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name="alert-circle"
                      size={RFValue(22)}
                      color="#FFF"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Mood selector */}
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.12)",
                  borderRadius: RFValue(16),
                  padding: RFValue(14),
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: "rgba(255,255,255,0.22)",
                }}
              >
                <Text
                  style={{
                    color: "rgba(255,255,255,0.8)",
                    fontSize: RFValue(12),
                    fontWeight: "600",
                    marginBottom: RFValue(10),
                  }}
                >
                  How are you feeling today?
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    rowGap: RFValue(8),
                  }}
                >
                  {["Great", "Good", "Neutral", "Bad", "Awful"].map(
                    (mood, index) => (
                      <TouchableOpacity
                        key={index}
                        onPress={() => setSelectedEmoji(mood)}
                        style={{
                          backgroundColor:
                            selectedEmoji === mood
                              ? "rgba(255,255,255,0.3)"
                              : "rgba(255,255,255,0.1)",
                          paddingHorizontal: RFValue(10),
                          minHeight: RFValue(36),
                          borderRadius: RFValue(14),
                          justifyContent: "center",
                          alignItems: "center",
                          borderWidth: selectedEmoji === mood ? 2 : 0,
                          borderColor: "#FFF",
                          marginBottom: RFValue(6),
                          minWidth: "18%",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: RFValue(13),
                            fontWeight: "700",
                            color: "#FFF",
                          }}
                        >
                          {mood}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>
              </View>
            </View>
          </FadeInView>

          <FadeInView delay={140}>
            <View
              style={{ paddingHorizontal: RFValue(16), marginTop: RFValue(16) }}
            >
              {/* Quick Actions Grid */}
              <View
                style={{
                  backgroundColor: theme.card,
                  borderRadius: RFValue(20),
                  padding: RFValue(16),
                  marginBottom: RFValue(16),
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.cardBorder,
                  shadowColor: theme.shadowColor,
                  shadowOpacity: 0.07,
                  shadowOffset: { width: 0, height: 2 },
                  shadowRadius: 16,
                  elevation: 2,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "flex-start",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setShowFindDoctor(true)}
                    style={{ alignItems: "center", width: "25%" }}
                  >
                    <View
                      style={{
                        width: RFValue(48),
                        height: RFValue(48),
                        borderRadius: RFValue(14),
                        backgroundColor: theme.bg,
                        justifyContent: "center",
                        alignItems: "center",
                        marginBottom: RFValue(6),
                      }}
                    >
                      <Ionicons
                        name="pulse"
                        size={RFValue(24)}
                        color={theme.accent}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        color: theme.textSecondary,
                        fontWeight: "600",
                        textAlign: "center",
                      }}
                    >
                      Symptoms
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowPharmacy(true)}
                    style={{ alignItems: "center", width: "25%" }}
                  >
                    <View
                      style={{
                        width: RFValue(48),
                        height: RFValue(48),
                        borderRadius: RFValue(14),
                        backgroundColor: theme.successLight,
                        justifyContent: "center",
                        alignItems: "center",
                        marginBottom: RFValue(6),
                      }}
                    >
                      <Ionicons
                        name="cart"
                        size={RFValue(24)}
                        color={theme.success}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        color: theme.textSecondary,
                        fontWeight: "600",
                        textAlign: "center",
                      }}
                    >
                      Medicines
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowFindDoctor(true)}
                    style={{ alignItems: "center", width: "25%" }}
                  >
                    <View
                      style={{
                        width: RFValue(48),
                        height: RFValue(48),
                        borderRadius: RFValue(14),
                        backgroundColor: theme.bg,
                        justifyContent: "center",
                        alignItems: "center",
                        marginBottom: RFValue(6),
                      }}
                    >
                      <Ionicons
                        name="calendar"
                        size={RFValue(24)}
                        color={theme.accent}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        color: theme.textSecondary,
                        fontWeight: "600",
                        textAlign: "center",
                      }}
                    >
                      Book Appt
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowHospital(true)}
                    style={{ alignItems: "center", width: "25%" }}
                  >
                    <View
                      style={{
                        width: RFValue(48),
                        height: RFValue(48),
                        borderRadius: RFValue(14),
                        backgroundColor: theme.bg,
                        justifyContent: "center",
                        alignItems: "center",
                        marginBottom: RFValue(6),
                      }}
                    >
                      <Ionicons
                        name="business"
                        size={RFValue(24)}
                        color={theme.accent}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        color: theme.textSecondary,
                        fontWeight: "600",
                        textAlign: "center",
                      }}
                    >
                      Hospital
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Product spec: quick services + package journey */}
              <View
                style={{
                  backgroundColor: theme.card,
                  borderRadius: RFValue(20),
                  padding: RFValue(16),
                  marginBottom: RFValue(16),
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.cardBorder,
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(13),
                    fontWeight: "800",
                    color: theme.textPrimary,
                    marginBottom: RFValue(6),
                  }}
                >
                  Your care mode:{" "}
                  {patientCareMode === CARE_MODE.PACKAGE
                    ? "Package Doctor"
                    : patientCareMode === CARE_MODE.CASUAL
                      ? "Casual / Normal"
                      : patientCareMode === CARE_MODE.SKIP
                        ? "Browsing (skip)"
                        : "-"}
                </Text>
                <Text
                  style={{
                    fontSize: RFValue(11),
                    color: theme.textSecondary,
                    marginBottom: RFValue(12),
                  }}
                >
                  Quick services use verified RMP/clinic doctors. Package mode
                  uses professional doctors for demos and paid packages (1 coin
                  = ₹1).
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: RFValue(8),
                  }}
                >
                  {(patientCareMode === CARE_MODE.CASUAL ||
                    patientCareMode === CARE_MODE.SKIP) && (
                    <>
                      <TouchableOpacity
                        onPress={() => setShowQuickSol(true)}
                        style={{
                          flexGrow: 1,
                          minWidth: "45%",
                          backgroundColor: theme.accentLight,
                          padding: RFValue(12),
                          borderRadius: RFValue(14),
                        }}
                      >
                        <Text
                          style={{ fontWeight: "800", color: theme.accent }}
                        >
                          Quick Solution
                        </Text>
                        <Text
                          style={{
                            fontSize: RFValue(10),
                            color: theme.textSecondary,
                            marginTop: 4,
                          }}
                        >
                          ₹10 · Private mode available
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setShowQuickCounselling(true)}
                        style={{
                          flexGrow: 1,
                          minWidth: "45%",
                          backgroundColor: theme.successLight,
                          padding: RFValue(12),
                          borderRadius: RFValue(14),
                        }}
                      >
                        <Text
                          style={{ fontWeight: "800", color: theme.success }}
                        >
                          Quick Counselling
                        </Text>
                        <Text
                          style={{
                            fontSize: RFValue(10),
                            color: theme.textSecondary,
                            marginTop: 4,
                          }}
                        >
                          ₹25
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {patientCareMode === CARE_MODE.PACKAGE && (
                    <TouchableOpacity
                      onPress={() => setShowPackageJourney(true)}
                      style={{
                        flex: 1,
                        backgroundColor: theme.accentLight,
                        padding: RFValue(14),
                        borderRadius: RFValue(14),
                      }}
                    >
                      <Text style={{ fontWeight: "800", color: theme.accent }}>
                        Package journey
                      </Text>
                      <Text
                        style={{
                          fontSize: RFValue(10),
                          color: theme.textSecondary,
                          marginTop: 4,
                        }}
                      >
                        Demo → call → receive package → Pay now
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => setShowMedical(true)}
                    style={{
                      flex: 1,
                      minWidth: "100%",
                      marginTop: RFValue(4),
                      borderWidth: 1,
                      borderColor: theme.cardBorder,
                      padding: RFValue(12),
                      borderRadius: RFValue(14),
                    }}
                  >
                    <Text
                      style={{ fontWeight: "800", color: theme.textPrimary }}
                    >
                      Medical records
                    </Text>
                    <Text
                      style={{
                        fontSize: RFValue(10),
                        color: theme.textSecondary,
                        marginTop: 4,
                      }}
                    >
                      Upload prescriptions & labs to share in consults
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {(patientCareMode === CARE_MODE.CASUAL ||
                patientCareMode === CARE_MODE.SKIP) && (
                <View
                  style={{
                    backgroundColor: theme.card,
                    borderRadius: RFValue(20),
                    padding: RFValue(16),
                    marginBottom: RFValue(16),
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.cardBorder,
                  }}
                >
                  <PatientQuickRequestsTrackerPanel
                    theme={theme}
                    patientUserId={currentUser?.id}
                    onOpenConversation={handleOpenOfferConversation}
                    refreshTrigger={quickRequestsRefreshKey}
                  />
                </View>
              )}

              {upcomingAppointments.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setShowAppointments(true)}
                  activeOpacity={0.9}
                  style={{
                    backgroundColor: theme.card,
                    borderRadius: RFValue(16),
                    padding: RFValue(16),
                    marginBottom: RFValue(16),
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.cardBorder,
                    shadowColor: theme.shadowColor,
                    shadowOpacity: 0.07,
                    shadowOffset: { width: 0, height: 2 },
                    shadowRadius: 14,
                    elevation: 2,
                    borderLeftWidth: 4,
                    borderLeftColor: theme.accent,
                  }}
                >
                  <View
                    style={{
                      width: RFValue(44),
                      height: RFValue(44),
                      borderRadius: RFValue(12),
                      backgroundColor: theme.accentLight,
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: RFValue(12),
                    }}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={RFValue(22)}
                      color={theme.accent}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        fontWeight: "700",
                        color: theme.textTertiary,
                        textTransform: "uppercase",
                      }}
                    >
                      Next appointment
                    </Text>
                    <Text
                      style={{
                        fontSize: RFValue(15),
                        fontWeight: "700",
                        color: theme.textPrimary,
                        marginTop: RFValue(2),
                      }}
                    >
                      {upcomingAppointments[0].doctorName}
                    </Text>
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        color: theme.textSecondary,
                        marginTop: RFValue(2),
                      }}
                    >
                      {formatAppointmentSummaryDate(
                        upcomingAppointments[0].scheduledAt,
                      )}{" "}
                      · {formatTimeValue(upcomingAppointments[0].scheduledAt)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={RFValue(18)}
                    color={theme.textTertiary}
                  />
                </TouchableOpacity>
              ) : null}

              {/* Telemedicine */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: RFValue(12),
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(18),
                    fontWeight: "800",
                    color: theme.textPrimary,
                  }}
                >
                  Telemedicine
                </Text>
              </View>

              <View style={{ marginBottom: RFValue(16) }}>
                <PressCard
                  onPress={() => setStartCallType("video")}
                  style={{
                    backgroundColor: theme.card,
                    borderRadius: RFValue(16),
                    padding: RFValue(16),
                    marginBottom: RFValue(10),
                    shadowColor: theme.shadowColor,
                    shadowOpacity: 0.06,
                    shadowOffset: { width: 0, height: 4 },
                    shadowRadius: 12,
                    elevation: 3,
                    flexDirection: "row",
                    alignItems: "stretch",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setStartCallType("video")}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      backgroundColor: theme.card,
                      borderRadius: RFValue(16),
                      padding: RFValue(16),
                      marginRight: RFValue(10),
                      shadowColor: theme.shadowColor,
                      shadowOpacity: 0.06,
                      shadowOffset: { width: 0, height: 4 },
                      shadowRadius: 12,
                      elevation: 3,
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: RFValue(10),
                        height: RFValue(36),
                        borderRadius: RFValue(14),
                        backgroundColor: theme.bg,
                        justifyContent: "center",
                        alignItems: "center",
                        marginBottom: RFValue(8),
                      }}
                    >
                      <Ionicons
                        name="videocam"
                        size={RFValue(22)}
                        color={theme.accent}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        fontWeight: "700",
                        color: theme.textPrimary,
                      }}
                    >
                      Video Call
                    </Text>
                    <Text
                      style={{
                        fontSize: RFValue(10),
                        color: theme.textSecondary,
                        marginTop: RFValue(2),
                      }}
                    >
                      Consult a doctor
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setStartCallType("audio")}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      backgroundColor: theme.card,
                      borderRadius: RFValue(16),
                      padding: RFValue(16),
                      shadowColor: theme.shadowColor,
                      shadowOpacity: 0.06,
                      shadowOffset: { width: 0, height: 4 },
                      shadowRadius: 12,
                      elevation: 3,
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: RFValue(10),
                        height: RFValue(36),
                        borderRadius: RFValue(14),
                        backgroundColor: theme.warningLight,
                        justifyContent: "center",
                        alignItems: "center",
                        marginBottom: RFValue(8),
                      }}
                    >
                      <Ionicons
                        name="call"
                        size={RFValue(22)}
                        color={theme.warning}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        fontWeight: "700",
                        color: theme.textPrimary,
                      }}
                    >
                      Audio Call
                    </Text>
                    <Text
                      style={{
                        fontSize: RFValue(10),
                        color: theme.textSecondary,
                        marginTop: RFValue(2),
                      }}
                    >
                      Talk to a doctor
                    </Text>
                  </TouchableOpacity>
                </PressCard>
                <TouchableOpacity
                  onPress={() => setShowFindDoctor(true)}
                  style={{
                    flex: 1,
                    backgroundColor: theme.card,
                    borderRadius: RFValue(16),
                    padding: RFValue(16),
                    shadowColor: theme.shadowColor,
                    shadowOpacity: 0.06,
                    shadowOffset: { width: 0, height: 4 },
                    shadowRadius: 12,
                    elevation: 3,
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: RFValue(10),
                      height: RFValue(36),
                      borderRadius: RFValue(14),
                      backgroundColor: theme.successLight,
                      justifyContent: "center",
                      alignItems: "center",
                      marginBottom: RFValue(8),
                    }}
                  >
                    <Ionicons
                      name="calendar"
                      size={RFValue(22)}
                      color={theme.success}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      fontWeight: "700",
                      color: theme.textPrimary,
                    }}
                  >
                    Book Appt
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(10),
                      color: theme.textSecondary,
                      marginTop: RFValue(2),
                    }}
                  >
                    Next available
                  </Text>
                </TouchableOpacity>
              </View>

              {/* My appointments - pay fee, status (Step 8) */}
              <TouchableOpacity
                onPress={() => setShowAppointments(true)}
                style={{
                  backgroundColor: theme.card,
                  borderRadius: RFValue(16),
                  padding: RFValue(16),
                  marginBottom: RFValue(16),
                  shadowColor: theme.shadowColor,
                  shadowOpacity: 0.06,
                  shadowOffset: { width: 0, height: 4 },
                  shadowRadius: 12,
                  elevation: 3,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    paddingHorizontal: RFValue(10),
                    height: RFValue(36),
                    borderRadius: RFValue(14),
                    backgroundColor: theme.accentLight,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name="calendar"
                    size={RFValue(22)}
                    color={theme.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      fontWeight: "700",
                      color: theme.textPrimary,
                    }}
                  >
                    My appointments
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: theme.textSecondary,
                    }}
                  >
                    Approve, pay fee, and join your visit
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={RFValue(18)}
                  color={theme.textTertiary}
                />
              </TouchableOpacity>

              {/* Prescriptions */}
              <TouchableOpacity
                onPress={() => setShowPrescription(true)}
                style={{
                  backgroundColor: theme.card,
                  borderRadius: RFValue(16),
                  padding: RFValue(16),
                  marginBottom: RFValue(16),
                  shadowColor: theme.shadowColor,
                  shadowOpacity: 0.06,
                  shadowOffset: { width: 0, height: 4 },
                  shadowRadius: 12,
                  elevation: 3,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    paddingHorizontal: RFValue(10),
                    height: RFValue(36),
                    borderRadius: RFValue(14),
                    backgroundColor: theme.warningLight,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name="document-text"
                    size={RFValue(22)}
                    color={theme.warning}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      fontWeight: "700",
                      color: theme.textPrimary,
                    }}
                  >
                    Prescriptions
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: theme.textSecondary,
                    }}
                  >
                    View your prescriptions
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={RFValue(18)}
                  color={theme.textTertiary}
                />
              </TouchableOpacity>

              {/* Medication Tracker */}
              <TouchableOpacity
                onPress={() => setShowMeds(true)}
                style={{
                  backgroundColor: theme.card,
                  borderRadius: RFValue(16),
                  padding: RFValue(16),
                  marginBottom: RFValue(16),
                  shadowColor: theme.shadowColor,
                  shadowOpacity: 0.06,
                  shadowOffset: { width: 0, height: 4 },
                  shadowRadius: 12,
                  elevation: 3,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    paddingHorizontal: RFValue(10),
                    height: RFValue(36),
                    borderRadius: RFValue(14),
                    backgroundColor: theme.successLight,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name="pill"
                    size={RFValue(22)}
                    color={theme.success}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      fontWeight: "700",
                      color: theme.textPrimary,
                    }}
                  >
                    Medication Tracker
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: theme.textSecondary,
                    }}
                  >
                    Track your medications
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={RFValue(18)}
                  color={theme.textTertiary}
                />
              </TouchableOpacity>

              {/* Family Health */}
              <TouchableOpacity
                onPress={() => setShowFamily(true)}
                style={{
                  backgroundColor: theme.card,
                  borderRadius: RFValue(16),
                  padding: RFValue(16),
                  marginBottom: RFValue(16),
                  shadowColor: theme.shadowColor,
                  shadowOpacity: 0.06,
                  shadowOffset: { width: 0, height: 4 },
                  shadowRadius: 12,
                  elevation: 3,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    paddingHorizontal: RFValue(10),
                    height: RFValue(36),
                    borderRadius: RFValue(14),
                    backgroundColor: theme.accentLight,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name="people"
                    size={RFValue(22)}
                    color={theme.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      fontWeight: "700",
                      color: theme.textPrimary,
                    }}
                  >
                    Family Health
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: theme.textSecondary,
                    }}
                  >
                    Manage family members
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={RFValue(18)}
                  color={theme.textTertiary}
                />
              </TouchableOpacity>

              {/* Emergency SOS */}
              <TouchableOpacity
                onPress={() => setShowSOS(true)}
                style={{
                  backgroundColor: theme.dangerLight,
                  borderRadius: RFValue(16),
                  padding: RFValue(16),
                  marginBottom: RFValue(16),
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: theme.danger,
                }}
              >
                <View
                  style={{
                    paddingHorizontal: RFValue(10),
                    height: RFValue(36),
                    borderRadius: RFValue(14),
                    backgroundColor: theme.danger,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name="alert-circle"
                    size={RFValue(22)}
                    color="#FFF"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      fontWeight: "800",
                      color: theme.danger,
                    }}
                  >
                    Emergency SOS
                  </Text>
                  <Text style={{ fontSize: RFValue(12), color: theme.danger }}>
                    Tap for instant emergency alert
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={RFValue(18)}
                  color={theme.danger}
                />
              </TouchableOpacity>
            </View>
          </FadeInView>
        </ScrollView>
        <UpgradePackageFAB
          theme={theme}
          visible={
            patientCareMode === CARE_MODE.CASUAL ||
            patientCareMode === CARE_MODE.SKIP
          }
          onPress={() => {
            void Promise.resolve(upgradeToPackageMode?.()).then(() =>
              setShowPackageJourney(true),
            );
          }}
        />
      </SafeAreaView>
    </View>
  );
};

const PatientEmergencyScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const [pressed, setPressed] = useState(false);
  const { patientProfile, hospitals } = useAppData();
  const [showHospital, setShowHospital] = useState(false);

  if (showHospital) {
    return <HospitalDirectoryScreen onBack={() => setShowHospital(false)} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          paddingTop: safeHeaderPaddingTop(),
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation && navigation.navigate("Home")}
          style={{
            width: RFValue(36),
            height: RFValue(36),
            borderRadius: RFValue(10),
            backgroundColor: theme.bg,
            justifyContent: "center",
            alignItems: "center",
            marginRight: RFValue(14),
          }}
        >
          <Ionicons
            name="arrow-back"
            size={RFValue(20)}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: RFValue(20),
            fontWeight: "800",
            color: theme.textPrimary,
          }}
        >
          Emergency
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        {/* SOS Block */}
        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: RFValue(20),
            padding: RFValue(28),
            alignItems: "center",
            marginBottom: RFValue(16),
            shadowColor: theme.shadowColor,
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <View
            style={{
              width: RFValue(120),
              height: RFValue(120),
              borderRadius: RFValue(60),
              backgroundColor: theme.dangerLight,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: RFValue(16),
            }}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPressed(!pressed)}
              style={{
                width: RFValue(100),
                height: RFValue(100),
                borderRadius: RFValue(50),
                backgroundColor: pressed ? theme.danger : theme.danger,
                justifyContent: "center",
                alignItems: "center",
                shadowColor: theme.danger,
                shadowOpacity: 0.4,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }}
            >
              <Ionicons name="alert-circle" size={RFValue(40)} color="#FFF" />
              <Text
                style={{
                  color: "#FFF",
                  fontSize: RFValue(16),
                  fontWeight: "800",
                  marginTop: RFValue(2),
                }}
              >
                SOS
              </Text>
            </TouchableOpacity>
          </View>
          <Text
            style={{
              fontSize: RFValue(18),
              fontWeight: "800",
              color: theme.textPrimary,
              marginBottom: RFValue(6),
            }}
          >
            Emergency Alert
          </Text>
          <Text
            style={{
              fontSize: RFValue(13),
              color: theme.textSecondary,
              textAlign: "center",
              lineHeight: RFValue(20),
            }}
          >
            Tap to send emergency alert to your doctor and nearby hospitals
          </Text>
        </View>

        {/* Emergency Contacts */}
        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: RFValue(20),
            padding: RFValue(18),
            marginBottom: RFValue(16),
            shadowColor: theme.shadowColor,
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <Text
            style={{
              fontSize: RFValue(16),
              fontWeight: "800",
              color: theme.textPrimary,
              marginBottom: RFValue(14),
            }}
          >
            Emergency Contacts
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: theme.bg,
              padding: RFValue(14),
              borderRadius: RFValue(14),
              marginBottom: RFValue(10),
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: RFValue(40),
                  height: RFValue(40),
                  borderRadius: RFValue(12),
                  backgroundColor: theme.card,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(12),
                }}
              >
                <Ionicons
                  name="person-outline"
                  size={RFValue(20)}
                  color={theme.accent}
                />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: RFValue(14),
                    fontWeight: "700",
                    color: theme.textPrimary,
                  }}
                >
                  Emergency Contact 1
                </Text>
                <Text
                  style={{ fontSize: RFValue(12), color: theme.textTertiary }}
                >
                  -- Not Set --
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={{
                width: RFValue(36),
                height: RFValue(36),
                borderRadius: RFValue(10),
                backgroundColor: theme.bg,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name="call-outline"
                size={RFValue(18)}
                color={theme.textTertiary}
              />
            </TouchableOpacity>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: theme.bg,
              padding: RFValue(14),
              borderRadius: RFValue(14),
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: RFValue(40),
                  height: RFValue(40),
                  borderRadius: RFValue(12),
                  backgroundColor: theme.card,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(12),
                }}
              >
                <Ionicons
                  name="person-outline"
                  size={RFValue(20)}
                  color={theme.accent}
                />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: RFValue(14),
                    fontWeight: "700",
                    color: theme.textPrimary,
                  }}
                >
                  Emergency Contact 2
                </Text>
                <Text
                  style={{ fontSize: RFValue(12), color: theme.textTertiary }}
                >
                  -- Not Set --
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={{
                width: RFValue(36),
                height: RFValue(36),
                borderRadius: RFValue(10),
                backgroundColor: theme.bg,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name="call-outline"
                size={RFValue(18)}
                color={theme.textTertiary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Nearby Hospitals (Launch v1.0) */}
        {(() => {
          const patientDistrict = String(patientProfile?.district || "")
            .trim()
            .toLowerCase();
          const patientState = String(patientProfile?.state || "")
            .trim()
            .toLowerCase();
          const scoped = (hospitals || []).filter((h) => {
            if (patientDistrict)
              return (h.district || "").toLowerCase() === patientDistrict;
            if (patientState)
              return (h.state || "").toLowerCase() === patientState;
            return true;
          });
          const topHospitals = (scoped.length ? scoped : hospitals || []).slice(
            0,
            3,
          );
          return (
            <View
              style={{
                backgroundColor: theme.card,
                borderRadius: RFValue(20),
                padding: RFValue(18),
                marginBottom: RFValue(16),
                shadowColor: theme.shadowColor,
                shadowOpacity: 0.06,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: RFValue(14),
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(16),
                    fontWeight: "800",
                    color: theme.textPrimary,
                  }}
                >
                  Nearby Hospitals
                </Text>
                {(hospitals || []).length ? (
                  <TouchableOpacity onPress={() => setShowHospital(true)}>
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        color: theme.accent,
                        fontWeight: "700",
                      }}
                    >
                      See all
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {topHospitals.length ? (
                topHospitals.map((hospital) => (
                  <TouchableOpacity
                    key={hospital.id}
                    onPress={() => setShowHospital(true)}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: RFValue(10),
                      borderBottomWidth: 1,
                      borderBottomColor: theme.cardBorder,
                    }}
                  >
                    <View
                      style={{
                        width: RFValue(40),
                        height: RFValue(40),
                        borderRadius: RFValue(10),
                        backgroundColor: theme.dangerLight,
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: RFValue(12),
                      }}
                    >
                      <Ionicons
                        name="medical"
                        size={RFValue(18)}
                        color={theme.danger}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: RFValue(13),
                          fontWeight: "700",
                          color: theme.textPrimary,
                        }}
                        numberOfLines={1}
                      >
                        {hospital.name}
                      </Text>
                      {hospital.address ||
                      hospital.district ||
                      hospital.state ? (
                        <Text
                          style={{
                            fontSize: RFValue(11),
                            color: theme.textTertiary,
                            marginTop: 2,
                          }}
                          numberOfLines={1}
                        >
                          {[hospital.address, hospital.district, hospital.state]
                            .filter(Boolean)
                            .join(", ")}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={RFValue(16)}
                      color={theme.textTertiary}
                    />
                  </TouchableOpacity>
                ))
              ) : (
                <TouchableOpacity
                  onPress={() => setShowHospital(true)}
                  style={{ alignItems: "center", paddingVertical: RFValue(20) }}
                >
                  <Ionicons
                    name="medical-outline"
                    size={RFValue(40)}
                    color={theme.cardBorder}
                    style={{ marginBottom: RFValue(10) }}
                  />
                  <Text
                    style={{
                      fontSize: RFValue(13),
                      color: theme.textTertiary,
                      textAlign: "center",
                    }}
                  >
                    No hospitals found nearby.
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(11),
                      color: theme.accent,
                      fontWeight: "700",
                      marginTop: RFValue(6),
                    }}
                  >
                    Tap to browse all hospitals
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}
      </ScrollView>
    </SafeAreaView>
  );
};

const CallScreen = ({
  conversationId,
  callType = "video",
  onClose,
  contact,
}) => {
  const { theme } = useTheme();
  const { currentUserId } = useAppData();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [status, setStatus] = useState("Connecting...");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === "video");
  const localStreamRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const roleRef = useRef("receiver");
  const { RTCView: LkRTCView } = useMemo(() => getLivekitWebRTC(), []);

  const cleanupStreams = (resetState = true) => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    localStreamRef.current = null;
    pendingIceCandidatesRef.current = [];
    if (resetState) {
      setLocalStream(null);
      setRemoteStream(null);
    }
  };

  const flushPendingIceCandidates = async (peerConnection) => {
    if (!peerConnection?.remoteDescription) return;
    const pendingCandidates = pendingIceCandidatesRef.current;
    if (!pendingCandidates.length) return;

    pendingIceCandidatesRef.current = [];
    for (const candidate of pendingCandidates) {
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.log("flushPendingIceCandidates error:", error);
      }
    }
  };

  const closeConnection = (resetState = true) => {
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: "leave" }));
      } catch (error) {
        // ignore send errors on teardown
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    cleanupStreams(resetState);
  };

  const handleClose = () => {
    closeConnection();
    onClose();
  };

  useEffect(() => {
    let mounted = true;

    const setupCall = async () => {
      try {
        const {
          mediaDevices,
          RTCPeerConnection,
          RTCSessionDescription,
          RTCIceCandidate,
        } = getLivekitWebRTC();
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: callType === "video",
        });
        if (!mounted) return;
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoEnabled(callType === "video");

        const peerConnection = new RTCPeerConnection({
          iceServers: ICE_SERVERS,
        });
        pcRef.current = peerConnection;

        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });

        peerConnection.ontrack = (event) => {
          if (!mounted) return;
          const [remote] = event.streams;
          if (remote) {
            setRemoteStream(remote);
            setStatus("Connected");
          }
        };

        peerConnection.onicecandidate = (event) => {
          if (
            event.candidate &&
            wsRef.current &&
            wsRef.current.readyState === WebSocket.OPEN
          ) {
            wsRef.current.send(
              JSON.stringify({ type: "ice", candidate: event.candidate }),
            );
          }
        };

        const ws = new WebSocket(SIGNALING_SERVER_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: "join",
              roomId: conversationId,
              userId: currentUserId || null,
            }),
          );
        };

        ws.onmessage = async (event) => {
          let payload;
          try {
            payload = JSON.parse(event.data);
          } catch (error) {
            return;
          }

          if (!payload?.type) return;

          if (payload.type === "joined") {
            roleRef.current = payload.role || "receiver";
            if (payload.role === "initiator") {
              setStatus("Waiting for participant...");
            }
            return;
          }

          if (payload.type === "ready" && roleRef.current === "initiator") {
            try {
              const offer = await peerConnection.createOffer();
              await peerConnection.setLocalDescription(offer);
              ws.send(JSON.stringify({ type: "offer", sdp: offer }));
              setStatus("Calling...");
            } catch (error) {
              console.log("Call offer error:", error);
            }
            return;
          }

          if (payload.type === "offer") {
            try {
              await peerConnection.setRemoteDescription(
                new RTCSessionDescription(payload.sdp),
              );
              await flushPendingIceCandidates(peerConnection);
              const answer = await peerConnection.createAnswer();
              await peerConnection.setLocalDescription(answer);
              ws.send(JSON.stringify({ type: "answer", sdp: answer }));
              setStatus("Connecting...");
            } catch (error) {
              console.log("Call answer generation error:", error);
            }
            return;
          }

          if (payload.type === "answer") {
            try {
              await peerConnection.setRemoteDescription(
                new RTCSessionDescription(payload.sdp),
              );
              await flushPendingIceCandidates(peerConnection);
            } catch (error) {
              console.log("Call remote answer error:", error);
            }
            return;
          }

          if (payload.type === "ice" && payload.candidate) {
            try {
              const candidate = new RTCIceCandidate(payload.candidate);
              if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(candidate);
              } else {
                pendingIceCandidatesRef.current.push(candidate);
              }
            } catch (error) {
              console.log("Call ICE candidate error:", error);
            }
            return;
          }

          if (payload.type === "peer-left") {
            setStatus("Participant left");
            setTimeout(() => {
              if (mounted) handleClose();
            }, 500);
          }
        };

        ws.onerror = () => {
          if (mounted) setStatus("Signaling error");
        };
      } catch (error) {
        if (mounted) {
          setStatus("Unable to start call");
        }
      }
    };

    setupCall();

    return () => {
      mounted = false;
      closeConnection(false);
    };
  }, [callType, conversationId, currentUserId]);

  const toggleMute = () => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsMuted(audioTracks.length > 0 ? !audioTracks[0].enabled : false);
  };

  const toggleVideo = () => {
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length === 0) return;
    videoTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsVideoEnabled(videoTracks.length > 0 ? videoTracks[0].enabled : false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1120" }}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1120" />
      <View
        style={{
          padding: RFValue(16),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <TouchableOpacity
          onPress={handleClose}
          style={{
            width: RFValue(36),
            height: RFValue(36),
            borderRadius: RFValue(10),
            backgroundColor: "rgba(255,255,255,0.1)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name="close" size={RFValue(20)} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: RFValue(12) }}>
          <Text
            style={{
              fontSize: RFValue(16),
              fontWeight: "800",
              color: "#FFF",
            }}
            numberOfLines={1}
          >
            {contact?.displayName || "Call"}
          </Text>
          <Text
            style={{
              fontSize: RFValue(12),
              color: "rgba(255,255,255,0.7)",
              marginTop: 2,
            }}
          >
            {status}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        {remoteStream ? (
          <LkRTCView
            streamURL={remoteStream.toURL()}
            style={{ width: "100%", height: "100%" }}
            objectFit="cover"
            zOrder={0}
          />
        ) : (
          <View
            style={{
              width: RFValue(140),
              height: RFValue(140),
              borderRadius: RFValue(70),
              backgroundColor: "rgba(255,255,255,0.08)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="person" size={RFValue(50)} color="#FFF" />
          </View>
        )}
        {localStream ? (
          <View
            style={{
              position: "absolute",
              bottom: RFValue(20),
              right: RFValue(16),
              width: RFValue(110),
              height: RFValue(160),
              borderRadius: RFValue(16),
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.2)",
            }}
          >
            {isVideoEnabled ? (
              <LkRTCView
                streamURL={localStream.toURL()}
                style={{ width: "100%", height: "100%" }}
                objectFit="cover"
                mirror
                zOrder={1}
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.08)",
                }}
              >
                <Ionicons name="videocam-off" size={RFValue(22)} color="#FFF" />
              </View>
            )}
          </View>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          padding: RFValue(16),
          paddingBottom: RFValue(24),
        }}
      >
        <TouchableOpacity
          onPress={toggleMute}
          style={{
            width: RFValue(52),
            height: RFValue(52),
            borderRadius: RFValue(26),
            backgroundColor: isMuted
              ? "rgba(239,68,68,0.9)"
              : "rgba(255,255,255,0.15)",
            justifyContent: "center",
            alignItems: "center",
            marginHorizontal: RFValue(7),
          }}
        >
          <Ionicons
            name={isMuted ? "mic-off" : "mic"}
            size={RFValue(22)}
            color="#FFF"
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleClose}
          style={{
            width: RFValue(62),
            height: RFValue(62),
            borderRadius: RFValue(31),
            backgroundColor: "#EF4444",
            justifyContent: "center",
            alignItems: "center",
            marginHorizontal: RFValue(7),
          }}
        >
          <Ionicons name="call" size={RFValue(26)} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={toggleVideo}
          disabled={callType !== "video"}
          style={{
            width: RFValue(52),
            height: RFValue(52),
            borderRadius: RFValue(26),
            backgroundColor:
              callType !== "video"
                ? "rgba(255,255,255,0.08)"
                : isVideoEnabled
                  ? "rgba(255,255,255,0.15)"
                  : "rgba(59,130,246,0.9)",
            justifyContent: "center",
            alignItems: "center",
            opacity: callType !== "video" ? 0.4 : 1,
            marginHorizontal: RFValue(7),
          }}
        >
          <Ionicons
            name={isVideoEnabled ? "videocam" : "videocam-off"}
            size={RFValue(22)}
            color="#FFF"
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const StartCallScreen = ({ callType = "video", onBack }) => {
  const { theme } = useTheme();
  const {
    userRole,
    currentUserId,
    loadDirectoryContacts,
    ensureDirectConversation,
  } = useAppData();

  const [directoryContacts, setDirectoryContacts] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState(() => {
    if (CALL_DIRECTORY_ALLOWED_ROLES.includes(userRole)) {
      return userRole;
    }
    return "doctor";
  });
  const [activeCall, setActiveCall] = useState(null);
  const [startingCallId, setStartingCallId] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadDirectory = async () => {
      if (!currentUserId) return;
      try {
        setDirectoryLoading(true);
        setDirectoryError("");
        const records = await loadDirectoryContacts({
          roles: CALL_DIRECTORY_ALLOWED_ROLES,
        });
        if (mounted) {
          setDirectoryContacts(records);
        }
      } catch (error) {
        if (mounted) {
          setDirectoryError(error?.message || "Unable to load directory");
          setDirectoryContacts([]);
        }
      } finally {
        if (mounted) {
          setDirectoryLoading(false);
        }
      }
    };

    loadDirectory();
    return () => {
      mounted = false;
    };
  }, [currentUserId, loadDirectoryContacts]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const formattedContacts = directoryContacts
    .filter((user) => user?.id && user.id !== currentUserId)
    .map((user) => {
      const role = normalizeUserRole(user?.role);
      const displayName = user?.name || user?.email || "User";
      return {
        id: user.id,
        displayName,
        role,
        roleLabel: roleLabelFor(role),
        icon: roleIconFor(role),
        email: user?.email || "",
      };
    })
    .filter((contact) => {
      if (!CALL_DIRECTORY_ALLOWED_ROLES.includes(contact.role)) {
        return false;
      }
      if (roleFilter && roleFilter !== "all" && contact.role !== roleFilter) {
        return false;
      }
      if (!normalizedQuery) return true;
      const haystack =
        `${contact.displayName} ${contact.roleLabel} ${contact.email}`
          .toLowerCase()
          .trim();
      return haystack.includes(normalizedQuery);
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const handleStartCall = async (contact) => {
    if (!contact?.id || !currentUserId || startingCallId) return;
    setStartingCallId(contact.id);

    const roomId = buildDirectCallRoomId(currentUserId, contact.id);
    const contactForCall = {
      id: contact.id,
      displayName: contact.displayName,
    };

    setActiveCall({ roomId, callType, contact: contactForCall });

    try {
      await ensureDirectConversation(contact.id);
    } catch {
      // Calls don't depend on chats existing; ignore errors.
    } finally {
      setStartingCallId(null);
    }
  };

  if (activeCall) {
    return (
      <CallScreen
        conversationId={activeCall.roomId}
        callType={activeCall.callType}
        contact={activeCall.contact}
        onClose={() => {
          setActiveCall(null);
          if (onBack) onBack();
        }}
      />
    );
  }

  const filterChip = (value, label) => {
    const isActive = roleFilter === value;
    return (
      <TouchableOpacity
        key={value}
        onPress={() => setRoleFilter(value)}
        style={{
          paddingHorizontal: RFValue(12),
          paddingVertical: RFValue(8),
          borderRadius: RFValue(999),
          backgroundColor: isActive ? theme.accent : theme.bg,
          borderWidth: 1,
          borderColor: isActive ? theme.accent : theme.cardBorder,
          marginRight: RFValue(8),
        }}
      >
        <Text
          style={{
            fontSize: RFValue(12),
            fontWeight: "800",
            color: isActive ? "#FFF" : theme.textSecondary,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.card} />

      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(16),
          paddingTop: safeHeaderPaddingTop(),
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={onBack}
            style={{
              width: RFValue(40),
              height: RFValue(40),
              borderRadius: RFValue(12),
              backgroundColor: theme.bg,
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(12),
            }}
          >
            <Ionicons
              name="arrow-back"
              size={RFValue(20)}
              color={theme.textPrimary}
            />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: RFValue(18),
                fontWeight: "900",
                color: theme.textPrimary,
              }}
              numberOfLines={1}
            >
              {callType === "video" ? "Start Video Call" : "Start Audio Call"}
            </Text>
            <Text
              style={{
                fontSize: RFValue(12),
                color: theme.textSecondary,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              Pick who to call. They must join the same call.
            </Text>
          </View>
        </View>

        <View style={{ marginTop: RFValue(14) }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: theme.bg,
              borderRadius: RFValue(12),
              paddingHorizontal: RFValue(14),
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          >
            <Ionicons
              name="search"
              size={RFValue(18)}
              color={theme.textTertiary}
              style={{ marginRight: RFValue(8) }}
            />
            <TextInput
              placeholder="Search people..."
              placeholderTextColor={theme.textTertiary}
              style={{
                flex: 1,
                paddingVertical: RFValue(10),
                fontSize: RFValue(14),
                color: theme.textPrimary,
              }}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: RFValue(10) }}
          >
            {[
              filterChip("all", "All"),
              filterChip("doctor", "Doctors"),
              filterChip("pharmacy", "Pharmacies"),
              filterChip("staff", "Staff"),
              filterChip("admin", "Admins"),
            ]}
          </ScrollView>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: RFValue(16) }}>
        {directoryLoading ? (
          <View style={{ alignItems: "center", paddingVertical: RFValue(24) }}>
            <Text style={{ fontSize: RFValue(12), color: theme.textTertiary }}>
              Loading directory...
            </Text>
          </View>
        ) : formattedContacts.length > 0 ? (
          formattedContacts.map((contact) => {
            const { color, bg } = roleThemeTokensFor(theme, contact.role);
            return (
              <TouchableOpacity
                key={contact.id}
                onPress={() => handleStartCall(contact)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: theme.card,
                  padding: RFValue(14),
                  borderRadius: RFValue(18),
                  marginBottom: RFValue(10),
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                }}
              >
                <View
                  style={{
                    width: RFValue(48),
                    height: RFValue(48),
                    borderRadius: RFValue(16),
                    backgroundColor: bg,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name={contact.icon}
                    size={RFValue(22)}
                    color={color}
                  />
                </View>
                <View style={{ flex: 1, marginRight: RFValue(10) }}>
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      fontWeight: "900",
                      color: theme.textPrimary,
                      marginBottom: 2,
                    }}
                    numberOfLines={1}
                  >
                    {contact.displayName}
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: theme.textSecondary,
                      fontWeight: "700",
                    }}
                    numberOfLines={1}
                  >
                    {contact.roleLabel}
                  </Text>
                  {contact.email ? (
                    <Text
                      style={{
                        fontSize: RFValue(11),
                        color: theme.textTertiary,
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {contact.email}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={{
                    width: RFValue(44),
                    height: RFValue(44),
                    borderRadius: RFValue(14),
                    backgroundColor: theme.bg,
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: color,
                    opacity: startingCallId === contact.id ? 0.55 : 1,
                  }}
                >
                  <Ionicons
                    name={callType === "video" ? "videocam" : "call"}
                    size={RFValue(18)}
                    color={color}
                  />
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={{ alignItems: "center", paddingVertical: RFValue(24) }}>
            <Ionicons
              name="search"
              size={RFValue(32)}
              color={theme.cardBorder}
              style={{ marginBottom: RFValue(10) }}
            />
            <Text style={{ fontSize: RFValue(12), color: theme.textTertiary }}>
              No contacts match your search.
            </Text>
          </View>
        )}

        {directoryError ? (
          <Text
            style={{
              fontSize: RFValue(12),
              color: theme.danger,
              marginTop: RFValue(8),
              textAlign: "center",
            }}
          >
            {directoryError}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const PatientChatScreen = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    currentUserId,
    conversations,
    loadConversationMessages,
    sendConversationMessage,
    sendConversationImage,
    ensureDirectConversation,
    sendAssistantMessage,
    loadDirectoryContacts,
    dataLoading,
    dataError,
    pendingChatRequest,
    consumePendingChatRequest,
  } = useAppData();
  const [selectedContact, setSelectedContact] = useState(null);
  const [message, setMessage] = useState("");
  const [contactMessages, setContactMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [directoryContacts, setDirectoryContacts] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [startingChatId, setStartingChatId] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [showPrescriptionViewer, setShowPrescriptionViewer] = useState(false);
  // Refs/state used to drive the "jump to latest message" floating button.
  // We auto-scroll to the bottom whenever new messages arrive *and* the user
  // is already pinned there; otherwise we surface the button so they can jump
  // back without manually scrolling to the end of a long history.
  const chatScrollRef = useRef(null);
  const [isAtChatBottom, setIsAtChatBottom] = useState(true);
  const isAtChatBottomRef = useRef(true);
  const [assistantThinking, setAssistantThinking] = useState(false);
  /** Lifts the "Latest" pill when the keyboard is open so it stays tappable. */
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  /** Android only: clears IME strip overlap; 0 when keyboard closed. */
  const [androidComposerLift, setAndroidComposerLift] = useState(0);

  const isAssistantConversation = (conversation) =>
    conversation?.kind === ASSISTANT_CONVERSATION_KIND;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  // Step 9: the Health Assistant thread is always pinned to the top so
  // patients see it as a first-class chat partner.
  const sortedConversations = [...conversations].sort((a, b) => {
    const aAssist = a?.kind === ASSISTANT_CONVERSATION_KIND ? 1 : 0;
    const bAssist = b?.kind === ASSISTANT_CONVERSATION_KIND ? 1 : 0;
    if (aAssist !== bAssist) return bAssist - aAssist;
    return 0;
  });
  const filteredContacts = sortedConversations.filter((c) => {
    if (!normalizedQuery) return true;
    return (
      c.displayName.toLowerCase().includes(normalizedQuery) ||
      c.roleLabel.toLowerCase().includes(normalizedQuery) ||
      c.lastMsg.toLowerCase().includes(normalizedQuery)
    );
  });

  const formatDirectoryContact = (user) => {
    const role = normalizeUserRole(user?.role);
    const displayName = user?.name || user?.email || roleLabelFor(role);
    return {
      id: user?.id,
      displayName,
      role,
      roleLabel: roleLabelFor(role),
      icon: roleIconFor(role),
      email: user?.email || "",
    };
  };

  const resolveCallRoomId = (conversation) => {
    const memberIds = safeArray(conversation?.members);
    if (memberIds.length === 2 && currentUserId) {
      const otherId = memberIds.find((id) => id !== currentUserId);
      const roomId = buildDirectCallRoomId(currentUserId, otherId);
      if (roomId) return roomId;
    }
    return conversation?.id || "";
  };

  const showDirectoryResults = normalizedQuery.length > 0;
  const directoryMatches = showDirectoryResults
    ? directoryContacts
        .filter((user) => user?.id && user.id !== currentUserId)
        .map(formatDirectoryContact)
        .filter((contact) => {
          const searchValue =
            `${contact.displayName} ${contact.roleLabel} ${contact.email}`
              .toLowerCase()
              .trim();
          return searchValue.includes(normalizedQuery);
        })
    : [];

  const findDirectConversation = (targetId) =>
    conversations.find((conversation) => {
      const members = safeArray(conversation.members);
      return (
        !conversation.linkedWoundId &&
        members.length === 2 &&
        members.includes(currentUserId) &&
        members.includes(targetId)
      );
    });

  useEffect(() => {
    let mounted = true;

    const loadDirectory = async () => {
      if (!currentUserId) return;
      try {
        setDirectoryLoading(true);
        setDirectoryError("");
        const records = await loadDirectoryContacts();
        if (mounted) {
          setDirectoryContacts(records);
        }
      } catch (error) {
        if (mounted) {
          setDirectoryError(error?.message || "Unable to load directory");
          setDirectoryContacts([]);
        }
      } finally {
        if (mounted) {
          setDirectoryLoading(false);
        }
      }
    };

    loadDirectory();

    return () => {
      mounted = false;
    };
  }, [currentUserId, loadDirectoryContacts]);

  // Consume external "open this conversation" requests (e.g. doctor pressed
  // "Help → Confirm" or patient pressed the offer arrow). We match an existing
  // conversation when possible; if only a peer user id is supplied, fall back
  // to creating/finding the direct conversation.
  useEffect(() => {
    if (!pendingChatRequest) return;
    if (!currentUserId) return;
    let cancelled = false;
    const run = async () => {
      const { conversationId, patientUserId } = pendingChatRequest;
      try {
        if (conversationId) {
          const match = conversations.find((c) => c.id === conversationId);
          if (match) {
            if (!cancelled) setSelectedContact(match);
            return;
          }
          // The id was provided but our local conversations cache hasn't
          // caught up. Fetch the row directly from PocketBase so we open
          // the actual thread instead of creating a duplicate via the
          // peer-id fallback below.
          try {
            const hydrated = await pb
              .collection("conversations")
              .getOne(conversationId, {
                requestKey: null,
                expand: "members,linkedWound",
              });
            if (!cancelled && hydrated) {
              setSelectedContact(
                mapConversationRecord(hydrated, currentUserId, {}),
              );
              return;
            }
          } catch (fetchErr) {
            console.log(
              "PatientChatScreen direct conversation fetch failed:",
              fetchErr?.message,
            );
            // Fall through to peer-based ensure as a last resort.
          }
        }
        if (patientUserId) {
          const conversation = await ensureDirectConversation(patientUserId);
          if (cancelled) return;
          if (conversation?.id) {
            const refreshed = conversations.find(
              (c) => c.id === conversation.id,
            );
            setSelectedContact(refreshed || conversation);
          }
        }
      } catch (error) {
        console.log("PatientChatScreen pendingChatRequest:", error?.message);
      } finally {
        if (!cancelled) consumePendingChatRequest?.();
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    pendingChatRequest,
    currentUserId,
    conversations,
    ensureDirectConversation,
    consumePendingChatRequest,
  ]);

  const loadSelectedMessages = async (conversationId) => {
    if (!conversationId) return;
    try {
      setLoadingMessages(true);
      const records = await loadConversationMessages(conversationId);
      setContactMessages(records);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (!selectedContact?.id) return;

    let mounted = true;
    loadSelectedMessages(selectedContact.id);

    const subscribe = async () => {
      try {
        await pb.collection("messages").subscribe("*", async ({ record }) => {
          if (!mounted || record?.conversation !== selectedContact.id) return;
          const records = await loadConversationMessages(selectedContact.id);
          if (mounted) {
            setContactMessages(records);
          }
        });
      } catch (error) {
        console.log("Message subscribe error:", error);
      }
    };

    subscribe();

    return () => {
      mounted = false;
      pb.collection("messages").unsubscribe("*");
    };
  }, [selectedContact?.id]);

  // Reset the "at bottom" flag whenever the user opens a different conversation
  // so the floating button doesn't flicker on first render.
  useEffect(() => {
    isAtChatBottomRef.current = true;
    setIsAtChatBottom(true);
  }, [selectedContact?.id]);

  useEffect(() => {
    const showEv =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEv =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEv, (e) => {
      setKeyboardVisible(true);
      if (Platform.OS === "android") {
        setAndroidComposerLift(androidComposerKeyboardLift(e));
      }
    });
    const onHide = Keyboard.addListener(hideEv, () => {
      setKeyboardVisible(false);
      setAndroidComposerLift(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const scrollChatToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      try {
        chatScrollRef.current?.scrollToEnd({ animated });
        isAtChatBottomRef.current = true;
        setIsAtChatBottom(true);
      } catch {
        // ScrollView may be unmounted between message arrival and rAF
      }
    });
  };

  // Auto-scroll to the latest message when new messages arrive *if* the user
  // hasn't manually scrolled up. Otherwise we leave their position alone and
  // the floating button surfaces so they can jump back when ready.
  useEffect(() => {
    if (!selectedContact?.id) return;
    if (contactMessages.length === 0) return;
    if (!isAtChatBottomRef.current) return;
    scrollChatToBottom(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactMessages.length, selectedContact?.id]);

  const sendMessage = async () => {
    if (!message.trim() || !selectedContact?.id) return;
    const text = message.trim();
    // Step 9: route through the assistant endpoint when chatting with the
    // Health Assistant conversation, so the AI reply is appended immediately.
    if (isAssistantConversation(selectedContact)) {
      if (assistantThinking) return;
      setMessage("");
      setAssistantThinking(true);
      try {
        const result = await sendAssistantMessage(selectedContact.id, text);
        if (result?.userMessage || result?.replyMessage) {
          setContactMessages((prev) => {
            const next = [...prev];
            if (
              result.userMessage &&
              !next.some((item) => item.id === result.userMessage.id)
            ) {
              next.push(result.userMessage);
            }
            if (
              result.replyMessage &&
              !next.some((item) => item.id === result.replyMessage.id)
            ) {
              next.push(result.replyMessage);
            }
            return next;
          });
        } else {
          setMessage(text);
        }
      } catch (error) {
        console.log("Assistant send error:", error?.message);
        setMessage(text);
      } finally {
        setAssistantThinking(false);
      }
      return;
    }
    const created = await sendConversationMessage(selectedContact.id, text);
    if (created) {
      setMessage("");
      // Sending a message should always pin the user to the latest message,
      // even if they had scrolled up earlier - they expect to see the line
      // they just typed appear at the bottom.
      isAtChatBottomRef.current = true;
      setContactMessages((prev) => {
        if (prev.some((item) => item.id === created.id)) return prev;
        return [...prev, created];
      });
    } else {
      setMessage(text);
    }
  };

  const handleStartChat = async (contact) => {
    if (!contact?.id || startingChatId) return;
    setStartingChatId(contact.id);
    setDirectoryError("");
    try {
      const conversation = await ensureDirectConversation(contact);
      if (conversation?.id) {
        setSelectedContact(conversation);
      } else {
        setDirectoryError("Unable to start chat");
      }
    } catch (error) {
      setDirectoryError(error?.message || "Unable to start chat");
    } finally {
      setStartingChatId(null);
    }
  };

  const sendAttachment = async (source) => {
    if (!selectedContact?.id || sendingAttachment) return;

    try {
      setSendingAttachment(true);

      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm?.granted) {
          Alert.alert(
            "Permission needed",
            "Please allow camera access to take a photo.",
          );
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm?.granted) {
          Alert.alert(
            "Permission needed",
            "Please allow photo library access to pick a photo.",
          );
          return;
        }
      }

      const pickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        base64: true,
      };

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (!result || result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const created = await sendConversationImage(selectedContact.id, asset);
      if (created) {
        setContactMessages((prev) => {
          if (prev.some((item) => item.id === created.id)) return prev;
          return [...prev, created];
        });
      }
    } catch (error) {
      console.log("sendAttachment error:", error);
      Alert.alert("Upload failed", error?.message || "Unable to send photo.");
    } finally {
      setSendingAttachment(false);
    }
  };

  if (activeCall) {
    return (
      <CallScreen
        conversationId={activeCall.conversationId}
        callType={activeCall.callType}
        contact={activeCall.contact}
        onClose={() => setActiveCall(null)}
      />
    );
  }

  if (showPrescriptionViewer) {
    return (
      <PrescriptionScreen onBack={() => setShowPrescriptionViewer(false)} />
    );
  }

  if (selectedContact) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.bg }}
        edges={["left", "right"]}
      >
        <StatusBar
          barStyle={theme.statusBarStyle}
          backgroundColor={theme.card}
        />
        <View
          style={{
            backgroundColor: theme.card,
            padding: RFValue(16),
            flexDirection: "row",
            alignItems: "center",
            borderBottomWidth: 1,
            borderBottomColor: theme.cardBorder,
            shadowColor: "#000",
            shadowOpacity: 0.04,
            shadowOffset: { width: 0, height: 2 },
            shadowRadius: 8,
            elevation: 3,
          }}
        >
          <TouchableOpacity
            onPress={() => setSelectedContact(null)}
            style={{ marginRight: RFValue(12), padding: 4 }}
          >
            <Ionicons
              name="arrow-back"
              size={RFValue(24)}
              color={theme.textPrimary}
            />
          </TouchableOpacity>
          <View
            style={{
              width: RFValue(40),
              height: RFValue(40),
              borderRadius: RFValue(12),
              backgroundColor: theme.accentLight,
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(12),
            }}
          >
            <Ionicons
              name={selectedContact.image}
              size={RFValue(22)}
              color={theme.accent}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: RFValue(15),
                fontWeight: "800",
                color: theme.textPrimary,
              }}
            >
              {selectedContact.displayName}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: RFValue(6),
                  height: RFValue(6),
                  borderRadius: 3,
                  backgroundColor: theme.success,
                  marginRight: 6,
                }}
              />
              <Text
                style={{
                  fontSize: RFValue(11),
                  color: theme.success,
                  fontWeight: "600",
                }}
              >
                {selectedContact.roleLabel}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", opacity: 0.45 }}>
            <TouchableOpacity
              style={{ padding: 8 }}
              onPress={() =>
                setActiveCall({
                  conversationId: resolveCallRoomId(selectedContact),
                  callType: "audio",
                  contact: selectedContact,
                })
              }
            >
              <Ionicons name="call" size={RFValue(20)} color={theme.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ padding: 8, marginLeft: 8 }}
              onPress={() =>
                setActiveCall({
                  conversationId: resolveCallRoomId(selectedContact),
                  callType: "video",
                  contact: selectedContact,
                })
              }
            >
              <Ionicons
                name="videocam"
                size={RFValue(20)}
                color={theme.accent}
              />
            </TouchableOpacity>
          </View>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1, minHeight: 0 }}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <ScrollView
            ref={chatScrollRef}
            contentContainerStyle={{
              padding: RFValue(16),
              paddingBottom: RFValue(12),
            }}
            style={{ flex: 1, minHeight: 0 }}
            keyboardShouldPersistTaps="handled"
            // The first time the layout settles we should be at the bottom
            // - older content above is fine, newest is what the user wants.
            onContentSizeChange={() => {
              if (isAtChatBottomRef.current) {
                chatScrollRef.current?.scrollToEnd({ animated: false });
              }
            }}
            scrollEventThrottle={16}
            onScroll={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } =
                e.nativeEvent;
              const distanceFromBottom =
                contentSize.height -
                (layoutMeasurement.height + contentOffset.y);
              const atBottom = distanceFromBottom < 80;
              if (atBottom !== isAtChatBottomRef.current) {
                isAtChatBottomRef.current = atBottom;
                setIsAtChatBottom(atBottom);
              }
            }}
          >
            {loadingMessages ? (
              <View style={{ alignItems: "center", marginTop: RFValue(80) }}>
                <Text style={{ color: theme.textSecondary }}>
                  Loading chat...
                </Text>
              </View>
            ) : contactMessages.length > 0 ? (
              contactMessages.map((msg) => {
                const isCurrentUser =
                  msg.senderId && msg.senderId === currentUserId;
                const isSystem = msg.kind === "system";
                const hasImage = !!msg.imageUrl;
                const isPrescription =
                  !hasImage && messageLooksLikePrescription(msg.text);
                const bubbleBg = isPrescription
                  ? "#EEF2FF"
                  : isSystem
                    ? theme.bg
                    : hasImage
                      ? isCurrentUser
                        ? theme.accentLight
                        : theme.card
                      : isCurrentUser
                        ? theme.accent
                        : theme.card;
                const bodyTextColor = isPrescription
                  ? "#1E1B4B"
                  : isSystem
                    ? theme.textSecondary
                    : hasImage
                      ? theme.textPrimary
                      : isCurrentUser
                        ? "#FFF"
                        : theme.textPrimary;
                const InnerBubble = isPrescription ? TouchableOpacity : View;
                return (
                  <View
                    key={msg.id}
                    style={{
                      marginBottom: RFValue(12),
                      flexDirection: "row",
                      justifyContent: isSystem
                        ? "center"
                        : isCurrentUser
                          ? "flex-end"
                          : "flex-start",
                    }}
                  >
                    <InnerBubble
                      onPress={
                        isPrescription
                          ? () => setShowPrescriptionViewer(true)
                          : undefined
                      }
                      activeOpacity={isPrescription ? 0.85 : undefined}
                      style={{
                        maxWidth: isSystem ? "88%" : "75%",
                        backgroundColor: bubbleBg,
                        borderRadius: RFValue(16),
                        borderBottomRightRadius:
                          isSystem || isCurrentUser ? RFValue(4) : RFValue(16),
                        borderBottomLeftRadius:
                          isSystem || isCurrentUser ? RFValue(16) : RFValue(4),
                        padding: hasImage ? RFValue(6) : RFValue(14),
                        shadowColor: theme.shadowColor,
                        shadowOpacity: 0.05,
                        elevation: 1,
                        borderWidth: isSystem || isPrescription ? 1 : 0,
                        borderColor: isPrescription
                          ? "#C7D2FE"
                          : isSystem
                            ? theme.cardBorder
                            : "transparent",
                      }}
                    >
                      {!isSystem && !isCurrentUser ? (
                        <Text
                          style={{
                            fontSize: RFValue(11),
                            color: theme.textTertiary,
                            marginBottom: 4,
                            fontWeight: "700",
                          }}
                        >
                          {msg.senderName}
                        </Text>
                      ) : null}

                      {hasImage ? (
                        <Image
                          source={{ uri: msg.imageUrl }}
                          style={{
                            width: RFValue(220),
                            maxWidth: "100%",
                            height: RFValue(160),
                            borderRadius: RFValue(12),
                            backgroundColor: theme.bg,
                          }}
                          resizeMode="cover"
                        />
                      ) : null}

                      {msg.text ? (
                        <Text
                          style={{
                            fontSize: RFValue(14),
                            color: bodyTextColor,
                            lineHeight: RFValue(20),
                            textAlign: isSystem ? "center" : "left",
                            marginTop: hasImage ? RFValue(10) : 0,
                          }}
                        >
                          {msg.text}
                        </Text>
                      ) : null}
                      {isPrescription ? (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginTop: RFValue(8),
                          }}
                        >
                          <Ionicons
                            name="document-text-outline"
                            size={RFValue(12)}
                            color="#4F46E5"
                          />
                          <Text
                            style={{
                              marginLeft: 4,
                              fontSize: RFValue(11),
                              color: "#4F46E5",
                              fontWeight: "700",
                            }}
                          >
                            Tap to open prescription
                          </Text>
                        </View>
                      ) : null}
                      <Text
                        style={{
                          fontSize: RFValue(9),
                          color: isPrescription
                            ? "#6B7280"
                            : isSystem
                              ? theme.textTertiary
                              : hasImage
                                ? theme.textTertiary
                                : isCurrentUser
                                  ? "rgba(255,255,255,0.7)"
                                  : theme.textTertiary,
                          marginTop: hasImage || msg.text ? 4 : 0,
                          textAlign: isSystem ? "center" : "right",
                        }}
                      >
                        {msg.time}
                      </Text>
                    </InnerBubble>
                  </View>
                );
              })
            ) : (
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                  marginTop: RFValue(100),
                }}
              >
                <View
                  style={{
                    width: RFValue(64),
                    height: RFValue(64),
                    borderRadius: RFValue(32),
                    backgroundColor: theme.card,
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: RFValue(16),
                  }}
                >
                  <Ionicons
                    name="chatbubbles-outline"
                    size={32}
                    color={theme.textTertiary}
                  />
                </View>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: RFValue(13),
                  }}
                >
                  This is the start of your conversation.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Floating "jump to latest message" pill - appears only when the
              user has scrolled away from the bottom of the conversation. */}
          {!isAtChatBottom && contactMessages.length > 0 && (
            <TouchableOpacity
              onPress={() => scrollChatToBottom(true)}
              activeOpacity={0.85}
              style={{
                position: "absolute",
                right: RFValue(16),
                bottom:
                  RFValue(56) +
                  androidComposerLift +
                  (keyboardVisible && Platform.OS === "ios" ? RFValue(40) : 0) +
                  Math.max(insets.bottom, RFValue(6)),
                backgroundColor: theme.accent,
                paddingHorizontal: RFValue(14),
                paddingVertical: RFValue(8),
                borderRadius: RFValue(22),
                flexDirection: "row",
                alignItems: "center",
                shadowColor: theme.accent,
                shadowOpacity: 0.35,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 8,
                elevation: 6,
              }}
            >
              <Ionicons
                name="arrow-down"
                size={RFValue(14)}
                color="#FFF"
                style={{ marginRight: 6 }}
              />
              <Text
                style={{
                  color: "#FFF",
                  fontSize: RFValue(12),
                  fontWeight: "700",
                }}
              >
                Latest
              </Text>
            </TouchableOpacity>
          )}

          <View
            style={{
              backgroundColor: theme.card,
              paddingHorizontal: RFValue(12),
              paddingTop: RFValue(8),
              paddingBottom: RFValue(10),
              marginBottom: androidComposerLift,
              borderTopWidth: 1,
              borderTopColor: theme.cardBorder,
              flexDirection: "row",
              alignItems: "flex-end",
            }}
          >
            {!isAssistantConversation(selectedContact) && (
              <>
                <TouchableOpacity
                  onPress={() => sendAttachment("camera")}
                  disabled={sendingAttachment}
                  style={{
                    width: RFValue(36),
                    height: RFValue(36),
                    borderRadius: RFValue(18),
                    backgroundColor: theme.bg,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(8),
                    opacity: sendingAttachment ? 0.5 : 1,
                  }}
                >
                  <Ionicons
                    name="camera"
                    size={RFValue(18)}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => sendAttachment("image")}
                  disabled={sendingAttachment}
                  style={{
                    width: RFValue(36),
                    height: RFValue(36),
                    borderRadius: RFValue(18),
                    backgroundColor: theme.bg,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(8),
                    opacity: sendingAttachment ? 0.5 : 1,
                  }}
                >
                  <Ionicons
                    name="image"
                    size={RFValue(18)}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>
              </>
            )}
            <View
              style={{
                flex: 1,
                backgroundColor: theme.inputBg,
                borderRadius: RFValue(20),
                paddingHorizontal: RFValue(16),
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: theme.inputBorder,
              }}
            >
              <TextInput
                style={{
                  flex: 1,
                  maxHeight: Math.min(
                    RFValue(120),
                    Math.round(SHORT_SIDE * 0.22),
                  ),
                  paddingVertical: RFValue(8),
                  fontSize: RFValue(14),
                  color: theme.textPrimary,
                }}
                placeholder={
                  isAssistantConversation(selectedContact)
                    ? assistantThinking
                      ? "Assistant is typing..."
                      : "Ask the Health Assistant..."
                    : "Write something..."
                }
                placeholderTextColor={theme.textTertiary}
                value={message}
                onChangeText={setMessage}
                multiline
                editable={!assistantThinking}
                textAlignVertical="top"
              />
            </View>
            <TouchableOpacity
              onPress={sendMessage}
              disabled={
                isAssistantConversation(selectedContact) && assistantThinking
              }
              style={{
                width: RFValue(40),
                height: RFValue(40),
                borderRadius: RFValue(20),
                backgroundColor: theme.accent,
                justifyContent: "center",
                alignItems: "center",
                marginLeft: RFValue(8),
                opacity:
                  isAssistantConversation(selectedContact) && assistantThinking
                    ? 0.6
                    : 1,
                shadowColor: theme.accent,
                shadowOpacity: 0.3,
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 6,
                elevation: 3,
              }}
            >
              {isAssistantConversation(selectedContact) && assistantThinking ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Ionicons name="send" size={RFValue(18)} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.card} />

      <View style={{ flex: 1, minHeight: 0 }}>
        <View
          style={{
            backgroundColor: theme.card,
            padding: RFValue(20),
            borderBottomWidth: 1,
            borderBottomColor: theme.cardBorder,
          }}
        >
          <Text
            style={{
              fontSize: RFValue(22),
              fontWeight: "900",
              color: theme.textPrimary,
              marginBottom: RFValue(16),
            }}
          >
            Messages
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: theme.bg,
              borderRadius: RFValue(12),
              paddingHorizontal: RFValue(14),
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          >
            <Ionicons
              name="search"
              size={RFValue(18)}
              color={theme.textTertiary}
              style={{ marginRight: RFValue(8) }}
            />
            <TextInput
              placeholder="Search people or chats..."
              placeholderTextColor={theme.textTertiary}
              style={{
                flex: 1,
                paddingVertical: RFValue(10),
                fontSize: RFValue(14),
                color: theme.textPrimary,
              }}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{
            padding: RFValue(16),
            paddingBottom: tabScrollBottomPadding() + RFValue(8),
          }}
        >
          {showDirectoryResults ? (
            <View style={{ marginBottom: RFValue(18) }}>
              <Text
                style={{
                  fontSize: RFValue(14),
                  fontWeight: "800",
                  color: theme.textPrimary,
                  marginBottom: RFValue(10),
                }}
              >
                Directory
              </Text>
              {directoryLoading ? (
                <View
                  style={{ alignItems: "center", paddingVertical: RFValue(16) }}
                >
                  <Text
                    style={{ fontSize: RFValue(12), color: theme.textTertiary }}
                  >
                    Searching directory...
                  </Text>
                </View>
              ) : directoryMatches.length > 0 ? (
                directoryMatches.map((contact) => {
                  const existingConversation = findDirectConversation(
                    contact.id,
                  );
                  const isStarting = startingChatId === contact.id;
                  const buttonLabel = isStarting
                    ? "Starting..."
                    : existingConversation
                      ? "Open chat"
                      : "Start chat";
                  const { color: accentColor, bg: accentBg } =
                    roleThemeTokensFor(theme, contact.role);
                  return (
                    <TouchableOpacity
                      key={contact.id}
                      onPress={() => handleStartChat(contact)}
                      disabled={isStarting}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: theme.card,
                        padding: RFValue(14),
                        borderRadius: RFValue(18),
                        marginBottom: RFValue(10),
                        borderWidth: 1,
                        borderColor: theme.cardBorder,
                      }}
                    >
                      <View
                        style={{
                          width: RFValue(48),
                          height: RFValue(48),
                          borderRadius: RFValue(16),
                          backgroundColor: accentBg,
                          justifyContent: "center",
                          alignItems: "center",
                          marginRight: RFValue(14),
                        }}
                      >
                        <Ionicons
                          name={contact.icon}
                          size={RFValue(22)}
                          color={accentColor}
                        />
                      </View>
                      <View style={{ flex: 1, marginRight: RFValue(10) }}>
                        <Text
                          style={{
                            fontSize: RFValue(14),
                            fontWeight: "800",
                            color: theme.textPrimary,
                            marginBottom: 2,
                          }}
                          numberOfLines={1}
                        >
                          {contact.displayName}
                        </Text>
                        <Text
                          style={{
                            fontSize: RFValue(12),
                            color: theme.textSecondary,
                            fontWeight: "700",
                          }}
                          numberOfLines={1}
                        >
                          {contact.roleLabel}
                        </Text>
                        {contact.email ? (
                          <Text
                            style={{
                              fontSize: RFValue(11),
                              color: theme.textTertiary,
                              marginTop: 2,
                            }}
                            numberOfLines={1}
                          >
                            {contact.email}
                          </Text>
                        ) : null}
                      </View>
                      <View
                        style={{
                          paddingHorizontal: RFValue(12),
                          paddingVertical: RFValue(6),
                          borderRadius: RFValue(12),
                          backgroundColor: theme.bg,
                          borderWidth: 1,
                          borderColor: accentColor,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: RFValue(11),
                            fontWeight: "700",
                            color: accentColor,
                          }}
                        >
                          {buttonLabel}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View
                  style={{ alignItems: "center", paddingVertical: RFValue(16) }}
                >
                  <Ionicons
                    name="search"
                    size={RFValue(32)}
                    color={theme.cardBorder}
                    style={{ marginBottom: RFValue(10) }}
                  />
                  <Text
                    style={{ fontSize: RFValue(12), color: theme.textTertiary }}
                  >
                    No contacts match your search.
                  </Text>
                </View>
              )}
              {directoryError ? (
                <Text
                  style={{
                    fontSize: RFValue(12),
                    color: theme.danger,
                    marginTop: RFValue(8),
                    textAlign: "center",
                  }}
                >
                  {directoryError}
                </Text>
              ) : null}
            </View>
          ) : null}

          {showDirectoryResults ? (
            <Text
              style={{
                fontSize: RFValue(14),
                fontWeight: "800",
                color: theme.textPrimary,
                marginBottom: RFValue(12),
              }}
            >
              Conversations
            </Text>
          ) : null}

          {dataLoading ? (
            <View
              style={{ alignItems: "center", paddingVertical: RFValue(60) }}
            >
              <Text
                style={{ fontSize: RFValue(14), color: theme.textTertiary }}
              >
                Loading conversations...
              </Text>
            </View>
          ) : filteredContacts.length > 0 ? (
            filteredContacts.map((contact) => (
              <TouchableOpacity
                key={contact.id}
                onPress={() => setSelectedContact(contact)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: theme.card,
                  padding: RFValue(16),
                  borderRadius: RFValue(20),
                  marginBottom: RFValue(12),
                  shadowColor: "#000",
                  shadowOpacity: 0.03,
                  elevation: 1,
                }}
              >
                <View
                  style={{
                    width: RFValue(54),
                    height: RFValue(54),
                    borderRadius: RFValue(18),
                    backgroundColor: theme.accentLight,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(16),
                    position: "relative",
                  }}
                >
                  <Ionicons
                    name={contact.image}
                    size={RFValue(28)}
                    color={theme.accent}
                  />
                  <View
                    style={{
                      position: "absolute",
                      bottom: -2,
                      right: -2,
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: theme.success,
                      borderWidth: 3,
                      borderColor: theme.card,
                    }}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        minWidth: 0,
                        paddingRight: RFValue(10),
                      }}
                    >
                      <Text
                        style={{
                          fontSize: RFValue(15),
                          fontWeight: "800",
                          color: theme.textPrimary,
                        }}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {contact.displayName}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: RFValue(11),
                        color: theme.textTertiary,
                        flexShrink: 0,
                      }}
                    >
                      {contact.time}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontSize: RFValue(12),
                          color: theme.textSecondary,
                          fontWeight: "700",
                          marginBottom: 2,
                        }}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {contact.roleLabel}
                      </Text>
                      <Text
                        style={{
                          fontSize: RFValue(12),
                          color: theme.textSecondary,
                        }}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                      >
                        {contact.lastMsg}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View
              style={{ alignItems: "center", paddingVertical: RFValue(60) }}
            >
              <Ionicons
                name="chatbubbles-outline"
                size={RFValue(48)}
                color={theme.cardBorder}
                style={{ marginBottom: RFValue(16) }}
              />
              <Text
                style={{ fontSize: RFValue(14), color: theme.textTertiary }}
              >
                {dataError || "No conversations found"}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const ThemeScreen = ({ onBack }) => {
  const { theme, changeTheme, themeKey } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState(themeKey);

  const themes = [
    {
      key: "light",
      name: "Light",
      desc: "Clean and bright interface",
      bg: "#FFFFFF",
      card: "#F8FAFC",
      accent: "#4338CA",
      icon: "sunny",
      preview: "#F8FAFC",
    },
    {
      key: "dark",
      name: "Dark",
      desc: "Easy on the eyes, saves battery",
      bg: "#0F172A",
      card: "#1E293B",
      accent: "#818CF8",
      icon: "moon",
      preview: "#0F172A",
    },
    {
      key: "midnight",
      name: "Midnight Blue",
      desc: "Deep blue tones for night use",
      bg: "#0C1222",
      card: "#162032",
      accent: "#3B82F6",
      icon: "planet",
      preview: "#0C1222",
    },
    {
      key: "forest",
      name: "Forest Green",
      desc: "Nature-inspired calm palette",
      bg: "#052E16",
      card: "#14532D",
      accent: "#34D399",
      icon: "leaf",
      preview: "#052E16",
    },
    {
      key: "rose",
      name: "Rose Gold",
      desc: "Warm elegant rose tones",
      bg: "#1C1017",
      card: "#2D1B24",
      accent: "#FB7185",
      icon: "rose",
      preview: "#1C1017",
    },
    {
      key: "ocean",
      name: "Ocean Teal",
      desc: "Refreshing teal palette",
      bg: "#042F2E",
      card: "#134E4A",
      accent: "#2DD4BF",
      icon: "water",
      preview: "#042F2E",
    },
  ];

  const current = themes.find((t) => t.key === selectedTheme);

  const applyTheme = () => {
    changeTheme(selectedTheme);
    onBack();
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: RFValue(16),
          }}
        >
          <TouchableOpacity
            onPress={onBack}
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(10),
              backgroundColor: theme.bg,
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(14),
            }}
          >
            <Ionicons
              name="arrow-back"
              size={RFValue(20)}
              color={theme.textPrimary}
            />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: RFValue(18),
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            Choose Theme
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        {/* Live Preview */}
        <View
          style={{
            backgroundColor: current.bg,
            borderRadius: RFValue(18),
            padding: RFValue(20),
            marginBottom: RFValue(20),
            borderWidth: 2,
            borderColor: current.accent,
            shadowColor: current.accent,
            shadowOpacity: 0.2,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 4,
          }}
        >
          <Text
            style={{
              fontSize: RFValue(12),
              fontWeight: "700",
              color: current.accent,
              marginBottom: RFValue(12),
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Live Preview
          </Text>
          <View
            style={{
              backgroundColor: current.card,
              borderRadius: RFValue(12),
              padding: RFValue(14),
              marginBottom: RFValue(10),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: RFValue(8),
              }}
            >
              <View
                style={{
                  width: RFValue(32),
                  height: RFValue(32),
                  borderRadius: RFValue(8),
                  backgroundColor: current.accent,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(10),
                }}
              >
                <Ionicons name={current.icon} size={RFValue(16)} color="#FFF" />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: RFValue(14),
                    fontWeight: "700",
                    color: current.key === "light" ? "#1E1B4B" : "#F1F5F9",
                  }}
                >
                  Sample Card
                </Text>
                <Text
                  style={{
                    fontSize: RFValue(11),
                    color: current.key === "light" ? "#6B7280" : "#94A3B8",
                  }}
                >
                  This is how it looks
                </Text>
              </View>
            </View>
            <View
              style={{
                height: RFValue(6),
                backgroundColor:
                  current.key === "light" ? "#F3F4F6" : "#334155",
                borderRadius: RFValue(3),
              }}
            >
              <View
                style={{
                  width: "70%",
                  height: "100%",
                  backgroundColor: current.accent,
                  borderRadius: RFValue(3),
                }}
              />
            </View>
          </View>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <View
              style={{
                backgroundColor: current.card,
                borderRadius: RFValue(8),
                padding: RFValue(8),
                flex: 1,
                marginRight: RFValue(6),
                alignItems: "center",
              }}
            >
              <Ionicons
                name="heart"
                size={RFValue(16)}
                color={current.accent}
              />
              <Text
                style={{
                  fontSize: RFValue(9),
                  color: current.key === "light" ? "#6B7280" : "#94A3B8",
                  marginTop: RFValue(4),
                }}
              >
                Health
              </Text>
            </View>
            <View
              style={{
                backgroundColor: current.card,
                borderRadius: RFValue(8),
                padding: RFValue(8),
                flex: 1,
                marginLeft: RFValue(6),
                alignItems: "center",
              }}
            >
              <Ionicons
                name="chatbubble"
                size={RFValue(16)}
                color={current.accent}
              />
              <Text
                style={{
                  fontSize: RFValue(9),
                  color: current.key === "light" ? "#6B7280" : "#94A3B8",
                  marginTop: RFValue(4),
                }}
              >
                Chat
              </Text>
            </View>
          </View>
        </View>

        {/* Theme Options */}
        <Text
          style={{
            fontSize: RFValue(14),
            fontWeight: "700",
            color: theme.textPrimary,
            marginBottom: RFValue(12),
          }}
        >
          Available Themes
        </Text>
        {themes.map((t, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => setSelectedTheme(t.key)}
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(16),
              padding: RFValue(16),
              marginBottom: RFValue(10),
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
              flexDirection: "row",
              alignItems: "center",
              borderWidth: selectedTheme === t.key ? 2 : 1,
              borderColor:
                selectedTheme === t.key ? t.accent : theme.cardBorder,
            }}
          >
            <View
              style={{
                width: RFValue(48),
                height: RFValue(48),
                borderRadius: RFValue(14),
                backgroundColor: t.bg,
                justifyContent: "center",
                alignItems: "center",
                marginRight: RFValue(14),
                borderWidth: 2,
                borderColor: t.accent,
              }}
            >
              <Ionicons name={t.icon} size={RFValue(22)} color={t.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: RFValue(15),
                  fontWeight: "700",
                  color: theme.textPrimary,
                }}
              >
                {t.name}
              </Text>
              <Text
                style={{ fontSize: RFValue(12), color: theme.textSecondary }}
              >
                {t.desc}
              </Text>
            </View>
            {selectedTheme === t.key && (
              <View
                style={{
                  width: RFValue(24),
                  height: RFValue(24),
                  borderRadius: RFValue(12),
                  backgroundColor: t.accent,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="checkmark" size={RFValue(16)} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          onPress={applyTheme}
          style={{
            backgroundColor: current.accent,
            borderRadius: RFValue(14),
            paddingVertical: RFValue(16),
            alignItems: "center",
            marginTop: RFValue(8),
          }}
        >
          <Text
            style={{ color: "#FFF", fontSize: RFValue(16), fontWeight: "700" }}
          >
            Apply {current.name} Theme
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const PatientEditProfileScreen = ({
  onBack,
  currentUser,
  patientProfile,
  onSaved,
}) => {
  const { theme } = useTheme();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [condition, setCondition] = useState("");
  const [gender, setGender] = useState("");
  const [avatarAsset, setAvatarAsset] = useState(null);
  const [healthValues, setHealthValues] = useState(emptyPatientHealthValues);
  const [comfortLanguage, setComfortLanguage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateHealthField = useCallback((key, value) => {
    setHealthValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    setFullName(
      String(patientProfile?.full_name || currentUser?.name || "").trim(),
    );
    setPhone(String(patientProfilePhoneRaw(patientProfile) || ""));
    setCondition(
      String(
        patientProfile?.primary_condition || patientProfile?.condition || "",
      ).trim(),
    );
    setGender(String(patientProfile?.gender || "").trim());
    setHealthValues(patientHealthValuesFromProfile(patientProfile));
    setComfortLanguage(String(patientProfile?.language || "").trim());
    setAvatarAsset(null);
    setError("");
  }, [patientProfile?.id, currentUser?.id]);

  const pickAvatar = async (source) => {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission?.granted) {
          Alert.alert(
            "Permission needed",
            "Please allow camera access to take a profile photo.",
          );
          return;
        }
      } else {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission?.granted) {
          Alert.alert(
            "Permission needed",
            "Please allow photo library access to pick a profile photo.",
          );
          return;
        }
      }
      const pickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (!result || result.canceled) return;
      const asset = result.assets?.[0];
      if (asset?.uri) setAvatarAsset(asset);
    } catch (saveError) {
      console.log("pickAvatar error:", saveError);
      Alert.alert("Photo", saveError?.message || "Could not add photo.");
    }
  };

  const handleSave = async () => {
    if (!patientProfile?.id) {
      setError("Profile not loaded. Please try again.");
      return;
    }
    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    const healthProfileError =
      validatePatientHealthProfileComplete(healthValues);
    if (healthProfileError) {
      setError(healthProfileError);
      return;
    }
    try {
      setSaving(true);
      setError("");
      await pb.collection("patient_profile").update(patientProfile.id, {
        full_name: fullName.trim(),
        phone: phone.trim(),
        primary_condition: condition.trim(),
        gender: gender.trim(),
        language: comfortLanguage.trim(),
        ...buildPatientHealthPayload(healthValues),
      });
      if (currentUser?.id) {
        await pb.collection("UsersAuth").update(currentUser.id, {
          name: fullName.trim(),
        });
      }
      if (avatarAsset?.uri) {
        const part = pickerAssetToUploadPart(avatarAsset);
        if (part) {
          const formData = new FormData();
          formData.append("avatar", part);
          try {
            await pb
              .collection("patient_profile")
              .update(patientProfile.id, formData);
          } catch (imageError) {
            const fallbackData = new FormData();
            fallbackData.append("photo", part);
            await pb
              .collection("patient_profile")
              .update(patientProfile.id, fallbackData);
          }
        }
      }
      if (onSaved) await onSaved();
      onBack();
    } catch (saveError) {
      console.log("PatientEditProfileScreen save:", saveError);
      setError(
        saveError?.data?.message ||
          saveError?.message ||
          "Could not save. Required patient_profile fields in PocketBase: full_name, phone, primary_condition, gender, avatar, plus optional: language, age, weight_kg, height_cm, marital_status, district, state, smoking, alcohol, medical_conditions, allergies.",
      );
    } finally {
      setSaving(false);
    }
  };

  const previewUri =
    avatarAsset?.uri || patientProfileAvatarUrl(patientProfile);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1, minHeight: 0 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            backgroundColor: theme.card,
            padding: RFValue(20),
            borderBottomWidth: 1,
            borderBottomColor: theme.cardBorder,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            onPress={onBack}
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(10),
              backgroundColor: theme.bg,
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(14),
            }}
          >
            <Ionicons
              name="arrow-back"
              size={RFValue(20)}
              color={theme.textPrimary}
            />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: RFValue(20),
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            Edit profile
          </Text>
        </View>
        <ScrollView
          contentContainerStyle={{
            padding: RFValue(16),
            paddingBottom: tabScrollBottomPadding(),
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            style={{
              fontSize: RFValue(13),
              fontWeight: "700",
              color: theme.textSecondary,
              marginBottom: RFValue(8),
            }}
          >
            Profile photo
          </Text>
          <TouchableOpacity
            onPress={() =>
              Alert.alert("Profile photo", "Choose a source", [
                { text: "Cancel", style: "cancel" },
                { text: "Camera", onPress: () => pickAvatar("camera") },
                { text: "Library", onPress: () => pickAvatar("library") },
              ])
            }
            style={{
              width: RFValue(100),
              height: RFValue(100),
              borderRadius: RFValue(24),
              backgroundColor: theme.accentLight,
              overflow: "hidden",
              marginBottom: RFValue(20),
              alignSelf: "center",
            }}
          >
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name="person"
                  size={RFValue(40)}
                  color={theme.accent}
                />
              </View>
            )}
          </TouchableOpacity>

          {[
            {
              label: "Full name",
              value: fullName,
              onChange: setFullName,
              placeholder: "Your name",
            },
            {
              label: "Phone number",
              value: phone,
              onChange: setPhone,
              placeholder: "e.g. 9876543210",
              keyboard: "phone-pad",
            },
            {
              label: "Condition / main concern",
              value: condition,
              onChange: setCondition,
              placeholder: "Helps match you with the right doctors",
            },
            {
              label: "Comfortable consultation language",
              value: comfortLanguage,
              onChange: setComfortLanguage,
              placeholder: "e.g. English, Hindi, Tamil",
            },
          ].map((field) => (
            <View key={field.label} style={{ marginBottom: RFValue(16) }}>
              <Text
                style={{
                  fontSize: RFValue(13),
                  fontWeight: "700",
                  color: theme.textSecondary,
                  marginBottom: RFValue(8),
                }}
              >
                {field.label}
              </Text>
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                placeholder={field.placeholder}
                placeholderTextColor={theme.textTertiary}
                keyboardType={field.keyboard || "default"}
                style={{
                  backgroundColor: theme.card,
                  borderRadius: RFValue(14),
                  paddingHorizontal: RFValue(16),
                  paddingVertical: RFValue(14),
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                  fontSize: RFValue(15),
                  color: theme.textPrimary,
                }}
              />
            </View>
          ))}

          <PatientHealthProfileFields
            palette={{
              card: theme.card,
              border: theme.cardBorder,
              textPrimary: theme.textPrimary,
              textSecondary: theme.textSecondary,
              textTertiary: theme.textTertiary,
              placeholder: theme.textTertiary,
              accent: theme.accent,
              accentText: "#FFFFFF",
            }}
            values={healthValues}
            onChange={updateHealthField}
            disabled={saving}
          />

          <Text
            style={{
              fontSize: RFValue(13),
              fontWeight: "700",
              color: theme.textSecondary,
              marginBottom: RFValue(8),
            }}
          >
            Gender
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginBottom: RFValue(20),
            }}
          >
            {[
              { id: "male", label: "Male" },
              { id: "female", label: "Female" },
              { id: "other", label: "Other" },
            ].map((option) => {
              const active = gender === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => setGender(option.id)}
                  style={{
                    paddingHorizontal: RFValue(16),
                    paddingVertical: RFValue(10),
                    borderRadius: RFValue(12),
                    backgroundColor: active ? theme.accent : theme.bg,
                    borderWidth: 1,
                    borderColor: active ? theme.accent : theme.cardBorder,
                    marginRight: RFValue(8),
                    marginBottom: RFValue(8),
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: RFValue(14),
                      color: active ? "#FFF" : theme.textPrimary,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text
            style={{
              fontSize: RFValue(12),
              color: theme.textTertiary,
              marginBottom: RFValue(12),
            }}
          >
            Email ({currentUser?.email || "-"}) is tied to your login. To change
            it, contact support or use account recovery in PocketBase.
          </Text>

          {error ? (
            <Text
              style={{
                color: theme.danger,
                marginBottom: RFValue(12),
                fontWeight: "600",
              }}
            >
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{
              backgroundColor: theme.accent,
              borderRadius: RFValue(14),
              paddingVertical: RFValue(16),
              alignItems: "center",
              marginTop: RFValue(8),
              opacity: saving ? 0.85 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text
                style={{
                  color: "#FFF",
                  fontWeight: "700",
                  fontSize: RFValue(16),
                }}
              >
                Save changes
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const PatientAppointmentsScreen = ({ onBack }) => {
  const { theme } = useTheme();
  const tabNav = useMainTabNav();
  const {
    currentUser,
    patientProfile,
    appointments,
    fetchApprovedDoctors,
    refreshAllData,
    ensureDirectConversation,
    loadConversationMessages,
    sendConversationMessage,
    requestOpenConversation,
    payForAppointment,
    setPatientProfile,
  } = useAppData();
  const showBack = typeof onBack === "function";
  const [packageDoctors, setPackageDoctors] = useState([]);
  const [payingAppointmentId, setPayingAppointmentId] = useState(null);
  const [phonePaymentAppointment, setPhonePaymentAppointment] = useState(null);
  const [paymentPhone, setPaymentPhone] = useState("");
  const [savingPaymentPhone, setSavingPaymentPhone] = useState(false);

  const regularAppointments = (appointments || [])
    .filter((appointment) => !appointment.isPackageDemoMeeting)
    .sort(
      (left, right) =>
        new Date(right.scheduledAt || 0).getTime() -
        new Date(left.scheduledAt || 0).getTime(),
    );

  const handlePayForAppointment = async (appointment) => {
    if (!payForAppointment || !appointment?.id) return;
    const phoneDigits = String(
      appointment.customerPhone || patientProfilePhoneRaw(patientProfile) || "",
    ).replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      setPhonePaymentAppointment(appointment);
      setPaymentPhone(phoneDigits);
      return false;
    }
    try {
      setPayingAppointmentId(appointment.id);
      await payForAppointment({ ...appointment, customerPhone: phoneDigits });
      await refreshAllData?.();
      Alert.alert("Payment", "Payment confirmed for this appointment.");
      return true;
    } catch (error) {
      Alert.alert(
        "Payment",
        error?.message || "Could not complete payment. Please retry.",
      );
      return false;
    } finally {
      setPayingAppointmentId(null);
    }
  };

  const savePhoneAndContinuePayment = async () => {
    const phoneDigits = String(paymentPhone || "").replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      Alert.alert(
        "Phone required",
        "Enter a valid 10 digit mobile number for payment.",
      );
      return;
    }
    const appointment = phonePaymentAppointment;
    if (!appointment?.id) return;
    try {
      setSavingPaymentPhone(true);
      if (patientProfile?.id) {
        const updated = await pb
          .collection("patient_profile")
          .update(patientProfile.id, {
            phone: phoneDigits,
          });
        setPatientProfile?.(updated);
      }
      setPhonePaymentAppointment(null);
      setPaymentPhone("");
      await handlePayForAppointment({
        ...appointment,
        customerPhone: phoneDigits,
      });
    } catch (error) {
      Alert.alert(
        "Phone required",
        formatPocketBaseClientError(error) ||
          error?.message ||
          "Could not save your phone number.",
      );
    } finally {
      setSavingPaymentPhone(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchApprovedDoctors({ packageModeOnly: true });
      if (!cancelled) setPackageDoctors(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchApprovedDoctors]);

  const handleOpenChatWithDoctor = useCallback(
    async (doctorUserId, meeting = null, offer = null) => {
      if (!doctorUserId) {
        Alert.alert("Chat", "Doctor info missing on this meeting.");
        return;
      }
      try {
        let cid =
          meeting?.demo_conversation_id || meeting?.conversation_id || null;
        if (!cid && meeting?.id) {
          try {
            cid = await ensurePackageDemoMeetingConversation(meeting.id);
          } catch (e) {
            console.log("ensurePackageDemoMeetingConversation:", e?.message);
          }
        }
        if (!cid) {
          const conv = await ensureDirectConversation(doctorUserId);
          cid = conv?.id || null;
        }
        if (!cid) {
          Alert.alert("Chat", "Could not open the chat with this doctor.");
          return;
        }
        try {
          const existing = await loadConversationMessages(cid);
          if (!existing || existing.length === 0) {
            const lines = [];
            if (meeting?.description) {
              lines.push(`Reason: ${meeting.description}`);
            }
            const meetingTime =
              meeting?.confirmed_at ||
              meeting?.patient_selected_slot ||
              meeting?.proposed_at ||
              null;
            if (meetingTime) {
              const when = new Date(meetingTime).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              });
              lines.push(`Demo confirmed: ${when}.`);
            }
            if (offer?.title) {
              lines.push(
                `Package: ${offer.title} - ₹${offer.amount_inr ?? "-"}.`,
              );
            }
            if (String(offer?.status || "").toLowerCase() === "paid") {
              lines.push(
                `Payment received${
                  offer?.amount_inr ? ` (₹${offer.amount_inr})` : ""
                }. Looking forward to working with you.`,
              );
            }
            for (const line of lines) {
              try {
                await sendConversationMessage(cid, line);
              } catch {
                // best-effort seed
              }
            }
          }
        } catch (seedErr) {
          console.log("PatientAppointmentsScreen chat seed:", seedErr?.message);
        }
        requestOpenConversation?.(cid, { patientUserId: doctorUserId });
        tabNav?.navigateTab?.("Chat");
      } catch (error) {
        Alert.alert(
          "Chat",
          error?.message || "Could not open chat with this doctor.",
        );
      }
    },
    [
      ensureDirectConversation,
      loadConversationMessages,
      sendConversationMessage,
      requestOpenConversation,
      tabNav,
    ],
  );

  const handleAfterPackagePayment = useCallback(
    async ({ doctorUserId, packageTitle, amount }) => {
      if (!doctorUserId) return null;
      try {
        const conv = await ensureDirectConversation(doctorUserId);
        const cid = conv?.id;
        if (cid) {
          try {
            await sendConversationMessage(
              cid,
              `Payment confirmed for ${packageTitle || "the package"}${
                amount ? ` (₹${amount})` : ""
              }. Looking forward to working with you.`,
            );
          } catch {
            // non-fatal
          }
        }
        return cid || null;
      } catch (error) {
        console.log("handleAfterPackagePayment (Appts):", error?.message);
        return null;
      }
    },
    [ensureDirectConversation, sendConversationMessage],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {showBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(10),
              backgroundColor: theme.bg,
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(14),
            }}
          >
            <Ionicons
              name="arrow-back"
              size={RFValue(20)}
              color={theme.textPrimary}
            />
          </TouchableOpacity>
        ) : null}
        <Text
          style={{
            fontSize: RFValue(20),
            fontWeight: "800",
            color: theme.textPrimary,
          }}
        >
          Appointments
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: RFValue(18),
            padding: RFValue(16),
            margin: RFValue(16),
            marginBottom: RFValue(10),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.cardBorder,
          }}
        >
          <Text
            style={{
              fontSize: RFValue(16),
              fontWeight: "800",
              color: theme.textPrimary,
              marginBottom: RFValue(10),
            }}
          >
            Doctor Appointments
          </Text>
          {regularAppointments.length === 0 ? (
            <Text
              style={{
                fontSize: RFValue(12),
                color: theme.textSecondary,
                lineHeight: RFValue(18),
              }}
            >
              No regular appointments yet. Book an appointment and wait for
              doctor approval to pay.
            </Text>
          ) : (
            regularAppointments.slice(0, 6).map((appointment) => {
              const statusKey = normalizeAppointmentStatus(
                appointment.statusKey,
              );
              const statusColors = appointmentStatusColorsFor(theme, statusKey);
              const canPay = statusKey === "approved";
              const isPaying = payingAppointmentId === appointment.id;
              return (
                <View
                  key={appointment.id}
                  style={{
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.cardBorder,
                    paddingTop: RFValue(12),
                    marginTop: RFValue(10),
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        marginRight: RFValue(8),
                        fontSize: RFValue(14),
                        fontWeight: "800",
                        color: theme.textPrimary,
                      }}
                      numberOfLines={1}
                    >
                      {appointment.doctorName || "Doctor"}
                    </Text>
                    <View
                      style={{
                        backgroundColor: statusColors.bg,
                        borderRadius: RFValue(8),
                        paddingHorizontal: RFValue(8),
                        paddingVertical: RFValue(3),
                      }}
                    >
                      <Text
                        style={{
                          color: statusColors.fg,
                          fontSize: RFValue(10),
                          fontWeight: "800",
                        }}
                      >
                        {humanizeAppointmentStatus(statusKey)}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: theme.textSecondary,
                      marginTop: RFValue(4),
                    }}
                  >
                    {formatAppointmentSummaryDate(appointment.scheduledAt)} ·{" "}
                    {formatTimeValue(appointment.scheduledAt)} · ₹
                    {appointment.consultationFee || 500}
                  </Text>
                  {canPay ? (
                    <TouchableOpacity
                      onPress={() => handlePayForAppointment(appointment)}
                      disabled={isPaying}
                      style={{
                        alignSelf: "flex-start",
                        backgroundColor: theme.success,
                        borderRadius: RFValue(10),
                        paddingHorizontal: RFValue(14),
                        paddingVertical: RFValue(8),
                        marginTop: RFValue(10),
                        opacity: isPaying ? 0.65 : 1,
                      }}
                    >
                      {isPaying ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: RFValue(12),
                            fontWeight: "800",
                          }}
                        >
                          Pay fee
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
        <PatientPackageMeetingsPanel
          theme={theme}
          patientUserId={currentUser?.id}
          patientProfileId={patientProfile?.id}
          doctors={packageDoctors}
          onOpenChatWithDoctor={handleOpenChatWithDoctor}
          onAfterPackagePayment={handleAfterPackagePayment}
          onPayAppointment={handlePayForAppointment}
          scrollContentBottomInset={tabScrollBottomPadding()}
          emptyHint="None yet. Use Book Appt on Home or Package journey to schedule - everything appears here."
          onMeetingsChanged={() => refreshAllData()}
        />
      </View>
      <Modal
        visible={!!phonePaymentAppointment}
        transparent
        animationType="fade"
        onRequestClose={() =>
          !savingPaymentPhone && setPhonePaymentAppointment(null)
        }
      >
        <KeyboardAvoidingView
          style={{
            flex: 1,
            backgroundColor: "rgba(15,23,42,0.45)",
            justifyContent: "center",
            padding: RFValue(20),
          }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(18),
              padding: RFValue(18),
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(18),
                fontWeight: "900",
                color: theme.textPrimary,
                marginBottom: RFValue(8),
              }}
            >
              Mobile number required
            </Text>
            <Text
              style={{
                fontSize: RFValue(13),
                color: theme.textSecondary,
                lineHeight: RFValue(19),
                marginBottom: RFValue(14),
              }}
            >
              Cashfree needs the customer's mobile number to create the payment
              order. This will be saved to your patient profile for future
              payments.
            </Text>
            <TextInput
              value={paymentPhone}
              onChangeText={setPaymentPhone}
              placeholder="10 digit mobile number"
              placeholderTextColor={theme.textTertiary}
              keyboardType="phone-pad"
              editable={!savingPaymentPhone}
              style={{
                backgroundColor: theme.bg,
                borderRadius: RFValue(12),
                borderWidth: 1,
                borderColor: theme.cardBorder,
                paddingHorizontal: RFValue(14),
                paddingVertical: RFValue(12),
                fontSize: RFValue(15),
                color: theme.textPrimary,
                marginBottom: RFValue(14),
              }}
            />
            <TouchableOpacity
              onPress={savePhoneAndContinuePayment}
              disabled={savingPaymentPhone}
              style={{
                backgroundColor: theme.accent,
                borderRadius: RFValue(12),
                paddingVertical: RFValue(13),
                alignItems: "center",
                opacity: savingPaymentPhone ? 0.65 : 1,
              }}
            >
              {savingPaymentPhone ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  Save and pay
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                !savingPaymentPhone && setPhonePaymentAppointment(null)
              }
              disabled={savingPaymentPhone}
              style={{ alignItems: "center", marginTop: RFValue(12) }}
            >
              <Text style={{ color: theme.textSecondary, fontWeight: "700" }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const PatientProfileScreen = ({
  currentUser,
  patientProfile,
  onLogout,
  onPatientProfileSaved,
}) => {
  const [showTheme, setShowTheme] = useState(false);
  const [showAppointments, setShowAppointments] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showMedicalRecords, setShowMedicalRecords] = useState(false);
  const { theme } = useTheme();
  const {
    upgradeToPackageMode,
    resetCareOnboarding,
    patientCareMode,
    CARE_MODE,
  } = useAppData();

  const avatarUrl = patientProfileAvatarUrl(patientProfile);
  const phoneDisplay = formatPhoneForDisplay(
    patientProfilePhoneRaw(patientProfile),
  );

  if (showMedicalRecords)
    return (
      <MedicalRecordsScreen
        theme={theme}
        onBack={() => setShowMedicalRecords(false)}
        patientUserId={currentUser?.id}
      />
    );
  if (showTheme) return <ThemeScreen onBack={() => setShowTheme(false)} />;
  if (showAppointments)
    return (
      <PatientAppointmentsScreen onBack={() => setShowAppointments(false)} />
    );
  if (showEditProfile)
    return (
      <PatientEditProfileScreen
        onBack={() => setShowEditProfile(false)}
        currentUser={currentUser}
        patientProfile={patientProfile}
        onSaved={onPatientProfileSaved}
      />
    );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabScrollBottomPadding() }}
      >
        <View
          style={{
            backgroundColor: theme.card,
            padding: RFValue(24),
            alignItems: "center",
            borderBottomLeftRadius: RFValue(32),
            borderBottomRightRadius: RFValue(32),
            shadowColor: theme.shadowColor,
            shadowOpacity: 0.04,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 2,
          }}
        >
          <TouchableOpacity
            onPress={() => setShowEditProfile(true)}
            style={{ position: "relative", marginBottom: RFValue(14) }}
            activeOpacity={0.85}
          >
            <View
              style={{
                width: RFValue(80),
                height: RFValue(80),
                borderRadius: RFValue(24),
                backgroundColor: theme.accentLight,
                justifyContent: "center",
                alignItems: "center",
                overflow: "hidden",
              }}
            >
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={{ width: RFValue(80), height: RFValue(80) }}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons
                  name="person"
                  size={RFValue(40)}
                  color={theme.accent}
                />
              )}
            </View>
            <View
              style={{
                position: "absolute",
                right: -RFValue(4),
                bottom: -RFValue(4),
                width: RFValue(28),
                height: RFValue(28),
                borderRadius: RFValue(14),
                backgroundColor: theme.accent,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 2,
                borderColor: theme.card,
              }}
            >
              <Ionicons name="camera" size={RFValue(14)} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text
            style={{
              fontSize: RFValue(18),
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            {patientProfile?.full_name || currentUser?.name || "Profile Name"}
          </Text>
          <Text
            style={{
              fontSize: RFValue(13),
              color: theme.textSecondary,
              marginTop: RFValue(4),
            }}
          >
            {currentUser?.email || "user@example.com"}
          </Text>
          <Text
            style={{
              fontSize: RFValue(12),
              color: theme.textTertiary,
              marginTop: RFValue(2),
            }}
          >
            {phoneDisplay || "Add phone in Edit profile"}
          </Text>
          {(patientProfile?.primary_condition || patientProfile?.condition) &&
          String(
            patientProfile?.primary_condition ||
              patientProfile?.condition ||
              "",
          ).trim() ? (
            <Text
              style={{
                fontSize: RFValue(12),
                color: theme.textSecondary,
                marginTop: RFValue(8),
                textAlign: "center",
                paddingHorizontal: RFValue(8),
              }}
            >
              Concern:{" "}
              {String(
                patientProfile?.primary_condition ||
                  patientProfile?.condition ||
                  "",
              ).trim()}
              {patientProfile?.gender
                ? ` · ${
                    {
                      male: "Male",
                      female: "Female",
                      other: "Other",
                    }[String(patientProfile.gender).toLowerCase()] ||
                    patientProfile.gender
                  }`
                : ""}
            </Text>
          ) : null}
        </View>

        <View style={{ padding: RFValue(16) }}>
          {(patientCareMode === CARE_MODE.CASUAL ||
            patientCareMode === CARE_MODE.SKIP) && (
            <TouchableOpacity
              onPress={() => void upgradeToPackageMode?.()}
              style={{
                backgroundColor: theme.accent,
                borderRadius: RFValue(18),
                padding: RFValue(16),
                marginBottom: RFValue(14),
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "800",
                  fontSize: RFValue(15),
                }}
              >
                Upgrade to Package Doctor Mode
              </Text>
              <Text
                style={{
                  color: "rgba(255,255,255,0.85)",
                  fontSize: RFValue(12),
                  marginTop: 6,
                }}
              >
                Demo call, tailored packages, Pay now flow
              </Text>
            </TouchableOpacity>
          )}

          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(18),
              marginBottom: RFValue(16),
              padding: RFValue(16),
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.cardBorder,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(12),
                fontWeight: "700",
                color: theme.textTertiary,
                textTransform: "uppercase",
                marginBottom: RFValue(10),
              }}
            >
              Care journey & records
            </Text>
            <TouchableOpacity
              onPress={() => setShowMedicalRecords(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: RFValue(14),
              }}
            >
              <Ionicons
                name="document-text-outline"
                size={22}
                color={theme.accent}
              />
              <Text
                style={{
                  marginLeft: 10,
                  fontWeight: "700",
                  color: theme.textPrimary,
                  flex: 1,
                }}
              >
                Medical records
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.textTertiary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  "Choose again?",
                  "You will pick Package, Casual, or Skip again.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Continue",
                      style: "destructive",
                      onPress: () => void resetCareOnboarding?.(),
                    },
                  ],
                );
              }}
            >
              <Text style={{ color: theme.accent, fontWeight: "700" }}>
                Switch care journey…
              </Text>
            </TouchableOpacity>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: RFValue(11),
                marginTop: RFValue(12),
                lineHeight: 16,
              }}
            >
              Refund policy: changing your assigned doctor in Package mode does
              not refund the package fee. A new doctor continues remaining
              sessions; coin splits are adjusted by admin in the ledger.
            </Text>
            <PatientCoinHistoryPanel theme={theme} userId={currentUser?.id} />
          </View>

          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(18),
              marginBottom: RFValue(16),
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(12),
                fontWeight: "700",
                color: theme.textTertiary,
                textTransform: "uppercase",
                padding: RFValue(16),
                paddingBottom: RFValue(8),
              }}
            >
              Account
            </Text>
            {[
              {
                icon: "person-outline",
                label: "Edit Profile",
                onPress: () => setShowEditProfile(true),
              },
              { icon: "shield-checkmark-outline", label: "Privacy & Security" },
              { icon: "notifications-outline", label: "Notifications" },
              { icon: "language-outline", label: "Language" },
            ].map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={item.onPress}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: RFValue(16),
                  paddingTop: idx === 0 ? 0 : RFValue(16),
                  paddingBottom: idx === 3 ? RFValue(16) : RFValue(12),
                }}
              >
                <View
                  style={{
                    width: RFValue(36),
                    height: RFValue(36),
                    borderRadius: RFValue(10),
                    backgroundColor: theme.bg,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name={item.icon}
                    size={RFValue(18)}
                    color={theme.textSecondary}
                  />
                </View>
                <Text
                  style={{
                    fontSize: RFValue(15),
                    fontWeight: "600",
                    color: theme.textPrimary,
                    flex: 1,
                  }}
                >
                  {item.label}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={RFValue(16)}
                  color={theme.textTertiary}
                />
              </TouchableOpacity>
            ))}
          </View>

          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(18),
              marginBottom: RFValue(16),
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(12),
                fontWeight: "700",
                color: theme.textTertiary,
                textTransform: "uppercase",
                padding: RFValue(16),
                paddingBottom: RFValue(8),
              }}
            >
              Appearance
            </Text>
            <TouchableOpacity
              onPress={() => setShowTheme(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: RFValue(16),
                paddingTop: 0,
                paddingBottom: RFValue(16),
              }}
            >
              <View
                style={{
                  width: RFValue(36),
                  height: RFValue(36),
                  borderRadius: RFValue(10),
                  backgroundColor: theme.bg,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(14),
                }}
              >
                <Ionicons
                  name="color-palette-outline"
                  size={RFValue(18)}
                  color={theme.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: RFValue(15),
                    fontWeight: "600",
                    color: theme.textPrimary,
                  }}
                >
                  Theme
                </Text>
                <Text
                  style={{ fontSize: RFValue(12), color: theme.textSecondary }}
                >
                  {theme.name}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={RFValue(16)}
                color={theme.textTertiary}
              />
            </TouchableOpacity>
          </View>

          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(18),
              marginBottom: RFValue(16),
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(12),
                fontWeight: "700",
                color: theme.textTertiary,
                textTransform: "uppercase",
                padding: RFValue(16),
                paddingBottom: RFValue(8),
              }}
            >
              Health
            </Text>
            {[
              { icon: "medkit-outline", label: "Medical Records" },
              { icon: "calendar-outline", label: "Appointments" },
              { icon: "heart-outline", label: "Family Members" },
            ].map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={
                  item.label === "Appointments"
                    ? () => setShowAppointments(true)
                    : undefined
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: RFValue(16),
                  paddingTop: idx === 0 ? 0 : RFValue(16),
                  paddingBottom: idx === 2 ? RFValue(16) : RFValue(12),
                }}
              >
                <View
                  style={{
                    width: RFValue(36),
                    height: RFValue(36),
                    borderRadius: RFValue(10),
                    backgroundColor: theme.bg,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name={item.icon}
                    size={RFValue(18)}
                    color={theme.textSecondary}
                  />
                </View>
                <Text
                  style={{
                    fontSize: RFValue(15),
                    fontWeight: "600",
                    color: theme.textPrimary,
                    flex: 1,
                  }}
                >
                  {item.label}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={RFValue(16)}
                  color={theme.textTertiary}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={onLogout}
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: RFValue(18),
              padding: RFValue(16),
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
              marginBottom: RFValue(16),
            }}
          >
            <Ionicons
              name="log-out-outline"
              size={RFValue(20)}
              color="#DC2626"
              style={{ marginRight: RFValue(8) }}
            />
            <Text
              style={{
                fontSize: RFValue(15),
                fontWeight: "700",
                color: "#DC2626",
              }}
            >
              Logout
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const SplashScreen = ({ onNext }) => {
  const insets = useSafeAreaInsets();
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const splashScale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    const enter = Animated.parallel([
      Animated.timing(splashOpacity, {
        toValue: 1,
        duration: 520,
        delay: 80,
        easing: EASE_OUT_CUBIC,
        useNativeDriver: true,
      }),
      Animated.timing(splashScale, {
        toValue: 1,
        duration: 560,
        delay: 80,
        easing: Easing.out(Easing.back(1.15)),
        useNativeDriver: true,
      }),
    ]);
    enter.start();
    const timer = setTimeout(onNext, 2000);
    return () => {
      clearTimeout(timer);
      enter.stop();
    };
  }, [onNext, splashOpacity, splashScale]);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: "#FFFFFF",
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Background decorative circles */}
      <View
        style={{
          position: "absolute",
          top: -60,
          right: -60,
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: "#E0E7FF",
          opacity: 0.6,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: -40,
          left: -40,
          width: 160,
          height: 160,
          borderRadius: 80,
          backgroundColor: "#F3E8FF",
          opacity: 0.5,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: "40%",
          left: -30,
          width: 100,
          height: 100,
          borderRadius: 50,
          backgroundColor: "#DBEAFE",
          opacity: 0.4,
        }}
      />

      {/* Main content - flex so it does not collide with footer dots */}
      <Animated.View
        style={{
          flex: 1,
          minHeight: 0,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: RFValue(20),
          opacity: splashOpacity,
          transform: [{ scale: splashScale }],
        }}
      >
        {/* Logo container with shadow */}
        <View
          style={{
            width: RFValue(180),
            height: RFValue(180),
            borderRadius: RFValue(40),
            backgroundColor: "#FFFFFF",
            justifyContent: "center",
            alignItems: "center",
            shadowColor: "#4338CA",
            shadowOpacity: 0.15,
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: 24,
            elevation: 8,
            marginBottom: RFValue(24),
          }}
        >
          <ExpoImage
            source={NVOISYS_SPLASH_LOGO}
            contentFit="contain"
            style={{
              width: RFValue(140),
              height: RFValue(140),
            }}
          />
        </View>

        {/* App name */}
        <Text
          style={{
            fontSize: RFValue(28),
            fontWeight: "800",
            color: "#1E1B4B",
            letterSpacing: RFValue(1),
            marginBottom: RFValue(8),
          }}
        >
          NVOISYS
        </Text>

        {/* Tagline */}
        <Text
          style={{
            fontSize: RFValue(15),
            fontWeight: "600",
            color: "#6B7280",
            letterSpacing: RFValue(2),
            textTransform: "uppercase",
            marginBottom: RFValue(12),
          }}
        >
          HEALTH
        </Text>

        {/* Subtitle */}
        <Text
          style={{
            fontSize: RFValue(14),
            color: "#9CA3AF",
            textAlign: "center",
            marginBottom: RFValue(8),
          }}
        >
          Your Health Guardian
        </Text>
      </Animated.View>

      <Animated.View
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: Math.max(insets.bottom + RFValue(6), RFValue(16)),
          paddingTop: RFValue(8),
          opacity: splashOpacity,
        }}
      >
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#4338CA",
            }}
          />
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#E0E7FF",
            }}
          />
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#E0E7FF",
            }}
          />
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

const LanguageScreen = ({ onNext, onBack }) => {
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const insets = useSafeAreaInsets();
  const langs = [
    {
      title: "English",
      sub: "Default System Language",
      flagUrl: "https://flagcdn.com/w80/gb.png",
    },
  ];

  const renderLanguageCard = (lang, idx) => {
    const isSelected = selectedLanguage === lang.title;
    return (
      <TouchableOpacity
        key={idx}
        onPress={() => setSelectedLanguage(lang.title)}
        style={{
          flexDirection: "row",
          backgroundColor: isSelected ? "#EEF2FF" : "#FFFFFF",
          borderWidth: isSelected ? 2 : 1,
          borderColor: isSelected ? "#4338CA" : "#E5E7EB",
          borderRadius: RFValue(16),
          padding: RFValue(20),
          alignItems: "center",
          shadowColor: isSelected ? "#4338CA" : "#000",
          shadowOpacity: isSelected ? 0.15 : 0.04,
          shadowOffset: { width: 0, height: isSelected ? 4 : 2 },
          shadowRadius: isSelected ? 12 : 8,
          elevation: isSelected ? 4 : 1,
        }}
      >
        <View
          style={{
            width: RFValue(48),
            height: RFValue(48),
            borderRadius: RFValue(24),
            backgroundColor: isSelected ? "#E0E7FF" : "#F9FAFB",
            justifyContent: "center",
            alignItems: "center",
            marginRight: RFValue(16),
            overflow: "hidden",
          }}
        >
          <Image
            source={{ uri: lang.flagUrl }}
            style={{
              width: RFValue(34),
              height: RFValue(24),
              borderRadius: RFValue(4),
            }}
            resizeMode="cover"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: RFValue(16),
              fontWeight: "700",
              color: isSelected ? "#1E1B4B" : "#374151",
            }}
          >
            {lang.title}
          </Text>
          <Text
            style={{
              fontSize: RFValue(13),
              color: "#9CA3AF",
              marginTop: RFValue(2),
            }}
          >
            {lang.sub}
          </Text>
        </View>
        {isSelected && (
          <View
            style={{
              width: RFValue(28),
              height: RFValue(28),
              borderRadius: RFValue(14),
              backgroundColor: "#4338CA",
              justifyContent: "center",
              alignItems: "center",
              shadowColor: "#4338CA",
              shadowOpacity: 0.3,
              shadowOffset: { width: 0, height: 2 },
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            <Ionicons name="checkmark" size={RFValue(16)} color="#FFF" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAFBFF" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFBFF" />
      <View style={{ flex: 1, minHeight: 0 }}>
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: Math.max(insets.bottom + RFValue(6), RFValue(20)),
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderBottomLeftRadius: RFValue(32),
              borderBottomRightRadius: RFValue(32),
              paddingBottom: RFValue(24),
              shadowColor: "#000",
              shadowOpacity: 0.04,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 2,
            }}
          >
            <View
              style={{
                padding: RFValue(24),
                paddingTop: safeHeaderPaddingTop(),
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: RFValue(20),
                }}
              >
                {onBack ? (
                  <TouchableOpacity
                    onPress={onBack}
                    style={{
                      width: RFValue(36),
                      height: RFValue(36),
                      borderRadius: RFValue(10),
                      backgroundColor: "#F3F4F6",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name="arrow-back"
                      size={RFValue(20)}
                      color="#374151"
                    />
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: RFValue(36) }} />
                )}
                <TouchableOpacity
                  onPress={() => onNext("")}
                  style={{
                    paddingHorizontal: RFValue(16),
                    paddingVertical: RFValue(6),
                    borderRadius: RFValue(20),
                    backgroundColor: "#F3F4F6",
                  }}
                >
                  <Text
                    style={{
                      color: "#6B7280",
                      fontWeight: "600",
                      fontSize: RFValue(12),
                    }}
                  >
                    Skip
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ alignItems: "center" }}>
                {/* Small logo/icon */}
                <View
                  style={{
                    width: RFValue(56),
                    height: RFValue(56),
                    borderRadius: RFValue(16),
                    backgroundColor: "#EEF2FF",
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: RFValue(16),
                  }}
                >
                  <Ionicons
                    name="language"
                    size={RFValue(28)}
                    color="#4338CA"
                  />
                </View>
                <Text
                  style={{
                    fontSize: RFValue(20),
                    fontWeight: "800",
                    color: "#1E1B4B",
                    textAlign: "center",
                    marginBottom: RFValue(6),
                  }}
                >
                  Choose Your Language
                </Text>
                <Text
                  style={{
                    fontSize: RFValue(13),
                    color: "#6B7280",
                    textAlign: "center",
                  }}
                >
                  {"Select the language you're most comfortable with"}
                </Text>
              </View>
            </View>
          </View>

          {/* Language cards */}
          <View style={{ padding: RFValue(24) }}>
            <Text
              style={{
                fontSize: RFValue(12),
                fontWeight: "700",
                color: "#9CA3AF",
                textTransform: "uppercase",
                marginBottom: RFValue(16),
                letterSpacing: 1,
              }}
            >
              Available Languages
            </Text>
            {renderLanguageCard(langs[0], 0)}
          </View>

          <View style={{ padding: RFValue(24), paddingBottom: RFValue(8) }}>
            <TouchableOpacity
              style={{
                backgroundColor: "#4338CA",
                borderRadius: RFValue(16),
                paddingVertical: RFValue(16),
                alignItems: "center",
                shadowColor: "#4338CA",
                shadowOpacity: 0.3,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 12,
                elevation: 4,
              }}
              onPress={() => onNext(selectedLanguage)}
            >
              <Text
                style={{
                  color: "#FFF",
                  fontSize: RFValue(16),
                  fontWeight: "700",
                }}
              >
                Continue
              </Text>
            </TouchableOpacity>
            <Text
              style={{
                textAlign: "center",
                color: "#9CA3AF",
                marginTop: RFValue(16),
                fontSize: RFValue(13),
              }}
            >
              You can change this later in Settings
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const OnboardingCarousel = ({ onNext, onBack }) => {
  const [slide, setSlide] = useState(0);
  const insets = useSafeAreaInsets();

  const slides = [
    {
      gradient: ["#6366F1", "#4338CA"],
      icon: "heart",
      iconBg: "#EEF2FF",
      iconColor: "#4338CA",
      title: "Welcome to\nNvoisys Health",
      subtitle: "Your 24/7 health monitoring companion powered by AI",
      bullets: [
        "Real-time vital monitoring",
        "Instant emergency response",
        "Connected to doctors across India",
      ],
    },
    {
      gradient: ["#7C3AED", "#5B21B6"],
      icon: "pulse",
      iconBg: "#F5F3FF",
      iconColor: "#7C3AED",
      title: "Your Personal\nHealth Guardian",
      subtitle:
        "Monitor vitals, get medication recommendations, and connect with your assigned doctor instantly",
      bullets: [
        "Track heart rate, BP, sugar levels",
        "AI-powered health guidance",
        "Emergency doctor assignment",
        "Chat & video call with doctors",
      ],
    },
    {
      gradient: ["#DC2626", "#B91C1C"],
      icon: "alert-circle",
      iconBg: "#FEF2F2",
      iconColor: "#DC2626",
      title: "Emergency Response\nNetwork",
      subtitle:
        "When seconds matter, our system connects patients with the nearest available doctor and hospital",
      bullets: [
        "Instant SOS to assigned doctor",
        "Automatic nearby doctor alerts",
        "Hospital recommendations",
        "Real-time location sharing",
      ],
    },
  ];

  const handleNext = () => {
    if (slide < slides.length - 1) setSlide(slide + 1);
    else onNext();
  };

  const current = slides[slide];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top buttons - fixed height row */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: RFValue(24),
          paddingTop: Math.max(insets.top, safeHeaderPaddingTop(8)),
          paddingBottom: RFValue(12),
        }}
      >
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(10),
              backgroundColor: "#F3F4F6",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="arrow-back" size={RFValue(20)} color="#374151" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: RFValue(36) }} />
        )}
        <TouchableOpacity
          onPress={onNext}
          style={{
            paddingHorizontal: RFValue(16),
            paddingVertical: RFValue(6),
            borderRadius: RFValue(20),
            backgroundColor: "#F3F4F6",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#6B7280",
              fontWeight: "600",
              fontSize: RFValue(12),
            }}
          >
            Skip
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable body: prevents bullets painting over footer (RN overflow) */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: RFValue(24),
          paddingBottom: RFValue(16),
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: "center", marginBottom: RFValue(24) }}>
          <View
            style={{
              width: Math.min(RFValue(120), SCREEN_WIDTH * 0.34),
              height: Math.min(RFValue(120), SCREEN_WIDTH * 0.34),
              borderRadius: RFValue(32),
              backgroundColor: current.iconBg,
              justifyContent: "center",
              alignItems: "center",
              shadowColor: current.iconColor,
              shadowOpacity: 0.2,
              shadowOffset: { width: 0, height: 8 },
              shadowRadius: 20,
              elevation: 6,
            }}
          >
            <View
              style={{
                width: "76%",
                height: "76%",
                borderRadius: RFValue(24),
                backgroundColor: current.iconColor,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name={current.icon}
                size={Math.min(RFValue(44), 40)}
                color="#FFF"
              />
            </View>
          </View>
        </View>

        <Text
          style={{
            fontSize: RFValue(24),
            fontWeight: "800",
            color: "#1E1B4B",
            textAlign: "center",
            marginBottom: RFValue(10),
            lineHeight: RFValue(30),
          }}
        >
          {current.title}
        </Text>

        <Text
          style={{
            fontSize: RFValue(14),
            color: "#6B7280",
            textAlign: "center",
            marginBottom: RFValue(20),
            lineHeight: RFValue(22),
            paddingHorizontal: RFValue(4),
          }}
        >
          {current.subtitle}
        </Text>

        <View style={{ alignSelf: "stretch" }}>
          {current.bullets.map((bullet, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                marginBottom: RFValue(10),
                backgroundColor: "#FAFBFF",
                paddingVertical: RFValue(12),
                paddingHorizontal: RFValue(12),
                borderRadius: RFValue(14),
              }}
            >
              <View
                style={{
                  width: RFValue(28),
                  height: RFValue(28),
                  borderRadius: RFValue(8),
                  backgroundColor: current.iconColor,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(12),
                  marginTop: 2,
                }}
              >
                <Ionicons name="checkmark" size={RFValue(16)} color="#FFF" />
              </View>
              <Text
                style={{
                  flex: 1,
                  flexShrink: 1,
                  fontSize: RFValue(14),
                  color: "#374151",
                  fontWeight: "500",
                  lineHeight: RFValue(20),
                }}
              >
                {bullet}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Footer pinned below scroll - never overlaps list */}
      <View
        style={{
          paddingHorizontal: RFValue(24),
          paddingTop: RFValue(12),
          paddingBottom: Math.max(insets.bottom + RFValue(6), RFValue(16)),
          backgroundColor: "#FFFFFF",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: "#E5E7EB",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: RFValue(12),
          }}
        >
          {slides.map((_, idx) => (
            <View
              key={idx}
              style={{
                width: idx === slide ? 28 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: idx === slide ? current.iconColor : "#E5E7EB",
                marginHorizontal: 4,
              }}
            />
          ))}
        </View>

        <TouchableOpacity
          style={{
            width: "100%",
            backgroundColor: current.iconColor,
            borderRadius: RFValue(16),
            paddingVertical: RFValue(16),
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            shadowColor: current.iconColor,
            shadowOpacity: 0.3,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 4,
          }}
          onPress={handleNext}
        >
          <Text
            style={{
              color: "#FFF",
              fontSize: RFValue(16),
              fontWeight: "700",
              marginRight: slide === slides.length - 1 ? 0 : 8,
            }}
          >
            {slide === slides.length - 1 ? "Get Started" : "Next"}
          </Text>
          <Ionicons name="chevron-forward" size={RFValue(20)} color="#FFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const chipStyle = {
  backgroundColor: "#F3F4F6",
  paddingHorizontal: RFValue(10),
  paddingVertical: RFValue(5),
  borderRadius: RFValue(12),
  marginRight: RFValue(6),
  marginBottom: RFValue(6),
};
const chipTextStyle = {
  color: "#6B7280",
  fontSize: RFValue(11),
  fontWeight: "600",
};

const RoleScreen = ({ onNext, onBack, onGoToLogin }) => {
  const [selectedRole, setSelectedRole] = useState("patient");
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAFBFF" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFBFF" />
      <View style={{ flex: 1, minHeight: 0 }}>
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: RFValue(8) }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View
            style={{
              backgroundColor: "#FFFFFF",
              padding: RFValue(24),
              paddingTop: safeHeaderPaddingTop(),
              borderBottomLeftRadius: RFValue(32),
              borderBottomRightRadius: RFValue(32),
              shadowColor: "#000",
              shadowOpacity: 0.04,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 2,
            }}
          >
            {onBack && (
              <View
                style={{
                  position: "absolute",
                  top: safeHeaderPaddingTop(),
                  left: RFValue(24),
                  zIndex: 1,
                }}
              >
                <TouchableOpacity
                  onPress={onBack}
                  style={{
                    width: RFValue(36),
                    height: RFValue(36),
                    borderRadius: RFValue(10),
                    backgroundColor: "#F3F4F6",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons
                    name="arrow-back"
                    size={RFValue(20)}
                    color="#374151"
                  />
                </TouchableOpacity>
              </View>
            )}
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  width: RFValue(64),
                  height: RFValue(64),
                  borderRadius: RFValue(20),
                  backgroundColor: "#EEF2FF",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: RFValue(16),
                }}
              >
                <Ionicons name="people" size={RFValue(32)} color="#4338CA" />
              </View>
              <Text
                style={{
                  fontSize: RFValue(22),
                  fontWeight: "800",
                  color: "#1E1B4B",
                  marginBottom: RFValue(6),
                }}
              >
                Join Nvoisys Health
              </Text>
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: "#6B7280",
                  textAlign: "center",
                }}
              >
                {"Choose how you'll use the app"}
              </Text>
            </View>
          </View>

          <View style={{ padding: RFValue(20) }}>
            {/* Patient */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSelectedRole("patient")}
              style={{
                backgroundColor: "#FFFFFF",
                padding: RFValue(20),
                borderRadius: RFValue(20),
                borderWidth: 2,
                borderColor: selectedRole === "patient" ? "#4338CA" : "#F3F4F6",
                marginBottom: RFValue(14),
                shadowColor: selectedRole === "patient" ? "#4338CA" : "#000",
                shadowOpacity: selectedRole === "patient" ? 0.12 : 0.04,
                shadowOffset: {
                  width: 0,
                  height: selectedRole === "patient" ? 6 : 2,
                },
                shadowRadius: selectedRole === "patient" ? 16 : 8,
                elevation: selectedRole === "patient" ? 4 : 1,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: RFValue(14),
                }}
              >
                <View
                  style={{
                    width: RFValue(52),
                    height: RFValue(52),
                    borderRadius: RFValue(16),
                    backgroundColor:
                      selectedRole === "patient" ? "#EEF2FF" : "#F9FAFB",
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name="person"
                    size={RFValue(26)}
                    color={selectedRole === "patient" ? "#4338CA" : "#9CA3AF"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: RFValue(18),
                        fontWeight: "800",
                        color: "#1E1B4B",
                      }}
                    >
                      {"I'm a Patient"}
                    </Text>
                    {selectedRole === "patient" && (
                      <View
                        style={{
                          backgroundColor: "#4338CA",
                          borderRadius: RFValue(12),
                          width: RFValue(24),
                          height: RFValue(24),
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <Ionicons
                          name="checkmark"
                          size={RFValue(16)}
                          color="#FFF"
                        />
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: "#6B7280",
                  lineHeight: RFValue(20),
                  marginBottom: RFValue(12),
                }}
              >
                Monitor my health, connect with doctors, get emergency support
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <View style={chipStyle}>
                  <Text style={chipTextStyle}>Health tracking</Text>
                </View>
                <View style={chipStyle}>
                  <Text style={chipTextStyle}>Consultations</Text>
                </View>
                <View style={chipStyle}>
                  <Text style={chipTextStyle}>Emergency SOS</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Doctor */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSelectedRole("doctor")}
              style={{
                backgroundColor: "#FFFFFF",
                padding: RFValue(20),
                borderRadius: RFValue(20),
                borderWidth: 2,
                borderColor: selectedRole === "doctor" ? "#059669" : "#F3F4F6",
                marginBottom: RFValue(14),
                shadowColor: selectedRole === "doctor" ? "#059669" : "#000",
                shadowOpacity: selectedRole === "doctor" ? 0.12 : 0.04,
                shadowOffset: {
                  width: 0,
                  height: selectedRole === "doctor" ? 6 : 2,
                },
                shadowRadius: selectedRole === "doctor" ? 16 : 8,
                elevation: selectedRole === "doctor" ? 4 : 1,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: RFValue(14),
                }}
              >
                <View
                  style={{
                    width: RFValue(52),
                    height: RFValue(52),
                    borderRadius: RFValue(16),
                    backgroundColor:
                      selectedRole === "doctor" ? "#ECFDF5" : "#F9FAFB",
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name="medical"
                    size={RFValue(26)}
                    color={selectedRole === "doctor" ? "#059669" : "#9CA3AF"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: RFValue(18),
                        fontWeight: "800",
                        color: "#1E1B4B",
                      }}
                    >
                      {"I'm a Doctor"}
                    </Text>
                    {selectedRole === "doctor" ? (
                      <View
                        style={{
                          backgroundColor: "#059669",
                          borderRadius: RFValue(12),
                          width: RFValue(24),
                          height: RFValue(24),
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <Ionicons
                          name="checkmark"
                          size={RFValue(16)}
                          color="#FFF"
                        />
                      </View>
                    ) : (
                      <View
                        style={{
                          backgroundColor: "#FEF3C7",
                          paddingHorizontal: RFValue(8),
                          paddingVertical: RFValue(3),
                          borderRadius: RFValue(8),
                        }}
                      >
                        <Text
                          style={{
                            fontSize: RFValue(10),
                            color: "#D97706",
                            fontWeight: "700",
                          }}
                        >
                          Verify needed
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: "#6B7280",
                  lineHeight: RFValue(20),
                  marginBottom: RFValue(12),
                }}
              >
                Manage patients, respond to emergencies, provide consultations
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <View style={chipStyle}>
                  <Text style={chipTextStyle}>Patient mgmt</Text>
                </View>
                <View style={chipStyle}>
                  <Text style={chipTextStyle}>Emergencies</Text>
                </View>
                <View style={chipStyle}>
                  <Text style={chipTextStyle}>Telemedicine</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Pharmacy */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSelectedRole("pharmacy")}
              style={{
                backgroundColor: "#FFFFFF",
                padding: RFValue(20),
                borderRadius: RFValue(20),
                borderWidth: 2,
                borderColor:
                  selectedRole === "pharmacy" ? "#8B5CF6" : "#F3F4F6",
                marginBottom: RFValue(14),
                shadowColor: selectedRole === "pharmacy" ? "#8B5CF6" : "#000",
                shadowOpacity: selectedRole === "pharmacy" ? 0.12 : 0.04,
                shadowOffset: {
                  width: 0,
                  height: selectedRole === "pharmacy" ? 6 : 2,
                },
                shadowRadius: selectedRole === "pharmacy" ? 16 : 8,
                elevation: selectedRole === "pharmacy" ? 4 : 1,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: RFValue(14),
                }}
              >
                <View
                  style={{
                    width: RFValue(52),
                    height: RFValue(52),
                    borderRadius: RFValue(16),
                    backgroundColor:
                      selectedRole === "pharmacy" ? "#F5F3FF" : "#F9FAFB",
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name="leaf"
                    size={RFValue(26)}
                    color={selectedRole === "pharmacy" ? "#8B5CF6" : "#9CA3AF"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: RFValue(18),
                        fontWeight: "800",
                        color: "#1E1B4B",
                      }}
                    >
                      {"I'm a Pharmacy"}
                    </Text>
                    {selectedRole === "pharmacy" && (
                      <View
                        style={{
                          backgroundColor: "#8B5CF6",
                          borderRadius: RFValue(12),
                          width: RFValue(24),
                          height: RFValue(24),
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <Ionicons
                          name="checkmark"
                          size={RFValue(16)}
                          color="#FFF"
                        />
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: "#6B7280",
                  lineHeight: RFValue(20),
                  marginBottom: RFValue(12),
                }}
              >
                Receive medicine orders, ship to patients, and manage inventory
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <View style={chipStyle}>
                  <Text style={chipTextStyle}>Order mgmt</Text>
                </View>
                <View style={chipStyle}>
                  <Text style={chipTextStyle}>Shipping</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      <View
        style={{
          paddingHorizontal: RFValue(24),
          paddingTop: RFValue(12),
          paddingBottom: Math.max(insets.bottom + RFValue(6), RFValue(16)),
          backgroundColor: "#FFF",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity
          style={{
            backgroundColor:
              selectedRole === "patient"
                ? "#4338CA"
                : selectedRole === "doctor"
                  ? "#059669"
                  : selectedRole === "pharmacy"
                    ? "#8B5CF6"
                    : "#E5E7EB",
            borderRadius: RFValue(16),
            paddingVertical: RFValue(16),
            alignItems: "center",
            marginBottom: RFValue(10),
            shadowColor:
              selectedRole === "patient"
                ? "#4338CA"
                : selectedRole === "doctor"
                  ? "#059669"
                  : selectedRole === "pharmacy"
                    ? "#8B5CF6"
                    : "transparent",
            shadowOpacity: 0.3,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 4,
          }}
          onPress={() => onNext(selectedRole)}
        >
          <Text
            style={{ color: "#FFF", fontSize: RFValue(16), fontWeight: "700" }}
          >
            Continue
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onGoToLogin?.(selectedRole)}
          activeOpacity={0.7}
          style={{ alignItems: "center", paddingVertical: RFValue(8) }}
        >
          <Text
            style={{
              textAlign: "center",
              color: "#6B7280",
              fontSize: RFValue(14),
            }}
          >
            Already have an account?{" "}
            <Text style={{ color: "#4338CA", fontWeight: "700" }}>Login</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const RegisterScreen = ({ onFinish, onBack }) => {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("Male");

  const inputStyle = {
    backgroundColor: "#F9FAFB",
    borderRadius: RFValue(14),
    padding: RFValue(16),
    fontSize: RFValue(15),
    marginBottom: RFValue(18),
    color: "#1E1B4B",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  };
  const labelStyle = {
    fontSize: RFValue(13),
    fontWeight: "700",
    color: "#374151",
    marginBottom: RFValue(6),
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAFBFF" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFBFF" />
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            {/* Header */}
            <View
              style={{
                backgroundColor: "#FFFFFF",
                padding: RFValue(24),
                paddingTop: safeHeaderPaddingTop(),
                borderBottomLeftRadius: RFValue(28),
                borderBottomRightRadius: RFValue(28),
                shadowColor: "#000",
                shadowOpacity: 0.04,
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: RFValue(16),
                }}
              >
                <TouchableOpacity
                  onPress={onBack}
                  style={{
                    width: RFValue(36),
                    height: RFValue(36),
                    borderRadius: RFValue(10),
                    backgroundColor: "#F3F4F6",
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name="arrow-back"
                    size={RFValue(20)}
                    color="#374151"
                  />
                </TouchableOpacity>
                <View>
                  <Text
                    style={{
                      fontSize: RFValue(18),
                      fontWeight: "800",
                      color: "#1E1B4B",
                    }}
                  >
                    Patient Registration
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: "#6B7280",
                      marginTop: RFValue(2),
                    }}
                  >
                    Please fill in your details
                  </Text>
                </View>
              </View>
              {/* Progress bar */}
              <View
                style={{
                  height: RFValue(4),
                  backgroundColor: "#F3F4F6",
                  borderRadius: RFValue(2),
                }}
              >
                <View
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#4338CA",
                    borderRadius: RFValue(2),
                  }}
                />
              </View>
            </View>

            <View style={{ padding: RFValue(20) }}>
              <Text style={labelStyle}>Full Name</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: RFValue(14),
                  paddingHorizontal: RFValue(14),
                  marginBottom: RFValue(18),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
                <Ionicons
                  name="person-outline"
                  size={RFValue(20)}
                  color="#9CA3AF"
                  style={{ marginRight: RFValue(10) }}
                />
                <TextInput
                  style={{
                    flex: 1,
                    paddingVertical: RFValue(14),
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholder="Enter full name"
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <Text style={labelStyle}>Mobile Number</Text>
              <View style={{ flexDirection: "row", marginBottom: RFValue(18) }}>
                <View
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: RFValue(14),
                    padding: RFValue(14),
                    marginRight: RFValue(10),
                    justifyContent: "center",
                    alignItems: "center",
                    width: RFValue(64),
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      color: "#374151",
                      fontWeight: "600",
                    }}
                  >
                    +91
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#F9FAFB",
                    borderRadius: RFValue(14),
                    paddingHorizontal: RFValue(14),
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                  }}
                >
                  <Ionicons
                    name="call-outline"
                    size={RFValue(20)}
                    color="#9CA3AF"
                    style={{ marginRight: RFValue(10) }}
                  />
                  <TextInput
                    style={{
                      flex: 1,
                      paddingVertical: RFValue(14),
                      fontSize: RFValue(15),
                      color: "#1E1B4B",
                    }}
                    placeholder="Enter mobile number"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    value={mobile}
                    onChangeText={setMobile}
                    maxLength={10}
                  />
                </View>
              </View>

              <Text style={labelStyle}>Email</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: RFValue(14),
                  paddingHorizontal: RFValue(14),
                  marginBottom: RFValue(18),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
                <Ionicons
                  name="mail-outline"
                  size={RFValue(20)}
                  color="#9CA3AF"
                  style={{ marginRight: RFValue(10) }}
                />
                <TextInput
                  style={{
                    flex: 1,
                    paddingVertical: RFValue(14),
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholder="Enter email"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <Text style={labelStyle}>Date of Birth</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: RFValue(14),
                  paddingHorizontal: RFValue(14),
                  marginBottom: RFValue(18),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
                <Ionicons
                  name="calendar-outline"
                  size={RFValue(20)}
                  color="#9CA3AF"
                  style={{ marginRight: RFValue(10) }}
                />
                <TextInput
                  style={{
                    flex: 1,
                    paddingVertical: RFValue(14),
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholder="dd / mm / yyyy"
                  placeholderTextColor="#9CA3AF"
                  value={dob}
                  onChangeText={setDob}
                />
              </View>

              <Text style={labelStyle}>Gender</Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                {["Male", "Female", "Other"].map((g, idx) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGender(g)}
                    style={{
                      flex: 1,
                      marginLeft: idx === 0 ? 0 : 8,
                      marginRight: idx === 2 ? 0 : 8,
                      paddingVertical: RFValue(14),
                      borderRadius: RFValue(12),
                      borderWidth: 2,
                      borderColor: gender === g ? "#4338CA" : "#E5E7EB",
                      backgroundColor: gender === g ? "#EEF2FF" : "#FFFFFF",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "700",
                        color: gender === g ? "#4338CA" : "#6B7280",
                        fontSize: RFValue(14),
                      }}
                    >
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <View
        style={{
          padding: RFValue(24),
          paddingBottom: Math.max(insets.bottom + RFValue(8), RFValue(20)),
          backgroundColor: "#FFF",
          borderTopWidth: 1,
          borderTopColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity
          style={{
            backgroundColor: "#4338CA",
            borderRadius: RFValue(16),
            paddingVertical: RFValue(18),
            alignItems: "center",
            shadowColor: "#4338CA",
            shadowOpacity: 0.3,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 4,
          }}
          onPress={() => onFinish(mobile)}
        >
          <Text
            style={{ color: "#FFF", fontSize: RFValue(16), fontWeight: "700" }}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// --- DOCTOR SCREENS ---
const DoctorRegisterScreen = ({ onFinish, onBack }) => {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [mci, setMci] = useState("");
  const [spec, setSpec] = useState("");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAFBFF" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFBFF" />
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <View
              style={{
                backgroundColor: "#FFFFFF",
                padding: RFValue(24),
                paddingTop: safeHeaderPaddingTop(),
                borderBottomLeftRadius: RFValue(28),
                borderBottomRightRadius: RFValue(28),
                shadowColor: "#000",
                shadowOpacity: 0.04,
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: RFValue(16),
                }}
              >
                <TouchableOpacity
                  onPress={onBack}
                  style={{
                    width: RFValue(36),
                    height: RFValue(36),
                    borderRadius: RFValue(10),
                    backgroundColor: "#F3F4F6",
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name="arrow-back"
                    size={RFValue(20)}
                    color="#374151"
                  />
                </TouchableOpacity>
                <View>
                  <Text
                    style={{
                      fontSize: RFValue(18),
                      fontWeight: "800",
                      color: "#1E1B4B",
                    }}
                  >
                    Doctor Registration
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: "#6B7280",
                      marginTop: RFValue(2),
                    }}
                  >
                    Professional Details
                  </Text>
                </View>
              </View>
              <View
                style={{
                  height: RFValue(4),
                  backgroundColor: "#F3F4F6",
                  borderRadius: RFValue(2),
                }}
              >
                <View
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#059669",
                    borderRadius: RFValue(2),
                  }}
                />
              </View>
            </View>

            <View style={{ padding: RFValue(20) }}>
              <Text
                style={{
                  fontSize: RFValue(13),
                  fontWeight: "700",
                  color: "#374151",
                  marginBottom: RFValue(6),
                }}
              >
                Full Name
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: RFValue(14),
                  paddingHorizontal: RFValue(14),
                  marginBottom: RFValue(18),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
                <Ionicons
                  name="person-outline"
                  size={RFValue(20)}
                  color="#9CA3AF"
                  style={{ marginRight: RFValue(10) }}
                />
                <TextInput
                  style={{
                    flex: 1,
                    paddingVertical: RFValue(14),
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholder="Dr. Full Name"
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <Text
                style={{
                  fontSize: RFValue(13),
                  fontWeight: "700",
                  color: "#374151",
                  marginBottom: RFValue(6),
                }}
              >
                Mobile Number
              </Text>
              <View style={{ flexDirection: "row", marginBottom: RFValue(18) }}>
                <View
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: RFValue(14),
                    padding: RFValue(14),
                    marginRight: RFValue(10),
                    justifyContent: "center",
                    alignItems: "center",
                    width: RFValue(64),
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      color: "#374151",
                      fontWeight: "600",
                    }}
                  >
                    +91
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#F9FAFB",
                    borderRadius: RFValue(14),
                    paddingHorizontal: RFValue(14),
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                  }}
                >
                  <Ionicons
                    name="call-outline"
                    size={RFValue(20)}
                    color="#9CA3AF"
                    style={{ marginRight: RFValue(10) }}
                  />
                  <TextInput
                    style={{
                      flex: 1,
                      paddingVertical: RFValue(14),
                      fontSize: RFValue(15),
                      color: "#1E1B4B",
                    }}
                    placeholder="Enter mobile number"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    value={mobile}
                    onChangeText={setMobile}
                    maxLength={10}
                  />
                </View>
              </View>

              <Text
                style={{
                  fontSize: RFValue(13),
                  fontWeight: "700",
                  color: "#374151",
                  marginBottom: RFValue(6),
                }}
              >
                Professional Email
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: RFValue(14),
                  paddingHorizontal: RFValue(14),
                  marginBottom: RFValue(18),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
                <Ionicons
                  name="mail-outline"
                  size={RFValue(20)}
                  color="#9CA3AF"
                  style={{ marginRight: RFValue(10) }}
                />
                <TextInput
                  style={{
                    flex: 1,
                    paddingVertical: RFValue(14),
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholder="doctor@hospital.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <Text
                style={{
                  fontSize: RFValue(13),
                  fontWeight: "700",
                  color: "#374151",
                  marginBottom: RFValue(6),
                }}
              >
                MCI Registration
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: RFValue(14),
                  paddingHorizontal: RFValue(14),
                  marginBottom: RFValue(18),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
                <Ionicons
                  name="card-outline"
                  size={RFValue(20)}
                  color="#9CA3AF"
                  style={{ marginRight: RFValue(10) }}
                />
                <TextInput
                  style={{
                    flex: 1,
                    paddingVertical: RFValue(14),
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholder="MCI/State Council Number"
                  placeholderTextColor="#9CA3AF"
                  value={mci}
                  onChangeText={setMci}
                />
              </View>

              <Text
                style={{
                  fontSize: RFValue(13),
                  fontWeight: "700",
                  color: "#374151",
                  marginBottom: RFValue(6),
                }}
              >
                Specialization
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: RFValue(14),
                  paddingHorizontal: RFValue(14),
                  marginBottom: RFValue(18),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
                <Ionicons
                  name="medkit-outline"
                  size={RFValue(20)}
                  color="#9CA3AF"
                  style={{ marginRight: RFValue(10) }}
                />
                <TextInput
                  style={{
                    flex: 1,
                    paddingVertical: RFValue(14),
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholder="e.g., Cardiologist"
                  placeholderTextColor="#9CA3AF"
                  value={spec}
                  onChangeText={setSpec}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <View
        style={{
          padding: RFValue(24),
          paddingBottom: Math.max(insets.bottom + RFValue(8), RFValue(20)),
          backgroundColor: "#FFF",
          borderTopWidth: 1,
          borderTopColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity
          style={{
            backgroundColor: "#059669",
            borderRadius: RFValue(16),
            paddingVertical: RFValue(18),
            alignItems: "center",
            shadowColor: "#059669",
            shadowOpacity: 0.3,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 4,
          }}
          onPress={() => onFinish(mobile)}
        >
          <Text
            style={{ color: "#FFF", fontSize: RFValue(16), fontWeight: "700" }}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const PharmacyRegisterScreen = ({ onFinish, onBack }) => {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");

  const labelStyle = {
    fontSize: RFValue(13),
    fontWeight: "700",
    color: "#374151",
    marginBottom: RFValue(6),
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAFBFF" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFBFF" />
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <View
              style={{
                backgroundColor: "#FFFFFF",
                padding: RFValue(24),
                paddingTop: safeHeaderPaddingTop(),
                borderBottomLeftRadius: RFValue(28),
                borderBottomRightRadius: RFValue(28),
                shadowColor: "#000",
                shadowOpacity: 0.04,
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: RFValue(16),
                }}
              >
                <TouchableOpacity
                  onPress={onBack}
                  style={{
                    width: RFValue(36),
                    height: RFValue(36),
                    borderRadius: RFValue(10),
                    backgroundColor: "#F3F4F6",
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name="arrow-back"
                    size={RFValue(20)}
                    color="#374151"
                  />
                </TouchableOpacity>
                <View>
                  <Text
                    style={{
                      fontSize: RFValue(18),
                      fontWeight: "800",
                      color: "#1E1B4B",
                    }}
                  >
                    Pharmacy Registration
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: "#6B7280",
                      marginTop: RFValue(2),
                    }}
                  >
                    Business Details
                  </Text>
                </View>
              </View>
              <View
                style={{
                  height: RFValue(4),
                  backgroundColor: "#F3F4F6",
                  borderRadius: RFValue(2),
                }}
              >
                <View
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#8B5CF6",
                    borderRadius: RFValue(2),
                  }}
                />
              </View>
            </View>

            <View style={{ padding: RFValue(20) }}>
              <Text style={labelStyle}>Pharmacy Name</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: RFValue(14),
                  paddingHorizontal: RFValue(14),
                  marginBottom: RFValue(18),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
                <Ionicons
                  name="leaf-outline"
                  size={RFValue(20)}
                  color="#9CA3AF"
                  style={{ marginRight: RFValue(10) }}
                />
                <TextInput
                  style={{
                    flex: 1,
                    paddingVertical: RFValue(14),
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholder="Enter pharmacy name"
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <Text style={labelStyle}>Contact Number</Text>
              <View style={{ flexDirection: "row", marginBottom: RFValue(18) }}>
                <View
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: RFValue(14),
                    padding: RFValue(14),
                    marginRight: RFValue(10),
                    justifyContent: "center",
                    alignItems: "center",
                    width: RFValue(64),
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      color: "#374151",
                      fontWeight: "600",
                    }}
                  >
                    +91
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#F9FAFB",
                    borderRadius: RFValue(14),
                    paddingHorizontal: RFValue(14),
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                  }}
                >
                  <Ionicons
                    name="call-outline"
                    size={RFValue(20)}
                    color="#9CA3AF"
                    style={{ marginRight: RFValue(10) }}
                  />
                  <TextInput
                    style={{
                      flex: 1,
                      paddingVertical: RFValue(14),
                      fontSize: RFValue(15),
                      color: "#1E1B4B",
                    }}
                    placeholder="Enter mobile number"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    value={mobile}
                    onChangeText={setMobile}
                    maxLength={10}
                  />
                </View>
              </View>

              <Text style={labelStyle}>Business Email</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: RFValue(14),
                  paddingHorizontal: RFValue(14),
                  marginBottom: RFValue(18),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
                <Ionicons
                  name="mail-outline"
                  size={RFValue(20)}
                  color="#9CA3AF"
                  style={{ marginRight: RFValue(10) }}
                />
                <TextInput
                  style={{
                    flex: 1,
                    paddingVertical: RFValue(14),
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholder="pharmacy@business.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <View
        style={{
          padding: RFValue(24),
          paddingBottom: Math.max(insets.bottom + RFValue(8), RFValue(20)),
          backgroundColor: "#FFF",
          borderTopWidth: 1,
          borderTopColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity
          style={{
            backgroundColor: "#8B5CF6",
            borderRadius: RFValue(16),
            paddingVertical: RFValue(18),
            alignItems: "center",
            shadowColor: "#8B5CF6",
            shadowOpacity: 0.3,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 4,
          }}
          onPress={() => onFinish(mobile)}
        >
          <Text
            style={{ color: "#FFF", fontSize: RFValue(16), fontWeight: "700" }}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// --- AUTH SCREEN ---
const OTPScreen = ({ mobileNumber, onVerify, onBack }) => {
  const insets = useSafeAreaInsets();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(30);
  const otpCellWidth = Math.min(
    RFValue(46),
    Math.floor((SCREEN_WIDTH - RFValue(72)) / 6),
  );
  const otpCellHeight = Math.max(RFValue(54), Math.round(otpCellWidth * 1.3));
  const inputRefs = [
    useRef(),
    useRef(),
    useRef(),
    useRef(),
    useRef(),
    useRef(),
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleChange = (text, index) => {
    // Restrict to numbers only
    const cleanText = text.replace(/[^0-9]/g, "");
    if (!cleanText && text !== "") return;

    const newOtp = [...otp];
    newOtp[index] = cleanText;
    setOtp(newOtp);

    if (cleanText && index < 5) {
      inputRefs[index + 1].current.focus();
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs[index - 1].current.focus();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAFBFF" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFBFF" />
      <View
        style={{
          flex: 1,
          paddingHorizontal: RFValue(24),
          paddingTop: Math.max(insets.top, RFValue(24)),
          paddingBottom: Math.max(insets.bottom, RFValue(24)),
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={{
            width: RFValue(40),
            height: RFValue(40),
            borderRadius: RFValue(12),
            backgroundColor: "#FFFFFF",
            justifyContent: "center",
            alignItems: "center",
            shadowColor: "#000",
            shadowOpacity: 0.05,
            elevation: 2,
            marginBottom: RFValue(32),
          }}
        >
          <Ionicons name="arrow-back" size={RFValue(22)} color="#1E1B4B" />
        </TouchableOpacity>

        <Text
          style={{
            fontSize: RFValue(24),
            fontWeight: "800",
            color: "#1E1B4B",
            marginBottom: RFValue(8),
          }}
        >
          Verify Phone
        </Text>
        <Text
          style={{
            fontSize: RFValue(15),
            color: "#6B7280",
            lineHeight: RFValue(22),
            marginBottom: RFValue(32),
          }}
        >
          {"We've sent a 6-digit code to "}
          <Text style={{ color: "#1E1B4B", fontWeight: "700" }}>
            +91 {mobileNumber}
          </Text>
        </Text>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: RFValue(32),
          }}
        >
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={inputRefs[index]}
              style={{
                width: otpCellWidth,
                height: otpCellHeight,
                backgroundColor: "#FFFFFF",
                borderRadius: RFValue(14),
                borderWidth: 2,
                borderColor: digit ? "#4338CA" : "#E5E7EB",
                fontSize: RFValue(20),
                fontWeight: "800",
                color: "#1E1B4B",
                textAlign: "center",
                shadowColor: digit ? "#4338CA" : "#000",
                shadowOpacity: digit ? 0.1 : 0.02,
                elevation: 1,
              }}
              keyboardType="number-pad"
              maxLength={1}
              value={digit}
              onChangeText={(text) => handleChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
            />
          ))}
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: "#4338CA",
            borderRadius: RFValue(16),
            paddingVertical: RFValue(18),
            alignItems: "center",
            shadowColor: "#4338CA",
            shadowOpacity: 0.3,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 4,
          }}
          onPress={() => onVerify()}
        >
          <Text
            style={{ color: "#FFF", fontSize: RFValue(16), fontWeight: "700" }}
          >
            Verify & Register
          </Text>
        </TouchableOpacity>

        <View style={{ marginTop: RFValue(32), alignItems: "center" }}>
          {timer > 0 ? (
            <Text style={{ fontSize: RFValue(14), color: "#6B7280" }}>
              Resend code in{" "}
              <Text style={{ color: "#1E1B4B", fontWeight: "700" }}>
                {timer}s
              </Text>
            </Text>
          ) : (
            <TouchableOpacity onPress={() => setTimer(30)}>
              <Text
                style={{
                  fontSize: RFValue(14),
                  color: "#4338CA",
                  fontWeight: "700",
                }}
              >
                Resend OTP
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const AuthScreen = ({ onLogin }) => {
  const authInsets = useSafeAreaInsets();
  const [step, setStep] = useState("SPLASH");
  const [role, setRole] = useState("patient");
  const [mobileNumber, setMobileNumber] = useState("");

  const [authMode, setAuthMode] = useState("signup"); // signup | login
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [patientCondition, setPatientCondition] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [patientRegAvatar, setPatientRegAvatar] = useState(null);
  const [patientHealthValues, setPatientHealthValues] = useState(
    emptyPatientHealthValues,
  );
  const updatePatientHealthField = useCallback((key, value) => {
    setPatientHealthValues((prev) => ({ ...prev, [key]: value }));
  }, []);
  const [doctorSpecialtyField, setDoctorSpecialtyField] = useState("");
  const [doctorClinic, setDoctorClinic] = useState("");
  const [registrationLanguage, setRegistrationLanguage] = useState("");

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");

  const pickRegistrationAvatar = async (source) => {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission?.granted) {
          Alert.alert(
            "Permission needed",
            "Please allow camera access to take a profile photo.",
          );
          return;
        }
      } else {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission?.granted) {
          Alert.alert(
            "Permission needed",
            "Please allow photo library access to pick a profile photo.",
          );
          return;
        }
      }
      const pickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (!result || result.canceled) return;
      const asset = result.assets?.[0];
      if (asset?.uri) setPatientRegAvatar(asset);
    } catch (error) {
      console.log("pickRegistrationAvatar error:", error);
      Alert.alert("Photo", error?.message || "Could not add photo.");
    }
  };

  useEffect(() => {
    const handleBack = () => {
      if (step === "FORGOT") {
        setForgotError("");
        setForgotSuccess("");
        setStep("REG");
        return true;
      }
      if (step === "OTP") {
        setStep("REG");
        return true;
      }
      if (step === "REG") {
        setStep("ROLE");
        return true;
      }
      if (step === "ROLE") {
        setStep("CAROUSEL");
        return true;
      }
      if (step === "CAROUSEL") {
        setStep("LANG");
        return true;
      }
      if (step === "LANG") {
        setStep("SPLASH");
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBack,
    );

    return () => subscription.remove();
  }, [step]);

  const handleRequestPasswordReset = async () => {
    try {
      setForgotLoading(true);
      setForgotError("");
      setForgotSuccess("");

      const emailToUse = (forgotEmail || email).trim();
      await requestPasswordReset(emailToUse);

      // Keep the message generic (privacy) even if the email isn't registered.
      setForgotSuccess(
        "If an account exists for this email, you'll receive a reset link to continue on nvoisyshealth.com.",
      );
    } catch (error) {
      console.log("Password reset request error:", error);
      setForgotError(error?.message || "Could not request password reset");
    } finally {
      setForgotLoading(false);
    }
  };

  const handlePocketBaseAuth = async () => {
    try {
      setAuthLoading(true);
      setAuthError("");
      setAuthSuccess("");

      if (authMode === "signup") {
        if (!name.trim()) {
          throw new Error("Please enter your name");
        }

        if (password.trim().length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }

        if (password.trim() !== passwordConfirm.trim()) {
          throw new Error("Passwords do not match.");
        }

        if (role === "patient") {
          if (!patientCondition.trim()) {
            throw new Error("Please enter your condition or disease name");
          }
          if (!patientGender) {
            throw new Error("Please select Male or Female (or Other)");
          }
          const healthProfileError =
            validatePatientHealthProfileComplete(patientHealthValues);
          if (healthProfileError) {
            throw new Error(healthProfileError);
          }
        }
        if (role === "doctor") {
          if (!doctorSpecialtyField.trim()) {
            throw new Error("Please enter your medical field / specialty");
          }
          if (!doctorClinic.trim()) {
            throw new Error(
              "Please enter the clinic or hospital you work with",
            );
          }
        }

        await signUpWithEmail({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          passwordConfirm: passwordConfirm.trim(),
          role,
          profileFields:
            role === "patient"
              ? {
                  primary_condition: patientCondition.trim(),
                  gender: patientGender,
                  avatarAsset: patientRegAvatar,
                  ...buildPatientHealthPayload(patientHealthValues),
                  ...(registrationLanguage.trim()
                    ? { language: registrationLanguage.trim() }
                    : {}),
                }
              : role === "doctor"
                ? {
                    specialty: doctorSpecialtyField.trim(),
                    clinic_or_hospital: doctorClinic.trim(),
                    ...(registrationLanguage.trim()
                      ? { language: registrationLanguage.trim() }
                      : {}),
                  }
                : {},
        });

        setAuthSuccess(
          "Account created. Please verify your email using the link we sent, then log in.",
        );
        setAuthMode("login");
        setPassword("");
        setPasswordConfirm("");
        setShowPassword(false);
        setShowPasswordConfirm(false);
        return;
      }

      const result = await loginWithEmail({
        email: email.trim(),
        password: password.trim(),
        selectedRole: role,
      });

      onLogin({
        user: result.user,
        profile: result.profile,
      });
    } catch (error) {
      console.log("Auth error:", error);
      const pbFieldErrors =
        error?.data?.data || error?.response?.data?.data || null;
      const passwordError = pbFieldErrors?.password?.message;
      const passwordConfirmError = pbFieldErrors?.passwordConfirm?.message;
      const detailed = formatPocketBaseClientError(error);

      if (authMode === "signup" && password.trim().length < 8) {
        setAuthError("Password must be at least 8 characters.");
      } else if (
        authMode === "signup" &&
        password.trim() !== passwordConfirm.trim()
      ) {
        setAuthError("Passwords do not match.");
      } else if (passwordConfirmError) {
        setAuthError(passwordConfirmError);
      } else if (passwordError) {
        setAuthError(passwordError);
      } else if (detailed) {
        setAuthError(detailed);
      } else {
        setAuthError(error?.message || "Authentication failed");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      setAuthLoading(true);
      setAuthError("");
      setAuthSuccess("");

      const result = await signInWithOAuth({
        providerName: "google",
        selectedRole: role,
      });

      onLogin({
        user: result.user,
        profile: result.profile,
      });
    } catch (error) {
      console.log("Google auth error:", error);
      setAuthError(error?.message || "Google authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAppleAuth = async () => {
    try {
      setAuthLoading(true);
      setAuthError("");
      setAuthSuccess("");

      const result = await signInWithOAuth({
        providerName: "apple",
        selectedRole: role,
      });

      onLogin({
        user: result.user,
        profile: result.profile,
      });
    } catch (error) {
      console.log("Apple auth error:", error);
      setAuthError(error?.message || "Apple authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  if (step === "SPLASH") {
    return <SplashScreen onNext={() => setStep("LANG")} />;
  }

  if (step === "LANG") {
    return (
      <LanguageScreen
        onNext={(pickedLanguage) => {
          setRegistrationLanguage(String(pickedLanguage || "").trim());
          setStep("CAROUSEL");
        }}
        onBack={() => {}}
      />
    );
  }

  if (step === "CAROUSEL") {
    return (
      <OnboardingCarousel
        onNext={() => setStep("ROLE")}
        onBack={() => setStep("LANG")}
      />
    );
  }

  if (step === "ROLE") {
    return (
      <RoleScreen
        onNext={(r) => {
          setRole(r);
          setStep("REG");
        }}
        onGoToLogin={(r) => {
          setRole(r);
          setAuthMode("login");
          setAuthError("");
          setAuthSuccess("");
          setPassword("");
          setPasswordConfirm("");
          setShowPassword(false);
          setShowPasswordConfirm(false);
          setStep("REG");
        }}
        onBack={() => setStep("CAROUSEL")}
      />
    );
  }

  if (step === "FORGOT") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              padding: RFValue(24),
              paddingTop: Math.max(authInsets.top, RFValue(24)),
              paddingBottom: Math.max(authInsets.bottom, RFValue(24)),
              justifyContent: "center",
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <View style={{ marginBottom: RFValue(24) }}>
              <TouchableOpacity
                onPress={() => setStep("REG")}
                style={{ marginBottom: RFValue(20) }}
              >
                <Ionicons
                  name="arrow-back"
                  size={RFValue(24)}
                  color="#1E1B4B"
                />
              </TouchableOpacity>

              <Text
                style={{
                  fontSize: RFValue(28),
                  fontWeight: "800",
                  color: "#1E1B4B",
                  marginBottom: RFValue(8),
                }}
              >
                Reset password
              </Text>

              <Text style={{ fontSize: RFValue(14), color: "#6B7280" }}>
                {"Enter your email and we'll send you a reset link."}
              </Text>
            </View>

            <TextInput
              placeholder="Email"
              value={forgotEmail}
              onChangeText={(v) => {
                setForgotEmail(v);
                if (forgotError) setForgotError("");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: RFValue(14),
                paddingHorizontal: RFValue(16),
                paddingVertical: RFValue(16),
                marginBottom: RFValue(14),
                borderWidth: 1,
                borderColor: "#E5E7EB",
                fontSize: RFValue(15),
                color: "#1E1B4B",
              }}
              placeholderTextColor="#9CA3AF"
            />

            {!!forgotSuccess && (
              <Text
                style={{
                  color: "#059669",
                  marginBottom: RFValue(14),
                  fontSize: RFValue(14),
                }}
              >
                {forgotSuccess}
              </Text>
            )}

            {!!forgotError && (
              <Text
                style={{
                  color: "#DC2626",
                  marginBottom: RFValue(14),
                  fontSize: RFValue(14),
                }}
              >
                {forgotError}
              </Text>
            )}

            <TouchableOpacity
              onPress={handleRequestPasswordReset}
              disabled={forgotLoading}
              style={{
                backgroundColor: "#4338CA",
                borderRadius: RFValue(16),
                paddingVertical: RFValue(16),
                alignItems: "center",
                marginTop: RFValue(8),
                opacity: forgotLoading ? 0.8 : 1,
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "700",
                  fontSize: RFValue(16),
                }}
              >
                {forgotLoading ? "Sending..." : "Send reset link"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setStep("REG")}
              style={{ alignItems: "center", marginTop: RFValue(18) }}
            >
              <Text
                style={{
                  color: "#4338CA",
                  fontWeight: "700",
                  fontSize: RFValue(14),
                }}
              >
                Back to login
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (step === "REG") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{
              flexGrow: 1,
              padding: RFValue(24),
              paddingTop: Math.max(authInsets.top, RFValue(24)),
              paddingBottom: Math.max(authInsets.bottom, RFValue(120)),
              justifyContent: "center",
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <View style={{ marginBottom: RFValue(24) }}>
              <TouchableOpacity
                onPress={() => setStep("ROLE")}
                style={{ marginBottom: RFValue(20) }}
              >
                <Ionicons
                  name="arrow-back"
                  size={RFValue(24)}
                  color="#1E1B4B"
                />
              </TouchableOpacity>

              <Text
                style={{
                  fontSize: RFValue(28),
                  fontWeight: "800",
                  color: "#1E1B4B",
                  marginBottom: RFValue(8),
                }}
              >
                {authMode === "signup" ? "Create account" : "Login"}
              </Text>

              <Text style={{ fontSize: RFValue(14), color: "#6B7280" }}>
                Role selected: {role}
              </Text>
            </View>

            {role === "patient" ? (
              <View
                style={{
                  marginBottom: RFValue(16),
                  padding: RFValue(14),
                  backgroundColor: "#EEF2FF",
                  borderRadius: RFValue(14),
                  borderWidth: 1,
                  borderColor: "#C7D2FE",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: RFValue(6),
                  }}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={RFValue(22)}
                    color="#4338CA"
                    style={{ marginRight: RFValue(8) }}
                  />
                  <Text
                    style={{
                      fontSize: RFValue(16),
                      fontWeight: "800",
                      color: "#1E1B4B",
                      flex: 1,
                    }}
                  >
                    Medical records
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: RFValue(13),
                    color: "#4338CA",
                    lineHeight: 20,
                  }}
                >
                  After you sign in, open Medical records from Home to upload
                  prescriptions, lab reports, and images. They stay on your
                  profile for demo calls, package sessions, and Quick consults.
                </Text>
              </View>
            ) : null}

            {authMode === "signup" && (
              <TextInput
                placeholder="Full name"
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  if (authError) setAuthError("");
                  if (authSuccess) setAuthSuccess("");
                }}
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: RFValue(14),
                  paddingHorizontal: RFValue(16),
                  paddingVertical: RFValue(16),
                  marginBottom: RFValue(14),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  fontSize: RFValue(15),
                  color: "#1E1B4B",
                }}
                placeholderTextColor="#9CA3AF"
              />
            )}

            <TextInput
              placeholder="Email"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (authError) setAuthError("");
                if (authSuccess) setAuthSuccess("");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: RFValue(14),
                paddingHorizontal: RFValue(16),
                paddingVertical: RFValue(16),
                marginBottom: RFValue(14),
                borderWidth: 1,
                borderColor: "#E5E7EB",
                fontSize: RFValue(15),
                color: "#1E1B4B",
              }}
              placeholderTextColor="#9CA3AF"
            />

            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: RFValue(14),
                paddingLeft: RFValue(16),
                paddingRight: RFValue(12),
                marginBottom: RFValue(14),
                borderWidth: 1,
                borderColor: "#E5E7EB",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  if (authError) setAuthError("");
                  if (authSuccess) setAuthSuccess("");
                }}
                secureTextEntry={!showPassword}
                style={{
                  flex: 1,
                  paddingVertical: RFValue(16),
                  fontSize: RFValue(15),
                  color: "#1E1B4B",
                }}
                placeholderTextColor="#9CA3AF"
              />

              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                disabled={authLoading}
              >
                <Text
                  style={{
                    color: "#4338CA",
                    fontWeight: "700",
                    fontSize: RFValue(12),
                    opacity: authLoading ? 0.6 : 1,
                  }}
                >
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </TouchableOpacity>
            </View>

            {authMode === "signup" && (
              <View
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: RFValue(14),
                  paddingLeft: RFValue(16),
                  paddingRight: RFValue(12),
                  marginBottom: RFValue(14),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <TextInput
                  placeholder="Confirm password"
                  value={passwordConfirm}
                  onChangeText={(value) => {
                    setPasswordConfirm(value);
                    if (authError) setAuthError("");
                    if (authSuccess) setAuthSuccess("");
                  }}
                  secureTextEntry={!showPasswordConfirm}
                  style={{
                    flex: 1,
                    paddingVertical: RFValue(16),
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholderTextColor="#9CA3AF"
                />

                <TouchableOpacity
                  onPress={() => setShowPasswordConfirm((prev) => !prev)}
                  disabled={authLoading}
                >
                  <Text
                    style={{
                      color: "#4338CA",
                      fontWeight: "700",
                      fontSize: RFValue(12),
                      opacity: authLoading ? 0.6 : 1,
                    }}
                  >
                    {showPasswordConfirm ? "Hide" : "Show"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {authMode === "login" && (
              <TouchableOpacity
                onPress={() => {
                  setForgotEmail(email.trim());
                  setForgotError("");
                  setForgotSuccess("");
                  setAuthSuccess("");
                  setStep("FORGOT");
                }}
                style={{ alignSelf: "flex-end", marginBottom: RFValue(10) }}
                disabled={authLoading}
              >
                <Text
                  style={{
                    color: "#4338CA",
                    fontWeight: "700",
                    fontSize: RFValue(13),
                    opacity: authLoading ? 0.6 : 1,
                  }}
                >
                  Forgot password?
                </Text>
              </TouchableOpacity>
            )}

            {authMode === "signup" && role === "patient" && (
              <>
                <Text
                  style={{
                    fontSize: RFValue(13),
                    fontWeight: "700",
                    color: "#374151",
                    marginBottom: RFValue(8),
                  }}
                >
                  Condition / disease name
                </Text>
                <TextInput
                  placeholder="e.g. Diabetes, hypertension, wound care..."
                  value={patientCondition}
                  onChangeText={setPatientCondition}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: RFValue(14),
                    paddingHorizontal: RFValue(16),
                    paddingVertical: RFValue(16),
                    marginBottom: RFValue(14),
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholderTextColor="#9CA3AF"
                />

                <PatientHealthProfileFields
                  palette={{
                    card: "#FFFFFF",
                    border: "#E5E7EB",
                    textPrimary: "#1E1B4B",
                    textSecondary: "#374151",
                    textTertiary: "#6B7280",
                    placeholder: "#9CA3AF",
                    accent: "#4338CA",
                    accentText: "#FFFFFF",
                  }}
                  values={patientHealthValues}
                  onChange={updatePatientHealthField}
                  disabled={authLoading}
                />

                <Text
                  style={{
                    fontSize: RFValue(13),
                    fontWeight: "700",
                    color: "#374151",
                    marginBottom: RFValue(8),
                  }}
                >
                  Gender
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    marginBottom: RFValue(14),
                  }}
                >
                  {[
                    { id: "male", label: "Male" },
                    { id: "female", label: "Female" },
                    { id: "other", label: "Other" },
                  ].map((genderOption) => {
                    const active = patientGender === genderOption.id;
                    return (
                      <TouchableOpacity
                        key={genderOption.id}
                        onPress={() => setPatientGender(genderOption.id)}
                        style={{
                          paddingHorizontal: RFValue(18),
                          paddingVertical: RFValue(10),
                          borderRadius: RFValue(12),
                          backgroundColor: active ? "#4338CA" : "#FFFFFF",
                          borderWidth: 1,
                          borderColor: active ? "#4338CA" : "#E5E7EB",
                          marginRight: RFValue(8),
                          marginBottom: RFValue(8),
                        }}
                      >
                        <Text
                          style={{
                            fontSize: RFValue(14),
                            fontWeight: "700",
                            color: active ? "#FFF" : "#374151",
                          }}
                        >
                          {genderOption.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text
                  style={{
                    fontSize: RFValue(13),
                    fontWeight: "700",
                    color: "#374151",
                    marginBottom: RFValue(8),
                  }}
                >
                  Profile photo (optional)
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert("Profile photo", "Choose a source", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Camera",
                        onPress: () => pickRegistrationAvatar("camera"),
                      },
                      {
                        text: "Library",
                        onPress: () => pickRegistrationAvatar("library"),
                      },
                    ])
                  }
                  style={{
                    height: RFValue(120),
                    borderRadius: RFValue(14),
                    backgroundColor: "#FFFFFF",
                    borderWidth: 2,
                    borderColor: "#E5E7EB",
                    borderStyle: "dashed",
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: RFValue(14),
                    overflow: "hidden",
                  }}
                >
                  {patientRegAvatar?.uri ? (
                    <Image
                      source={{ uri: patientRegAvatar.uri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ alignItems: "center" }}>
                      <Ionicons
                        name="camera"
                        size={RFValue(32)}
                        color="#9CA3AF"
                      />
                      <Text
                        style={{
                          color: "#9CA3AF",
                          marginTop: RFValue(6),
                          fontSize: RFValue(13),
                        }}
                      >
                        Tap to add photo
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                {patientRegAvatar?.uri ? (
                  <TouchableOpacity
                    onPress={() => setPatientRegAvatar(null)}
                    style={{ marginBottom: RFValue(14) }}
                  >
                    <Text
                      style={{
                        color: "#DC2626",
                        fontWeight: "600",
                        fontSize: RFValue(13),
                      }}
                    >
                      Remove photo
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}

            {authMode === "signup" && role === "doctor" && (
              <>
                <Text
                  style={{
                    fontSize: RFValue(13),
                    fontWeight: "700",
                    color: "#374151",
                    marginBottom: RFValue(8),
                  }}
                >
                  Medical field / specialty
                </Text>
                <TextInput
                  placeholder="e.g. Cardiology, general practice, wound care..."
                  value={doctorSpecialtyField}
                  onChangeText={setDoctorSpecialtyField}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: RFValue(14),
                    paddingHorizontal: RFValue(16),
                    paddingVertical: RFValue(16),
                    marginBottom: RFValue(14),
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholderTextColor="#9CA3AF"
                />
                <Text
                  style={{
                    fontSize: RFValue(13),
                    fontWeight: "700",
                    color: "#374151",
                    marginBottom: RFValue(8),
                  }}
                >
                  Clinic or hospital
                </Text>
                <TextInput
                  placeholder="Where you currently work or consult"
                  value={doctorClinic}
                  onChangeText={setDoctorClinic}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: RFValue(14),
                    paddingHorizontal: RFValue(16),
                    paddingVertical: RFValue(16),
                    marginBottom: RFValue(14),
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                  placeholderTextColor="#9CA3AF"
                />
              </>
            )}

            {!!authSuccess && (
              <Text
                style={{
                  color: "#059669",
                  marginBottom: RFValue(14),
                  fontSize: RFValue(14),
                }}
              >
                {authSuccess}
              </Text>
            )}

            {!!authError && (
              <Text
                style={{
                  color: "#DC2626",
                  marginBottom: RFValue(14),
                  fontSize: RFValue(14),
                }}
              >
                {authError}
              </Text>
            )}

            {role === "patient" && (
              <View
                style={{
                  backgroundColor: "#EEF2FF",
                  borderRadius: RFValue(14),
                  padding: RFValue(14),
                  marginBottom: RFValue(12),
                  borderWidth: 1,
                  borderColor: "#C7D2FE",
                }}
              >
                <Text
                  style={{
                    fontWeight: "800",
                    color: "#3730A3",
                    marginBottom: RFValue(6),
                    fontSize: RFValue(14),
                  }}
                >
                  Medical records
                </Text>
                <Text
                  style={{
                    fontSize: RFValue(12),
                    color: "#475569",
                    lineHeight: 18,
                  }}
                >
                  After you{" "}
                  {authMode === "signup"
                    ? "create your account and log in"
                    : "log in"}
                  , add prescriptions, labs, and images from Profile or Home →
                  Medical records. They are stored on your profile and easy to
                  share during video calls or quick consults.
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handlePocketBaseAuth}
              disabled={authLoading}
              style={{
                backgroundColor: "#4338CA",
                borderRadius: RFValue(16),
                paddingVertical: RFValue(16),
                alignItems: "center",
                marginTop: RFValue(8),
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "700",
                  fontSize: RFValue(16),
                }}
              >
                {authLoading
                  ? "Please wait..."
                  : authMode === "signup"
                    ? "Create account"
                    : "Login"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleGoogleAuth}
              disabled={authLoading}
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: RFValue(16),
                paddingVertical: RFValue(16),
                alignItems: "center",
                marginTop: RFValue(12),
                borderWidth: 1,
                borderColor: "#E5E7EB",
                opacity: authLoading ? 0.7 : 1,
              }}
            >
              <Text
                style={{
                  color: "#1E1B4B",
                  fontWeight: "700",
                  fontSize: RFValue(15),
                }}
              >
                Continue with Google
              </Text>
            </TouchableOpacity>

            {Platform.OS === "ios" && (
              <TouchableOpacity
                onPress={handleAppleAuth}
                disabled={authLoading}
                style={{
                  backgroundColor: "#000000",
                  borderRadius: RFValue(16),
                  paddingVertical: RFValue(16),
                  alignItems: "center",
                  marginTop: RFValue(12),
                  opacity: authLoading ? 0.7 : 1,
                }}
              >
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontWeight: "700",
                    fontSize: RFValue(15),
                  }}
                >
                  Continue with Apple
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => {
                setAuthMode(authMode === "signup" ? "login" : "signup");
                setAuthError("");
                setAuthSuccess("");
                setPassword("");
                setPasswordConfirm("");
                setShowPassword(false);
                setShowPasswordConfirm(false);
                setPatientCondition("");
                setPatientGender("");
                setPatientRegAvatar(null);
                setDoctorSpecialtyField("");
                setDoctorClinic("");
              }}
              style={{ alignItems: "center", marginTop: RFValue(18) }}
            >
              <Text
                style={{
                  color: "#4338CA",
                  fontWeight: "700",
                  fontSize: RFValue(14),
                }}
              >
                {authMode === "signup"
                  ? "Already have an account? Login"
                  : "No account? Create one"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return null;
};

// --- DOCTOR DASHBOARD COMPONENTS ---
const DoctorAppointmentRequestsSection = () => {
  const { theme } = useTheme();
  const { appointments, updateAppointmentStatus } = useAppData();
  const [actingId, setActingId] = useState(null);
  const [replyDraft, setReplyDraft] = useState({});
  const [localError, setLocalError] = useState("");
  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleRows, setRescheduleRows] = useState([
    { date: "", time: "" },
    { date: "", time: "" },
    { date: "", time: "" },
    { date: "", time: "" },
  ]);

  const requests = (appointments || [])
    .filter((item) => {
      if (item.isPackageDemoMeeting) return false;
      const k = normalizeAppointmentStatus(item.statusKey);
      return k === "requested" || k === "pending";
    })
    .sort(
      (a, b) =>
        new Date(a.scheduledAt || 0).getTime() -
        new Date(b.scheduledAt || 0).getTime(),
    );

  const openRescheduleModal = (appointment) => {
    setLocalError("");
    setRescheduleModal(appointment);
    setRescheduleReason("");
    setRescheduleRows([
      { date: "", time: "" },
      { date: "", time: "" },
      { date: "", time: "" },
      { date: "", time: "" },
    ]);
  };

  const submitRescheduleRequest = async () => {
    if (!rescheduleModal?.id || !updateAppointmentStatus) return;
    const isos = rescheduleRows
      .map((r) =>
        combineDateAndTimeToIso(
          String(r.date || "").trim(),
          String(r.time || "").trim(),
        ),
      )
      .filter(Boolean);
    if (isos.length < 3) {
      setLocalError(
        "Enter at least three rows with YYYY-MM-DD and HH:MM (24h).",
      );
      return;
    }
    if (!String(rescheduleReason || "").trim()) {
      setLocalError("Please enter a reason for the patient.");
      return;
    }
    try {
      setActingId(`${rescheduleModal.id}:ask_reschedule`);
      setLocalError("");
      await updateAppointmentStatus({
        appointmentId: rescheduleModal.id,
        nextStatus: "ask_reschedule",
        rescheduleReason: rescheduleReason.trim(),
        rescheduleSlots: isos,
      });
      setRescheduleModal(null);
      setReplyDraft((prev) => {
        const next = { ...prev };
        delete next[rescheduleModal.id];
        return next;
      });
    } catch (error) {
      console.log("submitRescheduleRequest error:", error);
      setLocalError(
        error?.message || "Could not send reschedule request. Please retry.",
      );
    } finally {
      setActingId(null);
    }
  };

  const runAction = async (appointment, nextStatus) => {
    if (!updateAppointmentStatus) return;
    try {
      setActingId(`${appointment.id}:${nextStatus}`);
      setLocalError("");
      await updateAppointmentStatus({
        appointmentId: appointment.id,
        nextStatus,
        replyNote: replyDraft[appointment.id] || "",
      });
      setReplyDraft((prev) => {
        const next = { ...prev };
        delete next[appointment.id];
        return next;
      });
    } catch (error) {
      console.log("DoctorAppointmentRequestsSection action error:", error);
      setLocalError(
        error?.message || "Could not update the appointment. Please retry.",
      );
    } finally {
      setActingId(null);
    }
  };

  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderRadius: RFValue(20),
        padding: RFValue(18),
        marginBottom: RFValue(16),
        shadowColor: theme.shadowColor,
        shadowOpacity: 0.06,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: RFValue(12),
        }}
      >
        <View
          style={{
            width: RFValue(36),
            height: RFValue(36),
            borderRadius: RFValue(10),
            backgroundColor: theme.accentLight,
            justifyContent: "center",
            alignItems: "center",
            marginRight: RFValue(10),
          }}
        >
          <Ionicons
            name="mail-unread-outline"
            size={RFValue(18)}
            color={theme.accent}
          />
        </View>
        <Text
          style={{
            fontSize: RFValue(16),
            fontWeight: "800",
            color: theme.textPrimary,
            flex: 1,
          }}
        >
          Appointment Requests
        </Text>
        <View
          style={{
            backgroundColor: theme.accent,
            borderRadius: RFValue(10),
            paddingHorizontal: RFValue(8),
            paddingVertical: RFValue(3),
          }}
        >
          <Text
            style={{
              color: "#FFF",
              fontSize: RFValue(10),
              fontWeight: "800",
            }}
          >
            {requests.length}
          </Text>
        </View>
      </View>

      {localError ? (
        <Text
          style={{
            color: theme.danger,
            fontSize: RFValue(12),
            fontWeight: "600",
            marginBottom: RFValue(10),
          }}
        >
          {localError}
        </Text>
      ) : null}

      {requests.length === 0 ? (
        <Text
          style={{
            fontSize: RFValue(13),
            color: theme.textSecondary,
            textAlign: "center",
            paddingVertical: RFValue(10),
          }}
        >
          No pending requests right now.
        </Text>
      ) : (
        requests.map((appointment) => {
          const busyApprove = actingId === `${appointment.id}:approved`;
          const busyReject = actingId === `${appointment.id}:rejected`;
          const busyReschedule =
            actingId === `${appointment.id}:ask_reschedule`;
          const anyBusy = busyApprove || busyReject || busyReschedule;
          return (
            <View
              key={appointment.id}
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.cardBorder,
                paddingTop: RFValue(12),
                marginTop: RFValue(6),
              }}
            >
              <Text
                style={{
                  fontSize: RFValue(14),
                  fontWeight: "700",
                  color: theme.textPrimary,
                }}
              >
                {appointment.patientName || "Patient"}
              </Text>
              <Text
                style={{
                  fontSize: RFValue(12),
                  color: theme.textSecondary,
                  marginTop: RFValue(4),
                }}
              >
                {formatAppointmentSummaryDate(appointment.scheduledAt)} ·{" "}
                {formatTimeValue(appointment.scheduledAt)} ·{" "}
                {appointment.consultationType === "audio"
                  ? "Audio consult"
                  : appointment.consultationType === "chat"
                    ? "Chat consult"
                    : "Video consult"}
              </Text>
              {appointment.reason ? (
                <Text
                  style={{
                    fontSize: RFValue(12),
                    color: theme.textSecondary,
                    marginTop: RFValue(6),
                    lineHeight: RFValue(17),
                  }}
                >
                  <Text style={{ fontWeight: "700" }}>Reason: </Text>
                  {appointment.reason}
                </Text>
              ) : null}

              <TextInput
                value={replyDraft[appointment.id] || ""}
                onChangeText={(value) =>
                  setReplyDraft((prev) => ({
                    ...prev,
                    [appointment.id]: value,
                  }))
                }
                placeholder="Optional note with Approve or Decline (shown to patient)"
                placeholderTextColor={theme.textTertiary}
                editable={!anyBusy}
                multiline
                style={{
                  backgroundColor: theme.bg,
                  borderRadius: RFValue(10),
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                  paddingHorizontal: RFValue(12),
                  paddingVertical: RFValue(10),
                  marginTop: RFValue(10),
                  minHeight: RFValue(56),
                  textAlignVertical: "top",
                  fontSize: RFValue(13),
                  color: theme.textPrimary,
                }}
              />

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  marginTop: RFValue(10),
                  gap: RFValue(8),
                }}
              >
                <TouchableOpacity
                  onPress={() => runAction(appointment, "rejected")}
                  disabled={anyBusy}
                  style={{
                    flexGrow: 1,
                    minWidth: "28%",
                    backgroundColor: theme.dangerLight,
                    borderRadius: RFValue(12),
                    paddingVertical: RFValue(10),
                    alignItems: "center",
                    opacity: anyBusy ? 0.6 : 1,
                  }}
                >
                  {busyReject ? (
                    <ActivityIndicator color={theme.danger} />
                  ) : (
                    <Text
                      style={{
                        color: theme.danger,
                        fontWeight: "700",
                        fontSize: RFValue(13),
                      }}
                    >
                      Decline
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openRescheduleModal(appointment)}
                  disabled={anyBusy}
                  style={{
                    flexGrow: 1,
                    minWidth: "28%",
                    backgroundColor: theme.warning + "33",
                    borderRadius: RFValue(12),
                    paddingVertical: RFValue(10),
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: theme.warning,
                    opacity: anyBusy ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      color: theme.warning,
                      fontWeight: "800",
                      fontSize: RFValue(13),
                    }}
                  >
                    Reschedule
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => runAction(appointment, "approved")}
                  disabled={anyBusy}
                  style={{
                    flexGrow: 1,
                    minWidth: "28%",
                    backgroundColor: theme.accent,
                    borderRadius: RFValue(12),
                    paddingVertical: RFValue(10),
                    alignItems: "center",
                    opacity: anyBusy ? 0.75 : 1,
                  }}
                >
                  {busyApprove ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text
                      style={{
                        color: "#FFF",
                        fontWeight: "700",
                        fontSize: RFValue(13),
                      }}
                    >
                      Approve
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <Modal visible={!!rescheduleModal} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: RFValue(18),
          }}
        >
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(18),
              padding: RFValue(16),
              maxHeight: "88%",
            }}
          >
            <Text
              style={{
                fontSize: RFValue(17),
                fontWeight: "800",
                color: theme.textPrimary,
                marginBottom: RFValue(6),
              }}
            >
              Request a new time
            </Text>
            <Text
              style={{
                fontSize: RFValue(12),
                color: theme.textSecondary,
                marginBottom: RFValue(12),
              }}
            >
              Same booking - the patient keeps this appointment and picks one of
              your suggestions (or cancels). Add a clear reason plus at least
              three options (YYYY-MM-DD and HH:MM, 24h).
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text
                style={{
                  fontSize: RFValue(12),
                  fontWeight: "700",
                  color: theme.textPrimary,
                }}
              >
                Reason for patient
              </Text>
              <TextInput
                value={rescheduleReason}
                onChangeText={setRescheduleReason}
                placeholder="e.g. I have surgery that morning - here are times that work."
                placeholderTextColor={theme.textTertiary}
                multiline
                style={{
                  backgroundColor: theme.bg,
                  borderRadius: RFValue(12),
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                  padding: RFValue(12),
                  marginTop: RFValue(6),
                  marginBottom: RFValue(14),
                  minHeight: RFValue(72),
                  textAlignVertical: "top",
                  fontSize: RFValue(13),
                  color: theme.textPrimary,
                }}
              />
              {[0, 1, 2, 3].map((idx) => (
                <View key={`rs-${idx}`} style={{ marginBottom: RFValue(10) }}>
                  <Text
                    style={{
                      fontSize: RFValue(11),
                      color: theme.textTertiary,
                      marginBottom: 4,
                    }}
                  >
                    Option {idx + 1}
                    {idx < 3 ? " (required)" : " (optional)"}
                  </Text>
                  <TextInput
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textTertiary}
                    value={rescheduleRows[idx].date}
                    onChangeText={(t) =>
                      setRescheduleRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], date: t };
                        return next;
                      })
                    }
                    style={{
                      backgroundColor: theme.bg,
                      borderRadius: RFValue(10),
                      borderWidth: 1,
                      borderColor: theme.cardBorder,
                      padding: RFValue(10),
                      marginBottom: RFValue(6),
                      fontSize: RFValue(13),
                      color: theme.textPrimary,
                    }}
                  />
                  <TextInput
                    placeholder="HH:MM (24h)"
                    placeholderTextColor={theme.textTertiary}
                    value={rescheduleRows[idx].time}
                    onChangeText={(t) =>
                      setRescheduleRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], time: t };
                        return next;
                      })
                    }
                    style={{
                      backgroundColor: theme.bg,
                      borderRadius: RFValue(10),
                      borderWidth: 1,
                      borderColor: theme.cardBorder,
                      padding: RFValue(10),
                      fontSize: RFValue(13),
                      color: theme.textPrimary,
                    }}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", marginTop: RFValue(12) }}>
              <TouchableOpacity
                onPress={() => setRescheduleModal(null)}
                style={{
                  flex: 1,
                  padding: RFValue(14),
                  borderRadius: RFValue(12),
                  backgroundColor: theme.bg,
                  alignItems: "center",
                  marginRight: RFValue(8),
                }}
              >
                <Text style={{ fontWeight: "800", color: theme.textPrimary }}>
                  Close
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitRescheduleRequest}
                disabled={!!actingId}
                style={{
                  flex: 1,
                  padding: RFValue(14),
                  borderRadius: RFValue(12),
                  backgroundColor: theme.accent,
                  alignItems: "center",
                }}
              >
                {actingId?.endsWith(":ask_reschedule") ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ fontWeight: "800", color: "#FFF" }}>
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
};

const DoctorUpcomingAppointmentsSection = () => {
  const { theme } = useTheme();
  const {
    appointments,
    updateAppointmentStatus,
    currentUser,
    ensureDirectConversation,
    requestOpenConversation,
    sendConversationMessage,
    loadConversationMessages,
    refreshAllData,
  } = useAppData();
  const tabNav = useMainTabNav();
  const [completingId, setCompletingId] = useState(null);
  const [localError, setLocalError] = useState("");
  const [packageOffers, setPackageOffers] = useState([]);
  const [openingChatId, setOpeningChatId] = useState(null);
  const [askPackageAppointment, setAskPackageAppointment] = useState(null);
  const [askPackageBusy, setAskPackageBusy] = useState(false);

  const reloadPackageOffers = useCallback(async () => {
    if (!currentUser?.id) {
      setPackageOffers([]);
      return;
    }
    try {
      const offers = await listPackageOffersForDoctor(currentUser.id);
      setPackageOffers(offers || []);
    } catch (error) {
      console.log(
        "DoctorUpcomingAppointmentsSection load offers:",
        error?.message,
      );
      setPackageOffers([]);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    void reloadPackageOffers();
  }, [reloadPackageOffers, appointments]);

  const findActiveOfferForAppointment = useCallback(
    (appointment) => {
      const targetUid = String(appointment?.patientId || "").trim();
      if (!targetUid) return null;
      const linkedId = String(appointment?.packageOfferId || "").trim();
      // Package demos: only the offer id stored on this appointment counts. Do not fall back to
      // "any paid offer for this patient" or the doctor card shows paid before Ask package is used.
      if (appointment?.isPackageDemoMeeting) {
        if (!linkedId) return null;
        return (
          (packageOffers || []).find((o) => String(o.id) === linkedId) || null
        );
      }
      const matches = (packageOffers || []).filter((o) => {
        const matchUid = String(o.patient_user_id || "") === targetUid;
        const matchRaw = String(o.patient || "") === targetUid;
        if (!matchUid && !matchRaw) return false;
        const st = String(o.status || "sent").toLowerCase();
        return st !== "cancelled" && st !== "revoked";
      });
      if (matches.length === 0) return null;
      const paid = matches.find(
        (o) => String(o.status || "").toLowerCase() === "paid",
      );
      return paid || matches[0];
    },
    [packageOffers],
  );

  const upcoming = (appointments || [])
    .filter((item) => {
      const key = normalizeAppointmentStatus(item.statusKey);
      return key === "approved" || key === "paid" || key === "completed";
    })
    .sort(
      (a, b) =>
        new Date(a.scheduledAt || 0).getTime() -
        new Date(b.scheduledAt || 0).getTime(),
    )
    .slice(0, 8);

  const markCompleted = async (appointment) => {
    if (!updateAppointmentStatus) return;
    try {
      setCompletingId(appointment.id);
      setLocalError("");
      await updateAppointmentStatus({
        appointmentId: appointment.id,
        nextStatus: "completed",
      });
    } catch (error) {
      console.log("markCompleted error:", error);
      setLocalError(
        error?.message || "Could not mark the appointment as completed.",
      );
    } finally {
      setCompletingId(null);
    }
  };

  const openChatForAppointment = async (appointment) => {
    if (!appointment?.patientId) {
      Alert.alert("Chat", "Patient info missing on this appointment.");
      return;
    }
    try {
      setOpeningChatId(appointment.id);
      let cid = null;
      if (appointment.isPackageDemoMeeting) {
        try {
          cid =
            appointment.demoConversationId ||
            (await ensurePackageDemoMeetingConversation(appointment.id));
          await refreshAllData?.();
        } catch (e) {
          console.log("package demo chat:", e?.message);
        }
      }
      if (!cid) {
        cid = appointment.conversationId || null;
      }
      if (!cid) {
        const conv = await ensureDirectConversation(appointment.patientId);
        cid = conv?.id || null;
      }
      if (!cid) {
        Alert.alert("Chat", "Could not open the chat with this patient.");
        return;
      }
      // Seed the conversation with the demo + offer summary if it is empty.
      try {
        const existing = await loadConversationMessages(cid);
        if (!existing || existing.length === 0) {
          const offer = findActiveOfferForAppointment(appointment);
          const cleaned = cleanAppointmentReasonForDisplay(appointment.reason);
          const lines = [];
          if (cleaned) lines.push(`Reason from patient: ${cleaned}`);
          if (appointment.scheduledAt) {
            const dt = new Date(appointment.scheduledAt);
            if (!Number.isNaN(dt.getTime())) {
              lines.push(
                `Demo time: ${dt.toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })} (${
                  appointment.consultationType === "audio"
                    ? "Audio consult"
                    : appointment.consultationType === "chat"
                      ? "Chat consult"
                      : "Video consult"
                }).`,
              );
            }
          }
          if (offer?.title) {
            lines.push(
              `Package sent: ${offer.title} - ₹${offer.amount_inr ?? "-"}.`,
            );
          }
          if (String(offer?.status || "").toLowerCase() === "paid") {
            lines.push(
              `Patient has paid${
                offer?.amount_inr ? ` ₹${offer.amount_inr}` : ""
              }. Continue care here.`,
            );
          }
          for (const line of lines) {
            try {
              await sendConversationMessage(cid, line);
            } catch {
              // best-effort seed
            }
          }
        }
      } catch (seedErr) {
        console.log("openChatForAppointment seed:", seedErr?.message);
      }
      requestOpenConversation?.(cid, { patientUserId: appointment.patientId });
      tabNav?.navigateTab?.("Chat");
    } catch (error) {
      Alert.alert(
        "Chat",
        error?.message || "Could not open chat with this patient.",
      );
    } finally {
      setOpeningChatId(null);
    }
  };

  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderRadius: RFValue(20),
        padding: RFValue(18),
        marginBottom: RFValue(16),
        shadowColor: theme.shadowColor,
        shadowOpacity: 0.06,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      <Text
        style={{
          fontSize: RFValue(16),
          fontWeight: "800",
          color: theme.textPrimary,
          marginBottom: RFValue(12),
        }}
      >
        Upcoming Appointments
      </Text>

      {localError ? (
        <Text
          style={{
            color: theme.danger,
            fontSize: RFValue(12),
            fontWeight: "600",
            marginBottom: RFValue(8),
          }}
        >
          {localError}
        </Text>
      ) : null}

      {upcoming.length === 0 ? (
        <Text
          style={{
            fontSize: RFValue(13),
            color: theme.textSecondary,
            textAlign: "center",
            paddingVertical: RFValue(10),
          }}
        >
          No approved appointments yet.
        </Text>
      ) : (
        upcoming.map((appointment) => {
          const statusKey = normalizeAppointmentStatus(appointment.statusKey);
          const statusColors = appointmentStatusColorsFor(theme, statusKey);
          const isDone = statusKey === "completed";
          const busyComplete = completingId === appointment.id;
          const cleanedReason = cleanAppointmentReasonForDisplay(
            appointment.reason,
          );
          const isPackage = !!appointment.isPackageDemoMeeting;
          const offer = isPackage
            ? findActiveOfferForAppointment(appointment)
            : null;
          const offerStatus = String(offer?.status || "").toLowerCase();
          const isPaid = offerStatus === "paid";
          const badgeBg = isPackage
            ? isPaid
              ? theme.successLight
              : theme.accentLight
            : statusColors.bg;
          const badgeFg = isPackage
            ? isPaid
              ? theme.success
              : theme.accent
            : statusColors.fg;
          const badgeText = isPackage
            ? isPaid
              ? "paid"
              : "approved"
            : humanizeAppointmentStatus(statusKey);
          const openingChat = openingChatId === appointment.id;
          return (
            <View
              key={appointment.id}
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.cardBorder,
                paddingTop: RFValue(12),
                marginTop: RFValue(6),
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(14),
                    fontWeight: "700",
                    color: theme.textPrimary,
                    flex: 1,
                    marginRight: RFValue(8),
                  }}
                  numberOfLines={1}
                >
                  {appointment.patientName || "Patient"}
                </Text>
                <View
                  style={{
                    backgroundColor: badgeBg,
                    borderRadius: RFValue(8),
                    paddingHorizontal: RFValue(8),
                    paddingVertical: RFValue(3),
                  }}
                >
                  <Text
                    style={{
                      color: badgeFg,
                      fontSize: RFValue(10),
                      fontWeight: "800",
                    }}
                  >
                    {badgeText}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  fontSize: RFValue(12),
                  color: theme.textSecondary,
                  marginTop: RFValue(4),
                }}
              >
                {formatAppointmentSummaryDate(appointment.scheduledAt)} ·{" "}
                {formatTimeValue(appointment.scheduledAt)} ·{" "}
                {appointment.consultationType === "audio"
                  ? "Audio consult"
                  : appointment.consultationType === "chat"
                    ? "Chat consult"
                    : "Video consult"}
              </Text>
              {cleanedReason ? (
                <Text
                  style={{
                    fontSize: RFValue(12),
                    color: theme.textSecondary,
                    marginTop: RFValue(6),
                    lineHeight: RFValue(17),
                  }}
                >
                  <Text style={{ fontWeight: "700" }}>Reason: </Text>
                  {cleanedReason}
                </Text>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  marginTop: RFValue(10),
                }}
              >
                {isPackage ? (
                  <>
                    <TouchableOpacity
                      onPress={() => openChatForAppointment(appointment)}
                      disabled={openingChat}
                      style={{
                        backgroundColor: theme.accent,
                        borderRadius: RFValue(10),
                        paddingHorizontal: RFValue(14),
                        paddingVertical: RFValue(8),
                        marginRight: RFValue(8),
                        marginBottom: RFValue(6),
                        opacity: openingChat ? 0.6 : 1,
                      }}
                    >
                      {openingChat ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: RFValue(12),
                            fontWeight: "800",
                          }}
                        >
                          Go to chat
                        </Text>
                      )}
                    </TouchableOpacity>
                    {!isDone && !isPaid ? (
                      <TouchableOpacity
                        onPress={() => setAskPackageAppointment(appointment)}
                        disabled={!!appointment.packageOfferId}
                        style={{
                          backgroundColor: theme.success,
                          borderRadius: RFValue(10),
                          paddingHorizontal: RFValue(14),
                          paddingVertical: RFValue(8),
                          marginRight: RFValue(8),
                          marginBottom: RFValue(6),
                          opacity: appointment.packageOfferId ? 0.45 : 1,
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: RFValue(12),
                            fontWeight: "800",
                          }}
                        >
                          Ask package
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                ) : null}
                {!isDone && !isPackage ? (
                  <TouchableOpacity
                    onPress={() => markCompleted(appointment)}
                    disabled={busyComplete}
                    style={{
                      alignSelf: "flex-start",
                      backgroundColor: theme.successLight,
                      borderRadius: RFValue(10),
                      paddingHorizontal: RFValue(12),
                      paddingVertical: RFValue(8),
                      opacity: busyComplete ? 0.6 : 1,
                    }}
                  >
                    {busyComplete ? (
                      <ActivityIndicator color={theme.success} />
                    ) : (
                      <Text
                        style={{
                          color: theme.success,
                          fontSize: RFValue(12),
                          fontWeight: "700",
                        }}
                      >
                        Mark completed
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                {isDone && !isPackage ? (
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: theme.textTertiary,
                      fontStyle: "italic",
                    }}
                  >
                    Chat with this patient stays open in the Messages tab.
                  </Text>
                ) : null}
              </View>
              {isPackage && appointment.packageOfferId ? (
                <Text
                  style={{
                    fontSize: RFValue(11),
                    color: theme.textSecondary,
                    marginTop: RFValue(8),
                    lineHeight: RFValue(16),
                  }}
                >
                  Already requested a package -{" "}
                  {appointment.packageRequestLabel ||
                    offer?.title ||
                    "Package option sent"}
                  {offer?.amount_inr != null ? ` · ₹${offer.amount_inr}` : ""}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
      <Modal
        visible={!!askPackageAppointment}
        transparent
        animationType="fade"
        onRequestClose={() => !askPackageBusy && setAskPackageAppointment(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            padding: RFValue(20),
          }}
        >
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(16),
              padding: RFValue(16),
            }}
          >
            <Text
              style={{
                fontSize: RFValue(16),
                fontWeight: "800",
                color: theme.textPrimary,
                marginBottom: RFValue(12),
              }}
            >
              Send a package option
            </Text>
            <Text
              style={{
                fontSize: RFValue(12),
                color: theme.textSecondary,
                marginBottom: RFValue(12),
                lineHeight: RFValue(18),
              }}
            >
              Pick the catalogue slot you agreed on in the demo. The patient can
              pay from Package Doctor.
            </Text>
            {[0, 1, 2].map((idx) => (
              <TouchableOpacity
                key={`pkg-slot-${idx}`}
                disabled={askPackageBusy}
                onPress={async () => {
                  if (!askPackageAppointment?.id || !currentUser?.id) return;
                  try {
                    setAskPackageBusy(true);
                    await doctorSendAskPackageForDemoAppointment({
                      appointmentId: askPackageAppointment.id,
                      doctorUserId: currentUser.id,
                      patientUserId: askPackageAppointment.patientId,
                      packageSlotIndex: idx,
                    });
                    setAskPackageAppointment(null);
                    await refreshAllData?.();
                    await reloadPackageOffers();
                  } catch (e) {
                    Alert.alert(
                      "Package",
                      e?.message || "Could not send package option.",
                    );
                  } finally {
                    setAskPackageBusy(false);
                  }
                }}
                style={{
                  paddingVertical: RFValue(12),
                  paddingHorizontal: RFValue(14),
                  borderRadius: RFValue(12),
                  backgroundColor: theme.accentLight,
                  marginBottom: RFValue(8),
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                }}
              >
                <Text
                  style={{
                    color: theme.accent,
                    fontWeight: "800",
                    fontSize: RFValue(14),
                  }}
                >
                  Package {idx + 1}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => !askPackageBusy && setAskPackageAppointment(null)}
              style={{
                marginTop: RFValue(8),
                padding: RFValue(12),
                alignItems: "center",
              }}
            >
              <Text style={{ color: theme.textSecondary, fontWeight: "700" }}>
                Close
              </Text>
            </TouchableOpacity>
            {askPackageBusy ? (
              <ActivityIndicator
                style={{ marginTop: RFValue(8) }}
                color={theme.accent}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const DoctorDashboard = ({ wounds, patients }) => {
  const { theme } = useTheme();
  const {
    currentUser,
    ensureDirectConversation,
    sendConversationMessage,
    requestOpenConversation,
    requestOpenDirectChatWithPatient,
    refreshAllData,
  } = useAppData();
  const tabNav = useMainTabNav();

  const pendingWounds = (wounds || []).filter(
    (w) => w.status === "Review Pending",
  ).length;
  const criticalPatients = (patients || []).filter(
    (p) => p.riskLevel === "High",
  ).length;

  // Doctor "Help" flow per spec:
  //   ensure conversation → send first message → record offer →
  //   switch to the **chat main page** (the chat list). Doctor sees the new
  //   thread sitting at the top and taps in to continue. We deliberately do
  //   NOT pre-select the conversation here - the patient gets the chat
  //   *detail* page through the offer arrow, the doctor lands on the chat list.
  const handleHelpQuickPatient = useCallback(
    async ({ requestId, requestKind, patientUserId, message }) => {
      if (!currentUser?.id) {
        throw new Error("Sign in again before offering help.");
      }
      const conversation = await ensureDirectConversation(patientUserId);
      const conversationId = conversation?.id;
      if (!conversationId) {
        throw new Error("Could not open chat with this patient.");
      }
      await sendConversationMessage(conversationId, message);
      try {
        await recordQuickHelpOffer({
          requestId,
          requestKind,
          doctorUserId: currentUser.id,
          patientUserId,
          conversationId,
          firstMessage: message,
        });
      } catch (e) {
        console.log("recordQuickHelpOffer ignored:", e?.message);
      }
      try {
        await refreshAllData();
      } catch {
        // ignore refresh failures - UI will catch up on next interval
      }
      tabNav?.navigateTab?.("Chat");
      return { conversationId };
    },
    [
      currentUser?.id,
      ensureDirectConversation,
      sendConversationMessage,
      refreshAllData,
      tabNav,
    ],
  );

  // Open a conversation we already created via "Help" - used by the doctor
  // panel when they tap "Open chat" on a card they already offered on. This
  // *does* pre-select the chat so the doctor isn't forced to scroll the list.
  const handleOpenExistingHelpChat = useCallback(
    (conversationId, patientUserId) => {
      if (conversationId) {
        requestOpenConversation?.(conversationId, { patientUserId });
      } else if (patientUserId) {
        requestOpenDirectChatWithPatient?.(patientUserId);
      }
      tabNav?.navigateTab?.("Chat");
    },
    [requestOpenConversation, requestOpenDirectChatWithPatient, tabNav],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle="light-content" backgroundColor={theme.accent} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        {/* Header Block */}
        <View
          style={{
            backgroundColor: theme.accent,
            borderBottomLeftRadius: RFValue(28),
            borderBottomRightRadius: RFValue(28),
            padding: RFValue(24),
            paddingBottom: RFValue(28),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: RFValue(20),
            }}
          >
            <View>
              <Text
                style={{
                  color: "rgba(255,255,255,0.78)",
                  fontSize: RFValue(13),
                  fontWeight: "600",
                  marginBottom: RFValue(4),
                }}
              >
                Good Morning
              </Text>
              <Text
                style={{
                  color: "#FFF",
                  fontSize: RFValue(24),
                  fontWeight: "800",
                }}
              >
                Doctor
              </Text>
              <Text
                style={{
                  color: "rgba(255,255,255,0.6)",
                  fontSize: RFValue(14),
                }}
              >
                Specialist
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TouchableOpacity
                style={{
                  width: RFValue(40),
                  height: RFValue(40),
                  borderRadius: RFValue(12),
                  backgroundColor: "rgba(255,255,255,0.15)",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(10),
                }}
              >
                <Ionicons
                  name="notifications-outline"
                  size={RFValue(22)}
                  color="#FFF"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  width: RFValue(40),
                  height: RFValue(40),
                  borderRadius: RFValue(12),
                  backgroundColor: "#EF4444",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="alert-circle" size={RFValue(22)} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(255,255,255,0.15)",
                borderRadius: RFValue(16),
                padding: RFValue(14),
                marginRight: RFValue(8),
              }}
            >
              <Text
                style={{
                  color: "#FFF",
                  fontSize: RFValue(18),
                  fontWeight: "800",
                  marginBottom: RFValue(4),
                }}
              >
                {patients.length}
              </Text>
              <Text
                style={{
                  color: "rgba(255,255,255,0.8)",
                  fontSize: RFValue(11),
                  fontWeight: "600",
                }}
              >
                Active Patients
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(255,255,255,0.15)",
                borderRadius: RFValue(16),
                padding: RFValue(14),
                marginRight: RFValue(8),
              }}
            >
              <Text
                style={{
                  color: "#FFF",
                  fontSize: RFValue(18),
                  fontWeight: "800",
                  marginBottom: RFValue(4),
                }}
              >
                {pendingWounds}
              </Text>
              <Text
                style={{
                  color: "rgba(255,255,255,0.8)",
                  fontSize: RFValue(11),
                  fontWeight: "600",
                }}
              >
                Pending Wounds
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(255,255,255,0.15)",
                borderRadius: RFValue(16),
                padding: RFValue(14),
              }}
            >
              <Text
                style={{
                  color: "#FFF",
                  fontSize: RFValue(18),
                  fontWeight: "800",
                  marginBottom: RFValue(4),
                }}
              >
                12%
              </Text>
              <Text
                style={{
                  color: "rgba(255,255,255,0.8)",
                  fontSize: RFValue(11),
                  fontWeight: "600",
                }}
              >
                Efficiency Rate
              </Text>
            </View>
          </View>
        </View>

        {/* Content */}
        <View
          style={{ paddingHorizontal: RFValue(16), marginTop: RFValue(16) }}
        >
          <PackageMeetingDoctorPanel theme={theme} />
          <DoctorQuickRequestsPanel
            theme={theme}
            doctorUserId={currentUser?.id}
            onHelpPatient={handleHelpQuickPatient}
            onOpenHelpChat={handleOpenExistingHelpChat}
          />
          <CoinWalletDoctorPanel theme={theme} />
          {/* Critical Patients */}
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(20),
              padding: RFValue(16),
              marginBottom: RFValue(16),
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.cardBorder,
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.07,
              shadowOffset: { width: 0, height: 2 },
              shadowRadius: 16,
              elevation: 2,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: RFValue(14),
              }}
            >
              <View
                style={{
                  width: RFValue(36),
                  height: RFValue(36),
                  borderRadius: RFValue(10),
                  backgroundColor: theme.dangerLight,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(10),
                }}
              >
                <Ionicons
                  name="warning-outline"
                  size={RFValue(18)}
                  color={theme.danger}
                />
              </View>
              <Text
                style={{
                  fontSize: RFValue(16),
                  fontWeight: "800",
                  color: theme.textPrimary,
                  flex: 1,
                }}
              >
                Critical Patients
              </Text>
              <View
                style={{
                  backgroundColor: theme.danger,
                  borderRadius: RFValue(10),
                  paddingHorizontal: RFValue(8),
                  paddingVertical: RFValue(3),
                }}
              >
                <Text
                  style={{
                    color: "#FFF",
                    fontSize: RFValue(10),
                    fontWeight: "800",
                  }}
                >
                  {criticalPatients}
                </Text>
              </View>
            </View>
            {criticalPatients > 0 ? (
              patients
                .filter((p) => p.riskLevel === "High")
                .map((p, idx) => (
                  <View
                    key={idx}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: RFValue(8),
                      borderTopWidth: idx > 0 ? 1 : 0,
                      borderTopColor: theme.divider,
                    }}
                  >
                    <View
                      style={{
                        width: RFValue(10),
                        height: RFValue(10),
                        borderRadius: 5,
                        backgroundColor: theme.danger,
                        marginRight: 10,
                      }}
                    />
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontWeight: "600",
                        flex: 1,
                      }}
                    >
                      {p.name}
                    </Text>
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: RFValue(11),
                      }}
                    >
                      Vitals Alert
                    </Text>
                  </View>
                ))
            ) : (
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: theme.textSecondary,
                  textAlign: "center",
                  paddingVertical: RFValue(10),
                }}
              >
                No patients with critical vitals.
              </Text>
            )}
          </View>

          {/* Appointment Requests (pending approval) */}
          <DoctorAppointmentRequestsSection />

          {/* Upcoming / approved appointments */}
          <DoctorUpcomingAppointmentsSection />

          {/* Recent Activity */}
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(20),
              padding: RFValue(18),
              marginBottom: RFValue(16),
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(16),
                fontWeight: "800",
                color: theme.textPrimary,
                marginBottom: RFValue(14),
              }}
            >
              Recent Activity
            </Text>
            <Text
              style={{
                fontSize: RFValue(13),
                color: theme.textSecondary,
                textAlign: "center",
                paddingVertical: RFValue(10),
              }}
            >
              No recent activity to show.
            </Text>
          </View>

          {/* Health Insights */}
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(20),
              padding: RFValue(18),
              marginBottom: RFValue(16),
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: RFValue(12),
              }}
            >
              <View
                style={{
                  width: RFValue(36),
                  height: RFValue(36),
                  borderRadius: RFValue(10),
                  backgroundColor: theme.bg,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(10),
                }}
              >
                <Ionicons
                  name="sparkles"
                  size={RFValue(18)}
                  color={theme.accent}
                />
              </View>
              <Text
                style={{
                  fontSize: RFValue(16),
                  fontWeight: "800",
                  color: theme.textPrimary,
                }}
              >
                Health Insights
              </Text>
            </View>
            <Text
              style={{
                fontSize: RFValue(13),
                color: theme.textSecondary,
                textAlign: "center",
              }}
            >
              No new insights available.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const DoctorPatientsScreen = ({ patients }) => {
  const { theme } = useTheme();

  const riskColor = (level) =>
    level === "High" ? "#DC2626" : level === "Medium" ? "#D97706" : "#059669";
  const riskBg = (level) =>
    level === "High" ? "#FEF2F2" : level === "Medium" ? "#FEF3C7" : "#ECFDF5";

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["top", "left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          paddingTop: safeHeaderPaddingTop(),
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: RFValue(14),
          }}
        >
          <Text
            style={{
              fontSize: RFValue(20),
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            My Patients
          </Text>
          <TouchableOpacity
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(10),
              backgroundColor: theme.bg,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons
              name="filter"
              size={RFValue(18)}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.bg,
            borderRadius: RFValue(12),
            paddingHorizontal: RFValue(14),
            borderWidth: 1,
            borderColor: theme.cardBorder,
          }}
        >
          <Ionicons
            name="search"
            size={RFValue(18)}
            color={theme.textTertiary}
            style={{ marginRight: RFValue(8) }}
          />
          <TextInput
            placeholder="Search patients..."
            placeholderTextColor={theme.textTertiary}
            style={{
              flex: 1,
              paddingVertical: RFValue(10),
              fontSize: RFValue(14),
              color: theme.textPrimary,
            }}
          />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        {patients.length > 0 ? (
          patients.map((p, idx) => (
            <View
              key={idx}
              style={{
                backgroundColor: theme.card,
                borderRadius: RFValue(16),
                padding: RFValue(16),
                marginBottom: RFValue(12),
                shadowColor: theme.shadowColor,
                shadowOpacity: 0.06,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 12,
                elevation: 3,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: RFValue(48),
                  height: RFValue(48),
                  borderRadius: RFValue(14),
                  backgroundColor: riskBg(p.riskLevel),
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(14),
                }}
              >
                <Ionicons
                  name="person"
                  size={RFValue(24)}
                  color={riskColor(p.riskLevel)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: RFValue(4),
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(15),
                      fontWeight: "800",
                      color: theme.textPrimary,
                    }}
                  >
                    {p.name}
                  </Text>
                  <View
                    style={{
                      backgroundColor: riskBg(p.riskLevel),
                      paddingHorizontal: RFValue(8),
                      paddingVertical: RFValue(3),
                      borderRadius: RFValue(8),
                    }}
                  >
                    <Text
                      style={{
                        color: riskColor(p.riskLevel),
                        fontSize: RFValue(10),
                        fontWeight: "700",
                      }}
                    >
                      {p.riskLevel} Risk
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    fontSize: RFValue(12),
                    color: theme.textSecondary,
                    marginBottom: RFValue(2),
                  }}
                >
                  {p.gender}, {p.age} | {p.blood}
                </Text>
                <Text
                  style={{ fontSize: RFValue(11), color: theme.textTertiary }}
                >
                  {p.conditions}
                </Text>
              </View>
              <View style={{ alignItems: "center", marginLeft: RFValue(12) }}>
                <Text
                  style={{
                    fontSize: RFValue(20),
                    fontWeight: "800",
                    color: riskColor(p.riskLevel),
                  }}
                >
                  {p.risk}
                </Text>
                <Text
                  style={{
                    fontSize: RFValue(9),
                    color: "#9CA3AF",
                    fontWeight: "600",
                  }}
                >
                  Score
                </Text>
              </View>
            </View>
          ))
        ) : (
          <View style={{ alignItems: "center", paddingVertical: RFValue(40) }}>
            <Ionicons
              name="people-outline"
              size={RFValue(48)}
              color="#E5E7EB"
              style={{ marginBottom: RFValue(12) }}
            />
            <Text
              style={{
                fontSize: RFValue(14),
                color: "#6B7280",
                textAlign: "center",
              }}
            >
              No patients assigned yet.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const DoctorEmergencyScreen = ({ navigation }) => {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          paddingTop: safeHeaderPaddingTop(),
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          onPress={() => navigation && navigation.navigate("Home")}
          style={{
            width: RFValue(36),
            height: RFValue(36),
            borderRadius: RFValue(10),
            backgroundColor: theme.bg,
            justifyContent: "center",
            alignItems: "center",
            marginRight: RFValue(14),
          }}
        >
          <Ionicons
            name="arrow-back"
            size={RFValue(20)}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: RFValue(20),
            fontWeight: "800",
            color: theme.textPrimary,
          }}
        >
          Emergency
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        {/* Active Emergency */}
        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: RFValue(20),
            padding: RFValue(18),
            marginBottom: RFValue(16),
            shadowColor: theme.shadowColor,
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 3,
            borderWidth: 1,
            borderColor: theme.cardBorder,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: RFValue(14),
            }}
          >
            <View
              style={{
                width: RFValue(36),
                height: RFValue(36),
                borderRadius: RFValue(10),
                backgroundColor: theme.dangerLight,
                justifyContent: "center",
                alignItems: "center",
                marginRight: RFValue(10),
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={RFValue(18)}
                color={theme.danger}
              />
            </View>
            <Text
              style={{
                fontSize: RFValue(16),
                fontWeight: "800",
                color: theme.textPrimary,
                flex: 1,
              }}
            >
              Active Emergency
            </Text>
          </View>
          <Text
            style={{
              fontSize: RFValue(13),
              color: theme.textSecondary,
              textAlign: "center",
            }}
          >
            No active emergencies.
          </Text>
        </View>

        {/* Recent Responses */}
        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: RFValue(20),
            padding: RFValue(18),
            shadowColor: theme.shadowColor,
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <Text
            style={{
              fontSize: RFValue(16),
              fontWeight: "800",
              color: theme.textPrimary,
              marginBottom: RFValue(14),
            }}
          >
            Recent Responses
          </Text>

          {(() => {
            const responses = [];
            return responses.length > 0 ? (
              responses.map((item, idx) => (
                <View
                  key={idx}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: "#F0FDF4",
                    borderRadius: RFValue(12),
                    padding: RFValue(14),
                    marginBottom: idx === 0 ? RFValue(10) : 0,
                  }}
                >
                  <View>
                    <Text
                      style={{
                        fontSize: RFValue(14),
                        fontWeight: "700",
                        color: "#1E1B4B",
                        marginBottom: RFValue(2),
                      }}
                    >
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: RFValue(11), color: "#6B7280" }}>
                      {item.time}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: "#059669",
                      paddingHorizontal: RFValue(8),
                      paddingVertical: RFValue(4),
                      borderRadius: RFValue(8),
                    }}
                  >
                    <Text
                      style={{
                        color: "#FFF",
                        fontSize: RFValue(10),
                        fontWeight: "700",
                      }}
                    >
                      Resolved
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: "#6B7280",
                  textAlign: "center",
                  paddingVertical: RFValue(10),
                }}
              >
                No recently resolved emergencies.
              </Text>
            );
          })()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const DoctorProfileScreen = ({ onLogout }) => {
  const { theme } = useTheme();
  const { currentUser, refreshAllData } = useAppData();
  const [showTheme, setShowTheme] = useState(false);
  const [showPackageSetup, setShowPackageSetup] = useState(false);
  const [doctorProfileId, setDoctorProfileId] = useState(null);
  const [doctorRow, setDoctorRow] = useState(null);
  const [concerns, setConcerns] = useState([]);
  const [customTag, setCustomTag] = useState("");
  const [loadingConcerns, setLoadingConcerns] = useState(true);
  const [savingConcerns, setSavingConcerns] = useState(false);
  const [concernsError, setConcernsError] = useState("");
  const [concernsSavedFlash, setConcernsSavedFlash] = useState(false);
  const [doctorConsultLanguage, setDoctorConsultLanguage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      if (!currentUser?.id) {
        setLoadingConcerns(false);
        return;
      }
      try {
        const record = await pb
          .collection("doctor_profile")
          .getFirstListItem(`user="${currentUser.id}"`, { requestKey: null });
        if (!active || !record) return;
        setDoctorProfileId(record.id);
        setDoctorRow(record);
        setDoctorConsultLanguage(String(record.language || "").trim());
        setConcerns(
          parseDoctorConcerns(record.concerns || record.health_concerns),
        );
        setConcernsError("");
      } catch (loadError) {
        if (active) {
          setConcernsError(
            loadError?.message ||
              "Could not load doctor profile. Add a doctor_profile row for this user.",
          );
        }
      } finally {
        if (active) setLoadingConcerns(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUser?.id]);

  const toggleConcernChip = (chipId) => {
    const tag = normalizeConcernTag(chipId);
    if (!tag) return;
    setConcerns((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const addCustomConcern = () => {
    const tag = normalizeConcernTag(customTag);
    if (!tag) return;
    setConcerns((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setCustomTag("");
  };

  const saveDoctorConcerns = async () => {
    if (!doctorProfileId) {
      Alert.alert(
        "Profile",
        "Your doctor profile record was not found yet. Try again after login.",
      );
      return;
    }
    setConcernsError("");
    setSavingConcerns(true);
    try {
      await pb.collection("doctor_profile").update(doctorProfileId, {
        concerns,
        language: doctorConsultLanguage.trim(),
      });
      setDoctorRow((prev) =>
        prev ? { ...prev, language: doctorConsultLanguage.trim() } : prev,
      );
      setConcernsSavedFlash(true);
      setTimeout(() => setConcernsSavedFlash(false), 2200);
      if (typeof refreshAllData === "function") {
        await refreshAllData().catch(() => {});
      }
    } catch (saveError) {
      setConcernsError(
        saveError?.data?.message ||
          saveError?.message ||
          "Could not save. Ensure PocketBase has a JSON field `concerns` and optional text `language` on doctor_profile.",
      );
    } finally {
      setSavingConcerns(false);
    }
  };

  if (showPackageSetup && doctorProfileId) {
    return (
      <DoctorPackageSetupScreen
        theme={theme}
        doctorProfileId={doctorProfileId}
        initialRecord={doctorRow || { id: doctorProfileId }}
        currentUserId={currentUser?.id}
        onLogout={onLogout}
        onSkip={() => setShowPackageSetup(false)}
        onComplete={async () => {
          setShowPackageSetup(false);
          try {
            const record = await pb
              .collection("doctor_profile")
              .getFirstListItem(`user="${currentUser.id}"`, {
                requestKey: null,
              });
            setDoctorRow(record);
            setConcerns(
              parseDoctorConcerns(record.concerns || record.health_concerns),
            );
          } catch (_) {
            // ignore
          }
          if (typeof refreshAllData === "function") {
            await refreshAllData().catch(() => {});
          }
        }}
      />
    );
  }

  if (showTheme) return <ThemeScreen onBack={() => setShowTheme(false)} />;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabScrollBottomPadding() }}
      >
        {/* Profile Header */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            padding: RFValue(24),
            paddingTop: safeHeaderPaddingTop(),
            alignItems: "center",
            borderBottomLeftRadius: RFValue(32),
            borderBottomRightRadius: RFValue(32),
            shadowColor: "#000",
            shadowOpacity: 0.04,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 2,
          }}
        >
          <View
            style={{
              width: RFValue(80),
              height: RFValue(80),
              borderRadius: RFValue(24),
              backgroundColor: "#ECFDF5",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: RFValue(14),
            }}
          >
            <Ionicons name="medical" size={RFValue(40)} color="#059669" />
          </View>
          <Text
            style={{
              fontSize: RFValue(11),
              fontWeight: "800",
              color: "#1E1B4B",
            }}
          >
            {currentUser?.name || "Doctor"}
          </Text>
          <Text
            style={{
              fontSize: RFValue(13),
              color: "#6B7280",
              marginTop: RFValue(4),
            }}
          >
            Specialist | License: -----
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: RFValue(8),
            }}
          >
            <View
              style={{
                width: RFValue(8),
                height: RFValue(8),
                borderRadius: RFValue(4),
                backgroundColor: "#059669",
                marginRight: RFValue(4),
              }}
            />
            <Text
              style={{
                fontSize: RFValue(12),
                color: "#059669",
                fontWeight: "600",
              }}
            >
              Available
            </Text>
          </View>
        </View>

        {/* Step 3a - Health concerns for Find Doctor search */}
        <View
          style={{ paddingHorizontal: RFValue(16), paddingTop: RFValue(12) }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: RFValue(18),
              padding: RFValue(16),
              marginBottom: RFValue(12),
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(16),
                fontWeight: "800",
                color: "#1E1B4B",
                marginBottom: RFValue(6),
              }}
            >
              Health concerns you treat
            </Text>
            <Text
              style={{
                fontSize: RFValue(12),
                color: "#6B7280",
                marginBottom: RFValue(12),
              }}
            >
              Patients use these tags in Find Doctor. Tap to select; add your
              own below.
            </Text>
            {loadingConcerns ? (
              <ActivityIndicator color="#059669" />
            ) : (
              <>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {CONCERN_CHIP_OPTIONS.map((chip) => {
                    const active = concerns.includes(chip.id);
                    return (
                      <TouchableOpacity
                        key={chip.id}
                        onPress={() => toggleConcernChip(chip.id)}
                        style={{
                          paddingHorizontal: RFValue(12),
                          paddingVertical: RFValue(8),
                          borderRadius: RFValue(12),
                          backgroundColor: active ? "#059669" : "#F3F4F6",
                          borderWidth: 1,
                          borderColor: active ? "#059669" : "#E5E7EB",
                          marginRight: RFValue(8),
                          marginBottom: RFValue(8),
                        }}
                      >
                        <Text
                          style={{
                            fontSize: RFValue(12),
                            fontWeight: "700",
                            color: active ? "#FFF" : "#374151",
                          }}
                        >
                          {chip.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text
                  style={{
                    fontSize: RFValue(11),
                    fontWeight: "700",
                    color: "#6B7280",
                    marginTop: RFValue(8),
                    marginBottom: RFValue(6),
                  }}
                >
                  Custom tag
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TextInput
                    value={customTag}
                    onChangeText={setCustomTag}
                    placeholder="e.g. thyroid"
                    placeholderTextColor="#9CA3AF"
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: RFValue(12),
                      paddingHorizontal: RFValue(12),
                      paddingVertical: RFValue(10),
                      fontSize: RFValue(14),
                      color: "#1E1B4B",
                      marginRight: RFValue(8),
                    }}
                  />
                  <TouchableOpacity
                    onPress={addCustomConcern}
                    style={{
                      backgroundColor: "#1E1B4B",
                      paddingHorizontal: RFValue(14),
                      paddingVertical: RFValue(10),
                      borderRadius: RFValue(12),
                    }}
                  >
                    <Text
                      style={{
                        color: "#FFF",
                        fontWeight: "800",
                        fontSize: RFValue(12),
                      }}
                    >
                      Add
                    </Text>
                  </TouchableOpacity>
                </View>
                {concerns.length > 0 ? (
                  <Text
                    style={{
                      marginTop: RFValue(10),
                      fontSize: RFValue(11),
                      color: "#374151",
                    }}
                  >
                    Selected: {concerns.join(", ")}
                  </Text>
                ) : null}
                <Text
                  style={{
                    fontSize: RFValue(11),
                    fontWeight: "700",
                    color: "#6B7280",
                    marginTop: RFValue(14),
                    marginBottom: RFValue(6),
                  }}
                >
                  Languages you consult in
                </Text>
                <Text
                  style={{
                    fontSize: RFValue(11),
                    color: "#6B7280",
                    marginBottom: RFValue(8),
                  }}
                >
                  Patients can filter Find Doctor by this. Use the same wording
                  you chose at signup (e.g. English) or list several separated
                  by commas.
                </Text>
                <TextInput
                  value={doctorConsultLanguage}
                  onChangeText={setDoctorConsultLanguage}
                  placeholder="e.g. English or English, Hindi"
                  placeholderTextColor="#9CA3AF"
                  style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: RFValue(12),
                    paddingHorizontal: RFValue(12),
                    paddingVertical: RFValue(10),
                    fontSize: RFValue(14),
                    color: "#1E1B4B",
                    marginBottom: RFValue(4),
                  }}
                />
                {concernsError ? (
                  <Text
                    style={{
                      color: "#DC2626",
                      fontSize: RFValue(12),
                      marginTop: RFValue(8),
                    }}
                  >
                    {concernsError}
                  </Text>
                ) : null}
                {concernsSavedFlash ? (
                  <Text
                    style={{
                      color: "#059669",
                      fontSize: RFValue(12),
                      marginTop: RFValue(6),
                      fontWeight: "700",
                    }}
                  >
                    Saved.
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={saveDoctorConcerns}
                  disabled={savingConcerns || loadingConcerns}
                  style={{
                    marginTop: RFValue(14),
                    backgroundColor: savingConcerns ? "#9CA3AF" : "#059669",
                    paddingVertical: RFValue(12),
                    borderRadius: RFValue(14),
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#FFF",
                      fontWeight: "800",
                      fontSize: RFValue(14),
                    }}
                  >
                    {savingConcerns ? "Saving…" : "Save for patient search"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: RFValue(18),
              padding: RFValue(16),
              marginBottom: RFValue(12),
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(16),
                fontWeight: "800",
                color: "#1E1B4B",
                marginBottom: RFValue(6),
              }}
            >
              Care packages (3)
            </Text>
            <Text
              style={{
                fontSize: RFValue(12),
                color: "#6B7280",
                marginBottom: RFValue(12),
              }}
            >
              Features and package copy are fixed by the app; you only set your
              fee for each tier. Patients see this on Find Doctor. After a
              meeting you send an offer and may adjust the fee again before
              sending.
            </Text>
            <TouchableOpacity
              onPress={() => setShowPackageSetup(true)}
              style={{
                backgroundColor: "#4338CA",
                paddingVertical: RFValue(12),
                borderRadius: RFValue(14),
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#FFF",
                  fontWeight: "800",
                  fontSize: RFValue(14),
                }}
              >
                Edit my 3 packages
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ padding: RFValue(16) }}>
          {/* Stats */}
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: RFValue(18),
              padding: RFValue(16),
              marginBottom: RFValue(16),
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: RFValue(20),
                  fontWeight: "800",
                  color: "#1E1B4B",
                }}
              >
                0
              </Text>
              <Text
                style={{
                  fontSize: RFValue(11),
                  color: "#6B7280",
                  fontWeight: "500",
                }}
              >
                Patients
              </Text>
            </View>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: RFValue(20),
                  fontWeight: "800",
                  color: "#1E1B4B",
                }}
              >
                0
              </Text>
              <Text
                style={{
                  fontSize: RFValue(11),
                  color: "#6B7280",
                  fontWeight: "500",
                }}
              >
                Today
              </Text>
            </View>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: RFValue(20),
                  fontWeight: "800",
                  color: "#1E1B4B",
                }}
              >
                --
              </Text>
              <Text
                style={{
                  fontSize: RFValue(11),
                  color: "#6B7280",
                  fontWeight: "500",
                }}
              >
                Avg min
              </Text>
            </View>
          </View>

          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: RFValue(18),
              padding: RFValue(16),
              marginBottom: RFValue(16),
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(16),
                fontWeight: "800",
                color: "#1E1B4B",
                marginBottom: RFValue(6),
              }}
            >
              Payment history
            </Text>
            <DoctorCoinPaymentHistoryPanel theme={theme} />
          </View>

          {/* Settings */}
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: RFValue(18),
              marginBottom: RFValue(16),
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(12),
                fontWeight: "700",
                color: "#9CA3AF",
                textTransform: "uppercase",
                padding: RFValue(16),
                paddingBottom: RFValue(8),
              }}
            >
              Account
            </Text>
            {[
              { icon: "person-outline", label: "Edit Profile" },
              { icon: "shield-checkmark-outline", label: "Privacy & Security" },
              { icon: "notifications-outline", label: "Notifications" },
              { icon: "calendar-outline", label: "Schedule" },
            ].map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: RFValue(16),
                  paddingTop: idx === 0 ? 0 : RFValue(16),
                  paddingBottom: idx === 3 ? RFValue(16) : RFValue(12),
                }}
              >
                <View
                  style={{
                    width: RFValue(36),
                    height: RFValue(36),
                    borderRadius: RFValue(10),
                    backgroundColor: "#F3F4F6",
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name={item.icon}
                    size={RFValue(18)}
                    color="#6B7280"
                  />
                </View>
                <Text
                  style={{
                    fontSize: RFValue(15),
                    fontWeight: "600",
                    color: "#374151",
                    flex: 1,
                  }}
                >
                  {item.label}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={RFValue(16)}
                  color="#D1D5DB"
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Appearance */}
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: RFValue(18),
              marginBottom: RFValue(16),
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(12),
                fontWeight: "700",
                color: "#9CA3AF",
                textTransform: "uppercase",
                padding: RFValue(16),
                paddingBottom: RFValue(8),
              }}
            >
              Appearance
            </Text>
            <TouchableOpacity
              onPress={() => setShowTheme(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: RFValue(16),
                paddingTop: 0,
                paddingBottom: RFValue(16),
              }}
            >
              <View
                style={{
                  width: RFValue(36),
                  height: RFValue(36),
                  borderRadius: RFValue(10),
                  backgroundColor: "#F3F4F6",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(14),
                }}
              >
                <Ionicons
                  name="color-palette-outline"
                  size={RFValue(18)}
                  color="#6B7280"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: RFValue(15),
                    fontWeight: "600",
                    color: "#374151",
                  }}
                >
                  Theme
                </Text>
                <Text style={{ fontSize: RFValue(12), color: "#9CA3AF" }}>
                  Light
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={RFValue(16)}
                color="#D1D5DB"
              />
            </TouchableOpacity>
          </View>

          {/* Logout */}
          <TouchableOpacity
            onPress={onLogout}
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: RFValue(18),
              padding: RFValue(16),
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
              marginBottom: RFValue(16),
            }}
          >
            <Ionicons
              name="log-out-outline"
              size={RFValue(20)}
              color="#DC2626"
              style={{ marginRight: RFValue(8) }}
            />
            <Text
              style={{
                fontSize: RFValue(15),
                fontWeight: "700",
                color: "#DC2626",
              }}
            >
              Logout
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ========================================
// TELEMEDICINE SCREENS
// ========================================

const AudioCallScreen = ({ onBack }) => {
  const { theme } = useTheme();
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState("Connecting...");
  const localStreamRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(
      () => setCallDuration((prev) => prev + 1),
      1000,
    );
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;

    const startAudio = async () => {
      try {
        const { mediaDevices } = getLivekitWebRTC();
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setStatus("Connected");
      } catch (error) {
        if (mounted) {
          setStatus("Microphone unavailable");
        }
      }
    };

    startAudio();

    return () => {
      mounted = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;
    const nextEnabled = !audioTracks[0].enabled;
    audioTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setIsMuted(!nextEnabled);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1120" }}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1120" />

      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: RFValue(24),
        }}
      >
        <View
          style={{
            width: RFValue(120),
            height: RFValue(120),
            borderRadius: RFValue(60),
            backgroundColor: theme.accent,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: RFValue(16),
          }}
        >
          <Ionicons name="call" size={RFValue(48)} color="#FFF" />
        </View>
        <Text
          style={{
            color: "#FFF",
            fontSize: RFValue(20),
            fontWeight: "800",
          }}
        >
          Doctor
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: RFValue(14),
            marginTop: RFValue(6),
          }}
        >
          {formatTime(callDuration)}
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: RFValue(12),
            marginTop: RFValue(4),
          }}
        >
          {status}
        </Text>
      </View>

      <View
        style={{
          padding: RFValue(24),
          paddingBottom: Platform.OS === "ios" ? 40 : 24,
          flexDirection: "row",
          justifyContent: "center",
        }}
      >
        <TouchableOpacity
          onPress={toggleMute}
          style={{
            width: RFValue(52),
            height: RFValue(52),
            borderRadius: RFValue(26),
            backgroundColor: isMuted ? "#EF4444" : "rgba(255,255,255,0.15)",
            justifyContent: "center",
            alignItems: "center",
            marginHorizontal: RFValue(12),
          }}
        >
          <Ionicons
            name={isMuted ? "mic-off" : "mic"}
            size={RFValue(24)}
            color="#FFF"
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onBack}
          style={{
            width: RFValue(64),
            height: RFValue(64),
            borderRadius: RFValue(32),
            backgroundColor: "#EF4444",
            justifyContent: "center",
            alignItems: "center",
            shadowColor: "#EF4444",
            shadowOpacity: 0.4,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 6,
            marginHorizontal: RFValue(12),
          }}
        >
          <Ionicons
            name="call"
            size={RFValue(28)}
            color="#FFF"
            style={{ transform: [{ rotate: "135deg" }] }}
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const VideoCallScreen = ({ onBack }) => {
  const { theme } = useTheme();
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const localStreamRef = useRef(null);
  const { RTCView: LkRTCView } = useMemo(() => getLivekitWebRTC(), []);

  useEffect(() => {
    const interval = setInterval(
      () => setCallDuration((prev) => prev + 1),
      1000,
    );
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;

    const startStream = async () => {
      try {
        const { mediaDevices } = getLivekitWebRTC();
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: "user" },
        });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        const videoTracks = stream.getVideoTracks();
        setIsVideoOff(videoTracks.length === 0);
      } catch (error) {
        if (mounted) {
          setIsVideoOff(true);
        }
      }
    };

    startStream();

    return () => {
      mounted = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;
    const nextEnabled = !audioTracks[0].enabled;
    audioTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setIsMuted(!nextEnabled);
  };

  const toggleVideo = () => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    if (videoTracks.length === 0) return;
    const nextEnabled = !videoTracks[0].enabled;
    videoTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setIsVideoOff(!nextEnabled);
  };

  const handleSwitchCamera = () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack?.switchCamera) {
      videoTrack.switchCamera();
    } else if (videoTrack?._switchCamera) {
      videoTrack._switchCamera();
    } else if (videoTrack?.applyConstraints) {
      videoTrack.applyConstraints({
        facingMode: isFrontCamera ? "environment" : "user",
      });
    }
    setIsFrontCamera((prev) => !prev);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Main Video (Doctor) */}
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <View
          style={{
            width: RFValue(120),
            height: RFValue(120),
            borderRadius: RFValue(60),
            backgroundColor: theme.accent,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{ color: "#FFF", fontSize: RFValue(40), fontWeight: "800" }}
          >
            DR
          </Text>
        </View>
        <Text
          style={{
            color: "#FFF",
            fontSize: RFValue(18),
            fontWeight: "700",
            marginTop: RFValue(16),
          }}
        >
          Doctor
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: RFValue(14),
            marginTop: RFValue(4),
          }}
        >
          {formatTime(callDuration)}
        </Text>
      </View>

      {/* Self View (Picture-in-Picture) */}
      <View
        style={{
          position: "absolute",
          top: RFValue(60),
          right: RFValue(16),
          width: RFValue(100),
          height: RFValue(140),
          borderRadius: RFValue(16),
          backgroundColor: "#1F2937",
          justifyContent: "center",
          alignItems: "center",
          borderWidth: 2,
          borderColor: theme.accent,
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 12,
          elevation: 8,
          overflow: "hidden",
        }}
      >
        {localStream && !isVideoOff ? (
          <LkRTCView
            streamURL={localStream.toURL()}
            style={{ width: "100%", height: "100%" }}
            objectFit="cover"
            mirror={isFrontCamera}
          />
        ) : (
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <Ionicons
              name={isVideoOff ? "videocam-off" : "person"}
              size={RFValue(32)}
              color="#E5E7EB"
            />
          </View>
        )}
        <View
          style={{
            position: "absolute",
            bottom: RFValue(6),
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: "#FFF",
              fontSize: RFValue(10),
              fontWeight: "600",
            }}
          >
            You
          </Text>
        </View>
      </View>

      {/* Call Controls */}
      <View
        style={{
          padding: RFValue(24),
          paddingBottom: Platform.OS === "ios" ? 40 : 24,
          alignItems: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            marginBottom: RFValue(24),
          }}
        >
          <TouchableOpacity
            onPress={toggleMute}
            style={{
              width: RFValue(52),
              height: RFValue(52),
              borderRadius: RFValue(26),
              backgroundColor: isMuted ? "#EF4444" : "rgba(255,255,255,0.15)",
              justifyContent: "center",
              alignItems: "center",
              marginHorizontal: RFValue(12),
            }}
          >
            <Ionicons
              name={isMuted ? "mic-off" : "mic"}
              size={RFValue(24)}
              color="#FFF"
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleVideo}
            style={{
              width: RFValue(52),
              height: RFValue(52),
              borderRadius: RFValue(26),
              backgroundColor: isVideoOff
                ? "#EF4444"
                : "rgba(255,255,255,0.15)",
              justifyContent: "center",
              alignItems: "center",
              marginHorizontal: RFValue(12),
            }}
          >
            <Ionicons
              name={isVideoOff ? "videocam-off" : "videocam"}
              size={RFValue(24)}
              color="#FFF"
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSwitchCamera}
            style={{
              width: RFValue(52),
              height: RFValue(52),
              borderRadius: RFValue(26),
              backgroundColor: "rgba(255,255,255,0.15)",
              justifyContent: "center",
              alignItems: "center",
              marginHorizontal: RFValue(12),
            }}
          >
            <Ionicons name="camera-reverse" size={RFValue(24)} color="#FFF" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={onBack}
          style={{
            width: RFValue(64),
            height: RFValue(64),
            borderRadius: RFValue(32),
            backgroundColor: "#EF4444",
            justifyContent: "center",
            alignItems: "center",
            shadowColor: "#EF4444",
            shadowOpacity: 0.4,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <Ionicons
            name="call"
            size={RFValue(28)}
            color="#FFF"
            style={{ transform: [{ rotate: "135deg" }] }}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const doctorDisplayInitials = (name) => {
  const parts = String(name || "DR")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "DR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase() || "DR";
};

const AppointmentBookingScreen = ({
  onBack,
  doctor = null,
  demoMode = false,
  onBookingComplete,
}) => {
  const { theme } = useTheme();
  const { createAppointment } = useAppData();
  const dates = buildAppointmentDateOptions(14);
  const timeSlots = DEFAULT_APPOINTMENT_TIME_SLOTS;
  const [selectedDate, setSelectedDate] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [consultType, setConsultType] = useState("video");
  const [reason, setReason] = useState("");
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [scheduledIso, setScheduledIso] = useState("");

  useEffect(() => {
    setSelectedSlot(null);
  }, [selectedDate]);

  const activeDoctor = doctor || {
    name: "Doctor",
    specialty: "Specialist",
    experience: 15,
    rating: 4.8,
    fee: 500,
    avatarUrl: null,
    userId: null,
  };

  const experienceLine =
    activeDoctor.experience != null
      ? `${activeDoctor.experience} yrs experience`
      : "Experienced physician";
  const selectedDateObj = dates[selectedDate]?.dateObj || new Date();
  const consultationTypeLabel = (value) => {
    if (value === "audio") return "Audio consult";
    if (value === "chat") return "Chat consult";
    return "Video consult";
  };
  const slotIsPast = (slotLabel) => {
    const iso = combineDateAndSlotLabel(selectedDateObj, slotLabel);
    const slotTime = new Date(iso).getTime();
    return Number.isFinite(slotTime) && slotTime <= Date.now();
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot) return;
    const trimmedReason = reason.trim();
    if (!demoMode && !trimmedReason) {
      setBookingError(
        "Please describe the reason for visit so the doctor can review your request.",
      );
      return;
    }
    const iso = combineDateAndSlotLabel(selectedDateObj, selectedSlot);
    if (new Date(iso).getTime() <= Date.now()) {
      setBookingError("Please choose a future appointment date and time.");
      setSelectedSlot(null);
      return;
    }
    setScheduledIso(iso);
    setBookingError("");
    if (demoMode || !activeDoctor.userId || !createAppointment) {
      setBookingConfirmed(true);
      return;
    }
    try {
      setBookingLoading(true);
      await createAppointment({
        doctorUserId: activeDoctor.userId,
        doctorProfileId: activeDoctor.profileId,
        scheduledAtIso: iso,
        consultationType: consultType,
        reason: trimmedReason,
      });
      setBookingConfirmed(true);
    } catch (error) {
      console.log("AppointmentBookingScreen error:", error);
      setBookingError(
        formatPocketBaseClientError(error) ||
          error?.message ||
          "Could not book. Add an `appointments` collection in PocketBase (patient, doctor, scheduled_at, consultation_type, status, reason, conversation).",
      );
    } finally {
      setBookingLoading(false);
    }
  };

  const handleDone = () => {
    if (onBookingComplete) onBookingComplete();
    else onBack();
  };

  if (bookingConfirmed) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.bg }}
        edges={["left", "right"]}
      >
        <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: RFValue(24),
          }}
        >
          <View
            style={{
              width: RFValue(80),
              height: RFValue(80),
              borderRadius: RFValue(40),
              backgroundColor: theme.successLight,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: RFValue(24),
            }}
          >
            <Ionicons
              name="checkmark-circle"
              size={RFValue(40)}
              color={theme.success}
            />
          </View>
          <Text
            style={{
              fontSize: RFValue(20),
              fontWeight: "800",
              color: theme.textPrimary,
              textAlign: "center",
              marginBottom: RFValue(8),
            }}
          >
            Appointment Confirmed!
          </Text>
          <Text
            style={{
              fontSize: RFValue(14),
              color: theme.textSecondary,
              textAlign: "center",
              lineHeight: RFValue(22),
              marginBottom: RFValue(24),
            }}
          >
            Your appointment with the doctor has been booked successfully
          </Text>

          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(16),
              padding: RFValue(20),
              width: "100%",
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
              marginBottom: RFValue(24),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: RFValue(12),
              }}
            >
              <View
                style={{
                  paddingHorizontal: RFValue(10),
                  height: RFValue(36),
                  borderRadius: RFValue(12),
                  backgroundColor: theme.successLight,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(12),
                  overflow: "hidden",
                }}
              >
                {activeDoctor.avatarUrl ? (
                  <Image
                    source={{ uri: activeDoctor.avatarUrl }}
                    style={{ width: RFValue(36), height: RFValue(36) }}
                  />
                ) : (
                  <Text
                    style={{
                      color: theme.success,
                      fontSize: RFValue(14),
                      fontWeight: "800",
                    }}
                  >
                    {doctorDisplayInitials(activeDoctor.name)}
                  </Text>
                )}
              </View>
              <View>
                <Text
                  style={{
                    fontSize: RFValue(16),
                    fontWeight: "700",
                    color: theme.textPrimary,
                  }}
                >
                  {activeDoctor.name}
                </Text>
                <Text
                  style={{ fontSize: RFValue(12), color: theme.textSecondary }}
                >
                  {activeDoctor.specialty}
                </Text>
              </View>
            </View>
            <View
              style={{
                height: 1,
                backgroundColor: theme.cardBorder,
                marginBottom: RFValue(12),
              }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: RFValue(8),
              }}
            >
              <Text
                style={{ fontSize: RFValue(13), color: theme.textSecondary }}
              >
                Date
              </Text>
              <Text
                style={{
                  fontSize: RFValue(13),
                  fontWeight: "700",
                  color: theme.textPrimary,
                }}
              >
                {formatAppointmentSummaryDate(scheduledIso)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: RFValue(8),
              }}
            >
              <Text
                style={{ fontSize: RFValue(13), color: theme.textSecondary }}
              >
                Time
              </Text>
              <Text
                style={{
                  fontSize: RFValue(13),
                  fontWeight: "700",
                  color: theme.textPrimary,
                }}
              >
                {selectedSlot}
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text
                style={{ fontSize: RFValue(13), color: theme.textSecondary }}
              >
                Type
              </Text>
              <Text
                style={{
                  fontSize: RFValue(13),
                  fontWeight: "700",
                  color: theme.textPrimary,
                }}
              >
                {consultationTypeLabel(consultType)}
              </Text>
            </View>
            {reason.trim() ? (
              <View style={{ marginTop: RFValue(10) }}>
                <Text
                  style={{
                    fontSize: RFValue(12),
                    color: theme.textSecondary,
                    marginBottom: RFValue(4),
                  }}
                >
                  Reason
                </Text>
                <Text
                  style={{
                    fontSize: RFValue(13),
                    color: theme.textPrimary,
                    lineHeight: RFValue(18),
                  }}
                >
                  {reason.trim()}
                </Text>
              </View>
            ) : null}
            <View
              style={{
                marginTop: RFValue(12),
                backgroundColor: "#FEF3C7",
                borderRadius: RFValue(10),
                paddingVertical: RFValue(8),
                paddingHorizontal: RFValue(10),
              }}
            >
              <Text
                style={{
                  fontSize: RFValue(12),
                  color: "#B45309",
                  fontWeight: "600",
                }}
              >
                Awaiting doctor approval. You will be notified once it is
                reviewed.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleDone}
            style={{
              width: "100%",
              backgroundColor: theme.accent,
              borderRadius: RFValue(14),
              paddingVertical: RFValue(16),
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#FFF",
                fontSize: RFValue(16),
                fontWeight: "700",
              }}
            >
              Done
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: RFValue(16),
          }}
        >
          <TouchableOpacity
            onPress={onBack}
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(10),
              backgroundColor: theme.bg,
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(14),
            }}
          >
            <Ionicons
              name="arrow-back"
              size={RFValue(20)}
              color={theme.textPrimary}
            />
          </TouchableOpacity>
          <View>
            <Text
              style={{
                fontSize: RFValue(18),
                fontWeight: "800",
                color: theme.textPrimary,
              }}
            >
              Book Appointment
            </Text>
            <Text style={{ fontSize: RFValue(12), color: theme.textSecondary }}>
              {activeDoctor.name} · {activeDoctor.specialty}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? RFValue(10) : 0}
      >
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{
            padding: RFValue(16),
            paddingBottom: Math.max(tabScrollBottomPadding(), RFValue(120)),
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(16),
              padding: RFValue(16),
              marginBottom: RFValue(16),
              flexDirection: "row",
              alignItems: "center",
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <View
              style={{
                width: RFValue(56),
                height: RFValue(56),
                borderRadius: RFValue(16),
                backgroundColor: theme.successLight,
                justifyContent: "center",
                alignItems: "center",
                marginRight: RFValue(14),
                overflow: "hidden",
              }}
            >
              {activeDoctor.avatarUrl ? (
                <Image
                  source={{ uri: activeDoctor.avatarUrl }}
                  style={{ width: RFValue(56), height: RFValue(56) }}
                />
              ) : (
                <Text
                  style={{
                    color: theme.success,
                    fontSize: RFValue(18),
                    fontWeight: "800",
                  }}
                >
                  {doctorDisplayInitials(activeDoctor.name)}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: RFValue(15),
                  fontWeight: "700",
                  color: theme.textPrimary,
                }}
              >
                {activeDoctor.name}
              </Text>
              <Text
                style={{ fontSize: RFValue(12), color: theme.textSecondary }}
              >
                {experienceLine} | {activeDoctor.rating} ★
              </Text>
            </View>
            <View
              style={{
                backgroundColor: theme.successLight,
                paddingHorizontal: RFValue(8),
                paddingVertical: RFValue(4),
                borderRadius: RFValue(8),
              }}
            >
              <Text
                style={{
                  color: theme.success,
                  fontSize: RFValue(10),
                  fontWeight: "700",
                }}
              >
                INR {activeDoctor.fee}
              </Text>
            </View>
          </View>

          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(16),
              padding: RFValue(16),
              marginBottom: RFValue(16),
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(15),
                fontWeight: "700",
                color: theme.textPrimary,
                marginBottom: RFValue(14),
              }}
            >
              Select Date
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {dates.map((dateOption, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => dateOption.available && setSelectedDate(index)}
                  style={{
                    width: RFValue(52),
                    height: RFValue(72),
                    borderRadius: RFValue(14),
                    backgroundColor:
                      selectedDate === index
                        ? theme.accent
                        : dateOption.available
                          ? theme.bg
                          : theme.cardBorder,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(8),
                    opacity: dateOption.available ? 1 : 0.5,
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(11),
                      color:
                        selectedDate === index
                          ? "rgba(255,255,255,0.85)"
                          : theme.textSecondary,
                      fontWeight: "600",
                    }}
                  >
                    {dateOption.day}
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(18),
                      fontWeight: "800",
                      color:
                        selectedDate === index ? "#FFF" : theme.textPrimary,
                      marginTop: RFValue(2),
                    }}
                  >
                    {dateOption.date}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(16),
              padding: RFValue(16),
              marginBottom: RFValue(16),
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(15),
                fontWeight: "700",
                color: theme.textPrimary,
                marginBottom: RFValue(14),
              }}
            >
              Available Time Slots
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {timeSlots.map((slot, index) => {
                const available = slot.available && !slotIsPast(slot.time);
                return (
                  <TouchableOpacity
                    key={index}
                    onPress={() => available && setSelectedSlot(slot.time)}
                    disabled={!available}
                    style={{
                      width: "31%",
                      paddingVertical: RFValue(10),
                      borderRadius: RFValue(10),
                      backgroundColor:
                        selectedSlot === slot.time
                          ? theme.accent
                          : available
                            ? theme.bg
                            : theme.cardBorder,
                      justifyContent: "center",
                      alignItems: "center",
                      marginBottom: RFValue(8),
                      marginRight: index % 3 === 2 ? 0 : "3.5%",
                      opacity: available ? 1 : 0.5,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        fontWeight: "600",
                        color:
                          selectedSlot === slot.time
                            ? "#FFF"
                            : theme.textPrimary,
                      }}
                    >
                      {slot.time}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(16),
              padding: RFValue(16),
              marginBottom: RFValue(16),
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(15),
                fontWeight: "700",
                color: theme.textPrimary,
                marginBottom: RFValue(14),
              }}
            >
              Consultation Type
            </Text>
            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                onPress={() => setConsultType("video")}
                style={{
                  flex: 1,
                  backgroundColor:
                    consultType === "video" ? theme.accentLight : theme.bg,
                  borderRadius: RFValue(12),
                  padding: RFValue(14),
                  alignItems: "center",
                  marginRight: RFValue(6),
                  borderWidth: 2,
                  borderColor:
                    consultType === "video" ? theme.accent : theme.cardBorder,
                }}
              >
                <Ionicons
                  name="videocam"
                  size={RFValue(24)}
                  color={
                    consultType === "video" ? theme.accent : theme.textTertiary
                  }
                  style={{ marginBottom: RFValue(6) }}
                />
                <Text
                  style={{
                    fontSize: RFValue(12),
                    fontWeight: "700",
                    color:
                      consultType === "video"
                        ? theme.accent
                        : theme.textTertiary,
                  }}
                >
                  Video
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setConsultType("audio")}
                style={{
                  flex: 1,
                  backgroundColor:
                    consultType === "audio" ? theme.accentLight : theme.bg,
                  borderRadius: RFValue(12),
                  padding: RFValue(14),
                  alignItems: "center",
                  marginHorizontal: RFValue(3),
                  borderWidth: 2,
                  borderColor:
                    consultType === "audio" ? theme.accent : theme.cardBorder,
                }}
              >
                <Ionicons
                  name="call"
                  size={RFValue(24)}
                  color={
                    consultType === "audio" ? theme.accent : theme.textTertiary
                  }
                  style={{ marginBottom: RFValue(6) }}
                />
                <Text
                  style={{
                    fontSize: RFValue(12),
                    fontWeight: "700",
                    color:
                      consultType === "audio"
                        ? theme.accent
                        : theme.textTertiary,
                  }}
                >
                  Audio
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setConsultType("chat")}
                style={{
                  flex: 1,
                  backgroundColor:
                    consultType === "chat" ? theme.accentLight : theme.bg,
                  borderRadius: RFValue(12),
                  padding: RFValue(14),
                  alignItems: "center",
                  marginLeft: RFValue(6),
                  borderWidth: 2,
                  borderColor:
                    consultType === "chat" ? theme.accent : theme.cardBorder,
                }}
              >
                <Ionicons
                  name="chatbubble"
                  size={RFValue(24)}
                  color={
                    consultType === "chat" ? theme.accent : theme.textTertiary
                  }
                  style={{ marginBottom: RFValue(6) }}
                />
                <Text
                  style={{
                    fontSize: RFValue(12),
                    fontWeight: "600",
                    color:
                      consultType === "chat"
                        ? theme.accent
                        : theme.textTertiary,
                  }}
                >
                  Chat
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(16),
              padding: RFValue(16),
              marginBottom: RFValue(16),
              shadowColor: theme.shadowColor,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(15),
                fontWeight: "700",
                color: theme.textPrimary,
                marginBottom: RFValue(6),
              }}
            >
              Reason for visit
            </Text>
            <Text
              style={{
                fontSize: RFValue(12),
                color: theme.textTertiary,
                marginBottom: RFValue(10),
              }}
            >
              The doctor will use this to review and approve your request.
            </Text>
            <TextInput
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                if (bookingError) setBookingError("");
              }}
              placeholder="e.g. Persistent cough for 5 days, mild fever, asking for an online review."
              placeholderTextColor={theme.textTertiary}
              multiline
              editable={!bookingLoading}
              style={{
                backgroundColor: theme.bg,
                borderRadius: RFValue(12),
                borderWidth: 1,
                borderColor: theme.cardBorder,
                paddingHorizontal: RFValue(14),
                paddingVertical: RFValue(12),
                minHeight: RFValue(88),
                textAlignVertical: "top",
                fontSize: RFValue(14),
                color: theme.textPrimary,
              }}
            />
          </View>

          {bookingError ? (
            <Text
              style={{
                color: theme.danger,
                fontWeight: "600",
                marginBottom: RFValue(12),
              }}
            >
              {bookingError}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={handleConfirmBooking}
            disabled={!selectedSlot || bookingLoading}
            style={{
              backgroundColor:
                selectedSlot && !bookingLoading
                  ? theme.accent
                  : theme.cardBorder,
              borderRadius: RFValue(14),
              paddingVertical: RFValue(16),
              alignItems: "center",
            }}
          >
            {bookingLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text
                style={{
                  color: selectedSlot ? "#FFF" : theme.textTertiary,
                  fontSize: RFValue(16),
                  fontWeight: "700",
                }}
              >
                {selectedSlot
                  ? `Book at ${selectedSlot}`
                  : "Select a Time Slot"}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const PatientDoctorBookingFlow = ({ onBack }) => {
  const { theme } = useTheme();
  const { fetchApprovedDoctors, patientProfile } = useAppData();
  const [step, setStep] = useState("browse");
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedConcern, setSelectedConcern] = useState(null);
  const [languageFilterText, setLanguageFilterText] = useState("");

  React.useEffect(() => {
    const from = String(
      patientProfile?.language ||
        patientProfile?.preferred_language ||
        patientProfile?.comfortable_language ||
        "",
    ).trim();
    setLanguageFilterText(from);
  }, [patientProfile?.id, patientProfile?.language]);

  const hasHealthFocus = !!(
    patientProfile?.primary_condition ||
    patientProfile?.condition ||
    ""
  ).trim();
  const [showAllDoctors, setShowAllDoctors] = useState(!hasHealthFocus);

  useEffect(() => {
    setShowAllDoctors(!hasHealthFocus);
  }, [hasHealthFocus]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError("");
        const list = await fetchApprovedDoctors();
        if (!cancelled) setDoctors(list);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error?.message || "Unable to load doctors");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchApprovedDoctors]);

  const categories = [
    "All",
    ...uniqueIds(
      doctors.map((doctorItem) => doctorItem.specialty).filter(Boolean),
    ),
  ];

  // Build the list of concern chips: predefined first, then any custom
  // concerns discovered in the loaded doctors that aren't in our default set.
  const concernChips = React.useMemo(() => {
    const seen = new Set(CONCERN_CHIP_OPTIONS.map((item) => item.id));
    const extras = [];
    doctors.forEach((doctorItem) => {
      (doctorItem.concerns || []).forEach((tag) => {
        if (!tag || seen.has(tag)) return;
        seen.add(tag);
        extras.push({
          id: tag,
          label: tag
            .split("_")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" "),
        });
      });
    });
    return [...CONCERN_CHIP_OPTIONS, ...extras];
  }, [doctors]);

  const comfortLanguageFilterToken =
    languageFilterText.trim() || COMFORT_LANGUAGE_ANY;

  const filteredDoctors = doctors.filter((doctorItem) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      doctorItem.name.toLowerCase().includes(query) ||
      doctorItem.specialty.toLowerCase().includes(query);
    const matchesCategory =
      category === "All" || doctorItem.specialty === category;
    const matchesHealthFocus =
      showAllDoctors ||
      doctorMatchesPatientHealthFocus(doctorItem, patientProfile);
    const matchesConcern =
      !selectedConcern || doctorMatchesConcern(doctorItem, selectedConcern);
    const matchesComfortLanguage = doctorMatchesComfortLanguage(
      doctorItem,
      comfortLanguageFilterToken,
    );
    return (
      matchesSearch &&
      matchesCategory &&
      matchesHealthFocus &&
      matchesConcern &&
      matchesComfortLanguage
    );
  });

  if (step === "book") {
    return (
      <AppointmentBookingScreen
        doctor={selectedDoctor}
        demoMode={!selectedDoctor}
        onBack={() => setStep(selectedDoctor ? "profile" : "browse")}
        onBookingComplete={onBack}
      />
    );
  }

  if (step === "profile" && selectedDoctor) {
    const doctorItem = selectedDoctor;
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.bg }}
        edges={["left", "right"]}
      >
        <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
        <View style={{ flex: 1, minHeight: 0 }}>
          <View
            style={{
              backgroundColor: theme.card,
              padding: RFValue(20),
              borderBottomWidth: 1,
              borderBottomColor: theme.cardBorder,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <TouchableOpacity
              onPress={() => setStep("browse")}
              style={{
                width: RFValue(36),
                height: RFValue(36),
                borderRadius: RFValue(10),
                backgroundColor: theme.bg,
                justifyContent: "center",
                alignItems: "center",
                marginRight: RFValue(14),
              }}
            >
              <Ionicons
                name="arrow-back"
                size={RFValue(20)}
                color={theme.textPrimary}
              />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: RFValue(18),
                fontWeight: "800",
                color: theme.textPrimary,
              }}
            >
              Doctor profile
            </Text>
          </View>
          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{
              padding: RFValue(16),
              paddingBottom: RFValue(12),
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                backgroundColor: theme.card,
                borderRadius: RFValue(20),
                padding: RFValue(20),
                alignItems: "center",
                marginBottom: RFValue(16),
                shadowColor: theme.shadowColor,
                shadowOpacity: 0.06,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              <View
                style={{
                  width: RFValue(88),
                  height: RFValue(88),
                  borderRadius: RFValue(24),
                  backgroundColor: theme.accentLight,
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: RFValue(12),
                  overflow: "hidden",
                }}
              >
                {doctorItem.avatarUrl ? (
                  <Image
                    source={{ uri: doctorItem.avatarUrl }}
                    style={{ width: RFValue(88), height: RFValue(88) }}
                  />
                ) : (
                  <Text
                    style={{
                      fontSize: RFValue(28),
                      fontWeight: "800",
                      color: theme.accent,
                    }}
                  >
                    {doctorDisplayInitials(doctorItem.name)}
                  </Text>
                )}
              </View>
              <Text
                style={{
                  fontSize: RFValue(20),
                  fontWeight: "800",
                  color: theme.textPrimary,
                }}
              >
                {doctorItem.name}
              </Text>
              <Text
                style={{
                  fontSize: RFValue(14),
                  color: theme.textSecondary,
                  marginTop: RFValue(4),
                }}
              >
                {doctorItem.specialty}
              </Text>
              {(doctorItem.languages || []).length > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: RFValue(8),
                    paddingHorizontal: RFValue(8),
                  }}
                >
                  <Ionicons
                    name="chatbubbles-outline"
                    size={RFValue(14)}
                    color={theme.textTertiary}
                  />
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: theme.textTertiary,
                      marginLeft: RFValue(6),
                      flexShrink: 1,
                      textAlign: "center",
                    }}
                  >
                    {(doctorItem.languages || []).join(" · ")}
                  </Text>
                </View>
              ) : null}
              {doctorItem.clinicOrHospital ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: RFValue(6),
                    paddingHorizontal: RFValue(8),
                  }}
                >
                  <Ionicons
                    name="business-outline"
                    size={RFValue(14)}
                    color={theme.textTertiary}
                  />
                  <Text
                    style={{
                      fontSize: RFValue(13),
                      color: theme.textTertiary,
                      marginLeft: RFValue(6),
                      flexShrink: 1,
                      textAlign: "center",
                    }}
                  >
                    {doctorItem.clinicOrHospital}
                  </Text>
                </View>
              ) : null}
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: theme.textTertiary,
                  marginTop: RFValue(8),
                }}
              >
                {doctorItem.experience != null
                  ? `${doctorItem.experience}+ yrs`
                  : "Clinician"}{" "}
                · {doctorItem.rating} ★ · INR {doctorItem.fee}
              </Text>
              {doctorItem.bio ? (
                <Text
                  style={{
                    marginTop: RFValue(16),
                    fontSize: RFValue(14),
                    color: theme.textSecondary,
                    lineHeight: RFValue(22),
                    textAlign: "center",
                  }}
                >
                  {doctorItem.bio}
                </Text>
              ) : null}
              {!doctorItem.packagesSetupComplete ? (
                <Text
                  style={{
                    marginTop: RFValue(12),
                    fontSize: RFValue(12),
                    color: theme.textTertiary,
                    textAlign: "center",
                    lineHeight: RFValue(18),
                  }}
                >
                  This doctor is still completing their three care packages in
                  the app. You can book a general appointment; package offers
                  will appear once their catalogue is published.
                </Text>
              ) : null}
              {doctorItem.packagesSetupComplete &&
              Array.isArray(doctorItem.packageSlots) &&
              doctorItem.packageSlots.length >= 3 ? (
                <View
                  style={{
                    marginTop: RFValue(18),
                    alignSelf: "stretch",
                    width: "100%",
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      fontWeight: "800",
                      color: theme.textPrimary,
                      marginBottom: RFValue(10),
                    }}
                  >
                    Care packages
                  </Text>
                  {doctorItem.packageSlots.map((pkg) => (
                    <View
                      key={pkg.slot}
                      style={{
                        backgroundColor: theme.bg,
                        borderRadius: RFValue(14),
                        padding: RFValue(12),
                        marginBottom: RFValue(10),
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: theme.cardBorder,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: RFValue(15),
                          fontWeight: "800",
                          color: theme.textPrimary,
                        }}
                      >
                        {pkg.name || `Package ${pkg.slot}`}
                      </Text>
                      <Text
                        style={{
                          fontSize: RFValue(12),
                          color: theme.textSecondary,
                          marginTop: 4,
                        }}
                      >
                        ₹{pkg.total_amount_inr} · {pkg.total_period} ·{" "}
                        {pkg.treatment_type}
                      </Text>
                      {pkg.description ? (
                        <Text
                          style={{
                            fontSize: RFValue(12),
                            color: theme.textTertiary,
                            marginTop: 6,
                            lineHeight: RFValue(18),
                          }}
                        >
                          {pkg.description}
                        </Text>
                      ) : null}
                      {Array.isArray(pkg.features) &&
                      pkg.features.length > 0 ? (
                        <View style={{ marginTop: 8 }}>
                          {pkg.features.map((f, fi) => (
                            <Text
                              key={`${pkg.slot}-${fi}`}
                              style={{
                                fontSize: RFValue(11),
                                color: theme.textTertiary,
                                marginBottom: 3,
                              }}
                            >
                              • {f}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
              {(doctorItem.concerns || []).length > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    marginTop: RFValue(14),
                  }}
                >
                  {doctorItem.concerns.map((tag) => (
                    <View
                      key={tag}
                      style={{
                        backgroundColor: theme.accentLight,
                        borderRadius: RFValue(10),
                        paddingHorizontal: RFValue(10),
                        paddingVertical: RFValue(5),
                        marginRight: RFValue(6),
                        marginBottom: RFValue(6),
                      }}
                    >
                      <Text
                        style={{
                          color: theme.accent,
                          fontSize: RFValue(11),
                          fontWeight: "700",
                        }}
                      >
                        {tag.replace(/_/g, " ")}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </ScrollView>
          <View
            style={{
              paddingHorizontal: RFValue(16),
              paddingTop: RFValue(10),
              paddingBottom: RFValue(10),
              backgroundColor: theme.card,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.cardBorder,
            }}
          >
            <TouchableOpacity
              onPress={() => setStep("book")}
              style={{
                backgroundColor: theme.accent,
                borderRadius: RFValue(14),
                paddingVertical: RFValue(16),
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#FFF",
                  fontWeight: "700",
                  fontSize: RFValue(16),
                }}
              >
                Book appointment
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={onBack}
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(10),
              backgroundColor: theme.bg,
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(14),
            }}
          >
            <Ionicons
              name="arrow-back"
              size={RFValue(20)}
              color={theme.textPrimary}
            />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: RFValue(18),
                fontWeight: "800",
                color: theme.textPrimary,
              }}
            >
              Find a doctor
            </Text>
            <Text style={{ fontSize: RFValue(12), color: theme.textSecondary }}>
              Search by name or specialty
            </Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.bg,
            borderRadius: RFValue(12),
            paddingHorizontal: RFValue(14),
            marginTop: RFValue(14),
            borderWidth: 1,
            borderColor: theme.cardBorder,
          }}
        >
          <Ionicons
            name="search"
            size={RFValue(18)}
            color={theme.textTertiary}
            style={{ marginRight: RFValue(8) }}
          />
          <TextInput
            placeholder="Search doctors..."
            placeholderTextColor={theme.textTertiary}
            style={{
              flex: 1,
              paddingVertical: RFValue(10),
              fontSize: RFValue(14),
              color: theme.textPrimary,
            }}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        {hasHealthFocus ? (
          <View
            style={{
              marginTop: RFValue(10),
              padding: RFValue(12),
              borderRadius: RFValue(12),
              backgroundColor: theme.accentLight,
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(12),
                color: theme.textSecondary,
                marginBottom: RFValue(6),
              }}
            >
              Matched to your profile:{" "}
              <Text style={{ fontWeight: "700", color: theme.textPrimary }}>
                {(
                  patientProfile?.primary_condition ||
                  patientProfile?.condition ||
                  ""
                ).trim()}
              </Text>
            </Text>
            <TouchableOpacity
              onPress={() => setShowAllDoctors(!showAllDoctors)}
            >
              <Text
                style={{
                  fontSize: RFValue(13),
                  fontWeight: "700",
                  color: theme.accent,
                }}
              >
                {showAllDoctors
                  ? "Show recommended doctors only"
                  : "Show all doctors"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={{ marginTop: RFValue(12) }}>
          <Text
            style={{
              fontSize: RFValue(12),
              fontWeight: "700",
              color: theme.textSecondary,
              marginBottom: RFValue(6),
            }}
          >
            Search by health concern
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: RFValue(8) }}
          >
            {concernChips.map((chip) => {
              const active = selectedConcern === chip.id;
              return (
                <TouchableOpacity
                  key={chip.id}
                  onPress={() => setSelectedConcern(active ? null : chip.id)}
                  style={{
                    paddingHorizontal: RFValue(12),
                    paddingVertical: RFValue(7),
                    borderRadius: RFValue(16),
                    backgroundColor: active ? theme.accent : theme.accentLight,
                    marginRight: RFValue(8),
                    borderWidth: 1,
                    borderColor: active ? theme.accent : theme.cardBorder,
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      fontWeight: "700",
                      color: active ? "#FFF" : theme.accent,
                    }}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: RFValue(10) }}
        >
          {categories.map((categoryOption) => {
            const active = category === categoryOption;
            return (
              <TouchableOpacity
                key={categoryOption}
                onPress={() => setCategory(categoryOption)}
                style={{
                  paddingHorizontal: RFValue(14),
                  paddingVertical: RFValue(8),
                  borderRadius: RFValue(20),
                  backgroundColor: active ? theme.accent : theme.bg,
                  marginRight: RFValue(8),
                  borderWidth: 1,
                  borderColor: active ? theme.accent : theme.cardBorder,
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(12),
                    fontWeight: "700",
                    color: active ? "#FFF" : theme.textSecondary,
                  }}
                >
                  {categoryOption}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={{ marginTop: RFValue(12) }}>
          <Text
            style={{
              fontSize: RFValue(12),
              fontWeight: "700",
              color: theme.textSecondary,
              marginBottom: RFValue(6),
            }}
          >
            Comfortable language
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <TouchableOpacity
              onPress={() => setLanguageFilterText("")}
              style={{
                paddingHorizontal: RFValue(12),
                paddingVertical: RFValue(9),
                borderRadius: RFValue(16),
                backgroundColor: !languageFilterText.trim()
                  ? theme.accent
                  : theme.accentLight,
                marginRight: RFValue(8),
                borderWidth: 1,
                borderColor: !languageFilterText.trim()
                  ? theme.accent
                  : theme.cardBorder,
              }}
            >
              <Text
                style={{
                  fontSize: RFValue(12),
                  fontWeight: "700",
                  color: !languageFilterText.trim() ? "#FFF" : theme.accent,
                }}
              >
                Any language
              </Text>
            </TouchableOpacity>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: theme.bg,
                borderRadius: RFValue(12),
                paddingHorizontal: RFValue(12),
                borderWidth: 1,
                borderColor: theme.cardBorder,
                minWidth: 0,
              }}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={RFValue(16)}
                color={theme.textTertiary}
                style={{ marginRight: RFValue(6) }}
              />
              <TextInput
                placeholder="Type language, e.g. Hindi, Tamil"
                placeholderTextColor={theme.textTertiary}
                style={{
                  flex: 1,
                  minWidth: 0,
                  paddingVertical: RFValue(9),
                  fontSize: RFValue(13),
                  color: theme.textPrimary,
                }}
                value={languageFilterText}
                onChangeText={setLanguageFilterText}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        {loading ? (
          <View style={{ paddingVertical: RFValue(40), alignItems: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : loadError ? (
          <View>
            <Text style={{ color: theme.danger, fontWeight: "600" }}>
              {loadError}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setSelectedDoctor(null);
                setStep("book");
              }}
              style={{ marginTop: RFValue(16) }}
            >
              <Text
                style={{
                  fontSize: RFValue(14),
                  fontWeight: "700",
                  color: theme.accent,
                }}
              >
                Continue with general booking
              </Text>
            </TouchableOpacity>
          </View>
        ) : filteredDoctors.length === 0 ? (
          <View style={{ alignItems: "center", marginTop: RFValue(40) }}>
            <Ionicons
              name="medical-outline"
              size={RFValue(48)}
              color={theme.cardBorder}
            />
            <Text
              style={{
                color: theme.textTertiary,
                marginTop: RFValue(12),
                textAlign: "center",
              }}
            >
              {languageFilterText.trim()
                ? "No doctors list that language yet. Clear the language field, try different spelling, or relax other filters."
                : selectedConcern
                  ? "No doctors match this health concern yet. Try another chip or clear the filter."
                  : hasHealthFocus && !showAllDoctors
                    ? "No doctors matched your health profile yet. Try showing all doctors or adjust search."
                    : "No doctors match your filters. Try another specialty or clear search."}
            </Text>
            {languageFilterText.trim() ? (
              <TouchableOpacity
                onPress={() => setLanguageFilterText("")}
                style={{ marginTop: RFValue(12) }}
              >
                <Text
                  style={{
                    fontSize: RFValue(14),
                    fontWeight: "700",
                    color: theme.accent,
                  }}
                >
                  Clear language filter
                </Text>
              </TouchableOpacity>
            ) : null}
            {selectedConcern ? (
              <TouchableOpacity
                onPress={() => setSelectedConcern(null)}
                style={{ marginTop: RFValue(12) }}
              >
                <Text
                  style={{
                    fontSize: RFValue(14),
                    fontWeight: "700",
                    color: theme.accent,
                  }}
                >
                  Clear health concern
                </Text>
              </TouchableOpacity>
            ) : null}
            {hasHealthFocus && !showAllDoctors ? (
              <TouchableOpacity
                onPress={() => setShowAllDoctors(true)}
                style={{ marginTop: RFValue(16) }}
              >
                <Text
                  style={{
                    fontSize: RFValue(14),
                    fontWeight: "700",
                    color: theme.accent,
                  }}
                >
                  Show all doctors
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => {
                setSelectedDoctor(null);
                setStep("book");
              }}
              style={{ marginTop: RFValue(16) }}
            >
              <Text
                style={{
                  fontSize: RFValue(14),
                  fontWeight: "700",
                  color: theme.accent,
                }}
              >
                Continue with general booking
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredDoctors.map((doctorItem) => (
            <TouchableOpacity
              key={doctorItem.profileId || doctorItem.userId}
              onPress={() => {
                setSelectedDoctor(doctorItem);
                setStep("profile");
              }}
              style={{
                backgroundColor: theme.card,
                borderRadius: RFValue(16),
                padding: RFValue(16),
                marginBottom: RFValue(12),
                flexDirection: "row",
                alignItems: "center",
                shadowColor: theme.shadowColor,
                shadowOpacity: 0.06,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              <View
                style={{
                  width: RFValue(52),
                  height: RFValue(52),
                  borderRadius: RFValue(14),
                  backgroundColor: theme.accentLight,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(12),
                  overflow: "hidden",
                }}
              >
                {doctorItem.avatarUrl ? (
                  <Image
                    source={{ uri: doctorItem.avatarUrl }}
                    style={{ width: RFValue(52), height: RFValue(52) }}
                  />
                ) : (
                  <Text
                    style={{
                      fontWeight: "800",
                      color: theme.accent,
                      fontSize: RFValue(14),
                    }}
                  >
                    {doctorDisplayInitials(doctorItem.name)}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: RFValue(15),
                    fontWeight: "700",
                    color: theme.textPrimary,
                  }}
                >
                  {doctorItem.name}
                </Text>
                <Text
                  style={{ fontSize: RFValue(12), color: theme.textSecondary }}
                >
                  {doctorItem.specialty} · {doctorItem.rating} ★
                </Text>
                {doctorItem.clinicOrHospital ? (
                  <Text
                    style={{ fontSize: RFValue(11), color: theme.textTertiary }}
                    numberOfLines={1}
                  >
                    {doctorItem.clinicOrHospital}
                  </Text>
                ) : null}
                <Text
                  style={{ fontSize: RFValue(11), color: theme.textTertiary }}
                >
                  INR {doctorItem.fee} consult
                </Text>
                {(doctorItem.languages || []).length > 0 ? (
                  <Text
                    style={{
                      fontSize: RFValue(10),
                      color: theme.textTertiary,
                      marginTop: RFValue(4),
                    }}
                    numberOfLines={1}
                  >
                    Speaks:{" "}
                    {(doctorItem.languages || []).slice(0, 3).join(", ")}
                    {(doctorItem.languages || []).length > 3
                      ? ` +${(doctorItem.languages || []).length - 3}`
                      : ""}
                  </Text>
                ) : null}
                {(doctorItem.concerns || []).length > 0 ? (
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      marginTop: RFValue(6),
                    }}
                  >
                    {doctorItem.concerns.slice(0, 3).map((tag) => (
                      <View
                        key={tag}
                        style={{
                          backgroundColor: theme.accentLight,
                          borderRadius: RFValue(8),
                          paddingHorizontal: RFValue(8),
                          paddingVertical: RFValue(3),
                          marginRight: RFValue(6),
                          marginTop: RFValue(4),
                        }}
                      >
                        <Text
                          style={{
                            color: theme.accent,
                            fontSize: RFValue(10),
                            fontWeight: "700",
                          }}
                        >
                          {tag.replace(/_/g, " ")}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
              <Ionicons
                name="chevron-forward"
                size={RFValue(20)}
                color={theme.textTertiary}
              />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const PrescriptionScreen = ({ onBack, highlightPrescriptionId = null }) => {
  const {
    prescriptions: prescriptionRecords,
    wounds: woundRecords,
    runSideEffectCheck,
    patientProfile,
  } = useAppData();
  const scrollRef = React.useRef(null);
  const cardOffsetsRef = React.useRef({});
  const [rxSideWarnings, setRxSideWarnings] = useState({});
  const [rxSideLoading, setRxSideLoading] = useState(false);

  const cards = React.useMemo(() => {
    const list = [...(prescriptionRecords || [])].sort(
      (left, right) =>
        new Date(right.raw?.created || 0).getTime() -
        new Date(left.raw?.created || 0).getTime(),
    );
    const woundLookup = new Map();
    (woundRecords || []).forEach((woundItem) => {
      if (woundItem?.id) woundLookup.set(woundItem.id, woundItem);
    });
    return list.map((record) => {
      const lines =
        record.itemsList?.length > 0
          ? record.itemsList
          : [
              {
                name: record.items || "Prescription",
                dosage: "",
                whenToTake: "",
                duration: "",
              },
            ];
      const linkedWound = record.wound ? woundLookup.get(record.wound) : null;
      return {
        id: record.id,
        doctor: record.doctorName || "Doctor",
        date: record.date || formatDateValue(record.raw?.created),
        diagnosis: record.diagnosis,
        woundId: record.wound || null,
        woundDescription:
          linkedWound?.description ||
          linkedWound?.title ||
          (record.wound ? `Wound #${record.wound.slice(-4)}` : ""),
        medicines: lines.map((medicine) => ({
          name: medicine.name,
          dosage: medicine.dosage || "-",
          whenToTake: medicine.whenToTake || "-",
          duration: medicine.duration || "-",
        })),
      };
    });
  }, [prescriptionRecords, woundRecords]);

  // Step 9 - Same AI side-effect check as PrescriptionModal, debounced per load.
  React.useEffect(() => {
    let cancelled = false;
    if (!runSideEffectCheck || !cards.length) {
      setRxSideWarnings({});
      setRxSideLoading(false);
      return undefined;
    }
    setRxSideLoading(true);
    const timer = setTimeout(async () => {
      const next = {};
      await Promise.all(
        cards.map(async (rx) => {
          const items = rx.medicines
            .map((m) => ({ name: String(m.name || "").trim() }))
            .filter((item) => item.name);
          if (!items.length) {
            next[rx.id] = [];
            return;
          }
          try {
            const w = await runSideEffectCheck({
              items,
              patient: patientProfile || {},
            });
            next[rx.id] = Array.isArray(w) ? w : [];
          } catch {
            next[rx.id] = [];
          }
        }),
      );
      if (!cancelled) {
        setRxSideWarnings(next);
        setRxSideLoading(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cards, patientProfile, runSideEffectCheck]);

  // Jump to the highlighted prescription when arriving via deep-link from the
  // wound detail screen or a chat prescription reference.
  React.useEffect(() => {
    if (!highlightPrescriptionId) return;
    const offset = cardOffsetsRef.current[highlightPrescriptionId];
    if (scrollRef.current && typeof offset === "number") {
      const timer = setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, offset - 8),
          animated: true,
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [highlightPrescriptionId, cards]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          paddingTop: safeHeaderPaddingTop(),
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: RFValue(16),
          }}
        >
          <TouchableOpacity
            onPress={onBack}
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(10),
              backgroundColor: "#F3F4F6",
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(14),
            }}
          >
            <Ionicons name="arrow-back" size={RFValue(20)} color="#374151" />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: RFValue(18),
              fontWeight: "800",
              color: "#1E1B4B",
            }}
          >
            Prescriptions
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        {cards.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: RFValue(40) }}>
            <Ionicons
              name="document-text-outline"
              size={RFValue(48)}
              color="#D1D5DB"
            />
            <Text
              style={{
                marginTop: RFValue(12),
                fontSize: RFValue(14),
                color: "#6B7280",
                textAlign: "center",
              }}
            >
              No prescriptions yet. When your doctor sends one, it will appear
              here.
            </Text>
          </View>
        ) : (
          cards.map((rx) => (
            <View
              key={rx.id}
              onLayout={(event) => {
                const y = event?.nativeEvent?.layout?.y;
                if (typeof y === "number") {
                  cardOffsetsRef.current[rx.id] = y;
                }
              }}
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: RFValue(18),
                marginBottom: RFValue(16),
                shadowColor: "#000",
                shadowOpacity: 0.06,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 12,
                elevation: 3,
                overflow: "hidden",
                borderWidth: highlightPrescriptionId === rx.id ? 2 : 0,
                borderColor:
                  highlightPrescriptionId === rx.id ? "#4338CA" : "transparent",
              }}
            >
              <View
                style={{
                  backgroundColor: "#4338CA",
                  padding: RFValue(16),
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: RFValue(36),
                      height: RFValue(36),
                      borderRadius: RFValue(10),
                      backgroundColor: "rgba(255,255,255,0.2)",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: RFValue(10),
                    }}
                  >
                    <Ionicons name="medical" size={RFValue(18)} color="#FFF" />
                  </View>
                  <View>
                    <Text
                      style={{
                        color: "#FFF",
                        fontSize: RFValue(14),
                        fontWeight: "700",
                      }}
                    >
                      {rx.doctor}
                    </Text>
                    <Text style={{ color: "#C7D2FE", fontSize: RFValue(11) }}>
                      {rx.date}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    backgroundColor: "rgba(255,255,255,0.2)",
                    paddingHorizontal: RFValue(10),
                    paddingVertical: RFValue(4),
                    borderRadius: RFValue(8),
                  }}
                >
                  <Text
                    style={{
                      color: "#FFF",
                      fontSize: RFValue(10),
                      fontWeight: "700",
                    }}
                  >
                    Rx #{rx.id}
                  </Text>
                </View>
              </View>

              {rx.woundId ? (
                <View
                  style={{
                    paddingHorizontal: RFValue(16),
                    paddingVertical: RFValue(10),
                    backgroundColor: "#EEF2FF",
                    borderBottomWidth: 1,
                    borderBottomColor: "#E0E7FF",
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(11),
                      fontWeight: "700",
                      color: "#3730A3",
                      marginBottom: 2,
                    }}
                  >
                    Related wound
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(13),
                      fontWeight: "600",
                      color: "#1E1B4B",
                    }}
                    numberOfLines={2}
                  >
                    {rx.woundDescription || "Linked wound case"}
                  </Text>
                </View>
              ) : null}

              {rx.diagnosis ? (
                <View
                  style={{
                    paddingHorizontal: RFValue(16),
                    paddingVertical: RFValue(12),
                    backgroundColor: "#F5F3FF",
                    borderBottomWidth: 1,
                    borderBottomColor: "#E9D5FF",
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(11),
                      fontWeight: "700",
                      color: "#6D28D9",
                      marginBottom: 4,
                    }}
                  >
                    Condition / diagnosis
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      fontWeight: "700",
                      color: "#1E1B4B",
                    }}
                  >
                    {rx.diagnosis}
                  </Text>
                </View>
              ) : null}

              {rxSideLoading ? (
                <View
                  style={{
                    paddingHorizontal: RFValue(16),
                    paddingVertical: RFValue(10),
                  }}
                >
                  <Text style={{ fontSize: RFValue(11), color: "#6B7280" }}>
                    Checking prescriptions for interactions with your profile…
                  </Text>
                </View>
              ) : (rxSideWarnings[rx.id] || []).length > 0 ? (
                <View
                  style={{
                    marginHorizontal: RFValue(16),
                    marginBottom: RFValue(10),
                    padding: RFValue(12),
                    borderRadius: RFValue(12),
                    backgroundColor: "#FEF3C7",
                    borderWidth: 1,
                    borderColor: "#F59E0B",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: RFValue(6),
                    }}
                  >
                    <Ionicons name="alert-circle" size={18} color="#B45309" />
                    <Text
                      style={{
                        marginLeft: 6,
                        fontWeight: "800",
                        color: "#B45309",
                        fontSize: RFValue(12),
                      }}
                    >
                      AI side-effect check (
                      {(rxSideWarnings[rx.id] || []).length})
                    </Text>
                  </View>
                  {(rxSideWarnings[rx.id] || []).map((w, widx) => (
                    <Text
                      key={`${rx.id}-warn-${widx}`}
                      style={{
                        fontSize: RFValue(11),
                        color: "#92400E",
                        marginBottom: 4,
                      }}
                    >
                      • {w.medicine}: {w.message}
                    </Text>
                  ))}
                  <Text
                    style={{
                      fontSize: RFValue(10),
                      color: "#92400E",
                      marginTop: 4,
                    }}
                  >
                    Ask your doctor or pharmacist if you have questions.
                  </Text>
                </View>
              ) : null}

              {rx.medicines.map((med, idx) => (
                <View
                  key={`${rx.id}-${idx}`}
                  style={{
                    padding: RFValue(16),
                    borderBottomWidth: idx < rx.medicines.length - 1 ? 1 : 0,
                    borderBottomColor: "#F3F4F6",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: RFValue(8),
                    }}
                  >
                    <Text
                      style={{
                        fontSize: RFValue(14),
                        fontWeight: "700",
                        color: "#1E1B4B",
                        flex: 1,
                        marginRight: RFValue(8),
                      }}
                    >
                      {med.name}
                    </Text>
                    <View
                      style={{
                        backgroundColor: "#EEF2FF",
                        paddingHorizontal: RFValue(8),
                        paddingVertical: RFValue(4),
                        borderRadius: RFValue(8),
                        maxWidth: "45%",
                      }}
                    >
                      <Text
                        style={{
                          color: "#4338CA",
                          fontSize: RFValue(10),
                          fontWeight: "700",
                        }}
                        numberOfLines={3}
                      >
                        {med.dosage}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: "#6B7280",
                      marginBottom: RFValue(4),
                    }}
                  >
                    When to take: {med.whenToTake}
                  </Text>
                  <Text style={{ fontSize: RFValue(12), color: "#6B7280" }}>
                    How long: {med.duration}
                  </Text>
                </View>
              ))}

              <View
                style={{
                  padding: RFValue(12),
                  flexDirection: "row",
                  borderTopWidth: 1,
                  borderTopColor: "#F3F4F6",
                }}
              >
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    paddingVertical: RFValue(10),
                    backgroundColor: "#ECFDF5",
                    borderRadius: RFValue(10),
                    marginRight: RFValue(8),
                  }}
                >
                  <Ionicons
                    name="download-outline"
                    size={RFValue(16)}
                    color="#059669"
                    style={{ marginRight: RFValue(6) }}
                  />
                  <Text
                    style={{
                      color: "#059669",
                      fontSize: RFValue(12),
                      fontWeight: "700",
                    }}
                  >
                    Download
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    paddingVertical: RFValue(10),
                    backgroundColor: "#EEF2FF",
                    borderRadius: RFValue(10),
                    marginLeft: RFValue(8),
                  }}
                >
                  <Ionicons
                    name="cart-outline"
                    size={RFValue(16)}
                    color="#4338CA"
                    style={{ marginRight: RFValue(6) }}
                  />
                  <Text
                    style={{
                      color: "#4338CA",
                      fontSize: RFValue(12),
                      fontWeight: "700",
                    }}
                  >
                    Order Meds
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ========================================
// HOSPITAL DIRECTORY (Launch v1.0 - Step 4)
// ========================================

const HospitalCard = ({ theme, hospital, onCall }) => {
  const firstLetter = String(hospital.name || "H")
    .trim()
    .charAt(0)
    .toUpperCase();
  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderRadius: RFValue(16),
        padding: RFValue(14),
        marginBottom: RFValue(12),
        shadowColor: theme.shadowColor,
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 1,
        borderColor: theme.cardBorder,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        {hospital.imageUrl ? (
          <Image
            source={{ uri: hospital.imageUrl }}
            style={{
              width: RFValue(56),
              height: RFValue(56),
              borderRadius: RFValue(12),
              marginRight: RFValue(12),
              backgroundColor: theme.bg,
            }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: RFValue(56),
              height: RFValue(56),
              borderRadius: RFValue(12),
              marginRight: RFValue(12),
              backgroundColor: theme.dangerLight,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: RFValue(20),
                fontWeight: "800",
                color: theme.danger,
              }}
            >
              {firstLetter}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: RFValue(15),
              fontWeight: "800",
              color: theme.textPrimary,
            }}
            numberOfLines={2}
          >
            {hospital.name}
          </Text>
          {hospital.address ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <Ionicons
                name="location-outline"
                size={RFValue(12)}
                color={theme.textTertiary}
              />
              <Text
                style={{
                  fontSize: RFValue(12),
                  color: theme.textSecondary,
                  marginLeft: 4,
                  flex: 1,
                }}
                numberOfLines={2}
              >
                {hospital.address}
              </Text>
            </View>
          ) : null}
          {hospital.district || hospital.state ? (
            <Text
              style={{
                fontSize: RFValue(11),
                color: theme.textTertiary,
                marginTop: 2,
              }}
            >
              {[hospital.district, hospital.state].filter(Boolean).join(", ")}
            </Text>
          ) : null}
          {hospital.specialties?.length ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginTop: RFValue(6),
              }}
            >
              {hospital.specialties.slice(0, 4).map((tag, idx) => (
                <View
                  key={`${hospital.id}-sp-${idx}`}
                  style={{
                    backgroundColor: theme.accentLight,
                    paddingHorizontal: RFValue(8),
                    paddingVertical: 2,
                    borderRadius: RFValue(10),
                    marginRight: 4,
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(10),
                      color: theme.accent,
                      fontWeight: "700",
                    }}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {hospital.phone ? (
          <TouchableOpacity
            onPress={() => onCall?.(hospital)}
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(18),
              backgroundColor: theme.accentLight,
              justifyContent: "center",
              alignItems: "center",
              marginLeft: RFValue(8),
            }}
          >
            <Ionicons name="call" size={RFValue(16)} color={theme.accent} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const HospitalDirectoryScreen = ({ onBack }) => {
  const { theme } = useTheme();
  const { hospitals, hospitalsLoading, fetchHospitals, patientProfile } =
    useAppData();
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all"); // all | district | state
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void fetchHospitals();
  }, []);

  const patientDistrict = String(patientProfile?.district || "")
    .trim()
    .toLowerCase();
  const patientState = String(patientProfile?.state || "")
    .trim()
    .toLowerCase();

  // Default to district-scoped filter when the patient has a district on
  // file. Falls back to state, then to "all".
  useEffect(() => {
    if (patientDistrict) setLocationFilter("district");
    else if (patientState) setLocationFilter("state");
    else setLocationFilter("all");
  }, [patientDistrict, patientState]);

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const filteredHospitals = useMemo(() => {
    return (hospitals || []).filter((h) => {
      if (locationFilter === "district" && patientDistrict) {
        if ((h.district || "").toLowerCase() !== patientDistrict) return false;
      } else if (locationFilter === "state" && patientState) {
        if ((h.state || "").toLowerCase() !== patientState) return false;
      }
      if (!trimmedQuery) return true;
      const haystack = [
        h.name,
        h.address,
        h.district,
        h.state,
        ...(h.specialties || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(trimmedQuery);
    });
  }, [hospitals, locationFilter, patientDistrict, patientState, trimmedQuery]);

  const handleCall = (hospital) => {
    const number = String(hospital.phone || "").trim();
    if (!number) return;
    const normalized = number.replace(/[^+\d]/g, "");
    Linking.openURL(`tel:${normalized}`).catch(() => {});
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchHospitals();
    } finally {
      setRefreshing(false);
    }
  };

  const chipFilters = [
    { id: "all", label: "All hospitals" },
    ...(patientDistrict
      ? [{ id: "district", label: `In ${patientProfile.district}` }]
      : []),
    ...(patientState
      ? [{ id: "state", label: `In ${patientProfile.state}` }]
      : []),
  ];

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.card} />
      <View
        style={{
          backgroundColor: theme.card,
          paddingHorizontal: RFValue(16),
          paddingVertical: RFValue(14),
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={{ marginRight: RFValue(10), padding: 4 }}
        >
          <Ionicons
            name="arrow-back"
            size={RFValue(22)}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: RFValue(18),
            fontWeight: "800",
            color: theme.textPrimary,
          }}
        >
          Nearby Hospitals
        </Text>
      </View>

      <View style={{ padding: RFValue(16) }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.card,
            borderRadius: RFValue(14),
            paddingHorizontal: RFValue(12),
            borderWidth: 1,
            borderColor: theme.cardBorder,
          }}
        >
          <Ionicons
            name="search"
            size={RFValue(16)}
            color={theme.textTertiary}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search hospitals, specialties, city..."
            placeholderTextColor={theme.textTertiary}
            style={{
              flex: 1,
              paddingVertical: RFValue(10),
              marginLeft: RFValue(8),
              color: theme.textPrimary,
              fontSize: RFValue(13),
            }}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons
                name="close-circle"
                size={RFValue(16)}
                color={theme.textTertiary}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {chipFilters.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: RFValue(10) }}
          >
            {chipFilters.map((chip) => {
              const active = locationFilter === chip.id;
              return (
                <TouchableOpacity
                  key={chip.id}
                  onPress={() => setLocationFilter(chip.id)}
                  style={{
                    paddingVertical: RFValue(6),
                    paddingHorizontal: RFValue(12),
                    borderRadius: RFValue(20),
                    backgroundColor: active ? theme.accent : theme.card,
                    borderWidth: 1,
                    borderColor: active ? theme.accent : theme.cardBorder,
                    marginRight: RFValue(8),
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      fontWeight: "700",
                      color: active ? "#FFF" : theme.textSecondary,
                    }}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: RFValue(16),
          paddingBottom: RFValue(60),
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.accent}
          />
        }
      >
        {hospitalsLoading && !hospitals.length ? (
          <View style={{ alignItems: "center", marginTop: RFValue(40) }}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text
              style={{
                marginTop: RFValue(8),
                color: theme.textSecondary,
                fontSize: RFValue(12),
              }}
            >
              Loading hospitals...
            </Text>
          </View>
        ) : filteredHospitals.length ? (
          filteredHospitals.map((hospital) => (
            <HospitalCard
              key={hospital.id}
              theme={theme}
              hospital={hospital}
              onCall={handleCall}
            />
          ))
        ) : (
          <View style={{ alignItems: "center", paddingVertical: RFValue(40) }}>
            <Ionicons
              name="medical-outline"
              size={RFValue(48)}
              color={theme.cardBorder}
            />
            <Text
              style={{
                marginTop: RFValue(12),
                fontSize: RFValue(13),
                color: theme.textTertiary,
                textAlign: "center",
              }}
            >
              {hospitals.length === 0
                ? "No hospitals have been added yet."
                : "No hospitals match your filters."}
            </Text>
            {locationFilter !== "all" && hospitals.length > 0 ? (
              <TouchableOpacity
                onPress={() => setLocationFilter("all")}
                style={{
                  marginTop: RFValue(12),
                  paddingHorizontal: RFValue(16),
                  paddingVertical: RFValue(8),
                  backgroundColor: theme.accentLight,
                  borderRadius: RFValue(20),
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(12),
                    color: theme.accent,
                    fontWeight: "700",
                  }}
                >
                  Show all hospitals
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ========================================
// PHARMACY DIRECTORY (Launch v1.0 - Step 5)
// ========================================

const DAY_KEY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_KEY_LABEL = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const isPharmacyOpenToday = (pharmacy) => {
  const jsDay = new Date().getDay(); // 0 Sun..6 Sat
  const todayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][jsDay];
  if ((pharmacy.closingDays || []).includes(todayKey)) return false;
  if (!pharmacy.openingHours || !pharmacy.openingHours[todayKey]) return null;
  return true;
};

const PharmacyCard = ({ theme, pharmacy, onOpen }) => {
  const openState = isPharmacyOpenToday(pharmacy);
  return (
    <TouchableOpacity
      onPress={() => onOpen(pharmacy)}
      activeOpacity={0.85}
      style={{
        backgroundColor: theme.card,
        borderRadius: RFValue(16),
        padding: RFValue(14),
        marginBottom: RFValue(12),
        shadowColor: theme.shadowColor,
        shadowOpacity: 0.05,
        elevation: 2,
        borderWidth: 1,
        borderColor: theme.cardBorder,
        flexDirection: "row",
        alignItems: "flex-start",
      }}
    >
      <View
        style={{
          width: RFValue(52),
          height: RFValue(52),
          borderRadius: RFValue(14),
          backgroundColor: "#F3E8FF",
          justifyContent: "center",
          alignItems: "center",
          marginRight: RFValue(12),
        }}
      >
        <Ionicons name="leaf" size={RFValue(24)} color="#8B5CF6" />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: RFValue(15),
            fontWeight: "800",
            color: theme.textPrimary,
          }}
          numberOfLines={1}
        >
          {pharmacy.name}
        </Text>
        {pharmacy.address || pharmacy.district || pharmacy.state ? (
          <Text
            style={{
              fontSize: RFValue(12),
              color: theme.textSecondary,
              marginTop: 2,
            }}
            numberOfLines={2}
          >
            {[pharmacy.address, pharmacy.district, pharmacy.state]
              .filter(Boolean)
              .join(", ")}
          </Text>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: RFValue(6),
          }}
        >
          {openState === true ? (
            <View
              style={{
                backgroundColor: theme.successLight,
                paddingHorizontal: RFValue(8),
                paddingVertical: 2,
                borderRadius: RFValue(10),
              }}
            >
              <Text
                style={{
                  fontSize: RFValue(10),
                  color: theme.success,
                  fontWeight: "700",
                }}
              >
                Open today
              </Text>
            </View>
          ) : openState === false ? (
            <View
              style={{
                backgroundColor: theme.dangerLight,
                paddingHorizontal: RFValue(8),
                paddingVertical: 2,
                borderRadius: RFValue(10),
              }}
            >
              <Text
                style={{
                  fontSize: RFValue(10),
                  color: theme.danger,
                  fontWeight: "700",
                }}
              >
                Closed today
              </Text>
            </View>
          ) : null}
          {pharmacy.products?.length ? (
            <Text
              style={{
                fontSize: RFValue(11),
                color: theme.textTertiary,
                marginLeft: 8,
              }}
            >
              {pharmacy.products.length} product
              {pharmacy.products.length === 1 ? "" : "s"}
            </Text>
          ) : null}
        </View>
      </View>
      <Ionicons
        name="chevron-forward"
        size={RFValue(18)}
        color={theme.textTertiary}
      />
    </TouchableOpacity>
  );
};

// Step 6 - Patient-facing composer used to create a medicine order with a
// specific pharmacy. Lets the patient select items from the pharmacy's
// product catalog (with quantity) and optionally add custom items. The final
// payload is handled by `createPharmacyOrder` in App state.
const PatientOrderComposerModal = ({ pharmacy, onClose, onOrderPlaced }) => {
  const { theme } = useTheme();
  const { createPharmacyOrder } = useAppData();
  const products = pharmacy?.products || [];
  const [selections, setSelections] = useState({});
  const [customItems, setCustomItems] = useState([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const toggleProduct = (idx) => {
    setSelections((prev) => {
      if (prev[idx]) {
        const next = { ...prev };
        delete next[idx];
        return next;
      }
      return { ...prev, [idx]: { qty: "1", notes: "" } };
    });
  };

  const updateSelection = (idx, field, value) => {
    setSelections((prev) =>
      prev[idx] ? { ...prev, [idx]: { ...prev[idx], [field]: value } } : prev,
    );
  };

  const addCustomItem = () => {
    setCustomItems((prev) => [
      ...prev,
      {
        key: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: "",
        qty: "1",
        notes: "",
      },
    ]);
  };

  const updateCustomItem = (key, field, value) => {
    setCustomItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    );
  };

  const removeCustomItem = (key) => {
    setCustomItems((prev) => prev.filter((item) => item.key !== key));
  };

  const buildItems = () => {
    const picked = Object.entries(selections).map(([idx, config]) => {
      const product = products[Number(idx)] || {};
      return {
        name: String(product.name || "").trim(),
        qty: String(config?.qty || "").trim(),
        notes: [
          product.price ? `₹${String(product.price).replace(/^₹/, "")}` : "",
          config?.notes,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });
    const custom = customItems
      .map((item) => ({
        name: String(item.name || "").trim(),
        qty: String(item.qty || "").trim(),
        notes: String(item.notes || "").trim(),
      }))
      .filter((item) => item.name);
    return [...picked, ...custom];
  };

  const handleSubmit = async () => {
    setErrorMessage("");
    const items = buildItems();
    if (!items.length) {
      setErrorMessage("Pick at least one product or add a custom medicine.");
      return;
    }
    if (!pharmacy?.userId) {
      setErrorMessage("This pharmacy is not set up for orders yet.");
      return;
    }
    try {
      setSubmitting(true);
      await createPharmacyOrder({
        pharmacyUserId: pharmacy.userId,
        items,
        note: note.trim(),
      });
      Alert.alert(
        "Order placed",
        "Your order has been sent. The pharmacy will respond in chat about price and delivery.",
      );
      if (onOrderPlaced) onOrderPlaced();
      onClose();
    } catch (error) {
      setErrorMessage(
        error?.message ||
          "Unable to place order. Please try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: RFValue(10),
    paddingHorizontal: RFValue(12),
    paddingVertical: RFValue(10),
    fontSize: RFValue(13),
    color: theme.textPrimary,
    backgroundColor: theme.card,
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
      }}
    >
      <View
        style={{
          backgroundColor: theme.bg,
          borderTopLeftRadius: RFValue(24),
          borderTopRightRadius: RFValue(24),
          padding: RFValue(20),
          maxHeight: "92%",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: RFValue(16),
          }}
        >
          <Text
            style={{
              fontSize: RFValue(18),
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            Order from {pharmacy?.name || "pharmacy"}
          </Text>
          <TouchableOpacity onPress={onClose} disabled={submitting}>
            <Ionicons
              name="close"
              size={RFValue(26)}
              color={submitting ? theme.cardBorder : theme.textPrimary}
            />
          </TouchableOpacity>
        </View>

        <Text
          style={{
            fontSize: RFValue(11),
            color: theme.textTertiary,
            marginBottom: RFValue(10),
          }}
        >
          The app doesn't handle payment or delivery. Finalize price and
          delivery with the pharmacy in chat.
        </Text>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: RFValue(440) }}
        >
          {products.length ? (
            <>
              <Text
                style={{
                  fontSize: RFValue(12),
                  fontWeight: "800",
                  color: theme.textPrimary,
                  marginBottom: RFValue(8),
                }}
              >
                Products
              </Text>
              {products.map((product, idx) => {
                const selected = !!selections[idx];
                return (
                  <View
                    key={`prod-${idx}`}
                    style={{
                      borderWidth: 1,
                      borderColor: selected ? theme.accent : theme.cardBorder,
                      backgroundColor: selected
                        ? theme.accentLight
                        : theme.card,
                      borderRadius: RFValue(12),
                      padding: RFValue(12),
                      marginBottom: RFValue(10),
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => toggleProduct(idx)}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View style={{ flex: 1, marginRight: RFValue(8) }}>
                        <Text
                          style={{
                            fontSize: RFValue(13),
                            fontWeight: "700",
                            color: theme.textPrimary,
                          }}
                        >
                          {product.name}
                        </Text>
                        {product.price ? (
                          <Text
                            style={{
                              fontSize: RFValue(11),
                              color: theme.textSecondary,
                            }}
                          >
                            {String(product.price).startsWith("₹")
                              ? product.price
                              : `₹${product.price}`}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons
                        name={selected ? "checkbox" : "square-outline"}
                        size={22}
                        color={selected ? theme.accent : theme.textTertiary}
                      />
                    </TouchableOpacity>
                    {selected ? (
                      <View
                        style={{ flexDirection: "row", marginTop: RFValue(8) }}
                      >
                        <TextInput
                          style={[inputStyle, { flex: 1, marginRight: 8 }]}
                          placeholder="Qty"
                          placeholderTextColor={theme.textTertiary}
                          value={selections[idx].qty}
                          onChangeText={(value) =>
                            updateSelection(idx, "qty", value)
                          }
                          keyboardType="numeric"
                          editable={!submitting}
                        />
                        <TextInput
                          style={[inputStyle, { flex: 2 }]}
                          placeholder="Notes (optional)"
                          placeholderTextColor={theme.textTertiary}
                          value={selections[idx].notes}
                          onChangeText={(value) =>
                            updateSelection(idx, "notes", value)
                          }
                          editable={!submitting}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </>
          ) : (
            <Text
              style={{
                fontSize: RFValue(12),
                color: theme.textTertiary,
                marginBottom: RFValue(10),
              }}
            >
              This pharmacy hasn't listed products yet. Add the items you want
              below.
            </Text>
          )}

          <Text
            style={{
              fontSize: RFValue(12),
              fontWeight: "800",
              color: theme.textPrimary,
              marginBottom: RFValue(8),
              marginTop: RFValue(8),
            }}
          >
            Add custom items
          </Text>
          {customItems.map((item) => (
            <View
              key={item.key}
              style={{
                borderWidth: 1,
                borderColor: theme.cardBorder,
                borderRadius: RFValue(12),
                padding: RFValue(12),
                marginBottom: RFValue(8),
                backgroundColor: theme.card,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(11),
                    color: theme.textSecondary,
                    fontWeight: "700",
                  }}
                >
                  Custom item
                </Text>
                <TouchableOpacity
                  onPress={() => removeCustomItem(item.key)}
                  disabled={submitting}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={theme.danger}
                  />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[
                  inputStyle,
                  { marginTop: RFValue(6), marginBottom: RFValue(6) },
                ]}
                placeholder="Medicine name"
                placeholderTextColor={theme.textTertiary}
                value={item.name}
                onChangeText={(value) =>
                  updateCustomItem(item.key, "name", value)
                }
                editable={!submitting}
              />
              <View style={{ flexDirection: "row" }}>
                <TextInput
                  style={[inputStyle, { flex: 1, marginRight: 8 }]}
                  placeholder="Qty"
                  placeholderTextColor={theme.textTertiary}
                  value={item.qty}
                  onChangeText={(value) =>
                    updateCustomItem(item.key, "qty", value)
                  }
                  keyboardType="numeric"
                  editable={!submitting}
                />
                <TextInput
                  style={[inputStyle, { flex: 2 }]}
                  placeholder="Notes (optional)"
                  placeholderTextColor={theme.textTertiary}
                  value={item.notes}
                  onChangeText={(value) =>
                    updateCustomItem(item.key, "notes", value)
                  }
                  editable={!submitting}
                />
              </View>
            </View>
          ))}
          <TouchableOpacity
            onPress={addCustomItem}
            disabled={submitting}
            style={{ paddingVertical: RFValue(8) }}
          >
            <Text
              style={{
                color: theme.accent,
                fontWeight: "700",
                fontSize: RFValue(12),
              }}
            >
              + Add custom item
            </Text>
          </TouchableOpacity>

          <Text
            style={{
              fontSize: RFValue(12),
              fontWeight: "800",
              color: theme.textPrimary,
              marginTop: RFValue(12),
              marginBottom: RFValue(6),
            }}
          >
            Note to pharmacy (optional)
          </Text>
          <TextInput
            style={[
              inputStyle,
              { minHeight: RFValue(60), textAlignVertical: "top" },
            ]}
            placeholder="Delivery address, urgency, or any special instructions"
            placeholderTextColor={theme.textTertiary}
            value={note}
            onChangeText={setNote}
            multiline
            editable={!submitting}
          />

          {errorMessage ? (
            <Text
              style={{
                color: theme.danger,
                marginTop: RFValue(10),
                fontSize: RFValue(12),
              }}
            >
              {errorMessage}
            </Text>
          ) : null}
        </ScrollView>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={{
            backgroundColor: submitting ? theme.cardBorder : theme.accent,
            borderRadius: RFValue(14),
            paddingVertical: RFValue(14),
            alignItems: "center",
            marginTop: RFValue(12),
          }}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text
              style={{
                color: "#FFF",
                fontWeight: "800",
                fontSize: RFValue(14),
              }}
            >
              Place order · Pharmacy will reply in chat
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const PharmacyDetailScreen = ({ pharmacy, onBack }) => {
  const { theme } = useTheme();
  const { ensureDirectConversation } = useAppData();
  const [startingChat, setStartingChat] = useState(false);
  const [showOrderComposer, setShowOrderComposer] = useState(false);

  const handleCall = () => {
    const number = String(pharmacy?.phone || "").trim();
    if (!number) return;
    Linking.openURL(`tel:${number.replace(/[^+\d]/g, "")}`).catch(() => {});
  };

  const handleChat = async () => {
    if (!pharmacy?.userId) {
      Alert.alert(
        "Pharmacy not available",
        "This pharmacy isn't set up for chat yet.",
      );
      return;
    }
    try {
      setStartingChat(true);
      await ensureDirectConversation(pharmacy.userId);
      Alert.alert(
        "Chat started",
        "Open the Chat tab to continue your encrypted conversation with this pharmacy.",
      );
    } catch (error) {
      Alert.alert("Unable to start chat", error?.message || "Try again later.");
    } finally {
      setStartingChat(false);
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.card} />
      <View
        style={{
          backgroundColor: theme.card,
          paddingHorizontal: RFValue(16),
          paddingVertical: RFValue(14),
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={{ marginRight: RFValue(10), padding: 4 }}
        >
          <Ionicons
            name="arrow-back"
            size={RFValue(22)}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: RFValue(18),
            fontWeight: "800",
            color: theme.textPrimary,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {pharmacy?.name || "Pharmacy"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: RFValue(16),
            padding: RFValue(16),
            borderWidth: 1,
            borderColor: theme.cardBorder,
            marginBottom: RFValue(14),
          }}
        >
          {pharmacy?.tagline ? (
            <Text
              style={{
                fontSize: RFValue(13),
                color: theme.textSecondary,
                marginBottom: RFValue(8),
              }}
            >
              {pharmacy.tagline}
            </Text>
          ) : null}
          {pharmacy?.address ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                marginBottom: RFValue(6),
              }}
            >
              <Ionicons
                name="location-outline"
                size={RFValue(14)}
                color={theme.textSecondary}
                style={{ marginTop: 2 }}
              />
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: theme.textPrimary,
                  marginLeft: 6,
                  flex: 1,
                }}
              >
                {[pharmacy.address, pharmacy.district, pharmacy.state]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            </View>
          ) : null}
          {pharmacy?.phone ? (
            <TouchableOpacity
              onPress={handleCall}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <Ionicons
                name="call-outline"
                size={RFValue(14)}
                color={theme.accent}
              />
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: theme.accent,
                  marginLeft: 6,
                  fontWeight: "700",
                }}
              >
                {pharmacy.phone}
              </Text>
            </TouchableOpacity>
          ) : null}

          <View style={{ flexDirection: "row", marginTop: RFValue(12) }}>
            <TouchableOpacity
              onPress={() => setShowOrderComposer(true)}
              disabled={!pharmacy?.userId}
              style={{
                flex: 1,
                backgroundColor: theme.accent,
                paddingVertical: RFValue(12),
                borderRadius: RFValue(12),
                alignItems: "center",
                opacity: !pharmacy?.userId ? 0.5 : 1,
                marginRight: RFValue(8),
              }}
            >
              <Text
                style={{
                  color: "#FFF",
                  fontWeight: "800",
                  fontSize: RFValue(13),
                }}
              >
                Order medicines
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleChat}
              disabled={startingChat || !pharmacy?.userId}
              style={{
                flex: 1,
                backgroundColor: theme.card,
                borderWidth: 1,
                borderColor: theme.accent,
                paddingVertical: RFValue(12),
                borderRadius: RFValue(12),
                alignItems: "center",
                opacity: !pharmacy?.userId ? 0.5 : 1,
              }}
            >
              {startingChat ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Text
                  style={{
                    color: theme.accent,
                    fontWeight: "800",
                    fontSize: RFValue(13),
                  }}
                >
                  Chat
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: RFValue(16),
            padding: RFValue(16),
            borderWidth: 1,
            borderColor: theme.cardBorder,
            marginBottom: RFValue(14),
          }}
        >
          <Text
            style={{
              fontSize: RFValue(14),
              fontWeight: "800",
              color: theme.textPrimary,
              marginBottom: RFValue(10),
            }}
          >
            Opening hours
          </Text>
          {DAY_KEY_ORDER.map((dayKey) => {
            const isClosed = (pharmacy?.closingDays || []).includes(dayKey);
            const hours = pharmacy?.openingHours?.[dayKey];
            return (
              <View
                key={dayKey}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(13),
                    color: theme.textSecondary,
                    fontWeight: "600",
                  }}
                >
                  {DAY_KEY_LABEL[dayKey]}
                </Text>
                <Text
                  style={{
                    fontSize: RFValue(13),
                    color: isClosed ? theme.danger : theme.textPrimary,
                    fontWeight: "700",
                  }}
                >
                  {isClosed ? "Closed" : hours || "-"}
                </Text>
              </View>
            );
          })}
        </View>

        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: RFValue(16),
            padding: RFValue(16),
            borderWidth: 1,
            borderColor: theme.cardBorder,
          }}
        >
          <Text
            style={{
              fontSize: RFValue(14),
              fontWeight: "800",
              color: theme.textPrimary,
              marginBottom: RFValue(10),
            }}
          >
            Products & medicines
          </Text>
          {pharmacy?.products?.length ? (
            pharmacy.products.map((product, idx) => (
              <View
                key={`${pharmacy.id}-prod-${idx}`}
                style={{
                  paddingVertical: RFValue(10),
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: theme.cardBorder,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(13),
                      fontWeight: "700",
                      color: theme.textPrimary,
                      flex: 1,
                    }}
                  >
                    {product.name}
                  </Text>
                  {product.price ? (
                    <Text
                      style={{
                        fontSize: RFValue(13),
                        fontWeight: "800",
                        color: theme.accent,
                      }}
                    >
                      {String(product.price).startsWith("₹")
                        ? product.price
                        : `₹${product.price}`}
                    </Text>
                  ) : null}
                </View>
                {product.notes ? (
                  <Text
                    style={{
                      fontSize: RFValue(11),
                      color: theme.textTertiary,
                      marginTop: 2,
                    }}
                  >
                    {product.notes}
                  </Text>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={{ fontSize: RFValue(12), color: theme.textTertiary }}>
              This pharmacy has not listed any products yet. You can still chat
              to ask about availability.
            </Text>
          )}
        </View>
      </ScrollView>

      {showOrderComposer ? (
        <PatientOrderComposerModal
          pharmacy={pharmacy}
          onClose={() => setShowOrderComposer(false)}
          onOrderPlaced={() => setShowOrderComposer(false)}
        />
      ) : null}
    </SafeAreaView>
  );
};

const PharmacyDirectoryScreen = ({ onBack }) => {
  const { theme } = useTheme();
  const { pharmacies, pharmaciesLoading, fetchPharmacies, patientProfile } =
    useAppData();
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);

  useEffect(() => {
    void fetchPharmacies();
  }, []);

  const patientDistrict = String(patientProfile?.district || "")
    .trim()
    .toLowerCase();
  const patientState = String(patientProfile?.state || "")
    .trim()
    .toLowerCase();

  useEffect(() => {
    if (patientDistrict) setLocationFilter("district");
    else if (patientState) setLocationFilter("state");
    else setLocationFilter("all");
  }, [patientDistrict, patientState]);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredPharmacies = useMemo(() => {
    return (pharmacies || []).filter((p) => {
      if (locationFilter === "district" && patientDistrict) {
        if ((p.district || "").toLowerCase() !== patientDistrict) return false;
      } else if (locationFilter === "state" && patientState) {
        if ((p.state || "").toLowerCase() !== patientState) return false;
      }
      if (!trimmedQuery) return true;
      const productNames = (p.products || [])
        .map((prod) => prod.name || "")
        .join(" ");
      const haystack = [p.name, p.address, p.district, p.state, productNames]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(trimmedQuery);
    });
  }, [pharmacies, locationFilter, patientDistrict, patientState, trimmedQuery]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchPharmacies();
    } finally {
      setRefreshing(false);
    }
  };

  if (selectedPharmacy) {
    return (
      <PharmacyDetailScreen
        pharmacy={selectedPharmacy}
        onBack={() => setSelectedPharmacy(null)}
      />
    );
  }

  const chipFilters = [
    { id: "all", label: "All pharmacies" },
    ...(patientDistrict
      ? [{ id: "district", label: `In ${patientProfile.district}` }]
      : []),
    ...(patientState
      ? [{ id: "state", label: `In ${patientProfile.state}` }]
      : []),
  ];

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.card} />
      <View
        style={{
          backgroundColor: theme.card,
          paddingHorizontal: RFValue(16),
          paddingVertical: RFValue(14),
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={{ marginRight: RFValue(10), padding: 4 }}
        >
          <Ionicons
            name="arrow-back"
            size={RFValue(22)}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: RFValue(18),
            fontWeight: "800",
            color: theme.textPrimary,
          }}
        >
          Nearby Pharmacies
        </Text>
      </View>

      <View style={{ padding: RFValue(16) }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.card,
            borderRadius: RFValue(14),
            paddingHorizontal: RFValue(12),
            borderWidth: 1,
            borderColor: theme.cardBorder,
          }}
        >
          <Ionicons
            name="search"
            size={RFValue(16)}
            color={theme.textTertiary}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search pharmacy, product, city..."
            placeholderTextColor={theme.textTertiary}
            style={{
              flex: 1,
              paddingVertical: RFValue(10),
              marginLeft: RFValue(8),
              color: theme.textPrimary,
              fontSize: RFValue(13),
            }}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons
                name="close-circle"
                size={RFValue(16)}
                color={theme.textTertiary}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {chipFilters.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: RFValue(10) }}
          >
            {chipFilters.map((chip) => {
              const active = locationFilter === chip.id;
              return (
                <TouchableOpacity
                  key={chip.id}
                  onPress={() => setLocationFilter(chip.id)}
                  style={{
                    paddingVertical: RFValue(6),
                    paddingHorizontal: RFValue(12),
                    borderRadius: RFValue(20),
                    backgroundColor: active ? theme.accent : theme.card,
                    borderWidth: 1,
                    borderColor: active ? theme.accent : theme.cardBorder,
                    marginRight: RFValue(8),
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      fontWeight: "700",
                      color: active ? "#FFF" : theme.textSecondary,
                    }}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: RFValue(16),
          paddingBottom: RFValue(60),
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.accent}
          />
        }
      >
        {pharmaciesLoading && !pharmacies.length ? (
          <View style={{ alignItems: "center", marginTop: RFValue(40) }}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text
              style={{
                marginTop: RFValue(8),
                color: theme.textSecondary,
                fontSize: RFValue(12),
              }}
            >
              Loading pharmacies...
            </Text>
          </View>
        ) : filteredPharmacies.length ? (
          filteredPharmacies.map((pharmacy) => (
            <PharmacyCard
              key={pharmacy.id}
              theme={theme}
              pharmacy={pharmacy}
              onOpen={setSelectedPharmacy}
            />
          ))
        ) : (
          <View style={{ alignItems: "center", paddingVertical: RFValue(40) }}>
            <Ionicons
              name="leaf-outline"
              size={RFValue(48)}
              color={theme.cardBorder}
            />
            <Text
              style={{
                marginTop: RFValue(12),
                fontSize: RFValue(13),
                color: theme.textTertiary,
                textAlign: "center",
              }}
            >
              {pharmacies.length === 0
                ? "No pharmacies have joined Nvoisys yet."
                : "No pharmacies match your filters."}
            </Text>
            {locationFilter !== "all" && pharmacies.length > 0 ? (
              <TouchableOpacity
                onPress={() => setLocationFilter("all")}
                style={{
                  marginTop: RFValue(12),
                  paddingHorizontal: RFValue(16),
                  paddingVertical: RFValue(8),
                  backgroundColor: theme.accentLight,
                  borderRadius: RFValue(20),
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(12),
                    color: theme.accent,
                    fontWeight: "700",
                  }}
                >
                  Show all pharmacies
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ========================================
// PREMIUM SCREENS
// ========================================

const MedicationTrackerScreen = ({ onBack }) => {
  const {
    currentUserId,
    fetchMedicationSchedule,
    markScheduleDoseTaken,
    markScheduleDoseMissed,
  } = useAppData();
  const [doses, setDoses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadSchedule = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const records = await fetchMedicationSchedule({
        patientId: currentUserId,
        daysPast: 30,
      });
      const normalized = records.map((record) => ({
        id: record.id,
        medicine_name: record.medicine_name || "Medication",
        dosage: record.dosage || "",
        meal_timing: record.meal_timing || "no_preference",
        due_at: record.due_at,
        taken_at: record.taken_at,
        status: record.status || "pending",
      }));
      // Auto-flip overdue pending doses to "missed" locally so the UI
      // reflects reality; the server-side write is best-effort.
      const now = Date.now();
      const autoMissed = [];
      for (const dose of normalized) {
        if (
          dose.status === "pending" &&
          dose.due_at &&
          new Date(dose.due_at).getTime() < now - 2 * 60 * 60 * 1000
        ) {
          dose.status = "missed";
          autoMissed.push(dose.id);
        }
      }
      setDoses(normalized);
      for (const id of autoMissed) {
        markScheduleDoseMissed(id).catch(() => {});
      }
    } catch (e) {
      console.log("loadSchedule error:", e?.message);
      setError("Unable to load medication schedule.");
    }
  }, [currentUserId, fetchMedicationSchedule, markScheduleDoseMissed]);

  useEffect(() => {
    setLoading(true);
    loadSchedule().finally(() => setLoading(false));
  }, [loadSchedule]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSchedule();
    setRefreshing(false);
  };

  const handleMarkTaken = async (dose) => {
    if (!dose?.id || actionId) return;
    setActionId(dose.id);
    try {
      await markScheduleDoseTaken(dose.id);
      setDoses((prev) =>
        prev.map((item) =>
          item.id === dose.id
            ? {
                ...item,
                status: "taken",
                taken_at: new Date().toISOString(),
              }
            : item,
        ),
      );
    } catch (e) {
      Alert.alert("Unable to mark dose", e?.message || "Please try again.");
    } finally {
      setActionId(null);
    }
  };

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const endOfToday = useMemo(() => {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() + 1);
    return d;
  }, [startOfToday]);

  const todayDoses = useMemo(
    () =>
      doses
        .filter((d) => {
          if (!d.due_at) return false;
          const due = new Date(d.due_at);
          return due >= startOfToday && due < endOfToday;
        })
        .sort((a, b) => new Date(a.due_at) - new Date(b.due_at)),
    [doses, startOfToday, endOfToday],
  );

  const computeAdherence = (days) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const window = doses.filter((d) => {
      if (!d.due_at) return false;
      const due = new Date(d.due_at);
      return due >= cutoff && due <= new Date();
    });
    const taken = window.filter((d) => d.status === "taken").length;
    const countable = window.filter(
      (d) => d.status === "taken" || d.status === "missed",
    ).length;
    if (!countable)
      return { taken: 0, missed: 0, pending: window.length - taken, rate: 0 };
    return {
      taken,
      missed: countable - taken,
      pending: window.length - countable,
      rate: Math.round((taken / countable) * 100),
    };
  };

  const week = useMemo(() => computeAdherence(7), [doses]);
  const month = useMemo(() => computeAdherence(30), [doses]);

  const weekDays = useMemo(() => {
    const result = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const dayDoses = doses.filter((d) => {
        if (!d.due_at) return false;
        const due = new Date(d.due_at);
        return due >= day && due < next;
      });
      const taken = dayDoses.filter((d) => d.status === "taken").length;
      const countable = dayDoses.filter(
        (d) => d.status === "taken" || d.status === "missed",
      ).length;
      const rate = countable ? Math.round((taken / countable) * 100) : 0;
      result.push({
        label: day.toLocaleDateString(undefined, { weekday: "short" }),
        rate,
        hadDoses: dayDoses.length > 0,
      });
    }
    return result;
  }, [doses]);

  const perMedicineBreakdown = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const map = new Map();
    for (const dose of doses) {
      if (!dose.due_at) continue;
      const due = new Date(dose.due_at);
      if (due < since || due > new Date()) continue;
      const key = dose.medicine_name || "Medicine";
      const entry = map.get(key) || {
        name: key,
        taken: 0,
        missed: 0,
        pending: 0,
      };
      if (dose.status === "taken") entry.taken += 1;
      else if (dose.status === "missed") entry.missed += 1;
      else entry.pending += 1;
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [doses]);

  const formatTime = (value) => {
    if (!value) return "";
    try {
      return new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const mealLabel = (meal) => MEAL_TIMING_LABEL[meal] || "";

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: RFValue(16),
          }}
        >
          <TouchableOpacity
            onPress={onBack}
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(10),
              backgroundColor: "#F3F4F6",
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(14),
            }}
          >
            <Ionicons name="arrow-back" size={RFValue(20)} color="#374151" />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: RFValue(18),
              fontWeight: "800",
              color: "#1E1B4B",
            }}
          >
            Medication Tracker
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {loading && !doses.length ? (
          <View style={{ paddingVertical: RFValue(40), alignItems: "center" }}>
            <ActivityIndicator color="#4338CA" />
          </View>
        ) : null}

        {error ? (
          <View
            style={{
              backgroundColor: "#FEF2F2",
              borderRadius: RFValue(12),
              padding: RFValue(12),
              marginBottom: RFValue(12),
            }}
          >
            <Text style={{ color: "#B91C1C", fontSize: RFValue(12) }}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* Adherence Score */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: RFValue(18),
            padding: RFValue(20),
            marginBottom: RFValue(16),
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 3,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: RFValue(100),
              height: RFValue(100),
              borderRadius: RFValue(50),
              borderWidth: RFValue(8),
              borderColor: week.rate >= 80 ? "#059669" : "#D97706",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: RFValue(12),
            }}
          >
            <Text
              style={{
                fontSize: RFValue(32),
                fontWeight: "800",
                color: week.rate >= 80 ? "#059669" : "#D97706",
              }}
            >
              {week.rate}%
            </Text>
          </View>
          <Text
            style={{
              fontSize: RFValue(14),
              fontWeight: "700",
              color: "#1E1B4B",
            }}
          >
            7-day Adherence
          </Text>
          <Text
            style={{
              fontSize: RFValue(12),
              color: week.rate >= 80 ? "#059669" : "#D97706",
              fontWeight: "600",
            }}
          >
            {week.taken} taken · {week.missed} missed
          </Text>
        </View>

        {/* Weekly Chart */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: RFValue(18),
            padding: RFValue(16),
            marginBottom: RFValue(16),
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <Text
            style={{
              fontSize: RFValue(14),
              fontWeight: "700",
              color: "#1E1B4B",
              marginBottom: RFValue(14),
            }}
          >
            This Week
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-end",
              height: RFValue(80),
            }}
          >
            {weekDays.map((d, i) => (
              <View key={i} style={{ alignItems: "center", flex: 1 }}>
                <View
                  style={{
                    width: RFValue(24),
                    height: Math.max(
                      d.hadDoses ? RFValue(6) : RFValue(2),
                      (d.rate / 100) * RFValue(70),
                    ),
                    borderRadius: RFValue(4),
                    backgroundColor: !d.hadDoses
                      ? "#E5E7EB"
                      : d.rate >= 80
                        ? "#059669"
                        : d.rate >= 50
                          ? "#D97706"
                          : "#EF4444",
                    marginBottom: RFValue(6),
                  }}
                />
                <Text
                  style={{
                    fontSize: RFValue(9),
                    color: "#6B7280",
                    fontWeight: "600",
                  }}
                >
                  {d.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Today's Medications */}
        <Text
          style={{
            fontSize: RFValue(15),
            fontWeight: "700",
            color: "#1E1B4B",
            marginBottom: RFValue(12),
          }}
        >
          {"Today's Schedule"}
        </Text>
        {todayDoses.length === 0 ? (
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: RFValue(14),
              padding: RFValue(16),
              marginBottom: RFValue(12),
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: RFValue(12),
                color: "#6B7280",
                textAlign: "center",
              }}
            >
              No doses scheduled for today. When your doctor prescribes medicine
              with timing, doses will appear here.
            </Text>
          </View>
        ) : null}
        {todayDoses.map((dose) => {
          const taken = dose.status === "taken";
          const missed = dose.status === "missed";
          const isBusy = actionId === dose.id;
          return (
            <TouchableOpacity
              key={dose.id}
              onPress={() => !taken && handleMarkTaken(dose)}
              disabled={taken || isBusy}
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: RFValue(14),
                padding: RFValue(16),
                marginBottom: RFValue(10),
                shadowColor: "#000",
                shadowOpacity: 0.06,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 12,
                elevation: 3,
                flexDirection: "row",
                alignItems: "center",
                opacity: taken ? 0.7 : 1,
                borderWidth: missed ? 1 : 0,
                borderColor: missed ? "#FCA5A5" : "transparent",
              }}
            >
              <View
                style={{
                  paddingHorizontal: RFValue(10),
                  height: RFValue(36),
                  borderRadius: RFValue(12),
                  backgroundColor: taken
                    ? "#ECFDF5"
                    : missed
                      ? "#FEF2F2"
                      : "#F3F4F6",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(14),
                }}
              >
                <Ionicons
                  name={
                    taken
                      ? "checkmark-circle"
                      : missed
                        ? "alert-circle"
                        : "medkit"
                  }
                  size={RFValue(22)}
                  color={taken ? "#059669" : missed ? "#B91C1C" : "#6B7280"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: RFValue(14),
                    fontWeight: "700",
                    color: "#1E1B4B",
                    textDecorationLine: taken ? "line-through" : "none",
                  }}
                >
                  {dose.medicine_name}
                </Text>
                <Text style={{ fontSize: RFValue(12), color: "#6B7280" }}>
                  {formatTime(dose.due_at)}
                  {dose.dosage ? ` · ${dose.dosage}` : ""}
                </Text>
                {mealLabel(dose.meal_timing) ? (
                  <Text style={{ fontSize: RFValue(11), color: "#9CA3AF" }}>
                    {mealLabel(dose.meal_timing)}
                  </Text>
                ) : null}
                {missed ? (
                  <Text
                    style={{
                      fontSize: RFValue(10),
                      color: "#B91C1C",
                      fontWeight: "700",
                      marginTop: 2,
                    }}
                  >
                    Missed dose
                  </Text>
                ) : null}
              </View>
              {isBusy ? (
                <ActivityIndicator color="#059669" />
              ) : (
                <View
                  style={{
                    width: RFValue(24),
                    height: RFValue(24),
                    borderRadius: RFValue(12),
                    borderWidth: 2,
                    borderColor: taken ? "#059669" : "#D1D5DB",
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: taken ? "#059669" : "#FFF",
                  }}
                >
                  {taken && (
                    <Ionicons
                      name="checkmark"
                      size={RFValue(14)}
                      color="#FFF"
                    />
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Monthly adherence report */}
        <Text
          style={{
            fontSize: RFValue(15),
            fontWeight: "700",
            color: "#1E1B4B",
            marginTop: RFValue(12),
            marginBottom: RFValue(10),
          }}
        >
          Monthly Report (last 30 days)
        </Text>
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: RFValue(14),
            padding: RFValue(16),
            marginBottom: RFValue(12),
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: RFValue(22),
                  fontWeight: "800",
                  color: "#059669",
                }}
              >
                {month.taken}
              </Text>
              <Text style={{ fontSize: RFValue(11), color: "#6B7280" }}>
                Taken
              </Text>
            </View>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: RFValue(22),
                  fontWeight: "800",
                  color: "#B91C1C",
                }}
              >
                {month.missed}
              </Text>
              <Text style={{ fontSize: RFValue(11), color: "#6B7280" }}>
                Missed
              </Text>
            </View>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: RFValue(22),
                  fontWeight: "800",
                  color: "#4338CA",
                }}
              >
                {month.rate}%
              </Text>
              <Text style={{ fontSize: RFValue(11), color: "#6B7280" }}>
                Adherence
              </Text>
            </View>
          </View>
        </View>

        {perMedicineBreakdown.map((med) => (
          <View
            key={med.name}
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: RFValue(12),
              padding: RFValue(12),
              marginBottom: RFValue(8),
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: RFValue(13),
                fontWeight: "700",
                color: "#1E1B4B",
                flex: 1,
              }}
              numberOfLines={1}
            >
              {med.name}
            </Text>
            <Text style={{ fontSize: RFValue(11), color: "#059669" }}>
              {med.taken} taken
            </Text>
            <Text
              style={{
                fontSize: RFValue(11),
                color: "#B91C1C",
                marginLeft: RFValue(10),
              }}
            >
              {med.missed} missed
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const FamilyHealthScreen = ({ onBack }) => {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          paddingTop: safeHeaderPaddingTop(),
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={onBack}
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(10),
              backgroundColor: "#F3F4F6",
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(14),
            }}
          >
            <Ionicons name="arrow-back" size={RFValue(20)} color="#374151" />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: RFValue(18),
              fontWeight: "800",
              color: "#1E1B4B",
            }}
          >
            Family Health
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: RFValue(24),
        }}
      >
        <GlowView glowColor="#4338CA" size={RFValue(120)}>
          <View
            style={{
              width: RFValue(100),
              height: RFValue(100),
              borderRadius: RFValue(50),
              backgroundColor: "#EEF2FF",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="people" size={RFValue(48)} color="#4338CA" />
          </View>
        </GlowView>

        <View style={{ marginTop: RFValue(32), alignItems: "center" }}>
          <View
            style={{
              backgroundColor: "#4338CA",
              paddingHorizontal: RFValue(12),
              paddingVertical: RFValue(4),
              borderRadius: RFValue(20),
              marginBottom: RFValue(12),
            }}
          >
            <Text
              style={{
                color: "#FFF",
                fontSize: RFValue(10),
                fontWeight: "800",
                letterSpacing: 1,
              }}
            >
              LAUNCHING SOON
            </Text>
          </View>
          <Text
            style={{
              fontSize: RFValue(24),
              fontWeight: "800",
              color: "#1E1B4B",
              textAlign: "center",
            }}
          >
            {"Monitor Your Family's Health"}
          </Text>
          <Text
            style={{
              fontSize: RFValue(14),
              color: "#6B7280",
              textAlign: "center",
              marginTop: RFValue(8),
              lineHeight: RFValue(20),
            }}
          >
            {
              "We're building a comprehensive dashboard for you to track the health status and recovery progress of your loved ones in real-time."
            }
          </Text>
        </View>

        <View
          style={{
            width: "100%",
            marginTop: RFValue(40),
            backgroundColor: "#FFFFFF",
            borderRadius: RFValue(16),
            padding: RFValue(16),
            shadowColor: "#000",
            shadowOpacity: 0.05,
            elevation: 2,
          }}
        >
          <Text
            style={{
              fontSize: RFValue(14),
              fontWeight: "700",
              color: "#1E1B4B",
              marginBottom: RFValue(16),
            }}
          >
            What to expect:
          </Text>
          {[
            { icon: "pulse", text: "Real-time vitals monitoring" },
            {
              icon: "alert-circle-outline",
              text: "Emergency notifications for dependents",
            },
            {
              icon: "calendar-outline",
              text: "Shared medication & treatment schedules",
            },
            {
              icon: "document-text-outline",
              text: "Consolidated family medical records",
            },
          ].map((item, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: RFValue(14),
              }}
            >
              <View
                style={{
                  width: RFValue(28),
                  height: RFValue(28),
                  borderRadius: RFValue(8),
                  backgroundColor: "#F5F3FF",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(12),
                }}
              >
                <Ionicons name={item.icon} size={RFValue(16)} color="#4338CA" />
              </View>
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: "#4B5563",
                  fontWeight: "500",
                }}
              >
                {item.text}
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={{
            marginTop: RFValue(32),
            backgroundColor: "#F3F4F6",
            paddingHorizontal: RFValue(24),
            paddingVertical: RFValue(12),
            borderRadius: RFValue(12),
          }}
        >
          <Text
            style={{
              color: "#6B7280",
              fontSize: RFValue(13),
              fontWeight: "700",
            }}
          >
            Notify Me When Ready
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const EmergencySOScreen = ({ onBack }) => {
  const [sosActive, setSosActive] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const triggerSOS = () => {
    setSosActive(true);
    let count = 3;
    setCountdown(count);
    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        setCountdown(0);
      } else {
        setCountdown(count);
      }
    }, 1000);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: sosActive ? "#7F1D1D" : "#F8FAFC" }}
    >
      <StatusBar
        barStyle={sosActive ? "light-content" : "dark-content"}
        backgroundColor={sosActive ? "#7F1D1D" : "#FFFFFF"}
      />
      <View
        style={{
          backgroundColor: sosActive ? "#7F1D1D" : "#FFFFFF",
          padding: RFValue(20),
          paddingTop: safeHeaderPaddingTop(),
          borderBottomWidth: 1,
          borderBottomColor: sosActive ? "#991B1B" : "#F3F4F6",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={onBack}
            style={{
              width: RFValue(36),
              height: RFValue(36),
              borderRadius: RFValue(10),
              backgroundColor: sosActive ? "rgba(255,255,255,0.2)" : "#F3F4F6",
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(14),
            }}
          >
            <Ionicons
              name="arrow-back"
              size={RFValue(20)}
              color={sosActive ? "#FFF" : "#374151"}
            />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: RFValue(18),
              fontWeight: "800",
              color: sosActive ? "#FFF" : "#1E1B4B",
            }}
          >
            Emergency SOS
          </Text>
        </View>
      </View>

      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: RFValue(24),
        }}
      >
        {sosActive ? (
          <>
            <View
              style={{
                width: RFValue(160),
                height: RFValue(160),
                borderRadius: RFValue(80),
                backgroundColor: "#EF4444",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: RFValue(24),
                shadowColor: "#EF4444",
                shadowOpacity: 0.5,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 30,
                elevation: 10,
              }}
            >
              <Ionicons name="alert-circle" size={RFValue(60)} color="#FFF" />
              {countdown !== null && countdown > 0 && (
                <Text
                  style={{
                    color: "#FFF",
                    fontSize: RFValue(36),
                    fontWeight: "800",
                    marginTop: RFValue(8),
                  }}
                >
                  {countdown}
                </Text>
              )}
            </View>
            <Text
              style={{
                color: "#FFF",
                fontSize: RFValue(20),
                fontWeight: "800",
                textAlign: "center",
                marginBottom: RFValue(8),
              }}
            >
              SOS Activated!
            </Text>
            <Text
              style={{
                color: "#FCA5A5",
                fontSize: RFValue(14),
                textAlign: "center",
                lineHeight: RFValue(22),
              }}
            >
              Alerting your emergency contacts and nearby hospitals...
            </Text>
          </>
        ) : (
          <>
            <View
              style={{
                width: RFValue(160),
                height: RFValue(160),
                borderRadius: RFValue(80),
                backgroundColor: "#FEF2F2",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: RFValue(24),
              }}
            >
              <TouchableOpacity
                onPress={triggerSOS}
                style={{
                  width: RFValue(130),
                  height: RFValue(130),
                  borderRadius: RFValue(65),
                  backgroundColor: "#DC2626",
                  justifyContent: "center",
                  alignItems: "center",
                  shadowColor: "#DC2626",
                  shadowOpacity: 0.4,
                  shadowOffset: { width: 0, height: 0 },
                  shadowRadius: 20,
                  elevation: 8,
                }}
              >
                <Ionicons name="alert-circle" size={RFValue(50)} color="#FFF" />
                <Text
                  style={{
                    color: "#FFF",
                    fontSize: RFValue(16),
                    fontWeight: "800",
                    marginTop: RFValue(4),
                  }}
                >
                  SOS
                </Text>
              </TouchableOpacity>
            </View>
            <Text
              style={{
                color: "#1E1B4B",
                fontSize: RFValue(20),
                fontWeight: "800",
                textAlign: "center",
                marginBottom: RFValue(8),
              }}
            >
              Emergency SOS
            </Text>
            <Text
              style={{
                color: "#6B7280",
                fontSize: RFValue(14),
                textAlign: "center",
                lineHeight: RFValue(22),
                marginBottom: RFValue(32),
              }}
            >
              Tap the button to send an emergency alert to your contacts and
              nearby hospitals
            </Text>
          </>
        )}

        {/* Emergency Contacts */}
        <View style={{ width: "100%" }}>
          <Text
            style={{
              color: sosActive ? "#FCA5A5" : "#6B7280",
              fontSize: RFValue(13),
              fontWeight: "700",
              marginBottom: RFValue(12),
              textAlign: "center",
            }}
          >
            EMERGENCY CONTACTS
          </Text>
          {[{ name: "Ambulance", phone: "108", icon: "medical" }].map(
            (contact, idx) => (
              <TouchableOpacity
                key={idx}
                style={{
                  backgroundColor: sosActive
                    ? "rgba(255,255,255,0.1)"
                    : "#FFFFFF",
                  borderRadius: RFValue(14),
                  padding: RFValue(16),
                  marginBottom: RFValue(10),
                  flexDirection: "row",
                  alignItems: "center",
                  shadowColor: "#000",
                  shadowOpacity: sosActive ? 0 : 0.06,
                  shadowOffset: { width: 0, height: 4 },
                  shadowRadius: 12,
                  elevation: sosActive ? 0 : 3,
                }}
              >
                <View
                  style={{
                    width: RFValue(40),
                    height: RFValue(40),
                    borderRadius: RFValue(12),
                    backgroundColor: sosActive
                      ? "rgba(255,255,255,0.2)"
                      : "#FEF2F2",
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: RFValue(14),
                  }}
                >
                  <Ionicons
                    name={contact.icon}
                    size={RFValue(20)}
                    color={sosActive ? "#FFF" : "#DC2626"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      fontWeight: "700",
                      color: sosActive ? "#FFF" : "#1E1B4B",
                    }}
                  >
                    {contact.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: RFValue(12),
                      color: sosActive ? "#FCA5A5" : "#6B7280",
                    }}
                  >
                    {contact.phone}
                  </Text>
                </View>
                <TouchableOpacity
                  style={{
                    width: RFValue(36),
                    height: RFValue(36),
                    borderRadius: RFValue(10),
                    backgroundColor: "#059669",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="call" size={RFValue(18)} color="#FFF" />
                </TouchableOpacity>
              </TouchableOpacity>
            ),
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const DoctorRootPlaceholder = () => {
  const [showAppointment, setShowAppointment] = useState(false);

  useEffect(() => {
    const handleBack = () => {
      if (showAppointment) {
        setShowAppointment(false);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBack,
    );
    return () => subscription.remove();
  }, [showAppointment]);

  if (showAppointment)
    return (
      <AppointmentBookingScreen onBack={() => setShowAppointment(false)} />
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          paddingTop: safeHeaderPaddingTop(),
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <Text
          style={{ fontSize: RFValue(20), fontWeight: "800", color: "#1E1B4B" }}
        >
          Schedule
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        {/* Today's Appointments */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: RFValue(18),
            padding: RFValue(16),
            marginBottom: RFValue(16),
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <Text
            style={{
              fontSize: RFValue(15),
              fontWeight: "700",
              color: "#1E1B4B",
              marginBottom: RFValue(14),
            }}
          >
            {"Today's Appointments"}
          </Text>

          {(() => {
            const apts = [];
            return apts.length > 0 ? (
              apts.map((apt, idx) => (
                <View
                  key={idx}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: RFValue(12),
                    borderBottomWidth: idx < apts.length - 1 ? 1 : 0,
                    borderBottomColor: "#F3F4F6",
                  }}
                >
                  <View
                    style={{
                      backgroundColor: idx === 1 ? "#ECFDF5" : "#F3F4F6",
                      padding: RFValue(8),
                      borderRadius: RFValue(8),
                      alignItems: "center",
                      marginRight: RFValue(12),
                      width: RFValue(52),
                    }}
                  >
                    <Text
                      style={{
                        color: idx === 1 ? "#059669" : "#4B5563",
                        fontWeight: "700",
                        fontSize: RFValue(10),
                      }}
                    >
                      {apt.time.split(" ")[0]}
                    </Text>
                    <Text
                      style={{
                        color: idx === 1 ? "#059669" : "#4B5563",
                        fontWeight: "800",
                        fontSize: RFValue(9),
                      }}
                    >
                      {apt.time.split(" ")[1]}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: RFValue(14),
                        fontWeight: "700",
                        color: "#1E1B4B",
                      }}
                    >
                      {apt.patient}
                    </Text>
                    <Text style={{ fontSize: RFValue(11), color: "#6B7280" }}>
                      {apt.type}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor:
                        apt.status === "Checked In"
                          ? "#ECFDF5"
                          : apt.status === "Upcoming"
                            ? "#EEF2FF"
                            : "#F3F4F6",
                      paddingHorizontal: RFValue(8),
                      paddingVertical: RFValue(4),
                      borderRadius: RFValue(8),
                    }}
                  >
                    <Text
                      style={{
                        color:
                          apt.status === "Checked In"
                            ? "#059669"
                            : apt.status === "Upcoming"
                              ? "#4338CA"
                              : "#6B7280",
                        fontSize: RFValue(10),
                        fontWeight: "700",
                      }}
                    >
                      {apt.status}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: "#6B7280",
                  textAlign: "center",
                  paddingVertical: RFValue(20),
                }}
              >
                No appointments scheduled for today.
              </Text>
            );
          })()}
        </View>

        {/* Quick Actions */}
        <TouchableOpacity
          onPress={() => setShowAppointment(true)}
          style={{
            backgroundColor: "#059669",
            borderRadius: RFValue(14),
            paddingVertical: RFValue(16),
            alignItems: "center",
            marginBottom: RFValue(12),
          }}
        >
          <Text
            style={{ color: "#FFF", fontSize: RFValue(15), fontWeight: "700" }}
          >
            + New Appointment
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// --- CUSTOM TAB BAR ---
const CustomTabBar = ({ state, descriptors, navigation, activeColor }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const numTabs = state.routes.length;
  const tabIconSize = Math.min(ri(22), DEVICE_TYPE === "tablet" ? 26 : 24);
  const tabLabelSize = Math.min(RFText(10, { max: 1.06 }), 12);
  const muted = theme.textTertiary || "#9CA3AF";
  // Home-indicator / gesture inset only - outer tab roots omit bottom safe
  // area so we are not double-padding above the system nav.
  const bottomPad = Math.max(insets.bottom, RFValue(8));

  // Spring the shared indicator to the active tab's position
  useEffect(() => {
    if (tabBarWidth === 0 || numTabs === 0) return;
    const tabWidth = tabBarWidth / numTabs;
    const pillWidth = tabWidth - RFValue(24);
    const targetX = state.index * tabWidth + RFValue(12);
    Animated.spring(indicatorX, {
      toValue: targetX,
      damping: 18,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [state.index, tabBarWidth, numTabs, indicatorX]);

  return (
    <View
      style={{
        flexDirection: "row",
        width: "100%",
        backgroundColor: theme.tabBarBg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.tabBarBorder,
        paddingBottom: bottomPad,
        paddingTop: Math.min(RFValue(9), 11),
        minHeight: Math.round(RFValue(58) + bottomPad),
        shadowColor: theme.shadowColor,
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: -2 },
        shadowRadius: 10,
        elevation: 16,
      }}
      onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const label = options.tabBarLabel || route.name;
        const icon = options.tabBarIcon
          ? options.tabBarIcon({
              color: isFocused ? activeColor : muted,
              size: tabIconSize,
              focused: isFocused,
            })
          : null;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={{
              flex: 1,
              minWidth: 0,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: RFValue(3),
              minHeight: RFValue(48),
            }}
          >
            {icon}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={{
                fontSize: tabLabelSize,
                fontWeight: isFocused ? "700" : "500",
                color: isFocused ? activeColor : muted,
                marginTop: 3,
                maxWidth: "100%",
                paddingHorizontal: 2,
                textAlign: "center",
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// --- CUSTOM TAB NAVIGATOR ---
const CustomTabNavigator = ({ routes, activeColor }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const handleBack = () => {
      if (activeIndex !== 0) {
        setActiveIndex(0);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBack,
    );
    return () => subscription.remove();
  }, [activeIndex]);

  const state = {
    index: activeIndex,
    routes: routes.map((r, i) => ({ key: r.name, name: r.name })),
  };

  const navigation = {
    navigate: (name) => {
      const idx = routes.findIndex((r) => r.name === name);
      if (idx !== -1) setActiveIndex(idx);
    },
    emit: () => ({ defaultPrevented: false }),
  };

  const descriptors = {};
  routes.forEach((r) => {
    descriptors[r.key || r.name] = {
      options: { tabBarLabel: r.label || r.name, tabBarIcon: r.icon },
    };
  });

  const ActiveComponent = routes[activeIndex].component;

  const mainTabNavValue = {
    navigateTab: (name) => {
      const idx = routes.findIndex((r) => r.name === name);
      if (idx !== -1) setActiveIndex(idx);
    },
    activeName: routes[activeIndex]?.name || "",
  };

  return (
    <MainTabNavigationContext.Provider value={mainTabNavValue}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, minHeight: 0 }}>
          <ActiveComponent navigation={navigation} />
        </View>
        <CustomTabBar
          state={state}
          descriptors={descriptors}
          navigation={navigation}
          activeColor={activeColor}
        />
      </View>
    </MainTabNavigationContext.Provider>
  );
};

// --- PHARMACY DASHBOARD COMPONENTS ---
// Edit pharmacy profile (Launch v1.0 - Step 5). All fields are optional and
// only written when the PocketBase schema has the column (older schemas
// silently ignore unknown keys thanks to how the save helper filters empties).
const DEFAULT_OPENING_HOURS = {
  mon: "09:00-21:00",
  tue: "09:00-21:00",
  wed: "09:00-21:00",
  thu: "09:00-21:00",
  fri: "09:00-21:00",
  sat: "09:00-21:00",
  sun: "",
};

const PharmacyProfileScreen = ({ onLogout }) => {
  const { theme } = useTheme();
  const { currentUser, savePharmacyProfile } = useAppData();
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successFlash, setSuccessFlash] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [tagline, setTagline] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setStateValue] = useState("");
  const [phone, setPhone] = useState("");
  const [openingHours, setOpeningHours] = useState({
    ...DEFAULT_OPENING_HOURS,
  });
  const [closingDays, setClosingDays] = useState(["sun"]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!currentUser?.id) {
        setLoadingProfile(false);
        return;
      }
      try {
        const profile = await pb
          .collection("pharmacy_profile")
          .getFirstListItem(`user="${currentUser.id}"`, { requestKey: null });
        if (!active || !profile) return;
        const mapped = mapPharmacyListingRecord({
          ...profile,
          expand: { user: currentUser },
        });
        setStoreName(mapped.name || "");
        setTagline(mapped.tagline || "");
        setAddress(mapped.address || "");
        setDistrict(mapped.district || "");
        setStateValue(mapped.state || "");
        setPhone(mapped.phone || "");
        if (mapped.openingHours) {
          setOpeningHours({
            ...DEFAULT_OPENING_HOURS,
            ...mapped.openingHours,
          });
        }
        if (Array.isArray(mapped.closingDays) && mapped.closingDays.length) {
          setClosingDays(mapped.closingDays);
        }
        if (Array.isArray(mapped.products)) {
          setProducts(mapped.products);
        }
      } catch (error) {
        if (error?.status !== 404) {
          console.log("Pharmacy profile load error:", error?.message || error);
        }
      } finally {
        if (active) setLoadingProfile(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [currentUser?.id]);

  const toggleClosingDay = (key) => {
    setClosingDays((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key],
    );
  };

  const updateHours = (key, value) => {
    setOpeningHours((prev) => ({ ...prev, [key]: value }));
  };

  const updateProduct = (index, patch) => {
    setProducts((prev) => {
      const next = prev.slice();
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addProduct = () => {
    setProducts((prev) => [...prev, { name: "", price: "", notes: "" }]);
  };

  const removeProduct = (index) => {
    setProducts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    if (saving) return;
    setErrorMessage("");
    const cleanedProducts = products
      .map((p) => ({
        name: String(p.name || "").trim(),
        price: String(p.price || "").trim(),
        notes: String(p.notes || "").trim(),
      }))
      .filter((p) => p.name);
    try {
      setSaving(true);
      await savePharmacyProfile({
        store_name: storeName,
        tagline,
        address,
        district,
        state,
        phone,
        opening_hours: openingHours,
        closing_days: closingDays,
        products: cleanedProducts,
      });
      setProducts(cleanedProducts);
      setSuccessFlash(true);
      setTimeout(() => setSuccessFlash(false), 2500);
    } catch (error) {
      setErrorMessage(
        error?.message ||
          "Unable to save pharmacy profile. Please try again later.",
      );
    } finally {
      setSaving(false);
    }
  };

  const labelStyle = {
    fontSize: RFValue(12),
    color: theme.textSecondary,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 12,
  };
  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: RFValue(10),
    paddingHorizontal: RFValue(12),
    paddingVertical: RFValue(10),
    color: theme.textPrimary,
    backgroundColor: theme.card,
    fontSize: RFValue(13),
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["top", "left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.card} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          paddingTop: safeHeaderPaddingTop(),
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <Text
          style={{
            fontSize: RFValue(20),
            fontWeight: "800",
            color: theme.textPrimary,
          }}
        >
          Pharmacy profile
        </Text>
        <Text
          style={{
            fontSize: RFValue(12),
            color: theme.textSecondary,
            marginTop: 4,
          }}
        >
          Patients will see this when they browse nearby pharmacies.
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: RFValue(20),
            paddingBottom: tabScrollBottomPadding(),
          }}
          keyboardShouldPersistTaps="handled"
        >
          {loadingProfile ? (
            <View style={{ alignItems: "center", marginVertical: RFValue(24) }}>
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          ) : null}

          <Text
            style={{
              fontSize: RFValue(14),
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            Business information
          </Text>
          <Text style={labelStyle}>Store name</Text>
          <TextInput
            value={storeName}
            onChangeText={setStoreName}
            placeholder="E.g. MediStore Pharma"
            placeholderTextColor={theme.textTertiary}
            style={inputStyle}
          />
          <Text style={labelStyle}>Tagline (optional)</Text>
          <TextInput
            value={tagline}
            onChangeText={setTagline}
            placeholder="Short description patients will see"
            placeholderTextColor={theme.textTertiary}
            style={inputStyle}
          />
          <Text style={labelStyle}>Phone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 98765 43210"
            placeholderTextColor={theme.textTertiary}
            keyboardType="phone-pad"
            style={inputStyle}
          />

          <Text
            style={{
              marginTop: RFValue(24),
              fontSize: RFValue(14),
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            Location
          </Text>
          <Text style={labelStyle}>Address</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Street, area"
            placeholderTextColor={theme.textTertiary}
            style={inputStyle}
          />
          <Text style={labelStyle}>District</Text>
          <TextInput
            value={district}
            onChangeText={setDistrict}
            placeholder="Patients filter by district"
            placeholderTextColor={theme.textTertiary}
            style={inputStyle}
          />
          <Text style={labelStyle}>State</Text>
          <TextInput
            value={state}
            onChangeText={setStateValue}
            placeholder="State"
            placeholderTextColor={theme.textTertiary}
            style={inputStyle}
          />

          <Text
            style={{
              marginTop: RFValue(24),
              fontSize: RFValue(14),
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            Opening hours
          </Text>
          {DAY_KEY_ORDER.map((dayKey) => {
            const isClosed = closingDays.includes(dayKey);
            return (
              <View
                key={dayKey}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: RFValue(10),
                }}
              >
                <Text
                  style={{
                    width: RFValue(44),
                    fontSize: RFValue(13),
                    fontWeight: "700",
                    color: theme.textSecondary,
                  }}
                >
                  {DAY_KEY_LABEL[dayKey]}
                </Text>
                <TextInput
                  value={isClosed ? "" : openingHours[dayKey] || ""}
                  onChangeText={(v) => updateHours(dayKey, v)}
                  placeholder="09:00-21:00"
                  placeholderTextColor={theme.textTertiary}
                  editable={!isClosed}
                  style={[
                    inputStyle,
                    {
                      flex: 1,
                      opacity: isClosed ? 0.4 : 1,
                      marginRight: RFValue(8),
                    },
                  ]}
                />
                <TouchableOpacity
                  onPress={() => toggleClosingDay(dayKey)}
                  style={{
                    paddingVertical: RFValue(8),
                    paddingHorizontal: RFValue(10),
                    borderRadius: RFValue(10),
                    backgroundColor: isClosed ? theme.dangerLight : theme.bg,
                    borderWidth: 1,
                    borderColor: isClosed ? theme.danger : theme.cardBorder,
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(11),
                      color: isClosed ? theme.danger : theme.textSecondary,
                      fontWeight: "700",
                    }}
                  >
                    {isClosed ? "Closed" : "Open"}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}

          <Text
            style={{
              marginTop: RFValue(24),
              fontSize: RFValue(14),
              fontWeight: "800",
              color: theme.textPrimary,
            }}
          >
            Products & medicines
          </Text>
          {products.map((product, idx) => (
            <View
              key={`product-${idx}`}
              style={{
                marginTop: RFValue(12),
                padding: RFValue(12),
                borderRadius: RFValue(12),
                borderWidth: 1,
                borderColor: theme.cardBorder,
                backgroundColor: theme.card,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(12),
                    color: theme.textTertiary,
                    fontWeight: "700",
                  }}
                >
                  Product #{idx + 1}
                </Text>
                <TouchableOpacity onPress={() => removeProduct(idx)}>
                  <Ionicons
                    name="trash-outline"
                    size={RFValue(18)}
                    color={theme.danger}
                  />
                </TouchableOpacity>
              </View>
              <TextInput
                value={product.name}
                onChangeText={(v) => updateProduct(idx, { name: v })}
                placeholder="Name (e.g. Paracetamol 500mg)"
                placeholderTextColor={theme.textTertiary}
                style={[inputStyle, { marginTop: 8 }]}
              />
              <TextInput
                value={product.price}
                onChangeText={(v) => updateProduct(idx, { price: v })}
                placeholder="Price (e.g. 45)"
                placeholderTextColor={theme.textTertiary}
                keyboardType="numeric"
                style={[inputStyle, { marginTop: 8 }]}
              />
              <TextInput
                value={product.notes}
                onChangeText={(v) => updateProduct(idx, { notes: v })}
                placeholder="Notes (optional)"
                placeholderTextColor={theme.textTertiary}
                style={[inputStyle, { marginTop: 8 }]}
              />
            </View>
          ))}
          <TouchableOpacity
            onPress={addProduct}
            style={{
              marginTop: RFValue(12),
              paddingVertical: RFValue(10),
              borderRadius: RFValue(12),
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: theme.accent,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: theme.accent,
                fontWeight: "700",
                fontSize: RFValue(13),
              }}
            >
              + Add product
            </Text>
          </TouchableOpacity>

          {errorMessage ? (
            <Text
              style={{
                marginTop: RFValue(16),
                color: theme.danger,
                fontSize: RFValue(12),
                textAlign: "center",
              }}
            >
              {errorMessage}
            </Text>
          ) : null}
          {successFlash ? (
            <Text
              style={{
                marginTop: RFValue(16),
                color: theme.success,
                fontSize: RFValue(12),
                textAlign: "center",
                fontWeight: "700",
              }}
            >
              Profile saved. Patients will now see your updated details.
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{
              marginTop: RFValue(20),
              backgroundColor: theme.accent,
              paddingVertical: RFValue(14),
              borderRadius: RFValue(12),
              alignItems: "center",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text
                style={{
                  color: "#FFF",
                  fontWeight: "800",
                  fontSize: RFValue(14),
                }}
              >
                Save pharmacy profile
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onLogout}
            style={{
              marginTop: RFValue(12),
              paddingVertical: RFValue(12),
              borderRadius: RFValue(12),
              alignItems: "center",
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          >
            <Text
              style={{
                color: theme.danger,
                fontWeight: "700",
                fontSize: RFValue(13),
              }}
            >
              Logout
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const StaffManagementScreen = () => {
  const { theme } = useTheme();
  const staff = [
    {
      id: 1,
      name: "Dr. Neha Kapoor",
      role: "Chief surgeon",
      status: "On Duty",
    },
    { id: 2, name: "Nurse Rahul", role: "Emergency Lead", status: "On Duty" },
    { id: 3, name: "Vikas Admin", role: "Clinic Manager", status: "Off Duty" },
  ];

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["top", "left", "right"]}
    >
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          paddingTop: safeHeaderPaddingTop(),
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <Text
          style={{
            fontSize: RFValue(20),
            fontWeight: "800",
            color: theme.textPrimary,
          }}
        >
          Staff Management
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        {staff.map((s, idx) => (
          <View
            key={idx}
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(16),
              padding: RFValue(16),
              marginBottom: 12,
              shadowColor: "#000",
              shadowOpacity: 0.05,
              elevation: 2,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: RFValue(44),
                height: RFValue(44),
                borderRadius: RFValue(22),
                backgroundColor: theme.accentLight,
                justifyContent: "center",
                alignItems: "center",
                marginRight: 12,
              }}
            >
              <Ionicons name="person" size={RFValue(20)} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: RFValue(15),
                  color: theme.textPrimary,
                }}
              >
                {s.name}
              </Text>
              <Text
                style={{ color: theme.textSecondary, fontSize: RFValue(12) }}
              >
                {s.role}
              </Text>
            </View>
            <View
              style={{
                backgroundColor:
                  s.status === "On Duty" ? theme.successLight : theme.bg,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 10,
              }}
            >
              <Text
                style={{
                  color:
                    s.status === "On Duty" ? theme.success : theme.textTertiary,
                  fontSize: RFValue(10),
                  fontWeight: "700",
                }}
              >
                {s.status}
              </Text>
            </View>
          </View>
        ))}
        <TouchableOpacity
          style={{
            marginTop: 20,
            backgroundColor: theme.accent,
            padding: 16,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#FFF", fontWeight: "800" }}>
            Add New Staff Member
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// ========================================
// WOUND MANAGEMENT SCREENS
// ========================================

const ModernHeader = ({ title, subtitle }) => {
  return (
    <View
      style={{
        backgroundColor: "#FFFFFF",
        padding: RFValue(20),
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
      }}
    >
      <Text
        style={{
          fontSize: RFValue(20),
          fontWeight: "800",
          color: "#1E1B4B",
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            fontSize: RFValue(12),
            color: "#6B7280",
            marginTop: RFValue(2),
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
};

const PatientWoundScreen = () => {
  const { theme } = useTheme();
  const {
    wounds,
    setWounds,
    patientSelectedWoundId,
    setPatientSelectedWoundId,
    patientShowNewWound,
    setPatientShowNewWound,
    currentUser,
    refreshAllData,
  } = useAppData();
  const [showWoundTabQuickCounselling, setShowWoundTabQuickCounselling] =
    useState(false);
  const selectedWound = (wounds || []).find(
    (item) => item.id === patientSelectedWoundId,
  );
  const onSelectWound = setPatientSelectedWoundId;
  const onClearWoundSelection = () => setPatientSelectedWoundId(null);
  const onSetShowNewWound = setPatientShowNewWound;

  if (showWoundTabQuickCounselling) {
    return (
      <QuickCounsellingScreen
        theme={theme}
        fromWoundTracker
        onBack={() => {
          setShowWoundTabQuickCounselling(false);
          void refreshAllData?.().catch(() => {});
        }}
        patientUserId={currentUser?.id}
      />
    );
  }

  if (patientShowNewWound)
    return (
      <NewWoundScreen
        onBack={() => onSetShowNewWound(false)}
        setWounds={setWounds}
        wounds={wounds}
      />
    );
  if (selectedWound)
    return (
      <WoundDetailScreen
        key={selectedWound.id}
        wound={selectedWound}
        onBack={() => onClearWoundSelection()}
        userRole="patient"
        setWounds={setWounds}
      />
    );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ModernHeader title="Wound Tracker" subtitle="Manage your recovery" />

      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: RFValue(10),
            marginBottom: RFValue(20),
          }}
        >
          <TouchableOpacity
            onPress={() => onSetShowNewWound(true)}
            style={{
              flex: 1,
              backgroundColor: "#EEF2FF",
              borderStyle: "dashed",
              borderWidth: 2,
              borderColor: "#4338CA",
              borderRadius: RFValue(16),
              padding: RFValue(16),
              alignItems: "center",
            }}
          >
            <Ionicons name="add-circle" size={RFValue(28)} color="#4338CA" />
            <Text
              style={{
                color: "#4338CA",
                fontWeight: "700",
                marginTop: RFValue(8),
                textAlign: "center",
                fontSize: RFValue(13),
              }}
            >
              Report New Wound
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowWoundTabQuickCounselling(true)}
            style={{
              flex: 1,
              backgroundColor: "#ECFDF5",
              borderStyle: "dashed",
              borderWidth: 2,
              borderColor: "#059669",
              borderRadius: RFValue(16),
              padding: RFValue(16),
              alignItems: "center",
            }}
          >
            <Ionicons name="videocam" size={RFValue(28)} color="#059669" />
            <Text
              style={{
                color: "#059669",
                fontWeight: "700",
                marginTop: RFValue(8),
                textAlign: "center",
                fontSize: RFValue(13),
              }}
            >
              Quick Counselling
            </Text>
            <Text
              style={{
                color: "#6B7280",
                fontSize: RFValue(10),
                marginTop: RFValue(4),
                textAlign: "center",
              }}
            >
              ₹25 · text only, no photo
            </Text>
          </TouchableOpacity>
        </View>

        <Text
          style={{
            fontSize: RFValue(16),
            fontWeight: "800",
            color: "#1E1B4B",
            marginBottom: RFValue(12),
          }}
        >
          Your Wound Reports
        </Text>

        {wounds && wounds.length > 0 ? (
          wounds.map((w) => (
            <TouchableOpacity
              key={w.id}
              onPress={() => onSelectWound(w.id)}
              style={{
                backgroundColor: "#FFF",
                borderRadius: RFValue(16),
                padding: RFValue(16),
                marginBottom: RFValue(12),
                shadowColor: "#000",
                shadowOpacity: 0.05,
                elevation: 2,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: RFValue(50),
                  height: RFValue(50),
                  borderRadius: RFValue(10),
                  backgroundColor: "#F3F4F6",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(12),
                  overflow: "hidden",
                }}
              >
                {w.imageUrl ? (
                  <Image
                    source={{ uri: w.imageUrl }}
                    style={{ width: RFValue(50), height: RFValue(50) }}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons
                    name="bandage-outline"
                    size={RFValue(24)}
                    color="#4338CA"
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: RFValue(15),
                    fontWeight: "700",
                    color: "#1E1B4B",
                  }}
                >
                  {w.description}
                </Text>
                <Text style={{ fontSize: RFValue(12), color: "#6B7280" }}>
                  {w.date}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor:
                    w.status === "Medication Prescribed"
                      ? "#ECFDF5"
                      : "#FEF3C7",
                  paddingHorizontal: RFValue(8),
                  paddingVertical: RFValue(4),
                  borderRadius: RFValue(8),
                }}
              >
                <Text
                  style={{
                    color:
                      w.status === "Medication Prescribed"
                        ? "#059669"
                        : "#D97706",
                    fontSize: RFValue(10),
                    fontWeight: "700",
                  }}
                >
                  {w.status}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={{ alignItems: "center", marginTop: RFValue(40) }}>
            <Ionicons
              name="medkit-outline"
              size={RFValue(48)}
              color="#E5E7EB"
            />
            <Text style={{ color: "#9CA3AF", marginTop: RFValue(12) }}>
              No wound reports yet
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const NewWoundScreen = ({ onBack, setWounds, wounds }) => {
  const [desc, setDesc] = useState("");
  const [image, setImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [selectedDoctorUserId, setSelectedDoctorUserId] = useState(null);
  const submitInFlightRef = useRef(false);
  const { createWoundReport, fetchApprovedDoctors } = useAppData();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchApprovedDoctors();
        if (!cancelled) setDoctors(Array.isArray(list) ? list : []);
      } catch (error) {
        console.log("load doctors for wound report:", error);
        if (!cancelled) setDoctors([]);
      } finally {
        if (!cancelled) setDoctorsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!submitting) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [submitting]);

  const pickWoundPhoto = async (source) => {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission?.granted) {
          Alert.alert(
            "Permission needed",
            "Please allow camera access to take a photo.",
          );
          return;
        }
      } else {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission?.granted) {
          Alert.alert(
            "Permission needed",
            "Please allow photo library access to pick a photo.",
          );
          return;
        }
      }
      const pickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (!result || result.canceled) return;
      const asset = result.assets?.[0];
      if (asset?.uri) setImage(asset);
    } catch (error) {
      console.log("pickWoundPhoto error:", error);
      Alert.alert("Photo", error?.message || "Could not add photo.");
    }
  };

  const handleSubmit = async () => {
    if (submitInFlightRef.current || submitting) return;
    if (!desc.trim()) return;
    if (!selectedDoctorUserId) {
      Alert.alert(
        "Select a doctor",
        "Choose which doctor should receive this wound report.",
      );
      return;
    }
    submitInFlightRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      await createWoundReport({
        description: desc.trim(),
        image,
        doctorUserId: selectedDoctorUserId,
      });
      onBack();
    } catch (error) {
      console.log("Create wound error:", error);
      setSubmitError(error?.message || "Unable to submit wound report");
      setSubmitting(false);
      submitInFlightRef.current = false;
    }
  };

  const handleBack = () => {
    if (submitInFlightRef.current || submitting) return;
    onBack();
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#FFF" }}
      edges={["left", "right"]}
    >
      <Modal visible={submitting} transparent animationType="fade">
        <GlassOverlay>
          <View
            style={{
              backgroundColor: "#FFF",
              borderRadius: RFValue(20),
              paddingVertical: RFValue(28),
              paddingHorizontal: RFValue(32),
              alignItems: "center",
              maxWidth: 320,
              width: "100%",
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowOffset: { width: 0, height: 8 },
              shadowRadius: 24,
              elevation: 16,
            }}
          >
            <ActivityIndicator size="large" color="#4338CA" />
            <Text
              style={{
                marginTop: RFValue(18),
                fontSize: RFValue(16),
                fontWeight: "800",
                color: "#1E1B4B",
                textAlign: "center",
              }}
            >
              Sending your report…
            </Text>
            <Text
              style={{
                marginTop: RFValue(10),
                fontSize: RFValue(13),
                color: "#6B7280",
                textAlign: "center",
              }}
            >
              Please wait. You will return to Wound Tracker when this finishes.
            </Text>
          </View>
        </GlassOverlay>
      </Modal>
      <View
        style={{
          padding: RFValue(20),
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity
          onPress={handleBack}
          disabled={submitting}
          style={{ marginRight: RFValue(16), opacity: submitting ? 0.35 : 1 }}
        >
          <Ionicons name="arrow-back" size={RFValue(24)} color="#1E1B4B" />
        </TouchableOpacity>
        <Text
          style={{ fontSize: RFValue(18), fontWeight: "800", color: "#1E1B4B" }}
        >
          Report Wound
        </Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!submitting}
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{
          padding: RFValue(20),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        <Text
          style={{
            fontSize: RFValue(14),
            fontWeight: "700",
            color: "#374151",
            marginBottom: RFValue(10),
          }}
        >
          Wound Photo
        </Text>
        <TouchableOpacity
          disabled={submitting}
          style={{
            width: "100%",
            height: RFValue(200),
            backgroundColor: "#F9FAFB",
            borderRadius: RFValue(16),
            justifyContent: "center",
            alignItems: "center",
            marginBottom: RFValue(20),
            borderWidth: 2,
            borderColor: "#E5E7EB",
            borderStyle: "dashed",
            overflow: "hidden",
            opacity: submitting ? 0.55 : 1,
          }}
          activeOpacity={0.85}
          onPress={() =>
            Alert.alert("Wound photo", "Choose a source", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Camera",
                onPress: () => pickWoundPhoto("camera"),
              },
              {
                text: "Photo library",
                onPress: () => pickWoundPhoto("library"),
              },
            ])
          }
        >
          {image?.uri ? (
            <Image
              source={{ uri: image.uri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ alignItems: "center", padding: RFValue(16) }}>
              <Ionicons name="camera" size={RFValue(48)} color="#9CA3AF" />
              <Text style={{ color: "#9CA3AF", marginTop: RFValue(8) }}>
                Tap to capture or upload photo
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <Text
          style={{
            fontSize: RFValue(14),
            fontWeight: "700",
            color: "#374151",
            marginBottom: RFValue(10),
          }}
        >
          Description
        </Text>
        <TextInput
          multiline
          placeholder="Describe how it happened, pain level, etc."
          style={{
            backgroundColor: "#F9FAFB",
            borderRadius: RFValue(16),
            padding: RFValue(16),
            height: RFValue(120),
            textAlignVertical: "top",
            fontSize: RFValue(14),
            color: "#1E1B4B",
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
          value={desc}
          onChangeText={setDesc}
          editable={!submitting}
        />

        <Text
          style={{
            fontSize: RFValue(14),
            fontWeight: "700",
            color: "#374151",
            marginBottom: RFValue(10),
            marginTop: RFValue(8),
          }}
        >
          Select doctor
        </Text>
        {doctorsLoading ? (
          <View
            style={{
              paddingVertical: RFValue(20),
              alignItems: "center",
            }}
          >
            <ActivityIndicator color="#4338CA" />
            <Text style={{ color: "#9CA3AF", marginTop: RFValue(8) }}>
              Loading doctors…
            </Text>
          </View>
        ) : doctors.length === 0 ? (
          <Text style={{ color: "#DC2626", marginBottom: RFValue(12) }}>
            No approved doctors are available. Try again later.
          </Text>
        ) : (
          doctors.map((d) => {
            const selected = selectedDoctorUserId === d.userId;
            return (
              <TouchableOpacity
                key={d.userId || d.profileId}
                disabled={submitting}
                onPress={() => !submitting && setSelectedDoctorUserId(d.userId)}
                activeOpacity={0.85}
                style={{
                  padding: RFValue(14),
                  borderRadius: RFValue(14),
                  borderWidth: 2,
                  borderColor: selected ? "#4338CA" : "#E5E7EB",
                  backgroundColor: selected ? "#EEF2FF" : "#FFF",
                  marginBottom: RFValue(10),
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(15),
                    fontWeight: "700",
                    color: "#1E1B4B",
                  }}
                >
                  {d.name}
                </Text>
                <Text
                  style={{
                    fontSize: RFValue(12),
                    color: "#6B7280",
                    marginTop: RFValue(4),
                  }}
                >
                  {d.specialty}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        {submitError ? (
          <Text
            style={{
              marginTop: RFValue(14),
              color: "#DC2626",
              fontWeight: "600",
            }}
          >
            {submitError}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={{
            backgroundColor: submitting ? "#6366F1" : "#4338CA",
            borderRadius: RFValue(16),
            paddingVertical: RFValue(16),
            alignItems: "center",
            marginTop: RFValue(30),
            opacity: submitting ? 0.92 : 1,
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
          {submitting ? (
            <ActivityIndicator
              color="#FFF"
              style={{ marginRight: RFValue(10) }}
            />
          ) : null}
          <Text
            style={{
              color: "#FFF",
              fontWeight: "700",
              fontSize: RFValue(16),
            }}
          >
            {submitting ? "Submitting…" : "Submit to Doctor"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const WoundDetailScreen = ({
  wound,
  onBack,
  userRole,
  setWounds,
  setMedOrders,
}) => {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showPrescriptionViewer, setShowPrescriptionViewer] = useState(false);
  const [loadingChat, setLoadingChat] = useState(true);
  const [localWound, setLocalWound] = useState(wound);
  const conversationIdRef = useRef(wound?.conversation || null);
  const {
    currentUserId,
    currentUser,
    loadConversationMessages,
    ensureConversationForWound,
    sendConversationMessage,
    prescribeForWound,
    refreshAllData,
    updateOrderStatus,
    medOrders,
    prescriptions,
  } = useAppData();
  const linkedPrescription = React.useMemo(() => {
    if (!wound?.id) return null;
    return (
      (prescriptions || [])
        .filter((record) => record.wound === wound.id)
        .sort(
          (left, right) =>
            new Date(right.raw?.created || 0).getTime() -
            new Date(left.raw?.created || 0).getTime(),
        )[0] || null
    );
  }, [prescriptions, wound?.id]);

  const [androidComposerLift, setAndroidComposerLift] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const onShow = Keyboard.addListener("keyboardDidShow", (e) => {
      setAndroidComposerLift(androidComposerKeyboardLift(e));
    });
    const onHide = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidComposerLift(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  useEffect(() => {
    conversationIdRef.current = localWound?.conversation || null;
  }, [localWound?.conversation]);

  useEffect(() => {
    if (!wound?.id) return;
    setLocalWound((prev) => (prev?.id === wound.id ? prev : wound));
  }, [wound?.id]);

  const hydrateConversation = async (woundLike) => {
    const target = woundLike || localWound;
    if (!target?.id) return;
    try {
      setLoadingChat(true);
      const conversation = await ensureConversationForWound(target, {
        includeCurrentUser: userRole !== "patient",
      });
      const messages = await loadConversationMessages(conversation.id);
      setChat(messages);
      setLocalWound((prev) => ({ ...prev, conversation: conversation.id }));
    } catch (error) {
      console.log("Hydrate wound conversation error:", error);
    } finally {
      setLoadingChat(false);
    }
  };

  useEffect(() => {
    if (!wound?.id) return;
    let mounted = true;
    let chatReloadTimer = null;

    hydrateConversation(wound);

    const woundIdForCleanup = wound.id;

    const subscribe = async () => {
      try {
        await pb.collection("messages").subscribe("*", async ({ record }) => {
          if (!mounted) return;
          const conversationId = conversationIdRef.current;
          if (!conversationId || record?.conversation !== conversationId)
            return;
          if (chatReloadTimer) clearTimeout(chatReloadTimer);
          chatReloadTimer = setTimeout(async () => {
            if (!mounted) return;
            try {
              const messages = await loadConversationMessages(conversationId);
              if (mounted) setChat(messages);
            } catch (e) {
              console.log("Wound detail chat reload error:", e);
            }
          }, 350);
        });
        await pb
          .collection("wounds")
          .subscribe(woundIdForCleanup, async ({ record }) => {
            if (!mounted) return;
            const refreshedWound = mapWoundRecord({
              ...record,
              expand: {
                patient: record.expand?.patient,
              },
            });
            setLocalWound((prev) => ({
              ...prev,
              ...refreshedWound,
              patientName: prev?.patientName || refreshedWound.patientName,
            }));
          });
      } catch (error) {
        console.log("Wound detail subscribe error:", error);
      }
    };

    subscribe();

    return () => {
      mounted = false;
      if (chatReloadTimer) clearTimeout(chatReloadTimer);
      pb.collection("messages").unsubscribe("*");
      pb.collection("wounds").unsubscribe(woundIdForCleanup);
    };
  }, [wound?.id]);

  const sendMessage = async () => {
    if (!message.trim()) return;
    const conversation = await ensureConversationForWound(localWound, {
      includeCurrentUser: userRole !== "patient",
    });
    const text = message.trim();
    const created = await sendConversationMessage(conversation.id, text);
    if (created) {
      setMessage("");
      setChat((prev) => {
        if (prev.some((item) => item.id === created.id)) return prev;
        return [...prev, created];
      });
    } else {
      setMessage(text);
    }
  };

  const woundOrder = (medOrders || []).find(
    (order) => order.wound === localWound.id,
  );

  if (showPrescriptionViewer) {
    return (
      <PrescriptionScreen
        onBack={() => setShowPrescriptionViewer(false)}
        highlightPrescriptionId={linkedPrescription?.id || null}
      />
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["left", "right"]}
    >
      <View
        style={{
          padding: RFValue(20),
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#FFF",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity onPress={onBack} style={{ marginRight: RFValue(16) }}>
          <Ionicons name="arrow-back" size={RFValue(24)} color="#1E1B4B" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: RFValue(16),
              fontWeight: "800",
              color: "#1E1B4B",
            }}
          >
            Wound Detail
          </Text>
          <Text style={{ fontSize: RFValue(12), color: "#6B7280" }}>
            Status: {localWound.status}
          </Text>
        </View>
        {userRole === "doctor" &&
          localWound.status !== "Medication Prescribed" && (
            <TouchableOpacity
              onPress={() => setShowPrescriptionModal(true)}
              style={{
                backgroundColor: "#059669",
                paddingHorizontal: RFValue(12),
                paddingVertical: RFValue(8),
                borderRadius: RFValue(10),
              }}
            >
              <Text
                style={{
                  color: "#FFF",
                  fontWeight: "700",
                  fontSize: RFValue(12),
                }}
              >
                Prescribe
              </Text>
            </TouchableOpacity>
          )}
        {userRole === "patient" && linkedPrescription ? (
          <TouchableOpacity
            onPress={() => setShowPrescriptionViewer(true)}
            style={{
              backgroundColor: "#4338CA",
              paddingHorizontal: RFValue(12),
              paddingVertical: RFValue(8),
              borderRadius: RFValue(10),
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons
              name="document-text-outline"
              size={RFValue(14)}
              color="#FFF"
              style={{ marginRight: RFValue(6) }}
            />
            <Text
              style={{
                color: "#FFF",
                fontWeight: "700",
                fontSize: RFValue(12),
              }}
            >
              View prescription
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, minHeight: 0 }}
        keyboardVerticalOffset={
          Platform.OS === "ios" ? insets.top + RFValue(56) : 0
        }
      >
        <ScrollView
          style={{ flex: 1, minHeight: 0, backgroundColor: "#F8FAFC" }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: RFValue(8),
            backgroundColor: "#F8FAFC",
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ padding: RFValue(16) }}>
            <View
              style={{
                width: "100%",
                height: RFValue(200),
                backgroundColor: "#E5E7EB",
                borderRadius: RFValue(16),
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="bandage" size={RFValue(64)} color="#9CA3AF" />
              <Text style={{ color: "#6B7280", marginTop: RFValue(8) }}>
                Wound Image
              </Text>
            </View>
            <View
              style={{
                marginTop: RFValue(12),
                backgroundColor: "#FFF",
                padding: RFValue(14),
                borderRadius: RFValue(12),
              }}
            >
              <Text
                style={{
                  fontSize: RFValue(14),
                  fontWeight: "700",
                  color: "#1E1B4B",
                }}
              >
                Patient Note:
              </Text>
              <Text
                style={{
                  fontSize: RFValue(13),
                  color: "#6B7280",
                  marginTop: RFValue(4),
                }}
              >
                {localWound.description}
              </Text>
            </View>

            {woundOrder ? (
              <View
                style={{
                  marginTop: RFValue(12),
                  backgroundColor: "#F5F3FF",
                  padding: RFValue(14),
                  borderRadius: RFValue(12),
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(13),
                    fontWeight: "700",
                    color: "#6D28D9",
                  }}
                >
                  Pharmacy Order
                </Text>
                <Text
                  style={{
                    color: "#5B21B6",
                    marginTop: RFValue(4),
                    fontSize: RFValue(12),
                  }}
                >
                  {woundOrder.items}
                </Text>
                <Text
                  style={{
                    color: "#8B5CF6",
                    marginTop: RFValue(4),
                    fontSize: RFValue(12),
                    fontWeight: "700",
                  }}
                >
                  {woundOrder.status}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ padding: RFValue(16) }}>
            <Text
              style={{
                fontSize: RFValue(14),
                fontWeight: "800",
                color: "#1E1B4B",
                marginBottom: RFValue(12),
              }}
            >
              Doctor Discussion
            </Text>
            {loadingChat ? (
              <Text style={{ color: "#6B7280" }}>Loading chat...</Text>
            ) : chat.length > 0 ? (
              chat.map((c) => {
                const isMine = c.senderId && c.senderId === currentUserId;
                const isSystem = c.kind === "system";
                const hasImage = !!c.imageUrl;
                return (
                  <View
                    key={c.id}
                    style={{
                      alignSelf: isSystem
                        ? "center"
                        : isMine
                          ? "flex-end"
                          : "flex-start",
                      backgroundColor: isSystem
                        ? "#F3F4F6"
                        : hasImage
                          ? isMine
                            ? "#EEF2FF"
                            : "#FFF"
                          : isMine
                            ? "#4338CA"
                            : "#FFF",
                      padding: hasImage ? RFValue(6) : RFValue(12),
                      borderRadius: RFValue(12),
                      marginBottom: RFValue(8),
                      maxWidth: isSystem ? "92%" : "80%",
                      shadowColor: "#000",
                      shadowOpacity: 0.03,
                      elevation: 1,
                    }}
                  >
                    {!isSystem && !isMine ? (
                      <Text
                        style={{
                          color: "#6B7280",
                          fontSize: RFValue(10),
                          fontWeight: "700",
                          marginBottom: RFValue(4),
                        }}
                      >
                        {c.senderName}
                      </Text>
                    ) : null}
                    {hasImage ? (
                      <Image
                        source={{ uri: c.imageUrl }}
                        style={{
                          width: RFValue(240),
                          maxWidth: "100%",
                          height: RFValue(170),
                          borderRadius: RFValue(10),
                          backgroundColor: "#E5E7EB",
                        }}
                        resizeMode="cover"
                      />
                    ) : null}

                    {c.text ? (
                      <Text
                        style={{
                          color: isSystem
                            ? "#6B7280"
                            : hasImage
                              ? "#1E1B4B"
                              : isMine
                                ? "#FFF"
                                : "#1E1B4B",
                          fontSize: RFValue(13),
                          textAlign: isSystem ? "center" : "left",
                          marginTop: hasImage ? RFValue(10) : 0,
                        }}
                      >
                        {c.text}
                      </Text>
                    ) : null}
                    <Text
                      style={{
                        color: isSystem
                          ? "#9CA3AF"
                          : hasImage
                            ? "#9CA3AF"
                            : isMine
                              ? "rgba(255,255,255,0.7)"
                              : "#9CA3AF",
                        fontSize: RFValue(9),
                        marginTop: RFValue(4),
                        textAlign: isSystem ? "center" : "right",
                      }}
                    >
                      {c.time}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={{ color: "#6B7280" }}>No messages yet.</Text>
            )}
          </View>
        </ScrollView>

        <View
          style={{
            padding: RFValue(12),
            marginBottom: androidComposerLift,
            backgroundColor: "#FFF",
            borderTopWidth: 1,
            borderTopColor: "#F3F4F6",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <TextInput
            style={{
              flex: 1,
              backgroundColor: "#F9FAFB",
              borderRadius: RFValue(24),
              paddingHorizontal: RFValue(16),
              paddingVertical: RFValue(12),
              fontSize: RFValue(14),
              borderWidth: 1,
              borderColor: "#E5E7EB",
            }}
            placeholder="Type a message..."
            value={message}
            onChangeText={setMessage}
          />
          <TouchableOpacity
            onPress={sendMessage}
            style={{
              marginLeft: RFValue(10),
              backgroundColor: "#4338CA",
              width: RFValue(46),
              height: RFValue(46),
              borderRadius: RFValue(23),
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="send" size={RFValue(20)} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {showPrescriptionModal && (
        <PrescriptionModal
          onBack={() => setShowPrescriptionModal(false)}
          onConfirm={async (prescription) => {
            try {
              await prescribeForWound(localWound, prescription);
            } catch (error) {
              Alert.alert(
                "Prescription not sent",
                error?.message ||
                  "Unable to save the prescription. Try again or check PocketBase rules.",
              );
              throw error;
            }
            try {
              const conversation = await ensureConversationForWound(
                localWound,
                {
                  includeCurrentUser: true,
                },
              );
              const messages = await loadConversationMessages(conversation.id);
              setChat(messages);
              setLocalWound((prev) => ({
                ...prev,
                status: "Medication Prescribed",
                conversation: conversation.id,
              }));
            } catch (postError) {
              console.log("Post-prescription UI refresh error:", postError);
              setLocalWound((prev) => ({
                ...prev,
                status: "Medication Prescribed",
              }));
              await refreshAllData();
            } finally {
              setShowPrescriptionModal(false);
            }
          }}
        />
      )}
    </SafeAreaView>
  );
};

const newPrescriptionLine = () => ({
  key: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  name: "",
  dosage: "",
  whenToTake: "",
  duration: "",
  frequency: "once_daily",
  mealTiming: "no_preference",
  timesOfDay: ["08:00"],
  durationDays: 7,
  notes: "",
});

// Small reusable chip-style selector for frequency / meal timing dropdowns.
const SegmentedChipRow = ({ options, value, onChange, disabled }) => (
  <View
    style={{
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: RFValue(10),
    }}
  >
    {options.map((opt) => {
      const selected = opt.id === value;
      return (
        <TouchableOpacity
          key={opt.id}
          disabled={disabled}
          onPress={() => onChange(opt.id)}
          style={{
            paddingHorizontal: RFValue(12),
            paddingVertical: RFValue(8),
            borderRadius: RFValue(20),
            borderWidth: 1,
            borderColor: selected ? "#4338CA" : "#E5E7EB",
            backgroundColor: selected ? "#EEF2FF" : "#FFF",
            marginRight: RFValue(8),
            marginBottom: RFValue(8),
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              fontSize: RFValue(11),
              fontWeight: selected ? "800" : "600",
              color: selected ? "#4338CA" : "#374151",
            }}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const PrescriptionModal = ({ onBack, onConfirm }) => {
  const { runSideEffectCheck, patientProfile: currentPatientProfile } =
    useAppData();
  const [disease, setDisease] = useState("");
  const [lines, setLines] = useState(() => [newPrescriptionLine()]);
  const [sending, setSending] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [checkingSideEffects, setCheckingSideEffects] = useState(false);
  const lastSideEffectItemsSig = useRef("");
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updateLine = (key, field, value) => {
    setLines((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, [field]: value };
        // When frequency changes, seed the times-of-day from the preset.
        if (field === "frequency") {
          const preset = defaultTimesForFrequency(value);
          if (preset.length) next.timesOfDay = [...preset];
        }
        // When duration text changes, re-derive `durationDays`.
        if (field === "duration") {
          next.durationDays = parseDurationDays(value) || next.durationDays;
        }
        return next;
      }),
    );
  };

  const updateLineTime = (key, index, value) => {
    setLines((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const times = [...(row.timesOfDay || [])];
        times[index] = value;
        return { ...row, timesOfDay: times };
      }),
    );
  };

  const addLineTime = (key) => {
    setLines((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        return {
          ...row,
          timesOfDay: [...(row.timesOfDay || []), "08:00"],
        };
      }),
    );
  };

  const removeLineTime = (key, index) => {
    setLines((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const times = [...(row.timesOfDay || [])];
        times.splice(index, 1);
        return { ...row, timesOfDay: times };
      }),
    );
  };

  const addLine = () => setLines((prev) => [...prev, newPrescriptionLine()]);

  const removeLine = (key) => {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((row) => row.key !== key),
    );
  };

  // Step 9 - Debounced side-effect check against the AI endpoint (or stub).
  // Runs whenever the list of medicines changes so the doctor can see
  // warnings before hitting "Send to patient".
  useEffect(() => {
    const items = lines
      .map((line) => ({ name: line.name.trim() }))
      .filter((item) => item.name);
    if (!items.length) {
      setWarnings([]);
      lastSideEffectItemsSig.current = "";
      return undefined;
    }
    const itemsSig = items
      .map((i) => i.name.toLowerCase())
      .sort()
      .join("|");
    let cancelled = false;
    const handle = setTimeout(async () => {
      if (cancelled) return;
      setCheckingSideEffects(true);
      try {
        const result = await runSideEffectCheck({
          items,
          patient: currentPatientProfile || {},
        });
        if (!cancelled) {
          setWarnings(Array.isArray(result) ? result : []);
          lastSideEffectItemsSig.current = itemsSig;
        }
      } finally {
        if (!cancelled) setCheckingSideEffects(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [lines, runSideEffectCheck, currentPatientProfile]);

  const handleConfirm = async () => {
    const diagnosis = disease.trim();
    if (!diagnosis) {
      Alert.alert(
        "Missing condition",
        "Enter the disease or diagnosis this prescription is for.",
      );
      return;
    }
    const normalized = lines
      .map((line) => ({
        name: String(line.name || "").trim(),
        dosage: String(line.dosage || "").trim(),
        whenToTake: String(line.whenToTake || "").trim(),
        duration: String(line.duration || "").trim(),
        frequency: String(line.frequency || "once_daily"),
        mealTiming: String(line.mealTiming || "no_preference"),
        timesOfDay: Array.isArray(line.timesOfDay)
          ? line.timesOfDay
              .map((time) => String(time).trim())
              .filter((time) => isValidHHMM(time))
          : [],
        durationDays:
          parseDurationDays(line.duration) ||
          Math.max(1, Number(line.durationDays || 0) || 1),
        notes: String(line.notes || "").trim(),
      }))
      .filter((line) => line.name);
    if (!normalized.length) {
      Alert.alert(
        "Add medicine",
        "Enter at least one medicine name before sending.",
      );
      return;
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const result = onConfirm({ disease: diagnosis, lines: normalized });
      if (result && typeof result.then === "function") {
        await result;
      }
    } catch {
      // Parent already surfaces the failure.
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setSending(false);
    }
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: RFValue(10),
    paddingHorizontal: RFValue(12),
    paddingVertical: Platform.OS === "ios" ? RFValue(10) : RFValue(8),
    fontSize: RFValue(14),
    color: "#1E1B4B",
    backgroundColor: "#F9FAFB",
  };

  const labelStyle = {
    fontSize: RFValue(11),
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: RFValue(6),
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
      }}
    >
      <View
        style={{
          backgroundColor: "#FFF",
          borderTopLeftRadius: RFValue(24),
          borderTopRightRadius: RFValue(24),
          padding: RFValue(24),
          maxHeight: "92%",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: RFValue(16),
          }}
        >
          <Text
            style={{
              fontSize: RFValue(18),
              fontWeight: "800",
              color: "#1E1B4B",
            }}
          >
            Send prescription
          </Text>
          <TouchableOpacity onPress={onBack} disabled={sending}>
            <Ionicons
              name="close"
              size={RFValue(28)}
              color={sending ? "#D1D5DB" : "#1E1B4B"}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: RFValue(460) }}
          scrollEnabled={!sending}
        >
          <Text style={labelStyle}>Condition / diagnosis (required)</Text>
          <TextInput
            style={[inputStyle, { marginBottom: RFValue(16) }]}
            placeholder="e.g. Post-operative wound infection"
            placeholderTextColor="#9CA3AF"
            value={disease}
            onChangeText={setDisease}
            editable={!sending}
          />

          {lines.map((line, index) => (
            <View
              key={line.key}
              style={{
                marginBottom: RFValue(14),
                padding: RFValue(14),
                borderRadius: RFValue(14),
                backgroundColor: "#F9FAFB",
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: RFValue(10),
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(13),
                    fontWeight: "800",
                    color: "#374151",
                  }}
                >
                  Medicine {index + 1}
                </Text>
                {lines.length > 1 ? (
                  <TouchableOpacity
                    onPress={() => removeLine(line.key)}
                    disabled={sending}
                  >
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        color: sending ? "#D1D5DB" : "#DC2626",
                      }}
                    >
                      Remove
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text style={labelStyle}>Medicine name</Text>
              <TextInput
                style={[inputStyle, { marginBottom: RFValue(10) }]}
                placeholder="e.g. Amoxicillin"
                placeholderTextColor="#9CA3AF"
                value={line.name}
                onChangeText={(value) => updateLine(line.key, "name", value)}
                editable={!sending}
              />

              <Text style={labelStyle}>Dosage</Text>
              <TextInput
                style={[inputStyle, { marginBottom: RFValue(10) }]}
                placeholder="e.g. 500 mg, 1 tablet"
                placeholderTextColor="#9CA3AF"
                value={line.dosage}
                onChangeText={(value) => updateLine(line.key, "dosage", value)}
                editable={!sending}
              />

              <Text style={labelStyle}>Frequency</Text>
              <SegmentedChipRow
                options={FREQUENCY_OPTIONS}
                value={line.frequency}
                onChange={(value) => updateLine(line.key, "frequency", value)}
                disabled={sending}
              />

              <Text style={labelStyle}>Meal timing</Text>
              <SegmentedChipRow
                options={MEAL_TIMING_OPTIONS}
                value={line.mealTiming}
                onChange={(value) => updateLine(line.key, "mealTiming", value)}
                disabled={sending}
              />

              {line.frequency !== "as_needed" ? (
                <>
                  <Text style={labelStyle}>
                    Times of day (HH:mm - edit or add)
                  </Text>
                  {(line.timesOfDay || []).map((time, timeIdx) => (
                    <View
                      key={`${line.key}-t-${timeIdx}`}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: RFValue(8),
                      }}
                    >
                      <TextInput
                        style={[inputStyle, { flex: 1 }]}
                        placeholder="08:00"
                        placeholderTextColor="#9CA3AF"
                        value={time}
                        onChangeText={(value) =>
                          updateLineTime(line.key, timeIdx, value)
                        }
                        editable={!sending}
                        keyboardType={
                          Platform.OS === "ios"
                            ? "numbers-and-punctuation"
                            : "default"
                        }
                      />
                      {(line.timesOfDay || []).length > 1 ? (
                        <TouchableOpacity
                          onPress={() => removeLineTime(line.key, timeIdx)}
                          disabled={sending}
                          style={{ marginLeft: 8, padding: 6 }}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={18}
                            color={sending ? "#D1D5DB" : "#DC2626"}
                          />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                  <TouchableOpacity
                    onPress={() => addLineTime(line.key)}
                    disabled={sending}
                    style={{
                      paddingVertical: RFValue(6),
                      marginBottom: RFValue(10),
                    }}
                  >
                    <Text
                      style={{
                        color: sending ? "#D1D5DB" : "#4338CA",
                        fontWeight: "700",
                        fontSize: RFValue(12),
                      }}
                    >
                      + Add another time
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              <Text style={labelStyle}>Duration</Text>
              <TextInput
                style={[inputStyle, { marginBottom: RFValue(10) }]}
                placeholder="e.g. 7 days"
                placeholderTextColor="#9CA3AF"
                value={line.duration}
                onChangeText={(value) =>
                  updateLine(line.key, "duration", value)
                }
                editable={!sending}
              />

              <Text style={labelStyle}>Notes (optional)</Text>
              <TextInput
                style={[
                  inputStyle,
                  {
                    minHeight: RFValue(60),
                    textAlignVertical: "top",
                  },
                ]}
                placeholder="e.g. Take with a full glass of water"
                placeholderTextColor="#9CA3AF"
                value={line.notes}
                onChangeText={(value) => updateLine(line.key, "notes", value)}
                editable={!sending}
                multiline
              />
            </View>
          ))}

          <TouchableOpacity
            onPress={addLine}
            disabled={sending}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: RFValue(12),
              marginBottom: RFValue(8),
              opacity: sending ? 0.45 : 1,
            }}
          >
            <Ionicons name="add-circle-outline" size={22} color="#4338CA" />
            <Text
              style={{
                marginLeft: 8,
                fontSize: RFValue(14),
                fontWeight: "700",
                color: "#4338CA",
              }}
            >
              Add another medicine
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {(() => {
          const medSig = lines
            .map((l) =>
              String(l.name || "")
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean)
            .sort()
            .join("|");
          const checkDoneForCurrentMeds =
            medSig.length > 0 &&
            medSig === lastSideEffectItemsSig.current &&
            !checkingSideEffects;
          return (
            <View style={{ marginTop: RFValue(10), marginBottom: RFValue(4) }}>
              {warnings.length > 0 ? (
                <View
                  style={{
                    padding: RFValue(12),
                    borderRadius: RFValue(12),
                    backgroundColor: "#FEF3C7",
                    borderWidth: 1,
                    borderColor: "#F59E0B",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: RFValue(6),
                    }}
                  >
                    <Ionicons name="alert-circle" size={18} color="#B45309" />
                    <Text
                      style={{
                        marginLeft: 6,
                        fontWeight: "800",
                        color: "#B45309",
                        fontSize: RFValue(12),
                      }}
                    >
                      AI side-effect check ({warnings.length})
                    </Text>
                  </View>
                  {warnings.map((w, idx) => (
                    <Text
                      key={`${w.medicine}-${idx}`}
                      style={{
                        fontSize: RFValue(11),
                        color: "#92400E",
                        marginBottom: 4,
                      }}
                    >
                      • {w.medicine}: {w.message}
                    </Text>
                  ))}
                </View>
              ) : checkingSideEffects ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: RFValue(8),
                  }}
                >
                  <ActivityIndicator size="small" color="#4338CA" />
                  <Text
                    style={{
                      marginLeft: RFValue(10),
                      fontSize: RFValue(12),
                      color: "#4B5563",
                      fontWeight: "600",
                    }}
                  >
                    Checking side effects (AI)…
                  </Text>
                </View>
              ) : checkDoneForCurrentMeds ? (
                <Text
                  style={{
                    fontSize: RFValue(11),
                    color: "#6B7280",
                    paddingVertical: RFValue(6),
                  }}
                >
                  AI quick check: no interaction warnings for the medicine names
                  entered. This is not a full clinical review - confirm with
                  references as usual.
                </Text>
              ) : null}
            </View>
          );
        })()}

        <TouchableOpacity
          onPress={handleConfirm}
          disabled={sending}
          style={{
            backgroundColor: sending ? "#9CA3AF" : "#4338CA",
            borderRadius: RFValue(14),
            paddingVertical: RFValue(16),
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            marginTop: RFValue(12),
            opacity: sending ? 0.92 : 1,
          }}
        >
          {sending ? (
            <ActivityIndicator color="#FFF" style={{ marginRight: 10 }} />
          ) : null}
          <Text
            style={{ color: "#FFF", fontWeight: "700", fontSize: RFValue(16) }}
          >
            {sending ? "Sending..." : "Send to patient"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const DoctorWoundsScreen = () => {
  const {
    wounds,
    setWounds,
    setMedOrders,
    doctorSelectedWoundId,
    setDoctorSelectedWoundId,
  } = useAppData();
  const selectedWound = (wounds || []).find(
    (item) => item.id === doctorSelectedWoundId,
  );
  const onSelectWound = setDoctorSelectedWoundId;
  const onClearWoundSelection = () => setDoctorSelectedWoundId(null);

  if (selectedWound)
    return (
      <WoundDetailScreen
        key={selectedWound.id}
        wound={selectedWound}
        onBack={() => onClearWoundSelection()}
        userRole="doctor"
        setWounds={setWounds}
        setMedOrders={setMedOrders}
      />
    );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <Text
          style={{ fontSize: RFValue(20), fontWeight: "800", color: "#1E1B4B" }}
        >
          Wound Reviews
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        {wounds && wounds.length > 0 ? (
          wounds.map((w) => (
            <TouchableOpacity
              key={w.id}
              onPress={() => onSelectWound(w.id)}
              style={{
                backgroundColor: "#FFF",
                borderRadius: RFValue(16),
                padding: RFValue(16),
                marginBottom: RFValue(12),
                shadowColor: "#000",
                shadowOpacity: 0.05,
                elevation: 2,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: RFValue(50),
                  height: RFValue(50),
                  borderRadius: RFValue(10),
                  backgroundColor: "#E0F2FE",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(12),
                }}
              >
                <Ionicons name="person" size={RFValue(24)} color="#0284C7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: RFValue(15),
                    fontWeight: "700",
                    color: "#1E1B4B",
                  }}
                >
                  {w.patientName}
                </Text>
                <Text style={{ fontSize: RFValue(12), color: "#6B7280" }}>
                  {w.description}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: "#EEF2FF",
                  paddingHorizontal: RFValue(8),
                  paddingVertical: RFValue(4),
                  borderRadius: RFValue(8),
                }}
              >
                <Text
                  style={{
                    color: "#4338CA",
                    fontSize: RFValue(10),
                    fontWeight: "700",
                  }}
                >
                  {w.status}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={{ alignItems: "center", marginTop: RFValue(40) }}>
            <Ionicons
              name="checkmark-circle-outline"
              size={RFValue(48)}
              color="#E5E7EB"
            />
            <Text style={{ color: "#9CA3AF", marginTop: RFValue(12) }}>
              No wounds pending review
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const PharmacyDashboard = ({ orders }) => {
  const [activeTab, setActiveTab] = useState("Pending");
  const { updateOrderStatus } = useAppData();
  const filteredOrders = (orders || []).filter(
    (o) =>
      o.status === activeTab ||
      (activeTab === "History" && o.status !== "Pending"),
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["top", "left", "right"]}
    >
      <StatusBar barStyle="light-content" backgroundColor="#8B5CF6" />
      <View
        style={{
          backgroundColor: "#8B5CF6",
          padding: RFValue(24),
          paddingTop: safeHeaderPaddingTop(20),
          borderBottomLeftRadius: RFValue(32),
          borderBottomRightRadius: RFValue(32),
        }}
      >
        <Text
          style={{ color: "#F5F3FF", fontSize: RFValue(14), fontWeight: "600" }}
        >
          Pharmacy Portal
        </Text>
        <Text
          style={{
            color: "#FFF",
            fontSize: RFValue(24),
            fontWeight: "800",
            marginTop: RFValue(4),
          }}
        >
          MediStore Pharma
        </Text>

        <View
          style={{
            flexDirection: "row",
            marginTop: RFValue(24),
            backgroundColor: "rgba(255,255,255,0.15)",
            borderRadius: RFValue(12),
            padding: 4,
          }}
        >
          {["Pending", "History"].map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1,
                paddingVertical: RFValue(10),
                alignItems: "center",
                backgroundColor: activeTab === tab ? "#FFF" : "transparent",
                borderRadius: RFValue(10),
              }}
            >
              <Text
                style={{
                  color: activeTab === tab ? "#8B5CF6" : "#DDD",
                  fontWeight: "700",
                }}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding(),
        }}
      >
        {filteredOrders.map((o) => (
          <View
            key={o.id}
            style={{
              backgroundColor: "#FFF",
              borderRadius: RFValue(16),
              padding: RFValue(18),
              marginBottom: RFValue(12),
              shadowColor: "#000",
              shadowOpacity: 0.05,
              elevation: 2,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: RFValue(12),
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: RFValue(15),
                    fontWeight: "800",
                    color: "#1E1B4B",
                  }}
                >
                  Order #{o.id}
                </Text>
                <Text style={{ fontSize: RFValue(12), color: "#6B7280" }}>
                  {o.patient} | {o.time}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: "#F5F3FF",
                  paddingHorizontal: RFValue(10),
                  paddingVertical: RFValue(4),
                  borderRadius: RFValue(8),
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(12),
                    fontWeight: "800",
                    color: "#8B5CF6",
                  }}
                >
                  {o.total}
                </Text>
              </View>
            </View>
            <View
              style={{
                backgroundColor: "#F9FAFB",
                padding: RFValue(12),
                borderRadius: RFValue(10),
                marginBottom: RFValue(16),
              }}
            >
              <Text style={{ fontSize: RFValue(13), color: "#374151" }}>
                {o.items}
              </Text>
            </View>
            {activeTab === "Pending" ? (
              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  onPress={() => updateOrderStatus(o, "confirmed")}
                  style={{
                    flex: 1,
                    backgroundColor: "#8B5CF6",
                    paddingVertical: RFValue(12),
                    borderRadius: RFValue(10),
                    alignItems: "center",
                    marginRight: RFValue(8),
                  }}
                >
                  <Text style={{ color: "#FFF", fontWeight: "700" }}>
                    Accept & Ship
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => updateOrderStatus(o, "cancelled")}
                  style={{
                    flex: 1,
                    backgroundColor: "#FEE2E2",
                    paddingVertical: RFValue(12),
                    borderRadius: RFValue(10),
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#DC2626", fontWeight: "700" }}>
                    Reject
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="checkmark-circle" size={18} color="#059669" />
                <Text
                  style={{ color: "#059669", fontWeight: "700", marginLeft: 6 }}
                >
                  {o.status}
                </Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const PHARMACY_STATUS_STEPS = [
  { id: "pending", label: "Pending", next: "confirmed" },
  { id: "confirmed", label: "Confirmed", next: "out_for_delivery" },
  { id: "out_for_delivery", label: "Out for delivery", next: "fulfilled" },
  { id: "fulfilled", label: "Fulfilled", next: null },
  { id: "cancelled", label: "Cancelled", next: null },
];

const PharmacyOrdersScreen = ({ orders }) => {
  const { updateOrderStatus, userRole } = useAppData();
  const [busyId, setBusyId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const advanceStatus = async (order) => {
    const current = PHARMACY_STATUS_STEPS.find(
      (s) => s.id === (order.statusKey || "pending"),
    );
    const nextId = current?.next;
    if (!nextId) return;
    try {
      setBusyId(order.id);
      setErrorMessage("");
      await updateOrderStatus(order, nextId);
    } catch (error) {
      setErrorMessage(
        error?.message || "Unable to update order status. Please try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const cancelOrder = async (order) => {
    try {
      setBusyId(order.id);
      setErrorMessage("");
      await updateOrderStatus(order, "cancelled");
    } catch (error) {
      setErrorMessage(
        error?.message || "Unable to cancel order. Please try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["left", "right"]}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <Text
          style={{ fontSize: RFValue(20), fontWeight: "800", color: "#1E1B4B" }}
        >
          {userRole === "pharmacy" ? "Incoming orders" : "My medicine orders"}
        </Text>
        <Text style={{ fontSize: RFValue(11), color: "#6B7280", marginTop: 4 }}>
          Coordinate price & delivery directly in chat. The app does not handle
          money.
        </Text>
      </View>
      <ScrollView
        style={{ flex: 1, backgroundColor: "#F8FAFC" }}
        contentContainerStyle={{
          flexGrow: 1,
          padding: RFValue(16),
          paddingBottom: tabScrollBottomPadding() + RFValue(12),
          backgroundColor: "#F8FAFC",
        }}
      >
        {errorMessage ? (
          <Text
            style={{
              color: "#DC2626",
              marginBottom: RFValue(10),
              fontSize: RFValue(12),
            }}
          >
            {errorMessage}
          </Text>
        ) : null}
        {(orders || []).length > 0 ? (
          orders.map((o, idx) => {
            const statusKey = o.statusKey || "pending";
            const current = PHARMACY_STATUS_STEPS.find(
              (s) => s.id === statusKey,
            );
            const canAdvance = userRole === "pharmacy" && !!current?.next;
            const canCancel =
              userRole === "pharmacy" &&
              statusKey !== "cancelled" &&
              statusKey !== "fulfilled" &&
              statusKey !== "delivered";
            const isBusy = busyId === o.id;
            const isFulfilled =
              statusKey === "fulfilled" || statusKey === "delivered";
            return (
              <View
                key={o.id || idx}
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: RFValue(16),
                  padding: RFValue(16),
                  borderLeftWidth: 4,
                  borderLeftColor: isFulfilled
                    ? "#059669"
                    : statusKey === "cancelled"
                      ? "#DC2626"
                      : "#8B5CF6",
                  shadowColor: "#000",
                  shadowOpacity: 0.05,
                  elevation: 2,
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: RFValue(14),
                      color: "#1E1B4B",
                    }}
                  >
                    {o.patient || "Patient"}
                  </Text>
                  <Text
                    style={{
                      color: isFulfilled
                        ? "#059669"
                        : statusKey === "cancelled"
                          ? "#DC2626"
                          : "#D97706",
                      fontWeight: "700",
                      fontSize: RFValue(12),
                    }}
                  >
                    {o.status || "Ordered"}
                  </Text>
                </View>
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: RFValue(10),
                    marginTop: 2,
                  }}
                >
                  {o.kind === "pharmacy_order"
                    ? "Direct patient order"
                    : "From doctor's prescription"}
                  {"  ·  "}
                  {o.time}
                </Text>
                <Text
                  style={{
                    color: "#6B7280",
                    fontSize: RFValue(12),
                    marginTop: 6,
                  }}
                >
                  {o.items || "Medicine items"}
                </Text>
                {o.note ? (
                  <Text
                    style={{
                      color: "#6B7280",
                      fontSize: RFValue(11),
                      marginTop: 4,
                      fontStyle: "italic",
                    }}
                  >
                    Note: {o.note}
                  </Text>
                ) : null}
                {o.totalAmount ? (
                  <Text
                    style={{
                      color: "#1E1B4B",
                      fontSize: RFValue(12),
                      marginTop: 4,
                      fontWeight: "700",
                    }}
                  >
                    Indicative total: {o.total} (confirm in chat)
                  </Text>
                ) : null}

                {userRole === "pharmacy" ? (
                  <View
                    style={{ flexDirection: "row", marginTop: RFValue(12) }}
                  >
                    {canAdvance ? (
                      <TouchableOpacity
                        onPress={() => advanceStatus(o)}
                        disabled={isBusy}
                        style={{
                          flex: 1,
                          backgroundColor: "#4338CA",
                          paddingVertical: RFValue(10),
                          borderRadius: RFValue(10),
                          alignItems: "center",
                          marginRight: 8,
                          opacity: isBusy ? 0.7 : 1,
                        }}
                      >
                        {isBusy ? (
                          <ActivityIndicator color="#FFF" size="small" />
                        ) : (
                          <Text
                            style={{
                              color: "#FFF",
                              fontWeight: "800",
                              fontSize: RFValue(12),
                            }}
                          >
                            Mark as{" "}
                            {
                              PHARMACY_STATUS_STEPS.find(
                                (s) => s.id === current.next,
                              )?.label
                            }
                          </Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                    {canCancel ? (
                      <TouchableOpacity
                        onPress={() => cancelOrder(o)}
                        disabled={isBusy}
                        style={{
                          flex: canAdvance ? 0.6 : 1,
                          borderWidth: 1,
                          borderColor: "#DC2626",
                          paddingVertical: RFValue(10),
                          borderRadius: RFValue(10),
                          alignItems: "center",
                          opacity: isBusy ? 0.6 : 1,
                        }}
                      >
                        <Text
                          style={{
                            color: "#DC2626",
                            fontWeight: "700",
                            fontSize: RFValue(12),
                          }}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })
        ) : (
          <View style={{ alignItems: "center", marginTop: RFValue(60) }}>
            <Ionicons name="cart-outline" size={RFValue(48)} color="#E5E7EB" />
            <Text
              style={{
                color: "#9CA3AF",
                marginTop: RFValue(12),
                fontSize: RFValue(14),
              }}
            >
              No orders yet
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default function App() {
  const [themeKey, setThemeKey] = useState("light");
  const [userRole, setUserRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [wounds, setWounds] = useState([]);
  const [medOrders, setMedOrders] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [conversations, setConversations] = useState([]);
  // Cross-screen request to open a specific chat. Set by callers (e.g. doctor
  // "Help" modal, patient quick-request offer arrow); consumed by
  // `PatientChatScreen` once it has the conversation in state, then cleared.
  const [pendingChatRequest, setPendingChatRequest] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [pharmacies, setPharmacies] = useState([]);
  const [pharmaciesLoading, setPharmaciesLoading] = useState(false);
  const [doctorSelectedWoundId, setDoctorSelectedWoundId] = useState(null);
  const [patientSelectedWoundId, setPatientSelectedWoundId] = useState(null);
  const [patientShowNewWound, setPatientShowNewWound] = useState(false);
  const [patients, setPatients] = useState([
    {
      id: 1,
      name: "Rahul Sharma",
      age: 28,
      gender: "Male",
      riskLevel: "Medium",
      blood: "O+",
      conditions: "Hypertension",
      risk: 65,
      lastVisit: "Today",
    },
    {
      id: 2,
      name: "Sneha Gupta",
      age: 24,
      gender: "Female",
      riskLevel: "Low",
      blood: "A-",
      conditions: "None",
      risk: 88,
      lastVisit: "Yesterday",
    },
    {
      id: 3,
      name: "Amit Singh",
      age: 45,
      gender: "Male",
      riskLevel: "High",
      blood: "B+",
      conditions: "Type 2 Diabetes",
      risk: 42,
      lastVisit: "3 days ago",
    },
  ]);
  const [localCareMode, setLocalCareMode] = useState("");

  const theme = THEMES[themeKey];
  const changeTheme = (key) => setThemeKey(key);

  useEffect(() => {
    if (!userRole) {
      setDoctorSelectedWoundId(null);
      setPatientSelectedWoundId(null);
      setPatientShowNewWound(false);
    }
  }, [userRole]);

  useEffect(() => {
    if (userRole !== "doctor" || !doctorSelectedWoundId) return;
    if (dataLoading) return;
    if (!(wounds || []).some((wound) => wound.id === doctorSelectedWoundId)) {
      setDoctorSelectedWoundId(null);
    }
  }, [wounds, doctorSelectedWoundId, userRole, dataLoading]);

  useEffect(() => {
    if (userRole !== "patient" || !patientSelectedWoundId) return;
    if (!(wounds || []).some((wound) => wound.id === patientSelectedWoundId)) {
      setPatientSelectedWoundId(null);
    }
  }, [wounds, patientSelectedWoundId, userRole]);

  useEffect(() => {
    if (userRole !== "patient" || !currentUser?.id) {
      setLocalCareMode("");
      return;
    }
    (async () => {
      const stored = await readLocalCareMode(currentUser.id);
      if (stored) {
        setLocalCareMode(stored);
        return;
      }
      const fromProfile = String(patientProfile?.care_mode || "").trim();
      if (fromProfile) {
        await writeLocalCareMode(currentUser.id, fromProfile);
        setLocalCareMode(fromProfile);
      } else {
        setLocalCareMode("");
      }
    })();
  }, [
    userRole,
    currentUser?.id,
    patientProfile?.id,
    patientProfile?.care_mode,
  ]);

  const fetchUsersByRole = async (role) => {
    try {
      return await pb.collection("UsersAuth").getFullList({
        requestKey: null,
        filter: `role="${role}"`,
      });
    } catch (error) {
      console.log(`fetchUsersByRole(${role}) error:`, error);
      return [];
    }
  };

  const loadDirectoryContacts = async (options = {}) => {
    const requestedRoles = safeArray(options?.roles)
      .map(normalizeUserRole)
      .filter(Boolean);
    const roles = requestedRoles.length
      ? uniqueIds(requestedRoles)
      : userRole === "patient"
        ? ["doctor", "pharmacy"]
        : ["doctor", "pharmacy", "patient"];

    const recordsByRole = await Promise.all(
      roles.map((role) => fetchUsersByRole(role)),
    );
    const seen = new Set();
    return recordsByRole.flat().filter((user) => {
      if (!user?.id || seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
  };

  const createEncryptedMessage = async (payload, plainText) => {
    const encrypted = await encryptChatText(String(plainText || ""));
    try {
      return await pb.collection("messages").create({
        ...payload,
        text: encrypted,
      });
    } catch {
      return await pb.collection("messages").create({
        ...payload,
        message: encrypted,
      });
    }
  };

  const isPatientToPatientDirectConversation = (conversation) => {
    if (!conversation || conversation.kind === ASSISTANT_CONVERSATION_KIND) {
      return false;
    }
    const linkedWoundId =
      conversation.linkedWoundId || conversation.linkedWound;
    if (linkedWoundId) return false;
    const members = safeArray(
      conversation.memberUsers || conversation.expand?.members,
    );
    const patientCount = members.filter(
      (member) => normalizeUserRole(member?.role) === "patient",
    ).length;
    return patientCount >= 2;
  };

  /** Latest message per thread: small `getList(1,1)` calls (batched) - avoids loading every message in the database. */
  const loadMessagePreviewMap = async (conversationIds) => {
    if (!conversationIds.length) return {};
    const ids = [...new Set(conversationIds)].filter(Boolean);
    const previewMap = {};
    const CONCURRENCY = 12;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const slice = ids.slice(i, i + CONCURRENCY);
      await Promise.all(
        slice.map(async (cid) => {
          try {
            const result = await pb.collection("messages").getList(1, 1, {
              requestKey: null,
              filter: `conversation="${cid}"`,
              sort: "-created",
              expand: "sender",
            });
            const first = result?.items?.[0];
            if (first) {
              previewMap[cid] = mapMessageRecord(first);
            }
          } catch (error) {
            console.log("loadMessagePreviewMap conv:", cid, error?.message);
          }
        }),
      );
    }
    return previewMap;
  };

  // Lazy loader for the `hospitals` collection. Called on demand by the
  // patient dashboard widget and HospitalDirectoryScreen. Keeping it out of
  // `refreshAllData` avoids penalizing every write-then-refresh cycle.
  const fetchHospitals = async () => {
    try {
      setHospitalsLoading(true);
      const records = await pb.collection("hospitals").getFullList({
        requestKey: null,
        sort: "name",
      });
      const mapped = (records || []).map(mapHospitalRecord);
      setHospitals(mapped);
      return mapped;
    } catch (error) {
      // Collection may not exist yet on some PB instances - treat as empty
      // rather than breaking the dashboard.
      console.log("fetchHospitals skipped:", error?.message);
      setHospitals([]);
      return [];
    } finally {
      setHospitalsLoading(false);
    }
  };

  // Lazy loader for pharmacies (reads `pharmacy_profile` with expanded user).
  const fetchPharmacies = async () => {
    try {
      setPharmaciesLoading(true);
      const records = await pb.collection("pharmacy_profile").getFullList({
        requestKey: null,
        sort: "-updated,-created",
        expand: "user",
      });
      const mapped = (records || []).map(mapPharmacyListingRecord);
      setPharmacies(mapped);
      return mapped;
    } catch (error) {
      console.log("fetchPharmacies skipped:", error?.message);
      setPharmacies([]);
      return [];
    } finally {
      setPharmaciesLoading(false);
    }
  };

  // Save edits to the current pharmacy user's `pharmacy_profile` row. Written
  // so old PB schemas without the new columns still work - each optional
  // field is only written if truthy/non-empty. JSON fields are sent as native
  // objects/arrays and PocketBase will serialize them for storage. If the
  // row doesn't exist yet (signup couldn't create it because of API rules
  // or required fields), this falls back to creating it.
  const savePharmacyProfile = async (values) => {
    if (userRole !== "pharmacy" || !currentUser?.id) {
      throw new Error("Only a logged-in pharmacy can edit this profile.");
    }

    const buildPayload = (extra = {}) => {
      const payload = { ...extra };
      const textKeys = [
        "store_name",
        "tagline",
        "address",
        "district",
        "state",
        "phone",
      ];
      for (const key of textKeys) {
        const value = String(values?.[key] || "").trim();
        if (value) payload[key] = value;
      }
      if (values?.opening_hours && typeof values.opening_hours === "object") {
        payload.opening_hours = values.opening_hours;
      }
      if (Array.isArray(values?.closing_days)) {
        payload.closing_days = values.closing_days;
      }
      if (Array.isArray(values?.products)) {
        payload.products = values.products;
      }
      return payload;
    };

    let existingProfile = null;
    try {
      existingProfile = await pb
        .collection("pharmacy_profile")
        .getFirstListItem(`user="${currentUser.id}"`, { requestKey: null });
    } catch (lookupError) {
      if (lookupError?.status !== 404) {
        const message =
          formatPocketBaseClientError(lookupError) ||
          "Unable to load your pharmacy profile. Please try again.";
        throw new Error(message);
      }
    }

    let saved;
    try {
      if (existingProfile) {
        saved = await pb
          .collection("pharmacy_profile")
          .update(existingProfile.id, buildPayload());
      } else {
        // Row didn't exist yet - create it now with the form values.
        saved = await pb
          .collection("pharmacy_profile")
          .create(buildPayload({ user: currentUser.id }));
      }
    } catch (writeError) {
      const detailed = formatPocketBaseClientError(writeError);
      throw new Error(
        detailed ||
          writeError?.message ||
          "Pharmacy profile could not be saved. Please check the API rules on the pharmacy_profile collection in PocketBase admin (Create/Update should allow the logged-in pharmacy).",
      );
    }

    // Keep the in-memory pharmacies list in sync for patient views.
    setPharmacies((prev) => {
      const mapped = mapPharmacyListingRecord({
        ...saved,
        expand: { user: currentUser },
      });
      const existingIdx = prev.findIndex((item) => item.id === saved.id);
      if (existingIdx === -1) return [mapped, ...prev];
      const next = prev.slice();
      next[existingIdx] = mapped;
      return next;
    });
    return saved;
  };

  const refreshAllData = async (
    userOverride = currentUser,
    roleOverride = userRole,
  ) => {
    const activeUser = userOverride;
    const activeRole = roleOverride;

    if (!activeUser || !activeRole) {
      setWounds([]);
      setMedOrders([]);
      setPrescriptions([]);
      setConversations([]);
      setAppointments([]);
      return;
    }

    try {
      setDataLoading(true);
      setDataError("");

      const appointmentExpand = PB_APPOINTMENT_DOCTOR_IS_PROFILE
        ? "doctor.user,patient"
        : "doctor,patient";

      const fetchPrescriptionsSafe = async () => {
        try {
          return await pb.collection("prescriptions").getFullList({
            requestKey: null,
            sort: "-created",
            expand: "patient,doctor,wound,conversation",
          });
        } catch (error) {
          console.log("prescriptions fetch skipped:", error?.message);
          return [];
        }
      };

      const fetchAppointmentsSafe = async () => {
        try {
          return await pb.collection(PB_APPOINTMENTS_COLLECTION).getFullList({
            requestKey: null,
            sort: "scheduled_at",
            expand: appointmentExpand,
          });
        } catch (sortError) {
          try {
            return await pb.collection(PB_APPOINTMENTS_COLLECTION).getFullList({
              requestKey: null,
              sort: "-created",
              expand: appointmentExpand,
            });
          } catch (error) {
            console.log("appointments fetch skipped:", error?.message);
            return [];
          }
        }
      };

      const [
        woundRecords,
        orderRecords,
        conversationRecords,
        prescriptionRecords,
        appointmentRecords,
      ] = await Promise.all([
        pb.collection("wounds").getFullList({
          requestKey: null,
          sort: "-created",
          expand: "patient,doctor,conversation",
        }),
        pb.collection("orders").getFullList({
          requestKey: null,
          sort: "-updated,-created",
          expand: "patient,conversation,wound.doctor,pharmacy",
        }),
        pb.collection("conversations").getFullList({
          requestKey: null,
          sort: "-updated,-created",
          expand: "members,linkedWound",
        }),
        fetchPrescriptionsSafe(),
        fetchAppointmentsSafe(),
      ]);

      const allWounds = woundRecords.map(mapWoundRecord);
      const allOrders = orderRecords.map(mapOrderRecord);
      const allPrescriptions = (prescriptionRecords || []).map(
        mapPrescriptionRecord,
      );
      const memberConversations = conversationRecords.filter((record) =>
        safeArray(record.members).includes(activeUser.id),
      );
      const previewMap = await loadMessagePreviewMap(
        memberConversations.map((record) => record.id),
      );
      const allConversations = memberConversations.map((record) =>
        mapConversationRecord(record, activeUser.id, previewMap),
      );
      const visibleConversations =
        activeRole === "patient"
          ? allConversations.filter(
              (conversation) =>
                !isPatientToPatientDirectConversation(conversation),
            )
          : allConversations;

      const doctorMatchesAppointment = (record) => {
        const expandedDoctorUserId =
          record?.expand?.doctor?.expand?.user?.id ||
          record?.expand?.doctor?.user ||
          null;
        return (
          record?.doctor === activeUser.id ||
          expandedDoctorUserId === activeUser.id
        );
      };

      if (activeRole === "patient") {
        setWounds(
          allWounds.filter((record) => record.patientId === activeUser.id),
        );
        setMedOrders(
          allOrders.filter((record) => record.patientId === activeUser.id),
        );
        setPrescriptions(
          allPrescriptions.filter(
            (record) => record.patientId === activeUser.id,
          ),
        );
        setAppointments(
          appointmentRecords
            .filter((record) => record.patient === activeUser.id)
            .map(mapAppointmentRecord),
        );
      } else if (activeRole === "doctor") {
        setWounds(allWounds);
        setMedOrders(allOrders);
        setPrescriptions(
          allPrescriptions.filter(
            (record) => record.doctorId === activeUser.id,
          ),
        );
        setAppointments(
          appointmentRecords
            .filter(doctorMatchesAppointment)
            .map(mapAppointmentRecord),
        );
      } else if (activeRole === "pharmacy") {
        setWounds(allWounds.filter((record) => record.hasPharmacy));
        // Step 6: pharmacies only see orders addressed to them, OR legacy
        // doctor-prescribed orders (which have no `pharmacy` field set yet).
        setMedOrders(
          allOrders.filter(
            (record) =>
              !record.pharmacyId || record.pharmacyId === activeUser.id,
          ),
        );
        setPrescriptions([]);
        setAppointments([]);
      }

      setConversations(visibleConversations);
    } catch (error) {
      console.log("refreshAllData error:", error);
      setDataError(error?.message || "Unable to load app data");
      setWounds([]);
      setMedOrders([]);
      setPrescriptions([]);
      setConversations([]);
      setAppointments([]);
    } finally {
      setDataLoading(false);
    }
  };

  const ensureConversationMembers = async (
    conversationId,
    membersToAdd = [],
  ) => {
    const conversation = await pb
      .collection("conversations")
      .getOne(conversationId, {
        requestKey: null,
        expand: "members,linkedWound",
      });
    const mergedMembers = uniqueIds([
      ...safeArray(conversation.members),
      ...safeArray(membersToAdd),
    ]);

    if (mergedMembers.length === safeArray(conversation.members).length) {
      return conversation;
    }

    return await pb.collection("conversations").update(conversationId, {
      members: mergedMembers,
    });
  };

  const ensureConversationForWound = async (woundLike, options = {}) => {
    const woundId = woundLike?.id || woundLike?.raw?.id;
    if (!woundId) {
      throw new Error("Wound not found");
    }

    let woundRecord = null;
    try {
      woundRecord = await pb.collection("wounds").getOne(woundId, {
        requestKey: null,
        expand: "patient,doctor,conversation",
      });
    } catch (error) {
      woundRecord = woundLike?.raw || woundLike;
    }

    let conversationId =
      woundRecord?.conversation || woundLike?.conversation || null;

    if (!conversationId) {
      const doctorUsers = await fetchUsersByRole("doctor");
      const baseMembers = [
        woundRecord?.patient,
        ...doctorUsers.map((user) => user.id),
      ];
      if (options.includeCurrentUser && currentUser?.id) {
        baseMembers.push(currentUser.id);
      }
      const createdConversation = await pb.collection("conversations").create({
        title: buildConversationTitle(woundRecord),
        linkedWound: woundId,
        members: uniqueIds(baseMembers),
        lastMessageAt: new Date().toISOString(),
      });
      conversationId = createdConversation.id;
      await pb
        .collection("wounds")
        .update(woundId, { conversation: conversationId });
      await createEncryptedMessage(
        {
          conversation: conversationId,
          kind: "system",
        },
        DEFAULT_WOUND_SYSTEM_MESSAGE,
      );
      await pb.collection("conversations").update(conversationId, {
        lastMessageAt: new Date().toISOString(),
      });
    }

    if (options.includeCurrentUser && currentUser?.id) {
      await ensureConversationMembers(conversationId, [currentUser.id]);
    }

    return await pb.collection("conversations").getOne(conversationId, {
      requestKey: null,
      expand: "members,linkedWound",
    });
  };

  const ensureDirectConversation = async (targetUser) => {
    const targetId = targetUser?.id || targetUser;
    if (!currentUser?.id || !targetId) {
      throw new Error("Chat participant not found");
    }
    if (targetId === currentUser.id) {
      throw new Error("Cannot start a chat with yourself");
    }

    // We must distinguish "no explicit role provided" from "role is patient".
    // `normalizeUserRole` defaults to "patient" for any falsy value, so the
    // previous logic treated every plain-id call from the patient as a chat
    // with another patient and threw - even when targeting a doctor.
    const explicitRole = String(targetUser?.role || targetUser?.raw?.role || "")
      .toLowerCase()
      .trim();
    let targetRole = explicitRole || null;
    if (!targetRole && userRole === "patient") {
      try {
        const targetRecord = await pb
          .collection("UsersAuth")
          .getOne(targetId, { requestKey: null });
        const fetched = String(targetRecord?.role || "")
          .toLowerCase()
          .trim();
        targetRole = fetched || null;
      } catch (error) {
        console.log(
          "ensureDirectConversation role check error:",
          error?.message,
        );
        // Cannot read other users (PB rule) - fall through and let
        // PocketBase's collection rules be the final gate. Don't pretend
        // it's a patient.
        targetRole = null;
      }
    }
    if (userRole === "patient" && targetRole === "patient") {
      throw new Error(
        "Patients cannot start direct chats with other patients.",
      );
    }

    const existingConversation = conversations.find((conversation) => {
      const members = safeArray(conversation.members);
      return (
        !conversation.linkedWoundId &&
        members.length === 2 &&
        members.includes(currentUser.id) &&
        members.includes(targetId)
      );
    });

    if (existingConversation) {
      return existingConversation;
    }

    const createdConversation = await pb.collection("conversations").create({
      members: uniqueIds([currentUser.id, targetId]),
      lastMessageAt: new Date().toISOString(),
    });

    const hydratedConversation = await pb
      .collection("conversations")
      .getOne(createdConversation.id, {
        requestKey: null,
        expand: "members,linkedWound",
      });

    await refreshAllData();
    return mapConversationRecord(hydratedConversation, currentUser.id, {});
  };

  const loadConversationMessages = async (conversationId) => {
    if (!conversationId) return [];
    try {
      const records = await pb.collection("messages").getFullList({
        requestKey: null,
        sort: "created",
        filter: `conversation="${conversationId}"`,
        expand: "sender",
      });
      return records.map(mapMessageRecord);
    } catch (error) {
      console.log("loadConversationMessages filter error:", error?.message);
      return [];
    }
  };

  const updateConversationPreview = (conversationId, mappedMessage) => {
    if (!mappedMessage) return;
    setConversations((prev) => {
      const index = prev.findIndex((item) => item.id === conversationId);
      if (index === -1) return prev;
      const updated = {
        ...prev[index],
        lastMsg: messagePreviewText(mappedMessage) || prev[index].lastMsg,
        time: formatTimeValue(
          mappedMessage.created || new Date().toISOString(),
        ),
      };
      const next = [...prev];
      next.splice(index, 1);
      return [updated, ...next];
    });
  };

  const sendConversationMessage = async (conversationId, text) => {
    if (!currentUser?.id || !text?.trim()) return null;
    const conversation = conversations.find(
      (item) => item.id === conversationId,
    );
    if (
      userRole === "patient" &&
      isPatientToPatientDirectConversation(conversation)
    ) {
      Alert.alert(
        "Chat unavailable",
        "Patients cannot send direct messages to other patients.",
      );
      return null;
    }
    const trimmed = text.trim();
    let createdMessage = null;
    try {
      const encrypted = await encryptChatText(trimmed);
      createdMessage = await pb.collection("messages").create({
        conversation: conversationId,
        sender: currentUser.id,
        kind: "text",
        text: encrypted,
      });
    } catch (error) {
      try {
        const encrypted = await encryptChatText(trimmed);
        createdMessage = await pb.collection("messages").create({
          conversation: conversationId,
          sender: currentUser.id,
          kind: "text",
          message: encrypted,
        });
      } catch (fallbackError) {
        console.log("sendConversationMessage error:", fallbackError);
        return null;
      }
    }
    await pb.collection("conversations").update(conversationId, {
      lastMessageAt: new Date().toISOString(),
    });
    const mappedMessage = createdMessage
      ? mapMessageRecord(createdMessage)
      : null;
    updateConversationPreview(conversationId, mappedMessage);
    return mappedMessage;
  };

  const sendConversationImage = async (conversationId, asset, caption = "") => {
    if (!currentUser?.id || !conversationId || !asset?.uri) return null;

    const uri = asset.uri;
    const mimeType = (() => {
      if (asset?.mimeType && typeof asset.mimeType === "string") {
        return asset.mimeType;
      }

      // expo-image-picker often provides `type: "image"` instead of a real MIME.
      if (typeof asset?.type === "string" && asset.type.includes("/")) {
        return asset.type;
      }

      const ext = String(uri).split("?")[0].split("#")[0].split(".").pop();
      const normalizedExt = String(ext || "").toLowerCase();
      if (normalizedExt === "png") return "image/png";
      if (normalizedExt === "webp") return "image/webp";
      if (normalizedExt === "heic" || normalizedExt === "heif") {
        return "image/heic";
      }
      return "image/jpeg";
    })();

    const base64Data =
      typeof asset?.base64 === "string" && asset.base64.trim().length > 0
        ? asset.base64.trim()
        : "";

    if (!base64Data) {
      throw new Error(
        "Could not process the image securely. Please try selecting it again.",
      );
    }

    const encryptedImagePayload = await encryptChatImagePayload({
      base64Data,
      mimeType,
      caption,
    });

    let createdMessage = null;
    try {
      createdMessage = await pb.collection("messages").create({
        conversation: conversationId,
        sender: currentUser.id,
        kind: "image",
        text: encryptedImagePayload,
      });
    } catch (error) {
      // Fallback for schemas that use `message` instead of `text`.
      try {
        createdMessage = await pb.collection("messages").create({
          conversation: conversationId,
          sender: currentUser.id,
          kind: "image",
          message: encryptedImagePayload,
        });
      } catch (fallbackError) {
        // Fallback if the `kind` field does not include "image".
        try {
          createdMessage = await pb.collection("messages").create({
            conversation: conversationId,
            sender: currentUser.id,
            kind: "text",
            text: encryptedImagePayload,
          });
        } catch (legacyError) {
          console.log("sendConversationImage error:", error);
          console.log("sendConversationImage fallback error:", fallbackError);
          console.log("sendConversationImage legacy error:", legacyError);
          return null;
        }
      }
    }

    await pb.collection("conversations").update(conversationId, {
      lastMessageAt: new Date().toISOString(),
    });

    const mappedMessage = createdMessage
      ? mapMessageRecord(createdMessage)
      : null;
    updateConversationPreview(conversationId, mappedMessage);
    return mappedMessage;
  };

  const fetchApprovedDoctors = async (opts = {}) => {
    try {
      const records = await pb.collection("doctor_profile").getFullList({
        requestKey: null,
        filter: `status="approved"`,
        expand: "user",
      });
      let list = records
        .map(mapDoctorListingRecord)
        .filter((item) => item.userId);
      if (opts.quickServiceOnly) {
        list = list.filter((doc) => {
          const tier = String(doc.practitionerTier || "").toLowerCase();
          if (tier === "professional" || tier === "specialist") return false;
          return true;
        });
      }
      if (opts.packageModeOnly) {
        list = list.filter((doc) =>
          doctorTierEligibleForPackageMode(doc.practitionerTier),
        );
      }
      return list;
    } catch (error) {
      console.log("fetchApprovedDoctors error:", error);
      return [];
    }
  };

  const createAppointment = async ({
    doctorUserId,
    doctorProfileId,
    scheduledAtIso,
    consultationType,
    reason,
  }) => {
    if (!currentUser?.id) {
      throw new Error("Please login again");
    }
    if (!doctorUserId) {
      throw new Error(
        PB_APPOINTMENT_DOCTOR_IS_PROFILE
          ? "Doctor profile is not available for booking."
          : "Doctor is not available for booking.",
      );
    }
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) {
      throw new Error("Please describe the reason for your visit.");
    }

    const created = await createPackageMeetingRequest({
      patientUserId: currentUser.id,
      doctorUserId,
      doctorProfileId,
      proposedAtIso: scheduledAtIso,
      description: trimmedReason,
      callKind:
        consultationType === "audio"
          ? "audio"
          : consultationType === "chat"
            ? "chat"
            : "video",
    });

    let conversationId = null;
    if (doctorUserId) {
      try {
        const conv = await ensureDirectConversation(doctorUserId);
        conversationId = conv?.id || null;
      } catch (convError) {
        console.log(
          "createAppointment conversation skipped:",
          convError?.message,
        );
      }
    }

    if (conversationId && created?.id && !created.localOnly) {
      try {
        const whenLabel = `${formatAppointmentSummaryDate(scheduledAtIso)} · ${formatTimeValue(
          scheduledAtIso,
        )}`;
        await createEncryptedMessage(
          {
            conversation: conversationId,
            kind: "system",
          },
          `Appointment request: ${whenLabel}.\nReason: ${trimmedReason}`,
        );
        await pb.collection("conversations").update(conversationId, {
          lastMessageAt: new Date().toISOString(),
        });
      } catch (msgError) {
        console.log(
          "createAppointment system message skipped:",
          msgError?.message,
        );
      }
    }

    await refreshAllData();
    return created;
  };

  const applyPatientRescheduleChoice = async ({
    appointmentId,
    selectedSlotIso,
  }) => {
    if (!appointmentId || !selectedSlotIso) {
      throw new Error("Pick a suggested time first.");
    }
    const start = new Date(selectedSlotIso);
    if (!Number.isFinite(start.getTime())) {
      throw new Error("Invalid time.");
    }
    let existing = null;
    try {
      existing = await pb
        .collection(PB_APPOINTMENTS_COLLECTION)
        .getOne(appointmentId, { requestKey: null });
    } catch (e) {
      console.log("applyPatientRescheduleChoice load:", e?.message);
    }
    const payload = {
      scheduled_at: start.toISOString(),
      status: "requested",
      reply: "",
    };
    try {
      await pb
        .collection(PB_APPOINTMENTS_COLLECTION)
        .update(appointmentId, payload);
    } catch (error) {
      throw new Error(
        formatPocketBaseClientError(error) ||
          error?.message ||
          "Could not update your appointment.",
      );
    }
    const conversationId = existing?.conversation || null;
    if (conversationId) {
      try {
        await createEncryptedMessage(
          { conversation: conversationId, kind: "system" },
          `You picked a new time: ${start.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. The doctor will confirm again.`,
        );
        await pb.collection("conversations").update(conversationId, {
          lastMessageAt: new Date().toISOString(),
        });
      } catch (e) {
        console.log("applyPatientRescheduleChoice message:", e?.message);
      }
    }
    void refreshAllData().catch(() => {});
  };

  const cancelAppointmentByPatient = async ({ appointmentId }) => {
    if (!appointmentId) throw new Error("Missing appointment.");
    let existing = null;
    try {
      existing = await pb
        .collection(PB_APPOINTMENTS_COLLECTION)
        .getOne(appointmentId, { requestKey: null });
    } catch (e) {
      console.log("cancelAppointmentByPatient load:", e?.message);
    }
    const tryCancel = async (statusVal) => {
      await pb.collection(PB_APPOINTMENTS_COLLECTION).update(appointmentId, {
        status: statusVal,
        reply: "",
      });
    };
    try {
      await tryCancel("cancelled");
    } catch (e1) {
      try {
        await tryCancel("rejected");
      } catch (e2) {
        throw new Error(
          formatPocketBaseClientError(e2) ||
            e2?.message ||
            "Could not cancel. Add status cancelled (or rejected) on appointments in PocketBase.",
        );
      }
    }
    const conversationId = existing?.conversation || null;
    if (conversationId) {
      try {
        await createEncryptedMessage(
          { conversation: conversationId, kind: "system" },
          "The patient cancelled this appointment.",
        );
        await pb.collection("conversations").update(conversationId, {
          lastMessageAt: new Date().toISOString(),
        });
      } catch (e) {
        console.log("cancelAppointmentByPatient message:", e?.message);
      }
    }
    void refreshAllData().catch(() => {});
  };

  const updateAppointmentStatus = async ({
    appointmentId,
    nextStatus,
    replyNote,
    rescheduleReason,
    rescheduleSlots,
  }) => {
    if (!appointmentId) {
      throw new Error("Appointment not found");
    }
    const normalized = normalizeAppointmentStatus(nextStatus);
    let existing = null;
    try {
      existing = await pb
        .collection(PB_APPOINTMENTS_COLLECTION)
        .getOne(appointmentId, { requestKey: null });
    } catch (error) {
      console.log("updateAppointmentStatus load error:", error?.message);
    }
    const trimmedReply = String(replyNote || "").trim();
    const payload = { status: normalized };

    if (normalized === "ask_reschedule") {
      const slots = Array.isArray(rescheduleSlots)
        ? rescheduleSlots.map((s) => String(s).trim()).filter(Boolean)
        : [];
      if (slots.length < 3) {
        throw new Error("Add at least three suggested date and time options.");
      }
      const reason = String(rescheduleReason || trimmedReply || "").trim();
      if (!reason) {
        throw new Error(
          "Enter a short reason for the patient (why you need a different time).",
        );
      }
      payload.reply = buildApptRescheduleReplyPayload({ reason, slots });
    } else if (trimmedReply) {
      payload.reply = trimmedReply;
    }

    try {
      await pb
        .collection(PB_APPOINTMENTS_COLLECTION)
        .update(appointmentId, payload);
    } catch (error) {
      if (payload.reply) {
        try {
          await pb
            .collection(PB_APPOINTMENTS_COLLECTION)
            .update(appointmentId, { status: normalized });
        } catch (retryError) {
          throw new Error(
            retryError?.data?.message ||
              retryError?.message ||
              "Unable to update appointment status.",
          );
        }
      } else {
        throw new Error(
          error?.data?.message ||
            error?.message ||
            "Unable to update appointment status.",
        );
      }
    }

    const conversationId = existing?.conversation || null;
    if (conversationId) {
      const systemText =
        normalized === "approved"
          ? `Doctor approved the appointment.${trimmedReply ? `\nNote: ${trimmedReply}` : ""}`
          : normalized === "rejected"
            ? `Doctor declined the appointment.${trimmedReply ? `\nNote: ${trimmedReply}` : ""}`
            : normalized === "ask_reschedule"
              ? "Doctor asked to reschedule. Open Appointments to choose one of the suggested times or cancel the booking."
              : normalized === "completed"
                ? `Consultation marked completed. This chat stays open for follow-up questions.`
                : normalized === "paid"
                  ? `Consultation fee paid. Appointment is confirmed.`
                  : `Appointment status updated: ${humanizeAppointmentStatus(normalized)}.`;
      try {
        await createEncryptedMessage(
          {
            conversation: conversationId,
            kind: "system",
          },
          systemText,
        );
        await pb.collection("conversations").update(conversationId, {
          lastMessageAt: new Date().toISOString(),
        });
      } catch (msgError) {
        console.log(
          "updateAppointmentStatus message skipped:",
          msgError?.message,
        );
      }
    }

    void refreshAllData().catch((refreshError) =>
      console.log(
        "refreshAllData after appointment status change:",
        refreshError?.message || refreshError,
      ),
    );
  };

  const createWoundReport = async ({ description, image, doctorUserId }) => {
    if (!currentUser?.id) {
      throw new Error("Please login again");
    }
    const doctorUsers = await fetchUsersByRole("doctor");
    const conversationDoctorIds = doctorUserId
      ? uniqueIds([doctorUserId])
      : doctorUsers.map((user) => user.id);
    const filePart = image?.uri ? pickerAssetToUploadPart(image) : null;

    const appendDoctorRelation = (formData) => {
      if (doctorUserId) formData.append("doctor", doctorUserId);
    };

    let woundRecord;
    if (filePart) {
      const formData = new FormData();
      formData.append("patient", currentUser.id);
      formData.append("description", description?.trim() || "");
      formData.append("severity", "moderate");
      formData.append("status", "review_pending");
      formData.append("notes", "");
      appendDoctorRelation(formData);
      formData.append("image", filePart);
      try {
        woundRecord = await pb.collection("wounds").create(formData);
      } catch (imageError) {
        console.log("wounds create with image failed, retrying:", imageError);
        const fallbackData = new FormData();
        fallbackData.append("patient", currentUser.id);
        fallbackData.append("description", description?.trim() || "");
        fallbackData.append("severity", "moderate");
        fallbackData.append("status", "review_pending");
        fallbackData.append("notes", "");
        appendDoctorRelation(fallbackData);
        fallbackData.append("photo", filePart);
        try {
          woundRecord = await pb.collection("wounds").create(fallbackData);
        } catch (fallbackError) {
          console.log(
            "wound photo upload failed, saving without photo:",
            fallbackError,
          );
          const jsonPayload = {
            patient: currentUser.id,
            description: description?.trim() || "",
            severity: "moderate",
            status: "review_pending",
            notes: "",
            hasPharmacy: false,
          };
          if (doctorUserId) jsonPayload.doctor = doctorUserId;
          woundRecord = await pb.collection("wounds").create(jsonPayload);
        }
      }
    } else {
      const jsonPayload = {
        patient: currentUser.id,
        description: description?.trim() || "",
        severity: "moderate",
        status: "review_pending",
        notes: "",
        hasPharmacy: false,
      };
      if (doctorUserId) jsonPayload.doctor = doctorUserId;
      woundRecord = await pb.collection("wounds").create(jsonPayload);
    }
    const conversation = await pb.collection("conversations").create({
      title: buildConversationTitle(woundRecord),
      linkedWound: woundRecord.id,
      members: uniqueIds([currentUser.id, ...conversationDoctorIds]),
      lastMessageAt: new Date().toISOString(),
    });
    await pb.collection("wounds").update(woundRecord.id, {
      conversation: conversation.id,
    });
    await createEncryptedMessage(
      {
        conversation: conversation.id,
        kind: "system",
      },
      DEFAULT_WOUND_SYSTEM_MESSAGE,
    );
    void refreshAllData().catch((err) =>
      console.log("refreshAllData after wound create:", err?.message || err),
    );
  };

  const prescribeForWound = async (woundLike, prescriptionInput) => {
    const woundId = woundLike?.id || woundLike?.raw?.id;
    if (!woundId) {
      throw new Error("Wound not found");
    }

    let prescription = prescriptionInput;
    if (Array.isArray(prescriptionInput)) {
      prescription = {
        disease:
          String(woundLike?.description || "")
            .trim()
            .slice(0, 120) || "As documented in wound report",
        lines: prescriptionInput.map((name) => ({
          name: String(name || "").trim(),
          dosage: "As directed",
          whenToTake: "",
          duration: "",
        })),
      };
    }

    const lines = safeArray(prescription?.lines)
      .map((line) => normalizePrescriptionLineFromUnknown(line))
      .filter(Boolean);
    if (!lines.length) {
      throw new Error("Add at least one medicine with a name.");
    }

    const disease = String(prescription?.disease || "").trim();
    if (!disease) {
      throw new Error(
        "Enter the condition or diagnosis this prescription is for.",
      );
    }

    const conversation = await ensureConversationForWound(woundLike, {
      includeCurrentUser: true,
    });
    const pharmacyUsers = await fetchUsersByRole("pharmacy");

    if (pharmacyUsers.length > 0) {
      await ensureConversationMembers(
        conversation.id,
        pharmacyUsers.map((user) => user.id),
      );
    }

    const patientId = woundLike?.patientId || woundLike?.patient;

    let existingOrder = null;
    try {
      const records = await pb.collection("orders").getFullList({
        requestKey: null,
        filter: `wound="${woundId}"`,
      });
      existingOrder = records[0] || null;
    } catch (error) {
      existingOrder = null;
    }

    const orderPayloadBase = {
      conversation: conversation.id,
      wound: woundId,
      patient: patientId,
      totalAmount: sumMedicationAmount(lines),
      status: "pending",
    };

    const persistOrder = async (payload) => {
      if (existingOrder) {
        await pb.collection("orders").update(existingOrder.id, payload);
      } else {
        await pb.collection("orders").create(payload);
      }
    };

    try {
      await persistOrder({
        ...orderPayloadBase,
        items: lines,
        diagnosis: disease,
      });
    } catch (structuredError) {
      console.log("prescribe structured order error:", structuredError);
      const legacyItems = lines.map((line) =>
        [line.name, line.dosage, line.whenToTake, line.duration]
          .filter(Boolean)
          .join(" | "),
      );
      try {
        await persistOrder({
          ...orderPayloadBase,
          items: legacyItems,
        });
      } catch (legacyError) {
        console.log("prescribe legacy order error:", legacyError);
        throw legacyError;
      }
    }

    try {
      await pb.collection("wounds").update(woundId, {
        status: "medication_prescribed",
        hasPharmacy: pharmacyUsers.length > 0,
        conversation: conversation.id,
        diagnosis: disease,
      });
    } catch (error) {
      console.log("wound diagnosis field skipped:", error?.message);
      await pb.collection("wounds").update(woundId, {
        status: "medication_prescribed",
        hasPharmacy: pharmacyUsers.length > 0,
        conversation: conversation.id,
      });
    }

    // Derive a `whenToTake` summary for any line that only has structured
    // timing, so legacy viewers still see a human-readable schedule.
    const linesForStorage = lines.map((line) => {
      const whenToTake =
        line.whenToTake || describeStructuredTiming(line) || "";
      return {
        ...line,
        whenToTake,
      };
    });

    let savedPrescriptionId = null;
    try {
      let existingPrescription = null;
      try {
        const records = await pb.collection("prescriptions").getFullList({
          requestKey: null,
          filter: `wound="${woundId}"`,
        });
        existingPrescription = (records || [])[0] || null;
      } catch (error) {
        console.log("prescriptions query error:", error?.message);
      }
      const prescriptionPayload = {
        patient: patientId,
        doctor: currentUser.id,
        wound: woundId,
        conversation: conversation.id,
        items: linesForStorage,
        notes: disease,
      };
      if (existingPrescription) {
        await pb
          .collection("prescriptions")
          .update(existingPrescription.id, prescriptionPayload);
        savedPrescriptionId = existingPrescription.id;
      } else {
        const created = await pb
          .collection("prescriptions")
          .create(prescriptionPayload);
        savedPrescriptionId = created?.id || null;
      }
    } catch (error) {
      console.log("prescriptions collection save error:", error);
    }

    // Step 7b: expand each line into concrete `medication_schedule` doses
    // the patient can tick off. Wrapped in try/catch so a missing schedule
    // collection never blocks the prescription itself.
    if (savedPrescriptionId && patientId) {
      try {
        // Remove any old pending doses for this prescription so re-prescribing
        // with a new plan doesn't leave stale doses behind.
        try {
          const staleDoses = await pb
            .collection("medication_schedule")
            .getFullList({
              requestKey: null,
              filter: `prescription="${savedPrescriptionId}" && status="pending"`,
            });
          for (const dose of staleDoses || []) {
            await pb
              .collection("medication_schedule")
              .delete(dose.id)
              .catch(() => {});
          }
        } catch (cleanupError) {
          console.log(
            "medication_schedule cleanup skipped:",
            cleanupError?.message,
          );
        }
        const context = {
          patientId,
          prescriptionId: savedPrescriptionId,
          woundId,
        };
        for (const line of linesForStorage) {
          const rows = buildScheduleRowsForLine(line, context);
          for (const row of rows) {
            try {
              const createdDose = await pb
                .collection("medication_schedule")
                .create(row);
              // Best-effort local reminder. Doctor-side devices will silently
              // skip because they never requested patient permissions, but
              // on the patient device this schedules a dated notification.
              scheduleDoseReminder(createdDose).catch(() => {});
            } catch (rowError) {
              console.log(
                "medication_schedule row skipped:",
                rowError?.message,
              );
            }
          }
        }
      } catch (scheduleError) {
        console.log(
          "medication_schedule expansion skipped:",
          scheduleError?.message,
        );
      }
    }

    const medicationSummary = lines
      .map((line) => {
        const parts = [line.name];
        if (line.dosage) parts.push(line.dosage);
        if (line.whenToTake) parts.push(line.whenToTake);
        if (line.duration) parts.push(line.duration);
        return parts.join(", ");
      })
      .join("; ");
    const pharmacyNote =
      pharmacyUsers.length > 0 ? " Pharmacy order created." : "";

    await createEncryptedMessage(
      {
        conversation: conversation.id,
        kind: "system",
      },
      `Prescription sent for "${disease}": ${medicationSummary}.${pharmacyNote}`,
    );
    await pb.collection("conversations").update(conversation.id, {
      lastMessageAt: new Date().toISOString(),
    });
    await refreshAllData();
  };

  const updateOrderStatus = async (orderLike, nextStatus) => {
    const orderId = orderLike?.id || orderLike?.raw?.id;
    if (!orderId) return;

    await pb.collection("orders").update(orderId, {
      status: normalizeOrderStatus(nextStatus),
    });

    const conversationId =
      orderLike?.conversation || orderLike?.raw?.conversation;
    if (conversationId) {
      await createEncryptedMessage(
        {
          conversation: conversationId,
          kind: "system",
        },
        `Pharmacy updated order status to ${humanizeOrderStatus(nextStatus)}.`,
      );
      await pb.collection("conversations").update(conversationId, {
        lastMessageAt: new Date().toISOString(),
      });
    }

    await refreshAllData();
  };

  // -------------------------------------------------------------------------
  // Step 6 - Patient → Pharmacy direct order.
  // Creates an `orders` row linked to the pharmacy user, re-uses (or opens) an
  // encrypted direct conversation with them, and posts a system message that
  // summarizes the order so both sides see it in chat. The app itself does not
  // handle money or delivery - those are negotiated inside the chat.
  // -------------------------------------------------------------------------
  const createPharmacyOrder = async ({ pharmacyUserId, items, note } = {}) => {
    if (!currentUser?.id) {
      throw new Error("Please login again.");
    }
    if (!pharmacyUserId) {
      throw new Error("Pharmacy is not available for ordering.");
    }
    const cleanItems = safeArray(items)
      .map((item) => ({
        name: String(item?.name || "").trim(),
        qty: String(item?.qty || "").trim(),
        notes: String(item?.notes || "").trim(),
      }))
      .filter((item) => item.name);
    if (!cleanItems.length) {
      throw new Error("Add at least one medicine to the order.");
    }
    const trimmedNote = String(note || "").trim();

    // 1. Ensure a persistent encrypted conversation with the pharmacy.
    const conversation = await ensureDirectConversation(pharmacyUserId);
    if (!conversation?.id) {
      throw new Error("Unable to open a chat with this pharmacy.");
    }

    // 2. Create the order. We retry with a legacy string[] items shape if
    //    PocketBase rejects the structured JSON (older schemas).
    const totalAmount = sumMedicationAmount(cleanItems);
    const basePayload = {
      patient: currentUser.id,
      pharmacy: pharmacyUserId,
      conversation: conversation.id,
      totalAmount,
      status: "pending",
    };
    let orderRecord = null;
    try {
      orderRecord = await pb.collection("orders").create({
        ...basePayload,
        items: cleanItems,
        note: trimmedNote,
      });
    } catch (structuredError) {
      console.log("createPharmacyOrder structured error:", structuredError);
      try {
        orderRecord = await pb.collection("orders").create({
          ...basePayload,
          items: cleanItems.map((item) =>
            [item.name, item.qty && `x${item.qty}`, item.notes]
              .filter(Boolean)
              .join(" "),
          ),
        });
      } catch (legacyError) {
        const detailed =
          legacyError?.data?.message ||
          legacyError?.message ||
          "Unable to place order. Check that the orders collection allows a `pharmacy` relation and items JSON.";
        throw new Error(detailed);
      }
    }

    // 3. Post a system message so both sides see the order in chat.
    const summary = cleanItems
      .map((item) =>
        [item.name, item.qty && `x${item.qty}`, item.notes]
          .filter(Boolean)
          .join(" "),
      )
      .join("; ");
    const systemText =
      `Medicine order placed:\n${summary}` +
      (trimmedNote ? `\nNote: ${trimmedNote}` : "");
    try {
      await createEncryptedMessage(
        {
          conversation: conversation.id,
          kind: "system",
        },
        systemText,
      );
      await pb.collection("conversations").update(conversation.id, {
        lastMessageAt: new Date().toISOString(),
      });
    } catch (msgError) {
      console.log("createPharmacyOrder system message skipped:", msgError);
    }

    void refreshAllData();
    return { order: orderRecord, conversationId: conversation.id };
  };

  // -------------------------------------------------------------------------
  // Step 8 - Appointment payment.
  // In "stub" mode (the default) this just flips the status to "paid". In
  // "cashfree" mode the hosted checkout must verify successfully first.
  // -------------------------------------------------------------------------
  const runCashfreeAppointmentPayment = async (appointment) => {
    const amountPaise = appointmentFeePaise(appointment);
    const customerPhone = String(
      appointment?.customerPhone ||
        patientProfilePhoneRaw(patientProfile) ||
        patientProfilePhoneRaw(currentUser) ||
        "",
    ).replace(/\D/g, "");
    if (customerPhone.length < 10) {
      throw new Error("Please add your mobile number before paying.");
    }
    const order = await postPaymentJson("/payments/cashfree/orders", {
      appointmentId: appointment.id,
      amountPaise,
      currency: "INR",
      description: `Nvoisys appointment with ${appointment.doctorName || "doctor"}`,
      returnUrl: PAYMENT_CASHFREE_RETURN_URL,
      customer: {
        name: currentUser?.name || patientProfile?.name || "Patient",
        email: currentUser?.email || "",
        phone: customerPhone,
      },
      metadata: {
        patientId: currentUser?.id || appointment.patientId || "",
        doctorId: appointment.doctorUserId || appointment.doctorId || "",
      },
    });

    const checkoutUrl = order.checkoutUrl || order.paymentUrl;
    if (!checkoutUrl) {
      throw new Error("Payment checkout URL was not returned by the backend.");
    }

    const browserResult = await WebBrowser.openAuthSessionAsync(
      checkoutUrl,
      PAYMENT_CASHFREE_RETURN_URL,
    );

    if (browserResult.type !== "success" || !browserResult.url) {
      throw new Error("Payment was cancelled before completion.");
    }

    const params = parseUrlQueryParams(browserResult.url);
    if (params.status !== "success") {
      throw new Error(
        params.message || "Payment was cancelled before completion.",
      );
    }

    const verifyPayload = {
      appointmentId: appointment.id,
      cashfreeOrderId:
        params.cashfree_order_id ||
        params.cashfreeOrderId ||
        params.order_id ||
        order.cashfreeOrderId ||
        order.orderId,
    };

    if (!verifyPayload.cashfreeOrderId) {
      throw new Error(
        "Payment response was incomplete. Please contact support.",
      );
    }

    const verified = await postPaymentJson(
      "/payments/cashfree/verify",
      verifyPayload,
    );
    if (!verified?.verified) {
      throw new Error("Payment verification failed.");
    }
    return verified;
  };

  const payForAppointment = async (appointment) => {
    if (!appointment?.id) {
      throw new Error("Appointment not found.");
    }

    const payKey = normalizeAppointmentStatus(appointment.statusKey);
    if (payKey !== "approved") {
      throw new Error(
        "You can only pay after the doctor has approved this appointment.",
      );
    }
    if (PAYMENT_MODE === "cashfree") {
      await runCashfreeAppointmentPayment(appointment);
    } else if (PAYMENT_MODE === "stripe") {
      throw new Error("Stripe payment mode is not configured in this build.");
    }
    await updateAppointmentStatus({
      appointmentId: appointment.id,
      nextStatus: "paid",
    });
  };

  // -------------------------------------------------------------------------
  // Step 7b - medication schedule helpers used by MedicationTrackerScreen.
  // -------------------------------------------------------------------------
  const fetchMedicationSchedule = async ({ patientId, daysPast = 30 } = {}) => {
    const activePatientId = patientId || currentUser?.id;
    if (!activePatientId) return [];
    const since = new Date();
    since.setDate(since.getDate() - daysPast);
    try {
      const records = await pb.collection("medication_schedule").getFullList({
        requestKey: null,
        sort: "due_at",
        filter: `patient="${activePatientId}" && due_at>="${since
          .toISOString()
          .replace("T", " ")
          .slice(0, 19)}"`,
      });
      return records;
    } catch (error) {
      console.log("fetchMedicationSchedule error:", error?.message);
      return [];
    }
  };

  const markScheduleDoseTaken = async (scheduleId) => {
    if (!scheduleId) return null;
    try {
      const updated = await pb
        .collection("medication_schedule")
        .update(scheduleId, {
          status: "taken",
          taken_at: new Date().toISOString(),
        });
      cancelDoseReminder(scheduleId).catch(() => {});
      return updated;
    } catch (error) {
      console.log("markScheduleDoseTaken error:", error?.message);
      throw new Error(
        error?.data?.message ||
          error?.message ||
          "Unable to mark dose as taken.",
      );
    }
  };

  const markScheduleDoseMissed = async (scheduleId) => {
    if (!scheduleId) return null;
    try {
      return await pb.collection("medication_schedule").update(scheduleId, {
        status: "missed",
      });
    } catch (error) {
      console.log("markScheduleDoseMissed error:", error?.message);
      return null;
    }
  };

  // -------------------------------------------------------------------------
  // Step 9 - AI assistant conversation helpers.
  // We store assistant conversations as regular PocketBase `conversations`
  // rows with `kind="assistant"` and a single member (the patient). Messages
  // in these conversations are stored as PLAIN TEXT so a missing encryption
  // key (or an AI response) is not mangled. Human↔human conversations still
  // go through the normal encrypted `sendConversationMessage` flow.
  // -------------------------------------------------------------------------
  const ensureAssistantConversation = async () => {
    if (!currentUser?.id) return null;
    // Fast-path: check in-memory conversations first.
    const cached = conversations.find(
      (conv) => conv.kind === ASSISTANT_CONVERSATION_KIND,
    );
    if (cached) return cached;
    // Otherwise query PB. Some schemas may not have `kind` yet; catch and
    // fall back to creating one.
    try {
      const list = await pb.collection("conversations").getFullList({
        requestKey: null,
        filter: `members~"${currentUser.id}" && kind="${ASSISTANT_CONVERSATION_KIND}"`,
        expand: "members",
      });
      if (list?.length) {
        return mapConversationRecord(list[0], currentUser.id, {});
      }
    } catch (error) {
      console.log(
        "ensureAssistantConversation lookup skipped:",
        error?.message,
      );
    }
    try {
      const payload = {
        members: [currentUser.id],
        title: "Health Assistant",
        kind: ASSISTANT_CONVERSATION_KIND,
        lastMessageAt: new Date().toISOString(),
      };
      const created = await pb.collection("conversations").create(payload);
      // Seed with a welcome message.
      try {
        await createEncryptedMessage(
          {
            conversation: created.id,
            kind: ASSISTANT_REPLY_MESSAGE_KIND,
          },
          "Hi! I'm your Nvoisys Health Assistant. Ask me about symptoms, medicines, or your prescriptions at any time.",
        );
      } catch (seedError) {
        console.log("assistant seed message skipped:", seedError?.message);
      }
      const hydrated = await pb
        .collection("conversations")
        .getOne(created.id, { requestKey: null, expand: "members" });
      return mapConversationRecord(hydrated, currentUser.id, {});
    } catch (error) {
      console.log("ensureAssistantConversation create error:", error?.message);
      return null;
    }
  };

  const sendAssistantMessage = async (conversationId, text) => {
    if (!conversationId || !currentUser?.id) return null;
    const trimmed = String(text || "").trim();
    if (!trimmed) return null;
    // 1. Post the user's question as an encrypted assistant_user message.
    let userRecord = null;
    try {
      userRecord = await createEncryptedMessage(
        {
          conversation: conversationId,
          sender: currentUser.id,
          kind: ASSISTANT_USER_MESSAGE_KIND,
        },
        trimmed,
      );
    } catch (error) {
      console.log("sendAssistantMessage user write error:", error?.message);
      return null;
    }

    // 2. Call the AI endpoint or fall back to a friendly stub (includes active Rx context).
    const prescriptionsContext = buildPrescriptionsContextForAI(prescriptions);
    const aiResult = await callAIEndpoint({
      kind: "chat",
      question: trimmed,
      patient: patientProfile || null,
      prescriptions: prescriptionsContext,
    });
    const replyText =
      (aiResult && typeof aiResult.reply === "string"
        ? aiResult.reply
        : null) || aiChatStubReply(trimmed, { prescriptionsContext });

    // 3. Persist the AI reply as an encrypted assistant_reply message.
    let replyRecord = null;
    try {
      replyRecord = await createEncryptedMessage(
        {
          conversation: conversationId,
          kind: ASSISTANT_REPLY_MESSAGE_KIND,
        },
        replyText,
      );
      await pb.collection("conversations").update(conversationId, {
        lastMessageAt: new Date().toISOString(),
      });
    } catch (error) {
      console.log("sendAssistantMessage reply error:", error?.message);
    }
    return {
      userMessage: mapMessageRecord(userRecord),
      replyMessage: replyRecord ? mapMessageRecord(replyRecord) : null,
    };
  };

  // -------------------------------------------------------------------------
  // Step 9 - Side-effect check used by PrescriptionModal.
  // Accepts lines + patient health profile and returns a list of warnings.
  // Uses the configured AI endpoint if available, otherwise a local stub.
  // -------------------------------------------------------------------------
  const runSideEffectCheck = async ({ items, patient } = {}) => {
    const patientFields = patient || patientProfile || {};
    const payload = {
      kind: "side_effect_check",
      items,
      patient: patientFields,
    };
    const aiResult = await callAIEndpoint(payload);
    if (aiResult && Array.isArray(aiResult.warnings)) {
      return aiResult.warnings;
    }
    return aiSideEffectStubWarnings(items, patientFields);
  };

  // When the doctor adds a prescription, post an AI side-effect insight into the
  // Health Assistant thread once per prescription (persisted id list per user).
  useEffect(() => {
    if (!currentUser?.id || userRole !== "patient") return undefined;
    if (!prescriptions?.length) return undefined;

    let cancelled = false;
    const timer = setTimeout(() => {
      (async () => {
        const storageKey = rxAssistantNotifiedStorageKey(currentUser.id);
        let notified = [];
        try {
          const raw = await AsyncStorage.getItem(storageKey);
          const parsed = raw ? JSON.parse(raw) : [];
          notified = Array.isArray(parsed) ? parsed : [];
        } catch {
          notified = [];
        }
        const notifiedSet = new Set(notified.map(String));

        let assistantConv =
          conversations.find((c) => c.kind === ASSISTANT_CONVERSATION_KIND) ||
          null;
        if (!assistantConv?.id) {
          try {
            assistantConv = await ensureAssistantConversation();
          } catch {
            assistantConv = null;
          }
        }
        const conversationId = assistantConv?.id;
        if (!conversationId || cancelled) return;

        const now = Date.now();
        let dirty = false;

        const persistNotified = async () => {
          if (cancelled || !dirty) return;
          try {
            await AsyncStorage.setItem(
              storageKey,
              JSON.stringify([...notifiedSet]),
            );
            void refreshAllData(currentUser, userRole).catch(() => {});
          } catch (error) {
            console.log("rx assistant notified persist error:", error?.message);
          }
        };

        for (const rx of prescriptions) {
          if (!rx?.id || cancelled) break;
          const idStr = String(rx.id);
          if (notifiedSet.has(idStr)) continue;

          const createdMs = prescriptionRecordCreatedMs(rx);
          if (now - createdMs > RX_INSIGHT_MAX_AGE_MS) {
            notifiedSet.add(idStr);
            dirty = true;
            continue;
          }

          const items =
            rx.itemsList?.length > 0
              ? rx.itemsList
                  .map((m) => ({ name: String(m.name || "").trim() }))
                  .filter((m) => m.name)
              : [{ name: String(rx.items || "Medicine").trim() }].filter(
                  (m) => m.name,
                );
          if (!items.length) {
            notifiedSet.add(idStr);
            dirty = true;
            continue;
          }

          let warnings = [];
          try {
            warnings = await runSideEffectCheck({
              items,
              patient: patientProfile || {},
            });
          } catch {
            warnings = [];
          }
          if (cancelled) break;

          const body = formatAssistantPrescriptionInsightMessage(rx, warnings);
          try {
            await createEncryptedMessage(
              {
                conversation: conversationId,
                kind: ASSISTANT_REPLY_MESSAGE_KIND,
              },
              body,
            );
            await pb.collection("conversations").update(conversationId, {
              lastMessageAt: new Date().toISOString(),
            });
            notifiedSet.add(idStr);
            dirty = true;
          } catch (error) {
            console.log(
              "rx assistant insight message skipped:",
              error?.message,
            );
          }
        }

        await persistNotified();
      })();
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [prescriptions, currentUser, userRole, patientProfile, conversations]);

  useEffect(() => {
    (async () => {
      try {
        await restoreAuth();

        const user = getAuthUser();
        if (pb.authStore.isValid && user?.id) {
          setCurrentUser(user);
          setUserRole(user.role || "patient");

          try {
            const profile = await ensureRoleProfile(user.role || "patient");
            setPatientProfile(profile);
          } catch (e) {
            setPatientProfile(null);
          }
        }
      } finally {
        setLoadingAuth(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!currentUser?.id || !userRole) {
      setWounds([]);
      setMedOrders([]);
      setPrescriptions([]);
      setConversations([]);
      setAppointments([]);
      return;
    }

    if (
      userRole === "doctor" &&
      normalizeDoctorApplicationStatus(patientProfile?.status) !== "approved"
    ) {
      setWounds([]);
      setMedOrders([]);
      setPrescriptions([]);
      setConversations([]);
      setAppointments([]);
      return;
    }
    refreshAllData(currentUser, userRole);
  }, [currentUser?.id, userRole, patientProfile?.status]);

  // Step 7b: when a patient logs in, request notification permission up-front
  // so later dose reminders can be scheduled silently. Best-effort.
  // Defer on Android: LDPlayer / some emulators crash if permission runs in the
  // same tick as heavy post-login layout + PocketBase realtime.
  useEffect(() => {
    if (!currentUser?.id || userRole !== "patient") return;
    let cancelled = false;
    const delayMs = Platform.OS === "android" ? 2000 : 0;
    const t = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        ensureReminderPermissions().catch(() => {});
      });
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [currentUser?.id, userRole]);

  // Step 9: give every patient a pinned "Health Assistant" conversation the
  // first time they sign in. The call is best-effort - if PocketBase doesn't
  // have the `kind` field or blocks the create, login still proceeds.
  useEffect(() => {
    if (!currentUser?.id || userRole !== "patient") return;
    let cancelled = false;
    (async () => {
      try {
        await ensureAssistantConversation();
        if (!cancelled) {
          void refreshAllData(currentUser, userRole).catch(() => {});
        }
      } catch (error) {
        console.log("assistant conversation setup skipped:", error?.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, userRole]);

  useEffect(() => {
    if (!currentUser?.id || !userRole) return;

    if (
      userRole === "doctor" &&
      normalizeDoctorApplicationStatus(patientProfile?.status) !== "approved"
    ) {
      return;
    }

    let debounceTimer = null;
    const scheduleDataRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        refreshAllData(currentUser, userRole);
      }, 800);
    };

    const subscribe = async () => {
      try {
        await pb.collection("wounds").subscribe("*", () => {
          scheduleDataRefresh();
        });
        await pb.collection("orders").subscribe("*", () => {
          scheduleDataRefresh();
        });
        try {
          await pb.collection("prescriptions").subscribe("*", () => {
            scheduleDataRefresh();
          });
        } catch (error) {
          console.log("prescriptions subscribe skipped:", error?.message);
        }
        await pb.collection("conversations").subscribe("*", () => {
          scheduleDataRefresh();
        });
      } catch (error) {
        console.log("App subscription error:", error);
      }
      try {
        await pb.collection(PB_APPOINTMENTS_COLLECTION).subscribe("*", () => {
          scheduleDataRefresh();
        });
      } catch (error) {
        console.log("appointments subscribe skipped:", error?.message);
      }
    };

    subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      pb.collection("wounds").unsubscribe("*");
      pb.collection("orders").unsubscribe("*");
      try {
        pb.collection("prescriptions").unsubscribe("*");
      } catch {
        // Collection may not exist in every workspace.
      }
      pb.collection("conversations").unsubscribe("*");
      try {
        pb.collection(PB_APPOINTMENTS_COLLECTION).unsubscribe("*");
      } catch {
        // Collection may not exist in every workspace.
      }
    };
  }, [currentUser?.id, userRole, patientProfile?.status]);

  if (loadingAuth) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.bg,
        }}
      >
        <ActivityIndicator size="large" color={theme.accent} />
        <Text
          style={{
            color: theme.textPrimary,
            fontSize: RFValue(16),
            fontWeight: "700",
            marginTop: 12,
          }}
        >
          Loading…
        </Text>
      </SafeAreaView>
    );
  }

  const upgradeToPackageMode = async () => {
    if (!currentUser?.id || userRole !== "patient") return;
    await persistPatientCareMode({
      profileId: patientProfile?.id,
      userId: currentUser.id,
      mode: CARE_MODE.PACKAGE,
    });
    setLocalCareMode(CARE_MODE.PACKAGE);
    try {
      const refreshed = await ensureRoleProfile("patient");
      setPatientProfile(refreshed);
    } catch (_) {
      // ignore
    }
  };

  const resetCareOnboarding = async () => {
    if (!currentUser?.id || userRole !== "patient") return;
    await clearPatientCareMode({
      profileId: patientProfile?.id,
      userId: currentUser.id,
    });
    setLocalCareMode("");
    try {
      const refreshed = await ensureRoleProfile("patient");
      setPatientProfile(refreshed);
    } catch (_) {
      // ignore
    }
  };

  const appDataValue = {
    userRole,
    currentUser,
    currentUserId: currentUser?.id || null,
    patientProfile,
    wounds,
    setWounds,
    medOrders,
    setMedOrders,
    prescriptions,
    appointments,
    conversations,
    patients,
    setPatients,
    doctorSelectedWoundId,
    setDoctorSelectedWoundId,
    patientSelectedWoundId,
    setPatientSelectedWoundId,
    patientShowNewWound,
    setPatientShowNewWound,
    dataLoading,
    dataError,
    refreshAllData,
    ensureConversationForWound,
    ensureDirectConversation,
    loadDirectoryContacts,
    loadConversationMessages,
    sendConversationMessage,
    sendConversationImage,
    pendingChatRequest,
    requestOpenConversation: (conversationId, options = {}) => {
      if (!conversationId) return;
      setPendingChatRequest({
        conversationId,
        patientUserId: options.patientUserId || null,
        ts: Date.now(),
      });
    },
    requestOpenDirectChatWithPatient: (patientUserId, options = {}) => {
      if (!patientUserId) return;
      setPendingChatRequest({
        patientUserId,
        conversationId: options.conversationId || null,
        ts: Date.now(),
      });
    },
    consumePendingChatRequest: () => setPendingChatRequest(null),
    createWoundReport,
    prescribeForWound,
    updateOrderStatus,
    createPharmacyOrder,
    fetchApprovedDoctors,
    createAppointment,
    updateAppointmentStatus,
    applyPatientRescheduleChoice,
    cancelAppointmentByPatient,
    payForAppointment,
    fetchMedicationSchedule,
    markScheduleDoseTaken,
    markScheduleDoseMissed,
    ensureAssistantConversation,
    sendAssistantMessage,
    runSideEffectCheck,
    paymentMode: PAYMENT_MODE,
    hospitals,
    hospitalsLoading,
    fetchHospitals,
    pharmacies,
    pharmaciesLoading,
    fetchPharmacies,
    savePharmacyProfile,
    setPatientProfile,
    patientCareMode:
      userRole === "patient"
        ? effectiveCareMode(patientProfile, localCareMode)
        : null,
    localCareMode,
    setLocalCareMode,
    clearPatientCareMode,
    persistPatientCareMode,
    CARE_MODE,
    upgradeToPackageMode,
    resetCareOnboarding,
  };

  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={{ theme, changeTheme, themeKey }}>
        <AppDataContext.Provider value={appDataValue}>
          <RootErrorBoundary theme={theme}>
            <AppContent
              userRole={userRole}
              setUserRole={setUserRole}
              currentUser={currentUser}
              setCurrentUser={setCurrentUser}
              patientProfile={patientProfile}
              setPatientProfile={setPatientProfile}
              localCareMode={localCareMode}
              setLocalCareMode={setLocalCareMode}
              theme={theme}
              wounds={wounds}
              setWounds={setWounds}
              medOrders={medOrders}
              setMedOrders={setMedOrders}
              patients={patients}
              setPatients={setPatients}
            />
          </RootErrorBoundary>
          <NotificationHost />
        </AppDataContext.Provider>
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

const MandatoryNameScreen = ({ currentUser, theme, onSaved, onLogout }) => {
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const saveName = async () => {
    const trimmed = displayName.trim();
    if (trimmed.length < 2) {
      setError("Please enter your full name or username.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await pb
        .collection("UsersAuth")
        .update(currentUser.id, { name: trimmed });
      await pb.collection("UsersAuth").authRefresh();
      onSaved?.(getAuthUser());
    } catch (saveError) {
      setError(
        formatPocketBaseClientError(saveError) ||
          saveError?.message ||
          "Could not save your name. Please retry.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: RFValue(22),
            paddingTop: Math.max(insets.top, RFValue(24)),
            paddingBottom: Math.max(insets.bottom, RFValue(36)),
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(22),
              padding: RFValue(20),
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          >
            <Text
              style={{
                fontSize: RFValue(20),
                fontWeight: "900",
                color: theme.textPrimary,
                marginBottom: RFValue(8),
              }}
            >
              Choose your name
            </Text>
            <Text
              style={{
                fontSize: RFValue(13),
                color: theme.textSecondary,
                lineHeight: RFValue(19),
                marginBottom: RFValue(16),
              }}
            >
              Google can sign you in without a clear app username. Add the name
              others should see before continuing.
            </Text>
            <TextInput
              value={displayName}
              onChangeText={(value) => {
                setDisplayName(value);
                if (error) setError("");
              }}
              placeholder="Full name or username"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="words"
              editable={!saving}
              style={{
                backgroundColor: theme.bg,
                borderRadius: RFValue(14),
                borderWidth: 1,
                borderColor: theme.cardBorder,
                paddingHorizontal: RFValue(14),
                paddingVertical: RFValue(14),
                fontSize: RFValue(15),
                color: theme.textPrimary,
                marginBottom: RFValue(12),
              }}
            />
            {error ? (
              <Text
                style={{
                  color: theme.danger,
                  fontSize: RFValue(12),
                  fontWeight: "700",
                  marginBottom: RFValue(12),
                }}
              >
                {error}
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={saveName}
              disabled={saving}
              style={{
                backgroundColor: theme.accent,
                borderRadius: RFValue(14),
                paddingVertical: RFValue(14),
                alignItems: "center",
                opacity: saving ? 0.65 : 1,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  Continue
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onLogout}
              disabled={saving}
              style={{ alignItems: "center", marginTop: RFValue(14) }}
            >
              <Text style={{ color: theme.textSecondary, fontWeight: "700" }}>
                Sign out
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const AppContent = ({
  userRole,
  setUserRole,
  currentUser,
  setCurrentUser,
  patientProfile,
  setPatientProfile,
  localCareMode,
  setLocalCareMode,
  theme,
  wounds,
  setWounds,
  medOrders,
  setMedOrders,
  patients,
  setPatients,
}) => {
  const {
    setDoctorSelectedWoundId,
    setPatientSelectedWoundId,
    setPatientShowNewWound,
  } = useAppData();

  const handleAuthSuccess = ({ user, profile }) => {
    setCurrentUser(user);
    setUserRole(user.role || "patient");
    setPatientProfile(profile || null);
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setPatientProfile(null);
    setUserRole(null);
    setLocalCareMode("");
    setDoctorSelectedWoundId(null);
    setPatientSelectedWoundId(null);
    setPatientShowNewWound(false);
  };

  const handleMandatoryNameSaved = async (updatedUser) => {
    setCurrentUser(updatedUser);
    try {
      const profile = await ensureRoleProfile(
        updatedUser.role || userRole || "patient",
      );
      setPatientProfile(profile || null);
    } catch (error) {
      console.log("mandatory name profile refresh:", error?.message || error);
    }
  };

  const refreshDoctorStatus = async () => {
    try {
      // Refresh the auth model (in case role or record fields changed).
      if (pb.authStore.isValid) {
        await pb.collection("UsersAuth").authRefresh();
      }
      const refreshedUser = getAuthUser();
      if (refreshedUser?.id) {
        setCurrentUser(refreshedUser);
      }
      if (currentUser?.role === "doctor" || userRole === "doctor") {
        const profile = await ensureRoleProfile("doctor");
        setPatientProfile(profile || null);
      }
    } catch (error) {
      console.log("refreshDoctorStatus error:", error);
    }
  };

  const [doctorPkgLockResolved, setDoctorPkgLockResolved] = useState(false);
  const [doctorPkgLockShowSetup, setDoctorPkgLockShowSetup] = useState(false);

  useEffect(() => {
    if (userRole !== "doctor") {
      setDoctorPkgLockResolved(true);
      setDoctorPkgLockShowSetup(false);
      return undefined;
    }
    if (
      normalizeDoctorApplicationStatus(patientProfile?.status) !== "approved"
    ) {
      setDoctorPkgLockResolved(true);
      setDoctorPkgLockShowSetup(false);
      return undefined;
    }
    if (patientProfile?.package_setup === true) {
      setDoctorPkgLockResolved(true);
      setDoctorPkgLockShowSetup(false);
      return undefined;
    }
    const raw = packageTemplatesRawFromRecord(patientProfile);
    const baseSlots = normalizeDoctorPackageSlots(raw);
    const skipServer = doctorProfilePackageSetupSkipped(patientProfile);
    if (skipServer || doctorPackagesSetupComplete(baseSlots)) {
      setDoctorPkgLockResolved(true);
      setDoctorPkgLockShowSetup(false);
      return undefined;
    }
    if (!currentUser?.id) {
      setDoctorPkgLockResolved(true);
      setDoctorPkgLockShowSetup(true);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const skipLocal = await readLocalPackageSetupSkip(currentUser.id);
      if (cancelled) return;
      if (skipLocal) {
        setDoctorPkgLockResolved(true);
        setDoctorPkgLockShowSetup(false);
        return;
      }
      const localFees = await readLocalDoctorPackageFees(currentUser.id);
      if (cancelled) return;
      const merged = mergeLocalFeesOntoSlots(baseSlots, localFees || []);
      const complete = doctorPackagesSetupComplete(merged);
      setDoctorPkgLockResolved(true);
      setDoctorPkgLockShowSetup(!complete);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    userRole,
    currentUser?.id,
    patientProfile?.id,
    patientProfile?.package_templates,
    patientProfile?.packages_template,
    patientProfile?.package_slots,
    patientProfile?.package_setup,
    patientProfile?.package_setup_skipped,
    patientProfile?.status,
  ]);

  if (!userRole) {
    return <AuthScreen onLogin={handleAuthSuccess} />;
  }

  if (currentUser?.id && !String(currentUser?.name || "").trim()) {
    return (
      <MandatoryNameScreen
        currentUser={currentUser}
        theme={theme}
        onSaved={handleMandatoryNameSaved}
        onLogout={handleLogout}
      />
    );
  }

  if (userRole === "admin") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <StatusBar
          barStyle={theme.statusBarStyle}
          backgroundColor={theme.statusBarBg}
        />
        <AdminConsoleAppScreen theme={theme} onLogout={handleLogout} />
      </SafeAreaView>
    );
  }

  if (
    userRole === "patient" &&
    needsCareOnboarding(patientProfile, localCareMode)
  ) {
    return (
      <CareModeOnboardingScreen
        theme={theme}
        patientProfile={patientProfile}
        currentUser={currentUser}
        onDone={async (mode) => {
          await persistPatientCareMode({
            profileId: patientProfile?.id,
            userId: currentUser?.id,
            mode,
          });
          setLocalCareMode(mode);
          try {
            const refreshed = await ensureRoleProfile("patient");
            setPatientProfile(refreshed);
          } catch (_) {
            // profile refresh optional
          }
        }}
      />
    );
  }

  if (userRole === "doctor") {
    if (
      normalizeDoctorApplicationStatus(patientProfile?.status) !== "approved"
    ) {
      return (
        <DoctorApplicationStatusScreen
          status={patientProfile?.status}
          onRefresh={refreshDoctorStatus}
          onLogout={handleLogout}
        />
      );
    }
    if (!doctorPkgLockResolved) {
      return (
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: theme.bg,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <StatusBar
            barStyle={theme.statusBarStyle}
            backgroundColor={theme.statusBarBg}
          />
          <ActivityIndicator size="large" color={theme.accent} />
        </SafeAreaView>
      );
    }
    if (doctorPkgLockShowSetup) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
          <StatusBar
            barStyle={theme.statusBarStyle}
            backgroundColor={theme.statusBarBg}
          />
          <DoctorPackageSetupScreen
            theme={theme}
            doctorProfileId={patientProfile?.id}
            initialRecord={patientProfile}
            currentUserId={currentUser?.id}
            onLogout={handleLogout}
            onSkip={async () => {
              setDoctorPkgLockResolved(true);
              setDoctorPkgLockShowSetup(false);
              try {
                if (pb.authStore.isValid) {
                  await pb.collection("UsersAuth").authRefresh();
                }
                const refreshed = await ensureRoleProfile("doctor");
                setPatientProfile(refreshed);
              } catch (error) {
                console.log(
                  "Doctor package skip refresh:",
                  error?.message || error,
                );
              }
            }}
            onComplete={async () => {
              setDoctorPkgLockResolved(true);
              setDoctorPkgLockShowSetup(false);
              try {
                if (pb.authStore.isValid) {
                  await pb.collection("UsersAuth").authRefresh();
                }
                const refreshed = await ensureRoleProfile("doctor");
                setPatientProfile(refreshed);
              } catch (error) {
                console.log(
                  "Doctor package setup refresh:",
                  error?.message || error,
                );
              }
            }}
          />
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.bg }}
        edges={["top", "left", "right"]}
      >
        <StatusBar
          barStyle={theme.statusBarStyle}
          backgroundColor={theme.statusBarBg}
        />
        <CustomTabNavigator
          activeColor="#0EA5E9"
          routes={[
            {
              name: "Home",
              label: "Home",
              component: (props) => (
                <DoctorDashboard
                  {...props}
                  wounds={wounds}
                  patients={patients}
                />
              ),
              icon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "home" : "home-outline"}
                  size={RFValue(22)}
                  color={color}
                />
              ),
            },
            {
              name: "Patients",
              label: "Patients",
              component: (props) => (
                <DoctorPatientsScreen {...props} patients={patients} />
              ),
              icon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "people" : "people-outline"}
                  size={RFValue(22)}
                  color={color}
                />
              ),
            },
            {
              name: "Wounds",
              label: "Wounds",
              component: (props) => (
                <DoctorWoundsScreen
                  {...props}
                  wounds={wounds}
                  setWounds={setWounds}
                  setMedOrders={setMedOrders}
                />
              ),
              icon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "bandage" : "bandage-outline"}
                  size={RFValue(22)}
                  color={color}
                />
              ),
            },
            {
              name: "Chat",
              label: "Chat",
              component: PatientChatScreen,
              icon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "chatbubble" : "chatbubble-outline"}
                  size={RFValue(22)}
                  color={color}
                />
              ),
            },
            {
              name: "Staff",
              label: "Staff",
              component: StaffManagementScreen,
              icon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "briefcase" : "briefcase-outline"}
                  size={RFValue(22)}
                  color={color}
                />
              ),
            },
            {
              name: "Profile",
              label: "Profile",
              component: (props) => (
                <DoctorProfileScreen {...props} onLogout={handleLogout} />
              ),
              icon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "person" : "person-outline"}
                  size={RFValue(22)}
                  color={color}
                />
              ),
            },
          ]}
        />
      </SafeAreaView>
    );
  }

  if (userRole === "pharmacy") {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.bg }}
        edges={["top", "left", "right"]}
      >
        <StatusBar
          barStyle={theme.statusBarStyle}
          backgroundColor={theme.statusBarBg}
        />
        <CustomTabNavigator
          activeColor="#059669"
          routes={[
            {
              name: "Home",
              label: "Dashboard",
              component: (props) => (
                <PharmacyDashboard {...props} orders={medOrders} />
              ),
              icon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "home" : "home-outline"}
                  size={RFValue(22)}
                  color={color}
                />
              ),
            },
            {
              name: "Inventory",
              label: "Meds",
              component: MedicationTrackerScreen,
              icon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "leaf" : "leaf-outline"}
                  size={RFValue(22)}
                  color={color}
                />
              ),
            },
            {
              name: "Chat",
              label: "Chat",
              component: PatientChatScreen,
              icon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "chatbubble" : "chatbubble-outline"}
                  size={RFValue(22)}
                  color={color}
                />
              ),
            },
            {
              name: "Profile",
              label: "Profile",
              component: (props) => (
                <PharmacyProfileScreen {...props} onLogout={handleLogout} />
              ),
              icon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "person" : "person-outline"}
                  size={RFValue(22)}
                  color={color}
                />
              ),
            },
          ]}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["top", "left", "right"]}
    >
      <StatusBar
        barStyle={theme.statusBarStyle}
        backgroundColor={theme.statusBarBg}
      />
      <CustomTabNavigator
        activeColor={theme.accent}
        routes={[
          {
            name: "Home",
            label: "Home",
            component: PatientHomeScreen,
            icon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={RFValue(22)}
                color={color}
              />
            ),
          },
          {
            name: "Wound",
            label: "Wound",
            component: (props) => (
              <PatientWoundScreen
                {...props}
                wounds={wounds}
                setWounds={setWounds}
              />
            ),
            icon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "bandage" : "bandage-outline"}
                size={RFValue(22)}
                color={color}
              />
            ),
          },
          {
            name: "Appts",
            label: "Appts",
            component: () => <PatientAppointmentsScreen />,
            icon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "calendar" : "calendar-outline"}
                size={RFValue(22)}
                color={color}
              />
            ),
          },
          {
            name: "Pharmacy",
            label: "Orders",
            component: (props) => (
              <PharmacyOrdersScreen {...props} orders={medOrders} />
            ),
            icon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "cart" : "cart-outline"}
                size={RFValue(22)}
                color={color}
              />
            ),
          },
          {
            name: "Chat",
            label: "Chat",
            component: PatientChatScreen,
            icon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "chatbubble" : "chatbubble-outline"}
                size={RFValue(22)}
                color={color}
              />
            ),
          },
          {
            name: "Profile",
            label: "Profile",
            component: (props) => (
              <PatientProfileScreen
                {...props}
                patientProfile={patientProfile}
                currentUser={currentUser}
                onLogout={handleLogout}
                onPatientProfileSaved={async () => {
                  try {
                    if (pb.authStore.isValid) {
                      await pb.collection("UsersAuth").authRefresh();
                    }
                    const refreshedUser = getAuthUser();
                    if (refreshedUser?.id) {
                      setCurrentUser(refreshedUser);
                    }
                    const refreshedProfile = await ensureRoleProfile("patient");
                    setPatientProfile(refreshedProfile);
                  } catch (error) {
                    console.log("onPatientProfileSaved:", error);
                  }
                }}
              />
            ),
            icon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "person" : "person-outline"}
                size={RFValue(22)}
                color={color}
              />
            ),
          },
        ]}
      />
    </SafeAreaView>
  );
};
