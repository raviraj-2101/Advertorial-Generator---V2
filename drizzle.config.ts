import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  "";

if (!url) {
  console.warn(
    "[drizzle.config] SUPABASE_DB_URL / DATABASE_URL not set — `npm run db:push` will fail until you add one.",
  );
}

export default defineConfig({
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
