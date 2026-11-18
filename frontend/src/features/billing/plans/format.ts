import type { InstallmentStatus, PlanStatus } from "@backend/features/billing/plans/plans.types";

const dueFormat = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Formats a YYYY-MM-DD due date without shifting it by time zone. */
export const formatDue = (date: string) => dueFormat.format(new Date(`${date}T00:00:00Z`));

export const PLAN_STATUS_META: Record<PlanStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-[#9EDBC0] text-[#0B3D26]" },
  overdue: { label: "Overdue", className: "bg-[#F9B4AA] text-[#5A1308]" },
  completed: { label: "Completed", className: "bg-[#EEF1F5] text-[#46566B]" },
  cancelled: { label: "Cancelled", className: "bg-[#EEF1F5] text-[#46566B] line-through" },
};

export const INSTALLMENT_META: Record<InstallmentStatus | "overdue", { label: string; dot: string }> = {
  paid: { label: "Paid", dot: "bg-[#2E9E63]" },
  due: { label: "Due", dot: "bg-[#C3CCD8]" },
  overdue: { label: "Overdue", dot: "bg-[#D9483B]" },
  cancelled: { label: "Cancelled", dot: "bg-[#E3E7ED]" },
};
