import AsyncStorage from "@react-native-async-storage/async-storage";
import PocketBase, { AsyncAuthStore } from "pocketbase";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import EventSource from "react-native-sse";

WebBrowser.maybeCompleteAuthSession();

// PocketBase OAuth2 all-in-one flow relies on realtime.
// React Native needs an EventSource polyfill for that.
if (!global.EventSource) {
  global.EventSource = EventSource;
}

const PB_URL = "https://pbs.nvoisyshealth.com";
const OAUTH2_REDIRECT_URL = `https://nvoisyshealth.com/authredirect`;
const APP_OAUTH2_RETURN_URL = "myapp://oauth2";

const authStore = new AsyncAuthStore({
  save: async (serialized) => {
    await AsyncStorage.setItem("pb_auth", serialized);
  },
  initial: AsyncStorage.getItem("pb_auth"),
});

export const pb = new PocketBase(PB_URL, authStore);

/**
 * PocketBase **appointments** collection (patient booking + doctor approval + pay).
 *
 * Configure in **Expo** `app.json` → `expo.extra`:
 * - `pbAppointmentsCollection` - collection name or id (default `"appointments"`).
 * - `pbAppointmentDoctorIsProfile` - `"true"` if the `doctor` relation points at
 *   **doctor_profile**; omit or `"false"` if `doctor` points at **UsersAuth** / users.
 *
 * **Admin dashboard - you normally must add/update the schema once:**
 * - `patient` (relation → your auth users collection, e.g. UsersAuth)
 * - `doctor` (relation → **either** users **or** doctor_profile - must match the flag above)
 * - `scheduled_at` (datetime)
 * - `consultation_type` (select): include at least `video`, `chat` (or relax / omit field)
 * - `status` (select): include `requested`, `pending`, `approved`, `rejected` or `declined`,
 *   **`ask_reschedule`** (doctor proposes new times; patient picks on same row), **`cancelled`**,
 *   `paid`, `completed`, and often `scheduled` for older rows (Package Doctor demos use
 *   `requested` → `approved` → patient cancel uses **`cancelled`**)
 * - `reason` (text, optional but recommended) - long text; package demos append
 *   `---NVHS_MEETING_WORKFLOW---` + JSON
 * - **`workflow_json` (JSON, optional but strongly recommended)** - stores the meeting workflow
 *   without truncation. Keys the app reads/writes include: `status` (e.g. `awaiting_doctor`,
 *   `doctor_proposed_slots`, `awaiting_doctor_after_patient_pick`, `confirmed`), `proposed_at`,
 *   `confirmed_at`, `patient_selected_slot`, `doctor_alternate_slots`, `messages`,
 *   `patient_auth_user_id`, `doctor_auth_user_id`, **`package_offer_id`**, **`package_request_label`**,
 *   **`demo_conversation_id`**. If this field is missing, the app falls back to parsing `reason` only
 *   (easier to hit length limits).
 * - `conversation` (relation → **conversations**, optional) - set to the **per-demo-meeting** chat
 *   when the patient or doctor opens “Go to chat” for that package appointment (see `conversations`
 *   below).
 * - `consultationFee` or fee on doctor_profile (optional; app reads fee for “Pay fee”)
 * - **Package Doctor demo meetings** reuse this collection: same relations + `scheduled_at` /
 *   `consultation_type` / `status`, plus `workflow_json` / `reason` as above. Set
 *   **`pbAppointmentDoctorIsProfile`** in `app.json` to match whether `doctor` points at
 *   **doctor_profile** or **users**.
 *
 * **`conversations` (for Package Doctor demo threads)**
 * The app creates a **separate** conversation per package-demo appointment (not the generic DM).
 * Recommended fields (names must match your Admin schema - check **API rules** generated names):
 * - `members` - relation to auth users (multi), exactly **patient + doctor** user ids
 * - `title` - text (short label, e.g. “Package demo”)
 * - **`kind`** - text, optional - app tries value `package_demo`; if Create fails (unknown field),
 *   it retries **without** `kind`
 * - **`lastMessageAt`** or **`last_message_at`** - datetime - use the same casing as your existing
 *   `conversations` rows / `ensureDirectConversation` in `App.js`
 *
 * **`package_offers`**
 * Unchanged core: `patient`, `doctor`, `title`, `amount_inr`, `platform_fee_inr`, `doctor_coins`,
 * `sessions`, `validity_days`, `notes`, `status` (`sent` / `paid` / …). The app **links** an offer
 * to a demo meeting by storing **`package_offer_id`** on the appointment’s **`workflow_json`**
 * (no extra relation required on `package_offers`).
 *
 * **API rules (minimum)**
 * - **appointments - Create:** patient can create when `@request.auth.id` is set and
 *   `patient = @request.auth.id` (and doctor points at allowed doctor ids / profile ids).
 * - **appointments - Update:** patient may update **own** rows (cancel package request, workflow);
 *   doctor may update rows where they are the assigned doctor (accept, reschedule, confirm,
 *   attach package link via workflow). Use `@request.auth.id` and your `doctor` / `patient` relation
 *   shape (user id vs profile id) in filters.
 * - **appointments - List:** patient lists own; doctor lists where doctor relation matches (often two
 *   list rules if `doctor` can be profile or user id).
 * - **conversations - Create:** allow authenticated users who are members of `members` to create, or
 *   a broader rule if you trust member ids from the app.
 * - **conversations - List / View:** user must be in `members`.
 * - **messages - Create:** sender must be `@request.auth.id` and a member of the conversation.
 */
