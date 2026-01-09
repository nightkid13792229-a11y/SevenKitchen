# 腾讯云轻量应用服务器部署 - 执行摘要

## 交付日期
2024-12-20

## 目标
为"腾讯云轻量应用服务器（Ubuntu 22.04）单机部署"补齐最小可上线交付物，使非 IT 用户也能按步骤完成部署并验证。

## 交付物清单

### 1. 部署文档
**文件**: `backend/docs/DEPLOYMENT_TENCENT_LIGHTHOUSE.md`

**内容**:
- 完整的部署步骤（面向零基础用户）
- 服务器环境准备（Node.js, pnpm, Docker, Git）
- 代码拉取与依赖安装
- 数据库配置（Docker Compose PostgreSQL）
- 环境变量配置
- 构建与部署流程
- systemd 服务配置
- Nginx 反向代理配置（可选）
- 验证步骤
- 常见故障排查

### 2. 环境变量校验脚本
**文件**: `backend/scripts/verify_env.sh`

**功能**:
- 检查必需环境变量（DATABASE_URL）
- 验证可选环境变量（PORT, JWT_SECRET）
- 检查仓库模式配置
- 提供清晰的错误提示和修复建议
- 支持从 `.env` 文件加载变量

### 3. 自动化部署脚本
**文件**: `backend/scripts/deploy_lighthouse.sh`

**功能**:
- 自动验证环境变量
- 确保 pnpm 可用（通过 corepack）
- 安装/更新项目依赖
- 生成 Prisma Client
- 运行数据库迁移
- 构建项目
- 检查并管理 systemd 服务
- 运行部署后验证

### 4. Systemd 服务安装脚本
**文件**: `backend/scripts/install_systemd_service.sh`

**功能**:
- 自动创建 systemd 服务文件
- 配置服务自动启动
- 设置正确的用户和工作目录
- 加载环境变量文件
- 配置服务重启策略
- 验证服务启动状态

### 5. Nginx 配置示例
**文件**: `backend/deploy/nginx.conf.example`

**功能**:
- HTTP 反向代理配置
- 健康检查端点配置
- API 端点代理配置
- Swagger 文档代理配置
- HTTPS 配置模板（注释状态，供后续使用）
- 安全头配置示例

### 6. 部署后验证脚本
**文件**: `backend/scripts/post_deploy_verify.sh`

**功能**:
- 检查 systemd 服务状态
- 验证端口监听
- 测试本地健康检查端点
- 测试公网健康检查端点（如可访问）
- 验证数据库连接
- 提供详细的测试结果摘要

### 7. 生产环境 Docker Compose 配置
**文件**: `backend/deploy/docker-compose.postgres.yml`

**功能**:
- PostgreSQL 16 容器配置
- 数据持久化卷配置
- 健康检查配置
- 资源限制配置
- 仅绑定 localhost（安全考虑）

## 数据库方案选择

**选择**: 方案 A - Docker Compose 部署 PostgreSQL

**理由**:
1. **最省事**: 无需单独安装和配置 PostgreSQL
2. **隔离性**: 容器化部署，不影响系统其他服务
3. **易维护**: 使用 Docker Compose 管理，启动/停止简单
4. **适合初期**: 满足低访问量场景需求
5. **数据持久化**: 通过 Docker volume 保证数据安全

**配置**:
- 数据库: PostgreSQL 16 (Alpine)
- 用户: sevenkitchen
- 密码: sevenkitchen
- 数据库名: sevenkitchen
- 端口: 5432 (仅本地访问)

## 变更文件清单

### 新增文件
1. `backend/docs/DEPLOYMENT_TENCENT_LIGHTHOUSE.md` - 部署文档
2. `backend/docs/DEPLOYMENT_EXECUTION_SUMMARY.md` - 本执行摘要
3. `backend/scripts/verify_env.sh` - 环境变量校验脚本
4. `backend/scripts/deploy_lighthouse.sh` - 部署脚本
5. `backend/scripts/install_systemd_service.sh` - systemd 服务安装脚本
6. `backend/scripts/post_deploy_verify.sh` - 部署后验证脚本
7. `backend/deploy/nginx.conf.example` - Nginx 配置示例
8. `backend/deploy/docker-compose.postgres.yml` - 生产环境 Docker Compose 配置

### 修改文件
无（本次交付不修改现有业务代码）

## 行为影响

### 对现有系统的影响
- **无影响**: 所有新增文件均为部署相关，不涉及业务逻辑修改
- **向后兼容**: 不影响现有开发、测试、CI/CD 流程
- **可选使用**: 所有脚本和配置均为可选，不影响现有部署方式

### 新增能力
1. **一键部署**: 通过 `deploy_lighthouse.sh` 实现自动化部署
2. **环境验证**: 通过 `verify_env.sh` 提前发现配置问题
3. **服务管理**: 通过 systemd 实现服务自动启动和重启
4. **部署验证**: 通过 `post_deploy_verify.sh` 自动验证部署结果

## 验证方式

