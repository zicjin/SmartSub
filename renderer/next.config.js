/** @type {import('next').NextConfig} */
const path = require('path');
const webpack = require('webpack');

module.exports = {
  agentRules: false,
  trailingSlash: true,
  // Next 16 uses Turbopack for both development and production builds.
  turbopack: {},
  images: {
    unoptimized: true,
  },
  output: 'export',
  distDir: process.env.NODE_ENV === 'production' ? '../app' : '.next',
  webpack: (config) => {
    // 添加 types 目录到 webpack 解析路径
    config.resolve.modules.push(path.resolve('./types'));

    // jassub 2.5.6 发布包缺失 dist/default.woff2（上游打包 bug）。
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^\.\/default\.woff2$/,
        path.resolve(__dirname, 'lib/jassub-default-font.woff2'),
      ),
    );

    // Windows 下禁用 JASSUB Worker 的 desynchronized canvas 选项，避免黑屏。
    config.module.rules.push({
      test: /node_modules[\\/]jassub[\\/]dist[\\/]worker[\\/]worker\.js$/,
      enforce: 'pre',
      loader: path.resolve(__dirname, 'lib/jassub-worker-guard-loader.js'),
      options: { guard: path.resolve(__dirname, 'lib/jassub/workerGuard.ts') },
    });

    config.module.rules.push({
      test: /\.tsx?$/,
      use: [
        {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-typescript'],
          },
        },
      ],
    });

    return config;
  },
};
