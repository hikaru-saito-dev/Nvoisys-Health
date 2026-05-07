/**
 * In-app toast / notification system.
 *
 * Replaces the bare React Native `Alert.alert(title, message)` popups with a
 * branded card that slides in from the top. Confirmation dialogs (calls with
 * buttons) keep using the system Alert because a toast cannot capture a user
 * decision.
 *
 * Public API:
 *   - <NotificationHost />                    : visual layer (mount once)
 *   - notify({ title, message, type, ... })   : programmatic trigger
 *   - notify.success / .error / .info / .warning shortcuts
 *   - installAlertOverride(Alert)             : intercepts Alert.alert(title,msg)
 *
 * Toasts auto-dismiss after `duration` ms (default 3500). Tap to dismiss.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ──────────────────────────────────────────────────────────────────────────
// Module-level event bus.
//
// We deliberately avoid React context here - the public `notify(...)` helper
// must be callable from non-component scopes (api files, Alert.alert override,
// catch blocks, etc.) without dragging providers through.
// ──────────────────────────────────────────────────────────────────────────
const subscribers = new Set();
let nextId = 1;

const TYPE_STYLES = {
  success: {
    icon: "checkmark-circle",
    iconColor: "#10B981",
    accent: "#10B981",
    bg: "#ECFDF5",
    border: "#A7F3D0",
    title: "#065F46",
  },
  error: {
    icon: "alert-circle",
    iconColor: "#EF4444",
    accent: "#EF4444",
    bg: "#FEF2F2",
    border: "#FECACA",
    title: "#991B1B",
  },
  warning: {
    icon: "warning",
    iconColor: "#F59E0B",
    accent: "#F59E0B",
    bg: "#FFFBEB",
    border: "#FDE68A",
    title: "#92400E",
  },
  info: {
    icon: "information-circle",
    iconColor: "#4338CA",
    accent: "#4338CA",
    bg: "#EEF2FF",
    border: "#C7D2FE",
    title: "#1E1B4B",
  },
};

const inferType = (title = "") => {
  const t = String(title).toLowerCase();
  if (
    /(error|fail|cannot|could not|denied|invalid|missing|wrong|unable)/.test(t)
  ) {
    return "error";
  }
  if (/(saved|sent|paid|success|done|updated|confirmed|recorded|added|approved)/.test(t)) {
    return "success";
  }
  if (/(warning|reschedule|cancel|attention|reminder|please)/.test(t)) {
    return "warning";
  }
  return "info";
};

export function notify(options = {}) {
  const id = nextId++;
  const payload = {
    id,
    title: options.title || "",
    message: options.message || "",
    type: options.type || inferType(options.title || ""),
    duration: typeof options.duration === "number" ? options.duration : 3500,
  };
  subscribers.forEach((cb) => {
    try {
      cb({ kind: "show", toast: payload });
    } catch {
      // Listener errors must never break the caller's flow.
    }
  });
  return id;
}

notify.success = (title, message, opts = {}) =>
  notify({ ...opts, type: "success", title, message });
notify.error = (title, message, opts = {}) =>
  notify({ ...opts, type: "error", title, message });
notify.warning = (title, message, opts = {}) =>
  notify({ ...opts, type: "warning", title, message });
notify.info = (title, message, opts = {}) =>
  notify({ ...opts, type: "info", title, message });

export function dismissNotification(id) {
  subscribers.forEach((cb) => {
    try {
      cb({ kind: "dismiss", id });
    } catch {
      // ignore
    }
  });
}

/**
 * Wrap React Native's `Alert` so that the simple two-argument calls
 * (title + message, no buttons) become toasts. Calls that pass a `buttons`
 * array still need a real modal for user choice, so they fall through to the
 * original Alert.alert.
 */
export function installAlertOverride(Alert) {
  if (!Alert || Alert.__nvhsToastInstalled) return;
  const original = Alert.alert.bind(Alert);
  Alert.alert = function patchedAlert(title, message, buttons, options) {
    const hasButtons = Array.isArray(buttons) && buttons.length > 0;
    if (hasButtons) {
      return original(title, message, buttons, options);
    }
    notify({ title: title || "", message: message || "" });
  };
  Alert.__nvhsToastInstalled = true;
}

// ──────────────────────────────────────────────────────────────────────────
// Visual host
// ──────────────────────────────────────────────────────────────────────────

function ToastCard({ toast, onDismiss }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-24)).current;
  const insets = useSafeAreaInsets();
  const styleSet = TYPE_STYLES[toast.type] || TYPE_STYLES.info;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => requestDismiss(), toast.duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestDismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -24,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss?.(toast.id));
  };

  // We add `StatusBar.currentHeight` as a safety net for Android devices that
  // report `insets.top === 0` when the status bar is translucent.
  const topOffset =
    (insets.top || (Platform.OS === "android" ? StatusBar.currentHeight : 0) || 0) + 8;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.cardWrapper,
        { top: topOffset, opacity, transform: [{ translateY }] },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={requestDismiss}
        style={[
          styles.card,
          {
            backgroundColor: styleSet.bg,
            borderColor: styleSet.border,
            borderLeftColor: styleSet.accent,
          },
        ]}
      >
        <View style={styles.iconWrap}>
          <Ionicons name={styleSet.icon} size={22} color={styleSet.iconColor} />
        </View>
        <View style={styles.body}>
          {toast.title ? (
            <Text style={[styles.title, { color: styleSet.title }]}>
              {toast.title}
            </Text>
          ) : null}
          {toast.message ? (
            <Text style={styles.message}>{toast.message}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          onPress={requestDismiss}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={18} color="#6B7280" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function NotificationHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const listener = (event) => {
      if (event.kind === "show") {
        setToasts((prev) => {
          // Cap the queue so noisy code paths can't stack toasts indefinitely.
          const next = [...prev, event.toast];
          return next.length > 3 ? next.slice(next.length - 3) : next;
        });
      } else if (event.kind === "dismiss") {
        setToasts((prev) => prev.filter((t) => t.id !== event.id));
      }
    };
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }, []);

  const handleDismiss = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      {toasts.map((t, idx) => (
        <View
          pointerEvents="box-none"
          key={t.id}
          style={{ marginTop: idx === 0 ? 0 : 8 }}
        >
          <ToastCard toast={t} onDismiss={handleDismiss} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  cardWrapper: {
    position: "absolute",
    left: 12,
    right: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 6,
  },
  iconWrap: {
    width: 28,
    alignItems: "center",
    paddingTop: 1,
    marginRight: 10,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },
  message: {
    color: "#374151",
    fontSize: 13,
    lineHeight: 18,
  },
  closeBtn: {
    paddingLeft: 10,
    paddingTop: 1,
  },
});
