// @ts-nocheck
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const AdmZip = require('adm-zip');
const { spawn, execFileSync } = require('child_process');

const HOME_RUNTIME_DIR = path.join(os.homedir(), '.sanft', 'mcp');
const BIN_DIR = path.join(HOME_RUNTIME_DIR, 'bin');
const DEFAULT_BUN_VERSION = '1.3.1';
const DEFAULT_UV_VERSION = '0.9.5';
const SHELL_ENV_TIMEOUT_MS = 15_000;
const COMMAND_LOOKUP_TIMEOUT_MS = 5_000;
const VALID_COMMAND_NAME_REGEX = /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,127}$/;

const BUN_MIRROR_BASE_URL = 'https://gitcode.com/CherryHQ/bun/releases/download';
const BUN_OFFICIAL_BASE_URL = 'https://github.com/oven-sh/bun/releases/download';
const UV_MIRROR_BASE_URL = 'https://gitcode.com/CherryHQ/uv/releases/download';
const UV_OFFICIAL_BASE_URL = 'https://github.com/astral-sh/uv/releases/download';

const BUN_PACKAGES = {
  'darwin-arm64': 'bun-darwin-aarch64.zip',
  'darwin-x64': 'bun-darwin-x64.zip',
  'win32-x64': 'bun-windows-x64.zip',
  'linux-x64': 'bun-linux-x64.zip',
  'linux-arm64': 'bun-linux-aarch64.zip',
  'linux-musl-x64': 'bun-linux-x64-musl.zip',
  'linux-musl-arm64': 'bun-linux-aarch64-musl.zip',
};

const UV_PACKAGES = {
  'darwin-arm64': 'uv-aarch64-apple-darwin.tar.gz',
  'darwin-x64': 'uv-x86_64-apple-darwin.tar.gz',
  'win32-x64': 'uv-x86_64-pc-windows-msvc.zip',
  'linux-x64': 'uv-x86_64-unknown-linux-gnu.tar.gz',
  'linux-arm64': 'uv-aarch64-unknown-linux-gnu.tar.gz',
  'linux-musl-x64': 'uv-x86_64-unknown-linux-musl.tar.gz',
  'linux-musl-arm64': 'uv-aarch64-unknown-linux-musl.tar.gz',
};

const IS_WINDOWS = process.platform === 'win32';
let loginShellEnvPromise = null;
let installLockPromise = null;

function ensureBinDir() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

function getBinaryName(name) {
  return IS_WINDOWS ? `${name}.exe` : name;
}

function getBinaryPath(name) {
  return path.join(BIN_DIR, getBinaryName(name));
}

function isLikelyMusl() {
  if (process.platform !== 'linux') return false;

  try {
    const report = process.report?.getReport?.();
    if (report?.header?.glibcVersionRuntime) return false;
  } catch (_error) {
    // ignore
  }

  try {
    const lddPath = '/usr/bin/ldd';
    if (fs.existsSync(lddPath)) {
      const lddContent = fs.readFileSync(lddPath, 'utf8');
      if (/musl/i.test(lddContent)) return true;
    }
  } catch (_error) {
    // ignore
  }

  try {
    const output = execFileSync('ldd', ['--version'], { encoding: 'utf8' });
    if (/musl/i.test(output)) return true;
  } catch (_error) {
    // ignore
  }

  return false;
}

function getPlatformKey() {
  if (process.platform === 'linux' && isLikelyMusl()) {
    return `linux-musl-${process.arch}`;
  }
  return `${process.platform}-${process.arch}`;
}

function appendRuntimeBinToPath(envObj) {
  const pathKey =
    Object.keys(envObj).find((key) => key.toLowerCase() === 'path') ||
    (IS_WINDOWS ? 'Path' : 'PATH');
  const separator = IS_WINDOWS ? ';' : ':';
  const currentPath = String(envObj[pathKey] || '');
  const segments = currentPath.split(separator).filter(Boolean);
  const normalizedSet = new Set();
  const deduped = [];

  for (const segment of segments) {
    const normalized = IS_WINDOWS ? segment.toLowerCase() : segment;
    if (normalizedSet.has(normalized)) continue;
    normalizedSet.add(normalized);
    deduped.push(segment);
  }

  const runtimePathNormalized = IS_WINDOWS ? BIN_DIR.toLowerCase() : BIN_DIR;
  if (!normalizedSet.has(runtimePathNormalized)) {
    deduped.push(BIN_DIR);
  }

  envObj[pathKey] = deduped.join(separator);
}

