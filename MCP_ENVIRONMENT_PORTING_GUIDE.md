# MCP 环境完整移植指南

本文档详细描述 Cherry Studio 项目中 MCP (Model Context Protocol) 环境的完整实现，包括 **bun** 和 **uv** 的安装、检测和使用，可直接移植到新的 Vue 聊天项目。

---

## 目录

1. [架构概览](#架构概览)
2. [核心服务实现](#核心服务实现)
3. [Bun 和 UV 安装机制](#bun-和-uv-安装机制)
4. [命令检测与回退策略](#命令检测与回退策略)
5. [Shell 环境配置](#shell-环境配置)
6. [DXT 包管理](#dxt-包管理)
7. [完整移植方案](#完整移植方案)

---

## 架构概览

### MCP 支持的传输类型

| 传输类型         | 说明                          | 使用场景                  |
| ---------------- | ----------------------------- | ------------------------- |
| `stdio`          | 标准输入/输出通信，通过子进程 | npx, uvx, uv 等命令行工具 |
| `sse`            | Server-Sent Events over HTTP  | HTTP 服务器端点           |
| `streamableHttp` | HTTP 流式传输                 | 现代化 HTTP MCP 服务器    |
| `inMemory`       | 进程内内存通信                | 内置 MCP 服务器           |

### 核心文件结构

```
项目根目录/
├── src/main/services/
│   ├── MCPService.ts              # MCP 核心服务
│   └── DxtService.ts              # DXT 包管理服务
├── src/main/utils/
│   ├── process.ts                 # 进程和命令检测工具
│   ├── shell-env.ts               # Shell 环境获取
│   └── index.ts                   # 通用工具函数
├── resources/scripts/
│   ├── install-bun.js             # Bun 安装脚本
│   ├── install-uv.js              # UV 安装脚本
│   └── download.js                # 下载工具（支持重定向）
└── packages/shared/
    ├── config/constant.ts         # 常量定义
    └── mcp.ts                     # MCP 工具命名转换
```

---

## 核心服务实现

### MCPService 核心功能

**文件位置**: `src/main/services/MCPService.ts`

```typescript
// 主要方法列表
class McpService {
  // 客户端管理
  private clients: Map<string, Client>;
  private pendingClients: Map<string, Promise<Client>>;

  // 核心方法
  async initClient(server: MCPServer): Promise<Client>;
  async listTools(event, server: MCPServer): Promise<MCPTool[]>;
  async callTool(event, args: CallToolArgs): Promise<MCPCallToolResponse>;
  async listPrompts(event, server: MCPServer): Promise<MCPPrompt[]>;
  async listResources(event, server: MCPServer): Promise<MCPResource[]>;
  async stopServer(event, server: MCPServer): Promise<void>;
  async restartServer(event, server: MCPServer): Promise<void>;

  // 工具方法
  public async checkMcpConnectivity(event, server: MCPServer): Promise<boolean>;
  public async getInstallInfo(): Promise<{ dir; uvPath; bunPath }>;
}
```

### 关键实现：npx/uvx/uv 命令处理

```typescript
// MCPService.ts initClient 方法中的关键逻辑

// 1. 获取登录 Shell 环境（已缓存）
const loginShellEnv = await getLoginShellEnvironment();

// 2. npx 处理逻辑
if (server.command === 'npx') {
  // 首先尝试系统 npx
  const npxPath = await findCommandInShellEnv('npx', loginShellEnv);

  if (npxPath) {
    cmd = npxPath; // 使用系统 npx
  } else {
    // 回退到内置 bun
    if (await isBinaryExists('bun')) {
      cmd = await getBinaryPath('bun');
      // 转换参数：bun x -y <package>
      args.unshift('x', '-y');
    } else {
      throw new Error('npx 和 bun 都不可用');
    }
  }

  // 设置 npm registry
  if (server.registryUrl) {
    server.env = {
      ...server.env,
      NPM_CONFIG_REGISTRY: server.registryUrl,
    };
  }
}

// 3. uvx/uv 处理逻辑
else if (server.command === 'uvx' || server.command === 'uv') {
  const uvPath = await findCommandInShellEnv(server.command, loginShellEnv);

  if (uvPath) {
    cmd = uvPath; // 使用系统 uv
  } else {
    // 回退到内置 uv
    if (await isBinaryExists(server.command)) {
      cmd = await getBinaryPath(server.command);
    } else {
      throw new Error('uv 不可用');
    }
  }

  // 设置 PyPI registry
  if (server.registryUrl) {
    server.env = {
      ...server.env,
      UV_DEFAULT_INDEX: server.registryUrl,
      PIP_INDEX_URL: server.registryUrl,
    };
  }
}

// 4. Bun 特殊处理：移除代理（Bun 不支持代理）
if (cmd.includes('bun')) {
  removeEnvProxy(loginShellEnv);
}
```

---

## Bun 和 UV 安装机制

### 安装脚本核心逻辑

#### Bun 安装脚本 (`install-bun.js`)

```javascript
// 版本配置
const BUN_RELEASE_BASE_URL = 'https://gitcode.com/CherryHQ/bun/releases/download';
const DEFAULT_BUN_VERSION = '1.3.1';

// 平台映射
const BUN_PACKAGES = {
  'darwin-arm64': 'bun-darwin-aarch64.zip',
  'darwin-x64': 'bun-darwin-x64.zip',
  'win32-x64': 'bun-windows-x64.zip',
  'linux-x64': 'bun-linux-x64.zip',
  'linux-arm64': 'bun-linux-aarch64.zip',
  // MUSL variants
  'linux-musl-x64': 'bun-linux-x64-musl.zip',
  // ...
};

// 安装流程
async function downloadBunBinary(platform, arch, version) {
  // 1. 确定包名
  const platformKey = `${platform}-${arch}`;
  const packageName = BUN_PACKAGES[platformKey];

  // 2. 创建输出目录
  const binDir = path.join(os.homedir(), '.cherrystudio', 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  // 3. 下载
  const downloadUrl = `${BUN_RELEASE_BASE_URL}/bun-v${version}/${packageName}`;
  await downloadWithRedirects(downloadUrl, tempFilename);

  // 4. 解压 ZIP
  const zip = new StreamZip.async({ file: tempFilename });
  for (const entry of Object.values(entries)) {
    const filename = path.basename(entry.name);
    const outputPath = path.join(binDir, filename);
    await zip.extract(entry.name, outputPath);

    // Unix 系统设置可执行权限
    if (platform !== 'win32') {
      fs.chmodSync(outputPath, 0o755);
    }
  }
}
```

#### UV 安装脚本 (`install-uv.js`)

```javascript
// 版本配置
const UV_RELEASE_BASE_URL = 'https://gitcode.com/CherryHQ/uv/releases/download';
const DEFAULT_UV_VERSION = '0.9.5';

// 平台映射（更全面）
const UV_PACKAGES = {
  'darwin-arm64': 'uv-aarch64-apple-darwin.tar.gz',
  'darwin-x64': 'uv-x86_64-apple-darwin.tar.gz',
  'win32-x64': 'uv-x86_64-pc-windows-msvc.zip',
  'linux-x64': 'uv-x86_64-unknown-linux-gnu.tar.gz',
  'linux-arm64': 'uv-aarch64-unknown-linux-gnu.tar.gz',
  // MUSL variants
  'linux-musl-x64': 'uv-x86_64-unknown-linux-musl.tar.gz',
  // ...
};

// 安装流程
async function downloadUvBinary(platform, arch, version, isMusl) {
  const packageName = UV_PACKAGES[platformKey];
  const binDir = path.join(os.homedir(), '.cherrystudio', 'bin');

  await downloadWithRedirects(downloadUrl, tempFilename);

  if (packageName.endsWith('.tar.gz')) {
    // tar.gz 文件：使用 tar 命令解压
    execSync(`tar -xzf "${tempFilename}" -C "${tempExtractDir}"`);
  } else {
    // zip 文件：使用 StreamZip 解压
    const zip = new StreamZip.async({ file: tempFilename });
    // ...
  }
}
```

#### 下载工具 (`download.js`)

```javascript
// 支持 HTTP 重定向的下载函数
async function downloadWithRedirects(url, destinationPath) {
  return new Promise((resolve, reject) => {
    const request = (url) => {
      https.get(url, (response) => {
        // 处理 301/302 重定向
        if (response.statusCode == 301 || response.statusCode == 302) {
          request(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: ${response.statusCode}`));
          return;
        }
        // 管道输出到文件
        const file = fs.createWriteStream(destinationPath);
        response.pipe(file);
        file.on('finish', () => resolve());
      });
    };
    request(url);
  });
}
```

---

## 命令检测与回退策略

### 核心检测函数

**文件位置**: `src/main/utils/process.ts`

```typescript
// 安全验证
const VALID_COMMAND_NAME_REGEX = /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,127}$/;
const COMMAND_LOOKUP_TIMEOUT_MS = 5000;
const MAX_OUTPUT_SIZE = 10240;

