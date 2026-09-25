import { Injectable } from '@nestjs/common';
import { CanvasRenderingContext2D, createCanvas, registerFont } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import type { SupplementLabel } from '../application/supplement-shop/supplement-order.service';

/**
 * 补剂分装标签（60×40mm）图片渲染。
 *
 * 为什么不复用 LabelService：鲜食标签是 70×100mm 的另一套版式（食谱名 / 原料表 /
 * 营养成分 / 烹饪建议），两者的画布尺寸、字号、行距都是各自贴纸打样定死的。
 * 挤在同一个类里，改补剂版式就会碰到鲜食标签的既有行为，而鲜食标签正在产线上跑，
 * 所以这里独立实现、独立字号表，鲜食标签一个字节都不动。
 */

// 打印机分辨率：与 label.service.ts 完全一致的换算（精臣 B3S，203dpi）。
// 换算方式必须一致 —— 换一套取整规则会让同一张标签在驱动里被缩放。
const DPI = 203;
const MM_TO_PX = DPI / 25.4; // 1mm ≈ 7.9921px，取整后 1mm = 8px

/**
 * 毫米转像素。
 * 注意：这是 label.service.ts 里同名函数的副本，不是懒，是不想为了共用而改动
 * 鲜食标签的文件（改了就有连带风险）。
 */
function mmToPx(mm: number): number {
  return Math.round(mm * MM_TO_PX);
}

/**
 * 标签几何（毫米）。60×40mm 按 8px/mm 正好落在 480×320px。
 */
export const SUPPLEMENT_LABEL_LAYOUT = {
  canvas: { widthMm: 60, heightMm: 40 },
  margin: {
    leftMm: 2,
    rightMm: 2,
    /**
     * 底部安全区。热敏打印机贴纸边缘有 1~2mm 不可打印区，白边留少了，
     * 最后一行安全提示会被切掉 —— 那行恰恰是最不能丢的，所以按 4mm 兜底。
     */
    bottomMm: 4,
  },
} as const;

export type SupplementLabelAlign = 'left' | 'center';

/**
 * 标签上的一行（纯数据，不含任何绘制逻辑，方便单独断言文案）。
 */
export interface SupplementLabelLine {
  /** 要画的文字；分隔线的 text 留空 */
  text: string;
  fontSizeMm: number;
  bold: boolean;
  align: SupplementLabelAlign;
  /**
   * 相对「上一个已画元素」的基线再往下走多少毫米（第一行＝距标签顶部）。
   * 打样图上的行距不是字号的固定倍数（品名到用量近、日期到有效期也近），
   * 逐行写死最贴近实物；改版式只需要动这几个数，渲染逻辑不用碰。
   */
  advanceMm: number;
  /** 分隔线：只画一条贯穿左右边距的横线 */
  divider?: boolean;
}

/** 每行相对上一行的垂直推进量（mm），按 1:1 打样图逐行对出来的 */
const LINE_ADVANCE_MM = {
  brand: 4.25,
  product: 5.15,
  amount: 4.35,
  divider: 1.65,
  packedDate: 4.1,
  expiry: 3.75,
  batchOrder: 3.25,
  source: 3.1,
  disclaimer: 3.15,
} as const;

/** 各处字号（mm 高度），同样来自打样图 */
const FONT_SIZE_MM = {
  brand: 2.5,
  product: 4.2,
  amount: 3.4,
  packedDate: 2.4,
  expiry: 3.0,
  batchOrder: 2.2,
  source: 2.3,
  disclaimer: 2.1,
} as const;

/**
 * 决定「这张标签上该出现哪几行文字」。
 *
 * 单独抽成纯函数的原因：标签内容是要被人核对的安全信息（效期、批号、警示语），
 * 用像素级断言去验证太脆；文案拼装逻辑独立出来后，测试直接断言返回的数组就行。
 * 渲染函数只负责把这些行画到画布上。
 */
