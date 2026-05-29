# SevenKitchen - 狗狗鲜食 SaaS & ERP

> 合并、部署、上传小程序审核前，必须先读：[Release Stability Notice](./IMPORTANT_RELEASE_STABILITY_NOTICE.md)。

## 🚨 重要提示（AI开发者必读）

### 在操作数据库前，必须阅读：

**[数据库命名规范与Prisma映射规则](./docs/DATABASE_NAMING_CONVENTIONS.md)**

**核心约束：禁止"想象"字段名**

Prisma Schema定义使用**驼峰命名**（如 `sizeCategory`），但PostgreSQL实际存储使用**蛇形命名**（如 `size_category`）。

#### ❌ 错误示例
```sql
SELECT "sizeCategory" FROM dog_breed;  -- 列不存在！
```

#### ✅ 正确示例
```sql
SELECT size_category FROM dog_breed;  -- 正确
```

#### 验证表结构（必须执行）
```bash
sudo -u postgres psql -d sevenkitchen -c "\d dog_breed"
```

---

## 项目结构

```
SevenKitchen/
├── backend/           # NestJS后端
│   ├── prisma/       # 数据库Schema和迁移
│   ├── src/          # 源代码
│   └── ...           # 其他配置
├── miniapp/          # 微信小程序
├── admin-web/        # 管理后台
├── docs/             # 核心文档
│   ├── 07_Core_Architecture.md         # 核心架构
│   └── DATABASE_NAMING_CONVENTIONS.md  # 命名规范（必读！）
└── README.md         # 本文件
```

---

## 核心文档

| 文档 | 说明 | 重要性 |
|------|------|--------|
| [数据库命名规范](./docs/DATABASE_NAMING_CONVENTIONS.md) | Prisma与PostgreSQL映射规则 | ⭐⭐⭐⭐⭐ 必读 |
| [核心架构](./docs/07_Core_Architecture.md) | 数据模型和业务逻辑 | ⭐⭐⭐⭐ |
| [部署文档](./backend/docs/DEPLOYMENT_TENCENT_LIGHTHOUSE.md) | 云服务器部署指南 | ⭐⭐⭐ |

---

## 快速开始

### 后端
```bash
cd backend
npm install
npx prisma generate
npm run start:dev
```

### 小程序
```bash
cd miniapp
npm install
npm run dev:mp-weixin
```

---

## 技术栈

- **后端**: NestJS + PostgreSQL + Prisma ORM
- **小程序**: uni-app (Vue 3 + TypeScript)
- **管理后台**: Vue 3 + Element Plus
- **数据库**: PostgreSQL 14

---

## 版本历史

- **2025-12-24**: 添加数据库命名规范文档，防止字段名错误
- **2025-12-23**: 完成200品种数据库导入

---

**更新日期**: 2025-12-24
