import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { clearSession, getSession } from "../lib/auth";
import { apiGetPlayer, apiSaveEntry } from "../lib/api";
import { profile } from "../data/profile";

type WeaponKey =
  | "glock"
  | "ups_s"
  | "deagle"
  | "ak47"
  | "m4a4"
  | "m4a1s"
  | "galil"

type Entry = {
  date: string;
  weapon: WeaponKey;
  kpm_immobile: number | null;
  kpm_cs: number | null;
};

type DayDraft = {
  date: string;
  values: Record<
    WeaponKey,
    {
      kpm_immobile: number | null;
      kpm_cs: number | null;
    }
  >;
};

type FilterValue = "all" | WeaponKey;

const WEAPONS: { key: WeaponKey; label: string }[] = [
  { key: "glock", label: "Glock" },
  { key: "ups_s", label: "USP-S" },
  { key: "deagle", label: "Deagle" },
  { key: "ak47", label: "AK-47" },
  { key: "m4a4", label: "M4A4" },
  { key: "m4a1s", label: "M4A1-S" },
  { key: "galil", label: "Galil" },
];

function buildEmptyDraft(date: string): DayDraft {
  return {
    date,
    values: {
      glock: { kpm_immobile: null, kpm_cs: null },
      ups_s: { kpm_immobile: null, kpm_cs: null },
      deagle: { kpm_immobile: null, kpm_cs: null },
      ak47: { kpm_immobile: null, kpm_cs: null },
      m4a4: { kpm_immobile: null, kpm_cs: null },
      m4a1s: { kpm_immobile: null, kpm_cs: null },
      galil: { kpm_immobile: null, kpm_cs: null },
    },
  };
}

function clampLast90Days(entries: Entry[]): Entry[] {
  const dates = Array.from(new Set(entries.map((e) => e.date))).sort((a, b) => a.localeCompare(b));
  const keepDates = new Set(dates.slice(-90));
  return entries.filter((e) => keepDates.has(e.date));
}

// Dev fallback (when not running via Netlify): localStorage storage
async function loadEntriesLocal(pseudo: string): Promise<Entry[]> {
  const key = `psm_entries_${pseudo}`;
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Entry[];
    return clampLast90Days(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

async function saveEntriesLocal(pseudo: string, nextEntries: Entry[]) {
  const key = `psm_entries_${pseudo}`;
  localStorage.setItem(key, JSON.stringify(clampLast90Days(nextEntries)));
}

function entriesToDayDraft(entries: Entry[], date: string): DayDraft {
  const draft = buildEmptyDraft(date);

  for (const entry of entries) {
    if (entry.date !== date) continue;
    draft.values[entry.weapon] = {
      kpm_immobile: entry.kpm_immobile,
      kpm_cs: entry.kpm_cs,
    };
  }

  return draft;
}

function upsertEntriesFromDraft(entries: Entry[], draft: DayDraft): Entry[] {
  const filtered = entries.filter((e) => e.date !== draft.date);

  const additions: Entry[] = WEAPONS.map(({ key }) => ({
    date: draft.date,
    weapon: key,
    kpm_immobile: draft.values[key].kpm_immobile,
    kpm_cs: draft.values[key].kpm_cs,
  }));

  return clampLast90Days(
    [...filtered, ...additions].sort((a, b) =>
      a.date === b.date ? a.weapon.localeCompare(b.weapon) : a.date.localeCompare(b.date)
    )
  );
}

function getDailyGraphData(entries: Entry[], filter: FilterValue) {
  const byDate = new Map<string, Entry[]>();

  for (const entry of clampLast90Days(entries)) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date)!.push(entry);
  }

  const dates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));

  return dates.map((date) => {
    const dayEntries = byDate.get(date)!;

    if (filter === "all") {
      const values = dayEntries
        .flatMap((entry) => [entry.kpm_immobile, entry.kpm_cs])
        .filter((v): v is number => typeof v === "number");

      const avg = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

      return {
        date,
        value: Number(avg.toFixed(2)),
      };
    }

    const weaponEntry = dayEntries.find((entry) => entry.weapon === filter);
    const values = [weaponEntry?.kpm_immobile, weaponEntry?.kpm_cs].filter(
      (v): v is number => typeof v === "number"
    );

    const avg = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

    return {
      date,
      value: Number(avg.toFixed(2)),
    };
  });
}

