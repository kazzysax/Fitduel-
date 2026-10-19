import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { simulateRumble } from "../../engine/rumble.ts";
import { createApp } from "../app.ts";
import { openDb } from "../db.ts";
import { addDays, runDueRumbles, utcDate, verifyRumbleSeed } from "../game.ts";

const db = openDb(":memory:");
const server = createApp(db, { authAttempts: 1000 });
let base = "";

before(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(base + path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, data: (await res.json()) as any };
}

let n = 0;
async function signup(name: string) {
  const r = await api("/api/auth/signup", { body: { email: `user${++n}@example.com`, password: "correct-horse", champName: name } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { token: r.data.token as string, name };
}

// Writes a few weeks of training straight into the database for a user.
function train(user: { token: string; name: string }, day: { steps: number; pushups: number; squats: number; active_minutes: number; run_km: number }) {
  const userId = (db.prepare("SELECT user_id FROM champs WHERE name = ?").get(user.name) as { user_id: number }).user_id;
  for (let age = 0; age < 21; age++) {
    db.prepare("INSERT OR REPLACE INTO activity (user_id, date, steps, pushups, squats, active_minutes, run_km) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      userId,
      addDays(utcDate(), -age),
      day.steps,
      day.pushups,
      day.squats,
      day.active_minutes,
      day.run_km,
    );
  }
  return user.token;
}

test("accounts: sign up, log in, wrong password, duplicate email", async () => {
  const r = await api("/api/auth/signup", { body: { email: "Ada@Example.com", password: "long-enough", champName: "Ada" } });
  assert.equal(r.status, 200);
  n++;
  assert.equal((await api("/api/auth/signup", { body: { email: "ada@example.com", password: "long-enough", champName: "Ada2" } })).status, 409);
  assert.equal((await api("/api/auth/login", { body: { email: "ada@example.com", password: "nope-nope" } })).status, 401);
  const login = await api("/api/auth/login", { body: { email: "ADA@example.com", password: "long-enough" } });
  assert.equal(login.status, 200);
  const me = await api("/api/me", { token: login.data.token });
  assert.equal(me.data.champ.name, "Ada");
  assert.equal(me.data.champ.rating, 10, "new champions start at base stats");
  assert.equal((await api("/api/me")).status, 401);
  assert.equal((await api("/api/auth/signup", { body: { email: "x@y.z", password: "short", champName: "X" } })).status, 400);
});

test("training: logging workouts raises stats and is reflected in activity", async () => {
  const { token } = await signup("Lifter");
  const before = (await api("/api/me", { token })).data.champ.stats.power;
  const w = await api("/api/workouts", { token, body: { kind: "pushups", amount: 40, source: "camera", durationSec: 90 } });
  assert.equal(w.status, 200);
  assert.equal(w.data.flagged, null);
  const after = (await api("/api/me", { token })).data.champ.stats.power;
  assert.ok(after > before);
  const act = await api("/api/activity", { token });
  assert.equal(act.data.log[act.data.today].pushups, 40);
  assert.equal(act.data.workouts[0].source, "camera");
});

test("anti-cheat: implausible amounts are rejected, suspicious ones flagged", async () => {
  const { token } = await signup("Cheater");
  assert.equal((await api("/api/workouts", { token, body: { kind: "pushups", amount: 5000, source: "manual" } })).status, 422);
  assert.equal((await api("/api/workouts", { token, body: { kind: "pushups", amount: -3, source: "manual" } })).status, 400);
  const fast = await api("/api/workouts", { token, body: { kind: "pushups", amount: 100, source: "camera", durationSec: 20 } });
  assert.equal(fast.data.flagged, "camera-too-fast");
  const manual = await api("/api/workouts", { token, body: { kind: "steps", amount: 8000, source: "manual" } });
  assert.equal(manual.data.flagged, "manual");
  for (let i = 0; i < 3; i++) await api("/api/workouts", { token, body: { kind: "pushups", amount: 290, source: "manual" } });
  assert.equal((await api("/api/workouts", { token, body: { kind: "pushups", amount: 100, source: "manual" } })).status, 422, "daily limit");
});

test("duels: a ring of 10 with real players' champions, everyone sees the result", async () => {
  const day = { steps: 9000, pushups: 40, squats: 50, active_minutes: 35, run_km: 2 };
  const a = train(await signup("Alpha"), day);
  const b = train(await signup("Bravo"), day);
  const duel = await api("/api/duels", { token: a, body: {} });
  assert.equal(duel.status, 200, JSON.stringify(duel.data));
  const fight = (await api(`/api/fights/${duel.data.fightId}`, { token: a })).data;
  assert.equal(fight.fighters.length, 10, "ring of 10");
  assert.equal(fight.fighters[0].name, "Alpha", "your champ is in the ring");
  assert.ok(fight.fighters.some((f: { name: string }) => f.name === "Bravo"), "a real player at the same level is matched");
  assert.equal(new Set(fight.fighters.map((f: { id: string }) => f.id)).size, 10, "fighter ids are unique");
  assert.equal(fight.fighters[0].userId, undefined, "account ids are not exposed");
  // The replay is exact: re-running the stored fighters and seed gives the stored result.
  assert.deepEqual(simulateRumble(fight.fighters, fight.seed).standings, fight.standings);

  const notes = (await api("/api/notifications", { token: b })).data;
  assert.match(notes[0].body, /Alpha started a ring fight with your champ Bravo/);
  const mine = (await api("/api/fights/mine", { token: b })).data;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].fieldSize, 10);
  assert.equal((await api("/api/me", { token: a })).data.record.duels, 1);
  assert.ok((await api("/api/me", { token: a })).data.unlocked.includes("sweatband"));
});

