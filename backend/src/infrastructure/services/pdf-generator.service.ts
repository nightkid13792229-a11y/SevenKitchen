/**
 * 制作单 PDF —— 黑白印刷版（2026-11-07 重排）
 *
 * 设计约束（来自老板）：
 *   1. 纸面只印两种备注：管理员备注（人写的）+ 顾客备注；改价/代客下单这类系统日志不上纸。
 *   2. 只用黑白灰，不依赖任何颜色表达语义（办公激光打印机）。
 *   3. 多页必须有页码；不需要签字栏。
 *
 * 排版上的硬规则：
 *   · 不用底纹、不用反白（打印会脏/糊），层级靠字重、线宽和位置；
 *   · 行线 0.4pt、列线 0.4pt、外框 1pt、合计行 2pt（再细会断线）；
 *   · 所有可变长文本先量高再画，标题允许折行并把后续内容顶下去，绝不出现压字；
 *   · 换页时重复页眉（菜名 + 锅次），页脚写「第 x / y 页」。
 */

import { Injectable } from '@nestjs/common';
const PDFDocument = require('pdfkit');
import * as path from 'path';
import type {
  PrintTaskDto,
  PrintTaskOrderItemDto,
} from '../../interfaces/dto/production/print-task.dto';
import { splitOrderRemarks } from '../../application/production/print-remark.util';

interface IngredientItem {
  name: string;
  standardIngredientName?: string;
  procurementSkuName?: string;
  procurementSkuBrand?: string;
  procurementSkuPurchaseChannel?: string;
  procurementSkuProductModel?: string;
  amount: string;
  unit: string;
  typeLabel: string;
  typeClass: string;
  method?: string;
  isTotalWeight?: boolean;
}

type PrintTaskData = PrintTaskDto;
type PackagePlanRow = NonNullable<PrintTaskOrderItemDto['packagePlan']>[number];

const BLACK = '#000000';
const DARK_GRAY = '#555555';
const LINE_GRAY = '#bbbbbb';

@Injectable()
export class PdfGeneratorService {
  private static readonly PAGE_LEFT = 40;
  private static readonly PAGE_RIGHT = 552;
  private static readonly CONTENT_WIDTH = 512;
  private static readonly CONTENT_TOP = 40;
  /** 正文最低可画到哪；再往下就换页（页脚在 786） */
  private static readonly CONTENT_BOTTOM = 766;
  private static readonly FOOTER_Y = 786;
  private static readonly TABLE_HEADER_HEIGHT = 18;
  private static readonly SOURCE_COLUMN_WIDTH = 300;
  private static readonly AMOUNT_COLUMN_WIDTH = 70;

