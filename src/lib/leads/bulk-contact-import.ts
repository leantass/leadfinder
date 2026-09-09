import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertBulkPayload, prepareBulkRows, type BulkInput } from "./bulk-contact-parser";
import { classifyContact, contactKeys, type DuplicateMatch, type DuplicateStatus } from "./bulk-contact-dedup";
import type { ManualLeadInput, NormalizedManualLeadInput } from "./manual-lead";
import { persistManualLead } from "./manual-lead-persistence";

export type BulkPreviewRow = {
  sourceRow: number; values: ManualLeadInput; data: NormalizedManualLeadInput | null;
  errors: string[]; status: DuplicateStatus | "INVALID"; matches: DuplicateMatch[];
};
export type BulkCounts = { empty: number; invalid: number; duplicate: number; possible: number; new: number };
export type BulkPreview = { batchId: string; contentHash: string; token: string; rows: BulkPreviewRow[]; counts: BulkCounts };
export type BulkResult = { created: number; duplicate: number; invalid: number; possibleOmitted: number; newOmitted: number; leadIds: string[] };
export type BulkConfirmInput = BulkInput & { batchId: string; contentHash: string; token: string; selectedRows: number[]; overrides: number[] };
type Receipt = { batchId: string; contentHash: string; fingerprint: string; user: string; expires: number };
export class BulkContactError extends Error {}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const contentHash = (input: BulkInput) => hash({ text: input.text, config: { delimiter: input.config.delimiter, hasHeaders: input.config.hasHeaders, mapping: input.config.mapping } });
function signature(body: string) {
  const secret = process.env.LEADFINDER_SESSION_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Bulk signing is not configured.");
  return createHmac("sha256", Buffer.from(secret, "hex")).update(`leadfinder-bulk-v1:${body}`).digest();
}
function sign(receipt: Receipt) {
  const body = Buffer.from(JSON.stringify(receipt)).toString("base64url");
  return `${body}.${signature(body).toString("base64url")}`;
}
function verify(input: BulkConfirmInput, user: string): Receipt {
  try {
    if (typeof input.token !== "string" || input.token.length > 2048) throw new Error();
    const [body, mac, extra] = input.token.split(".");
    const actual = Buffer.from(mac ?? "", "base64url"), expected = signature(body);
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const receipt = JSON.parse(Buffer.from(body, "base64url").toString()) as Receipt;
    if (receipt.user !== user || receipt.expires < Date.now() || receipt.batchId !== input.batchId ||
      receipt.contentHash !== input.contentHash || receipt.contentHash !== contentHash(input)) throw new Error();
    return receipt;
  } catch { throw new BulkContactError("La preview cambió o venció. Generá una nueva antes de confirmar."); }
}

