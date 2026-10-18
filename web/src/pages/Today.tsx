import { useMemo } from "react";

import { STAT_INFO } from "../components/StatBars.tsx";
import { ChampViewer } from "../components/ChampViewer.tsx";
import { Ring, SERIES } from "../components/Charts.tsx";
import { countdown, divisionFor, upcomingRumbles } from "../data/battle.ts";
import { champOf, dayLog, GOALS, streak, today, useProfile, type Profile } from "../data/store.ts";
import type { Go } from "../nav.ts";
import { WorkoutList } from "./Train.tsx";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Today({ go }: { go: Go }) {
  const profile = useProfile();
  const day = dayLog(profile, today());
  const champ = useMemo(() => champOf(profile), [profile]);
  // What today's training alone added to the champ.
  const before = useMemo(() => {
    const withoutToday: Profile = { ...profile, log: { ...profile.log, [today()]: { steps: 0, pushups: 0, squats: 0, activeMinutes: 0, runKm: 0 } } };
    return champOf(withoutToday);
  }, [profile]);
  const gains = STAT_INFO.map((s) => ({ ...s, delta: champ.stats[s.key] - before.stats[s.key] })).filter((g) => g.delta > 0);
  const division = divisionFor(champ.rating);
  const rumble = upcomingRumbles()[0];
  const days = streak(profile);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="label">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1>{greeting()}</h1>
        </div>
        <div className="streak" title="Days in a row with a workout or 5,000+ steps">
          <span aria-hidden>🔥</span>
          <b className="mono">{days}</b> day streak
        </div>
      </header>

      <section className="card">
        <div className="card-head">
          <h2>Today's activity</h2>
          <button className="btn small" onClick={() => go("progress")}>
            Progress →
          </button>
        </div>
        <div className="rings">
          <Ring value={day.steps} goal={GOALS.steps} color={SERIES.steps} label="Steps" unit="" />
          <Ring value={day.pushups + day.squats} goal={GOALS.reps} color={SERIES.reps} label="Reps" unit="reps" />
          <Ring value={day.activeMinutes} goal={GOALS.activeMinutes} color={SERIES.active} label="Active" unit="min" />
        </div>
        <div className="quick">
          <button className="btn btn-primary" onClick={() => go("train", { exercise: "pushup" })}>
            Start push-ups
          </button>
          <button className="btn" onClick={() => go("train", { exercise: "squat" })}>
            Start squats
          </button>
          <button className="btn" onClick={() => go("train", { manual: true })}>
            Log activity
          </button>
        </div>
      </section>

      <div className="two-col">
        <section className="card champ-card">
          <ChampViewer champ={champ} />
          <div className="champ-info">
            <div className="label">Your champ</div>
            <h2>{champ.name}</h2>
            <div className="ovr">
              OVR <b>{champ.rating}</b> · {division.name}
            </div>
            {gains.length > 0 ? (
              <p className="gains">
                Today's training:{" "}
                {gains.map((g) => (
                  <span key={g.key} className="gain">
                    {g.label} +{g.delta}
                  </span>
                ))}
              </p>
            ) : (
              <p className="note">Train today to power up your champ.</p>
            )}
            <button className="btn small" onClick={() => go("champ")}>
              View champ →
            </button>
          </div>
        </section>

        <section className="card arena-teaser">
          <div className="label">Battleground</div>
          <h2>{rumble.title}</h2>
          <p className="note">
            Starts in <b className="mono">{countdown(rumble.startsAt)}</b> · {rumble.entered}/{rumble.fieldSize} entered
          </p>
          <div className="quick">
            <button className="btn btn-primary" onClick={() => go("battleground", { duel: true })}>
              Fight a Duel now
            </button>
            <button className="btn" onClick={() => go("battleground")}>
              Watch live fights
            </button>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Recent workouts</h2>
          <button className="btn small" onClick={() => go("train")}>
            Train →
          </button>
        </div>
        <WorkoutList workouts={profile.workouts.slice(0, 4)} empty="No workouts logged yet today. Start with a set of push-ups." />
      </section>
    </div>
  );
}
