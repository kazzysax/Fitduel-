// Deterministic many-fighter Rumble: everyone starts in the ring together, the last
// fighter standing wins, and score decides the rest of the order.
//
// The simulation is pure: same fighters + same seed => same Rumble. That means:
// - the server is the single source of truth (no client can fake a result),
// - anyone can re-run a Rumble from its revealed seed to verify it,
// - the 3D replay is rebuilt in the browser instead of streaming video,
// - one CPU core can run thousands of Rumbles.

import { createRng, type Rng } from "./rng.ts";
import type { FighterStats } from "./stats.ts";

export const TICKS_PER_SECOND = 10;
export const MAX_SECONDS = 150;
export const RING_HALF_SIZE = 6; // ring floor spans -6..6 on x and z
const REACH = 1.2;
const PERSONAL_SPACE = 0.8;
const DAMAGE_SCALE = 0.8;
const RETARGET_EVERY = 15;

export const SCORE_WEIGHTS = { perSecondSurvived: 1, perDamage: 1, perElimination: 20 };

// Numeric codes so replays can store actions in compact typed arrays.
export const Act = { Move: 0, Rest: 1, Guard: 2, Jab: 3, Hook: 4, Uppercut: 5, Out: 6 } as const;
export type ActCode = (typeof Act)[keyof typeof Act];
export type Decision = "rest" | "guard" | "jab" | "hook" | "uppercut";
type Punch = "jab" | "hook" | "uppercut";

const PUNCHES: Record<Punch, { code: ActCode; damage: number; energy: number; recovery: number; knockback: number }> = {
  jab: { code: Act.Jab, damage: 3, energy: 4, recovery: 4, knockback: 0.05 },
  hook: { code: Act.Hook, damage: 6, energy: 8, recovery: 7, knockback: 0.12 },
  uppercut: { code: Act.Uppercut, damage: 9, energy: 12, recovery: 10, knockback: 0.2 },
};

export interface RumbleFighter {
  id: string;
  name: string;
  stats: FighterStats;
  // Signature moves unlocked with XP upgrades (engine/progression.ts). Fighters
  // without moves fight exactly as before, so stored fights replay unchanged.
  moves?: readonly string[];
}

const HAYMAKER_CHANCE = 0.08;
const HAYMAKER_MULTIPLIER = 2.2;
const SLIP_DODGE_BONUS = 0.08;
const RING_IQ_BONUS = 0.25;

interface State {
  x: number;
  z: number;
  rot: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  recovery: number;
  act: ActCode;
  actTick: number;
  hitTick: number;
  guardUntil: number;
  target: number;
  alive: boolean;
  eliminatedTick: number | null;
  eliminatedBy: number | null;
  damageDealt: number;
  eliminations: number;
  usedChin: boolean;
  usedWind: boolean;
}

export interface Observation {
  self: Readonly<State>;
  target: Readonly<State>;
  stats: Readonly<FighterStats>;
  tick: number;
}

// Fighter "brain". The default is a utility AI whose decision quality scales with
// technique; a trained neural policy can implement the same interface later.
export interface Policy {
  decide(obs: Observation, rng: Rng): Decision;
}

export const defaultPolicy: Policy = {
  decide({ self, target, stats, tick }, rng) {
    const skill = stats.technique / 100;
    if (rng() < 0.35 * (1 - skill)) {
      const options: Decision[] = ["rest", "guard", "jab", "hook", "uppercut"];
      return options[Math.floor(rng() * options.length)];
    }
    if (self.energy < PUNCHES.jab.energy * 2) return "rest";
    // Punish an opponent stuck recovering from a big swing.
    if (target.act === Act.Uppercut && tick - target.actTick < 5 && self.energy >= PUNCHES.uppercut.energy) {
      return "uppercut";
    }
    if (target.recovery === 0 && target.energy > PUNCHES.hook.energy && rng() < 0.3 * skill) return "guard";
    if (self.energy > self.maxEnergy * 0.6 && rng() < 0.5) return rng() < 0.5 ? "hook" : "uppercut";
    return rng() < 0.12 ? "rest" : "jab";
  },
};

export interface RumbleEvent {
  tick: number;
  type: "ko" | "crit" | "move";
  fighter: string; // the attacker for crits and moves, the eliminated fighter for KOs
  by?: string;
  move?: string;
}

