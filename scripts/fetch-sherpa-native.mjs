#!/usr/bin/env node
/**
 * 构建期拉取 sherpa-onnx 原生库到 extraResources/sherpa/native/<platformKey>/。
 *
 * 本地 sherpa ASR 引擎共用 sherpa-onnx 原生运行库。过去它在运行时下载
 * 到 userData（下载/重签/自检失败面大）；现改为**随安装包内置**（像 whisper.cpp 的
 * addon.node 一样走 extraResources，asar 内 .node 不可 dlopen 的限制只针对 asar，
 * extraResources 不受限）。
 *
 * 用法：
 *   node scripts/fetch-sherpa-native.mjs
 *
 * 架构说明：默认取 host 平台/架构的原生库。electron-builder 为每个目标平台在其原生
 * runner 上打包（CI matrix / 本机），host 即目标。需要交叉打包时在对应平台 runner 上运行。
 *
 * macOS：构建期把 @rpath 依赖改写为 @loader_path（同目录解析）并 ad-hoc 重签，随后由
 * electron-builder 的 Developer ID 签名 / 公证覆盖（取代旧的运行时 ad-hoc 重签）。
 *
 * 下载 / 重签逻辑与 fetch-whisper-addon.mjs 共用 scripts/lib/native-download.mjs。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { download, sha512, resignMacNodes } from './lib/native-download.mjs';

// 与 main/helpers/sherpaOnnx/sherpaLibPaths.ts 保持一致。1.13.8 包含
// FireRedASR v1 fixed-cache + FireRedASR2 dynamic-cache 兼容修复
// (upstream 2d8286d and f7982bd).
const SHERPA_VERSION = '1.13.8';

// 官方 npm 平台包由 sherpa-onnx 的 release workflow 构建，覆盖 SmartSub
// 的 CPU 目标平台。每个 tarball 的 integrity 固定在这里，避免构建时
// 静默取得另一份原生库。
const PACKAGE_INTEGRITY = {
  'darwin-arm64':
    'FPNgJMgnWVl/KhRTIhG3KL3A4Om63Rn4YKXc9/uHY7SzLcvqLJLc/h7UBWJwduXvv7K18t5NpxHR6XgXn4sjWw==',
  'darwin-x64':
    '7BLRpjM6w4f9W46/nmkmq8lEKUayhebvcpslCVQ+6QN2uReYlZEMDZlSpXMjme+hUFrPfRz8P3UNq8ep/4d19g==',
  'linux-x64':
    '6plnhjagsSeTntCgnlag86hWbs/uZE9Crms1LgOb68/1nKsIQjMd+WG519m+aPwT6TrsBOiEMzrx41t8sL5L5g==',
  'linux-arm64':
    'Tlg7a70b/Wge3OF8IgTHF9jhSVCsLyKQKhwc4BsJ5A+dL/SrFtGBjzuHp4XeLhiiOT7afCxX5PdSn/D4c8Lnuw==',
  'win-x64':
    'oZF1c9VPOKtMwn83Bboc5XSWL+76BRoyB3eUuVnCknBKxwSULZU2Foia9VHWzU+n4I12rPsP6z6H9Rp1hD9o8g==',
  'win-ia32':
    'H0Ojln9hfvM+pxWqW0cnjB/XK8/JPq4/k0IWu2JpY5Z458M3zv+XC3Hu+wmot3AoH/K1Bgt23n/tTKtPV9x8qg==',
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 与 getSherpaPlatformKey() 一致：darwin-<arch> / win-x64 / linux-<arch>。 */
function getPlatformKey() {
  const arch = process.arch === 'ia32' ? 'ia32' : process.arch;
  if (process.platform === 'win32') {
    return `win-${arch === 'arm64' ? 'x64' : arch}`;
  }
  if (process.platform === 'darwin') return `darwin-${arch}`;
  return `linux-${arch}`;
}

function packageName(platformKey) {
  return `sherpa-onnx-${platformKey}`;
}

function packageUrl(platformKey) {
  return `https://registry.npmjs.org/${packageName(platformKey)}/-/${packageName(platformKey)}-${SHERPA_VERSION}.tgz`;
}

async function main() {
  const platformKey = getPlatformKey();
  const pkg = packageName(platformKey);
  const url = packageUrl(platformKey);
  const expectedIntegrity = PACKAGE_INTEGRITY[platformKey];
  if (!expectedIntegrity)
    throw new Error(`unsupported sherpa platform: ${platformKey}`);
  const outDir = path.join(
    root,
    'extraResources',
    'sherpa',
    'native',
    platformKey,
  );
  const tmp = path.join(os.tmpdir(), `${pkg}-${SHERPA_VERSION}.tgz`);

  console.log(`Fetching ${pkg}@${SHERPA_VERSION} ...`);
  await download(url, tmp);
  const actualIntegrity = sha512(tmp);
  if (actualIntegrity !== expectedIntegrity) {
    throw new Error(
      `sherpa integrity mismatch: expected sha512-${expectedIntegrity}, got sha512-${actualIntegrity}`,
    );
  }
  console.log('integrity OK');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const extractDir = path.join(os.tmpdir(), `${pkg}-${SHERPA_VERSION}-extract`);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  // Use the platform tar executable so native fetching does not require a
  // runtime npm dependency (the build image already provides tar).
  execFileSync('tar', ['-xzf', tmp, '-C', extractDir]);
  const packageDir = path.join(extractDir, 'package');
  for (const file of fs.readdirSync(packageDir)) {
    if (/\.(node|dylib|so|dll)(\..*)?$/.test(file)) {
      fs.copyFileSync(path.join(packageDir, file), path.join(outDir, file));
    }
  }
  fs.rmSync(tmp, { force: true });
  fs.rmSync(extractDir, { recursive: true, force: true });

  resignMacNodes(outDir);

  const nativePath = path.join(outDir, 'sherpa-onnx.node');
  if (!fs.existsSync(nativePath)) {
    throw new Error(`sherpa-onnx.node missing in ${outDir} after extract`);
  }
  console.log(`sherpa native ready at ${outDir} (${platformKey})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
