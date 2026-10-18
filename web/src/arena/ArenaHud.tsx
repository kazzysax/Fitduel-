import { useMemo } from "react";

import type { FakePlayer } from "../../../engine/fakeData.ts";
import { computePayouts } from "../../../engine/payout.ts";
import { Act, type Frames, type RumbleResult } from "../../../engine/rumble.ts";
import { StatBars } from "../components/StatBars.tsx";
import { formatClock, frameIndex, type Playback } from "../replay.ts";

export type ArenaMode = "duel" | "rumble" | "spectate";

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function aliveCount(frames: Frames, tick: number): number {
  let alive = 0;
  for (let i = 0; i < frames.fighters; i++) if (frames.act[frameIndex(frames, i, tick)] !== Act.Out) alive++;
  return alive;
}

export function TopBar(props: {
  title: string;
  venueName: string;
  mode: ArenaMode;
  entryCents: number;
  frames: Frames;
  tick: number;
  onExit: () => void;
  onToggleRing: () => void;
}) {
  const { title, venueName, mode, entryCents, frames, tick, onExit, onToggleRing } = props;
  return (
    <header className="topbar panel">
      <button className="btn small back" onClick={onExit} aria-label="Back to Battleground">
        ← Back
      </button>
      <div className="event">
        <b>{title}</b>
        <span>{venueName}</span>
      </div>
      <div className="chips">
        {mode === "rumble" && (
          <>
            <span className="chip">{money(entryCents)} entry</span>
            <span className="chip">Pool {money(entryCents * frames.fighters)}</span>
          </>
        )}
        {mode !== "rumble" && <span className="chip">{mode === "duel" ? "Free Duel" : "Spectating"}</span>}
        <span className="chip chip-live">
          {aliveCount(frames, tick)}/{frames.fighters} left
        </span>
        <span className="chip mono">{formatClock(Math.min(tick, frames.ticks))}</span>
      </div>
      {frames.fighters > 2 && (
        <button className="btn small ring-toggle" onClick={onToggleRing}>
          Ring
        </button>
      )}
    </header>
  );
}

