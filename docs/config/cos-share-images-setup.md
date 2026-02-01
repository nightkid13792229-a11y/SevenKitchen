# 腾讯云COS分享图片配置指南

## 概述

微信分享功能的图片已从本地静态文件改为使用腾讯云COS存储桶的图片链接，这样做的好处是：

- ✅ 更新图片不需要重新发布小程序
- ✅ 减小小程序包体积
- ✅ 设计团队可以随时更新图片

## 图片需求

### 需要上传的3张图片

#### 1. **share-default.png** - 全局默认分享图
- **用途**: 当其他图片不可用时使用
- **场景**: 收藏页、其他没有专属图片的页面
- **尺寸**: 400x320px (5:4比例)
- **设计建议**: 品牌Logo + 品牌标语
- **风格**: 简洁、专业

#### 2. **share-home.png** - 首页专属分享图
- **用途**: 首页分享
- **尺寸**: 400x320px (5:4比例)
- **设计建议**: 突出品牌特色，展示精选内容
- **风格**: 吸引、诱人

#### 3. **share-recipe.png** - 食谱类默认分享图
- **用途**: 食谱详情页的后备图（当食谱没有封面图时使用）
- **尺寸**: 400x320px (5:4比例)
- **设计建议**: 清新、健康风格，体现食谱元素
- **风格**: 清新、健康

## 上传步骤

### 1. 登录腾讯云COS控制台

访问: https://console.cloud.tencent.com/cos

### 2. 选择存储桶

找到您的SevenKitchen项目存储桶

### 3. 创建目录结构（如果不存在）

在存储桶中创建以下目录：
```
share/
  ├── share-default.png
  ├── share-home.png
  └── share-recipe.png
```

### 4. 上传图片

将3张图片上传到 `share/` 目录

### 5. 获取图片访问链接

上传后，在COS控制台中复制每张图片的访问链接，格式类似：
```
https://<bucket-name>.cos.<region>.myqcloud.com/share/share-default.png
```

## 配置更新

### 修改配置文件

打开文件：`miniapp/src/config/share.config.ts`

将以下内容中的COS链接替换为实际的图片链接：

```typescript
export const SHARE_CONFIG = {
  // 替换为实际的COS链接
  defaultImageUrl: 'https://<您的存储桶>.cos.<区域>.myqcloud.com/share/share-default.png',
  homeImageUrl: 'https://<您的存储桶>.cos.<区域>.myqcloud.com/share/share-home.png',
  recipeImageUrl: 'https://<您的存储桶>.cos.<区域>.myqcloud.com/share/share-recipe.png'
}
```

### 示例配置

```typescript
export const SHARE_CONFIG = {
  defaultImageUrl: 'https://sevenkitchen-1251234567.cos.ap-guangzhou.myqcloud.com/share/share-default.png',
  homeImageUrl: 'https://sevenkitchen-1251234567.cos.ap-guangzhou.myqcloud.com/share/share-home.png',
  recipeImageUrl: 'https://sevenkitchen-1251234567.cos.ap-guangzhou.myqcloud.com/share/share-recipe.png'
}
```

## 测试验证

### 1. 本地测试

```bash
cd miniapp
pnpm dev:mp-weixin
```

### 2. 微信开发者工具测试

1. 打开微信开发者工具
2. 导入 `miniapp/dist/dev/mp-weixin` 目录
3. 在首页、食谱详情页、收藏页测试分享功能
4. 检查分享图片是否正确显示

### 3. 真机测试

1. 使用微信开发者工具的预览功能
2. 扫码在真机上测试
3. 测试"转发给朋友"和"分享到朋友圈"

## 图片更新流程

### 更换图片时

1. 在COS控制台上传新图片（覆盖同名文件）
2. 或者上传新文件并更新配置文件中的链接
3. 重新编译小程序
4. 测试验证

### 无需重新发布小程序

- 如果只是替换COS中的同名文件，无需修改代码
- 如果更换了文件名或链接，需要修改配置文件并重新发布

## 配置切换

### 使用COS图片（生产环境）

```typescript
export const CURRENT_SHARE_CONFIG = SHARE_CONFIG
```

### 使用本地图片（开发/测试环境）

```typescript
export const CURRENT_SHARE_CONFIG = LOCAL_SHARE_CONFIG
```

## 注意事项

1. **图片尺寸**: 必须是 400x320px (5:4比例)
2. **图片格式**: 推荐 PNG 或 JPG
3. **文件大小**: 建议不超过 200KB
4. **CDN加速**: 建议为COS存储桶开启CDN加速
5. **访问权限**: 确保图片设置为"公共读"权限
6. **HTTPS**: 确保使用HTTPS链接

## 故障排查

### 图片不显示

1. 检查COS链接是否正确
2. 确认图片已上传并设置为"公共读"
3. 检查小程序是否已重新编译
4. 查看微信开发者工具控制台是否有错误

### 降级处理

如果COS图片加载失败，系统会自动使用以下降级策略：
1. 首页: 优先使用食谱封面图 → homeImageUrl → defaultImageUrl
2. 食谱详情: 优先使用食谱封面图 → recipeImageUrl → defaultImageUrl
3. 收藏页: 使用 defaultImageUrl

## 相关文件

- 配置文件: `miniapp/src/config/share.config.ts`
- ShareMixin: `miniapp/src/mixins/shareMixin.ts`
- 首页: `miniapp/src/pages/home/index.vue`
- 食谱详情: `miniapp/src/pages/recipe-detail/index.vue`
- 收藏页: `miniapp/src/pages/favorite-recipes/index.vue`
