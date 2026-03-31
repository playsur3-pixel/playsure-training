import type { Session } from "./auth";

export type WeaponKey =
  | "glock"
  | "ups_s"
  | "deagle"
  | "ak47"
  | "m4a4"
  | "m4a1s"
  | "galil";

export type Entry = {
  date: string;
  weapon: WeaponKey;
  kpm: number | null;
};

async function fetchJSON<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const text = await res.text();

  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && ("error" in data || "message" in data)
        ? String((data as { error?: string; message?: string }).error || (data as { error?: string; message?: string }).message)
        : typeof data === "string" && data
        ? data
        : res.statusText;

    throw new Error(msg);
  }

  return data as T;
}

export async function apiLogin(pseudo: string, password: string): Promise<Session> {
  const r = await fetchJSON<{ ok: boolean; token: string; pseudo: string }>(
    "/.netlify/functions/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pseudo, password }),
    }
  );
  return { pseudo: r.pseudo, token: r.token };
}

export async function apiGetPlayer(session: Session): Promise<{ pseudo: string; entries: Entry[] }> {
  return await fetchJSON<{ pseudo: string; entries: Entry[] }>("/.netlify/functions/get_player", {
    method: "GET",
    headers: { Authorization: `Bearer ${session.token}` },
  });
}

export async function apiSaveEntry(session: Session, entry: Entry): Promise<void> {
  await fetchJSON<{ ok: boolean }>("/.netlify/functions/save_entry", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ entry }),
  });
}