function parseShellEnv(raw) {
  const envObj = {};
  const lines = String(raw || '').split(/\r?\n/);

  for (const line of lines) {
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    envObj[key] = line.slice(eqIndex + 1);
  }

  appendRuntimeBinToPath(envObj);
  return envObj;
}

function buildFallbackEnv() {
  const fallbackEnv = {};
  for (const key of Object.keys(process.env)) {
    fallbackEnv[key] = process.env[key] || '';
  }
  appendRuntimeBinToPath(fallbackEnv);
  return fallbackEnv;
}

function getPathValue(envObj = {}) {
  const pathKey = Object.keys(envObj).find((key) => key.toLowerCase() === 'path');
  return String(pathKey ? envObj[pathKey] || '' : '');
}

function isExecutableFile(targetPath) {
  try {
    const stat = fs.statSync(targetPath);
    if (!stat.isFile()) return false;
    if (IS_WINDOWS) return true;
    fs.accessSync(targetPath, fs.constants.X_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

function findExecutableInPath(command, envObj = {}) {
  const pathValue = getPathValue(envObj);
  if (!pathValue) return null;

  const separator = IS_WINDOWS ? ';' : ':';
  const segments = pathValue.split(separator).filter(Boolean);
  const candidates = IS_WINDOWS
    ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`]
    : [command];

  for (const segment of segments) {
    for (const candidateName of candidates) {
      const candidatePath = path.join(segment, candidateName);
      if (isExecutableFile(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

function findCommandInKnownLocations(command) {
  if (IS_WINDOWS) return null;
  if (process.platform !== 'darwin') return null;

  const candidateDirs = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/opt/homebrew/sbin',
    '/usr/local/sbin',
  ];

  for (const dir of candidateDirs) {
    const candidatePath = path.join(dir, command);
    if (isExecutableFile(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

async function loadLoginShellEnvironment() {
  return new Promise((resolve, reject) => {
    const shellPath = IS_WINDOWS
      ? process.env.COMSPEC || 'cmd.exe'
      : process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');

    // macOS/zsh 下 `-i` 可能导致初始化脚本过慢或附加噪声输出，优先使用 login shell。
    const args = IS_WINDOWS ? ['/c', 'set'] : ['-lc', 'env'];

    const child = spawn(shellPath, args, {
      cwd: os.homedir(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: process.env,
    });

    let output = '';
    let errOutput = '';

    const timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timed out after ${SHELL_ENV_TIMEOUT_MS}ms`));
    }, SHELL_ENV_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      errOutput += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0 && !output) {
        reject(new Error(`Shell exited with code ${code}. ${errOutput}`));
        return;
      }
      resolve(parseShellEnv(output));
    });
  });
}

async function getLoginShellEnvironment() {
  if (!loginShellEnvPromise) {
    loginShellEnvPromise = loadLoginShellEnvironment();
  }

  try {
    return await loginShellEnvPromise;
  } catch (_error) {
    // 出错时回退当前进程环境，并清理缓存以便下次重试真实 shell 环境。
    loginShellEnvPromise = null;
    return buildFallbackEnv();
  }
}

