import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";
import {
  Dimensions,
  PixelRatio,
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  Animated,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  BackHandler,
} from "react-native";
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  mediaDevices,
} from "@livekit/react-native-webrtc";
import Constants from "expo-constants";
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";
import {
  pb,
  restoreAuth,
  ensureRoleProfile,
  signUpWithEmail,
  loginWithEmail,
  signInWithOAuth,
  logoutUser,
} from "./pocketbase";

// --- THEME DEFINITIONS ---
const THEMES = {
  light: {
    name: "Light",
    bg: "#F8FAFC",
    bgSolid: "#FFFFFF",
    card: "#FFFFFF",
    cardBorder: "#F3F4F6",
    textPrimary: "#1E1B4B",
    textSecondary: "#6B7280",
    textTertiary: "#9CA3AF",
    accent: "#4338CA",
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
    headerBg: "#4338CA",
    headerText: "#FFFFFF",
    tabBarBg: "#FFFFFF",
    tabBarBorder: "#F3F4F6",
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

const WOUND_STATUS_LABELS = {
  review_pending: "Review Pending",
  under_review: "Under Review",
  medication_prescribed: "Medication Prescribed",
  closed: "Closed",
};

const ORDER_STATUS_LABELS = {
  pending: "Pending",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const MEDICINE_PRICE_MAP = {
  Amoxicillin: 220,
  Warfarin: 180,
  Ibuprofen: 120,
  Neosporin: 150,
};

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
    return `ws://${host}:8080`;
  }
  return "ws://localhost:8080";
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
  return ORDER_STATUS_LABELS[value] || value;
};

const normalizeOrderStatus = (value) => {
  if (!value) return "pending";
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  return ORDER_STATUS_LABELS[normalized] ? normalized : "pending";
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

const uniqueIds = (values) => [...new Set(safeArray(values).filter(Boolean))];

const buildConversationTitle = (woundRecord) => {
  const description = woundRecord?.description || "Wound Case";
  return description.length > 40
    ? `${description.slice(0, 40)}...`
    : description;
};

const sumMedicationAmount = (items) =>
  safeArray(items).reduce(
    (total, name) => total + (MEDICINE_PRICE_MAP[name] || 100),
    0,
  );

const mapMessageRecord = (record) => {
  const senderRecord = record?.expand?.sender;
  return {
    id: record.id,
    text: record.text || "",
    kind: record.kind || "text",
    senderId: record.sender || null,
    senderRole: senderRecord?.role || (record.sender ? "user" : "system"),
    senderName: senderRecord?.name || (record.sender ? "User" : "System"),
    time: formatTimeValue(record.created),
    created: record.created,
    raw: record,
  };
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
  doctor: record.doctor || null,
  conversation: record.conversation || null,
  hasPharmacy: !!record.hasPharmacy,
  raw: record,
});

const mapOrderRecord = (record) => ({
  id: record.id,
  wound: record.wound || null,
  conversation: record.conversation || null,
  patient: record.expand?.patient?.name || "Patient",
  patientId: record.patient || null,
  itemsList: safeArray(record.items),
  items: safeArray(record.items).join(", ") || "Medicine items",
  totalAmount: Number(record.totalAmount || 0),
  total: formatCurrency(record.totalAmount || 0),
  status: humanizeOrderStatus(record.status),
  statusKey: normalizeOrderStatus(record.status),
  time: formatTimeValue(record.updated || record.created),
  raw: record,
});

const mapConversationRecord = (record, currentUserId, previewMap = {}) => {
  const members = safeArray(record.expand?.members);
  const otherMembers = members.filter((member) => member.id !== currentUserId);
  const memberRoles = uniqueIds(otherMembers.map((member) => member.role));
  const linkedWound = record.expand?.linkedWound;
  const preview = previewMap[record.id];
  const displayName =
    record.title ||
    (otherMembers.length > 0
      ? otherMembers.map((member) => member.name || member.role).join(", ")
      : "Conversation");
  const fallbackTitle = linkedWound ? buildConversationTitle(linkedWound) : null;
  const linkedWoundDescription =
    linkedWound?.description || record.title || displayName;
  return {
    id: record.id,
    title: record.title || fallbackTitle || displayName,
    linkedWoundId: record.linkedWound || linkedWound?.id || null,
    linkedWoundDescription,
    members: safeArray(record.members),
    memberUsers: members,
    displayName,
    roleLabel:
      memberRoles.length > 0
        ? memberRoles.join(", ")
        : linkedWound
          ? "Wound Case"
          : "Chat",
    status: "Online",
    image: linkedWound
      ? "bandage-outline"
      : memberRoles.includes("pharmacy")
        ? "leaf"
        : memberRoles.includes("doctor")
          ? "medical"
          : "chatbubble-ellipses",
    lastMsg:
      preview?.text || linkedWound?.description || "Tap to open conversation",
    time: formatTimeValue(
      record.lastMessageAt || record.updated || record.created,
    ),
    unread: 0,
    raw: record,
  };
};

// --- RESPONSIVE SCALING ---
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const scale = SCREEN_WIDTH / 375;
const RFValue = (size) =>
  Math.round(PixelRatio.roundToNearestPixel(size * scale));

// --- ANIMATION WRAPPERS ---
const FadeInView = ({ children, style, delay = 0 }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        delay,
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

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
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
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
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
    const beat = Animated.sequence([
      Animated.timing(heartAnim, {
        toValue: 1.15,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(heartAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(heartAnim, {
        toValue: 1.08,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(heartAnim, {
        toValue: 1,
        duration: 400,
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
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.6,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
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
          top: -size / 4,
          left: -size / 4,
          right: -size / 4,
          bottom: -size / 4,
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
      duration: 1200,
      delay: 500,
      useNativeDriver: false,
    }).start();
  }, [progress]);

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
      friction: 3,
      tension: 40,
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
                inputRange: [0, 0.5, 1],
                outputRange: [0.5, 1.1, 1],
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
      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 50,
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
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1500,
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
        duration: duration,
        useNativeDriver: true,
      }),
    ).start();
  }, [rotateAnim]);

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

const NVOISYS_LOGO =
  "data:image/png;base64,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";

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

// --- SCREENS ---

// 1. Home Dashboard
const PatientPlaceholderScreen = () => (
  <View style={{ flex: 1, backgroundColor: "#F8F9FA" }} />
);

const PatientHomeScreen = () => {
  const { theme } = useTheme();
  const [selectedEmoji, setSelectedEmoji] = useState(null);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [showAppointment, setShowAppointment] = useState(false);
  const [showPrescription, setShowPrescription] = useState(false);
  const [showMeds, setShowMeds] = useState(false);
  const [showFamily, setShowFamily] = useState(false);
  const [showSOS, setShowSOS] = useState(false);

  useEffect(() => {
    const handleBack = () => {
      if (showVideoCall) {
        setShowVideoCall(false);
        return true;
      }
      if (showAppointment) {
        setShowAppointment(false);
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
      return false;
    };
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBack,
    );
    return () => subscription.remove();
  }, [
    showVideoCall,
    showAppointment,
    showPrescription,
    showMeds,
    showFamily,
    showSOS,
  ]);

  if (showVideoCall)
    return <VideoCallScreen onBack={() => setShowVideoCall(false)} />;
  if (showAppointment)
    return (
      <AppointmentBookingScreen onBack={() => setShowAppointment(false)} />
    );
  if (showPrescription)
    return <PrescriptionScreen onBack={() => setShowPrescription(false)} />;
  if (showMeds)
    return <MedicationTrackerScreen onBack={() => setShowMeds(false)} />;
  if (showFamily)
    return <FamilyHealthScreen onBack={() => setShowFamily(false)} />;
  if (showSOS) return <EmergencySOScreen onBack={() => setShowSOS(false)} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={theme.accent} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: RFValue(100), flexGrow: 1 }}
      >
        <FadeInView delay={100}>
          {/* Modern Gradient Header */}
          <View
            style={{
              backgroundColor: theme.accent,
              padding: RFValue(24),
              paddingTop: Platform.OS === "android" ? 48 : 20,
              paddingBottom: RFValue(48),
              borderBottomLeftRadius: RFValue(32),
              borderBottomRightRadius: RFValue(32),
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
                backgroundColor: "rgba(255,255,255,0.1)",
                borderRadius: RFValue(16),
                padding: RFValue(14),
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
                  justifyContent: "space-between",
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
                        height: RFValue(36),
                        borderRadius: RFValue(14),
                        justifyContent: "center",
                        alignItems: "center",
                        borderWidth: selectedEmoji === mood ? 2 : 0,
                        borderColor: "#FFF",
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

        <FadeInView delay={200}>
          <View
            style={{ paddingHorizontal: RFValue(16), marginTop: -RFValue(24) }}
          >
            {/* Quick Actions Grid */}
            <View
              style={{
                backgroundColor: theme.card,
                borderRadius: RFValue(20),
                padding: RFValue(16),
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
                  justifyContent: "space-between",
                }}
              >
                <TouchableOpacity style={{ alignItems: "center", flex: 1 }}>
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
                <TouchableOpacity style={{ alignItems: "center", flex: 1 }}>
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
                <TouchableOpacity style={{ alignItems: "center", flex: 1 }}>
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
                <TouchableOpacity style={{ alignItems: "center", flex: 1 }}>
                  <View
                    style={{
                      width: RFValue(48),
                      height: RFValue(48),
                      borderRadius: RFValue(14),
                      backgroundColor: theme.dangerLight,
                      justifyContent: "center",
                      alignItems: "center",
                      marginBottom: RFValue(6),
                    }}
                  >
                    <Ionicons
                      name="location"
                      size={RFValue(24)}
                      color={theme.danger}
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

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: RFValue(16),
              }}
            >
              <TouchableOpacity
                onPress={() => setShowVideoCall(true)}
                style={{
                  flex: 1,
                  backgroundColor: theme.card,
                  borderRadius: RFValue(16),
                  padding: RFValue(16),
                  marginRight: RFValue(8),
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
                onPress={() => setShowAppointment(true)}
                style={{
                  flex: 1,
                  backgroundColor: theme.card,
                  borderRadius: RFValue(16),
                  padding: RFValue(16),
                  marginLeft: RFValue(8),
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
                  style={{ fontSize: RFValue(12), color: theme.textSecondary }}
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
                  style={{ fontSize: RFValue(12), color: theme.textSecondary }}
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
                  style={{ fontSize: RFValue(12), color: theme.textSecondary }}
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
                <Ionicons name="alert-circle" size={RFValue(22)} color="#FFF" />
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
    </SafeAreaView>
  );
};

const PatientEmergencyScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const [pressed, setPressed] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
          paddingBottom: RFValue(100),
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

        {/* Nearby Hospitals */}
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
            Nearby Hospitals
          </Text>
          <View style={{ alignItems: "center", paddingVertical: RFValue(20) }}>
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
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const CallScreen = ({ conversationId, callType = "video", onClose, contact }) => {
  const { theme } = useTheme();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [status, setStatus] = useState("Connecting...");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === "video");
  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const roleRef = useRef("receiver");

  const cleanupStreams = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
  };

  const closeConnection = () => {
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
    cleanupStreams();
  };

  const handleClose = () => {
    closeConnection();
    onClose();
  };

  useEffect(() => {
    let mounted = true;

    const setupCall = async () => {
      try {
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: isVideoEnabled,
        });
        if (!mounted) return;
        setLocalStream(stream);

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
          if (event.candidate && wsRef.current) {
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
              userId: contact?.id || null,
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
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: "offer", sdp: offer }));
            setStatus("Calling...");
            return;
          }

          if (payload.type === "offer") {
            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(payload.sdp),
            );
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: "answer", sdp: answer }));
            setStatus("Connecting...");
            return;
          }

          if (payload.type === "answer") {
            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(payload.sdp),
            );
            return;
          }

          if (payload.type === "ice" && payload.candidate) {
            await peerConnection.addIceCandidate(
              new RTCIceCandidate(payload.candidate),
            );
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
      closeConnection();
    };
  }, [conversationId]);

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
          <RTCView
            streamURL={remoteStream.toURL()}
            style={{ width: "100%", height: "100%" }}
            objectFit="cover"
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
              <RTCView
                streamURL={localStream.toURL()}
                style={{ width: "100%", height: "100%" }}
                objectFit="cover"
                mirror
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

