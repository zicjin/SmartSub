const path = require('node:path');
const { Worker } = require('node:worker_threads');
const root = path.resolve(__dirname, '..');
const platformKey =
  process.env.SHERPA_PLATFORM_KEY || `${process.platform}-${process.arch}`;
const model = process.env.FIRERED_MODEL_DIR;
const audioFile =
  process.env.FIRERED_AUDIO || path.join(__dirname, 'sample.wav');
if (!model)
  throw new Error('Set FIRERED_MODEL_DIR to an AED-L or AED2 model directory');
const worker = new Worker(
  path.join(root, 'extraResources/sherpa/worker/sherpa-worker.js'),
  {
    env: {
      ...process.env,
      SHERPA_ONNX_LIB_DIR: path.join(
        root,
        'extraResources/sherpa/native',
        platformKey,
      ),
    },
  },
);
const params = {
  provider: 'cpu',
  num_threads: 2,
  language: 'auto',
  use_itn: true,
  vad_threshold: 0.5,
  vad_min_speech_duration_ms: 250,
  vad_min_silence_duration_ms: 500,
  vad_max_speech_duration_s: 30,
};
const req = {
  type: 'transcribe',
  id: 'smoke',
  audioFile,
  vadModel: path.join(root, 'extraResources/sherpa/vad/silero_vad.onnx'),
  modelType: 'fire_red_asr',
  tokens: path.join(model, 'tokens.txt'),
  fireRed: {
    encoder: path.join(model, 'encoder.int8.onnx'),
    decoder: path.join(model, 'decoder.int8.onnx'),
  },
  params,
};
worker.on('message', (m) => {
  console.log(JSON.stringify(m));
  if (m.type === 'done' || m.type === 'error')
    worker.terminate().then(() => process.exit(m.type === 'done' ? 0 : 1));
});
worker.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
worker.postMessage(req);
