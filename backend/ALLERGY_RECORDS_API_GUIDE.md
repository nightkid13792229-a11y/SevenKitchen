# 过敏记录 API 指南

> ⚠️ **本文档已过时，2026-10-04 重写。**
>
> 原始版本（v1.0.0 / 2025-01-25）描述的是**一套已经不存在的字段**：
> `allergenType` / `discoveryDate` / `symptoms` / `severity` /
> `confirmedBy` / `treatment` 六个字段在 2026-01-25 的迁移
> `20260125225305_remove_allergy_record_fields` 里被**主动删除**
> （当时过敏只是表单里的一栏，没人填，字段越多顾客越不想填）。
> 那六个字段的数据**已经彻底丢失**（是删列，不是归档），无法恢复。
>
> 完整的最新方案见 `docs/plans/2026-10-04-allergy-module-refactor-design.md`。

> **版本**: v2.0.0
> **日期**: 2026-10-04（过敏板块重构后重写）
> **功能**: 狗狗过敏记录 + 检测报告 + 排查计划

## 📋 功能概述

过敏板块在 2026-10-04 做过一次重构，现在是三层结构：

| 层 | 是什么 | 接口 |
|---|---|---|
| **结论** | 这只狗**不能吃什么**（带可信度） | `GET /dogs/:dogId/allergen-profile` |
| **报告** | 结论的依据：检测日期 / 方式 / 原件 | `/dogs/:dogId/allergy-reports` |
| **排查计划** | 排除性饮食试验的执行过程 | `/dogs/:dogId/allergy-trial` |

记录本身仍是 CRUD：`/dogs/:dogId/allergies`。

### 三条不可动摇的设计

1. **过敏 ≠ 不爱吃** —— 真过敏走过敏板块，挑食走饮食偏好，永久分开。
2. **AI 只把纸上的字搬进表单** —— 不判断疾病名称、严重程度、过敏类型。
   识别结果**必须顾客确认**才落库。
3. **排除试验必须由兽医设计与监督** —— 系统只帮执行、记录、汇总。

## 🗄️ 数据模型

### AllergyRecord表结构

```prisma
model AllergyRecord {
  id          String           @id @default(uuid())
  dogId       String
  allergen    String           // 过敏原（标准名或顾客原文）
  notes       String?
  certainty   AllergyCertainty @default(SUSPECTED) // 确诊/可疑/待排查/已排除
  source      String           @default("OWNER")    // REPORT/OWNER/STAFF/ORDER/PLAN
  reportId    String?          // 来自哪份检测报告（可空）
  observedAt  DateTime?        @db.Date
  attachments String[]         @default([])
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  dog         Dog              @relation(fields: [dogId], references: [id], onDelete: Cascade)
  report      AllergyReport?   @relation(fields: [reportId], references: [id], onDelete: SetNull)

  @@unique([dogId, allergen])   // 同一只狗 + 同一过敏原只能有一条
  @@map("allergy_record")
}

// 检测报告（2026-10-04 第二期）：检测日期 / 方式 / 机构 / 原件
model AllergyReport {
  id          String
  dogId       String
  testDate    DateTime?         @db.Date
  testMethod  AllergyTestMethod @default(UNKNOWN) // SERUM/INTRADERMAL/ELIMINATION/OTHER/UNKNOWN
  institution String?
  summary     String?
  attachments String[]          @default([])  // 报告原件，改造前传完就丢
  ocrText     String?
  // ...
}
```

### certainty 的四档含义（2026-10-04 第一期）

| 值 | 含义 | 对食谱推荐的影响 |
|---|---|---|
| `CONFIRMED` | 确诊：报告明确阳性，或排查计划已确认 | **含该食材的食谱彻底不进推荐** |
| `SUSPECTED` | 可疑：报告写弱阳性/疑似，或排查进行中 | 保留但重罚并标注 |
| `TO_VERIFY` | 待排查：主人自己怀疑，还没验证 | 同「可疑」 |
| `RULED_OUT` | 已排除：排查计划验证过，不过敏 | 不再避开 |

### 过敏原词表（2026-10-04 第一期）

推荐与配方的避雷**不再用文字包含**判断，而是查表：

- `allergen_tag` —— 过敏原受控词表（标准名 + 别名 + 类别 + 常见度）
- `ingredient_allergen_tag` —— 食材 ↔ 过敏原的**显式**关联

原因：顾客点「鸡肉」，原料库叫「鸡胸」「鸡腿肉」「鸡心」「鸡肝」「鸡胗」，
而 `"鸡胸".includes("鸡肉") === false`。实测 12 个常见标签里
**8 个匹配不到任何真实食材**，避雷基本没生效。

初始化：`npm run seed:allergen-vocabulary:apply`
（先跑不带 `:apply` 的预演版看报告）。


## 🔌 API端点

### 基础路径
```
/api/v1/dogs/:dogId/allergies
```

### 1. 创建过敏记录

**端点**: `POST /api/v1/dogs/:dogId/allergies`

**请求头**:
```json
{
  "Authorization": "Bearer <token>"
}
```

**请求体**:
```json
{
  "allergen": "鸡肉",
  "allergenType": "FOOD",
  "discoveryDate": "2024-01-15",
  "symptoms": "皮肤瘙痒、呕吐",
  "severity": "MODERATE",
  "confirmedBy": "VET",
  "treatment": "避免食用鸡肉，使用抗过敏药物",
  "notes": "测试过敏记录",
  "attachments": ["https://example.com/report.pdf"]
}
```

