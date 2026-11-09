// Development-only account created by prisma/seed.ts.
export const DEMO_ACCOUNT = {
  label: "Admin",
  name: "Admin",
  email: "admin@gmail.com",
  password: "password123",
} as const;

// More development-only staff from prisma/seed.ts, sharing the demo password.
export const DEMO_STAFF = [
  { label: "Dentist", name: "Dr. Ana Reyes", email: "dentist@ismile.test", role: "DENTIST", staffCode: "DR-001" },
  { label: "Front desk", name: "Joy Ramirez", email: "frontdesk@ismile.test", role: "FRONT_DESK", staffCode: "FD-001" },
] as const;
