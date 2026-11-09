import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEEKDAYS } from "@backend/features/settings/settings.schema";
import { clinicProfileFrom, type ClinicProfile } from "@backend/features/settings/settings.types";
import { CLINIC_A, makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  repo: { findClinicSettings: vi.fn(), updateClinicSettings: vi.fn(), updateClinicProfile: vi.fn() },
  audit: vi.fn(),
}));

vi.mock("@backend/features/settings/settings.repository", () => ({ settingsRepository: mocks.repo }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } }));

const { getClinicProfile, updateClinicProfile } = await import("@backend/features/settings/settings.service");

const owner = makeUser("OWNER");
const SIGN_IN = { lockAfterFailedLogins: true, idleSignOut: true };

const profile = (overrides: Partial<ClinicProfile> = {}): ClinicProfile => ({
  name: "iSmile Downtown",
  tagline: "Pediatrics · Family · Orthodontics",
  phone: "+63 2 8123 4567",
  address: "12 Example St, Makati",
  hours: WEEKDAYS.map((day) => ({ day, closed: day === "Sun", open: "09:00", close: "18:00" })),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.findClinicSettings.mockResolvedValue({ name: "iSmile Downtown", settings: { signIn: SIGN_IN } });
});

describe("clinicProfileFrom", () => {
  it("falls back to an empty profile with every day closed when nothing is stored", () => {
    const result = clinicProfileFrom("iSmile", { signIn: SIGN_IN });
    expect(result).toMatchObject({ name: "iSmile", tagline: "", phone: "", address: "" });
    expect(result.hours.map((h) => h.day)).toEqual([...WEEKDAYS]);
    expect(result.hours.every((h) => h.closed)).toBe(true);
  });
});

describe("getClinicProfile", () => {
  it("requires Settings access", async () => {
    await expect(getClinicProfile(makeUser("DENTIST"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("updateClinicProfile", () => {
  it("keeps other settings, stores the name in its column and audits changed fields", async () => {
    await updateClinicProfile(owner, profile({ name: "iSmile Dental Home" }));
    const { name, ...stored } = profile({ name: "iSmile Dental Home" });
    expect(mocks.repo.updateClinicProfile).toHaveBeenCalledWith(CLINIC_A, { name, settings: { signIn: SIGN_IN, profile: stored } }, {});
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "clinic.profile.updated", metadata: { changedFields: ["name", "tagline", "phone", "address", "hours"] } }),
      {},
    );
  });

  it("does not write or audit when nothing changed", async () => {
    const saved = profile();
    const { name, ...stored } = saved;
    mocks.repo.findClinicSettings.mockResolvedValue({ name, settings: { profile: stored } });
    await updateClinicProfile(owner, saved);
    expect(mocks.repo.updateClinicProfile).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects a closing time before the opening time", async () => {
    const hours = profile().hours.map((h) => (h.day === "Mon" ? { ...h, open: "18:00", close: "09:00" } : h));
    await expect(updateClinicProfile(owner, profile({ hours }))).rejects.toThrow();
    expect(mocks.repo.updateClinicProfile).not.toHaveBeenCalled();
  });

  it("requires full Settings access", async () => {
    await expect(updateClinicProfile(makeUser("FRONT_DESK"), profile())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
