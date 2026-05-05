/**
 * Auth primitives — runs inside Convex V8 isolate, so we use
 * Web Crypto + a pure-JS bcrypt port (bcryptjs). No Node-only deps.
 *
 * Hash algorithm history:
 *   - PBKDF2-SHA256 100k    → original; legacy hashes still verify
 *   - PBKDF2-SHA256 600k    → audit S-08 (2026-05-03); intermediate
 *   - bcrypt cost 12        → current default (OWASP-equivalent to
 *                              argon2id; argon2id itself can't run
 *                              because Convex's bundler rejects the
 *                              native @node-rs/argon2 .node binary)
 *
 * verifyPassword detects the format from the stored string and
 * routes to the right verifier. needsRehash returns true for any
 * hash that isn't the current default; the login mutation calls
 * hashPassword (which always returns bcrypt) and patches.
 */

import { compareSync, hashSync } from "bcryptjs";

const BCRYPT_COST = 12; // ~250ms on a Vercel Fluid function
const PBKDF2_ITERATIONS = 600_000;
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
 * Hash a password. Always returns a bcrypt hash (cost 12) for new
 * accounts; legacy hashes verify via verifyPassword's algorithm
 * detection but never get re-emitted from this function.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  // bcryptjs is synchronous + CPU-bound — wrap to keep the async
  // signature compatible with the legacy PBKDF2 implementation.
  return hashSync(password, BCRYPT_COST);
}

/**
 * Verify a password against a stored hash. Routes by hash format:
 *   $2a$ / $2b$ / $2y$ → bcrypt (current default)
 *   pbkdf2-sha256$…    → PBKDF2 (legacy, still supported)
 * Returns false on any malformed input or algorithm mismatch.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (
    stored.startsWith("$2a$") ||
    stored.startsWith("$2b$") ||
    stored.startsWith("$2y$")
  ) {
    try {
      return compareSync(password, stored);
    } catch {
      return false;
    }
  }
  // Legacy PBKDF2 path.
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
 * True if the stored hash isn't bcrypt (i.e. legacy PBKDF2 of any
 * iteration count). Login calls this after a successful verify and
 * re-hashes via hashPassword (which always emits bcrypt) — gradual
 * migration to the stronger algorithm without forcing a global
 * password reset.
 */
export function needsRehash(stored: string): boolean {
  return !(
    stored.startsWith("$2a$") ||
    stored.startsWith("$2b$") ||
    stored.startsWith("$2y$")
  );
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
 * Signup verification token — 32 random bytes hex, prefixed `pst_`.
 * Stored hashed; raw value goes in the verification email only.
 * Distinct prefix from `pwr_` so a leaked-token check can tell which
 * flow it came from at a glance.
 */
export function generateSignupVerificationToken(): string {
  return "pst_" + bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
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
