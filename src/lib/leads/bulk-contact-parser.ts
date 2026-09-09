import { validateManualLeadInput, type ManualLeadInput } from "./manual-lead";

export const BULK_MAX_ROWS = 100;
export const BULK_MAX_BYTES = 256 * 1024;
export const BULK_MAX_CELL = 2000;
export const bulkFields = ["businessName", "phone", "website", "category", "address", "city"] as const;
export type BulkField = typeof bulkFields[number];
export type Delimiter = "\t" | "," | ";";
export type BulkConfig = { delimiter: Delimiter; hasHeaders: boolean; mapping: (BulkField | null)[] };
export type BulkInput = { text: string; config: BulkConfig };
export type ParsedRecord = { sourceRow: number; cells: string[] };
export type ParsedTable = { records: ParsedRecord[]; emptyRows: number; columns: number };

export function assertBulkPayload(value: unknown) {
  const json = JSON.stringify(value);
  if (!json || new TextEncoder().encode(json).length > BULK_MAX_BYTES) {
    throw new Error("El contenido supera el máximo de 256 KiB.");
  }
}

export function parseBulkText(text: string, delimiter: Delimiter): ParsedTable {
  if (typeof text !== "string" || !["\t", ",", ";"].includes(delimiter)) throw new Error("Formato inválido.");
  if (new TextEncoder().encode(text).length > BULK_MAX_BYTES) throw new Error("El contenido supera el máximo de 256 KiB.");
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const records: ParsedRecord[] = [];
  let cells: string[] = [], cell = "", quoted = false, closed = false;
  let line = 1, sourceRow = 1, emptyRows = 0;
  const pushCell = () => {
    if (cell.length > BULK_MAX_CELL) throw new Error(`Fila ${sourceRow}: una celda supera 2000 caracteres.`);
    cells.push(cell); cell = ""; closed = false;
  };
  const pushRecord = () => {
    pushCell();
    if (cells.some(value => value.trim() !== "")) records.push({ sourceRow, cells });
    else emptyRows++;
    cells = [];
    if (records.length > BULK_MAX_ROWS + 1) throw new Error("El máximo es 100 contactos por lote.");
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else { cell += char; if (char === "\n") line++; }
    } else if (char === delimiter) pushCell();
    else if (char === "\n") { pushRecord(); line++; sourceRow = line; }
    else if (char === '"' && cell === "" && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error(`Fila ${sourceRow}: comillas inválidas.`);
      cell += char;
    }
    if (cell.length > BULK_MAX_CELL) throw new Error(`Fila ${sourceRow}: una celda supera 2000 caracteres.`);
  }
  if (quoted) throw new Error(`Fila ${sourceRow}: comillas sin cerrar.`);
  if (cell || cells.length || closed) pushRecord();
  const columns = records[0]?.cells.length ?? 0;
  if (records.some(record => record.cells.length !== columns)) throw new Error("Las filas tienen distinta cantidad de columnas. Revisá el delimitador o las comillas.");
  return { records, emptyRows, columns };
}

export function detectBulkDelimiter(text: string): { options: Delimiter[]; delimiter: Delimiter | null } {
  const options: Delimiter[] = [];
  const errors: string[] = [];
  for (const delimiter of ["\t", ",", ";"] as const) {
    try { if (parseBulkText(text, delimiter).columns > 1) options.push(delimiter); }
    catch (error) { errors.push((error as Error).message); }
  }
  if (!options.length && errors.length === 3) throw new Error(errors[0]);
  return { options: options.length ? options : ["\t", ",", ";"], delimiter: options.length === 1 ? options[0] : null };
}

const aliases: Record<BulkField, string[]> = {
  businessName: ["nombre", "empresa", "negocio", "business", "businessname"],
  phone: ["telefono", "tel", "phone", "whatsapp"],
  website: ["web", "website", "sitio", "sitio web"],
  category: ["categoria", "category"], address: ["direccion", "address"], city: ["ciudad", "city"],
};
export function inferBulkMapping(cells: string[]) {
  const mapping = cells.map(cell => {
    const key = cell.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return bulkFields.find(field => aliases[field].includes(key)) ?? null;
  });
  return { mapping, hasHeaders: mapping.includes("businessName") && (mapping.includes("phone") || mapping.includes("website")) };
}

export function prepareBulkRows(input: BulkInput) {
  assertBulkPayload(input);
  if (!input || typeof input.text !== "string" || !input.config || typeof input.config.hasHeaders !== "boolean") throw new Error("Configuración inválida.");
  const table = parseBulkText(input.text, input.config.delimiter);
  const { mapping, hasHeaders } = input.config;
  if (!Array.isArray(mapping) || mapping.length !== table.columns || mapping.some(field => field !== null && !bulkFields.includes(field))) throw new Error("Mapping inválido.");
  const destinations = mapping.filter(field => field !== null);
  if (new Set(destinations).size !== destinations.length) throw new Error("No se puede asignar dos columnas al mismo campo.");
  if (!destinations.includes("businessName") || (!destinations.includes("phone") && !destinations.includes("website"))) throw new Error("Asigná nombre del negocio y teléfono o sitio web.");
  const records = hasHeaders ? table.records.slice(1) : table.records;
  if (records.length > BULK_MAX_ROWS) throw new Error("El máximo es 100 contactos por lote.");
  if (!records.length) throw new Error("Pegá al menos un contacto.");
  const rows = records.map(record => {
    const values: ManualLeadInput = {};
    mapping.forEach((field, index) => { if (field) values[field] = record.cells[index]; });
    return { sourceRow: record.sourceRow, values, validation: validateManualLeadInput(values) };
  });
  return { rows, emptyRows: table.emptyRows };
}
