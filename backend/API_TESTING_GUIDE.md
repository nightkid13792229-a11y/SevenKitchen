# 采购管理API测试指南

## 前置条件

1. 确保后端服务正在运行（端口3001）
2. 确保数据库中有测试数据

## 测试数据

```sql
-- 管理员用户ID（用于认证）
SELECT id, nickname, role FROM "user" WHERE role = 'ADMIN' LIMIT 1;
-- 结果: 65c162eb-5767-42fa-8075-5cfc1e765fce (布欧)

-- PAID状态的订单
SELECT id, status, target_production_date FROM "order" WHERE status = 'PAID';
-- 应该有2个订单，targetProductionDate都是2026-01-25
```

---

## API测试用例

### 1. 预览采购需求（不改变订单状态）

```bash
curl -X GET "http://localhost:3001/api/v1/staff/purchasing/preview?startDate=2026-01-25" \
  -H "X-Customer-Id: 65c162eb-5767-42fa-8075-5cfc1e765fce" \
  -H "Content-Type: application/json"
```

**预期结果**:
- 返回code: 0
- 显示原料汇总（名称、数量、采购渠道等）
- 显示影响的订单列表
- **订单状态保持PAID**（重要！）

---

### 2. 生成采购清单

```bash
curl -X POST "http://localhost:3001/api/v1/staff/purchasing/lists" \
  -H "X-Customer-Id: 65c162eb-5767-42fa-8075-5cfc1e765fce" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2026-01-25"
  }'
```

**预期结果**:
- 返回code: 0
- 创建采购清单成功
- 返回采购清单ID
- 订单状态从PAID变为PURCHASING

**验证数据库**:
```sql
-- 检查采购清单是否创建
SELECT id, target_date, status, item_count, source_order_ids
FROM purchase_list
WHERE target_date::date = '2026-01-25'::date;

-- 检查订单状态是否变更
SELECT id, status FROM "order" WHERE id IN (
  '481c3de1-a5c7-4d59-8aba-f0f293a9a13b',
  '6f7e9cc9-30a3-4005-a685-94db88fda881'
);
-- 应该是PURCHASING状态
```

---

### 3. 追加订单到采购清单

**假设采购清单ID为: `<PURCHASE_LIST_ID>`**

```bash
curl -X POST "http://localhost:3001/api/v1/staff/purchasing/lists/<PURCHASE_LIST_ID>/orders" \
  -H "X-Customer-Id: 65c162eb-5767-42fa-8075-5cfc1e765fce" \
  -H "Content-Type: application/json" \
  -d '{
    "orderIds": ["481c3de1-a5c7-4d59-8aba-f0f293a9a13b"]
  }'
```

**预期结果**:
- 返回code: 0
- 订单被追加到采购清单
- 原料数量更新

---

### 4. 剔除订单（回退订单状态）

```bash
curl -X DELETE "http://localhost:3001/api/v1/staff/purchasing/lists/<PURCHASE_LIST_ID>/orders" \
  -H "X-Customer-Id: 65c162eb-5767-42fa-8075-5cfc1e765fce" \
  -H "Content-Type: application/json" \
  -d '{
    "orderIds": ["481c3de1-a5c7-4d59-8aba-f0f293a9a13b"]
  }'
```

**预期结果**:
- 返回code: 0
- 订单从采购清单移除
- 订单状态从PURCHASING回退到PAID
- 原料数量减少

---

### 5. 添加原料到采购清单

```bash
curl -X POST "http://localhost:3001/api/v1/staff/purchasing/lists/<PURCHASE_LIST_ID>/items" \
  -H "X-Customer-Id: 65c162eb-5767-42fa-8075-5cfc1e765fce" \
  -H "Content-Type: application/json" \
  -d '{
    "ingredientId": "manual-test-001",
    "ingredientName": "手动添加的测试原料",
    "type": "SUPPLEMENT",
    "quantityNeeded": 1000,
    "quantityUnit": "G",
    "estimatedCost": 100,
    "purchaseChannel": "测试渠道",
    "productModel": "测试型号"
  }'
```

**预期结果**:
- 返回code: 0
- 原料添加成功
- itemCount增加

---

### 6. 删除原料

**假设原料ID为: `<ITEM_ID>`**

