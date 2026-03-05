import { Injectable } from '@nestjs/common';
import { createCanvas, Canvas, CanvasRenderingContext2D, registerFont } from 'canvas';
import { LabelDataDto } from './dto/label-data.dto';
import * as path from 'path';

/**
 * 标签布局配置（毫米单位）
 */
const LABEL_LAYOUT = {
  canvas: {
    width: 75,   // mm
    height: 100, // mm
  },
  margin: {
    top: 4,
    bottom: 4,
    left: 7,
    right: 7,
  },
  fontSize: {
    brand: 2.5,
    title: 5.5,
    subtitle: 3.0,
    sectionTitle: 3.6,
    body: 2.7,
    small: 2.3,
    brandBottom: 2.5,
  },
  lineHeight: {
    compact: 3.2,
    normal: 4.2,
    loose: 5.0,
  },
  spacing: {
    sectionGap: 3.5,
    blockInternal: 1.5,
  },
};

// DPI设置：203 DPI (精臣B3S打印机分辨率)
const DPI = 203;
const MM_TO_PX = DPI / 25.4; // 1mm = 8像素

/**
 * 毫米转像素
 */
function mmToPx(mm: number): number {
  return Math.round(mm * MM_TO_PX);
}

/**
 * 生命阶段映射
 */
const LIFE_STAGE_LABELS: Record<string, string> = {
  puppy: '幼犬期',
  adult: '成犬期',
  senior: '老年期',
  all_life_stages: '全阶段',
};

/**
 * 健康标签映射
 */
const HEALTH_TAG_LABELS: Record<string, string> = {
  weight_management: '体重管理',
  joint_health: '关节健康',
  digestive_health: '消化健康',
  skin_coat: '皮肤毛发',
  kidney_support: '肾脏支持',
  heart_health: '心脏健康',
  immune_support: '免疫支持',
  dental_health: '口腔健康',
};

/**
 * 营养标准映射
 */
const NUTRITION_STANDARD_LABELS: Record<string, string> = {
  FEDIAF_2021: 'FEDIAF 2021',
  AAFCO_2023: 'AAFCO 2023',
  NRC_2006: 'NRC 2006',
};

@Injectable()
export class LabelService {
  private regularFontPath: string;
  private boldFontPath: string;

  constructor() {
    // 注册中文字体
    const fontsPath = path.join(__dirname, '../../assets/fonts');
    this.regularFontPath = path.join(fontsPath, 'SourceHanSansSC-Regular.otf');
    this.boldFontPath = path.join(fontsPath, 'SourceHanSansSC-Bold.otf');

    console.log('[LabelService] __dirname:', __dirname);
    console.log('[LabelService] fontsPath:', fontsPath);
    console.log('[LabelService] regularFontPath:', this.regularFontPath);
    console.log('[LabelService] boldFontPath:', this.boldFontPath);

    // 检查字体文件是否存在
    const fs = require('fs');
    if (!fs.existsSync(this.regularFontPath)) {
      console.error('[LabelService] Regular font file NOT found:', this.regularFontPath);
      throw new Error(`Font file not found: ${this.regularFontPath}`);
    } else {
      console.log('[LabelService] Regular font file found, size:', fs.statSync(this.regularFontPath).size, 'bytes');
    }

    if (!fs.existsSync(this.boldFontPath)) {
      console.error('[LabelService] Bold font file NOT found:', this.boldFontPath);
      throw new Error(`Font file not found: ${this.boldFontPath}`);
    } else {
      console.log('[LabelService] Bold font file found, size:', fs.statSync(this.boldFontPath).size, 'bytes');
    }

    // 注册字体到canvas库
    try {
      registerFont(this.regularFontPath, { family: 'Chinese' });
      registerFont(this.boldFontPath, { family: 'Chinese-Bold' });
      console.log('[LabelService] 字体注册成功');
    } catch (error) {
      console.error('[LabelService] 字体注册失败:', error);
      throw error;
    }
  }

