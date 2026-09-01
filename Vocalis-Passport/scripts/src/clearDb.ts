import { db, usersTable, passportsTable } from "@workspace/db";
import { eq, ne } from "drizzle-orm";
import crypto from "crypto";

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function main() {
  console.log("Starting database cleanup...");

  // 1. Delete all passports
  const deletedPassports = await db.delete(passportsTable).returning();
  console.log(`Deleted ${deletedPassports.length} passports.`);

  // 2. Delete all non-admin users
  const deletedUsers = await db
    .delete(usersTable)
    .where(ne(usersTable.role, "admin"))
    .returning();
  console.log(`Deleted ${deletedUsers.length} student records.`);

  // 3. Ensure the admin user exists and is up to date
  const adminEmail = (process.env.ADMIN_EMAIL || "tabotclarise@gmail.com").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "VocalisAdmin2026!";
  const passwordHash = await hashPassword(adminPassword);

  const [existingAdmin] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, adminEmail))
    .limit(1);

  if (!existingAdmin) {
    const [newAdmin] = await db
      .insert(usersTable)
      .values({
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
      })
      .returning();
    console.log(`Created admin account: ${newAdmin.email}`);
  } else {
    await db
      .update(usersTable)
      .set({
        role: "admin",
        active: true,
        passwordHash,
        dateIssued: existingAdmin.dateIssued || new Date().toISOString().slice(0, 10),
      })
      .where(eq(usersTable.id, existingAdmin.id));
    console.log(`Updated and synchronized admin account: ${existingAdmin.email}`);
  }

  // Print remaining users
  const allUsers = await db.select({ id: usersTable.id, email: usersTable.email, role: usersTable.role }).from(usersTable);
  console.log("Current users in database:", allUsers);

  console.log("Database cleared and initialized successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error clearing database:", err);
  process.exit(1);
});
