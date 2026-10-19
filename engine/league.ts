// League rules shared by the server and the app: divisions, arenas and unlockable gear.

export type VenueId = "garage" | "rooftop" | "city" | "colosseum";

export interface Division {
  name: string;
  min: number; // minimum OVR
  venue: VenueId;
}

export const DIVISIONS: Division[] = [
  { name: "Rookie", min: 0, venue: "garage" },
  { name: "Contender", min: 45, venue: "rooftop" },
  { name: "Pro", min: 60, venue: "city" },
  { name: "Champion", min: 75, venue: "colosseum" },
];

export function divisionFor(rating: number): Division {
  return [...DIVISIONS].reverse().find((d) => rating >= d.min)!;
}

// Gear only changes how a champ looks, never how it fights.
export type GearSlot = "head" | "gloves" | "torso";

export interface GearItem {
  id: string;
  name: string;
  slot: GearSlot;
  how: string;
}

export const GEAR: GearItem[] = [
  { id: "sweatband", name: "Rookie sweatband", slot: "head", how: "Fight your first Duel" },
  { id: "flame-gloves", name: "Flame gloves", slot: "gloves", how: "Reach a 7-day streak" },
  { id: "chrome-torso", name: "Chrome torso", slot: "torso", how: "Win 3 Duels" },
  { id: "gold-headgear", name: "Gold headgear", slot: "head", how: "Reach the Champion division" },
  { id: "crown", name: "Rumble crown", slot: "head", how: "Win a Rumble" },
];

export type Equipped = Partial<Record<GearSlot, string>>;

export interface Progress {
  duels: number;
  duelWins: number;
  rumbleWins: number;
  bestStreak: number;
  rating: number;
}

export function unlockedGear(p: Progress): string[] {
  const out: string[] = [];
  if (p.duels >= 1) out.push("sweatband");
  if (p.bestStreak >= 7) out.push("flame-gloves");
  if (p.duelWins >= 3) out.push("chrome-torso");
  if (p.rating >= 75) out.push("gold-headgear");
  if (p.rumbleWins >= 1) out.push("crown");
  return out;
}

export function validEquip(equipped: Equipped, unlocked: string[]): boolean {
  return Object.entries(equipped).every(([slot, id]) => {
    if (id === undefined || id === null || id === "") return true;
    const item = GEAR.find((g) => g.id === id);
    return !!item && item.slot === slot && unlocked.includes(id);
  });
}
