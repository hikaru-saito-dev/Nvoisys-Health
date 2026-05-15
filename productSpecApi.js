/**
 * Product-spec flows (care mode, quick services, package demos/offers, coins,
 * medical records). All PocketBase writes are best-effort so older schemas
 * keep working. Create matching collections in PocketBase Admin when ready.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import {
  pb,
  formatPocketBaseClientError,
  getAuthUser,
  getPbAppointmentsCollection,
  isPbAppointmentDoctorProfileRelation,
  recordPaymentTransaction,
} from "./pocketbase";

export const CARE_MODE = {
  PACKAGE: "package_doctor",
  CASUAL: "casual",
  SKIP: "not_planning",
  /** Patient chose "General doctor" at primary onboarding — book paid appts to reach that doctor. */
  GENERAL: "general_doctor",
};

export const patientCareModeUsesQuickDoctorsOnly = (mode) =>
  mode === CARE_MODE.CASUAL || mode === CARE_MODE.SKIP;

/**
 * Consumer plans (Basic / Gold / Premium) map from the doctor's **package slot**
 * the patient paid for: slot 1 → Basic, 2 → Gold, 3 → Premium.
 */
export const CONSUMER_PLAN = {
  BASIC: "basic",
  GOLD: "gold",
  PREMIUM: "premium",
};

export function packageSlotToConsumerPlan(slot) {
  const n = Number(slot);
  if (n === 2) return CONSUMER_PLAN.GOLD;
  if (n === 3) return CONSUMER_PLAN.PREMIUM;
  return CONSUMER_PLAN.BASIC;
}

export function consumerPlanDisplayName(plan) {
  const p = String(plan || "").toLowerCase();
  if (p === CONSUMER_PLAN.GOLD) return "Gold";
  if (p === CONSUMER_PLAN.PREMIUM) return "Premium";
  return "Basic";
}

const USERS_AUTH_FETCH_CHUNK = 45;

/** Auth user rows may live in `UsersAuth`, `users`, or a custom collection (set `expo.extra.pbUsersCollection`). */
function getAuthUsersCollectionCandidates() {
  const fromEnv =
    (typeof process !== "undefined" &&
      process.env?.EXPO_PUBLIC_PB_USERS_COLLECTION) ||
    Constants?.expoConfig?.extra?.pbUsersCollection ||
    "";
  const primary = String(fromEnv || "UsersAuth").trim();
  return [...new Set([primary, "UsersAuth", "users"].filter(Boolean))];
}

/**
 * Human-readable name from an optional profile row (doctor_profile, patient_profile, …)
 * plus optional expanded auth user. Does not use specialty/clinical labels as a fallback name.
 */
export function resolveListingDisplayName(profileRecord, authUserRecord) {
  const pick = (v) => String(v == null ? "" : v).trim();
  let uRaw = authUserRecord;
  if (Array.isArray(uRaw)) uRaw = uRaw[0];
  const u =
    uRaw && typeof uRaw === "object" && !Array.isArray(uRaw) ? uRaw : {};
  const r = profileRecord || {};
  const firstLastFrom = (o) =>
    [pick(o.first_name), pick(o.last_name)].filter(Boolean).join(" ").trim();
  const firstLastU = firstLastFrom(u);
  const firstLastR = firstLastFrom(r);
  const candidates = [
    pick(u.name),
    firstLastU,
    pick(u.username),
    pick(r.name),
    firstLastR,
    pick(r.username),
    pick(r.store_name),
  ];
  for (const c of candidates) {
    if (c) return c;
  }
  const email = pick(u.email || r.email);
  if (email && email.includes("@")) {
    const local = email.split("@")[0].trim();
    if (local) {
      const humanized = local.replace(/[._-]+/g, " ").trim();
      return humanized || local;
    }
  }
  if (email) return email;
  return "";
}

/** Batch-load auth user rows for id lists (names often missing from relation expands under PB rules). */
export async function fetchUsersAuthByIds(userIds) {
  const byId = new Map();
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const collections = getAuthUsersCollectionCandidates();
  for (let i = 0; i < ids.length; i += USERS_AUTH_FETCH_CHUNK) {
    const chunk = ids.slice(i, i + USERS_AUTH_FETCH_CHUNK);
    const filter = chunk
      .map((id) => `id="${String(id).replace(/"/g, '\\"')}"`)
      .join(" || ");
    for (const coll of collections) {
      try {
        const rows = await pb.collection(coll).getFullList({
          filter,
          requestKey: null,
          $autoCancel: false,
        });
        (rows || []).forEach((row) => {
          if (row?.id && !byId.has(row.id)) byId.set(row.id, row);
        });
      } catch (error) {
        console.log(`fetchUsersAuthByIds ${coll} list:`, error?.message);
      }
    }
    for (const id of chunk) {
      if (byId.has(id)) continue;
      for (const coll of collections) {
        try {
          const row = await pb.collection(coll).getOne(id, {
            requestKey: null,
            $autoCancel: false,
          });
          if (row?.id) {
            byId.set(id, row);
            break;
          }
        } catch {
          /* try next collection */
        }
      }
    }
  }
  return byId;
}

/** Batch-load patient_profile rows (names live here when appointments.patient points at profile). */
export async function fetchPatientProfilesByIds(profileIds) {
  const byId = new Map();
  const ids = [...new Set((profileIds || []).filter(Boolean).map(String))];
  for (let i = 0; i < ids.length; i += USERS_AUTH_FETCH_CHUNK) {
    const chunk = ids.slice(i, i + USERS_AUTH_FETCH_CHUNK);
    const filter = chunk
      .map((id) => `id="${String(id).replace(/"/g, '\\"')}"`)
      .join(" || ");
    try {
      const rows = await pb.collection("patient_profile").getFullList({
        filter,
        requestKey: null,
        expand: "user",
      });
      rows.forEach((row) => byId.set(row.id, row));
    } catch (error) {
      console.log("fetchPatientProfilesByIds chunk error:", error?.message);
      for (const id of chunk) {
        try {
          const row = await pb.collection("patient_profile").getOne(id, {
            requestKey: null,
            expand: "user",
          });
          byId.set(id, row);
        } catch {
          /* ignore */
        }
      }
    }
  }
  return byId;
}

/**
 * Doctor queue rows: merge expanded UsersAuth onto `expand.patient` when PB only
 * returns the profile (or strips nested user fields).
 *
 * Also handles rows where `patient` is only a relation id string with **no**
 * `expand.patient` (common under strict list rules) by batch-fetching UsersAuth.
 */
export async function hydrateRowsPatientAuthUsers(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const ids = new Set();
  for (const row of rows) {
    const direct =
      typeof row?.patient === "string"
        ? row.patient
        : row?.patient?.id && typeof row.patient === "object"
          ? row.patient.id
          : null;
    if (direct) ids.add(String(direct).trim());

    const p = row.expand?.patient;
    if (!p || typeof p !== "object") continue;
    if (p.expand?.user?.id) ids.add(p.expand.user.id);
    const rel = typeof p.user === "string" ? p.user : p.user?.id;
    if (rel) ids.add(rel);
    if (!rel && !p.expand?.user && (p.email || p.username)) ids.add(p.id);
  }
  if (!ids.size) return rows;
  const byId = await fetchUsersAuthByIds([...ids]);
  return rows.map((row) => {
    const directId = String(
      (typeof row?.patient === "string" && row.patient) ||
        (row?.patient?.id && typeof row.patient === "object"
          ? row.patient.id
          : "") ||
        "",
    ).trim();

    if (
      directId &&
      (!row.expand?.patient || typeof row.expand.patient !== "object")
    ) {
      const u = byId.get(directId);
      if (u) {
        return {
          ...row,
          expand: {
            ...(row.expand || {}),
            patient: { ...u, expand: { ...(u.expand || {}), user: u } },
          },
        };
      }
    }

    const p = row.expand?.patient;
    if (!p || typeof p !== "object") return row;
    let uid =
      (p.expand?.user && p.expand.user.id) ||
      (typeof p.user === "string" ? p.user : p.user?.id) ||
      null;
    if (!uid && (p.email || p.username)) uid = p.id;
    const u = uid ? byId.get(uid) : null;
    if (!u) return row;
    return {
      ...row,
      expand: {
        ...row.expand,
        patient: {
          ...p,
          expand: { ...(p.expand || {}), user: u },
        },
      },
    };
  });
}

/** Doctor package slot index (1–3) → tier label shown to doctors and patients. */
export function packageSlotDisplayName(slot) {
  const n = Number(slot);
  if (n === 2) return "Gold";
  if (n === 3) return "Premium";
  if (Number.isFinite(n) && n > 3) return `Tier ${n}`;
  return "Basic";
}

/** Minimum package fee (INR) per catalogue slot — Basic / Gold / Premium. No maximum. */
export const PACKAGE_SLOT_MIN_FEE_INR = Object.freeze({
  1: 12000,
  2: 20000,
  3: 50000,
});

export function packageSlotMinimumFeeInr(slotNum) {
  const n = Number(slotNum);
  const v = PACKAGE_SLOT_MIN_FEE_INR[n];
  if (Number.isFinite(v) && v > 0) return v;
  return PACKAGE_SLOT_MIN_FEE_INR[1];
}

/**
 * Doctor-entered window for scheduled package consultation (12-hour clock).
 * Expects two times with am/pm (e.g. "9:00 AM to 1:00 PM"). Premium may use
 * "24/7" (or similar) instead of a daily window.
 */
export function consultationTimeWindowAcceptable(raw, slotNum) {
  const t = String(raw || "").trim();
  if (!t) return false;
  const n = Number(slotNum) || 1;
  if (n === 3) {
    if (/\b24\s*[/\s.-]*\s*7\b/i.test(t)) return true;
    if (
      /\b(?:round[\s-]?the[\s-]?clock|always[\s-]?(?:on|available))\b/i.test(t)
    ) {
      return true;
    }
  }
  const re = /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi;
  const hits = t.match(re);
  return Array.isArray(hits) && hits.length >= 2;
}

/** Scheduled consultation block length (hours) used for package time windows: Basic 3h, Gold 5h. */
export function packageSlotScheduledConsultationBlockHours(slotNum) {
  const n = Number(slotNum) || 1;
  if (n === 1) return 3;
  if (n === 2) return 5;
  return 0;
}

function formatTime12hEnUs(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Builds stored `consultation_time_window` from a start time and tier block length.
 * @param {Date} startDate
 * @param {number} slotNum 1 = Basic, 2 = Gold
 */
export function buildConsultationTimeWindowFromStartDate(startDate, slotNum) {
  const hours = packageSlotScheduledConsultationBlockHours(slotNum);
  if (
    !(startDate instanceof Date) ||
    Number.isNaN(startDate.getTime()) ||
    hours <= 0
  ) {
    return "";
  }
  const end = new Date(startDate.getTime() + hours * 60 * 60 * 1000);
  const startStr = formatTime12hEnUs(startDate);
  const endStr = formatTime12hEnUs(end);
  if (!startStr || !endStr) return "";
  return `${startStr} to ${endStr}`;
}

/** Parses the first 12h clock time in a window string into today's calendar Date (for pickers). */
export function parseLeadingTime12hToReferenceDate(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
  const m = t.match(re);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2] != null ? m[2] : "0", 10);
  const ap = String(m[3]).toLowerCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (ap === "pm" && hour !== 12) hour += 12;
  if (ap === "am" && hour === 12) hour = 0;
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMilliseconds(0);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Normalizes stored fee strings: empty stays empty; amounts below the tier
 * minimum are cleared so doctors must re-enter a valid fee (save stays blocked
 * until all slots meet minimums — see doctorPackageFeeErrors).
 */
function coerceStoredPackageFeeInr(slotNum, feeRaw) {
  if (feeRaw === undefined || feeRaw === null) return "";
  const trimmed = String(feeRaw).trim();
  if (!trimmed) return "";
  const amount = Number(trimmed.replace(/,/g, "") || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const min = packageSlotMinimumFeeInr(slotNum);
  if (amount < min) return "";
  return String(Math.round(amount));
}

/** Human-readable validation lines for doctor package fee inputs. */
export function doctorPackageFeeErrors(slots) {
  if (!Array.isArray(slots) || slots.length === 0) {
    return ["Configure all three package fees."];
  }
  const errors = [];
  for (const s of slots) {
    const label = packageSlotDisplayName(s.slot);
    const min = packageSlotMinimumFeeInr(s.slot);
    const amt = Number(
      String(s.total_amount_inr || "")
        .replace(/,/g, "")
        .trim() || 0,
    );
    if (!Number.isFinite(amt) || amt <= 0) {
      errors.push(`${label}: enter your fee in INR.`);
    } else if (amt < min) {
      errors.push(
        `${label}: minimum ₹${min.toLocaleString("en-IN")} (no maximum).`,
      );
    }
    if (Number(s.slot) !== 3) {
      const tw = String(s.consultation_time_window || "").trim();
      if (!tw) {
        errors.push(
          `${label}: add your usual consultation hours in 12-hour format (see example above the form).`,
        );
      } else if (!consultationTimeWindowAcceptable(tw, s.slot)) {
        errors.push(
          `${label}: use two times with am/pm (e.g. 9:00 AM to 1:00 PM).`,
        );
      }
    }
  }
  return errors;
}

/** Entitlements for product-spec Basic / Gold / Premium (aligned to package slots 1–3). */
export function entitlementsForConsumerPlan(plan) {
  const p = String(plan || CONSUMER_PLAN.BASIC).toLowerCase();
  const isBasic = p === CONSUMER_PLAN.BASIC;
  const isGold = p === CONSUMER_PLAN.GOLD;
  const isPremium = p === CONSUMER_PLAN.PREMIUM;
  return {
    plan: p,
    /** null = unlimited daily AI assistant messages */
    aiChatDailyLimit: isBasic ? 20 : null,
    /**
     * Rolling 7-day cap on doctor consultation minutes with the package doctor
     * (Basic ≈ 3h, Gold ≈ 5h; Premium ≈ open access for 24/7 tier).
     */
    consultationMinutesPerWeek: isBasic ? 180 : isGold ? 300 : 10080,
    sideEffectAi: isPremium,
    emergencyAssistant: isPremium,
    dietDoctorReview: isPremium,
    doctorAccess247: isPremium,
  };
}

const NVHS_DOCTOR_TAG_RE = /^\[NVHS_DOCTOR:([^\]]+)\]\s*/;

/** Prefix notes/topic so Quick requests route to the patient's package doctor without a picker. */
export function prefixQuickRequestTextWithDoctor(doctorUserId, text) {
  const d = String(doctorUserId || "").trim();
  const body = String(text || "");
  if (!d) return body;
  return `[NVHS_DOCTOR:${d}]\n${body}`;
}

export function parseQuickRequestDoctorTag(text) {
  const s = String(text || "");
  const m = s.match(NVHS_DOCTOR_TAG_RE);
  if (!m) return { doctorUserId: null, body: s };
  return { doctorUserId: m[1], body: s.replace(NVHS_DOCTOR_TAG_RE, "") };
}

function filterQuickRowsForDoctor(rows, doctorUserId) {
  const id = String(doctorUserId || "").trim();
  if (!id) return rows || [];
  return (rows || []).filter((row) => {
    const rid = relationId(row?.recipient);
    if (rid) return rid === id;
    const raw = row.notes ?? row.topic ?? row.description ?? row.message ?? "";
    const tagged = parseQuickRequestDoctorTag(String(raw || "")).doctorUserId;
    if (!tagged) return true;
    return tagged === id;
  });
}

/** Strip legacy suffix appended to notes/topic before `recipient` existed in PocketBase. */
export function stripLegacyQuickRecipientSuffix(text) {
  let s = String(text || "").trim();
  const marker = "\n\n— Recipient:";
  const i = s.indexOf(marker);
  if (i !== -1) s = s.slice(0, i).trim();
  return s;
}

/** Notes / topic text for UI (no routing metadata). */
export function displayQuickSolutionNotes(record) {
  const raw = stripLegacyQuickRecipientSuffix(String(record?.notes || ""));
  return parseQuickRequestDoctorTag(raw).body.trim();
}

export function displayQuickCounsellingTopic(record) {
  const raw = stripLegacyQuickRecipientSuffix(String(record?.topic || ""));
  return parseQuickRequestDoctorTag(raw).body.trim() || "General";
}

export async function getPatientActiveQuickCareBinding(
  patientAuthUserId,
  patientProfileIdHint = null,
) {
  const uid = String(patientAuthUserId || "").trim();
  if (!uid) return null;
  const pairs = await listActivePackagePairsForPatient(
    uid,
    patientProfileIdHint,
  );
  if (!pairs.length) return null;
  const sorted = [...pairs].sort((a, b) =>
    String(b.created || "").localeCompare(String(a.created || "")),
  );
  const top = sorted[0];
  const doctorUserId = String(top.doctor_user_id || "").trim();
  if (!doctorUserId) return null;
  const packageSlot =
    top.package_slot != null && top.package_slot !== ""
      ? Number(top.package_slot)
      : 1;
  const consumerPlan = packageSlotToConsumerPlan(
    Number.isFinite(packageSlot) ? packageSlot : 1,
  );
  return {
    doctorUserId,
    packageSlot: Number.isFinite(packageSlot) ? packageSlot : 1,
    consumerPlan,
    offerId: top.offerId || top.id || null,
    title: top.title || "Care package",
    created: top.created || "",
  };
}

