import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jassubRoot = path.join(root, 'node_modules', 'jassub', 'dist');
const outputRoot = path.join(root, 'renderer', 'public', 'jassub');

await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.join(outputRoot, 'wasm'), { recursive: true });

const bundleOptions = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  sourcemap: false,
  minify: false,
  logLevel: 'silent',
};

await esbuild.build({
  ...bundleOptions,
  entryPoints: [path.join(jassubRoot, 'jassub.js')],
  outfile: path.join(outputRoot, 'jassub.js'),
});

await esbuild.build({
  ...bundleOptions,
  entryPoints: [path.join(jassubRoot, 'worker', 'worker.js')],
  outfile: path.join(outputRoot, 'worker.js'),
});

for (const file of ['jassub-worker.wasm', 'jassub-worker-modern.wasm']) {
  await cp(
    path.join(jassubRoot, 'wasm', file),
    path.join(outputRoot, 'wasm', file),
  );
}

console.log('Prepared JASSUB browser assets');