export function getPbAppointmentsCollection() {
  return (
    (typeof process !== "undefined" &&
      process.env?.EXPO_PUBLIC_PB_APPOINTMENTS_COLLECTION) ||
    Constants.expoConfig?.extra?.pbAppointmentsCollection ||
    "appointments"
  );
}

export async function recordPaymentTransaction({
  patientUserId,
  doctorUserId,
  sourceCollection,
  sourceId,
  kind,
  provider = "stub",
  providerOrderId,
  providerPaymentId,
  providerReferenceId,
  amountInr,
  amountPaise,
  currency = "INR",
  status = "success",
  description,
  customerName,
  customerEmail,
  customerPhone,
  metadata,
} = {}) {
  const activeUserId = getAuthUser()?.id || "";
  const rupees = Number(amountInr);
  const paise = Number(amountPaise);
  const computedAmountInr = Number.isFinite(rupees)
    ? rupees
    : Number.isFinite(paise)
      ? paise / 100
      : 0;
  const computedAmountPaise = Number.isFinite(paise)
    ? Math.round(paise)
    : Math.round(computedAmountInr * 100);
  const payload = {
    source_collection: String(sourceCollection || "").trim(),
    source_id: String(sourceId || "").trim(),
    kind: String(kind || "").trim(),
    provider: String(provider || "stub").trim(),
    provider_order_id: String(providerOrderId || "").trim(),
    provider_payment_id: String(providerPaymentId || "").trim(),
    provider_reference_id: String(providerReferenceId || "").trim(),
    amount_inr: computedAmountInr,
    amount_paise: computedAmountPaise,
    currency: String(currency || "INR")
      .trim()
      .toUpperCase(),
    status: String(status || "success").trim(),
    paid_at: new Date().toISOString(),
    description: String(description || "").trim(),
    customer_name: String(customerName || "").trim(),
    customer_email: String(customerEmail || "").trim(),
    customer_phone: String(customerPhone || "").trim(),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  };
  const patient = String(patientUserId || activeUserId || "").trim();
  const doctor = String(doctorUserId || "").trim();
  if (patient) payload.patient = patient;
  if (doctor) payload.doctor = doctor;

  try {
    return await pb.collection("payment_transactions").create(payload);
  } catch (error) {
    throw new Error(
      formatPocketBaseClientError(error) ||
        error?.message ||
        "Payment succeeded, but saving the transaction to PocketBase failed. Add the `payment_transactions` collection and fields.",
    );
  }
}

/**
 * PocketBase **`orders`** collection (Step 6) - align `status` select with the app:
 * `pending`, `confirmed`, `out_for_delivery`, `fulfilled`, `cancelled`.
 * Legacy values `packed`, `dispatched`, `delivered` are still accepted when reading
 * old rows; new updates use the canonical chain above.
 */

