import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { getPyEnginesRoot, getRuntimePythonPath } from '../pythonRuntime/paths';
import { getExtraResourcesPath } from '../utils';
import { getFireRedPuncModelDir } from './catalog';
import { prepareFireRedPuncInput } from './text';

type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

export type FireRedPuncProgress = (percent: number) => void;

/** JSONL sidecar for the PyTorch/BERT FireRedPunc model. */
export class FireRedPuncRuntime {
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;

  static getRuntimeDir(): string {
    const bundled = path.join(
      getExtraResourcesPath(),
      'firered-punc',
      'runtime',
    );
    // A packaged application must use the runtime shipped in its Resources
    // directory. Do not silently accept a user-provided runtime in this case:
    // the release contract is that Python/Torch are part of the app, while
    // only the model weights are optional downloads.
    if (app.isPackaged) return bundled;
    if (FireRedPuncRuntime.isRuntimeDirIntact(bundled)) return bundled;
    return path.join(getPyEnginesRoot(), 'firered-punc');
  }

  static isRuntimeDirIntact(dir: string): boolean {
    const pythonPath = getRuntimePythonPath(dir);
    const manifestPath = path.join(dir, 'manifest.json');
    try {
      const python = fs.statSync(pythonPath);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        runtimeId?: string;
        platform?: string;
        architecture?: string;
        protocolVersion?: number;
      };
      return (
        python.isFile() &&
        (process.platform === 'win32' || (python.mode & 0o111) !== 0) &&
        fs.statSync(path.join(dir, 'main.py')).isFile() &&
        fs.statSync(path.join(dir, 'lib', 'python3.12')).isDirectory() &&
        fs.statSync(path.join(dir, 'site-packages')).isDirectory() &&
        fs.statSync(path.join(dir, 'site-packages', 'torch')).isDirectory() &&
        fs
          .statSync(path.join(dir, 'site-packages', 'transformers'))
          .isDirectory() &&
        fs
          .statSync(path.join(dir, 'site-packages', 'fireredasr2s'))
          .isDirectory() &&
        manifest.runtimeId === 'firered-punc' &&
        manifest.platform === process.platform &&
        manifest.architecture === process.arch &&
        manifest.protocolVersion === 1
      );
    } catch {
      return false;
    }
  }

  static isInstalled(): boolean {
    if (process.env.FIREDPUNC_ENGINE_CMD) return true;
    if (!app.isReady()) return false;
    return FireRedPuncRuntime.isRuntimeDirIntact(
      FireRedPuncRuntime.getRuntimeDir(),
    );
  }

  get isRunning(): boolean {
    return this.process !== null;
  }

  async ensureStarted(): Promise<void> {
    if (this.process) return;
    const override = process.env.FIREDPUNC_ENGINE_CMD?.trim();
    let command: string;
    let args: string[];
    let cwd: string | undefined;
    let env: NodeJS.ProcessEnv;
    if (override) {
      const parts = override.split(/\s+/).filter(Boolean);
      command = parts[0];
      args = parts.slice(1);
      cwd = process.cwd();
      env = { ...process.env };
    } else {
      if (!FireRedPuncRuntime.isInstalled()) {
        throw new Error('FireRedPunc runtime is not installed');
      }
      const dir = FireRedPuncRuntime.getRuntimeDir();
      command = getRuntimePythonPath(dir);
      args = [path.join(dir, 'main.py')];
      cwd = dir;
      env = {
        ...process.env,
        PYTHONHOME: dir,
        PYTHONPATH: path.join(dir, 'site-packages'),
      };
    }
    const child = spawn(command, args, {
      cwd,
      env: { ...env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = child;
    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) this.handleLine(line);
    });
    child.stderr.on('data', () => undefined);
    child.on('exit', () => {
      if (this.process !== child) return;
      this.process = null;
      const error = new Error('FireRedPunc runtime exited');
      this.pending.forEach(({ reject }) => reject(error));
      this.pending.clear();
    });
    await this.request('ping', {});
    // Load the companion model during startup so a successful ping means the
    // complete FireRedPunc stage is usable. The readiness gate ensures the
    // optional model weights exist before this method is called.
    await this.request('load', { model_dir: getFireRedPuncModelDir() });
  }

  async punctuate(
    texts: string[],
    signal?: AbortSignal,
    onProgress?: FireRedPuncProgress,
  ): Promise<string[]> {
    if (!texts.length) return [];
    const prepared = texts.map(prepareFireRedPuncInput);
    const active = prepared.filter((text) => text.length > 0);
    if (!active.length) return texts.map(() => '');
    await this.ensureStarted();
    if (signal?.aborted) throw new Error('cancelled');
    const id = `punctuate-${++this.seq}`;
    const onAbort = () => this.cancel(id);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      onProgress?.(0);
      const result = await this.request(
        'punctuate',
        {
          id,
          model_dir: getFireRedPuncModelDir(),
          texts: active,
        },
        id,
      );
      if (
        !Array.isArray(result?.texts) ||
        result.texts.length !== active.length
      ) {
        throw new Error('FireRedPunc returned an invalid result');
      }
      const punctuated = result.texts.map((text: unknown) => {
        if (typeof text !== 'string')
          throw new Error('FireRedPunc returned non-text output');
        return text;
      });
      let activeIndex = 0;
      const output = prepared.map((text) =>
        text.length > 0 ? punctuated[activeIndex++] : '',
      );
      onProgress?.(100);
      return output;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  cancel(id?: string): void {
    if (!this.process) return;
    const child = this.process;
    this.write({ method: 'cancel', params: { id } }, child);
    // The reference PyTorch implementation performs one synchronous batch.
    // Its stdin loop cannot observe a cancellation until inference returns, so
    // terminate the sidecar to stop the active request immediately. The next
    // request starts a clean process and reloads the cached model.
    try {
      child.kill();
    } catch {
      // process already exited
    }
  }

  async dispose(): Promise<void> {
    const child = this.process;
    if (!child) return;
    this.pending.forEach(({ reject }) =>
      reject(new Error('FireRedPunc runtime disposed')),
    );
    this.pending.clear();
    try {
      this.write({ method: 'shutdown', params: {} }, child);
      child.stdin.end();
    } catch {
      // process already exited
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* already exited */
        }
        resolve();
      }, 2000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.process = null;
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    id?: string,
  ): Promise<any> {
    const requestId = id || `${method}-${++this.seq}`;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.write({ id: requestId, method, params });
    });
  }

  private write(message: Record<string, unknown>, child = this.process): void {
    if (!child || child.stdin.destroyed) return;
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!message.id) return;
    const pending = this.pending.get(String(message.id));
    if (!pending) return;
    this.pending.delete(String(message.id));
    if (message.error)
      pending.reject(
        new Error(message.error.message || 'FireRedPunc request failed'),
      );
    else pending.resolve(message.result);
  }
}

let runtime: FireRedPuncRuntime | null = null;
export function getFireRedPuncRuntime(): FireRedPuncRuntime {
  if (!runtime) runtime = new FireRedPuncRuntime();
  return runtime;
}
export async function shutdownFireRedPuncRuntime(): Promise<void> {
  await runtime?.dispose();
  runtime = null;
}
