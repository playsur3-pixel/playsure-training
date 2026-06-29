import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addWeapon,
  clearStoredSession,
  deleteWeapon,
  getMe,
  getStoredSession,
  login,
  logout,
  saveEntries,
  storeSession
} from "./api";
import type { ChartMode, Entry, PlayerData, RangeKey, Session, Weapon } from "./types";
import {
  buildDraft,
  downloadText,
  entriesForRange,
  exportPlayerJson,
  formatDateFr,
  getWeaponLabel,
  isoMinusDays,
  LINE_COLORS,
  mean,
  RANGE_OPTIONS,
  toCsv,
  todayIso
} from "./utils";

type Notice = { kind: "ok" | "error" | "neutral"; text: string } | null;

type ChartSeries = {
  id: string;
  label: string;
  color: string;
  points: { date: string; value: number }[];
};

type WeaponPreset = { id: string; label: string };
type WeaponCategory = { id: string; label: string; weapons: WeaponPreset[] };

type DashboardMetrics = {
  avg7: number | null;
  avg7Delta: number | null;
  bestWeapon: string;
  streak: number;
  sessions: number;
};

const WEAPON_CATEGORIES: WeaponCategory[] = [
  {
    id: "pistols",
    label: "Pistolets",
    weapons: [
      { id: "glock_18", label: "Glock-18" },
      { id: "usp_s", label: "USP-S" },
      { id: "p2000", label: "P2000" },
      { id: "dual_berettas", label: "Dual Berettas" },
      { id: "p250", label: "P250" },
      { id: "five_seven", label: "Five-SeveN" },
      { id: "tec_9", label: "Tec-9" },
      { id: "cz75_auto", label: "CZ75-Auto" },
      { id: "desert_eagle", label: "Desert Eagle" },
      { id: "r8_revolver", label: "R8 Revolver" }
    ]
  },
  {
    id: "smg",
    label: "SMG",
    weapons: [
      { id: "mac_10", label: "MAC-10" },
      { id: "mp9", label: "MP9" },
      { id: "mp7", label: "MP7" },
      { id: "mp5_sd", label: "MP5-SD" },
      { id: "ump_45", label: "UMP-45" },
      { id: "p90", label: "P90" },
      { id: "pp_bizon", label: "PP-Bizon" }
    ]
  },
  {
    id: "rifles",
    label: "Fusils",
    weapons: [
      { id: "galil_ar", label: "Galil AR" },
      { id: "famas", label: "FAMAS" },
      { id: "ak47", label: "AK47" },
      { id: "m4a4", label: "M4A4" },
      { id: "m4a1s", label: "M4A1-S" },
      { id: "aug", label: "AUG" },
      { id: "sg_553", label: "SG 553" }
    ]
  },
  {
    id: "snipers",
    label: "Snipers",
    weapons: [
      { id: "ssg_08", label: "SSG 08" },
      { id: "awp", label: "AWP" },
      { id: "scar_20", label: "SCAR-20" },
      { id: "g3sg1", label: "G3SG1" }
    ]
  },
  {
    id: "heavy",
    label: "Lourdes",
    weapons: [
      { id: "nova", label: "Nova" },
      { id: "xm1014", label: "XM1014" },
      { id: "mag_7", label: "MAG-7" },
      { id: "sawed_off", label: "Sawed-Off" },
      { id: "m249", label: "M249" },
      { id: "negev", label: "Negev" }
    ]
  }
];

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function parseKpmInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMetric(value: number | null, digits = 1) {
  return value === null ? "—" : value.toFixed(digits);
}

function weaponColor(index: number) {
  return LINE_COLORS[index % LINE_COLORS.length];
}

function LoginPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setLoading(true);

    try {
      const session = await login(username, password);
      onLogin(session);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Connexion impossible." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell min-h-dvh overflow-hidden bg-[#02070d] text-slate-100">
      <div className="login-bg" />
      <div className="login-noise" />

      <section className="relative z-10 mx-auto min-h-dvh max-w-7xl px-4 py-8 sm:py-10 lg:px-8">
        <div className="login-brand absolute inset-x-4 top-8 flex flex-col items-center text-center sm:top-10">
          <div className="inline-flex items-center gap-3 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[0.68rem] font-black uppercase tracking-[0.28em] text-cyan-100 shadow-[0_0_30px_rgba(14,165,233,0.16)]">
            <span className="h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_18px_rgba(251,146,60,0.95)]" />
            CS2 aim training tracker
          </div>

          <h1 className="login-title mt-8 text-center text-5xl font-black leading-none tracking-[-0.07em] sm:text-6xl lg:text-7xl">
            <span>playSURE</span> <span>Training</span>
          </h1>
        </div>

        <form onSubmit={submit} className="login-card absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-[430px] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border border-white/10 bg-[#07111d]/78 p-6 shadow-[0_36px_120px_rgba(0,0,0,0.62)] backdrop-blur-2xl lg:p-8">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/55 to-transparent" />
          <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative">
            <h2 className="text-center text-3xl font-black tracking-[-0.04em] text-white">Accès joueur</h2>
          </div>

          <div className="relative mt-8 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="font-bold text-slate-300">Utilisateur</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="login-input rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/70"
                placeholder="playSURE"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-bold text-slate-300">Mot de passe</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className="login-input rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/70"
                placeholder="••••••••"
              />
            </label>
          </div>

          {notice ? <NoticeBox notice={notice} /> : null}

          <button
            disabled={loading || username.trim().length < 2 || password.length < 6}
            className="relative mt-6 w-full overflow-hidden rounded-2xl border border-orange-300/50 bg-orange-500 px-5 py-3 text-sm font-black text-black shadow-[0_0_38px_rgba(249,115,22,0.25)] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </section>
    </main>
  );
}

function NoticeBox({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <div
      className={classNames(
        "rounded-2xl border px-4 py-3 text-sm font-semibold",
        notice.kind === "ok" && "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
        notice.kind === "error" && "border-red-400/30 bg-red-500/10 text-red-200",
        notice.kind === "neutral" && "border-white/10 bg-white/5 text-slate-300"
      )}
    >
      {notice.text}
    </div>
  );
}