export interface Standing {
  fighterId: string;
  place: number;
  score: number;
  survivalSeconds: number;
  damageDealt: number;
  eliminations: number;
  eliminatedBy: string | null;
}

// Per-tick snapshots used by the replay viewer. Index = tick * fighters + fighter.
export interface Frames {
  fighters: number;
  ticks: number;
  pos: Float32Array; // x, z, rot (3 per entry)
  hp: Float32Array;
  act: Uint8Array;
  actTick: Int32Array;
  hitTick: Int32Array;
}

export interface RumbleResult {
  seed: number;
  ticks: number;
  lastStanding: string | null;
  standings: Standing[];
  events: RumbleEvent[];
  frames?: Frames;
}

export interface RumbleOptions {
  recordFrames?: boolean;
  policies?: Record<string, Policy>;
}

// Defense and stamina make a fighter tougher to put down.
export function maxHpFor(stats: FighterStats): number {
  return 60 + 0.35 * stats.defense + 0.25 * stats.stamina;
}

function regen(s: State, stats: FighterStats, factor: number): void {
  s.energy = Math.min(s.maxEnergy, s.energy + factor * (0.4 + stats.stamina / 100));
}

function clampToRing(s: State): void {
  const limit = RING_HALF_SIZE - 0.5;
  s.x = Math.max(-limit, Math.min(limit, s.x));
  s.z = Math.max(-limit, Math.min(limit, s.z));
}

