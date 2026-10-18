// Email + password accounts with opaque bearer tokens. Passwords are hashed with scrypt;
// only a SHA-256 of each session token is stored, so a leaked database can't log anyone in.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import type { DB } from "./db.ts";

const SESSION_DAYS = 60;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function createSession(db: DB, userId: number): string {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, expires);
  return token;
}

export function userForToken(db: DB, token: string | undefined): number | null {
  if (!token) return null;
  const row = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").get(sha256(token)) as
    | { user_id: number; expires_at: string }
    | undefined;
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    return null;
  }
  return row.user_id;
}

export function deleteSession(db: DB, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple fixed-window limiter for login and signup attempts, per client address.
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  private limit: number;
  private windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  allow(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || h.reset < now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.reset < now) this.hits.delete(k);
      return true;
    }
    h.count++;
    return h.count <= this.limit;
  }
}
