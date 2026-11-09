import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@backend/lib/env";
import { Errors } from "@backend/lib/errors/app-error";
import { miaDraftOutputSchema } from "./crwdforce.schema";
import { DRAFT_JSON_SCHEMA } from "./crwdforce.prompt";
import type { MiaDraftOutput } from "./crwdforce.types";

export const MIA_MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;

let client: Anthropic | null = null;

export const isMiaConnected = () => !!env.ANTHROPIC_API_KEY;

function anthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw Errors.conflict("Mia isn't connected yet. Add the clinic's ANTHROPIC_API_KEY to the server settings.");
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export interface DraftResult {
  output: MiaDraftOutput;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Asks Claude for one draft reply in the fixed JSON shape. A request Claude declines falls back to another model server-side. */
export async function requestDraft(system: string, userContent: string): Promise<DraftResult> {
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await anthropic().beta.messages.create({
      model: MIA_MODEL,
      max_tokens: MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: DRAFT_JSON_SCHEMA } },
      messages: [{ role: "user", content: userContent }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw Errors.conflict("Mia couldn't sign in to Claude. Check the ANTHROPIC_API_KEY.");
    if (error instanceof Anthropic.RateLimitError) throw Errors.rateLimited("Mia is busy right now. Try again in a minute.");
    if (error instanceof Anthropic.APIError) throw Errors.conflict("Mia couldn't write a draft just now. Try again.");
    throw error;
  }

  if (response.stop_reason === "refusal") throw Errors.conflict("Mia can't help with this message. Please reply yourself.");
  if (response.stop_reason === "max_tokens") throw Errors.conflict("Mia's draft was cut off. Try again.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Errors.conflict("Mia's draft came back in the wrong shape. Try again.");
  }
  const output = miaDraftOutputSchema.safeParse(parsed);
  if (!output.success) throw Errors.conflict("Mia's draft came back in the wrong shape. Try again.");
  return { output: output.data, model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}
