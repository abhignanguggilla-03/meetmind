import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  finalJsonSchema,
  finalSchema,
  partialJsonSchema,
  partialSchema,
  type FinalResult,
  type PartialResult,
} from "./meeting-schema";

export const MAX_CHUNK_CHARS = 30000;

const RULES = `Accuracy rules (strict):
- Use ONLY information in the provided content. Never invent people, decisions, commitments, dates, numbers or deadlines.
- owner: the person explicitly responsible, otherwise exactly "Unassigned".
- deadline: the explicitly stated deadline, otherwise exactly "Not specified".
- priority: only when the transcript states or clearly implies urgency, otherwise "Not specified".
- decisions: only confirmed agreements (include conditions, e.g. "provided testing is completed"). Suggestions or proposals ("we should...") are NOT decisions; put them in keyPoints or openQuestions.
- openQuestions: unresolved items, unassigned responsibilities, things to be confirmed later.
- actionItems: concrete tasks. If there are none, return an empty array. Include tasks that were identified but have no owner.
- evidence: a short verbatim excerpt from the transcript supporting the task, or "" if none.
- Ignore small talk unrelated to the meeting purpose.`;

const EMAIL_RULES = `email: a concise professional follow-up email (subject + plain-text body) that accurately reflects the summary, decisions, action items (with owners/deadlines) and open questions. No placeholders for facts not in the meeting; sign off generically.`;

type Out<T> = { ok: true; data: T } | { ok: false; error: string; retryable: boolean };

async function run<T>(fn: () => Promise<T>): Promise<Out<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const { AiError } = await import("./ai.server");
    if (e instanceof AiError) return { ok: false, error: e.message, retryable: e.retryable };
    if (e instanceof z.ZodError)
      return {
        ok: false,
        error: "Gemini returned an incomplete or invalid meeting analysis. Please retry.",
        retryable: true,
      };
    console.error("analysis error", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "Unexpected server error. Please retry.", retryable: true };
  }
}

export const analyzeTranscript = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      transcript: z
        .string()
        .min(20)
        .max(MAX_CHUNK_CHARS + 2000),
    }),
  )
  .handler(({ data }): Promise<Out<FinalResult>> =>
    run(async () => {
      const { streamStructured } = await import("./ai.server");
      const raw = await streamStructured({
        schemaName: "meeting_insights",
        schema: finalJsonSchema,
        instructions: `You analyze meeting transcripts and produce structured meeting insights.\n${RULES}\n${EMAIL_RULES}`,
        input: `Meeting transcript:\n"""\n${data.transcript}\n"""`,
      });
      return finalSchema.parse(raw);
    }),
  );

export const analyzeChunk = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      chunk: z
        .string()
        .min(1)
        .max(MAX_CHUNK_CHARS + 2000),
      index: z.number().int().min(0),
      total: z.number().int().min(1).max(50),
    }),
  )
  .handler(({ data }): Promise<Out<PartialResult>> =>
    run(async () => {
      const { streamStructured } = await import("./ai.server");
      const raw = await streamStructured({
        schemaName: "chunk_insights",
        schema: partialJsonSchema,
        instructions: `You analyze ONE segment (part ${data.index + 1} of ${data.total}) of a longer meeting transcript. Segments overlap slightly. Extract everything relevant from this segment only, preserving names, dates, numbers and responsibilities.\n${RULES}`,
        input: `Transcript segment ${data.index + 1}/${data.total}:\n"""\n${data.chunk}\n"""`,
      });
      return partialSchema.parse(raw);
    }),
  );

export const consolidate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ partials: z.array(partialSchema).min(1).max(50) }))
  .handler(({ data }): Promise<Out<FinalResult>> =>
    run(async () => {
      const { streamStructured } = await import("./ai.server");
      const raw = await streamStructured({
        schemaName: "meeting_insights",
        schema: finalJsonSchema,
        instructions: `You merge partial analyses of consecutive overlapping segments of ONE meeting into a single final result. Deduplicate repeated key points, decisions, questions and action items (merge duplicates, keeping the most specific owner/deadline stated). Remove open questions that a later segment resolved. Do not add anything not present in the partials.\n${RULES}\n${EMAIL_RULES}`,
        input: `Partial analyses (JSON, in order):\n${JSON.stringify(data.partials)}`,
      });
      return finalSchema.parse(raw);
    }),
  );