export function simulateRumble(fighters: RumbleFighter[], seed: number, opts: RumbleOptions = {}): RumbleResult {
  const n = fighters.length;
  if (n < 2) throw new Error("A Rumble needs at least 2 fighters");
  const rng = createRng(seed);
  const maxTicks = MAX_SECONDS * TICKS_PER_SECOND;
  const events: RumbleEvent[] = [];

  // Start evenly spaced on a circle, facing the centre.
  const states: State[] = fighters.map((f, i) => {
    const angle = (i / n) * Math.PI * 2;
    const r = RING_HALF_SIZE - 1.2;
    const maxEnergy = 50 + f.stats.stamina / 2;
    const maxHp = maxHpFor(f.stats);
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    return {
      x,
      z,
      rot: Math.atan2(-x, -z),
      hp: maxHp,
      maxHp,
      energy: maxEnergy,
      maxEnergy,
      recovery: 0,
      act: Act.Move,
      actTick: 0,
      hitTick: -100,
      guardUntil: -1,
      target: -1,
      alive: true,
      eliminatedTick: null,
      eliminatedBy: null,
      damageDealt: 0,
      eliminations: 0,
      usedChin: false,
      usedWind: false,
    };
  });

  const record = opts.recordFrames ?? false;
  const frames: Frames | undefined = record
    ? {
        fighters: n,
        ticks: 0,
        pos: new Float32Array(maxTicks * n * 3),
        hp: new Float32Array(maxTicks * n),
        act: new Uint8Array(maxTicks * n),
        actTick: new Int32Array(maxTicks * n),
        hitTick: new Int32Array(maxTicks * n),
      }
    : undefined;

  const order = Array.from({ length: n }, (_, i) => i);
  const moveSets = fighters.map((f) => new Set(f.moves ?? []));
  let aliveCount = n;
  let tick = 0;

  const attackers = new Array<number>(n).fill(0);

  for (; tick < maxTicks && aliveCount > 1; tick++) {
    attackers.fill(0);
    for (const s of states) if (s.alive && s.target >= 0) attackers[s.target]++;

    // Shuffle turn order each tick so nobody gets a structural edge.
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    for (const i of order) {
      const me = states[i];
      if (!me.alive) continue;
      const stats = fighters[i].stats;
      const skill = stats.technique / 100;
      const moves = moveSets[i];
      const ringSkill = moves.has("ringIq") ? Math.min(1, skill + RING_IQ_BONUS) : skill;

      if (moves.has("secondWind") && !me.usedWind && me.energy < me.maxEnergy * 0.15) {
        me.usedWind = true;
        me.energy = me.maxEnergy * 0.6;
        events.push({ tick, type: "move", fighter: fighters[i].id, move: "secondWind" });
      }

      if (me.target < 0 || !states[me.target].alive || tick % RETARGET_EVERY === i % RETARGET_EVERY) {
        me.target = pickTarget(states, fighters, i, ringSkill, rng);
      }
      const them = states[me.target];
      const dx = them.x - me.x;
      const dz = them.z - me.z;
      const dist = Math.hypot(dx, dz);
      me.rot = Math.atan2(dx, dz);

      if (me.recovery > 0) {
        me.recovery--;
        regen(me, stats, 0.3);
        continue;
      }

      // Skilled fighters slip out of pile-ons instead of trading with three people at once.
      if (attackers[i] >= 2 && rng() < 0.6 * ringSkill) {
        retreat(me, states, i, stats);
        regen(me, stats, 0.4);
        continue;
      }

      if (dist > REACH) {
        const tired = me.energy < me.maxEnergy * 0.2 ? 0.6 : 1;
        const step = (0.05 + 0.07 * (stats.speed / 100)) * tired;
        me.x += (dx / dist) * step;
        me.z += (dz / dist) * step;
        if (me.act !== Act.Move) {
          me.act = Act.Move;
          me.actTick = tick;
        }
        regen(me, stats, 0.6);
        continue;
      }

      const policy = opts.policies?.[fighters[i].id] ?? defaultPolicy;
      let decision = policy.decide({ self: me, target: them, stats, tick }, rng);
      if (decision !== "rest" && decision !== "guard" && me.energy < PUNCHES[decision].energy) decision = "rest";

      if (decision === "rest") {
        setAct(me, Act.Rest, tick);
        regen(me, stats, 1);
        me.recovery = 2;
        continue;
      }
      if (decision === "guard") {
        setAct(me, Act.Guard, tick);
        me.guardUntil = tick + 6;
        regen(me, stats, 0.5);
        me.recovery = 3;
        continue;
      }

      const punch = PUNCHES[decision];
      setAct(me, punch.code, tick);
      me.energy -= punch.energy;
      me.recovery = punch.recovery;

      const theirStats = fighters[me.target].stats;
      const slip = moveSets[me.target].has("slip") ? SLIP_DODGE_BONUS : 0;
      const dodgeChance = Math.max(0.02, 0.05 + 0.2 * (theirStats.speed / 100) - 0.1 * skill + slip);
      if (rng() < dodgeChance) continue;

      let damage = punch.damage * DAMAGE_SCALE * (0.3 + 1.2 * (stats.power / 100));
      const crit = rng() < 0.03 + 0.08 * skill;
      if (crit) damage *= 1.5;
      if (moves.has("haymaker") && rng() < HAYMAKER_CHANCE) {
        damage *= HAYMAKER_MULTIPLIER;
        events.push({ tick, type: "move", fighter: fighters[i].id, move: "haymaker" });
      }
      if (them.guardUntil >= tick) damage *= 1 - (0.4 + 0.4 * (theirStats.defense / 100));
      if (me.energy < me.maxEnergy * 0.15) damage *= 0.6;

      them.hp -= damage;
      them.hitTick = tick;
      them.x += (dx / (dist || 1)) * punch.knockback;
      them.z += (dz / (dist || 1)) * punch.knockback;
      me.damageDealt += damage;
      if (crit) events.push({ tick, type: "crit", fighter: fighters[i].id });

      if (them.hp <= 0 && moveSets[me.target].has("ironChin") && !them.usedChin) {
        them.usedChin = true;
        them.hp = 1;
        events.push({ tick, type: "move", fighter: fighters[me.target].id, move: "ironChin" });
      }

      if (them.hp <= 0) {
        them.hp = 0;
        them.alive = false;
        them.eliminatedTick = tick;
        them.eliminatedBy = i;
        setAct(them, Act.Out, tick);
        me.eliminations++;
        aliveCount--;
        events.push({ tick, type: "ko", fighter: fighters[me.target].id, by: fighters[i].id });
      }
    }

    separate(states);

    if (frames) {
      for (let i = 0; i < n; i++) {
        const s = states[i];
        const k = tick * n + i;
        frames.pos[k * 3] = s.x;
        frames.pos[k * 3 + 1] = s.z;
        frames.pos[k * 3 + 2] = s.rot;
        frames.hp[k] = s.hp;
        frames.act[k] = s.act;
        frames.actTick[k] = s.actTick;
        frames.hitTick[k] = s.hitTick;
      }
      frames.ticks = tick + 1;
    }
  }

  const endTick = tick;
  const lastStandingIdx = aliveCount === 1 ? states.findIndex((s) => s.alive) : -1;

  const standings = states
    .map((s, i) => {
      const survivalSeconds = (s.eliminatedTick ?? endTick) / TICKS_PER_SECOND;
      const score =
        survivalSeconds * SCORE_WEIGHTS.perSecondSurvived +
        s.damageDealt * SCORE_WEIGHTS.perDamage +
        s.eliminations * SCORE_WEIGHTS.perElimination;
      return {
        index: i,
        fighterId: fighters[i].id,
        place: 0,
        score: Math.round(score * 10) / 10,
        survivalSeconds,
        damageDealt: Math.round(s.damageDealt * 10) / 10,
        eliminations: s.eliminations,
        eliminatedBy: s.eliminatedBy === null ? null : fighters[s.eliminatedBy].id,
      };
    })
    .sort((a, b) => {
      // The last fighter standing always wins; everyone else is ordered by score.
      if (a.index === lastStandingIdx) return -1;
      if (b.index === lastStandingIdx) return 1;
      return b.score - a.score || b.survivalSeconds - a.survivalSeconds || a.index - b.index;
    })
    .map(({ index: _index, ...rest }, place) => ({ ...rest, place: place + 1 }));

  return {
    seed,
    ticks: endTick,
    lastStanding: lastStandingIdx >= 0 ? fighters[lastStandingIdx].id : null,
    standings,
    events,
    frames,
  };
}

