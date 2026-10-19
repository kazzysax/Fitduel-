// Game logic on the server: champions from stored training, workout validation,
// Duels between real players' champions, scheduled Rumbles, records and leaderboards.
// Every fight is simulated here with the shared engine; clients only replay it.

import { createHash, randomInt } from "node:crypto";

import { makeFakeField, type FakePlayer } from "../engine/fakeData.ts";
import { divisionFor, unlockedGear, type Equipped, type VenueId } from "../engine/league.ts";
import { computePayouts } from "../engine/payout.ts";
import { simulateRumble, type Standing } from "../engine/rumble.ts";
import { computeStats, overallRating, WINDOW_DAYS, type ActivityDay, type FighterStats } from "../engine/stats.ts";
import { tx, type DB } from "./db.ts";
import { HttpError } from "./http.ts";

export function utcDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return utcDate(d);
}

// Users live in every time zone, so "today" comes from the client, within a day of UTC.
export function clientToday(given: unknown): string {
  const server = utcDate();
  if (typeof given === "string" && /^\d{4}-\d{2}-\d{2}$/.test(given) && Math.abs(Date.parse(given) - Date.parse(server)) <= 86_400_000) {
    return given;
  }
  return server;
}

// ───── Champions ─────

export interface ChampSnapshot extends FakePlayer {
  userId: number | null; // null for house champions (bots)
  equipped: Equipped;
}

type ActivityRow = { date: string; steps: number; pushups: number; squats: number; active_minutes: number; run_km: number };

export function activityRows(db: DB, userId: number, from: string, to: string): ActivityRow[] {
  return db
    .prepare("SELECT date, steps, pushups, squats, active_minutes, run_km FROM activity WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date")
    .all(userId, from, to) as ActivityRow[];
}

export function statsFor(db: DB, userId: number, today: string): FighterStats {
  const rows = activityRows(db, userId, addDays(today, -(WINDOW_DAYS - 1)), today);
  const history: ActivityDay[] = rows.map((r) => ({
    date: r.date,
    steps: r.steps,
    pushups: r.pushups,
    squats: r.squats,
    activeMinutes: r.active_minutes,
    runKm: r.run_km,
  }));
  return computeStats(history, today);
}

export function champSnapshot(db: DB, userId: number, today: string): ChampSnapshot {
  const c = db.prepare("SELECT name, color, equipped FROM champs WHERE user_id = ?").get(userId) as { name: string; color: string; equipped: string } | undefined;
  if (!c) throw new HttpError(404, "Champion not found");
  const stats = statsFor(db, userId, today);
  return { id: `u${userId}`, userId, name: c.name, color: c.color, archetype: "Player", stats, rating: overallRating(stats), equipped: JSON.parse(c.equipped) };
}

function isActive(r: ActivityRow): boolean {
  return r.steps >= 5000 || r.pushups >= 10 || r.active_minutes >= 20;
}

export function streaks(db: DB, userId: number, today: string): { current: number; best: number } {
  const rows = activityRows(db, userId, "0000-00-00", today);
  const active = new Set(rows.filter(isActive).map((r) => r.date));
  let current = 0;
  let day = active.has(today) ? today : addDays(today, -1);
  while (active.has(day)) {
    current++;
    day = addDays(day, -1);
  }
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...active].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best };
}

export interface Record_ {
  duels: number;
  duelWins: number;
  rumbles: number;
  rumbleWins: number;
  bestRumblePlace: number | null;
  practiceWinningsCents: number;
}

export function recordFor(db: DB, userId: number): Record_ {
  const r = db
    .prepare(
      `SELECT
         SUM(f.mode = 'duel') AS duels,
         SUM(f.mode = 'duel' AND e.won) AS duelWins,
         SUM(f.mode = 'rumble') AS rumbles,
         SUM(f.mode = 'rumble' AND e.place = 1) AS rumbleWins,
         MIN(CASE WHEN f.mode = 'rumble' THEN e.place END) AS best,
         SUM(e.payout_cents) AS winnings
       FROM fight_entries e JOIN fights f ON f.id = e.fight_id WHERE e.user_id = ?`,
    )
    .get(userId) as Record<string, number | null>;
  return {
    duels: r.duels ?? 0,
    duelWins: r.duelWins ?? 0,
    rumbles: r.rumbles ?? 0,
    rumbleWins: r.rumbleWins ?? 0,
    bestRumblePlace: r.best ?? null,
    practiceWinningsCents: r.winnings ?? 0,
  };
}

