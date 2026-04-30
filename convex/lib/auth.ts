/**
 * Auth primitives — runs inside Convex V8 isolate, so we use
 * Web Crypto (PBKDF2) and crypto.getRandomValues, not Node bcrypt.
 */

const ITERATIONS = 100_000;
const KEY_LEN_BYTES = 32;
const SALT_LEN_BYTES = 16;
const HASH_NAME = "SHA-256";

const enc = new TextEncoder();

function bytesToHex(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  // TS now treats Uint8Array as generic over its backing buffer
  // (ArrayBuffer | SharedArrayBuffer); WebCrypto wants ArrayBuffer-backed
  // BufferSource. Cast at the boundary — bytes are identical at runtime.
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: HASH_NAME,
    },
    baseKey,
    KEY_LEN_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Hash a password. Returns a self-describing string:
 *   pbkdf2-sha256$<iterations>$<saltHex>$<keyHex>
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN_BYTES));
  const key = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(key)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  const salt = hexToBytes(parts[2]);
  const expected = hexToBytes(parts[3]);
  const got = await pbkdf2(password, salt, iterations);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}

/**
 * Session token = 32 random bytes, hex-encoded → 64-char string.
 * Stored on server as SHA-256 hash; raw token only ever sent to client.
 */
export function generateSessionToken(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(token) as BufferSource,
  );
  return bytesToHex(buf);
}

/**
 * Public widget id — 16 random hex chars prefixed with "ws_".
 * Used in the embed snippet, safe to expose.
 */
export function generateWidgetId(): string {
  return (
    "ws_" + bytesToHex(crypto.getRandomValues(new Uint8Array(8)))
  );
}

/**
 * API key — `ptk_live_<32 hex>`. The leading "ptk_live_" prefix lets us
 * tell the source at a glance; the hex tail is what the customer keeps
 * secret. We store SHA-256 of the whole string and only ever return the
 * raw value once, at mint time.
 */
export function generateApiKey(): string {
  return (
    "ptk_live_" + bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  );
}

/**
 * Operator invite token — 32 random bytes hex, prefixed `inv_`.
 * Stored hashed; raw value goes in the email link only.
 */
export function generateInviteToken(): string {
  return "inv_" + bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
}

/**
 * Password reset token — 32 random bytes hex, prefixed `pwr_`.
 * Stored hashed; raw value goes in the reset-link email only.
 */
export function generatePasswordResetToken(): string {
  return "pwr_" + bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
}

/**
 * Webhook signing secret — 32 random bytes hex.
 */
export function generateWebhookSecret(): string {
  return (
    "whsec_" + bytesToHex(crypto.getRandomValues(new Uint8Array(24)))
  );
}

/**
 * HMAC-SHA256 of a payload with a shared secret. Returns hex digest.
 * Used to sign outbound webhook bodies (Stripe-style).
 */
export async function hmacSha256(
  secret: string,
  payload: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(payload) as BufferSource,
  );
  return bytesToHex(sig);
}

/**
 * Slugify a workspace name — lowercase, hyphens, alphanum only.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
