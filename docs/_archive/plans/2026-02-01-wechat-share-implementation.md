# 微信小程序分享功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 为SevenKitchen微信小程序实现转发给朋友和分享到朋友圈功能

**架构:** 使用Vue3 Composition API创建可复用的ShareMixin,封装分享逻辑,支持动态内容生成和优雅降级

**技术栈:** uni-app + Vue3 + TypeScript + 微信小程序分享API

---

## Task 1: 创建mixins目录结构

**Files:**
- Create: `miniapp/src/mixins/` directory

**Step 1: 创建mixins目录**

```bash
mkdir -p miniapp/src/mixins
```

**Step 2: 验证目录创建成功**

Run: `ls -la miniapp/src/mixins/`
Expected: Directory exists (empty)

**Step 3: Commit**

```bash
git add miniapp/src/mixins
git commit -m "feat: 创建mixins目录用于存放可复用的组合式函数"
```

---

## Task 2: 创建ShareMixin核心逻辑

**Files:**
- Create: `miniapp/src/mixins/shareMixin.ts`

**Step 1: 创建ShareMixin文件**

```bash
touch miniapp/src/mixins/shareMixin.ts
```

**Step 2: 编写ShareMixin核心代码**

在 `miniapp/src/mixins/shareMixin.ts` 中添加以下完整代码:

```typescript
import { ref, computed, type Ref } from 'vue'

export interface ShareConfig {
  title?: string | Ref<string>
  imageUrl?: string | Ref<string>
  path?: string | Ref<string>
  query?: Record<string, any>
}

export interface ShareResult {
  onShareAppMessage: () => any
  onShareTimeline: () => any
}

// 默认配置
const DEFAULT_CONFIG = {
  title: 'Seven的厨房 - 为您的爱犬定制健康食谱',
  imageUrl: '/static/share-default.png',
  path: '/pages/home/index'
}

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
    if (safeConfig.title && typeof safeConfig.title === 'string' && safeConfig.title.length > 512) {
      safeConfig.title = safeConfig.title.substring(0, 509) + '...'
    }

    // 路径有效性检查
    if (safeConfig.path && typeof safeConfig.path === 'string' && !safeConfig.path.startsWith('/')) {
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
      console.warn('[ShareMixin] Image check failed:', imageUrl, error)
      return false
    }
  }

  /**
   * 获取有效的图片URL
   */
  const getValidImageUrl = async (imageUrl: string): Promise<string> => {
    // 如果是空字符串,直接返回
    if (!imageUrl) {
      return DEFAULT_CONFIG.imageUrl
    }

    // 检查配置的图片
    if (await checkImageExists(imageUrl)) {
      return imageUrl
    }

    // 如果都失败,返回默认图
    return DEFAULT_CONFIG.imageUrl
  }

  /**
   * 转发给朋友
   */
  const onShareAppMessage = async () => {
    const pageInfo = getCurrentPageInfo()

    const title = typeof titleRef.value === 'string' ? titleRef.value : titleRef.value.value
    const path = typeof pathRef.value === 'string' ? pathRef.value : pathRef.value.value

    const shareConfig = {
      title,
      imageUrl: await getValidImageUrl(imageUrlRef.value),
      path: path || pageInfo.fullPath || DEFAULT_CONFIG.path
    }

    return validateConfig(shareConfig)
  }

  /**
   * 分享到朋友圈
   */
  const onShareTimeline = async () => {
    const title = typeof titleRef.value === 'string' ? titleRef.value : titleRef.value.value

    const shareConfig = {
      title,
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

**Step 3: 验证TypeScript语法**

Run: `cd miniapp && npx tsc --noEmit mixins/shareMixin.ts`
Expected: No type errors

**Step 4: Commit**

```bash
git add miniapp/src/mixins/shareMixin.ts
git commit -m "feat: 实现ShareMixin分享功能核心逻辑

