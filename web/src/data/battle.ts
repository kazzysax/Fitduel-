// Battleground: arena looks per division, and the server calls for fights, Rumbles,
// the leaderboard and notifications.

import type { FakePlayer } from "../../../engine/fakeData.ts";
import type { Equipped, VenueId } from "../../../engine/league.ts";
import { api } from "./api.ts";

export { DIVISIONS, divisionFor, type Division, type VenueId } from "../../../engine/league.ts";

export interface Venue {
  name: string;
  background: string;
  floor: string;
  apron: string;
  canvas: string;
  ropes: [string, string];
  posts: [string, string];
  stands: [string, string];
  crowdFill: number; // share of seats taken
  light: string;
}

export const VENUES: Record<VenueId, Venue> = {
  garage: {
    name: "Garage Gym",
    background: "#1c1b1a",
    floor: "#3a3633",
    apron: "#7a7f87",
    canvas: "#d9d2c3",
    ropes: ["#f2a541", "#2b2b2b"],
    posts: ["#f2a541", "#2b2b2b"],
    stands: ["#45403c", "#3b3734"],
    crowdFill: 0.3,
    light: "#ffe2b8",
  },
  rooftop: {
    name: "Street Rooftop",
    background: "#120f24",
    floor: "#231d3d",
    apron: "#6a3fd1",
    canvas: "#e4e0f2",
    ropes: ["#ff4fa3", "#f5f5f5"],
    posts: ["#ff4fa3", "#35d0ff"],
    stands: ["#2a2346", "#30284f"],
    crowdFill: 0.55,
    light: "#d9d0ff",
  },
  city: {
    name: "City Arena",
    background: "#14161f",
    floor: "#1a1c26",
    apron: "#2a5bd7",
    canvas: "#ece6d6",
    ropes: ["#d62828", "#f5f5f5"],
    posts: ["#d62828", "#2453b8"],
    stands: ["#262a38", "#2e3344"],
    crowdFill: 0.88,
    light: "#fff6e0",
  },
  colosseum: {
    name: "Brick Colosseum",
    background: "#1f170e",
    floor: "#3b2c1b",
    apron: "#b8860b",
    canvas: "#f3e7c9",
    ropes: ["#ffc633", "#7a1f1f"],
    posts: ["#ffc633", "#7a1f1f"],
    stands: ["#5c4329", "#6b4f31"],
    crowdFill: 0.97,
    light: "#ffe9b0",
  },
};

export type Fighter = FakePlayer & { equipped?: Equipped };

export interface Fight {
  id: number;
  mode: "duel" | "rumble";
  seed: number;
  createdAt: string;
  venue: VenueId;
  title: string;
  fighters: Fighter[];
  entryCents: number;
}

export interface LiveFight {
  id: number;
  mode: "duel" | "rumble";
  title: string;
  createdAt: string;
  venue: VenueId;
  fighters: number;
  winner: { name: string; color: string; rating: number };
}

export interface Rumble {
  id: number;
  kind: "daily" | "weekly";
  title: string;
  startsAt: string;
  fieldSize: number;
  entryCents: number;
  seedHash: string;
  seed: number | null;
  status: "open" | "done";
  fightId: number | null;
  entered: number;
  joined: boolean;
}

export interface LeaderRow {
  rank: number;
  name: string;
  color: string;
  rating: number;
  division: string;
  duelWins: number;
  duels: number;
  me: boolean;
}

export interface Notification {
  id: number;
  createdAt: string;
  kind: string;
  body: string;
  fightId: number | null;
  read: number;
}

export const startDuel = () => api<{ fightId: number }>("/duels", { body: {} });
export const fetchFight = (id: number) => api<Fight>(`/fights/${id}`);
export const fetchLive = () => api<LiveFight[]>("/live");
export const fetchRumbles = () => api<Rumble[]>("/rumbles");
export const enterRumble = (id: number) => api(`/rumbles/${id}/enter`, { body: {} });
export const leaveRumble = (id: number) => api(`/rumbles/${id}/leave`, { body: {} });
export const fetchLeaderboard = () => api<LeaderRow[]>("/leaderboard");
export const fetchNotifications = () => api<Notification[]>("/notifications");

export function countdown(to: Date, now = new Date()): string {
  const s = Math.max(0, Math.floor((to.getTime() - now.getTime()) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