const PatientChatScreen = () => {
  const { theme } = useTheme();
  const {
    currentUserId,
    conversations,
    loadConversationMessages,
    sendConversationMessage,
    ensureDirectConversation,
    loadDirectoryContacts,
    dataLoading,
    dataError,
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

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredContacts = conversations.filter((c) => {
    if (!normalizedQuery) return true;
    return (
      c.displayName.toLowerCase().includes(normalizedQuery) ||
      c.roleLabel.toLowerCase().includes(normalizedQuery) ||
      c.lastMsg.toLowerCase().includes(normalizedQuery)
    );
  });

  const formatDirectoryContact = (user) => {
    const role = user?.role === "pharmacy" ? "pharmacy" : "doctor";
    const displayName = user?.name || user?.email || "Clinician";
    return {
      id: user?.id,
      displayName,
      role,
      roleLabel: role === "pharmacy" ? "Pharmacy" : "Doctor",
      icon: role === "pharmacy" ? "leaf" : "medical",
      email: user?.email || "",
    };
  };

  const showDirectoryResults = normalizedQuery.length > 0;
  const directoryMatches = showDirectoryResults
    ? directoryContacts
        .filter((user) => user?.id && user.id !== currentUserId)
        .map(formatDirectoryContact)
        .filter((contact) => {
          const searchValue = `${contact.displayName} ${contact.roleLabel} ${contact.email}`
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
  }, [currentUserId]);

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

  const sendMessage = async () => {
    if (!message.trim() || !selectedContact?.id) return;
    const text = message;
    setMessage("");
    await sendConversationMessage(selectedContact.id, text);
    await loadSelectedMessages(selectedContact.id);
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

  const sendAttachment = () => {
    return;
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

  if (selectedContact) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <StatusBar
          barStyle={theme.statusBarStyle}
          backgroundColor={theme.card}
        />
        <View
          style={{
            backgroundColor: theme.card,
            padding: RFValue(16),
            paddingTop: Platform.OS === "android" ? 40 : 16,
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
                  conversationId: selectedContact.id,
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
                  conversationId: selectedContact.id,
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

        <ScrollView
          contentContainerStyle={{
            padding: RFValue(16),
            paddingBottom: RFValue(80),
          }}
          style={{ flex: 1 }}
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
              const isSystem =
                msg.kind === "system" || msg.senderRole === "system";
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
                  <View
                    style={{
                      maxWidth: isSystem ? "88%" : "75%",
                      backgroundColor: isSystem
                        ? theme.bg
                        : isCurrentUser
                          ? theme.accent
                          : theme.card,
                      borderRadius: RFValue(16),
                      borderBottomRightRadius:
                        isSystem || isCurrentUser ? RFValue(4) : RFValue(16),
                      borderBottomLeftRadius:
                        isSystem || isCurrentUser ? RFValue(16) : RFValue(4),
                      padding: RFValue(14),
                      shadowColor: theme.shadowColor,
                      shadowOpacity: 0.05,
                      elevation: 1,
                      borderWidth: isSystem ? 1 : 0,
                      borderColor: isSystem ? theme.cardBorder : "transparent",
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
                    <Text
                      style={{
                        fontSize: RFValue(14),
                        color: isSystem
                          ? theme.textSecondary
                          : isCurrentUser
                            ? "#FFF"
                            : theme.textPrimary,
                        lineHeight: RFValue(20),
                        textAlign: isSystem ? "center" : "left",
                      }}
                    >
                      {msg.text}
                    </Text>
                    <Text
                      style={{
                        fontSize: RFValue(9),
                        color: isSystem
                          ? theme.textTertiary
                          : isCurrentUser
                            ? "rgba(255,255,255,0.7)"
                            : theme.textTertiary,
                        marginTop: 4,
                        textAlign: isSystem ? "center" : "right",
                      }}
                    >
                      {msg.time}
                    </Text>
                  </View>
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
                style={{ color: theme.textSecondary, fontSize: RFValue(13) }}
              >
                This is the start of your conversation.
              </Text>
            </View>
          )}
        </ScrollView>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : null}
        >
          <View
            style={{
              backgroundColor: theme.card,
              padding: RFValue(12),
              paddingBottom: Platform.OS === "ios" ? 30 : 12,
              borderTopWidth: 1,
              borderTopColor: theme.cardBorder,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <TouchableOpacity
              onPress={() => sendAttachment("camera")}
              style={{
                width: RFValue(36),
                height: RFValue(36),
                borderRadius: RFValue(18),
                backgroundColor: theme.bg,
                justifyContent: "center",
                alignItems: "center",
                marginRight: RFValue(8),
                opacity: 0.45,
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
              style={{
                width: RFValue(36),
                height: RFValue(36),
                borderRadius: RFValue(18),
                backgroundColor: theme.bg,
                justifyContent: "center",
                alignItems: "center",
                marginRight: RFValue(8),
                opacity: 0.45,
              }}
            >
              <Ionicons
                name="image"
                size={RFValue(18)}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
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
                  paddingVertical: RFValue(10),
                  fontSize: RFValue(14),
                  color: theme.textPrimary,
                }}
                placeholder="Write something..."
                placeholderTextColor={theme.textTertiary}
                value={message}
                onChangeText={setMessage}
                multiline
              />
            </View>
            <TouchableOpacity
              onPress={sendMessage}
              style={{
                width: RFValue(40),
                height: RFValue(40),
                borderRadius: RFValue(20),
                backgroundColor: theme.accent,
                justifyContent: "center",
                alignItems: "center",
                marginLeft: RFValue(8),
                shadowColor: theme.accent,
                shadowOpacity: 0.3,
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 6,
                elevation: 3,
              }}
            >
              <Ionicons name="send" size={RFValue(18)} color="#FFF" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.card} />

      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
            placeholder="Search doctors, pharmacies, or chats..."
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

      <ScrollView contentContainerStyle={{ padding: RFValue(16) }}>
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
              Doctors & Pharmacies
            </Text>
            {directoryLoading ? (
              <View style={{ alignItems: "center", paddingVertical: RFValue(16) }}>
                <Text
                  style={{ fontSize: RFValue(12), color: theme.textTertiary }}
                >
                  Searching directory...
                </Text>
              </View>
            ) : directoryMatches.length > 0 ? (
              directoryMatches.map((contact) => {
                const existingConversation = findDirectConversation(contact.id);
                const isStarting = startingChatId === contact.id;
                const buttonLabel = isStarting
                  ? "Starting..."
                  : existingConversation
                    ? "Open chat"
                    : "Start chat";
                const accentColor =
                  contact.role === "pharmacy" ? theme.success : theme.accent;
                const accentBg =
                  contact.role === "pharmacy"
                    ? theme.successLight
                    : theme.accentLight;
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
              <View style={{ alignItems: "center", paddingVertical: RFValue(16) }}>
                <Ionicons
                  name="search"
                  size={RFValue(32)}
                  color={theme.cardBorder}
                  style={{ marginBottom: RFValue(10) }}
                />
                <Text
                  style={{ fontSize: RFValue(12), color: theme.textTertiary }}
                >
                  No doctors or pharmacies match your search.
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
          <View style={{ alignItems: "center", paddingVertical: RFValue(60) }}>
            <Text style={{ fontSize: RFValue(14), color: theme.textTertiary }}>
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
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(15),
                      fontWeight: "800",
                      color: theme.textPrimary,
                    }}
                  >
                    {contact.displayName}
                  </Text>
                  <Text
                    style={{ fontSize: RFValue(11), color: theme.textTertiary }}
                  >
                    {contact.time}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        color: theme.textSecondary,
                        fontWeight: "700",
                        marginBottom: 2,
                      }}
                      numberOfLines={1}
                    >
                      {contact.roleLabel}
                    </Text>
                    <Text
                      style={{
                        fontSize: RFValue(12),
                        color: theme.textSecondary,
                      }}
                      numberOfLines={1}
                    >
                      {contact.lastMsg}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={{ alignItems: "center", paddingVertical: RFValue(60) }}>
            <Ionicons
              name="chatbubbles-outline"
              size={RFValue(48)}
              color={theme.cardBorder}
              style={{ marginBottom: RFValue(16) }}
            />
            <Text style={{ fontSize: RFValue(14), color: theme.textTertiary }}>
              {dataError || "No conversations found"}
            </Text>
          </View>
        )}
      </ScrollView>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
          paddingBottom: RFValue(100),
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

const PatientProfileScreen = ({ currentUser, patientProfile, onLogout }) => {
  const [showTheme, setShowTheme] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const { theme, themeKey } = useTheme();

  if (showTheme) return <ThemeScreen onBack={() => setShowTheme(false)} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <ScrollView contentContainerStyle={{ paddingBottom: RFValue(100) }}>
        {/* Profile Header */}
        <View
          style={{
            backgroundColor: theme.card,
            padding: RFValue(24),
            paddingTop: Platform.OS === "android" ? 40 : 16,
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
            onPress={() => setProfileImage("placeholder")}
            style={{ position: "relative", marginBottom: RFValue(14) }}
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
              <Ionicons name="person" size={RFValue(40)} color={theme.accent} />
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
            +91 ----- -----
          </Text>
        </View>

        <View style={{ padding: RFValue(16) }}>
          {/* Account Settings */}
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
              { icon: "person-outline", label: "Edit Profile" },
              { icon: "shield-checkmark-outline", label: "Privacy & Security" },
              { icon: "notifications-outline", label: "Notifications" },
              { icon: "language-outline", label: "Language" },
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

          {/* Appearance Settings */}
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

          {/* Health Settings */}
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

const SplashScreen = ({ onNext }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
    const timer = setTimeout(onNext, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#FFFFFF",
        justifyContent: "center",
        alignItems: "center",
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

      {/* Main content */}
      <View
        style={{
          alignItems: "center",
          opacity: visible ? 1 : 0,
          transform: [{ scale: visible ? 1 : 0.9 }],
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
          <Image
            source={{ uri: NVOISYS_LOGO }}
            style={{
              width: RFValue(140),
              height: RFValue(140),
              resizeMode: "contain",
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
      </View>
      {/* Bottom indicator */}
      <View
        style={{
          position: "absolute",
          bottom: RFValue(40),
          alignItems: "center",
          width: "100%",
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
      </View>
    </View>
  );
};

const LanguageScreen = ({ onNext, onBack }) => {
  const [selectedLanguage, setSelectedLanguage] = useState("English");
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
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
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
                paddingTop: Platform.OS === "android" ? 36 : 16,
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
                  onPress={onNext}
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
                  Select the language you're most comfortable with
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

          <View
            style={{
              padding: RFValue(24),
              paddingBottom: Platform.OS === "ios" ? 34 : 24,
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
              onPress={onNext}
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

      {/* Top buttons */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          padding: RFValue(24),
          paddingTop: Platform.OS === "android" ? 40 : 16,
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

      {/* Main content */}
      <View style={{ flex: 1, paddingHorizontal: RFValue(24) }}>
        {/* Icon container with gradient-like effect */}
        <View style={{ alignItems: "center", marginBottom: RFValue(40) }}>
          <View
            style={{
              width: RFValue(140),
              height: RFValue(140),
              borderRadius: RFValue(36),
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
                width: RFValue(100),
                height: RFValue(100),
                borderRadius: RFValue(28),
                backgroundColor: current.iconColor,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name={current.icon} size={RFValue(52)} color="#FFF" />
            </View>
          </View>
        </View>

        {/* Title */}
        <Text
          style={{
            fontSize: RFValue(26),
            fontWeight: "800",
            color: "#1E1B4B",
            textAlign: "center",
            marginBottom: RFValue(12),
            lineHeight: RFValue(32),
          }}
        >
          {current.title}
        </Text>

        {/* Subtitle */}
        <Text
          style={{
            fontSize: RFValue(14),
            color: "#6B7280",
            textAlign: "center",
            marginBottom: RFValue(32),
            lineHeight: RFValue(22),
            paddingHorizontal: RFValue(12),
          }}
        >
          {current.subtitle}
        </Text>

        {/* Feature bullets */}
        <View style={{ alignSelf: "stretch" }}>
          {current.bullets.map((bullet, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: RFValue(14),
                backgroundColor: "#FAFBFF",
                padding: RFValue(14),
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
                  marginRight: RFValue(14),
                }}
              >
                <Ionicons name="checkmark" size={RFValue(16)} color="#FFF" />
              </View>
              <Text
                style={{
                  fontSize: RFValue(14),
                  color: "#374151",
                  fontWeight: "500",
                }}
              >
                {bullet}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Bottom section */}
      <View
        style={{
          padding: RFValue(24),
          alignItems: "center",
          paddingBottom: Platform.OS === "ios" ? 34 : 24,
        }}
      >
        {/* Pagination dots */}
        <View style={{ flexDirection: "row", marginBottom: RFValue(24) }}>
          {slides.map((_, idx) => (
            <View
              key={idx}
              style={{
                width: idx === slide ? 28 : 8,
                height: RFValue(8),
                borderRadius: RFValue(4),
                backgroundColor: idx === slide ? current.iconColor : "#E5E7EB",
                marginHorizontal: 4,
                shadowColor: idx === slide ? current.iconColor : "transparent",
                shadowOpacity: idx === slide ? 0.3 : 0,
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 4,
                elevation: idx === slide ? 3 : 0,
              }}
            />
          ))}
        </View>

        {/* Next button */}
        <TouchableOpacity
          style={{
            width: "100%",
            backgroundColor: current.iconColor,
            borderRadius: RFValue(16),
            paddingVertical: RFValue(18),
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

const RoleScreen = ({ onNext, onBack }) => {
  const [selectedRole, setSelectedRole] = useState("patient");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAFBFF" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFBFF" />
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          {/* Header */}
          <View
            style={{
              backgroundColor: "#FFFFFF",
              padding: RFValue(24),
              paddingTop: Platform.OS === "android" ? 40 : 16,
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
                  top: Platform.OS === "android" ? 40 : 16,
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
                Choose how you'll use the app
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
                      I'm a Patient
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
                      I'm a Doctor
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
                      I'm a Pharmacy
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
          padding: RFValue(24),
          paddingBottom: Platform.OS === "ios" ? 34 : 24,
          backgroundColor: "#FFF",
          borderTopWidth: 1,
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
            paddingVertical: RFValue(18),
            alignItems: "center",
            marginBottom: RFValue(14),
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
      </View>
    </SafeAreaView>
  );
};

const RegisterScreen = ({ onFinish, onBack }) => {
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
                paddingTop: Platform.OS === "android" ? 40 : 16,
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
          paddingBottom: Platform.OS === "ios" ? 34 : 24,
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
                paddingTop: Platform.OS === "android" ? 40 : 16,
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
          paddingBottom: Platform.OS === "ios" ? 34 : 24,
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
                paddingTop: Platform.OS === "android" ? 40 : 16,
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
          paddingBottom: Platform.OS === "ios" ? 34 : 24,
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
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(30);
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
      <View style={{ flex: 1, padding: RFValue(24) }}>
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
          We've sent a 6-digit code to{" "}
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
                width: RFValue(46),
                height: RFValue(60),
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
  const [step, setStep] = useState("SPLASH");
  const [role, setRole] = useState("patient");
  const [mobileNumber, setMobileNumber] = useState("");

  const [authMode, setAuthMode] = useState("signup"); // signup | login
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const handleBack = () => {
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

  const handlePocketBaseAuth = async () => {
    try {
      setAuthLoading(true);
      setAuthError("");

      let result;

      if (authMode === "signup") {
        if (!name.trim()) {
          throw new Error("Please enter your name");
        }

        result = await signUpWithEmail({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          role,
        });
      } else {
        result = await loginWithEmail({
          email: email.trim(),
          password: password.trim(),
        });
      }

      onLogin({
        user: result.user,
        profile: result.profile,
      });
    } catch (error) {
      console.log("Auth error:", error);
      setAuthError(error?.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      setAuthLoading(true);
      setAuthError("");

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
      <LanguageScreen onNext={() => setStep("CAROUSEL")} onBack={() => {}} />
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
        onBack={() => setStep("CAROUSEL")}
      />
    );
  }

  if (step === "REG") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: RFValue(24),
            justifyContent: "center",
          }}
        >
          <View style={{ marginBottom: RFValue(24) }}>
            <TouchableOpacity
              onPress={() => setStep("ROLE")}
              style={{ marginBottom: RFValue(20) }}
            >
              <Ionicons name="arrow-back" size={RFValue(24)} color="#1E1B4B" />
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

          {authMode === "signup" && (
            <TextInput
              placeholder="Full name"
              value={name}
              onChangeText={setName}
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
            onChangeText={setEmail}
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

          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
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
      </SafeAreaView>
    );
  }

  return null;
};

// --- DOCTOR DASHBOARD COMPONENTS ---
const DoctorDashboard = ({ wounds, patients }) => {
  const { theme } = useTheme();

  const pendingWounds = (wounds || []).filter(
    (w) => w.status === "Review Pending",
  ).length;
  const criticalPatients = (patients || []).filter(
    (p) => p.riskLevel === "High",
  ).length;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={theme.accent} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: RFValue(100), flexGrow: 1 }}
      >
        {/* Header Block */}
        <View
          style={{
            backgroundColor: theme.accent,
            borderBottomLeftRadius: RFValue(32),
            borderBottomRightRadius: RFValue(32),
            padding: RFValue(24),
            paddingTop: Platform.OS === "android" ? 48 : 20,
            paddingBottom: RFValue(32),
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
          style={{ paddingHorizontal: RFValue(16), marginTop: -RFValue(24) }}
        >
          {/* Critical Patients */}
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: RFValue(20),
              padding: RFValue(16),
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

          {/* Today's Schedule */}
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
                justifyContent: "space-between",
                alignItems: "center",
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
                Today's Schedule
              </Text>
              <TouchableOpacity>
                <Text
                  style={{
                    color: theme.accent,
                    fontWeight: "600",
                    fontSize: RFValue(12),
                  }}
                >
                  View All
                </Text>
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontSize: RFValue(13),
                color: theme.textSecondary,
                textAlign: "center",
                paddingVertical: RFValue(10),
              }}
            >
              No appointments scheduled for today.
            </Text>
          </View>

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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
          paddingBottom: RFValue(100),
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
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
          paddingBottom: RFValue(100),
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
  const [showTheme, setShowTheme] = useState(false);

  if (showTheme) return <ThemeScreen onBack={() => setShowTheme(false)} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScrollView contentContainerStyle={{ paddingBottom: RFValue(100) }}>
        {/* Profile Header */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            padding: RFValue(24),
            paddingTop: Platform.OS === "android" ? 40 : 16,
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
            Doctor Name
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

const VideoCallScreen = ({ onBack }) => {
  const { theme } = useTheme();
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  useEffect(() => {
    const interval = setInterval(
      () => setCallDuration((prev) => prev + 1),
      1000,
    );
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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
        }}
      >
        {isVideoOff ? (
          <Ionicons name="videocam-off" size={RFValue(28)} color="#9CA3AF" />
        ) : (
          <Ionicons name="person" size={RFValue(36)} color="#E5E7EB" />
        )}
        <Text
          style={{
            color: "#FFF",
            fontSize: RFValue(10),
            marginTop: RFValue(4),
            fontWeight: "600",
          }}
        >
          You
        </Text>
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
            onPress={() => setIsMuted(!isMuted)}
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
            onPress={() => setIsVideoOff(!isVideoOff)}
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
            onPress={() => setIsFrontCamera(!isFrontCamera)}
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

const AppointmentBookingScreen = ({ onBack }) => {
  const { theme } = useTheme();
  const [selectedDate, setSelectedDate] = useState(2);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  const dates = [];

  const timeSlots = [];

  if (bookingConfirmed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
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
                }}
              >
                <Text
                  style={{
                    color: theme.success,
                    fontSize: RFValue(16),
                    fontWeight: "800",
                  }}
                >
                  DS
                </Text>
              </View>
              <View>
                <Text
                  style={{
                    fontSize: RFValue(16),
                    fontWeight: "700",
                    color: theme.textPrimary,
                  }}
                >
                  Doctor
                </Text>
                <Text
                  style={{ fontSize: RFValue(12), color: theme.textSecondary }}
                >
                  Specialist
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
                Tue, Jan 13
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
                Video Consult
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={onBack}
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
              Doctor | Specialist
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: RFValue(100),
        }}
      >
        {/* Doctor Info */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: RFValue(16),
            padding: RFValue(16),
            marginBottom: RFValue(16),
            flexDirection: "row",
            alignItems: "center",
            shadowColor: "#000",
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
              backgroundColor: "#ECFDF5",
              justifyContent: "center",
              alignItems: "center",
              marginRight: RFValue(14),
            }}
          >
            <Text
              style={{
                color: "#059669",
                fontSize: RFValue(20),
                fontWeight: "800",
              }}
            >
              DR
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: RFValue(15),
                fontWeight: "700",
                color: "#1E1B4B",
              }}
            >
              Doctor
            </Text>
            <Text style={{ fontSize: RFValue(12), color: "#6B7280" }}>
              15 years experience | 4.8 *
            </Text>
          </View>
          <View
            style={{
              backgroundColor: "#ECFDF5",
              paddingHorizontal: RFValue(8),
              paddingVertical: RFValue(4),
              borderRadius: RFValue(8),
            }}
          >
            <Text
              style={{
                color: "#059669",
                fontSize: RFValue(10),
                fontWeight: "700",
              }}
            >
              INR 500
            </Text>
          </View>
        </View>

        {/* Select Date */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: RFValue(16),
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
            Select Date
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {dates.map((d, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => d.available && setSelectedDate(idx)}
                style={{
                  width: RFValue(52),
                  height: RFValue(72),
                  borderRadius: RFValue(14),
                  backgroundColor:
                    selectedDate === idx
                      ? "#4338CA"
                      : d.available
                        ? "#F9FAFB"
                        : "#F3F4F4",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: RFValue(8),
                  opacity: d.available ? 1 : 0.5,
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(11),
                    color: selectedDate === idx ? "#C7D2FE" : "#6B7280",
                    fontWeight: "600",
                  }}
                >
                  {d.day}
                </Text>
                <Text
                  style={{
                    fontSize: RFValue(18),
                    fontWeight: "800",
                    color: selectedDate === idx ? "#FFF" : "#1E1B4B",
                    marginTop: RFValue(2),
                  }}
                >
                  {d.date}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Select Time */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: RFValue(16),
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
            Available Time Slots
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {timeSlots.map((slot, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => slot.available && setSelectedSlot(slot.time)}
                style={{
                  width: "31%",
                  paddingVertical: RFValue(10),
                  borderRadius: RFValue(10),
                  backgroundColor:
                    selectedSlot === slot.time
                      ? "#4338CA"
                      : slot.available
                        ? "#F9FAFB"
                        : "#F3F4F4",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: RFValue(8),
                  marginRight: idx % 3 === 2 ? 0 : "3.5%",
                  opacity: slot.available ? 1 : 0.5,
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(12),
                    fontWeight: "600",
                    color: selectedSlot === slot.time ? "#FFF" : "#374151",
                  }}
                >
                  {slot.time}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Consultation Type */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: RFValue(16),
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
            Consultation Type
          </Text>
          <View style={{ flexDirection: "row" }}>
            <View
              style={{
                flex: 1,
                backgroundColor: "#EEF2FF",
                borderRadius: RFValue(12),
                padding: RFValue(14),
                alignItems: "center",
                marginRight: RFValue(8),
                borderWidth: 2,
                borderColor: "#4338CA",
              }}
            >
              <Ionicons
                name="videocam"
                size={RFValue(24)}
                color="#4338CA"
                style={{ marginBottom: RFValue(6) }}
              />
              <Text
                style={{
                  fontSize: RFValue(12),
                  fontWeight: "700",
                  color: "#4338CA",
                }}
              >
                Video
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: "#F9FAFB",
                borderRadius: RFValue(12),
                padding: RFValue(14),
                alignItems: "center",
                marginLeft: RFValue(8),
              }}
            >
              <Ionicons
                name="chatbubble"
                size={RFValue(24)}
                color="#9CA3AF"
                style={{ marginBottom: RFValue(6) }}
              />
              <Text
                style={{
                  fontSize: RFValue(12),
                  fontWeight: "600",
                  color: "#9CA3AF",
                }}
              >
                Chat
              </Text>
            </View>
          </View>
        </View>

        {/* Book Button */}
        <TouchableOpacity
          onPress={() => selectedSlot && setBookingConfirmed(true)}
          style={{
            backgroundColor: selectedSlot ? "#4338CA" : "#E5E7EB",
            borderRadius: RFValue(14),
            paddingVertical: RFValue(16),
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: selectedSlot ? "#FFF" : "#9CA3AF",
              fontSize: RFValue(16),
              fontWeight: "700",
            }}
          >
            {selectedSlot ? `Book at ${selectedSlot}` : "Select a Time Slot"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const PrescriptionScreen = ({ onBack }) => {
  const prescriptions = []; // Empty state for real data later

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: RFValue(100),
        }}
      >
        {prescriptions.map((rx) => (
          <View
            key={rx.id}
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
            }}
          >
            {/* Prescription Header */}
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

            {/* Medicines */}
            {rx.medicines.map((med, idx) => (
              <View
                key={idx}
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
                    alignItems: "center",
                    marginBottom: RFValue(8),
                  }}
                >
                  <Text
                    style={{
                      fontSize: RFValue(14),
                      fontWeight: "700",
                      color: "#1E1B4B",
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
                    }}
                  >
                    <Text
                      style={{
                        color: "#4338CA",
                        fontSize: RFValue(10),
                        fontWeight: "700",
                      }}
                    >
                      {med.dosage}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: RFValue(12), color: "#6B7280" }}>
                    Duration: {med.duration}
                  </Text>
                  <Text style={{ fontSize: RFValue(12), color: "#6B7280" }}>
                    {med.instructions}
                  </Text>
                </View>
              </View>
            ))}

            {/* Actions */}
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
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

// ========================================
// PREMIUM SCREENS
// ========================================

const MedicationTrackerScreen = ({ onBack }) => {
  const [takenMeds, setTakenMeds] = useState({});
  const [adherenceRate] = useState(0);

  const todayMeds = [];

  const weekData = [
    { day: "Mon", rate: 100 },
    { day: "Tue", rate: 100 },
    { day: "Wed", rate: 80 },
    { day: "Thu", rate: 100 },
    { day: "Fri", rate: 60 },
    { day: "Sat", rate: 100 },
    { day: "Sun", rate: 87 },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
          paddingBottom: RFValue(100),
        }}
      >
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
              borderColor: adherenceRate >= 80 ? "#059669" : "#D97706",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: RFValue(12),
            }}
          >
            <Text
              style={{
                fontSize: RFValue(32),
                fontWeight: "800",
                color: adherenceRate >= 80 ? "#059669" : "#D97706",
              }}
            >
              {adherenceRate}%
            </Text>
          </View>
          <Text
            style={{
              fontSize: RFValue(14),
              fontWeight: "700",
              color: "#1E1B4B",
            }}
          >
            Weekly Adherence
          </Text>
          <Text
            style={{
              fontSize: RFValue(12),
              color: adherenceRate >= 80 ? "#059669" : "#D97706",
              fontWeight: "600",
            }}
          >
            {adherenceRate >= 80 ? "Great job!" : "Needs improvement"}
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
            {weekData.map((d, i) => (
              <View key={i} style={{ alignItems: "center", flex: 1 }}>
                <View
                  style={{
                    width: RFValue(24),
                    height: (d.rate / 100) * RFValue(70),
                    borderRadius: RFValue(4),
                    backgroundColor:
                      d.rate === 100
                        ? "#059669"
                        : d.rate >= 80
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
                  {d.day}
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
          Today's Schedule
        </Text>
        {todayMeds.map((med, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() =>
              setTakenMeds({ ...takenMeds, [idx]: !takenMeds[idx] })
            }
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
              opacity: takenMeds[idx] ? 0.7 : 1,
            }}
          >
            <View
              style={{
                paddingHorizontal: RFValue(10),
                height: RFValue(36),
                borderRadius: RFValue(12),
                backgroundColor: takenMeds[idx] ? "#ECFDF5" : "#F3F4F6",
                justifyContent: "center",
                alignItems: "center",
                marginRight: RFValue(14),
              }}
            >
              <Ionicons
                name={takenMeds[idx] ? "checkmark-circle" : "pill"}
                size={RFValue(22)}
                color={takenMeds[idx] ? "#059669" : "#6B7280"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: RFValue(14),
                  fontWeight: "700",
                  color: "#1E1B4B",
                  textDecorationLine: takenMeds[idx] ? "line-through" : "none",
                }}
              >
                {med.name}
              </Text>
              <Text style={{ fontSize: RFValue(12), color: "#6B7280" }}>
                {med.time} | {med.dosage}
              </Text>
              <Text style={{ fontSize: RFValue(11), color: "#9CA3AF" }}>
                {med.food}
              </Text>
            </View>
            <View
              style={{
                width: RFValue(24),
                height: RFValue(24),
                borderRadius: RFValue(12),
                borderWidth: 2,
                borderColor: takenMeds[idx] ? "#059669" : "#D1D5DB",
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: takenMeds[idx] ? "#059669" : "#FFF",
              }}
            >
              {takenMeds[idx] && (
                <Ionicons name="checkmark" size={RFValue(14)} color="#FFF" />
              )}
            </View>
          </TouchableOpacity>
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
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
            Monitor Your Family's Health
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
            We're building a comprehensive dashboard for you to track the health
            status and recovery progress of your loved ones in real-time.
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
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
          paddingBottom: RFValue(100),
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
            Today's Appointments
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
const CustomTabBar = ({ state, descriptors, navigation, activeColor }) => (
  <View
    style={{
      flexDirection: "row",
      backgroundColor: "#FFFFFF",
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
      paddingBottom: Platform.OS === "ios" ? 24 : 8,
      paddingTop: RFValue(8),
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: -4 },
      shadowRadius: 10,
      elevation: 10,
    }}
  >
    {state.routes.map((route, index) => {
      const { options } = descriptors[route.key];
      const isFocused = state.index === index;
      const label = options.tabBarLabel || route.name;
      const icon = options.tabBarIcon
        ? options.tabBarIcon({
            color: isFocused ? activeColor : "#9CA3AF",
            size: RFValue(24),
            focused: isFocused,
          })
        : null;

      const onPress = () => {
        const event = navigation.emit({ type: "tabPress", target: route.key });
        if (!isFocused && !event.defaultPrevented) {
          navigation.navigate(route.name);
        }
      };

      return (
        <TouchableOpacity
          key={route.key}
          onPress={onPress}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          {icon}
          <Text
            style={{
              fontSize: RFValue(10),
              fontWeight: isFocused ? "700" : "500",
              color: isFocused ? activeColor : "#9CA3AF",
              marginTop: RFValue(2),
            }}
          >
            {label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

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

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <ActiveComponent navigation={navigation} />
      </View>
      <CustomTabBar
        state={state}
        descriptors={descriptors}
        navigation={navigation}
        activeColor={activeColor}
      />
    </View>
  );
};

// --- PHARMACY DASHBOARD COMPONENTS ---
const PharmacyProfileScreen = ({ onLogout }) => {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          paddingTop: Platform.OS === "android" ? 40 : 16,
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <Text
          style={{ fontSize: RFValue(20), fontWeight: "800", color: "#1E1B4B" }}
        >
          Pharmacy Settings
        </Text>
      </View>
      <View style={{ padding: RFValue(20) }}>
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: RFValue(16),
            padding: RFValue(16),
            shadowColor: "#000",
            shadowOpacity: 0.05,
            elevation: 2,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: RFValue(20),
            }}
          >
            <View
              style={{
                width: RFValue(64),
                height: RFValue(64),
                borderRadius: RFValue(20),
                backgroundColor: "#EBE9FE",
                justifyContent: "center",
                alignItems: "center",
                marginRight: RFValue(16),
              }}
            >
              <Ionicons name="leaf" size={RFValue(32)} color="#8B5CF6" />
            </View>
            <View>
              <Text
                style={{
                  fontSize: RFValue(18),
                  fontWeight: "800",
                  color: "#1E1B4B",
                }}
              >
                Store Name
              </Text>
              <Text style={{ fontSize: RFValue(13), color: "#6B7280" }}>
                pharmacy@example.com
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onLogout}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: RFValue(12),
              borderTopWidth: 1,
              borderTopColor: "#F3F4F6",
            }}
          >
            <Ionicons
              name="settings-outline"
              size={RFValue(20)}
              color="#6B7280"
            />
            <Text
              style={{
                flex: 1,
                marginLeft: RFValue(12),
                fontSize: RFValue(14),
                color: "#1E1B4B",
              }}
            >
              Business Information
            </Text>
            <Ionicons
              name="chevron-forward"
              size={RFValue(18)}
              color="#9CA3AF"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: RFValue(12),
              borderTopWidth: 1,
              borderTopColor: "#F3F4F6",
            }}
          >
            <Ionicons
              name="log-out-outline"
              size={RFValue(20)}
              color="#DC2626"
            />
            <Text
              style={{
                flex: 1,
                marginLeft: RFValue(12),
                fontSize: RFValue(14),
                color: "#DC2626",
              }}
            >
              Logout
            </Text>
            <Ionicons
              name="chevron-forward"
              size={RFValue(18)}
              color="#9CA3AF"
            />
          </TouchableOpacity>
        </View>
      </View>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <View
        style={{
          backgroundColor: theme.card,
          padding: RFValue(20),
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
      <ScrollView contentContainerStyle={{ padding: RFValue(16) }}>
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

const ModernHeader = ({ title, subtitle }) => (
  <View
    style={{
      backgroundColor: "#FFFFFF",
      padding: RFValue(20),
      paddingTop: Platform.OS === "android" ? 40 : 16,
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
    }}
  >
    <Text
      style={{ fontSize: RFValue(20), fontWeight: "800", color: "#1E1B4B" }}
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

const PatientWoundScreen = ({ navigation, wounds, setWounds }) => {
  const [showNewWound, setShowNewWound] = useState(false);
  const [selectedWoundId, setSelectedWoundId] = useState(null);
  const selectedWound = (wounds || []).find(
    (item) => item.id === selectedWoundId,
  );

  if (showNewWound)
    return (
      <NewWoundScreen
        onBack={() => setShowNewWound(false)}
        setWounds={setWounds}
        wounds={wounds}
      />
    );
  if (selectedWound)
    return (
      <WoundDetailScreen
        wound={selectedWound}
        onBack={() => setSelectedWoundId(null)}
        userRole="patient"
        setWounds={setWounds}
      />
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ModernHeader title="Wound Tracker" subtitle="Manage your recovery" />

      <ScrollView
        contentContainerStyle={{
          padding: RFValue(16),
          paddingBottom: RFValue(100),
        }}
      >
        <TouchableOpacity
          onPress={() => setShowNewWound(true)}
          style={{
            backgroundColor: "#EEF2FF",
            borderStyle: "dashed",
            borderWidth: 2,
            borderColor: "#4338CA",
            borderRadius: RFValue(16),
            padding: RFValue(20),
            alignItems: "center",
            marginBottom: RFValue(20),
          }}
        >
          <Ionicons name="add-circle" size={RFValue(32)} color="#4338CA" />
          <Text
            style={{
              color: "#4338CA",
              fontWeight: "700",
              marginTop: RFValue(8),
            }}
          >
            Report New Wound
          </Text>
        </TouchableOpacity>

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
              onPress={() => setSelectedWoundId(w.id)}
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
                }}
              >
                <Ionicons
                  name="bandage-outline"
                  size={RFValue(24)}
                  color="#4338CA"
                />
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
  const { createWoundReport } = useAppData();

  const handleSubmit = async () => {
    if (!desc.trim()) return;
    try {
      setSubmitting(true);
      setSubmitError("");
      await createWoundReport({
        description: desc.trim(),
        image,
      });
      setSubmitting(false);
      onBack();
    } catch (error) {
      console.log("Create wound error:", error);
      setSubmitError(error?.message || "Unable to submit wound report");
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }}>
      <View
        style={{
          padding: RFValue(20),
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity onPress={onBack} style={{ marginRight: RFValue(16) }}>
          <Ionicons name="arrow-back" size={RFValue(24)} color="#1E1B4B" />
        </TouchableOpacity>
        <Text
          style={{ fontSize: RFValue(18), fontWeight: "800", color: "#1E1B4B" }}
        >
          Report Wound
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: RFValue(20) }}>
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
          }}
          onPress={() => setImage("placeholder")}
        >
          {image ? (
            <View style={{ alignItems: "center" }}>
              <Ionicons name="image" size={RFValue(48)} color="#4338CA" />
              <Text style={{ color: "#6B7280", marginTop: RFValue(8) }}>
                Photo Attached
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: "center" }}>
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
        />

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
            backgroundColor: "#4338CA",
            borderRadius: RFValue(16),
            paddingVertical: RFValue(16),
            alignItems: "center",
            marginTop: RFValue(30),
            opacity: submitting ? 0.75 : 1,
          }}
        >
          {submitting ? (
            <Text style={{ color: "#FFF", fontWeight: "700" }}>
              Submitting...
            </Text>
          ) : (
            <Text
              style={{
                color: "#FFF",
                fontWeight: "700",
                fontSize: RFValue(16),
              }}
            >
              Submit to Doctor
            </Text>
          )}
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
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [loadingChat, setLoadingChat] = useState(true);
  const [localWound, setLocalWound] = useState(wound);
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
  } = useAppData();

  useEffect(() => {
    setLocalWound(wound);
  }, [wound]);

  const hydrateConversation = async () => {
    try {
      setLoadingChat(true);
      const conversation = await ensureConversationForWound(localWound, {
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
    if (!localWound?.id) return;
    let mounted = true;

    hydrateConversation();

    const subscribe = async () => {
      try {
        await pb.collection("messages").subscribe("*", async ({ record }) => {
          if (!mounted) return;
          if (
            !localWound?.conversation &&
            record?.conversation !== localWound?.conversation
          ) {
            return;
          }
          const conversationId =
            localWound?.conversation || record?.conversation;
          if (!conversationId || record?.conversation !== conversationId)
            return;
          const messages = await loadConversationMessages(conversationId);
          if (mounted) {
            setChat(messages);
          }
        });
        await pb
          .collection("wounds")
          .subscribe(localWound.id, async ({ record }) => {
            if (!mounted) return;
            const refreshedWound = mapWoundRecord({
              ...record,
              expand: {
                patient: localWound?.raw?.expand?.patient,
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
      pb.collection("messages").unsubscribe("*");
      pb.collection("wounds").unsubscribe(localWound?.id);
    };
  }, [localWound?.id, localWound?.conversation]);

  const sendMessage = async () => {
    if (!message.trim()) return;
    const conversation = await ensureConversationForWound(localWound, {
      includeCurrentUser: userRole !== "patient",
    });
    await sendConversationMessage(conversation.id, message);
    setMessage("");
    const messages = await loadConversationMessages(conversation.id);
    setChat(messages);
  };

  const woundOrder = (medOrders || []).find(
    (order) => order.wound === localWound.id,
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
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
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : null}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: RFValue(100) }}
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
                const isSystem =
                  c.kind === "system" || c.senderRole === "system";
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
                        : isMine
                          ? "#4338CA"
                          : "#FFF",
                      padding: RFValue(12),
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
                    <Text
                      style={{
                        color: isMine ? "#FFF" : "#1E1B4B",
                        fontSize: RFValue(13),
                        textAlign: isSystem ? "center" : "left",
                      }}
                    >
                      {c.text}
                    </Text>
                    <Text
                      style={{
                        color: isMine ? "rgba(255,255,255,0.7)" : "#9CA3AF",
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
          onConfirm={async (selectedMeds) => {
            await prescribeForWound(localWound, selectedMeds);
            await refreshAllData();
            const conversation = await ensureConversationForWound(localWound, {
              includeCurrentUser: true,
            });
            const messages = await loadConversationMessages(conversation.id);
            setChat(messages);
            setLocalWound((prev) => ({
              ...prev,
              status: "Medication Prescribed",
              conversation: conversation.id,
            }));
            setShowPrescriptionModal(false);
          }}
        />
      )}
    </SafeAreaView>
  );
};

const PrescriptionModal = ({ onBack, onConfirm }) => {
  const [selectedMeds, setSelectedMeds] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(null);

  const meds = [
    { name: "Amoxicillin", type: "Antibiotic", risk: "Low" },
    {
      name: "Warfarin",
      type: "Blood Thinner",
      risk: "High",
      warning: "High risk of bleeding. Use with caution.",
    },
    {
      name: "Ibuprofen",
      type: "NSAID",
      risk: "Medium",
      warning: "May cause stomach irritation.",
    },
    { name: "Neosporin", type: "Ointment", risk: "Low" },
  ];

  const toggleMed = (med) => {
    let newMeds = [];
    if (selectedMeds.includes(med.name)) {
      newMeds = selectedMeds.filter((m) => m !== med.name);
    } else {
      newMeds = [...selectedMeds, med.name];
    }
    setSelectedMeds(newMeds);

    // Simulate AI Analysis
    const hasHighRisk = meds.filter(
      (m) => newMeds.includes(m.name) && m.risk === "High",
    );
    if (hasHighRisk.length > 0) {
      setAiAnalysis({
        status: "Warning",
        message:
          "AI Review: High risk interaction found! Warfarin increases bleeding risk for this patient profile.",
      });
    } else if (newMeds.length > 0) {
      setAiAnalysis({
        status: "Clear",
        message:
          "AI Review: No significant side effects detected for these medicines.",
      });
    } else {
      setAiAnalysis(null);
    }
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
          maxHeight: "90%",
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
          <Text
            style={{
              fontSize: RFValue(18),
              fontWeight: "800",
              color: "#1E1B4B",
            }}
          >
            Prescribe Medicine
          </Text>
          <TouchableOpacity onPress={onBack}>
            <Ionicons name="close" size={RFValue(28)} color="#1E1B4B" />
          </TouchableOpacity>
        </View>

        <Text
          style={{
            fontSize: RFValue(14),
            fontWeight: "700",
            color: "#6B7280",
            marginBottom: RFValue(12),
          }}
        >
          Available Medicines
        </Text>
        <ScrollView style={{ maxHeight: RFValue(300) }}>
          {meds.map((m, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => toggleMed(m)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: RFValue(14),
                backgroundColor: selectedMeds.includes(m.name)
                  ? "#EEF2FF"
                  : "#F9FAFB",
                borderRadius: RFValue(12),
                marginBottom: RFValue(8),
                borderWidth: 1,
                borderColor: selectedMeds.includes(m.name)
                  ? "#4338CA"
                  : "#E5E7EB",
              }}
            >
              <Ionicons
                name={
                  selectedMeds.includes(m.name) ? "checkbox" : "square-outline"
                }
                size={24}
                color={selectedMeds.includes(m.name) ? "#4338CA" : "#9CA3AF"}
              />
              <View style={{ marginLeft: RFValue(12), flex: 1 }}>
                <Text
                  style={{
                    fontSize: RFValue(15),
                    fontWeight: "700",
                    color: "#1E1B4B",
                  }}
                >
                  {m.name}
                </Text>
                <Text style={{ fontSize: RFValue(11), color: "#6B7280" }}>
                  {m.type}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor:
                    m.risk === "High"
                      ? "#FEE2E2"
                      : m.risk === "Medium"
                        ? "#FEF3C7"
                        : "#DCFCE7",
                  paddingHorizontal: RFValue(8),
                  paddingVertical: RFValue(2),
                  borderRadius: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: RFValue(10),
                    color:
                      m.risk === "High"
                        ? "#DC2626"
                        : m.risk === "Medium"
                          ? "#D97706"
                          : "#166534",
                    fontWeight: "700",
                  }}
                >
                  {m.risk} Risk
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {aiAnalysis && (
          <View
            style={{
              backgroundColor:
                aiAnalysis.status === "Warning" ? "#FEF2F2" : "#F0FDF4",
              padding: RFValue(16),
              borderRadius: RFValue(14),
              marginTop: RFValue(16),
              borderWidth: 1,
              borderColor:
                aiAnalysis.status === "Warning" ? "#F87171" : "#4ADE80",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: RFValue(4),
              }}
            >
              <Ionicons
                name={
                  aiAnalysis.status === "Warning"
                    ? "warning"
                    : "shield-checkmark"
                }
                size={RFValue(18)}
                color={aiAnalysis.status === "Warning" ? "#DC2626" : "#059669"}
              />
              <Text
                style={{
                  fontSize: RFValue(14),
                  fontWeight: "800",
                  color:
                    aiAnalysis.status === "Warning" ? "#DC2626" : "#059669",
                  marginLeft: 6,
                }}
              >
                AI Safety Review
              </Text>
            </View>
            <Text
              style={{
                fontSize: RFValue(12),
                color: aiAnalysis.status === "Warning" ? "#991B1B" : "#065F46",
              }}
            >
              {aiAnalysis.message}
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={() => onConfirm(selectedMeds)}
          disabled={selectedMeds.length === 0}
          style={{
            backgroundColor: selectedMeds.length === 0 ? "#9CA3AF" : "#4338CA",
            borderRadius: RFValue(14),
            paddingVertical: RFValue(16),
            alignItems: "center",
            marginTop: RFValue(20),
          }}
        >
          <Text
            style={{ color: "#FFF", fontWeight: "700", fontSize: RFValue(16) }}
          >
            Confirm Prescription
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const DoctorWoundsScreen = ({ wounds, setWounds, setMedOrders }) => {
  const [selectedWoundId, setSelectedWoundId] = useState(null);
  const selectedWound = (wounds || []).find(
    (item) => item.id === selectedWoundId,
  );

  if (selectedWound)
    return (
      <WoundDetailScreen
        wound={selectedWound}
        onBack={() => setSelectedWoundId(null)}
        userRole="doctor"
        setWounds={setWounds}
        setMedOrders={setMedOrders}
      />
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          paddingTop: Platform.OS === "android" ? 40 : 16,
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
          paddingBottom: RFValue(100),
        }}
      >
        {wounds && wounds.length > 0 ? (
          wounds.map((w) => (
            <TouchableOpacity
              key={w.id}
              onPress={() => setSelectedWoundId(w.id)}
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="light-content" backgroundColor="#8B5CF6" />
      <View
        style={{
          backgroundColor: "#8B5CF6",
          padding: RFValue(24),
          paddingTop: Platform.OS === "android" ? 48 : 20,
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
          paddingBottom: RFValue(100),
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
                  onPress={() => updateOrderStatus(o, "dispatched")}
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

const PharmacyOrdersScreen = ({ orders }) => {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          padding: RFValue(20),
          paddingTop: Platform.OS === "android" ? 40 : 16,
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <Text
          style={{ fontSize: RFValue(20), fontWeight: "800", color: "#1E1B4B" }}
        >
          Medicine Orders
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: RFValue(16) }}>
        {(orders || []).length > 0 ? (
          orders.map((o, idx) => (
            <View
              key={idx}
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: RFValue(16),
                padding: RFValue(18),
                borderLeftWidth: 4,
                borderLeftColor: "#8B5CF6",
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
                    fontSize: RFValue(15),
                    color: "#1E1B4B",
                  }}
                >
                  Order #{o.id || idx + 1}
                </Text>
                <Text
                  style={{
                    color: "#D97706",
                    fontWeight: "700",
                    fontSize: RFValue(12),
                  }}
                >
                  {o.status || "Ordered"}
                </Text>
              </View>
              <Text
                style={{
                  color: "#6B7280",
                  fontSize: RFValue(13),
                  marginTop: 4,
                }}
              >
                {o.items || "Medicine items"}
              </Text>
              <View
                style={{
                  marginTop: 12,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Ionicons name="time-outline" size={16} color="#9CA3AF" />
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: RFValue(11),
                    marginLeft: 4,
                  }}
                >
                  Awaiting pharmacy confirmation
                </Text>
              </View>
            </View>
          ))
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
  const [conversations, setConversations] = useState([]);
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

  const theme = THEMES[themeKey];
  const changeTheme = (key) => setThemeKey(key);

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

  const loadDirectoryContacts = async () => {
    const [doctors, pharmacies] = await Promise.all([
      fetchUsersByRole("doctor"),
      fetchUsersByRole("pharmacy"),
    ]);
    const seen = new Set();
    return [...doctors, ...pharmacies].filter((user) => {
      if (!user?.id || seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
  };

  const loadMessagePreviewMap = async (conversationIds) => {
    if (!conversationIds.length) return {};
    try {
      const allMessages = await pb.collection("messages").getFullList({
        requestKey: null,
        sort: "-created",
        expand: "sender",
      });
      const previewMap = {};
      allMessages.forEach((record) => {
        if (!conversationIds.includes(record.conversation)) return;
        if (!previewMap[record.conversation]) {
          previewMap[record.conversation] = mapMessageRecord(record);
        }
      });
      return previewMap;
    } catch (error) {
      console.log("loadMessagePreviewMap error:", error);
      return {};
    }
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
      setConversations([]);
      return;
    }

    try {
      setDataLoading(true);
      setDataError("");

      const [woundRecords, orderRecords, conversationRecords] =
        await Promise.all([
          pb.collection("wounds").getFullList({
            requestKey: null,
            sort: "-created",
            expand: "patient,doctor,conversation",
          }),
          pb.collection("orders").getFullList({
            requestKey: null,
            sort: "-updated,-created",
            expand: "patient,conversation,wound",
          }),
          pb.collection("conversations").getFullList({
            requestKey: null,
            sort: "-updated,-created",
            expand: "members,linkedWound",
          }),
        ]);

      const allWounds = woundRecords.map(mapWoundRecord);
      const allOrders = orderRecords.map(mapOrderRecord);
      const memberConversations = conversationRecords.filter((record) =>
        safeArray(record.members).includes(activeUser.id),
      );
      const previewMap = await loadMessagePreviewMap(
        memberConversations.map((record) => record.id),
      );
      const allConversations = memberConversations.map((record) =>
        mapConversationRecord(record, activeUser.id, previewMap),
      );

      if (activeRole === "patient") {
        setWounds(
          allWounds.filter((record) => record.patientId === activeUser.id),
        );
        setMedOrders(
          allOrders.filter((record) => record.patientId === activeUser.id),
        );
      } else if (activeRole === "doctor") {
        setWounds(allWounds);
        setMedOrders(allOrders);
      } else if (activeRole === "pharmacy") {
        setWounds(allWounds.filter((record) => record.hasPharmacy));
        setMedOrders(allOrders);
      }

      setConversations(allConversations);
    } catch (error) {
      console.log("refreshAllData error:", error);
      setDataError(error?.message || "Unable to load app data");
      setWounds([]);
      setMedOrders([]);
      setConversations([]);
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
      await pb.collection("messages").create({
        conversation: conversationId,
        kind: "system",
        text: DEFAULT_WOUND_SYSTEM_MESSAGE,
      });
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
    try {
      const records = await pb.collection("messages").getFullList({
        requestKey: null,
        sort: "created",
        filter: `conversation="${conversationId}"`,
        expand: "sender",
      });
      return records.map(mapMessageRecord);
    } catch (error) {
      console.log("loadConversationMessages filter error:", error);
      const fallbackRecords = await pb.collection("messages").getFullList({
        requestKey: null,
        sort: "created",
        expand: "sender",
      });
      return fallbackRecords
        .filter((record) => record.conversation === conversationId)
        .map(mapMessageRecord);
    }
  };

  const sendConversationMessage = async (conversationId, text) => {
    if (!currentUser?.id || !text?.trim()) return;
    await pb.collection("messages").create({
      conversation: conversationId,
      sender: currentUser.id,
      kind: "text",
      text: text.trim(),
    });
    await pb.collection("conversations").update(conversationId, {
      lastMessageAt: new Date().toISOString(),
    });
    await refreshAllData();
  };

  const createWoundReport = async ({ description, image }) => {
    if (!currentUser?.id) {
      throw new Error("Please login again");
    }
    const doctorUsers = await fetchUsersByRole("doctor");
    const woundRecord = await pb.collection("wounds").create({
      patient: currentUser.id,
      description: description?.trim() || "",
      severity: "moderate",
      status: "review_pending",
      notes: "",
      hasPharmacy: false,
    });
    const conversation = await pb.collection("conversations").create({
      title: buildConversationTitle(woundRecord),
      linkedWound: woundRecord.id,
      members: uniqueIds([
        currentUser.id,
        ...doctorUsers.map((user) => user.id),
      ]),
      lastMessageAt: new Date().toISOString(),
    });
    await pb.collection("wounds").update(woundRecord.id, {
      conversation: conversation.id,
    });
    await pb.collection("messages").create({
      conversation: conversation.id,
      kind: "system",
      text: DEFAULT_WOUND_SYSTEM_MESSAGE,
    });
    await refreshAllData();
  };

  const prescribeForWound = async (woundLike, selectedMeds = []) => {
    const woundId = woundLike?.id || woundLike?.raw?.id;
    if (!woundId) {
      throw new Error("Wound not found");
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

    await pb.collection("wounds").update(woundId, {
      status: "medication_prescribed",
      hasPharmacy: pharmacyUsers.length > 0,
      conversation: conversation.id,
    });

    const orderPayload = {
      conversation: conversation.id,
      wound: woundId,
      patient: woundLike?.patientId || woundLike?.patient,
      items: selectedMeds,
      totalAmount: sumMedicationAmount(selectedMeds),
      status: "pending",
    };

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

    if (existingOrder) {
      await pb.collection("orders").update(existingOrder.id, orderPayload);
    } else {
      await pb.collection("orders").create(orderPayload);
    }

    await pb.collection("messages").create({
      conversation: conversation.id,
      kind: "system",
      text: `Doctor prescribed: ${selectedMeds.join(", ")}. Order sent to pharmacy.`,
    });
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
      await pb.collection("messages").create({
        conversation: conversationId,
        kind: "system",
        text: `Pharmacy updated order status to ${humanizeOrderStatus(nextStatus)}.`,
      });
      await pb.collection("conversations").update(conversationId, {
        lastMessageAt: new Date().toISOString(),
      });
    }

    await refreshAllData();
  };

  useEffect(() => {
    (async () => {
      try {
        await restoreAuth();

        if (pb.authStore.isValid && pb.authStore.record) {
          const user = pb.authStore.record;
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
      setConversations([]);
      return;
    }
    refreshAllData(currentUser, userRole);
  }, [currentUser?.id, userRole]);

  useEffect(() => {
    if (!currentUser?.id || !userRole) return;

    const subscribe = async () => {
      try {
        await pb.collection("wounds").subscribe("*", () => {
          refreshAllData(currentUser, userRole);
        });
        await pb.collection("orders").subscribe("*", () => {
          refreshAllData(currentUser, userRole);
        });
        await pb.collection("conversations").subscribe("*", () => {
          refreshAllData(currentUser, userRole);
        });
      } catch (error) {
        console.log("App subscription error:", error);
      }
    };

    subscribe();

    return () => {
      pb.collection("wounds").unsubscribe("*");
      pb.collection("orders").unsubscribe("*");
      pb.collection("conversations").unsubscribe("*");
    };
  }, [currentUser?.id, userRole]);

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
        <Text
          style={{
            color: theme.textPrimary,
            fontSize: RFValue(16),
            fontWeight: "700",
          }}
        >
          Loading...
        </Text>
      </SafeAreaView>
    );
  }

  const appDataValue = {
    userRole,
    currentUser,
    currentUserId: currentUser?.id || null,
    wounds,
    medOrders,
    conversations,
    dataLoading,
    dataError,
    refreshAllData,
    ensureConversationForWound,
    ensureDirectConversation,
    loadDirectoryContacts,
    loadConversationMessages,
    sendConversationMessage,
    createWoundReport,
    prescribeForWound,
    updateOrderStatus,
  };

  return (
    <ThemeContext.Provider value={{ theme, changeTheme, themeKey }}>
      <AppDataContext.Provider value={appDataValue}>
        <AppContent
          userRole={userRole}
          setUserRole={setUserRole}
          currentUser={currentUser}
          setCurrentUser={setCurrentUser}
          patientProfile={patientProfile}
          setPatientProfile={setPatientProfile}
          theme={theme}
          wounds={wounds}
          setWounds={setWounds}
          medOrders={medOrders}
          setMedOrders={setMedOrders}
          patients={patients}
          setPatients={setPatients}
        />
      </AppDataContext.Provider>
    </ThemeContext.Provider>
  );
}

const AppContent = ({
  userRole,
  setUserRole,
  currentUser,
  setCurrentUser,
  patientProfile,
  setPatientProfile,
  theme,
  wounds,
  setWounds,
  medOrders,
  setMedOrders,
  patients,
  setPatients,
}) => {
  const handleAuthSuccess = ({ user, profile }) => {
    setCurrentUser(user);
    setUserRole(user.role || "patient");
    setPatientProfile(profile || null);
  };

  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
    setPatientProfile(null);
    setUserRole(null);
  };

  if (!userRole) {
    return <AuthScreen onLogin={handleAuthSuccess} />;
  }

  if (userRole === "doctor") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <StatusBar
          barStyle={theme.statusBarStyle}
          backgroundColor={theme.statusBarBg}
        />
        <CustomTabNavigator
          activeColor="#8B5CF6"
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
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
