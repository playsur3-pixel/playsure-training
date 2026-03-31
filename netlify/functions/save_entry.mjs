import { getStore, connectLambda } from "@netlify/blobs";
import { bearerToken, json } from "./_util.mjs";

const MAX_DAYS = 60;

function cutoffIso() {
  const d = new Date();
  d.setDate(d.getDate() - MAX_DAYS);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// POST { entry: { date, weapon, kpm_immobile, kpm_cs } } -> { ok }
// Requires Authorization: Bearer <token>
export async function handler(event, context) {
  connectLambda(event);

  const method = event.httpMethod || event.requestContext?.http?.method;

if (method === "OPTIONS") {
  return {
    statusCode: 200,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
    },
    body: "",
  };
}

if (method !== "POST") {
  return json(405, { error: "Method not allowed", method });
}

  const token = bearerToken(event);
  if (!token) return json(401, { error: "Missing bearer token" });

  const store = getStore("psm");
  const session = await store.get(`session:${token}`, { type: "json" });
  if (!session?.pseudo || !session?.expires_at) return json(401, { error: "Invalid session" });
  if (Date.parse(session.expires_at) < Date.now()) return json(401, { error: "Session expired" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const entry = body?.entry;
  if (!entry?.date || !entry?.weapon) return json(400, { error: "Missing entry" });

  const data =
    (await store.get(`data:${session.pseudo}`, { type: "json" })) || ({
      pseudo: session.pseudo,
      entries: [],
    });

  const entries = Array.isArray(data.entries) ? data.entries : [];

  // remplace l'entrée du même jour si déjà existante
  const next = entries.filter((e) => e?.date !== entry.date);
  next.push(entry);

  // purge > 60 jours (ISO tri lexicographique OK)
  const cut = cutoffIso();
  const purged = next
    .filter((e) => typeof e?.date === "string" && e.date >= cut)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const out = { pseudo: session.pseudo, entries: purged };

  await store.set(`data:${session.pseudo}`, JSON.stringify(out), {
    contentType: "application/json",
  });

  return json(200, { ok: true });
}
