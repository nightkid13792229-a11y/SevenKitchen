# Phase 8.10 Baseline - Production & Packaging MVP

**生成时间：** 2025-12-16 22:32:33 CST  
**用途：** 用于后续对齐与回滚定位的基线快照

---

## Repository 状态

### Git 信息
- **Commit Hash:** `31e53adf18f97ce336b070439c4fe8021e2725a1`
- **分支名:** `main`
- **基线时间:** 2025-12-16 22:32:33 CST

### Prisma Migration
- **最新 Migration:** `20251216133724_add_production_batch_and_packaging_unit`
- **Migration 路径:** `backend/prisma/migrations/20251216133724_add_production_batch_and_packaging_unit/`

### Phase 8.x 验证脚本清单
以下脚本位于 `backend/scripts/` 目录：

1. `phase8_1_part1_persistence_smoke.sh`
2. `phase8_2_partA_address_persistence_smoke.sh`
3. `phase8_2b_dog_persistence_smoke.sh`
4. `phase8_3_recipe_persistence_smoke.sh`
5. `phase8_4_order_persistence_smoke.sh`
6. `phase8_5_address_persistence_smoke.sh`
7. `phase8_6_comprehensive_verify.sh`

**注意：** Phase 8.10 没有独立的验证脚本，使用单元测试 `production.service.spec.ts` 进行验证。

---

## 关键文件清单

### Domain 层
- `backend/src/domain/production/enums.ts`
- `backend/src/domain/production/production-batch.entity.ts`
- `backend/src/domain/production/packaging-unit.entity.ts`
- `backend/src/domain/production/production.repository.ts`
- `backend/src/domain/production/index.ts`

### Infrastructure 层
- `backend/src/infrastructure/repositories/prisma-production.repository.ts`

### Application 层
- `backend/src/application/production/production.service.ts`
- `backend/src/application/production/production.service.spec.ts`

### API 层
- `backend/src/interfaces/controllers/admin.controller.ts` (新增生产批次端点)

### 数据库 Schema
- `backend/prisma/schema.prisma` (ProductionBatch, PackagingUnit 模型)

### 文档
- `backend/docs/PHASE8_10_PRODUCTION_MVP.md`
- `backend/docs/PHASE8_10_CAPABILITIES.md` (本阶段新增)
- `backend/docs/PHASE8_10_BASELINE.md` (本文件)

---

## 验证状态

### 编译
- ✅ `pnpm run build` 通过

### 测试
- ✅ `pnpm test -- production.service.spec` 通过（6 个测试）

### API 验证（手动）
- ✅ `POST /api/v1/admin/production-batches` 返回 `sourceOrderItemIds` 为数组
- ✅ `GET /api/v1/admin/production-batches/:id` 返回 `sourceOrderItemIds` 为数组
- ✅ `batch.orderItemCount` 正确计算（所有 packagingUnits 的 orderItemCount 之和）

---

## 回滚说明

如需回滚到本基线：

```bash
git checkout 31e53adf18f97ce336b070439c4fe8021e2725a1
cd backend
pnpm prisma migrate reset  # 如果需要重置数据库
pnpm prisma migrate deploy  # 重新应用 migrations
```

---

**维护者：** Phase 8.10 实现团队  
**最后更新：** 2025-12-16
