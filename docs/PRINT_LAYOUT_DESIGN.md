# DIY制作单 - 竖版A4布局设计

> 更新时间：2025-01-08
> 规格：1200px × 1697px (A4竖版 @150dpi)

---

## 📐 整体布局结构

```
┌──────────────────────────────────────────┐
│           【页头区域】 (120px高)            │
│        Seven厨房 Logo + 食谱标题             │
│          适用阶段 + 健康标签                 │
├──────────────────────────────────────────┤
│        【狗狗信息卡】 (100px高)             │
│     狗狗名 | 年龄 | 体重 | 每日餐数          │
├──────────────────────────────────────────┤
│        【制作参数卡】 (100px高)             │
│     制作周期 | 每餐 | 每日 | 营养标准         │
├──────────────────────────────────────────┤
│           【食材清单】 (~300px高)           │
│              原料表格 + 合计                 │
├──────────────────────────────────────────┤
│        【需补充营养】 (~200px高)            │
│              补剂表格                       │
├──────────────────────────────────────────┤
│           【制作流程】 (100px高)            │
│              文字说明框                     │
├──────────────────────────────────────────┤
│          【重要提示】 (180px高)             │
│       烹饪建议 | 分装建议 | 储存说明          │
├──────────────────────────────────────────┤
│           【页脚】 (60px高)                 │
│         Seven厨房 | 生成日期                │
└──────────────────────────────────────────┘
```

---

## 🎨 详细设计规范

### 1. 页头区域 (120px)

**位置**: Y: 0-120
**样式**: 居中对齐，渐变背景

```typescript
{
  // 渐变背景
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',

  // 标题
  title: {
    fontSize: 36,
    color: '#ffffff',
    textAlign: 'center',
    y: 50
  },

  // 标签行
  tags: {
    fontSize: 18,
    y: 85,
    gap: 15
  }
}
```

**标签样式**:
- 圆角矩形背景
- 蓝色/橙色区分不同类型
- 最多一行显示6个标签

---

### 2. 狗狗信息卡 (100px)

**位置**: Y: 140-240
**布局**: 横向4列

```typescript
{
  layout: '4列网格',
  items: [
    { label: '狗狗', value: '旺财' },
    { label: '年龄', value: '2岁3个月' },
    { label: '体重', value: '15kg' },
    { label: '餐数', value: '2餐/天' }
  ],
  style: {
    background: '#f0f9ff',
    borderLeft: '4px solid #1890ff',
    padding: '20px 40px',
    borderRadius: 12
  }
}
```

**信息展示**:
- 标签：灰色小字（14px）
- 值：黑色粗体（18px）

---

### 3. 制作参数卡 (100px)

**位置**: Y: 260-360
**布局**: 横向4列

```typescript
{
  layout: '4列网格',
  items: [
    { label: '制作周期', value: '7天' },
    { label: '每餐用量', value: '200g' },
    { label: '每日用量', value: '400g' },
    { label: '营养标准', value: 'FEDIAF 2021' }
  ],
  style: {
    background: '#fff7e6',
    borderLeft: '4px solid #faad14',
    padding: '20px 40px',
    borderRadius: 12
  }
}
```

---

### 4. 食材清单 (~300px)

**位置**: Y: 380-680
**表格布局**: 3列

```typescript
{
  title: {
    text: '📋 食材清单',
    fontSize: 26,
    y: 380,
    icon: true
  },

  table: {
    columns: [
      { name: '原料名称', width: '40%' },
      { name: '制备方法', width: '30%' },
      { name: '采购量', width: '30%', align: 'right' }
    ],
    header: {
      background: '#fafafa',
      height: 40,
      fontSize: 16,
      color: '#666666'
    },
    rows: {
      height: 35,
      fontSize: 16,
      color: '#333333'
    },
    totalRow: {
      background: '#fff7e6',
      text: '合计',
      valueColor: '#ff4d4f',
      fontSize: 18,
      fontWeight: 'bold'
    }
  }
}
```

