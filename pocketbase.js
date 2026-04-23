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
 * - `pbAppointmentsCollection` — collection name or id (default `"appointments"`).
 * - `pbAppointmentDoctorIsProfile` — `"true"` if the `doctor` relation points at
 *   **doctor_profile**; omit or `"false"` if `doctor` points at **UsersAuth** / users.
 *
 * **Admin dashboard — you normally must add/update the schema once:**
 * - `patient` (relation → your auth users collection, e.g. UsersAuth)
 * - `doctor` (relation → **either** users **or** doctor_profile — must match the flag above)
 * - `scheduled_at` (datetime)
 * - `consultation_type` (select): include at least `video`, `chat` (or relax / omit field)
 * - `status` (select): include `requested`, `approved`, `rejected` or `declined`,
 *   `paid`, `completed`, and often `pending` / `scheduled` for older rows
 * - `reason` (text, optional but recommended)
 * - `conversation` (relation → conversations, optional)
 * - `consultationFee` or fee on doctor_profile (optional; app reads fee for “Pay fee”)
 *
 * **API rules:** patients need **Create** where `patient = @request.auth.id`;
 * doctors need **List/Update** for their side of the workflow.
 */
export function getPbAppointmentsCollection() {
  return (
    (typeof process !== "undefined" &&
      process.env?.EXPO_PUBLIC_PB_APPOINTMENTS_COLLECTION) ||
    Constants.expoConfig?.extra?.pbAppointmentsCollection ||
    "appointments"
  );
}

/**
 * PocketBase **`orders`** collection (Step 6) — align `status` select with the app:
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

function buildEmailVerificationRequiredError(email = "") {
  const normalizedEmail = String(email || "").trim();
  const targetSuffix = normalizedEmail ? ` for ${normalizedEmail}` : "";

  return new Error(
    `Please verify your email${targetSuffix} before logging in. Use the link sent to your inbox.`,
  );
}

function ensureVerifiedAuthUser(email = "") {
  const user = getAuthUser();

  if (user && !isEmailVerified(user)) {
    pb.authStore.clear();
    throw buildEmailVerificationRequiredError(email || user.email || "");
  }

  return user;
}

export async function restoreAuth() {
  try {
    if (pb.authStore.isValid) {
      await pb.collection("UsersAuth").authRefresh();
      ensureVerifiedAuthUser();
    }
  } catch (error) {
    pb.authStore.clear();
  }
}

function getAuthUser() {
  return pb.authStore.record || pb.authStore.model || null;
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
 *                            medical_conditions (text), allergies (text)
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
  // unknown fields — omitting empties keeps quiet signups working).
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
 * Launch v1.0 — Step 3a: add optional JSON field **`concerns`** (string array of
 * tags, e.g. `["diabetes","hypertension"]`). Doctors edit this in-app on the
 * Doctor Profile screen so Find Doctor concern chips can filter accurately.
 */
async function createDoctorProfileRecord(userId, merged) {
  const specialty = String(merged.specialty || "").trim();
  const clinic_or_hospital = String(merged.clinic_or_hospital || "").trim();

  return await pb.collection("doctor_profile").create({
    user: userId,
    status: "pending",
    specialty,
    clinic_or_hospital,
  });
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
  const fallbackStoreName = String(merged.store_name || authUser?.name || "")
    .trim();

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
        return await pb
          .collection("pharmacy_profile")
          .create({ user: userId });
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

export async function loginWithEmail({ email, password }) {
  const normalizedEmail = (email || "").trim().toLowerCase();

  const authData = await pb
    .collection("UsersAuth")
    .authWithPassword(normalizedEmail, password);

  if (!getAuthUser() && authData?.token && authData?.record) {
    pb.authStore.save(authData.token, authData.record);
  }

  const user = getAuthUser() || authData?.record || null;

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

export function logoutUser() {
  pb.authStore.clear();
}
