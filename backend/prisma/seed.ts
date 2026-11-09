/**
 * Development seed: permissions, the system roles and their templates, one
 * clinic, the owner account, a few patients and the price list. Run with `npm run db:seed`.
 * Safe to re-run. Refuses to run in production.
 */
import { config } from "dotenv";
import { hash } from "@node-rs/argon2";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_ACCOUNT, DEMO_STAFF } from "../src/features/auth/demo-credentials";
import { addDays, clinicInstant, clinicToday } from "../src/config/clinic";
import { WEEKDAYS } from "../src/features/settings/settings.schema";
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

// [code, name, price before VAT, tax type, HMO can cover it]
const PRICE_LIST: [string, string, number, "exempt" | "vat", boolean][] = [
  ["CONS", "Consultation and oral examination", 500, "exempt", true],
  ["PROPH", "Oral prophylaxis (cleaning)", 1300, "exempt", true],
  ["PCLN", "Pediatric oral prophylaxis", 1500, "exempt", true],
  ["FLUO", "Fluoride varnish application", 800, "exempt", true],
  ["SEAL", "Pit and fissure sealant", 700, "exempt", true],
  ["FIL1", "Composite restoration, 1 surface", 1500, "exempt", true],
  ["FIL2", "Composite restoration, 2 surfaces", 2200, "exempt", true],
  ["EXT", "Simple extraction", 1200, "exempt", true],
  ["SEXT", "Surgical extraction, impacted tooth", 9000, "exempt", false],
  ["RCT", "Root canal treatment, molar", 14000, "exempt", false],
  ["CRWN", "Porcelain-fused-to-metal crown", 14500, "exempt", false],
  ["PA", "Periapical X-ray", 500, "exempt", true],
  ["PANO", "Panoramic X-ray", 1500, "exempt", false],
  ["EMER", "Emergency consultation", 1000, "exempt", true],
  ["OCON", "Orthodontic consultation and records", 800, "exempt", false],
  ["OADJ", "Orthodontic treatment, monthly adjustment", 3500, "exempt", false],
  ["ALN", "Clear aligner treatment, monthly", 5000, "exempt", false],
  ["RET", "Orthodontic retainer, per arch", 6500, "exempt", false],
  ["WHT", "In-office teeth whitening", 12000, "exempt", false],
  ["VEN", "Porcelain veneer, per unit", 15000, "exempt", false],
  ["MED", "Prescribed medicine, pain relief", 450, "vat", false],
  ["MED2", "Prescribed medicine, antibiotic course", 1000, "vat", false],
  ["KIT", "Post-surgery aftercare kit", 560, "vat", false],
  ["BRUSH", "iSmile oral care kit", 280, "vat", false],
];

// Usual visit length in minutes, used to book appointments.
const DURATIONS: Record<string, number> = {
  CONS: 30, PROPH: 60, PCLN: 60, FLUO: 30, SEAL: 30, FIL1: 60, FIL2: 60, EXT: 60, SEXT: 90, RCT: 90,
  CRWN: 90, PA: 15, PANO: 15, EMER: 30, OCON: 60, OADJ: 30, ALN: 30, RET: 30, WHT: 90, VEN: 120,
};

async function seedPriceList(clinicId: string) {
  if ((await prisma.service.count({ where: { clinicId } })) > 0) return;
  await prisma.service.createMany({
    data: PRICE_LIST.map(([code, name, price, taxType, hmoCoverable]) => ({ clinicId, code, name, price, taxType, hmoCoverable })),
  });
}

async function seedDurations(clinicId: string) {
  for (const [code, durationMinutes] of Object.entries(DURATIONS)) {
    await prisma.service.updateMany({ where: { clinicId, code, durationMinutes: null }, data: { durationMinutes } });
  }
}

/** Opening hours Mon–Sat 09:00–18:00 when the clinic profile has none yet. */
async function seedClinicHours(clinicId: string) {
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { settings: true } });
  const settings = (clinic.settings ?? {}) as Record<string, unknown>;
  if (settings.profile) return;
  const hours = WEEKDAYS.map((day) => ({ day, closed: day === "Sun", open: "09:00", close: "18:00" }));
  await prisma.clinic.update({ where: { id: clinicId }, data: { settings: { ...settings, profile: { tagline: "", phone: "", address: "", hours } } } });
}

/** A few appointments today and tomorrow with the demo dentist, so the calendar has something to show. */
async function seedAppointments(clinicId: string, createdById: string) {
  if ((await prisma.appointment.count({ where: { clinicId } })) > 0) return;
  const dentist = await prisma.user.findFirst({ where: { clinicId, email: DEMO_STAFF[0].email }, select: { id: true } });
  const patients = await prisma.patient.findMany({ where: { clinicId }, select: { id: true }, orderBy: { patientNo: "asc" }, take: 3 });
  if (!dentist || patients.length < 3) return;
  const today = clinicToday();
  const slots: [string, number, string, number][] = [
    [today, 9 * 60, "CONS", 0],
    [today, 10 * 60, "PROPH", 1],
    [today, 14 * 60, "FIL1", 2],
    [addDays(today, 1), 9 * 60 + 30, "PROPH", 0],
  ];
  for (const [date, start, code, p] of slots) {
    const service = await prisma.service.findFirst({ where: { clinicId, code }, select: { id: true, durationMinutes: true } });
    await prisma.appointment.create({
      data: {
        clinicId,
        patientId: patients[p].id,
        dentistId: dentist.id,
        serviceId: service?.id,
        startsAt: clinicInstant(date, start),
        endsAt: clinicInstant(date, start + (service?.durationMinutes ?? 30)),
        bookingSource: "front_desk",
        createdById,
      },
    });
  }
}

const HMOS = ["Intellicare", "Maxicare", "MediCard", "PhilCare"];

async function seedHmos(clinicId: string) {
  if ((await prisma.payer.count({ where: { clinicId, payerType: "hmo" } })) > 0) return;
  await prisma.payer.createMany({ data: HMOS.map((name) => ({ clinicId, name, payerType: "hmo" })) });
}

async function seedStaff(clinicId: string, passwordHash: string, roleIds: Awaited<ReturnType<typeof seedAccessModel>>) {
  for (const staff of DEMO_STAFF) {
    const user = await prisma.user.upsert({
      where: { clinicId_email: { clinicId, email: staff.email } },
      update: { passwordHash, status: "active" },
      create: { clinicId, email: staff.email, fullName: staff.name, staffCode: staff.staffCode, status: "active", passwordHash },
      select: { id: true },
    });
    const roleId = roleIds.get(staff.role)!;
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId } }, update: {}, create: { userId: user.id, roleId } });
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
  await seedPriceList(clinic.id);
  await seedDurations(clinic.id);
  await seedClinicHours(clinic.id);
  await seedHmos(clinic.id);
  await seedStaff(clinic.id, passwordHash, roleIds);
  await seedAppointments(clinic.id, owner.id);
  console.log(`Seeded clinic "${clinic.name}", ${roleIds.size} roles, owner ${DEMO_ACCOUNT.email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
