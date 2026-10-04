---
sidebar_position: 6
title: FireRedASR
description: 妙幕 FireRedASR 引擎配置指南：FireRedASR-AED large 中英模型，内置 sherpa-onnx 原生库离线运行，中文识别精度优先的本地转写选择。
keywords: [FireRedASR, 小红书语音识别, 中文 ASR, 高精度中文转写]
---

# FireRedASR

<ProviderMeta
  website="https://github.com/FireRedTeam/FireRedASR"
  websiteLabel="FireRedASR（GitHub）"
  credentials="无需凭据"
  freeTier="完全免费"
  pricing="本地运行，无费用"
  bestFor="中文精度优先的本地转写"
  offline
/>

小红书开源的语音识别模型，妙幕集成 **FireRedASR-AED-L**（中 / 英）和可选的 **FireRedASR2-AED int8**。AED2 面向普通话、方言、中英混说和歌声场景。两种模型都通过内置 sherpa-onnx 原生库运行，无需 Python 或额外运行时。

## 在妙幕中配置

1. 「引擎」页面选中「本地多模型引擎」分组，找到 FireRedASR
2. 在 FireRedASR 模型列表中选择 AED-L 或 AED2，点「下载」（AED-L 约 1.7 GB，AED2 约 1.2 GB 解包后；支持多下载源）
3. 任务向导「语音模型」中选择即可使用

<div className="img-container">
  <img src="/img/v3/engines/local-multi.webp" alt="本地多模型引擎页面：FireRedASR 模型下载入口" />
</div>

## 特点与适用

- **中文精度优先**：正式发布内容、对错字容忍度低的场景优先选它；可在同一任务配置中比较 AED-L 和 AED2
- 中英双语支持，对网络用语与口语表达友好
- 模型较大、速度慢于轻量模型——批量长视频先用小模型试跑，重要成片用它精转

## 常见问题

- **速度偏慢**：正常，AED large 走精度路线；结合[并发任务数](/intro/quickstart)与批量策略安排任务
- **时间轴粒度**：SmartSub 使用共享 Silero VAD 的段起止时间生成字幕 cue。虽然 AED2 上游可提供词级时间戳和置信度，SmartSub 当前不会把它们写入字幕。
- **与 FunASR 怎么选**：都试跑一段素材对比——FireRedASR 精度略优，FunASR 速度与多语种更优

---

> 信息更新于 2026-07。