export function unlockedFor(db: DB, userId: number, today: string): string[] {
  const rec = recordFor(db, userId);
  const { best } = streaks(db, userId, today);
  return unlockedGear({ duels: rec.duels, duelWins: rec.duelWins, rumbleWins: rec.rumbleWins, bestStreak: best, rating: champSnapshot(db, userId, today).rating });
}

// ───── Workouts and anti-cheat ─────

export const WORKOUT_KINDS = {
  pushups: { column: "pushups", perEntryMax: 300, perDayMax: 1000 },
  squats: { column: "squats", perEntryMax: 400, perDayMax: 1500 },
  steps: { column: "steps", perEntryMax: 60_000, perDayMax: 100_000 },
  run: { column: "run_km", perEntryMax: 100, perDayMax: 120 },
  active: { column: "active_minutes", perEntryMax: 600, perDayMax: 1440 },
} as const;
export type WorkoutKind = keyof typeof WORKOUT_KINDS;
const SOURCES = ["camera", "manual", "tracker"] as const;
const MAX_CAMERA_REPS_PER_SECOND = 1.5;

export interface WorkoutInput {
  kind: WorkoutKind;
  amount: number;
  source: (typeof SOURCES)[number];
  durationSec?: number;
  date: string;
}

export function parseWorkout(body: unknown, today: string): WorkoutInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.kind !== "string" || !(b.kind in WORKOUT_KINDS)) throw new HttpError(400, "Unknown activity");
  if (typeof b.source !== "string" || !SOURCES.includes(b.source as never)) throw new HttpError(400, "Unknown source");
  const amount = Number(b.amount);
  const limits = WORKOUT_KINDS[b.kind as WorkoutKind];
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "Amount must be more than zero");
  if (amount > limits.perEntryMax) throw new HttpError(422, `That's more than one session allows (max ${limits.perEntryMax})`);
  const durationSec = b.durationSec === undefined ? undefined : Number(b.durationSec);
  return { kind: b.kind as WorkoutKind, amount: Math.round(amount * 10) / 10, source: b.source as WorkoutInput["source"], durationSec, date: today };
}

