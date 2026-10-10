// Server-only: Lovable AI Gateway (Responses API) streamed structured-output call.
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
export const MODEL = "openai/gpt-6-astra";

export class AiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}

export async function streamStructured(opts: {
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<unknown> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiError("AI is not configured (missing LOVABLE_API_KEY).", 500, false);

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: opts.instructions,
      input: opts.input,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      text: {
        format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema },
      },
    }),
  });

  if (!res.ok || !res.body) {
    let msg = "";
    try {
      const j = (await res.json()) as { error?: { message?: string }; message?: string };
      msg = j?.error?.message ?? j?.message ?? "";
    } catch {
      /* ignore */
    }
    const s = res.status;
    const friendly =
      s === 429
        ? "The AI service is rate limited. Please wait a moment and retry."
        : s === 402
          ? msg || "AI credits are exhausted for this workspace. Add credits to continue."
          : s === 403
            ? msg || "AI access was denied for this workspace."
            : s >= 500
              ? "The AI service had a temporary problem. Please retry."
              : msg || `AI request failed (${s}).`;
    throw new AiError(friendly, s, s === 429 || s >= 500);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let failure: string | null = null;
  let refusal = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data) as {
          type?: string;
          delta?: string;
          error?: { message?: string };
          response?: { error?: { message?: string } };
        };
        if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
        else if (ev.type === "response.refusal.delta") refusal = true;
        else if (ev.type === "response.failed" || ev.type === "error")
          failure = ev.response?.error?.message ?? ev.error?.message ?? "AI generation failed.";
      } catch {
        /* partial line */
      }
    }
  }
  if (failure) throw new AiError(failure, 502, true);
  if (refusal || !text.trim()) throw new AiError("The AI declined or returned no content.", 502, false);
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError("The AI returned malformed output. Please retry.", 502, true);
  }
}
