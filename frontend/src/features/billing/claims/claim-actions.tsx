"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/styles";
import { clinicToday } from "@/config/clinic";
import { cn } from "@/lib/utils";
import { updateClaimAction } from "@backend/features/billing/claims/claims.controller";
import { DENIAL_REASONS } from "@backend/features/billing/claims/claims.schema";
import type { ClaimActionInput, ClaimStatus } from "@backend/features/billing/claims/claims.types";
import { peso } from "../format";

type ActionType = ClaimActionInput["type"];

const ACTIONS: Record<"submitted" | "approved", ActionType[]> = { submitted: ["approve", "pay", "deny"], approved: ["pay", "deny"] };
const ACTION_LABELS: Record<ActionType, string> = { approve: "Approve", pay: "Mark paid", deny: "Deny" };
const fieldClass = "h-11 rounded-full border border-[#D5DCE5] bg-white px-4 text-[15px] outline-none focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15";
const label = "flex flex-col gap-1.5 text-sm text-[#46566B]";

interface ClaimActionsProps {
  claimId: string;
  status: ClaimStatus;
  invoiceNumber: string;
  patientName: string;
  claimed: number;
  approved: number;
}

export function ClaimActions({ claimId, status, invoiceNumber, patientName, claimed, approved }: ClaimActionsProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<ActionType>("approve");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(clinicToday());
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  if (status !== "submitted" && status !== "approved") return null;
  const actions = ACTIONS[status];

  const open = (next: ActionType) => {
    setType(next);
    setAmount(String(next === "approve" ? claimed : approved));
    setReason("");
    setReference("");
    setError("");
    dialogRef.current?.showModal();
  };

  const buildInput = (): ClaimActionInput => {
    if (type === "approve") return { type, amount: Number(amount) };
    if (type === "pay") return { type, amount: Number(amount), paidOn, reference };
    return { type, reason: reason as (typeof DENIAL_REASONS)[number] };
  };

  const save = () =>
    startTransition(async () => {
      setError("");
      const result = await updateClaimAction(claimId, buildInput());
      if (!result.success) {
        setError(Object.values(result.error.fields ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      toast.success(result.message ?? "Claim updated.");
      dialogRef.current?.close();
      router.refresh();
    });

  return (
    <>
      <span className="flex gap-1.5">
        {actions.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => open(a)}
            className={cn("h-8 rounded-full border px-3 text-xs", a === "deny" ? "border-[#F6C6BE] bg-white text-[#A1301F]" : "border-[#D5DCE5] bg-white text-[#0E2A47] hover:bg-[#F4F6F9]")}
          >
            {ACTION_LABELS[a]}
          </button>
        ))}
      </span>

      <dialog ref={dialogRef} aria-label={`${ACTION_LABELS[type]} claim`} className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[28px] bg-[#F7F9FC] p-0 text-[#0E2A47] shadow-2xl backdrop:bg-[#0E2A47]/40">
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-xl">{ACTION_LABELS[type]} claim</h2>
              <p className="text-[13px] text-[#5E6B7E]">
                {invoiceNumber} · {patientName} · HMO share {peso(claimed)}
              </p>
            </div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-white">
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {type === "deny" ? (
            <label className={label}>
              Reason
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={selectClass}>
                <option value="">Pick a reason…</option>
                {DENIAL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[#5E6B7E]">The patient can then be billed for the HMO share.</span>
            </label>
          ) : (
            <label className={label}>
              {type === "approve" ? "Approved amount" : "Amount received"}
              <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldClass} />
              <span className="text-xs text-[#5E6B7E]">
                {type === "approve" ? `Up to ${peso(claimed)}.` : `Up to the approved ${peso(approved)}. Enter what arrived, net of any tax withheld.`}
              </span>
            </label>
          )}

          {type === "pay" ? (
            <>
              <label className={label}>
                Date paid
                <input type="date" value={paidOn} max={clinicToday()} onChange={(e) => setPaidOn(e.target.value)} className={fieldClass} />
              </label>
              <label className={label}>
                Check, deposit or remittance reference
                <input type="text" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} className={fieldClass} />
              </label>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-sm text-[#A1301F]">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={pending}
            onClick={save}
            className={cn("h-12 rounded-full text-[15px] font-medium disabled:opacity-60", type === "deny" ? "bg-[#B3261E] text-white" : "fill-orange text-[#0E2A47]")}
          >
            {pending ? "Saving…" : type === "deny" ? "Deny claim" : type === "approve" ? "Approve claim" : "Record HMO payment"}
          </button>
        </div>
      </dialog>
    </>
  );
}
