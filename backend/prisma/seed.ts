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

// [code, name, price before VAT, kind, HMO can cover it]
const PRICE_LIST: [string, string, number, "service" | "product", boolean][] = [
  ["CONS", "Consultation and oral examination", 500, "service", true],
  ["PROPH", "Oral prophylaxis (cleaning)", 1300, "service", true],
  ["PCLN", "Pediatric oral prophylaxis", 1500, "service", true],
  ["FLUO", "Fluoride varnish application", 800, "service", true],
  ["SEAL", "Pit and fissure sealant", 700, "service", true],
  ["FIL1", "Composite restoration, 1 surface", 1500, "service", true],
  ["FIL2", "Composite restoration, 2 surfaces", 2200, "service", true],
  ["EXT", "Simple extraction", 1200, "service", true],
  ["SEXT", "Surgical extraction, impacted tooth", 9000, "service", false],
  ["RCT", "Root canal treatment, molar", 14000, "service", false],
  ["CRWN", "Porcelain-fused-to-metal crown", 14500, "service", false],
  ["PA", "Periapical X-ray", 500, "service", true],
  ["PANO", "Panoramic X-ray", 1500, "service", false],
  ["EMER", "Emergency consultation", 1000, "service", true],
  ["OCON", "Orthodontic consultation and records", 800, "service", false],
  ["OADJ", "Orthodontic treatment, monthly adjustment", 3500, "service", false],
  ["ALN", "Clear aligner treatment, monthly", 5000, "service", false],
  ["RET", "Orthodontic retainer, per arch", 6500, "service", false],
  ["WHT", "In-office teeth whitening", 12000, "service", false],
  ["VEN", "Porcelain veneer, per unit", 15000, "service", false],
  ["MED", "Prescribed medicine, pain relief", 450, "product", false],
  ["MED2", "Prescribed medicine, antibiotic course", 1000, "product", false],
  ["KIT", "Post-surgery aftercare kit", 560, "product", false],
  ["BRUSH", "iSmile oral care kit", 280, "product", false],
];

// Usual visit length in minutes, used to book appointments.
const DURATIONS: Record<string, number> = {
  CONS: 30, PROPH: 60, PCLN: 60, FLUO: 30, SEAL: 30, FIL1: 60, FIL2: 60, EXT: 60, SEXT: 90, RCT: 90,
  CRWN: 90, PA: 15, PANO: 15, EMER: 30, OCON: 60, OADJ: 30, ALN: 30, RET: 30, WHT: 90, VEN: 120,
};

async function seedPriceList(clinicId: string) {
  if ((await prisma.service.count({ where: { clinicId } })) > 0) return;
  await prisma.service.createMany({
    data: PRICE_LIST.map(([code, name, price, kind, hmoCoverable]) => ({ clinicId, code, name, price, kind, hmoCoverable })),
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

const LEAD_SOURCES = ["Facebook", "Instagram", "Google", "TikTok", "Website", "Messenger", "Viber", "WhatsApp", "Phone call", "Walk-in", "Referral"];

async function seedLeadSources(clinicId: string) {
  await prisma.leadSource.createMany({ data: LEAD_SOURCES.map((name) => ({ clinicId, name })), skipDuplicates: true });
}

/** A few open leads across the pipeline, so the Leads board has something to show. */
async function seedLeads(clinicId: string) {
  if ((await prisma.lead.count({ where: { clinicId } })) > 0) return;
  const frontDesk = await prisma.user.findFirst({ where: { clinicId, email: DEMO_STAFF[1].email }, select: { id: true } });
  const source = async (name: string) => (await prisma.leadSource.findFirst({ where: { clinicId, name }, select: { id: true } }))?.id;
  const service = async (code: string) => (await prisma.service.findFirst({ where: { clinicId, code }, select: { id: true } }))?.id;
  const hour = 3_600_000;
  const samples = [
    { name: "Carla Mendoza", phone: "+63 917 555 0301", src: "Facebook", svc: "ALN", stage: "new", hot: true, msg: "Hi! How much are clear aligners? Do you have installment?" },
    { name: "Paolo Garcia", phone: "+63 918 555 0302", src: "Instagram", svc: "WHT", stage: "new", hot: false, msg: "Interested in whitening before my wedding next month." },
    { name: "Liza Bautista", phone: "+63 919 555 0303", src: "Google", svc: "PROPH", stage: "assigned", hot: false, msg: "Can I book a cleaning this Saturday?" },
    { name: "Mark Villanueva", phone: "+63 920 555 0304", src: "TikTok", svc: "OCON", stage: "follow_up", hot: false, msg: "My son needs braces. What's the process?" },
    { name: "Grace Lim", phone: "+63 921 555 0305", src: "Referral", svc: "VEN", stage: "plan_sent", hot: true, msg: "Referred by my sister. Interested in veneers." },
  ];
  for (const s of samples) {
    const contact = await prisma.contact.create({ data: { clinicId, contactType: "lead", fullName: s.name, phone: s.phone, preferredChannel: "viber" }, select: { id: true } });
    const assigned = s.stage !== "new" && frontDesk;
    await prisma.lead.create({
      data: {
        clinicId,
        contactId: contact.id,
        sourceId: await source(s.src),
        interestedServiceId: await service(s.svc),
        stage: s.stage,
        hot: s.hot,
        message: s.msg,
        assignedToId: assigned ? frontDesk.id : null,
        nextActionAt: assigned ? new Date(Date.now() + 2 * hour) : null,
        leadActivities: { create: { activityType: "created", content: `Lead came in from ${s.src}` } },
      },
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
  await seedPriceList(clinic.id);
  await seedDurations(clinic.id);
  await seedClinicHours(clinic.id);
  await seedHmos(clinic.id);
  await seedStaff(clinic.id, passwordHash, roleIds);
  await seedAppointments(clinic.id, owner.id);
  await seedLeadSources(clinic.id);
  await seedLeads(clinic.id);
  console.log(`Seeded clinic "${clinic.name}", ${roleIds.size} roles, owner ${DEMO_ACCOUNT.email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
