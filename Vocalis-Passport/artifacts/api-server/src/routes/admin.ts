import path from "path";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, passportsTable } from "@workspace/db";
import { eq, ilike, or, desc, and } from "drizzle-orm";
import { requireAdmin, extractToken, verifySessionToken } from "../lib/auth";
import { generatePassportPdf } from "../lib/pdfGenerator";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatProfileUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http") || pathOrUrl.startsWith("data:")) return pathOrUrl;
  return `/api/storage/objects/${pathOrUrl.replace(/^\/+/, "")}`;
}

/**
 * GET /api/admin/students
 */
router.get("/admin/students", requireAdmin, async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    let students;
    if (search) {
      const searchPattern = `%${search}%`;
      students = await db
        .select()
        .from(usersTable)
        .where(
          and(
            eq(usersTable.role, "student"),
            or(
              ilike(usersTable.fullName, searchPattern),
              ilike(usersTable.email, searchPattern),
              ilike(usersTable.vocalisId, searchPattern)
            )
          )
        )
        .orderBy(desc(usersTable.id));
    } else {
      students = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.role, "student"))
        .orderBy(desc(usersTable.id));
    }

    const formatted = students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      phone: s.phone,
      vocalisId: s.vocalisId,
      level: s.level,
      badge: s.badge,
      role: s.role,
      passportStatus: s.passportStatus,
      profilePhotoUrl: formatProfileUrl(s.profilePhotoPath),
      dateJoined: s.dateJoined,
      dateIssued: s.dateIssued,
      active: s.active,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    res.json(formatted);
  } catch (error) {
    logger.error({ err: error }, "Error fetching admin students");
    res.status(500).json({ error: "Failed to load students." });
  }
});

/**
 * GET /api/admin/students/:id
 */
router.get("/admin/students/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = parseInt(req.params["id"] as string, 10);
    if (isNaN(studentId)) {
      res.status(400).json({ error: "Invalid student ID." });
      return;
    }

    const [student] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, studentId))
      .limit(1);

    if (!student) {
      res.status(404).json({ error: "Student not found." });
      return;
    }

    res.json({
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      phone: student.phone,
      vocalisId: student.vocalisId,
      level: student.level,
      badge: student.badge,
      role: student.role,
      passportStatus: student.passportStatus,
      profilePhotoUrl: formatProfileUrl(student.profilePhotoPath),
      dateJoined: student.dateJoined,
      dateIssued: student.dateIssued,
      active: student.active,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching student details");
    res.status(500).json({ error: "Failed to load student." });
  }
});

/**
 * PATCH /api/admin/students/:id
 */
router.patch("/admin/students/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = parseInt(req.params["id"] as string, 10);
    if (isNaN(studentId)) {
      res.status(400).json({ error: "Invalid student ID." });
      return;
    }

    const { fullName, phone, level, badge, dateJoined, dateIssued, active } = req.body || {};

    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (fullName !== undefined) updates.fullName = fullName.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (level !== undefined) updates.level = level;
    if (badge !== undefined) updates.badge = badge;
    if (dateJoined !== undefined) updates.dateJoined = dateJoined;
    if (dateIssued !== undefined) updates.dateIssued = dateIssued;
    if (active !== undefined) updates.active = active;

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, studentId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Student not found." });
      return;
    }

    res.json({
      id: updated.id,
      fullName: updated.fullName,
      email: updated.email,
      phone: updated.phone,
      vocalisId: updated.vocalisId,
      level: updated.level,
      badge: updated.badge,
      role: updated.role,
      passportStatus: updated.passportStatus,
      profilePhotoUrl: formatProfileUrl(updated.profilePhotoPath),
      dateJoined: updated.dateJoined,
      dateIssued: updated.dateIssued,
      active: updated.active,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    logger.error({ err: error }, "Error updating student by admin");
    res.status(500).json({ error: "Failed to update student." });
  }
});

/**
 * POST /api/admin/students/:id/passport
 */
router.post("/admin/students/:id/passport", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = parseInt(req.params["id"] as string, 10);
    if (isNaN(studentId)) {
      res.status(400).json({ error: "Invalid student ID." });
      return;
    }

    const [student] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, studentId))
      .limit(1);

    if (!student) {
      res.status(404).json({ error: "Student not found." });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    // Update user passportStatus
    await db
      .update(usersTable)
      .set({
        passportStatus: "active",
        dateIssued: student.dateIssued || today,
      })
      .where(eq(usersTable.id, studentId));

    // Upsert passport
    const [existing] = await db
      .select()
      .from(passportsTable)
      .where(eq(passportsTable.studentId, studentId))
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
          studentId,
          status: "active",
          generatedAt: new Date(),
        })
        .returning();
    }

    res.json({
      id: passportRecord.id,
      studentId: student.id,
      fullName: student.fullName,
      vocalisId: student.vocalisId,
      level: student.level,
      badge: student.badge,
      dateJoined: student.dateJoined,
      dateIssued: student.dateIssued || today,
      status: "active",
      generatedAt: passportRecord.generatedAt,
      profilePhotoUrl: formatProfileUrl(student.profilePhotoPath),
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating passport by admin");
    res.status(500).json({ error: "Failed to generate passport." });
  }
});

