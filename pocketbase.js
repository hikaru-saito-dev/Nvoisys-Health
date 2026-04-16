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

const PB_URL = "https://pb.jpoop.in";

// Mobile OAuth2 note:
// PocketBase's "all-in-one" authWithOAuth2 flow depends on a realtime (SSE)
// connection staying alive while the user is in the browser. On Android this
// is often not reliable because the app is backgrounded while Chrome Custom
// Tabs is open.
//
// For Google we use a "manual code exchange" flow with a small HTTPS redirect
// helper page hosted on the PocketBase domain:
// - https://vpn.jpoop.in/oauth2.html (served from PocketBase pb_public)
// That page bounces back into the app via deep link: myapp://oauth2
const OAUTH2_REDIRECT_URL = `https://vpn.jpoop.in/oauth2.html`;
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

export async function restoreAuth() {
  try {
    if (pb.authStore.isValid) {
      await pb.collection("UsersAuth").authRefresh();
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
      return await pb.collection(collection).create({ user: user.id });
    }
    throw error;
  }
}

export async function signUpWithEmail({ name, email, password, role }) {
  normalizeRole(role);

  await pb.collection("UsersAuth").create({
    name: name?.trim() || "",
    email: email.trim(),
    password,
    passwordConfirm: password,
    role,
  });

  const authData = await pb
    .collection("UsersAuth")
    .authWithPassword(email.trim(), password);

  // defensive fallback for older SDK behavior
  if (!getAuthUser() && authData?.token && authData?.record) {
    pb.authStore.save(authData.token, authData.record);
  }

  const profile = await ensureRoleProfile(role);
  return getSessionPayload(profile);
}

export async function loginWithEmail({ email, password }) {
  const authData = await pb
    .collection("UsersAuth")
    .authWithPassword(email.trim(), password);

  if (!getAuthUser() && authData?.token && authData?.record) {
    pb.authStore.save(authData.token, authData.record);
  }

  const profile = await ensureRoleProfile();
  return getSessionPayload(profile);
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
      // - Add `https://vpn.jpoop.in/oauth2.html` to Google Console redirect URIs
      // - Upload `pb_public/oauth2.html` next to your PocketBase executable.

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
