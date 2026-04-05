import crypto from "crypto";
import fs from "fs";
import path from "path";

export function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

export function normalizePseudo(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function readWhitelist() {
  const p = path.resolve(process.cwd(), "public", "players.json");
  const raw = fs.readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw);
  const players = Array.isArray(parsed?.players) ? parsed.players : [];
  return new Set(players.map((x) => normalizePseudo(x)));
}