  /**
   * 生成标签图片（返回base64）
   */
  generateLabelImage(labelData: LabelDataDto): string {
    const width = mmToPx(LABEL_LAYOUT.canvas.width);
    const height = mmToPx(LABEL_LAYOUT.canvas.height);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 白色背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // 黑色文字
    ctx.fillStyle = '#000000';

    // 设置中文字体（使用已注册的字体）
    ctx.font = `${mmToPx(LABEL_LAYOUT.fontSize.body)}px "Chinese"`;

    let y = mmToPx(LABEL_LAYOUT.margin.top + 3);
    const centerX = width / 2;
    const maxWidth = width - mmToPx(LABEL_LAYOUT.margin.left + LABEL_LAYOUT.margin.right);

    // 1. 品牌名称（顶部）
    ctx.font = `bold ${mmToPx(LABEL_LAYOUT.fontSize.brand)}px "Chinese-Bold"`;
    ctx.textAlign = 'center';
    ctx.fillText(labelData.brandName, centerX, y);
    y += mmToPx(LABEL_LAYOUT.lineHeight.normal);

    // 分隔线
    this.drawSeparatorLine(ctx, y, width);
    y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

    // 2. 食谱名称
    ctx.font = `bold ${mmToPx(LABEL_LAYOUT.fontSize.title)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;
    ctx.fillText(labelData.recipeName, centerX, y);
    y += mmToPx(LABEL_LAYOUT.lineHeight.normal);

    // 3. 制作信息
    ctx.font = `${mmToPx(LABEL_LAYOUT.fontSize.body)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;
    const productionInfo = `为"${labelData.dogName}"制作于${labelData.productionTime}`;
    ctx.fillText(productionInfo, centerX, y);
    y += mmToPx(LABEL_LAYOUT.lineHeight.compact);

    // 订购信息
    const orderInfo = `${labelData.weightPerPack}g/袋 × ${labelData.packageCount}袋 = ${labelData.totalWeight}g`;
    ctx.fillText(orderInfo, centerX, y);
    y += mmToPx(LABEL_LAYOUT.lineHeight.loose);
    y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

    // 4. 原料表
    y = this.drawSectionWithTitle(
      ctx,
      '原料表',
      labelData.foodIngredients,
      labelData.supplementIngredients,
      y,
      centerX,
      maxWidth,
      width
    );
    y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

    // 5. 营养成分分析
    if (labelData.nutritionAnalysis) {
      y = this.drawNutritionSection(ctx, labelData.nutritionAnalysis, y, centerX, maxWidth, width);
      y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);
    }

    // 6. 保质期
    y = this.drawShelfLifeSection(ctx, labelData.shelfLife, y, centerX, width);
    y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

    // 7. 烹饪建议（如果有）
    if (labelData.cookingMethod && typeof labelData.cookingMethod !== 'string') {
      y = this.drawCookingSection(ctx, labelData.cookingMethod, y, centerX, maxWidth, width);
      y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);
    }

