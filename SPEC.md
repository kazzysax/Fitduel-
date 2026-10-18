# FitDuel — Product Spec (draft v0.3)

> **A fitness app first.** Track your workouts, steps and progress every day. Your training builds your AI champion. In the **Battleground** you watch AI champions fight in Duels and Rumbles, join in, and see your own champ fight.

Status: **draft for discussion**. Section 10 lists recommendations waiting for sign-off.

---

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Product focus | **Fitness app first.** Most time is spent tracking and training; the Battleground is the reward and one tab of the app |
| Platform | **Web app** (installable PWA) that works on iPhone, Android and desktop browsers |
| Visuals | **3D, blocky toy-brick style** (an original design inspired by brick minifigures). Built in **Blender**, rendered in the browser |
| Push-up tracking | Counted by the **camera**, with pose detection running in the browser |
| Fighter AI | Game AI that runs on our servers. Fights are deterministic and replayable from a seed (no language model controls moves) |
| Duels | **Fully automatic and in the background.** Players get a result plus an automatic replay scene |
| Format | **Duels** (1 vs 1) and **Rumbles** (many fighters in one ring, last one standing, like a WWE Royal Rumble) |
| Entry | Players choose which Rumble to enter and pay an entry stake into the pool |
| Schedule | **Daily** and **weekly** Rumbles |
| Payout | The top finishers share the pool by score |
| Platform fee | **None.** 100% of stakes go to the pool. Revenue comes from cosmetics and the FitDuel Pass (R2) |
| Matchmaking | **Divisions** by fighter level, so beginners face beginners |
| Launch | **Worldwide** (see section 8 for how cash pools work country by country) |

---

## 2. App structure and core loop

### 2.1 Core loop
1. **Track:** log workouts, count push-ups and squats with the camera, sync steps and runs.
2. **Progress:** see your streaks, goals and history like any good fitness app.
3. **Build your champ:** your training turns into your AI champion's stats.
4. **Battleground:** watch champions fight, join a Duel or Rumble, and see your champ fight.
5. **Win and come back:** results and rewards push you to train again. Stats fade without training.

### 2.2 Tabs (bottom navigation on phones)

| Tab | Purpose | Main content |
|---|---|---|
| **Today** (home) | Daily fitness dashboard | Activity rings (steps, reps, active minutes), streak, today's goals, quick "Start workout" button, your champ's level-up progress |
| **Train** | Do and log workouts | Camera rep counter (push-ups, squats), guided workouts, run/walk sync from trackers, workout history |
| **Progress** | Fitness tracking over time | Weekly and monthly charts, personal bests, body stats (optional), achievements |
| **Battleground** | Where the champions fight | Live and upcoming fights, Duels, Rumbles, your champ's fights and replays |
| **Champ** | Your AI champion | 3D champ, stats and how training raised them, fight record, Locker Room (cosmetics) |

### 2.3 The Battleground
- **Live now:** a feed of fights happening or just finished. Tap any fight to watch it in the 3D arena.
- **Duels (1 vs 1):** quick fights between two champions.
  - **Join:** put your champ in the Duel queue; you're matched with a champion of similar level in your division.
  - **Challenge a friend:** send a Duel link.
  - Duels run fast (about 30–60 seconds) and can be watched straight away.
- **Rumbles:** the scheduled daily and weekly many-fighter events (section 4), with pools.
- **My champ's fights:** notifications when your champ's fight starts or ends ("Your champ is in the ring now — watch"), then a replay with highlights.
- **Spectating:** anyone can watch any public fight, follow top champions, and see division leaderboards.
- **Arenas by division:** Garage Gym (Rookie), Street Rooftop (Contender), City Arena (Pro), Brick Colosseum (Champion), Grand Arena (weekly finals). Arenas change only how fights look, never the result.

## 3. Training → fighter stats

| Real activity | Source | Stat | In the ring |
|---|---|---|---|
| Push-ups | Camera (verified) | **Power** | Punch damage |
| Squats | Camera (verified) | **Defense** | Block strength |
| Steps | Health data / wearable | **Stamina** | Energy pool, lasting power |
| Running / cardio | Health data / wearable | **Speed** | Dodging, attack rate |
| Training on many days | All sources | **Technique** | Smarter decisions, picking targets, critical hits |