/** @returns {boolean} True when `appointments.doctor` relates to doctor_profile, not auth user id. */
export function isPbAppointmentDoctorProfileRelation() {
  return (
    String(
      (typeof process !== "undefined" &&
        process.env?.EXPO_PUBLIC_PB_APPOINTMENT_DOCTOR_IS_PROFILE) ||
        Constants.expoConfig?.extra?.pbAppointmentDoctorIsProfile ||
        "",
    ).toLowerCase() === "true"
  );
}

const ROLE_TO_PROFILE_COLLECTION = {
  patient: "patient_profile",
  doctor: "doctor_profile",
  pharmacy: "pharmacy_profile",
};

function normalizeRole(role) {
  if (!ROLE_TO_PROFILE_COLLECTION[role]) {
    throw new Error(`Unsupported role: ${role}`);
  }
  return role;
}

function isEmailVerified(user) {
  return Boolean(user?.verified);
}

const LOGIN_HOLD_STORAGE_PREFIX = "login_hold:";
const LOGIN_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_HOLD_MS = 20 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;

function getLoginHoldStorageKey(email) {
  return `${LOGIN_HOLD_STORAGE_PREFIX}${String(email || "")
    .trim()
    .toLowerCase()}`;
}

function formatHoldRemaining(untilMs) {
  const remainingMinutes = Math.max(
    1,
    Math.ceil((untilMs - Date.now()) / 60000),
  );
  return `${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`;
}

function buildLoginHoldError(untilMs) {
  const error = new Error(
    `Too many login attempts. This account is on hold for about ${formatHoldRemaining(untilMs)}. Please try again later.`,
  );
  error.code = "LOGIN_ACCOUNT_HOLD";
  error.holdUntil = untilMs;
  return error;
}

async function readLoginHoldState(email) {
  if (!email) return { attempts: [], lockedUntil: 0 };

  try {
    const raw = await AsyncStorage.getItem(getLoginHoldStorageKey(email));
    if (!raw) return { attempts: [], lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      attempts: Array.isArray(parsed?.attempts) ? parsed.attempts : [],
      lockedUntil: Number(parsed?.lockedUntil || 0),
    };
  } catch (_) {
    return { attempts: [], lockedUntil: 0 };
  }
}

async function writeLoginHoldState(email, state) {
  if (!email) return;
  await AsyncStorage.setItem(
    getLoginHoldStorageKey(email),
    JSON.stringify(state),
  );
}

async function clearLoginHoldState(email) {
  if (!email) return;
  try {
    await AsyncStorage.removeItem(getLoginHoldStorageKey(email));
  } catch (_) {
    // ignore
  }
}

async function assertLoginNotOnHold(email) {
  const state = await readLoginHoldState(email);
  const now = Date.now();

  if (state.lockedUntil > now) {
    throw buildLoginHoldError(state.lockedUntil);
  }

  if (state.lockedUntil || state.attempts.length) {
    const attempts = state.attempts.filter(
      (attemptMs) => now - Number(attemptMs) <= LOGIN_FAILURE_WINDOW_MS,
    );
    if (attempts.length) {
      await writeLoginHoldState(email, { attempts, lockedUntil: 0 });
    } else {
      await clearLoginHoldState(email);
    }
  }
}

function isCredentialFailure(error) {
  const status =
    typeof error?.status === "number"
      ? error.status
      : typeof error?.response?.status === "number"
        ? error.response.status
        : null;
  return status === 400 || status === 401;
}

async function recordLoginFailure(email) {
  const now = Date.now();
  const state = await readLoginHoldState(email);
  const attempts = state.attempts
    .map((attemptMs) => Number(attemptMs))
    .filter((attemptMs) => Number.isFinite(attemptMs))
    .filter((attemptMs) => now - attemptMs <= LOGIN_FAILURE_WINDOW_MS);

  attempts.push(now);

  if (attempts.length >= LOGIN_FAILURE_LIMIT) {
    const lockedUntil = now + LOGIN_HOLD_MS;
    await writeLoginHoldState(email, { attempts: [], lockedUntil });
    return buildLoginHoldError(lockedUntil);
  }

  await writeLoginHoldState(email, { attempts, lockedUntil: 0 });
  return null;
}

