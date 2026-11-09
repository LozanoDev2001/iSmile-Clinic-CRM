import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { findComingSoonModule } from "@/config/navigation";
import { can, requirePageUser } from "@backend/lib/authorization";

interface ModulePageProps {
  params: Promise<{ module: string }>;
}

export async function generateMetadata({ params }: ModulePageProps): Promise<Metadata> {
  const navModule = findComingSoonModule((await params).module);
  return { title: navModule?.label ?? "Not found" };
}

/** Placeholder for sidebar modules that are on the roadmap but not built yet. */
export default async function ModulePage({ params }: ModulePageProps) {
  const navModule = findComingSoonModule((await params).module);
  if (!navModule) notFound();

  const user = await requirePageUser();
  if (navModule.permission && !can(user, navModule.permission)) return <AccessDenied />;

  return (
    <section className="glass-card mx-auto mt-6 flex max-w-xl flex-col items-center gap-4 rounded-3xl px-6 py-12 text-center sm:mt-12">
      <span className="fill-orange grid size-16 place-items-center rounded-full text-[#0E2A47]">
        <navModule.icon className="size-7" strokeWidth={1.8} aria-hidden />
      </span>
      <span className="rounded-full bg-[#FDE3BD] px-3 py-1 text-xs font-medium text-[#A55A00]">Coming soon</span>
      <h1 className="text-[28px] font-normal tracking-[-0.01em]">{navModule.label}</h1>
      <p className="max-w-md text-[15px] leading-relaxed text-[#5E6B7E]">{navModule.comingSoon}</p>
      <Link
        href="/dashboard"
        className="btn-navy mt-2 inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm text-white"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to dashboard
      </Link>
    </section>
  );
}