/** Remaining package-pool coins for the patient's active `patient_doctor_packages` rows (best-effort). */
export async function getPatientPackagePoolCoinsRemaining(patientUserId) {
  const pid = String(patientUserId || "").trim();
  if (!pid) return 0;
  try {
    const ledgerRows = await listCoinLedgerForUser(pid);
    const packageRows = (ledgerRows || []).filter(
      isPatientPackageCoinLedgerRow,
    );
    if (packageRows.length > 0) {
      const total = packageRows.reduce(
        (sum, row) => sum + (Number(row.delta) || 0),
        0,
      );
      return Math.max(0, Math.round(total));
    }
  } catch {
    // Fall back to patient_doctor_packages cache below.
  }
  try {
    const rows = await pb.collection("patient_doctor_packages").getFullList({
      requestKey: null,
      filter: `patient="${pid}" && status="active"`,
      sort: "-started_at",
    });
    const total = (rows || []).reduce((sum, row) => {
      const n = Number(
        row?.remaining_coins ?? row?.amount_inr ?? row?.remaining ?? 0,
      );
      return sum + (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
    }, 0);
    if (total > 0) return total;
  } catch {
    return 0;
  }
  return 0;
}

const aiUsageDayKey = () => new Date().toISOString().slice(0, 10);

export async function getAiAssistantUsageToday(patientUserId) {
  const uid = String(patientUserId || "").trim();
  if (!uid) return 0;
  const key = `nvhs_ai_usage_${uid}_${aiUsageDayKey()}`;
  try {
    const v = await AsyncStorage.getItem(key);
    return Math.max(0, Number(v) || 0);
  } catch {
    return 0;
  }
}

export async function incrementAiAssistantUsageToday(patientUserId) {
  const uid = String(patientUserId || "").trim();
  if (!uid) return 0;
  const key = `nvhs_ai_usage_${uid}_${aiUsageDayKey()}`;
  const next = (await getAiAssistantUsageToday(uid)) + 1;
  try {
    await AsyncStorage.setItem(key, String(next));
  } catch {
    // ignore
  }
  return next;
}

/**
 * Approximate consultation minutes used in the last 7 days with a given doctor
 * (completed appointments only; 45 min each if schema has no duration).
 */
export function minutesUsedWithDoctorThisRollingWeek(
  appointments,
  patientUserId,
  doctorUserId,
) {
  const pid = String(patientUserId || "").trim();
  const did = String(doctorUserId || "").trim();
  if (!pid || !did) return 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let sum = 0;
  for (const a of appointments || []) {
    if (String(a.patientId || a.patient || "") !== pid) continue;
    if (String(a.doctorUserId || "") !== did) continue;
    const st = String(a.statusKey || a.status || "").toLowerCase();
    if (st !== "completed") continue;
    const t = new Date(a.scheduledAt || 0).getTime();
    if (!Number.isFinite(t) || t < weekAgo) continue;
    const explicit = Number(a.raw?.duration_minutes ?? a.durationMinutes);
    sum += Number.isFinite(explicit) && explicit > 0 ? explicit : 45;
  }
  return sum;
}

/** Package Doctor demos: professional or specialist tier only (RMP/clinic reserved for quick services). */
export function doctorTierEligibleForPackageMode(tier) {
  const t = String(tier || "").toLowerCase();
  return t === "professional" || t === "specialist";
}

const normalizeTierMarker = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function quickServiceMarkerEligible(value) {
  const marker = normalizeTierMarker(value);
  if (!marker) return false;
  if (
    marker === "rmp" ||
    marker === "rmp_doctor" ||
    marker === "clinic" ||
    marker === "clinic_doctor" ||
    marker === "gp" ||
    marker === "general_physician" ||
    marker === "mbbs"
  ) {
    return true;
  }
  return marker.split("_").includes("rmp");
}

/**
 * Quick Solution / Quick Counselling queues: RMP & clinic tiers (not package-demo tier).
 * Pass auth `user`, `doctor_profile` row, or a tier string.
 */
export function doctorTierEligibleForQuickService(userOrProfileOrTier) {
  if (
    typeof userOrProfileOrTier === "string" ||
    typeof userOrProfileOrTier === "number"
  ) {
    return quickServiceMarkerEligible(userOrProfileOrTier);
  }
  const row =
    userOrProfileOrTier && typeof userOrProfileOrTier === "object"
      ? userOrProfileOrTier
      : null;
  const raw = row?.raw && typeof row.raw === "object" ? row.raw : null;
  const sources = [row, raw].filter(Boolean);
  const tierFields = sources.flatMap((src) => [
    src.practitioner_tier,
    src.practitionerTier,
    src.doctor_class,
    src.doctorClass,
    src.tier,
    src.verification_tier,
    src.verificationTier,
    src.provider_kind,
    src.providerKind,
  ]);
  const explicitTier = tierFields.find((value) => String(value || "").trim());
  // RMP / clinic markers win first so doctors who also completed package fee
  // setup still see Quick queues when their tier is rmp/clinic (or GP/mbbs).
  if (tierFields.some(quickServiceMarkerEligible)) return true;
  if (
    sources.some((src) =>
      quickServiceMarkerEligible(
        src.clinic_or_hospital || src.clinicOrHospital,
      ),
    )
  ) {
    return true;
  }

  const isPkg =
    doctorProfileIsPackageDoctor(row) || doctorProfileIsPackageDoctor(raw);

  // Package-care doctors (completed fee setup) without RMP/clinic markers stay
  // on package flows only.
  if (isPkg) return false;

  // Professional / specialist tier: quick queues are for RMP/clinic routing.
  if (doctorTierEligibleForPackageMode(explicitTier)) return false;

  // Legacy / partial onboarding: no tier stored → treat as RMP-style quick queue
  // (recipient-based lists still need the doctor to load their assigned rows).
  if (!explicitTier) return true;

  return false;
}

/**
 * Doctor Home dashboard: specialist tier hides Booking Tracks, Quick Queues,
 * package appointments strip, and Recent Activity.
 */
export function doctorDashboardIsSpecialist(
  doctorProfileRecord,
  authUserRecord,
) {
  const tier = String(
    doctorProfileRecord?.practitioner_tier ||
      doctorProfileRecord?.practitionerTier ||
      doctorProfileRecord?.tier ||
      doctorProfileRecord?.verification_tier ||
      doctorProfileRecord?.doctor_class ||
      authUserRecord?.practitioner_tier ||
      authUserRecord?.practitionerTier ||
      "",
  )
    .trim()
    .toLowerCase();
  if (tier === "specialist") return true;
  const dtype = String(doctorProfileRecord?.doctor_type || "")
    .trim()
    .toLowerCase();
  return dtype === "specialist";
}

/** PocketBase `pharmacy_profile.provider_kind` — drives medicine orders vs quick queues only. */
export const PHARMACY_PROVIDER_KIND = Object.freeze({
  RMP_DOCTOR: "rmp_doctor",
  CLINIC: "clinic",
});

export function normalizePharmacyProviderKind(raw) {
  const t = normalizeTierMarker(raw);
  if (
    t === "rmp_doctor" ||
    t === "rmp" ||
    t === "gp" ||
    t === "general_physician"
  ) {
    return PHARMACY_PROVIDER_KIND.RMP_DOCTOR;
  }
  if (t === "clinic" || t === "pharmacy" || t === "clinic_doctor") {
    return PHARMACY_PROVIDER_KIND.CLINIC;
  }
  return "";
}

/** RMP / general physicians do not take medicine orders; clinics do. Unknown → treat as clinic (legacy). */
export function pharmacyReceivesMedicineOrders(profileOrKind) {
  const k =
    typeof profileOrKind === "string" || typeof profileOrKind === "number"
      ? normalizePharmacyProviderKind(profileOrKind)
      : normalizePharmacyProviderKind(profileOrKind?.provider_kind);
  if (k === PHARMACY_PROVIDER_KIND.RMP_DOCTOR) return false;
  return true;
}

/** Three fixed catalogue slots — doctors set fee + consultation window (Basic/Gold); Premium is 24/7. */
export const DOCTOR_PACKAGE_SLOT_IDS = [1, 2, 3];

const DEFAULT_PACKAGE_AMOUNT_INR = Math.max(
  1,
  Number(
    (typeof process !== "undefined" &&
      process.env?.EXPO_PUBLIC_DEFAULT_PACKAGE_AMOUNT_INR) ||
      8000,
  ) || 8000,
);
const REFERRAL_MONTHLY_COMMISSION_COINS = 1000;

export function resolvePackageSlotAmountInr(slot) {
  const slotNum = Number(slot?.slot) || 1;
  const min = packageSlotMinimumFeeInr(slotNum);
  const raw =
    slot?.total_amount_inr ??
    slot?.amount_inr ??
    slot?.default_amount_inr ??
    "";
  const amount = Number(String(raw).replace(/,/g, "").trim() || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return Math.max(min, DEFAULT_PACKAGE_AMOUNT_INR);
  }
  return Math.max(min, Math.round(amount));
}

export function packageSlotUsesDefaultAmount(slot) {
  const raw =
    slot?.total_amount_inr ??
    slot?.amount_inr ??
    slot?.default_amount_inr ??
    "";
  const amount = Number(String(raw).replace(/,/g, "").trim() || 0);
  return !(Number.isFinite(amount) && amount > 0);
}

/**
 * App-controlled package copy & features (doctors cannot change these - only their fee).
 * Update this list when product adds/removes features per tier.
 */
export const FIXED_PACKAGE_DEFINITIONS = [
  {
    slot: 1,
    name: "Basic — Essential Care",
    total_period: "90 days",
    treatment_type: "Core care & limited AI",
    description:
      "Core subscription with limited AI chat, scheduled doctor time, and medication adherence support.",
    features: [
      "Limited AI chat access",
      "3 hours of doctor consultation time (scheduled by the doctor)",
      "Daily medication reminders",
    ],
  },
  {
    slot: 2,
    name: "Gold — Active Care",
    total_period: "120 days",
    treatment_type: "Expanded AI & more doctor time",
    description:
      "Includes unlimited AI chat, more scheduled doctor consultation time, and daily medication reminders.",
    features: [
      "Unlimited AI chat access",
      "5 hours of doctor consultation time (scheduled by the doctor)",
      "Daily medication reminders",
    ],
  },
  {
    slot: 3,
    name: "Premium — Comprehensive Care",
    total_period: "180 days",
    treatment_type: "Full access, safety, diet & emergency support",
    description:
      "Full AI and safety tools, 24/7 doctor access, diet review by your doctor, and a personal assistant for emergencies and logistics.",
    features: [
      "Unlimited AI chat access",
      "AI-powered side effects checker",
      "Daily medication reminders",
      "24/7 doctor consultation access at any time of the day",
      "Diet checking by doctor",
      "Personal assistant for emergencies (e.g. finding hospitals and reducing hassle)",
    ],
  },
];

/** Canonical catalogue row for a slot (1–3). Used by doctor setup, find-doctor, and patient modals. */
export function getFixedPackageDefinitionForSlot(slotNum) {
  const n = Number(slotNum) || 1;
  const idx = Math.min(Math.max(n, 1), 3) - 1;
  return FIXED_PACKAGE_DEFINITIONS[idx] || FIXED_PACKAGE_DEFINITIONS[0];
}

function parsePackageTemplatesRaw(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    if (raw.skipped === true) return [];
    return [];
  }
  if (raw && typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.skipped === true
      ) {
        return [];
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** True when doctor chose Skip (stored as JSON object on `package_templates` or legacy PB flag). */
export function doctorProfilePackageSetupSkipped(record) {
  if (!record) return false;
  if (record.package_setup_skipped === true) return true;
  const raw = packageTemplatesRawFromRecord(record);
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    raw.skipped === true
  )
    return true;
  return false;
}

/** Raw JSON for package fee rows from `doctor_profile` (supports alternate field names). */
export function packageTemplatesRawFromRecord(record) {
  if (!record) return null;
  return (
    record.package_templates ??
    record.packages_template ??
    record.package_slots ??
    null
  );
}

/** True when three fees are saved (`package_setup`) or derived complete from template array / legacy. */
export function doctorProfilePackageFeesReady(record) {
  if (!record) return false;
  if (record.package_setup === true) return true;
  const slots = normalizeDoctorPackageSlots(
    packageTemplatesRawFromRecord(record),
  );
  return doctorPackagesSetupComplete(slots);
}

/**
 * Package doctor: completed fee setup and did not choose Skip.
 * RMP doctor: everyone else (including skipped onboarding).
 */
export function doctorProfileIsPackageDoctor(record) {
  if (!record) return false;
  if (doctorProfilePackageSetupSkipped(record)) return false;
  return doctorProfilePackageFeesReady(record);
}

const LEDGER_REASON_QUICK_SOLUTION_EARNED = "quick_solution_provider_earned";
const LEDGER_REASON_QUICK_COUNSELLING_EARNED =
  "quick_counselling_provider_earned";
const LEDGER_REASON_QUICK_SOLUTION_SPENT = "quick_solution_patient_spent";
const LEDGER_REASON_QUICK_COUNSELLING_SPENT = "quick_counselling_patient_spent";
const LEDGER_REASON_QUICK_SOLUTION_REFUNDED =
  "quick_solution_patient_refunded_uncredited";
const LEDGER_REASON_QUICK_COUNSELLING_REFUNDED =
  "quick_counselling_patient_refunded_uncredited";
const LEDGER_REASON_PACKAGE_SESSION_EARNED = "package_session_doctor_earned";
const LEDGER_REASON_REFERRAL_COMMISSION_RECEIVED =
  "referral_monthly_commission_received";
const LEDGER_REASON_REFERRAL_COMMISSION_PAID =
  "referral_monthly_commission_paid";

/**
 * Split doctor coin ledger into Quick (RMP) vs package-care buckets for UI.
 * Any deltas not matching these reasons are folded into the package bucket so
 * the two numbers still sum to the same total as `getCoinBalanceForUser`.
 */
export async function getDoctorCoinBucketBalances(doctorUserId) {
  const uid = String(doctorUserId || "").trim();
  if (!uid) {
    return { quickCoins: 0, packageCoins: 0, totalCoins: 0 };
  }
  let isQuickCareDoctor = false;
  try {
    const profile = await pb
      .collection("doctor_profile")
      .getFirstListItem(`user="${uid}"`, { requestKey: null });
    isQuickCareDoctor = doctorTierEligibleForQuickService(profile);
  } catch {
    isQuickCareDoctor = false;
  }
  const rows = await listCoinLedgerForUser(uid);
  let quick = 0;
  let pkg = 0;
  for (const row of rows) {
    const r = String(row.reason || "");
    const d = Number(row.delta) || 0;
    const meta = parseCoinLedgerMeta(row);
    const wallet = String(
      meta.wallet || meta.wallet_mode || meta.coin_wallet || "",
    )
      .trim()
      .toLowerCase();
    if (
      r === LEDGER_REASON_QUICK_SOLUTION_EARNED ||
      r === LEDGER_REASON_QUICK_COUNSELLING_EARNED ||
      wallet === "quick" ||
      wallet === "quick_care" ||
      wallet === "casual"
    ) {
      quick += d;
    } else if (
      r === LEDGER_REASON_PACKAGE_SESSION_EARNED ||
      r === LEDGER_REASON_REFERRAL_COMMISSION_RECEIVED ||
      r === LEDGER_REASON_REFERRAL_COMMISSION_PAID ||
      wallet === "package"
    ) {
      pkg += d;
    }
  }
  const totalCoins = rows.reduce(
    (sum, row) => sum + (Number(row.delta) || 0),
    0,
  );
  const remainder = totalCoins - quick - pkg;
  return {
    quickCoins: quick + (isQuickCareDoctor ? remainder : 0),
    packageCoins: pkg + (isQuickCareDoctor ? 0 : remainder),
    totalCoins,
  };
}

const doctorPkgFeesKey = (userId) => `nvhs_doctor_pkg_fees_${userId || "anon"}`;
const doctorPkgSkipKey = (userId) => `nvhs_doctor_pkg_skip_${userId || "anon"}`;

export async function readLocalDoctorPackageFees(userId) {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(doctorPkgFeesKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeLocalDoctorPackageFees(userId, entries) {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(
      doctorPkgFeesKey(userId),
      JSON.stringify(entries || []),
    );
  } catch {
    // ignore
  }
}

export async function clearLocalDoctorPackageFees(userId) {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(doctorPkgFeesKey(userId));
  } catch {
    // ignore
  }
}

export async function readLocalPackageSetupSkip(userId) {
  if (!userId) return false;
  try {
    const v = await AsyncStorage.getItem(doctorPkgSkipKey(userId));
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export async function writeLocalPackageSetupSkip(userId, skipped) {
  if (!userId) return;
  try {
    if (skipped) await AsyncStorage.setItem(doctorPkgSkipKey(userId), "1");
    else await AsyncStorage.removeItem(doctorPkgSkipKey(userId));
  } catch {
    // ignore
  }
}

/** Overlay locally stored package rows onto normalized slots (device fallback). */
export function mergeLocalFeesOntoSlots(slots, localFees) {
  if (
    !Array.isArray(slots) ||
    !Array.isArray(localFees) ||
    localFees.length === 0
  ) {
    return slots;
  }
  return slots.map((s) => {
    const L = localFees.find((e) => Number(e?.slot) === Number(s.slot));
    if (!L) return s;
    const next = { ...s };
    if (
      L.total_amount_inr != null &&
      String(L.total_amount_inr).trim() !== ""
    ) {
      next.total_amount_inr = coerceStoredPackageFeeInr(
        s.slot,
        L.total_amount_inr,
      );
    }
    const tw = L.consultation_time_window ?? L.consultation_hours;
    if (tw != null && String(tw).trim() !== "") {
      next.consultation_time_window = String(tw).trim();
    }
    return next;
  });
}

/** Merge app-fixed catalogue with doctor-stored fee + optional consultation window. */
export function normalizeDoctorPackageSlots(raw) {
  const arr = parsePackageTemplatesRaw(raw);
  return DOCTOR_PACKAGE_SLOT_IDS.map((slotNum) => {
    const fixed = FIXED_PACKAGE_DEFINITIONS[slotNum - 1] || {
      slot: slotNum,
      name: `${packageSlotDisplayName(slotNum)} — Care package`,
      description: "",
      total_period: "",
      treatment_type: "",
      features: [],
    };
    const entry = arr.find((e) => Number(e?.slot) === slotNum);
    const feeRaw = entry?.total_amount_inr ?? entry?.amount_inr ?? "";
    const windowRaw = String(
      entry?.consultation_time_window ??
        entry?.consultation_hours ??
        entry?.scheduled_consultation_window ??
        "",
    ).trim();
    const consultation_time_window =
      slotNum === 3 ? windowRaw || "24/7" : windowRaw;
    return {
      ...fixed,
      slot: slotNum,
      total_amount_inr: coerceStoredPackageFeeInr(slotNum, feeRaw),
      consultation_time_window,
    };
  });
}

export function doctorPackagesSetupComplete(slots) {
  if (!Array.isArray(slots) || slots.length < 3) return false;
  return doctorPackageFeeErrors(slots).length === 0;
}

/**
 * Persists package fees for a doctor. Tries PocketBase first; if update is denied or fails and
 * `userId` is set, stores package rows on device so the app can unlock the dashboard.
 * @returns {{ record: object|null, localOnly: boolean }}
 */
export async function saveDoctorPackageTemplates(
  profileId,
  slots,
  userId = null,
) {
  if (!profileId) throw new Error("Missing doctor profile.");
  const normalized = normalizeDoctorPackageSlots(slots).map((s) =>
    Number(s.slot) === 3 ? { ...s, consultation_time_window: "24/7" } : s,
  );
  const feeErrs = doctorPackageFeeErrors(normalized);
  if (feeErrs.length) {
    throw new Error(feeErrs.join("\n"));
  }
  const complete = doctorPackagesSetupComplete(normalized);
  const package_templates = normalized.map((s) => ({
    slot: s.slot,
    total_amount_inr: String(s.total_amount_inr || "").trim(),
    consultation_time_window: String(
      Number(s.slot) === 3 ? "24/7" : s.consultation_time_window || "",
    ).trim(),
  }));
  const packageTierWhenComplete = complete
    ? { practitioner_tier: "professional" }
    : {};
  const attempts = [
    {
      package_templates,
      package_setup: complete,
      package_setup_skipped: false,
      ...packageTierWhenComplete,
    },
    { package_templates, package_setup: complete, ...packageTierWhenComplete },
    {
      package_templates,
      packages_setup_complete: complete,
      package_setup_skipped: false,
      ...packageTierWhenComplete,
    },
    {
      package_templates,
      packages_setup_complete: complete,
      ...packageTierWhenComplete,
    },
    { package_templates, ...packageTierWhenComplete },
    {
      packages_template: package_templates,
      package_setup: complete,
      package_setup_skipped: false,
      ...packageTierWhenComplete,
    },
    {
      packages_template: package_templates,
      package_setup: complete,
      ...packageTierWhenComplete,
    },
    {
      packages_template: package_templates,
      packages_setup_complete: complete,
      package_setup_skipped: false,
      ...packageTierWhenComplete,
    },
    {
      packages_template: package_templates,
      packages_setup_complete: complete,
      ...packageTierWhenComplete,
    },
    { packages_template: package_templates, ...packageTierWhenComplete },
  ];
  let lastError = null;
  for (const body of attempts) {
    try {
      const record = await pb
        .collection("doctor_profile")
        .update(profileId, body);
      if (userId) {
        await clearLocalDoctorPackageFees(userId);
        await writeLocalPackageSetupSkip(userId, false);
      }
      return { record, localOnly: false };
    } catch (error) {
      lastError = error;
    }
  }
  const msg =
    formatPocketBaseClientError(lastError) ||
    lastError?.message ||
    "Save failed. Add JSON fields `package_templates` or `packages_template` on doctor_profile and allow doctors to update their own row.";
  if (userId) {
    await writeLocalDoctorPackageFees(userId, package_templates);
    await writeLocalPackageSetupSkip(userId, false);
    return { record: null, localOnly: true };
  }
  throw new Error(msg);
}

/** Skip package fee setup (dashboard opens); syncs to PocketBase when rules allow. */
export async function persistPackageSetupSkip({ profileId, userId }) {
  if (userId) await writeLocalPackageSetupSkip(userId, true);
  if (!profileId) return { ok: true, localOnly: true };
  try {
    await pb.collection("doctor_profile").update(profileId, {
      package_setup: false,
      package_templates: { skipped: true },
      package_setup_skipped: true,
    });
    return { ok: true, localOnly: false };
  } catch {
    try {
      await pb.collection("doctor_profile").update(profileId, {
        package_setup: false,
        package_templates: { skipped: true },
      });
      return { ok: true, localOnly: false };
    } catch {
      return { ok: true, localOnly: true };
    }
  }
}

export const WALLET_TOPUP_MIN_INR = 50;
export const WALLET_TOPUP_MAX_INR = 1000;

/** Package split: platform keeps 25%; the remaining 75% is the doctor pool. */
export function splitPackagePayment(amountInr) {
  const total = Number(amountInr);
  if (!Number.isFinite(total) || total <= 0) {
    return { platformFeeInr: 0, doctorCoins: 0 };
  }
  const platformFeeInr = Math.round(total * 0.25);
  const doctorCoins = Math.max(0, total - platformFeeInr);
  return { platformFeeInr, doctorCoins };
}

const careKey = (userId) => `nvhs_care_mode_${userId || "anon"}`;

export async function readLocalCareMode(userId) {
  try {
    const v = await AsyncStorage.getItem(careKey(userId));
    return String(v || "").trim();
  } catch {
    return "";
  }
}

export async function writeLocalCareMode(userId, mode) {
  try {
    await AsyncStorage.setItem(careKey(userId), String(mode || "").trim());
  } catch {
    // ignore
  }
}

export function effectiveCareMode(profile, localMode) {
  const fromLocal = String(localMode || "").trim();
  if (fromLocal) return fromLocal;
  return String(profile?.care_mode || "").trim();
}

export function needsCareOnboarding(profile, localMode) {
  return !effectiveCareMode(profile, localMode);
}

export async function persistPatientCareMode({ profileId, userId, mode }) {
  const value = String(mode || "").trim();
  if (!value) return;
  await writeLocalCareMode(userId, value);
  if (!profileId) return;
  try {
    await pb.collection("patient_profile").update(profileId, {
      care_mode: value,
    });
  } catch (error) {
    console.log(
      "persistPatientCareMode: server may lack care_mode field -",
      error?.message || error,
    );
  }
}

/** Clears local + server care_mode so onboarding shows again. */
export async function clearPatientCareMode({ profileId, userId }) {
  try {
    await AsyncStorage.removeItem(careKey(userId));
  } catch {
    // ignore
  }
  if (!profileId) return;
  try {
    await pb.collection("patient_profile").update(profileId, { care_mode: "" });
  } catch (error) {
    console.log("clearPatientCareMode:", error?.message);
  }
}

const patientPrimaryPathsKey = (userId) =>
  `nv_patient_primary_paths_v1_${String(userId || "").trim()}`;

/**
 * Persisted primary-care onboarding (pharmacy, then General / Specialist paths).
 * `completed: true` means the patient finished the post-registration wizard.
 * May include `pharmacyUserId` / `pharmacyName` for medicine orders + chat.
 */
export async function readPatientPrimaryCarePaths(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  try {
    const raw = await AsyncStorage.getItem(patientPrimaryPathsKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function writePatientPrimaryCarePaths(userId, data) {
  const uid = String(userId || "").trim();
  if (!uid || !data || typeof data !== "object") return;
  try {
    await AsyncStorage.setItem(
      patientPrimaryPathsKey(uid),
      JSON.stringify(data),
    );
  } catch (e) {
    console.log("writePatientPrimaryCarePaths:", e?.message);
  }
}

export async function clearPatientPrimaryCarePaths(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  try {
    await AsyncStorage.removeItem(patientPrimaryPathsKey(uid));
  } catch (e) {
    console.log("clearPatientPrimaryCarePaths:", e?.message);
  }
}

/** If the patient already had legacy `care_mode` before primary-paths existed, mark paths complete. */
export async function migrateLegacyPatientPrimaryPathsIfNeeded(
  userId,
  profile,
  localCareMode,
) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  const existing = await readPatientPrimaryCarePaths(uid);
  if (existing?.completed) return existing;
  const legacy = String(profile?.care_mode || localCareMode || "").trim();
  if (legacy) {
    const migrated = {
      completed: true,
      legacyCareMode: legacy,
      wantsGeneral: legacy === CARE_MODE.GENERAL,
      wantsSpecialist: legacy === CARE_MODE.PACKAGE,
    };
    await writePatientPrimaryCarePaths(uid, migrated);
    return migrated;
  }
  return existing;
}

/** True if the patient has a non-cancelled appointment with this doctor. */
export async function patientHasBookedConsultWithDoctor(
  patientUserId,
  doctorUserId,
) {
  const pid = String(patientUserId || "").trim();
  const did = String(doctorUserId || "").trim();
  if (!pid || !did) return false;
  try {
    const profileId = await resolveDoctorProfileIdForUser(did);
    const doctorKeys = [...new Set([did, profileId].filter(Boolean))];
    const parts = doctorKeys.map((d) => `doctor="${d}"`);
    const filter = `patient="${pid}" && (${parts.join(" || ")})`;
    const rows = await pb.collection(appointmentsColl()).getFullList({
      requestKey: null,
      filter,
      sort: "-created",
    });
    return rows.some((r) => {
      const st = String(r.status || "").toLowerCase();
      if (st === "cancelled" || st === "canceled" || st === "rejected")
        return false;
      return true;
    });
  } catch (e) {
    console.log("patientHasBookedConsultWithDoctor:", e?.message);
    return false;
  }
}

/**
 * Basic package: calls/chat only inside the doctor's configured daily window (local time, best-effort).
 */
export function isNowInsideConsultationWindowText(rawWindow) {
  const t = String(rawWindow || "").trim();
  if (!t) return true;
  if (/\b24\s*[/\s.-]*\s*7\b/i.test(t)) return true;
  const pieces = t
    .split(/\s+to\s+|\s*-\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (pieces.length < 2) return true;
  const parseToday = (timeStr) => {
    const s = String(timeStr || "").trim();
    if (!s) return null;
    const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2] || "0", 10);
    const ap = m[3].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    const base = new Date();
    base.setHours(h, min, 0, 0);
    return base.getTime();
  };
  const a = parseToday(pieces[0]);
  const b = parseToday(pieces[1]);
  if (a == null || b == null) return true;
  let start = Math.min(a, b);
  let end = Math.max(a, b);
  const now = Date.now();
  if (end <= start) end += 24 * 60 * 60 * 1000;
  return now >= start && now <= end;
}

export async function assertPatientMayPlaceCallToDoctor({
  patientUserId,
  doctorUserId,
  primaryPaths,
  patientCareMode,
  consumerPlan,
  consultationTimeWindow,
}) {
  const did = String(doctorUserId || "").trim();
  const pid = String(patientUserId || "").trim();
  if (!did || !pid) return { ok: true };

  if (patientCareModeUsesQuickDoctorsOnly(patientCareMode)) {
    try {
      const profile = await pb
        .collection("doctor_profile")
        .getFirstListItem(`user="${did}"`, { requestKey: null });
      if (!doctorTierEligibleForQuickService(profile)) {
        return {
          ok: false,
          message:
            "This mode can only contact RMP or clinic doctors. Switch to Package mode for professional/specialist doctors.",
        };
      }
    } catch {
      return {
        ok: false,
        message: "This mode can only contact verified RMP or clinic doctors.",
      };
    }
  }

  const paths =
    primaryPaths && typeof primaryPaths === "object"
      ? primaryPaths
      : await readPatientPrimaryCarePaths(pid);
  const genId = String(paths?.generalDoctorUserId || "").trim();
  const specId = String(paths?.specialistDoctorUserId || "").trim();

  if (patientCareMode === CARE_MODE.GENERAL && genId && did === genId) {
    const booked = await patientHasBookedConsultWithDoctor(pid, did);
    if (!booked) {
      return {
        ok: false,
        message:
          "Book and pay for an appointment with your general doctor before starting a call.",
      };
    }
  }

  const plan = String(consumerPlan || CONSUMER_PLAN.BASIC).toLowerCase();
  if (
    specId &&
    did === specId &&
    plan === CONSUMER_PLAN.BASIC &&
    consultationTimeWindow
  ) {
    if (!isNowInsideConsultationWindowText(consultationTimeWindow)) {
      return {
        ok: false,
        message: `Basic package: calls are limited to your doctor's consultation hours (${consultationTimeWindow}).`,
      };
    }
  }

  return { ok: true };
}

async function notifyLocal(title, body) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: "default" },
      trigger: null,
    });
  } catch {
    // ignore
  }
}

// --- Medical records (collection: medical_records) ---
export async function fetchMedicalRecordsForPatient(patientUserId) {
  if (!patientUserId) return [];
  try {
    const rows = await pb.collection("medical_records").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `patient="${patientUserId}"`,
    });
    return rows || [];
  } catch (error) {
    console.log("fetchMedicalRecordsForPatient:", error?.message);
    return [];
  }
}

export async function uploadMedicalRecord({ patientUserId, title, filePart }) {
  if (!patientUserId) throw new Error("Not signed in.");
  const form = new FormData();
  form.append("patient", patientUserId);
  form.append("title", String(title || "Record").trim() || "Record");
  if (filePart?.uri) {
    form.append("file", filePart);
  }
  try {
    const created = await pb.collection("medical_records").create(form);
    return created;
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Upload failed. Add collection `medical_records` in PocketBase (patient relation, title text, file file).",
    );
  }
}

/** First file field name on a `medical_records` row (schema may use `file`, `document`, etc.). */
export function medicalRecordPrimaryFileName(record) {
  const keys = ["file", "document", "attachment", "pdf", "photo", "image"];
  for (const key of keys) {
    const v = record?.[key];
    if (typeof v === "string" && String(v).trim()) return String(v).trim();
    if (Array.isArray(v) && v.length) {
      const first = v.find((x) => typeof x === "string" && String(x).trim());
      if (first) return String(first).trim();
    }
  }
  return "";
}

/** Authenticated download URL for the record's primary file (for in-app browser / sharing). */
export function getMedicalRecordFileDownloadUrl(record) {
  const fname = medicalRecordPrimaryFileName(record);
  if (!fname || !record?.id) return "";
  const token = pb.authStore?.token;
  return pb.files.getUrl(record, fname, token ? { token } : undefined);
}

export async function deleteMedicalRecord(recordId) {
  const id = String(recordId || "").trim();
  if (!id) throw new Error("Missing record id");
  await pb.collection("medical_records").delete(id);
}

