// Tiny HTTP layer: a route table, JSON in and out, typed errors, and static files for
// the built web app (with single-page-app fallback).

import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Ctx {
  req: IncomingMessage;
  url: URL;
  params: Record<string, string>;
  body: unknown;
  token: string | undefined;
  ip: string;
}

export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

const MAX_BODY = 64 * 1024;

export class Router {
  private routes: Route[] = [];

  on(method: string, path: string, handler: Handler): this {
    const keys: string[] = [];
    const pattern = new RegExp(
      "^" +
        path.replace(/:(\w+)/g, (_, k) => {
          keys.push(k);
          return "([^/]+)";
        }) +
        "$",
    );
    this.routes.push({ method, pattern, keys, handler });
    return this;
  }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | "method" | null {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.pattern.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return pathMatched ? "method" : null;
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "Request too large");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

export function send(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
};

function serveStatic(root: string, pathname: string, res: ServerResponse): void {
  const base = resolve(root);
  let file = normalize(join(base, decodeURIComponent(pathname)));
  if (!file.startsWith(base)) return send(res, 400, { error: "Bad path" });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(base, "index.html"); // SPA fallback
  if (!existsSync(file)) return send(res, 404, { error: "Not found" });
  const hashed = file.includes(`${join(base, "assets")}`);
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    // The camera is used by the rep counter on this origin only.
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
  });
  createReadStream(file).pipe(res);
}

export function createHandler(router: Router, staticDir: string | null) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) {
      if (staticDir && (req.method === "GET" || req.method === "HEAD")) return serveStatic(staticDir, url.pathname, res);
      return send(res, 404, { error: "Not found" });
    }
    const found = router.match(req.method ?? "GET", url.pathname);
    if (found === null) return send(res, 404, { error: "Not found" });
    if (found === "method") return send(res, 405, { error: "Method not allowed" });
    try {
      const auth = req.headers.authorization;
      const ctx: Ctx = {
        req,
        url,
        params: found.params,
        body: await readJson(req),
        token: auth?.startsWith("Bearer ") ? auth.slice(7) : undefined,
        ip: (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? "?",
      };
      const out = await found.handler(ctx);
      send(res, 200, out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: "Something went wrong" });
    }
  };
}