- 支持动态配置分享标题、图片、路径
- 实现图片降级策略
- 添加配置验证(标题长度、路径有效性)
- 提供onShareAppMessage和onShareTimeline钩子"
```

---

## Task 3: 在首页集成分享功能

**Files:**
- Modify: `miniapp/src/pages/home/index.vue`

**Step 1: 在home/index.vue的script部分导入useShare**

在 `miniapp/src/pages/home/index.vue` 的 `<script setup lang="ts">` 部分开头添加导入:

```typescript
import { useShare } from '@/mixins/shareMixin'
```

插入位置: 在第295行 `import { normalizeImageUrl } from '../../utils/config'` 之后

**Step 2: 在home/index.vue中配置分享**

在 `miniapp/src/pages/home/index.vue` 的script部分,在所有import之后(约第298行),添加以下代码:

```typescript
// 配置分享功能
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
```

**Step 3: 验证代码无语法错误**

Run: `cd miniapp && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add miniapp/src/pages/home/index.vue
git commit -m "feat: 首页集成分享功能

- 导入并使用ShareMixin
- 配置首页专属的分享标题和图片
- 注册分享钩子以支持转发和朋友圈分享"
```

---

## Task 4: 在食谱详情页集成分享功能(动态配置)

**Files:**
- Modify: `miniapp/src/pages/recipe-detail/index.vue`

**Step 1: 在recipe-detail/index.vue中导入useShare**

在 `miniapp/src/pages/recipe-detail/index.vue` 的 `<script setup lang="ts">` 部分添加导入:

```typescript
import { useShare } from '@/mixins/shareMixin'
```

插入位置: 在其他import语句之后

**Step 2: 在recipe-detail/index.vue中配置动态分享**

找到 `recipe` 的ref定义(通常在script开始部分),在其后添加:

```typescript
// 配置动态分享功能
const { onShareAppMessage, onShareTimeline } = useShare({
  title: computed(() =>
    recipe.value?.name
      ? `${recipe.value.name} | Seven的厨房`
      : '精选食谱 | Seven的厨房'
  ),
  imageUrl: computed(() => recipe.value?.coverImageUrl || '/static/share-recipe.png'),
  path: computed(() =>
    recipe.value?.id
      ? `/pages/recipe-detail/index?recipeId=${recipe.value.id}`
      : '/pages/home/index'
  )
})

// 注册分享钩子
defineExpose({
  onShareAppMessage,
  onShareTimeline
})
```

**Step 3: 验证代码无语法错误**

Run: `cd miniapp && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add miniapp/src/pages/recipe-detail/index.vue
git commit -m "feat: 食谱详情页集成动态分享功能

- 根据食谱数据动态生成分享标题
- 优先使用食谱封面图,降级到默认图
- 包含食谱ID的分享路径,方便直接打开"
```

---

## Task 5: 在收藏食谱页集成分享功能

**Files:**
- Modify: `miniapp/src/pages/favorite-recipes/index.vue`

**Step 1: 在favorite-recipes/index.vue中导入useShare**

在 `miniapp/src/pages/favorite-recipes/index.vue` 的 `<script setup lang="ts">` 部分添加:

```typescript
import { useShare } from '@/mixins/shareMixin'
```

**Step 2: 在favorite-recipes/index.vue中配置分享**

在script部分添加:

```typescript
// 配置分享功能
const { onShareAppMessage, onShareTimeline } = useShare({
  title: '我收藏的狗狗食谱 - Seven的厨房',
  imageUrl: '/static/share-default.png',
  path: '/pages/favorite-recipes/index'
})

// 注册分享钩子
defineExpose({
  onShareAppMessage,
  onShareTimeline
})
```

**Step 3: 验证代码无语法错误**

Run: `cd miniapp && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add miniapp/src/pages/favorite-recipes/index.vue
git commit -m "feat: 收藏食谱页集成分享功能"
```

---

## Task 6: 创建默认分享图片资源

**Files:**
- Create: `miniapp/src/static/share-default.png`
- Create: `miniapp/src/static/share-home.png`
- Create: `miniapp/src/static/share-recipe.png`

**Step 1: 创建占位图片(临时方案)**

创建简单的占位图片文本文件,说明需要设计团队提供:

```bash
# 创建说明文件
cat > miniapp/src/static/share-images-readme.txt << 'EOF'
分享图片资源说明
================

需要设计团队提供以下3张图片:

1. share-default.png (400x320px)
   - 用途: 全局默认分享图
   - 内容: 品牌Logo + 品牌标语
   - 风格: 简洁、专业