/**
 * Doctors the patient may share a medical record with in chat.
 * Package mode: active package doctors only. Other modes: RMP / quick-service-eligible doctors only.
 */
export async function listDoctorsForMedicalRecordShare({
  careMode,
  patientAuthUserId,
  patientProfileId,
}) {
  const uid = String(patientAuthUserId || "").trim();
  if (!uid) return [];
  const mode = String(careMode || "").trim();

  if (mode === CARE_MODE.PACKAGE) {
    const pairs = await listActivePackagePairsForPatient(uid, patientProfileId);
    const seen = new Map();
    for (const p of pairs || []) {
      const did = String(p.doctor_user_id || "").trim();
      if (!did || seen.has(did)) continue;
      seen.set(did, String(p.title || "Care package").trim() || "Care package");
    }
    if (!seen.size) return [];
    const authMap = await fetchUsersAuthByIds([...seen.keys()]);
    return [...seen.entries()].map(([doctorUserId, pkgTitle]) => {
      const u = authMap.get(doctorUserId);
      const name =
        resolveListingDisplayName(null, u) ||
        `Doctor (${doctorUserId.slice(0, 6)}…)`;
      return { doctorUserId, label: name, subtitle: pkgTitle };
    });
  }

  try {
    const records = await pb.collection("doctor_profile").getFullList({
      requestKey: null,
      filter: `status="approved"`,
      expand: "user",
    });
    const out = [];
    const seenU = new Set();
    for (const rec of records || []) {
      if (!doctorTierEligibleForQuickService(rec)) continue;
      const rawUser = rec.expand?.user;
      let user = Array.isArray(rawUser) ? rawUser[0] : rawUser;
      const userId =
        (typeof rec.user === "string" ? rec.user : rec.user?.id) || user?.id;
      if (!userId || seenU.has(userId)) continue;
      seenU.add(userId);
      const name = resolveListingDisplayName(rec, user) || "Doctor";
      out.push({
        doctorUserId: userId,
        label: name,
        subtitle: "RMP / quick consult doctor",
      });
    }
    return out;
  } catch (e) {
    console.log("listDoctorsForMedicalRecordShare:", e?.message || e);
    return [];
  }
}

// --- Package demo meetings (uses existing `appointments` collection) ---
// Negotiation state is stored in `reason` after marker ---NVHS_MEETING_WORKFLOW--- (same as legacy
// description encoding). Rows are normal appointments with consultation_type + status; only rows
// whose reason contains the marker are listed as package demo meetings.

export const PACKAGE_MEETING_STATUS = {
  AWAITING_DOCTOR: "awaiting_doctor",
  DOCTOR_PROPOSED_SLOTS: "doctor_proposed_slots",
  AWAITING_DOCTOR_AFTER_PATIENT_PICK: "awaiting_doctor_after_patient_pick",
  CONFIRMED: "confirmed",
};

/** `dateStr` YYYY-MM-DD, `timeStr` HH:MM (24h) → ISO or null */
export function combineDateAndTimeToIso(dateStr, timeStr) {
  const d = String(dateStr || "").trim();
  const t = String(timeStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const tm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return null;
  const hh = String(tm[1]).padStart(2, "0");
  const mm = tm[2];
  const local = new Date(`${d}T${hh}:${mm}:00`);
  return Number.isFinite(local.getTime()) ? local.toISOString() : null;
}

export function packageMeetingStatusLabel(status) {
  switch (status) {
    case PACKAGE_MEETING_STATUS.AWAITING_DOCTOR:
      return "Waiting for doctor";
    case PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS:
      return "Doctor suggested other times";
    case PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK:
      return "Waiting for doctor to confirm your time";
    case PACKAGE_MEETING_STATUS.CONFIRMED:
      return "Confirmed";
    default:
      return status || "-";
  }
}

/**
 * Doctor home buckets (product spec PDF + meeting negotiation):
 * - pending: patient booked; doctor has not completed first accept/reschedule step.
 * - discussing: reschedule / alternate-slot negotiation in progress.
 * - confirmed_demo: demo time confirmed - doctor should use “Send package options” after the call.
 * - closed: declined / cancelled (terminal).
 */
export function packageMeetingDoctorListBucket(meeting) {
  if (!meeting) return "closed";
  const pb = String(meeting.appointment_status || "").toLowerCase();
  if (pb === "declined" || pb === "cancelled" || pb === "canceled")
    return "closed";
  const st = String(meeting.status || "");
  if (st === PACKAGE_MEETING_STATUS.CONFIRMED) return "confirmed_demo";
  if (st === PACKAGE_MEETING_STATUS.AWAITING_DOCTOR) return "pending";
  if (
    st === PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS ||
    st === PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK
  ) {
    return "discussing";
  }
  if (pb === "approved" || pb === "scheduled") return "confirmed_demo";
  return "pending";
}

/** Terminal rows only (declined / cancelled). */
export function packageMeetingClosedLabel(meeting) {
  const pb = String(meeting?.appointment_status || "").toLowerCase();
  if (pb === "declined") return "Declined";
  if (pb === "cancelled" || pb === "canceled") return "Cancelled";
  return "Closed";
}

const PKG_MEETINGS_LOCAL_KEY = "nvhs_package_meetings_local_v1";

function isPocketBaseMissingResourceError(error) {
  const status =
    error?.status ?? error?.response?.status ?? error?.data?.status;
  const msg =
    `${formatPocketBaseClientError(error) || ""} ${error?.message || ""} ${error?.url || ""}`.toLowerCase();
  return (
    status === 404 ||
    /the requested resource wasn't found|requested resource wasn't found|not found\.|unknown collection|missing collection/i.test(
      msg,
    )
  );
}

async function readLocalPackageMeetings() {
  try {
    const raw = await AsyncStorage.getItem(PKG_MEETINGS_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalPackageMeetings(rows) {
  await AsyncStorage.setItem(
    PKG_MEETINGS_LOCAL_KEY,
    JSON.stringify(rows || []),
  );
}

async function upsertLocalMeeting(meeting) {
  const all = await readLocalPackageMeetings();
  const idx = all.findIndex((m) => m.id === meeting.id);
  const next = { ...meeting, updated_at: new Date().toISOString() };
  if (idx === -1) {
    all.unshift(next);
  } else {
    all[idx] = { ...all[idx], ...next };
  }
  await writeLocalPackageMeetings(all);
  return all[idx === -1 ? 0 : idx];
}

async function withLocalMeeting(meetingId, updater) {
  await cancelPackageMeetingReminder(meetingId);
  const all = await readLocalPackageMeetings();
  const idx = all.findIndex((m) => m.id === meetingId);
  if (idx === -1) throw new Error("Meeting not found.");
  const updated = updater({ ...all[idx] });
  const merged = {
    ...updated,
    updated_at: new Date().toISOString(),
    localOnly: true,
  };
  all[idx] = merged;
  await writeLocalPackageMeetings(all);
  await schedulePackageMeetingThirtyMinReminder(merged);
  return merged;
}

async function mergeMeetingsForUser(
  pbMeetings,
  { patientUserId, doctorUserId },
) {
  const stored = await readLocalPackageMeetings();
  const filtered = stored.filter((m) => {
    if (patientUserId && m.patient_user_id !== patientUserId) return false;
    if (doctorUserId && m.doctor_user_id !== doctorUserId) return false;
    return true;
  });
  const taggedPb = (pbMeetings || []).map((m) => ({ ...m, localOnly: false }));
  const taggedLocal = filtered.map((m) => ({ ...m, localOnly: true }));
  return [...taggedPb, ...taggedLocal].sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
  );
}

const MEETING_WF_MARKER = "\n\n---NVHS_MEETING_WORKFLOW---\n";

function expandRelId(val) {
  if (val && typeof val === "object" && val.id) return val.id;
  return val || "";
}

function buildWorkflowPayload({
  patientDescription,
  status,
  proposed_at,
  messages,
  doctor_alternate_slots,
  patient_selected_slot,
  confirmed_at,
  patientAuthUserId,
  doctorAuthUserId,
}) {
  return {
    v: 1,
    kind: "package_meeting",
    patient_description: String(patientDescription || "").trim(),
    status: status || PACKAGE_MEETING_STATUS.AWAITING_DOCTOR,
    proposed_at: proposed_at || "",
    messages: Array.isArray(messages) ? messages : [],
    doctor_alternate_slots: Array.isArray(doctor_alternate_slots)
      ? doctor_alternate_slots
      : [],
    patient_selected_slot: patient_selected_slot || null,
    confirmed_at: confirmed_at || null,
    patient_auth_user_id: String(patientAuthUserId || "").trim(),
    doctor_auth_user_id: String(doctorAuthUserId || "").trim(),
  };
}

function appointmentReasonField(row) {
  return row?.reason ?? row?.description ?? "";
}

function pbAppointmentStatusForWorkflow(workflow) {
  if (workflow?.status === PACKAGE_MEETING_STATUS.CONFIRMED) return "approved";
  return "requested";
}

function appointmentsColl() {
  return getPbAppointmentsCollection();
}

export async function resolveDoctorProfileIdForUser(doctorUserId) {
  if (!doctorUserId) return null;
  try {
    const p = await pb
      .collection("doctor_profile")
      .getFirstListItem(`user="${doctorUserId}"`, {
        requestKey: null,
      });
    return p?.id || null;
  } catch {
    return null;
  }
}

/** For `package_offers.patient` when the relation targets `patient_profile` instead of auth users. */
async function resolvePatientProfileIdForAuthUser(patientAuthUserId) {
  if (!patientAuthUserId) return null;
  try {
    const p = await pb
      .collection("patient_profile")
      .getFirstListItem(`user="${patientAuthUserId}"`, { requestKey: null });
    return p?.id || null;
  } catch {
    return null;
  }
}

async function doctorIdsForAppointmentCreate(doctorUserId, doctorProfileId) {
  const profileId =
    doctorProfileId ||
    (await resolveDoctorProfileIdForUser(doctorUserId)) ||
    null;
  const ordered = isPbAppointmentDoctorProfileRelation()
    ? [profileId, doctorUserId]
    : [doctorUserId, profileId];
  return [...new Set(ordered.filter(Boolean))];
}

async function pbListPackageAppointmentRowsForPatient(patientUserId) {
  try {
    const rows = await pb.collection(appointmentsColl()).getFullList({
      requestKey: null,
      sort: "-created",
      filter: `patient="${patientUserId}"`,
    });
    return rows.filter((r) =>
      String(appointmentReasonField(r)).includes("NVHS_MEETING_WORKFLOW"),
    );
  } catch {
    return [];
  }
}

async function pbListPackageAppointmentRowsForDoctor(doctorFilterId) {
  if (!doctorFilterId) return [];
  try {
    const rows = await pb.collection(appointmentsColl()).getFullList({
      requestKey: null,
      sort: "-created",
      filter: `doctor="${doctorFilterId}"`,
    });
    return rows.filter((r) =>
      String(appointmentReasonField(r)).includes("NVHS_MEETING_WORKFLOW"),
    );
  } catch {
    return [];
  }
}

/** Merge rows whether `appointments.doctor` points at users or doctor_profile (no app.json guess). */
async function pbListPackageAppointmentRowsForDoctorMerged(doctorUserId) {
  if (!doctorUserId) return [];
  const profileId = await resolveDoctorProfileIdForUser(doctorUserId);
  const keys = [...new Set([doctorUserId, profileId].filter(Boolean))];
  const byId = new Map();
  for (const key of keys) {
    const rows = await pbListPackageAppointmentRowsForDoctor(key);
    for (const r of rows) byId.set(r.id, r);
  }
  return Array.from(byId.values());
}

function encodeMeetingDescription(workflow) {
  const desc = String(workflow.patient_description || "").trim();
  const { patient_description: _pd, ...rest } = workflow;
  return `${desc}${MEETING_WF_MARKER}${JSON.stringify(rest)}`;
}

function decodeWorkflowFromDescription(full, fallback = {}) {
  const raw = String(full || "");
  const rowStatus = String(fallback.status || "").trim();
  const scheduledAt = fallback.scheduled_at || "";
  const idx = raw.indexOf(MEETING_WF_MARKER);
  if (idx === -1) {
    const legacyConfirmed =
      String(rowStatus || "").toLowerCase() === "scheduled" && scheduledAt;
    return {
      patient_description: raw.trim(),
      workflow: buildWorkflowPayload({
        patientDescription: raw.trim(),
        status: legacyConfirmed
          ? PACKAGE_MEETING_STATUS.CONFIRMED
          : rowStatus || PACKAGE_MEETING_STATUS.AWAITING_DOCTOR,
        proposed_at: scheduledAt,
        messages: [],
        confirmed_at: legacyConfirmed ? scheduledAt : null,
      }),
    };
  }
  const patient_description = raw.slice(0, idx).trim();
  let parsed = null;
  try {
    parsed = JSON.parse(raw.slice(idx + MEETING_WF_MARKER.length));
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      patient_description,
      workflow: buildWorkflowPayload({
        patientDescription: patient_description,
        proposed_at: scheduledAt,
      }),
    };
  }
  const merged = {
    ...buildWorkflowPayload({ patientDescription: patient_description }),
    ...parsed,
    patient_description,
  };
  return { patient_description, workflow: merged };
}

/**
 * Full meeting workflow from an `appointments` row - prefers `workflow_json`
 * over parsing `reason` only. Doctor update paths must use this (not
 * `decodeWorkflowFromDescription(reason)` alone) or patient/doctor auth ids
 * embedded in JSON can be lost when `reason` is truncated or out of sync.
 */
export function decodeMeetingWorkflowFromAppointmentRow(row) {
  if (!row) {
    return buildWorkflowPayload({ patientDescription: "" });
  }
  const reasonText = appointmentReasonField(row);
  const fromJson = row.workflow_json ?? row.meeting_workflow;
  let workflow;
  if (fromJson && typeof fromJson === "object") {
    const headDesc = String(reasonText).split(MEETING_WF_MARKER)[0].trim();
    workflow = {
      ...buildWorkflowPayload({
        patientDescription: fromJson.patient_description ?? headDesc,
      }),
      ...fromJson,
      patient_description:
        String(fromJson.patient_description ?? "").trim() || headDesc,
    };
  } else {
    const dec = decodeWorkflowFromDescription(reasonText, {
      scheduled_at: row.scheduled_at,
      status: row.status,
    });
    workflow = dec.workflow;
    workflow.patient_description = dec.patient_description;
    if (!workflow.proposed_at && row.scheduled_at) {
      workflow.proposed_at = row.scheduled_at;
    }
  }
  return workflow;
}

export function decodePackageMeetingFromPbRow(row) {
  if (!row) return null;
  const workflow = decodeMeetingWorkflowFromAppointmentRow(row);
  const patient_user_id =
    String(workflow.patient_auth_user_id || "").trim() ||
    expandRelId(row.patient);
  const doctor_user_id =
    String(workflow.doctor_auth_user_id || "").trim() ||
    expandRelId(row.doctor);
  return {
    id: row.id,
    patient_user_id,
    doctor_user_id,
    description: workflow.patient_description || "",
    proposed_at: workflow.proposed_at || row.scheduled_at || "",
    status:
      workflow.status ||
      String(row.status || "").trim() ||
      PACKAGE_MEETING_STATUS.AWAITING_DOCTOR,
    messages: workflow.messages || [],
    doctor_alternate_slots: workflow.doctor_alternate_slots || [],
    patient_selected_slot: workflow.patient_selected_slot || null,
    confirmed_at: workflow.confirmed_at || null,
    scheduled_at: row.scheduled_at || null,
    call_kind: row.consultation_type || row.call_kind || "video",
    consultation_fee: Number(row.consultation_fee ?? row.fee ?? 500) || 500,
    updated_at: row.updated || row.created || new Date().toISOString(),
    /** PocketBase `created` - ignore older package_offers from prior demos with the same doctor. */
    appointment_created: row.created ? String(row.created) : "",
    package_offer_id: String(workflow.package_offer_id || "").trim() || null,
    package_request_label:
      String(workflow.package_request_label || "").trim() || null,
    demo_conversation_id:
      String(workflow.demo_conversation_id || "").trim() || null,
    appointment_status:
      String(row.status || "")
        .trim()
        .toLowerCase() || null,
    conversation_id:
      String(workflow.demo_conversation_id || "").trim() ||
      (typeof row.conversation === "string" ? row.conversation : "") ||
      "",
  };
}

async function ensureNotifyPermission() {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return !!asked.granted;
  } catch {
    return false;
  }
}

export async function cancelPackageMeetingReminder(meetingId) {
  if (!meetingId) return;
  const id = `pkg-meeting-${meetingId}-tm30`;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // ignore
  }
}

export async function schedulePackageMeetingThirtyMinReminder(meeting) {
  if (!meeting?.id || meeting.status !== PACKAGE_MEETING_STATUS.CONFIRMED)
    return;
  const when = meeting.confirmed_at || meeting.scheduled_at;
  if (!when) return;
  const start = new Date(when);
  if (!Number.isFinite(start.getTime())) return;
  const fire = new Date(start.getTime() - 30 * 60 * 1000);
  if (fire.getTime() <= Date.now()) return;
  const ok = await ensureNotifyPermission();
  if (!ok) return;
  const nid = `pkg-meeting-${meeting.id}-tm30`;
  try {
    await Notifications.cancelScheduledNotificationAsync(nid).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: nid,
      content: {
        title: "Package meeting in 30 minutes",
        body: `Session at ${start.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`,
      },
      trigger: { type: "date", date: fire },
    });
  } catch (e) {
    console.log("schedulePackageMeetingThirtyMinReminder:", e?.message || e);
  }
}

function isTerminalPackageAppointmentMeeting(m) {
  const pb = String(m?.appointment_status || "")
    .trim()
    .toLowerCase();
  return pb === "cancelled" || pb === "canceled" || pb === "declined";
}

export async function listPackageMeetingsForPatient(patientUserId) {
  if (!patientUserId) return [];
  const rows = await pbListPackageAppointmentRowsForPatient(patientUserId);
  const out = rows.map(decodePackageMeetingFromPbRow).filter(Boolean);
  const merged = await mergeMeetingsForUser(out, {
    patientUserId,
    doctorUserId: null,
  });
  const visible = merged.filter((m) => !isTerminalPackageAppointmentMeeting(m));
  await Promise.all(
    visible.map((m) => schedulePackageMeetingThirtyMinReminder(m)),
  );
  return visible;
}

export async function listPackageMeetingsForDoctor(doctorUserId) {
  if (!doctorUserId) return [];
  const rows = await pbListPackageAppointmentRowsForDoctorMerged(doctorUserId);
  const out = rows.map(decodePackageMeetingFromPbRow).filter(Boolean);
  const merged = await mergeMeetingsForUser(out, {
    patientUserId: null,
    doctorUserId,
  });
  const profileByPatientUser = new Map();
  const uniquePatientUids = [
    ...new Set(
      (merged || [])
        .map((m) => String(m?.patient_user_id || "").trim())
        .filter(Boolean),
    ),
  ];
  await Promise.all(
    uniquePatientUids.map(async (uid) => {
      const profileId = await resolvePatientProfileIdForAuthUser(uid);
      profileByPatientUser.set(uid, profileId);
    }),
  );
  const enriched = merged
    .map((m) => ({
      ...m,
      patient_profile_id: profileByPatientUser.get(m.patient_user_id) || null,
    }))
    .filter((m) => !isTerminalPackageAppointmentMeeting(m));
  await Promise.all(
    enriched.map((m) => schedulePackageMeetingThirtyMinReminder(m)),
  );
  return enriched;
}

function pushMessage(workflow, role, text) {
  const msg = {
    at: new Date().toISOString(),
    role,
    text: String(text || "").trim(),
  };
  if (!msg.text) return workflow;
  return {
    ...workflow,
    messages: [...(workflow.messages || []), msg],
  };
}

