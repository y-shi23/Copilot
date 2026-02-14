import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

interface SkillModule {
  saveSkill: (skillRootPath: string, skillId: string, content: string) => boolean;
  listSkills: (skillRootPath: string) => Array<Record<string, unknown>>;
  getSkillDetails: (skillRootPath: string, skillId: string) => { content: string };
  resolveSkillInvocation: (
    skillRootPath: string,
    skillName: string,
    args: Record<string, unknown>,
  ) => string | Record<string, unknown>;
}

const { saveSkill, listSkills, getSkillDetails, resolveSkillInvocation } =
  require('../src/skill.ts') as SkillModule;

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createTempSkillRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sanft-skill-test-'));
  tempDirs.push(root);
  return root;
}

describe('skill helpers', () => {
  it('can save and list skills from a skill root', () => {
    const root = createTempSkillRoot();
    const skillMd = `---
name: Commit Skill
description: Generate commit message suggestions.
user-invocable: true
---
Use this skill to help users craft conventional commits.
`;

    expect(saveSkill(root, 'commit-helper', skillMd)).toBe(true);

    const skills = listSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('Commit Skill');
    expect(skills[0].id).toBe('commit-helper');
  });

  it('can resolve direct-mode invocation and append args', () => {
    const root = createTempSkillRoot();
    const skillMd = `---
name: Release Note
description: Build concise release notes.
context: normal
---
Generate a release note from the latest changes.
`;

    saveSkill(root, 'release-note', skillMd);

    const details = getSkillDetails(root, 'release-note');
    expect(details.content).toContain('Generate a release note');

    const resolved = resolveSkillInvocation(root, 'Release Note', {
      args: 'v2.0.1 fixes login crash',
    });
    expect(typeof resolved).toBe('string');
    expect(String(resolved)).toContain('## Skill Launched: Release Note');
    expect(String(resolved)).toContain('### Input Arguments');
    expect(String(resolved)).toContain('v2.0.1 fixes login crash');
  });
});
