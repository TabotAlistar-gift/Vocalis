import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRole = pgEnum("user_role", ["student", "admin"]);
export const passportStatus = pgEnum("passport_status", ["draft", "active"]);

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").unique(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    vocalisId: text("vocalis_id").notNull().unique(),
    profilePhotoPath: text("profile_photo_path"),
    level: text("level").notNull().default("Level One"),
    badge: text("badge").notNull().default("Explorer"),
    dateJoined: date("date_joined", { mode: "string" }).notNull(),
    dateIssued: date("date_issued", { mode: "string" }),
    passportStatus: passportStatus("passport_status").notNull().default("draft"),
    role: userRole("role").notNull().default("student"),
    active: boolean("active").notNull().default(true),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  }),
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
