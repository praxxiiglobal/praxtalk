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
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: HASH_NAME },
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
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(token));
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