async function findCommandInShellEnv(command, shellEnv) {
  if (!VALID_COMMAND_NAME_REGEX.test(command)) {
    return null;
  }

  return new Promise((resolve) => {
    let output = '';
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child;

    if (IS_WINDOWS) {
      child = spawn('where', [command], {
        env: shellEnv,
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: false,
      });
    } else {
      child = spawn('/bin/sh', ['-c', 'command -v "$1"', '--', command], {
        env: shellEnv,
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: false,
      });
    }

    const timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      finish(
        findExecutableInPath(command, shellEnv) ||
          findExecutableInPath(command, process.env) ||
          findCommandInKnownLocations(command),
      );
    }, COMMAND_LOOKUP_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('error', () => {
      clearTimeout(timeoutId);
      finish(
        findExecutableInPath(command, shellEnv) ||
          findExecutableInPath(command, process.env) ||
          findCommandInKnownLocations(command),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        finish(
          findExecutableInPath(command, shellEnv) ||
            findExecutableInPath(command, process.env) ||
            findCommandInKnownLocations(command),
        );
        return;
      }

      const lines = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        finish(
          findExecutableInPath(command, shellEnv) ||
            findExecutableInPath(command, process.env) ||
            findCommandInKnownLocations(command),
        );
        return;
      }

      if (IS_WINDOWS) {
        const pathValue = lines[0];
        finish(
          pathValue ||
            findExecutableInPath(command, shellEnv) ||
            findExecutableInPath(command, process.env),
        );
        return;
      }

      const pathValue = lines[0];
      finish(
        (path.isAbsolute(pathValue) ? pathValue : null) ||
          findExecutableInPath(command, shellEnv) ||
          findExecutableInPath(command, process.env) ||
          findCommandInKnownLocations(command),
      );
    });
  });
}

function removeEnvProxy(envObj) {
  const proxyKeys = new Set([
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'no_proxy',
    'npm_config_proxy',
    'npm_config_https_proxy',
    'npm_config_http_proxy',
    'npm_config_strict_ssl',
  ]);

  for (const key of Object.keys(envObj)) {
    const normalized = key.toLowerCase();
    if (proxyKeys.has(normalized)) {
      delete envObj[key];
    }
  }
}

function downloadWithRedirects(url, destinationPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 8) {
      reject(new Error('Too many redirects'));
      return;
    }

    const parsed = new URL(url);
    const requestClient = parsed.protocol === 'https:' ? https : http;
    const request = requestClient.get(
      url,
      {
        headers: {
          'User-Agent': 'Sanft-MCP-Runtime/1.0',
          Accept: '*/*',
        },
      },
      (response) => {
        const statusCode = response.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = response.headers.location;
          if (!location) {
            reject(new Error(`Redirect without location: ${statusCode}`));
            return;
          }

          response.resume();
          const nextUrl = new URL(location, url).toString();
          downloadWithRedirects(nextUrl, destinationPath, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }

        const file = fs.createWriteStream(destinationPath);
        response.pipe(file);

        file.on('finish', () => {
          file.close(() => resolve());
        });

        file.on('error', (error) => {
          file.close(() => {
            fs.rmSync(destinationPath, { force: true });
            reject(error);
          });
        });
      },
    );

    request.on('error', (error) => {
      reject(error);
    });
  });
}

async function downloadFromCandidates(urls, destinationPath) {
  const errors = [];

  for (const url of urls) {
    try {
      await downloadWithRedirects(url, destinationPath);
      return;
    } catch (error) {
      errors.push(`${url} -> ${String(error?.message || error)}`);
      fs.rmSync(destinationPath, { force: true });
    }
  }

  throw new Error(`All download candidates failed:\n${errors.join('\n')}`);
}

function listFilesRecursively(rootDir) {
  const found = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;

    const stat = fs.statSync(current);
    if (stat.isFile()) {
      found.push(current);
      continue;
    }

    const entries = fs.readdirSync(current);
    for (const entry of entries) {
      stack.push(path.join(current, entry));
    }
  }

  return found;
}

function findExtractedBinary(rootDir, names) {
  const targets = new Set(names.map((name) => name.toLowerCase()));
  const files = listFilesRecursively(rootDir);

  for (const filePath of files) {
    const base = path.basename(filePath).toLowerCase();
    if (targets.has(base)) {
      return filePath;
    }
  }

  return null;
}

function extractArchive(archivePath, extractDir) {
  if (archivePath.endsWith('.zip')) {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(extractDir, true);
    return;
  }

  if (archivePath.endsWith('.tar.gz')) {
    execFileSync('tar', ['-xzf', archivePath, '-C', extractDir]);
    return;
  }

  throw new Error(`Unsupported archive type: ${archivePath}`);
}

function copyExecutable(fromPath, toPath) {
  fs.copyFileSync(fromPath, toPath);
  if (!IS_WINDOWS) {
    fs.chmodSync(toPath, 0o755);
  }
}

