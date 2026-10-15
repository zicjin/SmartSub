import fs from 'fs';
import path from 'path';
import { getFireRedModelsRoot } from '../fireRedModelCatalog';

/** FireRedPunc 只支持随 FireRedASR 资源组安装的官方模型。 */
export const FIRERED_PUNC_MODEL_ID = 'firered-punc' as const;
export const FIRERED_PUNC_RUNTIME_ID = 'firered-punc' as const;
export const FIRERED_PUNC_MODEL_REVISION = 'main';

export const FIRERED_PUNC_REQUIRED_FILES = [
  'model.pth.tar',
  'chinese-bert-wwm-ext_vocab.txt',
  'out_dict',
  'chinese-lert-base/config.json',
  'chinese-lert-base/pytorch_model.bin',
  'chinese-lert-base/added_tokens.json',
  'chinese-lert-base/special_tokens_map.json',
  'chinese-lert-base/tokenizer.json',
  'chinese-lert-base/tokenizer_config.json',
  'chinese-lert-base/vocab.txt',
] as const;

export type FireRedPuncStatusReason =
  'ready' | 'unsupported-platform' | 'runtime-missing' | 'model-missing';

export function isFireRedPuncPlatformSupported(): boolean {
  return process.platform === 'darwin' && process.arch === 'arm64';
}

export function getFireRedPuncModelDir(): string {
  const dir = path.join(getFireRedModelsRoot(), FIRERED_PUNC_MODEL_ID);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function validateFireRedPuncModelLayout(
  dir = getFireRedPuncModelDir(),
): { ok: boolean; missing: string[] } {
  const missing = FIRERED_PUNC_REQUIRED_FILES.filter((file) => {
    try {
      const stat = fs.statSync(path.join(dir, file));
      return !stat.isFile() || stat.size <= 0;
    } catch {
      return true;
    }
  });
  return { ok: missing.length === 0, missing: [...missing] };
}

export function isFireRedPuncModelInstalled(): boolean {
  return validateFireRedPuncModelLayout().ok;
}

export function getFireRedPuncReadiness(runtimeInstalled: boolean): {
  ready: boolean;
  reason: FireRedPuncStatusReason;
  missing: string[];
} {
  if (!isFireRedPuncPlatformSupported()) {
    return { ready: false, reason: 'unsupported-platform', missing: [] };
  }
  if (!runtimeInstalled) {
    return { ready: false, reason: 'runtime-missing', missing: [] };
  }
  const layout = validateFireRedPuncModelLayout();
  if (!layout.ok) {
    return { ready: false, reason: 'model-missing', missing: layout.missing };
  }
  return { ready: true, reason: 'ready', missing: [] };
}

export function deleteFireRedPuncModel(): void {
  const dir = path.join(getFireRedModelsRoot(), FIRERED_PUNC_MODEL_ID);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