function buildEmailVerificationRequiredError(email = "") {
  const normalizedEmail = String(email || "").trim();
  const targetSuffix = normalizedEmail ? ` for ${normalizedEmail}` : "";

  return new Error(
    `Please verify your email${targetSuffix} before logging in. Use the link sent to your inbox.`,
  );
}

function ensureSelectedRoleMatchesUser(user, selectedRole) {
  if (!selectedRole) return;

  const normalizedSelectedRole = normalizeRole(selectedRole);
  const actualRole = normalizeRole(user?.role);

  if (actualRole !== normalizedSelectedRole) {
    pb.authStore.clear();
    throw new Error(
      `This account is registered as a ${actualRole}. Please choose ${actualRole} to log in.`,
    );
  }
}

function ensureVerifiedAuthUser(email = "") {
  const user = getAuthUser();

  if (user && !isEmailVerified(user)) {
    pb.authStore.clear();
    throw buildEmailVerificationRequiredError(email || user.email || "");
  }

  return user;
}

/** True when authRefresh failed for invalid/expired credentials - safe to drop the local session. */
function shouldClearAuthOnRefreshFailure(error) {
  if (!error) return false;
  if (error.isAbort) return false;
  const status =
    typeof error.status === "number"
      ? error.status
      : typeof error?.response?.status === "number"
        ? error.response.status
        : null;
  return status === 401 || status === 403;
}

/**
 * Loads persisted PocketBase auth from AsyncStorage into memory, then optionally refreshes.
 * AsyncAuthStore hydrates `initial` asynchronously, so on cold start `isValid` can be false
 * until we explicitly load - without this, users always see the login flow after killing the app.
 */
export async function restoreAuth() {
  try {
    const raw = await AsyncStorage.getItem("pb_auth");
    if (raw && typeof raw === "string" && raw.trim()) {
      const trimmed = raw.trim();
      try {
        // AsyncAuthStore persists JSON `{ token, record }` (see pocketbase AsyncAuthStore.save).
        const parsed = JSON.parse(trimmed);
        const token = parsed?.token || "";
        const model = parsed?.record || parsed?.model || null;
        if (token) {
          pb.authStore.save(token, model);
        }
      } catch (_) {
        try {
          pb.authStore.loadFromCookie(trimmed);
        } catch (e) {
          console.log("restoreAuth hydrate:", e?.message);
        }
      }
    }

    // Refresh whenever we have a token (JWT may be past local `exp` but still refreshable).
    if (!String(pb.authStore.token || "").trim()) {
      return;
    }

    try {
      await pb.collection("UsersAuth").authRefresh();
      ensureVerifiedAuthUser();
    } catch (error) {
      if (shouldClearAuthOnRefreshFailure(error)) {
        pb.authStore.clear();
        try {
          await AsyncStorage.removeItem("pb_auth");
        } catch (_) {
          // ignore
        }
      } else {
        console.log(
          "restoreAuth authRefresh skipped clear (likely offline):",
          error?.message || error,
        );
      }
    }
  } catch (error) {
    console.log("restoreAuth error:", error?.message || error);
  }
}

/** Current PocketBase JS SDK exposes the auth record as `model` only (`record` is undefined). */
export function getAuthUser() {
  return pb.authStore.model || pb.authStore.record || null;
}

function getSessionPayload(profile) {
  const user = getAuthUser();

  if (!user) {
    throw new Error("No authenticated user");
  }

  return {
    user,
    role: user.role,
    profile,
    profileCollection: ROLE_TO_PROFILE_COLLECTION[user.role],
  };
}

function compactProfileFields(fields) {
  if (!fields || typeof fields !== "object") return {};
  const { avatarAsset: _a, ...rest } = fields;
  return Object.fromEntries(
    Object.entries(rest).filter(
      ([, v]) => v !== undefined && v !== null && String(v).trim() !== "",
    ),
  );
}

