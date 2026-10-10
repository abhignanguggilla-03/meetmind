// Client-side document text extraction (files never leave the browser).
export const MAX_FILE_MB = 10;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
export const ACCEPT = ".txt,.docx,.pdf";

export type FileKind = "txt" | "docx" | "pdf";

export class ExtractError extends Error {}

export function detectKind(name: string): FileKind | null {
  const ext = name.toLowerCase().split(".").pop();
  return ext === "txt" || ext === "docx" || ext === "pdf" ? ext : null;
}

function normalize(t: string) {
  return t.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function magic(file: File, n: number) {
  return new Uint8Array(await file.slice(0, n).arrayBuffer());
}

export async function extractText(file: File): Promise<string> {
  const kind = detectKind(file.name);
  if (!kind) throw new ExtractError("Unsupported file type. Please upload a .txt, .docx or .pdf file.");
  if (file.size === 0) throw new ExtractError("This file is empty.");
  if (file.size > MAX_FILE_BYTES)
    throw new ExtractError(`File is too large. The limit is ${MAX_FILE_MB} MB.`);

  let text = "";
  if (kind === "txt") {
    const head = await magic(file, 8192);
    let ctrl = 0;
    for (const b of head) if (b === 0 || (b < 9 && b !== 0)) ctrl++;
    if (ctrl > 0) throw new ExtractError("This .txt file contains binary data and can't be read as text.");
    text = await file.text();
  } else if (kind === "docx") {
    const m = await magic(file, 4);
    if (!(m[0] === 0x50 && m[1] === 0x4b))
      throw new ExtractError("This doesn't look like a valid .docx file (old .doc files aren't supported).");
    try {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      text = res.value;
    } catch {
      throw new ExtractError("Couldn't read this Word document. It may be damaged.");
    }
  } else {
    const m = await magic(file, 5);
    if (String.fromCharCode(...m) !== "%PDF-") throw new ExtractError("This doesn't look like a valid PDF file.");
    try {
      const pdfjs = await import("pdfjs-dist");
      const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = worker;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        let line = "";
        for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
          line += item.str ?? "";
          if (item.hasEOL) line += "\n";
        }
        pages.push(line);
      }
      await doc.cleanup();
      text = pages.join("\n\n");
    } catch {
      throw new ExtractError("Couldn't read this PDF. It may be damaged or password-protected.");
    }
    if (normalize(text).length < 10)
      throw new ExtractError(
        "No selectable text found in this PDF. It looks scanned — scanned PDFs require OCR, which isn't supported. Paste the text instead.",
      );
  }

  text = normalize(text);
  if (!text) throw new ExtractError("No readable text was found in this file.");
  return text;
}

export function formatBytes(b: number) {
  return b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;
}
