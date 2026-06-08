# 微信开发者工具启动说明

## 正确的启动流程

### 方法1：使用自动化脚本（推荐）

```bash
# 1. 启动编译服务
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm run rebuild

# 2. 等待编译完成（看到 "✅ 编译成功" 消息）

# 3. 打开微信开发者工具
# 导入项目目录: /Users/zhaochen/Documents/SevenKitchen/miniapp/dist/dev/mp-weixin
```

### 方法2：手动启动

```bash
# 1. 进入小程序目录
cd /Users/zhaochen/Documents/SevenKitchen/miniapp

# 2. 清理旧文件
rm -rf dist/dev/mp-weixin/*

# 3. 启动编译
pnpm run dev:mp-weixin

# 4. 等待 10-15 秒

# 5. 验证编译输出
ls dist/dev/mp-weixin/app.json  # 应该存在

# 6. 打开微信开发者工具，导入项目
```

## 微信开发者工具设置

### 项目导入
- **项目根目录**: `/Users/zhaochen/Documents/SevenKitchen/miniapp/dist/dev/mp-weixin`
- **AppID**: 使用测试号或自己的 AppID
- **编译类型**: 小程序

### 重要设置
1. **关闭"不校验合法域名"**（开发时可以开启）
2. **启用"增强编译"**
3. **启用"自动保存"**
4. **设置自动重载**: 设置 → 编辑设置 → 自动保存

### 修改代码后的操作

当修改 `miniapp/src/` 下的代码后：
1. **Vite 会自动检测文件变化并重新编译**
2. **微信开发者工具会自动重载**（如果没有自动重载，点击工具栏的"编译"按钮）
3. **如果编译失败**，查看终端的错误信息

## 常见问题

### Q1: 导入后提示"找不到 app.json"
**A**: 编译未完成或编译失败。运行：
```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm run rebuild
```

### Q2: 修改代码后小程序不更新
**A**:
1. 检查编译进程是否还在运行：`ps aux | grep uni`
2. 如果没有运行，重新启动：`pnpm run dev:mp-weixin`
3. 在微信开发者工具中点击"编译"按钮

### Q3: 每次都要手动重新导入项目吗？
**A**: 不需要。第一次导入后：
- 微信开发者工具会监听 `dist/dev/mp-weixin` 目录的变化
- 代码修改后自动重新编译
- 开发者工具会自动刷新预览

### Q4: 编译失败怎么排查？
**A**:
1. 查看编译日志：`tail -f /tmp/uni-compile.log`
2. 检查必要文件是否存在：
   ```bash
   ls src/App.vue src/pages.json src/manifest.json
   ```
3. 重新安装依赖：`pnpm install`
4. 清理并重新编译：`pnpm run rebuild`

## 工作流程

```
开发流程：
修改代码 → Vite自动检测 → 重新编译 → 微信工具自动刷新 → 查看效果

验证编译：
ls dist/dev/mp-weixin/app.json  # 应该存在
ls dist/dev/mp-weixin/app.js    # 应该存在
ls dist/dev/mp-weixin/app.wxss  # 应该存在
```

## 注意事项

1. **不要手动删除 dist/dev/mp-weixin 目录**
   - 编译脚本会自动清理旧文件
   - 手动删除可能导致微信开发者工具失去项目引用

2. **保持编译进程运行**
   - 开发时编译进程应该一直运行
   - 关闭进程前先关闭微信开发者工具

3. **查看编译日志**
   - 如果编译失败，查看 `/tmp/uni-compile.log`
   - 或直接运行 `pnpm run dev:mp-weixin` 查看实时输出

4. **微信开发者工具版本**
   - 建议使用最新稳定版
   - 旧版本可能不支持 uni-app 3.0 alpha
