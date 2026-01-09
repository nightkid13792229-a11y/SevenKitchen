# Phase 9: 订单状态优化迁移指南

> **迁移日期**: 2026-01-09
> **影响范围**: 后端、管理后台、小程序
> **破坏性变更**: YES (状态枚举变更)

---

## 📋 变更概述

### 目标
将订单状态从10个简化为7个，对齐电商行业标准（京东、美团、标准ERP）。

### 状态变更

| 原状态 (10个) | 新状态 (7个) | 映射关系 |
|--------------|-------------|---------|
| INIT | INIT | 保持不变 |
| PENDING_PAYMENT | PENDING_PAYMENT | 保持不变 |
| PAID | PAID | 保持不变 |
| ~~WAITING_FOR_PRODUCTION~~ | → PAID | 合并到PAID |
| IN_PRODUCTION | IN_PRODUCTION | 保持不变 |
| ~~READY_FOR_PACKAGING~~ | → IN_PRODUCTION | 合并到IN_PRODUCTION |
| ~~READY_FOR_SHIPMENT~~ | → IN_PRODUCTION | 合并到IN_PRODUCTION |
| SHIPPED | SHIPPED | 保持不变 |
| COMPLETED | COMPLETED | 保持不变 |
| CANCELLED | CANCELLED | 保持不变 |

### 新状态流转

```
INIT → PENDING_PAYMENT → PAID → IN_PRODUCTION → SHIPPED → COMPLETED
                                    ↓
                              CANCELLED
                              (任意状态，除SHIPPED/COMPLETED)
```

---

## 🔧 迁移步骤

### 1. 备份数据库

```bash
# 备份PostgreSQL数据库
pg_dump -U postgres -h localhost -d sevenkitchen > backup_before_phase9_$(date +%Y%m%d).sql

# 或使用Docker
docker exec sevenkitchen-db pg_dump -U postgres sevenkitchen > backup_before_phase9_$(date +%Y%m%d).sql
```

### 2. 停止所有服务

```bash
# 停止后端
pm2 stop sevenkitchen-backend

# 停止管理后台构建（可选）
# 停止小程序构建（可选）
```

### 3. 执行数据库迁移

```bash
cd backend/prisma/migrations/20260109000000_phase9_order_status_optimization

# 方式1: 直接执行SQL文件
psql -U postgres -h localhost -d sevenkitchen -f migration.sql

# 方式2: 使用Prisma迁移（推荐）
cd backend
npx prisma migrate deploy

# 方式3: Docker环境
docker exec -i sevenkitchen-db psql -U postgres sevenkitchen < migration.sql
```

### 4. 验证迁移结果

```sql
-- 检查状态分布
SELECT status, COUNT(*) FROM "Order" GROUP BY status ORDER BY status;

-- 验证无无效状态
SELECT COUNT(*) FROM "Order"
WHERE status NOT IN ('INIT', 'PENDING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'COMPLETED', 'CANCELLED');
-- 应返回 0
```

### 5. 重新部署服务

```bash
# 重新构建后端
cd backend
npm run build
pm2 restart sevenkitchen-backend

# 重新构建管理后台
cd admin-web
npm run build

# 重新构建小程序
cd miniapp
pnpm run build:mp-weixin
```

### 6. 功能测试清单

#### 后端测试
- [ ] 订单创建流程 (INIT → PENDING_PAYMENT)
- [ ] 支付流程 (PENDING_PAYMENT → PAID)
- [ ] 生产流程 (PAID → IN_PRODUCTION)
- [ ] 发货流程 (IN_PRODUCTION → SHIPPED)
- [ ] 完成流程 (SHIPPED → COMPLETED)
- [ ] 取消流程 (任意状态 → CANCELLED)
- [ ] 统计API返回正确

#### 管理后台测试
- [ ] 统计卡片显示正确（删除"急冻中待发货"）
- [ ] 订单列表筛选功能正常
- [ ] 状态标签显示正确
- [ ] 发货对话框功能正常

