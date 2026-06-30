import { loadConfig } from 'c12';

// Non-secret LLM selection. API keys are NEVER stored here — provider SDKs read
// them from the standard env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, ...).
export interface AIConfig {
  provider: 'anthropic' | 'openai' | 'ollama';
  model: string;
  maxOutputTokens: number;
  // Default rate-card region for generation (consumed by the planner endpoint, Goal 1b).
  defaultDeliveryRegion: string;
  // Per-user generation guardrails (consumed by the planner endpoint, Goal 1b).
  rateLimit: {
    maxPerUser: number;
    windowSeconds: number;
  };
}

const DEFAULTS: AIConfig = {
  provider: 'anthropic',
  model: 'claude-opus-4-8',
  maxOutputTokens: 4096,
  defaultDeliveryRegion: 'easternEurope',
  rateLimit: { maxPerUser: 10, windowSeconds: 3600 },
};

// Identity helper that gives `ai.config.ts` author-time typing without forcing
// every field to be set. Mirrors the `defineConfig` pattern.
export const defineAIConfig = (config: Partial<AIConfig>): Partial<AIConfig> => config;

let cached: AIConfig | undefined;

// Loads `ai.config.{ts,js,json}` via c12 (async, memoized), merged over DEFAULTS.
// `AI_PROVIDER` / `AI_MODEL` env vars override the file (handy for tests/local).
export async function loadAIConfig(): Promise<AIConfig> {
  if (!cached) {
    let fileConfig: Partial<AIConfig> = {};
    try {
      const { config } = await loadConfig<Partial<AIConfig>>({ name: 'ai' });
      fileConfig = config ?? {};
    } catch (err) {
      // A malformed/throwing ai.config.* shouldn't crash the app, but it also
      // shouldn't silently apply defaults the operator didn't ask for — warn.
      console.warn('[ai.config] failed to load; falling back to defaults:', err);
      fileConfig = {};
    }
    const merged: AIConfig = { ...DEFAULTS, ...fileConfig };
    if (process.env.AI_PROVIDER) merged.provider = process.env.AI_PROVIDER as AIConfig['provider'];
    if (process.env.AI_MODEL) merged.model = process.env.AI_MODEL;
    cached = merged;
  }
  return cached;
}

// Test-only: clears the memoized config so the next load re-reads env/overrides.
export function __resetAIConfigCache(): void {
  cached = undefined;
}
