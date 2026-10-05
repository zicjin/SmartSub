# SmartSub AGENTS.md

## Behavioral guidelines

### 1. Think Before Coding

Make routine, reversible implementation choices independently. State assumptions or tradeoffs only when they materially affect the result.

Ask a focused question when missing information materially affects the result, scope, or safety. Continue authorized work that does not depend on the answer.

### 2. Simplicity First

Implement current requirements only. Add an abstraction, configuration option, or defensive path only when a requirement supports it. Follow the specific guidance under Code taste.

### 3. Small Changes

Limit changes to the requested work. Follow the existing style. Remove unused code that your changes create. Handle unrelated cleanup separately.

### 4. Goal-Driven Execution

Use outcomes that you can verify to decide when work is complete. Give a brief plan when dependencies or risks materially affect execution.

Select checks based on the change risk. Complete the required checks in this file.

Write tests for meaningful behavior. Low-impact, reversible changes do not require new tests by default. Do not write tests that only repeat the implementation.

After relevant checks pass, run broader or repeated checks only when new changes, failures, or unresolved concerns require them.

### 5. Human Explanations

When explaining a concept to a human, follow the [ASD-STE100](https://www.asd-ste100.org/) rules. Use clear, direct, unambiguous sentences and approved, consistent terminology; define necessary technical terms before relying on them.

## Project boundaries

SmartSub is a released, cross-platform desktop application for transcription, translation, subtitle proofreading, dubbing, and video composition. Use `package.json` and build configuration files as the source of truth for dependency versions and commands.

- `main/`: Electron main process, IPC handlers, provider calls, filesystem access, and media processing. Entry points are `main/background.ts` and `main/preload.ts`.
- `renderer/`: Next.js Pages Router and React UI, with Tailwind CSS and Radix UI components. The renderer is statically exported; implement backend operations in the main process.
- `types/`: shared types and policies used across process boundaries.
- `automation/` and `main/automation/`: CLI/MCP interfaces and their Electron backend. Reuse the desktop application's business logic.
- `extraResources/`: native whisper.cpp and sherpa-onnx integration, workers, and bundled resources. FFmpeg handles media processing.
- `docs/`: a separate Docusaurus documentation site with its own `package.json`.

## Wayfinding

- For local issues or specifications, read `docs/agents/issue-tracker.md`.
- For triage or label changes, read `docs/agents/triage-labels.md`.
- For domain vocabulary or ADRs, read `docs/agents/domain.md`; follow its instructions for documents that are not yet present.
- For development and native runtime setup, read `docs/docs/development.md`. Check its version-specific examples against the current configuration.
- Before changing storage behavior, read `docs/docs/advanced/storage.md` and `main/helpers/storagePaths.ts`.
- For CLI/MCP changes, read `docs/docs/guides/automation.md` and `docs/automation-validation.md`.

## Code taste

Prefer deletion to indirection. Keep a seam only for domain policy, shared type vocabulary, required semantic adaptation, or a directly tested invariant.

- Use existing Electron, Node.js, React, and provider APIs directly when they match the caller. Add wrappers only when they carry required behavior.
- Use a direct argument for one simple option. Use an options object only for a group of optional settings or injected dependencies.
- Preserve existing user configurations and supported Windows, macOS, and Linux workflows. Add compatibility handling only for a demonstrated requirement.
- Include in cache keys the inputs that change the cached result. Check model, provider, voice, and media settings when they affect the output.
- Keep filesystem access, credentials, native engines, and long-running media work in the main process or its workers. Use the existing preload/IPC bridge from the renderer; keep `contextIsolation: true` and `nodeIntegration: false`.
- When changing an IPC contract, update its handler, renderer callers, and shared types together. Release IPC subscriptions when their owner is disposed.
- Reuse existing React components and styling conventions. Put user-facing copy in `renderer/public/locales/zh/` and `renderer/public/locales/en/`, with matching namespace files and keys.
- Write comments about non-obvious invariants and reasons. Do not repeat obvious mechanics.

## Local development and debugging

Use Node.js compatible with the current dependencies; the application CI uses Node.js 22.14.0. Follow the README's pnpm workflow for local development. CI and the pre-commit hook use pnpm; preserve the pnpm lockfile and avoid unrelated package-manager changes.

Run from the repository root:

```bash
pnpm install
pnpm dev
```

Nextron starts the Next.js renderer and Electron together. Its default renderer port is 8888. For a custom port, use `pnpm dev --renderer-port 8893`; set `SMARTSUB_RENDERER_PORT=8893` when running E2E scripts that read this variable.

The install and predev hooks prepare native dependencies and JASSUB assets. If native downloads fail, use `pnpm native:fetch`. Use `pnpm build` for production bundles and `pnpm build:local` when installer packaging is required. Check `nextron.config.js`, `renderer/next.config.js`, and `electron-builder.yml` for the affected build path.

For UI changes, use agent-browser attached to Electron to verify the affected public workflows. A standalone browser cannot verify the preload/IPC integration. Use the existing Playwright Electron scripts for repeatable E2E checks.

## Local persistence

- Settings use `electron-store` in `main/helpers/store/`. Additional configurations, drafts, sessions, and artifacts use local files managed by their owning modules.
- Resolve paths through the existing storage helpers. Distinguish Electron's `userData` directory from the configurable model/runtime and temporary directories.
- Use disposable profiles and temporary media for tests. Development and packaged profiles are separate; verify the effective path before changing data.
- Back up affected user data before changing a persisted format. Reuse the existing configuration migration and atomic file-write mechanisms where applicable; verify that existing data can still be loaded.
- Keep API keys and tokens in the application's existing local configuration flow. Exclude credentials from logs, fixtures, committed files, and diagnostic output.

## Testing

### Required checks

Choose the relevant scripts from `package.json`; there is no single root `test` command.

- For TypeScript changes, run `pnpm typecheck`, which checks renderer, main, and automation.
- For UI copy or localization changes, run `pnpm check:i18n`.
- For behavior changes, run the affected `test:*` scripts. Use `pnpm test:renderer` for Jest/React Testing Library coverage, and the module scripts for Node.js, tsx, and media policy tests.
- For build configuration, native resource packaging, or CLI/MCP bundle changes, run `pnpm build` and the relevant integration checks. For automation changes, include `pnpm test:automation:regressions`; the full automation and desktop tests require Electron build artifacts.
- For documentation-only changes, check formatting and referenced paths and commands. Build the Docusaurus site only when a change affects the site.

### Test strategy

- Verify behavior through public workflows with E2E and black-box tests. Use stable output comparisons where practical.
- For behavior fixes, add a failing regression test before the production change. Use unit or integration tests for policy, IPC contracts, persistence, and failure handling when E2E cannot adequately verify them.
- Delete tests together with the behavior that they cover.
- E2E scripts are under `scripts/e2e/` and use Playwright's Electron API. Inspect each script's setup: development tests generally require the running renderer; scripts supporting `--production` require `pnpm build` first. Use an isolated `--user-data-dir` and produce a repeatable report, screenshot, or output artifact.
- Locate elements by stable technical IDs or roles. Keep selectors and assertions independent of user-facing copy so localization and copy edits do not break workflow tests.
- Drive the workflow through the public UI. Use IPC injection for fixtures and failure simulation, and verify the resulting user-visible behavior or saved output.
- Read smoke and E2E scripts before running them: some need downloaded models, real media, network access, or paid providers. Use local fixtures for routine regression checks. Report which live checks were run and which remain unverified.

## Before git commit

Keep each commit small and logically self-contained. Split spec-sized work into independently understandable commits.

Create a new commit for corrections. Never use `git commit --amend`. This keeps local history aligned with commits that can already exist on the remote.

Run Prettier on the changed supported files before each commit, then complete the relevant checks above:

```bash
pnpm exec prettier --write <files>
git diff --check
```

The Husky pre-commit hook invokes `pnpm lint-staged`; `package.json` configures Prettier for staged files. Use the existing `prettier.config.cjs` settings. Format only the files relevant to the task.