export function logWorkout(db: DB, userId: number, w: WorkoutInput): { id: number; flagged: string | null } {
  const limits = WORKOUT_KINDS[w.kind];
  const col = limits.column;
  return tx(db, () => {
    db.prepare("INSERT OR IGNORE INTO activity (user_id, date) VALUES (?, ?)").run(userId, w.date);
    const current = (db.prepare(`SELECT ${col} AS v FROM activity WHERE user_id = ? AND date = ?`).get(userId, w.date) as { v: number }).v;
    if (current + w.amount > limits.perDayMax) throw new HttpError(422, "That's more than is physically plausible for one day");

    // Flags don't block the workout; they keep it out of cash events and mark it for review.
    let flagged: string | null = null;
    if (w.source === "manual") flagged = "manual";
    if (w.source === "camera" && (w.kind === "pushups" || w.kind === "squats")) {
      if (!w.durationSec || w.durationSec <= 0) flagged = "camera-no-duration";
      else if (w.amount / w.durationSec > MAX_CAMERA_REPS_PER_SECOND) flagged = "camera-too-fast";
    }

    db.prepare(`UPDATE activity SET ${col} = ${col} + ? WHERE user_id = ? AND date = ?`).run(w.amount, userId, w.date);
    if (w.kind === "pushups" || w.kind === "squats") {
      // Rep sets also count as active time (about 3 seconds a rep).
      db.prepare("UPDATE activity SET active_minutes = MIN(1440, active_minutes + ?) WHERE user_id = ? AND date = ?").run(Math.round((w.amount * 3) / 60), userId, w.date);
    }
    const res = db
      .prepare("INSERT INTO workouts (user_id, time, date, kind, amount, source, flagged) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(userId, new Date().toISOString(), w.date, w.kind, w.amount, w.source, flagged);
    return { id: Number(res.lastInsertRowid), flagged };
  });
}

// ───── Fights ─────

function notify(db: DB, userId: number, kind: string, body: string, fightId: number | null): void {
  db.prepare("INSERT INTO notifications (user_id, created_at, kind, body, fight_id) VALUES (?, ?, ?, ?, ?)").run(userId, new Date().toISOString(), kind, body, fightId);
}

function saveFight(
  db: DB,
  f: { mode: "duel" | "rumble"; seed: number; venue: VenueId; title: string; fighters: ChampSnapshot[]; standings: Standing[]; rumbleId?: number; payouts?: number[] },
): number {
  const res = db
    .prepare("INSERT INTO fights (mode, seed, created_at, venue, title, fighters, standings, rumble_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(f.mode, f.seed, new Date().toISOString(), f.venue, f.title, JSON.stringify(f.fighters), JSON.stringify(f.standings), f.rumbleId ?? null);
  const fightId = Number(res.lastInsertRowid);
  for (const s of f.standings) {
    const fighter = f.fighters.find((x) => x.id === s.fighterId)!;
    if (fighter.userId === null) continue;
    db.prepare("INSERT INTO fight_entries (fight_id, user_id, place, field_size, won, payout_cents, rating_before) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      fightId,
      fighter.userId,
      s.place,
      f.fighters.length,
      s.place === 1 ? 1 : 0,
      f.payouts?.[s.place - 1] ?? 0,
      fighter.rating,
    );
  }
  return fightId;
}

function houseChamp(p: FakePlayer): ChampSnapshot {
  return { ...p, id: `h-${p.id}-${p.name.replace(/\s/g, "")}`, userId: null, equipped: {} };
}

export const DUEL_RING_SIZE = 10;
const DUEL_RATING_WINDOW = 8;
const DUELS_PER_HOUR = 40;

// A Duel is a ring of 10 champions at a similar level: yours plus up to nine other
// players' champions (they fight on their own, that is the point of an AI champion,
// and their owners are notified). House champions fill any empty places.
export function startDuel(db: DB, userId: number, today: string): { fightId: number } {
  const recent = db
    .prepare("SELECT COUNT(*) AS n FROM fight_entries e JOIN fights f ON f.id = e.fight_id WHERE e.user_id = ? AND f.mode = 'duel' AND f.created_at > ?")
    .get(userId, new Date(Date.now() - 3_600_000).toISOString()) as { n: number };
  if (recent.n >= DUELS_PER_HOUR) throw new HttpError(429, "Your champ needs a rest. Try again in a little while.");

  const me = champSnapshot(db, userId, today);
  const since = addDays(today, -14);
  const candidates = db
    .prepare("SELECT DISTINCT user_id FROM activity WHERE date >= ? AND user_id != ? AND user_id IN (SELECT user_id FROM champs) ORDER BY RANDOM() LIMIT 120")
    .all(since, userId) as { user_id: number }[];
  const players = candidates
    .map((c) => champSnapshot(db, c.user_id, today))
    .filter((c) => Math.abs(c.rating - me.rating) <= DUEL_RATING_WINDOW)
    .sort((a, b) => Math.abs(a.rating - me.rating) - Math.abs(b.rating - me.rating))
    .slice(0, DUEL_RING_SIZE - 1);

  const seed = randomInt(1, 2 ** 31 - 1);
  const house = makeFakeField(seed, DUEL_RING_SIZE * 6, today)
    .sort((a, b) => Math.abs(a.rating - me.rating) - Math.abs(b.rating - me.rating))
    .slice(0, DUEL_RING_SIZE - 1 - players.length)
    .map(houseChamp);

  const fighters = [me, ...players, ...house];
  const result = simulateRumble(fighters, seed);
  const avg = fighters.reduce((s, f) => s + f.rating, 0) / fighters.length;
  const venue = divisionFor(Math.round(avg)).venue;
  return tx(db, () => {
    const fightId = saveFight(db, { mode: "duel", seed, venue, title: `Duel · ring of ${fighters.length}`, fighters, standings: result.standings });
    for (const p of players) {
      const place = result.standings.find((s) => s.fighterId === p.id)!.place;
      notify(
        db,
        p.userId!,
        "duel",
        `${me.name} started a ring fight with your champ ${p.name}. ${place === 1 ? "Your champ won!" : `Your champ finished #${place} of ${fighters.length}.`}`,
        fightId,
      );
    }
    return { fightId };
  });
}

export function getFight(db: DB, fightId: number) {
  const f = db.prepare("SELECT * FROM fights WHERE id = ?").get(fightId) as
    | { id: number; mode: string; seed: number; created_at: string; venue: string; title: string; fighters: string; standings: string; rumble_id: number | null }
    | undefined;
  if (!f) throw new HttpError(404, "Fight not found");
  const fighters = (JSON.parse(f.fighters) as ChampSnapshot[]).map(({ userId: _u, ...rest }) => rest); // don't expose account ids
  let entryCents = 0;
  if (f.rumble_id) entryCents = (db.prepare("SELECT entry_cents FROM rumbles WHERE id = ?").get(f.rumble_id) as { entry_cents: number }).entry_cents;
  return { id: f.id, mode: f.mode, seed: f.seed, createdAt: f.created_at, venue: f.venue, title: f.title, fighters, standings: JSON.parse(f.standings), entryCents };
}

export function myFights(db: DB, userId: number, limit = 30) {
  return db
    .prepare(
      `SELECT f.id, f.mode, f.title, f.created_at AS createdAt, e.place, e.field_size AS fieldSize, e.won, e.payout_cents AS payoutCents
       FROM fight_entries e JOIN fights f ON f.id = e.fight_id WHERE e.user_id = ? ORDER BY f.created_at DESC LIMIT ?`,
    )
    .all(userId, limit);
}

export function liveFeed(db: DB, limit = 12) {
  const rows = db.prepare("SELECT id, mode, title, created_at AS createdAt, venue, fighters, standings FROM fights ORDER BY id DESC LIMIT ?").all(limit) as {
    id: number;
    mode: string;
    title: string;
    createdAt: string;
    venue: string;
    fighters: string;
    standings: string;
  }[];
  return rows.map(({ fighters, standings, ...r }) => {
    const list = JSON.parse(fighters) as ChampSnapshot[];
    const winnerId = (JSON.parse(standings) as Standing[])[0].fighterId;
    const w = list.find((f) => f.id === winnerId)!;
    return { ...r, fighters: list.length, winner: { name: w.name, color: w.color, rating: w.rating } };
  });
}

// ───── Rumbles ─────

const RUMBLE_FIELD = 30;
const RUMBLE_SCHEDULE = {
  daily: { hourUtc: 19, entryCents: 500 },
  weekly: { hourUtc: 18, entryCents: 2500, weekday: 0 }, // Sunday
};

function seedHash(seed: number): string {
  return createHash("sha256").update(`fitduel-rumble:${seed}`).digest("hex");
}

function nextStart(kind: "daily" | "weekly", now: Date): string {
  const s = RUMBLE_SCHEDULE[kind];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), s.hourUtc));
  if (kind === "weekly") d.setUTCDate(d.getUTCDate() + ((7 + RUMBLE_SCHEDULE.weekly.weekday - d.getUTCDay()) % 7));
  if (d <= now) d.setUTCDate(d.getUTCDate() + (kind === "weekly" ? 7 : 1));
  return d.toISOString();
}

