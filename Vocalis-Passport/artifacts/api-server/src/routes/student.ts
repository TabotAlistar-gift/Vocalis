import fs from "fs";
import path from "path";
import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { db, usersTable, passportsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { generatePassportPdf } from "../lib/pdfGenerator";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Configure local uploads directory
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, and WebP image files are allowed."));
    }
  },
});

function formatProfileUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http") || pathOrUrl.startsWith("data:")) return pathOrUrl;
  return `/api/storage/objects/${pathOrUrl.replace(/^\/+/, "")}`;
}

function calculateProfileCompletion(user: typeof usersTable.$inferSelect): number {
  let score = 0;
  if (user.fullName && user.fullName.trim().length > 0) score += 25;
  if (user.email && user.email.trim().length > 0) score += 25;
  if (user.phone && user.phone.trim().length > 0) score += 25;
  if (user.profilePhotoPath && user.profilePhotoPath.trim().length > 0) score += 25;
  return score;
}

/**
 * GET /api/student/dashboard
 */
router.get("/student/dashboard", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    const [passport] = await db
      .select()
      .from(passportsTable)
      .where(eq(passportsTable.studentId, user.id))
      .limit(1);

    const profileCompletion = calculateProfileCompletion(user);

    res.json({
      student: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        vocalisId: user.vocalisId,
        level: user.level,
        badge: user.badge,
        passportStatus: user.passportStatus,
        profilePhotoUrl: formatProfileUrl(user.profilePhotoPath),
        dateJoined: user.dateJoined,
        dateIssued: user.dateIssued,
      },
      passport: passport
        ? {
            id: passport.id,
            studentId: passport.studentId,
            fullName: user.fullName,
            vocalisId: user.vocalisId,
            level: user.level,
            badge: user.badge,
            dateJoined: user.dateJoined,
            dateIssued: user.dateIssued || passport.generatedAt.toISOString().slice(0, 10),
            status: passport.status,
            generatedAt: passport.generatedAt,
            profilePhotoUrl: formatProfileUrl(user.profilePhotoPath),
          }
        : null,
      profileCompletion,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching student dashboard");
    res.status(500).json({ error: "Failed to load dashboard." });
  }
});

/**
 * GET /api/student/profile
 */
router.get("/student/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    res.json({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      vocalisId: user.vocalisId,
      level: user.level,
      badge: user.badge,
      passportStatus: user.passportStatus,
      profilePhotoUrl: formatProfileUrl(user.profilePhotoPath),
      dateJoined: user.dateJoined,
      dateIssued: user.dateIssued,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching student profile");
    res.status(500).json({ error: "Failed to load profile." });
  }
});

/**
 * PATCH /api/student/profile
 */
router.patch("/student/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { fullName, phone, level, badge, dateJoined } = req.body || {};

    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (fullName !== undefined) updates.fullName = fullName.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (level !== undefined) updates.level = level;
    if (badge !== undefined) updates.badge = badge;
    if (dateJoined !== undefined) updates.dateJoined = dateJoined;

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, user.id))
      .returning();

    res.json({
      id: updated.id,
      fullName: updated.fullName,
      email: updated.email,
      phone: updated.phone,
      vocalisId: updated.vocalisId,
      level: updated.level,
      badge: updated.badge,
      passportStatus: updated.passportStatus,
      profilePhotoUrl: formatProfileUrl(updated.profilePhotoPath),
      dateJoined: updated.dateJoined,
      dateIssued: updated.dateIssued,
    });
  } catch (error) {
    logger.error({ err: error }, "Error updating student profile");
    res.status(500).json({ error: "Failed to update profile." });
  }
});

/**
 * POST /api/student/photo
 */
