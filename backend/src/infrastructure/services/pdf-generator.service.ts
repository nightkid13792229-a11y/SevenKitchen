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
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
        });

        // Collect buffers
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Add font for Chinese support (use built-in fonts)
        // Note: pdfkit default fonts don't support Chinese well
        // For production, consider registering a Chinese font

        // Header section
        this.drawHeader(doc, data);

        // Packaging orders section
        this.drawPackagingOrders(doc, data);

        // Ingredients section
        this.drawIngredients(doc, data);

        // Footer section
        this.drawFooter(doc, data);

        // Finalize PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Draw header section
   */
  private drawHeader(doc: PDFDocument.PDFDocument, data: PrintTaskData): void {
    const { top } = doc.page.margin;
    let y = top;

    // Title
    doc.fontSize(24).font('Helvetica-Bold').text('SevenKitchen 生产任务单', { align: 'center' });
    y += 40;

    // Recipe name and version
    doc.fontSize(18).font('Helvetica-Bold').text(`${data.recipeName} v${data.recipeVersion}`, { align: 'center' });
    y += 25;

    // Pot number
    doc.fontSize(14).fillColor('#56AB91').text(`第 ${data.currentPotNumber}/${data.totalPots} 锅`, { align: 'center' });
    y += 20;

    // Meta info
    doc.fontSize(10).fillColor('#666666').text(
      `创建时间: ${this.formatDateTime(data.createdAt)}`,
      { align: 'center' }
    );
    y += 40;

    // Separator line
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#56AB91').lineWidth(2).stroke();
  }

  /**
   * Draw packaging orders section
   */
  private drawPackagingOrders(doc: PDFDocument.PDFDocument, data: PrintTaskData): void {
    let y = doc.page.margin.top + 170;

    // Section title
    doc.fontSize(14).fillColor('#000000').font('Helvetica-Bold').text('分装订单', 50, y);
    y += 20;

    // Orders
    data.orderItems.forEach((order, index) => {
      // Card background
      doc.rect(50, y, 495, 80).fillAndStroke('#F9F9F9', '#E0E0E0');
      y += 10;

      // Order title
      doc.fontSize(11).fillColor('#FFFFFF').font('Helvetica-Bold')
        .rect(50, y - 10, 495, 20).fill('#56AB91')
        .fillColor('#FFFFFF')
        .text(`订单 ${index + 1}`, 60, y - 5);

      // Order details
      doc.fontSize(10).fillColor('#333333').font('Helvetica');
      const detailsY = y + 8;
      const totalWeight = data.totalProductionG;

      doc.text(`总净重: ${totalWeight}g`, 60, detailsY);
      doc.text(`规格: ${order.packageSpecG}g/袋`, 200, detailsY);
      doc.text(`袋数: ${order.packageCount}袋`, 320, detailsY);
      doc.text(`狗狗: ${order.dogName}`, 60, detailsY + 15);

      if (order.recipientName) {
        doc.text(`收货人: ${order.recipientName}（${order.recipientCity}）`, 200, detailsY + 15);
      }

      y += 80;
    });
  }

  /**
   * Draw ingredients section
   */
  private drawIngredients(doc: PDFDocument.PDFDocument, data: PrintTaskData): void {
    let y = doc.y + 20;

    // Section title
    doc.fontSize(14).fillColor('#000000').font('Helvetica-Bold').text(`原料清单（${data.parsedIngredients.length}项）`, 50, y);
    y += 25;

    // Table header
    const colX = { type: 50, name: 100, amount: 300, unit: 380, method: 430 };
    const rowHeight = 20;

    doc.rect(50, y, 495, rowHeight).fill('#F5F5F5');
    doc.fontSize(9).fillColor('#000000').font('Helvetica-Bold');
    doc.text('类型', colX.type, y + 5);
    doc.text('名称', colX.name, y + 5);
    doc.text('用量', colX.amount, y + 5);
    doc.text('单位', colX.unit, y + 5);
    doc.text('制备方法', colX.method, y + 5);
    y += rowHeight;

    // Table rows
    data.parsedIngredients.forEach((ing) => {
      // Alternate row color
      if (ing.isTotalWeight) {
        doc.rect(50, y, 495, rowHeight).fill('#E8F5E9');
      } else if (y % (rowHeight * 2) === 0) {
        doc.rect(50, y, 495, rowHeight).fill('#FAFAFA');
      }

      doc.fontSize(8).fillColor('#333333').font('Helvetica');
      doc.text(ing.typeLabel || '-', colX.type, y + 5);
      doc.text(ing.name, colX.name, y + 5);
      doc.text(ing.amount, colX.amount, y + 5);
      doc.text(ing.unit, colX.unit, y + 5);
      doc.text(ing.method || '-', colX.method, y + 5);
      y += rowHeight;

      // Check if need new page
      if (y > 750) {
        doc.addPage();
        y = doc.page.margin.top;
      }
    });

    // Note
    y += 15;
    doc.fontSize(8).fillColor('#999999').text('注：用量已包含生产损耗', 50, y, { align: 'center' });
  }

  /**
   * Draw footer section
   */
  private drawFooter(doc: PDFDocument.PDFDocument, data: PrintTaskData): void {
    doc.addPage();
    const y = doc.page.height - 100;

    // Separator
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#E0E0E0').lineWidth(1).stroke();

    // Footer text
    doc.fontSize(10).fillColor('#999999').text('SevenKitchen 专业鲜食套餐定制', 50, y + 20, { align: 'center' });
    doc.text(`制作人: ${data.createdBy || '厨房管理员'}`, 50, y + 40, { align: 'center' });
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
