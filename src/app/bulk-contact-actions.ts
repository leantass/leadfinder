"use server";

import { requireAuthenticatedOperator } from "@/lib/auth/operator";
import { revalidatePath } from "next/cache";
import { BulkContactError, previewBulkContacts, confirmBulkContacts, type BulkConfirmInput } from "@/lib/leads/bulk-contact-import";
import type { BulkInput } from "@/lib/leads/bulk-contact-parser";

export async function previewBulkContactsAction(input: BulkInput) {
  const operator = await requireAuthenticatedOperator();
  try { return { ok: true as const, preview: await previewBulkContacts(input, operator.user) }; }
  catch (error) { return { ok: false as const, error: error instanceof BulkContactError ? error.message : "No se pudo revisar la lista. Intentá nuevamente." }; }
}

export async function confirmBulkContactsAction(input: BulkConfirmInput) {
  const operator = await requireAuthenticatedOperator();
  try {
    const outcome = await confirmBulkContacts(input, operator.user);
    if (outcome.kind === "created") {
      // Cache invalidation is post-commit; a retry recovers the stored result.
      for (const path of ["/", "/leads", "/operations", "/contacts"]) revalidatePath(path);
    }
    return { ok: true as const, ...outcome };
  } catch (error) { return { ok: false as const, error: error instanceof BulkContactError ? error.message : "No se pudo confirmar el lote. Reintentá con esta misma preview." }; }
}
