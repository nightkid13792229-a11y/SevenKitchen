# 时区处理规范文档

> **版本**: v1.0
> **最后更新**: 2026-01-23
> **适用范围**: Backend, MiniApp, AdminWeb

---

## 目录

1. [核心原则](#核心原则)
2. [为什么选择中午12点](#为什么选择中午12点)
3. [DateUtil 工具类](#dateutil-工具类)
4. [使用规范](#使用规范)
5. [常见问题](#常见问题)
6. [最佳实践](#最佳实践)

---

## 核心原则

### **1. 分层时区策略**

```
┌─────────────────────────────────────────────────────────┐
│                    前端显示层                            │
│  - 使用浏览器本地时区                                    │
│  - 用户自动看到本地时间（中国UTC+8，海外用户当地时区）  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    业务逻辑层                            │
│  - 使用 DateUtil.createDateRange() 创建查询范围        │
│  - 统一使用中午12点作为时间基准（T12:00:00）           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    数据库层                              │
│  - 存储时区：Asia/Shanghai (UTC+8)                       │
│  - 字段类型：TIMESTAMP WITHOUT TIME ZONE              │
│  - 存储格式：本地时间（如 2026-01-23 12:00:00）        │
└─────────────────────────────────────────────────────────┘
```

### **2. 时间基准统一**

**所有"日期"查询使用中午12点（12:00:00）作为基准：**

```typescript
// ✅ 正确：使用DateUtil
const { start, end } = DateUtil.createDateRange('2026-01-23');
// start: 2026-01-23 12:00:00 本地时间 = 2026-01-23 04:00:00 UTC
// end:   2026-01-24 12:00:00 本地时间 = 2026-01-24 04:00:00 UTC

// ❌ 错误：直接使用午夜0点
const start = new Date('2026-01-23T00:00:00');
// 在上海时区：2026-01-23 00:00:00 本地时间 = 2026-01-22 16:00:00 UTC
// 这会导致前一天的数据被包含进来！
```

---

## 为什么选择中午12点

### **问题：UTC时区转换导致日期偏差**

JavaScript 的 `new Date('2026-01-23T00:00:00')` 被解析为本地时间，但内部存储为 UTC：

```javascript
// 示例：上海时区（GMT+0800）
const date = new Date('2026-01-23T00:00:00');
// 本地时间：2026-01-23 00:00:00 GMT+0800
// UTC时间：  2026-01-22 16:00:00 UTC  ← 注意：是前一天的16点！
```

**这会导致的问题：**

1. **数据库查询错误**
   - 订单的 `target_production_date` 存储为 `2026-01-23 00:00:00`（本地时间）
   - 查询使用 `new Date('2026-01-23T00:00:00')`，转换为 UTC 是前一天的16点
   - 结果：查询不到当天的数据！

2. **跨天问题**
   - 凌晨00:00-08:00（上海时间）对应的UTC时间是前一天的16:00-24:00
   - 如果使用午夜0点作为基准，会跨越两个UTC日期

### **解决方案：使用中午12点**

```javascript
// 使用中午12点（12:00:00）
const date = new Date('2026-01-23T12:00:00');
// 本地时间：2026-01-23 12:00:00 GMT+0800
// UTC时间：  2026-01-23 04:00:00 UTC  ← 仍是同一天！
```

**优势：**

- ✅ **避免跨天**：无论是00:00-08:00还是16:00-24:00，UTC时间都在同一天（00:00-16:00）
- ✅ **查询稳定**：`T12:00:00` 到次日 `T12:00:00` 覆盖完整的24小时
- ✅ **符合业务逻辑**："1月23号的订单"指1月23日当天的工作，从12:00开始

---

## DateUtil 工具类

### **位置**
`backend/src/utils/date.util.ts`

### **主要方法**

#### **1. createDateRange(dateStr: string)**

创建日期查询范围（用于数据库查询）

```typescript
const { start, end } = DateUtil.createDateRange('2026-01-23');

// 返回值：
// start: Date 对象，表示 2026-01-23 12:00:00 本地时间
// end:   Date 对象，表示 2026-01-24 12:00:00 本地时间
```

**用途：**
- 查询指定日期的订单
- 查询指定日期的采购清单
- 查询指定日期的生产批次

#### **2. createTodayRange()**

创建今日的日期查询范围

```typescript
const { start, end } = DateUtil.createTodayRange();

// 自动使用当前系统日期
```

**用途：**
- 统计今日订单数量
- 查询今日待办任务

#### **3. formatDate(date: Date)**

格式化日期为 `YYYY-MM-DD` 字符串

```typescript
const date = new Date('2026-01-23T15:30:00');
const dateStr = DateUtil.formatDate(date); // '2026-01-23'
```

**用途：**
- API响应中的日期字段
- 日志输出

#### **4. isToday(date: Date)**

判断给定日期是否是今天

```typescript
const now = new Date();
DateUtil.isToday(now); // true

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
DateUtil.isToday(yesterday); // false
```

#### **5. getStartOfDay(dateStr: string)**

获取指定日期的开始时间（中午12点）

```typescript
const start = DateUtil.getStartOfDay('2026-01-23');
// 2026-01-23 12:00:00
```

#### **6. getEndOfDay(dateStr: string)**

获取指定日期的结束时间（次日中午12点）

```typescript
const end = DateUtil.getEndOfDay('2026-01-23');
// 2026-01-24 12:00:00
```

#### **7. createDateRangeForDB(dateStr: string)**

创建数据库查询用的ISO 8601格式字符串

```typescript
const { startDate, endDate } = DateUtil.createDateRangeForDB('2026-01-23');

// 返回值：
// startDate: '2026-01-23T04:00:00.000Z'
// endDate:   '2026-01-24T04:00:00.000Z'
```

#### **8. isValidDateString(dateStr: string)**

验证日期字符串格式

```typescript
DateUtil.isValidDateString('2026-01-23'); // true
DateUtil.isValidDateString('2026-02-30'); // false (2月没有30日)
DateUtil.isValidDateString('invalid');    // false
```

---

## 使用规范

### **✅ 推荐做法**

#### **1. 查询指定日期的订单**

```typescript
// 采购服务：计算采购需求
async calculatePurchaseRequirements(startDate: string, endDate?: string) {
  // ✅ 使用 DateUtil.createDateRange
  const { start: start_date, end: end_date } = DateUtil.createDateRange(startDate);

  const { list: orders } = await this.orderRepository.findByTargetProductionDateRange({
    status: OrderStatus.PAID,
    startDate: start_date,
    endDate: end_date,
  });

  // ...
}
```

#### **2. 查询今日统计数据**

```typescript
// 生产服务：获取今日统计
async getTodayStatistics() {
  // ✅ 使用 DateUtil.createTodayRange
  const { start: today, end: todayEnd } = DateUtil.createTodayRange();

  const batches = await this.productionRepository.findByProductionDateRange({
    startDate: today,
    endDate: todayEnd,
  });

  // ...
}
```

#### **3. 格式化日期输出**

```typescript
// DTO 转换
response.orderDate = DateUtil.formatDate(order.targetProductionDate);
// 返回：'2026-01-23'
```

### **❌ 错误做法**

#### **1. 不要直接使用 `new Date()` 进行日期范围查询**

```typescript
// ❌ 错误：直接使用午夜0点
const start = new Date(`${dateStr}T00:00:00`);
const end = new Date(`${dateStr}T23:59:59.999`);

// 问题：
// 1. 不同时区会导致不同的UTC时间
// 2. 上海时间 00:00:00 = UTC 前一天 16:00:00
// 3. 可能查询到错误的数据
```

#### **2. 不要在不同模块使用不同的时间基准**

```typescript
// ❌ 错误：模块A使用00:00:00
const start1 = new Date(`${date}T00:00:00`);

// ❌ 错误：模块B使用12:00:00
const start2 = new Date(`${date}T12:00:00`);

// 结果：查询结果不一致
```

#### **3. 不要使用 `setHours()` 设置时间**

```typescript
// ❌ 错误：手动设置时间
const date = new Date();
date.setHours(12, 0, 0, 0);

// 问题：
// 1. 代码冗长
// 2. 容易出错（忘记设置分钟/秒/毫秒）
// 3. 不符合规范
```

---

## 常见问题

### **Q1: 为什么不能用 `new Date('2026-01-23')` ？**

**A:** 不带时间的字符串会被解析为UTC时间：

```javascript
new Date('2026-01-23')
// ISO: 2026-01-23T00:00:00.000Z  ← UTC时间
// 本地：2026-01-23 08:00:00 GMT+0800  ← 上海时间

new Date('2026-01-23T12:00:00')
// ISO: 2026-01-23T04:00:00.000Z  ← UTC时间（仍是同一天）
// 本地：2026-01-23 12:00:00 GMT+0800  ← 上海时间
```

### **Q2: 数据库存储什么时区？**

**A:** PostgreSQL 配置为 `Asia/Shanghai` 时区：

```sql
SHOW timezone;  -- Asia/Shanghai
```

存储时：
- JavaScript Date 对象的 `.toISOString()` 返回UTC时间（如 `2026-01-23T04:00:00.000Z`）
- PostgreSQL 将其转换为本地时间存储（`2026-01-23 12:00:00`）

查询时：
- 查询条件使用本地时间（`2026-01-23 12:00:00`）
- PostgreSQL 直接比较存储的本地时间

### **Q3: 前端如何显示时间？**

**A:** 前端使用 `toLocaleString()` 自动转换为浏览器时区：

```javascript
// MiniApp / AdminWeb
const date = new Date('2026-01-23T04:00:00.000Z');  // API返回的UTC时间

// 中国用户（UTC+8）看到：
date.toLocaleString('zh-CN');  // '2026/01/23 12:00:00'

// 美国用户（UTC-5）看到：
date.toLocaleString('en-US');  // '1/22/2026, 11:00:00 PM'
```

### **Q4: 如何处理跨天查询？**

**A:** 使用 `DateUtil.createDateRange()` 并指定结束日期：

```typescript
// 查询1月23日到1月25日的订单
const startRange = DateUtil.createDateRange('2026-01-23');
const endRange = DateUtil.createDateRange('2026-01-25');

const orders = await orderRepository.findByTargetProductionDateRange({
  startDate: startRange.start,
  endDate: endRange.end,
});
```

### **Q5: 如何验证日期格式？**

**A:** 使用 `DateUtil.isValidDateString()`：

```typescript
if (!DateUtil.isValidDateString(dateStr)) {
  throw new BadRequestException('日期格式无效，期望格式：YYYY-MM-DD');
}
```

---

## 最佳实践

### **1. 统一使用 DateUtil**

所有日期处理都通过 `DateUtil` 工具类，不要直接使用 `new Date()` 进行日期范围查询。

### **2. 参数验证**

在 Service 层入口验证日期格式：

```typescript
async generatePurchaseList(dto: GeneratePurchaseListDto) {
  // 验证日期格式
  if (!DateUtil.isValidDateString(dto.startDate)) {
    throw new BadRequestException('日期格式无效');
  }

  // 使用验证后的日期
  const { start, end } = DateUtil.createDateRange(dto.startDate);
  // ...
}
```

### **3. 单元测试覆盖**

为所有日期相关逻辑编写单元测试：

```typescript
describe('PurchaseService', () => {
  it('should calculate purchase requirements for a given date range', () => {
    const { start, end } = DateUtil.createDateRange('2026-01-23');

    // 验证时间范围
    expect(start.getHours()).toBe(12);
    expect(end.getHours()).toBe(12);

    // 验证日期是连续的
    expect(end.getDate()).toBe(start.getDate() + 1);
  });
});
```

### **4. 日志记录**

记录查询范围便于调试：

```typescript
const { start, end } = DateUtil.createDateRange(dateStr);

this.logger.log(`Query range (local): ${start.toString()} to ${end.toString()}`);
this.logger.log(`Query range (UTC): ${start.toISOString()} to ${end.toISOString()}`);
```

### **5. 文档和注释**

在代码中明确说明时区处理逻辑：

```typescript
/**
 * 计算指定日期的采购需求
 *
 * @param startDate 开始日期（YYYY-MM-DD格式）
 *
 * **时区处理：**
 * - 使用 DateUtil.createDateRange() 创建查询范围
 * - 使用中午12点（T12:00:00）作为时间基准
 * - 避免UTC时区转换导致的日期偏差
 */
async calculatePurchaseRequirements(startDate: string) {
  const { start, end } = DateUtil.createDateRange(startDate);
  // ...
}
```

---

## 总结

### **核心原则**

1. ✅ **统一使用 DateUtil** 工具类处理所有日期查询
2. ✅ **中午12点作为时间基准**（T12:00:00）
3. ✅ **覆盖完整的24小时**（从 T12:00:00 到次日 T12:00:00）
4. ✅ **数据库存储本地时间**，API返回UTC时间
5. ✅ **前端自动转换时区**，用户看到本地时间

### **避免的错误**

1. ❌ 直接使用 `new Date('2026-01-23T00:00:00')`
2. ❌ 不同模块使用不同的时间基准
3. ❌ 手动 `setHours()` 设置时间
4. ❌ 不验证日期格式直接使用

### **验证清单**

- [ ] 所有日期查询使用 `DateUtil.createDateRange()`
- [ ] 所有日期格式使用 `DateUtil.formatDate()`
- [ ] 所有日期验证使用 `DateUtil.isValidDateString()`
- [ ] 单元测试覆盖时区场景
- [ ] 日志记录查询范围

---

## 参考资料

- **单元测试**: `backend/tests/utils/date.util.spec.ts`
- **工具类**: `backend/src/utils/date.util.ts`
- **时区工具**: `backend/src/utils/timezone.util.ts`

---

**文档维护者**: Backend Team
**最后审核**: 2026-01-23