2. share-home.png (400x320px)
   - 用途: 首页专属分享图
   - 内容: 首页精选内容展示
   - 风格: 吸引、诱人

3. share-recipe.png (400x320px)
   - 用途: 食谱类默认分享图
   - 内容: 食谱相关视觉元素
   - 风格: 清新、健康

临时方案: 使用纯色占位图
EOF

# 创建临时占位图(1x1像素PNG)
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > miniapp/src/static/share-default.png
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > miniapp/src/static/share-home.png
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > miniapp/src/static/share-recipe.png
```

**Step 2: 验证文件创建成功**

Run: `ls -lh miniapp/src/static/share-*.png`
Expected: Three PNG files exist

**Step 3: Commit**

```bash
git add miniapp/src/static/share-*.png miniapp/src/static/share-images-readme.txt
git commit -m "feat: 添加分享图片资源(临时占位图)

- 创建3个分享图片占位文件
- 添加图片设计说明文档
- 待设计团队提供正式图片"
```

---

## Task 7: 在pages.json中启用分享功能

**Files:**
- Modify: `miniapp/src/pages.json`

**Step 1: 为首页添加分享配置**

在 `miniapp/src/pages.json` 的首页配置中添加 `enableShareAppMessage` 和 `enableShareTimeline`:

修改第3-9行:
```json
{
  "path": "pages/home/index",
  "style": {
    "navigationBarTitleText": "Seven的厨房",
    "enablePullDownRefresh": true,
    "enableShareAppMessage": true,
    "enableShareTimeline": true
  }
}
```

**Step 2: 为食谱详情页添加分享配置**

修改第28-33行:
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

**Step 3: 为收藏食谱页添加分享配置**

修改第82-87行:
```json
{
  "path": "pages/favorite-recipes/index",
  "style": {
    "navigationBarTitleText": "收藏的食谱",
    "enableShareAppMessage": true,
    "enableShareTimeline": true
  }
}
```

**Step 4: 验证JSON格式**

Run: `python3 -m json.tool miniapp/src/pages.json > /dev/null && echo "JSON valid"`
Expected: "JSON valid"

**Step 5: Commit**

```bash
git add miniapp/src/pages.json
git commit -m "feat: 在pages.json中启用页面分享功能

- 为首页启用分享
- 为食谱详情页启用分享
- 为收藏食谱页启用分享"
```

---

## Task 8: 编写单元测试(可选)

**Files:**
- Create: `miniapp/src/mixins/__tests__/shareMixin.test.ts`

**Step 1: 创建测试目录和文件**

```bash
mkdir -p miniapp/src/mixins/__tests__
touch miniapp/src/mixins/__tests__/shareMixin.test.ts
```

**Step 2: 编写基础测试**

在 `miniapp/src/mixins/__tests__/shareMixin.test.ts` 中添加:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useShare } from '../shareMixin'

describe('ShareMixin', () => {
  beforeEach(() => {
    // Mock uni API
    global.getCurrentPages = vi.fn(() => [])
  })

  it('should return default config when no params provided', () => {
    const { onShareAppMessage, onShareTimeline } = useShare()

    expect(onShareAppMessage).toBeDefined()
    expect(onShareTimeline).toBeDefined()
  })

  it('should use custom title when provided', () => {
    const customTitle = 'Custom Share Title'
    const { onShareAppMessage } = useShare({ title: customTitle })

    const result = onShareAppMessage()
    expect(result.title).toBe(customTitle)
  })

  it('should truncate title if too long', async () => {
    const longTitle = 'A'.repeat(600)
    const { onShareAppMessage } = useShare({ title: longTitle })

    const result = await onShareAppMessage()
    expect(result.title.length).toBeLessThanOrEqual(512)
  })
})
```

**Step 3: Commit**

```bash
git add miniapp/src/mixins/__tests__
git commit -m "test: 添加ShareMixin单元测试"
```

---

## Task 9: 创建功能测试文档

**Files:**
- Create: `docs/testing/wechat-share-testing-guide.md`

**Step 1: 创建测试文档**

```bash
mkdir -p docs/testing
touch docs/testing/wechat-share-testing-guide.md
```

**Step 2: 编写测试文档内容**

在 `docs/testing/wechat-share-testing-guide.md` 中添加:

