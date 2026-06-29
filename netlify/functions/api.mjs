import { connectLambda } from "@netlify/blobs";
import { createSessionToken, normalizeUsername, verifyPassword, verifySessionToken } from "./_shared/auth.mjs";
import {
  cleanWeaponId,
  publicUser,
  readCredentials,
  readTraining,
  timeIso,
  writeTraining
} from "./_shared/blob-store.mjs";
import { bodyString, json, jsonError, noContent, parseJsonBody, readBearer } from "./_shared/http.mjs";

function routeFromEvent(event) {
  const rawPath = String(event.path || "");
  const path = rawPath
    .replace(/^\/\.netlify\/functions\/api\/?/, "/")
    .replace(/^\/api\/?/, "/");
  const normalized = path === "" ? "/" : path.startsWith("/") ? path : `/${path}`;
  return normalized.replace(/\/+/g, "/");
}

function parseKpmValue(value) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = String(value).trim().replace(",", ".");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function authenticate(event) {
  const token = readBearer(event);
  if (!token) {
    const error = new Error("Session absente.");
    error.statusCode = 401;
    throw error;
  }

  const session = verifySessionToken(token);
  if (!session?.username) {
    const error = new Error("Session invalide ou expirée.");
    error.statusCode = 401;
    throw error;
  }

  const credentials = await readCredentials(session.username);
  if (!credentials?.passwordHash) {
    const error = new Error("Utilisateur inexistant.");
    error.statusCode = 401;
    throw error;
  }

  const training = await readTraining(session.username);
  return { token, credentials, training, expiresAt: session.expiresAt };
}

async function handleLogin(event) {
  const body = parseJsonBody(event);
  if (!body) return jsonError(400, "JSON invalide.");

  const usernameInput = bodyString(body, "username", 2);
  const password = bodyString(body, "password", 6);
  if (!usernameInput || !password) return jsonError(400, "Pseudo ou password invalide.");

  const username = normalizeUsername(usernameInput);
  if (!username) return jsonError(400, "Pseudo invalide.");

  const credentials = await readCredentials(username);
  if (!credentials?.passwordHash) return jsonError(403, "Utilisateur inexistant.");

  if (!verifyPassword(password, credentials.passwordHash)) {
    return jsonError(403, "Identifiants incorrects.");
  }

  const training = await readTraining(username);
  const token = createSessionToken(username);
  const session = verifySessionToken(token);

  return json(200, { ok: true, token, user: publicUser(credentials, training), expiresAt: session.expiresAt });
}

async function handleLogout() {
  return json(200, { ok: true });
}

async function handleMe(event) {
  const { credentials, training } = await authenticate(event);
  const nextTraining = await writeTraining(credentials.username, training);
  return json(200, { ok: true, user: publicUser(credentials, nextTraining) });
}

async function handleAddWeapon(event) {
  const body = parseJsonBody(event);
  if (!body) return jsonError(400, "JSON invalide.");

  const { credentials, training } = await authenticate(event);
  const label = String(body?.label || "").trim().slice(0, 32);
  if (label.length < 2) return jsonError(400, "Nom d'arme trop court.");

  const id = cleanWeaponId(body?.id || label);
  if (id.length < 2) return jsonError(400, "Identifiant d'arme invalide.");
  if (training.weapons.some((weapon) => weapon.id === id)) return jsonError(409, "Cette arme existe déjà.");

  training.weapons.push({ id, label, base: false, createdAt: new Date().toISOString() });
  const nextTraining = await writeTraining(credentials.username, training);
  return json(200, { ok: true, user: publicUser(credentials, nextTraining) });
}

