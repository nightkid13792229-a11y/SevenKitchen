# 分享图片CDN域名更新 - 测试验证指南

## ✅ 更新完成

**提交记录**: `3e1fb8f`

**配置变更**:
- ❌ 旧域名（COS原始）: `https://sevenkitchen-mvp-123-1392823718.cos.ap-chengdu.myqcloud.com/share/`
- ✅ 新域名（CDN加速）: `https://img.sevenkitchen.cloud/share/`

**变更原因**: COS原始域名返回AccessDenied，小程序未配置该域名白名单

---

## 🎯 立即测试

### 步骤1: 验证图片可访问

在浏览器中测试以下3个URL，确保图片能正常显示：

```
1. https://img.sevenkitchen.cloud/share/share-default.png
2. https://img.sevenkitchen.cloud/share/share-home.png
3. https://img.sevenkitchen.cloud/share/share-recipe.png
```

**✅ 所有图片都能显示** → 进入步骤2

**❌ 任何图片无法显示** → 请检查：
- 图片是否已上传到CDN对应的存储位置
- 图片路径是否正确（必须在 `/share/` 目录下）

---

### 步骤2: 重新上传小程序到微信

#### 方式A: 微信开发者工具（推荐）

1. **打开微信开发者工具**

2. **导入项目**
   ```
   项目 → 导入项目
   → 目录: miniapp/dist/build/mp-weixin
   → 点击"导入"
   ```

3. **编译验证**
   - ✅ 控制台无错误
   - ✅ 首页正常显示

#### 方式B: 覆盖上传（如果项目已打开）

1. 在微信开发者工具中，点击 **"编译"** 按钮
2. 或使用快捷键：`Ctrl/Cmd + B`

---

### 步骤3: 真机测试分享功能

#### 测试场景1: 首页分享

1. 打开小程序首页
2. 点击右上角 "..." 菜单
3. 选择 "转发给朋友"
4. **查看分享卡片**

**预期结果**:
```
✅ 标题: "Seven的厨房 - 为您的爱犬定制健康食谱"
✅ 图片: share-home.png (CDN图片，能正常显示)
✅ 控制台日志:
   [Home Share] ========== 转发给朋友分享函数被调用 ==========
   [Home Share] 分享配置: { title: "...", imageUrl: "https://img.sevenkitchen.cloud/share/share-home.png", path: "..." }
```

#### 测试场景2: 食谱详情页分享

1. 打开任意食谱详情页
2. 点击右上角 "..." 菜单
3. 选择 "转发给朋友"
4. **查看分享卡片**

**预期结果**:
```
✅ 标题: "{食谱名称} | Seven的厨房"
✅ 图片: 食谱封面图 或 share-recipe.png
✅ 控制台日志:
   [Recipe Share] 分享信息已更新: { name: "...", coverImageUrl: "...", id: "..." }
   [Recipe Share] ========== 转发给朋友分享函数被调用 ==========
```

#### 测试场景3: 朋友圈分享

1. 在任意页面点击右上角 "..."
2. 选择 "分享到朋友圈"
3. **查看分享卡片**

**预期结果**:
```
✅ 图片正常显示（不再是AccessDenied）
✅ 图片加载速度快（CDN加速）
```

---

## 📊 对比验证

### 之前（COS原始域名）
```
imageUrl: https://sevenkitchen-mvp-123-1392823718.cos.ap-chengdu.myqcloud.com/share/share-home.png
结果: ❌ AccessDenied
```

### 现在（CDN域名）
```
imageUrl: https://img.sevenkitchen.cloud/share/share-home.png
结果: ✅ 图片正常显示
```

---

## 🔍 故障排查

### 问题1: 图片仍然不显示

**检查步骤**:
1. 确认使用的是最新编译版本：`dist/build/mp-weixin`
2. 在浏览器中测试图片URL是否能访问
3. 查看控制台是否还有其他错误

**解决方法**:
```bash
# 清理并重新编译
cd miniapp
rm -rf dist/build/mp-weixin
pnpm build:mp-weixin
```

---

### 问题2: 图片URL显示错误

**检查控制台日志**:
```
[Home Share] 图片URL: https://...
```

**应该看到**:
```
https://img.sevenkitchen.cloud/share/share-home.png
```

**如果仍然显示COS原始域名**:
- 可能使用了旧版本编译文件
- 需要清理缓存并重新编译

---

### 问题3: 控制台没有分享日志

**可能原因**:
- 使用了开发版本而不是生产版本
- 分享函数未正确注册

**解决方法**:
- 确保导入的是 `dist/build/mp-weixin` 目录
- 重新上传项目

---

## ✅ 成功标志

当看到以下情况时，说明问题已解决：

1. ✅ **浏览器测试**：3个图片URL都能正常访问
2. ✅ **真机测试**：分享卡片显示图片（不再是空白或AccessDenied）
3. ✅ **控制台日志**：显示 `https://img.sevenkitchen.cloud/share/...`
4. ✅ **加载速度**：图片加载速度快（CDN加速）

---

## 📝 测试报告模板

```markdown
### 测试日期: YYYY-MM-DD
### 测试设备: iOS/Android真机

#### 图片URL验证
- [ ] share-default.png 能在浏览器中访问
- [ ] share-home.png 能在浏览器中访问
- [ ] share-recipe.png 能在浏览器中访问

#### 分享功能测试
- [ ] 首页分享 - 图片正常显示
- [ ] 食谱详情页分享 - 图片正常显示
- [ ] 收藏页分享 - 图片正常显示
- [ ] 朋友圈分享 - 图片正常显示

#### 控制台日志
- [ ] 显示 CDN域名: img.sevenkitchen.cloud
- [ ] 无AccessDenied错误
- [ ] 图片加载速度快

#### 总体评价
- 功能完整性: ⭐⭐⭐⭐⭐
- 图片显示: ⭐⭐⭐⭐⭐
- 加载速度: ⭐⭐⭐⭐⭐
```

---

## 🎉 完成状态

- ✅ 配置文件已更新
- ✅ 生产版本已编译
- ✅ 代码已推送到远程仓库
- ⏳ 待测试验证

**下一步**: 在真机上测试分享功能，验证图片能正常显示！
