import crypto from "node:crypto";

const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";
const SESSION_HOURS = 24;

function base64urlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64urlDecode(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function sessionSecret() {
  return String(process.env.SESSION_SECRET || process.env.ADMIN_TOKEN || "playsure-training-local-dev-secret");
}

export function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `pbkdf2:${DIGEST}:${ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const raw = String(stored || "");
  const parts = raw.split(":");
  if (parts.length === 5 && parts[0] === "pbkdf2") {
    const [, digest, iterationsRaw, salt, expected] = parts;
    const iterations = Number(iterationsRaw);
    if (!Number.isInteger(iterations) || iterations < 1 || !salt || !expected) return false;

    const actual = crypto.pbkdf2Sync(String(password), salt, iterations, expected.length / 2, digest).toString("hex");

    try {
      return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }

  // Compatibilité brute avec les anciens auth:* en SHA-256 simple, uniquement si tu migres d'anciens blobs.
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    const actual = crypto.createHash("sha256").update(String(password)).digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(raw, "hex"));
    } catch {
      return false;
    }
  }

  return false;
}

export function createSessionToken(username) {
  const payload = {
    username: normalizeUsername(username),
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
    iat: Date.now()
  };

  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;

  const expected = crypto.createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(encodedPayload));
  } catch {
    return null;
  }

  const username = normalizeUsername(payload?.username);
  const exp = Number(payload?.exp);
  if (!username || !Number.isFinite(exp) || exp < Date.now()) return null;

  return { username, expiresAt: new Date(exp).toISOString() };
}