**合计行**:
- 黄色背景 (#fff7e6)
- 红色金额 (#ff4d4f)
- 粗体显示

---

### 5. 需补充营养 (~200px)

**位置**: Y: 700-900
**表格布局**: 4列

```typescript
{
  title: {
    text: '💊 需额外补充的营养',
    fontSize: 26,
    y: 700,
    icon: true
  },

  table: {
    columns: [
      { name: '推荐营养品', width: '30%' },
      { name: '推荐品牌', width: '25%' },
      { name: '添加时机', width: '25%' },
      { name: '添加量', width: '20%', align: 'right' }
    ],
    rows: {
      height: 35,
      fontSize: 14,
      color: '#333333'
    }
  }
}
```

**省略处理**:
- 最多显示8行
- 超出显示"... 还有N项"

---

### 6. 制作流程 (100px)

**位置**: Y: 920-1020
**样式**: 浅灰背景卡片

```typescript
{
  title: {
    text: '👨‍🍳 制作流程',
    fontSize: 26,
    y: 920,
    icon: true
  },

  content: {
    background: '#f9f9f9',
    padding: '20px 40px',
    borderRadius: 12,
    height: 70,
    fontSize: 16,
    lineHeight: 1.6,
    maxLines: 3,
    color: '#333333'
  }
}
```

---

### 7. 重要提示 (180px)

**位置**: Y: 1040-1220
**布局**: 2×2卡片网格

```typescript
{
  title: {
    text: '💡 重要提示',
    fontSize: 26,
    y: 1040,
    icon: true
  },

  cards: [
    {
      icon: '🍳',
      title: '烹饪建议',
      content: [
        '建议蒸、炖、低温慢煮',
        '不建议微波、烤、煎等高温烹饪'
      ],
      accentColor: '#ff4d4f'
    },
    {
      icon: '📦',
      title: '分装建议',
      content: [
        '建议使用食品真空袋',
        '抽真空保存'
      ],
      accentColor: '#1890ff'
    },
    {
      icon: '❄️',
      title: '储存&保质期',
      content: [
        '-18℃冷冻保存6个月',
        '0-5℃冷藏保存3天',
        '开封后3小时内吃完'
      ],
      accentColor: '#52c41a'
    },
    {
      icon: '✨',
      title: '温馨提示',
      content: [
        '制作前请确保双手清洁',
        '使用新鲜的食材'
      ],
      accentColor: '#faad14'
    }
  ],

  cardStyle: {
    width: 'calc(50% - 10px)',
    height: 70,
    background: '#ffffff',
    border: '1px solid #e8e8e8',
    borderRadius: 12,
    padding: 15,
    titleFontSize: 18,
    contentFontSize: 14,
    lineHeight: 1.5
  }
}
```

---

### 8. 页脚 (60px)

**位置**: Y: 1637-1697
**样式**: 居中，浅色文字

```typescript
{
  content: 'Seven厨房 | 2025年1月8日',
  style: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    y: 1670
  }
}
```

---

## 🎯 优化要点

### 1. 视觉层次
- **一级标题**: 36px（食谱名称）
- **二级标题**: 26px（区块标题）
- **正文**: 16-18px
- **小字**: 14px
- **页脚**: 14px

### 2. 间距系统
```typescript
const SPACING = {
  SECTION_MARGIN: 40,    // 区块间距
  CARD_PADDING: 20,      // 卡片内边距
  TABLE_ROW_HEIGHT: 35,  // 表格行高
  LINE_HEIGHT: 1.5       // 行高倍数
}
```

### 3. 颜色系统
```typescript
const COLORS = {
  PRIMARY: '#1890ff',      // 主色（蓝色）
  SUCCESS: '#52c41a',      // 成功（绿色）
  WARNING: '#faad14',      // 警告（橙色）
  DANGER: '#ff4d4f',       // 危险（红色）
  TITLE: '#1a1a1a',        // 标题
  TEXT: '#4a4a4a',         // 正文
  LIGHT: '#999999',        // 浅色文字
  BORDER: '#e8e8e8',       // 边框
  BG_LIGHT: '#f5f5f5',     // 浅背景
  BG_BLUE: '#f0f9ff',      // 蓝背景
  BG_YELLOW: '#fff7e6',    // 黄背景
  WHITE: '#ffffff'         // 白色
}
```

### 4. 内容优先级
1. **核心信息**（必须显示）:
   - 食谱名称
   - 狗狗信息
   - 制作参数
   - 食材清单 + 合计

2. **次要信息**（空间允许）:
   - 补剂清单（最多8行）
   - 制作流程（最多3行）
   - 重要提示（4个卡片）

3. **装饰信息**:
   - 页脚
   - 图标

---

## 📏 尺寸计算

**总高度**: 1697px

**各区块高度**:
- 页头: 120px (7.1%)
- 狗狗信息: 100px (5.9%)
- 制作参数: 100px (5.9%)
- 食材清单: 300px (17.7%) - 可变
- 补剂清单: 200px (11.8%) - 可变
- 制作流程: 100px (5.9%)
- 重要提示: 180px (10.6%)
- 间距: 417px (24.6%)
- 页脚: 60px (3.5%)

**使用率**: ~75%
**预留空间**: ~25%（用于内容溢出）

---

## ✅ 优化效果

### 对比优化前后

| 项目 | 优化前 | 优化后 |
|------|--------|--------|
| 标题区域 | 普通文字 | 渐变背景 + 图标 |
| 信息卡片 | 2×2网格 | 4列横向排列 |
| 表格行高 | 24px | 35px |
| 字体大小 | 14-16px | 14-18px |
| 区块间距 | 20px | 40px |
| 视觉层次 | 扁平 | 有层次感 |
| 图标使用 | 无 | Emoji图标 |

### 用户体验提升
- ✅ 信息更清晰易读
- ✅ 视觉层次分明
- ✅ 重要信息突出
- ✅ 美观度提升
- ✅ 专业感增强
