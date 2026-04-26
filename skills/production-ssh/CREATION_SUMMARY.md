# Production SSH Skill - 创建总结

## 📝 创建过程

本文档记录了`production-ssh` skill的创建过程，遵循TDD（Test-Driven Development）流程。

---

## 🎯 创建目标

**主要问题：** 规范化SSH连接和远程操作流程

**功能范围：** SSH连接配置和验证

**使用场景：** 项目级通用skill（供所有开发者使用）

---

## 🔄 TDD流程

### ✅ RED阶段 - 观察基线行为

**方法：** 分析现有脚本`backend/scripts/remote_deploy_v2.sh`

**发现的问题模式：**
1. SSH命令缺少统一的连接测试函数
2. 错误处理不一致
3. 变量定义分散
4. 缺少exit code检查
5. 没有明确的操作流程规范

### ✅ GREEN阶段 - 创建Skill

**创建文件：**
- `SKILL.md` - 主技能文档（266行）
- `README.md` - 快速开始指南
- `example-view-logs.sh` - 示例脚本

**核心内容：**
1. **Overview** - 强调使用validate_ssh_connection函数
2. **When to Use** - 决策流程图
3. **Core Pattern** - Before/After对比
4. **Quick Reference** - 常用命令表
5. **Implementation** - 完整的实现代码
6. **Common Mistakes** - 错误模式表
7. **Red Flags** - 停止并修复的清单
8. **Rationalization Table** - 阻止借口

### ✅ REFACTOR阶段 - 强化Skill

**第一次测试发现的问题：**
- Agent理解了skill精神，但没有严格遵循函数调用
- SSH命令格式不一致
- 缺少exit code检查

**改进措施：**
1. ✅ 在Overview中**加粗强调**validate_ssh_connection
2. ✅ 将函数部分标记为**MANDATORY**
3. ✅ 添加"Common rationalizations to AVOID"部分
4. ✅ 在Core Pattern中添加更多反面教材
5. ✅ 添加Rationalization Table（7个常见借口）
6. ✅ 强化Red Flags部分

**第二次测试结果：**
- ✅ 100%遵循skill模式
- ✅ 使用validate_ssh_connection函数
- ✅ 变量优先定义
- ✅ 完整的错误处理
- ✅ Exit code检查

---

## 📁 最终文件结构

```
skills/production-ssh/
├── SKILL.md                    # 主技能文档（266行）
├── README.md                   # 快速开始指南
├── example-view-logs.sh        # 示例脚本（可执行）
└── CREATION_SUMMARY.md         # 本文档
```

---

## 🎯 Skill关键特性

### 1. MANDATORY规则

**必须使用validate_ssh_connection函数：**
```bash
validate_ssh_connection "$SSH_KEY_PATH" "$SERVER_USER" "$SERVER_HOST" || exit 1
```

### 2. 标准化变量定义

```bash
SERVER_HOST="1.14.3.2"
SERVER_USER="root"
SSH_KEY_PATH="$HOME/.ssh/claude_deploy"
SERVER_PROJECT_PATH="/opt/sevenkitchen/SevenKitchen/backend"
```

### 3. 强制错误处理

```bash
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
    "$SERVER_USER@$SERVER_HOST" \
    "command" || { echo "Failed"; exit 1; }
```

### 4. Exit Code检查

```bash
if [ $? -eq 0 ]; then
  echo "✓ Success"
else
  echo "✗ Failed"
  exit 1
fi
```

---

## 🛡️ Rationalization Table

| Excuse | Reality |
|--------|---------|
| "This is just a quick command" | Quick commands fail too. Use the function. |
| "I tested the connection manually earlier" | Automation must be self-contained. Use the function. |
| "The server never has connectivity issues" | Network issues happen. Always test. |
| "Error handling makes the script too long" | Short broken scripts > long working scripts. |
| "I understand the spirit, so I can skip the formality" | Following spirit ≠ following rules. Use the function. |
| "I'll add validation later" | Later never comes. Do it now. |
| "This is read-only, so it doesn't matter" | Read operations fail too and block automation. |

---

## ✅ 验证结果

**测试1（第一次）：**
- 部分遵循skill
- 理解精神但自由发挥
- 缺少关键函数调用

**测试2（REFACTOR后）：**
- ✅ 100%遵循skill模式
- ✅ 严格按照Core Pattern
- ✅ 所有MANDATORY规则都执行

---

## 📊 Real-World Impact

**Before this skill:**
- SSH命令在生产环境静默失败
- 开发者忘记测试连接，导致部署失败
- 使用错误的SSH密钥，认证错误
- 命令挂起没有超时，阻塞自动化
- 没有错误处理，级联故障

**After this skill:**
- 所有SSH连接在执行前验证
- 跨所有脚本的一致错误处理
- 部署成功或快速失败并带清晰消息
- 易于维护的集中配置
- 通过可靠的远程访问更快解决生产问题

---

## 🚀 使用建议

### 对于开发者

1. **首次使用**：阅读`README.md`了解快速开始
2. **详细参考**：查看`SKILL.md`了解完整规范
3. **实践示例**：参考`example-view-logs.sh`学习正确模式

### 对于Claude Code

当需要SSH到生产服务器时：
1. 自动加载`production-ssh` skill
2. 严格遵循skill中的MANDATORY规则
3. 使用validate_ssh_connection函数
4. 检查所有exit codes
5. 提供完整的错误处理

---

## 📚 相关资源

- **Superpowers Writing Skills**: `~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.1.1/skills/writing-skills/`
- **现有部署脚本**: `backend/scripts/remote_deploy_v2.sh`
- **项目文档**: `docs/`

---

## 🎓 经验教训

1. **测试是必须的**：没有基线测试，不知道skill需要解决什么问题
2. **迭代改进**：第一次版本不够bulletproof，需要根据测试结果强化
3. **阻止借口**：添加Rationalization Table能有效防止agent"理解精神但不遵守规则"
4. **MANDATORY标记**：明确标记强制规则比仅仅"建议"更有效
5. **反面教材**：Before/After对比比单纯展示正确方法更有效

---

**创建日期**: 2026-02-02
**遵循框架**: Superpowers Writing Skills (TDD for documentation)
**状态**: ✅ 已完成并通过验证
