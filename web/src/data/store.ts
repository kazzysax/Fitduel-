// App state loaded from the FitDuel server: your account, champion, training log,
// workouts and fights. Pages read it with useProfile(); actions update the server and
// then refresh.

import { useSyncExternalStore } from "react";

import type { Equipped } from "../../../engine/league.ts";
import { computeStats, overallRating, WINDOW_DAYS, type ActivityDay, type FighterStats } from "../../../engine/stats.ts";
import { api, getToken, localDate, setToken, setUnauthorizedHandler } from "./api.ts";

export type DayLog = Omit<ActivityDay, "date">;

export interface Workout {
  id: number;
  date: string;
  time: string;
  kind: "pushups" | "squats" | "steps" | "run" | "active";
  amount: number;
  source: "camera" | "manual" | "tracker";
  flagged: string | null;
}

export interface FightSummary {
  id: number;
  mode: "duel" | "rumble";
  title: string;
  createdAt: string;
  place: number;
  fieldSize: number;
  won: number;
  payoutCents: number;
}

export interface Goals {
  steps: number;
  reps: number;
  activeMinutes: number;
}

interface Me {
  email: string;
  createdAt: string;
  goals: Goals;
  onboarded: boolean;
  champ: { id: string; name: string; color: string; equipped: Equipped; stats: FighterStats; rating: number; division: string };
  streak: { current: number; best: number };
  record: { duels: number; duelWins: number; rumbles: number; rumbleWins: number; bestRumblePlace: number | null; practiceWinningsCents: number };
  unlocked: string[];
  unread: number;
}

export interface Profile {
  email: string;
  champId: string;
  champName: string;
  color: string;
  equipped: Equipped;
  goals: Goals;
  onboarded: boolean;
  streak: { current: number; best: number };
  record: Me["record"];
  unlocked: string[];
  unread: number;
  log: Record<string, DayLog>;
  workouts: Workout[];
  bests: { steps: number | null; pushups: number | null; squats: number | null };
  fights: FightSummary[];
}

export type Session = { status: "loading" } | { status: "signedOut" } | { status: "error"; message: string } | { status: "ready"; profile: Profile };

const HISTORY_DAYS = WINDOW_DAYS * 2; // enough to chart the champ's rating over 28 days

let session: Session = { status: "loading" };
const listeners = new Set<() => void>();

function set(next: Session): void {
  session = next;
  listeners.forEach((l) => l());
}

setUnauthorizedHandler(() => {
  setToken(null);
  set({ status: "signedOut" });
});

export async function refresh(): Promise<void> {
  try {
    const [me, activity, fights] = await Promise.all([
      api<Me>("/me"),
      api<{ log: Record<string, DayLog>; workouts: Workout[]; bests: Profile["bests"] }>(`/activity?days=${HISTORY_DAYS}`),
      api<FightSummary[]>("/fights/mine"),
    ]);
    set({
      status: "ready",
      profile: {
        email: me.email,
        champId: me.champ.id,
        champName: me.champ.name,
        color: me.champ.color,
        equipped: me.champ.equipped,
        goals: me.goals,
        onboarded: me.onboarded,
        streak: me.streak,
        record: me.record,
        unlocked: me.unlocked,
        unread: me.unread,
        log: activity.log,
        workouts: activity.workouts,
        bests: activity.bests,
        fights,
      },
    });
  } catch (e) {
    if (session.status !== "signedOut") set({ status: "error", message: (e as Error).message });
  }
}

export async function boot(): Promise<void> {
  if (!getToken()) return set({ status: "signedOut" });
  await refresh();
}

export function useSession(): Session {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => session,
  );
}

// Pages below the sign-in gate can rely on a loaded profile.
export function useProfile(): Profile {
  const s = useSession();
  if (s.status !== "ready") throw new Error("Profile not loaded");
  return s.profile;
}

// ───── Actions ─────

export async function signUp(email: string, password: string, champName: string, color: string): Promise<void> {
  const { token } = await api<{ token: string }>("/auth/signup", { body: { email, password, champName, color } });
  setToken(token);
  await refresh();
}

export async function logIn(email: string, password: string): Promise<void> {
  const { token } = await api<{ token: string }>("/auth/login", { body: { email, password } });
  setToken(token);
  await refresh();
}

export async function logOut(): Promise<void> {
  await api("/auth/logout", { body: {} }).catch(() => {});
  setToken(null);
  set({ status: "signedOut" });
}

export async function deleteAccount(password: string): Promise<void> {
  await api("/me", { method: "DELETE", body: { password } });
  setToken(null);
  set({ status: "signedOut" });
}

export async function logWorkout(kind: Workout["kind"], amount: number, source: Workout["source"], durationSec?: number): Promise<{ flagged: string | null }> {
  const res = await api<{ flagged: string | null }>("/workouts", { body: { kind, amount, source, durationSec } });
  await refresh();
  return res;
}

export async function updateChamp(changes: { name?: string; color?: string; equipped?: Equipped }): Promise<void> {
  await api("/champ", { method: "PUT", body: changes });
  await refresh();
}

export async function updateMe(changes: { goals?: Goals; onboarded?: boolean }): Promise<void> {
  await api("/me", { method: "PUT", body: changes });
  await refresh();
}

export async function markNotificationsRead(): Promise<void> {
  await api("/notifications/read", { body: {} });
  await refresh();
}

// ───── Derived values ─────

export function today(): string {
  return localDate();
}

export function daysAgo(n: number, from = today()): string {
  const d = new Date(`${from}T12:00:00`);
  d.setDate(d.getDate() - n);
  return localDate(d);
}

const EMPTY_DAY: DayLog = { steps: 0, pushups: 0, squats: 0, activeMinutes: 0, runKm: 0 };

export function dayLog(p: Pick<Profile, "log">, date: string): DayLog {
  return p.log[date] ?? EMPTY_DAY;
}

export function history(p: Pick<Profile, "log">, asOf = today()): ActivityDay[] {
  return Array.from({ length: WINDOW_DAYS }, (_, age) => {
    const date = daysAgo(age, asOf);
    return { date, ...dayLog(p, date) };
  });
}

export interface Champ {
  id: string;
  name: string;
  color: string;
  equipped: Equipped;
  stats: FighterStats;
  rating: number;
}

// Same formula as the server, so charts of past days match what the server computes.
export function champOf(p: Profile, asOf = today()): Champ {
  const stats = computeStats(history(p, asOf), asOf);
  return { id: p.champId, name: p.champName, color: p.color, equipped: p.equipped, stats, rating: overallRating(stats) };
}

export function isActiveDay(d: DayLog): boolean {
  return d.steps >= 5000 || d.pushups >= 10 || d.activeMinutes >= 20;
}
