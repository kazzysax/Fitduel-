import type { Exercise } from "../../engine/reps.ts";

export type Tab = "today" | "train" | "progress" | "battleground" | "champ";

export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "◎" },
  { id: "train", label: "Train", icon: "✚" },
  { id: "progress", label: "Progress", icon: "▤" },
  { id: "battleground", label: "Battle", icon: "⚔" },
  { id: "champ", label: "Champ", icon: "★" },
];

export interface GoOptions {
  exercise?: Exercise; // Train: open the camera counter for this exercise
  manual?: boolean; // Train: jump to manual logging
  duel?: boolean; // Battleground: start a Duel straight away
}

export type Go = (tab: Tab, opts?: GoOptions) => void;
