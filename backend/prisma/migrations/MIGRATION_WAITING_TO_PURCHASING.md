# 数据库迁移指南：WAITING_FOR_PRODUCTION → PURCHASING

## 概述

此迁移将订单状态从 `WAITING_FOR_PRODUCTION`（待排产）重命名为 `PURCHASING`（采购中），以更好地反映采购工作流程。

## 迁移步骤

### 1. 代码已更新的部分

✅ 后端代码
- `backend/src/domain/order/enums.ts` - 枚举定义
- `backend/src/domain/order/order.entity.ts` - 状态转换逻辑
- `backend/src/application/purchasing/purchasing.service.ts` - 生成采购清单时转换状态
- 所有引用旧状态的文件

✅ 前端代码
- `miniapp/src/components/OrderProgressBar.vue` - 进度条组件
- `miniapp/src/pages/orders-list/index.vue` - 订单列表页
- `admin-web/src/views/Orders/*.vue` - 管理后台订单页面

### 2. 数据库迁移

#### 方法A：使用 SQL 迁移脚本（推荐）

```bash
cd backend
npm run migrate:deploy
```

或手动执行：

```sql
-- 更新订单表
UPDATE "Order" SET status = 'PURCHASING' WHERE status = 'WAITING_FOR_PRODUCTION';

-- 更新订单状态历史表
UPDATE "OrderStatusHistory" SET "fromStatus" = 'PURCHASING' WHERE "fromStatus" = 'WAITING_FOR_PRODUCTION';
UPDATE "OrderStatusHistory" SET "toStatus" = 'PURCHASING' WHERE "toStatus" = 'WAITING_FOR_PRODUCTION';
```

#### 方法B：使用 Prisma Studio

```bash
cd backend
npx prisma studio
```

然后手动更新：
1. 打开 Order 表
2. 筛选 status = 'WAITING_FOR_PRODUCTION'
3. 批量修改为 'PURCHASING'
4. 对 OrderStatusHistory 表重复相同操作

### 3. 验证迁移

执行验证查询确保迁移成功：

```sql
-- 检查是否还有旧状态
SELECT COUNT(*) FROM "Order" WHERE status = 'WAITING_FOR_PRODUCTION';
-- 结果应该为 0

-- 检查新状态的数量
SELECT status, COUNT(*) FROM "Order" GROUP BY status;
-- 应该能看到 PURCHASING 状态

-- 检查状态历史
SELECT "fromStatus", "toStatus", COUNT(*)
FROM "OrderStatusHistory"
GROUP BY "fromStatus", "toStatus";
-- 应该没有 WAITING_FOR_PRODUCTION
```

## 回滚计划

如果需要回滚：

```sql
-- 回滚订单表
UPDATE "Order" SET status = 'WAITING_FOR_PRODUCTION' WHERE status = 'PURCHASING';

-- 回滚状态历史表
UPDATE "OrderStatusHistory" SET "fromStatus" = 'WAITING_FOR_PRODUCTION' WHERE "fromStatus" = 'PURCHASING';
UPDATE "OrderStatusHistory" SET "toStatus" = 'WAITING_FOR_PRODUCTION' WHERE "toStatus" = 'PURCHASING';
```

然后回滚代码到迁移前的版本。

## 注意事项

1. **备份数据库**：执行迁移前务必备份数据库
2. **停机时间**：建议在低峰期执行迁移，可能需要短暂的只读模式
3. **依赖服务**：确保后端服务已更新代码再执行数据库迁移
4. **测试环境**：先在测试环境验证迁移脚本

## 迁移后的新状态流程

```
INIT → PENDING_PAYMENT → PAID → PURCHASING → IN_PRODUCTION → FREEZING → SHIPPED → COMPLETED
```

关键变化：
- 生成采购清单时：订单从 `PAID` → `PURCHASING`
- 采购完成后：订单从 `PURCHASING` → `IN_PRODUCTION`
