import { Activity, Camera, Dumbbell, Footprints, Plus, Timer, Watch, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Exercise } from "../../../engine/reps.ts";
import { STAT_INFO } from "../components/StatBars.tsx";
import { BigNumber, Card, CardLabel, DotMatrix, IconButton, ProgressCircle, Toast } from "../components/ui.tsx";
import { champOf, dayLog, daysAgo, isActiveDay, logWorkout, today, useProfile, type Champ, type DayLog, type Profile, type Workout } from "../data/store.ts";
import type { GoOptions } from "../nav.ts";
import { PoseCounter } from "../train/PoseCounter.tsx";

const KIND_LABEL: Record<Workout["kind"], { label: string; unit: string; icon: LucideIcon }> = {
  pushups: { label: "Push-ups", unit: "reps", icon: Dumbbell },
  squats: { label: "Squats", unit: "reps", icon: Zap },
  steps: { label: "Steps", unit: "steps", icon: Footprints },
  run: { label: "Run", unit: "km", icon: Activity },
  active: { label: "Active time", unit: "min", icon: Timer },
};

const SOURCE_LABEL: Record<Workout["source"], string> = { camera: "Camera verified", manual: "Logged manually", tracker: "Tracker" };

function describe(w: Workout): string {
  const n = w.amount.toLocaleString();
  switch (w.kind) {
    case "pushups":
      return `${n} push-ups`;
    case "squats":
      return `${n} squats`;
    case "steps":
      return `${n} steps`;
    case "run":
      return `${n} km run`;
    case "active":
      return `${n} min active`;
  }
}

export function WorkoutList({ workouts, empty }: { workouts: Workout[]; empty: string }) {
  if (workouts.length === 0) return <p className="note">{empty}</p>;
  return (
    <ul className="workouts">
      {workouts.map((w) => {
        const Icon = KIND_LABEL[w.kind].icon;
        const review = !!w.flagged && w.source === "camera";
        return (
          <li key={w.id}>
            <span className="wk-icon" aria-hidden>
              <Icon size={17} />
            </span>
            <div>
              <b>{describe(w)}</b>
              <span className={`source ${review ? "review" : w.source}`}>{review ? "Camera · under review" : SOURCE_LABEL[w.source]}</span>
            </div>
            <time>{new Date(w.time).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</time>
          </li>
        );
      })}
    </ul>
  );
}

function gainsBetween(a: Champ, b: Champ): string {
  const parts = STAT_INFO.filter((s) => b.stats[s.key] !== a.stats[s.key]).map((s) => `${s.label} ${a.stats[s.key]} → ${b.stats[s.key]}`);
  return parts.length ? parts.join(" · ") : "Stats unchanged (you're near today's cap for this exercise)";
}

function activityLevel(d: DayLog): 0 | 1 | 2 | 3 {
  const score = d.steps / 8000 + (d.pushups + d.squats) / 60 + d.activeMinutes / 30;
  return score <= 0.15 ? 0 : score < 1 ? 1 : score < 2 ? 2 : 3;
}

function lastDays(p: Profile, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const date = daysAgo(n - 1 - i);
    return { date, ...dayLog(p, date) };
  });
}

function lastSessionLabel(p: Profile, kind: Workout["kind"]): string {
  const w = p.workouts.find((x) => x.kind === kind);
  if (!w) return "Not done yet";
  if (w.date === today()) return "Today";
  return new Date(w.time).toLocaleDateString(undefined, { weekday: "long" });
}

