import type { ReactNode } from "react";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatePanelProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Shown so users can quote it to support; never contains error details. */
  reference?: string;
  actions?: ReactNode;
  tone?: "default" | "destructive";
  className?: string;
}

/** Friendly, non-technical error panel used by every error boundary. */
export function ErrorState({
  icon: Icon = AlertTriangle,
  title,
  description,
  reference,
  actions,
  tone = "destructive",
  className,
}: StatePanelProps) {
  return (
    <div
      role="alert"
      className={cn("mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center", className)}
    >
      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground",
        )}
      >
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap justify-center gap-2">{actions}</div> : null}
      {reference ? <p className="font-mono text-xs text-muted-foreground">Reference: {reference}</p> : null}
    </div>
  );
}

export type { StatePanelProps };
