import { describe, expect, it } from 'vitest';

interface BuiltinMetadataModule {
  getBuiltinServersMetadata: (options?: {
    isWin?: boolean;
  }) => Record<string, { description?: string }>;
}

const { getBuiltinServersMetadata } =
  require('../src/builtin_metadata.ts') as BuiltinMetadataModule;

describe('builtin metadata', () => {
  it('contains required builtin servers', () => {
    const data = getBuiltinServersMetadata({ isWin: false });
    expect(data).toHaveProperty('builtin_python');
    expect(data).toHaveProperty('builtin_filesystem');
    expect(data).toHaveProperty('builtin_bash');
    expect(data).toHaveProperty('builtin_search');
    expect(data).toHaveProperty('builtin_subagent');
  });

  it('adapts shell description based on platform', () => {
    const winData = getBuiltinServersMetadata({ isWin: true });
    const unixData = getBuiltinServersMetadata({ isWin: false });

    expect(String(winData.builtin_bash.description)).toContain('PowerShell');
    expect(String(unixData.builtin_bash.description)).toContain('Bash');
  });
});
