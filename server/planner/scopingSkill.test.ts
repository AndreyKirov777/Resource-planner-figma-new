import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import {
  getScopingSkill,
  loadScopingSkillFromDir,
  FALLBACK_SYSTEM_PROMPT,
  SKILL_DIR,
  __resetScopingSkillCache,
} from './scopingSkill';

describe('scopingSkill', () => {
  beforeEach(() => {
    __resetScopingSkillCache();
  });

  it('loads canonical SKILL.md with version from skill.json', async () => {
    const skill = await getScopingSkill();

    expect(skill.systemPrompt.length).toBeGreaterThan(100);
    expect(skill.systemPrompt).toContain('Step 1 — disciplines');
    expect(skill.version).toBe('1.0.0');
  });

  it('returns fallback when skill directory does not exist', async () => {
    const skill = await loadScopingSkillFromDir(
      path.join(process.cwd(), 'skills', 'does-not-exist'),
    );

    expect(skill.systemPrompt).toBe(FALLBACK_SYSTEM_PROMPT);
    expect(skill.version).toBe('0.0.0-fallback');
  });

  it('serves cached skill on repeated load', async () => {
    const skillDir = path.join(process.cwd(), SKILL_DIR);
    const first = await loadScopingSkillFromDir(skillDir);
    const second = await loadScopingSkillFromDir(skillDir);

    expect(second.systemPrompt).toBe(first.systemPrompt);
    expect(second.version).toBe(first.version);
  });
});
