import "server-only";
import { prisma } from "@backend/lib/prisma";

/** Report queries read whole periods; a clinic's month is small enough to total in code. */
export const reportsRepository = {
  invoices(clinicId: string, from: Date, to: Date) {
    return prisma.invoice.findMany({
      where: { clinicId, issuedAt: { gte: from, lt: to } },
      orderBy: { issuedAt: "asc" },
      select: {
        id: true,
        number: true,
        issuedAt: true,
        status: true,
        subtotal: true,
        discountTotal: true,
        taxTotal: true,
        grandTotal: true,
        hmoDue: true,
        discountType: true,
        payer: { select: { name: true } },
        patient: { select: { patientNo: true, contact: { select: { fullName: true } } } },
        appointment: { select: { dentist: { select: { id: true, fullName: true } } } },
        invoiceItems: { select: { description: true }, orderBy: { position: "asc" } },
        paymentAllocations: { select: { amount: true, payment: { select: { status: true } } } },
      },
    });
  },

  payments(clinicId: string, from: Date, to: Date) {
    return prisma.payment.findMany({ where: { clinicId, receivedAt: { gte: from, lt: to }, status: "posted" }, select: { amount: true, method: true } });
  },

  newPatients(clinicId: string, from: Date, to: Date) {
    return prisma.patient.findMany({
      where: { clinicId, createdAt: { gte: from, lt: to } },
      select: { id: true, leads: { take: 1, orderBy: { createdAt: "asc" }, select: { source: { select: { name: true } } } } },
    });
  },

  appointments(clinicId: string, from: Date, to: Date) {
    return prisma.appointment.findMany({ where: { clinicId, startsAt: { gte: from, lt: to } }, select: { status: true, bookingSource: true } });
  },

  leadsCreated(clinicId: string, from: Date, to: Date) {
    return prisma.lead.findMany({ where: { clinicId, createdAt: { gte: from, lt: to } }, select: { source: { select: { name: true } } } });
  },

  leadsClosed(clinicId: string, from: Date, to: Date) {
    return prisma.lead.findMany({
      where: { clinicId, status: { in: ["won", "lost"] }, closedAt: { gte: from, lt: to } },
      select: { status: true, wonValue: true, closedReason: true, source: { select: { name: true } }, assignedTo: { select: { fullName: true } } },
    });
  },
};
