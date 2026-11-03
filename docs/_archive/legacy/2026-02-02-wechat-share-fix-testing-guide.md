# 微信分享功能修复测试指南

## 📋 修复概述

**问题**: 分享时显示页面截图，而不是配置的COS图片
**根因**: `defineExpose`无法将分享函数注册到微信小程序Page配置
**解决方案**: 使用双`<script>`标签方案

---

## 🔧 技术实现

### 双script标签架构

```
页面组件
├── <script lang="ts"> (普通script)
│   ├── 模块级变量 (currentRecipeName等)
│   ├── updateShareInfo() 函数
│   └── export default { onShareAppMessage, onShareTimeline }
│
└── <script setup lang="ts"> (Setup script)
    └── 调用 updateShareInfo() 更新分享信息
```

### 实现页面

✅ **首页** (`pages/home/index.vue`) - 使用defineOptions（已在commit 74e3dff）
✅ **食谱详情页** (`pages/recipe-detail/index.vue`) - 使用双script标签（本次修复）
✅ **收藏页** (`pages/favorite-recipes/index.vue`) - 使用defineOptions（已在commit 74e3dff）

---

## 📱 测试步骤

### 1. 基础环境准备

#### 1.1 编译小程序
```bash
cd miniapp
pnpm dev:mp-weixin
```

#### 1.2 打开微信开发者工具
```
项目 → 导入项目
→ 选择目录: miniapp/dist/dev/mp-weixin
→ AppID: 使用测试号或正式AppID
```

#### 1.3 确认编译成功
- ✅ 控制台无编译错误
- ✅ 可以正常预览首页
- ✅ 可以正常浏览食谱

---

### 2. 首页分享测试

#### 测试场景1: 转发给朋友
**步骤**:
1. 打开首页
2. 点击右上角 "..." 菜单
3. 选择 "转发给朋友"
4. 查看分享卡片

**预期结果**:
- ✅ 标题: "Seven的厨房 - 为您的爱犬定制健康食谱"
- ✅ 图片: `share-home.png` (COS图片)
- ✅ 路径: `/pages/home/index`
- ✅ **控制台日志**:
  ```
  [Home Share] ========== 转发给朋友分享函数被调用 ==========
  [Home Share] 分享配置: { title: "...", imageUrl: "...", path: "..." }
  [Home Share] 图片URL: https://sevenkitchen-mvp-123-1392823718.cos.ap-chengdu.myqcloud.com/share/share-home.png
  ```

#### 测试场景2: 分享到朋友圈
**步骤**:
1. 打开首页
2. 点击右上角 "..." 菜单
3. 选择 "分享到朋友圈"
4. 查看分享卡片

**预期结果**:
- ✅ 标题: "Seven的厨房 - 为您的爱犬定制健康食谱"
- ✅ 图片: `share-home.png` (COS图片)
- ✅ **控制台日志**:
  ```
  [Home Share] ========== 分享到朋友圈函数被调用 ==========
  [Home Share] 朋友圈配置: { title: "...", imageUrl: "..." }
  [Home Share] 图片URL: https://sevenkitchen-mvp-123-1392823718.cos.ap-chengdu.myqcloud.com/share/share-home.png
  ```

---

### 3. 食谱详情页测试（动态分享）

#### 测试场景3: 有封面图的食谱 - 转发给朋友
**步骤**:
1. 打开任意一个有封面图的食谱
2. 点击右上角 "..." 菜单
3. 选择 "转发给朋友"
4. 查看分享卡片

**预期结果**:
- ✅ 标题: `{食谱名称} | Seven的厨房`
- ✅ 图片: 食谱的封面图（COS图片）
- ✅ 路径: `/pages/recipe-detail/index?recipeId={recipeId}`
- ✅ **控制台日志**:
  ```
  [Recipe Share] 分享信息已更新: { name: "...", coverImageUrl: "...", id: "..." }
  [Recipe Share] ========== 转发给朋友分享函数被调用 ==========
  [Recipe Share] 当前食谱名称: {实际名称}
  [Recipe Share] 当前食谱ID: {实际ID}
  [Recipe Share] 当前封面图: {实际URL}
  [Recipe Share] 分享配置: { title: "...", imageUrl: "...", path: "..." }
  ```

