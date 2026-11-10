# 领域签字：dentistry（牙科）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §3 自签；人工只需抽查域划分与签字）
- 范围：SACN5-47 牙周病、SACN5-49 口腔疾病、AAHA 2019 牙科护理、WSAVA 全球牙科临床准则（繁体中文）、WSAVA 刷牙工具包
- 文档数：主域 5 份（含副域共 6 份）

## 1. 题集

- 文件：`docs/knowledge-base/eval/dentistry/questions.json`
- 题数：7（numeric 4、table 1、zh 1、negative 1）
- 结果：**7/7**；`npm run kb:eval -- --domain dentistry --no-write` exit 0
- 负样本：`dental disease vitamin K requirement` → 0 节 0 表（documentIds 钉住本域 6 份）

## 2. 设计任务

- 场景：G11「牙结石犬：饮食与家庭口腔护理」
- 轨迹：首轮通过：检索 4 次、开表 2 次、引用 13 条、unsupported 0。

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 犬猫通用 | AAHA/SACN5/WSAVA 均为犬猫 |
| 分期 | 牙周病有 0–4 期分级 | SACN5-47 表 47-2 带分期，抽检与原文一致 |
| 主题 | 未见明显错标 | WSAVA 繁体中文 24 节 + 英文 6 节，主题都是牙科 |

抽检方式：`npm run kb:sections -- --domain dentistry --sample 30`。

## 4. 已知缺口

1. WSAVA 准则只有**繁体中文**版（JSAPMandarin），简体查询靠词典与同义匹配，个别词（如"牙结石"vs"牙結石"）可能弱匹配；
2. 该文档被切成 506 节、标题多为句子片段（如"●下顎孔（mandib"），节级导航质量一般；
3. 刷牙工具包只有 1 节、10 段，证据密度低。

## 5. 结论

**可开**。`dentistry.audited = true`；加入生产 `KNOWLEDGE_DOMAINS`。