  /**
   * Generate PDF for production task
   * @returns PDF buffer
   */
  async generateProductionTaskPDF(data: PrintTaskData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, bottom: 40, left: 40, right: 40 },
          bufferPages: true,
        });

        const fs = require('fs');
        const fontsPath = this.resolveFontsPath();
        const regularFontPath = path.join(
          fontsPath,
          'SourceHanSansSC-Regular.otf',
        );
        const boldFontPath = path.join(fontsPath, 'SourceHanSansSC-Bold.otf');

        if (!fs.existsSync(regularFontPath)) {
          throw new Error(`Font file not found: ${regularFontPath}`);
        }
        if (!fs.existsSync(boldFontPath)) {
          throw new Error(`Font file not found: ${boldFontPath}`);
        }

        doc.registerFont('CN', regularFontPath);
        doc.registerFont('CNB', boldFontPath);
        doc.font('CN');

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        let y = this.drawHeader(doc, data, false);
        y = this.drawOrders(doc, data, y);
        this.drawIngredients(doc, data, y);
        this.drawFooters(doc, data);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 字体目录：dist 里是 backend/dist/assets/fonts，源码跑（ts-node / jest）时是
   * backend/src/assets/fonts。按顺序找，避免测试和线上各写一套路径。
   */
  private resolveFontsPath(): string {
    const fs = require('fs');
    const candidates = [
      path.join(__dirname, '../../../assets/fonts'),
      path.join(process.cwd(), 'assets/fonts'),
      path.join(process.cwd(), 'src/assets/fonts'),
    ];

    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (!found) {
      throw new Error(
        `Font directory not found, looked in: ${candidates.join(', ')}`,
      );
    }
    return found;
  }

  // ==================== 页眉 / 页脚 ====================

  private drawHeader(doc: any, data: PrintTaskData, continuation: boolean): number {
    const left = PdfGeneratorService.PAGE_LEFT;
    const right = PdfGeneratorService.PAGE_RIGHT;
    const width = PdfGeneratorService.CONTENT_WIDTH;
    const stampW = 74;
    const titleWidth = width - stampW - 12;
    const titleSize = continuation ? 11 : 15;
    const stampH = continuation ? 18 : 24;

    const title = this.buildTaskTitleLine(data);
    doc.font('CNB').fontSize(titleSize).fillColor(BLACK);
    doc.text(title, left, PdfGeneratorService.CONTENT_TOP, {
      width: titleWidth,
      lineGap: 1,
    });
    const titleHeight = doc.heightOfString(title, {
      width: titleWidth,
      lineGap: 1,
    });

    doc
      .rect(right - stampW, PdfGeneratorService.CONTENT_TOP, stampW, stampH)
      .strokeColor(BLACK)
      .lineWidth(1)
      .stroke();
    doc.font('CNB').fontSize(continuation ? 9 : 10).fillColor(BLACK);
    doc.text(
      `第 ${data.currentPotNumber} / ${data.totalPots} 锅`,
      right - stampW,
      PdfGeneratorService.CONTENT_TOP + 7,
      { width: stampW, align: 'center', lineBreak: false },
    );

    let y =
      PdfGeneratorService.CONTENT_TOP + Math.max(titleHeight, stampH) + 6;

    doc.font('CN').fontSize(8).fillColor(DARK_GRAY);
    doc.text(this.buildHeaderMeta(data, continuation), left, y, { width });
    y += 12;

    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .strokeColor(BLACK)
      .lineWidth(1.2)
      .stroke();

    return y + 10;
  }

  private buildTaskTitleLine(data: PrintTaskData): string {
    return `${data.recipeName} v${data.recipeVersion}`;
  }

  private buildHeaderMeta(data: PrintTaskData, continuation: boolean): string {
    if (!continuation) {
      return `状态 ${this.getStatusText(data.status)}    下单时间 ${this.formatDateTime(data.createdAt)}`;
    }

    const orderNos = data.orderItems
      .map((order) => order.orderNo)
      .filter((orderNo): orderNo is string => Boolean(orderNo));
    const identity =
      orderNos.length === 1
        ? `订单 ${orderNos[0]}`
        : orderNos.length > 1
          ? `本锅共 ${data.orderItems.length} 单`
          : '';

    return ['（续页）', identity].filter(Boolean).join(' ');
  }

  private drawFooters(doc: any, data: PrintTaskData): void {
    const range = doc.bufferedPageRange();
    const printedAt = this.formatDateTime(new Date().toISOString());

    for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
      doc.switchToPage(range.start + pageIndex);
      doc.font('CN').fontSize(7.5).fillColor(DARK_GRAY);
      doc.text(
        `第 ${pageIndex + 1} 页 / 共 ${range.count} 页`,
        40,
        PdfGeneratorService.FOOTER_Y,
        { width: 200, lineBreak: false },
      );
      doc.text(`打印于 ${printedAt}`, 40, PdfGeneratorService.FOOTER_Y, {
        width: PdfGeneratorService.CONTENT_WIDTH,
        align: 'right',
        lineBreak: false,
      });
    }

    // 页脚画完后回到最后一页，避免后续 addPage 定位异常
    doc.switchToPage(range.start + range.count - 1);
  }

  // ==================== 订单区 ====================

  private drawOrders(doc: any, data: PrintTaskData, startY: number): number {
    let y = startY;

    data.orderItems.forEach((order, index) => {
      const height = this.measureOrderBlock(doc, order);
      if (y + height > PdfGeneratorService.CONTENT_BOTTOM) {
        doc.addPage();
        y = this.drawHeader(doc, data, true);
      }
      y = this.drawOrderBlock(doc, order, index, y);
    });

    return y + 6;
  }

  private measureOrderBlock(doc: any, order: PrintTaskOrderItemDto): number {
    const remarks = this.resolveRemarks(order);
    let height = 16 + 30 + 6;

    if (remarks.adminRemark) {
      height +=
        this.measureNoteHeight(doc, '管理员备注', remarks.adminRemark, false) + 4;
    }
    if (remarks.customerNote) {
      height +=
        this.measureNoteHeight(doc, '顾客备注', remarks.customerNote, true) + 6;
    }

    return height + 8;
  }

  private drawOrderBlock(
    doc: any,
    order: PrintTaskOrderItemDto,
    index: number,
    startY: number,
  ): number {
    const left = PdfGeneratorService.PAGE_LEFT;
    const width = PdfGeneratorService.CONTENT_WIDTH;
    const { totalWeight, summary } = this.getOrderPackagePlanSummary(order);
    const remarks = this.resolveRemarks(order);
    let y = startY;

    doc.font('CNB').fontSize(10).fillColor(BLACK);
    doc.text(order.orderNo || `订单 ${index + 1}`, left, y, {
      width: width - 140,
      lineBreak: false,
    });
    doc.font('CN').fontSize(8).fillColor(DARK_GRAY);
    doc.text(
      `共 ${totalWeight}g / ${this.getOrderPackageCount(order)} 袋`,
      left,
      y + 2,
      { width, align: 'right', lineBreak: false },
    );
    y += 16;

    const fields: Array<[string, string]> = [
      ['狗狗', order.dogName || '-'],
      ['总净重', `${totalWeight}g`],
    ];
    if (order.recipientName) {
      fields.push([
        '收货人',
        `${order.recipientName}（${order.recipientCity || '-'}）`,
      ]);
    }
    fields.push(['分装', summary]);

    const columnWidth = width / 2;
    fields.forEach(([label, value], fieldIndex) => {
      const x = left + (fieldIndex % 2) * columnWidth;
      const fieldY = y + Math.floor(fieldIndex / 2) * 15;
      doc.font('CN').fontSize(8).fillColor(DARK_GRAY);
      doc.text(label, x, fieldY + 1.5, { lineBreak: false });
      doc.font('CNB').fontSize(9).fillColor(BLACK);
      doc.text(value, x + 44, fieldY, {
        width: columnWidth - 50,
        lineBreak: false,
      });
    });
    y += 30;

    if (remarks.adminRemark) {
      y = this.drawNote(doc, '管理员备注', remarks.adminRemark, y, false);
      y += 4;
    }
    if (remarks.customerNote) {
      y = this.drawNote(doc, '顾客备注', remarks.customerNote, y, true);
      y += 6;
    }

    return y;
  }

  private resolveRemarks(order: PrintTaskOrderItemDto): {
    adminRemark: string;
    customerNote: string;
  } {
    return splitOrderRemarks(order.adminRemark, order.customerNote);
  }

  private measureNoteHeight(
    doc: any,
    label: string,
    text: string,
    boxed: boolean,
  ): number {
    const pad = boxed ? 5 : 0;
    const innerWidth = PdfGeneratorService.CONTENT_WIDTH - pad * 2;
    doc.font('CNB').fontSize(8.5);
    const labelWidth = doc.widthOfString(label);
    doc.font('CN').fontSize(8.5);
    const textHeight = doc.heightOfString(text, {
      width: innerWidth - labelWidth - 6,
      lineGap: 1,
    });
    return Math.max(13, textHeight + pad * 2 + 2);
  }

  private drawNote(
    doc: any,
    label: string,
    text: string,
    startY: number,
    boxed: boolean,
  ): number {
    const left = PdfGeneratorService.PAGE_LEFT;
    const width = PdfGeneratorService.CONTENT_WIDTH;
    const pad = boxed ? 5 : 0;
    const innerWidth = width - pad * 2;
    const height = this.measureNoteHeight(doc, label, text, boxed);

    if (boxed) {
      doc
        .rect(left, startY, width, height)
        .strokeColor(BLACK)
        .lineWidth(1)
        .stroke();
    }

    doc.font('CNB').fontSize(8.5);
    const labelWidth = doc.widthOfString(label);
    doc.fillColor(BLACK).text(label, left + pad, startY + pad + 1, {
      lineBreak: false,
    });
    doc.font('CN').fontSize(8.5).fillColor(BLACK);
    doc.text(text, left + pad + labelWidth + 6, startY + pad + 1, {
      width: innerWidth - labelWidth - 6,
      lineGap: 1,
    });

    return startY + height;
  }

  // ==================== 原料表 ====================

  private drawIngredients(doc: any, data: PrintTaskData, startY: number): number {
    let y = startY;
    const count = this.getPrintableIngredientCount(data);

    y = this.drawSectionTitle(doc, `原料清单（${count} 项）`, y);
    y = this.drawTableHeader(doc, y);

    data.parsedIngredients.forEach((ingredient) => {
      const nameLine = this.getIngredientNameLine(ingredient);
      const metaLine = this.getIngredientMetaLine(ingredient);
      const amountText = `${ingredient.amount}${ingredient.unit}`;
      const methodText = ingredient.method || '';
      const rowHeight = this.measureRowHeight(
        doc,
        nameLine,
        metaLine,
        methodText,
      );

      if (y + rowHeight > PdfGeneratorService.CONTENT_BOTTOM) {
        doc.addPage();
        y = this.drawHeader(doc, data, true);
        y = this.drawSectionTitle(doc, '原料清单（续）', y);
        y = this.drawTableHeader(doc, y);
      }

      y = this.drawRow(
        doc,
        {
          nameLine,
          metaLine,
          amountText,
          methodText,
          isTotalWeight: Boolean(ingredient.isTotalWeight),
        },
        y,
        rowHeight,
      );
    });

    return y;
  }

  private getPrintableIngredientCount(data: PrintTaskData): number {
    return data.parsedIngredients.filter(
      (ingredient) => !ingredient.isTotalWeight,
    ).length;
  }

  private drawSectionTitle(doc: any, title: string, y: number): number {
    doc.rect(PdfGeneratorService.PAGE_LEFT, y + 2, 3, 11).fill(BLACK);
    doc.font('CNB').fontSize(11).fillColor(BLACK);
    doc.text(title, PdfGeneratorService.PAGE_LEFT + 8, y, { lineBreak: false });
    return y + 20;
  }

  private drawTableHeader(doc: any, y: number): number {
    const left = PdfGeneratorService.PAGE_LEFT;
    const right = PdfGeneratorService.PAGE_RIGHT;
    const sourceWidth = PdfGeneratorService.SOURCE_COLUMN_WIDTH;
    const amountWidth = PdfGeneratorService.AMOUNT_COLUMN_WIDTH;
    const amountX = left + sourceWidth;
    const methodX = amountX + amountWidth;
    const height = PdfGeneratorService.TABLE_HEADER_HEIGHT;

    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .strokeColor(BLACK)
      .lineWidth(1)
      .stroke();

    doc.font('CNB').fontSize(8).fillColor(BLACK);
    doc.text('原料 / 品牌 · 渠道 · 规格', left + 4, y + 5, { lineBreak: false });
    doc.text('用量', amountX + 4, y + 5, {
      width: amountWidth - 8,
      align: 'right',
      lineBreak: false,
    });
    doc.text('部位 / 状态 / 预处理', methodX + 4, y + 5, { lineBreak: false });

    doc
      .moveTo(left, y + height)
      .lineTo(right, y + height)
      .strokeColor(BLACK)
      .lineWidth(0.8)
      .stroke();

    return y + height;
  }

  private measureRowHeight(
    doc: any,
    nameLine: string,
    metaLine: string,
    methodText: string,
  ): number {
    const sourceWidth = PdfGeneratorService.SOURCE_COLUMN_WIDTH - 8;
    const methodWidth =
      PdfGeneratorService.CONTENT_WIDTH -
      PdfGeneratorService.SOURCE_COLUMN_WIDTH -
      PdfGeneratorService.AMOUNT_COLUMN_WIDTH -
      8;

    doc.font('CNB').fontSize(9);
    const nameHeight = doc.heightOfString(nameLine, {
      width: sourceWidth,
      lineGap: 0,
    });

    const metaHeight = metaLine
      ? doc
          .font('CN')
          .fontSize(7.5)
          .heightOfString(metaLine, { width: sourceWidth, lineGap: 0 })
      : 0;

    const methodHeight = doc
      .font('CN')
      .fontSize(8)
      .heightOfString(methodText || ' ', {
        width: methodWidth,
        lineGap: 0,
      });

    return Math.max(
      22,
      nameHeight + (metaHeight ? metaHeight + 1 : 0) + 8,
      methodHeight + 8,
    );
  }

  private drawRow(
    doc: any,
    row: {
      nameLine: string;
      metaLine: string;
      amountText: string;
      methodText: string;
      isTotalWeight: boolean;
    },
    y: number,
    height: number,
  ): number {
    const left = PdfGeneratorService.PAGE_LEFT;
    const right = PdfGeneratorService.PAGE_RIGHT;
    const sourceWidth = PdfGeneratorService.SOURCE_COLUMN_WIDTH;
    const amountWidth = PdfGeneratorService.AMOUNT_COLUMN_WIDTH;
    const amountX = left + sourceWidth;
    const methodX = amountX + amountWidth;

    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .strokeColor(row.isTotalWeight ? BLACK : LINE_GRAY)
      .lineWidth(row.isTotalWeight ? 1.2 : 0.4)
      .stroke();

    doc.font('CNB').fontSize(9).fillColor(BLACK);
    doc.text(row.nameLine, left + 4, y + 4, {
      width: sourceWidth - 8,
      lineGap: 0,
    });

    if (row.metaLine) {
      doc.font('CN').fontSize(7.5).fillColor(DARK_GRAY);
      doc.text(row.metaLine, left + 4, y + 4 + 11, {
        width: sourceWidth - 8,
        lineGap: 0,
      });
    }

    doc.font('CNB').fontSize(9).fillColor(BLACK);
    doc.text(row.amountText, amountX + 4, y + 4, {
      width: amountWidth - 8,
      align: 'right',
      lineGap: 0,
    });

    if (row.methodText) {
      doc.font('CN').fontSize(8).fillColor(BLACK);
      doc.text(row.methodText, methodX + 4, y + 4.5, {
        width: right - methodX - 8,
        lineGap: 0,
      });
    }

    doc
      .moveTo(amountX, y)
      .lineTo(amountX, y + height)
      .strokeColor(LINE_GRAY)
      .lineWidth(0.4)
      .stroke();
    doc
      .moveTo(methodX, y)
      .lineTo(methodX, y + height)
      .strokeColor(LINE_GRAY)
      .lineWidth(0.4)
      .stroke();

    if (row.isTotalWeight) {
      doc
        .moveTo(left, y + height)
        .lineTo(right, y + height)
        .strokeColor(BLACK)
        .lineWidth(2)
        .stroke();
    }

    return y + height;
  }

  // ==================== 文本拼装 ====================

  private getIngredientNameLine(ingredient: IngredientItem): string {
    if (ingredient.isTotalWeight) {
      return '食材类原料总重（含生产损耗）';
    }

    const name = (
      ingredient.procurementSkuName ||
      ingredient.name ||
      ingredient.standardIngredientName ||
      ''
    ).trim();
    const typeLabel = (ingredient.typeLabel || '').trim();
    return [typeLabel, name || '-'].filter(Boolean).join('  ');
  }

  private getIngredientMetaLine(ingredient: IngredientItem): string {
    if (ingredient.isTotalWeight) {
      return '';
    }

    return this.getPrintablePurchaseSummaryParts(
      ingredient.procurementSkuBrand,
      ingredient.procurementSkuPurchaseChannel,
      ingredient.procurementSkuProductModel,
    ).join(' · ');
  }

  private getPrintablePurchaseSummaryParts(...values: unknown[]): string[] {
    return values
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0)
      .filter((value) => !this.shouldSkipPurchaseSummaryPart(value));
  }

  private shouldSkipPurchaseSummaryPart(value: string): boolean {
    return ['无', '暂无', '-', '/', '／', 'null', 'undefined'].includes(value);
  }

  private getOrderPackagePlanSummary(order: PrintTaskOrderItemDto): {
    totalWeight: number;
    summary: string;
  } {
    const hasPackagePlan =
      Array.isArray(order.packagePlan) && order.packagePlan.length > 0;

    if (hasPackagePlan) {
      const rows = order.packagePlan as PackagePlanRow[];
      return {
        totalWeight: this.getPackagePlanTotalWeight(rows),
        summary: this.formatPackagePlan(rows),
      };
    }

    return {
      totalWeight: order.packageSpecG * order.packageCount,
      summary: `${order.packageSpecG}g×${order.packageCount}袋`,
    };
  }

  private getOrderPackageCount(order: PrintTaskOrderItemDto): number {
    if (Array.isArray(order.packagePlan) && order.packagePlan.length > 0) {
      return order.packagePlan.reduce(
        (sum, row) => sum + Number(row.packageCount || 0),
        0,
      );
    }
    return Number(order.packageCount || 0);
  }

  private formatPackagePlan(packagePlan: PackagePlanRow[]): string {
    return packagePlan
      .map((row) => `${row.packageSpecG}g×${row.packageCount}袋`)
      .join('，');
  }

  private getPackagePlanTotalWeight(packagePlan: PackagePlanRow[]): number {
    return packagePlan.reduce(
      (sum, row) => sum + row.packageSpecG * row.packageCount,
      0,
    );
  }

  private getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      PENDING: '待制作',
      IN_PROGRESS: '制作中',
      COMPLETED: '已完成',
    };

    return statusMap[status] || status;
  }

  private formatDateTime(dateStr: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '-';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
}
