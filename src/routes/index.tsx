import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles, Upload, X, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ACCEPT, MAX_FILE_MB, detectKind, extractText, formatBytes } from "@/lib/extract";
import {
  CHUNK_CHARS,
  CONCURRENCY,
  MAX_TRANSCRIPT_CHARS,
  chunkTranscript,
  estimateTokens,
  mapLimit,
} from "@/lib/chunk";
import { analyzeChunk, analyzeTranscript, consolidate } from "@/lib/meeting.functions";
import type { FinalResult, MeetingInsights } from "@/lib/meeting-schema";
import { SAMPLE_TRANSCRIPT } from "@/lib/sample";
import { Results } from "@/components/Results";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MeetMind AI — Meeting notes to decisions & tasks" },
      { name: "description", content: "Turn meeting transcripts into summaries, decisions, action items and a follow-up email." },
      { property: "og:title", content: "MeetMind AI — Meeting notes summarizer" },
      { property: "og:description", content: "Upload or paste a transcript and get grounded meeting insights in seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type FileInfo = { name: string; kind: string; size: number; state: "extracting" | "ready" | "error"; error?: string };
type Out<T> = { ok: true; data: T } | { ok: false; error: string; retryable: boolean };

async function withRetry<T>(call: () => Promise<Out<T>>): Promise<T> {
  const delays = [2000, 5000];
  for (let attempt = 0; ; attempt++) {
    const r = await call();
    if (r.ok) return r.data;
    if (!r.retryable || attempt >= delays.length) throw new Error(r.error);
    await new Promise((res) => setTimeout(res, delays[attempt] + Math.random() * 500));
  }
}

function toInsights(r: FinalResult): MeetingInsights {
  return {
    ...r,
    actionItems: r.actionItems.map((a, i) => ({ ...a, id: `${Date.now()}-${i}`, status: "Pending" })),
  };
}

function Index() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<FileInfo | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MeetingInsights | null>(null);
  const [isSample, setIsSample] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const extractId = useRef(0);

  async function handleFile(f: File) {
    const id = ++extractId.current; // latest file wins on replace
    const kind = detectKind(f.name);
    setFile({ name: f.name, kind: kind?.toUpperCase() ?? "Unknown", size: f.size, state: "extracting" });
    try {
      const t = await extractText(f);
      if (id !== extractId.current) return;
      setText(t);
      setIsSample(false);
      setFile((p) => p && { ...p, state: "ready" });
      toast.success("Text extracted — review it before generating.");
    } catch (e) {
      if (id !== extractId.current) return;
      setFile((p) => p && { ...p, state: "error", error: e instanceof Error ? e.message : "Extraction failed." });
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile() {
    extractId.current++;
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function generate() {
    if (busy) return;
    const source = text.trim();
    setError(null);
    if (source.length < 20) return setError("Add at least a few lines of meeting notes first.");
    if (source.length > MAX_TRANSCRIPT_CHARS)
      return setError(
        `This transcript is ${source.length.toLocaleString()} characters; the limit is ${MAX_TRANSCRIPT_CHARS.toLocaleString()}. Split it into separate meetings and process each.`,
      );
    setBusy(true);
    setResult(null);
    try {
      const chunks = chunkTranscript(source);
      let final: FinalResult;
      if (chunks.length === 1) {
        setStage("Analyzing transcript with AI…");
        setPct(40);
        final = await withRetry(() => analyzeTranscript({ data: { transcript: source } }));
      } else {
        let done = 0;
        setStage(`Long transcript: analyzing ${chunks.length} sections…`);
        setPct(5);
        const partials = await mapLimit(chunks, CONCURRENCY, async (chunk, index) => {
          const r = await withRetry(() => analyzeChunk({ data: { chunk, index, total: chunks.length } }));
          done++;
          setStage(`Analyzed section ${done} of ${chunks.length}…`);
          setPct(5 + (done / chunks.length) * 75);
          return r;
        });
        setStage("Consolidating sections and removing duplicates…");
        setPct(85);
        final = await withRetry(() => consolidate({ data: { partials } }));
      }
      setPct(100);
      setResult(toInsights(final));
      toast.success("Meeting insights ready.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please retry.");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  const tokens = estimateTokens(text);
  const sections = text ? chunkTranscript(text.trim()).length : 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl">MeetMind</span>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">AI</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              removeFile();
              setText(SAMPLE_TRANSCRIPT);
              setIsSample(true);
              setResult(null);
              setError(null);
            }}
          >
            Load sample meeting
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <section className="mb-10 max-w-2xl">
          <h1 className="text-5xl leading-[1.05] md:text-6xl">
            Meetings in, <em className="text-primary">decisions</em> out.
          </h1>
          <p className="mt-4 text-muted-foreground">
            Paste notes or upload a transcript. Get a grounded summary, decisions, owned action items and a ready-to-send
            follow-up email.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Upload */}
          <div className="space-y-4">
            <label
              htmlFor="file-input"
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors focus-within:ring-2 focus-within:ring-ring ${
                drag ? "border-primary bg-secondary" : "border-input bg-card hover:bg-secondary"
              }`}
            >
              <Upload className="mb-3 h-6 w-6 text-primary" aria-hidden />
              <span className="font-medium">Drop a transcript here</span>
              <span className="mt-1 text-sm text-muted-foreground">or click to choose a file</span>
              <span className="mt-3 text-xs text-muted-foreground">.txt · .docx · .pdf (text-based) · max {MAX_FILE_MB} MB</span>
              <input
                id="file-input"
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>

            {file && (
              <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-paper)]">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.kind} · {formatBytes(file.size)} ·{" "}
                      {file.state === "extracting" ? "Extracting text…" : file.state === "ready" ? "Text extracted" : "Failed"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={removeFile} aria-label="Remove file">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {file.state === "extracting" && <Progress className="mt-3 h-1" value={60} />}
                {file.state === "error" && (
                  <p role="alert" className="mt-3 flex gap-2 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {file.error}
                  </p>
                )}
              </div>
            )}

            <div className="rounded-lg bg-secondary p-4 text-xs leading-relaxed text-muted-foreground">
              Files are read in your browser. Only the transcript text is sent to the AI and nothing is stored. Scanned PDFs need
              OCR, which isn't supported — paste their text instead.
            </div>
          </div>

          {/* Editor */}
          <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-paper)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="transcript" className="text-sm font-semibold">
                Transcript {isSample && <span className="ml-2 rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">Sample (fictional)</span>}
              </label>
              <span className="text-xs text-muted-foreground">
                {text.length.toLocaleString()} chars · ~{tokens.toLocaleString()} tokens
                {sections > 1 && ` · ${sections} sections`}
              </span>
            </div>
            <Textarea
              id="transcript"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setIsSample(false);
              }}
              placeholder="Paste meeting notes or a transcript, or upload a file. Extracted text appears here for you to review and edit."
              className="min-h-[340px] resize-y bg-background font-mono text-sm leading-relaxed"
            />
            {text.length > CHUNK_CHARS && (
              <p className="mt-2 text-xs text-muted-foreground">
                Long transcript: it will be split into {sections} overlapping sections, analyzed separately, then merged.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={generate} disabled={busy || !text.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {busy ? "Generating…" : "Generate Meeting Insights"}
              </Button>
              {text && !busy && (
                <Button variant="ghost" onClick={() => { setText(""); setIsSample(false); }}>
                  Clear
                </Button>
              )}
            </div>
            {busy && (
              <div className="mt-4" aria-live="polite">
                <Progress value={pct} className="h-1.5" />
                <p className="mt-2 text-sm text-muted-foreground">{stage}</p>
              </div>
            )}
            {error && (
              <div role="alert" className="mt-4 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex-1">{error}</span>
                <Button size="sm" variant="outline" onClick={generate}>
                  <RotateCcw /> Retry
                </Button>
              </div>
            )}
          </div>
        </div>

        <section className="mt-12">
          {result ? (
            <Results value={result} onChange={setResult} />
          ) : (
            !busy && (
              <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <h2 className="text-3xl">Your insights will appear here</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Summary, decisions, action items and a follow-up email — all drawn from your transcript.
                </p>
              </div>
            )
          )}
        </section>
      </main>
    </div>
  );
}