// Keeps one open daily and one open weekly Rumble scheduled. The seed is drawn now and
// only its hash is published, so nobody (including us) can pick a seed after entries close.
export function ensureSchedule(db: DB, now = new Date()): void {
  for (const kind of ["daily", "weekly"] as const) {
    const open = db.prepare("SELECT id FROM rumbles WHERE kind = ? AND status = 'open'").get(kind);
    if (open) continue;
    const seed = randomInt(1, 2 ** 31 - 1);
    tx(db, () => {
      const res = db
        .prepare("INSERT OR IGNORE INTO rumbles (kind, starts_at, field_size, entry_cents, seed_hash, status) VALUES (?, ?, ?, ?, ?, 'open')")
        .run(kind, nextStart(kind, now), RUMBLE_FIELD, RUMBLE_SCHEDULE[kind].entryCents, seedHash(seed));
      if (res.changes) db.prepare("INSERT INTO rumble_secrets (rumble_id, seed) VALUES (?, ?)").run(res.lastInsertRowid, seed);
    });
  }
}

export function listRumbles(db: DB, userId: number | null) {
  const rows = db
    .prepare(
      `SELECT r.id, r.kind, r.starts_at AS startsAt, r.field_size AS fieldSize, r.entry_cents AS entryCents, r.seed_hash AS seedHash,
              r.seed, r.status, r.fight_id AS fightId,
              (SELECT COUNT(*) FROM rumble_entries x WHERE x.rumble_id = r.id) AS entered,
              EXISTS (SELECT 1 FROM rumble_entries x WHERE x.rumble_id = r.id AND x.user_id = ?) AS joined
       FROM rumbles r WHERE r.status = 'open' OR r.id IN (SELECT id FROM rumbles WHERE status = 'done' ORDER BY starts_at DESC LIMIT 4)
       ORDER BY r.status DESC, r.starts_at`,
    )
    .all(userId ?? -1) as Record<string, unknown>[];
  return rows.map((r) => ({ ...r, joined: !!r.joined, title: r.kind === "weekly" ? "Weekly Grand Rumble" : "Daily Rumble" }));
}

