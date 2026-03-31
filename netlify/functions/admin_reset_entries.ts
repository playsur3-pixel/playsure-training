import { getStore } from "@netlify/blobs";

type UserRecord = {
  pseudo?: string;
  username?: string;
  passwordHash?: string;
  createdAt?: string;
  updatedAt?: string;
  entries?: unknown[];
};

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event: any) {
  try {
    const adminSecret = event.headers?.["x-admin-secret"];

    if (!process.env.ADMIN_SECRET) {
      return json(500, {
        ok: false,
        error: "ADMIN_SECRET absent côté Netlify",
      });
    }

    if (adminSecret !== process.env.ADMIN_SECRET) {
      return json(403, {
        ok: false,
        error: "Forbidden",
      });
    }

    const body = JSON.parse(event.body || "{}");
    const pseudo = String(body.pseudo || "").trim().toLowerCase();

    if (!pseudo) {
      return json(400, {
        ok: false,
        error: "Pseudo manquant",
      });
    }

    const store = getStore("users");
    const key = `by-username/${pseudo}.json`;

    const user = (await store.get(key, {
      type: "json",
      consistency: "strong",
    })) as UserRecord | null;

    if (!user) {
      return json(404, {
        ok: false,
        error: `Utilisateur introuvable: ${key}`,
      });
    }

    const nextUser: UserRecord = {
      ...user,
      entries: [],
      updatedAt: new Date().toISOString(),
    };

    await store.setJSON(key, nextUser);

    return json(200, {
      ok: true,
      message: `Entries réinitialisées pour ${pseudo}`,
      key,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
      stack: error instanceof Error ? error.stack : null,
    });
  }
}