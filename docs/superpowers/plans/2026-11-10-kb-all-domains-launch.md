# 知识库全领域上线实施计划（v3）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把知识库从"6 个领域 / 23 份文档"推进到"159 份文档全部映射、12–16 个领域全部审计签字、生产全量开启"，并完成灰度判定。

**Architecture:** 沿用"图书馆"约定——馆藏只放原文，题集是读者测试、不进运行时。域 = 检索范围 + 路由目的地 + 发布开关 + 验收单位。先做"库内生检查"（完整性/可达性/引用有效性），再补少量语义守门题；按域分批审计、分批开生产。

**Tech Stack:** NestJS + TypeScript + Prisma/PostgreSQL + ts-node + 真实 Agent HTTP API + 生产只读冒烟。

**Spec:** `docs/knowledge-base/2026-11-09-kb-testing-design.md` + `docs/superpowers/plans/2026-11-10-kb-full-library.md`（v2，已完成部分）。

---

## 0. 什么叫"全开所有域"

不是"把开关全打开"，而是三件事同时成立：

1. **馆藏全覆盖**：159 份文档每一份都归入至少一个域（或明确标为"参考库/不开放"），没有孤儿文档；
2. **每域已审计**：题集（5–8 道）+ 1 个真实场景 + 30 节目录抽检 + 签字文件；
3. **生产全开**：`KNOWLEDGE_DOMAINS` 打开全部已审计域，生产冒烟通过，灰度有真实流量支撑。

**硬线**：未审计文档不开；生产只读验证，不建测试账号；题集不进提示词/检索。

---

## 1. 现状（2026-11-10）

| 项 | 状态 |
|---|---|
| 主分支 | `420a421c`（判定表、签字、场景均为文档，已合并） |
| 生产 | `5bce9d07`，六域全开，健康 |
| 领域 | 6 个：ckd、general-nutrition、gi、pancreatitis、oa、dermatology |
| 文档 | 159 份中已映射 **23 份**（去重后） |
| 题集 | 70 道（26/10/10/9/7/8） |
| L2 | D1–D4、D7、G1–G5 通过；D5 一次性设计失败、D6 补剂阻塞 |
| 灰度 | 部署后真实调用 **0** 次（35 次均为 11-08 旧数据） |
| 已有资产 | `eval/*/questions.json`、`design-scenarios.json`、`signoff/*.md`、`launch-readiness.md`、`RUNBOOK-kb-rollout.md` |

**已知不解决项**（不要在本计划里修）：补剂目标营养素缺失（`supplement-gap.md`）、一次性完整设计（需多轮）、主题标签噪声、UI。

---

## 2. 领域划分（目标 12–16 个域）

在现有 6 域基础上，按文档来源和临床主题补域。最终以 T1 的映射结果为准；单域文档 <3 份的并入相邻域或标为"边界域"。

| 域 | 主要文档来源（示例） | 预估文档 | 批次 |
|---|---|---|---|
| ckd | SACN5-37、IRIS×3、AAHA 2021 | 5 | 已有 |
| general-nutrition | AAHA 2010/2014/2019/2021 | 4 | 已有 |
| gi | ACVIM 2022/2023/2026/2018、SACN5-57/62 | 6 | 已有 |
| pancreatitis | ACVIM 2021 猫、SACN5-67 | 2 | 已有 |
| oa | SACN5-33/34、AAHA 2022 疼痛 | 3 | 已有 |
| dermatology | SACN5-31/32、MERCK×2 | 4 | 已有 |
| **endocrinology** | AAHA 2018 糖尿病、SACN5 内分泌章节、ACVIM 内分泌共识 | 待映射 | A |
| **urology** | ACVIM 2016 尿石症、SACN5 FLUTD 章节 | 待映射 | A |
| **cardiology** | ACVIM 心血管/心肾轴、SACN5 心脏章节 | 待映射 | A |
| **hepatology** | SACN5 肝胆章节、ACVIM 肝病 | 待映射 | A |
| **oncology** | SACN5 肿瘤章节、WSAVA 肿瘤立场 | 待映射 | B |
| **dentistry** | AAHA 2019 牙科、WSAVA 牙科、SACN5 牙科章节 | 待映射 | B |
| **infectious-disease** | AAHA 2022 疫苗、WSAVA 疫苗、SACN5 免疫章节 | 待映射 | B |
| **reproduction** | WSAVA 生殖指南、SACN5 繁殖章节 | 待映射 | B |
| **senior-care** | AAHA 2023 老年护理、生命阶段（与基础营养重叠） | 待映射 | C |
| **reference** | NRC 2006、FEDIAF 2025、CN 法规、ASPCA | 5 | C |

### 2.1 默认范围（关键决策）

无疾病信号的通用查询（如"狗一天喝多少水"）**不要查全部 159 份**，否则噪声会淹没营养文档。建议：

