import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  COOKIE_NAME,
  requireAuth,
} from "../lib/auth";
import { generateVocalisId } from "../lib/idGenerator";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Helper to set session cookie & return response
 */
function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

/**
 * POST /api/auth/register
 */
router.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const { fullName, email, phone, password, confirmPassword } = req.body || {};

    if (!fullName || !email || !password) {
      res.status(400).json({ error: "Full name, email, and password are required." });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters long." });
      return;
    }

    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({ error: "Passwords do not match." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already exists
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "An account with this email already exists. Please sign in." });
      return;
    }

    const vocalisId = await generateVocalisId();
    const passwordHash = await hashPassword(password);
    const dateJoined = new Date().toISOString().slice(0, 10);

    const [newUser] = await db
      .insert(usersTable)
      .values({
        fullName: fullName.trim(),
        email: normalizedEmail,
        phone: (phone || "").trim(),
        vocalisId,
        passwordHash,
        level: "Level One",
        badge: "Explorer",
        dateJoined,
        passportStatus: "draft",
        role: "student",
        active: true,
      })
      .returning();

    const token = createSessionToken(newUser);
    setAuthCookie(res, token);

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        fullName: newUser.fullName,
        email: newUser.email,
        vocalisId: newUser.vocalisId,
        role: newUser.role,
        level: newUser.level,
        badge: newUser.badge,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error during registration");
    res.status(500).json({ error: "Failed to register account. Please try again." });
  }
});

/**
 * POST /api/auth/login
 */
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (!user || !user.active) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    // Verify password if passwordHash is stored
    if (user.passwordHash) {
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: "Invalid email or password." });
        return;
      }
    }

    const token = createSessionToken(user);
    setAuthCookie(res, token);

    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        vocalisId: user.vocalisId,
        role: user.role,
        level: user.level,
        badge: user.badge,
        profilePhotoPath: user.profilePhotoPath,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error during login");
    res.status(500).json({ error: "Failed to log in. Please try again." });
  }
});

/**
 * POST /api/auth/logout
 */
router.post("/auth/logout", (req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ message: "Logged out successfully" });
});

/**
 * GET /api/auth/me
 */
router.get("/auth/me", requireAuth, (req: Request, res: Response) => {
  const user = req.user!;
  res.json({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    vocalisId: user.vocalisId,
    level: user.level,
    badge: user.badge,
    role: user.role,
    passportStatus: user.passportStatus,
    profilePhotoUrl: user.profilePhotoPath
      ? user.profilePhotoPath.startsWith("http") || user.profilePhotoPath.startsWith("data:")
        ? user.profilePhotoPath
        : `/api/storage/objects/${user.profilePhotoPath.replace(/^\/+/, "")}`
      : null,
    dateJoined: user.dateJoined,
    dateIssued: user.dateIssued,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

/**
 * POST /api/auth/forgot-password
 */
router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      res.status(400).json({ error: "Email address is required." });
      return;
    }

    // Always respond with success message for security/privacy
    logger.info({ email }, "Password reset requested");
    res.json({ message: "If an account exists with that email, reset instructions have been dispatched." });
  } catch (error) {
    logger.error({ err: error }, "Error in forgot-password");
    res.status(500).json({ error: "Failed to process password reset." });
  }
});

export default router;