/**
 * GET /api/admin/students/:id/passport/pdf
 */
router.get("/admin/students/:id/passport/pdf", async (req: Request, res: Response) => {
  try {
    // Authenticate admin from request user or direct token parameter
    let adminUser = req.user;
    if (!adminUser) {
      const token = extractToken(req);
      if (token) {
        const payload = verifySessionToken(token);
        if (payload) {
          const [found] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, payload.userId))
            .limit(1);
          if (found && found.active && found.role === "admin") {
            adminUser = found;
          }
        }
      }
    }

    if (!adminUser || adminUser.role !== "admin") {
      res.status(401).json({ error: "Founder or Admin authentication required." });
      return;
    }

    const studentId = parseInt(req.params["id"] as string, 10);
    if (isNaN(studentId)) {
      res.status(400).json({ error: "Invalid student ID." });
      return;
    }

    const [student] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, studentId))
      .limit(1);

    if (!student) {
      res.status(404).json({ error: "Student not found." });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const dateIssued = student.dateIssued || today;

    // Automatically ensure student's passportStatus is set to 'active'
    if (student.passportStatus !== "active" || !student.dateIssued) {
      await db
        .update(usersTable)
        .set({
          passportStatus: "active",
          dateIssued,
        })
        .where(eq(usersTable.id, studentId));
    }

    // Upsert passport record
    const [existingPassport] = await db
      .select()
      .from(passportsTable)
      .where(eq(passportsTable.studentId, studentId))
      .limit(1);

    if (existingPassport) {
      await db
        .update(passportsTable)
        .set({ status: "active", generatedAt: new Date() })
        .where(eq(passportsTable.id, existingPassport.id));
    } else {
      await db.insert(passportsTable).values({
        studentId,
        status: "active",
        generatedAt: new Date(),
      });
    }

    let photoPath = student.profilePhotoPath;
    if (photoPath && !photoPath.startsWith("http") && !photoPath.startsWith("data:")) {
      photoPath = path.resolve(process.cwd(), photoPath.replace(/^\/+/, ""));
    }

    const pdfBuffer = await generatePassportPdf({
      fullName: student.fullName,
      vocalisId: student.vocalisId,
      level: student.level,
      badge: student.badge,
      dateJoined: student.dateJoined,
      dateIssued,
      profilePhotoPath: photoPath,
    });

    const filename = `Vocalis_Passport_${student.vocalisId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    logger.error({ err: error }, "Error creating passport PDF for admin");
    res.status(500).json({ error: "Failed to generate passport PDF." });
  }
});

/**
 * POST /api/admin/reset-database
 * Clears all student accounts and passports, keeping admin intact.
 */
router.post("/admin/reset-database", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const deletedPassports = await db.delete(passportsTable).returning();
    const deletedStudents = await db.delete(usersTable).where(eq(usersTable.role, "student")).returning();

    logger.info(
      { deletedPassports: deletedPassports.length, deletedStudents: deletedStudents.length },
      "Database cleared by admin"
    );

    res.json({
      success: true,
      message: `Database cleared. Removed ${deletedStudents.length} students and ${deletedPassports.length} passports.`,
    });
  } catch (error) {
    logger.error({ err: error }, "Error clearing database");
    res.status(500).json({ error: "Failed to reset database." });
  }
});

/**
 * POST /api/admin/students/:id/deactivate
 */
router.post("/admin/students/:id/deactivate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = parseInt(req.params["id"] as string, 10);
    if (isNaN(studentId)) {
      res.status(400).json({ error: "Invalid student ID." });
      return;
    }

    // Delete associated passport
    await db.delete(passportsTable).where(eq(passportsTable.studentId, studentId));

    // Delete the student user record completely so email and credentials are fully freed
    const [deleted] = await db
      .delete(usersTable)
      .where(eq(usersTable.id, studentId))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Student not found." });
      return;
    }

    res.json({
      success: true,
      message: "Student account deleted and email credentials freed.",
      student: deleted,
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting student account");
    res.status(500).json({ error: "Failed to delete student account." });
  }
});

export default router;
