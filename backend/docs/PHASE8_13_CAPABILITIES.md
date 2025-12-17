# Phase 8.13 Capabilities & Non-Goals

**Phase:** Inventory Deduction (Kitchen → Inventory Write-back)  
**状态：** ⏳ PENDING VERIFY  
**日期：** 2025-12-17

---

## Capabilities (系统能够做什么)

### 1. Inventory Deduction from Kitchen Tasks
- **能力：** 当 PackagingUnit 状态变为 COMPLETED 时，自动触发库存扣减
- **数据源：** 使用 `PackagingUnit.ingredientsUsageSnapshot.actual_g`（实际使用量）
- **关键特性：**
  - 不读取可变的 Recipe 表或 Ingredient 表
  - 严格遵循快照完整性原则
  - 使用实际使用量，而非计划使用量

### 2. Append-Only Ledger Pattern
- **能力：** 使用不可变的 ledger 条目记录所有库存变更
- **实现：** `InventoryLedgerEntry` 表存储所有变更历史
- **优势：**
  - 完整的审计追踪
  - 支持历史时点查询
  - 余额从 ledger 派生（SUM(delta_g)），不存储

### 3. DB-Level Idempotency Guarantee
- **能力：** 数据库级别的唯一约束防止重复扣减
- **实现：** `@@unique([sourceType, sourceId, ingredientId])`
- **特性：**
  - 同一 PackagingUnit 的同一原料只能扣减一次
  - Repository 使用 `skipDuplicates: true` 优雅处理冲突
  - 支持安全重试

### 4. Correct Trigger Sequence
- **能力：** 确保状态转换和扣减的正确顺序
- **实现：**
  1. 先持久化 PackagingUnit（status + snapshot）
  2. 再调用 InventoryService.deductFromKitchenTask()
- **错误处理：** 扣减失败不影响 COMPLETED 状态，允许手动重试

### 5. Retry Mechanism
- **能力：** 提供 Admin API 端点用于重试扣减
- **端点：** `POST /api/v1/admin/inventory/deductions/retry/:packagingUnitId`
- **特性：** 幂等操作，已扣减的任务不会重复扣减

### 6. Balance Calculation
- **能力：** 从 ledger 派生当前库存余额
- **实现：** `SUM(delta_g) WHERE ingredient_id = ?`
- **特性：** 余额不存储，始终从 ledger 计算

---

## Non-Goals (明确不在范围内)

### 1. Purchasing / Replenishment
- **不在范围：** 不处理采购或补货
- **原因：** Phase 8.13 专注于扣减，不涉及库存增加
- **未来：** 后续阶段可能添加采购功能

### 2. Cost Accounting
- **不在范围：** 不计算库存成本
- **原因：** MVP 阶段专注于数据记录
- **未来：** 后续阶段可能添加成本核算

### 3. Expiry / Batch / Lot Tracking
- **不在范围：** 不跟踪原料批次、有效期
- **原因：** MVP 阶段简化实现
- **未来：** 食品安全追溯可能需要批次跟踪

### 4. Supplier Integration
- **不在范围：** 不集成供应商系统
- **原因：** MVP 阶段专注于内部流程
- **未来：** 后续阶段可能添加供应商对接

### 5. Forecasting
- **不在范围：** 不进行库存预测
- **原因：** MVP 阶段专注于实际扣减记录
- **未来：** 后续阶段可能添加预测功能

### 6. UI for Inventory
- **不在范围：** 不提供库存管理 UI
- **原因：** Phase 8.13 是后端实现
- **未来：** 后续阶段可能添加管理界面

### 7. Stock Alerts / Low Stock Warnings
- **不在范围：** 不提供库存预警
- **原因：** MVP 阶段专注于核心扣减功能
- **未来：** 后续阶段可能添加预警功能

### 8. Multi-Warehouse / Location Tracking
- **不在范围：** 不支持多仓库或多位置
- **原因：** MVP 阶段假设单一仓库
- **未来：** 后续阶段可能添加多仓库支持

### 9. Inventory Adjustments (Manual)
- **不在范围：** 不提供手动库存调整功能
- **原因：** Phase 8.13 专注于厨房任务触发的扣减
- **未来：** 后续阶段可能添加手动调整功能

### 10. Real-Time Stock Updates
- **不在范围：** 不提供实时库存更新通知
- **原因：** MVP 阶段专注于数据记录
- **未来：** 后续阶段可能添加实时通知

---

## Technical Constraints

### Database Constraints
- `InventoryLedgerEntry` 表有唯一约束：`@@unique([sourceType, sourceId, ingredientId])`
- `deltaG` 可以为正（增加）或负（扣减）
- 所有字段为 NOT NULL（除了未来可能添加的可选字段）

### Domain Constraints
- 扣减必须基于 `ingredientsUsageSnapshot.actual_g`
- 不能读取可变的 Recipe 或 Ingredient 表
- Ledger entries 创建后不可修改（immutability）

### API Constraints
- Retry 端点是幂等的
- 扣减失败不影响 PackagingUnit 状态
- 所有错误都有明确的错误消息

### Integration Constraints
- 扣减触发必须在 PackagingUnit 状态持久化之后
- 扣减失败必须记录日志，但不抛出异常（避免影响状态转换）

---

## Architecture Compliance

### 07_Core_Architecture.md
- ✅ **Snapshot Integrity:** 仅使用 `ingredientsUsageSnapshot.actual_g`，不读 Recipe 表
- ✅ **Append-only Accounting:** 使用 ledger 模式，不修改存量数据
- ✅ **Domain Ownership:** Inventory 是独立领域，Kitchen 请求扣减，Inventory 决定如何记录

### 04_Domain_Model_and_Algorithms.md
- ✅ **使用 actual_g:** 符合文档要求，使用实际使用量而非计划使用量
- ✅ **Ledger Pattern:** 符合 append-only 会计模式

### 05_API_Specs.md
- ✅ **Admin API:** Retry 端点符合现有 Admin API 模式

---

## Future Enhancements (Not in MVP)

以下功能不在 Phase 8.13 MVP 范围内，但可能是后续阶段的目标：

1. **Purchasing Integration:** 采购完成后自动增加库存
2. **Cost Calculation:** 库存成本核算
3. **Batch/Lot Tracking:** 原料批次和有效期跟踪
4. **Multi-Warehouse:** 多仓库支持
5. **Stock Alerts:** 低库存预警
6. **Manual Adjustments:** 手动库存调整
7. **Inventory Reports:** 库存报表和分析
8. **Supplier Integration:** 供应商系统对接
9. **Forecasting:** 库存预测
10. **Real-Time Updates:** 实时库存更新通知

---

**文档版本：** 1.0  
**最后更新：** 2025-12-17  
**Phase 8.13 状态：** ⏳ PENDING VERIFY
