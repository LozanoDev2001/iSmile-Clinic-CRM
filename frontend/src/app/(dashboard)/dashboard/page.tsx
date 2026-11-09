import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  ChartLine,
  Coins,
  Landmark,
  ShieldCheck,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { MiniCalendar } from "@/features/dashboard/components/mini-calendar";
import { Avatar } from "@/components/shared/avatar";
import { Pill } from "@/components/shared/pill";
import { CLINIC_TIME_ZONE, CLINIC_UTC_OFFSET } from "@/config/clinic";
import {
  CornerLink,
  Panel,
  StatCard,
  TextLink,
} from "@/features/dashboard/components/dashboard-widgets";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@backend/config/permissions";
import { getPatientStats } from "@backend/features/patients/patients.service";
import { getTeamOverview } from "@backend/features/users/team.service";
import { can, requirePageUser } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Dashboard" };

const CHART_MONTHS = 5;
const TEAM_LIMIT = 5;

const NO_DATA = "—";

function clinicNow() {
  const now = new Date();
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
  }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: CLINIC_TIME_ZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  const longDate = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  return {
    isoDate,
    hour,
    longDate,
    monthStart: new Date(
      `${isoDate.slice(0, 7)}-01T00:00:00${CLINIC_UTC_OFFSET}`,
    ),
  };
}

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Short names of the last `count` months, oldest first, e.g. ["Jul", …, "Nov"]. */
function recentMonths(isoDate: string, count: number) {
  const [y, m] = isoDate.split("-").map(Number);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  return Array.from({ length: count }, (_, i) =>
    fmt.format(new Date(Date.UTC(y, m - count + i, 1))),
  );
}

const REPORTS = [
  {
    group: "Monthly",
    title: "Owner’s monthly summary",
    desc: "Revenue, profit, cash, unpaid balances and team on two pages.",
    href: "/reports",
    cta: "Open in Reports",
    dark: true,
  },
  {
    group: "Sales",
    title: "Monthly sales report",
    desc: "Every sales invoice for the month, with totals by dentist, payer and payment method.",
    href: "/reports",
    cta: "Open in Reports",
  },
  {
    group: "Team",
    title: "Dentist production and fees",
    desc: "Visits, revenue and professional fees per dentist.",
    href: "/reports",
    cta: "Open in Reports",
  },
  {
    group: "Collections",
    title: "Who still owes the clinic",
    desc: "Unpaid patient and HMO balances by how long they have been open.",
    href: "/billing",
    cta: "Open in Billing",
  },
  {
    group: "Growth",
    title: "Leads and new patients",
    desc: "Leads by platform, how many were won, and why others were lost.",
    href: "/leads",
    cta: "Open in Leads",
  },
];

