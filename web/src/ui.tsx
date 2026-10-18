import { useMemo, useState } from "react";

import type { FakePlayer } from "../../engine/fakeData.ts";
import { computePayouts } from "../../engine/payout.ts";
import { Act, type Frames, type RumbleResult } from "../../engine/rumble.ts";
import type { FighterStats } from "../../engine/stats.ts";
import { formatClock, frameIndex, type Playback } from "./replay.ts";
import { makeYou, type Training } from "./training.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function aliveCount(frames: Frames, tick: number): number {
  let alive = 0;
  for (let i = 0; i < frames.fighters; i++) if (frames.act[frameIndex(frames, i, tick)] !== Act.Out) alive++;
  return alive;
}

export function TopBar(props: {
  seed: number;
  fieldSize: number;
  entryCents: number;
  frames: Frames;
  tick: number;
  onToggleRing: () => void;
}) {
  const { seed, fieldSize, entryCents, frames, tick, onToggleRing } = props;
  return (
    <header className="topbar panel">
      <div className="brand">
        Fit<span>Duel</span>
      </div>
      <div className="event">Daily Rumble #{seed}</div>
      <div className="chips">
        <span className="chip">{money(entryCents)} entry</span>
        <span className="chip">Pool {money(entryCents * fieldSize)}</span>
        <span className="chip chip-live">
          {aliveCount(frames, tick)}/{fieldSize} left
        </span>
        <span className="chip mono">{formatClock(Math.min(tick, frames.ticks))}</span>
      </div>
      <button className="btn ring-toggle" onClick={onToggleRing}>
        Ring
      </button>
    </header>
  );
}

const STAT_LABELS: [keyof FighterStats, string][] = [
  ["power", "Power"],
  ["speed", "Speed"],
  ["stamina", "Stamina"],
  ["defense", "Defense"],
  ["technique", "Technique"],
];

export function StatBars({ stats, compare }: { stats: FighterStats; compare?: FighterStats }) {
  return (
    <div className="stats">
      {STAT_LABELS.map(([key, label]) => {
        const delta = compare ? stats[key] - compare[key] : 0;
        return (
          <div className="stat" key={key}>
            <span>{label}</span>
            <div className="meter">
              <div style={{ width: `${stats[key]}%` }} />
            </div>
            <b className="mono">
              {stats[key]}
              {delta !== 0 && <em className={delta > 0 ? "up" : "down"}>{delta > 0 ? `+${delta}` : delta}</em>}
            </b>
          </div>
        );
      })}
    </div>
  );
}

