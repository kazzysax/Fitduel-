// Battleground data for the prototype: divisions, arenas, matchmaking against
// generated champions, and the schedule of Rumbles.

import { makeFakeField, type FakePlayer } from "../../../engine/fakeData.ts";
import { simulateRumble } from "../../../engine/rumble.ts";
import type { Champ } from "./store.ts";
import { today } from "./store.ts";

export interface Division {
  name: string;
  min: number;
  venue: VenueId;
}

export type VenueId = "garage" | "rooftop" | "city" | "colosseum";

export const DIVISIONS: Division[] = [
  { name: "Rookie", min: 0, venue: "garage" },
  { name: "Contender", min: 45, venue: "rooftop" },
  { name: "Pro", min: 60, venue: "city" },
  { name: "Champion", min: 75, venue: "colosseum" },
];

export function divisionFor(rating: number): Division {
  return [...DIVISIONS].reverse().find((d) => rating >= d.min)!;
}

export interface Venue {
  name: string;
  background: string;
  floor: string;
  apron: string;
  canvas: string;
  ropes: [string, string];
  posts: [string, string];
  stands: [string, string];
  crowdFill: number; // share of seats taken
  light: string;
}

export const VENUES: Record<VenueId, Venue> = {
  garage: {
    name: "Garage Gym",
    background: "#1c1b1a",
    floor: "#3a3633",
    apron: "#7a7f87",
    canvas: "#d9d2c3",
    ropes: ["#f2a541", "#2b2b2b"],
    posts: ["#f2a541", "#2b2b2b"],
    stands: ["#45403c", "#3b3734"],
    crowdFill: 0.3,
    light: "#ffe2b8",
  },
  rooftop: {
    name: "Street Rooftop",
    background: "#120f24",
    floor: "#231d3d",
    apron: "#6a3fd1",
    canvas: "#e4e0f2",
    ropes: ["#ff4fa3", "#f5f5f5"],
    posts: ["#ff4fa3", "#35d0ff"],
    stands: ["#2a2346", "#30284f"],
    crowdFill: 0.55,
    light: "#d9d0ff",
  },
  city: {
    name: "City Arena",
    background: "#14161f",
    floor: "#1a1c26",
    apron: "#2a5bd7",
    canvas: "#ece6d6",
    ropes: ["#d62828", "#f5f5f5"],
    posts: ["#d62828", "#2453b8"],
    stands: ["#262a38", "#2e3344"],
    crowdFill: 0.88,
    light: "#fff6e0",
  },
  colosseum: {
    name: "Brick Colosseum",
    background: "#1f170e",
    floor: "#3b2c1b",
    apron: "#b8860b",
    canvas: "#f3e7c9",
    ropes: ["#ffc633", "#7a1f1f"],
    posts: ["#ffc633", "#7a1f1f"],
    stands: ["#5c4329", "#6b4f31"],
    crowdFill: 0.97,
    light: "#ffe9b0",
  },
};

export function champAsFighter(champ: Champ): FakePlayer {
  return { id: "you", name: champ.name, archetype: "Your training", color: champ.color, stats: champ.stats, rating: champ.rating };
}

// Matchmaking: the closest-rated champion from a pool in your division range.
export function findOpponent(champ: Champ, seed: number): FakePlayer {
  const pool = makeFakeField(seed, 40, today());
  const sorted = pool
    .map((p) => ({ p, gap: Math.abs(p.rating - champ.rating) }))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 5);
  return sorted[seed % sorted.length].p;
}

export interface LiveDuel {
  id: string;
  seed: number;
  a: FakePlayer;
  b: FakePlayer;
  division: Division;
  secondsIn: number; // how far into the fight it is right now
  length: number; // fight length in seconds
  viewers: number;
}

// A rotating feed of other champions' duels. New ones start every few minutes.
export function liveDuels(now = Date.now()): LiveDuel[] {
  const slot = Math.floor(now / 60_000);
  const out: LiveDuel[] = [];
  for (let i = 0; i < 6; i++) {
    const seed = (slot - i) * 7 + 1013;
    // Pair the two closest-rated champions from a small pool, like real matchmaking.
    const pool = makeFakeField(seed, 8, today()).sort((x, y) => x.rating - y.rating);
    let pair = 0;
    for (let k = 1; k < pool.length - 1; k++) if (pool[k + 1].rating - pool[k].rating < pool[pair + 1].rating - pool[pair].rating) pair = k;
    const [a, b] = [pool[pair], pool[pair + 1]];
    const length = simulateRumble([a, b], seed).ticks / 10;
    out.push({
      id: `duel-${seed}`,
      seed,
      a,
      b,
      division: divisionFor(Math.round((a.rating + b.rating) / 2)),
      secondsIn: i * 60 + ((now / 1000) % 60),
      length,
      viewers: 40 + ((seed * 37) % 900),
    });
  }
  return out;
}

export interface RumbleEvent {
  id: string;
  kind: "daily" | "weekly";
  title: string;
  startsAt: Date;
  fieldSize: number;
  entryCents: number;
  entered: number;
}

// Daily Rumble at 20:00 local time; weekly final on Sunday at 19:00.
export function upcomingRumbles(now = new Date()): RumbleEvent[] {
  const daily = new Date(now);
  daily.setHours(20, 0, 0, 0);
  if (daily <= now) daily.setDate(daily.getDate() + 1);
  const weekly = new Date(now);
  weekly.setHours(19, 0, 0, 0);
  weekly.setDate(weekly.getDate() + ((7 - weekly.getDay()) % 7));
  if (weekly <= now) weekly.setDate(weekly.getDate() + 7);
  const dayKey = Number(today().replaceAll("-", ""));
  return [
    { id: `daily-${dayKey}`, kind: "daily", title: "Daily Rumble", startsAt: daily, fieldSize: 30, entryCents: 500, entered: 18 + (dayKey % 9) },
    { id: `weekly-${dayKey}`, kind: "weekly", title: "Weekly Grand Rumble", startsAt: weekly, fieldSize: 30, entryCents: 2500, entered: 11 + (dayKey % 13) },
  ];
}

export function countdown(to: Date, now = new Date()): string {
  const s = Math.max(0, Math.floor((to.getTime() - now.getTime()) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}
