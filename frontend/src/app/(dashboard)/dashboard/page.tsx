import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Coins,
  Landmark,
  ShieldCheck,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { MiniCalendar } from "@/features/dashboard/components/mini-calendar";
import { RevenueChartPanel } from "@/features/dashboard/components/revenue-chart-panel";
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

const TEAM_LIMIT = 5;

// Peso placeholder keeps empty values as wide as real amounts.
const NO_DATA = "₱ —";

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
    <div className="flex flex-col gap-4 max-[720px]:gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-1">
          <h1 className="text-[34px] leading-tight font-normal tracking-[-0.01em] max-[720px]:text-2xl">
            {greeting(hour)}, {displayName}
          </h1>
          <p className="text-[13px] text-[#5E6B7E] max-[720px]:text-xs">
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

      <div className="flex flex-wrap items-stretch gap-4 max-[720px]:gap-3">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-4 max-[720px]:gap-3">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3 max-[720px]:grid-cols-2 max-[720px]:gap-2.5">
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

          {canBilling ? <RevenueChartPanel isoDate={isoDate} /> : null}

          <div className="flex grow flex-wrap items-stretch gap-4 max-[720px]:gap-3">
            {ownerView ? (
              <Panel
                title="Approvals waiting"
                action={<Pill tone="green">All clear</Pill>}
                className="flex-[1_1_300px] gap-2.5 min-[721px]:min-h-[387px]"
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
                className="flex-[1_1_300px] gap-2 min-[721px]:min-h-[387px]"
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

        <div className="flex max-w-full min-w-0 flex-[1_1_320px] flex-col gap-4 max-[720px]:gap-3">
          <Panel
            title="Your calendar"
            action={
              can(user, "appointments.read") ? (
                <TextLink href="/calendar">Clinic calendar</TextLink>
              ) : null
            }
          >
            <MiniCalendar today={isoDate} />
          </Panel>

          {canBilling ? (
            <section
              aria-label="Cash position"
              className="card-blue flex flex-col gap-3 rounded-[22px] px-5 py-[18px] text-white max-[720px]:rounded-[20px] max-[720px]:p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#D3E2F5]">Cash position</span>
                <CornerLink
                  href="/billing"
                  label="Open Billing"
                  className="bg-[#2A64A8] text-white"
                />
              </div>
              <span className="text-[34px] leading-tight font-light tabular-nums max-[720px]:text-2xl">
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
              className="card-amber flex grow flex-col gap-2 rounded-[22px] px-5 py-[18px] text-[#0E2A47] max-[720px]:rounded-[20px] max-[720px]:p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm">Mia this month</span>
                <CornerLink
                  href="/crwdforce"
                  label="Open crwdForce"
                  className="bg-white text-[#0E2A47]"
                />
              </div>
              <span className="text-[30px] leading-tight max-[720px]:text-[21px]">Not connected</span>
              <span className="text-xs leading-normal">
                Bookings made by Mia, the AI receptionist, will show here
                once she is connected.
              </span>
            </section>
          ) : null}
        </div>
      </div>

      {ownerView && can(user, "reports.read") ? (
        <section aria-label="Owner reports" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-medium max-[720px]:text-base">Owner reports</h2>
            <span className="text-xs text-[#5E6B7E]">
              The reports that matter for running the clinic · preview, print or
              download as PDF once each module is live
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3 max-[720px]:grid-cols-1 max-[720px]:gap-2.5">
            {REPORTS.map((r) => (
              <Link
                key={r.title}
                href={r.href}
                className={cn(
                  "flex min-h-[140px] flex-col gap-2 rounded-[22px] p-4 transition-transform max-[720px]:min-h-0 max-[720px]:rounded-[18px] max-[720px]:p-3 hover:-translate-y-0.5",
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
