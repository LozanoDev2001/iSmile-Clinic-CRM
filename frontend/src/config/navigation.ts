import {
  CalendarDays,
  ChartLine,
  CreditCard,
  Filter,
  Headphones,
  LayoutGrid,
  MessageSquare,
  Settings,
  SquareUser,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@backend/config/permissions";

export interface NavModule {
  key: string;
  href: string;
  label: string;
  /** Shorter label for the phone bottom bar. */
  shortLabel?: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Not built yet: served by the placeholder page with this description. */
  comingSoon?: string;
}

/** Single source of truth for the sidebar, the phone menu and the module placeholder pages. */
export const NAV_MODULES: NavModule[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutGrid },
  {
    key: "crwdforce",
    href: "/crwdforce",
    label: "crwdForce",
    icon: Headphones,
    permission: "crwdforce.read",
    comingSoon: "Mia, the AI receptionist, will answer chats and calls and book appointments here.",
  },
  {
    key: "leads",
    href: "/leads",
    label: "Leads",
    icon: Filter,
    permission: "leads.read",
    comingSoon: "Track every inquiry from first message to booked appointment on a pipeline board.",
  },
  {
    key: "contacts",
    href: "/contacts",
    label: "Contacts",
    icon: SquareUser,
    permission: "contacts.read",
    comingSoon: "Everyone who has contacted the clinic, with their channels and history.",
  },
  {
    key: "patients",
    href: "/patients",
    label: "Patients",
    icon: Users,
    permission: "patients.read",
    comingSoon: "Search patient records, contact details and treatment history.",
  },
  {
    key: "messaging",
    href: "/messaging",
    label: "Messaging",
    shortLabel: "Messages",
    icon: MessageSquare,
    permission: "messaging.read",
    comingSoon: "One inbox for Facebook, Instagram, WhatsApp, Viber and more.",
  },
  {
    key: "calendar",
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    permission: "appointments.read",
    comingSoon: "Book, move and confirm appointments across dentists and branches.",
  },
  {
    key: "billing",
    href: "/billing",
    label: "Billing",
    icon: CreditCard,
    permission: "billing.read",
    comingSoon: "Invoices, payments, HMO claims and the clinic's cash position.",
  },
  {
    key: "reports",
    href: "/reports",
    label: "Reports",
    icon: ChartLine,
    permission: "reports.read",
    comingSoon: "Monthly summaries, sales, dentist production and collections reports.",
  },
  { key: "settings", href: "/settings", label: "Settings", icon: Settings },
];

export function findComingSoonModule(key: string): NavModule | undefined {
  return NAV_MODULES.find((m) => m.key === key && m.comingSoon);
}
