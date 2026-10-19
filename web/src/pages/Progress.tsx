import { Activity, ChartNoAxesColumn, Dumbbell, Footprints, Medal, Zap } from "lucide-react";
import { useMemo, useState } from "react";

import { BarChart, LineChart, SERIES } from "../components/Charts.tsx";
import { BigNumber, Card, CardLabel } from "../components/ui.tsx";
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
      <header className="title-row">
        <h1>Progress</h1>
        <div className="seg" role="radiogroup" aria-label="Time range">
          {([7, 14, 28] as const).map((r) => (
            <button key={r} role="radio" aria-checked={range === r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>
              {r}d
            </button>
          ))}
        </div>
      </header>

      <div className="grid-2 tiles">
        <Card>
          <CardLabel icon={Footprints}>Steps</CardLabel>
          <BigNumber value={total("steps").toLocaleString()} small />
          <span className="muted small-print">avg {Math.round(total("steps") / range).toLocaleString()} a day</span>
        </Card>
        <Card>
          <CardLabel icon={Dumbbell}>Reps</CardLabel>
          <BigNumber value={(total("pushups") + total("squats")).toLocaleString()} small />
          <span className="muted small-print">
            {total("pushups")} push-ups · {total("squats")} squats
          </span>
        </Card>
        <Card>
          <CardLabel icon={Activity}>Active days</CardLabel>
          <BigNumber value={activeDays} unit={`/ ${range}`} small />
          <span className="muted small-print">{profile.streak.current} day streak now</span>
        </Card>
        <Card>
          <CardLabel icon={Zap}>Champ OVR</CardLabel>
          <BigNumber value={ovr[ovr.length - 1].value} small />
          <span className={`small-print ${ovrChange > 0 ? "up" : ovrChange < 0 ? "down" : "muted"}`}>
            {ovrChange > 0 ? "▲" : ovrChange < 0 ? "▼" : "•"} {Math.abs(ovrChange)} in {range} days
          </span>
        </Card>
      </div>

      <Card>
        <CardLabel icon={Footprints} action={<span className="muted">Best {bestSteps.steps.toLocaleString()} · {shortLabel(bestSteps.date)}</span>}>
          Steps per day
        </CardLabel>
        <BarChart data={logs.map((l) => ({ label: shortLabel(l.date), value: l.steps }))} color={SERIES.steps} goal={profile.goals.steps} unit="steps" />
      </Card>

      <div className="grid-2 wide-only">
        <Card>
          <CardLabel icon={Dumbbell}>Reps per day</CardLabel>
          <BarChart data={logs.map((l) => ({ label: shortLabel(l.date), value: l.pushups + l.squats }))} color={SERIES.reps} goal={profile.goals.reps} unit="reps" />
        </Card>
        <Card>
          <CardLabel icon={ChartNoAxesColumn}>Champ rating</CardLabel>
          <LineChart data={ovr} color={SERIES.ovr} unit="OVR" />
          <p className="note">Rises with training, fades when you stop.</p>
        </Card>
      </div>

      <Card>
        <CardLabel icon={Medal}>Personal bests</CardLabel>
        <div className="bests">
          <div>
            <span>Most steps in a day</span>
            <b>{best("steps").toLocaleString()}</b>
          </div>
          <div>
            <span>Most push-ups in a day</span>
            <b>{best("pushups")}</b>
          </div>
          <div>
            <span>Most squats in a day</span>
            <b>{best("squats")}</b>
          </div>
          <div>
            <span>Distance run ({range} days)</span>
            <b>{total("runKm").toFixed(1)} km</b>
          </div>
        </div>
      </Card>
    </div>
  );
}
