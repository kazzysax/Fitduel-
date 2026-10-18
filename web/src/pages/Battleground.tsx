import { useEffect, useMemo, useRef, useState } from "react";

import { useWatchFight } from "../App.tsx";
import { useAsync } from "../components/useAsync.ts";
import {
  countdown,
  divisionFor,
  enterRumble,
  fetchLeaderboard,
  fetchLive,
  fetchRumbles,
  leaveRumble,
  startDuel,
  timeAgo,
  VENUES,
  type Rumble,
} from "../data/battle.ts";
import { champOf, refresh, useProfile } from "../data/store.ts";
import type { GoOptions } from "../nav.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function Battleground({ opts }: { opts: GoOptions }) {
  const profile = useProfile();
  const watch = useWatchFight();
  const champ = useMemo(() => champOf(profile), [profile]);
  const division = divisionFor(champ.rating);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = useAsync(fetchLive);
  const rumbles = useAsync(fetchRumbles);
  const board = useAsync(fetchLeaderboard);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      live.reload();
      rumbles.reload();
    }, 30_000);
    return () => {
      clearInterval(id);
      clearInterval(poll);
    };
  }, [live.reload, rumbles.reload]);

  const duel = async () => {
    setBusy(true);
    setError(null);
    try {
      const { fightId } = await startDuel();
      await watch(fightId, { label: "Next Duel", run: duel });
      refresh();
      live.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // "Fight a Duel now" from the Today tab, once per arrival.
  const handled = useRef<GoOptions | null>(null);
  useEffect(() => {
    if (opts.duel && handled.current !== opts) {
      handled.current = opts;
      duel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

  const toggleRumble = async (r: Rumble) => {
    setError(null);
    try {
      await (r.joined ? leaveRumble(r.id) : enterRumble(r.id));
      rumbles.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const open = rumbles.data?.filter((r) => r.status === "open") ?? [];
  const past = rumbles.data?.filter((r) => r.status === "done" && r.fightId) ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="label">Battleground</div>
          <h1>Arena</h1>
        </div>
        <div className="record">
          <span className="swatch" style={{ background: champ.color }} />
          <b>{champ.name}</b> · OVR {champ.rating} · {division.name}
          <span className="mono">
            {profile.record.duelWins}W {profile.record.duels - profile.record.duelWins}L
          </span>
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

      <section className="card duel-cta">
        <div>
          <div className="label">1 vs 1 · Free</div>
          <h2>Join a Duel</h2>
          <p className="note">
            Your champ is matched with another player's champion at a similar level ({division.name} division). Fights last about a minute.
          </p>
        </div>
        <button className="btn btn-primary big-btn" onClick={duel} disabled={busy}>
          {busy ? "Finding an opponent…" : "⚔ Fight now"}
        </button>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="live-dot" aria-hidden /> Latest fights
          </h2>
          <span className="note">Tap a fight to watch</span>
        </div>
        {live.error && <p className="error">{live.error}</p>}
        {live.data?.length === 0 && <p className="note">No fights yet. Be the first: join a Duel.</p>}
        <ul className="live-list">
          {live.data?.map((f) => (
            <li key={f.id}>
              <button className="live-item" onClick={() => watch(f.id)}>
                <span className="vs-names">
                  {f.mode === "duel" ? (
                    <>
                      <span>
                        <span className="swatch" style={{ background: f.top[0].color }} />
                        {f.top[0].name} <span className="mono muted">{f.top[0].rating}</span>
                      </span>
                      <span className="muted">vs</span>
                      <span>
                        <span className="swatch" style={{ background: f.top[1].color }} />
                        {f.top[1].name} <span className="mono muted">{f.top[1].rating}</span>
                      </span>
                    </>
                  ) : (
                    <span>
                      {f.title} · {f.fighters} champions
                    </span>
                  )}
                </span>
                <span className="live-meta">
                  <span className="muted">{VENUES[f.venue].name}</span>
                  <span className="badge">{timeAgo(f.createdAt, now)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="two-col">
        {open.map((r) => {
          const starts = new Date(r.startsAt);
          return (
            <section key={r.id} className={`card rumble-card ${r.kind}`}>
              <div className="label">{r.kind === "weekly" ? "Weekly · Brick Colosseum" : "Daily · your division's arena"}</div>
              <h2>{r.title}</h2>
              <div className="rumble-facts">
                <div>
                  <span>Starts in</span>
                  <b className="mono">{countdown(starts, new Date(now))}</b>
                </div>
                <div>
                  <span>Entered</span>
                  <b className="mono">
                    {r.entered}/{r.fieldSize}
                  </b>
                </div>
                <div>
                  <span>Entry</span>
                  <b className="mono">Free</b>
                </div>
                <div>
                  <span>Starts</span>
                  <b className="mono">{starts.toLocaleTimeString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</b>
                </div>
              </div>
              <p className="note">
                Your champ fights automatically at the start time and you'll get a notification. Practice Rumble: cash pools ({money(r.entryCents)} entry) come later.
              </p>
              <details className="fair">
                <summary>Fairness check</summary>
                <p className="note">
                  The fight's random seed was locked before entries closed. Its fingerprint is <code>{r.seedHash.slice(0, 16)}…</code>. After the Rumble the seed is
                  revealed so anyone can re-run the fight and check the result.
                </p>
              </details>
              <button className={`btn ${r.joined ? "" : "btn-primary"}`} onClick={() => toggleRumble(r)}>
                {r.joined ? "Entered ✓ · Leave" : "Enter my champ"}
              </button>
            </section>
          );
        })}
      </div>

      {past.length > 0 && (
        <section className="card">
          <h2>Recent Rumbles</h2>
          <ul className="fight-list">
            {past.map((r) => (
              <li key={r.id}>
                <span className="badge">{r.kind}</span>
                <span>
                  {r.title} · {new Date(r.startsAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <button className="btn small" onClick={() => watch(r.fightId!)}>
                  Watch
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="two-col">
        <section className="card">
          <h2>Leaderboard</h2>
          {board.error && <p className="error">{board.error}</p>}
          <ol className="board">
            {board.data?.slice(0, 10).map((row) => (
              <li key={row.rank} className={row.me ? "me" : ""}>
                <span className="mono rank">{row.rank}</span>
                <span className="swatch" style={{ background: row.color }} />
                <span className="name">{row.name}</span>
                <span className="muted">{row.division}</span>
                <b className="mono">{row.rating}</b>
              </li>
            ))}
          </ol>
          {board.data?.length === 0 && <p className="note">Train to get on the board.</p>}
        </section>

        <section className="card">
          <h2>Your champ's fights</h2>
          {profile.fights.length === 0 ? (
            <p className="note">No fights yet. Join a Duel to see your champ in the ring.</p>
          ) : (
            <ul className="fight-list">
              {profile.fights.slice(0, 10).map((f) => (
                <li key={f.id}>
                  <span className={`badge ${f.won ? "win" : f.payoutCents > 0 ? "paid" : "loss"}`}>{f.mode === "duel" ? (f.won ? "WIN" : "LOSS") : `#${f.place}`}</span>
                  <button className="link-row" onClick={() => watch(f.id)}>
                    {f.title}
                  </button>
                  <span className="mono muted">{timeAgo(f.createdAt, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
