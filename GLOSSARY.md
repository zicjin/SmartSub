# SmartSub 字幕转写与 FireRed

本上下文描述媒体转写产生原文字幕，以及 FireRed 识别链路中的标点和资源状态。

## Language

**FireRed ASR**:
FireRedASR-AED-L 和 FireRedASR2-AED 在 SmartSub 中提供本地语音识别，输出带时间段的原文文本。
_Avoid_: FireRedPunc、FireRed 完整系统

**FireRed 配套模型**:
FireRed ASR 使用的共享 FireRedPunc 模型；任一 FireRed ASR 模型要进入可用状态，都必须安装兼容的配套模型。
_Avoid_: 可选模型、降级模型

**FireRed 标点恢复阶段**:
FireRed ASR 产生原文文本后，使用 FireRedPunc 恢复中文和英文标点的固定处理阶段。
_Avoid_: AI 精修、翻译

**原文字幕**:
与媒体中讲话语言相同、由转写生成的字幕交付物。
_Avoid_: 译文字幕、目标字幕

**字幕条目**:
带有一个时间范围并作为一个显示单元交付的字幕文本；一个条目可以在界面或视频中排版为一行或多行。
_Avoid_: 字幕行、字幕句子、文本行

**行尾句号规范化**:
原文字幕交付前，以完整字幕条目为单位移除末尾中文句号「。」或英文句点「.」的规则，同时保留问号、感叹号、省略号、受保护的英文缩写和条目内部标点。
_Avoid_: 去标点、中文去标点

**未准备**:
FireRed ASR 尚不能启动转写的资源状态，表示运行库、平台、ASR 模型或 FireRed 配套模型至少有一项未满足。
_Avoid_: 降级可用、运行失败
