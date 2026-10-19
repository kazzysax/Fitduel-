// XP and upgrades. Training earns XP; XP buys upgrade levels for your champion.
// XP can never be bought with money, so the only way to get stronger is to train.
//
//   final stat = base stat (from the last 28 days of training)
//              + upgrade bonus (levels bought with XP) × condition (recent training)
//
// Condition keeps people training: upgrades are permanent, but a champion only
// fights at full strength while its owner keeps working out.

import type { FighterStats } from "./stats.ts";

export type Area = keyof FighterStats;
export const AREAS: Area[] = ["power", "speed", "stamina", "defense", "technique"];

export type WorkoutKind = "pushups" | "squats" | "steps" | "run" | "active";
export type WorkoutSource = "camera" | "manual" | "tracker";

// XP per unit of each activity.
export const XP_RATES: Record<WorkoutKind, { perUnit: number; unit: string }> = {
  pushups: { perUnit: 2, unit: "rep" },
  squats: { perUnit: 1.5, unit: "rep" },
  steps: { perUnit: 0.01, unit: "step" }, // 10 XP per 1,000 steps
  run: { perUnit: 25, unit: "km" },
  active: { perUnit: 2, unit: "minute" },
};

export const SOURCE_MULTIPLIER: Record<WorkoutSource, number> = { camera: 1.25, tracker: 1, manual: 0.5 };
export const STREAK_BONUS_PER_DAY = 0.1;
export const MAX_STREAK_BONUS = 0.5;
export const DAILY_TRAINING_XP_CAP = 600;

export function streakMultiplier(streakDays: number): number {
  return 1 + Math.min(MAX_STREAK_BONUS, Math.max(0, streakDays) * STREAK_BONUS_PER_DAY);
}

// XP for one logged workout, before the daily cap.
export function workoutXp(kind: WorkoutKind, amount: number, source: WorkoutSource, streakDays: number): number {
  const raw = XP_RATES[kind].perUnit * Math.max(0, amount);
  return Math.round(raw * SOURCE_MULTIPLIER[source] * streakMultiplier(streakDays));
}

// Fights give a little XP so training stays the main source.
export const DAILY_FIGHT_XP_CAP = 150;

export function fightXp(mode: "duel" | "rumble", place: number, fieldSize: number): number {
  if (mode === "duel") return place === 1 ? 30 : place <= 3 ? 15 : 5;
  const paid = Math.max(1, Math.floor(fieldSize * 0.2));
  return place === 1 ? 150 : place <= paid ? 60 : 20;
}

// ───── Upgrades ─────

export const MAX_LEVEL = 10;
export const BONUS_PER_LEVEL = 3;
export const STAT_CEILING = 130;

// Cost of the next level when the area is at `level` (0 → 1 costs 100 XP).
export function upgradeCost(level: number): number {
  return Math.round(100 * Math.pow(1.35, level));
}

export type Upgrades = Partial<Record<Area, number>>;

export function levelOf(upgrades: Upgrades, area: Area): number {
  return Math.max(0, Math.min(MAX_LEVEL, Math.floor(upgrades[area] ?? 0)));
}

// Condition from the last 14 days: 40% with no training, 100% with 8+ active days.
export const CONDITION_WINDOW_DAYS = 14;
export const CONDITION_FULL_AT = 8;

export function condition(activeDaysLast14: number): number {
  return 0.4 + 0.6 * Math.min(1, Math.max(0, activeDaysLast14) / CONDITION_FULL_AT);
}

export function applyUpgrades(base: FighterStats, upgrades: Upgrades, cond: number): FighterStats {
  const out = { ...base };
  for (const area of AREAS) {
    const bonus = levelOf(upgrades, area) * BONUS_PER_LEVEL * cond;
    out[area] = Math.min(STAT_CEILING, Math.round(base[area] + bonus));
  }
  return out;
}

// ───── Signature moves (unlocked at level 5 of an area) ─────

export type Move = "haymaker" | "ironChin" | "slip" | "secondWind" | "ringIq";
export const MOVE_LEVEL = 5;

export const MOVES: Record<Move, { area: Area; name: string; description: string }> = {
  haymaker: { area: "power", name: "Haymaker", description: "Sometimes throws a huge punch for double damage" },
  slip: { area: "speed", name: "Slip", description: "Dodges more punches" },
  secondWind: { area: "stamina", name: "Second Wind", description: "Once a fight, recovers energy when nearly exhausted" },
  ironChin: { area: "defense", name: "Iron Chin", description: "Once a fight, survives a knockout blow" },
  ringIq: { area: "technique", name: "Ring IQ", description: "Picks fights smarter and escapes pile-ons" },
};

// Moves only work while the champion is in fighting shape (about 4+ active days
// in the last two weeks), so upgrades can't carry someone who stopped training.
export const MOVE_MIN_CONDITION = 0.7;

export function unlockedMoves(upgrades: Upgrades): Move[] {
  return (Object.keys(MOVES) as Move[]).filter((m) => levelOf(upgrades, MOVES[m].area) >= MOVE_LEVEL);
}

export function movesFor(upgrades: Upgrades, cond: number): Move[] {
  return cond >= MOVE_MIN_CONDITION ? unlockedMoves(upgrades) : [];
}
