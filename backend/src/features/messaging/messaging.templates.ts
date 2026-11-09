/** Fill-ins staff can use in saved replies, greetings and broadcasts. */
export const TEMPLATE_TOKENS = ["first_name", "clinic_name", "clinic_phone", "clinic_address", "next_appointment"] as const;
export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];
export type TemplateValues = Partial<Record<TemplateToken, string | null>>;

/** Replaces {token} fill-ins; unknown or empty ones are left for staff to see and fix. */
export function fillTemplate(text: string, values: TemplateValues): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key as TemplateToken] || match);
}

export const DEFAULT_SAVED_REPLIES = [
  { title: "Clinic hours", body: "Hi {first_name}! {clinic_name} is open Monday to Saturday, 9:00 AM to 6:00 PM. Would you like to book a visit?" },
  { title: "Location", body: "Hi {first_name}! You can find us at {clinic_address}. Call us at {clinic_phone} if you need directions." },
  { title: "Appointment reminder", body: "Hi {first_name}, this is a reminder of your appointment on {next_appointment} at {clinic_name}. Reply YES to confirm." },
  { title: "Cleaning price", body: "Hi {first_name}! Oral prophylaxis (cleaning) starts at ₱1,300 before VAT. HMO members may be covered. Would you like to book?" },
  { title: "Aftercare: extraction", body: "Hi {first_name}, after your extraction: bite on the gauze for 30 minutes, avoid hot drinks and spitting today, and call {clinic_phone} if bleeding doesn't stop." },
];

export const DEFAULT_GREETING = "Happy birthday, {first_name}! 🎉 Everyone at {clinic_name} wishes you a wonderful year ahead. Keep smiling!";
