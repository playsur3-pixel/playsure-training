import { getStore, connectLambda } from "@netlify/blobs";
import { bearerToken, json } from "./_util.mjs";

const MAX_DAYS = 90;

function cutoffIso() {
  const d = new Date();
  d.setDate(d.getDate() - MAX_DAYS);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function withCors(response) {
  return {
    ...response,
    headers: {
      ...(response.headers || {}),
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
    },
  };
}

// POST { entry: { date, weapon, kpm } } -> { ok }
// Requires Authorization: Bearer <token>
export async function handler(event, context) {
  connectLambda(event);

  const method = event.httpMethod || event.requestContext?.http?.method;

  if (method === "OPTIONS") {
    return withCors({
      statusCode: 200,
      body: "",
    });
  }

  if (method !== "POST") {
    return withCors(json(405, { error: "Method not allowed", method }));
  }

  const token = bearerToken(event);
  if (!token) {
    return withCors(json(401, { error: "Missing bearer token" }));
  }

  const store = getStore("psm");

  const session = await store.get(`session:${token}`, { type: "json" });
  if (!session?.pseudo || !session?.expires_at) {
    return withCors(json(401, { error: "Invalid session" }));
  }

  if (Date.parse(session.expires_at) < Date.now()) {
    return withCors(json(401, { error: "Session expired" }));
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return withCors(json(400, { error: "Invalid JSON" }));
  }

  const entry = body?.entry;
  if (!entry?.date || !entry?.weapon) {
    return withCors(json(400, { error: "Missing entry" }));
  }

  const normalizedEntry = {
    date: String(entry.date),
    weapon: String(entry.weapon),
    kpm:
      entry.kpm === null || entry.kpm === undefined || entry.kpm === ""
        ? null
        : Number(entry.kpm),
  };

  if (normalizedEntry.kpm !== null && Number.isNaN(normalizedEntry.kpm)) {
    return withCors(json(400, { error: "Invalid kpm" }));
  }

  const data =
    (await store.get(`data:${session.pseudo}`, { type: "json" })) || {
      pseudo: session.pseudo,
      entries: [],
    };

  const entries = Array.isArray(data.entries) ? data.entries : [];

  // remplace uniquement l'entrée du même jour ET de la même arme
  const next = entries.filter(
    (e) => !(e?.date === normalizedEntry.date && e?.weapon === normalizedEntry.weapon)
  );

  next.push(normalizedEntry);

  // purge > 90 jours
  const cut = cutoffIso();
  const purged = next
    .filter((e) => typeof e?.date === "string" && e.date >= cut)
    .sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.weapon || "").localeCompare(String(b.weapon || ""));
    });

  const out = {
    pseudo: session.pseudo,
    entries: purged,
  };

  await store.set(`data:${session.pseudo}`, JSON.stringify(out), {
    contentType: "application/json",
  });

  return withCors(json(200, { ok: true }));
}