# Phase 9: 订单状态优化 - 手动测试步骤

> **测试日期**: 2026-01-09
> **测试环境**: 本地开发环境
> **测试范围**: 后端API、管理后台、小程序

---

## 📋 测试前准备

### 1. 环境检查
- [x] 后端代码已编译通过 (`npm run build` 成功)
- [ ] 后端服务已启动 (`npm run start:dev`)
- [ ] 数据库连接正常
- [ ] 管理后台已启动 (`cd admin-web && npm run dev`)
- [ ] 小程序开发工具已打开

### 2. 数据库备份（重要！）
```bash
# 备份PostgreSQL数据库
pg_dump -U postgres -h localhost -d sevenkitchen > backup_before_manual_test_$(date +%Y%m%d_%H%M%S).sql

# 或使用Docker
docker exec sevenkitchen-db pg_dump -U postgres sevenkitchen > backup_before_manual_test_$(date +%Y%m%d_%H%M%S).sql
```

---

## 🔧 测试步骤

### 模块1: 数据库迁移测试

#### 步骤1.1: 执行迁移脚本
```bash
cd backend/prisma/migrations/20260109000000_phase9_order_status_optimization

# 查看迁移脚本内容
cat migration.sql | less

# 执行迁移
psql -U postgres -h localhost -d sevenkitchen -f migration.sql

# 或使用Docker
docker exec -i sevenkitchen-db psql -U postgres sevenkitchen < migration.sql
```

**预期结果**:
- ✅ 看到状态枚举创建成功的消息
- ✅ 数据更新成功的消息
- ✅ 无错误信息

**验证查询**:
```sql
-- 验证枚举创建成功
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'OrderStatus'::regtype ORDER BY enumsortorder;
-- 预期: 7个状态 (INIT, PENDING_PAYMENT, PAID, IN_PRODUCTION, SHIPPED, COMPLETED, CANCELLED)

-- 验证无无效状态
SELECT COUNT(*) FROM "Order" WHERE status NOT IN ('INIT', 'PENDING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'COMPLETED', 'CANCELLED');
-- 预期: 0

-- 查看状态分布
SELECT status, COUNT(*) FROM "Order" GROUP BY status ORDER BY status;
```

#### 步骤1.2: 验证数据完整性
```sql
-- 检查订单总数是否保持不变
SELECT COUNT(*) as total_orders_before FROM "Order";
-- 记录数字，然后与迁移后对比

-- 检查状态历史表是否保留旧状态记录
SELECT DISTINCT toStatus FROM "OrderStatusHistory" ORDER BY toStatus;
-- 应该看到包含已删除状态的历史记录（审计需要）
```

---

### 模块2: 后端API测试

#### 测试2.1: 订单统计API
```bash
# 获取订单统计
curl -X GET http://localhost:3000/api/admin/orders/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" | jq
```

**预期结果**:
```json
{
  "success": true,
  "data": {
    "total": 10,
    "pendingPayment": 1,
    "paid": 2,
    "inProduction": 3,
    "shipped": 2,
    "completed": 1,
    "cancelled": 1
  }
}
```
✅ **确认**: 没有`readyForShipment`字段

#### 测试2.2: 订单列表筛选
```bash
# 筛选IN_PRODUCTION状态的订单
curl -X GET "http://localhost:3000/api/admin/orders?status=IN_PRODUCTION&page=1&pageSize=20" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" | jq '.data.list[].status'
```

**预期结果**:
- 所有返回的订单状态都是`IN_PRODUCTION`
- 不应看到`READY_FOR_PACKAGING`或`READY_FOR_SHIPMENT`

#### 测试2.3: 创建订单并验证状态流转
```bash
# 1. 创建订单草稿 (INIT状态)
curl -X POST http://localhost:3000/api/orders/draft \
  -H "Authorization: Bearer YOUR_CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dogId": "test-dog-id",
    "type": "FRESH_FOOD",
    "items": [{
      "recipeId": "test-recipe-id",
      "quantityG": 1000,
      "packageCount": 7,
      "packageSpecG": 150
    }],
    "addressId": "test-address-id"
  }' | jq '.data.status'
```
**预期**: `"INIT"`

```bash
# 2. 确认订单 (PENDING_PAYMENT状态)
curl -X POST http://localhost:3000/api/orders/ORDER_ID/confirm \
  -H "Authorization: Bearer YOUR_CUSTOMER_TOKEN" | jq '.data.status'
```
**预期**: `"PENDING_PAYMENT"`

```bash
# 3. 支付订单 (PAID状态)
curl -X POST http://localhost:3000/api/orders/ORDER_ID/payment \
  -H "Authorization: Bearer YOUR_CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paymentMethod": "WECHAT"}' | jq '.data.status'
```
**预期**: `"PAID"`