```ts
DEFAULT_DOMAINS = ['general-nutrition', 'reference', 'ckd']
```

有疾病信号时按 `detectQueryDomains` 路由到对应域；只有显式"查全库"才用 union。此规则在 `knowledge-scope.ts` 增加 `defaultScope()`，工具层在无信号时使用。

---

## 3. 每域审计流水线（1–1.5 天/域）

1. **映射**：把候选文档写入 `knowledge-domains.ts`；打开 20 节确认能读。
2. **题集**：5–8 道，必须含 1 道负样本（`documentIds` 钉住本域）、1 道中文、有表格的域加 1 道表题。期望只写"证据位置"。
3. **场景**：1 个问答口径的真实 Agent 场景（不改草稿、不跑评估），域名进 `design-scenarios.json`。
4. **抽检**：30 节看物种/分期/主题；主题噪声记录，不阻断。
5. **签字**：写 `eval/signoff/<domain>.md`（题集、场景、抽检、已知缺口、结论），`audited: true`。
6. **生产**：加入 `KNOWLEDGE_DOMAINS`，跑只读冒烟 + 该域题集。

---

## 4. 批次与工期

| 批次 | 域 | 工程/内容量 | 日历 |
|---|---|---|---|
| A | 内分泌、泌尿、心脏、肝胆 | 4 域 × 1–1.5 天 | 约 1 周 |
| B | 肿瘤、牙科、疫苗、生殖 | 4 域 × 1–1.5 天 | 约 1 周 |
| C | 老年、参考库 + 收尾 | 2 域 + 全量回归 | 约 1 周 |
| 灰度 | 生产全开观察 | 每周一次 usage | 2 周 |

合计约 3–4 周 Agent 执行时间；人工只需确认域划分与签字抽查。

---

## 5. 任务

### Task 1: 生成并复核域映射

**Files:**
- Create: `backend/scripts/knowledge-base/propose-domains.ts`
- Generated: `docs/knowledge-base/eval/domain-map.json`
- Modify: `backend/src/domain/knowledge/knowledge-domains.ts`

**Interfaces:**
- 脚本输出 `{ generatedAt, documents: [{ id, title, sourceId, candidateDomains: string[], reason }] }`
- 分类规则：来源（SACN5 章节标题/正文关键词、ACVIM 文件名、AAHA 文件名、WSAVA 文件名）+ 现有 `detectTopics`。
- 人工/Agent 复核后写 `domain-map.json`，每份文档恰好一个主域 + 可选副域。

- [ ] 写脚本，跑全量 159 份，输出候选域与理由；
- [ ] 逐条复核：重点看 `candidateDomains` 为空或多于 2 个的文档；
- [ ] 写 `domain-map.json`，统计每域文档数；
- [ ] 单域 <3 份的并入相邻域或在计划里标"边界域"；
- [ ] 把最终文档清单写进 `knowledge-domains.ts`（含新域）；
- [ ] 提交：`test(knowledge): 全库域映射`。

**Acceptance:** 159/159 有归属；无域文档数为 0；每域文档数与 `domain-map.json` 一致。

---

### Task 2: 默认范围与路由

**Files:**
- Modify: `backend/src/domain/knowledge/knowledge-scope.ts`
- Modify: `backend/src/application/recipe-designer/agent/tools.ts`
- Test: `backend/tests/domain/knowledge/knowledge-scope.spec.ts`

**Interfaces:**
- `defaultScope(): KnowledgeScope`：`general-nutrition + reference + ckd`（可用环境变量 `KNOWLEDGE_DEFAULT_DOMAINS` 覆盖）。
- 工具层：无疾病信号时用 `defaultScope()`，有信号时用 `scopeByQueryDomain`。

- [ ] 先写测试：无信号查询的文档集合 = 默认域文档；有信号 = 对应域；
- [ ] 实现 `defaultScope()`；
- [ ] 工具层接入；
- [ ] 跑 `kb:eval:all` 确认六域不退化；
- [ ] 提交：`feat(knowledge): 无信号查询使用默认营养域`。

---

### Task 3: Batch A 审计（内分泌/泌尿/心脏/肝胆）

**Files:**
- Create: `docs/knowledge-base/eval/<domain>/questions.json`（4 个）
- Create: `docs/knowledge-base/eval/signoff/<domain>.md`（4 个）
- Modify: `docs/knowledge-base/eval/design-scenarios.json`（4 个场景）
- Modify: `backend/src/domain/knowledge/knowledge-domains.ts`（audited=true）

**每个域按 §3 流水线执行，命令：**

```bash
cd backend
npm run kb:eval -- --domain <domain> --no-write
KB_EVAL_SCOPE=env KNOWLEDGE_DOMAINS=<现有+新域> npm run kb:eval -- --domain <domain> --no-write
```

