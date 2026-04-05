import { getStore, connectLambda } from "@netlify/blobs";
import { json, normalizePseudo, readWhitelist, sha256 } from "./_util.mjs";

export async function handler(event, context) {
  connectLambda(event);

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return json(500, { error: "ADMIN_SECRET not configured" });
  }

  const supplied =
    event.headers?.["x-admin-secret"] || event.headers?.["X-Admin-Secret"];

  if (String(supplied || "") !== String(secret)) {
    return json(403, { error: "Forbidden" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const pseudoRaw = body?.pseudo || body?.username || "";
  const pseudo = String(pseudoRaw).trim();
  const pseudoNormalized = normalizePseudo(pseudoRaw);
  const password = String(body?.password || "").trim();

  if (pseudo.length < 2 || password.length < 6) {
    return json(400, { error: "pseudo >=2 and password >=6 required" });
  }

  const whitelist = readWhitelist();

  if (!whitelist.has(pseudoNormalized)) {
    return json(403, {
      error: "Pseudo not whitelisted",
      pseudo_received: pseudo,
      pseudo_normalized: pseudoNormalized,
    });
  }

  const store = getStore("psm");

  await store.setJSON(`auth:${pseudoNormalized}`, {
    pseudo,
    password_hash: sha256(password),
    updated_at: new Date().toISOString(),
  });

  return json(200, { ok: true, pseudo });
}
