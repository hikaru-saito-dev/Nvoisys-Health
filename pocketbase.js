import AsyncStorage from "@react-native-async-storage/async-storage";
import PocketBase, { AsyncAuthStore } from "pocketbase";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const PB_URL = "http://100.88.125.1:8090";

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

function getSessionPayload(profile) {
  const user = pb.authStore.record;

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

function getRedirectUrl() {
  return AuthSession.makeRedirectUri({
    path: "oauth",
  });
}

function getProvidersFromAuthMethods(authMethods) {
  return (
    authMethods?.oauth2?.providers ||
    authMethods?.authProviders ||
    authMethods?.oauth2?.authProviders ||
    []
  );
}

function buildAuthUrl(provider, redirectUrl) {
  if (!provider?.authUrl && !provider?.authURL) {
    throw new Error("Missing provider auth URL");
  }

  const baseUrl = provider.authUrl || provider.authURL;
  return `${baseUrl}${encodeURIComponent(redirectUrl)}`;
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

export async function ensureRoleProfile(roleOverride = null) {
  const user = pb.authStore.record;

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
    return await pb.collection(collection).create({
      user: user.id,
    });
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

  await pb.collection("UsersAuth").authWithPassword(email.trim(), password);

  const profile = await ensureRoleProfile(role);
  return getSessionPayload(profile);
}

export async function loginWithEmail({ email, password }) {
  await pb.collection("UsersAuth").authWithPassword(email.trim(), password);

  const profile = await ensureRoleProfile();
  return getSessionPayload(profile);
}

export async function signInWithOAuth({ providerName, selectedRole }) {
  normalizeRole(selectedRole);

  const res = await fetch(`${PB_URL}/api/collections/UsersAuth/auth-methods`);
  const authMethods = await res.json();

  console.log("RAW authMethods:", JSON.stringify(authMethods, null, 2));

  const providers = getProvidersFromAuthMethods(authMethods);
  const provider = providers.find((item) => item.name === providerName);

  if (!provider) {
    throw new Error(
      `${providerName} missing. authMethods=${JSON.stringify(authMethods)}`,
    );
  }

  const redirectUrl = getRedirectUrl();

  let authUrl = buildAuthUrl(provider, redirectUrl);

  if (providerName === "apple") {
    authUrl = authUrl.replace("response_mode=form_post", "response_mode=query");
  }

  console.log("OAuth redirectUrl:", redirectUrl);
  console.log("OAuth authUrl:", authUrl);

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

  console.log("OAuth result:", JSON.stringify(result, null, 2));

  if (result.type !== "success" || !result.url) {
    throw new Error(`${providerName} sign-in cancelled`);
  }

  const returnedUrl = new URL(result.url);
  const code = returnedUrl.searchParams.get("code");
  const state = returnedUrl.searchParams.get("state");
  const error = returnedUrl.searchParams.get("error");
  const errorDescription =
    returnedUrl.searchParams.get("error_description") ||
    returnedUrl.searchParams.get("errorDescription");

  if (error) {
    throw new Error(
      errorDescription
        ? `${providerName} OAuth error: ${error} (${errorDescription})`
        : `${providerName} OAuth error: ${error}`,
    );
  }

  if (!code) {
    throw new Error(`No OAuth code returned from ${providerName}`);
  }

  if (state !== provider.state) {
    throw new Error("OAuth state mismatch");
  }

  await pb
    .collection("UsersAuth")
    .authWithOAuth2Code(
      provider.name,
      code,
      provider.codeVerifier,
      redirectUrl,
      { role: selectedRole },
    );

  const profile = await ensureRoleProfile();
  return getSessionPayload(profile);
}

export function logoutUser() {
  pb.authStore.clear();
}