- [ ] endocrinology：题集 + 场景 + 抽检 + 签字；
- [ ] urology：同上；
- [ ] cardiology：同上；
- [ ] hepatology：同上；
- [ ] `npm run kb:eval:all` 全过；
- [ ] 提交：`test(knowledge): Batch A 四域审计`。

**Acceptance:** 4 域题集全过（含负样本）；4 个场景通过；签字文件齐全；union scope 也通过。

---

### Task 4: 合并、部署、开 Batch A

- [ ] `bash scripts/session.sh merge`；
- [ ] `bash backend/scripts/remote_deploy_v2.sh`；
- [ ] 生产 `.env` 增加 4 个域，重启；
- [ ] 生产跑 4 域题集 + `prod-smoke`；
- [ ] 记录延迟与零结果率基线。

**Acceptance:** 生产健康；4 域题集全过；冒烟通过；无 ERROR。

---

### Task 5: Batch B 审计（肿瘤/牙科/疫苗/生殖）

同 Task 3，4 个域；命令与验收一致。

- [ ] 四域题集 + 场景 + 签字；
- [ ] `kb:eval:all` 全过；
- [ ] 合并、部署、生产开域；
- [ ] 提交：`test(knowledge): Batch B 四域审计`。

---

### Task 6: Batch C（老年/参考库）+ 全量回归

- [ ] senior-care：题集 + 场景 + 签字；
- [ ] reference：NRC/FEDIAF/法规；只做可达性与引用题，不写临床结论；
- [ ] `kb:eval:all` 全过；
- [ ] `kb:coverage --scope all` 全量可达性；
- [ ] `kb:bench --scope all` p95 ≤1.5s；
- [ ] 更新 `eval/launch-readiness.md`（v2）；
- [ ] 提交：`test(knowledge): Batch C 与全量回归`。

---

### Task 7: 生产全开与灰度

- [ ] 生产 `KNOWLEDGE_DOMAINS` 打开全部已审计域；
- [ ] 重启，健康检查；
- [ ] 生产跑全量题集（`KB_EVAL_SCOPE=env`）；
- [ ] `prod-smoke` 通过；
- [ ] 按 `RUNBOOK-kb-rollout.md` 每周记录 usage；
- [ ] 观察零结果率、打开失败、延迟；连续两周达标后更新判定表。

**Acceptance:** 全域名生产可查；冒烟通过；两周观察有数据（无流量则明确记录"未验证"）。

---

## 6. 验收标准（v3）

| # | 项 | 目标 |
|---|---|---|
| 1 | 文档映射 | 159/159 |
| 2 | 领域数 | ≥12，全部 audited |
| 3 | 每域题集 | 全过（含负样本 100%） |
| 4 | 每域场景 | 1 个通过；CKD 保留 D1–D4、D7 |
| 5 | 签字文件 | 每域一份，含 30 节抽检与已知缺口 |
| 6 | 生产 | 全域名可查，冒烟通过 |
| 7 | 全库 p95 | ≤1.5s |
| 8 | 灰度 | 两周真实流量数据（或明确"未验证"） |
| 9 | 判定表 | 更新并归档 |

---

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 文档质量参差（WSAVA/多栏 PDF） | 每域 30 节抽检；垃圾节过滤已上线 |
| 域越开越多，噪声上升 | 默认范围限定营养域；查询路由 |
| 审计工作量大 | 5–8 题/域；自动检查优先；分批 |
| 跨域重复（同一文档多域） | 主域 + 副域；生产 scope 去重 |
| 补剂/一次性设计仍不可用 | 不在本计划；D7 多轮为正式口径 |
| 灰度无流量 | 记录"未验证"，不伪造；等真实使用 |

---

## 8. 不在本计划内

- 补剂营养目标修复（`supplement-gap.md`，独立产品任务）；
- 一次性完整设计的策略改造；
- UI/小程序/后台展示；
- 临床结论自动裁判；
- 向量检索/重排（除非基准不达标）。

---

## 附录：常用命令

```bash
# 开工位
cd /Users/zhaochen/Documents/SevenKitchen
bash scripts/session.sh start "kb-all-domains" --slug kb-all-domains

# 合并后必须
cd backend && npx prisma generate

# 六域/全量题集
npm run kb:eval:all
npm run kb:coverage -- --scope all
npm run kb:bench -- --scope all

# 生产只读冒烟
ssh ... 'cd /opt/sevenkitchen/SevenKitchen/backend && \
  npx ts-node -r tsconfig-paths/register scripts/knowledge-base/prod-smoke.ts --scope ckd'

# 生产用量
ssh ... 'cd /opt/sevenkitchen/SevenKitchen/backend && \
  npx ts-node -r tsconfig-paths/register scripts/knowledge-base/knowledge-usage-report.ts'
```
