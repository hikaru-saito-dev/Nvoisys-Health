import AsyncStorage from "@react-native-async-storage/async-storage";
import PocketBase, { AsyncAuthStore } from "pocketbase";
import * as WebBrowser from "expo-web-browser";
import EventSource from "react-native-sse";

WebBrowser.maybeCompleteAuthSession();

// PocketBase OAuth2 all-in-one flow relies on realtime.
// React Native needs an EventSource polyfill for that.
if (!global.EventSource) {
  global.EventSource = EventSource;
}

const PB_URL = "https://vpn.jpoop.in";

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
    // Optional sanity check to keep your earlier logging behavior.
    const res = await fetch(`${PB_URL}/api/collections/UsersAuth/auth-methods`);
    const authMethods = await res.json();

    console.log("RAW authMethods:", JSON.stringify(authMethods, null, 2));

    const providers =
      authMethods?.oauth2?.providers ||
      authMethods?.authProviders ||
      authMethods?.oauth2?.authProviders ||
      [];

    const providerExists = providers.some((item) => item.name === providerName);

    if (!providerExists) {
      throw new Error(
        `${providerName} missing. authMethods=${JSON.stringify(authMethods)}`,
      );
    }

    // Clear any stale auth before starting a fresh OAuth attempt.
    pb.authStore.clear();

    // PocketBase-native OAuth flow:
    // - PocketBase handles the provider callback at /api/oauth2-redirect
    // - auth result comes back through a one-off realtime subscription
    const authData = await pb.collection("UsersAuth").authWithOAuth2({
      provider: providerName,
      createData: {
        role: selectedRole,
      },
      urlCallback: async (url) => {
        console.log("OAuth vendor URL:", url);

        // Use auth browser flow. No custom app redirect is needed here
        // because PocketBase handles the callback on its own endpoint.
        const result = await WebBrowser.openAuthSessionAsync(url);

        console.log("OAuth browser result:", JSON.stringify(result, null, 2));

        // On some devices/platforms the session may stay open until the user closes it.
        // PocketBase should still receive the auth callback and complete over realtime.
        return result;
      },
    });

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
