# 过敏记录API测试指南

> **版本**: v1.0.0
> **日期**: 2025-01-25
> **功能**: 狗狗过敏记录管理

## 📋 功能概述

过敏记录功能允许用户为狗狗记录和管理过敏信息，包括：
- 过敏原信息（过敏原、类型、发现日期、症状等）
- 严重程度和确认方
- 治疗方案和备注
- 附件上传（检测报告图片或PDF）

## 🗄️ 数据模型

### AllergyRecord表结构

```prisma
model AllergyRecord {
  id            String       @id @default(uuid())
  dogId         String
  allergen      String       // 过敏原
  allergenType  AllergenType // 过敏原类型: FOOD/ENVIRONMENTAL/MEDICATION
  discoveryDate DateTime     @db.Date // 发现日期
  symptoms      String       // 症状
  severity      Severity     @default(MILD) // 严重程度: MILD/MODERATE/SEVERE
  confirmedBy   ConfirmedBy  @default(VET) // 确认方: VET/OWNER
  treatment     String?      // 治疗方案
  notes         String?      // 备注
  attachments   String[]     @default([]) // 附件URL数组
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  dog           Dog          @relation(fields: [dogId], references: [id], onDelete: Cascade)
}
```

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
