import { Injectable } from '@nestjs/common';
import {
  createCanvas,
  CanvasRenderingContext2D,
  registerFont,
} from 'canvas';
import * as path from 'path';
import { LabelDataDto } from './dto/label-data.dto';

/**
 * 70×100mm 热敏标签排版 V10
 *
 * 与旧 LabelService 的关系：旧的是“原料表 + 营养 + 保存方式”四段式，
 * 新的按 2026-10-30 定稿的 V10 结构重排。两者并存，控制器按开关选择，
 * 出问题可以一行切回旧的。
 *
 * 设计约束：
 * - 所有数值计算（净含量合计、分装明细、烹饪时间）都在这里完成，客户端只负责传数据
 * - 最小字号不低于 2.0mm（203dpi 下约 16 点），否则热敏纸会糊
 * - 内容超出可用高度时先压缩行距，再报错，绝不缩到 2.0mm 以下
 */

const DPI = 203;
const MM_TO_PX = DPI / 25.4; // 1mm ≈ 8px

const mm = (value: number): number => Math.round(value * MM_TO_PX);

const CANVAS = { width: 70, height: 100 };
const PAD = { top: 3.2, bottom: 3.2, left: 4, right: 4 };
const CONTENT_W = CANVAS.width - PAD.left - PAD.right;

/** 字号（mm）——下限 2.0 */
const FS = {
  brand: 2.35,
  title: 5.4,
  meta: 2.3,
  metaLabel: 2.2,
  section: 2.6,
  sectionHint: 2.1,
  ingredient: 2.2,
  additive: 2.15,
  value: 2.15,
  warn: 2.35,
  cookHead: 1.95,
  cook: 2.1,
  ban: 2.15,
};

/** 行高倍率 */
const LH = 1.22;

type Spec = { packageSpecG: number; packageCount: number };

type CookingTimes = { steam: string; stew: string; sousvide: string };

type FontScale = typeof FS;

@Injectable()
export class LabelV10Service {
  /** 当前档位的字号（随可用高度自动放大/缩小） */
  private F: FontScale = { ...FS };
  private regularFontPath: string;
  private boldFontPath: string;

  constructor() {
    const fs = require('fs');
    const candidates = [
      path.join(__dirname, '../../assets/fonts'),
      path.join(__dirname, '../../src/assets/fonts'),
    ];
    const fontsPath =
      candidates.find((dir) => fs.existsSync(dir)) ?? candidates[0];

    this.regularFontPath = path.join(fontsPath, 'SourceHanSansSC-Regular.otf');
    this.boldFontPath = path.join(fontsPath, 'SourceHanSansSC-Bold.otf');

    if (!fs.existsSync(this.regularFontPath)) {
      throw new Error(`Font file not found: ${this.regularFontPath}`);
    }
    if (!fs.existsSync(this.boldFontPath)) {
      throw new Error(`Font file not found: ${this.boldFontPath}`);
    }

    registerFont(this.regularFontPath, { family: 'Chinese' });
    registerFont(this.boldFontPath, { family: 'Chinese-Bold' });
  }

