// Server-only: Gemini Developer API structured-output call.
import { GoogleGenAI } from "@google/genai";

export const MODEL = process.env["GEMINI_MODEL"] || "gemini-2.5-flash";

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
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey)
    throw new AiError(
      "Gemini is not configured. Add GEMINI_API_KEY to your local .env file.",
      500,
      false,
    );

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: opts.input,
      config: {
        systemInstruction: opts.instructions,
        responseMimeType: "application/json",
        responseJsonSchema: opts.schema,
        temperature: 0.1,
      },
    });
    const text = response.text;
    if (!text?.trim()) throw new AiError("Gemini returned no content. Please retry.", 502, true);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AiError("Gemini returned malformed JSON. Please retry.", 502, true);
    }
  } catch (error) {
    if (error instanceof AiError) throw error;

    const details = error instanceof Error ? error.message : "";
    const status =
      error != null &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 0;
    if (
      /api.?key|invalid credential|permission denied/i.test(details) ||
      status === 401 ||
      status === 403
    )
      throw new AiError(
        "Gemini rejected the API key. Check GEMINI_API_KEY and ensure the Gemini API is enabled.",
        status || 403,
        false,
      );
    if (status === 429)
      throw new AiError("Gemini is rate limited. Wait a moment, then retry.", status, true);
    if (status === 404 || /model.*not found|not supported for generatecontent/i.test(details))
      throw new AiError(
        `The configured Gemini model (${MODEL}) is unavailable. Check GEMINI_MODEL in .env.`,
        status || 404,
        false,
      );
    if (status >= 500)
      throw new AiError(
        "The Gemini service is temporarily unavailable. Please retry.",
        status,
        true,
      );
    if (status === 400)
      throw new AiError(
        "Gemini rejected the request. Check the configured model and retry.",
        status,
        false,
      );
    throw new AiError(
      "Could not reach Gemini. Check your network connection and retry.",
      503,
      true,
    );
  }
}
