"use client";

import { useState } from "react";
import { ManualContactForm } from "./manual-contact-form";
import { BulkContactForm } from "./bulk-contact-form";

export function ContactsEntryPanel() {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  return <div>
    <div className="mb-5 flex gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-2" aria-label="Tipo de carga">
      {([['single', 'Alta individual'], ['bulk', 'Pegar lista']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-medium ${mode === value ? 'bg-cyan-700 text-white' : 'text-zinc-400 hover:bg-zinc-900'}`}>{label}</button>)}
    </div>
    <div hidden={mode !== "single"}><ManualContactForm /></div>
    <div hidden={mode !== "bulk"}><BulkContactForm /></div>
  </div>;
}