```bash
# 4. 开始生产 (IN_PRODUCTION状态)
curl -X POST http://localhost:3000/api/admin/orders/ORDER_ID/start-production \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | jq '.data.status'
```
**预期**: `"IN_PRODUCTION"`

```bash
# 5. 发货 (SHIPPED状态)
curl -X POST http://localhost:3000/api/admin/orders/ORDER_ID/ship \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"trackingNumber": "SF1234567890", "carrierCode": "SF"}' | jq '.data.status'
```
**预期**: `"SHIPPED"`

```bash
# 6. 完成订单 (COMPLETED状态)
curl -X POST http://localhost:3000/api/admin/orders/ORDER_ID/complete \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | jq '.data.status'
```
**预期**: `"COMPLETED"`

#### 测试2.4: 取消订单
```bash
# 客户取消自己的订单
curl -X POST http://localhost:3000/api/orders/ORDER_ID/cancel \
  -H "Authorization: Bearer YOUR_CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "测试取消"}' | jq '.data.status'
```
**预期**:
- INIT/PENDING_PAYMENT状态: 成功取消 → `CANCELLED`
- SHIPPED/COMPLETED状态: 返回错误（不能取消已发货订单）

---

### 模块3: 管理后台测试

#### 测试3.1: 统计卡片显示
1. 打开管理后台: http://localhost:5173/admin/orders
2. 检查页面顶部的统计卡片

**预期卡片**:
- ✅ 全部订单
- ✅ 已付款
- ✅ 生产中
- ✅ 已发货
- ✅ 已完成
- ❌ **不应该有**"急冻中待发货"卡片

#### 测试3.2: 状态筛选器
1. 在订单列表页面，找到"状态"下拉框
2. 点击下拉框，查看可选状态

**预期选项**:
- ✅ 已付款
- ✅ 生产中
- ✅ 已发货
- ✅ 已完成
- ✅ 已取消
- ❌ **不应该有**"急冻中待发货"、"待包装"、"待生产"

#### 测试3.3: 订单详情状态标签
1. 点击任意订单进入详情页
2. 查看状态标签的颜色和文本

**预期状态标签**:
- INIT: 订单创建 (灰色)
- PENDING_PAYMENT: 待付款 (橙色)
- PAID: 已付款 (蓝色)
- IN_PRODUCTION: 制作中 (蓝色)
- SHIPPED: 已发货 (绿色)
- COMPLETED: 已完成 (绿色)
- CANCELLED: 已取消 (红色)

#### 测试3.4: 发货对话框
1. 找到一个`IN_PRODUCTION`状态的订单
2. 点击"发货"按钮
3. 填写物流信息（快递单号、快递公司）
4. 点击确认

**预期结果**:
- ✅ 订单状态从`IN_PRODUCTION`变为`SHIPPED`
- ✅ 订单详情显示物流信息
- ✅ 状态历史记录显示状态变更

#### 测试3.5: 取消订单对话框
1. 找到一个`PAID`或`IN_PRODUCTION`状态的订单
2. 点击"取消"按钮
3. 填写取消原因
4. 点击确认

**预期结果**:
- ✅ 订单状态变为`CANCELLED`
- ✅ 订单详情显示取消原因和取消时间

---

### 模块4: 小程序测试

#### 测试4.1: 订单列表状态Tab
1. 打开小程序开发工具
2. 进入"我的订单"页面
3. 查看顶部的状态Tab

**预期Tab**:
- ✅ 全部
- ✅ 待付款
- ✅ 制作中
- ✅ 已发货
- ✅ 已完成
- ❌ **不应该有**单独的"急冻中待发货"Tab

#### 测试4.2: 订单列表状态显示
1. 在"制作中"Tab下，查看订单列表
2. 检查每个订单的状态标签

**预期**:
- ✅ 所有订单显示为蓝色"制作中"标签
- ✅ 不应看到"急冻中待发货"、"待包装"等状态标签

#### 测试4.3: 订单详情页
1. 点击任意订单进入详情页
2. 查看订单基本信息区域

**预期显示**:
- ✅ 订单状态: 显示当前状态文本（如"制作中"）
- ✅ 状态图标: 显示对应的emoji图标
- ✅ 状态颜色: 蓝色（制作中）/绿色（已发货）/红色（已取消）

#### 测试4.4: 底部操作按钮
根据订单状态，检查底部按钮显示：

**PAID / IN_PRODUCTION状态**:
- ✅ 显示"联系客服"按钮
- ❌ 不应显示其他操作按钮

**SHIPPED状态**:
- ✅ 显示"查看物流"按钮
- ✅ 显示"确认收货"按钮

**COMPLETED状态**:
- ✅ 显示"再次购买"按钮
- ✅ 显示"评价"按钮

**CANCELLED状态**:
- ✅ 显示"再次购买"按钮

#### 测试4.5: 完整订单流程
使用小程序完成一个完整的订单流程：

