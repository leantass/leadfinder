"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { previewBulkContactsAction, confirmBulkContactsAction } from "@/app/bulk-contact-actions";
import { assertBulkPayload, bulkFields, detectBulkDelimiter, inferBulkMapping, parseBulkText, prepareBulkRows,
  type BulkConfig, type BulkField, type Delimiter, type ParsedTable } from "@/lib/leads/bulk-contact-parser";
import type { BulkPreview, BulkResult } from "@/lib/leads/bulk-contact-import";

const labels: Record<BulkField, string> = { businessName: "Nombre del negocio", phone: "Teléfono", website: "Sitio web", category: "Categoría", address: "Dirección", city: "Ciudad" };
const delimiterNames: Record<Delimiter, string> = { "\t": "Tabulación", ",": "Coma", ";": "Punto y coma" };
const control = "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white disabled:opacity-50";
const button = "min-h-11 rounded-xl bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50";

export function BulkContactForm() {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<Delimiter[]>([]);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [config, setConfig] = useState<BulkConfig | null>(null);
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [overrides, setOverrides] = useState<number[]>([]);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);

  function configure(delimiter: Delimiter) {
    setError(null); setPreview(null);
    try {
      const parsed = parseBulkText(text, delimiter);
      const inferred = inferBulkMapping(parsed.records[0]?.cells ?? []);
      setTable(parsed); setConfig({ delimiter, hasHeaders: inferred.hasHeaders,
        mapping: inferred.hasHeaders ? inferred.mapping : Array(parsed.columns).fill(null) });
    } catch (e) { setError((e as Error).message); setTable(null); setConfig(null); }
  }
  function detect() {
    setError(null); setConfig(null); setTable(null); setPreview(null); setOptions([]);
    try {
      assertBulkPayload({ text });
      const detection = detectBulkDelimiter(text); setOptions(detection.options);
      if (detection.delimiter) configure(detection.delimiter);
    } catch (e) { setError((e as Error).message); }
  }
  function acceptPreview(value: BulkPreview) {
    setPreview(value); setSelected(value.rows.filter(row => row.status === "NEW").map(row => row.sourceRow)); setOverrides([]);
  }
  async function review() {
    if (!config || sending.current) return;
    setError(null);
    try { prepareBulkRows({ text, config }); } catch (e) { setError((e as Error).message); return; }
    sending.current = true; setPending(true);
    try {
      const response = await previewBulkContactsAction({ text, config });
      if (response.ok) acceptPreview(response.preview); else setError(response.error);
    } catch { setError("No se pudo revisar la lista. Intentá nuevamente."); }
    finally { sending.current = false; setPending(false); }
  }
  async function confirm() {
    if (!config || !preview || !selected.length || sending.current) return;
    const input = { text, config, batchId: preview.batchId, contentHash: preview.contentHash, token: preview.token,
      selectedRows: selected, overrides: overrides.filter(row => selected.includes(row)) };
    try { assertBulkPayload(input); } catch (e) { setError((e as Error).message); return; }
    sending.current = true; setPending(true); setError(null);
    try {
      const response = await confirmBulkContactsAction(input);
      if (!response.ok) setError(response.error);
      else if (response.kind === "changed") { acceptPreview(response.preview); setError("Las coincidencias cambiaron. Revisá la preview actualizada; no se creó ningún contacto."); }
      else setResult(response.result);
    } catch { setError("No se pudo recibir el resultado. Reintentá con esta misma preview."); }
    finally { sending.current = false; setPending(false); }
  }
  function reset() { setResult(null); setPreview(null); setText(""); setConfig(null); setTable(null); setOptions([]); setError(null); setSelected([]); setOverrides([]); }

  if (result) return <section role="status" className="rounded-3xl border border-emerald-900 bg-emerald-950/25 p-5 sm:p-7">
    <h3 className="text-xl font-semibold text-white">{result.created} contactos incorporados a Leads</h3>
    <p className="mt-3 text-sm text-zinc-300">{result.duplicate} duplicados omitidos · {result.invalid} inválidos · {result.possibleOmitted} posibles duplicados no seleccionados · {result.newOmitted} nuevos no seleccionados</p>
    <div className="mt-5 flex flex-wrap gap-3"><Link href="/leads" className={button}>Ver Leads</Link><button type="button" onClick={reset} className={button}>Pegar otra lista</button></div>
  </section>;

  return <section className="min-w-0 rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5 sm:p-7" aria-busy={pending}>
    <h3 className="text-xl font-semibold text-white">Pegar lista de contactos</h3>
    <p className="mt-2 text-sm text-zinc-400">Hasta 100 contactos desde Excel, Sheets o CSV. Máximo 256 KiB y 2000 caracteres por celda. Revisá antes de crear.</p>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
    {!preview ? <>
      <label htmlFor="bulk-contact-text" className="mt-5 block text-sm text-zinc-200">Lista de contactos</label>
      <textarea id="bulk-contact-text" value={text} disabled={pending} onChange={e => { setText(e.target.value); setConfig(null); setTable(null); setOptions([]); }} rows={7} className={`${control} mt-2 font-mono`} placeholder={'Nombre\tTeléfono\tCiudad\nEstudio Norte\t+54 11 5555-1234\tBuenos Aires'} />
      <button type="button" disabled={pending || !text.trim()} onClick={detect} className={`${button} mt-3`}>Detectar formato</button>
      {options.length > 0 && <label className="mt-5 block text-sm text-zinc-200">{options.length > 1 ? "Formato ambiguo: elegí el delimitador" : "Delimitador"}
        <select className={`${control} mt-2`} disabled={pending} value={config?.delimiter ?? ""} onChange={e => configure(e.target.value as Delimiter)}>
          <option value="" disabled>Elegir delimitador</option>{options.map(option => <option key={option} value={option}>{delimiterNames[option]}</option>)}
        </select>
      </label>}
      {config && table && <div className="mt-5 space-y-4">
        <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-200"><input type="checkbox" checked={config.hasHeaders} disabled={pending} onChange={e => setConfig({ ...config, hasHeaders: e.target.checked })} />La primera fila contiene encabezados</label>
        <div className="grid gap-4 sm:grid-cols-2">
          {config.mapping.map((field, index) => <label key={index} className="min-w-0 text-sm text-zinc-300">
            <span className="block break-words">Columna {index + 1}: {(table.records[0]?.cells[index] || "Vacía").slice(0, 80)}</span>
            <select className={`${control} mt-2`} disabled={pending} aria-label={`Destino columna ${index + 1}`} value={field ?? ""} onChange={e => setConfig({ ...config, mapping: config.mapping.map((value, i) => i === index ? (e.target.value as BulkField || null) : value) })}>
              <option value="">Ignorar</option>{bulkFields.map(value => <option key={value} value={value} disabled={value !== field && config.mapping.includes(value)}>{labels[value]}</option>)}
            </select>
          </label>)}
        </div>
        <button type="button" disabled={pending} onClick={review} className={button}>{pending ? "Revisando..." : "Ver preview"}</button>
      </div>}
    </> : <div className="mt-5">
      <p className="text-sm leading-6 text-zinc-300" role="status">{preview.counts.empty} vacías ignoradas · {preview.counts.invalid} inválidas · {preview.counts.duplicate} duplicadas · {preview.counts.possible} posibles duplicadas · {preview.counts.new} nuevas · {selected.length} seleccionadas para crear</p>
      <div className="mt-4 space-y-3">
        {preview.rows.map(row => <article key={row.sourceRow} className="min-w-0 rounded-2xl border border-zinc-700 bg-zinc-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-white">Fila {row.sourceRow}</p><span className={`rounded-lg px-2 py-1 text-xs ${row.status === 'NEW' ? 'bg-emerald-950 text-emerald-300' : row.status === 'POSSIBLE_DUPLICATE' ? 'bg-amber-950 text-amber-200' : 'bg-red-950 text-red-200'}`}>{row.status}</span></div>
          <dl className="mt-3 grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">{bulkFields.map(field => <div key={field} className="min-w-0"><dt className="text-xs text-zinc-500">{labels[field]}</dt><dd className="break-words text-zinc-200 [overflow-wrap:anywhere]">{row.values[field] || "—"}</dd></div>)}</dl>
          {row.errors.map((message, index) => <p key={index} className="mt-2 text-sm text-red-300">{message}</p>)}
          {row.matches.map((match, index) => <p key={index} className="mt-2 break-words text-xs text-amber-200 [overflow-wrap:anywhere]">{match.reason}: {match.reference.startsWith('fila:') ? `fila ${match.reference.slice(5)}` : match.businessName}</p>)}
          {row.status === "POSSIBLE_DUPLICATE" && <label className="mt-3 flex min-h-11 items-center gap-3 text-sm text-amber-200"><input type="checkbox" disabled={pending} checked={overrides.includes(row.sourceRow)} onChange={e => { setOverrides(e.target.checked ? [...overrides, row.sourceRow] : overrides.filter(id => id !== row.sourceRow)); if (!e.target.checked) setSelected(selected.filter(id => id !== row.sourceRow)); }} />Es otro negocio</label>}
          <label className="mt-2 flex min-h-11 items-center gap-3 text-sm text-zinc-300"><input type="checkbox" aria-label={`Crear fila ${row.sourceRow}`} disabled={pending || row.status === 'INVALID' || row.status === 'DUPLICATE' || (row.status === 'POSSIBLE_DUPLICATE' && !overrides.includes(row.sourceRow))} checked={selected.includes(row.sourceRow)} onChange={e => setSelected(e.target.checked ? [...selected, row.sourceRow] : selected.filter(id => id !== row.sourceRow))} />Crear contacto</label>
        </article>)}
      </div>
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={pending} onClick={() => { setPreview(null); setError(null); }} className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm text-zinc-200">Volver al mapping</button><button type="button" disabled={pending || !selected.length} onClick={confirm} className={button}>{pending ? "Confirmando..." : `Crear ${selected.length} contactos`}</button></div>
    </div>}
  </section>;
}
