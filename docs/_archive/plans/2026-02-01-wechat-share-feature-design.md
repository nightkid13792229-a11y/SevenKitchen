# 微信小程序分享功能设计文档

**创建日期:** 2026-02-01
**设计师:** Claude Code
**项目:** SevenKitchen 小程序

---

## 1. 概述

本文档描述SevenKitchen微信小程序的分享功能设计,包括转发给朋友和分享到朋友圈两个核心能力。

### 1.1 设计目标

- 为首页和食谱相关页面提供分享能力
- 根据页面内容动态生成分享信息
- 提供优雅的降级策略和错误处理
- 确保良好的用户体验

### 1.2 适用页面

**主要页面:**
- 首页 (`pages/home/index`)
- 食谱详情页 (`pages/recipe-detail/index`)
- 收藏的食谱 (`pages/favorite-recipes/index`)
- DIY食谱相关页面 (`pages/recipe-diy/index`, `pages/diy-sheet/index`)

---

## 2. 功能架构

### 2.1 分享类型

微信小程序支持两种分享方式:

**1. 转发给朋友**
- API: `onShareAppMessage` 生命周期钩子
- 触发方式: 点击右上角"..."菜单中的"转发"
- 支持自定义: 标题、图片、路径、参数

**2. 分享到朋友圈**
- API: `onShareTimeline` 生命周期钩子
- 触发方式: 点击右上角"..."菜单中的"分享到朋友圈"
- 支持自定义: 标题、图片
- 最低版本: 微信基础库2.11.3+

### 2.2 架构分层

```
┌─────────────────────────────────────┐
│   分享配置层 (Share Config)          │
│  - 定义全局默认分享配置                │
│  - 提供页面级配置覆盖能力              │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   页面Mixin层 (ShareMixin)           │
│  - 封装 onShareAppMessage 钩子       │
│  - 封装 onShareTimeline 钩子          │
│  - 动态读取页面信息生成分享内容        │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   业务页面层                          │
│  - 首页                               │
│  - 食谱详情页                          │
│  - 其他食谱相关页面...                │
└─────────────────────────────────────┘
```

---

## 3. 分享内容设计

### 3.1 首页

- **标题:** "Seven的厨房 - 为您的爱犬定制健康食谱"
- **图片:** `/static/share-home.png`
- **路径:** `/pages/home/index`
- **参数:** 无(或可选分享者userId用于统计)

### 3.2 食谱详情页

- **标题:** 动态生成 - `{食谱名称} | Seven的厨房`
- **图片:** 优先食谱封面图,降级到 `/static/share-recipe.png`
- **路径:** `/pages/recipe-detail/index?id={食谱ID}`
- **参数:**
  - `id`: 食谱ID(必需)
  - `shareUserId`: 分享者ID(可选)

### 3.3 收藏食谱列表

- **标题:** "我收藏的狗狗食谱 - Seven的厨房"
- **图片:** `/static/share-default.png`
- **路径:** `/pages/favorite-recipes/index`

### 3.4 DIY食谱页面

- **标题:** "DIY定制食谱 - 为爱犬创造专属美味"
- **图片:** `/static/share-default.png`
- **路径:** 根据当前页面路径动态生成

---

## 4. 技术实现

### 4.1 创建 ShareMixin

**文件:** `miniapp/src/mixins/shareMixin.ts`

