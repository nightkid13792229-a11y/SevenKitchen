# Phase 8.12 Capabilities & Non-Goals

**Phase:** Kitchen Task Data Capture MVP  
**状态：** ✅ ACCEPTED  
**日期：** 2025-12-17

---

## Capabilities (系统能够做什么)

### 1. Kitchen Task Tracking via PackagingUnit
- **能力：** 将 `PackagingUnit` 扩展为厨房任务载体
- **实现：** 每个 `PackagingUnit` 代表一个生产任务，包含完整的任务状态和数据
- **用途：** 厨房可以查看、更新和管理生产任务

### 2. Status Transitions
- **能力：** 支持任务状态转换
- **状态流：** `PENDING` → `IN_PROGRESS` → `COMPLETED`
- **验证：** Domain 层状态机验证，防止非法转换
- **实现：** `PackagingUnit.transitionTo()` 方法

### 3. Ingredient Usage Snapshot Capture
- **能力：** 捕获实际原料使用量
- **数据结构：** `ingredientsUsageSnapshot: { [ingredientId]: { required_g, actual_g } }`
- **关键特性：**
  - Required weights 从 `recipeSnapshot` 计算（快照完整性）
  - Actual weights 由厨房人员录入
  - 历史数据不可变（基于订单创建时的快照）

### 4. Photo URL Capture
- **能力：** 存储生产过程的照片 URL
- **类型：**
  - `photosRaw`: 原料照片
  - `photosCooked`: 烹饪后照片
  - `photosPortioned`: 分装后照片
- **格式：** String[] (URL 数组)
- **用途：** 溯源和质量追溯

### 5. Snapshot-Based Required Weight Calculation
- **能力：** 从不可变的 `recipeSnapshot` 计算所需重量
- **实现：** `KitchenService.updateTask()` 从 `recipeSnapshot.items[].ratio` 计算
- **公式：** `required_g = totalProductionG * (ratio / 100)`
- **关键：** 不读取可变的 `Recipe` 表，确保历史准确性

### 6. Staff Kitchen API Endpoints
- **能力：** 提供完整的 Staff Kitchen API
- **端点：**
  - `GET /api/v1/staff/kitchen/batches?status=...` - 按状态列出批次
  - `GET /api/v1/staff/kitchen/batches/:batchId` - 获取批次详情和任务
  - `POST /api/v1/staff/kitchen/tasks/:taskId` - 更新任务（使用量、照片、状态）
- **认证：** 需要 Staff 角色（当前 MVP 未实现 RBAC，但 API 结构已就绪）

### 7. Batch Filtering by Task Status
- **能力：** 按 PackagingUnit 状态过滤批次
- **实现：** `ProductionBatchRepository.findBatchesByPackagingUnitStatus()`
- **用途：** 厨房可以查看"待处理"、"进行中"、"已完成"的任务

---

## Non-Goals (明确不在范围内)

### 1. Inventory Deduction
- **不在范围：** 不执行库存扣减
- **原因：** 根据 `docs/04_Domain_Model_and_Algorithms.md`，库存扣减必须基于 `actual_weight_g`，且需要独立的 InventoryService
- **未来：** Phase 8.13+ 可能实现

### 2. Cost Accounting
- **不在范围：** 不计算生产成本
- **原因：** MVP 专注于数据捕获，不涉及财务计算
- **未来：** 后续阶段可能添加成本核算

### 3. Permission / RBAC (Role-Based Access Control)
- **不在范围：** 不实现细粒度的权限控制
- **当前状态：** API 端点存在，但未实现 Staff 角色验证
- **原因：** MVP 阶段，权限验证留待后续实现
- **未来：** 需要实现 Staff vs Admin vs Customer 的角色区分

### 4. File Uploads
- **不在范围：** 不处理文件上传
- **当前实现：** API 仅接受照片 URL（String[]）
- **原因：** MVP 阶段，假设照片已上传到外部存储（S3/OSS等）
- **未来：** 需要实现文件上传端点

### 5. Multi-Day Production Logic
- **不在范围：** 不处理跨天生产逻辑
- **当前实现：** 每个 ProductionBatch 对应一个生产日期
- **限制：** 不支持一个任务跨多天完成
- **未来：** 可能需要支持长期生产任务

### 6. Real-Time Notifications
- **不在范围：** 不发送实时通知
- **原因：** MVP 专注于数据捕获，不涉及通知系统
- **未来：** 可能需要通知管理员任务状态变更

### 7. Task Assignment / Workload Distribution
- **不在范围：** 不分配任务给特定员工
- **当前实现：** 任务属于批次，不关联具体员工
- **未来：** 可能需要任务分配和员工工作量追踪

### 8. Production Quality Validation
- **不在范围：** 不验证生产质量
- **当前实现：** 仅捕获数据，不进行质量检查
- **未来：** 可能需要质量标准和验证流程

### 9. Batch Merging / Splitting
- **不在范围：** 不支持批次合并或拆分
- **当前实现：** 批次创建后不可修改（immutability）
- **原因：** 保持数据完整性和审计追踪

### 10. Historical Data Modification
- **不在范围：** 不允许修改已提交的任务数据
- **当前实现：** 任务数据可以更新，但应遵循状态机规则
- **未来：** 可能需要更严格的审计日志

---

## Technical Constraints

### 数据库约束
- `updated_at` 为 NOT NULL（使用 `@updatedAt` 指令）
- `status` 有默认值 `PENDING`
- 照片数组默认为空数组 `[]`

### 领域约束
- 状态转换必须遵循状态机规则
- Required weights 必须从 `recipeSnapshot` 计算
- `PackagingUnit` 作为任务载体，不可删除（通过 ProductionBatch 级联删除）

### API 约束
- 所有 Staff Kitchen API 需要认证（当前未实现，但结构已就绪）
- 任务 ID 映射到 `PackagingUnit.id`
- 照片 URL 必须是有效的 URL 字符串数组

---

## Future Enhancements (Not in MVP)

以下功能不在 Phase 8.12 MVP 范围内，但可能是后续阶段的目标：

1. **Inventory Integration:** 基于 `actual_weight_g` 的库存扣减
2. **Cost Calculation:** 生产成本核算
3. **File Upload:** 照片文件上传端点
4. **RBAC:** 细粒度权限控制
5. **Notifications:** 任务状态变更通知
6. **Analytics:** 生产效率和原料使用分析
7. **Mobile App:** 厨房移动端应用
8. **Barcode Scanning:** 原料条码扫描
9. **Temperature Logging:** 烹饪温度记录
10. **Batch Templates:** 生产批次模板

---

**文档版本：** 1.0  
**最后更新：** 2025-12-17  
**Phase 8.12 状态：** ✅ ACCEPTED