/**
 * Matches PocketBase `patient_profile`:
 *   Required (pre-existing): user, primary_condition, gender
 *   Optional (pre-existing): phone
 *   Optional (Launch v1.0):  age (number), weight_kg (number), height_cm (number),
 *                            marital_status (text/select), district (text), state (text),
 *                            smoking (text/select), alcohol (text/select),
 *                            medical_conditions (text), allergies (text),
 *                            language (text — comfortable consultation language)
 *   Product spec: care_mode (text/select: package_doctor | casual | not_planning),
 *                  preferred_quick_doctor / preferred_quick_provider (relation → UsersAuth, optional)
 * Avatar is uploaded after create in signUpWithEmail (file field).
 */
async function createPatientProfileRecord(userId, merged) {
  const primary_condition = String(merged.primary_condition || "").trim();
  const gender = String(merged.gender || "").trim();
  const phone = String(merged.phone || "").trim();

  const payload = {
    user: userId,
    primary_condition,
    gender,
  };
  if (phone) {
    payload.phone = phone;
  }

  // Launch v1.0 additions. Each field is written only when a non-empty
  // value is supplied, so this remains backwards compatible with older
  // PocketBase schemas that have not added the fields yet (PB will reject
  // unknown fields - omitting empties keeps quiet signups working).
  const numericFields = ["age", "weight_kg", "height_cm"];
  for (const key of numericFields) {
    const raw = merged[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      continue;
    }
    const num = Number(String(raw).trim());
    if (Number.isFinite(num)) {
      payload[key] = num;
    }
  }
  const textFields = [
    "marital_status",
    "district",
    "state",
    "smoking",
    "alcohol",
    "medical_conditions",
    "allergies",
    "language",
  ];
  for (const key of textFields) {
    const value = String(merged[key] || "").trim();
    if (value) {
      payload[key] = value;
    }
  }

  return await pb.collection("patient_profile").create(payload);
}

/**
 * Matches PocketBase `doctor_profile`: user, status, specialty, clinic_or_hospital.
 * Status select: pending | approved | rejection
 *
 * Launch v1.0 - Step 3a: add optional JSON field **`concerns`** (string array of
 * tags, e.g. `["diabetes","hypertension"]`). Doctors edit this in-app on the
 * Doctor Profile screen so Find Doctor concern chips can filter accurately.
 *
 * Product spec: optional **`practitioner_tier`** (select: rmp | clinic | professional |
 * specialist) - Quick Solution / Quick Counselling prefer non-professional tiers;
 * package flows use professional doctors. Optional **`coin_balance`** (number) for wallet UI.
 * **`package_templates`** or alias **`packages_template`** (JSON): store an array of
 * **`{ slot, total_amount_inr }`** (length 3) - package titles, periods, descriptions & features are
 * **app-defined**; doctors only set fees. When the doctor taps Skip onboarding, the app may store
 * **`{ "skipped": true }`** instead of the fee array. Bool **`package_setup`**: **`true`** when all
 * three fees are saved; **`false`** when incomplete or skipped. Legacy: **`packages_setup_complete`**,
 * **`package_setup_skipped`** (still sent on some writes for older schemas).
 * **Update rule:** doctors must be allowed to update their own row (e.g. `user = @request.auth.id`),
 * not admin-only, or the app falls back to on-device storage for fees until rules are fixed.
 *
 * Package demo meetings use the **`appointments`** collection (see block above), not a separate
 * collection.
 */
async function createDoctorProfileRecord(userId, merged) {
  const specialty = String(merged.specialty || "").trim();
  const clinic_or_hospital = String(merged.clinic_or_hospital || "").trim();
  const language = String(merged.language || "").trim();

  const payload = {
    user: userId,
    status: "pending",
    specialty,
    clinic_or_hospital,
  };
  if (language) payload.language = language;

  return await pb.collection("doctor_profile").create(payload);
}

/**
 * Matches PocketBase `pharmacy_profile` (Launch v1.0):
 *   Required: user (relation -> UsersAuth)
 *   Optional: store_name, tagline, address, district, state, phone,
 *             opening_hours (JSON), closing_days (JSON), products (JSON)
 *
 * The pharmacy fills out the rest of these via PharmacyProfileScreen after
 * logging in. We seed `store_name` with the auth user's name when available
 * so the row is never empty. If PocketBase rejects the create because a
 * field has been marked required/unique on the server, we retry with a
 * minimal payload so signup/login can still succeed.
 */