#### 测试场景4: 无封面图的食谱 - 转发给朋友
**步骤**:
1. 找一个没有封面图的食谱（或手动清空coverImageUrl）
2. 打开该食谱详情页
3. 点击右上角 "..." 菜单
4. 选择 "转发给朋友"
5. 查看分享卡片

**预期结果**:
- ✅ 标题: `{食谱名称} | Seven的厨房`
- ✅ 图片: `share-recipe.png` (默认食谱图，COS)
- ✅ 路径: `/pages/recipe-detail/index?recipeId={recipeId}`
- ✅ **控制台日志**:
  ```
  [Recipe Share] 当前封面图: (空字符串)
  [Recipe Share] 图片URL: https://sevenkitchen-mvp-123-1392823718.cos.ap-chengdu.myqcloud.com/share/share-recipe.png
  ```

#### 测试场景5: 食谱详情页 - 分享到朋友圈
**步骤**:
1. 打开任意食谱（有/无封面图都可以）
2. 点击右上角 "..." 菜单
3. 选择 "分享到朋友圈"
4. 查看分享卡片

**预期结果**:
- ✅ 标题: `{食谱名称} | Seven的厨房`
- ✅ 图片: 食谱封面图 或 默认食谱图
- ✅ **控制台日志**:
  ```
  [Recipe Share] ========== 分享到朋友圈函数被调用 ==========
  [Recipe Share] 朋友圈配置: { title: "...", imageUrl: "..." }
  ```

---

### 4. 收藏页分享测试

#### 测试场景6: 收藏页 - 转发给朋友
**步骤**:
1. 打开"收藏的食谱"页面
2. 点击右上角 "..." 菜单
3. 选择 "转发给朋友"
4. 查看分享卡片

**预期结果**:
- ✅ 标题: "我收藏的狗狗食谱 - Seven的厨房"
- ✅ 图片: `share-default.png` (全局默认图，COS)
- ✅ 路径: `/pages/favorite-recipes/index`
- ✅ **控制台日志**:
  ```
  [Favorites Share] ========== 转发给朋友分享函数被调用 ==========
  [Favorites Share] 分享配置: { title: "...", imageUrl: "...", path: "..." }
  [Favorites Share] 图片URL: https://sevenkitchen-mvp-123-1392823718.cos.ap-chengdu.myqcloud.com/share/share-default.png
  ```

#### 测试场景7: 收藏页 - 分享到朋友圈
**步骤**:
1. 打开"收藏的食谱"页面
2. 点击右上角 "..." 菜单
3. 选择 "分享到朋友圈"
4. 查看分享卡片

**预期结果**:
- ✅ 标题: "我收藏的狗狗食谱 - Seven的厨房"
- ✅ 图片: `share-default.png` (全局默认图，COS)
- ✅ **控制台日志**:
  ```
  [Favorites Share] ========== 分享到朋友圈函数被调用 ==========
  [Favorites Share] 朋友圈配置: { title: "...", imageUrl: "..." }
  ```

---

## 🐛 故障排查

### 问题1: 仍然显示页面截图

**检查步骤**:
1. 查看控制台是否有分享函数的日志输出
2. 如果没有日志，说明分享函数未被调用

**可能原因**:
- 编译版本过旧
- pages.json配置未生效

**解决方法**:
```bash
# 清理编译缓存
rm -rf miniapp/dist/dev/mp-weixin
rm -rf miniapp/node_modules/.vite

# 重新编译
pnpm dev:mp-weixin
```

---

### 问题2: 图片显示空白

