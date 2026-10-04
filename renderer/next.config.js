/** @type {import('next').NextConfig} */
const path = require('path');
const webpack = require('webpack');

module.exports = {
  trailingSlash: true,
  // Next 16 defaults to Turbopack and requires an explicit config when a
  // legacy webpack hook is present. Keep the hook for the Electron build's
  // webpack path while allowing Next's default production compiler to run.
  turbopack: {},
  images: {
    unoptimized: true,
  },
  output: 'export',
  distDir: process.env.NODE_ENV === 'production' ? '../app' : '.next',
  webpack: (config, { isServer }) => {
    // 添加 types 目录到 webpack 解析路径
    config.resolve.modules.push(path.resolve('./types'));

    // jassub 2.5.6 发布包缺失 dist/default.woff2（上游打包 bug）。
    // 该文件仅在未提供 defaultFont/availableFonts 时被引用，我们始终显式传入字体，
    // 属死代码——用空占位文件替换以通过构建。
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^\.\/default\.woff2$/,
        path.resolve(__dirname, 'lib/jassub-default-font.woff2'),
      ),
    );

    // Next's SWC loader only covers files inside the renderer directory.
    // Renderer code imports shared TypeScript from main/ and types/, so keep a
    // small Babel rule for those external modules as well.
    config.module.rules.push({
      test: /\.tsx?$/,
      use: {
        loader: require.resolve('babel-loader'),
        options: {
          presets: [
            require.resolve('@babel/preset-typescript'),
            [require.resolve('@babel/preset-react'), { runtime: 'automatic' }],
          ],
        },
      },
    });

    return config;
  },
};
