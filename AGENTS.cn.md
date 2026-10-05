# SmartSub AGENTS.md

## 行为准则

### 1. 先思考再编码

独立做出常规、可逆的实现选择。仅当假设或权衡会实质影响结果时，才说明它们。

当缺失的信息会实质影响结果、范围或安全性时，提出一个聚焦的问题。继续执行不依赖该答案的已授权工作。

### 2. 简单优先

只实现当前需求。仅当需求支持时，才添加抽象、配置选项或防御性路径。遵循“代码品味”一节中的具体指导。

### 3. 小改动

将改动限制在所请求的工作内。遵循现有风格。删除你的改动所产生的未使用代码。单独处理无关的清理工作。

### 4. 目标驱动的执行

用可验证的结果判断工作何时完成。当依赖或风险会实质影响执行时，给出简要计划。

根据改动风险选择检查项。完成本文件要求的检查。

为有意义的行为编写测试。低影响、可逆的改动默认不需要新测试。不要编写只复述实现的测试。

相关检查通过后，仅当新的改动、失败或未解决的疑虑需要时，才运行更广泛或重复的检查。

### 5. 面向人类的解释

向人类解释概念时，遵循 [ASD-STE100](https://www.asd-ste100.org/) 规则。使用清晰、直接、无歧义的句子，以及经认可且一致的术语；在依赖必要的技术术语之前先定义它们。

## 项目边界

SmartSub 是一个跨平台桌面应用，用于语音转写、翻译、字幕校对、配音和视频合成。将 `package.json` 与构建配置文件作为依赖版本和命令的事实来源。

- `main/`：Electron 主进程、IPC 处理器、服务商调用、文件系统访问和媒体处理。入口文件是 `main/background.ts` 和 `main/preload.ts`。
- `renderer/`：Next.js Pages Router 与 React 界面，使用 Tailwind CSS 和 Radix UI 组件。渲染层采用静态导出；后端操作应实现于主进程。
- `types/`：跨进程共享的类型和策略。
- `automation/` 与 `main/automation/`：CLI/MCP 接口及其 Electron 后端。复用桌面应用已有的业务逻辑。
- `extraResources/`：whisper.cpp、sherpa-onnx 原生集成、工作线程和随应用发布的资源。媒体处理使用 FFmpeg。
- `docs/`：独立的 Docusaurus 文档站点，有自己的 `package.json`。

## 导航

- 关于本地 issue 或规格说明，阅读 `docs/agents/issue-tracker.md`。
- 关于分诊或标签变更，阅读 `docs/agents/triage-labels.md`。
- 关于领域词汇或 ADR，阅读 `docs/agents/domain.md`；对于尚不存在的文档，遵循其中的说明。
- 关于开发和原生运行时设置，阅读 `docs/docs/development.md`。将其中的版本相关示例与当前配置核对。
- 在改变存储行为之前，阅读 `docs/docs/advanced/storage.md` 和 `main/helpers/storagePaths.ts`。
- 在改变 CLI/MCP 之前，阅读 `docs/docs/guides/automation.md` 和 `docs/automation-validation.md`。

## 代码品味

优先删除，而非增加间接层。仅为领域策略、共享类型词汇、必要的语义适配或直接测试的不变式保留接缝（seam）。

- 当现有 Electron、Node.js、React 和服务商 API 符合调用方需要时，直接使用它们。仅在包装层承载必要行为时才添加包装层。
- 单个简单选项使用直接参数。仅当存在一组可选设置或注入的依赖时，才使用选项对象。
- 保留现有用户配置以及 Windows、macOS 和 Linux 工作流。仅当有已证实的需求支持时，才添加兼容处理。
- 缓存键包含会改变缓存结果的输入。当模型、服务商、音色或媒体设置会影响输出时，将其纳入检查。
- 将文件系统访问、凭据、原生引擎和长时间运行的媒体任务放在主进程或其工作线程中。渲染层使用现有 preload/IPC 桥接；保持 `contextIsolation: true` 和 `nodeIntegration: false`。
- 修改 IPC 契约时，同时更新处理器、渲染层调用方和共享类型。组件销毁时释放 IPC 订阅。
- 复用现有 React 组件和样式约定。用户可见文案放在 `renderer/public/locales/zh/` 和 `renderer/public/locales/en/`，并保持 namespace 文件和 key 对应。
- 注释应描述非显而易见的不变式和原因。不要复述显而易见的机制。

## 本地开发与调试

使用与当前依赖兼容的 Node.js；应用 CI 使用 Node.js 22.14.0。按照 README 中的 pnpm 流程进行本地开发。CI 和提交钩子都使用 pnpm；保留 pnpm lockfile，不要进行无关的包管理器切换。

从仓库根目录运行：

```bash
pnpm install
pnpm dev
```

Nextron 会同时启动 Next.js 渲染层和 Electron。默认渲染器端口是 8888。自定义端口使用 `pnpm dev --renderer-port 8893`；运行读取该变量的 E2E 脚本时设置 `SMARTSUB_RENDERER_PORT=8893`。

安装和 predev 钩子会准备原生依赖及 JASSUB 资源。如果原生依赖下载失败，使用 `pnpm native:fetch`。使用 `pnpm build` 构建生产 bundle，使用 `pnpm build:local` 构建本地安装包。根据受影响的构建路径检查 `nextron.config.js`、`renderer/next.config.js` 和 `electron-builder.yml`。

对于 UI 改动，使用连接到 Electron 的 agent-browser 验证受影响的公开工作流。普通浏览器无法验证 preload/IPC 集成。可使用现有的 Playwright Electron 脚本执行可重复的 E2E 检查。

## 本地持久化

- 设置使用 `main/helpers/store/` 中的 `electron-store`。其他配置、草稿、会话和产物由所属模块使用本地文件管理。
- 通过现有存储辅助模块解析路径。区分 Electron 的 `userData` 目录，以及可配置的模型、运行时和临时目录。
- 测试使用一次性 profile 和临时媒体。开发 profile 与打包 profile 分离；修改数据前确认实际生效的路径。
- 修改持久化格式前备份受影响的用户数据。在适用时复用现有的配置迁移和原子文件写入机制，并验证现有数据仍可加载。
- 通过应用现有的本地配置流程保存 API key 和 token。不要将凭据写入日志、fixture、提交文件或诊断输出。

## 测试

### 必要检查

从 `package.json` 选择相关脚本；项目没有统一的根级 `test` 命令。

- 修改 TypeScript 后运行 `pnpm typecheck`，它会检查 renderer、main 和 automation。
- 修改 UI 文案或本地化内容后运行 `pnpm check:i18n`。
- 修改行为后运行受影响的 `test:*` 脚本。Jest/React Testing Library 覆盖使用 `pnpm test:renderer`；Node.js、tsx 和媒体策略测试使用对应模块脚本。
- 修改构建配置、原生资源打包或 CLI/MCP bundle 后运行 `pnpm build` 和相关集成检查。修改 automation 时加入 `pnpm test:automation:regressions`；完整 automation 和桌面测试需要 Electron 构建产物。
- 仅修改文档时，检查格式以及引用的路径和命令。仅当改动影响站点时构建 Docusaurus 站点。

### 测试策略

- 通过公开工作流，用 E2E 测试和黑盒测试验证行为。对稳定输出使用可重复的比对方式。
- 修复行为时，在修改生产代码前先添加失败的回归测试。当 E2E 无法充分验证时，为策略、IPC 契约、持久化和错误处理使用单元测试或集成测试。
- 删除行为时，一并删除覆盖它的测试。
- E2E 脚本位于 `scripts/e2e/`，使用 Playwright 的 Electron API。运行前阅读脚本设置：开发测试通常需要正在运行的渲染器；支持 `--production` 的脚本需要先运行 `pnpm build`。使用隔离的 `--user-data-dir`，并产出可重复的报告、截图或输出文件。
- 通过稳定的技术 ID 或 role 定位元素。让选择器和断言独立于用户可见文案，避免本地化或文案修改破坏工作流测试。
- 通过公开 UI 驱动工作流。使用 IPC 注入 fixture 和模拟失败，并验证用户可见行为或保存的输出。
- 运行前阅读冒烟和 E2E 脚本：部分脚本需要已下载的模型、真实媒体、网络访问或付费服务商。日常回归优先使用本地 fixture。报告已运行的实时检查以及仍未验证的部分。

## git 提交之前

保持每个提交小且逻辑自洽。将规格说明级别的工作拆分为可独立理解的多个提交。

用新提交进行修正。永远不要使用 `git commit --amend`。这样能让本地历史与可能已存在于远端的提交保持一致。

每次提交前对改动的支持文件运行 Prettier，然后完成上述相关检查：

```bash
pnpm exec prettier --write <files>
git diff --check
```

Husky 提交钩子会调用 `pnpm lint-staged`；`package.json` 为暂存文件配置了 Prettier。使用现有的 `prettier.config.cjs` 设置。只格式化与任务相关的文件。