export function enterRumble(db: DB, userId: number, rumbleId: number): void {
  const r = db.prepare("SELECT status, starts_at, field_size FROM rumbles WHERE id = ?").get(rumbleId) as
    | { status: string; starts_at: string; field_size: number }
    | undefined;
  if (!r) throw new HttpError(404, "Rumble not found");
  if (r.status !== "open" || r.starts_at <= new Date().toISOString()) throw new HttpError(409, "Entries for this Rumble are closed");
  tx(db, () => {
    const n = (db.prepare("SELECT COUNT(*) AS n FROM rumble_entries WHERE rumble_id = ?").get(rumbleId) as { n: number }).n;
    if (n >= r.field_size) throw new HttpError(409, "This Rumble is full");
    db.prepare("INSERT OR IGNORE INTO rumble_entries (rumble_id, user_id, entered_at) VALUES (?, ?, ?)").run(rumbleId, userId, new Date().toISOString());
  });
}

export function leaveRumble(db: DB, userId: number, rumbleId: number): void {
  const r = db.prepare("SELECT status FROM rumbles WHERE id = ?").get(rumbleId) as { status: string } | undefined;
  if (!r || r.status !== "open") throw new HttpError(409, "Entries for this Rumble are closed");
  db.prepare("DELETE FROM rumble_entries WHERE rumble_id = ? AND user_id = ?").run(rumbleId, userId);
}

// Runs every Rumble whose start time has passed. Entrants' stats are snapshotted now.
// Rumbles are free while real-money pools are not live, so house champions near the
// entrants' level fill empty places (spec R4: never in cash Rumbles).
export function runDueRumbles(db: DB, now = new Date()): number[] {
  const due = db.prepare("SELECT id, kind, field_size, entry_cents FROM rumbles WHERE status = 'open' AND starts_at <= ?").all(now.toISOString()) as {
    id: number;
    kind: "daily" | "weekly";
    field_size: number;
    entry_cents: number;
  }[];
  const ran: number[] = [];
  for (const r of due) {
    const seed = (db.prepare("SELECT seed FROM rumble_secrets WHERE rumble_id = ?").get(r.id) as { seed: number }).seed;
    const today = utcDate(now);
    const entrants = (db.prepare("SELECT user_id FROM rumble_entries WHERE rumble_id = ? ORDER BY entered_at").all(r.id) as { user_id: number }[]).map((e) =>
      champSnapshot(db, e.user_id, today),
    );
    if (entrants.length === 0) {
      db.prepare("UPDATE rumbles SET status = 'done', seed = ? WHERE id = ?").run(seed, r.id);
      continue;
    }
    const avg = entrants.reduce((s, e) => s + e.rating, 0) / entrants.length;
    const house = makeFakeField(seed, r.field_size * 4, today)
      .sort((a, b) => Math.abs(a.rating - avg) - Math.abs(b.rating - avg))
      .slice(0, r.field_size - entrants.length)
      .map(houseChamp);
    const fighters = [...entrants, ...house];
    const result = simulateRumble(fighters, seed);
    const payouts = computePayouts(fighters.length, r.entry_cents);
    const title = r.kind === "weekly" ? "Weekly Grand Rumble" : "Daily Rumble";
    tx(db, () => {
      const fightId = saveFight(db, {
        mode: "rumble",
        seed,
        venue: r.kind === "weekly" ? "colosseum" : divisionFor(Math.round(avg)).venue,
        title,
        fighters,
        standings: result.standings,
        rumbleId: r.id,
        payouts,
      });
      db.prepare("UPDATE rumbles SET status = 'done', seed = ?, fight_id = ? WHERE id = ?").run(seed, fightId, r.id);
      for (const e of entrants) {
        const s = result.standings.find((x) => x.fighterId === e.id)!;
        notify(db, e.userId!, "rumble", `${title} is over: your champ ${e.name} finished #${s.place} of ${fighters.length}. Watch the replay.`, fightId);
      }
    });
    ran.push(r.id);
  }
  if (ran.length) ensureSchedule(db, now);
  return ran;
}

export function verifyRumbleSeed(seed: number, hash: string): boolean {
  return seedHash(seed) === hash;
}

// ───── Leaderboard ─────

export function leaderboard(db: DB, today: string, limit = 50) {
  const since = addDays(today, -(WINDOW_DAYS - 1));
  const users = db.prepare("SELECT DISTINCT user_id FROM activity WHERE date >= ? AND user_id IN (SELECT user_id FROM champs)").all(since) as { user_id: number }[];
  return users
    .map(({ user_id }) => {
      const c = champSnapshot(db, user_id, today);
      const rec = recordFor(db, user_id);
      return { name: c.name, color: c.color, rating: c.rating, division: divisionFor(c.rating).name, duelWins: rec.duelWins, duels: rec.duels, userId: user_id };
    })
    .sort((a, b) => b.rating - a.rating || b.duelWins - a.duelWins)
    .slice(0, limit);
}
