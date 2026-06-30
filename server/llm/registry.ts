import type { LanguageModel } from 'ai';
import { loadAIConfig } from './config';

type ModelFactory = (id: string) => LanguageModel;

// provider key -> npm package that supplies it. Adding a provider = one line here + in PROVIDERS.
const PACKAGE_FOR: Record<string, string> = {
  anthropic: '@ai-sdk/anthropic',
  openai: '@ai-sdk/openai',
  ollama: 'ollama-ai-provider',
};

// Each provider is loaded by dynamic import, so only the configured one must be
// installed. Optional providers use a variable specifier so `tsc` doesn't require
// the (uninstalled) module to be present at type-check time.
const PROVIDERS: Record<string, () => Promise<ModelFactory>> = {
  anthropic: async () => {
    const { anthropic } = await import('@ai-sdk/anthropic');
    return (id: string) => anthropic(id);
  },
  openai: async () => {
    const mod: { openai: ModelFactory } = await import(PACKAGE_FOR.openai);
    return (id: string) => mod.openai(id);
  },
  ollama: async () => {
    const mod: { ollama: ModelFactory } = await import(PACKAGE_FOR.ollama);
    return (id: string) => mod.ollama(id);
  },
};

export interface ResolvedModel {
  model: LanguageModel;
  defaults: { maxOutputTokens: number };
}

// Distinguishes "the adapter package isn't installed" from a package that IS
// installed but threw while loading (bad version, missing peer, init error).
// Only the former should produce the "npm i <pkg>" hint.
function isModuleNotFound(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return (
    e?.code === 'ERR_MODULE_NOT_FOUND' ||
    e?.code === 'MODULE_NOT_FOUND' ||
    /cannot find (module|package)|failed to (resolve|load) import/i.test(e?.message ?? '')
  );
}

// Resolves the model selected in ai.config.ts. Throws a clear error for an
// unknown provider, and an actionable `npm i <pkg>` error when the configured
// provider's adapter package isn't installed. Resolving the model does NOT make
// a network call — the provider SDK only calls out when generation runs.
export async function resolveModel(): Promise<ResolvedModel> {
  const cfg = await loadAIConfig();
  const load = PROVIDERS[cfg.provider];
  if (!load) throw new Error(`Unknown LLM provider: ${cfg.provider}`);

  let factory: ModelFactory;
  try {
    factory = await load();
  } catch (err) {
    if (isModuleNotFound(err)) {
      throw new Error(
        `Provider "${cfg.provider}" is not installed. Run: npm i ${PACKAGE_FOR[cfg.provider] ?? cfg.provider}`,
      );
    }
    throw err; // installed but broken — surface the real error, don't mislabel it
  }

  return {
    model: factory(cfg.model),
    defaults: { maxOutputTokens: cfg.maxOutputTokens },
  };
}
