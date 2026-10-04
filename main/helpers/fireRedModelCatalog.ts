import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { resolveBundledVadPath } from './modelImport';
import { resolveModelRoot } from './storagePaths';
import {
  getGithubBase,
  getGithubProxyPrefix,
  getModelScopeBase,
} from './config/downloadConfig';
import {
  validateModelLayoutWithSizes,
  type LayoutCheckResult,
  type ModelFileSizeExpectation,
} from './modelImport';

/** fireRed 模型根目录：单独覆盖 > 统一存储目录 > userData/models/firered */
export function getFireRedModelsRoot(): string {
  const { store } = require('./store') as typeof import('./store');
  const root = resolveModelRoot(
    'firered',
    store.get('settings'),
    app.getPath('userData'),
  ).path;
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

/** fireRed 子模型标识（与本地子目录一一对应）。 */
export type FireRedModelId =
  'fire-red-asr-large-zh-en' | 'fire-red-asr2-aed-zh-en';

/** 默认（当前唯一）fireRed 模型。 */
export const FIRERED_DEFAULT_MODEL_ID: FireRedModelId =
  'fire-red-asr-large-zh-en';

export const FIRERED_AED2_MODEL_ID: FireRedModelId = 'fire-red-asr2-aed-zh-en';

/**
 * fireRed 模型下载源：
 * - modelscope：ModelScope 官方镜像逐文件直下（国内 CDN 最快，且免解包）；
 * - ghproxy：GitHub release 整包经 gh-proxy.com 代理（国内加速）；
 * - github：GitHub release 整包直连（海外）。
 */
export type FireRedModelSource = 'modelscope' | 'ghproxy' | 'github';

/** 默认下载源：国内优先 ModelScope（官方镜像存在）。 */
export const FIRERED_DEFAULT_SOURCE: FireRedModelSource = 'modelscope';

/** 源回退规范顺序（国内优先）：modelscope → ghproxy → github。 */
const FIRERED_SOURCE_ORDER: FireRedModelSource[] = [
  'modelscope',
  'ghproxy',
  'github',
];

/** 所选源排第一，其余按规范顺序补齐，供下载失败时自动回退。 */
export function getFireRedSourceOrder(
  selected: FireRedModelSource,
): FireRedModelSource[] {
  return [selected, ...FIRERED_SOURCE_ORDER.filter((s) => s !== selected)];
}

/** ModelScope 逐文件映射：remote=仓库内路径，local=相对模型目录的落地路径。 */
export interface FireRedModelScopeFile {
  remote: string;
  local: string;
  /** Optional fixed size from the source revision. */
  size?: number;
}

/**
 * fireRed 模型清单：支持两种获取方式——
 * - ModelScope 逐文件（modelScopeRepo + modelScopeFiles）：国内首选，免解包；
 * - GitHub release tar.bz2 整包（releasePath + archiveName）：经 gh-proxy / 直连回退，需解包。
 * sherpa-onnx FireRedASR-AED 两件套：encoder.int8 / decoder.int8 + tokens.txt。
 */
export interface FireRedModelSpec {
  id: FireRedModelId;
  dirName: string;
  /** 体积/硬件提示用（解包后约 1.74GB；tar.bz2 下载包约 1.4GB）。 */
  approxInstallBytes: number;
  /** sherpa recognizer family. CTC packages are intentionally not catalogued. */
  modelType: 'aed';
  /** Release revision that produced this exact model artifact. */
  revision?: string;
  /** Exact archive metadata for deterministic downloads and diagnostics. */
  archiveSizeBytes?: number;
  archiveSha256?: string;
  extractedSizeBytes?: number;
  /** ModelScope 仓库 id（逐文件国内源，官方镜像）。 */
  modelScopeRepo?: string;
  /** ModelScope 逐文件清单（remote→local）。 */
  modelScopeFiles: FireRedModelScopeFile[];
  /** GitHub release 路径（owner/repo/releases/download/tag），用于整包源拼 URL。 */
  releasePath: string;
  /** release 整包文件名（tar.bz2）。 */
  archiveName: string;
  /** 解包后顶层目录名（用 decompress strip:1 去掉，此处仅作记录）。 */
  archiveInnerDir: string;
  /** 判定「已安装」必须存在的关键文件（相对 dirName）。 */
  requiredFiles: string[];
  /** Exact bytes for required files when the export has a fixed layout. */
  requiredFileSizes?: Record<string, number>;
}

const FIRERED_ARCHIVE =
  'sherpa-onnx-fire-red-asr-large-zh_en-2025-02-16.tar.bz2';
const FIRERED_INNER = 'sherpa-onnx-fire-red-asr-large-zh_en-2025-02-16';
const FIRERED_RELEASE_PATH = 'k2-fsa/sherpa-onnx/releases/download/asr-models';
/** sherpa-onnx 的 FireRedASR onnx 官方镜像（与 HF csukuangfj 同作者同内容）。 */
const FIRERED_MS_REPO =
  'csukuangfj/sherpa-onnx-fire-red-asr-large-zh_en-2025-02-16';

export const FIRERED_MODELS: Record<FireRedModelId, FireRedModelSpec> = {
  'fire-red-asr-large-zh-en': {
    id: 'fire-red-asr-large-zh-en',
    dirName: 'fire-red-asr-large-zh-en',
    modelType: 'aed',
    // encoder 1.29GB + decoder 425MB + tokens 70KB ≈ 1.74GB（实测字节累加）。
    approxInstallBytes: 1_740_000_000,
    modelScopeRepo: FIRERED_MS_REPO,
    // ModelScope 仓库内文件平铺在根（经文件树 API 核实）。
    modelScopeFiles: [
      { remote: 'encoder.int8.onnx', local: 'encoder.int8.onnx' },
      { remote: 'decoder.int8.onnx', local: 'decoder.int8.onnx' },
      { remote: 'tokens.txt', local: 'tokens.txt' },
    ],
    releasePath: FIRERED_RELEASE_PATH,
    archiveName: FIRERED_ARCHIVE,
    archiveInnerDir: FIRERED_INNER,
    requiredFiles: ['encoder.int8.onnx', 'decoder.int8.onnx', 'tokens.txt'],
  },
  [FIRERED_AED2_MODEL_ID]: {
    id: FIRERED_AED2_MODEL_ID,
    dirName: FIRERED_AED2_MODEL_ID,
    modelType: 'aed',
    revision: '2026-02-26',
    // Official sherpa-onnx asr-models release artifact.
    archiveSizeBytes: 838_589_068,
    archiveSha256:
      '43015b3f1643a5688b4821e8ed323473d38b798c4ec291471fe00df1bcfc4f1c',
    // Required model files only; test_wavs and README are excluded on install.
    extractedSizeBytes: 1_234_657_933,
    approxInstallBytes: 1_234_657_933,
    modelScopeFiles: [],
    releasePath: FIRERED_RELEASE_PATH,
    archiveName: 'sherpa-onnx-fire-red-asr2-zh_en-int8-2026-02-26.tar.bz2',
    archiveInnerDir: 'sherpa-onnx-fire-red-asr2-zh_en-int8-2026-02-26',
    requiredFiles: ['encoder.int8.onnx', 'decoder.int8.onnx', 'tokens.txt'],
    requiredFileSizes: {
      'encoder.int8.onnx': 817_286_833,
      'decoder.int8.onnx': 417_291_928,
      'tokens.txt': 79_172,
    },
  },
};

export function getFireRedSupportedSources(
  id: FireRedModelId,
): FireRedModelSource[] {
  const spec = FIRERED_MODELS[id];
  return spec.modelScopeRepo && spec.modelScopeFiles.length > 0
    ? [...FIRERED_SOURCE_ORDER]
    : ['ghproxy', 'github'];
}

/** 整包源（ghproxy/github）的 tar.bz2 下载 URL。 */
export function getFireRedArchiveUrl(
  spec: FireRedModelSpec,
  source: 'ghproxy' | 'github',
): string {
  const github = `${getGithubBase()}/${spec.releasePath}/${spec.archiveName}`;
  return source === 'ghproxy' ? `${getGithubProxyPrefix()}/${github}` : github;
}

/** ModelScope 单文件 resolve 直链（302 跳国内 CDN，支持 Range）。 */
export function getFireRedModelScopeFileUrl(
  spec: FireRedModelSpec,
  remote: string,
): string {
  if (!spec.modelScopeRepo)
    throw new Error(`ModelScope unavailable for ${spec.id}`);
  return `${getModelScopeBase()}/models/${spec.modelScopeRepo}/resolve/master/${remote}`;
}

/** ModelScope 文件树 API（取各文件 size 以计算总进度）。 */
export function getFireRedModelScopeTreeUrl(spec: FireRedModelSpec): string {
  if (!spec.modelScopeRepo)
    throw new Error(`ModelScope unavailable for ${spec.id}`);
  return `${getModelScopeBase()}/api/v1/models/${spec.modelScopeRepo}/repo/files?Revision=master&Recursive=true`;
}

export function getFireRedModelDir(id: FireRedModelId): string {
  const dir = path.join(getFireRedModelsRoot(), FIRERED_MODELS[id].dirName);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function isFireRedModelInstalled(id: FireRedModelId): boolean {
  const dir = path.join(getFireRedModelsRoot(), FIRERED_MODELS[id].dirName);
  return validateFireRedModelLayout(id, dir).ok;
}

export function getFireRedRequiredFileExpectations(
  id: FireRedModelId,
): ModelFileSizeExpectation[] {
  const spec = FIRERED_MODELS[id];
  return spec.requiredFiles.map((file) => ({
    path: file,
    size: spec.requiredFileSizes?.[file] ?? 0,
  }));
}

/** Validate model identity as well as layout; AED2 CTC/PyTorch packages fail here. */
export function validateFireRedModelLayout(
  id: FireRedModelId,
  dir: string,
): LayoutCheckResult {
  const spec = FIRERED_MODELS[id];
  if (!spec.requiredFileSizes) {
    return {
      ok: spec.requiredFiles.every((file) => {
        try {
          const stat = fs.statSync(path.join(dir, file));
          return stat.isFile() && stat.size > 0;
        } catch {
          return false;
        }
      }),
      missing: spec.requiredFiles.filter((file) => {
        try {
          const stat = fs.statSync(path.join(dir, file));
          return !stat.isFile() || stat.size <= 0;
        } catch {
          return true;
        }
      }),
    };
  }
  return validateModelLayoutWithSizes(
    dir,
    getFireRedRequiredFileExpectations(id),
  );
}

/** 两件套 + tokens 绝对路径（供 adapter 注入 worker 模型请求）。 */
export function getFireRedModelFiles(id: FireRedModelId): {
  encoder: string;
  decoder: string;
  tokens: string;
} {
  const dir = getFireRedModelDir(id);
  return {
    encoder: path.join(dir, 'encoder.int8.onnx'),
    decoder: path.join(dir, 'decoder.int8.onnx'),
    tokens: path.join(dir, 'tokens.txt'),
  };
}

/** 共享 silero VAD：随应用内置（extraResources/sherpa/vad/silero_vad.onnx），与其它本地 sherpa ASR 共用同一份。 */
export function getFireRedVadModelPath(): string {
  const { getExtraResourcesPath } =
    require('./utils') as typeof import('./utils');
  return resolveBundledVadPath(getExtraResourcesPath());
}

/** 共享 VAD 是否就绪：检查随包内置文件是否存在（正常安装下恒为真）。 */
export function isFireRedVadInstalled(): boolean {
  return fs.existsSync(getFireRedVadModelPath());
}

/** 全部 fireRed 模型 id（静态，纯函数，不触磁盘）。 */
export function getFireRedModelIds(): FireRedModelId[] {
  return Object.keys(FIRERED_MODELS) as FireRedModelId[];
}

/** 已安装的 fireRed 模型 id（触磁盘）。 */
export function getInstalledFireRedModels(): FireRedModelId[] {
  return getFireRedModelIds().filter((id) => isFireRedModelInstalled(id));
}

/**
 * 选定要使用的 fireRed 模型（纯函数）：
 * - requested 命中已装 → 用它；
 * - 否则回退首个已装；
 * - 无已装 → null。
 */
export function resolveFireRedSelection(
  requested: string | undefined,
  installed: FireRedModelId[],
): { id: FireRedModelId } | null {
  if (installed.length === 0) return null;
  const ids = getFireRedModelIds();
  const normalized = (requested || '').toLowerCase();
  const chosen =
    ids.find((id) => id === normalized && installed.includes(id)) ??
    installed[0];
  return { id: chosen };
}

/** fireRed 转写就绪 = 至少一个 fireRed 模型 + 共享 silero VAD 均已安装。 */
export function isFireRedReady(): boolean {
  return getInstalledFireRedModels().length > 0 && isFireRedVadInstalled();
}

export function deleteFireRedModel(id: FireRedModelId): void {
  const dir = path.join(getFireRedModelsRoot(), FIRERED_MODELS[id].dirName);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
