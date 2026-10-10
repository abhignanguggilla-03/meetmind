import { z } from "zod";

export const PRIORITIES = ["High", "Medium", "Low", "Not specified"] as const;
export const STATUSES = ["Pending", "In progress", "Completed"] as const;

export const actionItemSchema = z.object({
  task: z.string(),
  owner: z.string(),
  deadline: z.string(),
  priority: z.enum(PRIORITIES),
  evidence: z.string(),
});

export const partialSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  openQuestions: z.array(z.string()),
  actionItems: z.array(actionItemSchema),
});

export const finalSchema = partialSchema.extend({
  email: z.object({ subject: z.string(), body: z.string() }),
});

export type PartialResult = z.infer<typeof partialSchema>;
export type FinalResult = z.infer<typeof finalSchema>;
export type ActionItem = z.infer<typeof actionItemSchema> & {
  id: string;
  status: (typeof STATUSES)[number];
};
export type MeetingInsights = Omit<FinalResult, "actionItems"> & { actionItems: ActionItem[] };

// Strict JSON schema sent on the wire (all fields required, no extra props).
const str = { type: "string" };
const strArr = { type: "array", items: str };
const actionItemJson = {
  type: "object",
  additionalProperties: false,
  required: ["task", "owner", "deadline", "priority", "evidence"],
  properties: {
    task: str,
    owner: str,
    deadline: str,
    priority: { type: "string", enum: [...PRIORITIES] },
    evidence: str,
  },
};
const partialProps = {
  summary: str,
  keyPoints: strArr,
  decisions: strArr,
  openQuestions: strArr,
  actionItems: { type: "array", items: actionItemJson },
};
export const partialJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(partialProps),
  properties: partialProps,
};
export const finalJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [...Object.keys(partialProps), "email"],
  properties: {
    ...partialProps,
    email: {
      type: "object",
      additionalProperties: false,
      required: ["subject", "body"],
      properties: { subject: str, body: str },
    },
  },
};
