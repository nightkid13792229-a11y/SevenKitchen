# Phase 8.10: Production & Packaging MVP - 能力边界声明

**版本：** 1.0  
**日期：** 2025-12-16  
**状态：** 已实现并验收

---

## 目的

本文档明确 Phase 8.10（Production & Packaging MVP）的能力边界，作为产品/工程共识，用于：
- 明确当前系统能做什么、不能做什么
- 避免功能范围蔓延
- 指导下一阶段规划

---

## ✅ 能做什么（Capabilities）

### 1. 生产批次创建
- ✅ 从 PAID 订单创建生产批次（`ProductionBatch`）
- ✅ 支持指定订单 ID 列表，或自动包含所有 PAID 订单
- ✅ 按生产日期（`productionDate`）组织批次

### 2. 订单项聚合
- ✅ 按 `recipeSnapshotId` 分组订单项（`OrderItem`）
- ✅ 聚合 `dailyIntakeG` 为 `totalProductionG`（每个食谱的总生产克数）
- ✅ 保留订单项追溯链（`sourceOrderItemIds`）

### 3. 数据持久化
- ✅ 生产批次和包装单元（`PackagingUnit`）持久化到 PostgreSQL
- ✅ 使用 Prisma ORM，支持事务
- ✅ 快照不可变性：`RecipeSnapshot` 在批次创建时捕获，后续 Recipe 更新不影响已创建批次

### 4. API 接口
- ✅ `POST /api/v1/admin/production-batches` - 创建生产批次
- ✅ `GET /api/v1/admin/production-batches/:id` - 获取批次详情
- ✅ 返回完整追溯信息（`sourceOrderItemIds`、`orderItemCount`、`totalProductionG`）

### 5. 数据完整性
- ✅ 批次级 `orderItemCount` 正确计算（所有 packagingUnits 的 orderItemCount 之和）
- ✅ `sourceOrderItemIds` 始终为 `string[]` 类型
- ✅ 状态机：`PLANNED` → `IN_PRODUCTION` → `COMPLETED`（仅状态转换，无业务逻辑）

---

## ❌ 不能做什么（Explicit Non-goals）

### 1. 订单分配追踪
- ❌ **不追踪订单是否已分配给批次**
  - 如果 `orderIds` 未提供，会包含所有 PAID 订单（可能重复包含）
  - 无“已分配/未分配”状态标记

### 2. 多天生产逻辑
- ❌ **不支持多天生产计划**
  - 算法假设 1 天生产（不考虑 `packageCount` 作为天数）
  - 无跨日调度优化

### 3. 库存管理
- ❌ **无库存扣减**
  - 不计算所需原料数量
  - 不扣减库存
  - 不检查库存可用性

### 4. 生产任务分配
- ❌ **无生产任务（ProductionTask）分配**
  - 不将 `PackagingUnit` 分解为具体任务
  - 无任务状态管理

### 5. 批次状态推进
- ❌ **无自动状态推进逻辑**
  - 状态转换仅存在于 domain 层，无应用层自动推进
  - 无状态变更触发器或工作流

### 6. 排产优化
- ❌ **无排产优化算法**
  - 不优化批次大小
  - 不考虑设备容量
  - 不考虑人员配置

### 7. 权限与审计
- ❌ **无权限控制**
  - Admin 端点无角色/权限检查（仅依赖 JWT）
  - 无操作审计日志

### 8. 实际生产数据
- ❌ **无实际生产数据记录**
  - 不记录实际投料重量（`actual_weight_g`）
  - 不记录生产照片
  - 不记录生产时间戳

### 9. 前端集成
- ❌ **无前端/小程序集成**
  - 仅后端 API，无 UI 组件
  - 无生产批次列表页面
  - 无批次详情展示

---

## 技术约束

### 数据库
- 仅支持 PostgreSQL（通过 Prisma）
- 无文件存储或内存模式（与 Order/Address/Dog 不同）

### API 范围
- 仅 Admin 级别端点
- 无 Customer 级别端点（客户无法查看生产批次）

### 测试覆盖
- 单元测试覆盖核心逻辑（6 个测试）
- 无集成测试或 E2E 测试

---

## 使用场景

### ✅ 适用场景
1. **生产计划制定**：将 PAID 订单组织为生产批次
2. **追溯查询**：通过 `sourceOrderItemIds` 追溯订单项来源
3. **生产量统计**：通过 `totalProductionG` 了解每个食谱的生产量
4. **批次管理**：创建、查询生产批次基本信息

### ❌ 不适用场景
1. **实际生产执行**：需要记录实际投料、照片、时间戳
2. **库存管理**：需要扣减库存、检查可用性
3. **排产优化**：需要优化批次大小、设备分配
4. **多天生产**：需要支持跨日生产计划
5. **任务分配**：需要将批次分解为具体任务

---

## 下一阶段建议

**Next Phase Candidate:** Phase 8.11 Allocation Lock

建议实现订单分配锁定机制，避免订单被重复包含到多个批次中。

---

**维护者：** Phase 8.10 实现团队  
**审核状态：** 已验收  
**最后更新：** 2025-12-16
