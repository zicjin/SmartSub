const webpack = require('webpack');
const path = require('path');

module.exports = {
  // Webpack 自定义见 nextron 文档；DEV_SIMULATE_* 必须在运行时读取，勿用 EnvironmentPlugin 注入
  //
  // https-proxy-agent / http-proxy-agent 自 v6+ 为纯 ESM，而主进程产物 background.js
  // 是 CommonJS（Electron 用 require 加载）。nextron 默认把 package.json 里所有依赖
  // 都 externals 化（运行时 require），会触发 ERR_REQUIRE_ESM。
  // 这里把这两个 ESM 包从 externals 移除，交给 webpack 打包进 bundle（其传递依赖
  // agent-base / proxy-agent-negotiate 未在 dependencies 中，默认即被打包）。
  webpack: (config) => {
    // Nextron 10 renamed its default entry from background.ts to main.ts.
    // SmartSub's package entry and runtime both use background.js, so retain
    // the existing entry explicitly when building the main process.
    config.entry = {
      background: path.resolve(__dirname, 'main/background.ts'),
    };
    const BUNDLE_IN = new Set([
      'https-proxy-agent',
      'http-proxy-agent',
      'electron-serve',
      'electron-store',
    ]);
    if (Array.isArray(config.externals)) {
      config.externals = config.externals.filter(
        (ext) => !(typeof ext === 'string' && BUNDLE_IN.has(ext)),
      );
    }
    // proxy-agent-negotiate 仅在 Kerberos/Negotiate 代理鉴权时才 `await import('kerberos')`
    // （我们从不启用），kerberos 是可选原生模块。忽略它以消除无意义的打包告警。
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^kerberos$/ }),
    );
    // Nextron's default ts-loader rule is restricted to main/. The main
    // process imports shared TypeScript from automation/ and types/, which
    // must be transpiled as part of the Electron bundle too. Babel avoids
    // ts-loader's TypeScript 7 compiler API incompatibility.
    config.module.rules.push({
      test: /\.[jt]sx?$/,
      include: [
        path.resolve(__dirname, 'automation'),
        path.resolve(__dirname, 'types'),
      ],
      use: {
        loader: require.resolve('babel-loader'),
        options: {
          presets: [require.resolve('@babel/preset-typescript')],
        },
      },
    });
    return config;
  },
};
