import { defineAIConfig } from './server/llm/config';

// LLM selection for AI features. NOT secrets — API keys live in `.env`
// (read automatically by the provider SDK). Swap the vendor by editing
// `provider`/`model` here; no code changes needed (see server/llm/registry.ts).
export default defineAIConfig({
  provider: 'anthropic', // anthropic | openai | ollama
  model: 'claude-opus-4-8',
  maxOutputTokens: 4096,
  defaultDeliveryRegion: 'easternEurope',
  rateLimit: {
    maxPerUser: 10,
    windowSeconds: 3600,
  },
});