async function createPharmacyProfileRecord(userId, merged) {
  const authUser = getAuthUser();
  const fallbackStoreName = String(
    merged.store_name || authUser?.name || "",
  ).trim();

  const payload = { user: userId };
  if (fallbackStoreName) payload.store_name = fallbackStoreName;

  const textKeys = ["tagline", "address", "district", "state", "phone"];
  for (const key of textKeys) {
    const value = String(merged[key] || "").trim();
    if (value) payload[key] = value;
  }
  if (merged.opening_hours && typeof merged.opening_hours === "object") {
    payload.opening_hours = merged.opening_hours;
  }
  if (Array.isArray(merged.closing_days)) {
    payload.closing_days = merged.closing_days;
  }
  if (Array.isArray(merged.products)) {
    payload.products = merged.products;
  }

  try {
    return await pb.collection("pharmacy_profile").create(payload);
  } catch (error) {
    // If the schema rejects an unknown/required column we don't know about,
    // try the minimal `{ user }` payload so the user can still complete
    // signup. They will fill the rest from PharmacyProfileScreen.
    if (error?.status === 400) {
      try {
        return await pb.collection("pharmacy_profile").create({ user: userId });
      } catch (innerError) {
        console.log(
          "Pharmacy profile minimal create also failed:",
          innerError?.message || innerError,
        );
        throw innerError;
      }
    }
    throw error;
  }
}

export function formatPocketBaseClientError(error) {
  const fieldBlock = error?.response?.data?.data || error?.data?.data || null;
  if (fieldBlock && typeof fieldBlock === "object") {
    for (const v of Object.values(fieldBlock)) {
      if (v && typeof v === "object" && v.message) {
        return String(v.message);
      }
    }
  }
  return (
    error?.response?.data?.message ||
    error?.data?.message ||
    error?.message ||
    ""
  );
}

function uploadPartFromImageAsset(asset) {
  const uri = asset?.uri;
  if (!uri) return null;
  let mimeType =
    (asset.mimeType && String(asset.mimeType)) ||
    (typeof asset.type === "string" && asset.type.includes("/")
      ? asset.type
      : null) ||
    "image/jpeg";
  const ext = String(uri).split("?")[0].split("#")[0].split(".").pop();
  const low = String(ext || "").toLowerCase();
  if (low === "png") mimeType = "image/png";
  else if (low === "webp") mimeType = "image/webp";
  else if (low === "heic" || low === "heif") mimeType = "image/heic";
  const extFromMime = mimeType.split("/")[1] || "jpg";
  const safeExt = ["png", "webp", "heic", "heif"].includes(
    String(extFromMime).toLowerCase(),
  )
    ? String(extFromMime).toLowerCase()
    : "jpg";
  const name = asset.fileName || `avatar_${Date.now()}.${safeExt}`;
  return { uri, name, type: mimeType };
}

export async function ensureRoleProfile(roleOverride = null, extraFields = {}) {
  const user = getAuthUser();

  if (!user) {
    throw new Error("No authenticated user");
  }

  const role = normalizeRole(roleOverride || user.role);
  const collection = ROLE_TO_PROFILE_COLLECTION[role];
  const merged = compactProfileFields(extraFields);

  try {
    return await pb
      .collection(collection)
      .getFirstListItem(`user="${user.id}"`, { requestKey: null });
  } catch (error) {
    if (error?.status === 404) {
      if (role === "doctor") {
        return await createDoctorProfileRecord(user.id, merged);
      }
      if (role === "patient") {
        return await createPatientProfileRecord(user.id, merged);
      }
      if (role === "pharmacy") {
        // Pharmacy profile creation should never block login. If the schema
        // has unexpected required/unique fields, we log and return null;
        // the user can finish their profile from PharmacyProfileScreen.
        try {
          return await createPharmacyProfileRecord(user.id, merged);
        } catch (createError) {
          console.log(
            "Pharmacy profile create skipped:",
            createError?.message || createError,
          );
          return null;
        }
      }
      return await pb.collection(collection).create({
        user: user.id,
        ...merged,
      });
    }
    throw error;
  }
}

