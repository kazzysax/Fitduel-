import assert from "node:assert/strict";
import { test } from "node:test";

import { makeFakeField } from "../fakeData.ts";
import { computePayouts, paidPlaces } from "../payout.ts";
import { simulateRumble, type RumbleFighter } from "../rumble.ts";
import { computeStats, type ActivityDay } from "../stats.ts";

const today = "2026-10-18";

function days(n: number, day: Omit<ActivityDay, "date">): ActivityDay[] {
  return Array.from({ length: n }, (_, age) => ({
    date: new Date(Date.parse(today) - age * 86_400_000).toISOString().slice(0, 10),
    ...day,
  }));
}

const idle = { steps: 0, pushups: 0, squats: 0, activeMinutes: 0, runKm: 0 };
const fit = { steps: 12_000, pushups: 60, squats: 80, activeMinutes: 45, runKm: 4 };

test("stats: no activity gives base stats", () => {
  assert.deepEqual(computeStats([], today), { power: 10, speed: 10, stamina: 10, defense: 10, technique: 10 });
});

test("stats: more training helps, with diminishing returns and daily caps", () => {
  const p20 = computeStats(days(28, { ...idle, pushups: 20 }), today).power;
  const p40 = computeStats(days(28, { ...idle, pushups: 40 }), today).power;
  const p60 = computeStats(days(28, { ...idle, pushups: 60 }), today).power;
  const capped = computeStats(days(28, { ...idle, pushups: 200 }), today).power;
  const absurd = computeStats(days(28, { ...idle, pushups: 100_000 }), today).power;
  assert.ok(p40 > p20 && p60 > p40);
  assert.ok(p60 - p40 < p40 - p20, "each extra 20 push-ups is worth less");
  assert.equal(absurd, capped, "anything above the daily cap earns nothing");
});

test("stats: activity older than the window does not count", () => {
  assert.deepEqual(computeStats([{ date: "2026-01-01", ...fit }], today), computeStats([], today));
});

test("rumble: same fighters and seed give the same result", () => {
  const field = makeFakeField(3, 30, today);
  const a = simulateRumble(field, 99, { recordFrames: true });
  const b = simulateRumble(field, 99, { recordFrames: true });
  assert.deepEqual(a.standings, b.standings);
  assert.deepEqual(a.frames!.pos, b.frames!.pos);
});

test("rumble: standings are complete and the last fighter standing is first", () => {
  const field = makeFakeField(5, 30, today);
  const r = simulateRumble(field, 5);
  assert.equal(r.standings.length, 30);
  assert.deepEqual(
    r.standings.map((s) => s.place),
    Array.from({ length: 30 }, (_, i) => i + 1),
  );
  assert.ok(r.lastStanding, "this Rumble ends with one fighter left");
  assert.equal(r.standings[0].fighterId, r.lastStanding);
  assert.equal(r.events.filter((e) => e.type === "ko").length, 29);
});

test("rumble: training decides the outcome far more than luck", () => {
  const strong: RumbleFighter = { id: "strong", name: "Strong", stats: computeStats(days(28, fit), today) };
  let paid = 0;
  const runs = 60;
  for (let seed = 1; seed <= runs; seed++) {
    const field = [strong, ...makeFakeField(seed, 29, today)];
    const place = simulateRumble(field, seed).standings.find((s) => s.fighterId === "strong")!.place;
    if (place <= paidPlaces(30)) paid++;
  }
  assert.ok(paid / runs >= 0.6, `fit fighter paid in ${paid}/${runs} Rumbles`);
});

test("rumble: an untrained fighter almost never gets paid", () => {
  const couch: RumbleFighter = { id: "couch", name: "Couch", stats: computeStats([], today) };
  let paid = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const field = [couch, ...makeFakeField(seed, 29, today)];
    if (simulateRumble(field, seed).standings.find((s) => s.fighterId === "couch")!.place <= paidPlaces(30)) paid++;
  }
  assert.ok(paid <= 2, `untrained fighter paid in ${paid}/60 Rumbles`);
});

test("payout: whole pool is paid out to the top 20%, best place first", () => {
  for (const size of [8, 10, 17, 30, 100, 1000]) {
    const entry = 500;
    const payouts = computePayouts(size, entry);
    assert.equal(payouts.length, paidPlaces(size));
    assert.equal(
      payouts.reduce((a, b) => a + b, 0),
      size * entry,
      `size ${size}: no platform fee`,
    );
    for (let i = 1; i < payouts.length; i++) assert.ok(payouts[i] <= payouts[i - 1], `size ${size}: descending`);
    for (const p of payouts) assert.ok(p >= 1.5 * entry, `size ${size}: every paid place wins >= 1.5x entry`);
  }
});

test("payout: 30-fighter $5 Rumble matches the spec table", () => {
  assert.deepEqual(computePayouts(30, 500), [5295, 3040, 2197, 1746, 1460, 1262]);
});
