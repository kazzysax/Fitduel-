import { useMemo, useState } from "react";

import { useWatchFight } from "../App.tsx";
import { ChampViewer } from "../components/ChampViewer.tsx";
import { Ring, SERIES } from "../components/Charts.tsx";
import { STAT_INFO } from "../components/StatBars.tsx";
import { useAsync } from "../components/useAsync.ts";
import { countdown, divisionFor, fetchNotifications, fetchRumbles, timeAgo } from "../data/battle.ts";
import { champOf, dayLog, markNotificationsRead, today, useProfile, type Profile } from "../data/store.ts";
import type { Go } from "../nav.ts";
import { WorkoutList } from "./Train.tsx";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
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
        <div className="card-head">
          <h2>Notifications</h2>
          <button className="btn small" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {loading && <p className="note">Loading…</p>}
        {error && <p className="error">{error}</p>}
        {data?.length === 0 && <p className="note">Nothing yet. When your champ fights, you'll hear about it here.</p>}
        <ul className="notes">
          {data?.map((n) => (
            <li key={n.id} className={n.read ? "" : "unread"}>
              <span>{n.body}</span>
              <span className="note-meta">
                <span className="muted">{timeAgo(n.createdAt)}</span>
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
              </span>
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
  // What today's training alone added to the champ.
  const before = useMemo(() => {
    const withoutToday: Profile = { ...profile, log: { ...profile.log, [today()]: { steps: 0, pushups: 0, squats: 0, activeMinutes: 0, runKm: 0 } } };
    return champOf(withoutToday);
  }, [profile]);
  const gains = STAT_INFO.map((s) => ({ ...s, delta: champ.stats[s.key] - before.stats[s.key] })).filter((g) => g.delta > 0);
  const division = divisionFor(champ.rating);
  const rumbles = useAsync(fetchRumbles);
  const next = rumbles.data?.find((r) => r.status === "open" && r.kind === "daily");

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="label">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1>{greeting()}</h1>
        </div>
        <div className="head-actions">
          <div className="streak" title="Days in a row with a workout or 5,000+ steps">
            <span aria-hidden>🔥</span>
            <b className="mono">{profile.streak.current}</b> day streak
          </div>
          <button className="bell" onClick={() => setShowNotes(true)} aria-label={`Notifications${profile.unread ? `, ${profile.unread} new` : ""}`}>
            🔔{profile.unread > 0 && <span className="bell-count mono">{profile.unread}</span>}
          </button>
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
          <Ring value={day.steps} goal={profile.goals.steps} color={SERIES.steps} label="Steps" unit="" />
          <Ring value={day.pushups + day.squats} goal={profile.goals.reps} color={SERIES.reps} label="Reps" unit="reps" />
          <Ring value={day.activeMinutes} goal={profile.goals.activeMinutes} color={SERIES.active} label="Active" unit="min" />
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
          <h2>{next ? next.title : "Battleground"}</h2>
          {next ? (
            <p className="note">
              Starts in <b className="mono">{countdown(new Date(next.startsAt))}</b> · {next.entered}/{next.fieldSize} entered
              {next.joined && " · you're in"}
            </p>
          ) : (
            <p className="note">Duel other players' champions any time.</p>
          )}
          <div className="quick">
            <button className="btn btn-primary" onClick={() => go("battleground", { duel: true })}>
              Fight a Duel now
            </button>
            <button className="btn" onClick={() => go("battleground")}>
              Open Battleground
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
        <WorkoutList workouts={profile.workouts.slice(0, 4)} empty="No workouts yet. Start with a set of push-ups." />
      </section>
      {showNotes && <Notifications onClose={() => setShowNotes(false)} />}
    </div>
  );
}
