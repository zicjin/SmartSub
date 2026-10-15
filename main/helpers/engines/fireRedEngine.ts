import fs from 'fs';
import type { EngineStatus } from '../../../types/engine';
import {
  getFireRedModelFiles,
  getFireRedVadModelPath,
  isFireRedReady,
  getInstalledFireRedModels,
  resolveFireRedSelection,
} from '../fireRedModelCatalog';
import { isSherpaLibInstalled } from '../sherpaOnnx/sherpaLibPaths';
import { getSherpaLibStatus } from '../sherpaOnnx/sherpaLibManager';
import {
  getSherpaAsrRuntime,
  type SherpaModelRequest,
} from '../sherpaOnnx/sherpaFunasrRuntime';
import { formatSrtContent } from '../fileUtils';
import { logMessage, store } from '../storeManager';
import { getTaskContext, TaskCancelledError } from '../taskContext';
import {
  subtitleCueFromSegment,
  trimSubtitleTrailingSilence,
} from '../subtitleTiming';
import { resplitSubtitleCues } from '../subtitleSegmentation';
import { buildFireRedParams } from './fireRedParams';
import { resolveEffectiveSettings } from './outcomePresets';
import type { TranscribeContext, TranscriptionEngineAdapter } from './types';
import {
  FireRedPuncRuntime,
  getFireRedPuncRuntime,
} from '../fireRedPunc/runtime';
import { getFireRedPuncReadiness } from '../fireRedPunc/catalog';
import { normalizeFireRedCueText } from '../fireRedPunc/text';

/** 在途转写 id 集合：任务级并发下可能同时存在多个（排队+执行），取消须精确到 id。 */
const activeTranscribeIds = new Set<string>();

function fireRedPuncRuntimeInstalled(): boolean {
  try {
    return FireRedPuncRuntime.isInstalled();
  } catch {
    return false;
  }
}

type FireRedSelection = NonNullable<ReturnType<typeof resolveFireRedSelection>>;

function describeFireRedFailure(
  error: unknown,
  modelId: FireRedSelection['id'],
  audioFile: string,
): Error {
  const message = error instanceof Error ? error.message : String(error);
  const files = getFireRedModelFiles(modelId);
  const missingModelFile = [files.encoder, files.decoder, files.tokens].find(
    (file) => !fs.existsSync(file),
  );
  const cause = missingModelFile
    ? `model file missing: ${missingModelFile}`
    : !fs.existsSync(getFireRedVadModelPath())
      ? 'Silero VAD file missing'
      : !fs.existsSync(audioFile)
        ? 'audio input missing'
        : `native runtime or audio decode: ${message}`;
  return new Error(`FireRed ${modelId} transcription failed (${cause})`, {
    cause: error,
  });
}

/** 组装 worker 模型请求（不含 audio_file）。transcribe 与 prewarm 共用，缓存 key 一致。 */
function buildModelRequest(
  selection: FireRedSelection,
  settings: Record<string, unknown>,
): SherpaModelRequest {
  const files = getFireRedModelFiles(selection.id);
  return {
    modelType: 'fire_red_asr',
    fireRed: { encoder: files.encoder, decoder: files.decoder },
    tokens: files.tokens,
    vadModel: getFireRedVadModelPath(),
    params: buildFireRedParams(settings),
  };
}

/**
 * 批次预热：在音频抽取的同时，让 worker 预加载 FireRedASR 两件套 + 共享 VAD 并写满识别器缓存，
 * 使首个 transcribe 直接命中。模型加载在 worker 线程进行，不阻塞主/UI 线程。失败非致命。
 */
function prewarmFireRed(formData: Record<string, unknown>): void {
  try {
    if (!isSherpaLibInstalled() || !isFireRedReady()) return;
    const selection = resolveFireRedSelection(
      (formData as { model?: string })?.model,
      getInstalledFireRedModels(),
    );
    if (!selection) return;
    // 与 transcribe 同源派生 VAD 灵敏度，确保预热与正式转写的 VAD 配置一致。
    const settings = resolveEffectiveSettings(
      formData,
      store.get('settings') as Record<string, unknown>,
    );
    getSherpaAsrRuntime().prewarm(buildModelRequest(selection, settings));
    logMessage('firered (sherpa) prewarm started', 'info');
  } catch (error) {
    logMessage(`firered prewarm error (non-fatal): ${error}`, 'warning');
  }
}