export function RingList(props: {
  open: boolean;
  field: FakePlayer[];
  frames: Frames;
  tick: number;
  result: RumbleResult;
  selected: number | null;
  onSelect: (i: number) => void;
  onTrain: () => void;
}) {
  const { open, field, frames, tick, result, selected, onSelect, onTrain } = props;
  const you = field[0];
  const outAt = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of result.events) if (e.type === "ko") m.set(e.fighter, e.tick);
    return m;
  }, [result]);

  const rows = field
    .map((p, i) => {
      const k = frameIndex(frames, i, tick);
      const out = frames.act[k] === Act.Out;
      return { p, i, hp: frames.hp[k], out, outTick: outAt.get(p.id) ?? 0 };
    })
    .sort((a, b) => Number(a.out) - Number(b.out) || (a.out ? b.outTick - a.outTick : b.hp - a.hp));

  return (
    <aside className={`ring panel ${open ? "open" : ""}`}>
      <section className="you-card">
        <div className="row-between">
          <div>
            <div className="label">Your fighter</div>
            <div className="ovr">
              OVR <b>{you.rating}</b>
            </div>
          </div>
          <button className="btn btn-primary" onClick={onTrain}>
            Train
          </button>
        </div>
        <StatBars stats={you.stats} />
      </section>
      <div className="label list-label">In the ring</div>
      <ol className="fighters">
        {rows.map(({ p, i, hp, out, outTick }) => (
          <li key={p.id} className={`${out ? "out" : ""} ${selected === i ? "sel" : ""} ${i === 0 ? "me" : ""}`} onClick={() => onSelect(i)}>
            <span className="swatch" style={{ background: p.color }} />
            <span className="name">{i === 0 ? "You" : p.name}</span>
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

export function Feed({ field, result, tick }: { field: FakePlayer[]; result: RumbleResult; tick: number }) {
  const names = useMemo(() => new Map(field.map((p, i) => [p.id, i === 0 ? "You" : p.name])), [field]);
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
  onNewRumble: () => void;
}) {
  const { playback, tick, endTick, follow, onFollow, onChange, onNewRumble } = props;
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
      <button className="btn small" onClick={onNewRumble}>
        New Rumble
      </button>
    </div>
  );
}

export function Results(props: {
  field: FakePlayer[];
  result: RumbleResult;
  entryCents: number;
  onReplay: () => void;
  onNext: () => void;
  onTrain: () => void;
}) {
  const { field, result, entryCents, onReplay, onNext, onTrain } = props;
  const byId = new Map(field.map((p) => [p.id, p]));
  const payouts = computePayouts(field.length, entryCents);
  const mine = result.standings.find((s) => s.fighterId === "you")!;
  const myPayout = payouts[mine.place - 1];
  const winner = byId.get(result.standings[0].fighterId)!;

  return (
    <div className="overlay">
      <div className="modal panel">
        <div className="label">Rumble complete</div>
        <h2>
          {winner.id === "you" ? "You won the Rumble!" : `${winner.name} wins`}
          <small> {result.lastStanding ? "last one standing" : "on points"}</small>
        </h2>
        <div className={`your-result ${myPayout ? "paid" : ""}`}>
          <div>
            <div className="label">Your finish</div>
            <div className="big">
              {mine.place}
              <small>/{field.length}</small>
            </div>
          </div>
          <div className="mini-stats mono">
            <span>{mine.survivalSeconds.toFixed(0)}s survived</span>
            <span>{mine.damageDealt.toFixed(0)} damage</span>
            <span>{mine.eliminations} KOs</span>
          </div>
          <div className="payout">
            <div className="label">Payout</div>
            <div className="big">{myPayout ? money(myPayout) : "—"}</div>
          </div>
        </div>
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th>Fighter</th>
              <th>OVR</th>
              <th>Score</th>
              <th>KOs</th>
              <th>Payout</th>
            </tr>
          </thead>
          <tbody>
            {result.standings.slice(0, Math.max(payouts.length, 3)).map((s) => {
              const p = byId.get(s.fighterId)!;
              return (
                <tr key={s.fighterId} className={s.fighterId === "you" ? "me" : ""}>
                  <td className="mono">{s.place}</td>
                  <td>
                    <span className="swatch" style={{ background: p.color }} />
                    {p.id === "you" ? "You" : p.name}
                  </td>
                  <td className="mono">{p.rating}</td>
                  <td className="mono">{s.score.toFixed(0)}</td>
                  <td className="mono">{s.eliminations}</td>
                  <td className="mono">{payouts[s.place - 1] ? money(payouts[s.place - 1]) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="note">
          Pool {money(entryCents * field.length)} · 100% paid to the top {payouts.length} · no platform fee
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={onReplay}>
            Watch again
          </button>
          <button className="btn" onClick={onTrain}>
            Train & re-run
          </button>
          <button className="btn btn-primary" onClick={onNext}>
            Next Rumble
          </button>
        </div>
      </div>
    </div>
  );
}

const SLIDERS: { key: keyof Training; label: string; max: number; step: number; unit: string }[] = [
  { key: "pushups", label: "Push-ups", max: 200, step: 5, unit: "reps" },
  { key: "squats", label: "Squats", max: 300, step: 5, unit: "reps" },
  { key: "steps", label: "Steps", max: 25000, step: 500, unit: "" },
  { key: "runKm", label: "Running", max: 15, step: 0.5, unit: "km" },
  { key: "activeMinutes", label: "Active time", max: 120, step: 5, unit: "min" },
  { key: "daysPerWeek", label: "Days per week", max: 7, step: 1, unit: "days" },
];

export function TrainingPanel({ initial, onApply, onClose }: { initial: Training; onApply: (t: Training) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  const before = useMemo(() => makeYou(initial), [initial]);
  const after = useMemo(() => makeYou(draft), [draft]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="label">Train your fighter</div>
        <h2>
          OVR {after.rating}
          {after.rating !== before.rating && (
            <small className={after.rating > before.rating ? "up" : "down"}>
              {" "}
              {after.rating > before.rating ? "+" : ""}
              {after.rating - before.rating}
            </small>
          )}
        </h2>
        <p className="note">
          Prototype: set what you do on a training day. In the real app this comes from the camera rep counter and your
          fitness tracker over the last 28 days.
        </p>
        <div className="sliders">
          {SLIDERS.map((s) => (
            <label key={s.key} className="slider">
              <span>{s.label}</span>
              <input
                type="range"
                min={0}
                max={s.max}
                step={s.step}
                value={draft[s.key]}
                onChange={(e) => setDraft({ ...draft, [s.key]: Number(e.target.value) })}
              />
              <b className="mono">
                {draft[s.key].toLocaleString()} {s.unit}
              </b>
            </label>
          ))}
        </div>
        <StatBars stats={after.stats} compare={before.stats} />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onApply(draft)}>
            Re-run this Rumble
          </button>
        </div>
      </div>
    </div>
  );
}
