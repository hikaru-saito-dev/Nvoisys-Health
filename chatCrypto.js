import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import nacl from "tweetnacl";
import {
  decodeBase64,
  decodeUTF8,
  encodeBase64,
  encodeUTF8,
} from "tweetnacl-util";

const ENCRYPTED_PREFIX = "ENCv1|";

function resolveKeyB64() {
  // Best practice: inject at build time (EAS/CI) via EXPO_PUBLIC_* env var.
  if (process?.env?.EXPO_PUBLIC_CHAT_ENCRYPTION_KEY_B64) {
    return String(process.env.EXPO_PUBLIC_CHAT_ENCRYPTION_KEY_B64).trim();
  }

  // Fallback for classic manifests/config.
  const extra =
    Constants?.expoConfig?.extra ||
    Constants?.manifest?.extra ||
    Constants?.manifest2?.extra ||
    {};
  if (extra?.chatEncryptionKeyB64) {
    return String(extra.chatEncryptionKeyB64).trim();
  }

  return "";
}

function resolveKeyBytes() {
  const keyB64 = resolveKeyB64();
  if (!keyB64) return null;
  try {
    const key = decodeBase64(keyB64);
    if (key?.length !== nacl.secretbox.keyLength) return null;
    return key;
  } catch {
    return null;
  }
}

const KEY_BYTES = resolveKeyBytes();

export function isChatEncryptionEnabled() {
  return !!KEY_BYTES;
}

export async function encryptChatText(plainText) {
  if (!KEY_BYTES) return typeof plainText === "string" ? plainText : "";
  const text = typeof plainText === "string" ? plainText : String(plainText);

  const nonce = await Crypto.getRandomBytesAsync(nacl.secretbox.nonceLength);
  const messageBytes = decodeUTF8(text);
  const boxed = nacl.secretbox(messageBytes, nonce, KEY_BYTES);

  // Store as a string so it fits into the existing PocketBase `text` field.
  return `${ENCRYPTED_PREFIX}${encodeBase64(nonce)}|${encodeBase64(boxed)}`;
}

export function decryptChatText(maybeEncrypted) {
  if (typeof maybeEncrypted !== "string") return "";
  if (!KEY_BYTES) return maybeEncrypted;

  if (!maybeEncrypted.startsWith(ENCRYPTED_PREFIX)) {
    return maybeEncrypted;
  }

  const payload = maybeEncrypted.slice(ENCRYPTED_PREFIX.length);
  const [nonceB64, boxedB64] = payload.split("|");
  if (!nonceB64 || !boxedB64) return "[Encrypted message]";

  try {
    const nonce = decodeBase64(nonceB64);
    const boxed = decodeBase64(boxedB64);
    const opened = nacl.secretbox.open(boxed, nonce, KEY_BYTES);
    if (!opened) return "[Encrypted message]";
    return encodeUTF8(opened);
  } catch {
    return "[Encrypted message]";
  }
}