  /** 生成标签 PNG 的 base64（不含前缀） */
  generate(labelData: LabelDataDto): string {
    const width = mm(CANVAS.width);
    const height = mm(CANVAS.height);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000000';

    const left = mm(PAD.left);
    const right = mm(CANVAS.width - PAD.right);
    const contentW = right - left;
    const bottomLimit = height - mm(PAD.bottom);

    const foodItems = this.splitItems(labelData.foodIngredients);
    const additiveItems = this.splitItems(labelData.additiveIngredients);
    // 兼容还没升级的客户端：老口径把补剂放在 supplementIngredients 里。
    // V10 没有「补剂」这一段，直接忽略会让补剂从标签上消失，
    // 所以把还没并进原料的补剂补回原料组成（旧版就是这样并排显示的）。
    const legacySupplementItems = this.splitItems(
      labelData.supplementIngredients,
    ).filter((item) => !foodItems.includes(item));
    const ingredientItems =
      legacySupplementItems.length > 0
        ? [...foodItems, ...legacySupplementItems]
        : foodItems;
    const specs = this.normalizeSpecs(labelData);

    // 字号档位：从大到小试，取能放下的最大一档，保证纸张被填满且不溢出
    const scales = [1.14, 1.08, 1.02, 0.97, 0.93];
    for (const scale of scales) {
      this.F = this.scaleFonts(scale);
      for (const lineHeight of [LH, 1.14]) {
        const plan = this.measure(
          ctx,
          labelData,
          ingredientItems,
          additiveItems,
          specs,
          contentW,
          lineHeight,
        );
        if (mm(PAD.top) + plan.height <= bottomLimit) {
          this.draw(
            ctx,
            labelData,
            ingredientItems,
            additiveItems,
            specs,
            { left, contentW, lineHeight },
            plan,
          );
          return canvas.toBuffer('image/png').toString('base64');
        }
      }
    }

    throw new Error(
      '标签内容超出：无法在 70×100mm 内完整显示。请减少原料条目，或改用更大标签。',
    );
  }

  private scaleFonts(scale: number): FontScale {
    const next = { ...FS } as Record<string, number>;
    for (const key of Object.keys(FS)) {
      next[key] = (FS as Record<string, number>)[key] * scale;
    }
    return next as FontScale;
  }

  // ---------------- 数据整理 ----------------

