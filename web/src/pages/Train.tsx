import { useEffect, useMemo, useRef, useState } from "react";

import type { Exercise } from "../../../engine/reps.ts";
import { STAT_INFO } from "../components/StatBars.tsx";
import { champOf, logWorkout, useProfile, type Workout } from "../data/store.ts";
import type { Champ } from "../data/store.ts";
import type { GoOptions } from "../nav.ts";
import { PoseCounter } from "../train/PoseCounter.tsx";

const KIND_LABEL: Record<Workout["kind"], { label: string; unit: string }> = {
  pushups: { label: "Push-ups", unit: "reps" },
  squats: { label: "Squats", unit: "reps" },
  steps: { label: "Steps", unit: "steps" },
  run: { label: "Run", unit: "km" },
  active: { label: "Active time", unit: "min" },
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
      {workouts.map((w) => (
        <li key={w.id}>
          <span className={`wk-icon wk-${w.kind}`} aria-hidden>
            {w.kind === "pushups" ? "💪" : w.kind === "squats" ? "🦵" : w.kind === "run" ? "🏃" : w.kind === "steps" ? "👟" : "⏱"}
          </span>
          <div>
            <b>{describe(w)}</b>
            <span className={`source ${w.flagged && w.source === "camera" ? "review" : w.source}`}>{w.flagged && w.source === "camera" ? "Camera · under review" : SOURCE_LABEL[w.source]}</span>
          </div>
          <time className="mono">{new Date(w.time).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</time>
        </li>
      ))}
    </ul>
  );
}

function gainsBetween(a: Champ, b: Champ): string {
  const parts = STAT_INFO.filter((s) => b.stats[s.key] !== a.stats[s.key]).map((s) => `${s.label} ${a.stats[s.key]} → ${b.stats[s.key]}`);
  return parts.length ? parts.join(" · ") : "Stats unchanged (you're near today's cap for this exercise)";
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
  const manualRef = useRef<HTMLElement>(null);
  const beforeRef = useRef<Champ>(champ);

  useEffect(() => {
    if (opts.exercise) setActive(opts.exercise);
    if (opts.manual) manualRef.current?.scrollIntoView({ behavior: "smooth" });
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
      setSaved(`Saved ${w.amount.toLocaleString()} ${KIND_LABEL[w.kind].label.toLowerCase()}. ${gainsBetween(beforeRef.current, champ)}`);
    }
  }, [profile, champ]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="label">Train</div>
          <h1>Work out</h1>
        </div>
      </header>

      {error && (
        <div className="toast error-toast" role="alert">
          <span>{error}</span>
          <button className="btn small" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {saved && (
        <div className="toast" role="status">
          <span>✓ {saved}</span>
          <button className="btn small" onClick={() => setSaved(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {active ? (
        <section className="card">
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
        </section>
      ) : (
        <div className="exercise-grid">
          <button className="exercise" onClick={() => setActive("pushup")}>
            <span className="ex-emoji" aria-hidden>
              💪
            </span>
            <b>Push-ups</b>
            <span>Camera counted · builds Power</span>
          </button>
          <button className="exercise" onClick={() => setActive("squat")}>
            <span className="ex-emoji" aria-hidden>
              🦵
            </span>
            <b>Squats</b>
            <span>Camera counted · builds Defense</span>
          </button>
          <div className="exercise soon">
            <span className="ex-emoji" aria-hidden>
              ⌚
            </span>
            <b>Connect a tracker</b>
            <span>Fitbit, Garmin, Strava sync for steps and runs. Coming in the next phase.</span>
          </div>
        </div>
      )}

      <section className="card" ref={manualRef}>
        <h2>Log activity</h2>
        <p className="note">Manual entries count for Duels and free Rumbles. Cash Rumbles will only count camera-verified and tracker data.</p>
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
              placeholder={kind === "steps" ? "e.g. 6500" : kind === "run" ? "e.g. 3.5" : "e.g. 20"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label={`${KIND_LABEL[kind].label} amount in ${KIND_LABEL[kind].unit}`}
            />
            <span className="unit">{KIND_LABEL[kind].unit}</span>
            <button className="btn btn-primary" type="submit" disabled={busy || !(Number(amount) > 0)}>
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>History</h2>
        <WorkoutList workouts={profile.workouts.slice(0, 30)} empty="Your workouts will show up here." />
      </section>
    </div>
  );
}
