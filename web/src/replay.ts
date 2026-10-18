import type { Frames } from "../../engine/rumble.ts";

// Mutable playback clock shared by the 3D scene (read every frame) and the HUD
// (polled a few times a second). `t` is in simulation ticks and may be fractional.
export interface Playback {
  t: number;
  playing: boolean;
  speed: number;
}

export function clampTick(frames: Frames, t: number): number {
  return Math.max(0, Math.min(t, frames.ticks - 1));
}

function lerpAngle(a: number, b: number, f: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

// Interpolated position and facing of one fighter at playback time t.
export function samplePose(frames: Frames, fighter: number, t: number): { x: number; z: number; rot: number } {
  const tf = clampTick(frames, t);
  const k0 = Math.floor(tf);
  const k1 = Math.min(frames.ticks - 1, k0 + 1);
  const f = tf - k0;
  const a = (k0 * frames.fighters + fighter) * 3;
  const b = (k1 * frames.fighters + fighter) * 3;
  return {
    x: frames.pos[a] + (frames.pos[b] - frames.pos[a]) * f,
    z: frames.pos[a + 1] + (frames.pos[b + 1] - frames.pos[a + 1]) * f,
    rot: lerpAngle(frames.pos[a + 2], frames.pos[b + 2], f),
  };
}

export function frameIndex(frames: Frames, fighter: number, t: number): number {
  return Math.floor(clampTick(frames, t)) * frames.fighters + fighter;
}

export function formatClock(ticks: number): string {
  const seconds = Math.floor(ticks / 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
