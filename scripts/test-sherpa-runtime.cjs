'use strict';

/**
 * Static release gate for the bundled sherpa runtime.
 *
 * Native model decoding is exercised by the platform smoke job; this test
 * catches version drift between the TS status surface, native fetcher, and
 * checked-in JavaScript binding before that job runs.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const paths = {
  runtime: path.join(root, 'main/helpers/sherpaOnnx/sherpaLibPaths.ts'),
  fetcher: path.join(root, 'scripts/fetch-sherpa-native.mjs'),
  readme: path.join(root, 'extraResources/sherpa/README.md'),
  binding: path.join(root, 'extraResources/sherpa/vendor/sherpa-onnx.js'),
  resampler: path.join(root, 'extraResources/sherpa/vendor/resampler.js'),
};
const read = (file) => fs.readFileSync(file, 'utf8');

const runtime = read(paths.runtime);
const fetcher = read(paths.fetcher);
const readme = read(paths.readme);
assert.match(runtime, /SHERPA_VERSION\s*=\s*'1\.13\.8'/);
assert.match(fetcher, /const SHERPA_VERSION = '1\.13\.8'/);
assert.match(fetcher, /2d8286d|adaptive allocation/);
assert.match(fetcher, /f7982bd|fixed-cache/);
assert.match(readme, /sherpa-onnx-node@1\.13\.8/);
assert.match(readme, /SHA-512 integrity/);

for (const platform of [
  'darwin-arm64',
  'darwin-x64',
  'linux-x64',
  'linux-arm64',
  'win-x64',
  'win-ia32',
]) {
  assert.match(fetcher, new RegExp(`'${platform}': '[A-Za-z0-9+/=]{86,88}'`));
}
assert.match(fetcher, /function packageName\(platformKey\)/);

assert.match(read(paths.binding), /LinearResampler/);
assert.ok(
  fs.existsSync(paths.resampler),
  'v1.13.8 resampler binding is present',
);

console.log(
  'sherpa runtime release gate: 1.13.8 + six CPU package integrity pins passed',
);
