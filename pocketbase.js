// pocketbase.js
import PocketBase from "pocketbase";

export const pb = new PocketBase("http://100.88.125.1:8090/_/");

export async function restoreAuth() {
  try {
    if (pb.authStore.isValid) {
      await pb.collection("users").authRefresh();
    }
  } catch (e) {
    pb.authStore.clear();
  }
}

export async function signUpWithEmail({
  email,
  password,
  name,
  role = "patient",
}) {
  await pb.collection("users").create({
    email,
    password,
    passwordConfirm: password,
    name,
    role,
  });

  await pb.collection("users").authWithPassword(email, password);

  return await ensurePatientProfile();
}

export async function loginWithEmail(email, password) {
  await pb.collection("users").authWithPassword(email, password);
  return await ensurePatientProfile();
}

export async function ensurePatientProfile() {
  const user = pb.authStore.record;
  if (!user) throw new Error("No authenticated user");

  let profile = null;

  try {
    profile = await pb
      .collection("patient_profile")
      .getFirstListItem(`user="${user.id}"`);
  } catch (e) {
    profile = null;
  }

  if (!profile) {
    profile = await pb.collection("patient_profile").create({
      user: user.id,
      full_name: user.name || "",
    });
  }

  return profile;
}

export function logout() {
  pb.authStore.clear();
}
