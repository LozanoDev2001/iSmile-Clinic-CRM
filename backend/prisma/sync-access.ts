// Re-syncs permission rows and system role templates from src/config/access.ts without touching other data.
import { config } from "dotenv";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedAccessModel } from "./seed-access";

config({ path: "../.env" });

const url = new URL(process.env.DATABASE_URL ?? "");
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 2,
  }),
});

seedAccessModel(prisma)
  .then(() => console.log("Access model synced."))
  .finally(() => prisma.$disconnect());