/**
 * 用 sherpa-onnx Node 原生 addon（worker 线程）跑 FireRedASR-AED 生成字幕。
 * 段级时间戳来自 silero VAD 分段边界（段长安全闸钳到 ≤60s）；取消走 AbortSignal。
 */
async function transcribeFireRed(ctx: TranscribeContext): Promise<string> {
  const { event, file, formData } = ctx;
  event.sender.send('taskFileChange', { ...file, extractSubtitle: 'loading' });

  const { tempAudioFile, srtFile } = file;
  // 逐任务运行时派生（字幕效果档位 → VAD 灵敏度），不回写全局。
  const settings = resolveEffectiveSettings(
    formData,
    store.get('settings') as Record<string, unknown>,
  );

  if (!isSherpaLibInstalled()) {
    throw new Error(
      'sherpa runtime not installed. Download it from Resource Hub > Engines.',
    );
  }
  if (!isFireRedReady()) {
    throw new Error(
      'FireRed is not ready. Install the FireRedASR model, shared FireRedPunc model and firered-punc runtime on macOS arm64.',
    );
  }

  const selection = resolveFireRedSelection(
    (formData as { model?: string })?.model,
    getInstalledFireRedModels(),
  );
  if (!selection) {
    throw new Error(
      'firered ASR model not installed. Download FireRedASR from Resource Hub > Models.',
    );
  }

  const model = buildModelRequest(selection, settings);
  logMessage(`firered(sherpa) model: ${JSON.stringify(model)}`, 'info');
  event.sender.send('taskProgressChange', file, 'extractSubtitle', 0);

  const runtime = getSherpaAsrRuntime();
  const { id, result } = runtime.transcribe(
    model,
    tempAudioFile,
    (percent) =>
      event.sender.send('taskProgressChange', file, 'extractSubtitle', percent),
    ctx.onActivity,
  );
  activeTranscribeIds.add(id);

  const signal = ctx.signal ?? getTaskContext()?.signal;
  const onAbort = () => {
    if (activeTranscribeIds.has(id)) runtime.cancel(id);
  };
  if (signal?.aborted) runtime.cancel(id);
  else signal?.addEventListener('abort', onAbort, { once: true });

  let transcription;
  try {
    transcription = await result;
  } catch (error) {
    if (signal?.aborted || (error as { code?: string })?.code === 'cancelled') {
      throw new TaskCancelledError();
    }
    throw describeFireRedFailure(error, selection.id, tempAudioFile);
  } finally {
    signal?.removeEventListener('abort', onAbort);
    activeTranscribeIds.delete(id);
  }

  if (signal?.aborted) throw new TaskCancelledError();
  ctx.onActivity?.({ phase: 'organizing', units: [] });

  ctx.onDiagnostics?.({
    vadAvailable: Array.isArray(transcription?.vadSegments),
    vadSegments: transcription?.vadSegments?.map((segment) => ({
      startMs: Number(segment.start) * 1000,
      endMs: Number(segment.end) * 1000,
    })),
  });

  const rawSubtitles = (transcription?.segments || []).map(
    subtitleCueFromSegment,
  );
  // Persist the ASR checkpoint before punctuation. If the PyTorch sidecar fails
  // or the user cancels, the recognized text remains available for retry and
  // diagnostics instead of being lost with the failed task.
  await fs.promises.writeFile(srtFile, formatSrtContent(rawSubtitles));
  const punc = getFireRedPuncRuntime();
  file.fireRedPunc = 'loading';
  delete file.fireRedPuncError;
  event.sender.send('taskFileChange', {
    ...file,
    fireRedPunc: 'loading',
  });
  event.sender.send('taskProgressChange', file, 'fireRedPunc', 0);
  ctx.onActivity?.({ phase: 'correcting', units: [] });
  let punctuatedTexts: string[];
  try {
    punctuatedTexts = await punc.punctuate(
      rawSubtitles.map((cue) => cue[2]),
      signal,
      (percent) =>
        event.sender.send('taskProgressChange', file, 'fireRedPunc', percent),
    );
  } catch (error) {
    if (signal?.aborted || String(error).includes('cancelled')) {
      file.fireRedPunc = '';
      event.sender.send('taskFileChange', { ...file, fireRedPunc: '' });
      throw new TaskCancelledError();
    }
    const message = error instanceof Error ? error.message : String(error);
    file.fireRedPunc = 'error';
    file.fireRedPuncError = message;
    event.sender.send('taskFileChange', {
      ...file,
      fireRedPunc: 'error',
      fireRedPuncError: message,
    });
    throw new Error(`FireRedPunc punctuation restoration failed: ${message}`, {
      cause: error,
    });
  }
  const punctuatedSubtitles = rawSubtitles.map(
    (cue, index) =>
      [cue[0], cue[1], punctuatedTexts[index]] as [string, string, string],
  );
  file.fireRedPunc = 'done';
  event.sender.send('taskProgressChange', file, 'fireRedPunc', 100);
  event.sender.send('taskFileChange', { ...file, fireRedPunc: 'done' });
  const subtitles = trimSubtitleTrailingSilence(
    resplitSubtitleCues(
      punctuatedSubtitles,
      formData as Record<string, unknown>,
    ),
    tempAudioFile,
  ).map(
    ([start, end, text]) =>
      [
        start,
        end,
        formData.taskType === 'generateAndTranslate'
          ? text
          : normalizeFireRedCueText(text),
      ] as [string, string, string],
  );
  const formattedSrt = formatSrtContent(subtitles);
  ctx.onActivity?.({ phase: 'saving' });
  await fs.promises.writeFile(srtFile, formattedSrt);

  event.sender.send('taskProgressChange', file, 'extractSubtitle', 100);
  event.sender.send('taskFileChange', { ...file, extractSubtitle: 'done' });
  logMessage('generate subtitle done (firered/sherpa)', 'info');
  return srtFile;
}

