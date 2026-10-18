import type { FakePlayer } from "../../engine/fakeData.ts";
import { computeStats, overallRating, WINDOW_DAYS, type ActivityDay } from "../../engine/stats.ts";

export const TODAY = "2026-10-18";

// Your training on an active day, and how many days a week you train.
export interface Training {
  steps: number;
  pushups: number;
  squats: number;
  activeMinutes: number;
  runKm: number;
  daysPerWeek: number;
}

export const DEFAULT_TRAINING: Training = { steps: 7000, pushups: 25, squats: 30, activeMinutes: 25, runKm: 1, daysPerWeek: 4 };

// Phase 0 stand-in for real tracked data: the same day repeated on N days per week.
function historyFrom(t: Training): ActivityDay[] {
  return Array.from({ length: WINDOW_DAYS }, (_, age) => {
    const active = age % 7 < t.daysPerWeek;
    return {
      date: new Date(Date.parse(TODAY) - age * 86_400_000).toISOString().slice(0, 10),
      steps: active ? t.steps : 3000,
      pushups: active ? t.pushups : 0,
      squats: active ? t.squats : 0,
      activeMinutes: active ? t.activeMinutes : 5,
      runKm: active ? t.runKm : 0,
    };
  });
}

export function makeYou(training: Training): FakePlayer {
  const stats = computeStats(historyFrom(training), TODAY);
  return { id: "you", name: "You", archetype: "Your training", color: "#ffd60a", stats, rating: overallRating(stats) };
}
