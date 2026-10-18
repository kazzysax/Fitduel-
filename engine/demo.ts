// npm run demo -- runs one 30-fighter Rumble with fake players and prints the results.

import { makeFakeField } from "./fakeData.ts";
import { computePayouts } from "./payout.ts";
import { simulateRumble } from "./rumble.ts";

const seed = Number(process.argv[2] ?? 42);
const field = makeFakeField(seed, 30, "2026-10-18");
const byId = new Map(field.map((p) => [p.id, p]));
const entryCents = 500;

const started = performance.now();
const result = simulateRumble(field, seed);
const ms = performance.now() - started;

const payouts = computePayouts(field.length, entryCents);
console.log(`Rumble seed ${seed}: ${field.length} fighters, $${(entryCents / 100).toFixed(2)} entry, pool $${((field.length * entryCents) / 100).toFixed(2)}`);
console.log(`Lasted ${(result.ticks / 10).toFixed(1)}s, simulated in ${ms.toFixed(1)}ms\n`);
console.log("Place  Fighter              Type             OVR  Score  Alive  Dmg   KOs  Payout");
for (const s of result.standings) {
  const p = byId.get(s.fighterId)!;
  const payout = payouts[s.place - 1];
  console.log(
    [
      String(s.place).padStart(5),
      p.name.padEnd(20),
      p.archetype.padEnd(16),
      String(p.rating).padStart(3),
      s.score.toFixed(0).padStart(6),
      `${s.survivalSeconds.toFixed(0)}s`.padStart(6),
      s.damageDealt.toFixed(0).padStart(5),
      String(s.eliminations).padStart(4),
      payout ? `$${(payout / 100).toFixed(2)}`.padStart(8) : "",
    ].join("  "),
  );
}
