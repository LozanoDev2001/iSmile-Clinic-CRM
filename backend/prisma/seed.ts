/**
 * Development seed: permissions, the system roles and their templates, one
 * clinic, the owner account and a few patients. Run with `npm run db:seed`.
 * Safe to re-run. Refuses to run in production.
 */
import { config } from "dotenv";
import { hash } from "@node-rs/argon2";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_ACCOUNT } from "../src/features/auth/demo-credentials";
import { DEFAULT_SIGN_IN_RULES } from "../src/features/settings/settings.types";
import { seedAccessModel } from "./seed-access";

// Single .env at the repository root.
config({ path: "../.env" });

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed a production database.");
}

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

const CLINIC_ID = "00000000-0000-4000-8000-000000000001";

async function seedPatients(clinicId: string) {
  if ((await prisma.patient.count({ where: { clinicId } })) > 0) return;
  const samples = [
    { fullName: "Maria Lopez", phone: "+1555010001", medicalAlerts: "Penicillin allergy" },
    { fullName: "John Smith", phone: "+1555010002" },
    { fullName: "Aiko Tanaka", phone: "+1555010003" },
  ];
  for (const [i, s] of samples.entries()) {
    const contact = await prisma.contact.create({
      data: { clinicId, contactType: "patient", fullName: s.fullName, phone: s.phone },
      select: { id: true },
    });
    await prisma.patient.create({
      data: { clinicId, contactId: contact.id, patientNo: `P-${String(i + 1).padStart(4, "0")}`, medicalAlerts: s.medicalAlerts },
    });
  }
}

async function main() {
  const passwordHash = await hash(DEMO_ACCOUNT.password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const roleIds = await seedAccessModel(prisma);

  const clinic = await prisma.clinic.upsert({
    where: { id: CLINIC_ID },
    update: {},
    create: { id: CLINIC_ID, name: "iSmile Downtown", settings: { signIn: DEFAULT_SIGN_IN_RULES } },
    select: { id: true, name: true },
  });

  // Update keeps the stored password in sync when the seed is re-run.
  const owner = await prisma.user.upsert({
    where: { clinicId_email: { clinicId: clinic.id, email: DEMO_ACCOUNT.email } },
    update: { passwordHash, status: "active" },
    create: {
      clinicId: clinic.id,
      email: DEMO_ACCOUNT.email,
      fullName: DEMO_ACCOUNT.name,
      staffCode: "OW-001",
      status: "active",
      passwordHash,
    },
    select: { id: true },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: owner.id, roleId: roleIds.get("OWNER")! } },
    update: {},
    create: { userId: owner.id, roleId: roleIds.get("OWNER")! },
  });

  await seedPatients(clinic.id);
  console.log(`Seeded clinic "${clinic.name}", ${roleIds.size} roles, owner ${DEMO_ACCOUNT.email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