async function buildPreview(tx: Prisma.TransactionClient, input: BulkInput, user: string, batchId: string): Promise<BulkPreview> {
  const prepared = prepareBulkRows(input);
  const rows: BulkPreviewRow[] = prepared.rows.map(row => ({
    sourceRow: row.sourceRow, values: row.validation.data ?? row.values, data: row.validation.data,
    errors: Object.values(row.validation.fieldErrors), status: row.validation.ok ? "NEW" : "INVALID", matches: [],
  }));
  const keys = rows.map(row => row.data ? contactKeys({ ...row.data, reference: `fila:${row.sourceRow}` }) : null);
  let cursor: string | undefined;
  // Read a minimal projection in pages. Both MANUAL and SEARCH are included.
  for (;;) {
    const leads = await tx.lead.findMany({
      select: { id: true, businessName: true, phone: true, website: true, category: true, address: true, city: true },
      orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const existing = leads.map(lead => contactKeys({ ...lead, reference: `lead:${lead.id}` }));
    rows.forEach((row, index) => {
      if (!keys[index]) return;
      const match = classifyContact(keys[index], existing);
      if (match.status === "DUPLICATE" || (row.status === "NEW" && match.status === "POSSIBLE_DUPLICATE")) row.status = match.status;
      row.matches = [...row.matches, ...match.matches].sort((a, b) => Number(b.reason === "Mismo contacto") - Number(a.reason === "Mismo contacto")).slice(0, 5);
    });
    if (leads.length < 500) break;
    cursor = leads[leads.length - 1].id;
  }
  const prior: ReturnType<typeof contactKeys>[] = [];
  rows.forEach((row, index) => {
    const key = keys[index];
    if (!key) return;
    const match = classifyContact(key, prior, true);
    if (match.status === "DUPLICATE" || (row.status === "NEW" && match.status === "POSSIBLE_DUPLICATE")) row.status = match.status;
    row.matches = [...match.matches, ...row.matches].slice(0, 5);
    if (row.status !== "DUPLICATE") prior.push(key);
  });
  const counts = { empty: prepared.emptyRows, invalid: 0, duplicate: 0, possible: 0, new: 0 };
  rows.forEach(row => { counts[row.status === "INVALID" ? "invalid" : row.status === "DUPLICATE" ? "duplicate" : row.status === "POSSIBLE_DUPLICATE" ? "possible" : "new"]++; });
  const digest = contentHash(input);
  return { batchId, contentHash: digest, rows, counts,
    token: sign({ batchId, contentHash: digest, fingerprint: fingerprint(rows), user, expires: Date.now() + 8 * 60 * 60 * 1000 }) };
}
const fingerprint = (rows: BulkPreviewRow[]) => hash(rows.map(row => ({ sourceRow: row.sourceRow, status: row.status, matches: row.matches })));

export async function previewBulkContacts(input: BulkInput, user: string) {
  try { assertBulkPayload(input); prepareBulkRows(input); }
  catch (error) { throw new BulkContactError((error as Error).message); }
  return buildPreview(prisma, input, user, randomUUID());
}

export async function confirmBulkContacts(input: BulkConfirmInput, user: string): Promise<{ kind: "created"; result: BulkResult } | { kind: "changed"; preview: BulkPreview }> {
  try { assertBulkPayload(input); prepareBulkRows(input); }
  catch (error) { throw new BulkContactError((error as Error).message); }
  const receipt = verify(input, user);
  for (const list of [input.selectedRows, input.overrides]) {
    if (!Array.isArray(list) || list.length > 100 || list.some(row => !Number.isSafeInteger(row) || row < 1) || new Set(list).size !== list.length) throw new BulkContactError("Selección inválida.");
  }
  if (!input.selectedRows.length) throw new BulkContactError("Seleccioná al menos un contacto.");
  const selected = new Set(input.selectedRows), overrides = new Set(input.overrides);
  const selectionHash = hash({ rows: [...selected].sort((a, b) => a - b), overrides: [...overrides].sort((a, b) => a - b) });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const activities = await tx.leadActivity.findMany({
          where: { type: "manual_created", metadata: { contains: input.batchId } },
          select: { leadId: true, metadata: true }, orderBy: { id: "asc" },
        });
        const previous = activities.map(activity => {
          try { return { leadId: activity.leadId, metadata: JSON.parse(activity.metadata ?? "null") }; }
          catch { return null; }
        }).filter(item => item?.metadata?.entryMode === "bulk_paste" && item.metadata.batchId === input.batchId);
        if (previous.length) {
          if (previous.some(item => item!.metadata.contentHash !== receipt.contentHash || item!.metadata.selectionHash !== selectionHash)) throw new BulkContactError("Este lote ya fue confirmado con otro contenido o selección.");
          return { kind: "created" as const, result: { ...previous[0]!.metadata.result, leadIds: previous.map(item => item!.leadId) } as BulkResult };
        }
        const preview = await buildPreview(tx, input, user, input.batchId);
        if (fingerprint(preview.rows) !== receipt.fingerprint) return { kind: "changed" as const, preview };
        if ([...selected, ...overrides].some(row => !preview.rows.some(item => item.sourceRow === row))) throw new BulkContactError("La selección contiene filas inexistentes.");
        if ([...overrides].some(row => !selected.has(row) || preview.rows.find(item => item.sourceRow === row)?.status !== "POSSIBLE_DUPLICATE")) throw new BulkContactError("Override inválido.");
        const chosen = preview.rows.filter(row => selected.has(row.sourceRow));
        if (chosen.some(row => !row.data || row.status === "DUPLICATE" || (row.status === "POSSIBLE_DUPLICATE" && !overrides.has(row.sourceRow)))) throw new BulkContactError("La selección incluye filas bloqueadas o posibles duplicados sin confirmar.");
        const summary = { created: chosen.length, duplicate: preview.counts.duplicate, invalid: preview.counts.invalid,
          possibleOmitted: preview.counts.possible - chosen.filter(row => row.status === "POSSIBLE_DUPLICATE").length,
          newOmitted: preview.counts.new - chosen.filter(row => row.status === "NEW").length };
        const leadIds: string[] = [];
        for (const row of chosen) {
          const created = await persistManualLead(tx, row.data!, { entryMode: "bulk_paste", batchId: input.batchId,
            sourceRow: row.sourceRow, importerVersion: 1, contentHash: receipt.contentHash, selectionHash, result: summary });
          leadIds.push(created.lead.id);
        }
        return { kind: "created" as const, result: { ...summary, leadIds } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new Error("Transaction retry exhausted.");
}
