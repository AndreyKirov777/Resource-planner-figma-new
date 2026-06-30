import { generateObject, NoObjectGeneratedError, type LanguageModel } from 'ai';
import type { z } from 'zod';
import { resolveModel } from './registry';

export interface StructuredRequest<T> {
  prompt: string;
  // Zod schema validated by the AI SDK during generation, then returned typed.
  schema: z.ZodType<T>;
  system?: string;
  schemaName?: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  // Optional injected model — pass a MockLanguageModel in tests (no network/key).
  // Omitted in production: the model is resolved from ai.config.ts.
  model?: LanguageModel;
}

// Thrown when the LLM response cannot be coerced into the requested schema.
// Callers (e.g. the planner endpoint) map this to HTTP 422.
export class StructuredValidationError extends Error {
  readonly cause?: unknown;
  readonly text?: string;
  constructor(message: string, opts: { cause?: unknown; text?: string } = {}) {
    super(message);
    this.name = 'StructuredValidationError';
    this.cause = opts.cause;
    this.text = opts.text;
  }
}

// The single, provider-agnostic seam over the Vercel AI SDK. Any Zod schema in,
// a validated typed object out. Callers depend ONLY on this function, never on a
// vendor SDK directly.
export async function generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
  let model: LanguageModel;
  let maxOutputTokens = req.maxOutputTokens;
  if (req.model) {
    // Injected model (tests/wrappers): the caller owns generation params. We do
    // NOT pull the config default for maxOutputTokens here — leaving it undefined
    // lets the SDK use the provider default. Production calls omit `model`, so the
    // configured default below is what actually applies in normal operation.
    model = req.model;
  } else {
    const resolved = await resolveModel();
    model = resolved.model;
    maxOutputTokens = maxOutputTokens ?? resolved.defaults.maxOutputTokens;
  }

  try {
    const { object } = await generateObject({
      model,
      schema: req.schema,
      schemaName: req.schemaName,
      system: req.system,
      prompt: req.prompt,
      maxOutputTokens,
      abortSignal: req.signal,
    });
    return object;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      throw new StructuredValidationError('LLM response did not match the expected schema', {
        cause: err,
        text: (err as { text?: string }).text,
      });
    }
    throw err;
  }
}
