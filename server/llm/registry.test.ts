import { describe, it, expect, afterEach } from 'vitest';
import { resolveModel } from './registry';
import { __resetAIConfigCache } from './config';

afterEach(() => {
  __resetAIConfigCache();
  delete process.env.AI_PROVIDER;
});

describe('resolveModel', () => {
  it('resolves the configured default model without a network call', async () => {
    delete process.env.AI_PROVIDER;
    __resetAIConfigCache();
    const { model, defaults } = await resolveModel();
    expect(model).toBeDefined();
    expect(defaults.maxOutputTokens).toBe(4096);
  });

  it('throws for an unknown provider', async () => {
    process.env.AI_PROVIDER = 'bogus';
    __resetAIConfigCache();
    await expect(resolveModel()).rejects.toThrow(/Unknown LLM provider/);
  });

  it('throws an actionable error when a configured provider is not installed', async () => {
    process.env.AI_PROVIDER = 'ollama'; // adapter package (ollama-ai-provider) not installed
    __resetAIConfigCache();
    await expect(resolveModel()).rejects.toThrow(/npm i ollama-ai-provider/);
  });
});
