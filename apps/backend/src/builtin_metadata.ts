import type {} from 'node:fs';

interface BuiltinServerMetadata {
  id: string;
  name: string;
  description: string;
  type: 'builtin';
  isActive: boolean;
  isPersistent: boolean;
  tags: string[];
  logoUrl: string;
}

interface BuiltinServersMetadata {
  [key: string]: BuiltinServerMetadata;
}

function getBuiltinServersMetadata(options: { isWin?: boolean } = {}): BuiltinServersMetadata {
  const isWin = options.isWin === undefined ? process.platform === 'win32' : !!options.isWin;

  return {
    builtin_python: {
      id: 'builtin_python',
      name: 'Python Executor',
      description: '自动检测环境，执行本地 Python 脚本。',
      type: 'builtin',
      isActive: true,
      isPersistent: false,
      tags: ['python', 'code'],
      logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Python-logo-notext.svg',
    },
    builtin_filesystem: {
      id: 'builtin_filesystem',
      name: 'File Operations',
      description:
        '全能文件操作工具。支持 Glob 文件匹配、Grep 内容搜索、以及文件的读取、编辑和写入。支持本地文件及远程URL。',
      type: 'builtin',
      isActive: true,
      isPersistent: false,
      tags: ['file', 'fs', 'read', 'write', 'edit', 'search'],
      logoUrl: 'https://cdn-icons-png.flaticon.com/512/2965/2965335.png',
    },
    builtin_bash: {
      id: 'builtin_bash',
      name: 'Shell Executor',
      description: isWin ? '执行 PowerShell 命令' : '执行 Bash 命令',
      type: 'builtin',
      isActive: true,
      isPersistent: false,
      tags: ['shell', 'bash', 'cmd'],
      logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Bash_Logo_Colored.svg',
    },
    builtin_search: {
      id: 'builtin_search',
      name: 'Web Toolkit',
      description: '使用 DuckDuckGo 进行免费联网搜索，获取相关网页标题、链接和摘要；抓取网页内容。',
      type: 'builtin',
      isActive: true,
      isPersistent: false,
      tags: ['search', 'web', 'fetch'],
      logoUrl: 'https://upload.wikimedia.org/wikipedia/en/9/90/The_DuckDuckGo_Duck.png',
    },
    builtin_subagent: {
      id: 'builtin_subagent',
      name: 'Sub-Agent',
      description: '一个能够自主规划的子智能体。主智能体需显式分配工具给它。',
      type: 'builtin',
      isActive: true,
      isPersistent: false,
      tags: ['agent'],
      logoUrl: 'https://s2.loli.net/2026/01/22/tTsJjkpiOYAeGdy.png',
    },
  };
}

module.exports = {
  getBuiltinServersMetadata,
};
