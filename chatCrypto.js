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
const ENCRYPTED_IMAGE_PREFIX = "ENCIMGv1|";

function normalizeMimeType(value) {
  const candidate = String(value || "").trim().toLowerCase();
  if (!candidate) return "image/jpeg";
  if (!candidate.startsWith("image/")) return "image/jpeg";
  return candidate;
}

function normalizeBase64(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("data:")) return raw;

  const separatorIndex = raw.indexOf(",");
  if (separatorIndex === -1) return "";
  return raw.slice(separatorIndex + 1).trim();
}

function resolveKeyB64() {
  const extra =
    Constants?.expoConfig?.extra ||
    Constants?.manifest?.extra ||
    Constants?.manifest2?.extra?.expoClient?.extra ||
    Constants?.manifest2?.extra ||
    {};
  if (extra?.chatEncryptionKeyB64) {
    return String(extra.chatEncryptionKeyB64).trim().replace(/^['"]|['"]$/g, "");
  }

  if (process.env.EXPO_PUBLIC_CHAT_ENCRYPTION_KEY_B64) {
    return String(process.env.EXPO_PUBLIC_CHAT_ENCRYPTION_KEY_B64)
      .trim()
      .replace(/^['"]|['"]$/g, "");
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

export function isChatEncryptionEnabled() {
  return !!resolveKeyBytes();
}

export async function encryptChatText(plainText) {
  const keyBytes = resolveKeyBytes();
  if (!keyBytes) return typeof plainText === "string" ? plainText : "";
  const text = typeof plainText === "string" ? plainText : String(plainText);

  const nonce = await Crypto.getRandomBytesAsync(nacl.secretbox.nonceLength);
  const messageBytes = decodeUTF8(text);
  const boxed = nacl.secretbox(messageBytes, nonce, keyBytes);

  // Store as a string so it fits into the existing PocketBase `text` field.
  return `${ENCRYPTED_PREFIX}${encodeBase64(nonce)}|${encodeBase64(boxed)}`;
}

export function decryptChatText(maybeEncrypted) {
  const keyBytes = resolveKeyBytes();
  if (typeof maybeEncrypted !== "string") return "";
  if (!keyBytes) return maybeEncrypted;

  if (!maybeEncrypted.startsWith(ENCRYPTED_PREFIX)) {
    return maybeEncrypted;
  }

  const payload = maybeEncrypted.slice(ENCRYPTED_PREFIX.length);
  const [nonceB64, boxedB64] = payload.split("|");
  if (!nonceB64 || !boxedB64) return "[Encrypted message]";

  try {
    const nonce = decodeBase64(nonceB64);
    const boxed = decodeBase64(boxedB64);
    const opened = nacl.secretbox.open(boxed, nonce, keyBytes);
    if (!opened) return "[Encrypted message]";
    return encodeUTF8(opened);
  } catch {
    return "[Encrypted message]";
  }
}

export async function encryptChatImagePayload({
  base64Data,
  mimeType = "image/jpeg",
  caption = "",
}) {
  const keyBytes = resolveKeyBytes();
  const normalizedBase64 = normalizeBase64(base64Data);
  if (!normalizedBase64) {
    throw new Error("Missing image data");
  }

  const normalizedMime = normalizeMimeType(mimeType);
  const plainCaption =
    typeof caption === "string" ? caption : String(caption || "");

  if (!keyBytes) {
    return `${ENCRYPTED_IMAGE_PREFIX}${JSON.stringify({
      plain: true,
      mimeType: normalizedMime,
      dataB64: normalizedBase64,
      caption: plainCaption,
    })}`;
  }

  const nonce = await Crypto.getRandomBytesAsync(nacl.secretbox.nonceLength);
  const imageBytes = decodeBase64(normalizedBase64);
  const boxed = nacl.secretbox(imageBytes, nonce, keyBytes);
  const encryptedCaption = plainCaption
    ? await encryptChatText(plainCaption)
    : "";

  return `${ENCRYPTED_IMAGE_PREFIX}${JSON.stringify({
    plain: false,
    mimeType: normalizedMime,
    nonceB64: encodeBase64(nonce),
    boxedB64: encodeBase64(boxed),
    caption: encryptedCaption,
  })}`;
}

export function decryptChatImagePayload(maybePayload) {
  const keyBytes = resolveKeyBytes();
  if (typeof maybePayload !== "string") return null;
  if (!maybePayload.startsWith(ENCRYPTED_IMAGE_PREFIX)) return null;

  const rawPayload = maybePayload.slice(ENCRYPTED_IMAGE_PREFIX.length);
  if (!rawPayload) return null;

  try {
    const parsed = JSON.parse(rawPayload);
    const mimeType = normalizeMimeType(parsed?.mimeType);
    const caption =
      typeof parsed?.caption === "string"
        ? decryptChatText(parsed.caption)
        : "";

    if (parsed?.plain) {
      const plainB64 = normalizeBase64(parsed?.dataB64);
      if (!plainB64) {
        return { dataUri: null, caption, error: "[Image unavailable]" };
      }
      return {
        dataUri: `data:${mimeType};base64,${plainB64}`,
        caption,
      };
    }

    if (!keyBytes) {
      return {
        dataUri: null,
        caption,
        error: "[Encrypted image]",
      };
    }

    const nonce = decodeBase64(parsed?.nonceB64 || "");
    const boxed = decodeBase64(parsed?.boxedB64 || "");
    const opened = nacl.secretbox.open(boxed, nonce, keyBytes);

    if (!opened) {
      return {
        dataUri: null,
        caption,
        error: "[Encrypted image]",
      };
    }

    return {
      dataUri: `data:${mimeType};base64,${encodeBase64(opened)}`,
      caption,
    };
  } catch {
    return {
      dataUri: null,
      caption: "",
      error: "[Encrypted image]",
    };
  }
}
