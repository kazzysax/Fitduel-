// Camera rep counter. Pose detection runs entirely in the browser (MediaPipe Pose);
// video never leaves the device. Only the final rep count is saved.

import { useEffect, useRef, useState } from "react";

import { depth, measure, newRepState, REP_RULES, stepReps, type Exercise, type Landmark } from "../../../engine/reps.ts";

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_PATH = `${import.meta.env.BASE_URL}mediapipe`;

type Status = "idle" | "loading" | "running" | "error";

interface Detector {
  detectForVideo(video: HTMLVideoElement, timestamp: number): { landmarks: Landmark[][] };
  close(): void;
}

async function createDetector(): Promise<{ detector: Detector; connections: { start: number; end: number }[] }> {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO" as const,
    numPoses: 1,
  });
  let detector: Detector;
  try {
    detector = await PoseLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    detector = await PoseLandmarker.createFromOptions(fileset, options("CPU"));
  }
  return { detector, connections: PoseLandmarker.POSE_CONNECTIONS };
}

export function PoseCounter({ exercise, onFinish, onCancel }: { exercise: Exercise; onFinish: (reps: number, durationSec: number) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [reps, setReps] = useState(0);
  const [hint, setHint] = useState<string | null>("Get into position");
  const [down, setDown] = useState(0);
  const stopRef = useRef<() => void>(() => {});
  const repsRef = useRef(0);
  const startedAt = useRef(0);

  useEffect(() => () => stopRef.current(), []);

  const start = async () => {
    setStatus("loading");
    setError("");
    let stream: MediaStream | null = null;
    let detector: Detector | null = null;
    let raf = 0;
    let stopped = false;
    stopRef.current = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      detector?.close();
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      const created = await createDetector();
      detector = created.detector;
      if (stopped) return detector.close();
      setStatus("running");
      startedAt.current = performance.now();

      let state = newRepState();
      let lastVideoTime = -1;
      let lastUi = 0;
      const loop = () => {
        if (stopped) return;
        raf = requestAnimationFrame(loop);
        if (v.currentTime === lastVideoTime || v.readyState < 2) return;
        lastVideoTime = v.currentTime;
        const now = performance.now();
        const lm = detector!.detectForVideo(v, now).landmarks[0];
        const m = lm ? measure(exercise, lm) : { angle: null, hint: "Step into view" };
        state = stepReps(state, exercise, m.angle, now);
        draw(canvas.current, v, lm, created.connections, m.angle !== null);
        if (state.reps !== repsRef.current) {
          repsRef.current = state.reps;
          setReps(state.reps);
          navigator.vibrate?.(30);
        }
        if (now - lastUi > 100) {
          lastUi = now;
          setHint(m.hint);
          setDown(depth(exercise, state.smoothed));
        }
      };
      loop();
    } catch (e) {
      stopRef.current();
      setStatus("error");
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings, or log your reps manually."
          : name === "NotFoundError"
            ? "No camera found on this device. You can log your reps manually."
            : "The rep counter couldn't start on this device. You can log your reps manually.",
      );
    }
  };

  const finish = () => {
    stopRef.current();
    onFinish(repsRef.current, Math.round((performance.now() - startedAt.current) / 1000));
  };

  const label = exercise === "pushup" ? "Push-ups" : "Squats";
  const rules = REP_RULES[exercise];

  return (
    <div className="pose">
      <div className="pose-stage">
        <video ref={video} playsInline muted className={status === "running" ? "" : "hidden"} />
        <canvas ref={canvas} className={status === "running" ? "" : "hidden"} />
        {status !== "running" && (
          <div className="pose-intro">
            {status === "idle" && (
              <>
                <div className="pose-icon" aria-hidden>
                  {exercise === "pushup" ? "🫸" : "🦵"}
                </div>
                <h3>{label} with camera counting</h3>
                <ol>
                  {exercise === "pushup" ? (
                    <>
                      <li>Put your phone on the floor, 1–2 m away, side-on to you.</li>
                      <li>Your whole body should be in the picture.</li>
                      <li>Go all the way down (elbows past 90°) and back up. Half reps don't count.</li>
                    </>
                  ) : (
                    <>
                      <li>Prop your phone up 2–3 m away so your whole body is visible.</li>
                      <li>Stand side-on or facing the camera.</li>
                      <li>Squat until your thighs are about level, then stand fully up.</li>
                    </>
                  )}
                </ol>
                <p className="note">The video stays on your device. Only the rep count is saved.</p>
                <button className="btn btn-primary big-btn" onClick={start}>
                  Start camera
                </button>
              </>
            )}
            {status === "loading" && <p className="note">Starting camera and loading the pose model…</p>}
            {status === "error" && <p className="error">{error}</p>}
          </div>
        )}
        {status === "running" && (
          <>
            <div className="rep-count mono" aria-live="polite">
              {reps}
            </div>
            <div className="depth" aria-label="Depth">
              <span style={{ height: `${down * 100}%` }} />
              <i style={{ bottom: "100%" }}>down</i>
            </div>
            {hint && <div className="pose-hint">{hint}</div>}
          </>
        )}
      </div>
      <div className="pose-actions">
        <span className="note">
          Counts a rep when your {rules.label} bends past {rules.down}° and straightens past {rules.up}°.
        </span>
        <button className="btn" onClick={() => (stopRef.current(), onCancel())}>
          Cancel
        </button>
        {status === "running" && (
          <button className="btn btn-primary" onClick={finish}>
            Finish set · {reps}
          </button>
        )}
      </div>
    </div>
  );
}

function draw(c: HTMLCanvasElement | null, v: HTMLVideoElement, lm: Landmark[] | undefined, connections: { start: number; end: number }[], good: boolean) {
  if (!c) return;
  if (c.width !== v.videoWidth) {
    c.width = v.videoWidth;
    c.height = v.videoHeight;
  }
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  if (!lm) return;
  ctx.lineWidth = 4;
  ctx.strokeStyle = good ? "#ffd60a" : "rgba(255,255,255,0.6)";
  for (const { start, end } of connections) {
    const a = lm[start];
    const b = lm[end];
    if ((a.visibility ?? 1) < 0.5 || (b.visibility ?? 1) < 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * c.width, a.y * c.height);
    ctx.lineTo(b.x * c.width, b.y * c.height);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  for (const p of lm) {
    if ((p.visibility ?? 1) < 0.5) continue;
    ctx.beginPath();
    ctx.arc(p.x * c.width, p.y * c.height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