```markdown
# 微信小程序分享功能测试指南

## 测试环境
- 微信开发者工具 (最新版)
- iOS真机
- Android真机

## 功能测试清单

### 转发给朋友测试

#### 首页分享
- [ ] 打开首页
- [ ] 点击右上角"..."菜单
- [ ] 点击"转发"按钮
- [ ] 验证预览标题: "Seven的厨房 - 为您的爱犬定制健康食谱"
- [ ] 验证分享图片显示正常
- [ ] 实际发送给好友
- [ ] 好友点击分享卡片,验证能正常打开首页

#### 食谱详情页分享
- [ ] 打开任意食谱详情页
- [ ] 点击右上角"..."菜单
- [ ] 点击"转发"按钮
- [ ] 验证标题格式: "{食谱名称} | Seven的厨房"
- [ ] 验证图片为食谱封面图
- [ ] 实际发送给好友
- [ ] 好友点击分享卡片,验证能打开该食谱详情页

#### 收藏食谱页分享
- [ ] 打开收藏食谱页
- [ ] 点击"..." → "转发"
- [ ] 验证标题: "我收藏的狗狗食谱 - Seven的厨房"
- [ ] 验证默认图片显示

### 分享到朋友圈测试

**注意:** 需要微信基础库 >= 2.11.3

#### 首页分享朋友圈
- [ ] 打开首页
- [ ] 点击"..."菜单
- [ ] 点击"分享到朋友圈"
- [ ] 验证标题和图片显示
- [ ] 实际发布到朋友圈
- [ ] 验证朋友圈卡片展示效果
- [ ] 点击卡片,验证能正常打开小程序

#### 食谱详情页分享朋友圈
- [ ] 打开食谱详情页
- [ ] 分享到朋友圈
- [ ] 验证动态标题和图片

### 边界情况测试

#### 图片降级测试
- [ ] 测试无封面图食谱(应降级到share-recipe.png)
- [ ] 测试网络图片加载失败(应降级到默认图)
- [ ] 测试默认图不存在(应使用微信默认图)

#### 数据异常测试
- [ ] 测试超长标题(>512字符,应自动截断)
- [ ] 测试特殊字符(emoji、符号)
- [ ] 测试空标题数据(应使用默认标题)

#### 兼容性测试
- [ ] 测试低版本微信(<2.11.3,不应显示朋友圈分享)
- [ ] 测试iOS设备
- [ ] 测试Android设备

### 用户体验测试

- [ ] 分享面板弹出流畅,无卡顿
- [ ] 图片加载快速
- [ ] 分享成功率100%
- [ ] 点击分享卡片跳转正确

## 测试结果记录

### 测试日期: ___________
### 测试人员: ___________
### 测试环境: 开发工具 / iOS / Android

| 测试项 | 结果 | 备注 |
|--------|------|------|
| 首页转发给朋友 | ✅ / ❌ | |
| 首页分享朋友圈 | ✅ / ❌ | |
| 食谱详情转发 | ✅ / ❌ | |
| 食谱详情分享朋友圈 | ✅ / ❌ | |
| 图片降级 | ✅ / ❌ | |
| 标题截断 | ✅ / ❌ | |

## 问题记录

### 发现的问题
1.
2.

### 建议
1.
2.
```

**Step 3: Commit**

```bash
git add docs/testing/wechat-share-testing-guide.md
git commit -m "docs: 添加分享功能测试指南

- 详细的测试清单
- 功能测试步骤
- 边界情况测试
- 测试结果记录模板"
```

---

## Task 10: 开发者工具验证

**Step 1: 编译项目**

```bash
cd miniapp
npm run build:mp-weixin
```

**Step 2: 在微信开发者工具中打开**

1. 打开微信开发者工具
2. 导入项目: `miniapp/dist/dev/mp-weixin`
3. 检查编译是否有错误

**Step 3: 在开发者工具中测试分享**

1. 打开首页
2. 点击工具栏的"编译"按钮
3. 点击右上角"..." → "转发"
4. 查看预览效果,验证:
   - 标题显示正确
   - 图片路径正确
   - 路径参数正确

**Step 4: 检查控制台日志**

打开Debug面板,检查是否有分享相关的错误日志

**Step 5: 记录测试结果**

