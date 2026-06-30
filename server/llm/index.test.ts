import { describe, it, expect, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

// Mock the registry so the "no injected model" path can be exercised without a
// network call. Hoisted so the mock is in place before ./index is imported.
const { resolveModelMock } = vi.hoisted(() => ({ resolveModelMock: vi.fn() }));
vi.mock('./registry', () => ({ resolveModel: resolveModelMock }));

import { generateStructured, StructuredValidationError } from './index';

// Minimal mock model that returns a fixed JSON string. The shape below is what
// the AI SDK reads at runtime; it's cast because MockLanguageModelV4's
// constructor type demands the full provider result shape we don't need here.
function mockModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () =>
      ({
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        content: [{ type: 'text', text }],
        warnings: [],
      }) as never,
  });
}

const schema = z.object({ greeting: z.string(), count: z.number() });

describe('generateStructured', () => {
  it('returns the schema-validated, typed object from a valid response', async () => {
    const model = mockModel(JSON.stringify({ greeting: 'hi', count: 3 }));
    const result = await generateStructured({ schema, prompt: 'x', model });
    expect(result).toEqual({ greeting: 'hi', count: 3 });
  });

  it('throws StructuredValidationError when the response violates the schema', async () => {
    const model = mockModel(JSON.stringify({ greeting: 'hi' })); // missing `count`
    await expect(generateStructured({ schema, prompt: 'x', model })).rejects.toBeInstanceOf(
      StructuredValidationError,
    );
  });

  it('falls back to resolveModel() when no model is injected (production path)', async () => {
    resolveModelMock.mockResolvedValue({
      model: mockModel(JSON.stringify({ greeting: 'hey', count: 2 })),
      defaults: { maxOutputTokens: 4096 },
    });
    const result = await generateStructured({ schema, prompt: 'x' });
    expect(result).toEqual({ greeting: 'hey', count: 2 });
    expect(resolveModelMock).toHaveBeenCalledTimes(1);
  });
});