export const fireRedEngineAdapter: TranscriptionEngineAdapter = {
  id: 'fireRedAsr',
  displayName: 'FireRedASR-AED (L)',
  requiresRuntime: true,

  async isAvailable(): Promise<EngineStatus> {
    if (!isSherpaLibInstalled()) {
      return {
        state: 'not_installed',
        message: 'sherpa runtime not downloaded',
      };
    }
    const puncReadiness = getFireRedPuncReadiness(
      fireRedPuncRuntimeInstalled(),
    );
    if (!puncReadiness.ready) {
      const detail =
        puncReadiness.reason === 'unsupported-platform'
          ? 'FireRedPunc currently supports macOS arm64 only.'
          : puncReadiness.reason === 'runtime-missing'
            ? 'firered-punc runtime is not installed.'
            : puncReadiness.reason === 'model-missing'
              ? `FireRedPunc model is incomplete (${puncReadiness.missing.join(', ')}).`
              : 'FireRedPunc is not ready.';
      return { state: 'not_installed', message: detail };
    }
    if (!isFireRedReady()) {
      return {
        state: 'not_installed',
        message: 'firered model not downloaded',
      };
    }
    return { state: 'ready', version: getSherpaLibStatus().version };
  },

  async transcribe(ctx: TranscribeContext): Promise<string> {
    return transcribeFireRed(ctx);
  },

  cancelActive(): void {
    const runtime = getSherpaAsrRuntime();
    activeTranscribeIds.forEach((id) => runtime.cancel(id));
    activeTranscribeIds.clear();
  },

  prewarm(formData: Record<string, unknown>): void {
    prewarmFireRed(formData);
  },
};
