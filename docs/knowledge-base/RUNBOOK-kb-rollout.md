# 知识库灰度与回滚手册

> 适用：SevenKitchen 后端知识库（6 个已审计领域）
> 当前状态（2026-11-10）：生产 `KNOWLEDGE_DOMAINS=ckd,general-nutrition,gi,pancreatitis,oa,dermatology`，部署提交 `5bce9d07`。

## 1. 开关

生产配置在 `/opt/sevenkitchen/SevenKitchen/backend/.env`：

```bash
KNOWLEDGE_DOMAINS=ckd,general-nutrition,gi,pancreatitis,oa,dermatology
# 可选：AGENT_MAX_TOOL_CALLS=120  AGENT_MAX_RUN_MS=480000
```

改完必须 `sudo systemctl restart sevenkitchen-backend`。

- 只开 CKD：`KNOWLEDGE_DOMAINS=ckd`
- 逐域扩：每次加一个，观察 3–7 天
- 全关：`KNOWLEDGE_DOMAINS=ckd`（不存在"关掉知识库"的开关；CKD 是当前默认）

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

## 5. 已知风险（2026-11-10）

1. **一次性完整食谱设计仍不可用**：默认 80 次、120 次都会耗尽；正确用法是多轮（先规划、再落草稿）。
2. **补剂原料缺目标营养素**：`edit_recipe` 没有目标参数，鸡蛋壳粉/鱼油加不进去；见 `supplement-gap.md`。
3. **主题标签噪声**：目录的 `topics` 有过标注（结论节被标 `iron/staging`），只影响排序，不影响可达。
4. **生产 CKD p95 360–391ms**：高于本地 300ms 目标、低于 1.5s 上线门槛。

## 6. 扩域检查单

- [ ] 该域题集 `kb:eval --domain <id>` 全过
- [ ] 该域设计场景（问答口径）连续两次通过
- [ ] 30 节目录抽检（物种/分期/主题）
- [ ] `signoff/<id>.md` 写入并提交
- [ ] `knowledge-domains.ts` 的 `audited` 置 true
- [ ] 生产加 `KNOWLEDGE_DOMAINS`，观察一周