```typescript
import { ref, computed, type Ref } from 'vue'

export interface ShareConfig {
  title?: string | Ref<string>
  imageUrl?: string | Ref<string>
  path?: string | Ref<string>
  query?: Record<string, any>
}

export interface ShareResult {
  onShareAppMessage: () => Promise<any>
  onShareTimeline: () => Promise<any>
}

// 默认配置
const DEFAULT_CONFIG = {
  title: 'Seven的厨房 - 为您的爱犬定制健康食谱',
  imageUrl: '/static/share-default.png',
  path: '/pages/home/index'
}

// 图片降级路径
const IMAGE_FALLBACK_CHAIN = [
  // 1. 页面配置的图片
  // 2. 食谱封面图
  '/static/share-recipe.png',  // 3. 食谱类默认
  '/static/share-default.png'  // 4. 全局默认
]

/**
 * 分享功能Hook
 * @param config 分享配置
 * @returns 分享钩子函数
 */
export function useShare(config: ShareConfig = {}): ShareResult {
  // 解构配置,处理Ref类型
  const titleRef = typeof config.title === 'string'
    ? ref(config.title)
    : (config.title || ref(DEFAULT_CONFIG.title))

  const imageUrlRef = typeof config.imageUrl === 'string'
    ? ref(config.imageUrl)
    : (config.imageUrl || ref(DEFAULT_CONFIG.imageUrl))

  const pathRef = typeof config.path === 'string'
    ? ref(config.path)
    : (config.path || ref(DEFAULT_CONFIG.path))

  /**
   * 获取当前页面信息
   */
  const getCurrentPageInfo = () => {
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    return currentPage?.$page || {}
  }

  /**
   * 验证并安全化分享配置
   */
  const validateConfig = (shareConfig: any) => {
    const safeConfig = { ...shareConfig }

    // 标题长度限制(微信限制: 512字符)
    if (safeConfig.title && safeConfig.title.length > 512) {
      safeConfig.title = safeConfig.title.substring(0, 509) + '...'
    }

    // 路径有效性检查
    if (safeConfig.path && !safeConfig.path.startsWith('/')) {
      safeConfig.path = '/' + safeConfig.path
    }

    return safeConfig
  }

  /**
   * 检查图片是否存在
   */
  const checkImageExists = async (imageUrl: string): Promise<boolean> => {
    try {
      // 本地路径检查
      if (imageUrl.startsWith('/static/') || imageUrl.startsWith('/')) {
        const fileInfo = await uni.getFileInfo({
          filePath: imageUrl
        })
        return !!fileInfo
      }
      // 网络图片暂时跳过检查
      return true
    } catch (error) {
      console.warn('Image check failed:', imageUrl, error)
      return false
    }
  }

  /**
   * 获取有效的图片URL
   */
  const getValidImageUrl = async (imageUrl: string): Promise<string> => {
    // 检查配置的图片
    if (imageUrl && await checkImageExists(imageUrl)) {
      return imageUrl
    }

    // 尝试降级图片
    for (const fallback of IMAGE_FALLBACK_CHAIN) {
      if (await checkImageExists(fallback)) {
        return fallback
      }
    }

    // 如果都失败,返回空,让微信使用默认图
    return ''
  }

  /**
   * 转发给朋友
   */
  const onShareAppMessage = async () => {
    const pageInfo = getCurrentPageInfo()

    const shareConfig = {
      title: typeof titleRef.value === 'string' ? titleRef.value : titleRef,
      imageUrl: await getValidImageUrl(imageUrlRef.value),
      path: typeof pathRef.value === 'string' ? pathRef.value : (pageInfo.fullPath || DEFAULT_CONFIG.path)
    }

    return validateConfig(shareConfig)
  }

  /**
   * 分享到朋友圈
   */
  const onShareTimeline = async () => {
    const shareConfig = {
      title: typeof titleRef.value === 'string' ? titleRef.value : titleRef,
      imageUrl: await getValidImageUrl(imageUrlRef.value)
    }

    return validateConfig(shareConfig)
  }

  return {
    onShareAppMessage,
    onShareTimeline
  }
}
```

### 4.2 页面使用示例

#### 示例1: 首页 (固定配置)

```vue
<!-- pages/home/index.vue -->
<script setup lang="ts">
import { useShare } from '@/mixins/shareMixin'

// 使用固定配置
const { onShareAppMessage, onShareTimeline } = useShare({
  title: 'Seven的厨房 - 为您的爱犬定制健康食谱',
  imageUrl: '/static/share-home.png',
  path: '/pages/home/index'
})

// 注册分享钩子
defineExpose({
  onShareAppMessage,
  onShareTimeline
})
</script>
```

#### 示例2: 食谱详情页 (动态配置)

```vue
<!-- pages/recipe-detail/index.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useShare } from '@/mixins/shareMixin'

// 食谱数据
const recipe = ref({
  id: '',
  name: '',
  coverImage: ''
})

// 动态生成分享配置
const { onShareAppMessage, onShareTimeline } = useShare({
  title: computed(() =>
    recipe.value.name
      ? `${recipe.value.name} | Seven的厨房`
      : '精选食谱 | Seven的厨房'
  ),
  imageUrl: computed(() => recipe.value.coverImage || '/static/share-recipe.png'),
  path: computed(() =>
    recipe.value.id
      ? `/pages/recipe-detail/index?id=${recipe.value.id}`
      : '/pages/home/index'
  )
})

// 注册分享钩子
defineExpose({
  onShareAppMessage,
  onShareTimeline
})
</script>
```

### 4.3 pages.json配置

在需要分享的页面配置中添加:

```json
{
  "path": "pages/recipe-detail/index",
  "style": {
    "navigationBarTitleText": "食谱详情",
    "enableShareAppMessage": true,
    "enableShareTimeline": true
  }
}
```

---

## 5. 资源准备

### 5.1 需要的图片资源

```
miniapp/src/static/
├── share-default.png    # 全局默认分享图 (400x320px)
├── share-home.png       # 首页分享图 (400x320px)
└── share-recipe.png     # 食谱类默认图 (400x320px)
```