export function buildSupplementLabelLines(
  label: SupplementLabel,
  orderNo: string,
  brandName: string,
): SupplementLabelLine[] {
  const lines: SupplementLabelLine[] = [];

  // 第 1 行：品牌。没配品牌名就整行省掉，不留一条空白占位（省下的高度让后面几行更宽松）。
  const brand = (brandName ?? '').trim();
  if (brand) {
    lines.push({
      text: brand,
      fontSizeMm: FONT_SIZE_MM.brand,
      bold: false,
      align: 'center',
      advanceMm: LINE_ADVANCE_MM.brand,
    });
  }

  // 第 2 行：品名。分装现场靠它认瓶，给整张标签最大的字号。
  lines.push({
    text: label.productName,
    fontSizeMm: FONT_SIZE_MM.product,
    bold: true,
    align: 'center',
    advanceMm: LINE_ADVANCE_MM.product,
  });

  // 第 3 行：每袋用量 + 第几袋/共几袋。
  // 只有一袋时不写「1/1」：没有歧义，写了纯占地方。
  const bagTotal = Math.max(1, Math.trunc(label.bagTotal || 1));
  const amountText =
    bagTotal > 1
      ? `${label.amountText}  ${label.bagIndex}/${bagTotal}`
      : label.amountText;
  lines.push({
    text: amountText,
    fontSizeMm: FONT_SIZE_MM.amount,
    bold: true,
    align: 'center',
    advanceMm: LINE_ADVANCE_MM.amount,
  });

  // 第 4 行：分隔线，把「这袋是什么」和「这袋的日期信息」分开
  lines.push({
    text: '',
    fontSizeMm: 0,
    bold: false,
    align: 'left',
    advanceMm: LINE_ADVANCE_MM.divider,
    divider: true,
  });

  // 第 5 行：分装日期
  lines.push({
    text: `分装日期 ${label.packedDate}`,
    fontSizeMm: FONT_SIZE_MM.packedDate,
    bold: false,
    align: 'left',
    advanceMm: LINE_ADVANCE_MM.packedDate,
  });

  // 第 6 行：有效期。整张标签最关键的安全信息，加粗加大，排在视线落点上。
  lines.push({
    text: `有效期至 ${label.expiryDate}`,
    fontSizeMm: FONT_SIZE_MM.expiry,
    bold: true,
    align: 'left',
    advanceMm: LINE_ADVANCE_MM.expiry,
  });

  // 第 7 行：批号 + 订单号。批号是选填的，为空时只留订单号，
  // 不能出现「批号 」这种后面什么都没有的空标签。
  const batchNo = (label.batchNo ?? '').trim();
  const orderText = `订单 ${orderNo}`;
  lines.push({
    text: batchNo ? `批号 ${batchNo}   ${orderText}` : orderText,
    fontSizeMm: FONT_SIZE_MM.batchOrder,
    bold: false,
    align: 'left',
    advanceMm: LINE_ADVANCE_MM.batchOrder,
  });

  // 第 8 行：原品（品牌·规格）。拿不到原品信息就整行省略，把高度让给下面的安全提示。
  const sourceProduct = (label.sourceProduct ?? '').trim();
  if (sourceProduct) {
    lines.push({
      text: `原品 ${sourceProduct}`,
      fontSizeMm: FONT_SIZE_MM.source,
      bold: false,
      align: 'left',
      advanceMm: LINE_ADVANCE_MM.source,
    });
  }

  // 第 9 行：安全提示。文案偏长，渲染时按可用宽度自动换行。
  const disclaimer = (label.disclaimer ?? '').trim();
  if (disclaimer) {
    lines.push({
      text: disclaimer,
      fontSizeMm: FONT_SIZE_MM.disclaimer,
      bold: false,
      align: 'left',
      advanceMm: LINE_ADVANCE_MM.disclaimer,
    });
  }

  return lines;
}

// 字体族名刻意与鲜食标签的 Chinese / Chinese-Bold 错开：
// node-canvas 的 registerFont 是按 family 累积的，两个服务都用同一个名字时，
// 后注册的字体会影响先注册的那套渲染结果（可能悄悄改变鲜食标签的字形）。
const REGULAR_FONT_FAMILY = 'SupplementChinese';
const BOLD_FONT_FAMILY = 'SupplementChinese-Bold';

/**
 * 基线以下还会露出多少字高。中文方块字基本坐在基线上，但 g / p / y 这类字母
 * 会往下掉一截；不预留的话，「底部留 4mm」只是基线离底 4mm，实际字形只留了 3mm。
 */
const DESCENT_RATIO = 0.25;

/**
 * 换行出来的续行行距（相对于字号）。
 * 安全提示是整张标签唯一的段落，实测 30 个字要折成两行；按正常行距排，
 * 第二行会掉进底部不可打印区，而丢字比挤一点严重得多，所以续行收紧。
 */
const WRAPPED_LINE_HEIGHT_RATIO = 1.2;

