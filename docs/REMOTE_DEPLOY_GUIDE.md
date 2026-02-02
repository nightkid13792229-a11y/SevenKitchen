# remote_deploy.sh 脚本说明

## 📖 什么是 remote_deploy.sh？

`backend/scripts/remote_deploy.sh` 是一个**自动化远程部署脚本**，用于将SevenKitchen backend部署到腾讯云Lighthouse生产服务器。

## 🎯 主要功能

### 1. 自动化部署流程

**执行步骤：**
```
本地 → SSH连接 → 远程服务器 → 拉取代码 → 运行部署脚本 → 完成
```

### 2. 安全检查

**预飞行检查（Pre-flight checks）：**
- ✅ 验证SSH密钥文件存在
- ✅ 测试SSH连接是否正常
- ✅ 提供超时保护（10秒）
- ✅ 使用专用部署密钥

### 3. 远程执行

**在远程服务器上执行：**
1. 切换到项目目录
2. 拉取最新代码（`git pull origin main`）
3. 运行部署脚本（`deploy_lighthouse.sh`）
4. 验证部署结果

## 📋 脚本结构

```bash
# 第1部分：配置和工具函数
SERVER_HOST="1.14.3.2"              # 腾讯云服务器IP
SERVER_USER="root"                  # SSH用户
SERVER_PROJECT_PATH="/opt/sevenkitchen/SevenKitchen/backend"
SSH_KEY_PATH="$HOME/.ssh/claude_deploy"

# 第2部分：SSH密钥验证
if [ ! -f "$SSH_KEY_PATH" ]; then
  echo "密钥不存在，生成提示"
  exit 1
fi

# 第3部分：连接测试
ssh -i "$SSH_KEY_PATH" -o ConnectTimeout=10 \
    -o StrictHostKeyChecking=no \
    "$SERVER_USER@$SERVER_HOST" \
    "echo 'Connection test successful'"

# 第4部分：远程执行（Heredoc）
ssh -i "$SSH_KEY_PATH" ... "$SERVER_USER@$SERVER_HOST" "bash -s" << 'ENDSSH'
  # 远程命令
  cd "$SERVER_PROJECT_PATH"
  git pull origin main
  bash scripts/deploy_lighthouse.sh
ENDSSH

# 第5部分：结果验证
if [ $? -eq 0 ]; then
  echo "✓ 部署成功"
else
  echo "✗ 部署失败"
  exit 1
fi
```

## 🚀 如何使用

### 基本用法

```bash
# 从项目根目录执行
cd /Users/zhaochen/Documents/SevenKitchen/backend
bash scripts/remote_deploy.sh
```

### 执行流程

**本地阶段：**
1. 显示服务器信息
2. 验证SSH密钥存在
3. 测试SSH连接

**远程阶段（通过SSH）：**
4. 连接到服务器 `1.14.3.2`
5. 进入项目目录 `/opt/sevenkitchen/SevenKitchen/backend`
6. 拉取最新代码 `git pull origin main`
7. 运行部署脚本 `bash scripts/deploy_lighthouse.sh`

**完成阶段：**
8. 显示部署结果
9. 提供后续操作建议

## 📊 与 production-ssh skill 的关系

### remote_deploy.sh 的状态

**当前状态：** ⚠️ 部分遵循skill规范

**符合的规则：**
- ✅ 定义了SSH变量（SERVER_HOST, SERVER_USER, SSH_KEY_PATH）
- ✅ 使用了SSH连接测试
- ✅ 有错误处理（`set -euo pipefail`）
- ✅ 检查了exit code

**可以改进的地方：**
- ⚠️ 没有使用`validate_ssh_connection`函数
- ⚠️ 连接测试代码重复（可以提取为函数）

### 改进建议

如果要让`remote_deploy.sh`完全符合skill规范：

```bash
# 添加validate_ssh_connection函数
validate_ssh_connection() {
  local key_path="$1"
  local user="$2"
  local host="$3"

  if [ ! -f "$key_path" ]; then
    echo "ERROR: SSH key not found: $key_path"
    return 1
  fi

  if ! ssh -i "$key_path" -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
      "$user@$host" "echo 'Connection test successful'" >/dev/null 2>&1; then
    echo "ERROR: SSH connection failed"
    return 1
  fi

  echo "✓ SSH connection validated"
  return 0
}

# 使用函数（替换第34-53行）
validate_ssh_connection "$SSH_KEY_PATH" "$SERVER_USER" "$SERVER_HOST" || exit 1
```

## 🛠️ 实际部署流程

### 完整的部署链

```
remote_deploy.sh (本地)
    ↓ SSH连接
    ├─ 拉取最新代码 (git pull)
    ↓
deploy_lighthouse.sh (远程)
    ├─ 安装依赖 (npm install --production)
    ├─ 构建项目 (npm run build)
    ├─ 运行数据库迁移 (npx prisma migrate deploy)
    ↓
重启服务 (systemctl restart sevenkitchen-backend)
    ↓
post_deploy_verify.sh (验证)
    ├─ 检查健康接口
    ├─ 验证服务状态
    └─ 显示部署结果
```

## 🔧 配置说明

### 服务器信息

- **服务商**：腾讯云 Lighthouse
- **IP地址**：`1.14.3.2`
- **用户**：`root`
- **项目路径**：`/opt/sevenkitchen/SevenKitchen/backend`

### SSH密钥

- **密钥路径**：`~/.ssh/claude_deploy`
- **密钥类型**：ed25519
- **用途**：专用部署密钥（非个人密钥）

### 生成密钥（如果没有）

```bash
ssh-keygen -t ed25519 -C "claude-deploy" -f ~/.ssh/claude_deploy
```

## 📈 部署后验证

部署成功后，脚本会提示：

```bash
✓ Remote deployment completed!

Next steps:
  1. Check service status:
     ssh -i ~/.ssh/claude_deploy root@1.14.3.2 'systemctl status sevenkitchen-backend'

  2. View logs:
     ssh -i ~/.ssh/claude_deploy root@1.14.3.2 'journalctl -u sevenkitchen-backend -f'

  3. Test health endpoint:
     curl http://1.14.3.2:3000/api/v1/health
```

## ⚠️ 注意事项

1. **网络连接**：确保能访问服务器IP（1.14.3.2）
2. **SSH密钥**：密钥必须存在且有正确权限（600）
3. **防火墙**：确保防火墙允许SSH（端口22）
4. **Git仓库**：远程服务器必须能访问Git仓库
5. **权限**：需要有sudo权限重启服务

## 🎓 总结

**remote_deploy.sh的作用：**
- 从本地触发远程部署
- 自动化SSH连接和代码更新
- 确保部署过程安全可靠

**与skill的关系：**
- 这个脚本是skill的**实际应用案例**
- 展示了SSH安全操作的最佳实践
- 可以进一步改进以100%符合skill规范

**关键价值：**
- 一键部署到生产环境
- 减少人为错误
- 提高部署成功率
- 提供清晰的错误提示

---

**相关文件：**
- 脚本位置：`backend/scripts/remote_deploy.sh`
- 远程部署：`backend/scripts/deploy_lighthouse.sh`
- 部署验证：`backend/scripts/post_deploy_verify.sh`
- SSH规范：`skills/production-ssh/SKILL.md`
