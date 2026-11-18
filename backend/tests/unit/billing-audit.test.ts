import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLINIC_A, makeUser } from "../helpers/fixtures";

const list = vi.hoisted(() => vi.fn());
vi.mock("@backend/features/billing/audit/billing-audit.repository", () => ({ billingAuditRepository: { list } }));

const { getBillingAudit } = await import("@backend/features/billing/audit/billing-audit.service");

const row = (id: number, action: string) => ({ id: BigInt(id), occurredAt: new Date(), action, entityType: "invoice", entityId: "i1", afterData: { amount: 500 }, actor: { fullName: "Rose G." } });

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([row(3, "payment.recorded"), row(2, "invoice.issued")]);
});

describe("getBillingAudit", () => {
  it("lists billing actions only, newest first, with labels", async () => {
    const page = await getBillingAudit(makeUser("OWNER"), {});
    const [clinicId, actions] = list.mock.calls[0];
    expect(clinicId).toBe(CLINIC_A);
    expect(actions).toContain("invoice.issued");
    expect(actions).toContain("bank_transaction.matched");
    expect(actions).not.toContain("patient.medical.viewed");
    expect(page.entries[0]).toMatchObject({ id: "3", label: "Recorded a payment", actor: "Rose G.", details: { amount: 500 } });
    expect(page.olderThan).toBeNull();
  });

  it("filters by group and pages with an id cursor", async () => {
    list.mockResolvedValue(Array.from({ length: 51 }, (_, k) => row(100 - k, "claim.updated")));
    const page = await getBillingAudit(makeUser("OWNER"), { group: "claims", before: "200" });
    expect(list).toHaveBeenCalledWith(CLINIC_A, ["claim.updated"], 200n, 51);
    expect(page.entries).toHaveLength(50);
    expect(page.olderThan).toBe("51");
  });

  it("refuses users without the audit tab", async () => {
    await expect(getBillingAudit(makeUser("FRONT_DESK"), {})).rejects.toThrow();
    expect(list).not.toHaveBeenCalled();
  });
});