**Rules**
- **Diminishing returns.** Early reps are worth the most, which keeps the game fair and doesn't reward overtraining.
- **Daily caps.** Anything above a plausible daily amount earns nothing. This is a safety rule and an anti-cheat rule.
- **Recent training counts most.** Stats use the last 28 days, with older days counting less (10-day half-life).
- **Consistency beats one big session.** Technique rewards training often.
- **Camera-verified reps count more** than reps typed in by hand (typed reps may not count at all in cash Rumbles).
- **Stats lock at entry close.** Training after a Rumble's entry cutoff counts toward the next one.

---

## 4. The Rumble

### 4.1 Format
- **8–30 fighters per ring** (see R4 for unfilled Rumbles). Bigger events are split into heats; heat winners advance to a final.
  - **Daily Rumble:** one round of rings, finished the same day.
  - **Weekly Rumble:** heats during the week, then a final on the weekend.
- Every fighter starts in the ring together. Each tick, a fighter chooses a target and an action (punch, guard, dodge, rest).
  - Higher technique means better target choice, such as finishing off weak opponents or avoiding being ganged up on.
- When a fighter's HP reaches 0 it is **eliminated**. The last fighter standing wins.
- There's a time limit. If several fighters are still standing when it runs out, score decides the order.

### 4.2 Scoring
Paying only for time survived would punish strong fighters that knock opponents out quickly, so score combines three things:

```
score = survival_points + damage_points + elimination_bonus
```

- **Survival:** points for every second still in the ring.
- **Damage:** points for damage dealt.
- **Eliminations:** a bonus for each knockout.

Exact weights get tuned in testing.

### 4.3 Payout (no platform fee)
- **100% of the entry stakes** go to the pool.
- **Top 20%** of finishers are paid on a published payout table (see R3).
- Payouts are held until anti-cheat review passes (section 6).

### 4.4 Divisions
- Fighters are grouped by **overall rating** into divisions (e.g. Rookie, Contender, Pro, Champion).
- A multiplayer skill rating (OpenSkill, a free-for-all version of Elo) moves you up and down based on where you place.
- You can only enter Rumbles in your own division, which stops veterans from farming new players.

### 4.5 Fairness
- Randomness is kept **low**. Training should decide most of the outcome, which matters for fairness and for skill-contest legal status (section 8).
- **How training wins fights** (Phase 0 tuning, `engine/rumble.ts`):
  - HP = 60 + 0.35 × Defense + 0.25 × Stamina.
  - Punch damage scales from 0.3× to 1.5× with Power.
  - Dodge chance rises with Speed.
  - Technique makes fighters pick winnable fights, slip out of pile-ons, and make fewer sloppy moves.
- **Measured over 150 simulated 30-fighter Rumbles** of fake players:
  - Rank correlation between fitness rating and finishing place: 0.76.
  - The best-trained group (All-Rounders) finished in the paid top 20% in 80% of Rumbles.
  - Untrained players finished in the paid places in 0%.
- The random seed for each Rumble is **committed before entry closes** (we publish its hash) and revealed afterwards, so anyone can re-run the fight and check the result.

---

## 5. Watching fights (3D)
- Fights run on the server in milliseconds. The "scene" is a **3D replay** rebuilt in the browser from the stored seed and the fighters, so we never stream video.
- Players get a notification ("Your fighter finished 3rd of 30, you won X"), then watch the replay with highlights: knockouts, comebacks, their fighter's best moments.

### 5.1 Art style: blocky toy-brick fighters
- Chunky, blocky characters with snap-on parts: head, torso, arms, boxing-glove hands, hips, legs.
- **Must be our own design, not LEGO's.** The LEGO name and the exact minifigure shape are protected trademarks. We take the *feel* (blocky, modular, playful) and give it our own proportions and details, such as a square jaw, chunky gloves and our own head shape.
- **Why this style fits FitDuel:**
  - **Very cheap to render.** Each part is a rigid low-poly piece (about 1–2k triangles per fighter). No skin deformation is needed, so **30 fighters run smoothly on phones**.
  - **Modular customization.** Every part is swappable (helmets, hair, masks, torso prints, gloves, shorts, boots), which makes it a natural cosmetics shop.
  - **Fun knockouts that stay family-friendly.** A KO'd fighter pops apart into pieces and bricks scatter across the ring. Impactful but not violent, which helps with age ratings and app-store or web policies.
  - **Easy to animate.** It's a simple rig of pivots. A slightly choppy "brick film" animation style looks intentional and is quick to make.

