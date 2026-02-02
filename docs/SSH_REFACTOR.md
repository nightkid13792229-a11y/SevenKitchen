# SSH脚本重构说明

## 🎯 重构目标

**单一职责原则（SRP）：**
- SSH工具只负责连接和命令执行
- 部署脚本只负责业务逻辑

## 📊 重构前后对比

### ❌ 重构前（remote_deploy.sh）

```
┌─────────────────────────────────────┐
│       remote_deploy.sh              │
│                                     │
│  1. SSH连接验证  ← SSH职责          │
│  2. 拉取代码      ← 业务逻辑         │
│  3. 运行部署      ← 业务逻辑         │
│  4. 重启服务      ← 业务逻辑         │
└─────────────────────────────────────┘
```

**问题：**
- SSH逻辑和业务逻辑混在一起
- 无法复用SSH连接功能
- 难以测试和维护
- 违反单一职责原则

### ✅ 重构后

```
┌──────────────────────────┐
│   ssh-helper.sh          │
│   (纯SSH工具)            │
│                          │
│ • validate_ssh_connection│
│ • ssh_exec               │
│ • ssh_exec_multiline     │
│ • ssh_upload             │
│ • ssh_download           │
└──────────────────────────┘
         ↑
         │ 被...使用
         │
┌──────────────────────────┐
│ remote_deploy_v2.sh      │
│ (纯业务逻辑)             │
│                          │
│ 1. 加载ssh-helper        │
│ 2. 调用validate_ssh      │
│ 3. 执行部署逻辑          │
│   • 拉代码               │
│   • 运行脚本             │
│   • 重启服务             │
└──────────────────────────┘
```

**优点：**
- ✅ 职责清晰分离
- ✅ SSH工具可被任何脚本复用
- ✅ 易于测试和维护
- ✅ 符合单一职责原则

## 📁 文件结构

```
backend/scripts/
├── ssh-helper.sh           ← 新建：纯SSH工具
├── remote_deploy.sh        ← 原版：保留不删
└── remote_deploy_v2.sh     ← 新建：重构版，使用ssh-helper
```

## 🔧 ssh-helper.sh 功能

**纯SSH连接工具，不包含任何业务逻辑：**

| 函数 | 功能 | 返回值 |
|------|------|--------|
| `validate_ssh_connection` | 验证SSH连接 | 0=成功, 1=失败 |
| `ssh_exec "command"` | 执行单条命令 | SSH退出码 |
| `ssh_exec_multiline` | 执行多条命令(heredoc) | SSH退出码 |
| `ssh_upload local remote` | 上传文件 | SCP退出码 |
| `ssh_download remote local` | 下载文件 | SCP退出码 |

**使用方式：**

```bash
# 方式1：直接执行（作为独立脚本）
bash scripts/ssh-helper.sh

# 方式2：source到其他脚本
source scripts/ssh-helper.sh
validate_ssh_connection
ssh_exec "ls -la"
```

## 💡 使用示例

### 示例1：查看服务状态（简单脚本）

```bash
#!/usr/bin/env bash
source scripts/ssh-helper.sh

validate_ssh_connection || exit 1
ssh_exec "systemctl status sevenkitchen-backend"
```

### 示例2：重启服务（单条命令）

```bash
#!/usr/bin/env bash
source scripts/ssh-helper.sh

validate_ssh_connection || exit 1
ssh_exec "systemctl restart sevenkitchen-backend" || {
  echo "Failed to restart service"
  exit 1
}
```

### 示例3：部署应用（多条命令）

```bash
#!/usr/bin/env bash
source scripts/ssh-helper.sh

validate_ssh_connection || exit 1

ssh_exec_multiline <<'ENDSSH'
cd /opt/app
git pull origin main
npm install --production
pm2 restart app
ENDSSH
```

### 示例4：上传配置文件

```bash
#!/usr/bin/env bash
source scripts/ssh-helper.sh

validate_ssh_connection || exit 1
ssh_upload ".env.production" "/opt/app/.env"
```

## 🎓 与production-ssh skill的关系

### ssh-helper.sh 的设计

**完全遵循production-ssh skill：**
- ✅ 使用`validate_ssh_connection`函数
- ✅ 所有SSH选项标准化（ConnectTimeout, StrictHostKeyChecking）
- ✅ 统一错误处理
- ✅ 返回exit code

### Skill vs Helper的区别

| | production-ssh skill | ssh-helper.sh |
|---|---|---|
| **类型** | 文档/规范 | 可执行脚本 |
| **作用** | 指导Claude Code | 提供SSH功能 |
| **内容** | 模式、示例、最佳实践 | 实际的函数代码 |
| **使用** | Claude Code自动加载 | 被其他脚本source |

**关系：**
```
production-ssh skill (文档规范)
         ↓
    指导实现
         ↓
ssh-helper.sh (具体实现)
```

## 🚀 迁移指南

### 逐步替换旧脚本

**第1步：测试新脚本**
```bash
# 使用v2版本进行部署
bash backend/scripts/remote_deploy_v2.sh
```

**第2步：验证功能**
- 检查SSH连接是否正常
- 验证部署流程是否成功
- 确认服务正确启动

**第3步：替换旧脚本**
```bash
# 备份旧版本
mv backend/scripts/remote_deploy.sh backend/scripts/remote_deploy_old.sh

# 使用新版本
mv backend/scripts/remote_deploy_v2.sh backend/scripts/remote_deploy.sh
```

**第4步：更新其他脚本**
将其他使用SSH的脚本改为使用ssh-helper：
```bash
# 在脚本顶部添加
source scripts/ssh-helper.sh

# 替换直接的ssh命令为
ssh_exec "your command"
```

## 📚 相关文档

- **SSH规范文档**：`skills/production-ssh/SKILL.md`
- **SSH工具源码**：`backend/scripts/ssh-helper.sh`
- **重构后部署**：`backend/scripts/remote_deploy_v2.sh`
- **原始部署**：`backend/scripts/remote_deploy.sh`

## ✅ 验证检查清单

重构完成后，验证：

- [ ] ssh-helper.sh可以独立source
- [ ] 所有函数都能正常工作
- [ ] remote_deploy_v2.sh能成功部署
- [ ] SSH连接验证正确执行
- [ ] 错误处理和exit code正确
- [ ] 其他脚本可以复用ssh-helper

## 🎯 总结

**重构前：**
- 一个脚本做所有事情（SSH + 业务逻辑）
- 难以复用和维护
- 违反单一职责原则

**重构后：**
- ssh-helper.sh：纯SSH工具
- 部署脚本：纯业务逻辑
- 职责清晰，易于复用
- 符合设计原则

**下一步：**
1. 测试新的ssh-helper.sh
2. 验证remote_deploy_v2.sh
3. 逐步迁移其他SSH脚本
