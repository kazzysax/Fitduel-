// Copies MediaPipe's pose-detection runtime into public/ so the app serves it itself.
import { cpSync, mkdirSync } from "node:fs";

const from = new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url);
const to = new URL("../public/mediapipe/", import.meta.url);
mkdirSync(to, { recursive: true });
for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
  cpSync(new URL(file, from), new URL(file, to));
}
