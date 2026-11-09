import type { ReactNode } from "react";

/** Title + subtitle at the top of the auth card. */
export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-col gap-2">
      <h1 className="text-[28px] leading-[1.1] font-bold tracking-[-0.02em] min-[360px]:text-[30px] sm:text-[34px] desk:text-[40px]">{title}</h1>
      {description ? <p className="text-[15px] leading-[1.45] text-[#4A5D75] sm:text-[17px] desk:text-[19px]">{description}</p> : null}
    </header>
  );
}