### 本地验证（开发环境）
```bash
# 1. 验证脚本语法
bash -n scripts/verify_env.sh
bash -n scripts/deploy_lighthouse.sh
bash -n scripts/install_systemd_service.sh
bash -n scripts/post_deploy_verify.sh

# 2. 验证环境变量校验脚本（需要 .env 文件）
bash scripts/verify_env.sh
```

### 服务器验证（生产环境）
按照 `DEPLOYMENT_TENCENT_LIGHTHOUSE.md` 文档执行完整部署流程：

1. **环境准备**
   ```bash
   # 安装 Node.js, pnpm, Docker
   # 验证: node --version, pnpm --version, docker --version
   ```

2. **数据库启动**
   ```bash
   docker compose -f deploy/docker-compose.postgres.yml up -d
   docker ps | grep postgres
   ```

3. **环境变量配置**
   ```bash
   # 创建 .env 文件
   bash scripts/verify_env.sh
   ```

4. **部署**
   ```bash
   bash scripts/deploy_lighthouse.sh
   ```

5. **安装 systemd 服务**
   ```bash
   sudo bash scripts/install_systemd_service.sh
   ```

6. **验证部署**
   ```bash
   bash scripts/post_deploy_verify.sh
   curl http://127.0.0.1:3000/api/v1/health
   curl http://<public-ip>:3000/api/v1/health
   ```

### 验收标准
- ✅ 所有脚本可执行且无语法错误
- ✅ 环境变量校验脚本能正确识别缺失/错误配置
- ✅ 部署脚本能完成完整部署流程
- ✅ systemd 服务能正常启动和重启
- ✅ 健康检查端点 `/api/v1/health` 返回 `{"status":"ok",...}`
- ✅ 公网可访问健康检查端点（需配置防火墙/安全组）

## 风险与回滚

### 潜在风险

1. **环境变量配置错误**
   - **风险**: DATABASE_URL 配置错误导致应用无法启动
   - **缓解**: `verify_env.sh` 脚本会提前检查
   - **回滚**: 修正 `.env` 文件后重新部署

2. **数据库迁移失败**
   - **风险**: 迁移脚本执行失败导致数据库状态不一致
   - **缓解**: 部署脚本会检查迁移结果
   - **回滚**: 使用 Prisma 迁移回滚命令或手动恢复数据库

3. **端口冲突**
   - **风险**: 3000 端口被占用
   - **缓解**: 可通过 PORT 环境变量修改端口
   - **回滚**: 停止占用端口的服务或修改配置

4. **systemd 服务配置错误**
   - **风险**: 服务无法启动或权限问题
   - **缓解**: 安装脚本会验证服务状态
   - **回滚**: 修改服务文件后 `sudo systemctl daemon-reload && sudo systemctl restart sevenkitchen-backend`

### 回滚步骤

如果部署出现问题，可按以下步骤回滚：

1. **停止服务**
   ```bash
   sudo systemctl stop sevenkitchen-backend
   ```

2. **恢复代码**（如需要）
   ```bash
   cd ~/SevenKitchen/backend
   git checkout <previous-commit>
   ```

3. **恢复数据库**（如需要）
   ```bash
   # 使用备份恢复数据库
   # 或回滚 Prisma 迁移
   pnpm prisma migrate resolve --rolled-back <migration-name>
   ```

4. **重新部署**
   ```bash
   bash scripts/deploy_lighthouse.sh
   ```

## 后续优化建议（TODO）

以下功能不在本次交付范围内，但建议后续考虑：

1. **HTTPS 配置**
   - 使用 Let's Encrypt 自动获取 SSL 证书
   - 配置 Certbot 自动续期

2. **域名配置**
   - 绑定域名并配置 DNS
   - 更新 Nginx 配置中的 server_name

3. **日志管理**
   - 配置日志轮转（logrotate）
   - 集中日志管理（可选：ELK, Loki 等）

4. **监控告警**
   - 应用监控（可选：Prometheus + Grafana）
   - 健康检查告警

5. **备份策略**
   - 数据库自动备份脚本
   - 备份文件自动上传到对象存储

6. **Node.js 版本升级**
   - 升级到 Node.js 20/22 LTS
   - 更新部署文档

## 依赖关系

### 外部依赖
- Node.js 18+ (当前服务器: v18.20.8)
- pnpm (通过 corepack 安装)
- Docker & Docker Compose
- PostgreSQL 16 (通过 Docker 部署)
- Nginx (可选，用于反向代理)

### 内部依赖
- 项目代码（需从 Git 仓库拉取）
- Prisma schema 和 migrations
- 环境变量配置（.env 文件）

## 文档引用

- 主部署文档: `backend/docs/DEPLOYMENT_TENCENT_LIGHTHOUSE.md`
- 现有验证脚本: `backend/scripts/release_verify.sh` (可用于上线前验证)

## 联系方式

如遇到问题，请：
1. 查阅 `DEPLOYMENT_TENCENT_LIGHTHOUSE.md` 的"常见故障排查"章节
2. 运行验证脚本: `bash scripts/post_deploy_verify.sh`
3. 查看服务日志: `sudo journalctl -u sevenkitchen-backend -f`

---

**交付完成时间**: 2024-12-20  
**交付工程师**: DevOps + Backend Release  
**验收状态**: 待验收