  private splitItems(text?: string): string[] {
    return (text || '')
      .split('、')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeSpecs(labelData: LabelDataDto): Spec[] {
    const rows = (labelData.packagePlan || [])
      .map((row) => ({
        packageSpecG: Math.floor(Number(row?.packageSpecG)),
        packageCount: Math.floor(Number(row?.packageCount)),
      }))
      .filter(
        (row) =>
          Number.isFinite(row.packageSpecG) &&
          Number.isFinite(row.packageCount) &&
          row.packageSpecG > 0 &&
          row.packageCount > 0,
      );

    if (rows.length > 0) {
      return rows;
    }
    return [
      {
        packageSpecG: Math.floor(Number(labelData.weightPerPack) || 0),
        packageCount: Math.floor(Number(labelData.packageCount) || 0),
      },
    ].filter((row) => row.packageSpecG > 0 && row.packageCount > 0);
  }

  /** 净含量：合计 + 各规格明细，例 1144g（208g×4 + 156g×2） */
  private buildNetContent(specs: Spec[]): string {
    if (specs.length === 0) {
      return '—';
    }
    const total = specs.reduce(
      (sum, spec) => sum + spec.packageSpecG * spec.packageCount,
      0,
    );
    const parts = specs
      .map((spec) => `${spec.packageSpecG}g×${spec.packageCount}`)
      .join(' + ');
    return `${total}g（${parts}）`;
  }

  /** 烹饪时间：按每袋实际克重分档 */
  private cookingTimesFor(weightG: number): CookingTimes {
    if (weightG <= 70) {
      return { steam: '8–10 分钟', stew: '8–10 分钟', sousvide: '30 分钟' };
    }
    if (weightG <= 120) {
      return { steam: '10–12 分钟', stew: '10–12 分钟', sousvide: '45 分钟' };
    }
    if (weightG <= 200) {
      return { steam: '12–15 分钟', stew: '12–15 分钟', sousvide: '60 分钟' };
    }
    return { steam: '20–25 分钟', stew: '20–25 分钟', sousvide: '90 分钟' };
  }

  // ---------------- 测量 ----------------

  private measure(
    ctx: CanvasRenderingContext2D,
    labelData: LabelDataDto,
    ingredientItems: string[],
    additiveItems: string[],
    specs: Spec[],
    contentW: number,
    lineHeight: number,
  ) {
    const lh = (fs: number) => mm(fs * lineHeight);

    let h = 0;
    h += mm(this.F.brand * lineHeight);
    h += mm(1.3) + mm(this.F.title * 1.18);
    h += mm(2.2);
    h += 2 * lh(this.F.meta) + mm(0.55);

    // 原料
    h += mm(1.7) + mm(this.F.section) + mm(1.3);
    h +=
      this.layoutIngredientParagraph(ctx, ingredientItems, contentW).length *
      lh(this.F.ingredient);

    // 添加剂
    if (additiveItems.length > 0) {
      h += mm(1.7) + mm(this.F.section) + mm(1.3);
      h +=
        this.packAdditive(ctx, additiveItems, contentW, 0).length *
        lh(this.F.additive);
    }

    // 保证值
    h += mm(1.7) + mm(this.F.section) + mm(1.3);
    h += this.valueRows(labelData).length * lh(this.F.value);

    // 烹饪
    h += mm(1.7) + mm(this.F.section) + mm(1.3);
    const cookingLayouts = specs.map((spec) =>
      this.layoutCookingRow(ctx, spec, contentW),
    );
    // 一行放不下就换行（100g 以上的规格：10–12 分钟 + 低温慢煮 45 分钟会超宽），
    // 不能像以前那样直接判"放不下"——那会让整张标签打不出来。
    if (cookingLayouts.some((layout) => !layout.fits)) {
      return { height: Number.POSITIVE_INFINITY };
    }
    h +=
      cookingLayouts.reduce((sum, layout) => sum + layout.lines.length, 0) *
        lh(this.F.cook) +
      specs.length * mm(0.6);
    h += mm(0.4) + lh(this.F.ban);
    h += mm(1.2) + lh(this.F.warn);

    return { height: h };
  }

  /**
   * 烹饪行排版：`100克/袋  蒸 10–12 分钟  炖 10–12 分钟  低温慢煮 45 分钟`
   * 放不下时按整段换行（续行顶格），而不是缩小到看不清或直接报错。
   */
  private layoutCookingRow(
    ctx: CanvasRenderingContext2D,
    spec: Spec,
    contentW: number,
  ): { lines: string[][]; fits: boolean } {
    const times = this.cookingTimesFor(spec.packageSpecG);
    const label = `${spec.packageSpecG}克/袋`;
    // 蒸和炖用的是同一档时间，合成一项，省一行宽度
    const methods =
      times.steam === times.stew
        ? [`蒸/炖 ${times.steam}`, `低温慢煮 ${times.sousvide}`]
        : [
            `蒸 ${times.steam}`,
            `炖 ${times.stew}`,
            `低温慢煮 ${times.sousvide}`,
          ];
    const gap = mm(2);
    const labelColW = mm(12);

    ctx.font = `bold ${mm(this.F.cook)}px "Chinese-Bold"`;
    const labelWidth = ctx.measureText(label).width;
    const firstLineStart = Math.max(labelColW, labelWidth + gap);

    const lines: string[][] = [[label]];
    let cursor = firstLineStart;
    let fits = true;

    ctx.font = `${mm(this.F.cook)}px "Chinese"`;
    for (const text of methods) {
      const width = ctx.measureText(text).width;
      if (width > contentW) {
        fits = false;
      }
      if (cursor > 0 && cursor + width > contentW) {
        lines.push([text]);
        cursor = width + gap;
      } else {
        lines[lines.length - 1].push(text);
        cursor += width + gap;
      }
    }

    return { lines, fits };
  }

  /** 原料组成：整段排（名称 + 加粗占比），放不下整条换行 */
  private layoutIngredientParagraph(
    ctx: CanvasRenderingContext2D,
    items: string[],
    contentW: number,
  ): Array<Array<{ name: string; detail: string }>> {
    const gap = mm(0.6);
    const separator = '、';
    const lines: Array<Array<{ name: string; detail: string }>> = [[]];
    let cursor = 0;

    for (const item of items) {
      const matched = item.match(/^(.+?)(\d+(?:\.\d+)?%)$/);
      const name = (matched ? matched[1] : item).trim();
      const detail = matched
        ? `${Number(matched[2].replace('%', '')).toFixed(1)}%`
        : '';

      ctx.font = `${mm(this.F.ingredient)}px "Chinese"`;
      const nameWidth = ctx.measureText(name).width;
      ctx.font = `bold ${mm(this.F.ingredient)}px "Chinese-Bold"`;
      const detailWidth = detail ? gap + ctx.measureText(detail).width : 0;
      ctx.font = `${mm(this.F.ingredient)}px "Chinese"`;
      const width = nameWidth + detailWidth + ctx.measureText(separator).width;

      if (cursor > 0 && cursor + width > contentW) {
        lines.push([]);
        cursor = 0;
      }
      lines[lines.length - 1].push({ name, detail });
      cursor += width;
    }

    return lines;
  }

  // ---------------- 绘制 ----------------

  private draw(
    ctx: CanvasRenderingContext2D,
    labelData: LabelDataDto,
    ingredientItems: string[],
    additiveItems: string[],
    specs: Spec[],
    box: { left: number; contentW: number; lineHeight: number },
    _plan: { height: number },
  ) {
    const { left, contentW, lineHeight } = box;
    const right = left + contentW;
    const lh = (fs: number) => mm(fs * lineHeight);
    let y = mm(PAD.top);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // 品牌 + 狗名
    if (labelData.dogName) {
      ctx.font = `bold ${mm(this.F.brand)}px "Chinese-Bold"`;
      ctx.fillText(labelData.dogName, left, y);
    }
    ctx.font = `${mm(this.F.brand)}px "Chinese"`;
    ctx.textAlign = 'right';
    ctx.fillText(labelData.brandName, right, y);
    ctx.textAlign = 'left';
    y += lh(this.F.brand);

    // 食谱名
    y += mm(1.3);
    ctx.font = `bold ${mm(this.F.title)}px "Chinese-Bold"`;
    ctx.fillText(labelData.recipeName, left, y);
    y += mm(this.F.title * 1.18);

    // 食谱标题下不再画分隔线，留白收紧
    y += mm(2.2);

    // 三行元信息
    ctx.textBaseline = 'alphabetic';
    const drawMeta = (label: string, value: string, x: number) => {
      const baseline = y + mm(this.F.meta * 0.82);
      ctx.font = `${mm(this.F.metaLabel)}px "Chinese"`;
      ctx.fillStyle = '#5A5A5A';
      ctx.fillText(label, x, baseline);
      const labelW = ctx.measureText(label).width + mm(1);
      ctx.font = `bold ${mm(this.F.meta)}px "Chinese-Bold"`;
      ctx.fillStyle = '#111111';
      ctx.fillText(value, x + labelW, baseline);
    };

    // 净含量独占一行（多规格时较长），日期与保质期并排一行
    drawMeta('净含量', this.buildNetContent(specs), left);
    y += lh(this.F.meta) + mm(0.55);
    drawMeta('生产日期', this.formatDate(labelData.productionTime), left);
    drawMeta('保质期', this.buildShelfLife(labelData), left + contentW / 2);
    y += lh(this.F.meta);
    ctx.textBaseline = 'top';
    y -= mm(0.55);

    // 原料组成
    y = this.drawSection(
      ctx,
      '原料组成',
      '',
      y,
      left,
      contentW,
      lineHeight,
    );
    const ingredientLines = this.layoutIngredientParagraph(
      ctx,
      ingredientItems,
      contentW,
    );
    const pctGap = mm(0.6);
    let drawnTokens = 0;
    const totalTokens = ingredientLines.reduce(
      (count, line) => count + line.length,
      0,
    );
    // 用基线对齐：正体名称和加粗数字的字面高度不同，按"顶部"对齐会让占比高/低半个像素
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${mm(this.F.ingredient)}px "Chinese"`;
    const baselineOffset = ctx.measureText('国').actualBoundingBoxAscent;
    ingredientLines.forEach((tokens, lineIndex) => {
      let x = left;
      const lineY =
        y + lineIndex * lh(this.F.ingredient) + baselineOffset;
      tokens.forEach((token) => {
        drawnTokens += 1;
        ctx.fillStyle = '#111111';
        ctx.font = `${mm(this.F.ingredient)}px "Chinese"`;
        ctx.fillText(token.name, x, lineY);
        x += ctx.measureText(token.name).width;
        if (token.detail) {
          ctx.font = `bold ${mm(this.F.ingredient)}px "Chinese-Bold"`;
          ctx.fillText(token.detail, x + pctGap, lineY);
          x += pctGap + ctx.measureText(token.detail).width;
        }
        if (drawnTokens < totalTokens) {
          ctx.font = `${mm(this.F.ingredient)}px "Chinese"`;
          ctx.fillText('、', x, lineY);
          x += ctx.measureText('、').width;
        }
      });
    });
    ctx.textBaseline = 'top';
    y += ingredientLines.length * lh(this.F.ingredient);

    // 添加剂组成：和其余三个一样，单独一行标题，字号统一
    if (additiveItems.length > 0) {
      y = this.drawSection(
        ctx,
        '添加剂组成',
        '',
        y,
        left,
        contentW,
        lineHeight,
      );
      ctx.font = `${mm(this.F.additive)}px "Chinese"`;
      ctx.fillStyle = '#111111';
      const addLines = this.packAdditive(ctx, additiveItems, contentW, 0);
      addLines.forEach((line, index) => {
        ctx.fillText(line, left, y + index * lh(this.F.additive));
      });
      y += addLines.length * lh(this.F.additive);
    }

    // 保证值
    y = this.drawSection(
      ctx,
      '产品成分分析保证值',
      '',
      y,
      left,
      contentW,
      lineHeight,
    );
    const valueRows = this.valueRows(labelData);
    const valueColW = contentW / 3;
    valueRows.forEach((row, rowIndex) => {
      row.forEach((text, colIndex) => {
        ctx.font = `${mm(this.F.value)}px "Chinese"`;
        ctx.fillStyle = '#111111';
        ctx.fillText(text, left + colIndex * valueColW, y);
      });
      y += lh(this.F.value);
    });

    // 烹饪说明
    y = this.drawSection(
      ctx,
      '烹饪说明',
      '按袋规格',
      y,
      left,
      contentW,
      lineHeight,
    );
    const labelColW = mm(12);
    const methodsGap = mm(2);

    specs.forEach((spec) => {
      const layout = this.layoutCookingRow(ctx, spec, contentW);
      layout.lines.forEach((line, lineIndex) => {
        let x = left;
        let pieces = line;
        if (lineIndex === 0) {
          ctx.font = `bold ${mm(this.F.cook)}px "Chinese-Bold"`;
          ctx.fillStyle = '#111111';
          ctx.fillText(line[0], left, y);
          x = left + Math.max(labelColW, ctx.measureText(line[0]).width + methodsGap);
          pieces = line.slice(1);
        }
        ctx.font = `${mm(this.F.cook)}px "Chinese"`;
        for (const text of pieces) {
          ctx.fillText(text, x, y);
          x += ctx.measureText(text).width + methodsGap;
        }
        y += lh(this.F.cook);
      });
      y += mm(0.6);
    });

    y += mm(0.4);
    ctx.font = `${mm(this.F.ban)}px "Chinese"`;
    ctx.fillStyle = '#111111';
    ctx.fillText('不建议微波、煎、炒等高温烹饪方式。', left, y);
    y += lh(this.F.ban) + mm(1.2);

    // 生食警示放在板块最下方
    ctx.font = `bold ${mm(this.F.warn)}px "Chinese-Bold"`;
    ctx.fillStyle = '#111111';
    const warnLines = this.wrapByWidth(
      ctx,
      '本产品为生状态鲜食，必须要烹饪后才可饲喂！',
      contentW,
    );
    warnLines.forEach((line, index) => {
      ctx.fillText(line, left, y + index * lh(this.F.warn));
    });
  }

  private drawSection(
    ctx: CanvasRenderingContext2D,
    title: string,
    hint: string,
    y: number,
    left: number,
    contentW: number,
    lineHeight: number,
  ): number {
    const top = y + mm(1.7);
    ctx.font = `bold ${mm(this.F.section)}px "Chinese-Bold"`;
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'left';
    ctx.fillText(title, left, top);

    if (hint) {
      ctx.font = `${mm(this.F.sectionHint)}px "Chinese"`;
      ctx.fillStyle = '#666666';
      ctx.textAlign = 'right';
      ctx.fillText(hint, left + contentW, top + mm(0.35));
      ctx.textAlign = 'left';
    }

    return top + mm(this.F.section) + mm(1.3);
  }

  // ---------------- 文本工具 ----------------

  private wrapByWidth(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] {
    const lines: string[] = [];
    let current = '';
    for (const ch of Array.from(text)) {
      const next = current + ch;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = ch;
      } else {
        current = next;
      }
    }
    if (current) {
      lines.push(current);
    }
    return lines.length > 0 ? lines : [''];
  }

  /**
   * 添加剂换行：首行从「添加剂组成：」之后开始，续行回到左边距整行排。
   * 这样续行能用满整行宽度，条目多时省下一两行。
   */
  private packAdditive(
    ctx: CanvasRenderingContext2D,
    items: string[],
    contentW: number,
    prefixW: number,
  ): string[] {
    ctx.font = `${mm(this.F.additive)}px "Chinese"`;
    const lines: string[] = [];
    let current = '';
    let firstLine = true;

    for (const item of items) {
      const limit = firstLine ? contentW - prefixW : contentW;
      const candidate = current ? `${current}、${item}` : item;
      if (current && ctx.measureText(candidate).width > limit) {
        lines.push(current);
        current = item;
        firstLine = false;
      } else {
        current = candidate;
      }
    }
    if (current) {
      lines.push(current);
    }
    return lines;
  }

  private valueRows(labelData: LabelDataDto): string[][] {
    const nutrition = labelData.nutritionAnalysis;
    if (!nutrition) {
      return [];
    }
    const rows: string[][] = [
      [
        this.fmt('水分', nutrition.moisturePercent, '≤'),
        this.fmt('粗蛋白质', nutrition.proteinPercent, '≥'),
        this.fmt('粗脂肪', nutrition.fatPercent, '≥'),
      ],
      [
        this.fmt('粗纤维', nutrition.crudeFiberPercent, '≤'),
        this.fmt('粗灰分', nutrition.ashPercent, '≤'),
        this.fmt('碳水', nutrition.carbohydratePercent, '≤'),
      ],
    ];
    const energy = nutrition.energyDensityKcalPerKg
      ? `能量密度 ${nutrition.energyDensityKcalPerKg} kcal/kg（计算值）`
      : '';
    if (energy) {
      rows.push([energy, '', '']);
    }
    return rows;
  }

  private fmt(name: string, value: number | undefined, dir: string): string {
    if (value === undefined || value === null) {
      return '';
    }
    return `${name} ${dir}${value.toFixed(1)}%`;
  }

  private formatDate(value?: string): string {
    const text = (value || '').trim();
    const matched = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return matched ? matched[1] : text;
  }

  private buildShelfLife(labelData: LabelDataDto): string {
    const months = Number(labelData.shelfLifeMonths ?? 6);
    const safeMonths = Number.isFinite(months) && months > 0 ? months : 6;
    return `-18℃，${safeMonths}个月`;
  }
}
