# FireRedPunc 作为必需配套模型并使用独立运行时

Status: accepted

FireRed ASR 资源组必须同时安装兼容的 FireRedPunc 配套模型；缺少或校验失败时，FireRed ASR 保持未准备状态。FireRedPunc 使用官方 PyTorch/BERT 模型，通过独立的 `firered-punc` 本地运行时执行，首版只支持 macOS arm64 CPU。这样可以保持 FireRedPunc 与当前 sherpa-onnx ASR 模型格式的边界，避免把 PyTorch 依赖耦合到 faster-whisper 运行时，并使资源安装和兼容性校验能够原子完成。

## Consequences

FireRed ASR 安装需要同时提交 ASR 和 Punc 资源；资源中心必须显示具体缺失原因。首版不支持 Windows/Linux 或 GPU FireRedPunc。运行时推理失败属于任务失败，但可以复用已保存的 ASR 检查点重试。