/**
 * 在用户的登录 Shell 环境中查找命令
 * @param command - 命令名称 (如 'npx', 'uvx')
 * @param loginShellEnv - 登录 Shell 环境变量
 * @returns 找到返回完整路径，否则返回 null
 */
export async function findCommandInShellEnv(
  command: string,
  loginShellEnv: Record<string, string>,
): Promise<string | null> {
  // 1. 验证命令名称（防止命令注入）
  if (!VALID_COMMAND_NAME_REGEX.test(command)) {
    logger.warn(`Invalid command name '${command}'`);
    return null;
  }

  return new Promise((resolve) => {
    if (isWin) {
      // Windows: 使用 where 命令
      const child = spawn('where', [command], {
        env: loginShellEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.on('close', (code) => {
        if (code === 0) {
          const paths = output.trim().split(/\r?\n/);
          // 只接受 .exe 文件
          const exePath = paths.find((p) => p.toLowerCase().endsWith('.exe'));
          resolve(exePath || null);
        } else {
          resolve(null);
        }
      });
    } else {
      // Unix/Linux: 使用 command -v (POSIX 标准)
      const child = spawn('/bin/sh', ['-c', 'command -v "$1"', '--', command], {
        env: loginShellEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.on('close', (code) => {
        if (code === 0) {
          const commandPath = output.trim().split('\n')[0];
          // 验证是绝对路径（不是别名或内置命令）
          resolve(path.isAbsolute(commandPath) ? commandPath : null);
        } else {
          resolve(null);
        }
      });
    }

    // 超时处理
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve(null);
    }, COMMAND_LOOKUP_TIMEOUT_MS);
  });
}

/**
 * 检查内置二进制文件是否存在
 */
export async function isBinaryExists(name: string): Promise<boolean> {
  const cmd = await getBinaryPath(name);
  return fs.existsSync(cmd);
}

/**
 * 获取内置二进制文件路径
 */
export async function getBinaryPath(name?: string): Promise<string> {
  if (!name) {
    return path.join(os.homedir(), '.cherrystudio', 'bin');
  }

  const binaryName = await getBinaryName(name); // 添加 .exe 在 Windows
  const binariesDir = path.join(os.homedir(), '.cherrystudio', 'bin');
  return path.join(binariesDir, binaryName);
}

/**
 * 获取二进制文件名称（带平台扩展）
 */
export async function getBinaryName(name: string): Promise<string> {
  return isWin ? `${name}.exe` : name;
}
```

### 回退策略流程图

```
用户请求运行 MCP 服务器
    │
    ▼
获取登录 Shell 环境变量
    │
    ▼
┌─────────────────────────────┐
│  命令是 npx/uvx/uv ?        │
└─────────────────────────────┘
    │
    ├── npx ──────────────────────┐
    │                             │
    │                             ▼
    │                    ┌──────────────────────┐
    │                    │ 系统中有 npx 吗？    │
    │                    └──────────────────────┘
    │                         │         │
    │                        是         否
    │                         │         │
    │                         ▼         ▼
    │                    使用系统    检查内置 bun
    │                    npx 路径        │
    │                                     │
    │                               ┌─────┴─────┐
    │                               │           │
    │                              有           无
    │                               │           │
    │                               ▼           ▼
    │                        使用内置      抛出错误
    │                        bun (x)     (需要安装)
    │
    ├── uvx/uv ───────────────────┐
    │                             │
    │                             ▼
    │                    ┌──────────────────────┐
    │                    │ 系统中有 uv 吗？     │
    │                    └──────────────────────┘
    │                         │         │
    │                        是         否
    │                         │         │
    │                         ▼         ▼
    │                    使用系统    检查内置 uv
    │                    uv 路径         │
    │                                     │
    │                               ┌─────┴─────┐
    │                               │           │
    │                              有           无
    │                               │           │
    │                               ▼           ▼
    │                        使用内置      抛出错误
    │                        uv/uvx       (需要安装)
```

---

## Shell 环境配置

**文件位置**: `src/main/utils/shell-env.ts`

```typescript
const SHELL_ENV_TIMEOUT_MS = 15_000; // 15 秒超时

/**
 * 获取用户登录 Shell 的环境变量
 * 运行登录 + 交互式 Shell 以加载用户的配置文件
 */
function getLoginShellEnvironment(): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const homeDirectory = os.homedir();
    let shellPath, commandArgs, shellCommandToGetEnv;

    if (isWin) {
      // Windows: 使用 cmd.exe
      shellPath = process.env.COMSPEC || 'cmd.exe';
      shellCommandToGetEnv = 'set';
      commandArgs = ['/c', shellCommandToGetEnv];
    } else {
      // POSIX: 使用 zsh/bash
      shellPath = process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash');
      shellCommandToGetEnv = 'env';
      // -l: login shell, -i: interactive, -c: command
      commandArgs = ['-ilc', shellCommandToGetEnv];
    }

    // 在用户主目录启动 Shell
    const child = spawn(shellPath, commandArgs, {
      cwd: homeDirectory,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let output = '';

    // 超时保护
    const timeoutId = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out after ${SHELL_ENV_TIMEOUT_MS}ms`));
    }, SHELL_ENV_TIMEOUT_MS);

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        return reject(new Error(`Shell exited with code ${code}`));
      }

      // 解析环境变量
      const env: Record<string, string> = {};
      const lines = output.split(/\r?\n/);
      lines.forEach((line) => {
        const separatorIndex = line.indexOf('=');
        if (separatorIndex > 0) {
          const key = line.substring(0, separatorIndex);
          const value = line.substring(separatorIndex + 1);
          env[key] = value;
        }
      });

      // 添加 Cherry Studio bin 目录到 PATH
      appendCherryBinToPath(env);

      resolve(env);
    });
  });
}

/**
 * 将 Cherry Studio bin 目录添加到 PATH
 */
const appendCherryBinToPath = (env: Record<string, string>) => {
  const pathSeparator = isWin ? ';' : ':';
  const homeDir = env.HOME || os.homedir();
  const cherryBinPath = path.join(homeDir, '.cherrystudio', 'bin');

  // 找到 PATH 键（大小写不敏感）
  const pathKeys = Object.keys(env).filter((key) => key.toLowerCase() === 'path');
  const canonicalPathKey = pathKeys[0] || (isWin ? 'Path' : 'PATH');

  const existingPath = env[canonicalPathKey] || '';
  const segments = existingPath.split(pathSeparator);

  // 去重
  const seen = new Set();
  const uniqueSegments = [];
  for (const segment of segments) {
    const normalized = isWin ? segment.toLowerCase() : segment;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueSegments.push(segment);
    }
  }

  // 添加 Cherry Studio bin 路径
  uniqueSegments.push(cherryBinPath);

  env[canonicalPathKey] = uniqueSegments.join(pathSeparator);
};

// 使用 memoization 缓存结果
const memoizedGetShellEnvs = memoize(async () => {
  try {
    return await getLoginShellEnvironment();
  } catch (error) {
    logger.error('Failed to get shell environment, falling back to process.env');
    // 降级到当前进程环境
    const fallbackEnv: Record<string, string> = {};
    for (const key in process.env) {
      fallbackEnv[key] = process.env[key] || '';
    }
    appendCherryBinToPath(fallbackEnv);
    return fallbackEnv;
  }
});

export default memoizedGetShellEnvs;
```

---

## DXT 包管理

**文件位置**: `src/main/services/DxtService.ts`

DXT (Desktop Extension) 是一个打包格式，用于分发 MCP 服务器。

### DXT 包结构

```
server-name.dxt (ZIP 文件)
├── manifest.json           # 清单文件
├── server/                 # 服务器代码
│   ├── main.py
│   └── requirements.txt
└── resources/              # 资源文件
```

### manifest.json 结构

```typescript
interface DxtManifest {
  dxt_version: string; // DXT 格式版本
  name: string; // 服务器唯一名称
  display_name?: string; // 显示名称
  version: string; // 版本号
  description?: string;
  author?: {
    name?: string;
    email?: string;
    url?: string;
  };
  server: {
    type: string; // 服务器类型
    entry_point: string; // 入口点
    mcp_config: {
      command: string; // 启动命令
      args: string[]; // 命令参数
      env?: Record<string, string>;
      platform_overrides?: {
        // 平台特定配置
        [platform: string]: {
          command?: string;
          args?: string[];
          env?: Record<string, string>;
        };
      };
    };
  };
  tools?: Array<{
    name: string;
    description: string;
  }>;
  keywords?: string[];
  license?: string;
}
```

### DXT 核心功能

```typescript
class DxtService {
  private tempDir = path.join(getTempDir(), 'dxt_uploads');
  private mcpDir = getMcpDir();

  /**
   * 上传并解析 DXT 文件
   */
  public async uploadDxt(filePath: string): Promise<DxtUploadResult> {
    const tempExtractDir = path.join(this.tempDir, `dxt_${uuidv4()}`);

    // 1. 解压 ZIP
    const zip = new StreamZip.async({ file: filePath });
    await zip.extract(null, tempExtractDir);

    // 2. 读取并验证 manifest.json
    const manifestPath = path.join(tempExtractDir, 'manifest.json');
    const manifest: DxtManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // 3. 验证必需字段
    if (!manifest.name || !manifest.server?.mcp_config) {
      throw new Error('Invalid manifest');
    }

    // 4. 移动到最终位置（自动版本管理）
    const serverDirName = `server-${manifest.name}`;
    const finalExtractDir = ensurePathWithin(this.mcpDir, serverDirName);

    // 清理旧版本
    if (fs.existsSync(finalExtractDir)) {
      fs.rmSync(finalExtractDir, { recursive: true });
    }

    await this.moveDirectory(tempExtractDir, finalExtractDir);

    return {
      success: true,
      data: { manifest, extractDir: finalExtractDir },
    };
  }

  /**
   * 获取解析后的 MCP 配置（应用平台覆盖和变量替换）
   */
  public getResolvedMcpConfig(
    dxtPath: string,
    userConfig?: Record<string, any>,
  ): ResolvedMcpConfig | null {
    const manifestPath = path.join(dxtPath, 'manifest.json');
    const manifest: DxtManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    return applyPlatformOverrides(manifest.server.mcp_config, dxtPath, userConfig);
  }
}

/**
 * 应用平台覆盖和变量替换
 */
export function applyPlatformOverrides(
  mcpConfig: any,
  extractDir: string,
  userConfig?: Record<string, any>,
): any {
  const platform = process.platform;
  const resolvedConfig = { ...mcpConfig };

  // 1. 应用平台特定覆盖
  if (mcpConfig.platform_overrides?.[platform]) {
    const override = mcpConfig.platform_overrides[platform];
    if (override.command) resolvedConfig.command = override.command;
    if (override.args) resolvedConfig.args = override.args;
    if (override.env) resolvedConfig.env = { ...resolvedConfig.env, ...override.env };
  }

  // 2. 应用变量替换
  if (resolvedConfig.command) {
    resolvedConfig.command = performVariableSubstitution(
      resolvedConfig.command,
      extractDir,
      userConfig,
    );
    resolvedConfig.command = validateCommand(resolvedConfig.command); // 安全验证
  }

  if (resolvedConfig.args) {
    resolvedConfig.args = resolvedConfig.args.map((arg) =>
      performVariableSubstitution(arg, extractDir, userConfig),
    );
    resolvedConfig.args = validateArgs(resolvedConfig.args); // 安全验证
  }

  return resolvedConfig;
}

/**
 * 变量替换
 */
export function performVariableSubstitution(
  value: string,
  extractDir: string,
  userConfig?: Record<string, any>,
): string {
  let result = value;

  // 内置变量
  result = result.replace(/\$\{__dirname\}/g, extractDir);
  result = result.replace(/\$\{HOME\}/g, os.homedir());
  result = result.replace(/\$\{DESKTOP\}/g, path.join(os.homedir(), 'Desktop'));
  result = result.replace(/\$\{DOCUMENTS\}/g, path.join(os.homedir(), 'Documents'));
  result = result.replace(/\$\{DOWNLOADS\}/g, path.join(os.homedir(), 'Downloads'));
  result = result.replace(/\$\{pathSeparator\}/g, path.sep);

  // 用户配置变量
  if (userConfig) {
    result = result.replace(/\$\{user_config\.([^}]+)\}/g, (match, key) => {
      return userConfig[key] || match;
    });
  }

  return result;
}
```

---

## 完整移植方案

### 步骤 1: 创建目录结构

```
你的-vue-项目/
├── backend/                      # 后端服务（Node.js/Electron）
│   ├── services/
│   │   ├── MCPService.ts        # MCP 核心服务
│   │   └── DxtService.ts        # DXT 包管理
│   ├── utils/
│   │   ├── process.ts           # 进程工具
│   │   ├── shell-env.ts         # Shell 环境
│   │   └── index.ts             # 通用工具
│   └── scripts/
│       ├── install-bun.js       # Bun 安装
│       ├── install-uv.js        # UV 安装
│       └── download.js          # 下载工具
├── frontend/                     # Vue 前端
└── shared/                       # 共享类型
    └── types.ts                  # MCP 类型定义
```

### 步骤 2: 复制核心文件

从 Cherry Studio 复制以下文件到你的项目：

| 源文件                             | 目标位置            | 说明                            |
| ---------------------------------- | ------------------- | ------------------------------- |
| `src/main/services/MCPService.ts`  | `backend/services/` | MCP 核心服务                    |
| `src/main/services/DxtService.ts`  | `backend/services/` | DXT 包管理                      |
| `src/main/utils/process.ts`        | `backend/utils/`    | 进程和命令检测                  |
| `src/main/utils/shell-env.ts`      | `backend/utils/`    | Shell 环境                      |
| `src/main/utils/index.ts`          | `backend/utils/`    | 通用工具（含 `removeEnvProxy`） |
| `resources/scripts/install-bun.js` | `backend/scripts/`  | Bun 安装脚本                    |
| `resources/scripts/install-uv.js`  | `backend/scripts/`  | UV 安装脚本                     |
| `resources/scripts/download.js`    | `backend/scripts/`  | 下载工具                        |
| `packages/shared/mcp.ts`           | `shared/`           | MCP 工具命名                    |
| `src/renderer/src/types/mcp.ts`    | `shared/types.ts`   | MCP 类型定义                    |

### 步骤 3: 修改常量配置

创建 `backend/config/constants.ts`:

```typescript
import os from 'os';

// 替换 HOME_CHERRY_DIR 为你的项目名称
export const HOME_DIR = '.your-vue-chat-app';
export const BIN_DIR = path.join(os.homedir(), HOME_DIR, 'bin');
export const MCP_DIR = path.join(os.homedir(), HOME_DIR, 'mcp');
export const TEMP_DIR = path.join(os.homedir(), HOME_DIR, 'temp');

// Bun 和 UV 版本
export const BUN_VERSION = '1.3.1';
export const UV_VERSION = '0.9.5';

// 下载 URL（使用 Cherry Studio 的镜像或官方源）
export const BUN_RELEASE_BASE_URL = 'https://gitcode.com/CherryHQ/bun/releases/download';
export const UV_RELEASE_BASE_URL = 'https://gitcode.com/CherryHQ/uv/releases/download';
```

### 步骤 4: 创建安装入口

创建 `backend/services/RuntimeInstaller.ts`:

```typescript
import { logger } from '@/utils/logger';
import { BIN_DIR, BUN_VERSION, UV_VERSION } from '@/config/constants';
import { runInstallScript } from '@/utils/process';
import fs from 'fs';
import path from 'path';

export class RuntimeInstaller {
  /**
   * 检查运行时安装状态
   */
  static async checkStatus(): Promise<{
    bunInstalled: boolean;
    uvInstalled: boolean;
  }> {
    const bunPath = path.join(BIN_DIR, process.platform === 'win32' ? 'bun.exe' : 'bun');
    const uvPath = path.join(BIN_DIR, process.platform === 'win32' ? 'uv.exe' : 'uv');

    return {
      bunInstalled: fs.existsSync(bunPath),
      uvInstalled: fs.existsSync(uvPath),
    };
  }

  /**
   * 安装 Bun
   */
  static async installBun(): Promise<boolean> {
    try {
      logger.info('Installing Bun...');
      await runInstallScript('install-bun.js');
      logger.info('Bun installed successfully');
      return true;
    } catch (error) {
      logger.error('Failed to install Bun:', error);
      return false;
    }
  }

  /**
   * 安装 UV
   */
  static async installUv(): Promise<boolean> {
    try {
      logger.info('Installing UV...');
      await runInstallScript('install-uv.js');
      logger.info('UV installed successfully');
      return true;
    } catch (error) {
      logger.error('Failed to install UV:', error);
      return false;
    }
  }

  /**
   * 安装所有运行时
   */
  static async installAll(): Promise<void> {
    const status = await this.checkStatus();

    if (!status.bunInstalled) {
      await this.installBun();
    }

    if (!status.uvInstalled) {
      await this.installUv();
    }
  }
}
```

### 步骤 5: 修改 MCPService 适配

在复制的 `MCPService.ts` 中，修改导入：

```typescript
// 修改前
import { HOME_CHERRY_DIR } from '@shared/config/constant';

// 修改后
import { BIN_DIR, MCP_DIR } from '@/config/constants';

// 修改 getBinaryPath 等函数中的路径引用
// 将 HOME_CHERRY_DIR 替换为你的常量
```

### 步骤 6: 创建 API 路由

创建 `backend/api/mcp.ts`:

```typescript
import express from 'express';
import mcpService from '@/services/MCPService';
import { RuntimeInstaller } from '@/services/RuntimeInstaller';

const router = express.Router();

// 获取安装状态
router.get('/runtime/status', async (req, res) => {
  const status = await RuntimeInstaller.checkStatus();
  res.json(status);
});

// 安装 Bun
router.post('/runtime/install/bun', async (req, res) => {
  const success = await RuntimeInstaller.installBun();
  res.json({ success });
});

// 安装 UV
router.post('/runtime/install/uv', async (req, res) => {
  const success = await RuntimeInstaller.installUv();
  res.json({ success });
});

// MCP 服务器操作
router.post('/server/connect', async (req, res) => {
  try {
    await mcpService.initClient(req.body.server);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/server/disconnect', async (req, res) => {
  try {
    await mcpService.stopServer(null, req.body.server);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/server/tools', async (req, res) => {
  try {
    const tools = await mcpService.listTools(null, req.body.server);
    res.json(tools);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/server/call', async (req, res) => {
  try {
    const result = await mcpService.callTool(null, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### 步骤 7: Vue 前端集成

创建 `frontend/composables/useMCP.ts`:

```typescript
import { ref, computed } from 'vue';

export interface MCPServer {
  id: string;
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  baseUrl?: string;
  type?: 'stdio' | 'sse' | 'streamableHttp';
}

export function useMCP() {
  const runtimeStatus = ref({
    bunInstalled: false,
    uvInstalled: false,
  });

  const servers = ref<MCPServer[]>([]);
  const loading = ref(false);

  // 获取运行时状态
  const checkRuntimeStatus = async () => {
    const response = await fetch('/api/mcp/runtime/status');
    runtimeStatus.value = await response.json();
  };

  // 安装 Bun
  const installBun = async () => {
    loading.value = true;
    try {
      const response = await fetch('/api/mcp/runtime/install/bun', {
        method: 'POST',
      });
      const result = await response.json();
      if (result.success) {
        await checkRuntimeStatus();
      }
      return result.success;
    } finally {
      loading.value = false;
    }
  };

  // 安装 UV
  const installUv = async () => {
    loading.value = true;
    try {
      const response = await fetch('/api/mcp/runtime/install/uv', {
        method: 'POST',
      });
      const result = await response.json();
      if (result.success) {
        await checkRuntimeStatus();
      }
      return result.success;
    } finally {
      loading.value = false;
    }
  };

  // 连接服务器
  const connectServer = async (server: MCPServer) => {
    const response = await fetch('/api/mcp/server/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server }),
    });
    return response.json();
  };

  // 获取工具列表
  const listTools = async (server: MCPServer) => {
    const response = await fetch('/api/mcp/server/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server }),
    });
    return response.json();
  };

  // 调用工具
  const callTool = async (server: MCPServer, name: string, args: any) => {
    const response = await fetch('/api/mcp/server/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server, name, args }),
    });
    return response.json();
  };

  return {
    runtimeStatus,
    servers,
    loading,
    checkRuntimeStatus,
    installBun,
    installUv,
    connectServer,
    listTools,
    callTool,
  };
}
```

### 步骤 8: 创建设置页面

创建 `frontend/pages/MCPSettings.vue`:

```vue
<template>
  <div class="mcp-settings">
    <h2>MCP 运行时设置</h2>

    <div class="runtime-status">
      <div class="status-item">
        <span>Bun 状态:</span>
        <span :class="{ installed: runtimeStatus.bunInstalled }">
          {{ runtimeStatus.bunInstalled ? '已安装' : '未安装' }}
        </span>
        <button v-if="!runtimeStatus.bunInstalled" @click="handleInstallBun" :disabled="loading">
          安装 Bun
        </button>
      </div>

      <div class="status-item">
        <span>UV 状态:</span>
        <span :class="{ installed: runtimeStatus.uvInstalled }">
          {{ runtimeStatus.uvInstalled ? '已安装' : '未安装' }}
        </span>
        <button v-if="!runtimeStatus.uvInstalled" @click="handleInstallUv" :disabled="loading">
          安装 UV
        </button>
      </div>
    </div>

    <div class="mcp-servers">
      <h3>MCP 服务器</h3>
      <!-- 服务器列表和配置 -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useMCP } from '@/composables/useMCP';

