"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { PatientListResult } from "@backend/features/patients/patients.types";

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 8;

export interface PatientChoice {
  id: string;
  name: string;
  patientNo: string;
}

/** Search-as-you-type patient chooser backed by /api/patients. */
export function PatientPicker({ value, onChange, inputId }: { value: PatientChoice | null; onChange: (p: PatientChoice | null) => void; inputId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientChoice[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?pageSize=${SEARCH_LIMIT}&search=${encodeURIComponent(q)}`, { signal: controller.signal });
        const body = (await res.json()) as { success: boolean; data?: PatientListResult };
        setResults(body.success && body.data ? body.data.items.map((p) => ({ id: p.id, name: p.fullName, patientNo: p.patientNo })) : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") toast.error("We could not search patients. Try again.");
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#E4EEFB] px-4 py-2.5">
        <span className="min-w-0 truncate text-[15px]">
          {value.name} <span className="text-xs text-[#5E6B7E]">{value.patientNo}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-[#1D5296] underline">
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        placeholder="Type at least 2 letters of a name, patient no. or mobile"
        className="h-12 rounded-full border border-[#D5DCE5] bg-white px-[18px] text-[15px] outline-none focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15"
      />
      {query.trim().length >= 2 ? (
        <ul aria-label="Matching patients" className="flex max-h-48 flex-col overflow-y-auto rounded-2xl border border-[#E3E7ED] bg-white">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange(p)} className="w-full px-4 py-2 text-left text-sm hover:bg-[#F4F6F9]">
                {p.name} <span className="text-xs text-[#5E6B7E]">{p.patientNo}</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? <li className="px-4 py-2 text-sm text-[#5E6B7E]">No matching patients. Add them in Patients first.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