#### 小程序测试
- [ ] 订单列表状态Tab正确
- [ ] 订单详情状态显示正确
- [ ] 底部操作按钮显示正确
- [ ] 状态进度条正确

---

## 📊 影响分析

### 数据库层
- ✅ **表结构变更**: 无（仅枚举类型变更）
- ⚠️ **数据迁移**: 需要映射3个已删除状态的订单数据
- ✅ **索引影响**: 无（状态字段索引仍然有效）

### 后端API层
- ✅ **新增接口**: 无
- ✅ **删除接口**: 无
- ⚠️ **修改接口**: 订单统计API（删除`readyForShipment`字段）
- ⚠️ **业务逻辑**: 删除`completeProduction`方法

### 管理后台
- ⚠️ **UI变更**: 删除"急冻中待发货"统计卡片
- ⚠️ **筛选逻辑**: 状态选项从5个减少到4个
- ✅ **表格列**: 无变更

### 小程序
- ⚠️ **状态映射**: 简化状态文本和颜色映射
- ⚠️ **筛选逻辑**: 简化状态筛选条件
- ⚠️ **操作按钮**: 简化底部按钮逻辑

---

## 🔄 回滚方案

如果迁移后出现严重问题，可以执行回滚：

### 1. 停止服务
```bash
pm2 stop sevenkitchen-backend
```

### 2. 恢复数据库
```bash
psql -U postgres -h localhost -d sevenkitchen < backup_before_phase9_YYYYMMDD.sql
```

### 3. 回滚代码
```bash
git checkout <previous-commit-tag>
npm run build
pm2 restart sevenkitchen-backend
```

### 4. 验证回滚
检查管理后台和小程序是否恢复正常。

---

## ⚠️ 注意事项

### 迁移前
1. **务必备份数据库**
2. 在**测试环境**先执行迁移并验证
3. 通知团队成员即将进行维护

### 迁移中
1. 确保没有正在进行的订单操作
2. 监控迁移日志，确认数据映射正确
3. 如遇错误，立即停止并排查

### 迁移后
1. 全面测试订单流程
2. 监控错误日志
3. 收集用户反馈

---

## 📞 联系方式

如有问题，请联系：
- **技术负责人**: [姓名]
- **DBA**: [姓名]
- **紧急联系**: [电话/企业微信]

---

## 附录

### A. 状态映射详细说明

#### WAITING_FOR_PRODUCTION → PAID
**原因**: 这个状态表示订单已支付但尚未开始生产，与PAID状态的语义重复。
**影响**: 这些订单将显示为"已付款"，需要管理员手动点击"开始生产"进入IN_PRODUCTION状态。

#### READY_FOR_PACKAGING → IN_PRODUCTION
**原因**: 包装是生产流程的最后一步，属于生产阶段的内部状态，不应暴露给用户。
**影响**: 这些订单将继续显示为"制作中"，可以直接发货。

#### READY_FOR_SHIPMENT → IN_PRODUCTION
**原因**: 急冻是发货前的准备工作，属于生产阶段的内部状态。
**影响**: 这些订单将继续显示为"制作中"，可以直接发货。

### B. 兼容性说明

- ✅ **状态历史表**: `OrderStatusHistory` 表中的旧状态记录保持不变（审计需要）
- ✅ **外部系统**: 如果有集成外部物流系统，需要确认状态映射
- ⚠️ **数据报表**: 依赖旧状态的BI报表需要更新查询逻辑

### C. 性能影响

- ✅ **数据库查询**: 状态枚举简化后，查询性能无影响
- ✅ **前端渲染**: 状态选项减少，渲染略微提升
- ✅ **API响应**: 统计数据字段减少，响应包体积略小

---

**文档版本**: 1.0
**最后更新**: 2026-01-09
**审核人**: Claude Code