**响应**:
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "id": "uuid",
    "dogId": "uuid",
    "allergen": "鸡肉",
    "allergenType": "FOOD",
    "discoveryDate": "2024-01-15",
    "symptoms": "皮肤瘙痒、呕吐",
    "severity": "MODERATE",
    "confirmedBy": "VET",
    "treatment": "避免食用鸡肉，使用抗过敏药物",
    "notes": "测试过敏记录",
    "attachments": ["https://example.com/report.pdf"],
    "createdAt": "2024-01-15T00:00:00Z",
    "updatedAt": "2024-01-15T00:00:00Z"
  }
}
```

### 2. 获取过敏记录列表

**端点**: `GET /api/v1/dogs/:dogId/allergies`

**响应**:
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "total": 2,
    "records": [
      {
        "id": "uuid",
        "allergen": "鸡肉",
        "allergenType": "FOOD",
        "discoveryDate": "2024-01-15",
        "symptoms": "皮肤瘙痒、呕吐",
        "severity": "MODERATE",
        "confirmedBy": "VET",
        "attachments": ["https://example.com/report.pdf"],
        "createdAt": "2024-01-15T00:00:00Z",
        "updatedAt": "2024-01-15T00:00:00Z"
      }
    ]
  }
}
```

### 3. 获取单个过敏记录

**端点**: `GET /api/v1/dogs/:dogId/allergies/:id`

**响应**: 同创建响应的data字段

### 4. 更新过敏记录

**端点**: `PUT /api/v1/dogs/:dogId/allergies/:id`

**请求体**: 所有字段都是可选的
```json
{
  "severity": "SEVERE",
  "treatment": "立即停止食用",
  "notes": "更新后的备注",
  "attachments": ["https://example.com/new-report.pdf"]
}
```

**响应**: 同创建响应

### 5. 删除过敏记录

**端点**: `DELETE /api/v1/dogs/:dogId/allergies/:id`

**响应**:
```json
{
  "code": 0,
  "message": "Success",
  "data": null
}
```

### 6. 获取狗狗详情（包含过敏记录）

**端点**: `GET /api/v1/dogs/:id`

**响应中的allergyRecords字段**:
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "profile": {
      "id": "uuid",
      "name": "旺财",
      // ... 其他字段
      "allergyRecords": [
        {
          "id": "uuid",
          "allergen": "鸡肉",
          "allergenType": "FOOD",
          "discoveryDate": "2024-01-15",
          "symptoms": "皮肤瘙痒、呕吐",
          "severity": "MODERATE",
          "confirmedBy": "VET",
          "treatment": null,
          "notes": null,
          "attachments": []
        }
      ]
    }
  }
}
```

## 🧪 测试用例

### 测试环境
- **测试用户ID**: 65c162eb-5767-42fa-8075-5cfc1e765fce (管理员)
- **测试狗狗ID**: 3ec6faf6-f83e-4996-bb1d-8c5f86b41d4b

### 获取Token
```bash
curl -X POST 'http://localhost:3001/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"65c162eb-5767-42fa-8075-5cfc1e765fce"}'
```

### 测试1: 创建过敏记录
```bash
curl -X POST 'http://localhost:3001/api/v1/dogs/3ec6faf6-f83e-4996-bb1d-8c5f86b41d4b/allergies' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "allergen": "牛肉",
    "allergenType": "FOOD",
    "discoveryDate": "2024-05-10",
    "symptoms": "拉稀",
    "severity": "MILD",
    "confirmedBy": "OWNER",
    "attachments": ["https://test.com/beef-test.pdf"]
  }'
```

### 测试2: 更新过敏记录（包含attachments）
```bash
curl -X PUT 'http://localhost:3001/api/v1/dogs/3ec6faf6-f83e-4996-bb1d-8c5f86b41d4b/allergies/<id>' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "attachments": ["https://test.com/file1.pdf", "https://test.com/file2.jpg"]
  }'
```

### 测试3: 验证数据库
```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d sevenkitchen -c \
  "SELECT id, allergen, attachments FROM allergy_record WHERE id = '<id>';"
```

## ✅ 测试结果

所有测试均已通过：

- ✅ GET `/api/v1/dogs/:dogId/allergies` - 获取列表
- ✅ POST `/api/v1/dogs/:dogId/allergies` - 创建记录
- ✅ GET `/api/v1/dogs/:dogId/allergies/:id` - 获取单个记录
- ✅ PUT `/api/v1/dogs/:dogId/allergies/:id` - 更新记录
- ✅ DELETE `/api/v1/dogs/:dogId/allergies/:id` - 删除记录
- ✅ GET `/api/v1/dogs/:id` - 返回allergyRecords数组

## 📦 修改文件清单

### 后端 (7个文件)
1. `backend/prisma/schema.prisma` - 数据库Schema
2. `backend/src/domain/health/health.repository.ts` - Domain接口
3. `backend/src/interfaces/dto/health/create-allergy.dto.ts` - 创建DTO
4. `backend/src/interfaces/dto/health/update-allergy.dto.ts` - 更新DTO
5. `backend/src/interfaces/dto/health/allergy-response.dto.ts` - 响应DTO
6. `backend/src/application/health/health.service.ts` - 业务逻辑
7. `backend/src/infrastructure/repositories/prisma-health.repository.ts` - 数据访问

### 前端 (1个文件)
1. `miniapp/src/pages/dog-create/index.vue` - 完整UI和逻辑 (~850行新增代码)

## 🔗 相关文档

- [设计文档](./plans/2025-01-25-allergy-records-redesign-design.md)
- [实施计划](./plans/2025-01-25-allergy-records-implementation.md)
- [数据库命名规范](./DATABASE_NAMING_CONVENTIONS.md)
- [API规范文档](./05_API_Specs.md)
