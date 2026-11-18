"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

export function PrintButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={cn("inline-flex h-10 items-center gap-2 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm print:hidden", className)}>
      <Printer className="size-4" aria-hidden />
      {label}
    </button>
  );
}
