import { generateKeyPairSync, createPrivateKey, sign, createPublicKey, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const XWORKMATE_DIR = join(homedir(), ".xworkmate");
const IDENTITY_PATH = join(XWORKMATE_DIR, "device-identity.json");
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function base64UrlEncode(buf) {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function rawPublicKeyBytes(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  const spki = key.export({ type: "spki", format: "der" });
  if (spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

/**
 * Load existing device identity or create a new one
 * @returns {Object} Device identity with deviceId, publicKeyPem, privateKeyPem
 */
export function loadOrCreateIdentity() {
  if (existsSync(IDENTITY_PATH)) {
    try {
      const stored = JSON.parse(readFileSync(IDENTITY_PATH, "utf8"));
      if (stored.deviceId && stored.publicKeyPem && stored.privateKeyPem) {
        return { deviceId: stored.deviceId, publicKeyPem: stored.publicKeyPem, privateKeyPem: stored.privateKeyPem };
      }
    } catch { /* fall through */ }
  }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const deviceId = createHash("sha256").update(rawPublicKeyBytes(publicKeyPem)).digest("hex");

  const identity = { deviceId, publicKeyPem, privateKeyPem };
  mkdirSync(XWORKMATE_DIR, { recursive: true });
  writeFileSync(IDENTITY_PATH, JSON.stringify({ version: 1, ...identity, createdAtMs: Date.now() }, null, 2) + "\n", { mode: 0o600 });

  return identity;
}

/**
 * Get device ID from existing identity
 * @returns {string|null} Device ID or null if not found
 */
export function getDeviceId() {
  if (!existsSync(IDENTITY_PATH)) {
    return null;
  }
  try {
    const stored = JSON.parse(readFileSync(IDENTITY_PATH, "utf8"));
    return stored.deviceId || null;
  } catch {
    return null;
  }
}

/**
 * Build signed device payload for authentication
 * @param {Object} identity - Device identity
 * @param {Object} opts - Options including nonce, clientId, role, scopes, etc.
 * @returns {Object} Signed device payload
 */
export function buildSignedDevice(identity, opts) {
  const version = opts.nonce ? "v2" : "v1";
  const payload = [
    version,
    identity.deviceId,
    opts.clientId,
    opts.clientMode,
    opts.role,
    opts.scopes.join(","),
    String(opts.signedAtMs),
    opts.token ?? "",
    ...(version === "v2" ? [opts.nonce ?? ""] : []),
  ].join("|");

  const key = createPrivateKey(identity.privateKeyPem);
  const signature = base64UrlEncode(sign(null, Buffer.from(payload, "utf8"), key));

  return {
    id: identity.deviceId,
    publicKey: base64UrlEncode(rawPublicKeyBytes(identity.publicKeyPem)),
    signature,
    signedAt: opts.signedAtMs,
    nonce: opts.nonce,
  };
}