记录测试中发现的任何问题

**Step 6: Commit (如果有修复)**

如果有发现问题并修复:
```bash
git add miniapp/src
git commit -m "fix: 修复开发者工具测试中发现的问题"
```

---

## Task 11: 真机测试验证

**Step 1: 生成预览码**

在微信开发者工具中:
1. 点击工具栏的"预览"按钮
2. 扫码在真机上打开

**Step 2: 执行完整测试流程**

按照 `docs/testing/wechat-share-testing-guide.md` 中的测试清单执行:
- [ ] 首页分享测试
- [ ] 食谱详情页分享测试
- [ ] 收藏页分享测试
- [ ] 图片降级测试
- [ ] 边界情况测试

**Step 3: 记录测试结果**

将测试结果记录到测试文档中

**Step 4: 修复发现的问题(如果有)**

```bash
git add miniapp/src
git commit -m "fix: 修复真机测试中发现的问题"
```

---

## Task 12: 代码审查和优化

**Step 1: 代码审查清单**

- [ ] ShareMixin代码清晰易懂
- [ ] 类型定义完整
- [ ] 错误处理完善
- [ ] 降级策略有效
- [ ] 代码注释充分
- [ ] 无性能问题
- [ ] 符合项目代码规范

**Step 2: 性能优化(如果需要)**

检查是否有性能问题:
- 图片检查是否异步
- 是否有不必要的计算
- 是否有内存泄漏风险

**Step 3: 提交优化代码(如果有)**

```bash
git add miniapp/src
git commit -m "refactor: 优化分享功能代码

- 优化性能
- 改进错误处理
- 完善代码注释"
```

---

## Task 13: 更新项目文档

**Files:**
- Modify: `docs/` (existing documentation)

**Step 1: 更新README或CHANGELOG**

在项目根目录的README或CHANGELOG中添加分享功能说明:

```markdown
## 新功能

### 分享功能
支持转发给朋友和分享到朋友圈:
- 首页分享
- 食谱详情页动态分享
- 收藏食谱页分享
- 智能图片降级策略
```

**Step 2: 更新API文档(如果需要)**

如果有API文档,更新相关接口说明

**Step 3: Commit**

```bash
git add README.md docs/
git commit -m "docs: 更新项目文档,添加分享功能说明"
```

---

## Task 14: 最终检查和发布准备

**Step 1: 最终检查清单**

- [ ] 所有测试通过
- [ ] 无编译错误
- [ ] 无运行时错误
- [ ] 分享功能正常工作
- [ ] 图片资源齐全
- [ ] 文档完整
- [ ] 代码已审查
- [ ] Git提交历史清晰

**Step 2: 创建发布标签(可选)**

```bash
git tag -a v1.x.0 -m "添加微信小程序分享功能"
git push origin v1.x.0
```

**Step 3: 准备发布说明**

创建发布说明,包含:
- 新功能描述
- 使用方式
- 测试结果
- 已知问题(如果有)

**Step 4: Commit (最后的文档更新)**

```bash
git add .
git commit -m "chore: 准备分享功能发布

- 完成所有测试
- 更新文档
- 准备发布"
```

---

## 实施注意事项

### 关键依赖
- uni-app: 必须支持Vue3 Composition API
- 微信基础库: >= 2.11.3 (朋友圈分享)
- TypeScript: 配置正确

### 图片资源
当前使用临时占位图,需要尽快替换为正式设计图:
- `share-default.png`
- `share-home.png`
- `share-recipe.png`

### 测试要点
1. 开发者工具测试(快速验证)
2. 真机测试(最终验证)
3. 不同微信版本兼容性
4. iOS/Android差异

### 常见问题
1. **图片不显示**: 检查路径和文件是否存在
2. **分享面板不弹出**: 检查pages.json配置
3. **朋友圈分享无反应**: 检查微信基础库版本
4. **标题显示异常**: 检查是否超长或包含特殊字符

### 后续优化方向
1. 分享数据统计
2. 分享激励功能
3. 自定义分享内容
4. 生成分享海报

---

**实施预计时间:** 2-3小时
**测试预计时间:** 1-2小时
**总计:** 3-5小时

**优先级:** 高
**风险等级:** 低(使用成熟API)
**依赖:** 无外部依赖