### 5.2 图片设计规范

- **尺寸:** 400x320px (5:4比例)
- **格式:** PNG或JPG
- **文件大小:** < 128KB
- **内容建议:**
  - 品牌Logo
  - 品牌标语或产品特点
  - 清晰的主视觉
  - 避免过多文字

---

## 6. 降级策略

### 6.1 图片降级

```
1. 页面配置的分享图片
   ↓ (失败或不存在)
2. 食谱/内容的封面图
   ↓ (失败或不存在)
3. 分类默认图 (如share-recipe.png)
   ↓ (失败或不存在)
4. 全局默认图 (share-default.png)
   ↓ (失败)
5. 不传imageUrl参数 (使用微信默认图)
```

### 6.2 标题降级

```
1. 页面配置的标题
   ↓ (为空或超长)
2. 截断超长标题 (保留前509字符 + '...')
   ↓ (失败)
3. 默认标题 "Seven的厨房"
```

### 6.3 版本兼容性

```
微信基础库 >= 2.11.3
  → 支持朋友圈分享
  → 完整功能

微信基础库 < 2.11.3
  → 不支持朋友圈分享
  → 仅保留"转发给朋友"功能
  → onShareTimeline 不执行
```

---

## 7. 测试方案

### 7.1 功能测试清单

**转发给朋友:**
- [ ] 首页转发 - 验证标题、图片、路径
- [ ] 食谱详情页转发 - 验证动态标题和封面
- [ ] 收藏列表页转发 - 验证默认配置
- [ ] 分享链接跳转 - 验证接收方能正常打开
- [ ] 参数传递 - 验证查询参数完整性

**分享到朋友圈:**
- [ ] 首页分享朋友圈 - 验证标题和图片
- [ ] 食谱详情页分享朋友圈 - 验证动态内容
- [ ] 朋友圈卡片点击 - 验证打开小程序

**边界情况:**
- [ ] 无封面图食谱 - 验证降级到默认图
- [ ] 超长标题 - 验证自动截断
- [ ] 特殊字符 - 验证emoji和符号显示
- [ ] 网络图片加载失败 - 验证降级策略
- [ ] 低版本微信 - 验证兼容性处理

**多场景:**
- [ ] 游客模式分享
- [ ] 已登录用户分享
- [ ] iOS设备测试
- [ ] Android设备测试

### 7.2 测试方法

**开发者工具测试:**
1. 打开微信开发者工具
2. 点击"..." → "转发"
3. 查看预览效果
4. 测试"分享到朋友圈"

**真机测试:**
1. 扫码预览到真机
2. 实际转发给好友
3. 实际分享到朋友圈
4. 测试点击跳转

### 7.3 验收标准

**必须满足:**
- ✅ 所有目标页面能正常调起分享面板
- ✅ 分享内容(标题、图片)符合预期
- ✅ 分享链接能正常打开
- ✅ 降级策略有效,无报错

**推荐满足:**
- ✅ 图片清晰,符合推荐尺寸
- ✅ 动态内容生成准确
- ✅ 用户体验流畅

---

## 8. 实施计划

### 阶段1: 基础设施 (准备阶段)
- [ ] 准备3张分享图片资源
- [ ] 创建 `mixins` 目录
- [ ] 实现 `shareMixin.ts`

### 阶段2: 核心页面集成
- [ ] 首页集成分享功能
- [ ] 食谱详情页集成分享功能
- [ ] 收藏食谱页集成分享功能

### 阶段3: 测试与优化
- [ ] 开发者工具测试
- [ ] 真机测试
- [ ] 边界情况测试
- [ ] 性能优化

### 阶段4: 发布
- [ ] 代码审查
- [ ] 提交审核
- [ ] 发布上线

---

## 9. 后续优化方向

1. **分享数据统计**
   - 记录分享行为(谁分享了什么)
   - 统计分享转化率
   - 分析最受欢迎的分享内容

2. **分享激励**
   - 分享获得积分或奖励
   - 邀请好友机制
   - 分享排行榜

3. **分享内容增强**
   - 生成分享海报(可选)
   - 添加分享文案模板
   - 支持自定义分享内容

4. **A/B测试**
   - 测试不同分享标题的转化率
   - 优化分享图片效果
   - 提升分享成功率

---

## 10. 参考资料

- [微信小程序 - 转发](https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.showShareMenu.html)
- [微信小程序 - 分享到朋友圈](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share-timeline.html)
- [uni-app 分享配置](https://uniapp.dcloud.net.cn/api/plugins/share.html)

---

**文档版本:** v1.0
**最后更新:** 2026-02-01
