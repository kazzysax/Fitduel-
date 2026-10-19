import assert from "node:assert/strict";
import { test } from "node:test";

import { makeFakeField } from "../fakeData.ts";
import {
  applyUpgrades,
  condition,
  DAILY_TRAINING_XP_CAP,
  fightXp,
  MAX_LEVEL,
  movesFor,
  STAT_CEILING,
  upgradeCost,
  workoutXp,
} from "../progression.ts";
import { simulateRumble } from "../rumble.ts";

const base = { power: 55, speed: 50, stamina: 60, defense: 55, technique: 60 };

test("xp: training earns XP; camera beats manual; streaks add a bonus", () => {
  assert.equal(workoutXp("pushups", 30, "tracker", 0), 60);
  assert.equal(workoutXp("pushups", 30, "camera", 0), 75);
  assert.equal(workoutXp("pushups", 30, "manual", 0), 30);
  assert.equal(workoutXp("steps", 8000, "tracker", 0), 80);
  assert.equal(workoutXp("pushups", 30, "tracker", 3), 78, "+30% for a 3-day streak");
  assert.equal(workoutXp("pushups", 30, "tracker", 20), 90, "streak bonus caps at +50%");
  assert.ok(DAILY_TRAINING_XP_CAP > 0);
});

test("xp: fights give a little, winners more", () => {
  assert.ok(fightXp("duel", 1, 10) > fightXp("duel", 3, 10));
  assert.ok(fightXp("duel", 3, 10) > fightXp("duel", 9, 10));
  assert.ok(fightXp("rumble", 1, 30) > fightXp("rumble", 6, 30));
  assert.ok(fightXp("rumble", 6, 30) > fightXp("rumble", 7, 30), "top 20% get more");
});

test("upgrades: cost rises per level; bonus scales with condition; ceiling holds", () => {
  for (let l = 1; l < MAX_LEVEL; l++) assert.ok(upgradeCost(l) > upgradeCost(l - 1));
  assert.equal(upgradeCost(0), 100);
  const full = applyUpgrades(base, { power: 5 }, 1);
  const unfit = applyUpgrades(base, { power: 5 }, condition(0));
  assert.equal(full.power, 70);
  assert.equal(unfit.power, 61, "only 40% of the bonus without recent training");
  assert.equal(full.speed, base.speed, "other areas unchanged");
  assert.equal(applyUpgrades({ ...base, power: 125 }, { power: 10 }, 1).power, STAT_CEILING);
});

test("moves: unlock at level 5 and only work in fighting shape", () => {
  assert.deepEqual(movesFor({ power: 4 }, 1), []);
  assert.deepEqual(movesFor({ power: 5 }, 1), ["haymaker"]);
  assert.deepEqual(movesFor({ power: 5 }, condition(1)), [], "out of shape: no moves");
  assert.deepEqual(movesFor({ power: 5 }, condition(4)), ["haymaker"]);
});

test("moves: change fights, stay deterministic, and leave move-less fighters untouched", () => {
  const field = makeFakeField(11, 9, "2026-10-19");
  const plain = { id: "me", name: "Me", stats: base };
  const withMoves = { ...plain, moves: movesFor({ power: 5, speed: 5, stamina: 5, defense: 5, technique: 5 }, 1) };
  const a = simulateRumble([withMoves, ...field], 5);
  assert.deepEqual(a, simulateRumble([withMoves, ...field], 5), "deterministic");
  assert.deepEqual(simulateRumble([plain, ...field], 5), simulateRumble([{ ...plain, moves: [] }, ...field], 5));
  let movesUsed = 0;
  for (let seed = 1; seed <= 40; seed++) movesUsed += simulateRumble([withMoves, ...field], seed).events.filter((e) => e.type === "move").length;
  assert.ok(movesUsed > 20, `moves fired ${movesUsed} times`);
});

test("upgrades help, but an unfit champion loses most of the edge", () => {
  const all5 = { power: 5, speed: 5, stamina: 5, defense: 5, technique: 5 };
  const winRate = (cond: number) => {
    let wins = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const field = makeFakeField(seed * 7, 60, "2026-10-19")
        .sort((x, y) => Math.abs(x.rating - 56) - Math.abs(y.rating - 56))
        .slice(0, 9);
      const me = { id: "me", name: "Me", stats: applyUpgrades(base, all5, cond), moves: movesFor(all5, cond) };
      if (simulateRumble([me, ...field], seed).standings[0].fighterId === "me") wins++;
    }
    return wins / 120;
  };
  const fit = winRate(1);
  const unfit = winRate(condition(0));
  assert.ok(fit - unfit > 0.15, `fit ${fit} vs unfit ${unfit}`);
});
