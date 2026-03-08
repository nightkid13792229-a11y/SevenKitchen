# SevenKitchen 部署指南

## 禂述

本文档描述了如何将 SevenKitchen 从开发环境部署到生产环境。

## 綀境架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      开发环境 (本地)                          │
├─────────────────────────────────────────────────────────────────┤
│  后端: NODE_ENV=development                         │
│  数据库: sevenkitchen_dev (本地 Docker)                        │
│  API: http://localhost:3001                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 部署
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      生产环境 (腾讯云)                          │
├─────────────────────────────────────────────────────────────────┤
│  后端: NODE_ENV=production                                │
│  数据库: sevenkitchen (腾讯云 PostgreSQL)                     │
│  API: https://api.sevenkitchen.cloud                    │
└─────────────────────────────────────────────────────────────────┘
```

## 稡块配置

### 后端 (Backend)

| 环境 | 配置文件 | 数据库 |
|------|----------|--------|
| 开发 | `.env.development` | 本地 PostgreSQL (Docker) |
| 生产 | `.env.production` | 腾讯云 PostgreSQL |

### 小程序 (MiniApp)

| 构建命令 | API 地址 | 用途 |
|----------|----------|------|
| `npm run dev:mp-weixin` | localhost:3001 | 开发调试 |
| `npm run build:mp-weixin` | api.sevenkitchen.cloud | 生产发布 |

### 管理后台 (AdminWeb)

| 环境 | 配置文件 | API 地址 |
|------|----------|----------|
| 开发 | `.env.development` | localhost:3001 |
| 生产 | `.env.production` | api.sevenkitchen.cloud |

---

## 部署流程

### 1. 后端部署

```bash
# 1. SSH 登录到生产服务器
ssh -i ~/.ssh/claude_deploy root@1.14.3.2

# 2. 进入项目目录
cd /opt/sevenkitchen/SevenKitchen

# 3. 拉取最新代码
git pull origin main

# 4. 生成 Prisma Client
cd backend
npx prisma generate

# 5. 运行数据库迁移（如果有新的迁移）
npx prisma migrate deploy

# 6. 构建项目
pnpm build

# 7. 重启服务
pkill -f "node dist"
nohup pnpm start:prod > /dev/null 2>&1 &
```

### 2. 小程序发布

```bash
# 1. 本地构建生产版本
cd miniapp
npm run build:mp-weixin

# 2. 使用微信开发者工具打开 dist/build/mp-weixin
# 3. 点击上传按钮，# 4. 填写版本号和备注
# 5. 提交审核
```

### 3. 管理后台部署

```bash
# 使用部署脚本
./deploy-admin-web.sh
```

---

## 环境切换

### 使用环境脚本

```bash
# 查看当前环境状态
./scripts/env.sh status

# 切换到开发环境
./scripts/env.sh dev

# 切换到生产环境
./scripts/env.sh prod
```

### 手动切换

**后端:**
```bash
# 开发环境
cp backend/.env.development backend/.env
cd backend && pnpm start:dev

# 生产环境
cp backend/.env.production backend/.env
cd backend && pnpm start:prod
```

---

## 注意事项

1. **敏感信息保护**
   - `.env.production` 文件包含生产环境敏感信息，**切勿提交到 Git**
   - 已在 `.gitignore` 中配置忽略

2. **数据库迁移**
   - 生产环境数据库迁移前请先备份
   - 使用 `prisma migrate deploy` 而非 `prisma migrate dev`

3. **小程序域名配置**
   - 确保微信小程序后台已配置服务器域名 `api.sevenkitchen.cloud`
   - 开发环境可在微信开发者工具中勾选"不校验合法域名"

---

## 快速参考

| 操作 | 命令 |
|------|------|
| 查看环境状态 | `./scripts/env.sh status` |
| 后端开发模式 | `cd backend && pnpm start:dev` |
| 后端生产模式 | `cd backend && pnpm start:prod` |
| 小程序开发构建 | `cd miniapp && npm run dev:mp-weixin` |
| 小程序生产构建 | `cd miniapp && npm run build:mp-weixin` |
| 管理后台部署 | `./deploy-admin-web.sh` |
