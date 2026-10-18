# FitDuel

**A fitness app first.** Track your workouts, steps and progress every day. Your training builds your AI champion, a blocky brick boxer. In the **Battleground** your champion fights other players' champions in Duels and Rumbles, and you watch every fight in 3D.

See [`SPEC.md`](SPEC.md) for the full product spec.

## What works

**Accounts and onboarding.** Sign up with email and password, name and colour your champion, pick daily goals.

| Tab | What you can do |
|---|---|
| **Today** | Activity rings for steps, reps and active minutes against your goals. Streak, quick-start buttons, your 3D champ and what today's training added. Notifications (🔔) when your champ fights |
| **Train** | **Camera push-up and squat counter** (pose detection on the device; video never leaves the phone). Log steps, runs and active time. Workout history |
| **Progress** | 7/14/28-day charts for steps and reps, your champ's rating over time, totals and personal bests |
| **Battle** | **Duels** against other players' champions at your level. Latest fights to watch. **Daily and weekly Rumbles** you enter; they run automatically. Leaderboard, your fight history |
| **Champ** | 3D champion, stats and which exercise builds each, division progress, **Locker Room** gear you unlock, name and colour, goals, account |

It installs as a phone app (PWA): add it to your home screen, and it opens full-screen with an offline shell.

## How it works

```
 Phone (PWA)                         Server (one Node process)                SQLite
 ───────────                         ─────────────────────────                ──────
 Camera rep counter ─┐               API: accounts, workouts, champs ───────► users, activity,
 Training, charts    ├── HTTPS ───►  Duels: matchmaking + simulation          workouts, champs,
 3D arena replays  ◄─┘               Rumble scheduler (every 30 s)            fights, rumbles,
                                     Serves the built web app                 notifications
```

- **Every fight is simulated on the server** with the shared engine (`engine/rumble.ts`). The app gets the fighters and the seed, and replays the exact same fight in 3D. Clients can't fake results.
- **Duels** match your champion with another player's champion within 8 rating points, with house champions as a fallback. The other player is notified ("X challenged your champ…").
- **Rumbles** are scheduled automatically: daily at 19:00 UTC and weekly on Sunday at 18:00 UTC.
  - The random seed is drawn when a Rumble is created, and only its SHA-256 fingerprint is shown.
  - After the fight the seed is revealed, so anyone can check that it matches and re-run the fight.
  - While cash pools aren't live, Rumbles are free and house champions fill empty places.
- **Anti-cheat:**
  - Per-session and per-day limits reject impossible numbers.
  - Manual entries, and camera sets that are too fast or have no duration, are flagged. Flagged sets still count for free play but would be excluded from cash events.
  - Login and sign-up attempts are rate-limited.
- **Security:**
  - Passwords are hashed with scrypt.
  - Sessions are random tokens, and only their hashes are stored.
  - Account ids never reach other players.
  - Players can delete their own account.

| Code | Purpose |
|---|---|
| `engine/` | Shared rules: stats from training, rep counting, fight simulation, payouts, divisions and gear |
| `server/` | API, database, matchmaking, Rumble scheduler (no framework, Node built-ins only) |
| `web/` | The app: React, Three.js (React Three Fiber), MediaPipe Pose |

## Run it

Requires Node.js 22.18 or newer.

```bash
npm test                      # engine + API tests

# Development: two terminals
npm run server                # API on http://localhost:8787 (data in ./data/fitduel.db)
npm run dev                   # app on the printed URL, /api is proxied to the server

# Production-style: build the app and serve everything from the server
cd web && npm install && cd ..
npm start                     # http://localhost:8787
```

Server settings (environment variables):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | HTTP port |
| `DATABASE_PATH` | `./data/fitduel.db` | SQLite file. Put it on a persistent disk |
| `WEB_DIST` | `web/dist` | Built app to serve; empty serves the API only |
| `FITDUEL_ADMIN_KEY` | unset | Enables `POST /api/admin/run-rumbles` with header `x-admin-key` |

### Deploy

```bash
docker build -t fitduel .
docker run -p 8787:8787 -v fitduel-data:/data fitduel
```

Run it behind HTTPS: browsers only allow the camera, and only install the app, on secure pages. Any host that runs a container with a persistent disk works (Fly.io, Railway, Render, a VPS). It needs one long-running instance because the Rumble scheduler runs inside the server.

## Not built yet (needs your decisions or accounts)

| Item | What's needed |
|---|---|
| **Real-money pools** | Legal review per country, a licensed payments and payouts provider, ID checks (KYC), location checks. Prize amounts are shown as "practice" until then |
| **Fitness tracker sync** (Fitbit, Garmin, Strava, Apple Health) | Developer accounts and API keys, or an aggregator such as Terra. Apple Health needs a native wrapper app |
| **Push notifications to the lock screen** | Notification keys (VAPID) and an HTTPS deployment. In-app notifications work now |
| **Final art** | Your UI references for the screens, and a Blender character kit to replace the placeholder fighters (same parts and pivots) |
| **Email** (password reset, verification) | An email provider account |
