# 如何使用 Production SSH Skill

## 📌 Skill位置

当前skill位于：`/Users/zhaochen/Documents/SevenKitchen/skills/production-ssh/`

## 🚀 使用方式

### 方式1：自动触发（推荐）

当你需要SSH到生产服务器时，Claude Code会：

1. **检测关键词**：当你的请求包含这些词时自动触发
   - "SSH到生产服务器"
   - "远程部署"
   - "查看生产日志"
   - "连接到服务器"
   - "scp文件到服务器"

2. **自动加载skill**：Claude Code会搜索并加载相关的skill

3. **遵循规范**：自动使用`validate_ssh_connection`函数和其他MANDATORY规则

### 方式2：显式指定

在请求中明确要求使用skill：

```
请使用production-ssh skill帮我SSH到生产服务器查看日志
```

### 方式3：作为参考

即使不自动触发，你也可以要求：

```
参考production-ssh skill中的模式来写这个SSH脚本
```

## 📝 实际例子

### 例子1：查看生产日志

**你只需要说：**
```
SSH到生产服务器查看sevenkitchen-backend服务的最近50行日志
```

**Claude Code会自动：**
1. 检测到"SSH到生产服务器"关键词
2. 加载`production-ssh` skill
3. 使用skill中的标准模式：
   - 定义变量
   - 调用`validate_ssh_connection`函数
   - 执行SSH命令（带错误处理）
   - 检查exit code

### 例子2：部署到生产

**你只需要说：**
```
部署backend到生产服务器
```

**Claude Code会：**
1. 使用skill中的SSH规范
2. 遵循远程部署的标准流程
3. 确保所有安全检查都在位

## 🔍 Skill加载机制

Claude Code按以下顺序搜索skill：

1. **全局skills**：`~/.claude/skills/`
2. **项目skills**：`<project>/.claude/skills/`
3. **项目根目录skills**：`<project>/skills/` ← 我们的skill在这里

## ⚠️ 当前限制

**重要提示**：
- 目前skill在`skills/production-ssh/`目录
- Claude Code可能不会自动发现它
- **建议**：在请求中明确提及"使用production-ssh skill"

## 💡 最佳实践

### ✅ 推荐的请求方式

```
使用production-ssh skill，SSH到生产服务器查看服务状态
```

```
按照production-ssh skill的规范，创建一个部署脚本
```

```
参考production-ssh skill，帮我修复这个SSH脚本的问题
```

### ❌ 不推荐的请求方式

```
SSH到服务器（太模糊，可能不触发skill）
```

```
直接用ssh命令连接（绕过了skill的规范）
```

## 🎯 Skill的作用

**对Claude Code：**
- 强制使用安全的SSH模式
- 确保所有连接都经过验证
- 统一错误处理流程
- 防止常见的安全错误

**对你：**
- 不需要记住所有SSH最佳实践
- 确保所有SSH操作都是安全的
- 减少人为错误
- 提高部署成功率

## 📚 相关文件

- **Skill文档**：`skills/production-ssh/SKILL.md`
- **快速指南**：`skills/production-ssh/README.md`
- **示例脚本**：`skills/production-ssh/example-view-logs.sh`
- **实际部署**：`backend/scripts/remote_deploy.sh`

---

**记住**：当你需要SSH操作时，提及"production-ssh skill"，Claude Code就会使用它！
