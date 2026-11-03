# 微信分享功能修复 - 部署说明

## ✅ 编译状态

**生产环境编译成功** - `miniapp/dist/build/mp-weixin/`

- ✅ 首页: `pages/home/index.js` (9.9KB - 已压缩优化)
- ✅ 食谱详情页: `pages/recipe-detail/index.js` (7.9KB - 已压缩优化)
- ✅ 收藏页: `pages/favorite-recipes/index.js`

## 🎯 下一步：上传到微信

### 方法1: 微信开发者工具（推荐）

1. **打开微信开发者工具**

2. **导入项目**
   ```
   项目 → 导入项目
   → 目录: miniapp/dist/build/mp-weixin
   → AppID: 使用测试号或正式AppID
   → 点击"导入"
   ```

3. **验证编译结果**
   - ✅ 控制台无错误
   - ✅ 可以正常预览首页
   - ✅ 可以正常浏览食谱

4. **测试分享功能**
   - 首页 → 右上角"..." → 转发给朋友
   - 食谱详情页 → 右上角"..." → 转发给朋友
   - 收藏页 → 右上角"..." → 转发给朋友

5. **查看控制台日志**
   ```
   [Home Share] ========== 转发给朋友分享函数被调用 ==========
   [Recipe Share] ========== 转发给朋友分享函数被调用 ==========
   [Favorites Share] ========== 转发给朋友分享函数被调用 ==========
   ```

### 方法2: 微信开发者工具命令行

```bash
# 如果安装了微信开发者工具CLI
/Applications/wechatwebdevtools.app/Contents/MacOS/cli \
  --upload \
  --project miniapp/dist/build/mp-weixin \
  --version 1.0.0 \
  --desc "修复分享图片不显示问题"
```

## 📱 验证清单

### 基础功能
- [ ] 小程序正常启动
- [ ] 首页正常显示
- [ ] 食谱列表正常加载
- [ ] 食谱详情页正常打开

### 分享功能
- [ ] 首页分享 → 显示 share-home.png
- [ ] 食谱详情页分享 → 显示食谱封面图
- [ ] 无封面图食谱 → 显示 share-recipe.png
- [ ] 收藏页分享 → 显示 share-default.png
- [ ] 控制台有分享日志输出

### 朋友圈分享
- [ ] 首页 → 分享到朋友圈
- [ ] 食谱详情页 → 分享到朋友圈
- [ ] 收藏页 → 分享到朋友圈

## 🐛 常见问题

### Q1: 分享时仍然显示页面截图

**原因**: 可能使用了旧版本的编译文件

**解决**:
```bash
# 清理缓存
rm -rf miniapp/dist/build/mp-weixin
rm -rf miniapp/node_modules/.vite

# 重新编译
pnpm build:mp-weixin

# 重新上传到微信
```

### Q2: 图片显示空白

**原因**: COS图片未上传或URL配置错误

**解决**:
1. 确认COS图片已上传到:
   ```
   https://sevenkitchen-mvp-123-1392823718.cos.ap-chengdu.myqcloud.com/share/
   ├── share-default.png
   ├── share-home.png
   └── share-recipe.png
   ```

2. 检查 `miniapp/src/config/share.config.ts` 中的URL配置

3. 确认COS存储桶权限为"公共读"

### Q3: 控制台没有分享日志

**原因**: 分享函数未被正确注册

**解决**: 确认使用的是 `dist/build/mp-weixin` 目录，而不是 `dist/dev/mp-weixin`

## 📦 提交历史

```
30b338b fix: 修复分享图片不显示问题（使用双script标签方案）
74e3dff chore: remove duplicate migration files (包含首页和收藏页修复)
2547515 chore: 更新分享图片COS链接为实际配置
```

## 📄 相关文档

- **问题排查报告**: `docs/2026-02-02-wechat-share-image-issue-report.md`
- **测试指南**: `docs/2026-02-02-wechat-share-fix-testing-guide.md`
- **COS配置指南**: `docs/config/cos-share-images-setup.md`

## 🎉 完成标志

当看到以下情况时，说明修复成功：

1. ✅ 分享卡片显示COS图片（不是页面截图）
2. ✅ 控制台输出 `[xxx Share]` 日志
3. ✅ 图片URL正确显示
4. ✅ 标题和路径正确

祝测试顺利！🚀
