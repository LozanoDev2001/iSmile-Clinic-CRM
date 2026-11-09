import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, clinicToday } from "@backend/config/clinic";
import { fillTemplate } from "@backend/features/messaging/messaging.templates";
import { CLINIC_A, makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  messaging: {
    findByRef: vi.fn(),
    createConversation: vi.fn(),
    addMessage: vi.fn(),
    updateConversation: vi.fn(),
    findConversation: vi.fn(),
    findOutgoingMessage: vi.fn(),
    setDelivery: vi.fn(),
    contactByEmail: vi.fn(),
    sourceByName: vi.fn(),
    patientsBornIn: vi.fn(),
    greetingsSince: vi.fn(),
    contactAddress: vi.fn(),
    audienceCandidates: vi.fn(),
    createBroadcast: vi.fn(),
    setBroadcastCount: vi.fn(),
  },
  leads: { contactByPhone: vi.fn(), createContact: vi.fn(), create: vi.fn(), addActivity: vi.fn() },
  settings: { findClinicSettings: vi.fn(), updateClinicSettings: vi.fn() },
  staff: { activeWithAccess: vi.fn() },
  audit: vi.fn(),
}));

vi.mock("@backend/features/messaging/messaging.repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/features/messaging/messaging.repository")>()),
  messagingRepository: mocks.messaging,
}));
vi.mock("@backend/features/leads/leads.repository", () => ({ leadsRepository: mocks.leads }));
vi.mock("@backend/features/settings/settings.repository", () => ({ settingsRepository: mocks.settings }));
vi.mock("@backend/features/users/staff.repository", () => ({ staffRepository: mocks.staff }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } }));

const { externalRefFor, markMessageSent, receiveMessage, reply, sendBroadcast, sendGreeting } = await import("@backend/features/messaging/messaging.service");

const CONV_ID = "00000000-0000-4000-8000-d00000000001";
const MSG_ID = "00000000-0000-4000-8000-d00000000002";
const PATIENT_ID = "00000000-0000-4000-8000-800000000001";
const frontDesk = makeUser("FRONT_DESK");
const dentist = makeUser("DENTIST");

const incoming = { channel: "viber" as const, name: "Carla Mendoza", phone: "+63 917 555 0301", email: "", body: "Hi! How much are braces?" };
const conversationRow = (patch: Record<string, unknown> = {}) => ({ id: CONV_ID, assignedTo: null, contact: { id: "c1", fullName: "Carla Mendoza", contactType: "lead" }, messages: [], ...patch });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.findClinicSettings.mockResolvedValue({ name: "iSmile Dental Home", settings: { profile: { tagline: "", phone: "+63 2 8123 4567", address: "Makati", vatRegistered: true, hours: [] } } });
  mocks.leads.contactByPhone.mockResolvedValue(null);
  mocks.leads.createContact.mockResolvedValue({ id: "c-new" });
  mocks.leads.create.mockResolvedValue({ id: "lead-new" });
  mocks.messaging.findByRef.mockResolvedValue(null);
  mocks.messaging.createConversation.mockResolvedValue({ id: CONV_ID });
  mocks.messaging.addMessage.mockResolvedValue({ id: MSG_ID, sentAt: new Date() });
  mocks.messaging.sourceByName.mockResolvedValue({ id: "src-viber" });
  mocks.messaging.findConversation.mockResolvedValue(conversationRow());
  mocks.messaging.greetingsSince.mockResolvedValue([]);
  mocks.messaging.contactAddress.mockResolvedValue({ id: "c1", phone: "+63 917 555 0301", email: null });
  mocks.messaging.createBroadcast.mockResolvedValue({ id: "b1" });
});

describe("templates and addressing", () => {
  it("fills known fill-ins and leaves empty ones visible", () => {
    expect(fillTemplate("Hi {first_name}, call {clinic_phone} {unknown}", { first_name: "Carla", clinic_phone: null })).toBe("Hi Carla, call {clinic_phone} {unknown}");
  });

  it("addresses chats by phone digits, and email by address", () => {
    expect(externalRefFor("viber", "+63 917 555 0301", null)).toBe("639175550301");
    expect(externalRefFor("email", null, "Carla@Mail.com")).toBe("carla@mail.com");
    expect(externalRefFor("sms", "123", null)).toBeNull();
  });
});