1. **下单**:
   - 选择狗狗、食谱、规格
   - 点击"立即购买"
   - 确认订单信息
   - ✅ 订单创建成功，状态为`INIT`

2. **支付**:
   - 完成支付
   - ✅ 状态变为`PAID`

3. **查看订单**:
   - 返回订单列表
   - ✅ 订单显示在"制作中"Tab下

4. **等待生产**:
   - 刷新页面
   - ✅ 订单状态仍为"制作中"

5. **查看详情**:
   - 进入订单详情
   - ✅ 显示"制作中"状态
   - ✅ 底部显示"联系客服"按钮

---

### 模块5: 边界条件测试

#### 测试5.1: 非法状态转换
尝试以下非法转换（应该返回错误）:

```bash
# 1. 从INIT直接跳到SHIPPED（应该失败）
curl -X POST http://localhost:3000/api/admin/orders/INIT_ORDER_ID/ship \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"trackingNumber": "SF123", "carrierCode": "SF"}'
```
**预期**: 返回400错误，提示非法状态转换

```bash
# 2. 从SHIPPED状态尝试取消（应该失败）
curl -X POST http://localhost:3000/api/orders/SHIPPED_ORDER_ID/cancel \
  -H "Authorization: Bearer YOUR_CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "想取消"}'
```
**预期**: 返回400错误，提示已发货订单不能取消

#### 测试5.2: 并发订单处理
1. 快速创建3个订单
2. 同时为这些订单调用"开始生产"
3. 检查所有订单是否都正确转换为`IN_PRODUCTION`

**预期**:
- ✅ 所有订单状态正确
- ✅ 状态历史表记录完整
- ✅ 无数据丢失或重复

#### 测试5.3: 历史数据兼容性
```sql
-- 查询状态历史表，确认旧状态记录保留
SELECT
  orderId,
  fromStatus,
  toStatus,
  createdAt
FROM "OrderStatusHistory"
WHERE toStatus IN ('WAITING_FOR_PRODUCTION', 'READY_FOR_PACKAGING', 'READY_FOR_SHIPMENT')
ORDER BY createdAt DESC
LIMIT 10;
```
**预期**: 应该看到包含已删除状态的历史记录（审计需要）

---

## 📊 测试结果记录

### 通过的测试
- [ ] 数据库迁移成功
- [ ] 枚举定义正确（7个状态）
- [ ] 数据映射正确（无数据丢失）
- [ ] 订单统计API返回正确
- [ ] 订单列表筛选正常
- [ ] 订单创建和状态流转正常
- [ ] 发货功能正常（IN_PRODUCTION → SHIPPED）
- [ ] 取消功能正常（权限控制正确）
- [ ] 管理后台统计卡片正确（6个）
- [ ] 管理后台状态筛选器正确（5个选项）
- [ ] 小程序状态Tab正确（5个Tab）
- [ ] 小程序订单详情显示正确
- [ ] 小程序底部按钮显示正确
- [ ] 非法状态转换被正确拦截

### 发现的问题
记录测试中发现的任何问题：

| 问题编号 | 描述 | 严重程度 | 状态 |
|---------|------|---------|------|
| 1 | | | |
| 2 | | | |

---

## 🔄 回滚测试（可选）

如果测试中发现严重问题，执行回滚：

```bash
# 1. 停止后端服务
pm2 stop sevenkitchen-backend

# 2. 恢复数据库
psql -U postgres -h localhost -d sevenkitchen < backup_before_manual_test_YYYYMMDD_HHMMSS.sql

# 3. 恢复代码
git checkout <previous-commit-tag>

# 4. 重新构建
npm run build

# 5. 重启服务
pm2 start sevenkitchen-backend

# 6. 验证回滚成功
curl -X GET http://localhost:3000/api/admin/orders/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | jq
```

---

## ✅ 测试完成检查清单

### 功能测试
- [ ] 所有核心API正常工作
- [ ] 状态转换逻辑正确
- [ ] 统计数据准确
- [ ] 前端显示正确

### 性能测试
- [ ] API响应时间无明显增加
- [ ] 数据库查询性能正常
- [ ] 前端页面加载速度正常

### 兼容性测试
- [ ] 旧数据正确映射
- [ ] 状态历史记录完整
- [ ] 无数据丢失

### 用户体验测试
- [ ] 状态文本清晰易懂
- [ ] 操作流程简化
- [ ] 无困惑的用户界面

---

## 📝 测试总结

### 测试执行人
- 姓名: ___________
- 日期: ___________
- 环境: ___________

### 测试结论
- [ ] **通过** - 所有测试用例通过，可以部署到生产环境
- [ ] **有条件通过** - 存在次要问题，可以在生产环境修复
- [ ] **不通过** - 存在严重问题，需要修复后重新测试

### 备注
_________________________________________________
_________________________________________________
_________________________________________________

---

**文档版本**: 1.0
**最后更新**: 2026-01-09
**审核人**: Claude Code
