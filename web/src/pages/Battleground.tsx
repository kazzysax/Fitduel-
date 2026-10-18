import { useEffect, useMemo, useState } from "react";

import type { ArenaProps } from "../arena/ArenaView.tsx";
import { makeFakeField } from "../../../engine/fakeData.ts";
import { computePayouts } from "../../../engine/payout.ts";
import {
  champAsFighter,
  countdown,
  divisionFor,
  findOpponent,
  liveDuels,
  upcomingRumbles,
  VENUES,
  type RumbleEvent,
} from "../data/battle.ts";
import { champOf, recordFight, today, useProfile, type Champ } from "../data/store.ts";
import type { GoOptions } from "../nav.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999);
}

function formatSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function Battleground({ opts, openArena }: { opts: GoOptions; openArena: (a: ArenaProps) => void }) {
  const profile = useProfile();
  const champ = useMemo(() => champOf(profile), [profile]);
  const division = divisionFor(champ.rating);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const minute = Math.floor(now / 60_000);
  const live = useMemo(() => liveDuels(minute * 60_000), [minute]);
  const rumbles = useMemo(() => upcomingRumbles(new Date(minute * 60_000)), [minute]);

  const wins = profile.fights.filter((f) => f.mode === "duel" && f.won).length;
  const losses = profile.fights.filter((f) => f.mode === "duel" && !f.won).length;

  const startDuel = (c: Champ) => {
    const seed = randomSeed();
    const opponent = findOpponent(c, seed);
    const fighters = [champAsFighter(c), opponent];
    const venue = VENUES[divisionFor(c.rating).venue];
    openArena({
      mode: "duel",
      title: `${c.name} vs ${opponent.name}`,
      venue,
      fighters,
      seed,
      youIndex: 0,
      onFinish: (r) =>
        recordFight({ mode: "duel", seed, opponentName: opponent.name, place: r.standings.findIndex((s) => s.fighterId === "you") + 1, fieldSize: 2, won: r.standings[0].fighterId === "you", payoutCents: 0 }),
      onNext: () => startDuel(c),
      nextLabel: "Next Duel",
      onExit: () => {},
    });
  };

  const enterRumble = (event: RumbleEvent) => {
    const seed = randomSeed();
    // Divisions: fill the ring with the champions closest to your rating.
    const field = makeFakeField(seed, event.fieldSize * 4, today())
      .sort((a, b) => Math.abs(a.rating - champ.rating) - Math.abs(b.rating - champ.rating))
      .slice(0, event.fieldSize - 1);
    const fighters = [champAsFighter(champ), ...field];
    openArena({
      mode: "rumble",
      title: event.title,
      venue: VENUES[event.kind === "weekly" ? "colosseum" : division.venue],
      fighters,
      seed,
      youIndex: 0,
      entryCents: event.entryCents,
      onFinish: (r) => {
        const place = r.standings.findIndex((s) => s.fighterId === "you") + 1;
        recordFight({
          mode: "rumble",
          seed,
          opponentName: `${event.fieldSize - 1} champions`,
          place,
          fieldSize: event.fieldSize,
          won: place === 1,
          payoutCents: computePayouts(event.fieldSize, event.entryCents)[place - 1] ?? 0,
        });
      },
      onExit: () => {},
    });
  };

  // "Fight a Duel now" from the Today tab.
  useEffect(() => {
    if (opts.duel) startDuel(champ);
    // Only when arriving with the option, not on every profile change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

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
            {wins}W {losses}L
          </span>
        </div>
      </header>

      <section className="card duel-cta">
        <div>
          <div className="label">1 vs 1 · Free</div>
          <h2>Join a Duel</h2>
          <p className="note">
            We match your champ with one at a similar level in the {division.name} division. Fights last about a minute, in the{" "}
            {VENUES[division.venue].name}.
          </p>
        </div>
        <button className="btn btn-primary big-btn" onClick={() => startDuel(champ)}>
          ⚔ Fight now
        </button>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="live-dot" aria-hidden /> Live now
          </h2>
          <span className="note">Tap a fight to watch</span>
        </div>
        <ul className="live-list">
          {live.map((d) => {
            const isLive = d.secondsIn < d.length;
            return (
              <li key={d.id}>
                <button
                  className="live-item"
                  onClick={() =>
                    openArena({
                      mode: "spectate",
                      title: `${d.a.name} vs ${d.b.name}`,
                      venue: VENUES[d.division.venue],
                      fighters: [d.a, d.b],
                      seed: d.seed,
                      youIndex: null,
                      startAt: isLive ? d.secondsIn : 0,
                      onExit: () => {},
                    })
                  }
                >
                  <span className="vs-names">
                    <span>
                      <span className="swatch" style={{ background: d.a.color }} />
                      {d.a.name} <span className="mono muted">{d.a.rating}</span>
                    </span>
                    <span className="muted">vs</span>
                    <span>
                      <span className="swatch" style={{ background: d.b.color }} />
                      {d.b.name} <span className="mono muted">{d.b.rating}</span>
                    </span>
                  </span>
                  <span className="live-meta">
                    <span className="muted">{d.division.name}</span>
                    {isLive ? <span className="badge live">LIVE {formatSeconds(d.secondsIn)}</span> : <span className="badge">Replay</span>}
                    <span className="mono muted">👁 {d.viewers}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="two-col">
        {rumbles.map((r) => (
          <section key={r.id} className={`card rumble-card ${r.kind}`}>
            <div className="label">{r.kind === "weekly" ? "Weekly · Brick Colosseum" : `Daily · ${VENUES[division.venue].name}`}</div>
            <h2>{r.title}</h2>
            <div className="rumble-facts">
              <div>
                <span>Starts in</span>
                <b className="mono">{countdown(r.startsAt, new Date(now))}</b>
              </div>
              <div>
                <span>Entered</span>
                <b className="mono">
                  {r.entered}/{r.fieldSize}
                </b>
              </div>
              <div>
                <span>Entry</span>
                <b className="mono">{money(r.entryCents)}</b>
              </div>
              <div>
                <span>Pool</span>
                <b className="mono">{money(r.entryCents * r.fieldSize)}</b>
              </div>
            </div>
            <p className="note">Top 20% share the whole pool. Prototype: runs a practice Rumble right now with no real money.</p>
            <button className="btn btn-primary" onClick={() => enterRumble(r)}>
              Enter practice Rumble
            </button>
          </section>
        ))}
      </div>

      <section className="card">
        <h2>Your champ's fights</h2>
        {profile.fights.length === 0 ? (
          <p className="note">No fights yet. Join a Duel to see your champ in the ring.</p>
        ) : (
          <ul className="fight-list">
            {profile.fights.slice(0, 12).map((f) => (
              <li key={f.id}>
                <span className={`badge ${f.won ? "win" : f.mode === "rumble" && f.payoutCents > 0 ? "paid" : "loss"}`}>
                  {f.mode === "duel" ? (f.won ? "WIN" : "LOSS") : `#${f.place}`}
                </span>
                <span>
                  {f.mode === "duel" ? "Duel vs " : "Rumble vs "}
                  {f.opponentName}
                </span>
                <span className="mono muted">
                  {f.payoutCents > 0 ? `${money(f.payoutCents)} · ` : ""}
                  {new Date(f.time).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
