"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/shared/avatar";
import { Pill } from "@/components/shared/pill";
import { CLINIC_TIME_ZONE } from "@/config/clinic";
import { cn } from "@/lib/utils";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_LABELS,
  MODULES,
  MODULE_GROUPS,
  MODULE_KEYS,
  exceedsLevel,
  moduleTabs,
  roleTemplate,
  type AccessLevel,
  type AccessMap,
  type ModuleKey,
} from "@backend/config/access";
import {
  revokeMemberSessionsAction,
  sendMemberPasswordResetAction,
  setUserActiveAction,
  unlockMemberAction,
  updateMemberAction,
} from "@backend/features/users/users.controller";
import type { MemberAccessDetail } from "@backend/features/users/users.types";
import type { Role } from "@backend/config/permissions";
import type { ActionResult } from "@backend/lib/api/response";
import { memberSubtitle, STATUS_PILL } from "./employees-list";
import { RolePicker } from "./role-picker";

export const MEMBER_FORM_ID = "member-access-form";

const LEVEL_STYLES: Record<AccessLevel, string> = {
  NONE: "bg-[#FBD9D4] text-[#8A1E12]",
  VIEW: "bg-[#DCEAFB] text-[#0E2A47]",
  FULL: "btn-navy text-white",
};

const signInFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLINIC_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

interface MemberEditorProps {
  detail: MemberAccessDetail;
  assignableRoles: Role[];
  /** The editor's own access: they cannot grant more than this. */
  ceiling: AccessMap;
}

function sameAccess(a: AccessMap, b: AccessMap) {
  return MODULE_KEYS.every((k) => a[k].level === b[k].level && a[k].tabs.length === b[k].tabs.length && a[k].tabs.every((t) => b[k].tabs.includes(t)));
}