### 5.2 3D pipeline
```
Blender (model parts, pivot rig, animate) → export glTF/GLB → compress (meshopt + KTX2 textures)
  → loaded by Three.js (React Three Fiber) in the web app → driven by the replay event stream
```
- **One shared rig.** Every part attaches to the same pivots, so every animation works on every fighter and every cosmetic.
- **Animation clips made in Blender:**
  - Combat: idle bounce, step, jab, hook, uppercut, guard, dodge, hit reaction, stagger, KO burst.
  - Ceremony: ring entrance and victory pose.
- **Arena:** a brick-built ring with ropes and lights. The crowd is instanced brick fans that cheer on big hits.
- **Training shows on your fighter:**
  - Glove material by Power: plastic, then metallic, then gold.
  - Belt tier by division.
  - Torso print by streak length.
  - Aura effect at high rating.
- **Camera:** an automatic director that follows the action, cuts to knockouts, and keeps the player's own fighter in view.

## 6. Anti-cheat (critical, because money is at stake)
- **Camera reps:** pose detection checks full range of motion, pace and body position. Only rep counts plus a signed check summary are sent; no video is uploaded.
- **Steps and cardio:** cross-check heart rate and GPS where available, and flag patterns that don't look human (for example, phone shaking).
- **Limits:** daily caps plus flags for sudden jumps.
- **Payout holds:** winnings are held for a short review window; flagged accounts are reviewed before payout.
- **One fighter per verified person** (identity check before any cash payout).

---

## 7. Technical architecture

```
 Web app (PWA)                     Backend                          Data
 ─────────────                     ───────                          ────
 Camera rep counter ──┐
 (pose model in       │      ┌──────────────────┐            ┌────────────┐
  the browser)        ├────► │ API               │ ─────────► │ Postgres   │
 Health/wearable sync │      │ accounts, stats,  │            │ users,     │
 Rumble lobby & entry │      │ entries, wallet   │            │ activity,  │
 Replay viewer        │      └────────┬─────────┘            │ rumbles,   │
                      │               │ jobs                  │ results    │
                      │      ┌────────▼─────────┐            └────────────┘
                      │      │ Rumble scheduler  │ ─► Redis queue
                      │      └────────┬─────────┘
                      │      ┌────────▼─────────┐
                      └───── │ Simulation        │  deterministic, pure CPU,
            results/replays  │ workers (N)       │  scale by adding workers
                             └──────────────────┘
 Payments: licensed payment / payout provider with ID checks and location rules
```

- **Frontend:** React or Next.js, built as a PWA, with Three.js (React Three Fiber) for 3D. Pose detection in the browser with MediaPipe or TensorFlow.js.
- **Backend:** TypeScript on Node.js, Postgres, Redis.
- **Simulation:** a pure, seeded engine. One ring of 30 fighters takes milliseconds, so **one server can run thousands of Rumbles**.
  - Replays are stored as `{seed, fighter snapshots}`, only a few KB each.
- **Scaling path:**
  1. **First version:** one API and one worker.
  2. **Growth:** separate scheduler and worker pool, plus read replicas.
  3. **Large scale:** regional deployments, sharded Rumbles, and a CDN for replay assets.
- **Later:** fighter AI trained by self-play using the same Policy interface, so fighters develop styles.

---

## 8. Worldwide launch and real-money pools
- The app and **free Rumbles** (points, badges, prizes) launch **worldwide**.
- **Cash Rumbles** turn on **country by country** (and state by state in the US), only where paid skill contests are allowed. This needs:
  - a gaming or skill-contest legal review,
  - age 18+ checks,
  - ID checks before payouts,
  - location blocking,
  - responsible-play limits (deposit and entry caps, self-exclusion).
- Low randomness (section 4.5) supports the case that FitDuel is a skill contest, not gambling.

---

## 9. Roadmap

