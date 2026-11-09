"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/hooks/use-action-form";
import { cn } from "@/lib/utils";
import { archiveServiceAction, createServiceAction, updateServiceAction } from "@backend/features/catalog/catalog.controller";
import { serviceInputSchema } from "@backend/features/catalog/catalog.schema";
import { VAT_RATE, round2 } from "@backend/features/billing/billing.calc";
import { SERVICE_KIND_LABELS, type CatalogService, type ServiceKind } from "@backend/features/catalog/catalog.types";
import { primaryButtonClass, fieldLabelsClass, inputClass, selectClass } from "@/components/forms/styles";

type Filter = "all" | ServiceKind;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "service", label: "Dental services" },
  { id: "product", label: "Medicines and products" },
];

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const rowButton = "h-8 rounded-full px-3 text-[13px] disabled:opacity-50";

export function PriceList({ services, canEdit, vatRegistered }: { services: CatalogService[]; canEdit: boolean; vatRegistered: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<CatalogService | "new" | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();

  const shown = services.filter((s) => filter === "all" || s.kind === filter);
  const countFor = (id: Filter) => (id === "all" ? services.length : services.filter((s) => s.kind === id).length);

  const remove = (service: CatalogService) =>
    startRemove(async () => {
      const result = await archiveServiceAction(service.id);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`${service.name}: ${result.message ?? "removed."}`);
      setConfirmingId(null);
      router.refresh();
    });

  const closeForm = () => {
    setEditing(null);
    router.refresh();
  };

  return (
    <section aria-label="Services and prices" className="glass-card flex min-w-0 flex-col gap-4 rounded-[24px] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="text-xl font-normal">Services &amp; prices</h2>
          <p className="text-[13px] text-[#5E6B7E]">
            The price list used on every sales invoice and at checkout.{" "}
            {vatRegistered
              ? `Prices are before VAT; ${VAT_RATE * 100}% VAT is added on the invoice, except for senior citizens and PWDs.`
              : "The clinic is not VAT-registered, so no VAT is added."}{" "}
            Changes apply to new invoices straight away.
          </p>
        </div>
        {canEdit && editing === null ? (
          <button type="button" onClick={() => setEditing("new")} className={primaryButtonClass}>
            + Add service
          </button>
        ) : null}
      </div>

      {editing ? <ServiceForm key={editing === "new" ? "new" : editing.id} service={editing === "new" ? null : editing} onDone={closeForm} onCancel={() => setEditing(null)} /> : null}

      <div role="group" aria-label="Filter the price list" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "h-[34px] rounded-full border px-3.5 text-[13px]",
              filter === f.id ? "border-[#1D5296] bg-[#1D5296] text-white" : "border-[#D5DCE5] bg-white text-[#46566B]",
            )}
          >
            {f.label} · {countFor(f.id)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#E3E7ED] text-left text-xs text-[#5E6B7E]">
              <th className="py-2 pr-3 font-normal">Service or item</th>
              <th className="py-2 pr-3 font-normal">Type</th>
              <th className="py-2 pr-3 font-normal">HMO</th>
              <th className="py-2 pr-3 text-right font-normal">Price</th>
              {vatRegistered ? <th className="py-2 pr-3 text-right font-normal">With {VAT_RATE * 100}% VAT</th> : null}
              {canEdit ? <th className="py-2 font-normal"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const isEditing = editing !== null && editing !== "new" && editing.id === s.id;
              const isConfirming = confirmingId === s.id;
              return (
                <tr key={s.id} className={cn("border-b border-[#EDF0F4]", isEditing && "bg-[#EEF3FA]", isConfirming && "bg-[#FDF0EE]")}>
                  <td className="py-2.5 pr-3">{s.name}</td>
                  <td className="py-2.5 pr-3 text-[#46566B]">{SERVICE_KIND_LABELS[s.kind]}</td>
                  <td className="py-2.5 pr-3 text-[#46566B]">{s.hmoCoverable ? "Yes" : "No"}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{peso.format(s.price)}</td>
                  {vatRegistered ? <td className="py-2.5 pr-3 text-right tabular-nums">{peso.format(round2(s.price * (1 + VAT_RATE)))}</td> : null}
                  {canEdit ? (
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {isConfirming ? (
                        <>
                          <button type="button" disabled={removing} onClick={() => remove(s)} className={cn(rowButton, "bg-[#B3261E] text-white")}>
                            Remove
                          </button>{" "}
                          <button type="button" disabled={removing} onClick={() => setConfirmingId(null)} className={cn(rowButton, "border border-[#D5DCE5] bg-white")}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)} className={cn(rowButton, "border border-[#D5DCE5] bg-white")}>
                            Edit
                          </button>{" "}
                          <button type="button" aria-label={`Remove ${s.name}`} onClick={() => setConfirmingId(s.id)} className={cn(rowButton, "text-[#B3261E] hover:bg-[#FDF0EE]")}>
                            Remove
                          </button>
                        </>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 ? <p className="py-6 text-center text-sm text-[#5E6B7E]">Nothing on the price list here yet.</p> : null}
      </div>

      <p className="text-xs text-[#5E6B7E]">
        {services.length} services and items on the price list.{canEdit ? " Removed items stay on past invoices." : " Only people with full Settings access can change prices."}
      </p>
    </section>
  );
}

function ServiceForm({ service, onDone, onCancel }: { service: CatalogService | null; onDone: () => void; onCancel: () => void }) {
  const { form, onSubmit, isPending } = useActionForm({
    schema: serviceInputSchema,
    defaultValues: service
      ? { name: service.name, price: String(service.price), kind: service.kind, hmoCoverable: service.hmoCoverable }
      : { name: "", price: "", kind: "service", hmoCoverable: false },
    action: (values) => (service ? updateServiceAction(service.id, values) : createServiceAction(values)),
    onSuccess: onDone,
  });

  return (
    <form onSubmit={onSubmit} noValidate aria-label={service ? `Edit ${service.name}` : "Add a service or item"} className="flex flex-col gap-4 rounded-2xl bg-[#F4F6F9]/80 p-4">
      <span className="text-[15px] font-medium">{service ? `Edit ${service.name}` : "Add a service or item"}</span>
      <FormRootError form={form} />
      <div className={cn("grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]", fieldLabelsClass)}>
        <FormTextField form={form} name="name" label="Service or item name" placeholder="e.g. Fluoride varnish application" autoComplete="off" className={inputClass} />
        <FormTextField form={form} name="price" label="Price before VAT (₱)" inputMode="decimal" placeholder="e.g. 1500" autoComplete="off" className={inputClass} />
        <label className="flex flex-col gap-2 text-sm text-[#46566B]">
          Type
          <select className={selectClass} {...form.register("kind")}>
            <option value="service">{SERVICE_KIND_LABELS.service}</option>
            <option value="product">{SERVICE_KIND_LABELS.product}</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-[#46566B]">
        <input type="checkbox" className="size-4 accent-[#1D5296]" {...form.register("hmoCoverable")} />
        HMO can cover it
      </label>
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={isPending} pendingLabel="Saving…" className={primaryButtonClass}>
          {service ? "Save changes" : "Add to price list"}
        </SubmitButton>
        <button type="button" onClick={onCancel} className="h-12 rounded-full border border-[#D5DCE5] bg-white px-6 text-[15px]">
          Cancel
        </button>
      </div>
    </form>
  );
}
