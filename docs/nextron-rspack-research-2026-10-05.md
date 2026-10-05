# Nextron / Rspack 可行性研究

日期：2026-10-05。研究问题：SmartSub（`next@16.3.8`、`nextron@10.3.0`）能否用 Rspack 替代 Webpack。结论中的“已证实”来自项目源码或上游一手资料；“推断”明确标出。本文同时记录了 Renderer 切换到 Turbopack 后的实际构建结果；Rspack 依赖仍未接入。

## 结论

Rspack **可以作为 Next.js renderer 的实验性替代编译器**，但目前不能通过 Nextron 的配置回调把 Electron 主进程和 preload 的 Webpack 换掉。可行的试验边界是：继续让 Nextron 用 Webpack 编译 `main/background.ts` 和 `main/preload.ts`，单独让 Next renderer 使用 `next-rspack`。这不是一次全局的 Webpack 替换。

随后实际实施了 Renderer 的 Turbopack 路径：移除了 Renderer 的 Webpack callback、外部 Babel loader 和 JASSUB 字体替换插件，并去掉了 `scripts/next` 对 `next build` 的 `--webpack` 强制参数。JASSUB 的原始 worker/WASM 依赖图会让 Turbopack production compilation 静默卡住，因此将 JASSUB 主模块和 worker 用 esbuild 预打包为 `renderer/public/jassub/` 运行时资产，由 renderer 通过 URL 加载，并显式传入 worker/WASM URL。开发态 `/zh/home/`、`/zh/subtitleMerge/` 和完整 production build 均已验证通过；完整导出包含 42 个静态页面。

对于 SmartSub，风险主要集中在 renderer：当前配置使用 `webpack` 回调，添加 `NormalModuleReplacementPlugin`、`babel-loader` 规则和 `types` 搜索路径；JASSUB 还依赖由静态 `new Worker(new URL(...))` 识别的 worker 与 WASM 资源。Rspack 文档覆盖了这些底层能力，但 `next-rspack` 仍标为 experimental，社区反馈中仍有 dev 崩溃、Windows/pnpm 解析和插件兼容性问题。因此建议先做可回滚的 renderer-only 构建 PoC，再决定是否采用。

## 上游支持现状（截至 2026-10-05）

### Next.js 的 `next-rspack`

