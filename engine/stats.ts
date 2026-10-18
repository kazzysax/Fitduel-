// Turns real-world activity into fighter stats.
//
// Design rules:
// - Diminishing returns: the first 5k steps matter far more than the 30th 5k.
//   This keeps the game fair for casual users and removes the incentive to overtrain.
// - Daily caps: anything above a plausible daily amount earns nothing (also limits cheating).
// - Recency decay: recent training counts most, so stats fade if you stop moving.
// - Consistency: training often beats training hard once. It feeds "technique".

export interface ActivityDay {
  date: string; // ISO date, e.g. "2026-10-18"
  steps: number;
  pushups: number;
  squats: number;
  activeMinutes: number;
  runKm: number;
}

export interface FighterStats {
  power: number; // punch damage
  speed: number; // dodge chance and attack rate
  stamina: number; // energy pool and regen
  defense: number; // block efficiency
  technique: number; // smarter action choice, crit chance
}

export const DAILY_CAPS = {
  steps: 25_000,
  pushups: 200,
  squats: 300,
  activeMinutes: 120,
  runKm: 15,
} as const;

// Window of history that counts toward stats, and how fast old days fade.
export const WINDOW_DAYS = 28;
export const HALF_LIFE_DAYS = 10;

// Weighted daily averages at which a stat reaches ~63 of 100.
const SATURATION = {
  steps: 8_000,
  pushups: 40,
  squats: 60,
  activeMinutes: 35,
  runKm: 3,
};

const BASE_STAT = 10;

function saturate(value: number, k: number): number {
  return 1 - Math.exp(-value / k);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function toStat(fraction: number): number {
  return Math.round(BASE_STAT + (100 - BASE_STAT) * Math.min(1, Math.max(0, fraction)));
}

export function computeStats(history: ActivityDay[], today: string): FighterStats {
  const totals = { steps: 0, pushups: 0, squats: 0, activeMinutes: 0, runKm: 0 };
  let weightSum = 0;
  let activeDays = 0;

  for (let age = 0; age < WINDOW_DAYS; age++) {
    weightSum += Math.pow(0.5, age / HALF_LIFE_DAYS);
  }

  for (const day of history) {
    const age = daysBetween(day.date, today);
    if (age < 0 || age >= WINDOW_DAYS) continue;
    const w = Math.pow(0.5, age / HALF_LIFE_DAYS);
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
      totals[key] += w * Math.min(Math.max(0, day[key]), DAILY_CAPS[key]);
    }
    if (day.steps >= 5_000 || day.pushups >= 10 || day.activeMinutes >= 20) activeDays++;
  }

  // Weighted daily averages.
  const avg = Object.fromEntries(
    Object.entries(totals).map(([k, v]) => [k, v / weightSum]),
  ) as typeof totals;

  const s = {
    steps: saturate(avg.steps, SATURATION.steps),
    pushups: saturate(avg.pushups, SATURATION.pushups),
    squats: saturate(avg.squats, SATURATION.squats),
    activeMinutes: saturate(avg.activeMinutes, SATURATION.activeMinutes),
    runKm: saturate(avg.runKm, SATURATION.runKm),
  };
  const consistency = activeDays / WINDOW_DAYS;

  return {
    power: toStat(0.75 * s.pushups + 0.25 * s.squats),
    speed: toStat(0.6 * s.runKm + 0.4 * s.activeMinutes),
    stamina: toStat(0.6 * s.steps + 0.4 * s.activeMinutes),
    defense: toStat(0.6 * s.squats + 0.4 * consistency),
    technique: toStat(0.7 * consistency + 0.3 * s.activeMinutes),
  };
}

export function overallRating(stats: FighterStats): number {
  const { power, speed, stamina, defense, technique } = stats;
  return Math.round((power + speed + stamina + defense + technique) / 5);
}
