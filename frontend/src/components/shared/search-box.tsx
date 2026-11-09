"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

const DEBOUNCE_MS = 300;

/** Search box that keeps the query in the URL (`q`), so the server renders the matching list. */
export function SearchBox({ id, label, placeholder }: { id: string; label: string; placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("q") ?? "";
  const [value, setValue] = useState(current);

  useEffect(() => {
    if (value.trim() === current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, current, params, pathname, router]);

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-[#5E6B7E]" aria-hidden />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        placeholder={placeholder}
        className="h-11 w-full rounded-full border border-[#D5DCE5] bg-white pr-4 pl-10 text-sm outline-none placeholder:text-[#8A97A8] focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15"
      />
    </div>
  );
}