async function pbUpdateMeetingRow(rowId, bodyAttempts) {
  let last = null;
  for (const body of bodyAttempts) {
    try {
      return await pb.collection(appointmentsColl()).update(rowId, body);
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("Update failed");
}

async function persistMeetingRow(
  rowId,
  workflow,
  displayScheduledAt,
  consultType = "video",
) {
  const encoded = encodeMeetingDescription(workflow);
  const pbSt = pbAppointmentStatusForWorkflow(workflow);
  const attempts = [
    {
      scheduled_at: displayScheduledAt,
      status: pbSt,
      reason: encoded,
      consultation_type: consultType,
      workflow_json: workflow,
    },
    {
      scheduled_at: displayScheduledAt,
      status: pbSt,
      reason: encoded,
      consultation_type: consultType,
    },
    {
      scheduled_at: displayScheduledAt,
      status: "approved",
      reason: encoded,
      consultation_type: consultType,
    },
    {
      scheduled_at: displayScheduledAt,
      status: "scheduled",
      reason: encoded,
      consultation_type: consultType,
    },
    {
      scheduled_at: displayScheduledAt,
      status: "requested",
      reason: encoded,
      consultation_type: consultType,
    },
    { scheduled_at: displayScheduledAt, status: "requested", reason: encoded },
  ];
  const row = await pbUpdateMeetingRow(rowId, attempts);
  const meeting = decodePackageMeetingFromPbRow(row);
  await schedulePackageMeetingThirtyMinReminder(meeting);
  return meeting;
}

async function attachPackageOfferToDemoAppointmentRow(
  appointmentId,
  offerRecord,
  packageRequestLabel,
) {
  const row = await pb
    .collection(appointmentsColl())
    .getOne(String(appointmentId), {
      requestKey: null,
    });
  const workflow = decodeMeetingWorkflowFromAppointmentRow(row);
  const offerId =
    typeof offerRecord?.id === "string"
      ? offerRecord.id
      : offerRecord?.id != null
        ? String(offerRecord.id)
        : "";
  const next = {
    ...workflow,
    package_offer_id: String(offerId || "").trim(),
    package_request_label: String(packageRequestLabel || "").trim(),
  };
  return persistMeetingRow(
    String(appointmentId),
    next,
    row.scheduled_at,
    row.consultation_type || "video",
  );
}

/**
 * Doctor: from an approved package-demo `appointments` row, send one catalogue slot as
 * `package_offers` and link that offer id on the appointment workflow (patient Pay button).
 */
export async function doctorSendAskPackageForDemoAppointment({
  appointmentId,
  doctorUserId,
  patientUserId,
  packageSlotIndex,
}) {
  if (!appointmentId || !doctorUserId || !patientUserId) {
    throw new Error("Missing appointment, doctor, or patient.");
  }
  const idx = Math.max(0, Math.min(2, Number(packageSlotIndex) || 0));
  const row = await pb
    .collection("doctor_profile")
    .getFirstListItem(`user="${doctorUserId}"`, {
      requestKey: null,
    });
  const base = normalizeDoctorPackageSlots(packageTemplatesRawFromRecord(row));
  const localFees = await readLocalDoctorPackageFees(doctorUserId);
  const slots = mergeLocalFeesOntoSlots(base, localFees || []);
  const slot = slots[idx];
  if (!slot)
    throw new Error("That package slot is not configured on your profile.");
  const offerRecord = await doctorSendPackageOfferFromSlot({
    patientUserId,
    doctorUserId,
    slot,
    packageSlotIndex: idx,
  });
  const label = String(slot?.name || packageSlotDisplayName(idx + 1)).trim();
  await attachPackageOfferToDemoAppointmentRow(
    appointmentId,
    offerRecord,
    label,
  );
  return normalizePackageOfferRecord(offerRecord);
}

/** Patient cancels a package demo request before it is confirmed (hidden on both sides). */
export async function patientCancelPackageDemoMeeting(meetingId) {
  if (!meetingId) throw new Error("Missing meeting.");
  if (String(meetingId).startsWith("local_")) {
    await cancelPackageMeetingReminder(meetingId);
    const all = await readLocalPackageMeetings();
    await writeLocalPackageMeetings(all.filter((m) => m.id !== meetingId));
    return true;
  }
  const coll = appointmentsColl();
  const row = await pb
    .collection(coll)
    .getOne(String(meetingId), { requestKey: null });
  const workflow = decodeMeetingWorkflowFromAppointmentRow(row);
  const encoded = encodeMeetingDescription(workflow);
  await cancelPackageMeetingReminder(meetingId);
  const attempts = [
    { status: "cancelled", reason: encoded, workflow_json: workflow },
    { status: "cancelled", reason: encoded },
    { status: "cancelled" },
  ];
  await pbUpdateMeetingRow(String(meetingId), attempts);
  return true;
}

const PACKAGE_DEMO_CHAT_KIND = "package_demo";

/**
 * One chat thread per package-demo appointment (not the generic doctor–patient DM).
 * Persists `demo_conversation_id` on the meeting workflow and sets `appointments.conversation` when allowed.
 */
export async function ensurePackageDemoMeetingConversation(meetingId) {
  if (!meetingId) throw new Error("Missing meeting.");
  if (String(meetingId).startsWith("local_")) return null;
  const coll = appointmentsColl();
  const row = await pb
    .collection(coll)
    .getOne(String(meetingId), { requestKey: null });
  const workflow = decodeMeetingWorkflowFromAppointmentRow(row);
  const existing = String(workflow.demo_conversation_id || "").trim();
  if (existing) return existing;
  const patientId =
    String(workflow.patient_auth_user_id || "").trim() ||
    expandRelId(row.patient);
  const doctorId =
    String(workflow.doctor_auth_user_id || "").trim() ||
    expandRelId(row.doctor);
  if (!patientId || !doctorId)
    throw new Error("Missing participants on this meeting.");
  const title = "Package demo";
  let conv;
  try {
    conv = await pb.collection("conversations").create({
      members: [patientId, doctorId],
      title,
      kind: PACKAGE_DEMO_CHAT_KIND,
      lastMessageAt: new Date().toISOString(),
    });
  } catch {
    conv = await pb.collection("conversations").create({
      members: [patientId, doctorId],
      title: `${title} · ${String(meetingId).slice(0, 8)}`,
      lastMessageAt: new Date().toISOString(),
    });
  }
  const convId = conv?.id;
  if (!convId) throw new Error("Could not create chat.");
  const next = { ...workflow, demo_conversation_id: convId };
  await persistMeetingRow(
    String(meetingId),
    next,
    row.scheduled_at,
    row.consultation_type || "video",
  );
  try {
    await pb
      .collection(coll)
      .update(String(meetingId), { conversation: convId });
  } catch {
    // optional relation / rules
  }
  return convId;
}

/**
 * Patient: proposed time + description → doctor must accept or propose ≥3 alternate slots.
 * Uses the same **`appointments`** collection as regular booking (`getPbAppointmentsCollection()`).
 */
export async function createPackageMeetingRequest({
  patientUserId,
  doctorUserId,
  doctorProfileId,
  proposedAtIso,
  description,
  callKind = "video",
}) {
  if (!patientUserId || !doctorUserId)
    throw new Error("Missing patient or doctor.");
  if (!proposedAtIso) throw new Error("Pick a meeting date and time.");
  const desc = String(description || "").trim();
  if (!desc)
    throw new Error(
      "Enter a short description (reason, billing context, etc.).",
    );
  const proposed = new Date(proposedAtIso);
  if (!Number.isFinite(proposed.getTime()))
    throw new Error("Invalid date/time.");
  let workflow = buildWorkflowPayload({
    patientDescription: desc,
    status: PACKAGE_MEETING_STATUS.AWAITING_DOCTOR,
    proposed_at: proposed.toISOString(),
    messages: [],
    patientAuthUserId: patientUserId,
    doctorAuthUserId: doctorUserId,
  });
  workflow = pushMessage(
    workflow,
    "patient",
    `Requested demo meeting at ${proposed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`,
  );
  const encoded = encodeMeetingDescription(workflow);
  const consult = String(callKind || "video").trim() || "video";
  const doctorCandidates = await doctorIdsForAppointmentCreate(
    doctorUserId,
    doctorProfileId,
  );
  if (!doctorCandidates.length) {
    throw new Error(
      isPbAppointmentDoctorProfileRelation()
        ? "Doctor profile id missing - cannot book (doctor relation is doctor_profile)."
        : "Doctor id missing - cannot book.",
    );
  }
  const coll = appointmentsColl();
  const variantSets = (doctorRecordId) => [
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      consultation_type: consult,
      status: "requested",
      reason: encoded,
      workflow_json: workflow,
    },
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      consultation_type: consult,
      status: "requested",
      reason: encoded,
    },
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      consultation_type: consult,
      status: "pending",
      reason: encoded,
    },
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      consultation_type: consult,
      status: "scheduled",
      reason: encoded,
    },
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      status: "requested",
      reason: encoded,
    },
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      reason: encoded,
    },
  ];
  let lastErr = null;
  outer: for (const docId of doctorCandidates) {
    for (const payload of variantSets(docId)) {
      try {
        const row = await pb.collection(coll).create(payload);
        await notifyLocal(
          "Meeting request sent",
          "Your doctor will accept the time or suggest other slots.",
        );
        return { ...decodePackageMeetingFromPbRow(row), localOnly: false };
      } catch (e) {
        lastErr = e;
        const httpStatus = e?.status ?? e?.response?.status;
        if (httpStatus === 403) {
          throw new Error(
            formatPocketBaseClientError(e) ||
              "Permission denied creating appointment - check PocketBase API rules.",
          );
        }
        if (httpStatus === 404) break outer;
        continue;
      }
    }
  }
  if (lastErr && isPocketBaseMissingResourceError(lastErr)) {
    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const nowIso = new Date().toISOString();
    const meeting = {
      id,
      patient_user_id: patientUserId,
      doctor_user_id: doctorUserId,
      description: desc,
      proposed_at: proposed.toISOString(),
      status: PACKAGE_MEETING_STATUS.AWAITING_DOCTOR,
      messages: workflow.messages,
      doctor_alternate_slots: [],
      patient_selected_slot: null,
      confirmed_at: null,
      scheduled_at: proposed.toISOString(),
      call_kind: consult,
      updated_at: nowIso,
      appointment_created: nowIso,
      localOnly: true,
    };
    await upsertLocalMeeting(meeting);
    await notifyLocal(
      "Meeting saved on device",
      "Could not reach PocketBase appointments - stored on this device only.",
    );
    return meeting;
  }
  const hint =
    formatPocketBaseClientError(lastErr) ||
    lastErr?.message ||
    `Could not create appointment in "${coll}". Check patient/doctor relations, scheduled_at, status options, consultation_type, and long text reason.`;
  throw new Error(hint);
}

/** @deprecated Use createPackageMeetingRequest with time + description */
export async function createPackageDemoBooking({
  patientUserId,
  doctorUserId,
  scheduledAtIso,
  callKind = "video",
}) {
  return createPackageMeetingRequest({
    patientUserId,
    doctorUserId,
    proposedAtIso: scheduledAtIso,
    description: "Package demo session (quick book).",
    callKind,
  });
}

export async function listPackageDemoBookings(patientUserId) {
  return listPackageMeetingsForPatient(patientUserId);
}

export async function doctorAcceptPackageMeetingInitial(meetingId) {
  if (!meetingId) throw new Error("Missing meeting.");
  if (String(meetingId).startsWith("local_")) {
    return withLocalMeeting(meetingId, (m) => {
      if (m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR) {
        throw new Error("This meeting is not waiting for your first response.");
      }
      const msgs = [
        ...(m.messages || []),
        {
          at: new Date().toISOString(),
          role: "doctor",
          text: "Accepted your proposed time. See you at the meeting.",
        },
      ];
      return {
        ...m,
        status: PACKAGE_MEETING_STATUS.CONFIRMED,
        confirmed_at: m.proposed_at,
        messages: msgs,
      };
    });
  }
  const row = await pb
    .collection(appointmentsColl())
    .getOne(meetingId, { requestKey: null });
  const m = decodePackageMeetingFromPbRow(row);
  if (m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR) {
    throw new Error("This meeting is not waiting for your first response.");
  }
  const wf = decodeMeetingWorkflowFromAppointmentRow(row);
  const proposed = m.proposed_at || row.scheduled_at;
  let next = {
    ...wf,
    status: PACKAGE_MEETING_STATUS.CONFIRMED,
    confirmed_at: proposed,
    proposed_at: proposed,
  };
  next = pushMessage(
    next,
    "doctor",
    "Accepted your proposed time. See you at the meeting.",
  );
  await cancelPackageMeetingReminder(meetingId);
  return persistMeetingRow(
    meetingId,
    next,
    proposed,
    row.consultation_type || "video",
  );
}

export async function doctorProposePackageMeetingReschedule(
  meetingId,
  alternateIsoSlots,
) {
  if (!meetingId) throw new Error("Missing meeting.");
  const slots = (alternateIsoSlots || [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const normalized = slots
    .map((s) => {
      const d = new Date(s);
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    })
    .filter(Boolean);
  if (normalized.length < 3) {
    throw new Error(
      "Choose at least three valid alternate date/times for the patient.",
    );
  }
  if (String(meetingId).startsWith("local_")) {
    return withLocalMeeting(meetingId, (m) => {
      if (
        m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR &&
        m.status !==
          PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK &&
        m.status !== PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS
      ) {
        throw new Error("Reschedule is not available for this meeting state.");
      }
      const msgs = [
        ...(m.messages || []),
        {
          at: new Date().toISOString(),
          role: "doctor",
          text: `Suggested times: ${normalized.map((x) => new Date(x).toLocaleString()).join(" · ")}`,
        },
      ];
      return {
        ...m,
        status: PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS,
        doctor_alternate_slots: normalized,
        patient_selected_slot: null,
        confirmed_at: null,
        messages: msgs,
      };
    });
  }
  const row = await pb
    .collection(appointmentsColl())
    .getOne(meetingId, { requestKey: null });
  const m = decodePackageMeetingFromPbRow(row);
  if (
    m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR &&
    m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK &&
    m.status !== PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS
  ) {
    throw new Error("Reschedule is not available for this meeting state.");
  }
  const wf = decodeMeetingWorkflowFromAppointmentRow(row);
  let next = {
    ...wf,
    status: PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS,
    doctor_alternate_slots: normalized,
    patient_selected_slot: null,
    confirmed_at: null,
  };
  next = pushMessage(
    next,
    "doctor",
    `Suggested times: ${normalized.map((x) => new Date(x).toLocaleString()).join(" · ")}`,
  );
  await cancelPackageMeetingReminder(meetingId);
  return persistMeetingRow(
    meetingId,
    next,
    normalized[0],
    row.consultation_type || "video",
  );
}

export async function patientChooseRescheduleSlot(meetingId, chosenIso) {
  if (!meetingId || !chosenIso)
    throw new Error("Pick one of the doctor’s times.");
  const pick = new Date(chosenIso);
  if (!Number.isFinite(pick.getTime())) throw new Error("Invalid time.");
  if (String(meetingId).startsWith("local_")) {
    return withLocalMeeting(meetingId, (m) => {
      if (m.status !== PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS) {
        throw new Error("The doctor has not proposed alternate slots yet.");
      }
      const allowed = (m.doctor_alternate_slots || []).some(
        (s) => Math.abs(new Date(s).getTime() - pick.getTime()) < 2000,
      );
      if (!allowed) {
        throw new Error("Pick one of the listed slots from your doctor.");
      }
      const msgs = [
        ...(m.messages || []),
        {
          at: new Date().toISOString(),
          role: "patient",
          text: `Selected ${pick.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} - please confirm.`,
        },
      ];
      return {
        ...m,
        status: PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK,
        patient_selected_slot: pick.toISOString(),
        confirmed_at: null,
        messages: msgs,
      };
    });
  }
  const row = await pb
    .collection(appointmentsColl())
    .getOne(meetingId, { requestKey: null });
  const m = decodePackageMeetingFromPbRow(row);
  if (m.status !== PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS) {
    throw new Error("The doctor has not proposed alternate slots yet.");
  }
  const allowed = (m.doctor_alternate_slots || []).some(
    (s) => Math.abs(new Date(s).getTime() - pick.getTime()) < 2000,
  );
  if (!allowed) {
    throw new Error("Pick one of the listed slots from your doctor.");
  }
  const wf = decodeMeetingWorkflowFromAppointmentRow(row);
  let next = {
    ...wf,
    status: PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK,
    patient_selected_slot: pick.toISOString(),
    confirmed_at: null,
  };
  next = pushMessage(
    next,
    "patient",
    `Selected ${pick.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} - please confirm.`,
  );
  await cancelPackageMeetingReminder(meetingId);
  return persistMeetingRow(
    meetingId,
    next,
    pick.toISOString(),
    row.consultation_type || "video",
  );
}

export async function doctorConfirmPatientRescheduleChoice(meetingId) {
  if (!meetingId) throw new Error("Missing meeting.");
  if (String(meetingId).startsWith("local_")) {
    return withLocalMeeting(meetingId, (m) => {
      if (
        m.status !==
          PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK ||
        !m.patient_selected_slot
      ) {
        throw new Error("Nothing to confirm yet.");
      }
      const when = m.patient_selected_slot;
      const msgs = [
        ...(m.messages || []),
        {
          at: new Date().toISOString(),
          role: "doctor",
          text: "Confirmed. Meeting is booked.",
        },
      ];
      return {
        ...m,
        status: PACKAGE_MEETING_STATUS.CONFIRMED,
        confirmed_at: when,
        messages: msgs,
      };
    });
  }
  const row = await pb
    .collection(appointmentsColl())
    .getOne(meetingId, { requestKey: null });
  const m = decodePackageMeetingFromPbRow(row);
  if (
    m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK ||
    !m.patient_selected_slot
  ) {
    throw new Error("Nothing to confirm yet.");
  }
  const wf = decodeMeetingWorkflowFromAppointmentRow(row);
  const when = m.patient_selected_slot;
  let next = {
    ...wf,
    status: PACKAGE_MEETING_STATUS.CONFIRMED,
    confirmed_at: when,
  };
  next = pushMessage(next, "doctor", "Confirmed. Meeting is booked.");
  await cancelPackageMeetingReminder(meetingId);
  return persistMeetingRow(
    meetingId,
    next,
    when,
    row.consultation_type || "video",
  );
}

// --- Package offers (collection: package_offers) ---
async function createPackageOfferWithRelationFallback(basePayload) {
  const patientAuthId = String(basePayload.patient || "").trim();
  const doctorAuthId = String(basePayload.doctor || "").trim();
  const patientProfileId =
    await resolvePatientProfileIdForAuthUser(patientAuthId);
  const doctorProfileId = await resolveDoctorProfileIdForUser(doctorAuthId);
  const patientIds = [
    ...new Set([patientAuthId, patientProfileId].filter(Boolean)),
  ];
  const doctorIds = [
    ...new Set([doctorAuthId, doctorProfileId].filter(Boolean)),
  ];
  const optionalKeys = [
    "package_slot",
    "treatment_type",
    "total_period",
    "description",
    "selection_source",
    "selected_by_patient",
  ];
  let lastError = null;
  for (const patient of patientIds) {
    for (const doctor of doctorIds) {
      const fullPayload = { ...basePayload, patient, doctor };
      const compactPayload = { ...fullPayload };
      for (const key of optionalKeys) delete compactPayload[key];
      for (const payload of [fullPayload, compactPayload]) {
        try {
          return await pb.collection("package_offers").create(payload);
        } catch (error) {
          lastError = error;
        }
      }
    }
  }
  throw lastError || new Error("Could not create package offer.");
}

async function assertPackageDoctorEligible(doctorUserId) {
  const uid = String(doctorUserId || "").trim();
  if (!uid) throw new Error("Missing package doctor.");
  try {
    const profile = await pb
      .collection("doctor_profile")
      .getFirstListItem(`user="${uid}"`, { requestKey: null });
    const tier =
      profile?.practitioner_tier ||
      profile?.tier ||
      profile?.doctor_class ||
      profile?.verification_tier ||
      "";
    if (
      !doctorTierEligibleForPackageMode(tier) ||
      doctorTierEligibleForQuickService(profile)
    ) {
      throw new Error(
        "Package mode is only for professional or specialist doctors.",
      );
    }
    return profile;
  } catch (error) {
    if (error?.message?.includes("Package mode")) throw error;
    throw new Error(
      "Choose an eligible professional or specialist package doctor.",
    );
  }
}

export async function doctorSendPackageOffer({
  patientUserId,
  doctorUserId,
  title = "Care package",
  amountInr = 8000,
  platformFeeInr = 2000,
  doctorCoins = 6000,
  sessions = 6,
  validityDays = 90,
  notes = "",
  package_slot = null,
  treatment_type = "",
  total_period = "",
  description_for_patient = "",
}) {
  await assertPackageDoctorEligible(doctorUserId);
  const payload = {
    patient: patientUserId,
    doctor: doctorUserId,
    title,
    amount_inr: amountInr,
    platform_fee_inr: platformFeeInr,
    doctor_coins: doctorCoins,
    sessions,
    validity_days: validityDays,
    notes: String(notes || ""),
    status: "sent",
  };
  if (package_slot != null) payload.package_slot = package_slot;
  if (treatment_type) payload.treatment_type = treatment_type;
  if (total_period) payload.total_period = total_period;
  if (description_for_patient) payload.description = description_for_patient;
  try {
    const row = await createPackageOfferWithRelationFallback(payload);
    await notifyLocal(
      "Package options sent",
      `${title} - the patient can open Package Doctor → Package offers and tap Pay now.`,
    );
    return row;
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Could not send offer. Add `package_offers` in PocketBase with patient, doctor, title, amount_inr, platform_fee_inr, doctor_coins, sessions, validity_days, notes, status.",
    );
  }
}

/** Send offer using one of the doctor’s three configured catalogue slots (after optional edits). */
export async function doctorSendPackageOfferFromSlot({
  patientUserId,
  doctorUserId,
  slot,
  packageSlotIndex,
}) {
  const amountInr = resolvePackageSlotAmountInr(slot);
  if (!amountInr) throw new Error("Package amount must be greater than zero.");
  const { platformFeeInr, doctorCoins } = splitPackagePayment(amountInr);
  const tierSlot = Number(slot?.slot);
  const title = String(
    slot?.name ||
      `${packageSlotDisplayName(Number.isFinite(tierSlot) ? tierSlot : packageSlotIndex)} — Care package`,
  ).trim();
  const desc = String(slot?.description || "").trim();
  const treatment = String(slot?.treatment_type || "").trim();
  const period = String(slot?.total_period || "").trim();
  const notes = [
    desc,
    treatment ? `Treatment type: ${treatment}` : "",
    period ? `Total period: ${period}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return doctorSendPackageOffer({
    patientUserId,
    doctorUserId,
    title,
    amountInr,
    platformFeeInr,
    doctorCoins,
    sessions: 6,
    validityDays: 90,
    notes,
    package_slot: packageSlotIndex,
    treatment_type: treatment,
    total_period: period,
    description_for_patient: desc,
  });
}

export async function createPatientSelectedPackageOffer({
  patientUserId,
  doctorUserId,
  slot,
  packageSlotIndex,
}) {
  if (!patientUserId || !doctorUserId) {
    throw new Error("Select a doctor before paying for a package.");
  }
  await assertPackageDoctorEligible(doctorUserId);
  const amountInr = resolvePackageSlotAmountInr(slot);
  const { platformFeeInr, doctorCoins } = splitPackagePayment(amountInr);
  const slotNum = Number(slot?.slot || packageSlotIndex || 1) || 1;
  const title = String(
    slot?.name || `${packageSlotDisplayName(slotNum)} — Care package`,
  ).trim();
  const desc = String(slot?.description || "").trim();
  const treatment = String(slot?.treatment_type || "").trim();
  const period = String(slot?.total_period || "").trim();
  const notes = [
    desc,
    treatment ? `Treatment type: ${treatment}` : "",
    period ? `Total period: ${period}` : "",
    packageSlotUsesDefaultAmount(slot)
      ? `Default package amount applied: ₹${amountInr}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const payload = {
    patient: patientUserId,
    doctor: doctorUserId,
    title,
    amount_inr: amountInr,
    platform_fee_inr: platformFeeInr,
    doctor_coins: doctorCoins,
    sessions: 6,
    validity_days: 90,
    notes,
    status: "sent",
    package_slot: slotNum,
    selection_source: "patient_package_mode",
    selected_by_patient: true,
  };
  if (treatment) payload.treatment_type = treatment;
  if (period) payload.total_period = period;
  if (desc) payload.description = desc;
  try {
    const row = await createPackageOfferWithRelationFallback(payload);
    await notifyLocal(
      "Package selected",
      `${title} is ready for payment. Amount: ₹${amountInr}.`,
    );
    return normalizePackageOfferRecord(row);
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Could not prepare package payment. Add `package_offers` create rules for patients selecting a package.",
    );
  }
}

/** Relation id whether PB expanded the field or stored a plain id string. */
const relationId = (val) => {
  if (Array.isArray(val)) return relationId(val[0]);
  if (val && typeof val === "object" && val.id) return String(val.id);
  if (val == null) return "";
  return String(val).trim();
};

/**
 * Strip the embedded `---NVHS_MEETING_WORKFLOW---` JSON block from an
 * appointment `reason` field so the doctor's Upcoming Appointments card
 * shows just the patient's free-text description.
 */
export function cleanAppointmentReasonForDisplay(reason) {
  const raw = String(reason || "");
  if (!raw) return "";
  const idx = raw.indexOf("---NVHS_MEETING_WORKFLOW---");
  return (idx >= 0 ? raw.slice(0, idx) : raw).trim();
}

/** Resolve the auth user id behind a `patient_profile`/`doctor_profile` relation id. */
async function resolveAuthUserIdForRelationId(
  profileCollection,
  relationIdValue,
) {
  if (!relationIdValue) return null;
  try {
    const rec = await pb.collection(profileCollection).getOne(relationIdValue, {
      requestKey: null,
    });
    return rec?.user || null;
  } catch {
    return null;
  }
}

/** Plain object for UI - avoids RecordModel quirks in React state. */
function normalizePackageOfferRecord(r) {
  if (!r) return null;
  const src = typeof r.toJSON === "function" ? r.toJSON() : { ...r };
  return {
    id: src.id,
    title: src.title ?? "",
    amount_inr: src.amount_inr ?? src.amountInr,
    platform_fee_inr: src.platform_fee_inr ?? src.platformFeeInr,
    doctor_coins: src.doctor_coins ?? src.doctorCoins,
    sessions: src.sessions,
    validity_days: src.validity_days ?? src.validityDays,
    package_slot: src.package_slot ?? src.packageSlot ?? null,
    treatment_type: src.treatment_type ?? src.treatmentType ?? "",
    total_period: src.total_period ?? src.totalPeriod ?? "",
    notes: src.notes ?? "",
    description: src.description ?? "",
    status: src.status ?? "sent",
    patient: relationId(src.patient),
    doctor: relationId(src.doctor),
    patient_user_id: "",
    doctor_user_id: "",
    created: src.created || src.updated || "",
    deal_started_at: src.deal_started_at || src.dealStartedAt || "",
  };
}

/**
 * Many PocketBase set-ups relate `package_offers.patient` to `patient_profile`
 * (and `doctor` to `doctor_profile`). UI matches against auth user ids - this
 * helper enriches each offer with `patient_user_id` / `doctor_user_id` so
 * downstream code can ignore the schema variant.
 */
async function enrichOffersWithAuthUserIds(offers) {
  const list = Array.isArray(offers) ? offers : [];
  const uniquePatients = [
    ...new Set(list.map((o) => o.patient).filter(Boolean)),
  ];
  const uniqueDoctors = [...new Set(list.map((o) => o.doctor).filter(Boolean))];
  const patientCache = new Map();
  const doctorCache = new Map();
  await Promise.all([
    ...uniquePatients.map(async (id) => {
      const fromProfile = await resolveAuthUserIdForRelationId(
        "patient_profile",
        id,
      );
      patientCache.set(id, fromProfile || id);
    }),
    ...uniqueDoctors.map(async (id) => {
      const fromProfile = await resolveAuthUserIdForRelationId(
        "doctor_profile",
        id,
      );
      doctorCache.set(id, fromProfile || id);
    }),
  ]);
  return list.map((o) => ({
    ...o,
    patient_user_id: patientCache.get(o.patient) || o.patient,
    doctor_user_id: doctorCache.get(o.doctor) || o.doctor,
  }));
}

/**
 * List package offers for the signed-in patient. PocketBase often relates
 * `package_offers.patient` → `patient_profile` while the app passes auth user
 * ids - query both ids and merge (dedupe by offer id).
 */
export async function listPackageOffersForPatient(
  patientAuthUserId,
  patientProfileIdHint = null,
) {
  if (!patientAuthUserId && !patientProfileIdHint) return [];
  const resolvedProfile =
    patientProfileIdHint ||
    (patientAuthUserId
      ? await resolvePatientProfileIdForAuthUser(patientAuthUserId)
      : null);
  const tryIds = [
    ...new Set(
      [patientAuthUserId, resolvedProfile].filter(Boolean).map(String),
    ),
  ];
  const partialMaps = await Promise.all(
    tryIds.map(async (id) => {
      const local = new Map();
      try {
        const rows = await pb.collection("package_offers").getFullList({
          requestKey: null,
          sort: "-created",
          filter: `patient="${id}"`,
        });
        console.log(
          `listPackageOffersForPatient: filter patient="${id}" → ${rows?.length || 0} row(s)`,
        );
        for (const r of rows || []) {
          const n = normalizePackageOfferRecord(r);
          if (n?.id) local.set(n.id, n);
        }
      } catch (error) {
        console.log(
          "listPackageOffersForPatient:",
          id,
          formatPocketBaseClientError(error) || error?.message || error,
        );
      }
      return local;
    }),
  );
  const byId = new Map();
  for (const local of partialMaps) {
    for (const [k, v] of local) {
      byId.set(k, v);
    }
  }
  const enriched = await enrichOffersWithAuthUserIds(Array.from(byId.values()));
  return enriched.sort((a, b) =>
    String(b.created || "").localeCompare(String(a.created || "")),
  );
}

/** Offers this doctor created - `doctor` may point at `users` or `doctor_profile`. */
export async function listPackageOffersForDoctor(doctorUserId) {
  if (!doctorUserId) return [];
  const profileId = await resolveDoctorProfileIdForUser(doctorUserId);
  const tryIds = [
    ...new Set([doctorUserId, profileId].filter(Boolean).map(String)),
  ];
  const partialMaps = await Promise.all(
    tryIds.map(async (id) => {
      const local = new Map();
      try {
        const rows = await pb.collection("package_offers").getFullList({
          requestKey: null,
          sort: "-created",
          filter: `doctor="${id}"`,
        });
        console.log(
          `listPackageOffersForDoctor: filter doctor="${id}" → ${rows?.length || 0} row(s)`,
        );
        for (const r of rows || []) {
          const n = normalizePackageOfferRecord(r);
          if (n?.id) local.set(n.id, n);
        }
      } catch (error) {
        console.log(
          "listPackageOffersForDoctor:",
          id,
          formatPocketBaseClientError(error) || error?.message || error,
        );
      }
      return local;
    }),
  );
  const byId = new Map();
  for (const local of partialMaps) {
    for (const [k, v] of local) {
      byId.set(k, v);
    }
  }
  const enriched = await enrichOffersWithAuthUserIds(Array.from(byId.values()));
  return enriched.sort((a, b) =>
    String(b.created || "").localeCompare(String(a.created || "")),
  );
}

function isActivePaidPackageOffer(offer) {
  const status = String(offer?.status || "")
    .trim()
    .toLowerCase();
  return (
    status === "paid" ||
    status === "active" ||
    status === "started" ||
    status === "completed" ||
    status === "complete" ||
    status === "confirmed"
  );
}

function normalizeActivePackagePair(offer) {
  if (!offer) return null;
  return {
    id: offer.id,
    offerId: offer.id,
    title: offer.title || "Care package",
    amount_inr: Number(offer.amount_inr ?? 0) || 0,
    platform_fee_inr: Number(offer.platform_fee_inr ?? 0) || 0,
    doctor_coins: Number(offer.doctor_coins ?? 0) || 0,
    sessions: Number(offer.sessions) || 0,
    validity_days: Number(offer.validity_days) || 0,
    package_slot: offer.package_slot ?? null,
    patient_user_id: offer.patient_user_id || offer.patient || "",
    doctor_user_id: offer.doctor_user_id || offer.doctor || "",
    status: offer.status || "paid",
    started_at: offer.deal_started_at || offer.created || "",
    created: offer.created || "",
  };
}

export async function listActivePackagePairsForPatient(
  patientAuthUserId,
  patientProfileIdHint = null,
) {
  const offers = await listPackageOffersForPatient(
    patientAuthUserId,
    patientProfileIdHint,
  );
  const fromOffers = offers
    .filter(isActivePaidPackageOffer)
    .map(normalizeActivePackagePair)
    .filter(Boolean);

  const resolvedProfile =
    patientProfileIdHint ||
    (patientAuthUserId
      ? await resolvePatientProfileIdForAuthUser(patientAuthUserId)
      : null);
  const patientIds = [
    ...new Set(
      [patientAuthUserId, resolvedProfile].filter(Boolean).map(String),
    ),
  ];
  let pairRows = [];
  try {
    const partials = await Promise.all(
      patientIds.map(async (id) => {
        try {
          return await pb.collection("patient_doctor_packages").getFullList({
            requestKey: null,
            sort: "-started_at,-created",
            filter: `patient="${id}" && status="active"`,
          });
        } catch {
          return [];
        }
      }),
    );
    pairRows = partials.flat();
  } catch {
    pairRows = [];
  }

  const fromPackageRows = await Promise.all(
    (pairRows || []).map(async (row) => {
      const patient = relationId(row.patient);
      const doctor = relationId(row.doctor);
      const offerId = relationId(row.package_offer);
      const patientUserId =
        (await resolveAuthUserIdForRelationId("patient_profile", patient)) ||
        patient;
      const doctorUserId =
        (await resolveAuthUserIdForRelationId("doctor_profile", doctor)) ||
        doctor;
      return {
        id: row.id,
        offerId: offerId || row.id,
        title: row.title || "Care package",
        amount_inr: Number(row.amount_inr ?? 0) || 0,
        platform_fee_inr: Number(row.platform_fee_inr ?? 0) || 0,
        doctor_coins:
          Number(row.doctor_pool_coins ?? row.doctor_coins ?? 0) || 0,
        remaining_coins:
          Number(row.remaining_coins ?? row.amount_inr ?? 0) || 0,
        sessions: Number(row.sessions) || 0,
        validity_days: Number(row.validity_days) || 0,
        package_slot: row.package_slot ?? null,
        patient_user_id: patientUserId,
        doctor_user_id: doctorUserId,
        status: row.status || "active",
        started_at: row.started_at || row.created || "",
        created: row.created || "",
      };
    }),
  );

  const byKey = new Map();
  for (const pair of fromOffers) {
    byKey.set(pair.offerId || pair.id, pair);
  }
  for (const pair of fromPackageRows) {
    const key = pair.offerId || pair.id;
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, ...pair } : pair);
  }
  return Array.from(byKey.values()).sort((a, b) =>
    String(b.started_at || b.created || "").localeCompare(
      String(a.started_at || a.created || ""),
    ),
  );
}