function MiniLineChart({
  data,
  height = 260,
}: {
  data: { date: string; value: number }[];
  height?: number;
}) {
  const width = 1000;
  const padding = 28;

  if (!data.length) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-2xl border border-border/50 bg-bg/30 text-sm text-muted">
        Aucune donnée à afficher.
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const minValue = Math.min(...data.map((d) => d.value), 0);
  const range = Math.max(maxValue - minValue, 1);

  const points = data.map((d, index) => {
    const x =
      data.length === 1
        ? width / 2
        : padding + (index * (width - padding * 2)) / (data.length - 1);

    const y = height - padding - ((d.value - minValue) / range) * (height - padding * 2);

    return { x, y, ...d };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const yTicks = 4;
  const horizontalLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const ratio = i / yTicks;
    const y = padding + ratio * (height - padding * 2);
    const value = maxValue - ratio * range;
    return { y, value };
  });

  const shownLabels = points.filter((_, i) => {
    if (points.length <= 6) return true;
    const step = Math.ceil(points.length / 6);
    return i % step === 0 || i === points.length - 1;
  });

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[260px] w-full min-w-[700px] rounded-2xl border border-border/50 bg-bg/20"
        role="img"
        aria-label="Graphique de progression"
      >
        {horizontalLines.map((line, idx) => (
          <g key={idx}>
            <line
              x1={padding}
              y1={line.y}
              x2={width - padding}
              y2={line.y}
              className="stroke-border/40"
              strokeWidth="1"
            />
            <text
              x={8}
              y={line.y + 4}
              className="fill-muted text-[11px]"
            >
              {line.value.toFixed(1)}
            </text>
          </g>
        ))}

        <path d={path} fill="none" className="stroke-cs2" strokeWidth="3" />

        {points.map((p) => (
          <g key={`${p.date}-${p.x}`}>
            <circle cx={p.x} cy={p.y} r="4" className="fill-cs2" />
            <title>{`${p.date} — ${p.value}`}</title>
          </g>
        ))}

        {shownLabels.map((p) => (
          <text
            key={`label-${p.date}`}
            x={p.x}
            y={height - 8}
            textAnchor="middle"
            className="fill-muted text-[11px]"
          >
            {p.date.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
}
function formatFrenchDayLabel(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function getLast7DaysStatus(entries: Entry[], todayIso: string) {
  const entryDates = new Set(entries.map((e) => e.date));
  const today = new Date(`${todayIso}T00:00:00`);

  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - index));

    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

    return {
      date: iso,
      label: formatFrenchDayLabel(iso),
      hasEntry: entryDates.has(iso),
    };
  });
}
export function DashboardPage() {
  const nav = useNavigate();
  const session = useMemo(() => getSession(), []);
  const pseudo = session?.pseudo ?? "";

  const [entries, setEntries] = useState<Entry[]>([]);
  const [todayDraft, setTodayDraft] = useState<DayDraft | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [isSaving, setIsSaving] = useState(false);

  

  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
  }, []);

  const last7DaysStatus = useMemo(
  () => getLast7DaysStatus(entries, todayIso),
  [entries, todayIso]
);

  useEffect(() => {
    if (!session) {
      nav("/", { replace: true });
      return;
    }

    (async () => {
      let data: Entry[] = [];

      try {
        const r = await apiGetPlayer(session);
        data = Array.isArray(r.entries) ? clampLast90Days(r.entries as Entry[]) : [];
      } catch {
        data = await loadEntriesLocal(session.pseudo);
      }

      setEntries(data);
      setTodayDraft(entriesToDayDraft(data, todayIso));
    })();
  }, [session, nav, todayIso]);

  async function onSave() {
    if (!session || !todayDraft) return;

    setIsSaving(true);
    setStatus(null);

    try {
      // On sauvegarde une entrée par arme pour rester compatible avec l'API actuelle
      for (const { key } of WEAPONS) {
        const payload: Entry = {
          date: todayDraft.date,
          weapon: key,
          kpm_immobile: todayDraft.values[key].kpm_immobile,
          kpm_cs: todayDraft.values[key].kpm_cs,
        };
        await apiSaveEntry(session, payload);
      }

      const r = await apiGetPlayer(session);
      const next = Array.isArray(r.entries) ? clampLast90Days(r.entries as Entry[]) : [];
      setEntries(next);
      setTodayDraft(entriesToDayDraft(next, todayIso));
      setStatus("Enregistré ✅");
    } catch {
      // Dev fallback local
      const next = upsertEntriesFromDraft(entries, todayDraft);
      await saveEntriesLocal(session.pseudo, next);
      setEntries(next);
      setTodayDraft(entriesToDayDraft(next, todayIso));
      setStatus("Enregistré en local ✅");
    } finally {
      setIsSaving(false);
      window.setTimeout(() => setStatus(null), 2000);
    }
  }

  function logout() {
    clearSession();
    nav("/", { replace: true });
  }

  const graphData = useMemo(() => getDailyGraphData(entries, filter), [entries, filter]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative">
              <img
                src={profile.avatar}
                alt={pseudo}
                className="h-16 w-16 rounded-2xl border border-border/50 object-cover"
              />
              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-card bg-cs2" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">{pseudo}</div>
              <div className="truncate text-sm text-muted">
                Suivi d'entraînement CS2 — 90 jours
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={logout}
              className="rounded-full border border-border/60 bg-card/40 px-4 py-2 text-sm font-semibold hover:border-cs2/60"
            >
              Déconnexion
            </button>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted">{profile.about}</p>
        <div className="mt-4">
  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
    7 derniers jours
  </div>

  <div className="flex flex-wrap gap-2">
    {last7DaysStatus.map((day) => (
      <div
        key={day.date}
        className={`rounded-full border px-3 py-1 text-xs font-medium ${
          day.hasEntry
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-border/50 bg-card/30 text-muted"
        }`}
        title={`${day.date} — ${day.hasEntry ? "enregistré" : "aucun enregistrement"}`}
      >
        {day.label} · {day.hasEntry ? "OK" : "—"}
      </div>
    ))}
  </div>
</div>
      </Card>

      <section className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Saisie du jour — {todayIso}</CardTitle>
            <div className="text-sm text-muted">
              Renseigne toutes les armes pour aujourd’hui, puis enregistre la journée.
            </div>
          </CardHeader>

          <CardContent>
            {status ? (
              <div className="mb-4 rounded-xl2 border border-border/60 bg-bg/40 px-3 py-2 text-sm">
                {status}
              </div>
            ) : null}

            {todayDraft ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {WEAPONS.map(({ key, label }) => (
                    <div
                      key={key}
                      className="rounded-xl border border-border/50 bg-bg/20 p-3"
                    >
                      <div className="mb-2 text-sm font-semibold">{label}</div><div className="mb-3 font-semibold">{label}</div>

                      <div className="grid gap-3">
                        <label className="grid gap-1 text-sm">
                          <span className="text-muted">KPM immobile</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={todayDraft.values[key].kpm_immobile ?? ""}
                            onChange={(e) =>
                              setTodayDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      values: {
                                        ...prev.values,
                                        [key]: {
                                          ...prev.values[key],
                                          kpm_immobile:
                                            e.target.value === ""
                                              ? null
                                              : Number(e.target.value),
                                        },
                                      },
                                    }
                                  : prev
                              )
                            }
                            className="rounded-lg border border-border/60 bg-card/50 px-2.5 py-1.5 text-sm outline-none focus:border-cs2/60"
                          />
                        </label>

                        <label className="grid gap-1 text-sm">
                          <span className="text-muted">KPM CS</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={todayDraft.values[key].kpm_cs ?? ""}
                            onChange={(e) =>
                              setTodayDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      values: {
                                        ...prev.values,
                                        [key]: {
                                          ...prev.values[key],
                                          kpm_cs:
                                            e.target.value === ""
                                              ? null
                                              : Number(e.target.value),
                                        },
                                      },
                                    }
                                  : prev
                              )
                            }
                            className="rounded-xl border border-border/60 bg-card/50 px-3 py-2 outline-none focus:border-cs2/60"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    onClick={onSave}
                    disabled={isSaving}
                    className="rounded-full bg-cs2 px-5 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Enregistrement..." : "Enregistrer la journée"}
                  </button>

                  <div className="text-sm text-muted">
                    Historique conservé : 90 jours glissants
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Progression</CardTitle>
            <div className="text-sm text-muted">
              Filtre par arme ou vue globale. Aucun tableau brut affiché.
            </div>
          </CardHeader>

          <CardContent>
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  filter === "all"
                    ? "bg-cs2 text-black"
                    : "border border-border/60 bg-card/40 hover:border-cs2/60"
                }`}
              >
                Tous
              </button>

              {WEAPONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    filter === key
                      ? "bg-cs2 text-black"
                      : "border border-border/60 bg-card/40 hover:border-cs2/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <MiniLineChart data={graphData} />

            <div className="mt-4 text-xs text-muted">
              {filter === "all"
                ? "Vue Tous : moyenne des valeurs renseignées sur la journée."
                : `Vue ${WEAPONS.find((w) => w.key === filter)?.label ?? ""} : moyenne KPM immobile / KPM CS du jour.`}
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="mt-12 border-t border-border/40 py-8 text-center text-xs text-muted">
        © {new Date().getFullYear()} playSURE — Monitoring
      </footer>
    </main>
  );
}