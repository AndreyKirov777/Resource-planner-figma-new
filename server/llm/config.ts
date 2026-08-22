import fileConfig from '../../ai.config';

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

let cached: AIConfig | undefined;

// Merges the static `ai.config.ts` (checked into git, not per-user) over DEFAULTS.
// `AI_PROVIDER` / `AI_MODEL` env vars override the file (handy for tests/local).
export async function loadAIConfig(): Promise<AIConfig> {
  if (!cached) {
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
