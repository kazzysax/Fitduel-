# FitDuel — Product Spec (draft v0.1)

> Train in real life. Your training powers your AI fighter. Enter it into a Rumble, a many-fighter ring match that runs automatically, and the top finishers share the pool.

Status: **draft for discussion**. Items marked **OPEN** still need a decision.

---

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Platform | **Web app** (installable PWA) that works on iPhone, Android and desktop browsers |
| Visuals | **3D.** Fighters and arena are modelled and animated in **Blender**, then rendered in the browser |
| Push-up tracking | Counted by the **camera**, with pose detection running in the browser |
| Fighter AI | Game AI that runs on our servers. Fights are deterministic and replayable from a seed (no language model controls moves) |
| Duels | **Fully automatic and in the background.** Players get a result plus an automatic replay scene |
| Format | **Rumble:** many fighters in one ring, last one standing, like a WWE Royal Rumble |
| Entry | Players choose which Rumble to enter and pay an entry stake into the pool |
| Schedule | **Daily** and **weekly** Rumbles |
| Payout | The top finishers share the pool by score |
| Platform fee | **None** (see Open item O2) |
| Matchmaking | **Divisions** by fighter level, so beginners face beginners |
| Launch | **Worldwide** (see section 8 for how cash pools work country by country) |

---

## 2. Core loop

1. **Train:** steps, push-ups (camera), squats (camera), runs and cardio.
2. **Level up:** training turns into fighter stats.
3. **Enter:** pick a daily or weekly Rumble in your division and stake an entry.
4. **Fight:** at the scheduled time the server runs the Rumble automatically.
5. **Watch and earn:** see the replay; top finishers get paid from the pool.
6. Repeat. Stats fade without training, which brings people back.

---

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
- Up to **30 fighters per ring**. Bigger events are split into heats; heat winners advance to a final.
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
- **Top 20%** of finishers are paid, using a sliding scale (1st gets the most). Proposed default: **OPEN O3**.
- Payouts are held until anti-cheat review passes (section 6).

### 4.4 Divisions
- Fighters are grouped by **overall rating** into divisions (e.g. Rookie, Contender, Pro, Champion).
- A rating (Elo or Glicko-2) moves you up and down based on results.
- You can only enter Rumbles in your own division, which stops veterans from farming new players.

### 4.5 Fairness
- Randomness is kept **low**. Training should decide most of the outcome, which matters for fairness and for skill-contest legal status (section 8).
- The random seed for each Rumble is **committed before entry closes** (we publish its hash) and revealed afterwards, so anyone can re-run the fight and check the result.

---

## 5. Watching fights (3D)
- Fights run on the server in milliseconds. The "scene" is a **3D replay** rebuilt in the browser from the stored seed and the fighters, so we never stream video.
- Players get a notification ("Your fighter finished 3rd of 30, you won X"), then watch the replay with highlights: knockouts, comebacks, their fighter's best moments.

### 5.1 3D pipeline
```
Blender (model, rig, animate) → export glTF/GLB → compress (Draco/meshopt + KTX2 textures)
  → loaded by Three.js (React Three Fiber) in the web app → driven by the replay event stream
```
- **One shared base boxer** with one skeleton. Every fighter reuses it, which keeps the files small and lets all animations work on every fighter.
- **Animation clips made in Blender:**
  - Combat: idle/bounce, step, jab, hook, uppercut, guard, dodge, hit reaction, stagger, KO fall.
  - Ceremony: ring entrance and victory pose.
- **Arena:** a ring, ropes, lights and a crowd made of cheap cut-outs or instanced figures.
- **Phone performance budget** (up to 30 fighters on screen):
  - Low-poly fighters, about 5–10k triangles each, with simpler LOD models at a distance.
  - Shared materials, and only fighters near the camera fully animated.
  - The camera follows the action and the player's own fighter.
- **Fighter looks show training.** Body build, gear and aura change with stats and rating, so you can see how hard someone trains.
- **Customization:** skins, gloves, shorts, entrances and victory poses. This is also the main way to make money (O2).

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
| **0. Prototype** | Stats engine, Rumble simulation, basic 3D replay with a placeholder Blender boxer, fake data |
| **1. MVP (free)** | Web app, accounts, camera push-up and squat counter, step sync, daily free Rumbles, divisions, replays |
| **2. Beta** | Weekly Rumbles with heats and finals, anti-cheat pipeline, notifications, social (friends, clubs) |
| **3. Cash pools** | Payments and payouts, ID checks, location blocking, legal sign-off, rolled out per region |
| **4. Scale** | Trained AI fighters, tournaments, regional infrastructure |

---

## 10. Open items

- **O1. Step data on the web.**
  - **The problem:** browsers **cannot read Apple Health**, and they have very limited access to Google Health Connect.
  - **Options:**
    - (a) Connect wearables and services through their web APIs: Fitbit, Garmin, Strava, Oura, Withings. A data aggregator like Terra can provide these in one integration.
    - (b) Wrap the web app in a thin native shell (for example Capacitor) only to read Apple Health and Health Connect.
    - (c) Count only camera exercises at first.
  - **Recommendation:** (a) now, (b) later.
- **O2. How does FitDuel make money with no platform fee?**
  - Options: cosmetic fighter gear, a premium subscription (training insights, extra replays), sponsored Rumbles, interest on held funds (check legality).
  - Payment processing fees (~2–3%) still need to be covered by someone.
- **O3. Exact payout curve** (proposed: top 20% paid, sliding scale) and entry stake tiers.
- **O4. Minimum and maximum fighters per Rumble,** and what happens if a Rumble doesn't fill.
- **O5. 3D art direction:** realistic, stylised or cartoon? Who makes the Blender models: you, an artist, or placeholders to start?
