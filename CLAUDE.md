# CLAUDE.md - SevenKitchen AI协作指南

> 本文档定义所有Claude Code终端在SevenKitchen项目中必须遵守的规则和边界。

**阅读本文档后，你将知道：**
- 你当前是什么角色（自动识别）
- 你能做什么、不能做什么
- 你必须遵守哪些规则
- 遇到问题如何解决

---

# 第1章：角色自动识别与行为边界

## 🤖 自动识别机制

执行任务前，先检测当前主要工作目录：

- 如果在 `backend/` 目录工作 → 你是 **Backend开发者**
- 如果在 `miniapp/` 目录工作 → 你是 **MiniApp开发者**
- 如果在 `admin-web/` 目录工作 → 你是 **AdminWeb开发者**

## 🔄 协作环境

本项目使用**多终端协作模式**：

- **Terminal A**：Backend开发者，负责 `backend/`
- **Terminal B**：MiniApp开发者，负责 `miniapp/`
- **Terminal C**：AdminWeb开发者，负责 `admin-web/`

每个终端只修改自己负责的模块，避免Git冲突。

---

## 📋 Backend开发者规则

### ✅ 你的职责范围

- 修改 `backend/src/` 代码
- 编写API接口和业务逻辑
- 设计数据模型（Prisma Schema）
- 编写单元测试和集成测试
- 通过SSH部署到服务器

### 📖 允许阅读

- `docs/` 目录的所有文档（理解系统架构）
- `miniapp/` 的文档（了解小程序需要什么API）
- `miniapp/` 的代码（只读，理解如何调用你的API）
- `admin-web/` 的代码（只读，理解后台管理需求）

### ❌ 禁止事项

- 不要修改 `miniapp/` 的代码
- 不要修改 `admin-web/` 的代码（除非明确要求集成测试）
- 不要直接操作生产数据库（必须通过Prisma migration）
- 不要使用"想象"的字段名（先查文档）

### 📚 必读文档（按优先级）

1. **docs/DATABASE_NAMING_CONVENTIONS.md** ⭐⭐⭐⭐⭐
   - Prisma用驼峰命名，PostgreSQL用蛇形命名
   - 禁止"想象"字段名

2. **docs/07_Core_Architecture.md** ⭐⭐⭐⭐
   - 核心架构和数据模型
   - 业务规则和算法

3. **docs/04_Domain_Model_and_Algorithms.md** ⭐⭐⭐⭐
   - 领域模型和业务逻辑

4. **docs/05_API_Specs.md** ⭐⭐⭐
   - API契约和接口定义

---

## 📱 MiniApp开发者规则

### ✅ 你的职责范围

- 修改 `miniapp/src/` 代码
- 开发小程序页面和组件
- 调用后端API
- 本地测试和调试

### 📖 允许阅读

- `docs/` 目录的所有文档
- `backend/` 的文档（了解API接口）
- `backend/` 的代码（只读，理解API实现）

### ❌ 禁止事项

- 不要修改 `backend/` 的代码
- 不要修改 `admin-web/` 的代码
- 不要直接修改数据库Schema

### 📚 必读文档

1. **docs/05_API_Specs.md** ⭐⭐⭐⭐⭐
   - API接口定义和调用方式

2. **docs/03_Features_and_UI_Blueprints.md** ⭐⭐⭐⭐
   - 功能需求和UI设计

3. **docs/02_Roles_and_Core_Flows.md** ⭐⭐⭐
   - 用户角色和核心流程

---

## 💻 AdminWeb开发者规则

### ✅ 你的职责范围

- 修改 `admin-web/src/` 代码
- 开发管理后台页面
- 调用后端API
- 本地测试和调试

### 📖 允许阅读

- `docs/` 目录的所有文档
- `backend/` 的文档（了解API接口）
- `backend/` 的代码（只读，理解API实现）

### ❌ 禁止事项

- 不要修改 `backend/` 的代码（除非明确要求集成测试）
- 不要修改 `miniapp/` 的代码
- 不要直接修改数据库Schema

### 📚 必读文档

1. **docs/05_API_Specs.md** ⭐⭐⭐⭐⭐
   - API接口定义和调用方式

2. **docs/02_Roles_and_Core_Flows.md** ⭐⭐⭐⭐
   - 管理员角色和后台流程

---

## 🔒 通用边界（所有角色遵守）

### ✅ 共同职责

- 阅读相关文档，不要"想象"需求
- 本地测试通过后再提交
- 遵循TypeScript严格模式
- 编写清晰的Commit信息

### ❌ 红线（绝对禁止）

- **直接修改生产数据库**
- **使用未经验证的字段名**
- **修改其他终端负责的模块**
- **跳过文档直接"实现"**
- **未经测试的代码提交到服务器**

---

## 📝 工作流程检查清单

执行任务前，确认：

1. [ ] 检测当前工作目录，确认角色
2. [ ] 阅读必读文档（尤其是数据库命名规范）
3. [ ] 明确任务边界（只修改自己负责的模块）
4. [ ] 本地测试通过
5. [ ] 提交前Review代码变更

---

**下一章：第2章 - 分支策略与Git工作流**
