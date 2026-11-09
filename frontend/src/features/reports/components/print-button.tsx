"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm print:hidden">
      <Printer className="size-4" aria-hidden />
      {label}
    </button>
  );
}
