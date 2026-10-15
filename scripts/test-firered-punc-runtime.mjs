#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.log('firered-punc runtime smoke skipped: macOS arm64 only');
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'extraResources', 'firered-punc', 'runtime');
const python = path.join(runtime, 'bin', 'python3');
const manifest = JSON.parse(
  fs.readFileSync(path.join(runtime, 'manifest.json'), 'utf8'),
);
for (const file of [
  python,
  path.join(runtime, 'lib', 'python3.12'),
  path.join(runtime, 'main.py'),
  path.join(runtime, 'site-packages', 'torch'),
  path.join(runtime, 'site-packages', 'transformers'),
  path.join(runtime, 'site-packages', 'fireredasr2s', 'fireredpunc'),
]) {
  if (!fs.existsSync(file)) throw new Error(`missing runtime entry: ${file}`);
}
if ((fs.statSync(python).mode & 0o111) === 0)
  throw new Error('bundled Python interpreter is not executable');
if (
  manifest.runtimeId !== 'firered-punc' ||
  manifest.platform !== 'darwin' ||
  manifest.architecture !== 'arm64' ||
  manifest.protocolVersion !== 1
)
  throw new Error('runtime manifest mismatch');
console.log('firered-punc runtime layout smoke passed');
