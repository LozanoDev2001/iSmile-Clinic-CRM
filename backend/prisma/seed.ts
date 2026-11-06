/**
 * Development seed: one clinic, two branches, one user per role, a few
 * patients. Run with `npm run db:seed`. Refuses to run in production.
 *
 * All seeded users share SEED_PASSWORD (required, min 12 chars).
 */
import { config } from "dotenv";
import { hash } from "@node-rs/argon2";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, type Role } from "../src/generated/prisma/client";

// Single .env at the repository root.
config({ path: "../.env" });

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed a production database.");
}
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12) {
  throw new Error("Set SEED_PASSWORD (at least 12 characters) before seeding.");
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

async function main() {
  const passwordHash = await hash(password!, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  const clinic = await prisma.clinic.upsert({
    where: { id: "cseedclinic00000000000001" },
    update: {},
    create: { id: "cseedclinic00000000000001", name: "iSmile Downtown" },
  });
  const [main, north] = await Promise.all(
    [
      { id: "cseedbranch00000000000001", name: "Main Street" },
      { id: "cseedbranch00000000000002", name: "North Plaza" },
    ].map((b) =>
      prisma.branch.upsert({ where: { id: b.id }, update: {}, create: { ...b, clinicId: clinic.id } }),
    ),
  );

  const users: { email: string; name: string; role: Role; branches: string[] }[] = [
    { email: "superadmin@ismile.test", name: "Sam Super", role: "SUPER_ADMIN", branches: [] },
    { email: "admin@ismile.test", name: "Alex Admin", role: "CLINIC_ADMIN", branches: [] },
    { email: "dentist@ismile.test", name: "Dana Dentist", role: "DENTIST", branches: [main.id] },
    { email: "reception@ismile.test", name: "Riley Reception", role: "RECEPTIONIST", branches: [main.id, north.id] },
    { email: "finance@ismile.test", name: "Frankie Finance", role: "FINANCE_STAFF", branches: [main.id] },
    { email: "crm@ismile.test", name: "Casey CRM", role: "CRM_STAFF", branches: [north.id] },
  ];

  const created: Record<string, string> = {};
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
        clinicId: u.role === "SUPER_ADMIN" ? null : clinic.id,
        branches: { create: u.branches.map((branchId) => ({ branchId })) },
      },
    });
    created[u.role] = user.id;
  }

  const patientCount = await prisma.patient.count({ where: { clinicId: clinic.id } });
  if (patientCount === 0) {
    await prisma.patient.createMany({
      data: [
        { clinicId: clinic.id, branchId: main.id, firstName: "Maria", lastName: "Lopez", phone: "+1555010001", primaryDentistId: created.DENTIST, allergies: "Penicillin" },
        { clinicId: clinic.id, branchId: main.id, firstName: "John", lastName: "Smith", phone: "+1555010002" },
        { clinicId: clinic.id, branchId: north.id, firstName: "Aiko", lastName: "Tanaka", phone: "+1555010003" },
      ],
    });
  }

  console.log(`Seeded clinic "${clinic.name}" with ${users.length} users (password from SEED_PASSWORD).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