test("rumbles: enter, run at start time, verifiable seed, results and notifications", async () => {
  const t1 = train(await signup("Rumbler One"), { steps: 12000, pushups: 60, squats: 80, active_minutes: 45, run_km: 4 });
  const t2 = (await signup("Rumbler Two")).token;
  const list = (await api("/api/rumbles", { token: t1 })).data;
  const daily = list.find((r: { kind: string; status: string }) => r.kind === "daily" && r.status === "open");
  assert.ok(daily && daily.seedHash && daily.seed === null, "only the seed hash is public before the Rumble");
  assert.equal((await api(`/api/rumbles/${daily.id}/enter`, { token: t1, body: {} })).status, 200);
  assert.equal((await api(`/api/rumbles/${daily.id}/enter`, { token: t2, body: {} })).status, 200);
  assert.equal((await api("/api/rumbles", { token: t1 })).data.find((r: { id: number }) => r.id === daily.id).entered, 2);

  const ran = runDueRumbles(db, new Date(Date.parse(daily.startsAt) + 1000));
  assert.ok(ran.includes(daily.id));
  const done = (await api("/api/rumbles", { token: t1 })).data.find((r: { id: number }) => r.id === daily.id);
  assert.equal(done.status, "done");
  assert.ok(verifyRumbleSeed(done.seed, done.seedHash), "revealed seed matches the published hash");
  const fight = (await api(`/api/fights/${done.fightId}`, { token: t1 })).data;
  assert.equal(fight.fighters.length, 30, "house champions fill free Rumbles");
  assert.equal(fight.seed, done.seed);
  assert.equal((await api(`/api/rumbles/${daily.id}/enter`, { token: t1, body: {} })).status, 409, "closed after it runs");
  const note = (await api("/api/notifications", { token: t2 })).data[0];
  assert.match(note.body, /Daily Rumble is over/);
  assert.ok((await api("/api/rumbles", { token: t1 })).data.some((r: { kind: string; status: string }) => r.kind === "daily" && r.status === "open"), "next one scheduled");
});

test("champ: rename, colour, and only unlocked gear can be equipped", async () => {
  const { token } = await signup("Styler");
  assert.equal((await api("/api/champ", { method: "PUT", token, body: { name: "Brick Lee", color: "#3a86ff" } })).status, 200);
  const me = (await api("/api/me", { token })).data;
  assert.equal(me.champ.name, "Brick Lee");
  assert.equal(me.champ.color, "#3a86ff");
  assert.equal((await api("/api/champ", { method: "PUT", token, body: { equipped: { head: "crown" } } })).status, 403);
  assert.equal((await api("/api/champ", { method: "PUT", token, body: { name: "<script>" } })).status, 400);
});

test("leaderboard and account deletion", async () => {
  const token = train(await signup("Leader"), { steps: 15000, pushups: 100, squats: 120, active_minutes: 60, run_km: 6 });
  const board = (await api("/api/leaderboard", { token })).data;
  assert.equal(board[0].name, "Leader");
  assert.equal(board[0].me, true);
  assert.equal((await api("/api/me", { method: "DELETE", token, body: { password: "wrong" } })).status, 401);
  assert.equal((await api("/api/me", { method: "DELETE", token, body: { password: "correct-horse" } })).status, 200);
  assert.equal((await api("/api/me", { token })).status, 401);
});
