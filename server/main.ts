// Starts the FitDuel server: API, Rumble scheduler, and the built web app.
//   PORT            (default 8787)
//   DATABASE_PATH   (default ./data/fitduel.db)
//   WEB_DIST        (default ../web/dist, set empty to serve the API only)

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createApp, startScheduler } from "./app.ts";
import { openDb } from "./db.ts";

const port = Number(process.env.PORT ?? 8787);
const dbPath = resolve(process.env.DATABASE_PATH ?? "data/fitduel.db");
const webDist = process.env.WEB_DIST ?? resolve(import.meta.dirname, "../web/dist");

mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
startScheduler(db);
createApp(db, { staticDir: webDist || null }).listen(port, () => {
  console.log(`FitDuel listening on http://localhost:${port} (db ${dbPath})`);
});
