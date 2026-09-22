"use client";

import Link from "next/link";
import { FormEvent, useRef, useState, useTransition } from "react";

import { createManualLeadAction } from "@/app/actions";
import type { ManualLeadFieldErrors } from "@/lib/leads/manual-lead";

type FormStatus = "idle" | "error" | "success";

const fields = [
  { name: "businessName", label: "Nombre del negocio", required: true, type: "text", placeholder: "Ej. Estudio Norte" },
  { name: "phone", label: "Teléfono", required: false, type: "tel", placeholder: "+54 11 5555-1234" },
  { name: "website", label: "Sitio web", required: false, type: "text", placeholder: "ejemplo.com" },
  { name: "category", label: "Categoría", required: false, type: "text", placeholder: "Ej. Servicios profesionales" },
  { name: "address", label: "Dirección", required: false, type: "text", placeholder: "Calle y número" },
  { name: "city", label: "Ciudad", required: false, type: "text", placeholder: "Ej. Buenos Aires" },
] as const;

export function ManualContactForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const businessNameRef = useRef<HTMLInputElement>(null);
  const submissionLockRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<FormStatus>("idle");
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ManualLeadFieldErrors>({});
  const [createdLead, setCreatedLead] = useState<{ id: string; businessName: string } | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionLockRef.current || isPending) {
      return;
    }

    submissionLockRef.current = true;
    setStatus("idle");
    setGeneralError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const result = await createManualLeadAction({
          businessName: String(formData.get("businessName") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          website: String(formData.get("website") ?? ""),
          category: String(formData.get("category") ?? ""),
          address: String(formData.get("address") ?? ""),
          city: String(formData.get("city") ?? ""),
        });

        if (!result.ok || !result.lead) {
          setStatus("error");
          setGeneralError(result.error);
          setFieldErrors(result.fieldErrors);
          return;
        }

        setCreatedLead({ id: result.lead.id, businessName: result.lead.businessName });
        setStatus("success");
      } catch {
        setStatus("error");
        setGeneralError("No se pudo incorporar el contacto. Intentá nuevamente.");
      } finally {
        submissionLockRef.current = false;
      }
    });
  }

  function handleReset() {
    formRef.current?.reset();
    setCreatedLead(null);
    setStatus("idle");
    setGeneralError(null);
    setFieldErrors({});
    requestAnimationFrame(() => businessNameRef.current?.focus());
  }

  if (status === "success" && createdLead) {
    return (
      <div className="rounded-3xl border border-emerald-900/70 bg-emerald-950/25 p-6 sm:p-8" role="status" data-testid="contact-success">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-900/50 text-2xl text-emerald-300">✓</div>
        <p className="mt-5 text-xs font-medium uppercase tracking-[0.22em] text-emerald-400">Contacto incorporado</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">{createdLead.businessName} ya está en Leads</h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
          Se creó como lead de origen manual y ya puede usar estados, seguimiento, notas y automatización.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href={`/leads?q=${encodeURIComponent(createdLead.businessName)}`} className="inline-flex h-11 items-center justify-center rounded-2xl bg-cyan-700 px-5 text-sm font-medium text-white transition hover:bg-cyan-600">
            Ver lead
          </Link>
          <button type="button" onClick={handleReset} className="inline-flex h-11 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900 px-5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800">
            Cargar otro
          </button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5 sm:p-7" aria-busy={isPending}>
      <div className="border-b border-zinc-800 pb-5">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-400">Alta individual</p>
        <h3 className="mt-2 text-xl font-semibold text-white">Nuevo contacto manual</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          El contacto entra directamente al proceso comercial de Leads. Ingresá al menos un teléfono o sitio web.
        </p>
      </div>

      {generalError ? (
        <div className="mt-5 rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-200" role="alert">
          {generalError}
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {fields.map((field, index) => {
          const error = fieldErrors[field.name];
          const errorId = `${field.name}-error`;
          const isContactField = field.name === "phone" || field.name === "website";

          return (
            <label key={field.name} className={index === 0 ? "sm:col-span-2" : ""}>
              <span className="text-sm font-medium text-zinc-200">
                {field.label}{field.required ? <span className="ml-1 text-cyan-400">*</span> : null}
              </span>
              <input
                ref={field.name === "businessName" ? businessNameRef : undefined}
                name={field.name}
                type={field.type}
                required={field.required}
                placeholder={field.placeholder}
                inputMode={field.name === "website" ? "url" : undefined}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : isContactField ? "contact-requirement" : undefined}
                disabled={isPending}
                className={`mt-2 h-12 w-full rounded-2xl border bg-[#0b1220] px-4 text-sm text-white outline-none transition placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-60 ${error ? "border-red-700 focus:border-red-500" : "border-zinc-700 focus:border-cyan-600"}`}
              />
              {error ? <span id={errorId} className="mt-2 block text-sm text-red-300">{error}</span> : null}
            </label>
          );
        })}
      </div>

      <p id="contact-requirement" className="mt-5 rounded-2xl border border-cyan-950 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-200">
        Requisito de contacto: completá teléfono, sitio web o ambos.
      </p>

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-zinc-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-zinc-500">Los campos opcionales vacíos no se guardan.</p>
        <button type="submit" disabled={isPending} className="inline-flex h-12 min-w-44 items-center justify-center rounded-2xl bg-cyan-700 px-6 text-sm font-medium text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60" data-testid="contact-submit">
          {isPending ? "Incorporando..." : "Incorporar a Leads"}
        </button>
      </div>
    </form>
  );
}
