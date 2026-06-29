export function json(statusCode, payload, headers = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    },
    body: JSON.stringify(payload)
  };
}

export function noContent(headers = {}) {
  return {
    statusCode: 204,
    headers: {
      "cache-control": "no-store",
      ...headers
    },
    body: ""
  };
}

export function jsonError(statusCode, message) {
  return json(statusCode, { ok: false, error: message });
}

export function parseJsonBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body);
  } catch {
    return null;
  }
}

export function bodyString(body, key, minLength = 1) {
  const value = String(body?.[key] || "").trim();
  return value.length >= minLength ? value : null;
}

export function readBearer(event) {
  const raw = event.headers?.authorization || event.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return match ? match[1] : "";
}

export function readAdminToken(event) {
  return String(event.headers?.["x-admin-token"] || event.headers?.["X-Admin-Token"] || "").trim();
}