export function Train({ opts }: { opts: GoOptions }) {
  const profile = useProfile();
  const champ = useMemo(() => champOf(profile), [profile]);
  const [active, setActive] = useState<Exercise | null>(opts.exercise ?? null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<Workout["kind"]>("pushups");
  const [amount, setAmount] = useState("");
  const manualRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<Champ>(champ);

  useEffect(() => {
    if (opts.exercise) setActive(opts.exercise);
    if (opts.manual) setTimeout(() => manualRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [opts]);

  const save = async (k: Workout["kind"], n: number, source: Workout["source"], durationSec?: number) => {
    beforeRef.current = champOf(profile);
    setBusy(true);
    setError(null);
    try {
      await logWorkout(k, n, source, durationSec);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Show the stat change once the store has the new workout.
  const lastId = useRef(profile.workouts[0]?.id);
  useEffect(() => {
    const w = profile.workouts[0];
    if (w && w.id !== lastId.current) {
      lastId.current = w.id;
      setSaved(`Saved ${describe(w)}. ${gainsBetween(beforeRef.current, champ)}`);
    }
  }, [profile, champ]);

  const day = dayLog(profile, today());
  // Exactly three calendar months: from the 1st of the month two months ago to today.
  const calendarDays = useMemo(() => {
    const d = new Date(`${today()}T12:00:00`);
    const first = new Date(d.getFullYear(), d.getMonth() - 2, 1, 12);
    return Math.round((d.getTime() - first.getTime()) / 86_400_000) + 1;
  }, []);
  const calendar = useMemo(() => lastDays(profile, calendarDays), [profile, calendarDays]);
  const quarter = useMemo(() => calendar.map((d) => ({ date: d.date, level: activityLevel(d) })), [calendar]);
  const week = useMemo(() => lastDays(profile, 7), [profile]);
  const weekReps = week.reduce((s, d) => s + d.pushups + d.squats, 0);
  const activeDays = calendar.filter(isActiveDay).length;
  const repShare = profile.goals.reps / 2;

  return (
    <div className="page">
      <header className="title-row">
        <h1>Workouts</h1>
        <div className="title-actions">
          <IconButton icon={Camera} label="Count push-ups with camera" onClick={() => setActive("pushup")} />
          <IconButton icon={Plus} label="Log activity" onClick={() => manualRef.current?.scrollIntoView({ behavior: "smooth" })} />
        </div>
      </header>

      {error && (
        <Toast error onClose={() => setError(null)}>
          {error}
        </Toast>
      )}
      {saved && <Toast onClose={() => setSaved(null)}>✓ {saved}</Toast>}

      {active ? (
        <Card>
          <PoseCounter
            key={active}
            exercise={active}
            onCancel={() => setActive(null)}
            onFinish={(reps, durationSec) => {
              setActive(null);
              if (reps > 0) save(active === "pushup" ? "pushups" : "squats", reps, "camera", durationSec);
              else setSaved("No full reps counted this time. Try again with your whole body in view.");
            }}
          />
        </Card>
      ) : (
        <div className="grid-2">
          <button className="card exercise-card" onClick={() => setActive("pushup")}>
            <div className="ex-top">
              <ProgressCircle value={day.pushups / repShare}>{day.pushups}</ProgressCircle>
              <Camera size={17} className="muted" aria-hidden />
            </div>
            <b>Push-ups</b>
            <span>{lastSessionLabel(profile, "pushups")} · Power</span>
          </button>
          <button className="card exercise-card" onClick={() => setActive("squat")}>
            <div className="ex-top">
              <ProgressCircle value={day.squats / repShare}>{day.squats}</ProgressCircle>
              <Camera size={17} className="muted" aria-hidden />
            </div>
            <b>Squats</b>
            <span>{lastSessionLabel(profile, "squats")} · Defense</span>
          </button>
        </div>
      )}

      <Card className="calendar-card">
        <DotMatrix days={quarter} />
        <div className="cal-foot">
          <ProgressCircle value={activeDays / calendarDays} size={38}>
            <Activity size={14} />
          </ProgressCircle>
          <div>
            <b>
              {activeDays} of {calendarDays} days active
            </b>
            <span className="muted">Last 3 months · {profile.streak.current} day streak</span>
          </div>
        </div>
      </Card>

      <Card className="row-card">
        <div>
          <b>Volume</b>
          <span className="muted">Last 7 days</span>
        </div>
        <BigNumber value={weekReps.toLocaleString()} unit="reps" />
      </Card>

      <div className="grid-2">
        <Card className="soon-card">
          <Watch size={22} aria-hidden />
          <b>Connect a tracker</b>
          <span className="muted">Fitbit, Garmin, Strava sync for steps and runs. Coming soon.</span>
        </Card>
        <Card>
          <CardLabel icon={Footprints}>Today</CardLabel>
          <BigNumber value={day.steps.toLocaleString()} unit="steps" small />
          <span className="muted small-print">
            {day.runKm ? `${day.runKm} km run · ` : ""}
            {day.activeMinutes} active min
          </span>
        </Card>
      </div>

      <div ref={manualRef}>
        <Card>
          <CardLabel icon={Plus}>Log activity</CardLabel>
          <form
            className="manual"
            onSubmit={async (e) => {
              e.preventDefault();
              const n = Number(amount);
              if (n > 0 && (await save(kind, n, "manual"))) setAmount("");
            }}
          >
            <div className="chip-select" role="radiogroup" aria-label="Activity">
              {(Object.keys(KIND_LABEL) as Workout["kind"][]).map((k) => (
                <button type="button" key={k} role="radio" aria-checked={kind === k} className={`chip-btn ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
                  {KIND_LABEL[k].label}
                </button>
              ))}
            </div>
            <div className="manual-row">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step={kind === "run" ? "0.1" : "1"}
                placeholder={kind === "steps" ? "6500" : kind === "run" ? "3.5" : "20"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label={`${KIND_LABEL[kind].label} amount in ${KIND_LABEL[kind].unit}`}
              />
              <span className="unit">{KIND_LABEL[kind].unit}</span>
              <button className="btn btn-primary" type="submit" disabled={busy || !(Number(amount) > 0)}>
                Add
              </button>
            </div>
            <p className="note">Manual entries count for Duels and free Rumbles. Cash Rumbles will only count camera-verified and tracker data.</p>
          </form>
        </Card>
      </div>

      <Card>
        <CardLabel icon={Dumbbell}>History</CardLabel>
        <WorkoutList workouts={profile.workouts.slice(0, 30)} empty="Your workouts will show up here." />
      </Card>
    </div>
  );
}