export async function listActivePackagePairsForDoctor(doctorUserId) {
  const uid = String(doctorUserId || "").trim();
  const offers = await listPackageOffersForDoctor(uid);
  const fromOffers = offers
    .filter(isActivePaidPackageOffer)
    .map(normalizeActivePackagePair)
    .filter(Boolean);

  const doctorProfileId = uid ? await resolveDoctorProfileIdForUser(uid) : null;
  const doctorIds = [...new Set([uid, doctorProfileId].filter(Boolean))];
  let pairRows = [];
  try {
    const partials = await Promise.all(
      doctorIds.map(async (id) => {
        try {
          return await pb.collection("patient_doctor_packages").getFullList({
            requestKey: null,
            sort: "-started_at,-created",
            filter: `doctor="${id}" && status="active"`,
          });
        } catch {
          return [];
        }
      }),
    );
    pairRows = partials.flat();
  } catch {
    pairRows = [];
  }

  const fromPackageRows = await Promise.all(
    (pairRows || []).map(async (row) => {
      const patient = relationId(row.patient);
      const doctor = relationId(row.doctor);
      const offerId = relationId(row.package_offer);
      const patientUserId =
        (await resolveAuthUserIdForRelationId("patient_profile", patient)) ||
        patient;
      const doctorUserId =
        (await resolveAuthUserIdForRelationId("doctor_profile", doctor)) ||
        doctor;
      return {
        id: row.id,
        offerId: offerId || row.id,
        title: row.title || "Care package",
        amount_inr: Number(row.amount_inr ?? 0) || 0,
        platform_fee_inr: Number(row.platform_fee_inr ?? 0) || 0,
        doctor_coins:
          Number(row.doctor_pool_coins ?? row.doctor_coins ?? 0) || 0,
        remaining_coins:
          Number(row.remaining_coins ?? row.amount_inr ?? 0) || 0,
        sessions: Number(row.sessions) || 0,
        validity_days: Number(row.validity_days) || 0,
        package_slot: row.package_slot ?? null,
        patient_user_id: patientUserId,
        doctor_user_id: doctorUserId,
        status: row.status || "active",
        started_at: row.started_at || row.created || "",
        created: row.created || "",
      };
    }),
  );

  const byKey = new Map();
  for (const pair of fromOffers) byKey.set(pair.offerId || pair.id, pair);
  for (const pair of fromPackageRows) {
    const key = pair.offerId || pair.id;
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, ...pair } : pair);
  }
  return Array.from(byKey.values()).sort((a, b) =>
    String(b.started_at || b.created || "").localeCompare(
      String(a.started_at || a.created || ""),
    ),
  );
}

async function findActivePackageOfferForPair({
  patientUserId,
  doctorUserId,
  offerId = "",
}) {
  const patient = String(patientUserId || "").trim();
  const doctor = String(doctorUserId || "").trim();
  if (offerId) {
    try {
      const raw = await pb
        .collection("package_offers")
        .getOne(String(offerId), {
          requestKey: null,
        });
      const [offer] = await enrichOffersWithAuthUserIds([
        normalizePackageOfferRecord(raw),
      ]);
      if (
        offer &&
        isActivePaidPackageOffer(offer) &&
        (!patient || offer.patient_user_id === patient) &&
        (!doctor || offer.doctor_user_id === doctor)
      ) {
        return offer;
      }
    } catch {
      // fall through to pair lookup
    }
  }
  if (!patient || !doctor) return null;
  const offers = await listPackageOffersForPatient(patient);
  return (
    offers.find(
      (offer) =>
        isActivePaidPackageOffer(offer) && offer.doctor_user_id === doctor,
    ) || null
  );
}

async function persistActivePackagePair({
  offer,
  offerId,
  patientUserId,
  doctorUserId,
  amountInr,
  platformFeeInr,
  packageCoins,
  startedAt,
}) {
  if (!offerId || !patientUserId || !doctorUserId) return null;
  const base = {
    patient: patientUserId,
    doctor: doctorUserId,
    package_offer: offerId,
    status: "active",
    started_at: startedAt,
    amount_inr: amountInr,
    platform_fee_inr: platformFeeInr,
    doctor_pool_coins: packageCoins,
    remaining_coins: amountInr,
    title: offer?.title || "Care package",
  };
  if (offer?.package_slot != null) base.package_slot = offer.package_slot;
  try {
    const existing = await pb
      .collection("patient_doctor_packages")
      .getFirstListItem(`package_offer="${offerId}"`, { requestKey: null });
    return await pb
      .collection("patient_doctor_packages")
      .update(existing.id, base);
  } catch (lookupError) {
    if (lookupError?.status && lookupError.status !== 404) return null;
  }
  const compact = { ...base };
  delete compact.remaining_coins;
  delete compact.package_slot;
  delete compact.title;
  for (const payload of [base, compact]) {
    try {
      return await pb.collection("patient_doctor_packages").create(payload);
    } catch {
      // optional collection / fields
    }
  }
  return null;
}

export async function completePackageOfferPayment(
  offerId,
  doctorUserId,
  payment = {},
) {
  if (!offerId) throw new Error("Missing offer.");
  let offer = null;
  try {
    offer = await pb.collection("package_offers").getOne(offerId, {
      requestKey: null,
    });
  } catch {
    offer = null;
  }
  const paidPayload = {
    status: "paid",
    deal_started_at: new Date().toISOString(),
  };
  try {
    await pb.collection("package_offers").update(offerId, paidPayload);
  } catch (error) {
    try {
      await pb.collection("package_offers").update(offerId, { status: "paid" });
    } catch (e2) {
      const msg =
        formatPocketBaseClientError(error) || formatPocketBaseClientError(e2);
      throw new Error(msg || "Payment update failed.");
    }
  }
  const patientUserId = String(
    payment.patientUserId || getAuthUser()?.id || "",
  ).trim();
  const effectiveDoctorUserId = String(
    doctorUserId || payment.doctorUserId || offer?.doctor || "",
  ).trim();
  try {
    await recordPaymentTransaction({
      patientUserId,
      doctorUserId: effectiveDoctorUserId,
      sourceCollection: "package_offers",
      sourceId: offerId,
      kind: "package_offer",
      provider: payment.provider || "stub",
      providerOrderId: payment.providerOrderId,
      providerPaymentId: payment.providerPaymentId,
      providerReferenceId: payment.providerReferenceId,
      amountInr: offer?.amount_inr ?? offer?.amountInr ?? payment.amountInr,
      currency: payment.currency || "INR",
      status: "success",
      description: offer?.title || "Package offer payment",
      customerName: payment.customerName,
      customerEmail: payment.customerEmail,
      customerPhone: payment.customerPhone,
      metadata: {
        package_offer_id: offerId,
        payment_mode: payment.paymentMode || payment.provider || "stub",
        platform_fee_inr:
          offer?.platform_fee_inr ?? offer?.platformFeeInr ?? null,
        doctor_coins: offer?.doctor_coins ?? offer?.doctorCoins ?? null,
        patient_package_coins:
          offer?.amount_inr ?? offer?.amountInr ?? payment.amountInr ?? null,
        currency_quote: payment.currencyQuote || null,
        verified: payment.verified || null,
      },
    });
  } catch (e) {
    console.log(
      "completePackageOfferPayment payment_transactions:",
      e?.message,
    );
  }
  const amountInr = Number(
    offer?.amount_inr ?? offer?.amountInr ?? payment.amountInr ?? 0,
  );
  if (!Number.isFinite(amountInr) || amountInr <= 0) {
    throw new Error("Package amount missing; coins cannot be loaded.");
  }
  const split = splitPackagePayment(amountInr);
  const platformFeeInr = Number(
    offer?.platform_fee_inr ?? offer?.platformFeeInr ?? split.platformFeeInr,
  );
  const doctorPoolCoins = Number(
    offer?.doctor_coins ?? offer?.doctorCoins ?? split.doctorCoins,
  );
  const ts = new Date().toISOString();
  let existingTopups = [];
  try {
    existingTopups = await pb.collection("coin_ledger").getFullList({
      requestKey: null,
      filter: `user="${patientUserId}" && ref_collection="package_offers" && ref_id="${offerId}" && reason="package_patient_coins_loaded"`,
    });
  } catch {
    existingTopups = [];
  }
  const lines = [
    patientUserId &&
      existingTopups.length === 0 && {
        user: patientUserId,
        delta: amountInr,
        reason: "package_patient_coins_loaded",
        ref_collection: "package_offers",
        ref_id: offerId,
        meta: {
          wallet: "package",
          wallet_mode: "package",
          package_offer_id: offerId,
          paid_amount_inr: amountInr,
          platform_fee_inr: platformFeeInr,
          doctor_pool_coins: doctorPoolCoins,
          patient_package_coins: amountInr,
          paid_at: ts,
          paired_doctor_user_id: effectiveDoctorUserId,
        },
      },
    {
      user: effectiveDoctorUserId,
      delta: 0,
      reason: "package_payment_received_company_holds_full_amount",
      ref_collection: "package_offers",
      ref_id: offerId,
      meta: { paid_at: ts, patient_user_id: patientUserId },
    },
    {
      user: effectiveDoctorUserId,
      delta: 0,
      reason: "doctor_coins_pending_until_package_fulfilled",
      ref_collection: "package_offers",
      ref_id: offerId,
      meta: { paid_at: ts, patient_user_id: patientUserId },
    },
  ];
  for (const line of lines) {
    if (!line) continue;
    try {
      await createCoinLedgerLine(line);
    } catch (error) {
      if (line.reason === "package_patient_coins_loaded") {
        const msg = formatPocketBaseClientError(error) || error?.message;
        throw new Error(
          msg || "Payment succeeded, but package coins could not be loaded.",
        );
      }
      // doctor-side zero-value audit lines are optional
    }
  }
  await persistActivePackagePair({
    offer,
    offerId,
    patientUserId,
    doctorUserId: effectiveDoctorUserId,
    amountInr,
    platformFeeInr,
    packageCoins: doctorPoolCoins,
    startedAt: paidPayload.deal_started_at,
  });
  await notifyLocal(
    "Payment successful",
    "Your package deal is now active. The doctor will deliver sessions per the agreed plan.",
  );
  return true;
}

/** Stub payment fallback for QA builds; Cashfree callers use `completePackageOfferPayment`. */
export async function patientPayPackageOfferStub(offerId, doctorUserId) {
  return completePackageOfferPayment(offerId, doctorUserId, {
    provider: "stub",
  });
}

async function createCoinLedgerLine(payload) {
  const meta =
    payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  const base = {
    user: payload.user,
    delta: Number(payload.delta || 0),
    reason: String(payload.reason || "").trim(),
    ref_collection: String(payload.ref_collection || "").trim(),
    ref_id: String(payload.ref_id || "").trim(),
  };
  try {
    return await pb.collection("coin_ledger").create({ ...base, meta });
  } catch (error) {
    return await pb.collection("coin_ledger").create({
      ...base,
      meta: JSON.stringify(meta),
    });
  }
}

