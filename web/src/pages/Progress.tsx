import { useMemo, useState } from "react";

import { BarChart, LineChart, SERIES } from "../components/Charts.tsx";
import { champOf, dayLog, daysAgo, isActiveDay, useProfile } from "../data/store.ts";

function shortLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function Progress() {
  const profile = useProfile();
  const [range, setRange] = useState<7 | 14 | 28>(14);

  const days = useMemo(() => Array.from({ length: range }, (_, i) => daysAgo(range - 1 - i)), [range]);
  const logs = days.map((d) => ({ date: d, ...dayLog(profile, d) }));
  const ovr = useMemo(() => days.map((d) => ({ label: shortLabel(d), value: champOf(profile, d).rating })), [days, profile]);

  const total = (k: "steps" | "pushups" | "squats" | "activeMinutes" | "runKm") => logs.reduce((s, l) => s + l[k], 0);
  const activeDays = logs.filter(isActiveDay).length;
  const bestSteps = logs.reduce((b, l) => (l.steps > b.steps ? l : b), logs[0]);
  const ovrChange = ovr[ovr.length - 1].value - ovr[0].value;

  const best = (k: "steps" | "pushups" | "squats") => profile.bests[k] ?? 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="label">Progress</div>
          <h1>Your training</h1>
        </div>
        <div className="seg" role="radiogroup" aria-label="Time range">
          {([7, 14, 28] as const).map((r) => (
            <button key={r} role="radio" aria-checked={range === r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>
              {r} days
            </button>
          ))}
        </div>
      </header>

      <div className="tiles">
        <div className="tile">
          <div className="label">Steps</div>
          <div className="tile-value mono">{total("steps").toLocaleString()}</div>
          <div className="note">avg {Math.round(total("steps") / range).toLocaleString()} a day</div>
        </div>
        <div className="tile">
          <div className="label">Reps</div>
          <div className="tile-value mono">{(total("pushups") + total("squats")).toLocaleString()}</div>
          <div className="note">
            {total("pushups")} push-ups · {total("squats")} squats
          </div>
        </div>
        <div className="tile">
          <div className="label">Active days</div>
          <div className="tile-value mono">
            {activeDays}
            <small>/{range}</small>
          </div>
          <div className="note">{profile.streak.current} day streak now</div>
        </div>
        <div className="tile">
          <div className="label">Champ OVR</div>
          <div className="tile-value mono">{ovr[ovr.length - 1].value}</div>
          <div className={`note ${ovrChange > 0 ? "up" : ovrChange < 0 ? "down" : ""}`}>
            {ovrChange > 0 ? "▲" : ovrChange < 0 ? "▼" : "•"} {Math.abs(ovrChange)} in {range} days
          </div>
        </div>
      </div>

      <section className="card">
        <h2>Steps per day</h2>
        <p className="note">
          Best day: {bestSteps.steps.toLocaleString()} on {shortLabel(bestSteps.date)}
        </p>
        <BarChart data={logs.map((l) => ({ label: shortLabel(l.date), value: l.steps }))} color={SERIES.steps} goal={profile.goals.steps} unit="steps" />
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Reps per day</h2>
          <p className="note">Push-ups and squats combined</p>
          <BarChart data={logs.map((l) => ({ label: shortLabel(l.date), value: l.pushups + l.squats }))} color={SERIES.reps} goal={profile.goals.reps} unit="reps" />
        </section>
        <section className="card">
          <h2>Champ rating (OVR)</h2>
          <p className="note">Rises with training, fades when you stop</p>
          <LineChart data={ovr} color={SERIES.ovr} unit="OVR" />
        </section>
      </div>

      <section className="card">
        <h2>Personal bests</h2>
        <div className="bests">
          <div>
            <span>Most steps in a day</span>
            <b className="mono">{best("steps").toLocaleString()}</b>
          </div>
          <div>
            <span>Most push-ups in a day</span>
            <b className="mono">{best("pushups")}</b>
          </div>
          <div>
            <span>Most squats in a day</span>
            <b className="mono">{best("squats")}</b>
          </div>
          <div>
            <span>Total distance run ({range} days)</span>
            <b className="mono">{total("runKm").toFixed(1)} km</b>
          </div>
        </div>
      </section>
    </div>
  );
}