export function MemberEditor({ detail, assignableRoles, ceiling }: MemberEditorProps) {
  const { member, fixedAccess } = detail;
  const [role, setRole] = useState<Role>(member.role);
  const [jobTitle, setJobTitle] = useState(member.jobTitle ?? "");
  const [access, setAccess] = useState<AccessMap>(detail.access);
  const [pending, startTransition] = useTransition();
  const editable = member.editable && !fixedAccess;
  const firstName = member.name.replace(/^Dr\.?\s*/i, "").split(" ")[0];
  const dirty = role !== member.role || jobTitle.trim() !== (member.jobTitle ?? "") || !sameAccess(access, detail.access);

  const changeRole = (next: Role) => {
    setRole(next);
    setAccess(roleTemplate(next));
  };

  const setLevel = (key: ModuleKey, level: AccessLevel) =>
    setAccess((prev) => {
      const tabs = level === "NONE" ? [] : prev[key].level === "NONE" ? moduleTabs(key) : prev[key].tabs;
      return { ...prev, [key]: { level, tabs } };
    });

  const toggleTab = (key: ModuleKey, tab: string) =>
    setAccess((prev) => {
      const tabs = prev[key].tabs.includes(tab) ? prev[key].tabs.filter((t) => t !== tab) : [...prev[key].tabs, tab];
      return { ...prev, [key]: { ...prev[key], tabs } };
    });

  const run = (action: () => Promise<ActionResult<unknown>>, onDone?: (result: ActionResult<unknown>) => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      if (result.message) toast.success(result.message);
      onDone?.(result);
    });

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!editable) return;
    if (!dirty) {
      toast.info("No changes to save.");
      return;
    }
    run(() =>
      updateMemberAction({
        userId: member.id,
        role,
        jobTitle,
        access: MODULE_KEYS.map((module) => ({ module, level: access[module].level, tabs: access[module].tabs })),
      }),
    );
  };

  const status = STATUS_PILL[member.status];
  const lastSignIn = member.lastLoginAt ? `Last sign-in ${signInFormat.format(new Date(member.lastLoginAt))}` : "Has not signed in yet";

  return (
    <form id={MEMBER_FORM_ID} onSubmit={save} className="glass-card flex min-w-0 flex-col gap-4 rounded-[24px] p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <Avatar name={member.name} letters={2} className="size-[68px] text-[22px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-[26px] leading-tight font-normal">{member.name}</h2>
          <span className="text-[15px] text-[#46566B]">{memberSubtitle({ role, jobTitle: jobTitle.trim() || null })}</span>
          <span className="text-[13px] break-all text-[#5E6B7E]">
            {member.email} · {lastSignIn}
          </span>
        </div>
        <span className="flex flex-col items-end gap-1">
          <Pill tone={status.tone}>{status.label}</Pill>
          {member.locked ? <Pill tone="red">Locked</Pill> : null}
        </span>
      </div>

      {fixedAccess ? (
        <p className="rounded-2xl bg-[#F4F6F9] px-4 py-3 text-sm text-[#46566B]">Owners always have full access to every window and tab.</p>
      ) : !member.editable ? (
        <p className="rounded-2xl bg-[#F4F6F9] px-4 py-3 text-sm text-[#46566B]">You can see this account’s access but not change it.</p>
      ) : null}

      {editable ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-medium">Role</span>
            <RolePicker roles={assignableRoles} value={role} onChange={changeRole} disabled={pending} />
            <span className="text-[13px] text-[#46566B]">
              Changing the role resets windows and tabs to that role’s template. You can then adjust each one below.
            </span>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-medium">Job title</span>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Patient coordinator"
              className="h-10 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm outline-none focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15"
            />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[15px] font-medium">Windows and tabs {firstName} can open</span>
        <span className="text-xs text-[#46566B]">
          No access hides the window · View turns off changes · Full allows changes · tick the tabs inside each window
        </span>
      </div>

      <div className="flex flex-col">
        {MODULE_GROUPS.map((group) => (
          <div key={group} className="flex flex-col">
            <span className="border-b border-[#EDF0F4] pt-3 pb-2 text-xs tracking-[0.08em] text-[#5E6B7E] uppercase">{group}</span>
            {MODULES.filter((m) => m.group === group).map((m) => (
              <ModuleRow
                key={m.key}
                module={m}
                value={access[m.key]}
                ceiling={ceiling[m.key]}
                original={detail.access[m.key]}
                disabled={!editable || pending}
                onLevel={(level) => setLevel(m.key, level)}
                onTab={(tab) => toggleTab(m.key, tab)}
              />
            ))}
          </div>
        ))}
      </div>

      {editable && dirty ? (
        <div className="sticky bottom-[calc(96px+env(safe-area-inset-bottom))] flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#FDE3BD] px-4 py-3 text-sm text-[#7A4300] md:bottom-4">
          Unsaved changes for {firstName}
          <button type="submit" disabled={pending} className="fill-orange h-10 rounded-full px-5 font-medium text-[#0E2A47] disabled:opacity-60">
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      ) : null}

      {member.editable ? (
        <div className="flex flex-wrap gap-2.5 border-t border-[#EDF0F4] pt-4">
          {member.status !== "DEACTIVATED" ? (
            <ActionButton
              disabled={pending}
              onClick={() =>
                run(
                  () => sendMemberPasswordResetAction({ userId: member.id }),
                  (r) => {
                    const sent = r.success && (r.data as { emailSent: boolean }).emailSent;
                    if (sent) toast.success(`Reset link sent to ${member.email}.`);
                    else toast.warning("The reset link could not be emailed. Check the email settings and try again.");
                  },
                )
              }
            >
              Reset password
            </ActionButton>
          ) : null}
          <ActionButton disabled={pending} onClick={() => run(() => revokeMemberSessionsAction({ userId: member.id }))}>
            Sign out of all devices
          </ActionButton>
          {member.locked ? (
            <ActionButton disabled={pending} onClick={() => run(() => unlockMemberAction({ userId: member.id }))}>
              Unlock account
            </ActionButton>
          ) : null}
          {member.status === "DEACTIVATED" ? (
            <ActionButton disabled={pending} onClick={() => run(() => setUserActiveAction({ userId: member.id, active: true }))}>
              Reactivate account
            </ActionButton>
          ) : (
            <ActionButton
              danger
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Deactivate ${member.name}? They will be signed out and cannot sign in until reactivated.`)) {
                  run(() => setUserActiveAction({ userId: member.id, active: false }));
                }
              }}
            >
              Deactivate account
            </ActionButton>
          )}
        </div>
      ) : null}
    </form>
  );
}

interface ModuleRowProps {
  module: (typeof MODULES)[number];
  value: AccessMap[ModuleKey];
  original: AccessMap[ModuleKey];
  ceiling: AccessMap[ModuleKey];
  disabled: boolean;
  onLevel: (level: AccessLevel) => void;
  onTab: (tab: string) => void;
}

function ModuleRow({ module: m, value, original, ceiling, disabled, onLevel, onTab }: ModuleRowProps) {
  const tabs: readonly { key: string; label: string }[] = "tabs" in m ? m.tabs : [];
  return (
    <div className="flex flex-col gap-2.5 border-b border-[#EDF0F4] py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-[1_1_240px] flex-col">
          <span className="text-[15px]">{m.label}</span>
          <span className="text-[13px] text-[#5E6B7E]">{m.description}</span>
        </div>
        <div role="radiogroup" aria-label={`${m.label} access`} className="flex gap-0.5 rounded-full bg-[#F4F6F9]/80 p-1">
          {ACCESS_LEVELS.map((level) => {
            const selected = value.level === level;
            // Keep a level they already have, but never offer more than the editor holds.
            const tooHigh = exceedsLevel(level, ceiling.level) && level !== original.level;
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled || tooHigh}
                title={tooHigh ? "You cannot give access you do not have yourself" : undefined}
                onClick={() => onLevel(level)}
                className={cn(
                  "h-8 rounded-full px-3.5 text-[13px] transition-colors disabled:cursor-not-allowed",
                  selected ? LEVEL_STYLES[level] : "text-[#46566B] enabled:hover:text-[#0E2A47] disabled:opacity-40",
                )}
              >
                {ACCESS_LEVEL_LABELS[level]}
              </button>
            );
          })}
        </div>
      </div>
      {tabs.length && value.level !== "NONE" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#5E6B7E]">
            {value.tabs.length} of {tabs.length} tabs:
          </span>
          {tabs.map((tab) => {
            const on = value.tabs.includes(tab.key);
            const tooHigh = !on && !original.tabs.includes(tab.key) && !ceiling.tabs.includes(tab.key);
            return (
              <button
                key={tab.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled || tooHigh}
                onClick={() => onTab(tab.key)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] disabled:cursor-not-allowed",
                  on ? "border-[#0E2A47] bg-white" : "border-[#D5DCE5] bg-white/60 text-[#46566B] disabled:opacity-50",
                )}
              >
                <span className={cn("grid size-[18px] place-items-center rounded-[5px] border", on ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#B8C2CF]")}>
                  {on ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({ children, danger, disabled, onClick }: { children: string; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-11 rounded-full border bg-white px-5 text-sm transition-colors disabled:opacity-60",
        danger ? "border-[#E8A79E] text-[#A1301F] hover:bg-[#FDF1EF]" : "border-[#D5DCE5] text-[#0E2A47] hover:bg-[#F4F6F9]",
      )}
    >
      {children}
    </button>
  );
}
