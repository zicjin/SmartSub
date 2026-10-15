const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = async function checkFireRedPuncBeforePack(context) {
  if (
    context.electronPlatformName !== 'darwin' ||
    (context.arch !== 3 && context.arch !== 'arm64')
  )
    return;
  execFileSync(
    process.execPath,
    [path.join(__dirname, 'prepare-firered-punc-runtime.mjs'), '--check-only'],
    {
      stdio: 'inherit',
      env: { ...process.env, BUILD_PLATFORM: 'darwin', BUILD_ARCH: 'arm64' },
    },
  );
};