export async function signUpWithEmail({
  name,
  email,
  password,
  passwordConfirm,
  role,
  profileFields = {},
}) {
  normalizeRole(role);

  const normalizedEmail = (email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");
  const normalizedPasswordConfirm = String(
    passwordConfirm == null ? normalizedPassword : passwordConfirm,
  );

  const { avatarAsset, ...rawProfile } = profileFields || {};
  const profilePayload = compactProfileFields(rawProfile);

  await pb.collection("UsersAuth").create({
    name: name?.trim() || "",
    email: normalizedEmail,
    password: normalizedPassword,
    passwordConfirm: normalizedPasswordConfirm,
    role,
  });

  // Briefly authenticate so we can seed the role-specific profile with
  // collected fields (primary_condition, specialty, avatar, etc.). The user
  // will still need to verify their email before being allowed to fully log
  // back in via loginWithEmail.
  try {
    const authData = await pb
      .collection("UsersAuth")
      .authWithPassword(normalizedEmail, normalizedPassword);

    if (!getAuthUser() && authData?.token && authData?.record) {
      pb.authStore.save(authData.token, authData.record);
    }

    let profile = await ensureRoleProfile(role, profilePayload);

    if (role === "patient" && avatarAsset?.uri && profile?.id) {
      const part = uploadPartFromImageAsset(avatarAsset);
      if (part) {
        try {
          const formData = new FormData();
          formData.append("avatar", part);
          await pb.collection("patient_profile").update(profile.id, formData);
        } catch (avatarError) {
          console.log("Patient profile avatar upload skipped:", avatarError);
        }
      }
    }
  } catch (setupError) {
    console.log("Signup profile setup error:", setupError);
  }

  try {
    await pb
      .collection("UsersAuth")
      .requestVerification(normalizedEmail, { requestKey: null });
  } catch {
    pb.authStore.clear();
    throw new Error(
      "Account created, but we could not send the verification email. Please try logging in to request a new verification link.",
    );
  }

  pb.authStore.clear();

  return {
    email: normalizedEmail,
    verificationEmailSent: true,
  };
}

export async function loginWithEmail({ email, password, selectedRole }) {
  const normalizedEmail = (email || "").trim().toLowerCase();

  await assertLoginNotOnHold(normalizedEmail);

  let authData;
  try {
    authData = await pb
      .collection("UsersAuth")
      .authWithPassword(normalizedEmail, password);
  } catch (error) {
    if (isCredentialFailure(error)) {
      const holdError = await recordLoginFailure(normalizedEmail);
      if (holdError) throw holdError;
    }
    throw error;
  }

  await clearLoginHoldState(normalizedEmail);

  if (!getAuthUser() && authData?.token && authData?.record) {
    pb.authStore.save(authData.token, authData.record);
  }

  const user = getAuthUser() || authData?.record || null;

  ensureSelectedRoleMatchesUser(user, selectedRole);

  if (user && !isEmailVerified(user)) {
    pb.authStore.clear();

    if (normalizedEmail) {
      try {
        await pb
          .collection("UsersAuth")
          .requestVerification(normalizedEmail, { requestKey: null });
      } catch (resendError) {
        console.log("Verification email resend error:", resendError);
      }
    }

    throw buildEmailVerificationRequiredError(normalizedEmail);
  }

  // Pharmacy profile setup is best-effort: if the row doesn't exist yet and
  // the create fails (API rules / required fields), still let the pharmacy
  // log in. They can finish setup from PharmacyProfileScreen.
  let profile = null;
  try {
    profile = await ensureRoleProfile();
  } catch (profileError) {
    if (normalizeRole(user?.role) === "pharmacy") {
      console.log(
        "Pharmacy profile setup failed during login:",
        profileError?.message || profileError,
      );
      profile = null;
    } else {
      throw profileError;
    }
  }
  return getSessionPayload(profile);
}

export async function requestPasswordReset(email) {
  const normalizedEmail = (email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Please enter your email");
  }

  // PocketBase needs SMTP configured and template action URL set.
  // Example action URL: https://nvoisyshealth.com/reset-password?token={TOKEN}
  await pb
    .collection("UsersAuth")
    .requestPasswordReset(normalizedEmail, { requestKey: null });
}

export async function signInWithOAuth({ providerName, selectedRole }) {
  normalizeRole(selectedRole);

  try {
    const authMethods = await pb
      .collection("UsersAuth")
      .listAuthMethods({ requestKey: null });

    console.log("RAW authMethods:", JSON.stringify(authMethods, null, 2));

    const provider = authMethods?.authProviders?.find(
      (item) => item.name === providerName,
    );

    if (!provider) {
      throw new Error(
        `${providerName} missing. authMethods=${JSON.stringify(authMethods)}`,
      );
    }

    // Clear any stale auth before starting a fresh OAuth attempt.
    pb.authStore.clear();

    let authData;

    if (providerName === "google") {
      // Manual code exchange (recommended on mobile):
      // 1) Open Google's consent screen with redirect_uri pointing to an HTTPS page.
      // 2) That page redirects back into the app via deep link (myapp://oauth2).
      // 3) Exchange the received code via PocketBase authWithOAuth2Code.

      // IMPORTANT:
      // - Add `https://nvoisyshealth.com/authredirect` to Google Console redirect URIs
      // - The redirect page bounces back into the app via deep link (myapp://oauth2).

      const authUrl = `${provider.authUrl}${OAUTH2_REDIRECT_URL}`;
      console.log("OAuth vendor URL:", authUrl);

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        APP_OAUTH2_RETURN_URL,
      );

      console.log("OAuth browser result:", JSON.stringify(result, null, 2));

      if (result?.type !== "success" || !result.url) {
        throw new Error("Google authentication cancelled");
      }

      const parsed = Linking.parse(result.url);
      const code = parsed?.queryParams?.code;
      const state = parsed?.queryParams?.state;
      const error = parsed?.queryParams?.error;
      const errorDescription = parsed?.queryParams?.error_description;

      if (error) {
        throw new Error(
          `Google OAuth error: ${error}${errorDescription ? ` (${errorDescription})` : ""}`,
        );
      }

      if (!code) {
        throw new Error(
          `Google OAuth missing code. url=${JSON.stringify(result.url)}`,
        );
      }

      if (!state || state !== provider.state) {
        throw new Error(
          `Google OAuth state mismatch. expected=${provider.state} got=${state}`,
        );
      }

      authData = await pb
        .collection("UsersAuth")
        .authWithOAuth2Code(
          provider.name,
          code,
          provider.codeVerifier,
          OAUTH2_REDIRECT_URL,
          {
            role: selectedRole,
          },
        );
    } else {
      // PocketBase-native OAuth flow (realtime-based).
      authData = await pb.collection("UsersAuth").authWithOAuth2({
        provider: providerName,
        createData: {
          role: selectedRole,
        },
        urlCallback: async (url) => {
          console.log("OAuth vendor URL:", url);

          const result = await WebBrowser.openAuthSessionAsync(url);

          console.log("OAuth browser result:", JSON.stringify(result, null, 2));

          return result;
        },
      });
    }

    console.log("OAuth authData:", JSON.stringify(authData, null, 2));

    const user = getAuthUser() || authData?.record || null;

    ensureSelectedRoleMatchesUser(user, selectedRole);

    if (user && !isEmailVerified(user)) {
      pb.authStore.clear();
      throw buildEmailVerificationRequiredError(user.email || "");
    }

    const profile = await ensureRoleProfile();
    return getSessionPayload(profile);
  } catch (error) {
    console.log("Google auth error:", error);

    // PocketBase errors are usually ClientResponseError with response/originalError.
    if (error?.response) {
      console.log(
        "PocketBase error response:",
        JSON.stringify(error.response, null, 2),
      );
    }

    if (error?.originalError) {
      console.log("PocketBase originalError:", error.originalError);
    }

    throw error;
  }
}

export async function logoutUser() {
  pb.authStore.clear();
  try {
    await AsyncStorage.removeItem("pb_auth");
  } catch (_) {
    // ignore
  }
}
