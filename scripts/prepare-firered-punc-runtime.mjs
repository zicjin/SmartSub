#!/usr/bin/env node
/**
 * Build the self-contained FireRedPunc runtime shipped in a macOS arm64 app.
 *
 * The runtime is intentionally generated in CI instead of committed to the
 * repository. It contains a relocatable PBS CPython, its standard library,
 * binary wheels, and the FireRedPunc Python package. Model weights remain in
 * the user's model directory and are downloaded independently by the app.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'extraResources', 'firered-punc', 'runtime');
const pythonVersion = '3.12.10';
const fireredRevision = '4e7d9aaf4482a47cec1724807026b9b151926eb5';
const platform = process.env.BUILD_PLATFORM || process.platform;
const architecture = process.env.BUILD_ARCH || process.arch;
const checkOnly = process.argv.includes('--check-only');

function runtimePython(dir) {
  return process.platform === 'win32'
    ? path.join(dir, 'python.exe')
    : path.join(dir, 'bin', 'python3');
}

function run(command, args, options = {}) {
  console.log(`+ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function assertLayout(dir) {
  const required = [
    runtimePython(dir),
    path.join(dir, 'main.py'),
    path.join(dir, 'manifest.json'),
    path.join(dir, 'site-packages', 'torch'),
    path.join(dir, 'site-packages', 'transformers'),
    path.join(dir, 'site-packages', 'fireredasr2s'),
  ];
  for (const item of required) {
    if (!fs.existsSync(item))
      throw new Error(`FireRedPunc runtime missing: ${item}`);
  }
  if (
    process.platform !== 'win32' &&
    (fs.statSync(runtimePython(dir)).mode & 0o111) === 0
  ) {
    throw new Error(
      `FireRedPunc interpreter is not executable: ${runtimePython(dir)}`,
    );
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'),
  );
  if (
    manifest.runtimeId !== 'firered-punc' ||
    manifest.platform !== 'darwin' ||
    manifest.architecture !== 'arm64' ||
    manifest.protocolVersion !== 1
  ) {
    throw new Error(
      'FireRedPunc runtime manifest does not match macOS arm64 protocol',
    );
  }
}

if (checkOnly && (platform !== 'darwin' || architecture !== 'arm64')) {
  console.log(
    `Skipping FireRedPunc runtime check for ${platform}/${architecture}; macOS arm64 only.`,
  );
  process.exit(0);
}
if (checkOnly) {
  assertLayout(output);
  console.log(`FireRedPunc runtime is complete: ${output}`);
  process.exit(0);
}

if (platform !== 'darwin' || architecture !== 'arm64') {
  console.log(
    `Skipping FireRedPunc runtime for ${platform}/${architecture}; macOS arm64 only.`,
  );
  process.exit(0);
}

const uv = process.env.UV || 'uv';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'smartsub-firered-punc-'));
const staging = fs.mkdtempSync(path.join(path.dirname(output), '.runtime-'));
const source = path.join(work, 'source');
try {
  run(uv, ['python', 'install', pythonVersion]);
  const python = execFileSync(uv, ['python', 'find', pythonVersion], {
    encoding: 'utf8',
  }).trim();
  const baseDir = path.dirname(path.dirname(fs.realpathSync(python)));
  fs.cpSync(baseDir, staging, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
  });
  for (const rel of [
    'lib/python3.12/test',
    'lib/python3.12/idlelib',
    'lib/python3.12/tkinter',
    'lib/python3.12/ensurepip',
    'lib/python3.12/turtledemo',
    'lib/python3.12/pydoc_data',
    'include',
  ]) {
    fs.rmSync(path.join(staging, rel), { recursive: true, force: true });
  }
  const py = runtimePython(staging);
  const site = path.join(staging, 'site-packages');
  fs.mkdirSync(site, { recursive: true });
  run(uv, [
    'pip',
    'install',
    '--only-binary=:all:',
    '--python',
    py,
    '--target',
    site,
    '-r',
    path.join(root, 'extraResources', 'firered-punc', 'requirements.txt'),
  ]);

  fs.mkdirSync(source, { recursive: true });
  const archive = path.join(work, 'fireredasr2s.tar.gz');
  run('curl', [
    '-L',
    '--fail',
    '--retry',
    '3',
    `https://codeload.github.com/FireRedTeam/FireRedASR2S/tar.gz/${fireredRevision}`,
    '-o',
    archive,
  ]);
  await tar.x({ file: archive, cwd: source, strip: 1 });
  const packageDir = path.join(site, 'fireredasr2s');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.cpSync(
    path.join(source, 'fireredasr2s', 'fireredpunc'),
    path.join(packageDir, 'fireredpunc'),
    { recursive: true },
  );
  // Import only the punctuation package. The upstream top-level package also
  // imports ASR/VAD modules and their audio dependencies, which are not part
  // of this companion runtime.
  fs.writeFileSync(path.join(packageDir, '__init__.py'), '__all__ = []\n');
  fs.cpSync(
    path.join(root, 'extraResources', 'firered-punc', 'runtime', 'main.py'),
    path.join(staging, 'main.py'),
  );
  fs.writeFileSync(
    path.join(staging, 'manifest.json'),
    `${JSON.stringify(
      {
        runtimeId: 'firered-punc',
        runtimeVersion: '1',
        protocolVersion: 1,
        platform: 'darwin',
        architecture: 'arm64',
        pythonVersion,
        fireredRevision,
      },
      null,
      2,
    )}\n`,
  );

  // PBS and native wheels are relocatable but need executable bits after copy.
  fs.chmodSync(py, 0o755);
  const existing = fs.existsSync(output) ? `${output}.previous` : null;
  if (existing) fs.rmSync(existing, { recursive: true, force: true });
  if (fs.existsSync(output)) fs.renameSync(output, existing);
  try {
    fs.renameSync(staging, output);
    assertLayout(output);
    run(
      runtimePython(output),
      [
        '-c',
        'import torch, transformers; from fireredasr2s.fireredpunc.punc import FireRedPunc',
      ],
      {
        env: {
          ...process.env,
          PYTHONHOME: output,
          PYTHONPATH: path.join(output, 'site-packages'),
        },
      },
    );
    if (existing) fs.rmSync(existing, { recursive: true, force: true });
  } catch (error) {
    if (fs.existsSync(output))
      fs.rmSync(output, { recursive: true, force: true });
    if (existing && fs.existsSync(existing)) fs.renameSync(existing, output);
    throw error;
  }
  console.log(`FireRedPunc runtime prepared at ${output}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(staging, { recursive: true, force: true });
}