export function RingList(props: {
  open: boolean;
  field: FakePlayer[];
  youIndex: number | null;
  frames: Frames;
  tick: number;
  result: RumbleResult;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const { open, field, youIndex, frames, tick, result, selected, onSelect } = props;
  const outAt = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of result.events) if (e.type === "ko") m.set(e.fighter, e.tick);
    return m;
  }, [result]);

  const rows = field
    .map((p, i) => {
      const k = frameIndex(frames, i, tick);
      return { p, i, hp: frames.hp[k], out: frames.act[k] === Act.Out, outTick: outAt.get(p.id) ?? 0 };
    })
    .sort((a, b) => Number(a.out) - Number(b.out) || (a.out ? b.outTick - a.outTick : b.hp - a.hp));
  const you = youIndex === null ? null : field[youIndex];

  return (
    <aside className={`ring panel ${open ? "open" : ""}`}>
      {you && (
        <section className="you-card">
          <div className="label">Your champ</div>
          <div className="ovr">
            {you.name} · OVR <b>{you.rating}</b>
          </div>
          <StatBars stats={you.stats} compact />
        </section>
      )}
      <div className="label list-label">In the ring</div>
      <ol className="fighters">
        {rows.map(({ p, i, hp, out, outTick }) => (
          <li key={p.id} className={`${out ? "out" : ""} ${selected === i ? "sel" : ""} ${i === youIndex ? "me" : ""}`} onClick={() => onSelect(i)}>
            <span className="swatch" style={{ background: p.color }} />
            <span className="name">{p.name}</span>
            <span className="mono ovr-small">{p.rating}</span>
            {out ? (
              <span className="mono ko-time">KO {formatClock(outTick)}</span>
            ) : (
              <span className="hp">
                <span style={{ width: `${Math.max(0, hp)}%` }} />
              </span>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}

// Head-to-head bars for 1 vs 1 fights.
export function DuelBars({ field, frames, tick, maxHp }: { field: FakePlayer[]; frames: Frames; tick: number; maxHp: number[] }) {
  return (
    <div className="duel-bars">
      {field.map((p, i) => {
        const hp = frames.hp[frameIndex(frames, i, tick)] / maxHp[i];
        return (
          <div key={p.id} className={`duel-side ${i === 1 ? "right" : ""}`}>
            <div className="duel-name">
              <span className="swatch" style={{ background: p.color }} />
              {p.name} <span className="mono">{p.rating}</span>
            </div>
            <div className="duel-hp">
              <span style={{ width: `${Math.max(0, hp) * 100}%` }} />
            </div>
          </div>
        );
      })}
      <div className="vs">VS</div>
    </div>
  );
}

export function Feed({ field, result, tick }: { field: FakePlayer[]; result: RumbleResult; tick: number }) {
  const names = useMemo(() => new Map(field.map((p) => [p.id, p.name])), [field]);
  const recent = result.events.filter((e) => e.type === "ko" && e.tick <= tick).slice(-4).reverse();
  return (
    <div className="feed">
      {recent.map((e) => (
        <div key={`${e.tick}-${e.fighter}`} className={`feed-item ${e.fighter === "you" || e.by === "you" ? "feed-you" : ""}`}>
          <b>{names.get(e.by!)}</b> knocked out <b>{names.get(e.fighter)}</b>
          <span className="mono">{formatClock(e.tick)}</span>
        </div>
      ))}
    </div>
  );
}

export function Controls(props: {
  playback: Playback;
  tick: number;
  endTick: number;
  follow: boolean;
  onFollow: () => void;
  onChange: () => void;
}) {
  const { playback, tick, endTick, follow, onFollow, onChange } = props;
  return (
    <div className="controls panel">
      <button
        className="btn icon"
        aria-label={playback.playing ? "Pause" : "Play"}
        onClick={() => {
          if (!playback.playing && playback.t >= endTick) playback.t = 0;
          playback.playing = !playback.playing;
          onChange();
        }}
      >
        {playback.playing ? "❚❚" : "▶"}
      </button>
      <input
        className="scrub"
        type="range"
        min={0}
        max={endTick}
        step={1}
        value={Math.min(tick, endTick)}
        aria-label="Replay position"
        onChange={(e) => {
          playback.t = Number(e.target.value);
          onChange();
        }}
      />
      <div className="speeds">
        {[1, 2, 4].map((s) => (
          <button
            key={s}
            className={`btn small ${playback.speed === s ? "active" : ""}`}
            onClick={() => {
              playback.speed = s;
              onChange();
            }}
          >
            {s}×
          </button>
        ))}
      </div>
      <button className={`btn small ${follow ? "active" : ""}`} onClick={onFollow}>
        Follow
      </button>
    </div>
  );
}

export function Results(props: {
  mode: ArenaMode;
  field: FakePlayer[];
  youIndex: number | null;
  result: RumbleResult;
  entryCents: number;
  onReplay: () => void;
  onExit: () => void;
  onNext?: () => void;
  nextLabel?: string;
}) {
  const { mode, field, youIndex, result, entryCents, onReplay, onExit, onNext, nextLabel } = props;
  const byId = new Map(field.map((p) => [p.id, p]));
  const payouts = mode === "rumble" ? computePayouts(field.length, entryCents) : [];
  const winner = byId.get(result.standings[0].fighterId)!;
  const you = youIndex === null ? null : field[youIndex];
  const mine = you ? result.standings.find((s) => s.fighterId === you.id)! : null;
  const myPayout = mine ? payouts[mine.place - 1] : undefined;
  const youWon = mine?.place === 1;

  return (
    <div className="overlay">
      <div className="modal panel">
        <div className="label">{mode === "rumble" ? "Rumble complete" : "Fight over"}</div>
        <h2>
          {youWon ? `${winner.name} wins! That's your champ.` : `${winner.name} wins`}
          <small> {result.lastStanding ? "by knockout" : "on points"}</small>
        </h2>
        {mine && (
          <div className={`your-result ${youWon || myPayout ? "paid" : ""}`}>
            <div>
              <div className="label">Your champ</div>
              <div className="big">
                {mode === "duel" ? (youWon ? "WIN" : "LOSS") : mine.place}
                {mode !== "duel" && <small>/{field.length}</small>}
              </div>
            </div>
            <div className="mini-stats mono">
              <span>{mine.survivalSeconds.toFixed(0)}s in the ring</span>
              <span>{mine.damageDealt.toFixed(0)} damage</span>
              <span>{mine.eliminations} KOs</span>
            </div>
            {mode === "rumble" && (
              <div className="payout">
                <div className="label">Payout</div>
                <div className="big">{myPayout ? money(myPayout) : "—"}</div>
              </div>
            )}
          </div>
        )}
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th>Champion</th>
              <th>OVR</th>
              <th>Damage</th>
              <th>KOs</th>
              {mode === "rumble" && <th>Payout</th>}
            </tr>
          </thead>
          <tbody>
            {result.standings.slice(0, Math.max(payouts.length, Math.min(3, field.length))).map((s) => {
              const p = byId.get(s.fighterId)!;
              return (
                <tr key={s.fighterId} className={you && s.fighterId === you.id ? "me" : ""}>
                  <td className="mono">{s.place}</td>
                  <td>
                    <span className="swatch" style={{ background: p.color }} />
                    {p.name}
                  </td>
                  <td className="mono">{p.rating}</td>
                  <td className="mono">{s.damageDealt.toFixed(0)}</td>
                  <td className="mono">{s.eliminations}</td>
                  {mode === "rumble" && <td className="mono">{payouts[s.place - 1] ? money(payouts[s.place - 1]) : ""}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {mode === "rumble" && (
          <p className="note">
            Pool {money(entryCents * field.length)} · 100% paid to the top {payouts.length} · no platform fee · prototype, no real money
          </p>
        )}
        {mine && !youWon && <p className="note">Train more to raise your champ's stats, then come back for a rematch.</p>}
        <div className="modal-actions">
          <button className="btn" onClick={onReplay}>
            Watch again
          </button>
          <button className="btn" onClick={onExit}>
            Battleground
          </button>
          {onNext && (
            <button className="btn btn-primary" onClick={onNext}>
              {nextLabel ?? "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { StatBars };
