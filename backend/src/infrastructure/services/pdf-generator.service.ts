/**
 * PDF Generator Service
 * Generates PDF documents for production tasks
 */

import { Injectable } from '@nestjs/common';
const PDFDocument = require('pdfkit');
import * as path from 'path';

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

    // Orders: 现在每行两个订单，每行高度约75pt
    const orderRows = Math.ceil(data.orderItems.length / 2);
    estimatedHeight += orderRows * 75;

    // Ingredients table: 18pt per row + title + spacing + note
    estimatedHeight += 30 + 8 + data.parsedIngredients.length * 18 + 20;

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
  private drawHeader(
    doc: any,
    data: PrintTaskData,
    scaleFactor: number,
  ): number {
    const top = 40;
    let y = top;

    // Title
    const fontSize = Math.floor(20 * scaleFactor);
    doc
      .fontSize(fontSize)
      .font('Chinese-Bold')
      .fillColor('#000000')
      .text('SevenKitchen 生产任务单', { align: 'center' });
    y += Math.floor(30 * scaleFactor);

    // Recipe name and version
    doc
      .fontSize(Math.floor(16 * scaleFactor))
      .font('Chinese-Bold')
      .fillColor('#000000')
      .text(`${data.recipeName} v${data.recipeVersion}`, { align: 'center' });
    y += Math.floor(20 * scaleFactor);

    // Pot number
    doc
      .fontSize(Math.floor(12 * scaleFactor))
      .fillColor('#000000')
      .text(`第 ${data.currentPotNumber}/${data.totalPots} 锅`, {
        align: 'center',
      });
    y += Math.floor(16 * scaleFactor);

    // Meta info
    doc
      .fontSize(Math.floor(9 * scaleFactor))
      .fillColor('#000000')
      .text(`创建时间: ${this.formatDateTime(data.createdAt)}`, {
        align: 'center',
      });
    y += Math.floor(30 * scaleFactor);

    // Separator line - 黑色分隔线
    doc
      .moveTo(40, y)
      .lineTo(552, y)
      .strokeColor('#000000')
      .lineWidth(2)
      .stroke();

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
    let y = startY + Math.floor(20 * scaleFactor);

    // Section title
    doc
      .fontSize(Math.floor(12 * scaleFactor))
      .fillColor('#000000')
      .font('Chinese-Bold')
      .text('分装订单', 40, y);
    y += Math.floor(30 * scaleFactor); // 增加标题与表格的间距（从16改为30）

    // Two columns layout
    const cardWidth = Math.floor(252 * scaleFactor); // 每个订单卡片宽度 (512/2 - gap)
    const gap = Math.floor(8 * scaleFactor); // 两列之间的间距
    const cardHeight = Math.floor(65 * scaleFactor);

    data.orderItems.forEach((order, index) => {
      const isLeftColumn = index % 2 === 0;
      const cardX = isLeftColumn ? 40 : 40 + cardWidth + gap; // 左列或右列的X坐标

      // 如果是右列，需要回到同一行的Y坐标
      if (!isLeftColumn) {
        y -= cardHeight;
      }

      // Card border only - no background fill
      doc
        .rect(cardX, y, cardWidth, cardHeight)
        .strokeColor('#000000')
        .lineWidth(1)
        .stroke();
      const cardInnerY = y + Math.floor(8 * scaleFactor);

      // Order title bar - just text, no background
      const titleBarHeight = Math.floor(18 * scaleFactor);
      doc
        .fontSize(Math.floor(10 * scaleFactor))
        .fillColor('#000000')
        .font('Chinese-Bold')
        .text(
          `订单 ${index + 1}`,
          cardX + Math.floor(8 * scaleFactor),
          cardInnerY,
        );

      // Add a line below title
      doc
        .moveTo(cardX, cardInnerY + titleBarHeight - 2)
        .lineTo(cardX + cardWidth, cardInnerY + titleBarHeight - 2)
        .strokeColor('#000000')
        .lineWidth(0.5)
        .stroke();

      // Order details
      doc
        .fontSize(Math.floor(9 * scaleFactor))
        .fillColor('#000000')
        .font('Chinese');
      const detailsY = cardInnerY + Math.floor(12 * scaleFactor);
      const orderTotalWeight = order.packageSpecG * order.packageCount;

      const rowHeight = Math.floor(14 * scaleFactor);
      const textX = cardX + Math.floor(8 * scaleFactor);
      doc.text(`总净重: ${orderTotalWeight}g`, textX, detailsY);
      doc.text(`规格: ${order.packageSpecG}g/袋`, textX, detailsY + rowHeight);
      doc.text(
        `袋数: ${order.packageCount}袋`,
        textX + Math.floor(80 * scaleFactor),
        detailsY,
      );
      doc.text(
        `狗狗: ${order.dogName}`,
        textX + Math.floor(80 * scaleFactor),
        detailsY + rowHeight,
      );

      if (order.recipientName) {
        // 如果有收货人信息，紧凑显示
        doc
          .fontSize(Math.floor(8 * scaleFactor))
          .fillColor('#000000')
          .font('Chinese');
        doc.text(
          `${order.recipientName}（${order.recipientCity}）`,
          textX,
          detailsY + rowHeight * 2,
        );
      }

      y += cardHeight;
    });

    // 如果最后一个订单在左列，需要调整y位置
    if (data.orderItems.length % 2 !== 0) {
      y += cardHeight;
    }

    return y;
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
    let y = startY + Math.floor(20 * scaleFactor);

    // Section title
    doc
      .fontSize(Math.floor(12 * scaleFactor))
      .fillColor('#000000')
      .font('Chinese-Bold')
      .text(`原料清单（${data.parsedIngredients.length}项）`, 40, y);
    y += Math.floor(30 * scaleFactor); // 增加标题与表头的间距（从16改为30）

    // Table header - adjusted columns
    const colX = {
      type: 40,
      name: 70,
      amount: 160,
      method: 260,
    };
    const rowHeight = Math.floor(16 * scaleFactor);
    const tableWidth = 512;

    // Draw table header with border
    doc
      .rect(40, y, tableWidth, rowHeight)
      .strokeColor('#000000')
      .lineWidth(1)
      .stroke();
    doc
      .fontSize(Math.floor(8 * scaleFactor))
      .fillColor('#000000')
      .font('Chinese-Bold');
    doc.text('类型', colX.type, y + 4);
    doc.text('名称', colX.name, y + 4);
    doc.text('用量', colX.amount, y + 4);
    doc.text('制备方法', colX.method, y + 4);
    y += rowHeight;
    y += Math.floor(8 * scaleFactor); // 增加表头与内容行的间距（新增8pt）

    // Table rows
    data.parsedIngredients.forEach((ing) => {
      // Draw row border - no background fill
      doc
        .rect(40, y, tableWidth, rowHeight)
        .strokeColor('#000000')
        .lineWidth(1)
        .stroke();

      doc
        .fontSize(Math.floor(8 * scaleFactor))
        .fillColor('#000000')
        .font('Chinese');
      doc.text(ing.typeLabel || '-', colX.type, y + 4);
      doc.text(ing.name, colX.name, y + 4);
      // Combine amount and unit
      const amountText = `${ing.amount}${ing.unit}`;
      doc.text(amountText, colX.amount, y + 4);
      doc.text(ing.method || '-', colX.method, y + 4);
      y += rowHeight;

      // No pagination - must fit on one page
    });

    // Draw bottom border of the table
    doc
      .rect(40, y - rowHeight, tableWidth, rowHeight)
      .strokeColor('#000000')
      .lineWidth(1)
      .stroke();

    // Note
    y += Math.floor(12 * scaleFactor);
    doc
      .fontSize(Math.floor(7 * scaleFactor))
      .fillColor('#000000')
      .font('Chinese')
      .text('注：用量已包含生产损耗', 40, y, { align: 'center' });

    return y;
  }

  /**
   * Draw footer section with scaling
   * Black and white design
   */
  private drawFooter(
    doc: any,
    data: PrintTaskData,
    currentY: number,
    scaleFactor: number,
  ): void {
    // Add padding before footer
    const footerY = currentY + Math.floor(30 * scaleFactor);

    // Ensure footer doesn't exceed page
    const maxY = 752; // page.height - margins - footer padding
    const actualY = Math.min(footerY, maxY);

    // Separator - 黑色分隔线
    if (actualY < maxY - 40) {
      doc
        .moveTo(40, actualY)
        .lineTo(552, actualY)
        .strokeColor('#000000')
        .lineWidth(1)
        .stroke();
    }

    // Footer text - 黑色
    const footerTextY = Math.max(actualY + 15, maxY - 35);
    doc
      .fontSize(Math.floor(8 * scaleFactor))
      .fillColor('#000000')
      .font('Chinese')
      .text('SevenKitchen 专业鲜食套餐定制', 40, footerTextY, {
        align: 'center',
      });
    doc
      .fontSize(Math.floor(8 * scaleFactor))
      .fillColor('#000000')
      .font('Chinese')
      .text(
        `制作人: ${data.createdBy || '厨房管理员'}`,
        40,
        footerTextY + Math.floor(12 * scaleFactor),
        { align: 'center' },
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