function DashboardPage({ session, onLogout, onUserUpdate }: { session: Session; onLogout: () => void; onUserUpdate: (user: PlayerData) => void }) {
  const [user, setUser] = useState(session.user);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [draft, setDraft] = useState<Record<string, number | null>>(() => buildDraft(session.user, todayIso()));
  const [chartMode, setChartMode] = useState<ChartMode>("all");
  const [range, setRange] = useState<RangeKey>("week");
  const [weaponCategory, setWeaponCategory] = useState(WEAPON_CATEGORIES[0]?.id ?? "");
  const [selectedWeaponId, setSelectedWeaponId] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);

  const rangeDays = RANGE_OPTIONS.find((item) => item.key === range)?.days ?? 7;
  const minDate = isoMinusDays(180);
  const maxDate = todayIso();
  const metrics = useMemo(() => buildDashboardMetrics(user), [user]);

  const currentWeaponIds = useMemo(() => new Set(user.weapons.map((weapon) => weapon.id)), [user.weapons]);
  const selectedCategory = WEAPON_CATEGORIES.find((category) => category.id === weaponCategory) ?? WEAPON_CATEGORIES[0];
  const availablePresetWeapons = useMemo(
    () => selectedCategory.weapons.filter((weapon) => !currentWeaponIds.has(weapon.id)),
    [currentWeaponIds, selectedCategory]
  );
  const selectedPresetWeapon = availablePresetWeapons.find((weapon) => weapon.id === selectedWeaponId) ?? availablePresetWeapons[0] ?? null;

  useEffect(() => {
    setDraft(buildDraft(user, selectedDate));
  }, [user, selectedDate]);

  useEffect(() => {
    if (!selectedPresetWeapon) {
      setSelectedWeaponId("");
      return;
    }

    if (selectedWeaponId !== selectedPresetWeapon.id) {
      setSelectedWeaponId(selectedPresetWeapon.id);
    }
  }, [selectedPresetWeapon, selectedWeaponId]);

  function updateUser(next: PlayerData) {
    setUser(next);
    onUserUpdate(next);
  }

  async function submitEntries(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const next = await saveEntries(session.token, selectedDate, draft);
      updateUser(next);
      setNotice({ kind: "ok", text: "Saisie enregistrée." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Enregistrement impossible." });
    } finally {
      setSaving(false);
    }
  }

  async function submitWeapon(event: FormEvent) {
    event.preventDefault();
    if (!selectedPresetWeapon) return;
    setNotice(null);

    try {
      const next = await addWeapon(session.token, selectedPresetWeapon.label, selectedPresetWeapon.id, user.entries);
      updateUser(next);
      setNotice({ kind: "ok", text: `Arme ajoutée: ${selectedPresetWeapon.label}.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Ajout impossible." });
    }
  }

  async function removeWeapon(weapon: Weapon) {
    if (weapon.base) return;
    if (!window.confirm(`Supprimer ${weapon.label} du profil ? Les saisies de cette arme seront supprimées, les autres armes restent intactes.`)) return;

    try {
      const next = await deleteWeapon(session.token, weapon.id, user.entries);
      updateUser(next);
      setNotice({ kind: "ok", text: `${weapon.label} supprimée.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Suppression impossible." });
    }
  }

  async function disconnect() {
    await logout(session.token);
    onLogout();
  }

  function exportJson() {
    const payload = exportPlayerJson(user);
    downloadText(`playsure-training-${user.username}-${todayIso()}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  function exportCsv() {
    downloadText(`playsure-training-${user.username}-${todayIso()}.csv`, toCsv(user), "text/csv");
  }

  return (
    <main className="dashboard-shell min-h-dvh text-slate-100">
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="dashboard-header">
          <div className="flex items-center gap-4">
            <img src="/assets/avatar.png" alt="playSURE" className="h-12 w-12 rounded-2xl border border-orange-400/35 object-cover shadow-[0_0_24px_rgba(249,115,22,0.18)]" />
            <div>
              <p className="eyebrow">Training dashboard</p>
              <h1 className="text-xl font-black tracking-[-0.04em] text-white">{user.displayName || user.username}</h1>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={exportJson} className="button-secondary compact-button" type="button">JSON</button>
            <button onClick={exportCsv} className="button-secondary compact-button" type="button">CSV</button>
            <button onClick={disconnect} className="button-secondary compact-button" type="button">Déconnexion</button>
          </div>
        </header>

        <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Moyenne 7j"
            value={formatMetric(metrics.avg7)}
            suffix={metrics.avg7Delta === null ? "" : `${metrics.avg7Delta >= 0 ? "+" : ""}${metrics.avg7Delta.toFixed(1)}`}
            suffixKind={metrics.avg7Delta === null ? "neutral" : metrics.avg7Delta >= 0 ? "good" : "bad"}
          />
          <MetricCard label="Meilleure arme" value={metrics.bestWeapon} />
          <MetricCard label="Streak" value={`${metrics.streak} jour${metrics.streak > 1 ? "s" : ""}`} />
          <MetricCard label="Sessions totales" value={String(metrics.sessions)} />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <section className="grid gap-5">
            <form onSubmit={submitEntries} className="dashboard-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Saisie KPM</p>
                  <h2 className="panel-title">Journée</h2>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  min={minDate}
                  max={maxDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="input date-input"
                  aria-label="Date de saisie"
                />
              </div>

              <div className="mt-5 grid gap-2">
                {user.weapons.map((weapon, index) => {
                  const value = draft[weapon.id];
                  const color = weaponColor(index);
                  return (
                    <div key={weapon.id} className={classNames("weapon-row", value !== null && "weapon-row-active")}>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                        <span className="truncate font-black text-white">{weapon.label}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={value ?? ""}
                          onChange={(event) =>
                            setDraft((previous) => ({
                              ...previous,
                              [weapon.id]: parseKpmInput(event.target.value)
                            }))
                          }
                          className="kpm-input"
                          aria-label={`KPM ${weapon.label}`}
                        />
                        {!weapon.base ? (
                          <button type="button" onClick={() => removeWeapon(weapon)} className="delete-weapon-button" aria-label={`Supprimer ${weapon.label}`}>
                            Supprimer
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button disabled={saving} type="submit" className="button-primary mt-5 w-full">
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>

              {notice ? <div className="mt-4"><NoticeBox notice={notice} /></div> : null}
            </form>

            <form onSubmit={submitWeapon} className="dashboard-card">
              <p className="eyebrow">Profil</p>
              <h2 className="panel-title">Ajouter une arme</h2>

              <div className="mt-4 grid gap-3">
                <select
                  value={weaponCategory}
                  onChange={(event) => {
                    setWeaponCategory(event.target.value);
                    setSelectedWeaponId("");
                  }}
                  className="input w-full"
                  aria-label="Type d'arme"
                >
                  {WEAPON_CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedPresetWeapon?.id ?? ""}
                  onChange={(event) => setSelectedWeaponId(event.target.value)}
                  className="input w-full"
                  disabled={!availablePresetWeapons.length}
                  aria-label="Arme"
                >
                  {availablePresetWeapons.length ? (
                    availablePresetWeapons.map((weapon) => (
                      <option key={weapon.id} value={weapon.id}>
                        {weapon.label}
                      </option>
                    ))
                  ) : (
                    <option value="">Toutes les armes de ce type sont déjà ajoutées</option>
                  )}
                </select>

                <button className="button-primary w-full" type="submit" disabled={!selectedPresetWeapon}>
                  Ajouter
                </button>
              </div>
            </form>
          </section>

          <section className="dashboard-card min-w-0">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="eyebrow">Graphique</p>
                <h2 className="panel-title">Progression KPM</h2>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => setChartMode("all")} className={classNames("tab-button", chartMode === "all" && "tab-button-active")} type="button">
                  Tous
                </button>
                <button onClick={() => setChartMode("global")} className={classNames("tab-button", chartMode === "global" && "tab-button-active")} type="button">
                  Global
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {RANGE_OPTIONS.map((item) => (
                <button key={item.key} onClick={() => setRange(item.key)} className={classNames("range-button", range === item.key && "range-button-active")} type="button">
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              <KpmChart user={user} mode={chartMode} rangeDays={rangeDays} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function MetricCard({ label, value, suffix, suffixKind = "neutral" }: { label: string; value: string; suffix?: string; suffixKind?: "good" | "bad" | "neutral" }) {
  return (
    <article className="metric-card">
      <p className="text-sm font-semibold text-slate-400">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <strong className="text-2xl font-black leading-none tracking-[-0.05em] text-white">{value}</strong>
        {suffix ? (
          <span
            className={classNames(
              "text-sm font-black",
              suffixKind === "good" && "text-emerald-300",
              suffixKind === "bad" && "text-red-300",
              suffixKind === "neutral" && "text-slate-400"
            )}
          >
            {suffix}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function KpmChart({ user, mode, rangeDays }: { user: PlayerData; mode: ChartMode; rangeDays: number }) {
  const { series, dates, yMin, yMax } = useMemo(() => buildChartData(user, mode, rangeDays), [user, mode, rangeDays]);
  const width = 1100;
  const height = 440;
  const padding = { top: 28, right: 28, bottom: 44, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const range = yMax - yMin || 1;

  function xFor(date: string) {
    const index = dates.indexOf(date);
    if (dates.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (dates.length - 1)) * chartWidth;
  }

  function yFor(value: number) {
    return padding.top + (1 - (value - yMin) / range) * chartHeight;
  }

  const gridLines = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const value = yMax - ratio * range;
    const y = padding.top + ratio * chartHeight;
    return { value, y };
  });

  const visibleDateLabels = dates.filter((_, index) => {
    if (dates.length <= 8) return true;
    const step = Math.ceil(dates.length / 8);
    return index % step === 0 || index === dates.length - 1;
  });

  if (!series.some((item) => item.points.length)) {
    return <div className="chart-empty">Aucune donnée sur cette période.</div>;
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-[1.25rem] border border-white/10 bg-black/20">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[440px] min-w-[780px] w-full" role="img" aria-label="Courbe KPM">
          {gridLines.map((line) => (
            <g key={line.y}>
              <line x1={padding.left} x2={width - padding.right} y1={line.y} y2={line.y} stroke="rgba(255,255,255,0.10)" />
              <text x="16" y={line.y + 4} fill="rgba(226,232,240,0.70)" fontSize="12">{line.value.toFixed(0)}</text>
            </g>
          ))}

          {visibleDateLabels.map((date) => (
            <text key={date} x={xFor(date)} y={height - 16} textAnchor="middle" fill="rgba(226,232,240,0.60)" fontSize="12">
              {formatDateFr(date)}
            </text>
          ))}

          {series.map((item) => {
            const polyline = item.points.map((point) => `${xFor(point.date)},${yFor(point.value)}`).join(" ");
            return (
              <g key={item.id}>
                {item.points.length > 1 ? <polyline points={polyline} fill="none" stroke={item.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : null}
                {item.points.map((point) => (
                  <g key={`${item.id}-${point.date}`}>
                    <circle cx={xFor(point.date)} cy={yFor(point.value)} r="4.5" fill={item.color} stroke="rgba(2,6,12,0.92)" strokeWidth="2" />
                    <title>{`${item.label} · ${formatDateFr(point.date)} · ${point.value.toFixed(1)} KPM`}</title>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {series.map((item) => (
          <div key={item.id} className="inline-flex items-center gap-2 text-sm font-bold text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildDashboardMetrics(user: PlayerData): DashboardMetrics {
  const entries = entriesForRange(user.entries, 180);
  const entries7 = entriesForRange(user.entries, 7);
  const cutoff14 = isoMinusDays(14);
  const cutoff7 = isoMinusDays(7);
  const previous7 = user.entries.filter((entry) => entry.date >= cutoff14 && entry.date < cutoff7);

  const avg7 = mean(entries7.map((entry) => entry.kpm));
  const previousAvg7 = mean(previous7.map((entry) => entry.kpm));
  const avg7Delta = avg7 === null || previousAvg7 === null ? null : avg7 - previousAvg7;

  const activeDays = new Set(entries.map((entry) => entry.date));
  const sessions = activeDays.size;

  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let streak = 0;
  while (activeDays.has(todayIso(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let bestWeapon = "—";
  let bestAverage = -Infinity;

  for (const weapon of user.weapons) {
    const values = entries.filter((entry) => entry.weaponId === weapon.id).map((entry) => entry.kpm);
    const average = mean(values);
    if (average !== null && average > bestAverage) {
      bestAverage = average;
      bestWeapon = getWeaponLabel(user.weapons, weapon.id);
    }
  }

  return { avg7, avg7Delta, bestWeapon, streak, sessions };
}

function buildChartData(user: PlayerData, mode: ChartMode, rangeDays: number) {
  const entries = entriesForRange(user.entries, rangeDays);
  const dates = [...new Set(entries.map((entry) => entry.date))].sort((a, b) => a.localeCompare(b));
  const byDate = new Map<string, Entry[]>();

  for (const date of dates) byDate.set(date, []);
  for (const entry of entries) byDate.get(entry.date)?.push(entry);

  let series: ChartSeries[] = [];

  if (mode === "global") {
    series = [
      {
        id: "global",
        label: "Moyenne globale",
        color: "#f59e0b",
        points: dates
          .map((date) => {
            const values = (byDate.get(date) || []).map((entry) => entry.kpm);
            const value = mean(values);
            return value === null ? null : { date, value };
          })
          .filter((point): point is { date: string; value: number } => point !== null)
      }
    ];
  } else {
    series = user.weapons.map((weapon, index) => ({
      id: weapon.id,
      label: weapon.label,
      color: weaponColor(index),
      points: dates
        .map((date) => {
          const entry = (byDate.get(date) || []).find((item) => item.weaponId === weapon.id);
          return entry ? { date, value: entry.kpm } : null;
        })
        .filter((point): point is { date: string; value: number } => point !== null)
    }));
  }

  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 100;
  let yMin = Math.floor(rawMin - 15);
  let yMax = Math.ceil(rawMax + 15);

  if (yMin === yMax) {
    yMin -= 10;
    yMax += 10;
  }

  return { series, dates, yMin, yMax };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => getStoredSession());
  const [booting, setBooting] = useState(Boolean(getStoredSession()));

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) {
      setBooting(false);
      return;
    }

    getMe(stored.token)
      .then((user) => {
        const next = { ...stored, user };
        storeSession(next);
        setSession(next);
      })
      .catch(() => {
        clearStoredSession();
        setSession(null);
      })
      .finally(() => setBooting(false));
  }, []);

  function handleUserUpdate(user: PlayerData) {
    setSession((previous) => {
      if (!previous) return previous;
      const next = { ...previous, user };
      storeSession(next);
      return next;
    });
  }

  if (booting) {
    return <main className="grid min-h-dvh place-items-center bg-[#080b10] text-sm font-semibold text-slate-400">Chargement...</main>;
  }

  if (!session) {
    return <LoginPage onLogin={setSession} />;
  }

  return <DashboardPage session={session} onLogout={() => setSession(null)} onUserUpdate={handleUserUpdate} />;
}