    // 8. 底部品牌名称
    const bottomY = height - mmToPx(LABEL_LAYOUT.margin.bottom + 2);
    ctx.font = `${mmToPx(LABEL_LAYOUT.fontSize.brandBottom)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(labelData.brandName, centerX, bottomY);

    // 转换为base64
    const buffer = canvas.toBuffer('image/png');
    return buffer.toString('base64');
  }

  /**
   * 绘制分隔线
   */
  private drawSeparatorLine(ctx: CanvasRenderingContext2D, y: number, canvasWidth: number): void {
    const margin = mmToPx(LABEL_LAYOUT.margin.left);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(canvasWidth - margin, y);
    ctx.stroke();
  }

  /**
   * 绘制带标题的小节（原料表）
   */
  private drawSectionWithTitle(
    ctx: CanvasRenderingContext2D,
    title: string,
    foodIngredients: string,
    supplementIngredients: string,
    startY: number,
    centerX: number,
    maxWidth: number,
    canvasWidth: number,
  ): number {
    let y = startY;
    const margin = mmToPx(LABEL_LAYOUT.margin.left);

    // 标题带装饰
    ctx.font = `bold ${mmToPx(LABEL_LAYOUT.fontSize.sectionTitle)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;
    ctx.textAlign = 'center';
    const titleWidth = ctx.measureText(title).width;
    const decorLen = 15;
    ctx.fillText('— ' + title + ' —', centerX, y);
    y += mmToPx(LABEL_LAYOUT.lineHeight.compact);

    // 原料内容
    ctx.font = `${mmToPx(LABEL_LAYOUT.fontSize.body)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;
    ctx.textAlign = 'center';

    const allIngredients = [foodIngredients, supplementIngredients].filter(Boolean).join('、');
    const lines = this.wrapText(allIngredients, maxWidth - 4, ctx);

    for (const line of lines) {
      ctx.fillText(line, centerX, y);
      y += mmToPx(LABEL_LAYOUT.lineHeight.compact);
    }

    return y;
  }

  /**
   * 绘制营养成分小节
   */
  private drawNutritionSection(
    ctx: CanvasRenderingContext2D,
    nutrition: NonNullable<LabelDataDto['nutritionAnalysis']>,
    startY: number,
    centerX: number,
    maxWidth: number,
    canvasWidth: number,
  ): number {
    let y = startY;

    // 标题
    ctx.font = `bold ${mmToPx(LABEL_LAYOUT.fontSize.sectionTitle)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('— 营养成分分析 —', centerX, y);
    y += mmToPx(LABEL_LAYOUT.lineHeight.compact);

    // 营养成分内容
    ctx.font = `${mmToPx(LABEL_LAYOUT.fontSize.body)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;

    const items: string[] = [];
    if (nutrition.proteinPercent !== undefined) items.push(`蛋白质 ${nutrition.proteinPercent}%`);
    if (nutrition.fatPercent !== undefined) items.push(`脂肪 ${nutrition.fatPercent}%`);
    if (nutrition.ashPercent !== undefined) items.push(`灰分 ${nutrition.ashPercent}%`);
    if (nutrition.moisturePercent !== undefined) items.push(`水分 ${nutrition.moisturePercent}%`);
    if (nutrition.crudeFiberPercent !== undefined) items.push(`纤维 ${nutrition.crudeFiberPercent}%`);
    if (nutrition.carbohydratePercent !== undefined) items.push(`碳水 ${nutrition.carbohydratePercent}%`);

    // 每行4项
    for (let i = 0; i < items.length; i += 4) {
      const lineItems = items.slice(i, i + 4);
      ctx.fillText(lineItems.join('  '), centerX, y);
      y += mmToPx(LABEL_LAYOUT.lineHeight.compact);
    }

    // 能量和钙磷比
    if (nutrition.energyDensityKcalPerKg || nutrition.calciumPhosphorusRatio) {
      const extraItems: string[] = [];
      if (nutrition.energyDensityKcalPerKg) extraItems.push(`能量 ${nutrition.energyDensityKcalPerKg}kcal/kg`);
      if (nutrition.calciumPhosphorusRatio) extraItems.push(`钙磷比 ${nutrition.calciumPhosphorusRatio}`);
      ctx.fillText(extraItems.join('  '), centerX, y);
      y += mmToPx(LABEL_LAYOUT.lineHeight.compact);
    }

    return y;
  }

  /**
   * 绘制保质期小节
   */
  private drawShelfLifeSection(
    ctx: CanvasRenderingContext2D,
    shelfLife: string,
    startY: number,
    centerX: number,
    canvasWidth: number,
  ): number {
    let y = startY;

    // 标题
    ctx.font = `bold ${mmToPx(LABEL_LAYOUT.fontSize.sectionTitle)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('— 储存方式 —', centerX, y);
    y += mmToPx(LABEL_LAYOUT.lineHeight.compact);

    // 内容
    ctx.font = `${mmToPx(LABEL_LAYOUT.fontSize.body)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;
    ctx.fillText('● ' + shelfLife, centerX, y);
    y += mmToPx(LABEL_LAYOUT.lineHeight.compact);

    return y;
  }

  /**
   * 绘制烹饪建议小节
   */
  private drawCookingSection(
    ctx: CanvasRenderingContext2D,
    cookingMethod: NonNullable<Exclude<LabelDataDto['cookingMethod'], string>>,
    startY: number,
    centerX: number,
    maxWidth: number,
    canvasWidth: number,
  ): number {
    let y = startY;

    // 标题
    ctx.font = `bold ${mmToPx(LABEL_LAYOUT.fontSize.sectionTitle)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('— 烹饪建议 —', centerX, y);
    y += mmToPx(LABEL_LAYOUT.lineHeight.compact);

    // 烹饪方法
    ctx.font = `${mmToPx(LABEL_LAYOUT.fontSize.body)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;

    const methods = [
      { name: '蒸', time: cookingMethod.steam || '10-12分钟', desc: '无需提前解冻' },
      { name: '炖', time: cookingMethod.stew || '10-12分钟', desc: '需解冻加水' },
      { name: '低温慢煮', time: cookingMethod.sousvide || '45分钟', desc: '65℃' },
    ];

    for (const method of methods) {
      ctx.fillText(`${method.name}: ${method.time} (${method.desc})`, centerX, y);
      y += mmToPx(LABEL_LAYOUT.lineHeight.compact);
    }

    return y;
  }

  /**
   * 文本换行
   */
  private wrapText(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
    const lines: string[] = [];

    // 按顿号分割
    const items = text.split('、');
    let currentLine = '';

    for (const item of items) {
      const testLine = currentLine ? currentLine + '、' + item : item;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = item;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }
}
