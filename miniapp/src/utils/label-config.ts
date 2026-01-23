/**
 * 标签渲染统一配置
 * 所有排版参数在一个地方定义，自动适配Canvas（像素）和精臣SDK（毫米）
 */

// 单位转换常量
const MM_TO_PX = 8; // 1mm = 8像素 (75mm × 100mm = 600px × 800px)

export interface LabelLayoutConfig {
  // 位置和尺寸（毫米单位）
  x: number;
  y: number;
  width?: number;
  height?: number;

  // 字体大小（毫米单位）
  fontSize: number;

  // 颜色
  color?: string;

  // 对齐方式
  align?: 'left' | 'center' | 'right';

  // 其他样式
  bold?: boolean;
  lineHeight?: number;
}

/**
 * 标签排版配置（统一使用毫米单位）
 * 热敏打印机优化：确保最小字体≥2.3mm，清晰可读
 */
export const LABEL_LAYOUT = {
  canvas: {
    width: 75,   // mm
    height: 100, // mm
  },

  margin: {
    top: 4,      // 减少顶部留白，腾出更多空间
    bottom: 4,   // 减少底部留白
    left: 7,     // 左边距
    right: 7,    // 右边距
  },

  // 字体大小配置（mm）- 热敏打印机最小可读字体≥2.3mm
  fontSize: {
    brand: 2.5,         // 品牌名称（顶部）
    title: 5.5,         // 食谱名称
    subtitle: 3.0,      // 副标题
    sectionTitle: 3.6,  // 小节标题（略微减小）
    body: 2.7,          // 正文
    small: 2.3,         // 说明文字（确保可读）
    brandBottom: 2.5,   // 底部品牌名称
  },

  // 行高配置（mm）- 优化间距防止溢出
  lineHeight: {
    compact: 3.2,   // 紧凑行高（略微减小）
    normal: 4.2,    // 正常行高（略微减小）
    loose: 5.0,     // 宽松行高（略微减小）
  },

  // 区块间距配置（mm）
  spacing: {
    sectionGap: 3.5,     // 区块之间的间距（减小以节省空间）
    blockInternal: 1.5,  // 区块内元素间距（减小）
  },

  // 线条配置
  line: {
    separator: 0.375,  // 普通分隔线
    thick: 0.5,        // 粗分隔线（用于品牌区）
    decorative: 0.3,   // 装饰线（用于标题两侧）
  },
} as const;

/**
 * 标签元素配置（从上到下的顺序）
 */
export const LABEL_ELEMENTS = {
  // 0. 顶部品牌名称
  brandTop: {
    fontSize: LABEL_LAYOUT.fontSize.brand,
    align: 'center' as const,
    yOffset: 4,  // 距离顶部4mm（减少）
    lineHeight: LABEL_LAYOUT.lineHeight.normal,
  },

  // 1. 食谱名称
  recipeName: {
    fontSize: LABEL_LAYOUT.fontSize.title,
    align: 'center' as const,
    lineHeight: LABEL_LAYOUT.lineHeight.normal,
    bold: true,
  },

  // 2. 制作信息
  productionInfo: {
    fontSize: LABEL_LAYOUT.fontSize.subtitle,
    align: 'center' as const,
    lineHeight: LABEL_LAYOUT.lineHeight.compact,  // 使用紧凑行高
  },

  // 3. 原料表标题
  ingredientsTitle: {
    fontSize: LABEL_LAYOUT.fontSize.sectionTitle,
    align: 'center' as const,
    lineHeight: LABEL_LAYOUT.lineHeight.compact,  // 使用紧凑行高
    bold: true,
    withDecoration: true,
  },

  // 4. 原料内容
  ingredientsContent: {
    fontSize: LABEL_LAYOUT.fontSize.body,
    align: 'center' as const,
    lineHeight: LABEL_LAYOUT.lineHeight.compact,  // 使用紧凑行高
    maxCharsPerLine: 28,
  },

  // 5. 营养成分
  nutrition: {
    titleFontSize: LABEL_LAYOUT.fontSize.sectionTitle,
    titleWithDecoration: true,
    contentFontSize: LABEL_LAYOUT.fontSize.body,
    align: 'center' as const,
    lineHeight: LABEL_LAYOUT.lineHeight.compact,  // 使用紧凑行高
    itemsPerLine: 4,
  },

  // 6. 保质期
  shelfLife: {
    titleFontSize: LABEL_LAYOUT.fontSize.sectionTitle,
    titleWithDecoration: true,
    contentFontSize: LABEL_LAYOUT.fontSize.body,
    bulletSymbol: '● ',
    lineHeight: LABEL_LAYOUT.lineHeight.compact,  // 使用紧凑行高
  },

  // 7. 烹饪建议
  cooking: {
    titleFontSize: LABEL_LAYOUT.fontSize.sectionTitle,
    titleWithDecoration: true,
    contentFontSize: LABEL_LAYOUT.fontSize.body,
    descriptionFontSize: LABEL_LAYOUT.fontSize.small,  // 说明文字用小字号
    lineHeight: LABEL_LAYOUT.lineHeight.compact,  // 使用紧凑行高
    methodIndent: 0,
    descriptionIndent: 2,
  },

  // 8. 底部品牌名称
  brandBottom: {
    fontSize: LABEL_LAYOUT.fontSize.brandBottom,
    align: 'center' as const,
    yOffsetFromBottom: 6,  // 距离底部6mm
  },
} as const;

/**
 * 工具函数：毫米转像素
 */
export function mmToPx(mm: number): number {
  return Math.round(mm * MM_TO_PX);
}

/**
 * 工具函数：获取Canvas配置（像素单位）
 */
export function getCanvasConfig() {
  return {
    width: mmToPx(LABEL_LAYOUT.canvas.width),
    height: mmToPx(LABEL_LAYOUT.canvas.height),
    margin: {
      top: mmToPx(LABEL_LAYOUT.margin.top),
      bottom: mmToPx(LABEL_LAYOUT.margin.bottom),
      left: mmToPx(LABEL_LAYOUT.margin.left),
      right: mmToPx(LABEL_LAYOUT.margin.right),
    },
  };
}

/**
 * 工具函数：获取精臣SDK配置（毫米单位）
 */
export function getJCSKConfig() {
  return {
    width: LABEL_LAYOUT.canvas.width,
    height: LABEL_LAYOUT.canvas.height,
    margin: LABEL_LAYOUT.margin,
  };
}