router.post("/student/photo", requireAuth, upload.single("photo"), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    let buffer: Buffer | null = null;

    if (req.file) {
      buffer = req.file.buffer || fs.readFileSync(req.file.path);
    } else if (req.body && req.body.photoBase64) {
      const base64Str = req.body.photoBase64.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64Str, "base64");
    }

    if (!buffer) {
      res.status(400).json({ error: "No image file provided." });
      return;
    }

    // Process & crop to standard portrait aspect ratio (3:4) with sharp
    const filename = `portrait-${user.vocalisId}-${Date.now()}.jpg`;
    const filepath = path.join(UPLOADS_DIR, filename);

    await sharp(buffer)
      .resize(600, 800, { fit: "cover", position: "center" })
      .jpeg({ quality: 92 })
      .toFile(filepath);

    const relativePath = `uploads/${filename}`;

    const [updated] = await db
      .update(usersTable)
      .set({ profilePhotoPath: relativePath })
      .where(eq(usersTable.id, user.id))
      .returning();

    res.json({
      id: updated.id,
      fullName: updated.fullName,
      email: updated.email,
      phone: updated.phone,
      vocalisId: updated.vocalisId,
      level: updated.level,
      badge: updated.badge,
      passportStatus: updated.passportStatus,
      profilePhotoUrl: `/api/storage/objects/${relativePath}`,
      dateJoined: updated.dateJoined,
      dateIssued: updated.dateIssued,
    });
  } catch (error) {
    logger.error({ err: error }, "Error uploading profile photo");
    res.status(500).json({ error: "Failed to process and save portrait." });
  }
});

/**
 * GET /api/student/passport
 */
router.get("/student/passport", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    const [passport] = await db
      .select()
      .from(passportsTable)
      .where(eq(passportsTable.studentId, user.id))
      .limit(1);

    if (!passport) {
      res.json(null);
      return;
    }

    res.json({
      id: passport.id,
      studentId: passport.studentId,
      fullName: user.fullName,
      vocalisId: user.vocalisId,
      level: user.level,
      badge: user.badge,
      dateJoined: user.dateJoined,
      dateIssued: user.dateIssued || passport.generatedAt.toISOString().slice(0, 10),
      status: passport.status,
      generatedAt: passport.generatedAt,
      profilePhotoUrl: formatProfileUrl(user.profilePhotoPath),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching student passport");
    res.status(500).json({ error: "Failed to load passport." });
  }
});

/**
 * POST /api/student/passport
 */
router.post("/student/passport", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const today = new Date().toISOString().slice(0, 10);

    // Update user passportStatus and dateIssued if not set
    await db
      .update(usersTable)
      .set({
        passportStatus: "active",
        dateIssued: user.dateIssued || today,
      })
      .where(eq(usersTable.id, user.id));

    // Upsert passport record
    const [existing] = await db
      .select()
      .from(passportsTable)
      .where(eq(passportsTable.studentId, user.id))
      .limit(1);

    let passportRecord;
    if (existing) {
      [passportRecord] = await db
        .update(passportsTable)
        .set({
          status: "active",
          generatedAt: new Date(),
        })
        .where(eq(passportsTable.id, existing.id))
        .returning();
    } else {
      [passportRecord] = await db
        .insert(passportsTable)
        .values({
          studentId: user.id,
          status: "active",
          generatedAt: new Date(),
        })
        .returning();
    }

    res.json({
      id: passportRecord.id,
      studentId: user.id,
      fullName: user.fullName,
      vocalisId: user.vocalisId,
      level: user.level,
      badge: user.badge,
      dateJoined: user.dateJoined,
      dateIssued: user.dateIssued || today,
      status: "active",
      generatedAt: passportRecord.generatedAt,
      profilePhotoUrl: formatProfileUrl(user.profilePhotoPath),
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating student passport");
    res.status(500).json({ error: "Failed to generate passport." });
  }
});

/**
 * GET /api/student/passport/pdf
 */
router.get("/student/passport/pdf", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    let photoPath = user.profilePhotoPath;
    if (photoPath && !photoPath.startsWith("http") && !photoPath.startsWith("data:")) {
      photoPath = path.resolve(process.cwd(), photoPath.replace(/^\/+/, ""));
    }

    const pdfBuffer = await generatePassportPdf({
      fullName: user.fullName,
      vocalisId: user.vocalisId,
      level: user.level,
      badge: user.badge,
      dateJoined: user.dateJoined,
      dateIssued: user.dateIssued || new Date().toISOString().slice(0, 10),
      profilePhotoPath: photoPath,
    });

    const filename = `Vocalis_Passport_${user.vocalisId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    logger.error({ err: error }, "Error creating passport PDF");
    res.status(500).json({ error: "Failed to generate passport PDF." });
  }
});

export default router;