const { runtimeStatus, loading, checkRuntimeStatus, installBun, installUv } = useMCP();

onMounted(() => {
  checkRuntimeStatus();
});

const handleInstallBun = async () => {
  await installBun();
};

const handleInstallUv = async () => {
  await installUv();
};
</script>

<style scoped>
.installed {
  color: green;
}
</style>
```

### 步骤 9: 依赖安装

在后端 `package.json` 中添加：

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "node-stream-zip": "^1.15.0",
    "uuid": "^11.0.3",
    "lodash": "^4.17.21"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/uuid": "^10.0.0",
    "@types/lodash": "^4.17.0"
  }
}
```

### 步骤 10: 关键注意事项

| 问题           | 解决方案                                              |
| -------------- | ----------------------------------------------------- |
| Bun 不支持代理 | 在使用 bun 时调用 `removeEnvProxy()` 移除代理环境变量 |
| Windows 路径   | 使用 `path.join()` 和 `.exe` 扩展名                   |
| MUSL libc      | 检测 Alpine Linux 并下载 MUSL 变体                    |
| 命令注入       | 使用正则验证命令名称，只允许字母数字和特定字符        |
| 路径遍历       | 验证解析后的路径在基础目录内                          |
| Shell 超时     | 设置 15 秒超时，防止配置文件挂起                      |
| 缓存失效       | 服务器重启时清除相关缓存                              |
| 进程管理       | 使用 AbortController 支持长时间运行操作的中止         |

---

## 总结

这个完整的 MCP 环境移植方案包括：

1. **核心服务**：MCPService 和 DxtService
2. **运行时安装**：Bun 和 UV 的自动安装机制
3. **智能回退**：系统命令优先，内置运行时兜底
4. **环境管理**：登录 Shell 环境获取和 PATH 管理
5. **安全措施**：命令验证、路径验证、超时保护
6. **DXT 支持**：打包格式的解析和管理

移植时需要根据你的项目架构调整：

- 如果是纯 Web 应用，后端可以用 Express/Fastify
- 如果是 Electron，可以直接使用主进程
- Vue 前端通过 WebSocket 或 HTTP API 与后端通信

文件清单（需要从 Cherry Studio 复制的文件）：

1. `src/main/services/MCPService.ts`
2. `src/main/services/DxtService.ts`
3. `src/main/utils/process.ts`
4. `src/main/utils/shell-env.ts`
5. `src/main/utils/index.ts`
6. `resources/scripts/install-bun.js`
7. `resources/scripts/install-uv.js`
8. `resources/scripts/download.js`
9. `packages/shared/mcp.ts`
10. `src/renderer/src/types/mcp.ts`
