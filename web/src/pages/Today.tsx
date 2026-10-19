import { Bell, Dumbbell, Flame, Footprints, Plus, Swords, Timer, Trophy, Zap } from "lucide-react";
import { useMemo, useState } from "react";

import { useWatchFight } from "../App.tsx";
import { ChampViewer } from "../components/ChampViewer.tsx";
import { STAT_INFO } from "../components/StatBars.tsx";
import { BigNumber, Card, CardLabel, compact, Gauge, IconButton, RulerBar, StatPill } from "../components/ui.tsx";
import { useAsync } from "../components/useAsync.ts";
import { countdown, divisionFor, fetchNotifications, fetchRumbles, timeAgo } from "../data/battle.ts";
import { champOf, dayLog, markNotificationsRead, today, useProfile, type DayLog, type Profile } from "../data/store.ts";
import type { Go } from "../nav.ts";
import { WorkoutList } from "./Train.tsx";

// Rough estimate, clearly labelled in the UI: walking, rep sets and running.
export function estimateCalories(d: DayLog): number {
  return Math.round(d.steps * 0.04 + (d.pushups + d.squats) * 0.45 + d.runKm * 62);
}

function Notifications({ onClose }: { onClose: () => void }) {
  const watch = useWatchFight();
  const { data, error, loading } = useAsync(async () => {
    const list = await fetchNotifications();
    markNotificationsRead();
    return list;
  });
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Notifications" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Notifications</h2>
          <button className="toast-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {loading && <p className="note">Loading…</p>}
        {error && <p className="error">{error}</p>}
        {data?.length === 0 && <p className="note">Nothing yet. When your champ fights, you'll hear about it here.</p>}
        <ul className="notes">
          {data?.map((n) => (
            <li key={n.id} className={n.read ? "" : "unread"}>
              <span className="note-icon">{n.kind === "rumble" ? <Trophy size={16} /> : <Swords size={16} />}</span>
              <div>
                <p>{n.body}</p>
                <span className="muted">{timeAgo(n.createdAt)}</span>
              </div>
              {n.fightId && (
                <button
                  className="btn small"
                  onClick={() => {
                    onClose();
                    watch(n.fightId!);
                  }}
                >
                  Watch
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Today({ go }: { go: Go }) {
  const profile = useProfile();
  const [showNotes, setShowNotes] = useState(false);
  const day = dayLog(profile, today());
  const champ = useMemo(() => champOf(profile), [profile]);
  const before = useMemo(() => {
    const withoutToday: Profile = { ...profile, log: { ...profile.log, [today()]: { steps: 0, pushups: 0, squats: 0, activeMinutes: 0, runKm: 0 } } };
    return champOf(withoutToday);
  }, [profile]);
  const gains = STAT_INFO.map((s) => ({ ...s, delta: champ.stats[s.key] - before.stats[s.key] })).filter((g) => g.delta > 0);
  const division = divisionFor(champ.rating);
  const rumbles = useAsync(fetchRumbles);
  const next = rumbles.data?.find((r) => r.status === "open" && r.kind === "daily");
  const reps = day.pushups + day.squats;

  return (
    <div className="page today">
      <header className="hello">
        <div className="avatar" style={{ background: champ.color }} aria-hidden>
          {champ.name.slice(0, 1).toUpperCase()}
        </div>
        <IconButton icon={Bell} label={`Notifications${profile.unread ? `, ${profile.unread} new` : ""}`} badge={profile.unread} onClick={() => setShowNotes(true)} />
        <h1>
          Hello
          <br />
          {champ.name}!
        </h1>
      </header>

      <section className="hero" aria-label="Your champion">
        <div className="hero-glow" aria-hidden />
        <ChampViewer champ={champ} hero />
        <StatPill icon={Footprints} className="p1">
          {compact(day.steps)} Steps
        </StatPill>
        <StatPill icon={Zap} className="p2">
          OVR {champ.rating}
        </StatPill>
        <StatPill icon={Flame} className="p3">
          {profile.streak.current} day streak
        </StatPill>
        {gains.length > 0 && (
          <div className="hero-gains">
            {gains.map((g) => (
              <span key={g.key}>
                {g.label} +{g.delta}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="today-cards">
        <Card className="span-2">
          <CardLabel icon={Dumbbell} action={<span className="muted">{reps >= profile.goals.reps ? "Goal reached" : `${profile.goals.reps - reps} to go`}</span>}>
            Daily reps
          </CardLabel>
          <RulerBar value={reps} max={profile.goals.reps} unit="reps" />
        </Card>

        <Card className="gauge-card">
          <CardLabel icon={Timer}>Active min</CardLabel>
          <Gauge value={day.activeMinutes} max={profile.goals.activeMinutes} label="Active minutes" />
          <BigNumber value={day.activeMinutes} unit={`/ ${profile.goals.activeMinutes}`} />
        </Card>

        <div className="stack">
          <Card>
            <CardLabel icon={Flame}>Calories (est.)</CardLabel>
            <BigNumber value={estimateCalories(day).toLocaleString()} unit="kcal" />
          </Card>
          <Card>
            <CardLabel icon={Footprints}>Daily steps</CardLabel>
            <BigNumber value={day.steps.toLocaleString()} />
          </Card>
        </div>

        <Card className="span-2 quick-card">
          <button className="quick-action" onClick={() => go("train", { exercise: "pushup" })}>
            <span className="qa-icon lime">
              <Dumbbell size={20} />
            </span>
            Push-ups
          </button>
          <button className="quick-action" onClick={() => go("train", { exercise: "squat" })}>
            <span className="qa-icon">
              <Zap size={20} />
            </span>
            Squats
          </button>
          <button className="quick-action" onClick={() => go("train", { manual: true })}>
            <span className="qa-icon">
              <Plus size={20} />
            </span>
            Log
          </button>
          <button className="quick-action" onClick={() => go("battleground", { duel: true })}>
            <span className="qa-icon">
              <Swords size={20} />
            </span>
            Duel
          </button>
        </Card>

        <Card className="span-2 battle-teaser" onClick={() => go("battleground")} role="button" tabIndex={0}>
          <CardLabel icon={Trophy} action={<span className="muted">{division.name}</span>}>
            Battleground
          </CardLabel>
          <div className="teaser-row">
            <div>
              <h3>{next ? next.title : "Duels open"}</h3>
              <p className="muted">
                {next ? (
                  <>
                    Starts in {countdown(new Date(next.startsAt))} · {next.entered}/{next.fieldSize} entered{next.joined ? " · you're in" : ""}
                  </>
                ) : (
                  "Fight other players' champions any time"
                )}
              </p>
            </div>
            <span className="go-arrow" aria-hidden>
              →
            </span>
          </div>
        </Card>

        <Card className="span-2">
          <CardLabel icon={Dumbbell} action={<button className="link" onClick={() => go("train")}>See all</button>}>
            Recent workouts
          </CardLabel>
          <WorkoutList workouts={profile.workouts.slice(0, 4)} empty="No workouts yet. Start with a set of push-ups." />
        </Card>
      </div>
      {showNotes && <Notifications onClose={() => setShowNotes(false)} />}
    </div>
  );
}
