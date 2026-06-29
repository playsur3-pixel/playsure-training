import type { Entry, PlayerData, RangeKey, Weapon } from "./types";

export const RANGE_OPTIONS: { key: RangeKey; label: string; days: number }[] = [
  { key: "week", label: "Semaine", days: 7 },
  { key: "fifteen", label: "15aine", days: 15 },
  { key: "month", label: "Mois", days: 30 },
  { key: "twoMonths", label: "2 mois", days: 60 },
  { key: "threeMonths", label: "3 mois", days: 90 }
];

export const LINE_COLORS = [
  "#f59e0b",
  "#38bdf8",
  "#22c55e",
  "#fb7185",
  "#a78bfa",
  "#f97316",
  "#14b8a6",
  "#e879f9",
  "#84cc16",
  "#60a5fa"
];

export function todayIso(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isoMinusDays(days: number, from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return todayIso(d);
}

export function formatDateFr(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export function getWeaponLabel(weapons: Weapon[], weaponId: string) {
  return weapons.find((weapon) => weapon.id === weaponId)?.label || weaponId;
}

export function entriesForRange(entries: Entry[], days: number) {
  const cutoff = isoMinusDays(days);
  return entries.filter((entry) => entry.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date) || a.weaponId.localeCompare(b.weaponId));
}

export function buildDraft(user: PlayerData, date: string): Record<string, number | null> {
  const values = Object.fromEntries(user.weapons.map((weapon) => [weapon.id, null])) as Record<string, number | null>;
  for (const entry of user.entries) {
    if (entry.date === date) values[entry.weaponId] = entry.kpm;
  }
  return values;
}

export function exportPlayerJson(user: PlayerData) {
  return {
    username: user.username,
    displayName: user.displayName,
    exportedAt: new Date().toISOString(),
    retentionDays: 180,
    weapons: user.weapons,
    entries: user.entries
  };
}

export function toCsv(user: PlayerData) {
  const rows = [["date", "time", "weapon_id", "weapon", "kpm"]];
  for (const entry of [...user.entries].sort((a, b) => a.date.localeCompare(b.date) || a.weaponId.localeCompare(b.weaponId))) {
    rows.push([entry.date, entry.time || "", entry.weaponId, entry.weapon || getWeaponLabel(user.weapons, entry.weaponId), String(entry.kpm)]);
  }

  return rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
}

export function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
