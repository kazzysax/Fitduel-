// FitDuel API. All responses are JSON; authenticated routes take "Authorization: Bearer <token>".

import { createServer, type Server } from "node:http";

import { GEAR, validEquip, type Equipped } from "../engine/league.ts";
import { createSession, deleteSession, EMAIL_RE, hashPassword, RateLimiter, userForToken, verifyPassword } from "./auth.ts";
import { tx, type DB } from "./db.ts";
import {
  activityRows,
  addDays,
  champSnapshot,
  clientToday,
  enterRumble,
  ensureSchedule,
  getFight,
  leaderboard,
  leaveRumble,
  listRumbles,
  liveFeed,
  logWorkout,
  myFights,
  parseWorkout,
  recordFor,
  runDueRumbles,
  startDuel,
  streaks,
  unlockedFor,
} from "./game.ts";
import { createHandler, HttpError, Router, type Ctx } from "./http.ts";
import { divisionFor } from "../engine/league.ts";

const COLOR_RE = /^#[0-9a-f]{6}$/i;

function str(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== "string") throw new HttpError(400, `${field} is required`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `${field} must be ${min}–${max} characters`);
  return s;
}

function champName(v: unknown): string {
  const name = str(v, "Champion name", 2, 18);
  if (!/^[\p{L}\p{N} '._-]+$/u.test(name)) throw new HttpError(400, "Champion name can use letters, numbers, spaces and . _ - '");
  return name;
}

export interface AppOptions {
  staticDir?: string | null;
  authAttempts?: number; // per client per 15 minutes
}

export function createApp(db: DB, opts: AppOptions = {}): Server {
  const authLimiter = new RateLimiter(opts.authAttempts ?? 10, 15 * 60_000);
  const router = new Router();

  const requireUser = (ctx: Ctx): number => {
    const id = userForToken(db, ctx.token);
    if (id === null) throw new HttpError(401, "Please log in");
    return id;
  };
  const today = (ctx: Ctx) => clientToday(ctx.url.searchParams.get("today") ?? (ctx.body as { today?: string } | undefined)?.today);

  // ───── Accounts ─────
  router.on("POST", "/api/auth/signup", (ctx) => {
    if (!authLimiter.allow(`signup:${ctx.ip}`)) throw new HttpError(429, "Too many attempts. Try again later.");
    const b = (ctx.body ?? {}) as Record<string, unknown>;
    const email = str(b.email, "Email", 3, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address");
    const password = str(b.password, "Password", 8, 200);
    const name = champName(b.champName);
    const color = typeof b.color === "string" && COLOR_RE.test(b.color) ? b.color : "#ffd60a";
    const userId = tx(db, () => {
      if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new HttpError(409, "An account with this email already exists");
      const res = db.prepare("INSERT INTO users (email, pass_hash, created_at) VALUES (?, ?, ?)").run(email, hashPassword(password), new Date().toISOString());
      const id = Number(res.lastInsertRowid);
      db.prepare("INSERT INTO champs (user_id, name, color) VALUES (?, ?, ?)").run(id, name, color);
      return id;
    });
    return { token: createSession(db, userId) };
  });

  router.on("POST", "/api/auth/login", (ctx) => {
    const b = (ctx.body ?? {}) as Record<string, unknown>;
    const email = str(b.email, "Email", 3, 254).toLowerCase();
    if (!authLimiter.allow(`login:${ctx.ip}:${email}`)) throw new HttpError(429, "Too many attempts. Try again later.");
    const password = str(b.password, "Password", 1, 200);
    const user = db.prepare("SELECT id, pass_hash FROM users WHERE email = ?").get(email) as { id: number; pass_hash: string } | undefined;
    if (!user || !verifyPassword(password, user.pass_hash)) throw new HttpError(401, "Wrong email or password");
    return { token: createSession(db, user.id) };
  });

  router.on("POST", "/api/auth/logout", (ctx) => {
    if (ctx.token) deleteSession(db, ctx.token);
  });

  router.on("DELETE", "/api/me", (ctx) => {
    const userId = requireUser(ctx);
    const b = (ctx.body ?? {}) as Record<string, unknown>;
    const user = db.prepare("SELECT pass_hash FROM users WHERE id = ?").get(userId) as { pass_hash: string };
    if (typeof b.password !== "string" || !verifyPassword(b.password, user.pass_hash)) throw new HttpError(401, "Password is incorrect");
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  });

  // ───── Profile ─────
  router.on("GET", "/api/me", (ctx) => {
    const userId = requireUser(ctx);
    const t = today(ctx);
    const user = db.prepare("SELECT email, goals, onboarded, created_at FROM users WHERE id = ?").get(userId) as {
      email: string;
      goals: string;
      onboarded: number;
      created_at: string;
    };
    const champ = champSnapshot(db, userId, t);
    const unread = (db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0").get(userId) as { n: number }).n;
    return {
      email: user.email,
      createdAt: user.created_at,
      goals: JSON.parse(user.goals),
      onboarded: !!user.onboarded,
      champ: { id: champ.id, name: champ.name, color: champ.color, equipped: champ.equipped, stats: champ.stats, rating: champ.rating, division: divisionFor(champ.rating).name },
      streak: streaks(db, userId, t),
      record: recordFor(db, userId),
      unlocked: unlockedFor(db, userId, t),
      unread,
    };
  });

  router.on("PUT", "/api/me", (ctx) => {
    const userId = requireUser(ctx);
    const b = (ctx.body ?? {}) as Record<string, unknown>;
    tx(db, () => {
      if (b.goals !== undefined) {
        const g = b.goals as Record<string, unknown>;
        const goals = { steps: Number(g.steps), reps: Number(g.reps), activeMinutes: Number(g.activeMinutes) };
        if (!(goals.steps >= 1000 && goals.steps <= 50000 && goals.reps >= 10 && goals.reps <= 1000 && goals.activeMinutes >= 5 && goals.activeMinutes <= 300)) {
          throw new HttpError(400, "Goals are out of range");
        }
        db.prepare("UPDATE users SET goals = ? WHERE id = ?").run(JSON.stringify(goals), userId);
      }
      if (b.onboarded === true) db.prepare("UPDATE users SET onboarded = 1 WHERE id = ?").run(userId);
    });
  });

  router.on("PUT", "/api/champ", (ctx) => {
    const userId = requireUser(ctx);
    const b = (ctx.body ?? {}) as Record<string, unknown>;
    tx(db, () => {
      if (b.name !== undefined) db.prepare("UPDATE champs SET name = ? WHERE user_id = ?").run(champName(b.name), userId);
      if (b.color !== undefined) {
        if (typeof b.color !== "string" || !COLOR_RE.test(b.color)) throw new HttpError(400, "Colour must be a hex colour");
        db.prepare("UPDATE champs SET color = ? WHERE user_id = ?").run(b.color, userId);
      }
      if (b.equipped !== undefined) {
        const equipped = b.equipped as Equipped;
        if (typeof equipped !== "object" || equipped === null) throw new HttpError(400, "Invalid gear");
        if (!validEquip(equipped, unlockedFor(db, userId, today(ctx)))) throw new HttpError(403, "That gear isn't unlocked yet");
        db.prepare("UPDATE champs SET equipped = ? WHERE user_id = ?").run(JSON.stringify(equipped), userId);
      }
    });
  });

  router.on("GET", "/api/gear", () => GEAR);

  // ───── Training ─────
  router.on("GET", "/api/activity", (ctx) => {
    const userId = requireUser(ctx);
    const t = today(ctx);
    const days = Math.min(365, Math.max(1, Number(ctx.url.searchParams.get("days") ?? 28)));
    const rows = activityRows(db, userId, addDays(t, -(days - 1)), t);
    const workouts = db
      .prepare("SELECT id, time, date, kind, amount, source, flagged FROM workouts WHERE user_id = ? ORDER BY time DESC LIMIT 50")
      .all(userId);
    const bests = db
      .prepare("SELECT MAX(steps) AS steps, MAX(pushups) AS pushups, MAX(squats) AS squats FROM activity WHERE user_id = ?")
      .get(userId);
    return {
      today: t,
      log: Object.fromEntries(rows.map((r) => [r.date, { steps: r.steps, pushups: r.pushups, squats: r.squats, activeMinutes: r.active_minutes, runKm: r.run_km }])),
      workouts,
      bests,
    };
  });

  router.on("POST", "/api/workouts", (ctx) => {
    const userId = requireUser(ctx);
    return logWorkout(db, userId, parseWorkout(ctx.body, today(ctx)));
  });

  // ───── Battleground ─────
  router.on("POST", "/api/duels", (ctx) => startDuel(db, requireUser(ctx), today(ctx)));

  router.on("GET", "/api/fights/mine", (ctx) => myFights(db, requireUser(ctx)));

  router.on("GET", "/api/fights/:id", (ctx) => {
    requireUser(ctx);
    return getFight(db, Number(ctx.params.id));
  });

  router.on("GET", "/api/live", (ctx) => {
    requireUser(ctx);
    return liveFeed(db);
  });

  router.on("GET", "/api/rumbles", (ctx) => {
    const userId = requireUser(ctx);
    ensureSchedule(db);
    return listRumbles(db, userId);
  });

  router.on("POST", "/api/rumbles/:id/enter", (ctx) => {
    enterRumble(db, requireUser(ctx), Number(ctx.params.id));
  });

  router.on("POST", "/api/rumbles/:id/leave", (ctx) => {
    leaveRumble(db, requireUser(ctx), Number(ctx.params.id));
  });

  router.on("GET", "/api/leaderboard", (ctx) => {
    const userId = requireUser(ctx);
    return leaderboard(db, today(ctx)).map(({ userId: id, ...row }, i) => ({ ...row, rank: i + 1, me: id === userId }));
  });

  // ───── Notifications ─────
  router.on("GET", "/api/notifications", (ctx) => {
    const userId = requireUser(ctx);
    return db
      .prepare("SELECT id, created_at AS createdAt, kind, body, fight_id AS fightId, read FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50")
      .all(userId);
  });

  router.on("POST", "/api/notifications/read", (ctx) => {
    db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(requireUser(ctx));
  });

  router.on("GET", "/api/health", () => ({ ok: true }));

  // Lets tests and admins trigger due Rumbles without waiting for the scheduler.
  router.on("POST", "/api/admin/run-rumbles", (ctx) => {
    const key = process.env.FITDUEL_ADMIN_KEY;
    if (!key || ctx.req.headers["x-admin-key"] !== key) throw new HttpError(404, "Not found");
    return { ran: runDueRumbles(db) };
  });

  return createServer(createHandler(router, opts.staticDir ?? null));
}

// Runs due Rumbles and keeps the schedule topped up.
export function startScheduler(db: DB, everyMs = 30_000): () => void {
  const tick = () => {
    try {
      ensureSchedule(db);
      runDueRumbles(db);
    } catch (e) {
      console.error("scheduler", e);
    }
  };
  tick();
  const id = setInterval(tick, everyMs);
  return () => clearInterval(id);
}
