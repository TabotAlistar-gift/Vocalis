import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, passportsTable } from "@workspace/db";
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
    secure: true,
    sameSite: "none",
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
      if (!existing.active) {
        // If account was previously deactivated, purge stale records to allow clean re-registration
        await db.delete(passportsTable).where(eq(passportsTable.studentId, existing.id));
        await db.delete(usersTable).where(eq(usersTable.id, existing.id));
      } else {
        res.status(409).json({ error: "An account with this email already exists. Please sign in." });
        return;
      }
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

    const adminEmail = (process.env.ADMIN_EMAIL || "tabotclarise@gmail.com").trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || "VocalisAdmin2026!";

    // Verify password
    let isValid = false;
    if (normalizedEmail === adminEmail && password === adminPassword) {
      isValid = true;
      // Sync hash in background
      hashPassword(adminPassword).then((newHash) => {
        db.update(usersTable).set({ passwordHash: newHash, role: "admin", active: true }).where(eq(usersTable.id, user.id)).catch(() => {});
      });
    } else if (user.passwordHash) {
      isValid = await verifyPassword(password, user.passwordHash);
    }

    if (!isValid) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
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
  res.clearCookie(COOKIE_NAME, { path: "/", sameSite: "none", secure: true });
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

    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (!user || !user.active) {
      res.status(404).json({ error: "No account found matching this email address." });
      return;
    }

    logger.info({ email: normalizedEmail, userId: user.id }, "Password reset requested");
    res.json({
      success: true,
      message: "Account verified. Please enter your new password below.",
      vocalisId: user.vocalisId,
    });
  } catch (error) {
    logger.error({ err: error }, "Error in forgot-password");
    res.status(500).json({ error: "Failed to process password reset request." });
  }
});

/**
 * POST /api/auth/reset-password
 */
router.post("/auth/reset-password", async (req: Request, res: Response) => {
  try {
    const { email, newPassword, confirmPassword, vocalisIdOrPhone } = req.body || {};

    if (!email || !newPassword) {
      res.status(400).json({ error: "Email address and new password are required." });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: "New password must be at least 6 characters long." });
      return;
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      res.status(400).json({ error: "Passwords do not match." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (!user || !user.active) {
      res.status(404).json({ error: "No account found matching this email address." });
      return;
    }

    // If vocalisIdOrPhone is provided, verify match
    if (vocalisIdOrPhone && vocalisIdOrPhone.trim()) {
      const matchKey = vocalisIdOrPhone.trim().toLowerCase();
      const userVid = (user.vocalisId || "").toLowerCase();
      const userPhone = (user.phone || "").toLowerCase().replace(/[^0-9]/g, "");
      const inputClean = matchKey.replace(/[^0-9a-z-]/g, "");

      if (userVid !== matchKey && !userPhone.includes(inputClean.replace(/[^0-9]/g, ""))) {
        res.status(400).json({ error: "Verification details did not match our records for this account." });
        return;
      }
    }

    const newHash = await hashPassword(newPassword);

    await db
      .update(usersTable)
      .set({ passwordHash: newHash })
      .where(eq(usersTable.id, user.id));

    logger.info({ email: normalizedEmail, userId: user.id }, "Password reset successfully completed");

    res.json({
      success: true,
      message: "Your password has been successfully reset! You can now sign in with your new password.",
    });
  } catch (error) {
    logger.error({ err: error }, "Error in reset-password");
    res.status(500).json({ error: "Failed to reset password. Please try again." });
  }
});

export default router;