| Phase | Scope |
|---|---|
| **0. Prototype** ✅ | Stats engine, Rumble simulation, 3D replay with placeholder blocky fighters built in code, fake data |
| **0.5 App prototype** ✅ | All five tabs working in the browser with local data: Today dashboard, camera push-up and squat counter, Progress charts, Battleground (Duels, live Duels, practice Rumbles, division arenas), Champ page |
| **1. MVP core** ✅ (built) | Accounts and onboarding, server-side training log with anti-cheat limits, Duels between real players' champions, scheduled daily and weekly free Rumbles with commit-reveal seeds, leaderboard, notifications, unlockable gear, installable app (PWA), Docker deployment. Remaining for MVP: tracker sync, push notifications, password reset email, final UI from design references |
| **1. MVP (free)** | Fitness app shell (Today, Train, Progress, Battleground, Champ tabs), camera push-up and squat counter, step sync, accounts, free Duels and daily free Rumbles, divisions, replays |
| **2. Beta** | Weekly Rumbles with heats and finals, anti-cheat pipeline, notifications, social (friends, clubs) |
| **3. Cash pools** | Payments and payouts, ID checks, location blocking, legal sign-off, rolled out per region |
| **4. Scale** | Trained AI fighters, tournaments, regional infrastructure |

---

## 10. Recommendations (waiting for sign-off)

### R1. Activity data on the web
- **MVP:** camera-counted push-ups and squats, which work in any browser, plus wearable sync through one aggregator (e.g. Terra), covering Fitbit, Garmin, Strava, Oura and more.
- **Cash Rumbles:** only camera-verified exercise and wearable data count; hand-typed numbers count only in free Rumbles.
- **Later:** a thin native wrapper (Capacitor) to read Apple Health and Google Health Connect, published to the app stores.

### R2. Revenue with no platform fee
- **Cosmetics shop:** fighter parts, gloves, entrances, victory poses, KO effects. The modular brick style makes this a large catalog. Cosmetics are **looks only and never affect stats**, so money can't buy wins.
- **FitDuel Pass** (about $4.99/month): deeper training insights, unlimited replay saves, extra free Rumbles, monthly exclusive cosmetics.
- **Sponsored Rumbles:** brands (sportswear, gyms, drinks) add prize money to a pool, so players get a bigger pool and FitDuel earns sponsor fees.
- **Payment processing fees** are paid by FitDuel out of the revenue above, so the "100% to the pool" promise holds.

### R3. Entry tiers and payout table
- **Entry tiers:**

  | Rumble | Entry tiers |
  |---|---|
  | Daily | Free · $1 · $5 · $20 |
  | Weekly | Free · $5 · $25 · $100 |

- **Paid places:** the top **20%** of each Rumble, and every paid place wins **at least 1.5× the entry**.
- **Example payout table**, for a 30-fighter Rumble (6 paid places):

  | Place | 1st | 2nd | 3rd | 4th | 5th | 6th |
  |---|---|---|---|---|---|---|
  | Share of pool | 35.3% | 20.3% | 14.6% | 11.6% | 9.7% | 8.4% |
  | $5 entry ($150 pool) | $52.95 | $30.40 | $21.97 | $17.46 | $14.60 | $12.62 |

- **Payout formula:** for any field size, share ∝ 1 / place^0.8 across the paid places, normalized to 100%. If that leaves a place under 1.5× entry, it is raised to 1.5× and the difference is taken proportionally from the places above. The table is published before entry. Implemented in `engine/payout.ts`.
- **Free Rumbles:** pay out points, badges and cosmetics instead of cash.

### R4. Rumble size and unfilled Rumbles
- **Ring size:** minimum **8** and maximum **30** fighters per ring.
- **If a Rumble doesn't fill:** first merge it with the next-closest division if the ratings are close. If it still has fewer than 8 fighters, **refund everyone in full**.
- **Bots:** they can fill **free** Rumbles so they always run, but **never cash Rumbles**. Cash pools are always player against player.

### R5. Art and production
- **Phase 0 (I build):** placeholder blocky fighters generated in code from simple boxes, so the game and replays can be built and tested right away.
- **Phase 1 (artist):** a Blender artist (you or a hire) builds the real character kit and animations following section 5.1, and it drops into the same rig with no code changes.
- **Artist brief:** a parts list, triangle budget, pivot names and the animation clip list. I'll write it when we reach Phase 1.

### R6. Tech stack
| Area | Choice |
|---|---|
| Web app | Next.js (React) built as a PWA, hosted on Vercel |
| 3D | Three.js with React Three Fiber |
| Pose detection | MediaPipe Pose, running in the browser |
| Backend API | TypeScript on Node.js |
| Database and cache | Postgres; Redis for queues and the lobby |
| Rumble workers | Simulation workers on a container host, scaled by adding workers |
| Payments, ID checks and location blocking | Licensed providers, chosen in Phase 3 with legal input |
