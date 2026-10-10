// Split long transcripts into overlapping chunks on line boundaries.
export const CHUNK_CHARS = 24000; // ~6k tokens per request
export const CHUNK_OVERLAP = 1500;
export const MAX_TRANSCRIPT_CHARS = 600000; // ~25 chunks max
export const CONCURRENCY = 2;

export const estimateTokens = (t: string) => Math.ceil(t.length / 4);

export function chunkTranscript(text: string, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf("\n", end);
      if (nl > start + size * 0.6) end = nl;
    }
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    let next = end - overlap;
    const nl = text.indexOf("\n", next);
    if (nl > 0 && nl < end) next = nl + 1;
    start = Math.max(next, start + 1);
  }
  return chunks;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>) {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx] as T, idx);
      }
    }),
  );
  return out;
}
