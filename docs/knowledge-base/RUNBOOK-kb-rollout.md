# 知识库灰度与回滚手册

> 适用：SevenKitchen 后端知识库（15 个已审计领域）
> 当前状态（2026-11-10 全库上线）：生产 15 域全开，部署提交 `154e8627`，快速回滚基线见 §1.1。
> 边界域 `other-clinical`（11 份：神经/血液/福利 + 两份不可用法规）**不开放**，不进 `KNOWLEDGE_DOMAINS`。
> 传染病（疫苗）域题集通过但场景未过，**暂不开放**，原因见 `eval/launch-readiness.md` §四。

## 1. 开关

生产配置在 `/opt/sevenkitchen/SevenKitchen/backend/.env`：

```bash
# 当前（15 域全开）
KNOWLEDGE_DOMAINS=ckd,general-nutrition,gi,pancreatitis,oa,dermatology,endocrinology,urology,cardiology,hepatology,oncology,dentistry,reproduction,senior-care,reference
# 可选：AGENT_MAX_TOOL_CALLS=120  AGENT_MAX_RUN_MS=480000
```

### 1.1 回滚基线（逐级）

降级只用改 `.env` 再 `systemctl restart sevenkitchen-backend`，不需要重新部署代码：

1. **全库全开**（当前，15 域）；
2. **去掉 Batch C**：删 `senior-care,reference`（13 域）；注意 `reference` 是"无疾病信号"默认域之一，删掉后通用问题只剩基础营养 + CKD；
3. **去掉 Batch B**：再删 `oncology,dentistry,reproduction`（10 域）；
4. **回到六域基线**：`ckd,general-nutrition,gi,pancreatitis,oa,dermatology`；
5. **最小范围**：`KNOWLEDGE_DOMAINS=ckd`（沿用原手册的"全关"语义）。

改完必须 `sudo systemctl restart sevenkitchen-backend`。

- 只开 CKD：`KNOWLEDGE_DOMAINS=ckd`
- 逐域扩：每次加一个，观察 3–7 天
- 全关：`KNOWLEDGE_DOMAINS=ckd`（不存在"关掉知识库"的开关；CKD 是当前默认）
- 新增域前先确认 `knowledge-domains.ts` 里 `audited: true`，否则服务启动会因 `未审计领域` 直接报错（这是故意的）

## 2. 灰度观察项

每周在生产 backend 目录执行（只读）：

```bash
npx ts-node -r tsconfig-paths/register scripts/knowledge-base/knowledge-usage-report.ts
```

看四个数：

| 指标 | 健康 | 处理 |
|---|---|---|
| 零结果率 | <20% | >30% 连续两周：查 Top 查询，补同义词或确认库未覆盖 |
| 打开失败 | 0 | 任一失败：查 `open_knowledge` 的 citationId 是否过期 |
| 检索/打开比 | 检索 ≥ 打开 | 打开为 0 而检索很多：模型只搜不开，查 prompt |
| 调用量 | 稳定 | 突然归零：确认前端/Agent 是否还在用 |

另查服务日志：

```bash
journalctl -u sevenkitchen-backend -n 200 --no-pager | grep -E "ERROR|知识库|knowledge"
```

## 3. 生产只读冒烟（部署后 / 每周）

```bash
cd /opt/sevenkitchen/SevenKitchen/backend
npx ts-node -r tsconfig-paths/register scripts/knowledge-base/prod-smoke.ts --scope ckd
```

通过线：计数与基线一致、6/6 核心表、20/20 抽节、Stage 3 锚点可回源、负样本 0 节 0 表、p50 <1.5s。

## 4. 回滚

1. 改 `.env` 的 `KNOWLEDGE_DOMAINS` 回上一个值（当前默认 `ckd`）；
2. `sudo systemctl restart sevenkitchen-backend`；
3. 重跑第 3 节冒烟；
4. 在事故记录里写：时间、范围、现象、归因层（数据/检索/工具/Agent/内容）、是否回滚。

**不需要重新部署代码**——范围是运行时配置。

## 5. 已知风险（2026-11-10 v2）

1. **一次性完整食谱设计仍不可用**：默认 80 次、120 次都会耗尽；正确用法是多轮（先规划、再落草稿）。
2. **补剂原料缺目标营养素**：`edit_recipe` 没有目标参数，鸡蛋壳粉/鱼油加不进去；见 `supplement-gap.md`。
3. **主题标签噪声**：目录的 `topics` 有过标注（结论节被标 `iron/staging`），只影响排序，不影响可达。
4. **生产 CKD p50 155.9ms / max 260.6ms**（部署 `154e8627` 实测）；全库 p95 724.6ms。
5. **表格引用是语义裁判盲区**：疫苗/营养标准类问答常由表格支撑，裁判会判 `not_checkable`/`unsupported`；传染病域因此不开放。
6. **整库文档可达率 93.5%**（门槛 95%）：与本次改动无关（A/B 已对照），登记为遗留。

## 6. 扩域检查单

- [ ] 该域题集 `kb:eval --domain <id>` 全过
- [ ] 该域设计场景（问答口径）连续两次通过
- [ ] 30 节目录抽检（物种/分期/主题）
- [ ] `signoff/<id>.md` 写入并提交
- [ ] `knowledge-domains.ts` 的 `audited` 置 true
- [ ] 生产加 `KNOWLEDGE_DOMAINS`，观察一周
