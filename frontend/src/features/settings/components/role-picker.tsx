"use client";

import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@backend/config/permissions";

interface RolePickerProps {
  roles: readonly Role[];
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
}

export function RolePicker({ roles, value, onChange, disabled }: RolePickerProps) {
  return (
    <div role="radiogroup" aria-label="Role" className="flex flex-wrap gap-2">
      {roles.map((role) => {
        const selected = role === value;
        return (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(role)}
            className={cn(
              "h-10 rounded-full border px-4 text-[15px] transition-colors disabled:cursor-not-allowed",
              selected ? "btn-navy border-transparent text-white" : "border-[#D5DCE5] bg-white hover:bg-[#F4F6F9] disabled:opacity-60",
            )}
          >
            {ROLE_LABELS[role]}
          </button>
        );
      })}
    </div>
  );
}
