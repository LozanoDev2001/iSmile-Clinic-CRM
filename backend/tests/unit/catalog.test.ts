import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@backend/generated/prisma/client";
import { CLINIC_A, makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  repo: { listActive: vi.fn(), findActive: vi.fn(), nameTaken: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() },
  audit: vi.fn(),
}));

vi.mock("@backend/features/catalog/catalog.repository", () => ({ catalogRepository: mocks.repo }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } }));

const { archiveService, createService, listServices, updateService } = await import("@backend/features/catalog/catalog.service");

const SERVICE_ID = "00000000-0000-4000-8000-700000000001";
const owner = makeUser("OWNER");
const frontDesk = makeUser("FRONT_DESK");

const row = (overrides: Record<string, unknown> = {}) => ({
  id: SERVICE_ID,
  code: "PROPH",
  name: "Oral prophylaxis (cleaning)",
  price: new Prisma.Decimal("1300.00"),
  kind: "service",
  hmoCoverable: true,
  ...overrides,
});

const input = { name: "  Fluoride   varnish ", price: 800, kind: "service" as const, hmoCoverable: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.nameTaken.mockResolvedValue(0);
  mocks.repo.findActive.mockResolvedValue(row());
  mocks.repo.create.mockImplementation(async (_clinic: string, code: string, data: object) => row({ code, ...data, price: new Prisma.Decimal(800) }));
  mocks.repo.update.mockImplementation(async (_id: string, data: object) => row({ ...data, price: new Prisma.Decimal(800) }));
});

describe("listServices", () => {
  it("returns prices as numbers, scoped to the user's clinic", async () => {
    mocks.repo.listActive.mockResolvedValue([row()]);
    const list = await listServices(owner);
    expect(mocks.repo.listActive).toHaveBeenCalledWith(CLINIC_A);
    expect(list).toEqual([expect.objectContaining({ price: 1300, kind: "service" })]);
  });
});

describe("createService", () => {
  it("normalises the name, generates a code and audits the change", async () => {
    const created = await createService(owner, input);
    expect(mocks.repo.create).toHaveBeenCalledWith(CLINIC_A, expect.stringMatching(/^S-[0-9A-F]{8}$/), { ...input, name: "Fluoride varnish" }, {});
    expect(created.price).toBe(800);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "service.created", clinicId: CLINIC_A }), {});
  });

  it("rejects a name already on the list", async () => {
    mocks.repo.nameTaken.mockResolvedValue(1);
    await expect(createService(owner, input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.repo.create).not.toHaveBeenCalled();
  });

  it.each([
    ["a zero price", { price: 0 }],
    ["more than 2 decimals", { price: 10.005 }],
    ["a too-short name", { name: "ab" }],
  ])("rejects %s", async (_label, patch) => {
    await expect(createService(owner, { ...input, ...patch })).rejects.toThrow();
    expect(mocks.repo.create).not.toHaveBeenCalled();
  });

  it("requires full Settings access", async () => {
    await expect(createService(frontDesk, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("updateService", () => {
  it("excludes the service itself from the duplicate-name check", async () => {
    await updateService(owner, SERVICE_ID, input);
    expect(mocks.repo.nameTaken).toHaveBeenCalledWith(CLINIC_A, "Fluoride varnish", SERVICE_ID, {});
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "service.updated", before: expect.objectContaining({ price: 1300 }) }), {});
  });

  it("returns not found for a service outside the clinic or already removed", async () => {
    mocks.repo.findActive.mockResolvedValue(null);
    await expect(updateService(owner, SERVICE_ID, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.repo.update).not.toHaveBeenCalled();
  });
});

describe("archiveService", () => {
  it("archives instead of deleting and audits it", async () => {
    await archiveService(owner, SERVICE_ID);
    expect(mocks.repo.archive).toHaveBeenCalledWith(SERVICE_ID, {});
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "service.archived" }), {});
  });

  it("rejects an invalid id before touching the database", async () => {
    await expect(archiveService(owner, "not-a-uuid")).rejects.toThrow();
    expect(mocks.repo.findActive).not.toHaveBeenCalled();
  });
});
