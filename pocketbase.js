import AsyncStorage from "@react-native-async-storage/async-storage";
import PocketBase, { AsyncAuthStore } from "pocketbase";
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

export async function ensureRoleProfile(roleOverride = null) {
  const user = getAuthUser();

  if (!user) {
    throw new Error("No authenticated user");
  }

  const role = normalizeRole(roleOverride || user.role);
  const collection = ROLE_TO_PROFILE_COLLECTION[role];

  try {
    return await pb
      .collection(collection)
      .getFirstListItem(`user="${user.id}"`, { requestKey: null });
  } catch (error) {
    if (error?.status === 404) {
      // For doctors, start in "pending" until manually approved in PocketBase.
      const payload =
        role === "doctor"
          ? {
              user: user.id,
              status: "pending",
            }
          : { user: user.id };

      return await pb.collection(collection).create(payload);
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
}) {
  normalizeRole(role);

  const normalizedEmail = (email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");
  const normalizedPasswordConfirm = String(
    passwordConfirm == null ? normalizedPassword : passwordConfirm,
  );

  await pb.collection("UsersAuth").create({
    name: name?.trim() || "",
    email: normalizedEmail,
    password: normalizedPassword,
    passwordConfirm: normalizedPasswordConfirm,
    role,
  });

  try {
    await pb
      .collection("UsersAuth")
      .requestVerification(normalizedEmail, { requestKey: null });
  } catch {
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

  const profile = await ensureRoleProfile();
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
