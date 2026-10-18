// Local prototype data store. Everything lives in this browser (localStorage) until
// Phase 1 adds accounts and a backend; the shapes here are what the API will return.

import { useSyncExternalStore } from "react";

import { createRng } from "../../../engine/rng.ts";
import { computeStats, overallRating, WINDOW_DAYS, type ActivityDay, type FighterStats } from "../../../engine/stats.ts";

export type DayLog = Omit<ActivityDay, "date">;

export interface Workout {
  id: string;
  date: string;
  time: string; // ISO timestamp
  kind: "pushups" | "squats" | "steps" | "run" | "active";
  amount: number;
  source: "camera" | "manual" | "tracker";
}

export interface FightRecord {
  id: string;
  time: string;
  mode: "duel" | "rumble";
  seed: number;
  opponentName: string; // duel opponent, or "29 fighters" for a Rumble
  place: number;
  fieldSize: number;
  won: boolean;
  payoutCents: number;
}

export interface Profile {
  version: 1;
  champName: string;
  color: string;
  log: Record<string, DayLog>;
  workouts: Workout[];
  fights: FightRecord[];
}

export const GOALS = { steps: 8000, reps: 60, activeMinutes: 30 };

const KEY = "fitduel.profile.v1";
const EMPTY_DAY: DayLog = { steps: 0, pushups: 0, squats: 0, activeMinutes: 0, runKm: 0 };

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return isoDate(new Date());
}

export function daysAgo(n: number, from = today()): string {
  const d = new Date(`${from}T12:00:00`);
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

// A believable few weeks of history so a new visitor sees a lived-in app.
function sampleProfile(): Profile {
  const rng = createRng(4242);
  const log: Record<string, DayLog> = {};
  for (let age = 1; age < WINDOW_DAYS; age++) {
    const active = rng() < 0.7;
    log[daysAgo(age)] = active
      ? {
          steps: Math.round(6000 + rng() * 6000),
          pushups: Math.round(15 + rng() * 25),
          squats: Math.round(15 + rng() * 30),
          activeMinutes: Math.round(20 + rng() * 30),
          runKm: rng() < 0.3 ? Math.round((2 + rng() * 3) * 10) / 10 : 0,
        }
      : { steps: Math.round(2500 + rng() * 2500), pushups: 0, squats: 0, activeMinutes: Math.round(rng() * 10), runKm: 0 };
  }
  log[today()] = { steps: 3420, pushups: 0, squats: 0, activeMinutes: 8, runKm: 0 };
  return { version: 1, champName: "Brickbreaker", color: "#ffd60a", log, workouts: [], fights: [] };
}

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Profile;
      if (p.version === 1) return p;
    }
  } catch {
    // Storage unavailable (private mode, blocked): fall back to sample data.
  }
  return sampleProfile();
}

let profile: Profile = load();
const listeners = new Set<() => void>();

function save(next: Profile): void {
  profile = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not persisted; the app still works for this visit.
  }
  listeners.forEach((l) => l());
}

export function useProfile(): Profile {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => profile,
  );
}

export function dayLog(p: Profile, date: string): DayLog {
  return p.log[date] ?? EMPTY_DAY;
}

const FIELD_FOR: Record<Workout["kind"], keyof DayLog> = {
  pushups: "pushups",
  squats: "squats",
  steps: "steps",
  run: "runKm",
  active: "activeMinutes",
};

export function logWorkout(kind: Workout["kind"], amount: number, source: Workout["source"]): void {
  if (!(amount > 0)) return;
  const date = today();
  const day = { ...dayLog(profile, date) };
  const field = FIELD_FOR[kind];
  day[field] = Math.round((day[field] + amount) * 10) / 10;
  // Rep sets also count as active time (about 3 seconds a rep).
  if (kind === "pushups" || kind === "squats") day.activeMinutes += Math.round((amount * 3) / 60);
  const workout: Workout = { id: crypto.randomUUID(), date, time: new Date().toISOString(), kind, amount, source };
  save({ ...profile, log: { ...profile.log, [date]: day }, workouts: [workout, ...profile.workouts].slice(0, 200) });
}

export function recordFight(f: Omit<FightRecord, "id" | "time">): void {
  const rec: FightRecord = { ...f, id: crypto.randomUUID(), time: new Date().toISOString() };
  save({ ...profile, fights: [rec, ...profile.fights].slice(0, 100) });
}

export function updateChamp(changes: Partial<Pick<Profile, "champName" | "color">>): void {
  save({ ...profile, ...changes });
}

export function resetProfile(): void {
  save(sampleProfile());
}

export function history(p: Profile, asOf = today()): ActivityDay[] {
  return Array.from({ length: WINDOW_DAYS }, (_, age) => {
    const date = daysAgo(age, asOf);
    return { date, ...dayLog(p, date) };
  });
}

export interface Champ {
  name: string;
  color: string;
  stats: FighterStats;
  rating: number;
}

export function champOf(p: Profile, asOf = today()): Champ {
  const stats = computeStats(history(p, asOf), asOf);
  return { name: p.champName, color: p.color, stats, rating: overallRating(stats) };
}

export function isActiveDay(d: DayLog): boolean {
  return d.steps >= 5000 || d.pushups >= 10 || d.activeMinutes >= 20;
}

// Consecutive active days ending today (or yesterday, if today isn't done yet).
export function streak(p: Profile): number {
  let n = 0;
  let age = isActiveDay(dayLog(p, today())) ? 0 : 1;
  while (isActiveDay(dayLog(p, daysAgo(age)))) {
    n++;
    age++;
  }
  return n;
}
