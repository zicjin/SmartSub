import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
const pathValue = process.env[pathKey] || process.env.PATH || '';

// Nextron invokes `next build` internally and does not expose a way to pass
// Next's compiler flags. Next 16 defaults to Turbopack, while this Pages Router
// build relies on webpack loaders for shared main-process TypeScript. Put a
// tiny wrapper first on PATH so Nextron keeps handling the Electron build but
// always selects webpack for the renderer.
const child = spawn(
  process.execPath,
  [path.join(root, 'node_modules/nextron/bin/nextron.cjs'), 'build', '--no-pack'],
  {
    cwd: root,
    env: {
      ...process.env,
      [pathKey]: `${path.join(root, 'scripts')}${path.delimiter}${pathValue}`,
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
