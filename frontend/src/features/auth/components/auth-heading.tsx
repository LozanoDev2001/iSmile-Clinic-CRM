import type { ReactNode } from "react";

/** Title + subtitle at the top of the auth card. */
export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">{title}</h1>
      {description ? <p className="mt-1.5 text-[15px] text-[#4a5f7a]">{description}</p> : null}
    </header>
  );
}
