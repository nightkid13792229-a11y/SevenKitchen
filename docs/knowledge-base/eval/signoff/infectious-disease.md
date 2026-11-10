# 领域签字：infectious-disease（传染病与免疫）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §3 自签；人工只需抽查域划分与签字）
- 范围：AAHA 2022 犬免疫、WSAVA 2024 免疫、ACVIM 2018 莱姆病、ACVIM 2023 钩端螺旋体、ACVIM 2015 抗菌药（中国法规两份已改归边界域）
- 文档数：主域 5 份（含副域共 5 份）

## 1. 题集

- 文件：`docs/knowledge-base/eval/infectious-disease/questions.json`
- 题数：7（numeric 4、table 1、zh 1、negative 1）
- 结果：**7/7**；`npm run kb:eval -- --domain infectious-disease --no-write` exit 0
- 负样本：`vaccine vitamin K requirement` → 0 节 0 表（documentIds 钉住本域 5 份）

## 2. 设计任务

- 场景：G12「幼犬免疫：核心疫苗必要性 + 钩端螺旋体适用情形」
- 轨迹：**4 轮全部未通过**（见下）。

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 犬为主 | AAHA/WSAVA 犬、ACVIM 莱姆犬猫、ACVIM 钩端犬 |
| 分期 | 不适用 | 无分期门槛 |
| 主题 | 未见明显错标 | 疫苗/莱姆/钩端/抗菌药分布合理 |

抽检方式：`npm run kb:sections -- --domain infectious-disease --sample 30`。

## 4. 已知缺口

1. **场景 4 轮未过，失败点全部集中在"表格引用"**：疫苗答案天然由 WSAVA Table 1/3 支撑，而语义裁判对表格类 K 时而判 not_checkable（5 条）、时而判 unsupported（1–4 条），同一份回答两次结论不同；
2. 首版问"核心疫苗有哪些 + 钩端要不要打" → 2 轮未过；改成"为什么必须打 / 什么情况建议打" → 2 轮仍未过，说明不是题面问题，是表格引用裁判问题；
3. 因此本域**不开放**：不是证据找不到（L1 题集 7/7 全过），是"无法验证"。
4. 中国两部法规文档解析不可用（动物防疫法 100 节标题为单字、狂犬病规范 0 节），已改归边界域。

## 5. 结论

**暂不开放**。`infectious-disease.audited = false`：L1 题集 7/7 全过，但设计场景 4 轮未通过，按「L2 不过、不扩病种」不发。待语义裁判支持表格引用后复审。
