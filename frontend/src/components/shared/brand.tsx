import { cn } from "@/lib/utils";

/** iSmile wordmark. Pure SVG/CSS so it renders in every boundary, including global-error. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-primary" />
        <path
          d="M9 13.5c0-2.5 2-4 4-3.5 1.2.3 2 .8 3 .8s1.8-.5 3-.8c2-.5 4 1 4 3.5 0 3-1 4.5-1.6 7.2-.4 1.6-2.2 1.6-2.6 0L18 17.5c-.4-1.3-1.6-1.3-2 0l-.8 3.2c-.4 1.6-2.2 1.6-2.6 0C12 18 9 16.5 9 13.5Z"
          className="fill-primary-foreground"
        />
      </svg>
      <span>
        i<span className="text-primary">Smile</span> CRM
      </span>
    </span>
  );
}
