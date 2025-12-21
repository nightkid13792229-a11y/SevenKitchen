# 腾讯云轻量应用服务器部署指南

本文档面向零基础用户，提供在腾讯云轻量应用服务器（Ubuntu 22.04）上部署 SevenKitchen 后端服务的完整步骤。

## 目录

- [准备工作](#准备工作)
- [服务器环境准备](#服务器环境准备)
- [拉取代码](#拉取代码)
- [安装依赖](#安装依赖)
- [数据库配置](#数据库配置)
- [环境变量配置](#环境变量配置)
- [构建与部署](#构建与部署)
- [配置系统服务](#配置系统服务)
- [配置 Nginx 反向代理（可选）](#配置-nginx-反向代理可选)
- [验证部署](#验证部署)
- [常见故障排查](#常见故障排查)

---

## 准备工作

### 1. 服务器信息

- **操作系统**: Ubuntu 22.04 LTS
- **公网 IP**: 1.14.3.2（请根据实际情况修改）
- **端口**: 后端应用默认监听 3000 端口

### 2. 所需工具

确保服务器已安装以下工具（如未安装，后续步骤会指导安装）：

- Node.js (v18.20.8 或更高版本，建议升级到 Node 20/22)
- pnpm（包管理器）
- Docker 和 Docker Compose（用于数据库）
- Git（用于拉取代码）

---

## 服务器环境准备

### 1. 更新系统

```bash
sudo apt update
sudo apt upgrade -y
```

### 2. 安装 Node.js

如果 Node.js 未安装或版本过低，执行：

```bash
# 安装 Node.js 20（推荐）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node --version
npm --version
```

### 3. 安装 pnpm

```bash
# 启用 corepack（Node.js 内置）
sudo corepack enable

# 安装 pnpm
corepack prepare pnpm@latest --activate

# 验证安装
pnpm --version
```

### 4. 安装 Docker 和 Docker Compose

```bash
# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 将当前用户添加到 docker 组（避免每次使用 sudo）
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo apt install -y docker-compose-plugin

# 验证安装
docker --version
docker compose version

# 注意：需要重新登录或执行 newgrp docker 使组权限生效
newgrp docker
```

### 5. 安装 Git（如未安装）

```bash
sudo apt install -y git
```

---

## 拉取代码

### 1. 克隆仓库

```bash
# 进入用户主目录（或您希望部署的目录）
cd ~

# 克隆仓库（请替换为实际仓库地址）
git clone <your-repo-url> SevenKitchen
cd SevenKitchen/backend
```

### 2. 切换到目标分支/标签

```bash
# 例如切换到主分支
git checkout main

# 或切换到特定标签
# git checkout v1.0.0
```

---

## 安装依赖

```bash
# 确保在 backend 目录下
cd ~/SevenKitchen/backend

# 安装项目依赖
pnpm install
```

---

## 数据库配置

### 方案选择

本项目使用 **方案 A：Docker Compose 部署 PostgreSQL**（推荐，适合初期低访问量场景）。

### 启动 PostgreSQL 数据库

```bash
# 进入 backend 目录
cd ~/SevenKitchen/backend

# 使用生产环境配置启动数据库
docker compose -f deploy/docker-compose.postgres.yml up -d

# 验证数据库容器运行状态
docker ps | grep postgres
```

### 配置 DATABASE_URL

数据库启动后，需要设置 `DATABASE_URL` 环境变量。根据 `deploy/docker-compose.postgres.yml` 的配置：

```bash
# 格式：postgresql://用户名:密码@主机:端口/数据库名
export DATABASE_URL="postgresql://sevenkitchen:sevenkitchen@localhost:5432/sevenkitchen"
```

**注意**：此环境变量需要在后续步骤中写入配置文件，详见 [环境变量配置](#环境变量配置) 章节。

### 验证数据库连接

```bash
# 使用 psql 测试连接（如已安装 psql）
psql "$DATABASE_URL" -c "SELECT version();"

# 或使用 Docker 执行
docker exec -it sevenkitchen-postgres psql -U sevenkitchen -d sevenkitchen -c "SELECT version();"
```

---

## 环境变量配置

### 1. 创建环境变量文件

```bash
cd ~/SevenKitchen/backend

# 创建 .env 文件
cat > .env << 'EOF'
# 数据库连接（必需）
DATABASE_URL=postgresql://sevenkitchen:sevenkitchen@localhost:5432/sevenkitchen

# 应用端口（可选，默认 3000）
PORT=3000

# JWT 密钥（生产环境请修改）
JWT_SECRET=your-production-jwt-secret-key-change-this

# 仓库模式配置（可选，默认值如下）
# PRODUCTION_REPO=prisma
# INVENTORY_REPO=prisma
# ORDER_REPO=memory
# ADDRESS_REPO=memory
# DOG_REPO=memory
# RECIPE_REPO=memory
EOF
```

### 2. 验证环境变量

```bash
# 运行环境变量校验脚本
bash scripts/verify_env.sh
```

脚本会检查必需的环境变量，并提示缺失或配置错误的情况。

---

## 构建与部署

### 方式一：使用自动化部署脚本（推荐）

```bash
cd ~/SevenKitchen/backend

# 执行部署脚本
bash scripts/deploy_lighthouse.sh
```

该脚本会自动完成：
1. 安装依赖（corepack/pnpm）
2. 生成 Prisma Client
3. 运行数据库迁移
4. 构建项目
5. 启动服务（如未配置 systemd，则前台运行）

### 方式二：手动部署

```bash
cd ~/SevenKitchen/backend

# 1. 生成 Prisma Client
pnpm prisma generate

# 2. 运行数据库迁移
pnpm prisma migrate deploy

# 3. 构建项目
pnpm run build

# 4. 启动服务（前台运行，用于测试）
pnpm start:prod
```

---

## 配置系统服务

为了确保服务在服务器重启后自动启动，建议配置 systemd 服务。

### 安装 systemd 服务

```bash
cd ~/SevenKitchen/backend

# 执行安装脚本
sudo bash scripts/install_systemd_service.sh
```

该脚本会：
1. 创建 systemd 服务文件
2. 设置服务自动启动
3. 启动服务

### 管理服务

```bash
# 启动服务
sudo systemctl start sevenkitchen-backend

# 停止服务
sudo systemctl stop sevenkitchen-backend

# 重启服务
sudo systemctl restart sevenkitchen-backend

# 查看服务状态
sudo systemctl status sevenkitchen-backend

# 查看服务日志
sudo journalctl -u sevenkitchen-backend -f

# 设置开机自启（安装脚本已自动配置）
sudo systemctl enable sevenkitchen-backend
```

---

## 配置 Nginx 反向代理（可选）

虽然应用可以直接监听 3000 端口，但通过 Nginx 反向代理到 80 端口可以：
- 统一端口管理
- 便于后续配置 HTTPS
- 提供更好的性能和安全特性

### 1. 安装 Nginx

```bash
sudo apt install -y nginx
```

### 2. 配置 Nginx

```bash
# 复制示例配置
sudo cp ~/SevenKitchen/backend/deploy/nginx.conf.example /etc/nginx/sites-available/sevenkitchen

# 创建符号链接启用配置
sudo ln -s /etc/nginx/sites-available/sevenkitchen /etc/nginx/sites-enabled/

# 删除默认配置（可选）
sudo rm /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

### 3. 配置防火墙（如启用）

```bash
# 允许 HTTP 流量
sudo ufw allow 80/tcp

# 允许 HTTPS 流量（如后续配置）
# sudo ufw allow 443/tcp

# 查看防火墙状态
sudo ufw status
```

---

## 验证部署

### 1. 运行验证脚本

```bash
cd ~/SevenKitchen/backend

# 执行部署后验证
bash scripts/post_deploy_verify.sh
```

### 2. 手动验证

#### 本地验证（在服务器上）

```bash
# 如果直接使用 3000 端口
curl http://127.0.0.1:3000/api/v1/health

# 如果配置了 Nginx
curl http://127.0.0.1/api/v1/health
```

预期响应：
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

#### 公网验证（从外部访问）

```bash
# 如果直接使用 3000 端口（需确保防火墙开放）
curl http://1.14.3.2:3000/api/v1/health

# 如果配置了 Nginx
curl http://1.14.3.2/api/v1/health
```

**注意**：请将 `1.14.3.2` 替换为您的实际公网 IP。

### 3. 验证 Swagger 文档

```bash
# 访问 Swagger UI（如配置了 Nginx）
curl http://1.14.3.2/api/docs

# 或在浏览器中访问
# http://1.14.3.2/api/docs
```

---

## 常见故障排查

### 1. 服务无法启动

**问题**：执行 `pnpm start:prod` 或 systemd 服务启动失败

**排查步骤**：

```bash
# 检查环境变量
bash scripts/verify_env.sh

# 检查数据库连接
psql "$DATABASE_URL" -c "SELECT 1;"

# 查看应用日志
sudo journalctl -u sevenkitchen-backend -n 50

# 检查端口占用
sudo netstat -tlnp | grep 3000
```

**常见原因**：
- `DATABASE_URL` 未设置或格式错误
- 数据库未启动
- 端口被占用
- Prisma Client 未生成

### 2. 数据库连接失败

**问题**：应用启动时报错 "DATABASE_URL is required" 或连接超时

**排查步骤**：

```bash
# 检查数据库容器状态
docker ps | grep postgres

# 检查数据库日志
docker logs sevenkitchen-postgres

# 测试数据库连接
docker exec -it sevenkitchen-postgres psql -U sevenkitchen -d sevenkitchen -c "SELECT 1;"

# 检查 DATABASE_URL 环境变量
echo $DATABASE_URL
```

**解决方案**：
- 确保数据库容器正在运行：`docker compose -f deploy/docker-compose.postgres.yml up -d`
- 检查 `.env` 文件中的 `DATABASE_URL` 配置
- 确保 systemd 服务文件正确加载了 `.env` 文件

### 3. 迁移失败

**问题**：执行 `pnpm prisma migrate deploy` 失败

**排查步骤**：

```bash
# 查看迁移状态
pnpm prisma migrate status

# 检查数据库连接
psql "$DATABASE_URL" -c "\dt"

# 查看 Prisma 日志
pnpm prisma migrate deploy --verbose
```

**解决方案**：
- 确保数据库已创建并运行
- 检查 `DATABASE_URL` 是否正确
- 如数据库已有数据，可能需要先备份

### 4. 端口无法访问

**问题**：公网无法访问 `/api/v1/health`

**排查步骤**：

```bash
# 检查服务是否运行
sudo systemctl status sevenkitchen-backend

# 检查本地端口监听
sudo netstat -tlnp | grep 3000

# 检查防火墙规则
sudo ufw status

# 检查腾讯云安全组规则（需在控制台操作）
```

**解决方案**：
- 确保服务正在运行
- 开放防火墙端口：`sudo ufw allow 3000/tcp`（如直接使用 3000 端口）
- 在腾讯云控制台配置安全组，允许 3000 端口（或 80 端口，如使用 Nginx）的入站流量

### 5. Nginx 502 Bad Gateway

**问题**：配置 Nginx 后返回 502 错误

**排查步骤**：

```bash
# 检查 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 检查后端服务是否运行
sudo systemctl status sevenkitchen-backend

# 测试后端服务本地连接
curl http://127.0.0.1:3000/api/v1/health
```

**解决方案**：
- 确保后端服务正在运行
- 检查 Nginx 配置中的 `proxy_pass` 地址是否正确（应为 `http://127.0.0.1:3000`）
- 检查后端服务监听的地址（应监听 `0.0.0.0:3000`，而非仅 `127.0.0.1:3000`）

### 6. Prisma Client 未生成

**问题**：运行时错误 "Cannot find module '@prisma/client'"

**解决方案**：

```bash
# 重新生成 Prisma Client
cd ~/SevenKitchen/backend
pnpm prisma generate
```

---

## 后续优化（TODO）

以下功能不在本次交付范围内，但建议后续考虑：

1. **HTTPS 配置**：使用 Let's Encrypt 配置 SSL 证书
2. **域名配置**：绑定域名并配置 DNS
3. **日志管理**：配置日志轮转和集中管理
4. **监控告警**：配置应用监控和告警
5. **备份策略**：配置数据库自动备份
6. **Node.js 版本升级**：升级到 Node.js 20/22 LTS

---

## 快速参考

### 常用命令

```bash
# 进入项目目录
cd ~/SevenKitchen/backend

# 查看服务状态
sudo systemctl status sevenkitchen-backend

# 查看服务日志
sudo journalctl -u sevenkitchen-backend -f

# 重启服务
sudo systemctl restart sevenkitchen-backend

# 验证环境变量
bash scripts/verify_env.sh

# 验证部署
bash scripts/post_deploy_verify.sh

# 重新部署
bash scripts/deploy_lighthouse.sh
```

### 文件位置

- 项目目录：`~/SevenKitchen/backend`
- 环境变量文件：`~/SevenKitchen/backend/.env`
- systemd 服务文件：`/etc/systemd/system/sevenkitchen-backend.service`
- Nginx 配置：`/etc/nginx/sites-available/sevenkitchen`
- 应用日志：`sudo journalctl -u sevenkitchen-backend`

---

## 技术支持

如遇到问题，请：

1. 查看本文档的 [常见故障排查](#常见故障排查) 章节
2. 检查服务日志：`sudo journalctl -u sevenkitchen-backend -n 100`
3. 运行验证脚本：`bash scripts/post_deploy_verify.sh`
4. 参考项目文档：`backend/docs/` 目录下的其他文档

---

**最后更新**：2024-12-20
