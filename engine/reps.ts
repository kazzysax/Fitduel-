// Camera rep counting from pose landmarks (MediaPipe Pose indices).
// Pure logic, so it is unit-tested here and runs unchanged in the browser.
//
// A rep only counts after a full range of motion: the joint angle must go below the
// "down" threshold and then back above the "up" threshold. Half reps never count.

export type Exercise = "pushup" | "squat";

export interface Landmark {
  x: number; // 0..1 across the image
  y: number; // 0..1 down the image
  visibility?: number;
}

export const LM = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export const REP_RULES: Record<Exercise, { down: number; up: number; label: string }> = {
  pushup: { down: 95, up: 150, label: "elbow" },
  squat: { down: 105, up: 160, label: "knee" },
};

const MIN_VISIBILITY = 0.5;
const MIN_REP_MS = 400; // faster than this is not a real rep
const SMOOTHING = 0.5;

export function jointAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = Math.atan2(a.y - b.y, a.x - b.x);
  const cb = Math.atan2(c.y - b.y, c.x - b.x);
  let deg = Math.abs(((ab - cb) * 180) / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

export interface Measurement {
  angle: number | null;
  hint: string | null; // what the user should fix, if anything
}

// Picks the body side the camera sees best and measures the exercise's key joint.
export function measure(exercise: Exercise, lm: Landmark[]): Measurement {
  if (lm.length < 29) return { angle: null, hint: "Step into view" };
  const sides =
    exercise === "pushup"
      ? [
          [LM.leftShoulder, LM.leftElbow, LM.leftWrist, LM.leftHip],
          [LM.rightShoulder, LM.rightElbow, LM.rightWrist, LM.rightHip],
        ]
      : [
          [LM.leftHip, LM.leftKnee, LM.leftAnkle, LM.leftShoulder],
          [LM.rightHip, LM.rightKnee, LM.rightAnkle, LM.rightShoulder],
        ];
  const visibility = (ids: number[]) => Math.min(...ids.map((i) => lm[i].visibility ?? 1));
  const [a, b, c, d] = visibility(sides[0]) >= visibility(sides[1]) ? sides[0] : sides[1];
  if (visibility([a, b, c, d]) < MIN_VISIBILITY) {
    return { angle: null, hint: exercise === "pushup" ? "Turn side-on so your arm is visible" : "Show your whole leg" };
  }

  // Posture check: push-ups need a roughly horizontal body, squats an upright torso.
  const torso = exercise === "pushup" ? [lm[a], lm[d]] : [lm[d], lm[a]];
  const dx = Math.abs(torso[0].x - torso[1].x);
  const dy = Math.abs(torso[0].y - torso[1].y);
  if (exercise === "pushup" && dy > dx) return { angle: null, hint: "Get into push-up position" };
  if (exercise === "squat" && dx > dy) return { angle: null, hint: "Stand up straight to start" };

  return { angle: jointAngle(lm[a], lm[b], lm[c]), hint: null };
}

export interface RepState {
  reps: number;
  phase: "up" | "down";
  smoothed: number | null;
  lastRepAt: number;
}

export function newRepState(): RepState {
  return { reps: 0, phase: "up", smoothed: null, lastRepAt: -Infinity };
}

export function stepReps(state: RepState, exercise: Exercise, angle: number | null, timeMs: number): RepState {
  if (angle === null) return state;
  const rules = REP_RULES[exercise];
  const smoothed = state.smoothed === null ? angle : state.smoothed + (angle - state.smoothed) * SMOOTHING;
  let { reps, phase, lastRepAt } = state;
  if (phase === "up" && smoothed < rules.down) {
    phase = "down";
  } else if (phase === "down" && smoothed > rules.up) {
    phase = "up";
    if (timeMs - lastRepAt >= MIN_REP_MS) {
      reps++;
      lastRepAt = timeMs;
    }
  }
  return { reps, phase, smoothed, lastRepAt };
}

// 0 = fully up, 1 = fully down; drives the depth meter in the UI.
export function depth(exercise: Exercise, angle: number | null): number {
  if (angle === null) return 0;
  const { down, up } = REP_RULES[exercise];
  return Math.max(0, Math.min(1, (up - angle) / (up - down)));
}
