// Fake players for the prototype: 28 days of activity per player, generated from a few
// training archetypes so the field has a realistic spread of fighters.

import { createRng, type Rng } from "./rng.ts";
import { computeStats, overallRating, WINDOW_DAYS, type ActivityDay, type FighterStats } from "./stats.ts";

export interface FakePlayer {
  id: string;
  name: string;
  archetype: string;
  color: string;
  stats: FighterStats;
  rating: number;
}

type DayPlan = Omit<ActivityDay, "date">;

const ARCHETYPES: { name: string; day: (rng: Rng, age: number) => DayPlan }[] = [
  {
    name: "Couch Starter",
    day: (rng) => ({ steps: 2_000 + rng() * 3_000, pushups: rng() < 0.1 ? 10 : 0, squats: 0, activeMinutes: rng() * 10, runKm: 0 }),
  },
  {
    name: "Daily Walker",
    day: (rng) => ({ steps: 8_000 + rng() * 6_000, pushups: rng() * 15, squats: rng() * 20, activeMinutes: 25 + rng() * 20, runKm: 0 }),
  },
  {
    name: "Gym Lifter",
    day: (rng, age) =>
      age % 2 === 0
        ? { steps: 6_000 + rng() * 3_000, pushups: 60 + rng() * 60, squats: 80 + rng() * 80, activeMinutes: 60, runKm: 0 }
        : { steps: 5_000, pushups: 10, squats: 10, activeMinutes: 15, runKm: 0 },
  },
  {
    name: "Runner",
    day: (rng, age) => ({
      steps: 10_000 + rng() * 8_000,
      pushups: rng() * 20,
      squats: rng() * 30,
      activeMinutes: 40 + rng() * 40,
      runKm: age % 7 === 6 ? 0 : 4 + rng() * 6,
    }),
  },
  {
    name: "Weekend Warrior",
    day: (rng, age) =>
      age % 7 < 2
        ? { steps: 18_000, pushups: 120, squats: 150, activeMinutes: 110, runKm: 8 }
        : { steps: 3_000 + rng() * 2_000, pushups: 0, squats: 0, activeMinutes: 5, runKm: 0 },
  },
  {
    name: "All-Rounder",
    day: (rng) => ({
      steps: 11_000 + rng() * 5_000,
      pushups: 40 + rng() * 40,
      squats: 50 + rng() * 50,
      activeMinutes: 45 + rng() * 30,
      runKm: 2 + rng() * 4,
    }),
  },
];

const FIRST = ["Brick", "Stud", "Block", "Rocky", "Tilly", "Max", "Juno", "Kai", "Ivy", "Zed", "Nova", "Ace", "Ruby", "Duke", "Pip", "Remy", "Sky", "Bo"];
const LAST = ["Basher", "Stacker", "Snapjaw", "Ironfist", "Bouncer", "Quickstep", "Thunder", "Clicker", "Hammer", "Rumble", "Slugger", "Breaker"];
const COLORS = ["#e63946", "#2a9d8f", "#f4a261", "#457b9d", "#8338ec", "#ff006e", "#06d6a0", "#ffbe0b", "#3a86ff", "#fb5607", "#6a994e", "#bc4749"];

export function makeFakeField(seed: number, size: number, today: string): FakePlayer[] {
  const rng = createRng(seed);
  const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
  const usedNames = new Set<string>();

  return Array.from({ length: size }, (_, i) => {
    const archetype = pick(ARCHETYPES);
    const history: ActivityDay[] = Array.from({ length: WINDOW_DAYS }, (_, age) => ({
      date: new Date(Date.parse(today) - age * 86_400_000).toISOString().slice(0, 10),
      ...archetype.day(rng, age),
    }));
    let name = `${pick(FIRST)} ${pick(LAST)}`;
    while (usedNames.has(name)) name = `${pick(FIRST)} ${pick(LAST)}`;
    usedNames.add(name);
    const stats = computeStats(history, today);
    return {
      id: `p${i + 1}`,
      name,
      archetype: archetype.name,
      color: pick(COLORS),
      stats,
      rating: overallRating(stats),
    };
  });
}
