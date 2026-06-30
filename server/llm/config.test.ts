import { describe, it, expect, afterEach } from 'vitest';
import { defineAIConfig, loadAIConfig, __resetAIConfigCache } from './config';

afterEach(() => {
  __resetAIConfigCache();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_MODEL;
});

describe('defineAIConfig', () => {
  it('returns its input unchanged (identity helper for author-time typing)', () => {
    const cfg = defineAIConfig({ provider: 'openai', model: 'gpt-x' });
    expect(cfg).toEqual({ provider: 'openai', model: 'gpt-x' });
  });
});

describe('loadAIConfig', () => {
  it('merges config over defaults and memoizes the result', async () => {
    const a = await loadAIConfig();
    const b = await loadAIConfig();
    expect(a).toBe(b); // second call served from cache (same reference)
    expect(a.provider).toBe('anthropic');
    expect(a.model).toBe('claude-opus-4-8');
    expect(a.maxOutputTokens).toBe(4096);
    expect(a.defaultDeliveryRegion).toBe('easternEurope');
    expect(a.rateLimit).toEqual({ maxPerUser: 10, windowSeconds: 3600 });
  });

  it('applies AI_PROVIDER / AI_MODEL env overrides over the file/defaults', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_MODEL = 'gpt-test';
    const cfg = await loadAIConfig();
    expect(cfg.provider).toBe('openai');
    expect(cfg.model).toBe('gpt-test');
    // non-overridden fields still come from defaults
    expect(cfg.maxOutputTokens).toBe(4096);
  });
});
