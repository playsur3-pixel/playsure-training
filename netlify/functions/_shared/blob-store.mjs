import { getStore } from "@netlify/blobs";
import { normalizeUsername } from "./auth.mjs";

export const DEFAULT_WEAPONS = [
  { id: "m4a4", label: "M4A4", base: true, createdAt: null },
  { id: "m4a1s", label: "M4A1-S", base: true, createdAt: null },
  { id: "ak47", label: "AK47", base: true, createdAt: null }
];

export const MAX_DAYS = 180;

const STORE_NAME = process.env.BLOB_STORE || "psm";
const SESSIONS_PREFIX = "Sessions";
const STATS_PREFIX = "Stats";

function store() {
  return getStore(STORE_NAME);
}

export function blobLayout() {
  return {
    store: STORE_NAME,
    sessions: `${SESSIONS_PREFIX}/<user>.json`,
    stats: `${STATS_PREFIX}/<user>.json`
  };
}

export function userKey(username) {
  const key = normalizeUsername(username);
  if (!key) throw new Error("Username invalide.");
  return key;
}

export function credentialsKey(username) {
  return `${SESSIONS_PREFIX}/${userKey(username)}.json`;
}

export function trainingKey(username) {
  return `${STATS_PREFIX}/${userKey(username)}.json`;
}

