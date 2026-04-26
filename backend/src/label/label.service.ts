import { BadRequestException, Injectable } from '@nestjs/common';
import {
  createCanvas,
  Canvas,
  CanvasRenderingContext2D,
  registerFont,
} from 'canvas';
import { LabelDataDto } from './dto/label-data.dto';
import * as path from 'path';

/**
 * 标签布局配置（毫米单位）
 */
const LABEL_LAYOUT = {
  canvas: {
    width: 70, // mm
    height: 100, // mm
  },
  margin: {
    top: 3,
    bottom: 4,
    left: 4.5,
    right: 4.5,
  },
  fontSize: {
    brand: 2.1,
    title: 5.0,
    meta: 2.4,
    sectionTitle: 3.1,
    body: 2.5,
    compactBody: 2.25,
    small: 2.25,
    brandBottom: 2.5,
  },
  lineHeight: {
    compact: 3.0,
    tight: 2.6,
    normal: 4.0,
    loose: 4.4,
  },
  spacing: {
    sectionGap: 1.8,
    blockInternal: 0.8,
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

type LabelRenderMode = 'regular' | 'compact';

const LABEL_CONTENT_OVERFLOW_MESSAGE =
  '标签内容超出：无法在70×100mm标签内完整显示所有原料信息，请减少标签内容或改用更大标签。';

type ParsedIngredientLabel = {
  nameText: string;
  detailText: string;
};

type IngredientGridCellLayout = {
  nameLines: string[];
  detailText: string;
  detailOnOwnLine: boolean;
  lineCount: number;
};

type IngredientGridRowLayout = {
  cells: IngredientGridCellLayout[];
  lineCount: number;
};

type IngredientGridLayout = {
  columns: number;
  colWidth: number;
  textWidth: number;
  fontSize: number;
  lineHeight: number;
  rowGap: number;
  bodyHeight: number;
  rows: IngredientGridRowLayout[];
};

@Injectable()
export class LabelService {
  private regularFontPath: string;
  private boldFontPath: string;

  constructor() {
    // 注册中文字体
    // 开发模式: __dirname = dist/src/label, 字体在 src/assets/fonts
    // 生产模式: __dirname = dist/src/label, 字体在 dist/assets/fonts (通过copy-fonts.js复制)
    let fontsPath: string;

    // 检查dist/assets/fonts是否存在(生产模式)
    const distFontsPath = path.join(__dirname, '../../assets/fonts');
    const srcFontsPath = path.join(__dirname, '../../src/assets/fonts');

    const fs = require('fs');
    if (fs.existsSync(distFontsPath)) {
      fontsPath = distFontsPath;
      console.log('[LabelService] Using dist fonts path:', fontsPath);
    } else if (fs.existsSync(srcFontsPath)) {
      fontsPath = srcFontsPath;
      console.log('[LabelService] Using src fonts path:', fontsPath);
    } else {
      // 如果都不存在,尝试创建dist/assets/fonts目录并复制字体
      fontsPath = distFontsPath;
      console.log(
        '[LabelService] Neither dist nor src fonts found, will use:',
        fontsPath,
      );
    }

    this.regularFontPath = path.join(fontsPath, 'SourceHanSansSC-Regular.otf');
    this.boldFontPath = path.join(fontsPath, 'SourceHanSansSC-Bold.otf');

    console.log('[LabelService] __dirname:', __dirname);
    console.log('[LabelService] fontsPath:', fontsPath);
    console.log('[LabelService] regularFontPath:', this.regularFontPath);
    console.log('[LabelService] boldFontPath:', this.boldFontPath);

    // 检查字体文件是否存在
    if (!fs.existsSync(this.regularFontPath)) {
      console.error(
        '[LabelService] Regular font file NOT found:',
        this.regularFontPath,
      );
      throw new Error(`Font file not found: ${this.regularFontPath}`);
    } else {
      console.log(
        '[LabelService] Regular font file found, size:',
        fs.statSync(this.regularFontPath).size,
        'bytes',
      );
    }

    if (!fs.existsSync(this.boldFontPath)) {
      console.error(
        '[LabelService] Bold font file NOT found:',
        this.boldFontPath,
      );
      throw new Error(`Font file not found: ${this.boldFontPath}`);
    } else {
      console.log(
        '[LabelService] Bold font file found, size:',
        fs.statSync(this.boldFontPath).size,
        'bytes',
      );
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
    const ingredientItems = this.buildIngredientItems(labelData);
    const mode = this.resolveLabelRenderMode(ingredientItems);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000000';

    const centerX = width / 2;
    const contentLeft = mmToPx(LABEL_LAYOUT.margin.left);
    const contentRight = width - mmToPx(LABEL_LAYOUT.margin.right);
    const contentWidth = contentRight - contentLeft;
    let y = mmToPx(LABEL_LAYOUT.margin.top);

    y = this.drawLabelHeader(ctx, labelData, y, centerX, contentLeft, contentRight);
    const metaLineLayout = this.getMetaLineLayout();
    y = this.drawMetaLine(
      ctx,
      labelData,
      y + mmToPx(metaLineLayout.topGapMm),
      contentLeft,
      contentWidth,
    );

    y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);
    const ingredientLayout = this.resolveIngredientGridLayout(
      ctx,
      labelData,
      ingredientItems,
      y,
      contentWidth,
      mode,
      height - mmToPx(LABEL_LAYOUT.margin.bottom),
    );
    y = this.drawIngredientGrid(ctx, ingredientLayout, y, contentLeft);

    y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

    if (labelData.nutritionAnalysis) {
      y = this.drawCompleteNutritionSection(
        ctx,
        labelData.nutritionAnalysis,
        y,
        contentLeft,
        contentWidth,
        mode,
      );
      y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);
    }

    this.drawStorageSection(ctx, y, contentLeft, contentWidth);

    const buffer = canvas.toBuffer('image/png');
    return buffer.toString('base64');
  }

  private resolveLabelRenderMode(ingredientItems: string[]): LabelRenderMode {
    return ingredientItems.length > 16 ? 'compact' : 'regular';
  }

  private drawLabelHeader(
    ctx: CanvasRenderingContext2D,
    labelData: LabelDataDto,
    startY: number,
    centerX: number,
    contentLeft: number,
    contentRight: number,
  ): number {
    let y = startY;

    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.font = `bold ${mmToPx(LABEL_LAYOUT.fontSize.brand)}px "Chinese-Bold"`;
    ctx.fillText(labelData.brandName, centerX, y + mmToPx(1.8));

    y += mmToPx(4.4);
    ctx.font = `bold ${mmToPx(LABEL_LAYOUT.fontSize.title)}px "Chinese-Bold"`;
    ctx.fillText(labelData.recipeName, centerX, y + mmToPx(4.4));

    y += mmToPx(6.2);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(contentLeft, y);
    ctx.lineTo(contentRight, y);
    ctx.stroke();

    return y + mmToPx(0.6);
  }

  private drawMetaBox(
    ctx: CanvasRenderingContext2D,
    labelData: LabelDataDto,
    startY: number,
    left: number,
    width: number,
  ): number {
    const rowHeight = mmToPx(3.1);
    const boxHeight = rowHeight * 2 + mmToPx(1.6);
    const top = startY;
    const colWidth = width / 2;

    ctx.strokeStyle = '#C8C8C8';
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, width, boxHeight);
    ctx.fillStyle = '#222222';
    ctx.font = `${mmToPx(LABEL_LAYOUT.fontSize.meta)}px "Chinese"`;
    ctx.textAlign = 'left';

    const packageText = this.buildPackageSummary(labelData);
    const rows = [
      [`定制：${labelData.dogName}`, `制作：${labelData.productionTime}`],
      [packageText, `净重：${this.getTotalWeight(labelData)}g`],
    ];

    rows.forEach((row, rowIndex) => {
      row.forEach((text, colIndex) => {
        const x = left + colIndex * colWidth + mmToPx(1.4);
        const y = top + mmToPx(2.6) + rowIndex * rowHeight;
        ctx.fillText(this.clipText(ctx, text, colWidth - mmToPx(2)), x, y);
      });
    });

    return top + boxHeight;
  }

  private drawMetaLine(
    ctx: CanvasRenderingContext2D,
    labelData: LabelDataDto,
    startY: number,
    left: number,
    width: number,
  ): number {
    const top = startY;
    const layout = this.getMetaLineLayout();
    const height = mmToPx(layout.heightMm);

    ctx.fillStyle = '#222222';
    ctx.font = `${mmToPx(LABEL_LAYOUT.fontSize.meta)}px "Chinese"`;
    ctx.textAlign = 'center';
    ctx.fillText(
      this.clipText(ctx, this.buildMetaLine(labelData), width - mmToPx(1)),
      left + width / 2,
      top + mmToPx(2.4),
    );

    return top + height;
  }

  private getMetaLineLayout(): {
    drawRules: boolean;
    topGapMm: number;
    heightMm: number;
  } {
    return {
      drawRules: false,
      topGapMm: 0.2,
      heightMm: 3.5,
    };
  }

  private drawIngredientGrid(
    ctx: CanvasRenderingContext2D,
    layout: IngredientGridLayout,
    startY: number,
    left: number,
  ): number {
    let y = startY;
    y = this.drawSectionTitle(
      ctx,
      '原料表',
      y,
      left,
      layout.colWidth * layout.columns,
    );

    ctx.font = `${mmToPx(layout.fontSize)}px "Chinese"`;
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'left';

    let offsetY = 0;
    layout.rows.forEach((row) => {
      row.cells.forEach((cell, colIndex) => {
        const x = left + colIndex * layout.colWidth;
        const itemY = y + offsetY;
        this.drawIngredientGridCell(ctx, cell, x, itemY, layout);
      });
      offsetY += row.lineCount * mmToPx(layout.lineHeight) + layout.rowGap;
    });

    return y + layout.bodyHeight;
  }

  private resolveIngredientGridLayout(
    ctx: CanvasRenderingContext2D,
    labelData: LabelDataDto,
    items: string[],
    ingredientStartY: number,
    width: number,
    mode: LabelRenderMode,
    bottomLimit: number,
  ): IngredientGridLayout {
    const candidateColumns = this.getIngredientGridColumnCandidates();

    for (const columns of candidateColumns) {
      const layout = this.buildIngredientGridLayout(
        ctx,
        items,
        width,
        mode,
        columns,
      );
      const finalY = this.measureLabelFinalY(
        labelData,
        ingredientStartY,
        layout,
        mode,
      );

      if (finalY <= bottomLimit) {
        return layout;
      }
    }

    throw new BadRequestException(LABEL_CONTENT_OVERFLOW_MESSAGE);
  }

  private getIngredientGridColumnCandidates(): number[] {
    return [3, 2, 1];
  }

  private buildIngredientGridLayout(
    ctx: CanvasRenderingContext2D,
    items: string[],
    width: number,
    mode: LabelRenderMode,
    columns: number,
  ): IngredientGridLayout {
    const gridConfig = this.getIngredientGridConfig(mode);
    const colWidth = width / columns;
    const textWidth = colWidth - mmToPx(1.2);
    const rowGap = mmToPx(0.25);
    const lineHeightPx = mmToPx(gridConfig.lineHeight);

    ctx.font = `${mmToPx(gridConfig.fontSize)}px "Chinese"`;

    const cells = items.map((item) =>
      this.buildIngredientGridCellLayout(ctx, item, textWidth),
    );
    const rows: IngredientGridRowLayout[] = [];

    for (let index = 0; index < cells.length; index += columns) {
      const rowCells = cells.slice(index, index + columns);
      rows.push({
        cells: rowCells,
        lineCount: Math.max(...rowCells.map((cell) => cell.lineCount), 1),
      });
    }

    const bodyHeight = rows.reduce((sum, row, index) => {
      const gap = index === rows.length - 1 ? 0 : rowGap;
      return sum + row.lineCount * lineHeightPx + gap;
    }, 0);

    return {
      columns,
      colWidth,
      textWidth,
      fontSize: gridConfig.fontSize,
      lineHeight: gridConfig.lineHeight,
      rowGap,
      bodyHeight,
      rows,
    };
  }

  private buildIngredientGridCellLayout(
    ctx: CanvasRenderingContext2D,
    item: string,
    maxWidth: number,
  ): IngredientGridCellLayout {
    const parsed = this.parseIngredientLabel(item);
    const nameLines = this.wrapTextByWidth(ctx, parsed.nameText, maxWidth);

    if (!parsed.detailText) {
      return {
        nameLines,
        detailText: '',
        detailOnOwnLine: false,
        lineCount: Math.max(nameLines.length, 1),
      };
    }

    const lastLine = nameLines[nameLines.length - 1] || '';
    const detailWidth = ctx.measureText(parsed.detailText).width;
    const lastLineWidth = ctx.measureText(lastLine).width;
    const detailGap = mmToPx(1);
    const detailOnOwnLine =
      lastLineWidth + detailGap + detailWidth > maxWidth;

    return {
      nameLines,
      detailText: parsed.detailText,
      detailOnOwnLine,
      lineCount: nameLines.length + (detailOnOwnLine ? 1 : 0),
    };
  }

  private drawIngredientGridCell(
    ctx: CanvasRenderingContext2D,
    cell: IngredientGridCellLayout,
    x: number,
    y: number,
    layout: IngredientGridLayout,
  ): void {
    const lineHeightPx = mmToPx(layout.lineHeight);

    ctx.textAlign = 'left';
    cell.nameLines.forEach((line, index) => {
      ctx.fillText(line, x, y + index * lineHeightPx);
    });

    if (!cell.detailText) {
      return;
    }

    const detailLineIndex = cell.detailOnOwnLine
      ? cell.nameLines.length
      : Math.max(cell.nameLines.length - 1, 0);

    ctx.textAlign = 'right';
    ctx.fillText(
      cell.detailText,
      x + layout.textWidth,
      y + detailLineIndex * lineHeightPx,
    );
    ctx.textAlign = 'left';
  }

  private measureLabelFinalY(
    labelData: LabelDataDto,
    ingredientStartY: number,
    ingredientLayout: IngredientGridLayout,
    mode: LabelRenderMode,
  ): number {
    let y =
      ingredientStartY +
      this.getSectionTitleHeight() +
      ingredientLayout.bodyHeight;

    y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

    if (labelData.nutritionAnalysis) {
      y += this.measureCompleteNutritionSection(
        labelData.nutritionAnalysis,
        mode,
      );
      y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);
    }

    y += this.measureStorageSection();

    return y;
  }

  private measureCompleteNutritionSection(
    nutrition: NonNullable<LabelDataDto['nutritionAnalysis']>,
    mode: LabelRenderMode,
  ): number {
    const rows = this.buildCompleteNutritionRows(nutrition);
    const rowHeight = mmToPx(mode === 'compact' ? 2.65 : 2.85);
    return this.getSectionTitleHeight() + rows.length * rowHeight;
  }

  private measureStorageSection(): number {
    const layout = this.getStorageSectionLayout();
    return (
      mmToPx(layout.topGapMm) +
      this.getSectionTitleHeight() +
      mmToPx(6.8)
    );
  }

  private getSectionTitleHeight(): number {
    return mmToPx(5.5);
  }

  private drawCompleteNutritionSection(
    ctx: CanvasRenderingContext2D,
    nutrition: NonNullable<LabelDataDto['nutritionAnalysis']>,
    startY: number,
    left: number,
    width: number,
    mode: LabelRenderMode,
  ): number {
    let y = this.drawSectionTitle(ctx, '营养成分', startY, left, width);
    const rows = this.buildCompleteNutritionRows(nutrition);
    const fontSize = mode === 'compact'
      ? LABEL_LAYOUT.fontSize.small
      : LABEL_LAYOUT.fontSize.meta;
    const rowHeight = mmToPx(mode === 'compact' ? 2.65 : 2.85);

    ctx.font = `${mmToPx(fontSize)}px "Chinese"`;
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'left';

    const colWidth = width / this.getNutritionGridColumnCount();
    rows.forEach((row) => {
      row.forEach((text, colIndex) => {
        const x = left + colIndex * colWidth;
        ctx.fillText(this.clipText(ctx, text, colWidth - mmToPx(1.2)), x, y);
      });
      y += rowHeight;
    });

    return y;
  }

  private getNutritionGridColumnCount(): number {
    return 3;
  }

  private drawStorageSection(
    ctx: CanvasRenderingContext2D,
    startY: number,
    left: number,
    width: number,
  ): number {
    const layout = this.getStorageSectionLayout();
    const top = startY + mmToPx(layout.topGapMm);
    const colWidth = width / 2;
    const contentY = this.drawSectionTitle(
      ctx,
      layout.title,
      top,
      left,
      width,
    );

    ctx.fillStyle = '#111111';
    ctx.font = `bold ${mmToPx(LABEL_LAYOUT.fontSize.small)}px "Chinese-Bold"`;
    ctx.textAlign = 'left';
    ctx.fillText('冷冻', left, contentY);
    ctx.fillText('冷藏', left + colWidth, contentY);

    ctx.font = `${mmToPx(LABEL_LAYOUT.fontSize.small)}px "Chinese"`;
    ctx.fillText('-18℃保存6个月', left, contentY + mmToPx(3.4));
    ctx.fillText('0-5℃保存3天', left + colWidth, contentY + mmToPx(3.4));

    return contentY + mmToPx(6.8);
  }

  private drawSectionTitle(
    ctx: CanvasRenderingContext2D,
    title: string,
    startY: number,
    left: number,
    width: number,
  ): number {
    const centerX = left + width / 2;
    const titleY = startY + mmToPx(2.5);

    ctx.font = `bold ${mmToPx(LABEL_LAYOUT.fontSize.sectionTitle)}px "Chinese-Bold"`;
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.fillText(title, centerX, titleY);

    const textWidth = ctx.measureText(title).width;
    const lineY = titleY - mmToPx(0.8);
    const gap = mmToPx(3);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, lineY);
    ctx.lineTo(centerX - textWidth / 2 - gap, lineY);
    ctx.moveTo(centerX + textWidth / 2 + gap, lineY);
    ctx.lineTo(left + width, lineY);
    ctx.stroke();

    return startY + mmToPx(5.5);
  }

  private getIngredientGridConfig(
    mode: LabelRenderMode,
  ): { columns: number; fontSize: number; lineHeight: number } {
    if (mode === 'compact') {
      return {
        columns: 3,
        fontSize: LABEL_LAYOUT.fontSize.compactBody,
        lineHeight: 2.6,
      };
    }

    return {
      columns: 3,
      fontSize: LABEL_LAYOUT.fontSize.body,
      lineHeight: LABEL_LAYOUT.lineHeight.compact,
    };
  }

  private buildIngredientItems(labelData: LabelDataDto): string[] {
    return [labelData.foodIngredients, labelData.supplementIngredients]
      .filter(Boolean)
      .flatMap((text) => text.split('、'))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private formatIngredientLabel(item: string): string {
    const supplement = item.match(/^(.+?)（(.+?)）$/);
    if (supplement) {
      return `${supplement[1]} ${supplement[2]}`;
    }
    const ratio = item.match(/^(.+?)(\d+(?:\.\d+)?%)$/);
    if (ratio) {
      return `${ratio[1]} ${Number(ratio[2].replace('%', '')).toFixed(1)}%`;
    }

    const amount = item.match(/^(.+?)(\d+(?:\.\d+)?(?:g|kg|mg|ml|mL|L|平勺|粒|片|颗|枚|袋|盒|份|滴|IU|μg|ug|mcg))$/i);
    if (amount) {
      return `${amount[1]} ${amount[2]}`;
    }

    return item;
  }

  private parseIngredientLabel(item: string): ParsedIngredientLabel {
    const supplement = item.match(/^(.+?)（(.+?)）$/);
    if (supplement) {
      return {
        nameText: supplement[1].trim(),
        detailText: supplement[2].trim(),
      };
    }

    const ratio = item.match(/^(.+?)(\d+(?:\.\d+)?%)$/);
    if (ratio) {
      return {
        nameText: ratio[1].trim(),
        detailText: `${Number(ratio[2].replace('%', '')).toFixed(1)}%`,
      };
    }

    const amount = item.match(/^(.+?)(\d+(?:\.\d+)?(?:g|kg|mg|ml|mL|L|平勺|粒|片|颗|枚|袋|盒|份|滴|IU|μg|ug|mcg))$/i);
    if (amount) {
      return {
        nameText: amount[1].trim(),
        detailText: amount[2].trim(),
      };
    }

    return {
      nameText: item.trim(),
      detailText: '',
    };
  }

  private wrapTextByWidth(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] {
    const chars = Array.from(text);
    const lines: string[] = [];
    let currentLine = '';

    chars.forEach((char) => {
      const nextLine = currentLine + char;
      if (currentLine && ctx.measureText(nextLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = nextLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  }

  private buildMetaLine(labelData: LabelDataDto): string {
    return [
      labelData.dogName,
      labelData.productionTime,
      this.buildPackageSummary(labelData).replace(/^分装：/, ''),
      `净重${this.getTotalWeight(labelData)}g`,
    ]
      .filter(Boolean)
      .join('｜');
  }

  private buildCompleteNutritionRows(
    nutrition?: LabelDataDto['nutritionAnalysis'],
  ): string[][] {
    if (!nutrition) {
      return [];
    }

    const items = [
      nutrition.proteinPercent !== undefined
        ? `蛋白质 ${nutrition.proteinPercent.toFixed(1)}%`
        : null,
      nutrition.fatPercent !== undefined
        ? `脂肪 ${nutrition.fatPercent.toFixed(1)}%`
        : null,
      nutrition.ashPercent !== undefined
        ? `灰分 ${nutrition.ashPercent.toFixed(1)}%`
        : null,
      nutrition.moisturePercent !== undefined
        ? `水分 ${nutrition.moisturePercent.toFixed(1)}%`
        : null,
      nutrition.crudeFiberPercent !== undefined
        ? `纤维 ${nutrition.crudeFiberPercent.toFixed(1)}%`
        : null,
      nutrition.carbohydratePercent !== undefined
        ? `碳水 ${nutrition.carbohydratePercent.toFixed(1)}%`
        : null,
      nutrition.energyDensityKcalPerKg
        ? `能量 ${nutrition.energyDensityKcalPerKg}kcal/kg`
        : null,
      nutrition.calciumPhosphorusRatio
        ? `钙磷比 ${nutrition.calciumPhosphorusRatio}`
        : null,
    ].filter((item): item is string => Boolean(item));

    const primaryItems = items.slice(0, 6);
    const rows: string[][] = [];
    for (let index = 0; index < primaryItems.length; index += 3) {
      rows.push(primaryItems.slice(index, index + 3));
    }
    if (items.length > 6) {
      rows.push(items.slice(6));
    }

    return rows;
  }

  private getStorageFooterTitle(): string {
    return '保存方式';
  }

  private getStorageSectionLayout(): {
    position: 'flow';
    title: string;
    topGapMm: number;
  } {
    return {
      position: 'flow',
      title: this.getStorageFooterTitle(),
      topGapMm: 0,
    };
  }

  private buildPackageSummary(labelData: LabelDataDto): string {
    const packagePlanRows = this.normalizePackagePlanRows(labelData.packagePlan);
    if (packagePlanRows.length === 0) {
      return `分装：${labelData.weightPerPack}g×${labelData.packageCount}袋`;
    }

    const planText = packagePlanRows
      .map((row) => `${row.packageSpecG}g×${row.packageCount}袋`)
      .join('、');
    return `分装：${planText}`;
  }

  private getTotalWeight(labelData: LabelDataDto): number {
    const packagePlanRows = this.normalizePackagePlanRows(labelData.packagePlan);
    if (packagePlanRows.length > 0) {
      return this.getPackagePlanTotalWeight(packagePlanRows);
    }
    return labelData.totalWeight;
  }

  private clipText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string {
    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }

    let next = text;
    while (next.length > 1 && ctx.measureText(`${next}...`).width > maxWidth) {
      next = next.slice(0, -1);
    }
    return `${next}...`;
  }

  /**
   * 绘制分隔线
   */
  private drawSeparatorLine(
    ctx: CanvasRenderingContext2D,
    y: number,
    canvasWidth: number,
  ): void {
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

    const allIngredients = [foodIngredients, supplementIngredients]
      .filter(Boolean)
      .join('、');
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
    if (nutrition.proteinPercent !== undefined)
      items.push(`蛋白质 ${nutrition.proteinPercent}%`);
    if (nutrition.fatPercent !== undefined)
      items.push(`脂肪 ${nutrition.fatPercent}%`);
    if (nutrition.ashPercent !== undefined)
      items.push(`灰分 ${nutrition.ashPercent}%`);
    if (nutrition.moisturePercent !== undefined)
      items.push(`水分 ${nutrition.moisturePercent}%`);
    if (nutrition.crudeFiberPercent !== undefined)
      items.push(`纤维 ${nutrition.crudeFiberPercent}%`);
    if (nutrition.carbohydratePercent !== undefined)
      items.push(`碳水 ${nutrition.carbohydratePercent}%`);

    // 每行4项
    for (let i = 0; i < items.length; i += 4) {
      const lineItems = items.slice(i, i + 4);
      ctx.fillText(lineItems.join('  '), centerX, y);
      y += mmToPx(LABEL_LAYOUT.lineHeight.compact);
    }

    // 能量和钙磷比
    if (nutrition.energyDensityKcalPerKg || nutrition.calciumPhosphorusRatio) {
      const extraItems: string[] = [];
      if (nutrition.energyDensityKcalPerKg)
        extraItems.push(`能量 ${nutrition.energyDensityKcalPerKg}kcal/kg`);
      if (nutrition.calciumPhosphorusRatio)
        extraItems.push(`钙磷比 ${nutrition.calciumPhosphorusRatio}`);
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
    ctx.fillText('— 储存&保质期 —', centerX, y);
    y += mmToPx(LABEL_LAYOUT.lineHeight.compact);

    // 内容 - 两行显示
    ctx.font = `${mmToPx(LABEL_LAYOUT.fontSize.body)}px "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;
    ctx.fillText('● 冷冻保存，保质期6个月', centerX, y);
    y += mmToPx(LABEL_LAYOUT.lineHeight.compact);
    ctx.fillText('● 0-5℃冷藏保存，保质期3天', centerX, y);
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
      {
        name: '蒸',
        time: cookingMethod.steam || '10-12分钟',
        desc: '无需提前解冻',
      },
      {
        name: '炖',
        time: cookingMethod.stew || '10-12分钟',
        desc: '需解冻加水',
      },
      {
        name: '低温慢煮',
        time: cookingMethod.sousvide || '45分钟',
        desc: '65℃',
      },
    ];

    for (const method of methods) {
      ctx.fillText(
        `${method.name}: ${method.time} (${method.desc})`,
        centerX,
        y,
      );
      y += mmToPx(LABEL_LAYOUT.lineHeight.compact);
    }

    return y;
  }

  /**
   * 文本换行
   */
  private wrapText(
    text: string,
    maxWidth: number,
    ctx: CanvasRenderingContext2D,
  ): string[] {
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

  private normalizePackagePlanRows(
    packagePlan?: LabelDataDto['packagePlan'],
  ): Array<{ packageSpecG: number; packageCount: number }> {
    return (packagePlan || [])
      .map((row) => {
        const packageSpecG = Math.floor(Number(row?.packageSpecG));
        const packageCount = Math.floor(Number(row?.packageCount));

        if (
          !Number.isFinite(packageSpecG) ||
          !Number.isFinite(packageCount) ||
          packageSpecG <= 0 ||
          packageCount <= 0
        ) {
          return null;
        }

        return { packageSpecG, packageCount };
      })
      .filter(
        (row): row is { packageSpecG: number; packageCount: number } =>
          row !== null,
      );
  }

  private getPackagePlanTotalWeight(
    packagePlan: Array<{ packageSpecG: number; packageCount: number }>,
  ): number {
    return packagePlan.reduce(
      (sum, row) => sum + row.packageSpecG * row.packageCount,
      0,
    );
  }

  private getOrderInfoLines(
    labelData: LabelDataDto,
    ctx: CanvasRenderingContext2D,
    maxWidth: number,
  ): string[] {
    const packagePlanRows = this.normalizePackagePlanRows(
      labelData.packagePlan,
    );

    if (packagePlanRows.length === 0) {
      return [
        `${labelData.weightPerPack}g/袋 × ${labelData.packageCount}袋 = ${labelData.totalWeight}g`,
      ];
    }

    const planText = packagePlanRows
      .map((row) => `${row.packageSpecG}g×${row.packageCount}袋`)
      .join('、');
    const totalWeight = this.getPackagePlanTotalWeight(packagePlanRows);

    return this.wrapText(
      `分装: ${planText}、总净重${totalWeight}g`,
      maxWidth,
      ctx,
    );
  }
}
