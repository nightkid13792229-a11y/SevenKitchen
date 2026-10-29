# AI 添加原料 · 检索方案确认设计

- 日期：2026-10-29
- 状态：已实施（当天）
- 范围：`backend` 原料创建（ingredient-creation）工具/接口、`admin-web` 的 AI 添加原料页
- 不在本期：补剂线、编辑入口、草稿落库

## 1. 要解决的问题

AI 在草稿上「查库 → 收窄 → 写卡 → 写营养」一路自己走，人只能在事后核对。我们希望在**真正落东西之前**插一个人工确认点，但又不能拦住探索——很多方案要先查过才知道该怎么查。

## 2. 结论

**闸门设在「写草稿」之前，不是「查库」之前。**

```
① 探索（自由）   查名字 / 多语种检索 / 汇总 / 读来源 / 问人
② 交方案（停）   proposeSearchPlan：最终搜索词 + 目标库 + 已查到什么 + 想用哪条 + 理由
③ 人确认         可改关键词、可改目标库；确认人固定取当前登录人
④ 写（放行）      writeIngredient / writeNutrition 才允许执行
```

## 3. 规则

| 项 | 规则 |
|---|---|
| 谁能写 | 草稿上存在 `status = APPROVED` 的检索方案时，写工具才放行；`PENDING` 或无方案一律拒绝 |
| 谁能确认 | 只走接口 `POST drafts/:id/search-plan/confirm`，确认人与时间由服务端按当前登录人写；模型没有「确认」工具 |
| 能改什么 | 关键词、目标库、选中的来源记录；审计字段不能改 |
| 目标库 | 白名单 7 个：CFCT / TFDA / USDA / CNF / NZFCD / MEXT / KO_RDA |
| 老草稿 | 一样强制：没有已确认方案就不能写 |
| 重复确认 | 已确认的方案再确认 → 400，不覆盖审计字段 |

## 4. 落地形状

- 草稿 `payload.searchPlan`：`status / keywords[] / libraries[] / findings / chosenRecordId / chosenRecordName / rationale / proposedAt / approvedAt / approvedBy / editedByUser`。
- 新工具 `proposeSearchPlan`：与「问人」同一机制——提交即结束本轮，推 `plan` 事件。
- 新接口 `POST drafts/:id/search-plan/confirm`。
- 页面：方案卡（关键词可增删、目标库可勾选）+「确认并按方案继续」；确认后自动继续一轮。
- 提示词：硬规则加一条；草稿摘要里输出【检索方案·待确认 / 已确认】两种状态。

## 5. 测试

- 领域层 `search-plan.ts`：生成 / 确认 / 校验 / 重复确认。
- 工具层：提交方案、写工具被拒（含 PENDING）、确认后放行、拒绝时不查库。
- 接口层：未登录 401、确认成功、非法目标库 400。
- 前端：`plan` 事件归并、方案卡接线。

## 6. 未做

- 方案卡不支持「重新查」按钮（用户直接在输入框说即可，AI 会重新提）；
- 方案不包含生熟 / 部位收窄（仍由 `askUser` 在探索阶段问）；
- 确认后自动继续那一轮会多一次模型调用（约 2–4 秒）。
