import type { PlayerData, Session } from "./types";

const SESSION_KEY = "playsure_training_session_v4";

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: string }).error || response.statusText)
        : String(data || response.statusText);
    throw new Error(message);
  }

  return data as T;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function getStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session?.token || !session?.user?.username) return null;
    return session;
  } catch {
    return null;
  }
}

export function storeSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function login(username: string, password: string): Promise<Session> {
  const data = await request<{ ok: true; token: string; user: PlayerData; expiresAt: string }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  const session = { token: data.token, user: data.user, expiresAt: data.expiresAt };
  storeSession(session);
  return session;
}

export async function logout(token: string) {
  try {
    await request<{ ok: true }>("/api/logout", {
      method: "POST",
      headers: authHeaders(token)
    });
  } finally {
    clearStoredSession();
  }
}

export async function getMe(token: string): Promise<PlayerData> {
  const data = await request<{ ok: true; user: PlayerData }>("/api/me", {
    headers: authHeaders(token)
  });
  return data.user;
}

export async function saveEntries(token: string, date: string, values: Record<string, number | null>): Promise<PlayerData> {
  const data = await request<{ ok: true; user: PlayerData }>("/api/entries", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ date, values })
  });
  return data.user;
}

export async function deleteDay(token: string, date: string): Promise<PlayerData> {
  const data = await request<{ ok: true; user: PlayerData }>(`/api/entries/${encodeURIComponent(date)}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  return data.user;
}

export async function addWeapon(token: string, label: string): Promise<PlayerData> {
  const data = await request<{ ok: true; user: PlayerData }>("/api/weapons", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ label })
  });
  return data.user;
}

export async function deleteWeapon(token: string, weaponId: string): Promise<PlayerData> {
  const data = await request<{ ok: true; user: PlayerData }>(`/api/weapons/${encodeURIComponent(weaponId)}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  return data.user;
}
