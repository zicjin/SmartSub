# FireRedASR2-AED 接入评估

评估日期：2026-10-04。结论：**已按独立模型 ID 接入 AED2；生产发布仍受跨平台验收门禁约束。** AED-L 保持原目录和默认行为。

## SmartSub 验收记录

- sherpa-onnx 1.13.8（官方平台包，固定 SHA-512 integrity）已替换随包 JavaScript/vendor 绑定，并包含 FireRedASR fixed-cache 与 FireRedASR2 dynamic-cache 修复。
- macOS arm64 本机使用相同 worker 和 Silero VAD 完成 AED-L 与 AED2 int8 CPU 冒烟。AED-L 使用 `sample.wav`，输出 1 个段（0.23–10.208 s）；AED2 使用官方 `test_wavs/0.wav`，输出 3 个段（0.678–2.284 s、3.814–5.932 s、6.534–10.048 s）。两次均保持 16 kHz/80 维输入和段级 VAD 时间轴。
- Windows x64、Linux x64、中文/英语/方言完整样本、接近 60 秒、静音、取消、malformed input、real-time factor、峰值内存和加载时间仍需 CI/实体机记录；在这些证据完成前，发布流程不得宣称三平台通过。

## 当前项目基线

- `main/helpers/fireRedModelCatalog.ts` 只声明 `fire-red-asr-large-zh-en`，要求
  `encoder.int8.onnx`、`decoder.int8.onnx`、`tokens.txt`，安装体积约 1.74 GB。
- `extraResources/sherpa/worker/sherpa-worker.js` 将这三个文件映射到 sherpa 的
  `fireRedAsr` 配置，输入为 16 kHz/80 维特征；Silero VAD 分段，字幕时间轴只采用段级
  VAD 边界。运行库版本在 `main/helpers/sherpaOnnx/sherpaLibPaths.ts` 和
  `scripts/fetch-sherpa-native.mjs` 固定为 1.13.2。
- UI、导入校验、IPC、自动化 readiness 和测试均把旧模型 ID 写死。因此新增模型不是只改
  下载 URL。

## 一手资料核实

### FireRedASR2 官方项目

