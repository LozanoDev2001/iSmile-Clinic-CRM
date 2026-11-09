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
  },
  {
    key: "contacts",
    href: "/contacts",
    label: "Contacts",
    icon: SquareUser,
    permission: "contacts.read",
  },
  {
    key: "patients",
    href: "/patients",
    label: "Patients",
    icon: Users,
    permission: "patients.read",
  },
  {
    key: "messaging",
    href: "/messaging",
    label: "Messaging",
    shortLabel: "Messages",
    icon: MessageSquare,
    permission: "messaging.read",
  },
  {
    key: "calendar",
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    permission: "appointments.read",
  },
  {
    key: "billing",
    href: "/billing",
    label: "Billing",
    icon: CreditCard,
    permission: "billing.read",
  },
  {
    key: "reports",
    href: "/reports",
    label: "Reports",
    icon: ChartLine,
    permission: "reports.read",
  },
  { key: "settings", href: "/settings", label: "Settings", icon: Settings },
];

export function findComingSoonModule(key: string): NavModule | undefined {
  return NAV_MODULES.find((m) => m.key === key && m.comingSoon);
}
