import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center">
      <ErrorState
        icon={FileQuestion}
        tone="default"
        title="Page not found"
        description="The page or record you are looking for does not exist, or you may not have access to it."
        actions={
          <Link href="/dashboard" className={buttonVariants()}>
            Go to dashboard
          </Link>
        }
      />
    </main>
  );
}