```bash
curl -X DELETE "http://localhost:3001/api/v1/staff/purchasing/lists/<PURCHASE_LIST_ID>/items/<ITEM_ID>" \
  -H "X-Customer-Id: 65c162eb-5767-42fa-8075-5cfc1e765fce"
```

**预期结果**:
- 返回code: 0
- 原料删除成功
- itemCount减少

---

### 7. 检查订单制作日期变更

```bash
curl -X GET "http://localhost:3001/api/v1/staff/purchasing/lists/<PURCHASE_LIST_ID>/check-date-changes" \
  -H "X-Customer-Id: 65c162eb-5767-42fa-8075-5cfc1e765fce"
```

**预期结果**:
- 返回code: 0
- hasChanges: false (首次测试应该没有变更)
- changedOrders: []

**测试日期变更场景**:
```sql
-- 手动修改一个订单的targetProductionDate
UPDATE "order"
SET target_production_date = '2026-01-26 00:00:00'::timestamp
WHERE id = '481c3de1-a5c7-4d59-8aba-f0f293a9a13b';

-- 再次调用check-date-changes API
-- 应该返回hasChanges: true，并显示变更的订单
```

---

### 8. 删除采购清单

```bash
curl -X DELETE "http://localhost:3001/api/v1/staff/purchasing/lists/<PURCHASE_LIST_ID>" \
  -H "X-Customer-Id: 65c162eb-5767-42fa-8075-5cfc1e765fce"
```

**预期结果**:
- 返回code: 0
- 采购清单删除成功
- 所有关联订单的状态从PURCHASING回退到PAID

**验证数据库**:
```sql
-- 检查采购清单是否删除
SELECT * FROM purchase_list WHERE id = '<PURCHASE_LIST_ID>';
-- 应该返回0行

-- 检查订单状态是否回退
SELECT id, status FROM "order" WHERE id IN (
  '481c3de1-a5c7-4d59-8aba-f0f293a9a13b',
  '6f7e9cc9-30a3-4005-a685-94db88fda881'
);
-- 应该是PAID状态
```

---

## 完整测试流程

1. **预览** → 验证不改变状态
2. **生成清单** → 验证订单状态变为PURCHASING
3. **追加订单** → 验证订单被添加
4. **剔除订单** → 验证订单回退到PAID
5. **添加原料** → 验证原料可手动添加
6. **删除原料** → 验证原料可删除
7. **日期变更检测** → 验证可检测变更
8. **删除清单** → 验证清单删除且订单回退

---

## 常见错误处理

### 409 Conflict - "采购清单已存在"
**原因**: 2026-01-25的采购清单已经存在

**解决方案**:
```sql
-- 删除现有采购清单
DELETE FROM purchase_list WHERE target_date::date = '2026-01-25'::date;

-- 或者使用不同的测试日期
-- 使用 2026-01-26 或其他日期
```

### 400 Bad Request - "只有待采购状态的清单可以XX"
**原因**: 采购清单状态不是PENDING

**解决方案**:
```sql
-- 重置采购清单状态为PENDING
UPDATE purchase_list SET status = 'PENDING' WHERE id = '<PURCHASE_LIST_ID>';
```

### 400 Bad Request - "没有可追加的PAID状态订单"
**原因**: 订单状态不是PAID

**解决方案**:
```sql
-- 重置订单状态为PAID
UPDATE "order" SET status = 'PAID' WHERE id = '<ORDER_ID>';
```

---

## Postman Collection

您可以导入以下Postman Collection进行测试：

```json
{
  "info": {
    "name": "SevenKitchen 采购管理API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "预览采购需求",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "X-Customer-Id",
            "value": "65c162eb-5767-42fa-8075-5cfc1e765fce"
          }
        ],
        "url": {
          "raw": "http://localhost:3001/api/v1/staff/purchasing/preview?startDate=2026-01-25",
          "query": [
            {
              "key": "startDate",
              "value": "2026-01-25"
            }
          ]
        }
      }
    }
  ]
}
```

---

## 总结

✅ 所有新API已实现并通过TypeScript编译
✅ 业务逻辑完整（预览、追加、剔除、编辑、删除、日期检测）
✅ 权限控制正确（使用X-Customer-Id认证）
✅ 数据库模型已更新（orderDateSnapshot字段）

📋 请确保后端服务正常运行后，按照上述步骤进行测试。