function buildBunDownloadUrls(version, packageName) {
  return [
    `${BUN_MIRROR_BASE_URL}/bun-v${version}/${packageName}`,
    `${BUN_OFFICIAL_BASE_URL}/bun-v${version}/${packageName}`,
  ];
}

function buildUvDownloadUrls(version, packageName) {
  const tags = [`uv-${version}`, version, `v${version}`];
  const urls = [];

  for (const tag of tags) {
    urls.push(`${UV_MIRROR_BASE_URL}/${tag}/${packageName}`);
  }

  for (const tag of tags) {
    urls.push(`${UV_OFFICIAL_BASE_URL}/${tag}/${packageName}`);
  }

  return urls;
}

async function installBunRuntime() {
  ensureBinDir();

  const platformKey = getPlatformKey();
  const packageName = BUN_PACKAGES[platformKey];
  if (!packageName) {
    throw new Error(`Unsupported platform for Bun: ${platformKey}`);
  }

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sanft-bun-'));
  const archivePath = path.join(tmpBase, packageName);
  const extractDir = path.join(tmpBase, 'extract');
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    const downloadUrls = buildBunDownloadUrls(DEFAULT_BUN_VERSION, packageName);
    await downloadFromCandidates(downloadUrls, archivePath);
    extractArchive(archivePath, extractDir);

    const bunBinaryName = getBinaryName('bun');
    const extractedBunPath = findExtractedBinary(extractDir, [bunBinaryName]);
    if (!extractedBunPath) {
      throw new Error(`Failed to find ${bunBinaryName} in Bun archive`);
    }

    copyExecutable(extractedBunPath, getBinaryPath('bun'));
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

async function installUvRuntime() {
  ensureBinDir();

  const platformKey = getPlatformKey();
  const packageName = UV_PACKAGES[platformKey];
  if (!packageName) {
    throw new Error(`Unsupported platform for UV: ${platformKey}`);
  }

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sanft-uv-'));
  const archivePath = path.join(tmpBase, packageName);
  const extractDir = path.join(tmpBase, 'extract');
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    const downloadUrls = buildUvDownloadUrls(DEFAULT_UV_VERSION, packageName);
    await downloadFromCandidates(downloadUrls, archivePath);
    extractArchive(archivePath, extractDir);

    const uvBinaryName = getBinaryName('uv');
    const uvxBinaryName = getBinaryName('uvx');

    const extractedUvPath = findExtractedBinary(extractDir, [uvBinaryName]);
    const extractedUvxPath = findExtractedBinary(extractDir, [uvxBinaryName]);

    if (!extractedUvPath) {
      throw new Error(`Failed to find ${uvBinaryName} in UV archive`);
    }

    copyExecutable(extractedUvPath, getBinaryPath('uv'));

    if (extractedUvxPath) {
      copyExecutable(extractedUvxPath, getBinaryPath('uvx'));
    }
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

async function getMcpRuntimeStatus() {
  ensureBinDir();
  const shellEnv = await getLoginShellEnvironment();

  const [systemNpxPath, systemUvPath, systemUvxPath] = await Promise.all([
    findCommandInShellEnv('npx', shellEnv),
    findCommandInShellEnv('uv', shellEnv),
    findCommandInShellEnv('uvx', shellEnv),
  ]);

  const bunInstalled = fs.existsSync(getBinaryPath('bun'));
  const uvInstalled = fs.existsSync(getBinaryPath('uv'));
  const uvxInstalled = fs.existsSync(getBinaryPath('uvx')) || uvInstalled;

  return {
    binDir: BIN_DIR,
    bunInstalled,
    uvInstalled,
    uvxInstalled,
    systemNpxPath: systemNpxPath || '',
    systemUvPath: systemUvPath || '',
    systemUvxPath: systemUvxPath || '',
    platform: process.platform,
    arch: process.arch,
  };
}

async function installMcpRuntime(target = 'all') {
  const normalizedTarget = String(target || 'all').toLowerCase();

  if (!['bun', 'uv', 'all'].includes(normalizedTarget)) {
    throw new Error(`Unsupported install target: ${target}`);
  }

  if (!installLockPromise) {
    installLockPromise = (async () => {
      if (normalizedTarget === 'bun') {
        await installBunRuntime();
      } else if (normalizedTarget === 'uv') {
        await installUvRuntime();
      } else {
        await installBunRuntime();
        await installUvRuntime();
      }

      return getMcpRuntimeStatus();
    })().finally(() => {
      installLockPromise = null;
    });
  }

  return installLockPromise;
}

function normalizeTransportType(transport) {
  const streamableHttpRegex = /^streamable[\s_-]?http$/i;
  if (streamableHttpRegex.test(transport)) {
    return 'http';
  }
  return transport;
}

async function resolveMcpServerRuntimeConfig(serverConfig = {}) {
  const transport = normalizeTransportType(
    String(serverConfig.transport || serverConfig.type || '').toLowerCase(),
  );

  if (transport !== 'stdio') {
    return serverConfig;
  }

  const originalCommand = String(serverConfig.command || '').trim();
  if (!originalCommand) {
    return serverConfig;
  }

  const lowerCommand = originalCommand.toLowerCase();
  const resolvedArgs = Array.isArray(serverConfig.args)
    ? serverConfig.args.map((arg) => String(arg))
    : [];

  const extraEnv =
    serverConfig.env && typeof serverConfig.env === 'object' && !Array.isArray(serverConfig.env)
      ? { ...serverConfig.env }
      : {};

  const loginShellEnv = await getLoginShellEnvironment();
  const mergedEnv = { ...loginShellEnv, ...extraEnv };

  let resolvedCommand = originalCommand;

  if (lowerCommand === 'npx') {
    const systemNpxPath = await findCommandInShellEnv('npx', loginShellEnv);

    if (systemNpxPath) {
      resolvedCommand = systemNpxPath;
    } else {
      const builtinBunPath = getBinaryPath('bun');
      if (!fs.existsSync(builtinBunPath)) {
        throw new Error('npx 不可用，且内置 Bun 未安装。请先安装 Bun 运行时。');
      }
      resolvedCommand = builtinBunPath;
      resolvedArgs.unshift('x', '-y');
    }

    if (serverConfig.registryUrl) {
      mergedEnv.NPM_CONFIG_REGISTRY = String(serverConfig.registryUrl);
    }
  } else if (lowerCommand === 'uv' || lowerCommand === 'uvx') {
    const systemUvPath = await findCommandInShellEnv('uv', loginShellEnv);
    const systemUvxPath = await findCommandInShellEnv('uvx', loginShellEnv);
    const builtinUvPath = getBinaryPath('uv');
    const builtinUvxPath = getBinaryPath('uvx');

    if (lowerCommand === 'uv') {
      if (systemUvPath) {
        resolvedCommand = systemUvPath;
      } else if (fs.existsSync(builtinUvPath)) {
        resolvedCommand = builtinUvPath;
      } else {
        throw new Error('uv 不可用，请先安装 UV 运行时。');
      }
    } else {
      if (systemUvxPath) {
        resolvedCommand = systemUvxPath;
      } else if (systemUvPath) {
        resolvedCommand = systemUvPath;
        resolvedArgs.unshift('x');
      } else if (fs.existsSync(builtinUvxPath)) {
        resolvedCommand = builtinUvxPath;
      } else if (fs.existsSync(builtinUvPath)) {
        resolvedCommand = builtinUvPath;
        resolvedArgs.unshift('x');
      } else {
        throw new Error('uvx 不可用，且内置 UV 未安装。请先安装 UV 运行时。');
      }
    }

    if (serverConfig.registryUrl) {
      const registry = String(serverConfig.registryUrl);
      mergedEnv.UV_DEFAULT_INDEX = registry;
      mergedEnv.PIP_INDEX_URL = registry;
    }
  }

  if (String(resolvedCommand).toLowerCase().includes('bun')) {
    removeEnvProxy(mergedEnv);
  }

  return {
    ...serverConfig,
    command: resolvedCommand,
    args: resolvedArgs,
    env: mergedEnv,
  };
}

module.exports = {
  BIN_DIR,
  getMcpRuntimeStatus,
  installMcpRuntime,
  resolveMcpServerRuntimeConfig,
};
