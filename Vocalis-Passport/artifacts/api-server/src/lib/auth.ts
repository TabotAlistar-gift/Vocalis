import crypto from "crypto";
import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SESSION_SECRET = process.env.SESSION_SECRET || "vocalis-passport-session-secret-key-2026";
export const COOKIE_NAME = "vocalis_session";

export interface SessionPayload {
  userId: number;
  email: string;
  role: "student" | "admin";
  vocalisId: string;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionUser?: SessionPayload;
    }
  }
}

/**
 * Secure password hashing using crypto.scrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Verify a plain password against a scrypt hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const [salt, key] = storedHash.split(":");
      if (!salt || !key) return resolve(false);

      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) return resolve(false);
        const keyBuffer = Buffer.from(key, "hex");
        if (keyBuffer.length !== derivedKey.length) return resolve(false);
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Generate signed JWT-like session token
 */
export function createSessionToken(user: { id: number; email: string; role: "student" | "admin"; vocalisId: string }): string {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    vocalisId: user.vocalisId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadB64)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Verify and decode a session token
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return null;

    const expectedSignature = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(payloadB64)
      .digest("base64url");

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8")) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract token from Cookie or Authorization header
 */
export function extractToken(req: Request): string | null {
  // 1. Check URL query parameter (?token=...)
  if (req.query && typeof req.query.token === "string" && req.query.token.trim()) {
    return req.query.token.trim();
  }

  // 1b. Check raw URL for token param if req.query is empty
  if (req.url && req.url.includes("token=")) {
    try {
      const parsed = new URL(req.url, "http://localhost");
      const urlToken = parsed.searchParams.get("token");
      if (urlToken && urlToken.trim()) {
        return urlToken.trim();
      }
    } catch {}
  }

  // 2. Check Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  // 3. Check Cookie header
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").reduce((acc, str) => {
      const [key, value] = str.trim().split("=");
      if (key && value) acc[key] = decodeURIComponent(value);
      return acc;
    }, {} as Record<string, string>);

    if (cookies[COOKIE_NAME]) {
      return cookies[COOKIE_NAME];
    }
  }

  return null;
}

/**
 * Authentication middleware to populate req.user
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) {
      return next();
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      return next();
    }

    req.sessionUser = payload;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId))
      .limit(1);

    if (user && user.active) {
      req.user = user;
    }

    next();
  } catch (error) {
    logger.error({ err: error }, "Authentication error in middleware");
    next();
  }
}

/**
 * Middleware requiring authenticated user
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

/**
 * Middleware requiring admin role
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Founder or Admin access required" });
    return;
  }
  next();
}

/**
 * Seed initial Admin user if not present
 */
export async function seedAdminUser() {
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || "tabotclarise@gmail.com").trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || "VocalisAdmin2026!";
    const passwordHash = await hashPassword(adminPassword);

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, adminEmail))
      .limit(1);

    if (!existing) {
      await db.insert(usersTable).values({
        fullName: "Clarise Tabot (Founder)",
        email: adminEmail,
        phone: "+234 800 000 0000",
        vocalisId: "VOC-ADMIN-01",
        role: "admin",
        level: "Level Six",
        badge: "Global Citizen",
        passportStatus: "active",
        dateJoined: new Date().toISOString().slice(0, 10),
        dateIssued: new Date().toISOString().slice(0, 10),
        passwordHash,
        active: true,
      });
      logger.info({ email: adminEmail }, "Seeded default Vocalis admin user");
    } else {
      // Ensure admin password, role, and active status are always up to date
      await db
        .update(usersTable)
        .set({
          role: "admin",
          active: true,
          passwordHash,
        })
        .where(eq(usersTable.id, existing.id));
      logger.info({ email: adminEmail }, "Synchronized Vocalis admin user credentials");
    }
  } catch (err) {
    logger.warn({ err }, "Admin seeding skipped or already completed");
  }
}
