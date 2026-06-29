import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addWeapon,
  clearStoredSession,
  deleteDay,
  deleteWeapon,
  getMe,
  getStoredSession,
  login,
  logout,
  saveEntries,
  storeSession
} from "./api";
import type { ChartMode, PlayerData, RangeKey, Session, Weapon } from "./types";
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

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
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
        "mt-5 rounded-2xl border px-4 py-3 text-sm",
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
  const [range, setRange] = useState<RangeKey>("month");
  const [newWeapon, setNewWeapon] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);

  const rangeDays = RANGE_OPTIONS.find((item) => item.key === range)?.days ?? 30;
  const minDate = isoMinusDays(180);
  const maxDate = todayIso();

  useEffect(() => {
    setDraft(buildDraft(user, selectedDate));
  }, [user, selectedDate]);

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

  async function clearDay() {
    if (!window.confirm(`Supprimer toutes les saisies du ${selectedDate} ?`)) return;
    setSaving(true);
    setNotice(null);

    try {
      const next = await deleteDay(session.token, selectedDate);
      updateUser(next);
      setNotice({ kind: "ok", text: "Journée supprimée." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Suppression impossible." });
    } finally {
      setSaving(false);
    }
  }

  async function submitWeapon(event: FormEvent) {
    event.preventDefault();
    const label = newWeapon.trim();
    if (label.length < 2) return;
    setNotice(null);

    try {
      const next = await addWeapon(session.token, label);
      updateUser(next);
      setNewWeapon("");
      setNotice({ kind: "ok", text: `Arme ajoutée: ${label}.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Ajout impossible." });
    }
  }

  async function removeWeapon(weapon: Weapon) {
    if (weapon.base) return;
    if (!window.confirm(`Supprimer ${weapon.label} et ses anciennes saisies ?`)) return;

    try {
      const next = await deleteWeapon(session.token, weapon.id);
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
    <main className="min-h-dvh bg-[#080b10] text-slate-100">
      <header className="border-b border-white/10 bg-[#0b111b]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <img src="/assets/avatar.png" alt="playSURE" className="h-12 w-12 rounded-2xl border border-orange-400/30 object-cover" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">Training dashboard</p>
              <h1 className="text-xl font-black text-white">{user.displayName || user.username}</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportJson} className="button-secondary">Export JSON</button>
            <button onClick={exportCsv} className="button-secondary">Export CSV</button>
            <button onClick={disconnect} className="button-secondary">Déconnexion</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="grid gap-6">
          <form onSubmit={submitEntries} className="panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Saisie KPM</p>
                <h2 className="panel-title">Journée</h2>
              </div>
              <label className="grid gap-1 text-xs font-semibold text-slate-400">
                Date
                <input
                  type="date"
                  value={selectedDate}
                  min={minDate}
                  max={maxDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="input w-[150px]"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3">
              {user.weapons.map((weapon) => (
                <div key={weapon.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">{weapon.label}</div>
                      <div className="text-xs text-slate-500">KPM</div>
                    </div>
                    {!weapon.base ? (
                      <button type="button" onClick={() => removeWeapon(weapon)} className="text-xs font-bold text-red-300 hover:text-red-200">
                        Supprimer
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    value={draft[weapon.id] ?? ""}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        [weapon.id]: event.target.value === "" ? null : Number(event.target.value)
                      }))
                    }
                    className="input w-full"
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button disabled={saving} type="submit" className="button-primary">
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button disabled={saving} type="button" onClick={clearDay} className="button-danger">
                Supprimer la journée
              </button>
            </div>

            {notice ? <NoticeBox notice={notice} /> : null}
          </form>

          <form onSubmit={submitWeapon} className="panel">
            <p className="eyebrow">Profil</p>
            <h2 className="panel-title">Ajouter une arme</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              M4A4, M4A1-S et AK47 restent les champs de base. Les armes ajoutées ici sont stockées dans le JSON du joueur.
            </p>
            <div className="mt-4 flex gap-2">
              <input value={newWeapon} onChange={(event) => setNewWeapon(event.target.value)} className="input min-w-0 flex-1" placeholder="Glock, USP-S, Famas..." />
              <button className="button-primary whitespace-nowrap" type="submit">Ajouter</button>
            </div>
          </form>

          <StatsCard user={user} />
        </section>

        <section className="panel min-w-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="eyebrow">Graphique</p>
              <h2 className="panel-title">Progression KPM</h2>
              <p className="mt-2 text-sm text-slate-400">Échelle Y dynamique : minimum enregistré -15 KPM, maximum enregistré +15 KPM.</p>
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
    </main>
  );
}

function StatsCard({ user }: { user: PlayerData }) {
  const activeDays = new Set(user.entries.map((entry) => entry.date)).size;
  const values = user.entries.map((entry) => entry.kpm);
  const avg = mean(values);
  const best = values.length ? Math.max(...values) : null;

  return (
    <section className="panel">
      <p className="eyebrow">Résumé 180 jours</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric label="Jours" value={String(activeDays)} />
        <Metric label="Moyenne" value={avg === null ? "—" : avg.toFixed(1)} />
        <Metric label="Max" value={best === null ? "—" : best.toFixed(1)} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function KpmChart({ user, mode, rangeDays }: { user: PlayerData; mode: ChartMode; rangeDays: number }) {
  const { series, dates, yMin, yMax } = useMemo(() => buildChartData(user, mode, rangeDays), [user, mode, rangeDays]);
  const width = 1100;
  const height = 520;
  const padding = { top: 28, right: 28, bottom: 46, left: 58 };
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
      <div className="overflow-x-auto rounded-[1.5rem] border border-white/10 bg-black/20">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[520px] min-w-[820px] w-full" role="img" aria-label="Courbe KPM">
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
                {item.points.length > 1 ? <polyline points={polyline} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
                {item.points.map((point) => (
                  <g key={`${item.id}-${point.date}`}>
                    <circle cx={xFor(point.date)} cy={yFor(point.value)} r="4" fill={item.color} />
                    <title>{`${item.label} · ${formatDateFr(point.date)} · ${point.value.toFixed(1)} KPM`}</title>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {series.map((item) => (
          <div key={item.id} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildChartData(user: PlayerData, mode: ChartMode, rangeDays: number) {
  const entries = entriesForRange(user.entries, rangeDays);
  const dates = [...new Set(entries.map((entry) => entry.date))].sort((a, b) => a.localeCompare(b));
  const byDate = new Map<string, typeof entries>();

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
      color: LINE_COLORS[index % LINE_COLORS.length],
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
