"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils";
import type { PatientListResult } from "@backend/features/patients/patients.types";

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 8;

export interface PatientChoice {
  id: string;
  name: string;
  patientNo: string;
}

/** Searchable patient dropdown backed by /api/patients; lists patients on open and narrows as you type. */
export function PatientPicker({ value, onChange, inputId }: { value: PatientChoice | null; onChange: (p: PatientChoice | null) => void; inputId: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientChoice[] | null>(null);
  const [active, setActive] = useState(0);
  const listId = `${inputId}-list`;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const q = query.trim();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?pageSize=${SEARCH_LIMIT}${q ? `&search=${encodeURIComponent(q)}` : ""}`, { signal: controller.signal });
        const body = (await res.json()) as { success: boolean; data?: PatientListResult };
        setResults(body.success && body.data ? body.data.items.map((p) => ({ id: p.id, name: p.fullName, patientNo: p.patientNo })) : []);
        setActive(0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") toast.error("We could not search patients. Try again.");
      }
    }, q ? SEARCH_DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const choose = (p: PatientChoice) => {
    onChange(p);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const count = results?.length ?? 0;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (count) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
    } else if (e.key === "Enter" && open && results?.[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  if (value && !open) {
    return (
      <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#BCD3F2] bg-[#E4EEFB] pr-2 pl-3">
        <Avatar name={value.name} letters={2} className="size-9 text-xs" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px]">{value.name}</span>
          <span className="text-xs text-[#5E6B7E]">{value.patientNo}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="h-9 rounded-full px-3 text-[13px] text-[#1D5296] hover:bg-white"
        >
          Change
        </button>
        <button type="button" onClick={() => onChange(null)} aria-label="Clear patient" className="grid size-9 place-items-center rounded-full text-[#5E6B7E] hover:bg-white">
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className={cn(
          "flex h-12 items-center gap-2 rounded-full border bg-white px-4 transition-colors",
          open ? "border-[#1D5296] ring-3 ring-[#1D5296]/15" : "border-[#D5DCE5] hover:border-[#A9B6C6]",
        )}
      >
        <Search className="size-4 shrink-0 text-[#8A97A8]" aria-hidden />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results?.[active] ? `${listId}-${results[active].id}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          placeholder="Select or search a patient by name, patient no. or mobile"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#8A97A8]"
        />
        <button type="button" tabIndex={-1} aria-label={open ? "Close patient list" : "Open patient list"} onClick={() => setOpen((o) => !o)} className="grid size-7 place-items-center rounded-full text-[#5E6B7E] hover:bg-[#F4F6F9]">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </div>

      {open ? (
        <ul id={listId} role="listbox" aria-label="Patients" className="absolute inset-x-0 top-[calc(100%+6px)] z-20 flex max-h-72 flex-col overflow-y-auto rounded-2xl border border-[#E3E7ED] bg-white p-1.5 shadow-xl">
          {results === null ? <li className="px-3 py-2.5 text-sm text-[#5E6B7E]">Loading patients…</li> : null}
          {results?.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${p.id}`}
              role="option"
              aria-selected={i === active}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
              onPointerEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2", i === active && "bg-[#F2F6FB]")}
            >
              <Avatar name={p.name} letters={2} className="size-8 text-xs" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{p.name}</span>
                <span className="text-xs text-[#5E6B7E]">{p.patientNo}</span>
              </span>
              {p.id === value?.id ? <Check className="size-4 text-[#1D5296]" aria-hidden /> : null}
            </li>
          ))}
          {results?.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-[#5E6B7E]">{query.trim() ? "No matching patients. Add them in Patients first." : "No patients yet. Add them in Patients first."}</li>
          ) : null}
          {results && results.length === SEARCH_LIMIT ? <li className="px-3 pt-1.5 pb-1 text-xs text-[#8A97A8]">Type to find more patients</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
