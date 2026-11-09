import { cn } from "@/lib/utils";

const AVATAR_COLORS = ["#DCEAFB", "#FDE3BD", "#D7F2E5", "#FBD9D4", "#E6E0FA"];

function initialsOf(name: string, letters: 1 | 2) {
  const words = name.replace(/^Dr\.?\s*/i, "").split(/\s+/).filter(Boolean);
  return words
    .slice(0, letters)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/** Initials on a colour picked deterministically from the name. */
export function Avatar({ name, letters = 1, className }: { name: string; letters?: 1 | 2; className?: string }) {
  const color = AVATAR_COLORS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className={cn("grid size-[38px] shrink-0 place-items-center rounded-full text-sm text-[#0E2A47]", className)} style={{ background: color }}>
      {initialsOf(name, letters)}
    </span>
  );
}