**检查步骤**:
1. 查看控制台的图片URL日志
2. 复制URL到浏览器测试是否能访问

**可能原因**:
- COS图片未上传
- COS权限未设置为"公共读"
- URL配置错误

**解决方法**:
1. 确认COS图片已上传
2. 确认COS存储桶权限为"公共读"
3. 检查 `miniapp/src/config/share.config.ts` 中的URL配置

---

### 问题3: 标题显示异常

**检查步骤**:
1. 查看控制台的标题日志
2. 确认食谱数据是否正确加载

**可能原因**:
- 食谱数据未加载完成
- 食谱名称为空

**解决方法**:
- 等待页面完全加载后再测试分享
- 检查API返回的食谱数据

---

## 📊 测试检查清单

### 首页分享
- [ ] 转发给朋友 - 图片为share-home.png
- [ ] 转发给朋友 - 控制台有日志输出
- [ ] 分享到朋友圈 - 图片为share-home.png
- [ ] 分享到朋友圈 - 控制台有日志输出

### 食谱详情页分享
- [ ] 有封面图食谱 - 显示食谱封面图
- [ ] 有封面图食谱 - 标题包含食谱名称
- [ ] 无封面图食谱 - 显示share-recipe.png
- [ ] 转发给朋友 - 路径包含正确的recipeId
- [ ] 分享到朋友圈 - 图片和标题正确
- [ ] 控制台有完整的分享日志

### 收藏页分享
- [ ] 转发给朋友 - 图片为share-default.png
- [ ] 分享到朋友圈 - 图片为share-default.png
- [ ] 控制台有分享日志

### 边界情况
- [ ] 快速连续分享 - 无卡顿或错误
- [ ] 网络慢时 - 分享仍然正常
- [ ] 图片加载失败 - 降级到默认图

---

## 📝 测试报告模板

```markdown
### 测试日期: YYYY-MM-DD
### 测试环境: 微信开发者工具 / 真机(iOS/Android)
### 测试人员:

#### 测试结果

| 场景 | 预期结果 | 实际结果 | 状态 | 备注 |
|------|---------|---------|------|------|
| 首页-转发朋友 | share-home.png | | ✅/❌ | |
| 首页-朋友圈 | share-home.png | | ✅/❌ | |
| 食谱-有封面-转发 | 食谱封面图 | | ✅/❌ | |
| 食谱-有封面-朋友圈 | 食谱封面图 | | ✅/❌ | |
| 食谱-无封面-转发 | share-recipe.png | | ✅/❌ | |
| 食谱-无封面-朋友圈 | share-recipe.png | | ✅/❌ | |
| 收藏-转发朋友 | share-default.png | | ✅/❌ | |
| 收藏-朋友圈 | share-default.png | | ✅/❌ | |

#### 问题记录
1. 问题描述:
   - 复现步骤:
   - 控制台日志:
   - 截图:

#### 总体评价
- 功能完整性: ⭐⭐⭐⭐⭐
- 稳定性: ⭐⭐⭐⭐⭐
- 性能: ⭐⭐⭐⭐⭐
```

---

## ✅ 验收标准

**所有测试场景通过，无阻塞性问题**:

1. ✅ 所有分享函数被正确调用（控制台有日志）
2. ✅ 所有分享图片正确显示（COS图片，非截图）
3. ✅ 所有标题正确显示（首页固定，食谱动态）
4. ✅ 所有路径正确（首页和收藏页固定，食谱动态）
5. ✅ 降级策略有效（无封面图时显示默认图）
6. ✅ 无控制台错误或警告

---

## 🎯 下一步

测试通过后：
1. 在真机上测试（iOS和Android）
2. 验证生产环境表现
3. 根据用户反馈优化图片设计
4. 监控分享数据（如有统计需求）

---

## 📞 问题反馈

如果测试过程中遇到问题：
1. 记录完整的控制台日志
2. 截图保存分享卡片
3. 记录复现步骤
4. 提交issue到项目仓库
