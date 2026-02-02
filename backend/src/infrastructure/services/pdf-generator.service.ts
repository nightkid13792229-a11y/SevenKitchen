/**
 * PDF Generator Service
 * Generates PDF documents for production tasks
 */

import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

interface IngredientItem {
  name: string;
  amount: string;
  unit: string;
  typeLabel: string;
  typeClass: string;
  method: string;
  isTotalWeight?: boolean;
}

interface OrderItem {
  packageSpecG: number;
  packageCount: number;
  dogName: string;
  recipientName?: string;
  recipientCity?: string;
}

interface PrintTaskData {
  recipeName: string;
  recipeVersion: string;
  currentPotNumber: number;
  totalPots: number;
  status: string;
  totalProductionG: number;
  createdAt: string;
  completedAt?: string;
  orderItems: OrderItem[];
  parsedIngredients: IngredientItem[];
  createdBy?: string;
}

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

        // Collect buffers
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
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
        currentY = this.drawIngredients(doc, data, currentY, scaleFactor);
        this.drawFooter(doc, data, currentY, scaleFactor);

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
    const pageWidth = 512; // A4 width - margins

    // Estimate content height
    let estimatedHeight = 0;

    // Header: ~100pt
    estimatedHeight += 100;

    // Orders: 70pt per order
    estimatedHeight += data.orderItems.length * 70;

    // Ingredients table: 18pt per row + title + note
    estimatedHeight += 30 + (data.parsedIngredients.length * 18) + 20;

    // Footer: ~60pt
    estimatedHeight += 60;

    // Safety margin: 40pt
    const availableHeight = pageHeight - 40;

    // Calculate scale factor
    if (estimatedHeight > availableHeight) {
      const scale = availableHeight / estimatedHeight;
      // Minimum scale 0.7 (don't shrink too much)
      return Math.max(scale, 0.7);
    }

    return 1.0;
  }

  /**
   * Draw header section with scaling
   */
  private drawHeader(doc: PDFDocument.PDFDocument, data: PrintTaskData, scaleFactor: number): number {
    const top = 40;
    let y = top;

    // Title
    const fontSize = Math.floor(20 * scaleFactor);
    doc.fontSize(fontSize).font('Helvetica-Bold').text('SevenKitchen 生产任务单', { align: 'center' });
    y += Math.floor(30 * scaleFactor);

    // Recipe name and version
    doc.fontSize(Math.floor(16 * scaleFactor)).font('Helvetica-Bold').text(`${data.recipeName} v${data.recipeVersion}`, { align: 'center' });
    y += Math.floor(20 * scaleFactor);

    // Pot number
    doc.fontSize(Math.floor(12 * scaleFactor)).fillColor('#56AB91').text(`第 ${data.currentPotNumber}/${data.totalPots} 锅`, { align: 'center' });
    y += Math.floor(16 * scaleFactor);

    // Meta info
    doc.fontSize(Math.floor(9 * scaleFactor)).fillColor('#666666').text(
      `创建时间: ${this.formatDateTime(data.createdAt)}`,
      { align: 'center' }
    );
    y += Math.floor(30 * scaleFactor);

    // Separator line
    doc.moveTo(40, y).lineTo(552, y).strokeColor('#56AB91').lineWidth(2).stroke();

    return y;
  }

  /**
   * Draw packaging orders section with scaling
   */
  private drawPackagingOrders(doc: PDFDocument.PDFDocument, data: PrintTaskData, startY: number, scaleFactor: number): number {
    let y = startY + Math.floor(20 * scaleFactor);

    // Section title
    doc.fontSize(Math.floor(12 * scaleFactor)).fillColor('#000000').font('Helvetica-Bold').text('分装订单', 40, y);
    y += Math.floor(16 * scaleFactor);

    // Orders
    data.orderItems.forEach((order, index) => {
      // Card background - compressed height
      const cardHeight = Math.floor(65 * scaleFactor);
      doc.rect(40, y, 512, cardHeight).fillAndStroke('#F9F9F9', '#E0E0E0');
      y += Math.floor(8 * scaleFactor);

      // Order title bar
      const titleBarHeight = Math.floor(18 * scaleFactor);
      doc.fontSize(Math.floor(10 * scaleFactor)).fillColor('#FFFFFF').font('Helvetica-Bold')
        .rect(40, y - 2, 512, titleBarHeight).fill('#56AB91')
        .fillColor('#FFFFFF')
        .text(`订单 ${index + 1}`, 48, y);

      // Order details
      doc.fontSize(Math.floor(9 * scaleFactor)).fillColor('#333333').font('Helvetica');
      const detailsY = y + Math.floor(12 * scaleFactor);
      const orderTotalWeight = order.packageSpecG * order.packageCount;

      const rowHeight = Math.floor(14 * scaleFactor);
      doc.text(`总净重: ${orderTotalWeight}g`, 48, detailsY);
      doc.text(`规格: ${order.packageSpecG}g/袋`, 160, detailsY);
      doc.text(`袋数: ${order.packageCount}袋`, 260, detailsY);
      doc.text(`狗狗: ${order.dogName}`, 48, detailsY + rowHeight);

      if (order.recipientName) {
        doc.text(`收货人: ${order.recipientName}（${order.recipientCity}）`, 160, detailsY + rowHeight);
      }

      y += cardHeight;
    });

    return y;
  }

  /**
   * Draw ingredients section with scaling
   */
  private drawIngredients(doc: PDFDocument.PDFDocument, data: PrintTaskData, startY: number, scaleFactor: number): number {
    let y = startY + Math.floor(20 * scaleFactor);

    // Section title
    doc.fontSize(Math.floor(12 * scaleFactor)).fillColor('#000000').font('Helvetica-Bold').text(`原料清单（${data.parsedIngredients.length}项）`, 40, y);
    y += Math.floor(16 * scaleFactor);

    // Table header - adjusted columns
    const colX = {
      type: 40,
      name: 70,
      amount: 160,
      method: 260
    };
    const rowHeight = Math.floor(16 * scaleFactor);

    doc.rect(40, y, 512, rowHeight).fill('#F5F5F5');
    doc.fontSize(Math.floor(8 * scaleFactor)).fillColor('#000000').font('Helvetica-Bold');
    doc.text('类型', colX.type, y + 4);
    doc.text('名称', colX.name, y + 4);
    doc.text('用量', colX.amount, y + 4);
    doc.text('制备方法', colX.method, y + 4);
    y += rowHeight;

    // Table rows
    data.parsedIngredients.forEach((ing) => {
      // Alternate row color
      if (ing.isTotalWeight) {
        doc.rect(40, y, 512, rowHeight).fill('#E8F5E9');
      } else if (y % (rowHeight * 2) === 0) {
        doc.rect(40, y, 512, rowHeight).fill('#FAFAFA');
      }

      doc.fontSize(Math.floor(8 * scaleFactor)).fillColor('#333333').font('Helvetica');
      doc.text(ing.typeLabel || '-', colX.type, y + 4);
      doc.text(ing.name, colX.name, y + 4);
      // Combine amount and unit
      const amountText = `${ing.amount}${ing.unit}`;
      doc.text(amountText, colX.amount, y + 4);
      doc.text(ing.method || '-', colX.method, y + 4);
      y += rowHeight;

      // No pagination - must fit on one page
    });

    // Note
    y += Math.floor(12 * scaleFactor);
    doc.fontSize(Math.floor(7 * scaleFactor)).fillColor('#999999').text('注：用量已包含生产损耗', 40, y, { align: 'center' });

    return y;
  }

  /**
   * Draw footer section with scaling
   */
  private drawFooter(doc: PDFDocument.PDFDocument, data: PrintTaskData, currentY: number, scaleFactor: number): void {
    // Add padding before footer
    const footerY = currentY + Math.floor(30 * scaleFactor);

    // Ensure footer doesn't exceed page
    const maxY = 752; // page.height - margins - footer padding
    const actualY = Math.min(footerY, maxY);

    // Separator
    if (actualY < maxY - 40) {
      doc.moveTo(40, actualY).lineTo(552, actualY).strokeColor('#E0E0E0').lineWidth(1).stroke();
    }

    // Footer text
    const footerTextY = Math.max(actualY + 15, maxY - 35);
    doc.fontSize(Math.floor(8 * scaleFactor)).fillColor('#999999').text('SevenKitchen 专业鲜食套餐定制', 40, footerTextY, { align: 'center' });
    doc.fontSize(Math.floor(8 * scaleFactor)).fillColor('#999999').text(`制作人: ${data.createdBy || '厨房管理员'}`, 40, footerTextY + Math.floor(12 * scaleFactor), { align: 'center' });
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
