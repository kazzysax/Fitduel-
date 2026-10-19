import { ChartNoAxesColumn, Dumbbell, House, Swords, Trophy, type LucideIcon } from "lucide-react";

import type { Exercise } from "../../engine/reps.ts";

export type Tab = "today" | "train" | "progress" | "battleground" | "champ";

export const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Today", icon: House },
  { id: "train", label: "Workouts", icon: Dumbbell },
  { id: "progress", label: "Progress", icon: ChartNoAxesColumn },
  { id: "battleground", label: "Battle", icon: Swords },
  { id: "champ", label: "Champ", icon: Trophy },
];

export interface GoOptions {
  exercise?: Exercise; // Train: open the camera counter for this exercise
  manual?: boolean; // Train: jump to manual logging
  duel?: boolean; // Battleground: start a Duel straight away
}

export type Go = (tab: Tab, opts?: GoOptions) => void;
