import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// One .env for the whole repository, at the root (iSmile-CRM/.env).
config({ path: "../.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // process.env (not env()) so `prisma generate` works without a database URL.
    url: process.env.DATABASE_URL ?? "",
  },
});