async function handleDeleteWeapon(event, weaponIdRaw) {
  const { credentials, training } = await authenticate(event);
  const weaponId = cleanWeaponId(weaponIdRaw);
  const weapon = training.weapons.find((item) => item.id === weaponId);

  if (!weapon) return jsonError(404, "Arme introuvable.");
  if (weapon.base) return jsonError(400, "Impossible de supprimer une arme de base.");

  training.weapons = training.weapons.filter((item) => item.id !== weaponId);
  training.entries = training.entries.filter((entry) => cleanWeaponId(entry.weaponId) !== weaponId);

  const nextTraining = await writeTraining(credentials.username, training);
  return json(200, { ok: true, user: publicUser(credentials, nextTraining) });
}

async function handleEntries(event) {
  const body = parseJsonBody(event);
  if (!body) return jsonError(400, "JSON invalide.");

  const date = String(body?.date || "").trim();
  const values = body?.values && typeof body.values === "object" ? body.values : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !values) return jsonError(400, "Saisie invalide.");

  const { credentials, training } = await authenticate(event);
  const weaponById = new Map(training.weapons.map((weapon) => [weapon.id, weapon]));
  const currentTime = timeIso();
  const parsedEntries = [];

  for (const [rawWeaponId, rawKpm] of Object.entries(values)) {
    const weaponId = cleanWeaponId(rawWeaponId);
    const weapon = weaponById.get(weaponId);
    if (!weapon) continue;

    const kpm = parseKpmValue(rawKpm);
    if (kpm === null) continue;

    if (!Number.isFinite(kpm) || kpm < 0 || kpm > 1000) {
      return jsonError(400, `KPM invalide pour ${weapon.label}.`);
    }

    parsedEntries.push({
      date,
      time: currentTime,
      weaponId,
      weapon: weapon.label,
      kpm: Number(kpm.toFixed(2))
    });
  }

  if (!parsedEntries.length) {
    return jsonError(400, "Aucun KPM valide a enregistrer.");
  }

  const replacedWeaponIds = new Set(parsedEntries.map((entry) => entry.weaponId));
  const nextEntries = training.entries.filter((entry) => {
    if (entry.date !== date) return true;
    return !replacedWeaponIds.has(cleanWeaponId(entry.weaponId));
  });

  training.entries = [...nextEntries, ...parsedEntries];
  const nextTraining = await writeTraining(credentials.username, training);
  return json(200, { ok: true, user: publicUser(credentials, nextTraining) });
}

async function handleDeleteEntries(event, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonError(400, "Date invalide.");

  const { credentials, training } = await authenticate(event);
  training.entries = training.entries.filter((entry) => entry.date !== date);
  const nextTraining = await writeTraining(credentials.username, training);
  return json(200, { ok: true, user: publicUser(credentials, nextTraining) });
}

export async function handler(event) {
  connectLambda(event);

  if (event.httpMethod === "OPTIONS") return noContent();

  try {
    const route = routeFromEvent(event);
    const method = event.httpMethod;

    if (method === "GET" && route === "/health") return json(200, { ok: true, storage: "netlify-blobs", layout: "psm/Sessions + psm/Stats" });
    if (method === "POST" && route === "/login") return await handleLogin(event);
    if (method === "POST" && route === "/logout") return await handleLogout(event);
    if (method === "GET" && route === "/me") return await handleMe(event);
    if (method === "POST" && route === "/weapons") return await handleAddWeapon(event);
    if (method === "POST" && route === "/entries") return await handleEntries(event);

    const weaponDelete = /^\/weapons\/([^/]+)$/.exec(route);
    if (method === "DELETE" && weaponDelete) return await handleDeleteWeapon(event, decodeURIComponent(weaponDelete[1]));

    const entriesDelete = /^\/entries\/([^/]+)$/.exec(route);
    if (method === "DELETE" && entriesDelete) return await handleDeleteEntries(event, decodeURIComponent(entriesDelete[1]));

    return jsonError(404, "Route API introuvable.");
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    if (statusCode >= 500) console.error(error);
    return jsonError(statusCode, error instanceof Error ? error.message : "Erreur serveur.");
  }
}
