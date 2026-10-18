import assert from "node:assert/strict";
import { test } from "node:test";

import { jointAngle, measure, newRepState, stepReps, type Exercise, type Landmark } from "../reps.ts";

// Feeds an angle sequence at 30 fps and returns the rep count.
function count(exercise: Exercise, angles: number[]): number {
  let s = newRepState();
  angles.forEach((a, i) => (s = stepReps(s, exercise, a, (i * 1000) / 30)));
  return s.reps;
}

// One rep: from `top` down to `bottom` and back, over `frames` frames.
function rep(top: number, bottom: number, frames = 30): number[] {
  return Array.from({ length: frames }, (_, i) => bottom + (top - bottom) * (0.5 + 0.5 * Math.cos((2 * Math.PI * i) / frames)));
}

test("reps: full push-ups are counted", () => {
  assert.equal(count("pushup", [...rep(170, 70), ...rep(170, 70), ...rep(170, 70), 170, 170]), 3);
});

test("reps: half push-ups do not count", () => {
  assert.equal(count("pushup", [...rep(170, 110), ...rep(170, 110), 170]), 0);
});

test("reps: jitter around a threshold does not double count", () => {
  const jitter = [170, 80, 80, 80, 160, 140, 160, 140, 160, 145, 170, 170];
  assert.equal(count("pushup", jitter), 1);
});

test("reps: impossibly fast reps are ignored", () => {
  const fast = Array.from({ length: 40 }, (_, i) => (i % 2 ? 60 : 175));
  assert.ok(count("pushup", fast) <= 3);
});

test("reps: squats use the knee angle range", () => {
  assert.equal(count("squat", [...rep(175, 80, 45), ...rep(175, 80, 45), 175]), 2);
  assert.equal(count("squat", [...rep(175, 130, 45), 175]), 0, "shallow squat");
});

test("reps: joint angle maths", () => {
  assert.equal(Math.round(jointAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })), 180);
  assert.equal(Math.round(jointAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })), 90);
});

test("reps: posture check rejects standing push-ups", () => {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  // Upright body: shoulder above hip.
  lm[11] = { x: 0.5, y: 0.3, visibility: 1 };
  lm[23] = { x: 0.5, y: 0.6, visibility: 1 };
  lm[13] = { x: 0.55, y: 0.4, visibility: 1 };
  lm[15] = { x: 0.6, y: 0.5, visibility: 1 };
  assert.equal(measure("pushup", lm).angle, null);
  // Horizontal body: counts.
  lm[11] = { x: 0.3, y: 0.5, visibility: 1 };
  lm[23] = { x: 0.7, y: 0.52, visibility: 1 };
  lm[13] = { x: 0.3, y: 0.65, visibility: 1 };
  lm[15] = { x: 0.3, y: 0.8, visibility: 1 };
  assert.ok(measure("pushup", lm).angle! > 150);
});