export function todayIso(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function timeIso(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

export function cutoffIso(days = MAX_DAYS) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return todayIso(d);
}

export function cleanWeaponId(labelOrId) {
  return String(labelOrId || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

export function normalizeWeapons(weapons) {
  const byId = new Map();

  for (const item of DEFAULT_WEAPONS) {
    byId.set(item.id, { ...item });
  }

  for (const item of Array.isArray(weapons) ? weapons : []) {
    const id = cleanWeaponId(item?.id || item?.label);
    const label = String(item?.label || id).trim().slice(0, 32);
    if (!id || !label) continue;

    const existing = byId.get(id);
    byId.set(id, {
      id,
      label,
      base: Boolean(existing?.base || item?.base),
      createdAt: item?.createdAt || existing?.createdAt || new Date().toISOString()
    });
  }

  return [...byId.values()];
}

function weaponLabelFromId(weapons, weaponId, fallback = "") {
  return weapons.find((weapon) => weapon.id === weaponId)?.label || fallback || weaponId;
}

export function sanitizeTraining(data, username) {
  const now = new Date().toISOString();
  const source = data && typeof data === "object" ? data : {};
  const cutoff = cutoffIso();
  const weapons = normalizeWeapons(source.weapons);
  const entries = Array.isArray(source.entries) ? source.entries : [];

  return {
    username: userKey(source.username || username),
    displayName: source.displayName || undefined,
    weapons,
    entries: entries
      .filter((entry) => typeof entry?.date === "string" && entry.date >= cutoff)
      .map((entry) => {
        const weaponId = cleanWeaponId(entry.weaponId || entry.weapon || "");
        const date = String(entry.date || "");
        const time = /^\d{2}:\d{2}(:\d{2})?$/.test(String(entry.time || "")) ? String(entry.time) : "00:00:00";
        const kpm = entry.kpm === null || entry.kpm === undefined || entry.kpm === "" ? null : Number(entry.kpm);
        return {
          date,
          time: time.length === 5 ? `${time}:00` : time,
          weaponId,
          weapon: weaponLabelFromId(weapons, weaponId, String(entry.weapon || "")),
          kpm
        };
      })
      .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && entry.weaponId && entry.kpm !== null && Number.isFinite(entry.kpm))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.weaponId.localeCompare(b.weaponId)),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now
  };
}

export function publicUser(credentials, training) {
  return {
    username: credentials.username,
    displayName: credentials.displayName || training.displayName || credentials.username,
    createdAt: credentials.createdAt || training.createdAt,
    updatedAt: training.updatedAt || credentials.updatedAt,
    weapons: training.weapons,
    entries: training.entries
  };
}

async function getJson(key) {
  return (await store().get(key, { type: "json" })) || null;
}

async function setJson(key, value) {
  await store().setJSON(key, value);
  return value;
}

export async function readCredentials(username) {
  const key = userKey(username);
  const current = await getJson(credentialsKey(key));
  if (current) return current;

  // Lecture uniquement pour transition depuis l'ancien schéma auth:<user>.
  const legacy = await getJson(`auth:${key}`);
  if (!legacy?.password_hash) return null;

  return {
    username: key,
    displayName: String(legacy.pseudo || username || key).trim(),
    passwordHash: String(legacy.password_hash || ""),
    createdAt: legacy.created_at || legacy.updated_at || new Date().toISOString(),
    updatedAt: legacy.updated_at || new Date().toISOString(),
    migratedFrom: `auth:${key}`
  };
}

export async function writeCredentials(credentials) {
  const now = new Date().toISOString();
  const username = userKey(credentials.username);
  return await setJson(credentialsKey(username), {
    username,
    displayName: String(credentials.displayName || credentials.username || username).trim(),
    passwordHash: String(credentials.passwordHash || ""),
    createdAt: credentials.createdAt || now,
    updatedAt: now
  });
}

async function readLegacyTraining(username) {
  const key = userKey(username);
  const legacy = await getJson(`data:${key}`);
  if (!legacy) return null;

  const entries = Array.isArray(legacy.entries)
    ? legacy.entries.map((entry) => ({
        date: entry.date,
        time: entry.time || "00:00:00",
        weaponId: entry.weaponId || entry.weapon,
        weapon: entry.weapon,
        kpm: entry.kpm
      }))
    : [];

  return {
    username: key,
    displayName: legacy.displayName || legacy.pseudo || key,
    weapons: legacy.weapons,
    entries,
    createdAt: legacy.createdAt || new Date().toISOString(),
    updatedAt: legacy.updatedAt || new Date().toISOString(),
    migratedFrom: `data:${key}`
  };
}

export async function readTraining(username) {
  const key = userKey(username);
  const credentials = await readCredentials(key);
  const data = (await getJson(trainingKey(key))) || (await readLegacyTraining(key));
  const training = sanitizeTraining(
    {
      ...(data || {}),
      username: key,
      displayName: data?.displayName || credentials?.displayName
    },
    key
  );

  if (!data || data.migratedFrom) {
    await writeTraining(key, training);
  }

  return training;
}

export async function writeTraining(username, training) {
  const clean = sanitizeTraining(
    {
      ...training,
      username: userKey(username),
      updatedAt: new Date().toISOString()
    },
    username
  );
  await setJson(trainingKey(username), clean);
  return clean;
}

export async function createOrUpdateUser({ username, displayName, passwordHash, force = false }) {
  const key = userKey(username);
  const now = new Date().toISOString();
  const existingCredentials = await readCredentials(key);

  if (existingCredentials && !existingCredentials.migratedFrom && !force) {
    const error = new Error("Utilisateur déjà existant.");
    error.code = "USER_EXISTS";
    throw error;
  }

  const credentials = await writeCredentials({
    ...(existingCredentials || {}),
    username: key,
    displayName: displayName || existingCredentials?.displayName || username,
    passwordHash,
    createdAt: existingCredentials?.createdAt || now
  });

  const existingTraining = await getJson(trainingKey(key));
  const legacyTraining = existingTraining ? null : await readLegacyTraining(key);
  const sourceTraining = existingTraining || legacyTraining;

  const training = sanitizeTraining(
    {
      ...(sourceTraining || {}),
      username: key,
      displayName: credentials.displayName,
      weapons: sourceTraining?.weapons?.length ? sourceTraining.weapons : DEFAULT_WEAPONS.map((weapon) => ({ ...weapon, createdAt: now })),
      entries: Array.isArray(sourceTraining?.entries) ? sourceTraining.entries : [],
      createdAt: sourceTraining?.createdAt || now,
      updatedAt: now
    },
    key
  );

  await writeTraining(key, training);
  return { credentials, training, created: !existingCredentials || Boolean(existingCredentials.migratedFrom) };
}

export async function deleteTraining(username) {
  await store().delete(trainingKey(username));
}
