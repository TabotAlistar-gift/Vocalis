import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const passportsTable = pgTable("passports", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("active"),
});

export const insertPassportSchema = createInsertSchema(passportsTable).omit({
  id: true,
  generatedAt: true,
});
export type InsertPassport = z.infer<typeof insertPassportSchema>;
export type Passport = typeof passportsTable.$inferSelect;
