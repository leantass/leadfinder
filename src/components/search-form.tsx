"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { runGoogleMapsSearchAction } from "@/app/actions";

type SearchActionState = {
  ok: boolean;
  error: string | null;
  jobId: string | null;
};

const initialSearchActionState: SearchActionState = {
  ok: false,
  error: null,
  jobId: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-white px-5 py-3 font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Procesando búsqueda..." : "Ejecutar búsqueda"}
    </button>
  );
}

function FormMessages({ state }: { state: SearchActionState }) {
  const { pending } = useFormStatus();

  if (pending) {
    return (
      <div className="rounded-xl border border-blue-900 bg-blue-950/40 px-4 py-3 text-sm text-blue-300">
        Ejecutando búsqueda y guardando leads...
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
        {state.error}
      </div>
    );
  }

  if (state.ok) {
    return (
      <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
        Búsqueda ejecutada correctamente.
      </div>
    );
  }

  return null;
}

export function SearchForm() {
  const [state, formAction] = useActionState(
    runGoogleMapsSearchAction,
    initialSearchActionState
  );

  const formRef = useRef<HTMLFormElement>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();

      if (queryInputRef.current) {
        queryInputRef.current.focus();
      }
    }
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-6 grid gap-4 md:grid-cols-4"
    >
      <div className="md:col-span-3">
        <label
          htmlFor="query"
          className="mb-2 block text-sm font-medium text-zinc-300"
        >
          Búsqueda
        </label>
        <input
          ref={queryInputRef}
          id="query"
          name="query"
          type="text"
          required
          placeholder="Ej: pizzerias en lanus"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-zinc-500"
        />
      </div>

      <div>
        <label
          htmlFor="maxResults"
          className="mb-2 block text-sm font-medium text-zinc-300"
        >
          Máx. resultados
        </label>
        <input
          id="maxResults"
          name="maxResults"
          type="number"
          min={1}
          defaultValue={3}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-zinc-500"
        />
      </div>

      <div className="md:col-span-4 space-y-3">
        <SubmitButton />
        <FormMessages state={state} />
      </div>
    </form>
  );
}