# ShareButton 组件使用文档

## 📖 概述

ShareButton 是一个符合微信小程序规范的分享按钮组件，支持多种样式和尺寸，可灵活配置分享内容。

## ✨ 特性

- 🎨 **多种样式**：支持默认、主色、简约、纯图标等多种风格
- 📏 **多种尺寸**：小、中、大三种尺寸可选
- 🔗 **原生分享**：使用微信小程序原生分享能力
- 🎯 **灵活配置**：支持自定义分享标题、路径、图片
- ⚡ **TypeScript支持**：完整的类型定义

## 🚀 快速开始

### 基础用法

```vue
<template>
  <ShareButton />
</template>

<script setup>
import ShareButton from '@/components/ShareButton.vue'
</script>
```

### 带文字的分享按钮

```vue
<ShareButton
  text="分享给好友"
  :show-text="true"
/>
```

### 自定义分享内容

```vue
<ShareButton
  share-path="/pages/detail/index?id=123"
  share-title="超好吃的狗粮配方"
  share-image="https://example.com/image.jpg"
/>
```

## 🎨 样式变体

### 1. 纯图标样式（icon-only）- 推荐

圆形图标按钮，简洁优雅，适合放入操作栏。

```vue
<!-- 小尺寸 -->
<ShareButton type="icon-only" size="small" />

<!-- 中尺寸（默认） -->
<ShareButton type="icon-only" size="medium" />

<!-- 大尺寸 -->
<ShareButton type="icon-only" size="large" />
```

### 2. 默认样式（default）

浅灰背景，适合通用场景。

```vue
<ShareButton type="default" :show-text="true" text="分享" />
```

### 3. 主色样式（primary）

品牌色渐变背景，带阴影效果，突出显示。

```vue
<ShareButton type="primary" :show-text="true" text="立即分享" />
```

### 4. 简约样式（plain）

白色背景，带边框，简洁清爽。

```vue
<ShareButton type="plain" :show-text="true" text="分享" />
```

## 📐 尺寸规格

| 尺寸 | 宽度 | 高度 | 图标大小 |
|------|------|------|----------|
| small | 56rpx | 56rpx | 32rpx |
| medium | 72rpx | 72rpx | 40rpx |
| large | 88rpx | 88rpx | 48rpx |

## 🔧 Props

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| openType | String | 'share' | 分享类型：'share' \| 'sendMessage' |
| icon | String | '➦' | 分享图标符号 |
| text | String | '分享' | 按钮文字 |
| showText | Boolean | false | 是否显示文字 |
| size | String | 'medium' | 尺寸：'small' \| 'medium' \| 'large' |
| type | String | 'icon-only' | 样式类型：'default' \| 'primary' \| 'plain' \| 'icon-only' |
| sharePath | String | '' | 分享路径（可选，默认使用当前页面路径） |
| shareTitle | String | '' | 分享标题（可选） |
| shareImage | String | '' | 分享图片URL（可选） |
| disabled | Boolean | false | 是否禁用 |

## 📝 Events

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| tap | 点击事件（仅openType不为share时触发） | (event: Event) |
| error | 错误事件 | (error: Error) |

## 💡 完整示例

### DIY制作单页面示例

```vue
<template>
  <view class="page">
    <!-- 页面内容 -->

    <!-- 底部操作栏 -->
    <view class="bottom-actions">
      <button class="action-btn primary" @tap="handlePrint">
        <text class="btn-text">生成图片</text>
      </button>

      <button class="action-btn success" @tap="handleSave">
        <text class="btn-text">保存制作单</text>
      </button>

      <!-- 分享按钮 -->
      <ShareButton
        :share-path="sharePath"
        :share-title="shareTitle"
        :share-image="recipe.coverImageUrl"
        type="icon-only"
        size="large"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import ShareButton from '@/components/ShareButton.vue'

const recipe = ref({
  name: '鸡肉蔬菜配方',
  coverImageUrl: 'https://example.com/recipe.jpg'
})

const dogId = ref('dog-123')
const recipeId = ref('recipe-456')

// 分享路径
const sharePath = computed(() => {
  return `/pages/diy-sheet/index?recipeId=${recipeId.value}&dogId=${dogId.value}`
})

// 分享标题
const shareTitle = computed(() => {
  return `【DIY制作单】${recipe.value.name}`
})

// 微信小程序分享配置
onShareAppMessage(() => {
  return {
    title: shareTitle.value,
    path: sharePath.value,
    imageUrl: recipe.value.coverImageUrl
  }
})

onShareTimeline(() => {
  return {
    title: shareTitle.value,
    query: `recipeId=${recipeId.value}&dogId=${dogId.value}`,
    imageUrl: recipe.value.coverImageUrl
  }
})
</script>

<style scoped>
.bottom-actions {
  display: flex;
  gap: 12rpx;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
}

.action-btn {
  flex: 1;
  height: 80rpx;
  border-radius: 12rpx;
  font-size: 26rpx;
  border: none;
}

.action-btn.primary {
  background-color: #1890ff;
  color: #fff;
}

.action-btn.success {
  background-color: #52c41a;
  color: #fff;
}
</style>
```

## 🎯 最佳实践

### 1. 分享内容设计

**标题**：
- ✅ 好的标题：`【DIY制作单】鸡肉蔬菜配方 - 小毛专属`
- ❌ 不好的标题：`分享`

**路径**：
- 确保路径完整且可访问
- 包含必要的参数以便恢复页面状态

**图片**：
- 推荐尺寸：5:4 比例
- 建议大小：不超过 200KB

### 2. 放置位置

| 位置 | 适用场景 | 推荐样式 |
|------|----------|----------|
| 底部操作栏 | 与其他操作按钮并列 | icon-only + large |
| 页面右上角 | 独立的分享入口 | icon-only + medium |
| 内容区域 | 鼓励用户分享某条内容 | plain + showText |

### 3. 用户体验

- **即时反馈**：点击分享按钮后，微信会弹出原生分享面板
- **状态同步**：分享内容与页面当前状态保持一致
- **参数完整**：确保分享路径包含所有必要的查询参数

## 🔍 注意事项

1. **open-type="share"**：这是微信小程序的原生分享能力，需要真机测试才能看到完整效果
2. **开发工具限制**：在开发者工具中，点击分享按钮可能不会弹出分享面板，这是正常的
3. **分享配置**：除了使用ShareButton组件，还需要在页面中配置`onShareAppMessage`和`onShareTimeline`
4. **图片URL**：确保分享图片URL是可访问的完整路径
5. **路径限制**：分享路径必须是小程序内已注册的页面路径

## 📚 相关资源

- [微信小程序转发文档](https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.showShareMenu.html)
- [uni-app 页面配置](https://uniapp.dcloud.net.cn/api/plugins/share.html)

## 🆕 更新日志

### v1.0.0 (2024-01-08)
- ✨ 初始版本发布
- 🎨 支持4种样式变体
- 📏 支持3种尺寸规格
- 🔗 集成微信原生分享能力