- Next.js 仓库包含 `packages/next-rspack`。Next 16.3.8 的 package metadata 显示 `next-rspack` 版本为 `16.3.8`，依赖 `@next/rspack-core@1.0.3`；npm 当前查询到的 `next-rspack` 也是 `16.3.8`。来源：[Next 16.3.8 package.json](https://raw.githubusercontent.com/vercel/next.js/v16.3.8/packages/next-rspack/package.json)、[`npm view next-rspack`](https://www.npmjs.com/package/next-rspack)。**已证实**。
- 官方包 README 仍写着“EXPERIMENTAL”“not an official Next.js plugin”，说明它由 Rspack 团队与 Next.js 合作支持，并要求反馈到 [vercel/next.js#77800](https://github.com/vercel/next.js/discussions/77800)。用法是 `withRspack(nextConfig)`。来源：[README](https://raw.githubusercontent.com/vercel/next.js/v16.3.8/packages/next-rspack/README.md)。**已证实**。
- `withRspack` 并不是一个普通的 config transformer：源码检查环境变量，要求 Next 以 `TURBOPACK=auto` 的路径启动；如果发现 `--webpack` 或 `--turbopack` 对应的环境状态，则打印错误并 `process.exit(1)`。来源：[index.js](https://raw.githubusercontent.com/vercel/next.js/v16.3.8/packages/next-rspack/index.js)。**已证实**。
- Rspack 集成文档要求 Next.js 至少 `15.3.0`，并说 Next 的 `webpack(config, context)` 回调可以继续修改 Rspack 配置。来源：[Rspack Next.js integration](https://github.com/web-infra-dev/rspack/blob/main/website/docs/en/guide/integrations/next.mdx)。**已证实**。文档把插件称为 community-driven / experimental；它不构成 Next 官方稳定 API 的承诺。

### Next 反馈线程中的限制

[Next.js discussion #77800](https://github.com/vercel/next.js/discussions/77800) 是上游指定的反馈线程，更新时间为 2026-09-18。它是用户报告，不等同于兼容性承诺，但能证明风险仍存在：

- 线程早期报告过 `entrypoint.getEntrypointChunk is not a function`、Sentry/plugin stats 错误、HMR 断连、`output: export` 的 Browserslist 失败，以及 monorepo `transpilePackages` / 缓存问题。
- 当前仍有 Next 16.3.x 的开放问题：[#98213](https://github.com/vercel/next.js/issues/98213) 报告 `next dev` 在错误覆盖层或 browser-log source-map 请求与重编译同时发生时，Rspack `steal_cell.rs` panic；Rspack 侧修复已合并 [web-infra-dev/rspack#15454](https://github.com/web-infra-dev/rspack/pull/15454)，但 Next host-side issue 在研究日期仍为 open。**已证实；不能把修复 PR 等同于 SmartSub 已安全。**
- [#98505](https://github.com/vercel/next.js/issues/98505) 报告 Windows + pnpm + Pages Router 的 `transpilePackages` 直接依赖在 dev 被错误 externalize，production build 正常；截至研究日期为 open。SmartSub 当前不是该 monorepo 形态，但它说明 dev/prod 不能只验证一个。
- 早先的 middleware/proxy persistent-cache 回归 [#96377](https://github.com/vercel/next.js/issues/96377) 已由维护者说明在 `next@16.3.2` / `16.3.0-canary.52` 修复；SmartSub 的 16.3.8 已高于该版本。**已证实版本关系；不代表其他限制消失。**

## Nextron 的边界

Nextron 当前直接调用 Webpack API 编译 Electron 入口：

- 开发路径 [`lib/nextron-dev.ts`](https://github.com/saltyshiomix/nextron/blob/da6229f750f8c29a23fca7a845abb949b7a90225/lib/nextron-dev.ts) 直接 import webpack，并对 main/preload config 调用 `webpack(...).watch()`。
- 生产路径 [`lib/webpack/production/webpack.config.ts`](https://github.com/saltyshiomix/nextron/blob/da6229f750f8c29a23fca7a845abb949b7a90225/lib/webpack/production/webpack.config.ts) 直接调用 `webpack().run()`；[`lib/nextron-build.ts`](https://github.com/saltyshiomix/nextron/blob/da6229f750f8c29a23fca7a845abb949b7a90225/lib/nextron-build.ts) 还负责运行 Next build。
- Nextron 的 [`types.d.ts`](https://github.com/saltyshiomix/nextron/blob/da6229f750f8c29a23fca7a845abb949b7a90225/types.d.ts) 暴露的是 `webpack(config) => config` 这类配置回调，没有 compiler 注入或 compiler 选择选项；回调也不等于替换 Nextron 内部的 `webpack()` 调用。

因此，**已证实** Nextron 没有把 Electron compiler 切换为 Rspack 的公开开关。若要替换 main/preload，需要 Nextron 上游改造或维护独立的 Rspack 编译脚本，并保持其 Electron target、externals、tsconfig paths、watch/rebuild 和输出约定；这属于另一项工程，不是给 `nextron.config.js` 加一个回调。Nextron 社区/仓库的 bounded 搜索（截至 2026-10-05）未发现 `rspack`、`rsbuild` 或相关 issue/PR；这只能表示检索范围内没有记录，不能证明社区永远没有讨论。

Nextron PR [#531](https://github.com/saltyshiomix/nextron/pull/531) 已合并 Next 16 / React 19 支持，并移除 renderer 的无效 Webpack hooks、采用 Next 默认 Turbopack；它没有改变 main/preload 仍由 Nextron Webpack 编译的事实。这进一步支持“renderer 与 Electron compiler 分开选择”的架构判断。

## SmartSub 的具体适配点

当前仓库的 [`renderer/next.config.js`](../renderer/next.config.js) 原先做了三件 Rspack PoC 必须验证的事；Turbopack 实施已移除这些仅服务于旧 Webpack 路径的改动：

1. `config.resolve.modules.push(types)`：Rspack 的 config 文档支持同名 resolve 配置，但必须在实际 Next-Rspack 编译中确认 Next 生成的 resolve 结构仍可变更。
2. `new webpack.NormalModuleReplacementPlugin(...)`：Rspack 有对应的 `NormalModuleReplacementPlugin`，其文档明确说明可替换匹配资源；应把构造器来源改成 Rspack 提供的 `webpack`/`rspack` 对象，不能无条件 `require('webpack')`。来源：[Rspack plugin docs](https://github.com/web-infra-dev/rspack/blob/main/website/docs/en/plugins/normal-module-replacement-plugin.mdx)。**能力已证实，Next 集成中的具体对象兼容仍需 PoC。**
3. `babel-loader` 规则：Rspack 以 webpack 5 API 为迁移目标，且允许继续使用兼容 loader；但 Rspack 的迁移文档提醒部分 loader/plugin 需要替换或验证。来源：[Rspack migration guide](https://github.com/web-infra-dev/rspack/blob/main/website/docs/en/guide/migration/webpack.mdx)。**不要把“webpack-compatible”当成该规则在 Next 16 中已验证。** Turbopack 实际验证表明，Renderer 的 TS/TSX 可由 Next 原生编译，不再需要这条规则。

JASSUB 2.5.16 的入口使用静态 `new Worker(new URL('./worker/worker.js', import.meta.url), ...)`，并以 `new URL('./wasm/...wasm', import.meta.url)` 定位 WASM。源码证据：[node_modules/jassub/dist/jassub.js](../node_modules/jassub/dist/jassub.js)。Rspack 文档声明 Web Worker 内建支持，要求 URL 对象静态可分析，并列出变量 URL 等限制；Rspack target 文档也列出 `webworker` 和 WebAssembly loading defaults。来源：[Web Workers](https://github.com/web-infra-dev/rspack/blob/main/website/docs/en/guide/features/web-workers.mdx)、[target](https://github.com/web-infra-dev/rspack/blob/main/website/docs/en/config/target.mdx)。**推断**：JASSUB 的当前静态写法符合 Rspack worker 识别规则，但 Next 的 asset/public URL、`output: 'export'` 和 SmartSub 生产环境的 Electron `app://` 自定义协议加载仍须实际构建并运行 renderer 才能确认；不能只凭文档判定 WASM/worker 运行时无问题。实际生产页面 URL 来自 [`main/background.ts`](../main/background.ts) 的 `app://./${userLanguage}/home/`，由 `electron-serve` 提供静态资源。

## 建议的验证顺序

1. 只给 renderer 安装并启用与 `next@16.3.8` 对应的 `next-rspack@16.3.8`，保留 Nextron 的 main/preload Webpack。
2. 先处理 SmartSub 的 `scripts/next`：它当前把 `next build` 强制改为 `next build --webpack`（见 [`scripts/next`](../scripts/next)）。这与 `withRspack` 的环境检查互斥；PoC 应提供一个明确的 Rspack 分支/环境变量，让 Next 走 `withRspack` 需要的启动路径，不能同时传 `--webpack`。
3. 逐项恢复 `types` resolve、字体 NormalModuleReplacement、Babel loader 和 `output: 'export'`；记录 client/server 两个 compilation 的 warnings/errors。
4. 检查构建产物中 JASSUB worker、两个 WASM 和字体资源的 URL，并在 Electron 生产环境 `app://` 自定义协议下实际打开字幕预览；再做 dev HMR、production build、Windows/pnpm（若发布环境包含）验证。
5. 若 renderer PoC 通过，再评估是否值得为 main/preload 另写 Rspack 编译器。除非 Nextron 提供 compiler injection，上游替换会增加维护面，不能仅以“Rspack 更快”推断收益；本研究没有做性能测量。

## 判断表

| 目标                                                    | 结论                 | 证据边界                                                                                                           |
| ------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Next renderer 用 Rspack                                 | **可试，实验性**     | `next-rspack@16.3.8` 一手 README、Rspack Next 文档；兼容性仍需 SmartSub PoC                                        |
| Nextron main/preload 通过 `nextron.config.js` 换 Rspack | **当前不可行**       | Nextron 源码直接调用 Webpack，公开类型无 compiler 注入                                                             |
| 整个项目删除 `webpack` 依赖                             | **不建议作为第一步** | Nextron 主/preload 仍 import webpack；Rspack 迁移文档也建议先保留兼容依赖并逐项替换                                |
| JASSUB worker/WASM 在 Rspack 必然可用                   | **未证实**           | JASSUB 写法符合 Rspack 静态 worker 规则；本项目已通过 Turbopack 的运行时资产方案验证，但这不等于 Rspack 集成已验证 |

## 补充：Renderer 选 Turbopack 还是 Rspack

**针对当前 SmartSub，建议先试 Turbopack：预计接入和后续维护成本都更低。** 这是依据当前依赖、配置和上游能力的工程判断，尚未经过项目构建验证。Rspack 的优势是更贴近现有 Webpack 配置；若清理过时配置后仍存在必要的 Webpack 插件，再优先考虑它。

| 比较项               | Turbopack                                                 | Rspack / `next-rspack`                            |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Next 16 集成         | 已内置，是 dev/build 默认编译器                           | 额外安装并包装配置，仍 experimental               |
| 当前 TS/TSX          | SWC 原生支持，先配置仓库级 root 和必要 tsconfig aliases   | 可保留 Webpack loader 结构，仍需兼容验证          |
| Webpack 插件         | 不支持，需要删除过时插件或改用原生配置                    | 接近 Webpack API，已有必要插件时更易迁移          |
| 版本维护             | 随 Next 维护                                              | 增加 `next-rspack` 和对应 Rspack binding 版本维护 |
| JASSUB worker / WASM | 上游已有 Worker 与 URL asset 支持；仍须 Electron 运行验证 | 同样支持对应底层语法；仍须 Electron 运行验证      |
| 初步结论             | 当前项目优先验证，成本预计更低                            | 保留为必要 Webpack 插件难以改造时的备选           |

几个影响成本判断的证据：

- Next 16.3.8 的 [Turbopack 文档](https://github.com/vercel/next.js/blob/v16.3.8/docs/01-app/03-api-reference/08-turbopack.mdx) 明确说明 dev/build 默认 Turbopack，支持 SWC TypeScript/TSX、tsconfig `paths` / `baseUrl`，同时明确不识别 `webpack()` 配置、也不支持 Webpack 插件。
- 项目 `next.config.js` 说“Next SWC 只处理 renderer”是当前 Webpack 路径的 workaround，不能据此认定 Turbopack 也必须加 Babel loader。上游 [typescript-external-dir 测试](https://github.com/vercel/next.js/blob/v16.3.8/test/development/typescript-external-dir/typescript-external-dir.test.ts) 明确在 Turbopack 下加载项目外兄弟目录的 TS/TSX；[root 配置文档](https://github.com/vercel/next.js/blob/v16.3.8/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.mdx) 说明 root 内文件可解析，root 默认从 lockfile 推断，也可手动指定为仓库根目录。**推断**：SmartSub 的 `main/`、`types/` 共享 TS 很可能可用原生 SWC 处理；需实际构建确认，而非迁移前机械照搬 Babel 规则。
- 字体替换插件针对旧版 `jassub@2.5.6` 的缺包问题。研究时实际安装的 `jassub@2.5.16` 中 `dist/default.woff2` 存在且为 145,972 字节；下载 [npm 原始 2.5.16 tarball](https://registry.npmjs.org/jassub/-/jassub-2.5.16.tgz) 的文件列表也包含 `package/dist/default.woff2`。因此该插件已删除，旧的空字体占位文件也已移除；完整 Turbopack production build 已通过。
- Turbopack 已有 [`new Worker` 示例](https://github.com/vercel/next.js/blob/v16.3.8/examples/with-web-worker/app/page.tsx) 和 [worker module URL 测试](https://github.com/vercel/next.js/blob/v16.3.8/test/e2e/app-dir/worker-module-url/worker-module-url.test.ts)；URL asset [源码](https://github.com/vercel/next.js/blob/v16.3.8/turbopack/crates/turbopack-ecmascript/src/references/esm/url.rs) 明确处理静态 `new URL("path", import.meta.url)`。因此不能笼统说 Turbopack 不支持 JASSUB 使用的 worker / WASM URL 语法。但 Electron `app://` 协议、静态导出、资源基路径和字幕预览仍是两种编译器都需要验证的项目特定风险。

下一步成本最低的验证是：继续在 Electron 的 packaged `app://` 环境打开 subtitleMerge 并实际创建 JASSUB 实例，覆盖 worker、WASM 和字体加载；若后续仍需要替换 Nextron main/preload 的 Webpack，再单独做 Rspack PoC。Nextron main/preload 的 Webpack 不影响当前 Renderer Turbopack 选择。