function retreat(me: State, states: State[], self: number, stats: FighterStats): void {
  let ax = 0;
  let az = 0;
  for (let j = 0; j < states.length; j++) {
    const other = states[j];
    if (j === self || !other.alive || other.target !== self) continue;
    ax += other.x - me.x;
    az += other.z - me.z;
  }
  const len = Math.hypot(ax, az);
  if (len < 1e-6) return;
  const step = 0.05 + 0.07 * (stats.speed / 100);
  me.x -= (ax / len) * step;
  me.z -= (az / len) * step;
  me.act = Act.Move;
  clampToRing(me);
}

function setAct(s: State, act: ActCode, tick: number): void {
  s.act = act;
  s.actTick = tick;
}

// Low-technique fighters just go for whoever is closest. Skilled fighters pick fights
// they can win: weaker or already-hurt opponents, away from crowded brawls.
function pickTarget(states: State[], fighters: RumbleFighter[], self: number, skill: number, rng: Rng): number {
  const me = states[self];
  const crowd = new Array(states.length).fill(0);
  for (let j = 0; j < states.length; j++) {
    if (j !== self && states[j].alive && states[j].target >= 0) crowd[states[j].target]++;
  }
  let best = -1;
  let bestScore = -Infinity;
  for (let j = 0; j < states.length; j++) {
    const other = states[j];
    if (j === self || !other.alive) continue;
    const dist = Math.hypot(other.x - me.x, other.z - me.z);
    const { power, defense, stamina } = fighters[j].stats;
    const threat = (power + defense + stamina) / 300;
    const score =
      -dist -
      skill * threat * 6 +
      skill * (1 - other.hp / other.maxHp) * 4 -
      skill * crowd[j] * 1.5 +
      (rng() - 0.5) * 3 * (1 - skill);
    if (score > bestScore) {
      bestScore = score;
      best = j;
    }
  }
  return best;
}

// Push overlapping fighters apart so they don't stand inside each other.
function separate(states: State[]): void {
  for (let i = 0; i < states.length; i++) {
    const a = states[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < states.length; j++) {
      const b = states[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= PERSONAL_SPACE) continue;
      const push = (PERSONAL_SPACE - d) / 2;
      const ux = d > 1e-6 ? dx / d : 1;
      const uz = d > 1e-6 ? dz / d : 0;
      a.x -= ux * push;
      a.z -= uz * push;
      b.x += ux * push;
      b.z += uz * push;
    }
    clampToRing(a);
  }
  for (const s of states) if (s.alive) clampToRing(s);
}
