import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { combineDocumentResults, parseScreeningInvoiceText } from "./invoiceParser";
import type {
  EneaLabDocumentAnalysis,
  EneaLabDocumentResult,
  EneaLabSourcePractice,
} from "./types";

async function extractPdfText(blob: Blob): Promise<string> {
  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;

  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const pdf = await task.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }

  await pdf.destroy();
  return pages.join("\n");
}

function failedDocument(
  path: string,
  status: EneaLabDocumentResult["status"],
  message: string,
): { result: EneaLabDocumentResult; items: [] } {
  return {
    result: {
      path,
      status,
      documentType: "unknown",
      total: null,
      itemCount: 0,
      message,
    },
    items: [],
  };
}

/**
 * Scarica esclusivamente i documenti fiscali già associati alla pratica.
 * Il bucket resta privato e l'accesso è regolato dalla sessione staff/RLS.
 */
export async function analyzePracticeDocuments(
  client: SupabaseClient<Database>,
  practice: EneaLabSourcePractice,
): Promise<EneaLabDocumentAnalysis> {
  const invoicePaths = practice.documentPaths.filter(({ kind }) => kind === "invoice");
  if (!invoicePaths.length) {
    return {
      items: [],
      invoiceTotal: 0,
      creditTotal: 0,
      eligibleExpense: null,
      firstInvoiceDate: null,
      documents: [],
      blockers: ["Nessuna fattura disponibile nella pratica."],
      warnings: [],
    };
  }

  const parsed = [];
  for (const { path } of invoicePaths) {
    if (!path.startsWith(`${practice.id}/`)) {
      parsed.push(failedDocument(path, "failed", "Percorso non appartenente alla pratica selezionata."));
      continue;
    }
    if (!/\.pdf$/i.test(path)) {
      parsed.push(failedDocument(path, "unsupported", "Formato non PDF: serve OCR o controllo umano."));
      continue;
    }

    const { data, error } = await client.storage.from("enea-documents").download(path);
    if (error || !data) {
      parsed.push(failedDocument(path, "failed", error?.message ?? "Download non riuscito."));
      continue;
    }

    if (data.size > 20 * 1024 * 1024) {
      parsed.push(failedDocument(path, "unsupported", "PDF superiore a 20 MB: controllo umano richiesto."));
      continue;
    }

    try {
      parsed.push(parseScreeningInvoiceText(await extractPdfText(data), path));
    } catch (error) {
      parsed.push(failedDocument(
        path,
        "failed",
        error instanceof Error ? error.message : "Lettura PDF non riuscita.",
      ));
    }
  }

  return combineDocumentResults(parsed);
}
