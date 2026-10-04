/**
 * Compatibility surface for small CommonJS test harnesses that used the
 * removed TypeScript 5 JavaScript transpiler API. The project keeps the
 * TypeScript 7 compiler for type checking and builds; esbuild performs the
 * test-only, syntax-only transpilation these harnesses need.
 */
const { transformSync } = require('esbuild');

const ModuleKind = Object.freeze({
  CommonJS: 1,
  ESNext: 99,
});

const ScriptTarget = Object.freeze({
  ES2019: 6,
  ES2020: 7,
  ES2021: 8,
  ES2022: 9,
  Latest: 99,
});

const JsxEmit = Object.freeze({
  React: 2,
  ReactJSX: 4,
  ReactJSXDev: 5,
});

const targetFor = (target) => {
  if (target <= ScriptTarget.ES2019) return 'es2019';
  if (target === ScriptTarget.ES2020) return 'es2020';
  if (target === ScriptTarget.ES2021) return 'es2021';
  if (target === ScriptTarget.ES2022) return 'es2022';
  return 'esnext';
};

function transpileModule(source, options = {}) {
  const compilerOptions = options.compilerOptions || {};
  const result = transformSync(source, {
    loader: options.fileName?.endsWith('.tsx') ? 'tsx' : 'ts',
    format:
      compilerOptions.module === ModuleKind.CommonJS ? 'cjs' : 'esm',
    target: targetFor(compilerOptions.target),
    platform: 'node',
    sourcemap: false,
  });
  return { outputText: result.code, diagnostics: [] };
}

module.exports = { JsxEmit, ModuleKind, ScriptTarget, transpileModule };
