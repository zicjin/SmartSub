# sherpa vendor

封装 JS 复制自 npm `sherpa-onnx-node@1.13.8`（Apache-2.0）。1.13.8 包含
FireRedASR v1 fixed-cache 与 FireRedASR2 dynamic-cache 兼容修复（上游
`2d8286d`、`f7982bd`）。

- `vendor/addon.js` 已替换为自定义加载器：从环境变量 `SHERPA_ONNX_LIB_DIR`
  用 `process.dlopen` 加载 `sherpa-onnx.node`；vendor 文件都经
  `require('./addon.js')` 取原生模块。
- `vendor/json-result.js` 由 `non-streaming-asr.js` 使用，处理原生识别结果中
  的未转义控制字符；其余 `vendor/*.js` 原样保留。
- `vendor/addon-static-import.js` 在自定义加载器下不再被引用（保留以便升级对照）。

原生库**不在此处**，构建期由 `scripts/fetch-sherpa-native.mjs` 从官方 npm
平台包 `sherpa-onnx-<platform>@1.13.8` 下载到
`extraResources/sherpa/native/<platform>/`。下载使用固定 SHA-512 integrity，
macOS 构建会重写 `@rpath` 并 ad-hoc 重签；发布构建再由 electron-builder 签名。

`worker/sherpa-worker.js` 是转写 worker 入口（Electron utility process，纯 JS，
不经 webpack），支持 SenseVoice、Paraformer、Qwen3-ASR、FireRedASR 与
NeMo transducer（NVIDIA Parakeet TDT v2/v3）与 NeMo CTC（日语 Parakeet）配置。

升级 sherpa 版本：重新 `npm pack sherpa-onnx-node@<ver>` 覆盖 `vendor/` 内除
`addon.js` 和 `json-result.js` 外的文件，同步更新下载脚本中的版本与每个平台
integrity，并在 AED-L/AED2 样本上运行 worker 冒烟。
