import { connectLambda } from "@netlify/blobs";
import { createPasswordHash, normalizeUsername } from "./_shared/auth.mjs";
import { blobLayout, createOrUpdateUser, credentialsKey, publicUser, trainingKey } from "./_shared/blob-store.mjs";
import { bodyString, json, jsonError, noContent, parseJsonBody } from "./_shared/http.mjs";

function readAdminSecret(event) {
  return String(
    event.headers?.["x-admin-secret"] ||
    event.headers?.["X-Admin-Secret"] ||
    event.headers?.["x-admin-token"] ||
    event.headers?.["X-Admin-Token"] ||
    ""
  ).trim();
}

function assertAdmin(event) {
  const expected = String(
    process.env.ADMIN_SECRET ||
    process.env.ADMIN_TOKEN ||
    process.env.PSM_ADMIN_TOKEN ||
    ""
  ).trim();

  if (!expected) {
    const error = new Error("ADMIN_SECRET absent cote Netlify.");
    error.statusCode = 500;
    throw error;
  }

  const received = readAdminSecret(event);
  if (!received || received !== expected) {
    const error = new Error("Secret admin invalide.");
    error.statusCode = 401;
    throw error;
  }
}

export async function handler(event) {
  connectLambda(event);

  if (event.httpMethod === "OPTIONS") return noContent();
  if (event.httpMethod !== "POST") return jsonError(405, "Methode interdite.");

  try {
    assertAdmin(event);

    const body = parseJsonBody(event);
    if (!body) return jsonError(400, "JSON invalide.");

    const usernameInput = bodyString(body, "username", 2);
    const password = bodyString(body, "password", 6);
    const force = Boolean(body?.force);

    if (!usernameInput || !password) return jsonError(400, "Pseudo ou password invalide.");

    const username = normalizeUsername(usernameInput);
    if (!username) return jsonError(400, "Pseudo invalide.");

    const result = await createOrUpdateUser({
      username,
      displayName: String(usernameInput).trim(),
      passwordHash: createPasswordHash(password),
      force
    });

    return json(200, {
      ok: true,
      created: result.created,
      user: publicUser(result.credentials, result.training),
      blobs: {
        layout: blobLayout(),
        sessionUser: credentialsKey(username),
        statsUser: trainingKey(username)
      }
    });
  } catch (error) {
    if (error?.code === "USER_EXISTS") {
      return jsonError(409, "Utilisateur deja existant. Relance avec -Force pour remplacer le password.");
    }

    const statusCode = Number(error?.statusCode || 500);
    if (statusCode >= 500) console.error(error);
    return jsonError(statusCode, error instanceof Error ? error.message : "Erreur serveur.");
  }
}