@Injectable()
export class SupplementLabelService {
  constructor() {
    // 字体查找路径与 label.service.ts 保持一致：
    // 开发/ts-jest 下 __dirname = src/label，构建后是 dist/src/label。
    const distFontsPath = path.join(__dirname, '../../assets/fonts');
    const srcFontsPath = path.join(__dirname, '../../src/assets/fonts');
    const fontsPath = fs.existsSync(distFontsPath)
      ? distFontsPath
      : srcFontsPath;

    const regularFontPath = path.join(
      fontsPath,
      'SourceHanSansSC-Regular.otf',
    );
    const boldFontPath = path.join(fontsPath, 'SourceHanSansSC-Bold.otf');

    // 字体缺失时直接抛错。热敏标签打出来才发现中文变成方框，比启动就失败贵得多。
    if (!fs.existsSync(regularFontPath)) {
      throw new Error(`Font file not found: ${regularFontPath}`);
    }
    if (!fs.existsSync(boldFontPath)) {
      throw new Error(`Font file not found: ${boldFontPath}`);
    }

    registerFont(regularFontPath, { family: REGULAR_FONT_FAMILY });
    registerFont(boldFontPath, { family: BOLD_FONT_FAMILY });
  }

  /**
   * 把一张补剂标签渲染成 PNG base64（不含 data: 前缀），交给小程序端上传打印。
   */
  generateLabelImage(
    label: SupplementLabel,
    orderNo: string,
    brandName: string,
  ): string {
    const width = mmToPx(SUPPLEMENT_LABEL_LAYOUT.canvas.widthMm);
    const height = mmToPx(SUPPLEMENT_LABEL_LAYOUT.canvas.heightMm);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 先铺白底：透明像素交给部分热敏打印驱动会变成黑块
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000000';

    const contentLeft = mmToPx(SUPPLEMENT_LABEL_LAYOUT.margin.leftMm);
    const contentRight =
      width - mmToPx(SUPPLEMENT_LABEL_LAYOUT.margin.rightMm);
    const contentWidth = contentRight - contentLeft;
    /** 字形底部允许到达的最靠下位置：再往下就是热敏打印机的不可打印区 */
    const safeBottomY =
      height - mmToPx(SUPPLEMENT_LABEL_LAYOUT.margin.bottomMm);

    const lines = buildSupplementLabelLines(label, orderNo, brandName);
    // 当前基线位置。推进量是「相对上一行」的，所以换行后要继续往下挪，
    // 否则后面几行会压在换行出来的文字上。
    let baselineY = 0;

    lines.forEach((line) => {
      const advancePx = mmToPx(line.advanceMm);
      const firstBaselineY = baselineY + advancePx;

      if (line.divider) {
        this.drawDividerLine(ctx, firstBaselineY, contentLeft, contentRight);
        baselineY = firstBaselineY;
        return;
      }

      const fontPx = mmToPx(line.fontSizeMm);
      ctx.font = line.bold
        ? `bold ${fontPx}px "${BOLD_FONT_FAMILY}"`
        : `${fontPx}px "${REGULAR_FONT_FAMILY}"`;
      ctx.textAlign = line.align === 'center' ? 'center' : 'left';
      const textX = line.align === 'center' ? width / 2 : contentLeft;

      const descentPx = Math.ceil(fontPx * DESCENT_RATIO);
      // 续行用更紧的行距，见 WRAPPED_LINE_HEIGHT_RATIO 的说明
      const wrappedAdvancePx = Math.min(
        advancePx,
        mmToPx(line.fontSizeMm * WRAPPED_LINE_HEIGHT_RATIO),
      );

      this.wrapTextByWidth(ctx, line.text, contentWidth).forEach(
        (segment, index) => {
          const segmentBaselineY = firstBaselineY + index * wrappedAdvancePx;
          // 换行后装不下时，先保证字不越界：超出的行宁可不画，
          // 也不能压进底部安全区（那里打印出来会被裁掉）。
          if (segmentBaselineY + descentPx > safeBottomY) {
            return;
          }
          ctx.fillText(segment, textX, segmentBaselineY);
          baselineY = segmentBaselineY;
        },
      );
    });

    const buffer = canvas.toBuffer('image/png');
    return buffer.toString('base64');
  }

  /**
   * 绘制贯穿左右边距的分隔线。
   */
  private drawDividerLine(
    ctx: CanvasRenderingContext2D,
    y: number,
    left: number,
    right: number,
  ): void {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  /**
   * 按可用宽度逐字换行。
   * 中文没有词边界，逐字断行最省地方；与鲜食标签的换行策略保持一致。
   */
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
}