FireRedTeam 的 [FireRedASR2S README](https://github.com/FireRedTeam/FireRedASR2S/blob/main/README.md)
称 FireRedASR2-AED 支持中文普通话、20 多种方言/口音、英语、中英混说以及语音/歌声，
并提供词级时间戳和置信度。README 给出的 AED 限制是单个输入最长 60 秒，超过 60 秒可能
出现幻觉，超过 200 秒会触发位置编码错误；官方示例要求 16 kHz、16-bit、单声道 PCM WAV。
官方项目的 AED 下载是 PyTorch `model.pth.tar`（约 4.73 GB，ModelScope 仓库
`xukaituo/FireRedASR2-AED`），不是当前 sherpa Node addon 可直接加载的 ONNX 两件套。

### sherpa-onnx 导出包与兼容性

sherpa-onnx 的 `asr-models` release 当前列出两种相关导出包：

- [`sherpa-onnx-fire-red-asr2-zh_en-int8-2026-02-26.tar.bz2`](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-fire-red-asr2-zh_en-int8-2026-02-26.tar.bz2)，838,589,068 bytes；
- [`sherpa-onnx-fire-red-asr2-ctc-zh_en-int8-2026-02-25.tar.bz2`](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-fire-red-asr2-ctc-zh_en-int8-2026-02-25.tar.bz2)，520,516,278 bytes。

前者是本次 AED 评估对象；后者是 CTC，必须使用 sherpa 的 `fireRedAsrCtc` 配置，不能
误当作 AED。包内文件名、校验值和目录结构应在实现时从 release/ModelScope 文件树重新
读取，不能套用旧模型的 `encoder.int8.onnx` / `decoder.int8.onnx` 假设。

上游 sherpa-onnx 的 [FireRedASR 实现](https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.2/sherpa-onnx/csrc)
在 v1.13.2 已支持旧版 `fireRedAsr` 两件套；但上游提交
[`2d8286d`](https://github.com/k2-fsa/sherpa-onnx/commit/2d8286d12c67b634e93a61473556ca5d7279e509)
随后把 decoder KV cache 从固定 `max_len` 改为按需分配，提交
[`f7982bd`](https://github.com/k2-fsa/sherpa-onnx/commit/f7982bd7dd5b8d8a5ea4c2604482cc2d736d99a0)
又明确修复了“旧版固定 1024 cache 与 FireRedASR2 动态 cache”的兼容问题，并说明两种
模型均通过验证。由此可确认：**当前项目固定的 1.13.2 不足以证明 AED2 可运行**；应把
包含这两项修复的上游版本作为最低候选，并在项目实际平台上冒烟测试。上游提交属于源码
证据，不代表 SmartSub 已经拥有对应的新原生二进制。

## 影响与工作量

| 项目          | 评估                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 推理接口      | AED2 仍可归入 sherpa `fireRedAsr`，但需确认导出包的 encoder/decoder/tokens 文件和动态 cache 行为；CTC 是另一接口。                                                           |
| 原生库        | 必须升级 SmartSub 内置 sherpa 原生库及 Node vendor 绑定到包含 AED2 修复的版本，并同步构建、签名、各平台产物。旧库与旧模型应继续可用。                                        |
| 模型目录/下载 | 新增独立 ID、文件清单、归档名、大小、ModelScope/GitHub 源、校验和导入布局；不能覆盖旧模型目录。                                                                              |
| UI/IPC/自动化 | 扩展模型选择、描述、删除、readiness、导入校验、自动化参数和回归测试。旧模型保留。                                                                                            |
| 时间轴        | 当前 worker 丢弃模型的词级时间戳，只用 Silero VAD 段边界。若要兑现 AED2 的词级时间戳，需要扩展 worker 协议、字幕切分和诊断；仅换模型不会自动改善时间轴。                     |
| 资源          | sherpa AED2 int8 压缩包约 0.84 GB，解包后大小需实测；PyTorch 官方权重约 4.73 GB，不适合当前免 Python 的本地引擎路径。CPU/GPU、内存和 RTF 需在 macOS/Windows/Linux 实机测量。 |
| 许可          | FireRedASR2S 仓库提供 Apache-2.0 LICENSE；发布包和模型的使用条件仍应在下载页/模型卡逐项确认并随发行物记录。                                                                  |

## 建议实施顺序

1. 固定一个包含 `2d8286d` 和 `f7982bd`（或其后续等价修复）的 sherpa-onnx 版本，先在
   macOS arm64、Windows x64、Linux x64 构建并通过旧 AED-L 回归；不要只升级 JS 类型文件。
2. 下载并解包 AED2 int8 包，记录实际文件树、SHA-256、解包大小，使用上游 Node 示例和
   SmartSub worker 各跑 16 kHz 中英/方言、接近 60 秒及空音频样本。
3. 以 `fire-red-asr2-aed-zh-en`（名称可调整）新增模型规格，与旧 ID 并存；先隐藏在
   实验开关或开发构建，完成 RTF、峰值内存、识别准确率、长段稳定性和取消/预热测试后再
   暴露给所有用户。
4. 若需要词级时间轴，再单独设计结果协议和字幕映射；不要把“模型支持 timestamp”写成
   当前 SmartSub 已支持。

## 决策门槛

在没有新 sherpa 原生库和三平台冒烟证据前，不应合并生产接入。若目标只是提升中文识别
精度，现有 AED-L 可继续作为稳定默认；AED2 适合作为可选实验模型。若必须使用官方
PyTorch 权重，则要另建 Python/推理运行时路线，工作量和包体明显高于 sherpa 导出包方案。