describe("receiveMessage", () => {
  it("turns a new person into a contact and a lead from the chat app", async () => {
    await expect(receiveMessage(frontDesk, incoming)).resolves.toEqual({ conversationId: CONV_ID, newLead: true });
    expect(mocks.leads.create).toHaveBeenCalledWith(expect.objectContaining({ contactId: "c-new", sourceId: "src-viber", stage: "new", message: incoming.body }), expect.anything());
    expect(mocks.messaging.createConversation).toHaveBeenCalledWith({ clinicId: CLINIC_A, contactId: "c-new", channel: "viber", externalRef: "639175550301" }, expect.anything());
    expect(mocks.messaging.addMessage).toHaveBeenCalledWith(expect.objectContaining({ direction: "in", body: incoming.body }), expect.anything());
  });

  it("adds to the existing conversation of someone already known", async () => {
    mocks.leads.contactByPhone.mockResolvedValue({ id: "c-known", phone: "09175550301", patient: { id: "p1" }, leads: [] });
    mocks.messaging.findByRef.mockResolvedValue({ id: "conv-known", contactId: "c-known" });
    await expect(receiveMessage(frontDesk, incoming)).resolves.toEqual({ conversationId: "conv-known", newLead: false });
    expect(mocks.leads.create).not.toHaveBeenCalled();
    expect(mocks.messaging.updateConversation).toHaveBeenCalledWith("conv-known", expect.objectContaining({ status: "open" }), expect.anything());
  });

  it("needs a way to reach them and permission to send", async () => {
    await expect(receiveMessage(frontDesk, { ...incoming, phone: "", email: "" })).rejects.toThrow();
    await expect(receiveMessage(dentist, incoming)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("reply", () => {
  it("never pretends a message was delivered, and gives the chat to whoever answers", async () => {
    await reply(frontDesk, CONV_ID, { body: "Braces start at ₱35,000." });
    expect(mocks.messaging.addMessage).toHaveBeenCalledWith(expect.objectContaining({ direction: "out", deliveryStatus: "not_sent", senderUserId: frontDesk.id }), expect.anything());
    expect(mocks.messaging.updateConversation).toHaveBeenCalledWith(CONV_ID, { assignedToId: frontDesk.id }, expect.anything());
  });

  it("keeps an existing assignee", async () => {
    mocks.messaging.findConversation.mockResolvedValue(conversationRow({ assignedTo: { id: "someone", fullName: "Joy" } }));
    await reply(frontDesk, CONV_ID, { body: "Hello" });
    expect(mocks.messaging.updateConversation).not.toHaveBeenCalledWith(CONV_ID, { assignedToId: frontDesk.id }, expect.anything());
  });

  it("marks a message sent once staff sent it from the app", async () => {
    mocks.messaging.findOutgoingMessage.mockResolvedValue({ id: MSG_ID, deliveryStatus: "not_sent", conversationId: CONV_ID });
    await markMessageSent(frontDesk, MSG_ID);
    expect(mocks.messaging.setDelivery).toHaveBeenCalledWith(MSG_ID, "sent_manually", expect.anything());
    mocks.messaging.findOutgoingMessage.mockResolvedValue({ id: MSG_ID, deliveryStatus: "sent_manually", conversationId: CONV_ID });
    await expect(markMessageSent(frontDesk, MSG_ID)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("birthday greetings", () => {
  const celebrant = (patch: Record<string, unknown> = {}) => ({
    id: PATIENT_ID,
    patientNo: "P-0001",
    dob: new Date(`2000-${addDays(clinicToday(), 2).slice(5)}T00:00:00Z`),
    contact: { id: "c1", fullName: "Maria Lopez", preferredChannel: "viber", phone: "+63 917 555 0101", email: null },
    ...patch,
  });

  it("sends the filled greeting on the patient's preferred app", async () => {
    mocks.messaging.patientsBornIn.mockResolvedValue([celebrant()]);
    await sendGreeting(frontDesk, PATIENT_ID);
    const [message] = mocks.messaging.addMessage.mock.calls[0];
    expect(message).toMatchObject({ kind: "birthday", direction: "out" });
    expect(message.body).toContain("Happy birthday, Maria!");
    expect(message.body).toContain("iSmile Dental Home");
  });

  it("greets each patient once a year, and needs a preferred app", async () => {
    mocks.messaging.patientsBornIn.mockResolvedValue([celebrant()]);
    mocks.messaging.greetingsSince.mockResolvedValue([{ id: "m", sentAt: new Date(), deliveryStatus: "not_sent", conversation: { channel: "viber", contactId: "c1", contact: { fullName: "Maria Lopez" } } }]);
    await expect(sendGreeting(frontDesk, PATIENT_ID)).rejects.toMatchObject({ code: "CONFLICT" });
    mocks.messaging.greetingsSince.mockResolvedValue([]);
    mocks.messaging.patientsBornIn.mockResolvedValue([celebrant({ contact: { id: "c1", fullName: "Maria Lopez", preferredChannel: null, phone: null, email: null } })]);
    await expect(sendGreeting(frontDesk, PATIENT_ID)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("broadcasts", () => {
  const candidate = (id: string, optIn: boolean, channel: string | null, dob = "1990-05-05") => ({
    id,
    dob: new Date(`${dob}T00:00:00Z`),
    scPwdId: null,
    contact: { id: `c-${id}`, fullName: `Patient ${id}`, marketingOptIn: optIn, preferredChannel: channel, phone: "+63 917 555 0000", email: null },
    encounters: [],
  });

  it("only reaches patients who agreed to clinic news on an app", async () => {
    mocks.messaging.audienceCandidates.mockResolvedValue([candidate("a", true, "viber"), candidate("b", false, "viber"), candidate("c", true, null)]);
    await expect(sendBroadcast(frontDesk, { title: "December promo", body: "Hi {first_name}!", audience: "all" })).resolves.toEqual({ id: "b1", recipients: 1 });
    expect(mocks.messaging.addMessage).toHaveBeenCalledTimes(1);
    expect(mocks.messaging.addMessage.mock.calls[0][0]).toMatchObject({ kind: "broadcast", broadcastId: "b1", body: "Hi Patient!" });
    expect(mocks.messaging.setBroadcastCount).toHaveBeenCalledWith("b1", 1, expect.anything());
  });

  it("filters by audience, and refuses when no one can receive it", async () => {
    mocks.messaging.audienceCandidates.mockResolvedValue([candidate("adult", true, "viber"), candidate("kid", true, "viber", `${Number(clinicToday().slice(0, 4)) - 6}-01-01`)]);
    await expect(sendBroadcast(frontDesk, { title: "Kids promo", body: "Hi!", audience: "kids" })).resolves.toMatchObject({ recipients: 1 });
    mocks.messaging.audienceCandidates.mockResolvedValue([candidate("b", false, "viber")]);
    await expect(sendBroadcast(frontDesk, { title: "Promo", body: "Hi!", audience: "all" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