export default async function DashboardPage() {
  const user = await requirePageUser(); // cached: same lookup as the layout
  const { isoDate, hour, longDate, monthStart } = clinicNow();
  const ownerView = can(user, "dashboards.owner");
  const canBilling = ownerView && can(user, "billing.read");
  const canPatients = can(user, "patients.read");
  const canTeam = ownerView && can(user, "users.read");

  const [patientStats, team] = await Promise.all([
    canPatients ? getPatientStats(user, monthStart) : null,
    canTeam ? getTeamOverview(user) : null,
  ]);
  const activeTeam = team?.members.filter((member) => member.status !== "DEACTIVATED") ?? [];
  const displayName = user.name.startsWith("Dr")
    ? user.name
    : user.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">
            {greeting(hour)}, {displayName}
          </h1>
          <p className="text-[13px] text-[#5E6B7E]">
            {longDate}
            {patientStats
              ? ` · ${patientStats.total.toLocaleString("en-PH")} patients on file`
              : ""}
          </p>
        </div>
        {canTeam ? (
          <Link
            href="/settings/team"
            className="btn-navy inline-flex h-11 items-center gap-2 rounded-full px-[18px] text-[13px] text-white"
          >
            <ShieldCheck className="size-4" strokeWidth={1.8} aria-hidden />
            Team and roles
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {canBilling ? (
              <>
                <StatCard
                  href="/billing"
                  icon={TrendingUp}
                  chipClass="bg-[#DCEAFB] text-[#1D5296]"
                  label="Net revenue · this month"
                  value={NO_DATA}
                  badge={<Pill tone="muted">Needs Billing</Pill>}
                />
                <StatCard
                  href="/billing"
                  icon={Coins}
                  chipClass="bg-[#D7F2E5] text-[#2E8A57]"
                  label="Net income · this month"
                  value={NO_DATA}
                  badge={<Pill tone="muted">Needs Billing</Pill>}
                />
                <StatCard
                  href="/billing"
                  icon={Landmark}
                  chipClass="bg-[#FDE3BD] text-[#A55A00]"
                  label="Cash in bank"
                  value={NO_DATA}
                  badge={<Pill tone="muted">Needs Billing</Pill>}
                />
              </>
            ) : null}
            {patientStats ? (
              <StatCard
                href="/patients"
                icon={UserRound}
                chipClass="bg-[#FBD9D4] text-[#A1301F]"
                label="Patients on file"
                value={patientStats.total.toLocaleString("en-PH")}
                badge={
                  <Pill tone="purple">
                    +{patientStats.createdSince} this month
                  </Pill>
                }
              />
            ) : null}
          </div>

          {canBilling ? (
            <Panel title="Revenue, expenses and profit">
              <div className="relative h-[220px]">
                <div
                  className="absolute inset-x-0 top-0 bottom-[22px] flex flex-col justify-between"
                  aria-hidden
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className="border-t border-dashed border-[#E3E8EF]"
                    />
                  ))}
                </div>
                <div
                  className="absolute inset-x-0 bottom-0 flex justify-between px-1 text-[11px] text-[#5E6B7E]"
                  aria-hidden
                >
                  {recentMonths(isoDate, CHART_MONTHS).map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </div>
                <div className="absolute inset-0 bottom-[22px] grid place-items-center px-4">
                  <div className="flex max-w-sm flex-col items-center gap-2 rounded-2xl bg-white/80 px-5 py-4 text-center backdrop-blur-sm">
                    <ChartLine
                      className="size-6 text-[#1D5296]"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                    <p className="text-[13px] text-[#46566B]">
                      Monthly revenue, expenses and profit will chart here once
                      invoices and expenses are recorded in Billing.
                    </p>
                    <TextLink href="/billing">Open Billing</TextLink>
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {ownerView ? (
              <Panel
                title="Approvals waiting"
                action={<Pill tone="muted">0 waiting</Pill>}
                className="gap-2.5"
              >
                <p className="rounded-2xl bg-[#F4F6F9] px-3.5 py-4 text-[13px] text-[#5E6B7E]">
                  Nothing waiting for you. Discount, refund and cancellation
                  requests will appear here once Billing is live.
                </p>
              </Panel>
            ) : null}

            {team ? (
              <Panel
                title="Team"
                action={<TextLink href="/settings/team">Manage team</TextLink>}
                className="gap-2"
              >
                <ul className="flex flex-col">
                  {activeTeam.slice(0, TEAM_LIMIT).map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center gap-3 rounded-[14px] px-1.5 py-2"
                    >
                      <Avatar name={member.name} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm">{member.name}</span>
                        <span className="truncate text-xs text-[#5E6B7E]">
                          {ROLE_LABELS[member.role]}
                        </span>
                      </span>
                      <span className="text-[11px] text-[#5E6B7E]">
                        {member.status === "INVITED" ? "Invited" : member.locked ? "Locked" : "Active"}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex justify-between gap-3 border-t border-[#EDF0F4] pt-2 text-xs text-[#5E6B7E]">
                  <span>{activeTeam.length} active staff accounts</span>
                  {activeTeam.length > TEAM_LIMIT ? (
                    <TextLink href="/settings/team">See all</TextLink>
                  ) : null}
                </div>
              </Panel>
            ) : null}
          </div>
        </div>

        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Panel
            title="Your calendar"
            action={
              can(user, "appointments.read") ? (
                <TextLink href="/calendar">Clinic calendar</TextLink>
              ) : null
            }
            className="md:row-span-2 xl:row-span-1"
          >
            <MiniCalendar today={isoDate} />
          </Panel>

          {canBilling ? (
            <section
              aria-label="Cash position"
              className="card-blue flex flex-col gap-3 rounded-[24px] px-5 py-[18px] text-white"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#D3E2F5]">Cash position</span>
                <CornerLink
                  href="/billing"
                  label="Open Billing"
                  className="bg-[#2A64A8] text-white"
                />
              </div>
              <span className="text-[34px] leading-tight font-light tabular-nums">
                {NO_DATA}
              </span>
              <span className="text-xs text-[#D3E2F5]">
                Cash in bank appears once Billing is set up.
              </span>
              {[
                "Cash on hand (float)",
                "Owed by patients",
                "Owed by HMOs",
                "Collected this month",
              ].map((label) => (
                <div
                  key={label}
                  className="flex justify-between border-t border-[#3A74B6] pt-2 text-[13px]"
                >
                  <span className="text-[#D3E2F5]">{label}</span>
                  <span className="tabular-nums">{NO_DATA}</span>
                </div>
              ))}
            </section>
          ) : null}

          {ownerView && can(user, "crwdforce.read") ? (
            <section
              aria-label="Mia this month"
              className="card-amber flex flex-col gap-2 rounded-[24px] px-5 py-[18px] text-[#0E2A47]"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm">Mia this month</span>
                <CornerLink
                  href="/crwdforce"
                  label="Open crwdForce"
                  className="bg-white text-[#0E2A47]"
                />
              </div>
              <span className="text-[30px] leading-tight">Not connected</span>
              <span className="text-xs leading-normal">
                Mia, the AI receptionist, will answer chats and calls and book
                appointments. Her bookings and reply times will show here.
              </span>
            </section>
          ) : null}
        </div>
      </div>

      {ownerView && can(user, "reports.read") ? (
        <section aria-label="Owner reports" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-medium">Owner reports</h2>
            <span className="text-xs text-[#5E6B7E]">
              The reports that matter for running the clinic · available as each
              module goes live
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
            {REPORTS.map((r) => (
              <Link
                key={r.title}
                href={r.href}
                className={cn(
                  "flex min-h-[140px] flex-col gap-2 rounded-[22px] p-4 transition-transform hover:-translate-y-0.5",
                  r.dark ? "card-navy text-white" : "glass-card",
                )}
              >
                <span className="flex justify-between">
                  <span
                    className={cn(
                      "text-xs",
                      r.dark ? "text-[#A9C8F0]" : "text-[#5E6B7E]",
                    )}
                  >
                    {r.group}
                  </span>
                  <ArrowUpRight className="size-4" aria-hidden />
                </span>
                <span className="text-base font-medium">{r.title}</span>
                <span
                  className={cn(
                    "grow text-xs leading-[1.45]",
                    r.dark ? "text-[#D3E2F5]" : "text-[#5E6B7E]",
                  )}
                >
                  {r.desc}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    r.dark ? "text-white" : "text-[#1D5296]",
                  )}
                >
                  {r.cta}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
