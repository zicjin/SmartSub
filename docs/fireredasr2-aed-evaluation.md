# FireRedASR2-AED 接入评估

评估日期：2026-10-04。结论：**已按独立模型 ID 接入 AED2；生产发布仍受跨平台验收门禁约束。** AED-L 保持原目录和默认行为。

## SmartSub 验收记录

- sherpa-onnx 1.13.8（官方平台包，固定 SHA-512 integrity）已替换随包 JavaScript/vendor 绑定，并包含 FireRedASR fixed-cache 与 FireRedASR2 dynamic-cache 修复。
- macOS arm64 本机使用相同 worker 和 Silero VAD 完成 AED-L 与 AED2 int8 CPU 冒烟。AED-L 使用 `sample.wav`，输出 1 个段（0.23–10.208 s）；AED2 使用官方 `test_wavs/0.wav`，输出 3 个段（0.678–2.284 s、3.814–5.932 s、6.534–10.048 s）。两次均保持 16 kHz/80 维输入和段级 VAD 时间轴。
- 可复现脚本是 `.smoke/worker-smoke.cjs`：设置 `SHERPA_PLATFORM_KEY`、`FIRERED_MODEL_DIR`、`FIRERED_AUDIO` 即可在各平台运行。
- Windows x64、Linux x64、中文/英语/方言完整样本、接近 60 秒、静音、取消、malformed input、real-time factor、峰值内存和加载时间仍需 CI/实体机记录；在这些证据完成前，发布流程不得宣称三平台通过。

## 当前项目基线

- `main/helpers/fireRedModelCatalog.ts` 保留 `fire-red-asr-large-zh-en`，并新增独立的 `fire-red-asr2-aed-zh-en` 目录、归档、SHA-256、文件大小和导入校验。两者都要求 `encoder.int8.onnx`、`decoder.int8.onnx`、`tokens.txt`；AED-L 约 1.74 GB、AED2 解包后约 1.23 GB。
- `extraResources/sherpa/worker/sherpa-worker.js` 对两个模型使用同一个 `fireRedAsr` 配置和共享 Silero VAD，输入保持 16 kHz/80 维特征，字幕时间轴只采用段级 VAD 边界。随包运行库和 vendor 绑定固定为 1.13.8。
- UI、导入校验、IPC、自动化 readiness 和模型删除均按模型 ID 工作；AED-L 仍是默认回退。

## 一手资料核实

### FireRedASR2 官方项目

FireRedTeam 的 [FireRedASR2S README](https://github.com/FireRedTeam/FireRedASR2S/blob/main/README.md) 称 FireRedASR2-AED 支持中文普通话、20 多种方言/口音、英语、中英混说以及语音/歌声，并提供词级时间戳和置信度。README 给出的 AED 限制是单个输入最长 60 秒，超过 60 秒可能出现幻觉，超过 200 秒会触发位置编码错误；官方示例要求 16 kHz、16-bit、单声道 PCM WAV。官方 PyTorch `model.pth.tar` 不属于当前 sherpa Node addon 路径。

### sherpa-onnx 导出包与兼容性

sherpa-onnx 的 `asr-models` release 当前列出两种相关导出包：

- [AED2 int8 archive](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-fire-red-asr2-zh_en-int8-2026-02-26.tar.bz2)，838,589,068 bytes，SHA-256 `43015b3f1643a5688b4821e8ed323473d38b798c4ec291471fe00df1bcfc4f1c`；
- `sherpa-onnx-fire-red-asr2-ctc-zh_en-int8-2026-02-25.tar.bz2` 是 CTC，必须使用另一套接口，因此不在本功能内。

1.13.8 是 SmartSub 的最低运行库版本；它包含上游 `2d8286d` 和 `f7982bd` 的缓存兼容修复，旧 AED-L 与 AED2 共用同一个 `fireRedAsr` worker 请求。

## 交付门槛

在 Windows x64 和 Linux x64 构建机运行 `.smoke/worker-smoke.cjs`，补齐上述场景与性能数据后，才可将 AED2 标记为三平台生产验证通过。现有 AED-L 继续作为稳定默认，AED2 作为可选本地模型；SmartSub 输出仍是 Silero VAD 段级时间轴，不提供上游词级时间戳或置信度。
