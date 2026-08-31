import { defineConfig } from "drizzle-kit";

// drizzle-kit auto-loads .env from the current working directory
const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_RkfpBxw1z6jb@ep-bold-mouse-a5tlgen1-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