function parseCoinLedgerMeta(row) {
  const meta = row?.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) return meta;
  if (typeof meta === "string" && meta.trim()) {
    try {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

const PATIENT_PACKAGE_LEDGER_REASONS = new Set([
  "package_patient_coins_loaded",
  "package_patient_coins_adjusted_to_paid_amount",
  "package_session_patient_spent",
]);

function coinLedgerRowPackageOfferId(row, meta = parseCoinLedgerMeta(row)) {
  return String(
    meta.package_offer_id ||
      meta.offer_id ||
      (String(row?.ref_collection || "") === "package_offers"
        ? row?.ref_id
        : "") ||
      "",
  ).trim();
}

function isPatientPackageCoinLedgerRow(row) {
  const reason = String(row?.reason || "").trim();
  const meta = parseCoinLedgerMeta(row);
  const wallet = String(
    meta.wallet || meta.wallet_mode || meta.coin_wallet || "",
  )
    .trim()
    .toLowerCase();
  if (wallet === "package") return true;
  if (PATIENT_PACKAGE_LEDGER_REASONS.has(reason)) return true;
  return (
    String(row?.ref_collection || "") === "package_offers" &&
    reason.startsWith("package_")
  );
}

export async function getCoinBalanceForUser(userId) {
  const rows = await listCoinLedgerForUser(userId);
  return rows.reduce((sum, row) => sum + (Number(row.delta) || 0), 0);
}

export async function getPatientCasualCoinBalance(userId) {
  const rows = await listCoinLedgerForUser(userId);
  return rows.reduce((sum, row) => {
    if (isPatientPackageCoinLedgerRow(row)) return sum;
    return sum + (Number(row.delta) || 0);
  }, 0);
}

export async function getPatientPackageCoinBalance(
  userId,
  packageOfferId = "",
) {
  const offerId = String(packageOfferId || "").trim();
  const rows = await listCoinLedgerForUser(userId);
  return rows.reduce((sum, row) => {
    if (!isPatientPackageCoinLedgerRow(row)) return sum;
    const meta = parseCoinLedgerMeta(row);
    if (offerId && coinLedgerRowPackageOfferId(row, meta) !== offerId) {
      return sum;
    }
    return sum + (Number(row.delta) || 0);
  }, 0);
}

async function assertPatientHasCasualCoins(userId, coins) {
  const balance = await getPatientCasualCoinBalance(userId);
  if (balance < coins) {
    throw new Error(
      `Not enough casual coins. Available: ${balance}, required: ${coins}.`,
    );
  }
  return balance;
}

async function assertPatientHasPackageCoins(
  userId,
  coins,
  packageOfferId = "",
) {
  const balance = await getPatientPackageCoinBalance(userId, packageOfferId);
  if (balance < coins) {
    throw new Error(
      `Not enough package coins. Available: ${balance}, required: ${coins}.`,
    );
  }
  return balance;
}

export async function recordTrialCoinTopup({
  patientUserId,
  amountInr = 50,
  provider = "cashfree",
  providerOrderId,
  providerPaymentId,
  providerReferenceId,
} = {}) {
  const userId = String(patientUserId || getAuthUser()?.id || "").trim();
  const amount = Math.floor(Number(amountInr));
  if (!userId) throw new Error("Sign in required.");
  if (
    !Number.isFinite(amount) ||
    amount < WALLET_TOPUP_MIN_INR ||
    amount > WALLET_TOPUP_MAX_INR
  ) {
    throw new Error(
      `Top up between ₹${WALLET_TOPUP_MIN_INR} and ₹${WALLET_TOPUP_MAX_INR}.`,
    );
  }
  await recordPaymentTransaction({
    patientUserId: userId,
    sourceCollection: "coin_ledger",
    sourceId: userId,
    kind: "trial_coin_topup",
    provider,
    providerOrderId,
    providerPaymentId,
    providerReferenceId,
    amountInr: amount,
    currency: "INR",
    status: "success",
    description: "Trial coin pack",
  });
  return createCoinLedgerLine({
    user: userId,
    delta: amount,
    reason: "trial_coins_loaded",
    ref_collection: "payment_transactions",
    ref_id: providerOrderId || providerPaymentId || providerReferenceId || "",
    meta: {
      wallet: "casual",
      wallet_mode: "casual",
      provider,
      amount_inr: amount,
    },
  });
}

/** Wallet top-up (1 coin = ₹1): caller verifies payment, then ledger is credited. */
export async function recordPatientWalletDeposit({
  patientUserId,
  amountInr,
  provider = "cashfree",
  providerOrderId,
  providerPaymentId,
  providerReferenceId,
  meta = {},
} = {}) {
  const userId = String(patientUserId || getAuthUser()?.id || "").trim();
  const amount = Math.floor(Number(amountInr));
  if (!userId) throw new Error("Sign in required.");
  if (
    !Number.isFinite(amount) ||
    amount < WALLET_TOPUP_MIN_INR ||
    amount > WALLET_TOPUP_MAX_INR
  ) {
    throw new Error(
      `Enter a whole number from ₹${WALLET_TOPUP_MIN_INR} to ₹${WALLET_TOPUP_MAX_INR}.`,
    );
  }
  const paymentProvider = String(provider || "cashfree")
    .trim()
    .toLowerCase();
  const refId = String(
    providerOrderId ||
      providerPaymentId ||
      providerReferenceId ||
      `wd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  ).trim();
  const reason =
    paymentProvider === "stub" ? "wallet_deposit_stub" : "wallet_deposit";
  if (refId) {
    try {
      const existing = await pb.collection("coin_ledger").getFullList({
        requestKey: null,
        filter: `user="${userId}" && ref_collection="wallet_deposit" && ref_id="${refId}" && reason="${reason}"`,
      });
      if (existing.length > 0) return getPatientCasualCoinBalance(userId);
    } catch {
      // coin_ledger errors surface on create below
    }
  }
  try {
    await recordPaymentTransaction({
      patientUserId: userId,
      sourceCollection: "wallet_deposit",
      sourceId: refId,
      kind:
        paymentProvider === "stub" ? "wallet_deposit_stub" : "wallet_deposit",
      provider: paymentProvider,
      providerOrderId: providerOrderId || refId,
      providerPaymentId,
      providerReferenceId,
      amountInr: amount,
      currency: "INR",
      status: "success",
      description: `Wallet deposit: ${amount} coins`,
      metadata: {
        wallet: "casual",
        wallet_mode: "casual",
        amount_inr: amount,
        coins: amount,
        ...meta,
      },
    });
  } catch (e) {
    console.log("recordPatientWalletDeposit payment_transactions:", e?.message);
  }
  await createCoinLedgerLine({
    user: userId,
    delta: amount,
    reason,
    ref_collection: "wallet_deposit",
    ref_id: refId,
    meta: {
      wallet: "casual",
      wallet_mode: "casual",
      provider: paymentProvider,
      provider_order_id: providerOrderId || "",
      provider_payment_id: providerPaymentId || "",
      provider_reference_id: providerReferenceId || "",
      amount_inr: amount,
      coins: amount,
      at: new Date().toISOString(),
      ...meta,
    },
  });
  return getPatientCasualCoinBalance(userId);
}

export async function recordPatientWalletDepositStub(patientUserId, amountInr) {
  return recordPatientWalletDeposit({
    patientUserId,
    amountInr,
    provider: "stub",
  });
}

export async function recordCasualAppointmentWalletPayment({
  patientUserId,
  doctorUserId,
  appointmentId,
  amountInr,
  consultationType = "video",
  description = "Doctor appointment",
} = {}) {
  const patient = String(patientUserId || getAuthUser()?.id || "").trim();
  const doctor = String(doctorUserId || "").trim();
  const apptId = String(appointmentId || "").trim();
  const amount = Math.max(0, Math.floor(Number(amountInr) || 0));
  if (!patient || !doctor || !apptId) {
    throw new Error("Missing appointment payment details.");
  }
  if (amount <= 0) throw new Error("Appointment fee missing.");

  let existingRows = [];
  try {
    existingRows = await pb.collection("coin_ledger").getFullList({
      requestKey: null,
      filter: `ref_collection="${getPbAppointmentsCollection()}" && ref_id="${apptId}" && reason="appointment_patient_spent"`,
    });
  } catch {
    // The balance assertion/write below will surface schema issues.
  }
  if ((existingRows || []).length > 0) {
    return { paid: true, alreadyPaid: true, amountInr: amount };
  }

  await assertPatientHasCasualCoins(patient, amount);

  try {
    await recordPaymentTransaction({
      patientUserId: patient,
      doctorUserId: doctor,
      sourceCollection: getPbAppointmentsCollection(),
      sourceId: apptId,
      kind: "appointment",
      provider: "wallet",
      amountInr: amount,
      currency: "INR",
      status: "success",
      description,
      metadata: {
        wallet: "casual",
        wallet_mode: "casual",
        appointment_id: apptId,
        consultation_type: consultationType,
      },
    });
  } catch (e) {
    console.log("recordCasualAppointmentWalletPayment transaction:", e?.message);
  }

  const meta = {
    wallet: "casual",
    wallet_mode: "casual",
    appointment_id: apptId,
    patient_user_id: patient,
    doctor_user_id: doctor,
    consultation_type: consultationType,
    appointment_fee_coins: amount,
    paid_at: new Date().toISOString(),
  };
  await createCoinLedgerLine({
    user: patient,
    delta: -amount,
    reason: "appointment_patient_spent",
    ref_collection: getPbAppointmentsCollection(),
    ref_id: apptId,
    meta,
  });
  await createCoinLedgerLine({
    user: doctor,
    delta: amount,
    reason: "appointment_doctor_earned",
    ref_collection: getPbAppointmentsCollection(),
    ref_id: apptId,
    meta,
  });
  try {
    await upsertDoctorCoinBalance(doctor, amount);
  } catch {
    // doctor_coin_balances is only a cache; the ledger remains authoritative
  }
  return { paid: true, alreadyPaid: false, amountInr: amount };
}

async function findDoctorCoinBalanceRow(doctorUserId) {
  if (!doctorUserId) return null;
  try {
    return await pb
      .collection("doctor_coin_balances")
      .getFirstListItem(`doctor="${doctorUserId}"`, { requestKey: null });
  } catch {
    return null;
  }
}

async function upsertDoctorCoinBalance(doctorUserId, delta) {
  if (!doctorUserId) return null;
  const current = await findDoctorCoinBalanceRow(doctorUserId);
  if (current?.id) {
    const next = (Number(current.balance) || 0) + Number(delta || 0);
    return pb.collection("doctor_coin_balances").update(current.id, {
      balance: next,
      last_ledger_at: new Date().toISOString(),
    });
  }
  return pb.collection("doctor_coin_balances").create({
    doctor: doctorUserId,
    balance: Number(delta || 0),
    last_ledger_at: new Date().toISOString(),
  });
}

export async function getDoctorCoinBalance(doctorUserId) {
  const uid = String(doctorUserId || "").trim();
  if (!uid) return 0;
  const balance = await getCoinBalanceForUser(uid);
  try {
    const row = await findDoctorCoinBalanceRow(uid);
    if (row?.id) {
      if ((Number(row.balance) || 0) !== balance) {
        await pb.collection("doctor_coin_balances").update(row.id, {
          balance,
          last_ledger_at: new Date().toISOString(),
        });
      }
    } else if (balance > 0) {
      await upsertDoctorCoinBalance(uid, balance);
    }
  } catch {
    // doctor_coin_balances is only a cache; the ledger remains authoritative
  }
  return balance;
}

function dayBoundsIso(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return dayBoundsIso();
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function monthBoundsIso(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return monthBoundsIso();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function monthKey(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return monthKey();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function updatePackageOfferDoctorWithFallback(offerId, toDoctorUserId) {
  const profileId = await resolveDoctorProfileIdForUser(toDoctorUserId);
  const candidates = [...new Set([toDoctorUserId, profileId].filter(Boolean))];
  let lastError = null;
  for (const doctor of candidates) {
    try {
      return await pb.collection("package_offers").update(offerId, { doctor });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Could not update package doctor.");
}

async function findActivePackageReferral({
  offerId,
  patientUserId,
  toDoctorUserId,
}) {
  const filters = [];
  if (offerId) filters.push(`package_offer="${offerId}"`);
  if (patientUserId) filters.push(`patient="${patientUserId}"`);
  if (toDoctorUserId) filters.push(`to_doctor="${toDoctorUserId}"`);
  filters.push(`status="active"`);
  try {
    return await pb
      .collection("package_referrals")
      .getFirstListItem(filters.join(" && "), { requestKey: null });
  } catch {
    return null;
  }
}

export async function referPackagePatientToDoctor({
  packageOfferId,
  patientUserId,
  fromDoctorUserId,
  toDoctorUserId,
  notes = "",
} = {}) {
  const offerId = String(packageOfferId || "").trim();
  const patient = String(patientUserId || "").trim();
  const fromDoctor = String(fromDoctorUserId || getAuthUser()?.id || "").trim();
  const toDoctor = String(toDoctorUserId || "").trim();
  if (!offerId || !patient || !fromDoctor || !toDoctor) {
    throw new Error(
      "Missing package, patient, referring doctor, or new doctor.",
    );
  }
  if (fromDoctor === toDoctor) {
    throw new Error("Choose a different doctor for referral.");
  }
  try {
    const targetProfile = await pb
      .collection("doctor_profile")
      .getFirstListItem(`user="${toDoctor}"`, { requestKey: null });
    const targetTier =
      targetProfile?.practitioner_tier ||
      targetProfile?.tier ||
      targetProfile?.doctor_class ||
      targetProfile?.verification_tier ||
      "";
    if (
      !doctorTierEligibleForPackageMode(targetTier) ||
      doctorTierEligibleForQuickService(targetProfile)
    ) {
      throw new Error(
        "Referral target must be a professional or specialist package doctor.",
      );
    }
  } catch (error) {
    if (error?.message?.includes("Referral target")) throw error;
    throw new Error(
      "Choose an eligible professional or specialist package doctor.",
    );
  }
  const activeOffer = await findActivePackageOfferForPair({
    patientUserId: patient,
    doctorUserId: fromDoctor,
    offerId,
  });
  if (!activeOffer) {
    throw new Error(
      "Only the current fixed package doctor can refer this patient.",
    );
  }
  await updatePackageOfferDoctorWithFallback(offerId, toDoctor);
  try {
    const pair = await pb
      .collection("patient_doctor_packages")
      .getFirstListItem(`package_offer="${offerId}"`, { requestKey: null });
    await pb.collection("patient_doctor_packages").update(pair.id, {
      doctor: toDoctor,
      referred_from_doctor: fromDoctor,
      referral_active: true,
      referred_at: new Date().toISOString(),
    });
  } catch {
    // optional collection / fields; paid package_offers remains source of truth
  }
  const payload = {
    package_offer: offerId,
    patient,
    from_doctor: fromDoctor,
    to_doctor: toDoctor,
    status: "active",
    referred_at: new Date().toISOString(),
    monthly_commission_coins: REFERRAL_MONTHLY_COMMISSION_COINS,
    notes: String(notes || "").trim(),
  };
  const compact = { ...payload };
  delete compact.monthly_commission_coins;
  delete compact.notes;
  let referral = null;
  for (const body of [payload, compact]) {
    try {
      referral = await pb.collection("package_referrals").create(body);
      break;
    } catch (error) {
      if (body === compact) {
        const msg = formatPocketBaseClientError(error) || error?.message;
        throw new Error(
          msg ||
            "Referral failed. Add `package_referrals` with package_offer, patient, from_doctor, to_doctor, status, referred_at.",
        );
      }
    }
  }
  await notifyLocal(
    "Patient referred",
    "The referred doctor is now fixed for this package. Future package coins settle to them.",
  );
  return referral;
}

export async function listPackageReferralsForDoctor(doctorUserId) {
  const doctor = String(doctorUserId || "").trim();
  if (!doctor) return [];
  try {
    return await pb.collection("package_referrals").getFullList({
      requestKey: null,
      sort: "-referred_at,-created",
      filter: `from_doctor="${doctor}" || to_doctor="${doctor}"`,
    });
  } catch {
    return [];
  }
}

export async function settleReferralMonthlyCommission(
  referral,
  date = new Date(),
) {
  if (!referral?.id) return { settled: false, reason: "missing_referral" };
  const status = String(referral.status || "active").toLowerCase();
  if (status && status !== "active") {
    return { settled: false, reason: "inactive_referral" };
  }
  const offerId = relationId(referral.package_offer);
  const patientUserId = relationId(referral.patient);
  const fromDoctorUserId = relationId(referral.from_doctor);
  const toDoctorUserId = relationId(referral.to_doctor);
  if (!offerId || !patientUserId || !fromDoctorUserId || !toDoctorUserId) {
    return { settled: false, reason: "missing_referral_party" };
  }
  const key = monthKey(date);
  const { start, end } = monthBoundsIso(date);
  let existing = [];
  try {
    existing = await pb.collection("coin_ledger").getFullList({
      requestKey: null,
      filter: `ref_collection="package_referrals" && ref_id="${referral.id}" && reason="referral_monthly_commission_paid"`,
    });
  } catch {
    return { settled: false, reason: "coin_ledger_missing" };
  }
  existing = existing.filter((row) => {
    const meta = parseCoinLedgerMeta(row);
    return String(meta.month || "") === key;
  });
  if (existing.length > 0) return { settled: false, reason: "already_settled" };
  const earnedRows = await pb.collection("coin_ledger").getFullList({
    requestKey: null,
    filter: `user="${toDoctorUserId}" && reason="package_session_doctor_earned" && created>="${start}" && created<"${end}"`,
  });
  const earnedFromPatient = (earnedRows || []).filter((row) => {
    const meta = parseCoinLedgerMeta(row);
    return (
      String(meta.package_offer_id || "") === offerId ||
      String(meta.patient_user_id || "") === patientUserId
    );
  });
  const earnedCoins = earnedFromPatient.reduce(
    (sum, row) => sum + Math.max(0, Number(row.delta) || 0),
    0,
  );
  if (earnedCoins <= 0) {
    return { settled: false, reason: "no_referred_patient_earnings" };
  }
  const commission = REFERRAL_MONTHLY_COMMISSION_COINS;
  const meta = {
    month: key,
    package_offer_id: offerId,
    patient_user_id: patientUserId,
    from_doctor_user_id: fromDoctorUserId,
    to_doctor_user_id: toDoctorUserId,
    referred_doctor_month_earnings: earnedCoins,
  };
  await createCoinLedgerLine({
    user: toDoctorUserId,
    delta: -commission,
    reason: "referral_monthly_commission_paid",
    ref_collection: "package_referrals",
    ref_id: referral.id,
    meta,
  });
  await createCoinLedgerLine({
    user: fromDoctorUserId,
    delta: commission,
    reason: "referral_monthly_commission_received",
    ref_collection: "package_referrals",
    ref_id: referral.id,
    meta,
  });
  try {
    await upsertDoctorCoinBalance(toDoctorUserId, -commission);
    await upsertDoctorCoinBalance(fromDoctorUserId, commission);
  } catch {
    // ledger remains source of truth
  }
  return { settled: true, coins: commission, earnedCoins };
}

export async function settleDueReferralMonthlyCommissions(doctorUserId) {
  const referrals = await listPackageReferralsForDoctor(doctorUserId);
  const previousMonth = new Date();
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const results = [];
  for (const referral of referrals) {
    if (relationId(referral.to_doctor) !== String(doctorUserId || "")) continue;
    try {
      results.push(
        await settleReferralMonthlyCommission(referral, previousMonth),
      );
    } catch (error) {
      results.push({ settled: false, reason: error?.message || "failed" });
    }
  }
  return results;
}

export async function recordPatientDoctorInteraction({
  patientUserId,
  doctorUserId,
  kind,
  conversationId = "",
  appointmentId = "",
  source = "app",
} = {}) {
  const patient = String(patientUserId || "").trim();
  const doctor = String(doctorUserId || "").trim();
  const interactionKind = String(kind || "")
    .trim()
    .toLowerCase();
  if (
    !patient ||
    !doctor ||
    !["chat", "audio", "video"].includes(interactionKind)
  ) {
    return null;
  }
  try {
    return await pb.collection("patient_doctor_interactions").create({
      patient,
      doctor,
      kind: interactionKind,
      conversation: String(conversationId || "").trim(),
      appointment: String(appointmentId || "").trim(),
      source: String(source || "app").trim(),
      occurred_at: new Date().toISOString(),
    });
  } catch (error) {
    console.log("recordPatientDoctorInteraction:", error?.message);
    return null;
  }
}

async function hasPatientDoctorInteractionOnDay({
  patientUserId,
  doctorUserId,
  day,
}) {
  const patient = String(patientUserId || "").trim();
  const doctor = String(doctorUserId || "").trim();
  if (!patient || !doctor) return false;
  const { start, end } = dayBoundsIso(day);
  try {
    const rows = await pb
      .collection("patient_doctor_interactions")
      .getFullList({
        requestKey: null,
        filter: `patient="${patient}" && doctor="${doctor}" && occurred_at>="${start}" && occurred_at<"${end}"`,
      });
    return rows.length > 0;
  } catch (error) {
    console.log("hasPatientDoctorInteractionOnDay:", error?.message);
    return false;
  }
}

export async function settlePackageCoinsForCompletedAppointment(
  appointmentRow,
) {
  if (!appointmentRow?.id)
    return { settled: false, reason: "missing_appointment" };
  const workflow = decodeMeetingWorkflowFromAppointmentRow(appointmentRow);
  let offerId = String(workflow.package_offer_id || "").trim();
  let appointmentPatientUserId =
    String(workflow.patient_auth_user_id || "").trim() ||
    relationId(appointmentRow.patient);
  let appointmentDoctorUserId =
    String(workflow.doctor_auth_user_id || "").trim() ||
    relationId(appointmentRow.doctor);
  const patientFromProfile = await resolveAuthUserIdForRelationId(
    "patient_profile",
    appointmentPatientUserId,
  );
  const doctorFromProfile = await resolveAuthUserIdForRelationId(
    "doctor_profile",
    appointmentDoctorUserId,
  );
  appointmentPatientUserId = patientFromProfile || appointmentPatientUserId;
  appointmentDoctorUserId = doctorFromProfile || appointmentDoctorUserId;
  const activeOffer = await findActivePackageOfferForPair({
    patientUserId: appointmentPatientUserId,
    doctorUserId: appointmentDoctorUserId,
    offerId,
  });
  if (!activeOffer) return { settled: false, reason: "no_active_package_pair" };
  offerId = activeOffer.id;
  let existing = [];
  try {
    existing = await pb.collection("coin_ledger").getFullList({
      requestKey: null,
      filter: `ref_collection="${getPbAppointmentsCollection()}" && ref_id="${appointmentRow.id}" && reason="package_session_doctor_earned"`,
    });
  } catch {
    return { settled: false, reason: "coin_ledger_missing" };
  }
  if (existing.length > 0) return { settled: false, reason: "already_settled" };
  const patientUserId =
    String(activeOffer.patient_user_id || "").trim() ||
    appointmentPatientUserId;
  const doctorUserId =
    String(activeOffer.doctor_user_id || "").trim() || appointmentDoctorUserId;
  if (
    appointmentPatientUserId &&
    patientUserId &&
    appointmentPatientUserId !== patientUserId
  ) {
    return { settled: false, reason: "appointment_patient_not_in_pair" };
  }
  if (
    appointmentDoctorUserId &&
    doctorUserId &&
    appointmentDoctorUserId !== doctorUserId
  ) {
    return { settled: false, reason: "appointment_doctor_not_in_pair" };
  }
  const totalDoctorCoins = Number(activeOffer.doctor_coins ?? 0);
  const totalPatientCoins =
    Number(activeOffer.amount_inr ?? 0) || totalDoctorCoins;
  const sessions = Math.max(1, Number(activeOffer.sessions) || 1);
  if (
    !patientUserId ||
    !doctorUserId ||
    !Number.isFinite(totalDoctorCoins) ||
    totalDoctorCoins <= 0 ||
    !Number.isFinite(totalPatientCoins) ||
    totalPatientCoins <= 0
  ) {
    return { settled: false, reason: "missing_party_or_amount" };
  }
  let priorDoctorRows = [];
  let priorPatientRows = [];
  try {
    const [doctorRows, patientRows] = await Promise.all([
      pb.collection("coin_ledger").getFullList({
        requestKey: null,
        filter: `user="${doctorUserId}" && reason="package_session_doctor_earned"`,
      }),
      pb.collection("coin_ledger").getFullList({
        requestKey: null,
        filter: `user="${patientUserId}" && reason="package_session_patient_spent"`,
      }),
    ]);
    priorDoctorRows = (doctorRows || []).filter(
      (row) =>
        String(parseCoinLedgerMeta(row).package_offer_id || "") === offerId,
    );
    priorPatientRows = (patientRows || []).filter(
      (row) =>
        String(parseCoinLedgerMeta(row).package_offer_id || "") === offerId,
    );
  } catch {
    return { settled: false, reason: "coin_ledger_missing" };
  }
  if (priorDoctorRows.length >= sessions) {
    return { settled: false, reason: "all_package_sessions_settled" };
  }
  const doctorEarnedSoFar = priorDoctorRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.delta) || 0),
    0,
  );
  const patientSpentSoFar = priorPatientRows.reduce(
    (sum, row) => sum + Math.max(0, Math.abs(Number(row.delta) || 0)),
    0,
  );
  const sessionIndex = priorDoctorRows.length + 1;
  const isFinalSession = sessionIndex >= sessions;
  const patientRemaining = Math.max(0, totalPatientCoins - patientSpentSoFar);
  const doctorRemaining = Math.max(0, totalDoctorCoins - doctorEarnedSoFar);
  const basePatientCoins = Math.max(
    1,
    Math.floor(totalPatientCoins / sessions),
  );
  const baseDoctorCoins = Math.max(1, Math.floor(totalDoctorCoins / sessions));
  const patientCoins = isFinalSession
    ? patientRemaining
    : Math.min(patientRemaining, basePatientCoins);
  const doctorCoins = isFinalSession
    ? doctorRemaining
    : Math.min(doctorRemaining, baseDoctorCoins);
  if (patientCoins <= 0 || doctorCoins <= 0) {
    return { settled: false, reason: "package_coins_already_depleted" };
  }
  const hadInteraction = await hasPatientDoctorInteractionOnDay({
    patientUserId,
    doctorUserId,
    day:
      appointmentRow.scheduled_at ||
      workflow.confirmed_at ||
      workflow.patient_selected_slot ||
      workflow.proposed_at ||
      new Date().toISOString(),
  });
  if (!hadInteraction) {
    return { settled: false, reason: "no_same_day_interaction" };
  }
  try {
    const loadedRows = await pb.collection("coin_ledger").getFullList({
      requestKey: null,
      filter: `user="${patientUserId}" && ref_collection="package_offers" && ref_id="${offerId}"`,
    });
    const loadedCoins = (loadedRows || [])
      .filter((row) =>
        [
          "package_patient_coins_loaded",
          "package_patient_coins_adjusted_to_paid_amount",
        ].includes(String(row.reason || "")),
      )
      .reduce((sum, row) => sum + Math.max(0, Number(row.delta) || 0), 0);
    if (loadedCoins < totalPatientCoins) {
      const diff = totalPatientCoins - loadedCoins;
      await createCoinLedgerLine({
        user: patientUserId,
        delta: diff,
        reason: "package_patient_coins_adjusted_to_paid_amount",
        ref_collection: "package_offers",
        ref_id: offerId,
        meta: {
          wallet: "package",
          wallet_mode: "package",
          package_offer_id: offerId,
          paid_amount_inr: totalPatientCoins,
          previous_loaded_coins: loadedCoins,
          adjusted_at: new Date().toISOString(),
        },
      });
    }
  } catch {
    // If adjustment cannot be checked, the balance assertion below protects settlement.
  }
  await assertPatientHasPackageCoins(patientUserId, patientCoins, offerId);
  const meta = {
    wallet: "package",
    wallet_mode: "package",
    package_offer_id: offerId,
    appointment_id: appointmentRow.id,
    patient_user_id: patientUserId,
    doctor_user_id: doctorUserId,
    session_index: sessionIndex,
    sessions,
    total_patient_package_coins: totalPatientCoins,
    total_doctor_coins: totalDoctorCoins,
    patient_session_coins: patientCoins,
    doctor_session_coins: doctorCoins,
  };
  await createCoinLedgerLine({
    user: patientUserId,
    delta: -patientCoins,
    reason: "package_session_patient_spent",
    ref_collection: getPbAppointmentsCollection(),
    ref_id: appointmentRow.id,
    meta,
  });
  await createCoinLedgerLine({
    user: doctorUserId,
    delta: doctorCoins,
    reason: "package_session_doctor_earned",
    ref_collection: getPbAppointmentsCollection(),
    ref_id: appointmentRow.id,
    meta,
  });
  try {
    await upsertDoctorCoinBalance(doctorUserId, doctorCoins);
  } catch {
    // withdrawal can still use ledger balance if the balance collection is missing
  }
  try {
    const pair = await pb
      .collection("patient_doctor_packages")
      .getFirstListItem(`package_offer="${offerId}"`, { requestKey: null });
    await pb.collection("patient_doctor_packages").update(pair.id, {
      remaining_coins: Math.max(
        0,
        totalPatientCoins - patientSpentSoFar - patientCoins,
      ),
    });
  } catch {
    // optional progress cache; ledger remains source of truth
  }
  return { settled: true, patientCoins, doctorCoins };
}

export async function listCoinLedgerForUser(userId) {
  if (!userId) return [];
  try {
    const rows = await pb.collection("coin_ledger").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `user="${userId}"`,
    });
    return (rows || []).map((row) => ({
      ...row,
      meta: parseCoinLedgerMeta(row),
    }));
  } catch {
    return [];
  }
}

export async function doctorWithdrawCoinsStub(
  doctorUserId,
  coins,
  walletChannel = "combined",
) {
  const n = Number(coins);
  if (!doctorUserId || !Number.isFinite(n) || n < 1) {
    throw new Error("Invalid withdrawal.");
  }
  const channel = String(walletChannel || "combined").toLowerCase();
  let balanceRow = await findDoctorCoinBalanceRow(doctorUserId);
  const buckets = await getDoctorCoinBucketBalances(doctorUserId);
  const balance =
    channel === "quick"
      ? Number(buckets.quickCoins) || 0
      : channel === "package"
        ? Number(buckets.packageCoins) || 0
        : Number(buckets.totalCoins) || 0;
  if (n > balance) {
    throw new Error(`Withdrawal exceeds available coins (${balance}).`);
  }
  if (!balanceRow?.id && balance > 0) {
    balanceRow = await findDoctorCoinBalanceRow(doctorUserId);
  }
  try {
    const request = {
      doctor: doctorUserId,
      amount: n,
      status: "pending",
      requested_at: new Date().toISOString(),
    };
    if (balanceRow?.id) request.doctor_balance = balanceRow.id;
    await pb.collection("doctor_withdrawal_requests").create(request);
    await notifyLocal("Withdrawal requested", `${n} coins requested.`);
    return true;
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Withdrawal failed. Add `doctor_withdrawal_requests` (doctor, doctor_balance, amount, status, requested_at).",
    );
  }
}

// --- Quick Solution (10 coins) / Quick Counselling (25 coins) ---

async function getActiveQuickRequestLoadByRecipient(candidateUserIds) {
  const candidateSet = new Set(
    (candidateUserIds || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  const loads = new Map([...candidateSet].map((id) => [id, 0]));
  if (!candidateSet.size) return loads;

  const activeFilter = `(status="queued" || status="assigned")`;
  const collections = ["quick_solution_requests", "quick_counselling_requests"];
  const results = await Promise.all(
    collections.map(async (collection) => {
      try {
        return await pb.collection(collection).getFullList({
          requestKey: null,
          filter: activeFilter,
          fields: "id,recipient",
        });
      } catch (e) {
        console.log(
          `getActiveQuickRequestLoadByRecipient ${collection}:`,
          e?.message,
        );
        return [];
      }
    }),
  );

  for (const rows of results) {
    for (const row of rows || []) {
      const recipientId = relationId(row?.recipient);
      if (!candidateSet.has(recipientId)) continue;
      loads.set(recipientId, (loads.get(recipientId) || 0) + 1);
    }
  }
  return loads;
}

async function getMostRecentQuickRequestRecipientId() {
  const collections = ["quick_solution_requests", "quick_counselling_requests"];
  const latestRows = await Promise.all(
    collections.map(async (collection) => {
      try {
        const page = await pb.collection(collection).getList(1, 1, {
          requestKey: null,
          sort: "-created",
          fields: "id,recipient,created",
        });
        return page?.items?.[0] || null;
      } catch (e) {
        console.log(
          `getMostRecentQuickRequestRecipientId ${collection}:`,
          e?.message,
        );
        return null;
      }
    }),
  );

  const latest = latestRows
    .filter(Boolean)
    .sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0))[0];
  return relationId(latest?.recipient);
}

function pickRoundRobinCandidate(candidates, previousRecipientId) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const ordered = [...candidates].sort((a, b) => {
    const byKind = String(a.kind || "").localeCompare(String(b.kind || ""));
    if (byKind !== 0) return byKind;
    return String(a.userId || "").localeCompare(String(b.userId || ""));
  });
  if (ordered.length === 1) return ordered[0];

  const previousIndex = ordered.findIndex(
    (candidate) => candidate.userId === previousRecipientId,
  );
  if (previousIndex < 0) return ordered[0];
  return ordered[(previousIndex + 1) % ordered.length];
}

/**
 * Approved doctors whose `package_setup` is not `true` (false or unset), plus
 * every `pharmacy_profile`, for Quick Solution / Quick Counselling routing.
 * Chooses the least-loaded recipient by active queued/assigned quick requests;
 * ties rotate by round-robin from the most recently routed quick request.
 */
export async function pickRandomQuickCareRecipient(excludeUserId = null) {
  const ex = String(excludeUserId || "").trim();

  let doctorProfiles = [];
  try {
    doctorProfiles = await pb.collection("doctor_profile").getFullList({
      requestKey: null,
      filter: `status="approved"`,
      expand: "user",
    });
  } catch (e) {
    console.log("pickRandomQuickCareRecipient doctors:", e?.message);
    doctorProfiles = [];
  }
  const nonPackageDoctors = (doctorProfiles || []).filter(
    (rec) => rec?.package_setup !== true,
  );

  let pharmacyProfiles = [];
  try {
    pharmacyProfiles = await pb.collection("pharmacy_profile").getFullList({
      requestKey: null,
      expand: "user",
    });
  } catch (e) {
    console.log("pickRandomQuickCareRecipient pharmacies:", e?.message);
    pharmacyProfiles = [];
  }

  const candidates = [];
  for (const rec of nonPackageDoctors) {
    const uid =
      typeof rec.user === "string"
        ? rec.user
        : rec.user?.id || rec.expand?.user?.id || "";
    const id = String(uid || "").trim();
    if (!id || id === ex) continue;
    candidates.push({ kind: "doctor", userId: id });
  }
  for (const rec of pharmacyProfiles || []) {
    const uid =
      typeof rec.user === "string"
        ? rec.user
        : rec.user?.id || rec.expand?.user?.id || "";
    const id = String(uid || "").trim();
    if (!id || id === ex) continue;
    candidates.push({ kind: "pharmacy", userId: id });
  }

  if (!candidates.length) {
    throw new Error(
      "No RMP-style doctors (without package setup) or pharmacies are available to receive this request yet.",
    );
  }

  const loads = await getActiveQuickRequestLoadByRecipient(
    candidates.map((candidate) => candidate.userId),
  );
  const minLoad = Math.min(
    ...candidates.map((candidate) => loads.get(candidate.userId) || 0),
  );
  const leastLoadedCandidates = candidates.filter(
    (candidate) => (loads.get(candidate.userId) || 0) === minLoad,
  );
  const previousRecipientId = await getMostRecentQuickRequestRecipientId();
  const picked = pickRoundRobinCandidate(
    leastLoadedCandidates,
    previousRecipientId,
  );
  if (!picked) {
    throw new Error(
      "No RMP-style doctors (without package setup) or pharmacies are available to receive this request yet.",
    );
  }
  return picked;
}

export async function createQuickSolutionRequest({
  patientUserId,
  notes,
  privateMode,
  imagePart,
  /** RMP / clinic doctor (UsersAuth id). */
  targetDoctorUserId,
  /** Pharmacy account (UsersAuth id). Mutually exclusive with `targetDoctorUserId`. */
  targetPharmacyUserId,
}) {
  await assertPatientHasCasualCoins(patientUserId, 10);
  const td = String(targetDoctorUserId || "").trim();
  const tp = String(targetPharmacyUserId || "").trim();
  if (!td && !tp) {
    throw new Error("Internal routing error: no recipient.");
  }
  if (td && tp) {
    throw new Error("Internal routing error: both doctor and pharmacy set.");
  }
  const recipientUserId = td || tp;
  const cleanNotes = String(notes || "").trim();
  const base = {
    patient: patientUserId,
    recipient: recipientUserId,
    notes: cleanNotes,
    private_mode: Boolean(privateMode),
    patient_cost_coins: 10,
    platform_fee_coins: 5,
    provider_coins: 5,
    status: "queued",
  };
  try {
    let row;
    if (imagePart?.uri) {
      const form = new FormData();
      form.append("patient", patientUserId);
      form.append("recipient", recipientUserId);
      form.append("notes", base.notes);
      form.append("private_mode", privateMode ? "true" : "false");
      form.append("patient_cost_coins", "10");
      form.append("platform_fee_coins", "5");
      form.append("provider_coins", "5");
      form.append("status", "queued");
      form.append("image", imagePart);
      row = await pb.collection("quick_solution_requests").create(form);
    } else {
      row = await pb.collection("quick_solution_requests").create(base);
    }
    await notifyLocal(
      "Quick Solution submitted",
      privateMode
        ? "Private mode: your identity is hidden from the clinic side."
        : "A verified clinic will review your snap shortly.",
    );
    return row;
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Could not submit. Add `quick_solution_requests` (patient, recipient, notes, private_mode, image file, coin splits, status).",
    );
  }
}

/**
 * Emergency SOS → company assistant coordination (Premium).
 * Best-effort PocketBase write; succeeds even if the collection is missing.
 */
export async function createEmergencyAssistantRequest({
  patientUserId,
  doctorUserId,
  notes,
}) {
  const pid = String(patientUserId || "").trim();
  if (!pid) throw new Error("Sign in required.");
  try {
    await pb.collection("emergency_assistant_requests").create({
      patient: pid,
      doctor: String(doctorUserId || "").trim() || null,
      notes: String(notes || "").trim() || "",
      status: "requested",
    });
  } catch (error) {
    console.log(
      "createEmergencyAssistantRequest:",
      formatPocketBaseClientError(error) || error?.message,
    );
  }
  return { ok: true };
}

export async function createQuickCounsellingRequest({
  patientUserId,
  topic,
  targetDoctorUserId,
  targetPharmacyUserId,
}) {
  await assertPatientHasCasualCoins(patientUserId, 25);
  const td = String(targetDoctorUserId || "").trim();
  const tp = String(targetPharmacyUserId || "").trim();
  if (!td && !tp) {
    throw new Error("Internal routing error: no recipient.");
  }
  if (td && tp) {
    throw new Error("Internal routing error: both doctor and pharmacy set.");
  }
  const recipientUserId = td || tp;
  const cleanTopic = String(topic || "").trim() || "General";
  try {
    const row = await pb.collection("quick_counselling_requests").create({
      patient: patientUserId,
      recipient: recipientUserId,
      topic: cleanTopic,
      patient_cost_coins: 25,
      platform_fee_coins: 10,
      provider_coins: 15,
      status: "queued",
    });
    await notifyLocal("Quick Counselling", "A provider will connect shortly.");
    return row;
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Could not start counselling. Add `quick_counselling_requests` in PocketBase.",
    );
  }
}

export async function listQuickSolutionRequests(patientUserId) {
  if (!patientUserId) return [];
  try {
    return await pb.collection("quick_solution_requests").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `patient="${patientUserId}"`,
    });
  } catch {
    return [];
  }
}

export async function listQuickCounsellingRequests(patientUserId) {
  if (!patientUserId) return [];
  try {
    return await pb.collection("quick_counselling_requests").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `patient="${patientUserId}"`,
    });
  } catch {
    return [];
  }
}

/**
 * Queued Quick Solution rows for clinic/RMP dashboards.
 * PocketBase: allow authenticated staff/doctors to list `status="queued"` (and expand `patient` if you want names).
 * Errors propagate so the UI can show 403 / rule failures instead of looking like an empty queue.
 */
async function assertCurrentUserCanAccessQuickQueues() {
  const user = getAuthUser();
  const uid = String(user?.id || "").trim();
  const role = String(user?.role || "")
    .trim()
    .toLowerCase();
  if (!uid) throw new Error("Sign in required.");
  if (role === "pharmacy") {
    try {
      const profile = await pb
        .collection("pharmacy_profile")
        .getFirstListItem(`user="${uid}"`, { requestKey: null });
      if (normalizePharmacyProviderKind(profile?.provider_kind)) return true;
    } catch {
      // fall through to deny
    }
  }
  if (role === "doctor") {
    try {
      await pb
        .collection("doctor_profile")
        .getFirstListItem(`user="${uid}"`, { requestKey: null });
      // Any doctor with a readable profile may list rows where `recipient` is
      // their user id; PocketBase list rules still enforce access. Tier checks
      // apply to routing new patient requests, not to reading assigned queue work.
      return true;
    } catch (e) {
      throw new Error(
        formatPocketBaseClientError(e) ||
          e?.message ||
          "Could not read doctor_profile for quick queues. Check PocketBase API rules.",
      );
    }
  }
  throw new Error(
    "Quick queues are only for RMP, clinic, or clinic-doctor accounts.",
  );
}

export async function listQueuedQuickSolutionRequestsForProvider() {
  await assertCurrentUserCanAccessQuickQueues();
  const uid = String(getAuthUser()?.id || "").trim();
  if (!uid) throw new Error("Sign in required.");
  const filter = `(status="queued" || status="assigned") && recipient="${uid}"`;
  try {
    return await pb.collection("quick_solution_requests").getFullList({
      requestKey: null,
      sort: "-created",
      filter,
      // Avoid nested `patient.user` here: if the nested expand is blocked by
      // UsersAuth rules, PocketBase can omit `expand.patient` entirely and the
      // doctor UI falls back to "Patient". `patient` alone + hydrate is enough.
      expand: "patient,recipient",
    });
  } catch (e1) {
    try {
      return await pb.collection("quick_solution_requests").getFullList({
        requestKey: null,
        sort: "-created",
        filter,
        expand: "patient",
      });
    } catch (e2) {
      const msg =
        formatPocketBaseClientError(e2) ||
        formatPocketBaseClientError(e1) ||
        e2?.message ||
        e1?.message ||
        "List failed";
      throw new Error(msg);
    }
  }
}

/**
 * Queued Quick Counselling rows for RMP dashboards.
 * PocketBase: same list rules as quick_solution_requests for your role.
 */
export async function listQueuedQuickCounsellingRequestsForProvider() {
  await assertCurrentUserCanAccessQuickQueues();
  const uid = String(getAuthUser()?.id || "").trim();
  if (!uid) throw new Error("Sign in required.");
  const filter = `(status="queued" || status="assigned") && recipient="${uid}"`;
  try {
    return await pb.collection("quick_counselling_requests").getFullList({
      requestKey: null,
      sort: "-created",
      filter,
      expand: "patient,recipient",
    });
  } catch (e1) {
    try {
      return await pb.collection("quick_counselling_requests").getFullList({
        requestKey: null,
        sort: "-created",
        filter,
        expand: "patient",
      });
    } catch (e2) {
      const msg =
        formatPocketBaseClientError(e2) ||
        formatPocketBaseClientError(e1) ||
        e2?.message ||
        e1?.message ||
        "List failed";
      throw new Error(msg);
    }
  }
}

function relIdForDoctorPatients(v) {
  if (v == null || v === "") return "";
  if (typeof v === "object" && v.id) return String(v.id).trim();
  return String(v).trim();
}

function authUserIdFromPatientExpand(patientProf) {
  if (!patientProf || typeof patientProf !== "object") return "";
  const u = patientProf.expand?.user;
  if (u && typeof u === "object" && u.id) return String(u.id).trim();
  const rel =
    typeof patientProf.user === "string"
      ? patientProf.user
      : patientProf.user?.id;
  return String(rel || "").trim();
}

function pickPatientContactPhone(profileRecord, authUserRecord) {
  const pick = (o) => {
    if (!o || typeof o !== "object") return "";
    return String(
      o.phone ||
        o.mobile ||
        o.contact_phone ||
        o.phone_number ||
        o.telephone ||
        "",
    ).trim();
  };
  return pick(authUserRecord) || pick(profileRecord);
}

function ageFromDobIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let age = new Date().getFullYear() - d.getFullYear();
  const md = new Date().getMonth() - d.getMonth();
  if (md < 0 || (md === 0 && new Date().getDate() < d.getDate())) age -= 1;
  return Math.max(0, age);
}

function patientRelIdFromQuickQueueRecord(record) {
  if (!record) return "";
  const direct = relIdForDoctorPatients(record.patient);
  if (direct) return direct;
  return relIdForDoctorPatients(record.expand?.patient);
}

function mapPatientProfileToDoctorPatientCard(
  patientProf,
  { conditions = "—", lastVisit = "Active", riskHint = 55 } = {},
) {
  const u = patientProf?.expand?.user;
  const name =
    resolveListingDisplayName(patientProf, u) || "Patient";
  const gender = String(patientProf?.gender || patientProf?.sex || "—").trim() || "—";
  const ageN = ageFromDobIso(
    patientProf?.date_of_birth ||
      patientProf?.dob ||
      u?.date_of_birth ||
      u?.dob,
  );
  const blood = String(
    patientProf?.blood_type || patientProf?.blood_group || "—",
  ).trim() || "—";
  const phoneRaw = pickPatientContactPhone(patientProf, u);
  const phone = phoneRaw || "—";
  const score = Math.min(98, Math.max(12, Math.round(Number(riskHint) || 55)));
  const riskLevel =
    score >= 70 ? "Low" : score >= 45 ? "Medium" : "High";
  return {
    id: String(patientProf?.id || name),
    name,
    gender,
    age: ageN != null ? ageN : "—",
    blood,
    phone,
    conditions: String(conditions || "—").slice(0, 120) || "—",
    riskLevel,
    risk: score,
    lastVisit,
  };
}

function mergeDoctorPatientCardWithAppointmentHint(card, hint, packageRow) {
  if (!hint || !card) return card;
  const pkgTitle = String(packageRow?.title || "").trim();
  const next = { ...card };
  const hName = String(hint.name || "").trim();
  if (
    hName &&
    (!next.name ||
      next.name === "Patient" ||
      (pkgTitle && next.name === pkgTitle))
  ) {
    next.name = hName;
  }
  const hPhone = String(hint.phone || "").trim();
  if (hPhone && (!next.phone || next.phone === "—")) {
    next.phone = hPhone;
  }
  if (hint.age != null && next.age === "—") {
    next.age = hint.age;
  }
  return next;
}

/**
 * Best-effort map: patient relation id (and auth user id) → name / phone / age
 * from `appointments` for this doctor (matches names shown in PocketBase admin).
 */
async function loadAppointmentPatientDisplayHintsForDoctor(
  doctorUserId,
  doctorProfileId = "",
) {
  /** @type {Map<string, { name: string, phone: string, age: number | null }>} */
  const hints = new Map();
  const uid = String(doctorUserId || "").trim();
  const profId = String(doctorProfileId || "").trim();
  const filters = [];
  if (uid && profId && uid !== profId) {
    filters.push(`doctor="${uid}" || doctor="${profId}"`);
  }
  if (uid) filters.push(`doctor="${uid}"`);
  if (profId) filters.push(`doctor="${profId}"`);
  const uniqFilters = [...new Set(filters)];
  const coll = appointmentsColl();

  for (const filter of uniqFilters) {
    try {
      const list = await pb.collection(coll).getFullList({
        requestKey: null,
        sort: "-created",
        filter,
        expand: "patient,patient.user",
      });
      // Oldest → newest so later rows fill missing fields from earlier gaps.
      const ordered = [...(list || [])].reverse();
      for (const rec of ordered) {
        const pid = relIdForDoctorPatients(rec.patient);
        if (!pid) continue;
        const p = rec.expand?.patient;
        const u =
          p?.expand?.user && typeof p.expand.user === "object"
            ? p.expand.user
            : null;
        const name =
          resolveListingDisplayName(
            p && typeof p === "object" ? p : null,
            u,
          ) || "";
        const phone = pickPatientContactPhone(
          p && typeof p === "object" ? p : null,
          u,
        );
        const ageN = ageFromDobIso(
          (p && (p.date_of_birth || p.dob)) ||
            (u && (u.date_of_birth || u.dob)),
        );
        const piece = {
          name: String(name || "").trim(),
          phone: String(phone || "").trim(),
          age: ageN,
        };
        const mergeInto = (key) => {
          if (!key) return;
          const cur = hints.get(key) || {
            name: "",
            phone: "",
            age: /** @type {number | null} */ (null),
          };
          const next = {
            name: cur.name || piece.name,
            phone: cur.phone || piece.phone,
            age: cur.age != null ? cur.age : piece.age,
          };
          if (next.name || next.phone || next.age != null) {
            hints.set(key, next);
          }
        };
        mergeInto(pid);
        const authId = authUserIdFromPatientExpand(
          p && typeof p === "object" ? p : null,
        );
        mergeInto(authId);
      }
    } catch (e) {
      console.log("appointment patient hints:", filter, e?.message);
    }
  }
  return hints;
}

async function fetchPatientDoctorPackageRowsForDoctor(
  doctorUserId,
  doctorProfileRowId = "",
) {
  const uid = String(doctorUserId || "").trim();
  const profId = String(doctorProfileRowId || "").trim();
  const filters = [];
  if (uid) {
    filters.push(`doctor="${uid}" && status="active"`);
    filters.push(`doctor="${uid}"`);
  }
  if (profId) {
    filters.push(`doctor="${profId}" && status="active"`);
    filters.push(`doctor="${profId}"`);
  }
  for (const filter of filters) {
    try {
      const list = await pb.collection("patient_doctor_packages").getFullList({
        requestKey: null,
        sort: "-updated,-created",
        filter,
        expand: "patient.user",
      });
      if (Array.isArray(list) && list.length) return list;
    } catch (e) {
      console.log("patient_doctor_packages list:", filter, e?.message);
    }
  }
  return [];
}

async function buildPackageDoctorPatientRows(doctorUserId, doctorProfile) {
  let rows = await fetchPatientDoctorPackageRowsForDoctor(
    doctorUserId,
    doctorProfile?.id,
  );
  rows = await hydrateRowsPatientAuthUsers(rows || []);

  const missingProfileIds = [];
  for (const row of rows || []) {
    const pid = relIdForDoctorPatients(row.patient);
    if (!pid) continue;
    if (!row.expand?.patient || typeof row.expand.patient !== "object") {
      missingProfileIds.push(pid);
    }
  }
  const profileById = await fetchPatientProfilesByIds(missingProfileIds);
  rows = (rows || []).map((row) => {
    if (row.expand?.patient && typeof row.expand.patient === "object") {
      return row;
    }
    const pid = relIdForDoctorPatients(row.patient);
    const prof = pid ? profileById.get(pid) : null;
    if (!prof) return row;
    return { ...row, expand: { ...(row.expand || {}), patient: prof } };
  });

  const apptHints = await loadAppointmentPatientDisplayHintsForDoctor(
    doctorUserId,
    doctorProfile?.id,
  );

  const byPatient = new Map();
  for (const row of rows || []) {
    const pid = relIdForDoctorPatients(row.patient);
    if (!pid) continue;
    if (!byPatient.has(pid)) byPatient.set(pid, row);
  }
  const out = [];
  for (const row of byPatient.values()) {
    const pid = relIdForDoctorPatients(row.patient);
    const p = row.expand?.patient;
    const authFromProf =
      p && typeof p === "object" ? authUserIdFromPatientExpand(p) : "";
    const hint =
      (pid && apptHints.get(pid)) ||
      (authFromProf && apptHints.get(authFromProf)) ||
      null;

    if (!p || typeof p !== "object") {
      const hName = String(hint?.name || "").trim();
      const hPhone = String(hint?.phone || "").trim();
      out.push(
        mergeDoctorPatientCardWithAppointmentHint(
          {
            id: String(row.id),
            name: hName || String(row.title || "Patient").trim() || "Patient",
            gender: "—",
            age: hint?.age != null ? hint.age : "—",
            blood: "—",
            phone: hPhone || "—",
            conditions: String(row.title || "Care package").trim(),
            riskLevel: "Medium",
            risk: 60,
            lastVisit: "Active package",
          },
          hint,
          row,
        ),
      );
      continue;
    }
    const rem = Number(row?.remaining_coins ?? 0) || 0;
    const pool =
      Number(row?.doctor_pool_coins ?? row?.amount_inr ?? 0) || 1;
    const score = Math.min(
      98,
      Math.max(
        15,
        Math.round((rem / Math.max(pool, 1)) * 100) || 60,
      ),
    );
    let card = mapPatientProfileToDoctorPatientCard(p, {
      conditions: String(row.title || "Care package").trim(),
      lastVisit: "Active package",
      riskHint: score,
    });
    card = mergeDoctorPatientCardWithAppointmentHint(card, hint, row);
    out.push({ ...card, id: String(row.id) });
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

async function buildQuickCareDoctorPatientRows(doctorUserId) {
  const uid = String(doctorUserId || "").trim();
  if (!uid) return [];
  /** @type {Map<string, { patientRecord?: object, conditions: string }>} */
  const byPatientRel = new Map();

  try {
    const presc = await pb.collection("prescriptions").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `doctor="${uid}"`,
      expand: "patient,patient.user",
    });
    for (const r of presc || []) {
      if (
        !relIdForDoctorPatients(r.quick_solution_request) &&
        !relIdForDoctorPatients(r.quick_counselling_request)
      ) {
        continue;
      }
      const pid = relIdForDoctorPatients(r.patient);
      if (!pid) continue;
      const note = String(r.notes || "").trim() || "Quick care";
      if (!byPatientRel.has(pid)) {
        byPatientRel.set(pid, {
          patientRecord: r.expand?.patient,
          conditions: note,
        });
      }
    }
  } catch (e) {
    console.log("quick care prescriptions for patients tab:", e?.message);
  }

  try {
    const sol = await listQueuedQuickSolutionRequestsForProvider();
    const cou = await listQueuedQuickCounsellingRequestsForProvider();
    const merged = await hydrateRowsPatientAuthUsers([
      ...(sol || []),
      ...(cou || []),
    ]);
    for (const r of merged) {
      const pid = patientRelIdFromQuickQueueRecord(r);
      if (!pid) continue;
      if (!byPatientRel.has(pid)) {
        byPatientRel.set(pid, {
          patientRecord: r.expand?.patient,
          conditions: "In queue",
        });
      }
    }
  } catch (e) {
    console.log("quick care queue for patients tab:", e?.message);
  }

  const out = [];
  for (const [pid, meta] of byPatientRel) {
    const p = meta.patientRecord;
    if (p && typeof p === "object") {
      const base = mapPatientProfileToDoctorPatientCard(p, {
        conditions: meta.conditions,
        lastVisit: "Active",
        riskHint: 52 + (pid.length % 33),
      });
      out.push({ ...base, id: pid });
    } else {
      out.push({
        id: pid,
        name: "Patient",
        gender: "—",
        age: "—",
        blood: "—",
        phone: "—",
        conditions: meta.conditions,
        riskLevel: "Medium",
        risk: 55,
        lastVisit: "Active",
      });
    }
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

/**
 * Rows for the doctor **My Patients** tab and **Active patients** count on the dashboard.
 * - **Package doctor:** distinct patients from `patient_doctor_packages` for this doctor.
 * - **Quick-care (RMP) doctor:** distinct patients from quick-related `prescriptions` plus open quick queues.
 */
export async function loadDoctorPatientsTabRows({
  doctorUserId,
  doctorProfile = null,
} = {}) {
  const uid = String(doctorUserId || "").trim();
  if (!uid) return [];
  const prof = doctorProfile || {};
  const isQuick = doctorTierEligibleForQuickService(prof);
  const isPkg = !isQuick && doctorProfileIsPackageDoctor(prof);
  if (isPkg) {
    return await buildPackageDoctorPatientRows(uid, prof);
  }
  if (isQuick) {
    return await buildQuickCareDoctorPatientRows(uid);
  }
  return [];
}

export async function resolvePatientPointerToAuthUserId(pointerId) {
  const id = String(pointerId || "").trim();
  if (!id) return "";
  try {
    const auth = await resolveAuthUserIdForRelationId("patient_profile", id);
    if (auth) return String(auth).trim();
  } catch {
    /* ignore */
  }
  return id;
}

async function collectDoctorPatientRelationIdsForChat({
  doctorUserId,
  doctorProfile,
  appointments = [],
}) {
  const uid = String(doctorUserId || "").trim();
  const relIds = new Set();
  if (!uid) return relIds;

  const prof = doctorProfile || {};
  const isQuick = doctorTierEligibleForQuickService(prof);
  const isPkg = !isQuick && doctorProfileIsPackageDoctor(prof);

  if (isPkg) {
    const rows = await fetchPatientDoctorPackageRowsForDoctor(uid, prof?.id);
    for (const row of rows || []) {
      const p = relIdForDoctorPatients(row.patient);
      if (p) relIds.add(p);
    }
  } else if (isQuick) {
    try {
      const presc = await pb.collection("prescriptions").getFullList({
        requestKey: null,
        sort: "-created",
        filter: `doctor="${uid}"`,
        expand: "patient,patient.user",
      });
      for (const r of presc || []) {
        if (
          !relIdForDoctorPatients(r.quick_solution_request) &&
          !relIdForDoctorPatients(r.quick_counselling_request)
        ) {
          continue;
        }
        const pid = relIdForDoctorPatients(r.patient);
        if (pid) relIds.add(pid);
      }
    } catch (e) {
      console.log("doctor chat directory (prescriptions):", e?.message);
    }
    try {
      const sol = await listQueuedQuickSolutionRequestsForProvider();
      const cou = await listQueuedQuickCounsellingRequestsForProvider();
      const merged = await hydrateRowsPatientAuthUsers([
        ...(sol || []),
        ...(cou || []),
      ]);
      for (const r of merged || []) {
        const pid = patientRelIdFromQuickQueueRecord(r);
        if (pid) relIds.add(pid);
      }
    } catch (e) {
      console.log("doctor chat directory (queues):", e?.message);
    }
  }

  for (const a of appointments || []) {
    if (String(a?.doctorUserId || "").trim() !== uid) continue;
    const pid = String(a?.patientId || "").trim();
    if (pid) relIds.add(pid);
  }

  return relIds;
}

/**
 * Users who may appear in **Chat → Directory** search for a logged-in doctor:
 * active / quick-care patients plus appointment patients for this doctor only.
 */
export async function loadDoctorChatDirectoryUsers({
  doctorUserId,
  doctorProfile,
  appointments = [],
} = {}) {
  const uid = String(doctorUserId || "").trim();
  if (!uid) return [];
  const relIds = await collectDoctorPatientRelationIdsForChat({
    doctorUserId: uid,
    doctorProfile,
    appointments,
  });
  const resolved = await Promise.all(
    [...relIds].map((rid) => resolvePatientPointerToAuthUserId(rid)),
  );
  const authIds = [
    ...new Set(
      resolved
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .filter((id) => id !== uid),
    ),
  ];
  const byId = await fetchUsersAuthByIds(authIds);
  const out = [];
  for (const id of authIds) {
    const row = byId.get(id);
    if (!row) continue;
    const name =
      String(row.name || "").trim() ||
      resolveListingDisplayName(row, row.expand?.user) ||
      String(row.email || "").trim() ||
      "Patient";
    out.push({
      id: row.id,
      name,
      email: row.email || "",
      role: "patient",
    });
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

/**
 * Patients who may appear in **Chat → Directory** for a pharmacy: only users
 * with at least one `orders` row pointing at this pharmacy.
 */
export async function loadPharmacyChatDirectoryUsers(pharmacyUserId) {
  const uid = String(pharmacyUserId || "").trim();
  if (!uid) return [];
  const relIds = new Set();
  const filters = [`pharmacy="${uid}"`];
  for (const filter of filters) {
    try {
      const orders = await pb.collection("orders").getFullList({
        requestKey: null,
        sort: "-updated,-created",
        filter,
      });
      for (const o of orders || []) {
        const p = relIdForDoctorPatients(o.patient);
        if (p) relIds.add(p);
      }
      if (relIds.size) break;
    } catch (e) {
      console.log("pharmacy chat directory orders:", filter, e?.message);
    }
  }
  const resolved = await Promise.all(
    [...relIds].map((rid) => resolvePatientPointerToAuthUserId(rid)),
  );
  const authIds = [
    ...new Set(
      resolved
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .filter((id) => id !== uid),
    ),
  ];
  const byId = await fetchUsersAuthByIds(authIds);
  const out = [];
  for (const id of authIds) {
    const row = byId.get(id);
    if (!row) continue;
    const name =
      String(row.name || "").trim() ||
      resolveListingDisplayName(row, row.expand?.user) ||
      String(row.email || "").trim() ||
      "Patient";
    out.push({
      id: row.id,
      name,
      email: row.email || "",
      role: "patient",
    });
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

// --- Quick Solution / Counselling tracking & doctor help offers ---
//
// Status lifecycle (`quick_solution_requests` & `quick_counselling_requests`):
//   "queued"    - patient submitted; doctor / recipient queue.
//   "assigned"  - doctor created a prescription from this request; still open until patient closes.
//   "closed"    - patient closed from tracking list.
//   "cancelled" - patient cancelled.
//
// `recipient` (relation → same Users collection as `patient`): the randomly chosen RMP/clinic
// doctor or pharmacy account that should see this row in their queue. Do not append routing text
// to `notes` / `topic`; store description-only text there.
//
// Doctor "help" offers are stored in an optional collection `quick_help_offers`. Add it in
// PocketBase Admin to enable the "(Doctor) wants to help you" alert + arrow button on the
// patient tracking list. If the collection is missing the rest of the flow still works:
// the doctor's first chat message and the conversation itself are persisted normally, the
// patient just won't see the highlighted alert pointer for it.
//
// Suggested `quick_help_offers` schema (all optional except marked):
//   request_id     text   (required)  - id of the quick_solution_requests / quick_counselling_requests row
//   request_kind   select (required)  - values: solution, counselling
//   doctor         relation UsersAuth (required)
//   patient        relation UsersAuth (required)
//   conversation   relation conversations (required)
//   first_message  text                - plain text preview of the doctor's offer message
//   status         select              - active, closed, cancelled (default: active)
//
// Suggested API rules:
//   list:   doctor = @request.auth.id || patient = @request.auth.id
//   view:   doctor = @request.auth.id || patient = @request.auth.id
//   create: doctor = @request.auth.id
//   update: patient = @request.auth.id || recipient = @request.auth.id
//           (recipient must be able to set status → assigned after prescribing.)
//   delete: (admin only)
export const QUICK_REQUEST_STATUS = {
  QUEUED: "queued",
  ASSIGNED: "assigned",
  CLOSED: "closed",
  CANCELLED: "cancelled",
};

const QUICK_REQUEST_COLLECTION = {
  solution: "quick_solution_requests",
  counselling: "quick_counselling_requests",
};

function quickRequestCollectionName(kind) {
  return QUICK_REQUEST_COLLECTION[kind] || QUICK_REQUEST_COLLECTION.solution;
}

/** Doctor records a help offer + first chat message for a queued quick request. */
export async function recordQuickHelpOffer({
  requestId,
  requestKind,
  doctorUserId,
  patientUserId,
  conversationId,
  firstMessage,
}) {
  if (!requestId || !doctorUserId || !patientUserId || !conversationId) {
    return { record: null, skipped: true };
  }
  await assertCurrentUserCanAccessQuickQueues();
  const kind = requestKind === "counselling" ? "counselling" : "solution";
  const trimmed = String(firstMessage || "").trim();
  const baseAttempts = [
    {
      request_id: requestId,
      request_kind: kind,
      doctor: doctorUserId,
      patient: patientUserId,
      conversation: conversationId,
      first_message: trimmed,
      status: "active",
    },
    {
      request_id: requestId,
      request_kind: kind,
      doctor: doctorUserId,
      patient: patientUserId,
      conversation: conversationId,
      first_message: trimmed,
    },
    {
      request_id: requestId,
      request_kind: kind,
      doctor: doctorUserId,
      patient: patientUserId,
      conversation: conversationId,
    },
  ];
  let lastError = null;
  for (const body of baseAttempts) {
    try {
      const record = await pb.collection("quick_help_offers").create(body);
      return { record, skipped: false };
    } catch (error) {
      lastError = error;
      if (isPocketBaseMissingResourceError(error)) break;
    }
  }
  console.log(
    "recordQuickHelpOffer: could not persist offer (collection rules or schema?). Error:",
    lastError?.message,
  );
  return { record: null, skipped: true, error: lastError };
}

/** Doctor-facing list: queued offers this doctor already made (used to flag "already offered"). */
export async function listQuickHelpOffersByDoctor(doctorUserId) {
  if (!doctorUserId) return [];
  try {
    return await pb.collection("quick_help_offers").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `doctor="${doctorUserId}"`,
    });
  } catch {
    return [];
  }
}

/**
 * Fallback for the doctor side mirroring `listInferredQuickHelpOffersForPatient`.
 * For each queued request in `requests` (must carry `{ id, kind, created, patient }`),
 * we infer "this doctor already offered help" if a 1:1 conversation exists with that
 * patient and this doctor has sent a message in it AFTER request.created.
 */
export async function listInferredOffersByDoctor(doctorUserId, requests) {
  if (!doctorUserId || !Array.isArray(requests) || !requests.length) return [];

  let conversations = [];
  try {
    conversations = await pb.collection("conversations").getFullList({
      requestKey: null,
      sort: "-updated,-created",
      filter: `members~"${doctorUserId}"`,
    });
  } catch (e) {
    console.log("listInferredOffersByDoctor conversations:", e?.message);
    return [];
  }

  const convByPeer = new Map();
  for (const c of conversations) {
    if (c?.linkedWound) continue;
    const members = Array.isArray(c?.members) ? c.members : [];
    if (members.length !== 2) continue;
    const peerId = members.find((id) => id !== doctorUserId);
    if (!peerId) continue;
    if (!convByPeer.has(peerId)) convByPeer.set(peerId, c);
  }
  if (!convByPeer.size) return [];

  const offers = [];
  for (const req of requests) {
    const requestCreated = String(req?.created || "");
    if (!requestCreated || !req?.id || !req?.kind) continue;
    const patientId =
      (typeof req?.patient === "string" ? req.patient : null) ||
      req?.patient?.id ||
      req?.expand?.patient?.id ||
      "";
    if (!patientId) continue;
    const conv = convByPeer.get(patientId);
    if (!conv) continue;
    let firstMsg = null;
    try {
      const page = await pb.collection("messages").getList(1, 1, {
        requestKey: null,
        sort: "created",
        filter: `conversation="${conv.id}" && sender="${doctorUserId}" && created > "${requestCreated}"`,
      });
      firstMsg = page?.items?.[0] || null;
    } catch {
      firstMsg = null;
    }
    if (!firstMsg) continue;
    offers.push({
      id: `inferred:${conv.id}:${req.kind}:${req.id}`,
      synthesized: true,
      request_id: req.id,
      request_kind: req.kind,
      doctor: doctorUserId,
      patient: patientId,
      conversation: conv.id,
      first_message: "",
      created: firstMsg.created,
    });
  }
  return offers;
}

/** Patient-facing list: offers for the patient's active requests. */
export async function listQuickHelpOffersForPatient(patientUserId) {
  if (!patientUserId) return [];
  try {
    return await pb.collection("quick_help_offers").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `patient="${patientUserId}"`,
      expand: "doctor",
    });
  } catch (e1) {
    try {
      return await pb.collection("quick_help_offers").getFullList({
        requestKey: null,
        sort: "-created",
        filter: `patient="${patientUserId}"`,
      });
    } catch {
      return [];
    }
  }
}

/**
 * Fallback when the optional `quick_help_offers` collection is missing or its
 * API rules block reads. By spec, the doctor always creates/reuses a direct
 * 1:1 conversation and sends a chat message when they offer help. We scan the
 * patient's conversations + messages and synthesize offer rows that look
 * identical to what `listQuickHelpOffersForPatient` returns, so the rest of
 * the UI renders unchanged.
 *
 * Each `requests` entry must carry `{ id, kind, created }`.
 */
export async function listInferredQuickHelpOffersForPatient(
  patientUserId,
  requests,
) {
  if (!patientUserId || !Array.isArray(requests) || !requests.length) return [];

  let conversations = [];
  try {
    conversations = await pb.collection("conversations").getFullList({
      requestKey: null,
      sort: "-updated,-created",
      filter: `members~"${patientUserId}"`,
      expand: "members",
    });
  } catch (e) {
    console.log(
      "listInferredQuickHelpOffersForPatient conversations:",
      e?.message,
    );
    return [];
  }

  const doctorConvs = [];
  for (const c of conversations) {
    if (c?.linkedWound) continue;
    const members = Array.isArray(c?.members) ? c.members : [];
    if (members.length !== 2) continue;
    const peerId = members.find((id) => id !== patientUserId);
    if (!peerId) continue;
    const peerExpanded =
      (c?.expand?.members || []).find((m) => m?.id === peerId) || null;
    const role = String(peerExpanded?.role || "").toLowerCase();
    if (role && role !== "doctor") continue;
    doctorConvs.push({ conversation: c, peerId, peer: peerExpanded });
  }
  if (!doctorConvs.length) return [];

  const offers = [];
  for (const req of requests) {
    const requestCreated = String(req?.created || "");
    if (!requestCreated || !req?.id || !req?.kind) continue;
    for (const dc of doctorConvs) {
      let firstMsg = null;
      try {
        const page = await pb.collection("messages").getList(1, 1, {
          requestKey: null,
          sort: "created",
          filter: `conversation="${dc.conversation.id}" && sender="${dc.peerId}" && created > "${requestCreated}"`,
        });
        firstMsg = page?.items?.[0] || null;
      } catch {
        firstMsg = null;
      }
      if (!firstMsg) continue;
      offers.push({
        id: `inferred:${dc.conversation.id}:${req.kind}:${req.id}`,
        synthesized: true,
        request_id: req.id,
        request_kind: req.kind,
        doctor: dc.peerId,
        patient: patientUserId,
        conversation: dc.conversation.id,
        first_message: "",
        created: firstMsg.created,
        expand: dc.peer ? { doctor: dc.peer } : undefined,
      });
    }
  }
  return offers;
}

/** Patient tracking list: their queued requests + grouped doctor offers. */
export async function listActiveQuickRequestsForPatient(patientUserId) {
  if (!patientUserId) return { items: [], offersMissing: false };
  const filterActive = `patient="${patientUserId}" && (status="queued" || status="assigned")`;
  let solutions = [];
  let counselling = [];
  try {
    solutions = await pb.collection("quick_solution_requests").getFullList({
      requestKey: null,
      sort: "-created",
      filter: filterActive,
    });
  } catch (e) {
    console.log("listActiveQuickRequestsForPatient solutions:", e?.message);
  }
  try {
    counselling = await pb
      .collection("quick_counselling_requests")
      .getFullList({
        requestKey: null,
        sort: "-created",
        filter: filterActive,
      });
  } catch (e) {
    console.log("listActiveQuickRequestsForPatient counselling:", e?.message);
  }

  const tagged = [
    ...solutions.map((row) => ({ ...row, kind: "solution" })),
    ...counselling.map((row) => ({ ...row, kind: "counselling" })),
  ];

  // 1) Real offers (when the optional `quick_help_offers` collection exists
  //    and its rules allow this patient to read).
  const realOffers = await listQuickHelpOffersForPatient(patientUserId);
  // 2) Inferred offers - works without `quick_help_offers` at all by reading
  //    `conversations` + `messages` the patient can already see.
  const inferredOffers = await listInferredQuickHelpOffersForPatient(
    patientUserId,
    tagged,
  );

  // Merge: dedup by (request_kind, request_id, conversation_id). Real offers
  // win because they're added first.
  const offersPerRequest = new Map();
  const consume = (offer) => {
    const reqKey = `${offer.request_kind || "solution"}::${offer.request_id || ""}`;
    if (!offersPerRequest.has(reqKey)) offersPerRequest.set(reqKey, new Map());
    const convMap = offersPerRequest.get(reqKey);
    const convId =
      typeof offer.conversation === "string"
        ? offer.conversation
        : offer.conversation?.id || "";
    if (!convId) return;
    if (!convMap.has(convId)) convMap.set(convId, offer);
  };
  for (const o of realOffers) consume(o);
  for (const o of inferredOffers) consume(o);

  const items = tagged
    .map((row) => {
      const reqKey = `${row.kind}::${row.id}`;
      const convMap = offersPerRequest.get(reqKey);
      return { ...row, offers: convMap ? Array.from(convMap.values()) : [] };
    })
    .sort((a, b) =>
      String(b.created || "").localeCompare(String(a.created || "")),
    );

  return { items };
}

function quickRequestCoinSettlementConfig(kind, request = {}) {
  const requestKind = kind === "counselling" ? "counselling" : "solution";
  const isCounselling = requestKind === "counselling";
  const patientDefault = isCounselling ? 25 : 10;
  const providerDefault = isCounselling ? 15 : 5;
  const platformDefault = isCounselling ? 10 : 5;
  const patientCostCoins =
    Number(request?.patient_cost_coins ?? patientDefault) || patientDefault;
  const providerCoins =
    Number(
      request?.provider_coins ?? request?.doctor_coins ?? providerDefault,
    ) || providerDefault;
  const platformFeeCoins =
    Number(request?.platform_fee_coins ?? platformDefault) || platformDefault;
  return {
    requestKind,
    collection: quickRequestCollectionName(requestKind),
    patientReason: isCounselling
      ? LEDGER_REASON_QUICK_COUNSELLING_SPENT
      : LEDGER_REASON_QUICK_SOLUTION_SPENT,
    providerReason: isCounselling
      ? LEDGER_REASON_QUICK_COUNSELLING_EARNED
      : LEDGER_REASON_QUICK_SOLUTION_EARNED,
    refundReason: isCounselling
      ? LEDGER_REASON_QUICK_COUNSELLING_REFUNDED
      : LEDGER_REASON_QUICK_SOLUTION_REFUNDED,
    patientCostCoins,
    providerCoins,
    platformFeeCoins,
  };
}

async function listCoinLedgerRowsForQuickReason({
  userId,
  collection,
  requestId,
  reason,
}) {
  try {
    return await pb.collection("coin_ledger").getFullList({
      requestKey: null,
      filter: `user="${userId}" && ref_collection="${collection}" && ref_id="${requestId}" && reason="${reason}"`,
    });
  } catch {
    return [];
  }
}

function sumLedgerDelta(rows) {
  return (rows || []).reduce((sum, row) => sum + (Number(row.delta) || 0), 0);
}

/**
 * Settles Quick Solution / Counselling coins only when a provider actually acts.
 * Patient debit and provider credit are kept idempotent per request.
 */
export async function settleQuickRequestCasualCoins({
  requestId,
  kind,
  request,
  patientUserId,
  providerUserId,
  offerId,
  event = "provider_action",
} = {}) {
  const reqId = String(requestId || request?.id || "").trim();
  if (!reqId) throw new Error("Missing quick request id for coin settlement.");

  const cfg = quickRequestCoinSettlementConfig(kind, request);
  let row = request;
  if (!row?.id) {
    row = await pb
      .collection(cfg.collection)
      .getOne(reqId, { requestKey: null });
  }
  const patient = String(
    patientUserId || relationId(row?.patient) || "",
  ).trim();
  const provider = String(
    providerUserId || relationId(row?.recipient) || "",
  ).trim();
  if (!patient || !provider) {
    throw new Error("Missing patient or provider for quick coin settlement.");
  }

  const [patientSpentRows, patientRefundRows, providerRows] = await Promise.all(
    [
      listCoinLedgerRowsForQuickReason({
        userId: patient,
        collection: cfg.collection,
        requestId: reqId,
        reason: cfg.patientReason,
      }),
      listCoinLedgerRowsForQuickReason({
        userId: patient,
        collection: cfg.collection,
        requestId: reqId,
        reason: cfg.refundReason,
      }),
      listCoinLedgerRowsForQuickReason({
        userId: provider,
        collection: cfg.collection,
        requestId: reqId,
        reason: cfg.providerReason,
      }),
    ],
  );
  const patientNet =
    sumLedgerDelta(patientSpentRows) + sumLedgerDelta(patientRefundRows);
  const providerNet = sumLedgerDelta(providerRows);
  const remainingPatientDebit = Math.max(0, cfg.patientCostCoins + patientNet);
  const remainingProviderCredit = Math.max(0, cfg.providerCoins - providerNet);

  if (remainingPatientDebit <= 0 && remainingProviderCredit <= 0) {
    return {
      settled: true,
      alreadySettled: true,
      chargedPatient: false,
      creditedProvider: false,
      patientCoins: cfg.patientCostCoins,
      providerCoins: cfg.providerCoins,
    };
  }

  if (remainingPatientDebit > 0) {
    await assertPatientHasCasualCoins(patient, remainingPatientDebit);
  }

  const meta = {
    wallet: "casual",
    wallet_mode: "casual",
    request_id: reqId,
    request_kind: cfg.requestKind,
    quick_help_offer_id: String(offerId || "").trim() || null,
    patient_user_id: patient,
    provider_user_id: provider,
    doctor_user_id: provider,
    patient_cost_coins: cfg.patientCostCoins,
    provider_coins: cfg.providerCoins,
    platform_fee_coins: cfg.platformFeeCoins,
    settlement_event: event,
    settled_at: new Date().toISOString(),
  };

  let chargedPatient = false;
  if (remainingPatientDebit > 0) {
    await createCoinLedgerLine({
      user: patient,
      delta: -remainingPatientDebit,
      reason: cfg.patientReason,
      ref_collection: cfg.collection,
      ref_id: reqId,
      meta: {
        ...meta,
        settled_debit_coins: remainingPatientDebit,
      },
    });
    chargedPatient = true;
  }

  let creditedProvider = false;
  try {
    if (remainingProviderCredit > 0) {
      await createCoinLedgerLine({
        user: provider,
        delta: remainingProviderCredit,
        reason: cfg.providerReason,
        ref_collection: cfg.collection,
        ref_id: reqId,
        meta: {
          ...meta,
          settled_provider_coins: remainingProviderCredit,
        },
      });
      creditedProvider = true;
      try {
        await upsertDoctorCoinBalance(provider, remainingProviderCredit);
      } catch {
        // ledger remains source of truth if the balance cache is not available
      }
    }
  } catch (creditError) {
    if (chargedPatient) {
      try {
        await createCoinLedgerLine({
          user: patient,
          delta: remainingPatientDebit,
          reason: cfg.refundReason,
          ref_collection: cfg.collection,
          ref_id: reqId,
          meta: {
            ...meta,
            refund_coins: remainingPatientDebit,
            refund_reason: "provider_credit_failed",
          },
        });
      } catch {
        // surface original provider-credit failure
      }
    }
    throw creditError;
  }

  return {
    settled: true,
    alreadySettled: false,
    chargedPatient,
    creditedProvider,
    patientCoins: cfg.patientCostCoins,
    providerCoins: cfg.providerCoins,
  };
}

/** Patient selects a doctor's quick-help offer: settle casual coins once, then close the request. */
export async function acceptQuickHelpOffer({
  offer,
  requestId,
  kind,
  patientUserId,
} = {}) {
  const requestKind = kind === "counselling" ? "counselling" : "solution";
  const collection = quickRequestCollectionName(requestKind);
  const reqId = String(requestId || offer?.request_id || "").trim();
  const doctorUserId = String(
    relationId(offer?.doctor) || relationId(offer?.expand?.doctor) || "",
  ).trim();
  const patient = String(
    patientUserId || relationId(offer?.patient) || getAuthUser()?.id || "",
  ).trim();
  const authId = String(getAuthUser()?.id || "").trim();
  if (!reqId || !doctorUserId || !patient) {
    throw new Error("Missing quick request, doctor, or patient.");
  }
  if (authId && authId !== patient) {
    throw new Error("You can only select offers for your own quick requests.");
  }
  let request = null;
  try {
    request = await pb
      .collection(collection)
      .getOne(reqId, { requestKey: null });
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(msg || "Could not load this quick request.");
  }
  const status = String(request?.status || "queued").toLowerCase();
  if (
    status !== QUICK_REQUEST_STATUS.QUEUED &&
    status !== QUICK_REQUEST_STATUS.ASSIGNED
  ) {
    return { paid: false, closed: true, reason: "request_not_active" };
  }
  const settlement = await settleQuickRequestCasualCoins({
    requestId: reqId,
    kind: requestKind,
    request,
    patientUserId: patient,
    providerUserId: doctorUserId,
    offerId: String(offer?.id || "").trim(),
    event: "patient_accept_offer",
  });
  await pb.collection(collection).update(reqId, {
    status: QUICK_REQUEST_STATUS.CLOSED,
  });
  const offerId = String(offer?.id || "").trim();
  if (offerId && !offerId.startsWith("inferred:")) {
    try {
      await pb.collection("quick_help_offers").update(offerId, {
        status: QUICK_REQUEST_STATUS.CLOSED,
      });
    } catch {
      // optional collection/rules
    }
  }
  return {
    paid: settlement.chargedPatient || settlement.creditedProvider,
    closed: true,
    coins: settlement.providerCoins,
  };
}

/** Patient closes a quick request (after picking a doctor). Status becomes "closed". */
export async function closeQuickRequest({ id, kind }) {
  if (!id) throw new Error("Missing request id.");
  const collection = quickRequestCollectionName(kind);
  return await pb.collection(collection).update(id, {
    status: QUICK_REQUEST_STATUS.CLOSED,
  });
}

/** Patient cancels a quick request (no longer needs help). Status becomes "cancelled". */
export async function cancelQuickRequest({ id, kind }) {
  if (!id) throw new Error("Missing request id.");
  const collection = quickRequestCollectionName(kind);
  return await pb.collection(collection).update(id, {
    status: QUICK_REQUEST_STATUS.CANCELLED,
  });
}

export async function requestPackageDoctorChange({
  patientUserId,
  notes,
  currentDoctorUserId,
}) {
  try {
    return await pb.collection("package_doctor_change_requests").create({
      patient: patientUserId,
      notes: String(notes || "").trim(),
      current_doctor: currentDoctorUserId || "",
      status: "pending",
    });
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Request failed. Add `package_doctor_change_requests` (patient, notes, current_doctor, status). No refund policy applies - see app copy.",
    );
  }
}

export async function persistPreferredQuickProvider(
  patientProfileId,
  doctorUserId,
) {
  if (!patientProfileId) return;
  try {
    await pb.collection("patient_profile").update(patientProfileId, {
      preferred_quick_doctor: doctorUserId,
    });
  } catch {
    try {
      await pb.collection("patient_profile").update(patientProfileId, {
        preferred_quick_provider: doctorUserId,
      });
    } catch (e2) {
      console.log("persistPreferredQuickProvider skipped:", e2?.message);
    }
  }
}
