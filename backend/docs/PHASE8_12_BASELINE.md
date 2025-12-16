# Phase 8.12 Baseline - Kitchen Task Data Capture MVP

**生成时间：** 2025-12-17 00:40:30 CST  
**用途：** 用于后续对齐与回滚定位的基线快照

---

## Repository 状态

### Git 信息
- **Commit Hash:** `6334a23964e1d599f1caeae0bc3088b0161c5671`
- **分支名:** `main`
- **基线时间:** 2025-12-17 00:40:30 CST

### Prisma Migration
- **Phase 8.12 Migration:** `20251216161937_add_kitchen_task_fields_to_packaging_unit`
- **Migration 路径:** `backend/prisma/migrations/20251216161937_add_kitchen_task_fields_to_packaging_unit/`
- **相关 Migrations:**
  - `20251216133724_add_production_batch_and_packaging_unit` (Phase 8.10)
  - `20251216151402_add_allocation_lock_to_order_item` (Phase 8.11)
  - `20251216161937_add_kitchen_task_fields_to_packaging_unit` (Phase 8.12)

### 验证状态
- **Build:** ✅ PASS (`pnpm run build`)
- **Tests:** ✅ PASS (`kitchen.service.spec.ts` - 9 tests)
- **Migration:** ✅ FIXED (safe multi-step approach for `updated_at` column)

---

## 关键文件清单

### Domain 层
- `backend/src/domain/production/enums.ts` (新增 `PackagingUnitStatus` 枚举)
- `backend/src/domain/production/packaging-unit.entity.ts` (扩展任务字段：status, ingredientsUsageSnapshot, photos)
- `backend/src/domain/production/production.repository.ts` (新增 3 个方法：findPackagingUnitById, updatePackagingUnit, findBatchesByPackagingUnitStatus)
- `backend/src/domain/production/index.ts` (导出 `IngredientsUsageSnapshot` 类型)

### Infrastructure 层
- `backend/src/infrastructure/repositories/prisma-production.repository.ts` (实现新 repository 方法，处理新字段映射)

### Application 层
- `backend/src/application/kitchen/kitchen.service.ts` (新建 - KitchenService)
- `backend/src/application/kitchen/kitchen.service.spec.ts` (新建 - 9 个单元测试)

### API 层
- `backend/src/interfaces/controllers/staff-kitchen.controller.ts` (新建 - Staff Kitchen API)
  - `GET /api/v1/staff/kitchen/batches?status=...`
  - `GET /api/v1/staff/kitchen/batches/:batchId`
  - `POST /api/v1/staff/kitchen/tasks/:taskId`

### 配置
- `backend/src/app.module.ts` (注册 KitchenService 和 StaffKitchenController)
- `backend/prisma/schema.prisma` (扩展 PackagingUnit 模型)

### 文档
- `backend/docs/PHASE8_12_MIGRATION_FIX.md` (迁移修复指南)
- `backend/scripts/fix_kitchen_task_migration.sql` (幂等修复脚本)

---

## 架构要点

### 快照完整性 (Snapshot Integrity)
- **关键实现：** `KitchenService.updateTask()` 从 `recipeSnapshot.items` 计算 required weights
- **不读取可变 Recipe 表：** 确保历史准确性
- **公式：** `required_g = totalProductionG * (ratio / 100)`，其中 `ratio` 来自 `recipeSnapshot.items[].ratio`

### 状态管理
- PackagingUnit 作为任务载体，支持状态转换
- 状态机：PENDING → IN_PROGRESS → COMPLETED
- 状态转换验证在 domain 层 (`PackagingUnit.transitionTo()`)

### 数据捕获
- `ingredientsUsageSnapshot`: JSON 存储每个原料的 `{required_g, actual_g}`
- 照片数组：`photosRaw`, `photosCooked`, `photosPortioned` (String[])
- 所有数据持久化到 PostgreSQL

---

## 回滚指引

### 数据库回滚
如果需要回滚 Phase 8.12 的数据库更改：

```sql
-- 删除索引
DROP INDEX IF EXISTS "packaging_unit_status_idx";

-- 删除列
ALTER TABLE "packaging_unit" 
  DROP COLUMN IF EXISTS "updated_at",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "ingredients_usage_snapshot",
  DROP COLUMN IF EXISTS "photos_raw",
  DROP COLUMN IF EXISTS "photos_cooked",
  DROP COLUMN IF EXISTS "photos_portioned";

-- 删除枚举类型
DROP TYPE IF EXISTS "PackagingUnitStatus";
```

### 代码回滚
回滚到 commit: `c7980ed` (Phase 8.11 完成后的状态)

```bash
git checkout c7980ed
```

### 注意事项
- 回滚前确保没有依赖 Phase 8.12 功能的生产数据
- 如果已有 PackagingUnit 记录包含新字段数据，回滚会导致数据丢失

---

## 验证命令

```bash
# 生成 Prisma Client
pnpm prisma generate

# 构建
pnpm run build

# 运行测试
pnpm test -- kitchen.service.spec

# 检查迁移状态
pnpm prisma migrate status
```

---

**基线冻结时间：** 2025-12-17 00:40:30 CST  
**Phase 8.12 状态：** ✅ ACCEPTED
