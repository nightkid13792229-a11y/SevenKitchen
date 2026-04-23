/**
 * PDF Generator Service
 * Generates PDF documents for production tasks
 */

import { Injectable } from '@nestjs/common';
const PDFDocument = require('pdfkit');
import * as path from 'path';
import type { PrintTaskDto, PrintTaskOrderItemDto } from '../../interfaces/dto/production/print-task.dto';

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
type PrintTableColumn = {
  key: string;
  label: string;
  x: number;
  width: number;
};

@Injectable()
export class PdfGeneratorService {
  /**
   * Generate PDF for production task
   * @returns PDF buffer
   */
  async generateProductionTaskPDF(data: PrintTaskData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // Create PDF document (A4 size)
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, bottom: 40, left: 40, right: 40 },
        });

        // Register Chinese fonts BEFORE any operations
        // Path from dist/src/infrastructure/services/ to src/assets/fonts/
        const fontsPath = path.join(__dirname, '../../../assets/fonts');
        const regularFontPath = path.join(
          fontsPath,
          'SourceHanSansSC-Regular.otf',
        );
        const boldFontPath = path.join(fontsPath, 'SourceHanSansSC-Bold.otf');

        console.log('[PDF Generator] __dirname:', __dirname);
        console.log('[PDF Generator] fontsPath:', fontsPath);
        console.log('[PDF Generator] regularFontPath:', regularFontPath);
        console.log('[PDF Generator] boldFontPath:', boldFontPath);

        // Check if font files exist
        const fs = require('fs');
        if (!fs.existsSync(regularFontPath)) {
          console.error(
            '[PDF Generator] Regular font file NOT found:',
            regularFontPath,
          );
          throw new Error(`Font file not found: ${regularFontPath}`);
        } else {
          console.log(
            '[PDF Generator] Regular font file found, size:',
            fs.statSync(regularFontPath).size,
            'bytes',
          );
        }

        if (!fs.existsSync(boldFontPath)) {
          console.error(
            '[PDF Generator] Bold font file NOT found:',
            boldFontPath,
          );
          throw new Error(`Font file not found: ${boldFontPath}`);
        } else {
          console.log(
            '[PDF Generator] Bold font file found, size:',
            fs.statSync(boldFontPath).size,
            'bytes',
          );
        }

        // Register fonts - IMPORTANT: must register before using and use the font name in .font() calls
        doc.registerFont('Chinese', regularFontPath);
        doc.registerFont('Chinese-Bold', boldFontPath);

        // Set default font to Chinese immediately after registration
        doc.font('Chinese');

        // Collect buffers
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Calculate scale factor based on content length
        const scaleFactor = this.calculateScaleFactor(data);

        // Apply scaling if needed
        if (scaleFactor < 1) {
          doc.scale(scaleFactor, scaleFactor, { origin: [0, 0] });
        }

        // Draw all sections with compact layout
        let currentY = this.drawHeader(doc, data, scaleFactor);
        currentY = this.drawPackagingOrders(doc, data, currentY, scaleFactor);
        this.drawIngredients(doc, data, currentY, scaleFactor);

        // Finalize PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Calculate scale factor based on content length
   * Returns scale factor (1.0 = no scaling, <1.0 = shrink to fit)
   */
  private calculateScaleFactor(data: PrintTaskData): number {
    const pageHeight = 792; // A4 height - margins
    // Estimate content height
    let estimatedHeight = 0;

    // Header: title, pot number, meta and separator condensed into two rows.
    estimatedHeight += 54;

    // Orders: two compact cards per row, without a redundant section heading.
    estimatedHeight += 6 + this.estimatePackagingOrdersHeight(data);

    // Ingredients table: compact five-column table with wrapped purchase summaries.
    estimatedHeight += 22 + 18 + this.estimateIngredientRowsHeight(data);

    // Safety margin: 40pt
    const availableHeight = pageHeight - 40;

    // Calculate scale factor
    if (estimatedHeight > availableHeight) {
      const scale = availableHeight / estimatedHeight;
      return Math.max(scale, 0.72);
    }

    return 1.0;
  }

  private estimatePackagingOrdersHeight(data: PrintTaskData): number {
    const isSingleOrder = data.orderItems.length === 1;
    const ordersPerRow = isSingleOrder ? 1 : 2;
    let height = 0;

    for (let index = 0; index < data.orderItems.length; index += ordersPerRow) {
      const rowItems = data.orderItems.slice(index, index + ordersPerRow);
      const rowHeight = Math.max(
        ...rowItems.map((order) =>
          this.estimateOrderCardHeight(order, isSingleOrder),
        ),
      );
      height += rowHeight + 8;
    }

    return Math.max(0, height - 8);
  }

  private estimateOrderCardHeight(
    order: PrintTaskOrderItemDto,
    isSingleOrder: boolean,
  ): number {
    const packagePlanSummary = this.getOrderPackagePlanSummary(order).summary;
    const packageText = `分装: ${packagePlanSummary}`;
    const packageCharsPerLine = isSingleOrder ? 52 : 24;
    const packageLines = Math.max(
      1,
      Math.ceil(packageText.length / packageCharsPerLine),
    );
    const recipientLines = order.recipientName ? 1 : 0;
    const remarkLines = order.adminRemark?.trim()
      ? Math.min(2, Math.ceil(order.adminRemark.trim().length / (isSingleOrder ? 58 : 28)))
      : 0;

    return 68 + (packageLines - 1) * 11 + recipientLines * 11 + remarkLines * 9;
  }

  private getPrintableIngredientCount(data: PrintTaskData): number {
    return data.parsedIngredients.filter(
      (ingredient) => !ingredient.isTotalWeight,
    ).length;
  }

  private estimateIngredientRowsHeight(data: PrintTaskData): number {
    return data.parsedIngredients.reduce(
      (sum, ingredient) => sum + this.estimateIngredientRowHeight(ingredient),
      0,
    );
  }

  private estimateIngredientRowHeight(ingredient: IngredientItem): number {
    const purchaseText = this.formatPurchaseSummary(ingredient);
    const purchaseLines = Math.max(1, Math.ceil(purchaseText.length / 18));
    return 20 + (purchaseLines - 1) * 9;
  }

  /**
   * Draw header section with scaling
   */
  private drawHeader(
    doc: any,
    data: PrintTaskData,
    scaleFactor: number,
  ): number {
    const top = 40;
    let y = top;

    doc
      .fontSize(Math.floor(18 * scaleFactor))
      .font('Chinese-Bold')
      .fillColor('#333333')
      .text(this.buildTaskTitleLine(data), 40, y, {
        align: 'center',
        width: 512,
      });
    y += Math.floor(25 * scaleFactor);

    doc
      .fontSize(Math.floor(9 * scaleFactor))
      .fillColor('#555555')
      .font('Chinese')
      .text(
        `状态: ${this.getStatusText(data.status)}    创建时间: ${this.formatDateTime(data.createdAt)}`,
        40,
        y,
        { align: 'center', width: 512 },
      );
    y += Math.floor(18 * scaleFactor);

    doc
      .moveTo(40, y)
      .lineTo(552, y)
      .strokeColor('#58a891')
      .lineWidth(1)
      .stroke();

    return y + Math.floor(8 * scaleFactor);
  }

  private buildTaskTitleLine(data: PrintTaskData): string {
    return `${data.recipeName} v${data.recipeVersion} · 第 ${data.currentPotNumber}/${data.totalPots} 锅`;
  }

  private getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      PENDING: '待制作',
      IN_PROGRESS: '制作中',
      COMPLETED: '已完成',
    };

    return statusMap[status] || status;
  }

  private truncateText(value: string | null | undefined, maxLength: number): string {
    const text = String(value || '').trim();
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  private formatIngredientNameLine(ingredient: IngredientItem): string {
    if (ingredient.isTotalWeight) {
      return ingredient.name || '-';
    }

    const standardName = (ingredient.standardIngredientName || '').trim();
    const skuName = (ingredient.procurementSkuName || ingredient.name || '').trim();

    if (standardName && skuName && standardName !== skuName) {
      return `${standardName} / ${skuName}`;
    }

    return skuName || standardName || '-';
  }

  private formatPurchaseSummary(ingredient: IngredientItem): string {
    if (ingredient.isTotalWeight) {
      return '-';
    }

    const parts = this.getPrintablePurchaseSummaryParts(
      ingredient.procurementSkuBrand,
      ingredient.procurementSkuPurchaseChannel,
      ingredient.procurementSkuProductModel,
    );

    return parts.length > 0 ? parts.join(' / ') : '-';
  }

  private getPrintablePurchaseSummaryParts(...values: unknown[]): string[] {
    return values
      .map((value) => String(value || '').trim())
      .filter((value) => !this.shouldSkipPurchaseSummaryPart(value));
  }

  private shouldSkipPurchaseSummaryPart(value: string): boolean {
    return ['无', '暂无', '-', 'null', 'undefined'].includes(value);
  }

  /**
   * Draw admin remarks section when present.
   */
  private drawOrderRemarks(
    doc: any,
    data: PrintTaskData,
    startY: number,
    scaleFactor: number,
  ): number {
    const remarks = data.orderItems
      .map((order, index) => ({
        order,
        index,
        remark: order.adminRemark?.trim() || '',
      }))
      .filter((item) => item.remark);

    if (remarks.length === 0) {
      return startY;
    }

    let y = startY + Math.floor(20 * scaleFactor);

    doc
      .fontSize(Math.floor(12 * scaleFactor))
      .fillColor('#000000')
      .font('Chinese-Bold')
      .text('管理员备注', 40, y);
    y += Math.floor(24 * scaleFactor);

    for (const item of remarks) {
      const text = `订单 ${item.index + 1}（${item.order.dogName}）：${item.remark}`;
      doc.fontSize(Math.floor(8 * scaleFactor)).fillColor('#000000').font('Chinese');

      const textHeight = doc.heightOfString(text, {
        width: 500,
        align: 'left',
      });

      doc
        .rect(40, y, 512, textHeight + Math.floor(8 * scaleFactor))
        .strokeColor('#000000')
        .lineWidth(1)
        .stroke();

      doc.text(text, 46, y + Math.floor(4 * scaleFactor), {
        width: 500,
        align: 'left',
      });

      y += textHeight + Math.floor(14 * scaleFactor);
    }

    return y;
  }

  /**
   * Draw packaging orders section with scaling
   * Two orders per row layout, black and white design
   */
  private drawPackagingOrders(
    doc: any,
    data: PrintTaskData,
    startY: number,
    scaleFactor: number,
  ): number {
    let y = startY + Math.floor(6 * scaleFactor);

    const isSingleOrder = data.orderItems.length === 1;
    const cardWidth = isSingleOrder ? Math.floor(512 * scaleFactor) : Math.floor(250 * scaleFactor);
    const gap = Math.floor(12 * scaleFactor);
    const rowGap = Math.floor(8 * scaleFactor);
    const ordersPerRow = isSingleOrder ? 1 : 2;

    for (let index = 0; index < data.orderItems.length; index += ordersPerRow) {
      const rowItems = data.orderItems.slice(index, index + ordersPerRow);
      const cardHeights = rowItems.map((order) =>
        this.calculateOrderCardHeight(doc, order, cardWidth, scaleFactor),
      );
      const rowHeight = Math.max(...cardHeights);

      rowItems.forEach((order, rowOffset) => {
        const cardX = rowOffset === 0 ? 40 : 40 + cardWidth + gap;
        this.drawPackagingOrderCard(
          doc,
          order,
          index + rowOffset,
          cardX,
          y,
          cardWidth,
          rowHeight,
          isSingleOrder,
          scaleFactor,
        );
      });

      y += rowHeight + rowGap;
    }

    return y - rowGap;
  }

  private calculateOrderCardHeight(
    doc: any,
    order: PrintTaskOrderItemDto,
    cardWidth: number,
    scaleFactor: number,
  ): number {
    const minHeight = Math.floor(68 * scaleFactor);
    const contentTop = Math.floor(22 * scaleFactor);
    const rowHeight = Math.floor(11 * scaleFactor);
    const paddingX = Math.floor(8 * scaleFactor);
    const contentWidth = cardWidth - paddingX * 2;
    const packageText = `分装: ${this.getOrderPackagePlanSummary(order).summary}`;

    doc.fontSize(Math.floor(8 * scaleFactor)).font('Chinese');
    const packageHeight = this.getWrappedOrderTextHeight(
      doc,
      packageText,
      contentWidth,
      rowHeight,
    );
    const recipientHeight = order.recipientName ? rowHeight : 0;
    const remarkText = order.adminRemark?.trim()
      ? `备注: ${this.truncateText(order.adminRemark, 56)}`
      : '';
    const remarkHeight = remarkText
      ? this.getWrappedOrderTextHeight(doc, remarkText, contentWidth, rowHeight)
      : 0;

    return Math.max(
      minHeight,
      contentTop +
        rowHeight +
        recipientHeight +
        Math.floor(4 * scaleFactor) +
        packageHeight +
        (remarkHeight ? Math.floor(4 * scaleFactor) + remarkHeight : 0) +
        Math.floor(8 * scaleFactor),
    );
  }

  private drawPackagingOrderCard(
    doc: any,
    order: PrintTaskOrderItemDto,
    index: number,
    cardX: number,
    y: number,
    cardWidth: number,
    cardHeight: number,
    isSingleOrder: boolean,
    scaleFactor: number,
  ): void {
    doc
      .rect(cardX, y, cardWidth, cardHeight)
      .strokeColor('#58a891')
      .lineWidth(0.8)
      .stroke();
    doc
      .rect(cardX, y, cardWidth, Math.floor(16 * scaleFactor))
      .fill('#58a891');
    doc
      .fontSize(Math.floor(9 * scaleFactor))
      .fillColor('#ffffff')
      .font('Chinese-Bold')
      .text(
        `订单 ${index + 1}`,
        cardX + Math.floor(8 * scaleFactor),
        y + Math.floor(3 * scaleFactor),
      );

    const { totalWeight, summary: packagePlanSummary } =
      this.getOrderPackagePlanSummary(order);
    const textX = cardX + Math.floor(8 * scaleFactor);
    const contentWidth = cardWidth - Math.floor(16 * scaleFactor);
    const secondColumnX =
      textX + Math.floor((isSingleOrder ? 250 : 112) * scaleFactor);
    const secondColumnWidth = Math.max(
      Math.floor(80 * scaleFactor),
      cardX + cardWidth - secondColumnX - Math.floor(8 * scaleFactor),
    );
    let detailY = y + Math.floor(22 * scaleFactor);
    const rowHeight = Math.floor(11 * scaleFactor);

    doc
      .fontSize(Math.floor(8 * scaleFactor))
      .fillColor('#333333')
      .font('Chinese');
    doc.text(`总净重: ${totalWeight}g`, textX, detailY, {
      width: secondColumnX - textX - Math.floor(6 * scaleFactor),
    });
    doc.text(`狗狗: ${order.dogName}`, secondColumnX, detailY, {
      width: secondColumnWidth,
    });
    detailY += rowHeight;

    if (order.recipientName) {
      doc.text(
        `收货人: ${this.truncateText(`${order.recipientName}（${order.recipientCity || '-'}）`, 26)}`,
        textX,
        detailY,
        { width: contentWidth },
      );
      detailY += rowHeight;
    }

    detailY += Math.floor(4 * scaleFactor);
    detailY += this.drawWrappedOrderText(
      doc,
      `分装: ${packagePlanSummary}`,
      textX,
      detailY,
      contentWidth,
      rowHeight,
    );

    if (order.adminRemark?.trim()) {
      detailY += Math.floor(4 * scaleFactor);
      doc.fontSize(Math.floor(7 * scaleFactor)).fillColor('#666666');
      this.drawWrappedOrderText(
        doc,
        `备注: ${this.truncateText(order.adminRemark, 56)}`,
        textX,
        detailY,
        contentWidth,
        rowHeight,
      );
    }
  }

  private getOrderPackagePlanSummary(order: PrintTaskOrderItemDto): {
    totalWeight: number;
    summary: string;
  } {
    const hasPackagePlan =
      Array.isArray(order.packagePlan) && order.packagePlan.length > 0;
    if (hasPackagePlan) {
      return {
        totalWeight: this.getPackagePlanTotalWeight(order.packagePlan || []),
        summary: this.formatPackagePlan(order.packagePlan || []),
      };
    }

    return {
      totalWeight: order.packageSpecG * order.packageCount,
      summary: `${order.packageSpecG}g×${order.packageCount}袋`,
    };
  }

  private drawWrappedOrderText(
    doc: any,
    text: string,
    x: number,
    y: number,
    width: number,
    minHeight: number,
  ): number {
    doc.text(text, x, y, {
      width,
      lineGap: 0,
    });
    return this.getWrappedOrderTextHeight(doc, text, width, minHeight);
  }

  private getWrappedOrderTextHeight(
    doc: any,
    text: string,
    width: number,
    minHeight: number,
  ): number {
    return Math.max(
      minHeight,
      Math.ceil(
        doc.heightOfString(text, {
          width,
          lineGap: 0,
        }),
      ),
    );
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

  /**
   * Draw ingredients section with scaling
   * Black and white design with table borders
   */
  private drawIngredients(
    doc: any,
    data: PrintTaskData,
    startY: number,
    scaleFactor: number,
  ): number {
    let y = startY + Math.floor(14 * scaleFactor);

    doc
      .fontSize(Math.floor(12 * scaleFactor))
      .fillColor('#333333')
      .font('Chinese-Bold')
      .text(`原料清单（${this.getPrintableIngredientCount(data)}项）`, 40, y);
    y += Math.floor(24 * scaleFactor);

    const tableWidth = 512;
    const columns: PrintTableColumn[] = [
      { key: 'type', label: '类型', x: 40, width: 48 },
      { key: 'name', label: '标准原料 / SKU', x: 88, width: 138 },
      { key: 'amount', label: '用量', x: 226, width: 60 },
      { key: 'purchase', label: '品牌 / 渠道 / 规格', x: 286, width: 148 },
      { key: 'method', label: '制备', x: 434, width: 118 },
    ];
    const headerHeight = Math.floor(18 * scaleFactor);

    doc
      .rect(40, y, tableWidth, headerHeight)
      .fillAndStroke('#f5f5f5', '#333333');
    doc
      .fontSize(Math.floor(7 * scaleFactor))
      .fillColor('#333333')
      .font('Chinese-Bold');
    columns.forEach((column) => {
      doc.text(column.label, column.x + 3, y + Math.floor(5 * scaleFactor), {
        width: column.width - 6,
      });
    });
    y += headerHeight;

    const tableTop = y - headerHeight;
    data.parsedIngredients.forEach((ing: IngredientItem) => {
      const fillColor = ing.isTotalWeight ? '#eef8f2' : '#ffffff';
      const rowHeight = this.calculateIngredientRowHeight(
        doc,
        ing,
        columns,
        scaleFactor,
      );
      doc
        .rect(40, y, tableWidth, rowHeight)
        .fillAndStroke(fillColor, '#dddddd');

      doc
        .fontSize(Math.floor(7 * scaleFactor))
        .fillColor(ing.isTotalWeight ? '#2f8f76' : '#333333')
        .font('Chinese');

      const textY = y + Math.floor(4 * scaleFactor);
      const amountText = `${ing.amount}${ing.unit}`;
      doc.text(ing.typeLabel || '-', columns[0].x + 3, textY, {
        width: columns[0].width - 6,
      });
      this.drawWrappedTableText(
        doc,
        this.formatIngredientNameLine(ing),
        columns[1].x + 3,
        textY,
        columns[1].width - 6,
      );
      doc.text(amountText, columns[2].x + 3, textY, {
        width: columns[2].width - 6,
      });
      this.drawWrappedTableText(
        doc,
        this.formatPurchaseSummary(ing),
        columns[3].x + 3,
        textY,
        columns[3].width - 6,
      );
      this.drawWrappedTableText(
        doc,
        ing.method || '-',
        columns[4].x + 3,
        textY,
        columns[4].width - 6,
      );
      y += rowHeight;
    });

    doc
      .rect(40, tableTop, tableWidth, y - tableTop)
      .strokeColor('#333333')
      .lineWidth(1)
      .stroke();

    return y;
  }

  private calculateIngredientRowHeight(
    doc: any,
    ingredient: IngredientItem,
    columns: PrintTableColumn[],
    scaleFactor: number,
  ): number {
    const minRowHeight = Math.floor(20 * scaleFactor);
    const verticalPadding = Math.floor(8 * scaleFactor);
    doc.fontSize(Math.floor(7 * scaleFactor)).font('Chinese');

    const nameHeight = this.getWrappedTableTextHeight(
      doc,
      this.formatIngredientNameLine(ingredient),
      columns[1].width - 6,
    );
    const purchaseHeight = this.getWrappedTableTextHeight(
      doc,
      this.formatPurchaseSummary(ingredient),
      columns[3].width - 6,
    );
    const methodHeight = this.getWrappedTableTextHeight(
      doc,
      ingredient.method || '-',
      columns[4].width - 6,
    );

    return Math.max(
      minRowHeight,
      nameHeight + verticalPadding,
      purchaseHeight + verticalPadding,
      methodHeight + verticalPadding,
    );
  }

  private drawWrappedTableText(
    doc: any,
    text: string,
    x: number,
    y: number,
    width: number,
  ): number {
    doc.text(text, x, y, {
      width,
      lineGap: 0,
    });
    return this.getWrappedTableTextHeight(doc, text, width);
  }

  private getWrappedTableTextHeight(
    doc: any,
    text: string,
    width: number,
  ): number {
    return Math.ceil(
      doc.heightOfString(text, {
        width,
        lineGap: 0,
      }),
    );
  }

  /**
   * Format date time
   */
  private formatDateTime(dateStr: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
}
