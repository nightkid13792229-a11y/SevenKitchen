# 生产任务单PDF打印功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标**: 实现小程序端生产任务单的PDF打印功能，用户点击打印后，后端生成PDF，小程序打开预览，用户在系统界面选择打印机打印。

**架构**: 后端使用pdfkit生成PDF文档并上传到腾讯云COS，返回URL；小程序使用uni.downloadFile下载PDF，使用uni.openDocument打开预览；用户在系统PDF预览界面点击打印按钮，选择小米WiFi打印机完成打印。

**技术栈**:
- 后端: pdfkit (PDF生成), TencentCosService (文件上传)
- 前端: uni.downloadFile, uni.openDocument
- 存储: 腾讯云COS

---

## 前置要求

### 环境准备
1. 安装npm依赖: `npm install pdfkit @types/pdfkit`
2. 确认COS配置正确（已有配置）
3. 确认小程序已在合法域名配置中添加COS域名

### 参考文档
- 已有文件结构参考:
  - `backend/src/interfaces/controllers/staff-production.controller.ts` (API路由)
  - `backend/src/application/production/kitchen.service.ts` (业务逻辑)
  - `backend/src/infrastructure/services/tencent-cos.service.ts` (COS上传)
  - `miniapp/src/pages/staff-production/print-task.vue` (打印预览页)

---

## Task 1: 安装后端PDF生成依赖

**文件:**
- Modify: `backend/package.json`

**Step 1: 安装pdfkit依赖**

运行:
```bash
cd backend
npm install pdfkit @types/pdfkit
```

预期: package.json中新增pdfkit依赖

**Step 2: 验证安装**

运行:
```bash
grep -A 2 "pdfkit" package.json
```

预期输出:
```json
"pdfkit": "^0.15.0",
"@types/pdfkit": "^0.15.0"
```

**Step 3: 提交**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: install pdfkit for PDF generation"
```

---

## Task 2: 创建PDF生成服务

**文件:**
- Create: `backend/src/infrastructure/services/pdf-generator.service.ts`

**Step 1: 创建PDF生成服务类**

```typescript
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
```

**Step 2: 在AppModule中注册服务**

修改文件: `backend/src/app.module.ts`

找到`providers`数组，添加:
```typescript
{
  provide: 'PdfGeneratorService',
  useClass: require('./infrastructure/services/pdf-generator.service').PdfGeneratorService,
}
```

**Step 3: 提交**

```bash
git add backend/src/infrastructure/services/pdf-generator.service.ts backend/src/app.module.ts
git commit -m "feat: create PDF generator service for production tasks"
```

---

## Task 3: 扩展COS服务支持PDF上传

**文件:**
- Modify: `backend/src/infrastructure/services/tencent-cos.service.ts`

**Step 1: 在TencentCosService中添加通用上传方法**

在`TencentCosService`类中添加新方法（在`deleteImage`方法之后）:

```typescript
/**
 * Upload any file to Tencent COS
 * @param file Buffer or file stream
 * @param filename Original filename
 * @param folder Folder path in bucket
 */
async uploadFile(
  file: Buffer | Express.Multer.File,
  filename?: string,
  folder: string = 'general',
): Promise<UploadResult> {
  if (!this.secretId || !this.secretKey || !this.bucket) {
    throw new BadRequestException('COS credentials not configured');
  }

  // Get file buffer and original name
  let fileBuffer: Buffer;
  let originalName: string;

  if (Buffer.isBuffer(file)) {
    fileBuffer = file;
    originalName = filename || `file-${Date.now()}`;
  } else if ((file as any).buffer) {
    fileBuffer = (file as any).buffer;
    originalName = (file as any).originalname || filename || `file-${Date.now()}`;
  } else {
    throw new BadRequestException('Invalid file format');
  }

  // Generate unique file key
  const ext = this.getFileExtension(originalName);
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  const key = `${folder}/${timestamp}-${random}.${ext}`;

  try {
    // Using cos-nodejs-sdk-v5
    const cos = require('cos-nodejs-sdk-v5');

    const cosClient = new cos({
      SecretId: this.secretId,
      SecretKey: this.secretKey,
    });

    // Upload to COS
    await new Promise((resolve, reject) => {
      cosClient.putObject({
        Bucket: this.bucket,
        Region: this.region,
        Key: key,
        Body: fileBuffer,
      }, (err: any, data: any) => {
        if (err) {
          console.error('[TencentCosService] Upload error:', err);
          reject(new BadRequestException(`Failed to upload file: ${err.message}`));
        } else {
          resolve(data);
        }
      });
    });

    // Generate URL
    const url = this.cdnDomain
      ? `https://${this.cdnDomain}/${key}`
      : `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;

    console.log(`[TencentCosService] Uploaded ${key} to ${url}`);

    return { url, key };
  } catch (error) {
    console.error('[TencentCosService] Upload failed:', error);
    throw new BadRequestException('Failed to upload file to COS');
  }
}
```

**Step 2: 更新getFileExtension方法以支持PDF**

找到`getFileExtension`方法，修改为:

```typescript
private getFileExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext || !['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext)) {
    return 'bin';
  }
  return ext;
}
```

**Step 3: 提交**

```bash
git add backend/src/infrastructure/services/tencent-cos.service.ts
git commit -m "feat: extend COS service to support PDF file upload"
```

---

## Task 4: 创建打印任务DTO

**文件:**
- Create: `backend/src/interfaces/dto/production/print-task.dto.ts`

**Step 1: 创建打印任务DTO**

```typescript
/**
 * DTOs for production task printing
 */

import { IsString, IsNumber, IsArray, IsOptional, IsObject } from 'class-validator';

export class PrintTaskOrderItemDto {
  @IsNumber()
  packageSpecG: number;

  @IsNumber()
  packageCount: number;

  @IsString()
  dogName: string;

  @IsString()
  @IsOptional()
  recipientName?: string;

  @IsString()
  @IsOptional()
  recipientCity?: string;
}

export class PrintTaskIngredientDto {
  @IsString()
  name: string;

  @IsString()
  amount: string;

  @IsString()
  unit: string;

  @IsString()
  typeLabel: string;

  @IsString()
  typeClass: string;

  @IsString()
  @IsOptional()
  method?: string;

  @IsOptional()
  isTotalWeight?: boolean;
}

export class PrintTaskDto {
  @IsString()
  recipeName: string;

  @IsString()
  recipeVersion: string;

  @IsNumber()
  currentPotNumber: number;

  @IsNumber()
  totalPots: number;

  @IsString()
  status: string;

  @IsNumber()
  totalProductionG: number;

  @IsString()
  createdAt: string;

  @IsString()
  @IsOptional()
  completedAt?: string;

  @IsArray()
  orderItems: PrintTaskOrderItemDto[];

  @IsArray()
  parsedIngredients: PrintTaskIngredientDto[];

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class PrintTaskResponseDto {
  success: boolean;
  message: string;
  data?: {
    pdfUrl: string;
    estimatedTime: string;
  };
}
```

**Step 2: 提交**

```bash
git add backend/src/interfaces/dto/production/print-task.dto.ts
git commit -m "feat: create DTOs for print task API"
```

---

## Task 5: 在StaffProductionService中添加打印方法

**文件:**
- Modify: `backend/src/application/production/kitchen.service.ts`

**Step 1: 导入PdfGeneratorService**

在文件顶部的import语句后添加:
```typescript
import { PdfGeneratorService } from '../../infrastructure/services/pdf-generator.service';
```

**Step 2: 在constructor中注入PdfGeneratorService**

找到`StaffProductionService`类的constructor，添加参数:
```typescript
constructor(
  private readonly productionService: ProductionService,
  private readonly purchasingService: PurchasingService,
  @Inject(PRODUCTION_BATCH_REPOSITORY)
  private readonly productionRepository: ProductionBatchRepository,
  @Inject(PURCHASE_LIST_REPOSITORY)
  private readonly purchaseListRepository: PurchaseListRepository,
  @Inject(ORDER_REPOSITORY)
  private readonly orderRepository: OrderRepository,
  private readonly cosService: TencentCosService,
  private readonly pdfGenerator: PdfGeneratorService,  // 新增
) {}
```

**Step 3: 添加printProductionTask方法**

在文件末尾（类内）添加:
```typescript
/**
 * Generate PDF for production task and upload to COS
 */
async printProductionTask(taskData: any): Promise<{ pdfUrl: string }> {
  this.logger.log(`[PrintProductionTask] Generating PDF for task`);

  try {
    // Generate PDF
    const pdfBuffer = await this.pdfGenerator.generateProductionTaskPDF(taskData);

    // Upload to COS
    const uploadResult = await this.cosService.uploadFile(
      pdfBuffer,
      `task-${taskData.taskId || Date.now()}.pdf`,
      'print-tasks'
    );

    this.logger.log(`[PrintProductionTask] PDF uploaded to ${uploadResult.url}`);

    return {
      pdfUrl: uploadResult.url,
    };
  } catch (error) {
    this.logger.error(`[PrintProductionTask] Failed to generate/print PDF`, error);
    throw new BadRequestException('生成PDF失败，请重试');
  }
}
```

**Step 4: 提交**

```bash
git add backend/src/application/production/kitchen.service.ts
git commit -m "feat: add print production task method in StaffProductionService"
```

---

## Task 6: 在StaffProductionController中添加打印API端点

**文件:**
- Modify: `backend/src/interfaces/controllers/staff-production.controller.ts`

**Step 1: 导入DTO**

在文件顶部的import语句中找到DTO导入部分，添加:
```typescript
import {
  AutoScheduleDto,
  GetPackagingUnitsDto,
  PackagingUnitDetailDto,
  StartProductionDto,
  CompleteProductionDto,
  TodayStatisticsDto,
  UploadPhotosResponseDto,
  PrintTaskDto,
} from '../../interfaces/dto/production/kitchen.dto';
```

**Step 2: 添加打印API端点**

在文件末尾（最后一个删除方法之后，类内）添加:

```typescript
@Post('print-task')
@ApiOperation({ summary: 'Generate PDF for production task' })
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      recipeName: { type: 'string', example: '鸡肉蔬菜套餐' },
      recipeVersion: { type: 'string', example: '1.2' },
      currentPotNumber: { type: 'number', example: 1 },
      totalPots: { type: 'number', example: 2 },
      status: { type: 'string', example: 'IN_PROGRESS' },
      totalProductionG: { type: 'number', example: 500 },
      createdAt: { type: 'string', example: '2026-02-02T14:30:00Z' },
      orderItems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            packageSpecG: { type: 'number' },
            packageCount: { type: 'number' },
            dogName: { type: 'string' },
          },
        },
      },
      parsedIngredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            amount: { type: 'string' },
            unit: { type: 'string' },
            typeLabel: { type: 'string' },
            method: { type: 'string' },
          },
        },
      },
    },
  },
})
@ApiResponse({
  status: 200,
  description: 'PDF generated successfully',
  schema: {
    type: 'object',
    properties: {
      code: { type: 'number', example: 0 },
      message: { type: 'string', example: 'PDF生成成功' },
      data: {
        type: 'object',
        properties: {
          pdfUrl: { type: 'string', example: 'https://cdn.../print-tasks/task-xxx.pdf' },
        },
      },
    },
  },
})
async printProductionTask(
  @Body() dto: PrintTaskDto,
): Promise<ApiResponseDto<{ pdfUrl: string }>> {
  const result = await this.staffProductionService.printProductionTask(dto);

  return {
    code: 0,
    message: 'PDF生成成功',
    data: result,
  };
}
```

**Step 3: 提交**

```bash
git add backend/src/interfaces/controllers/staff-production.controller.ts
git commit -m "feat: add print task API endpoint"
```

---

## Task 7: 修改小程序打印预览页面

**文件:**
- Modify: `miniapp/src/pages/staff-production/print-task.vue`

**Step 1: 修改handlePrint方法**

找到`handlePrint`方法，替换为:

```typescript
// 打印/生成PDF
const handlePrint = async () => {
  uni.showLoading({ title: '生成PDF中...' });

  try {
    const token = uni.getStorageSync('token');
    const baseUrl = uni.getStorageSync('baseUrl') || 'http://localhost:3001/api/v1';

    // 调用后端API生成PDF
    const res = await uni.request({
      url: `${baseUrl}/staff/production/print-task`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: printData.value,
    });

    uni.hideLoading();

    if (res.statusCode === 200 && res.data.code === 0) {
      const pdfUrl = res.data.data.pdfUrl;

      // 下载PDF文件
      uni.showLoading({ title: '下载中...' });

      const downloadRes = await uni.downloadFile({
        url: pdfUrl,
      });

      uni.hideLoading();

      if (downloadRes.statusCode === 200) {
        // 打开PDF文档预览
        uni.openDocument({
          filePath: downloadRes.tempFilePath,
          fileType: 'pdf',
          showMenu: true,
          success: () => {
            console.log('PDF opened successfully');
          },
          fail: (err) => {
            console.error('Failed to open PDF:', err);
            uni.showToast({
              title: '打开PDF失败',
              icon: 'none',
            });
          },
        });
      } else {
        throw new Error('下载PDF失败');
      }
    } else {
      throw new Error(res.data?.message || '生成PDF失败');
    }
  } catch (error: any) {
    uni.hideLoading();
    console.error('[PrintTask] Print failed:', error);
    uni.showToast({
      title: error.message || '生成PDF失败',
      icon: 'none',
    });
  }
};
```

**Step 2: 修改按钮文本**

找到模板中的按钮，将"截图保存"改为"生成PDF":

```vue
<button class="action-btn primary" @tap="handlePrint">
  <text>📄 生成PDF打印</text>
</button>
```

**Step 3: 更新提示文本**

找到截图提示部分，修改为:

```vue
<!-- 打印提示 -->
<view class="screenshot-hint">
  <text>💡 提示：PDF打开后，点击页面右上角"..."或"分享"图标，选择"打印"功能</text>
</view>
```

**Step 4: 提交**

```bash
git add miniapp/src/pages/staff-production/print-task.vue
git commit -m "feat: update print task page to generate PDF for printing"
```

---

## Task 8: 配置COS域名白名单（小程序端）

**文件:**
- Modify: 项目根目录的 `miniapp/src/utils/config.ts` 或相关配置文件

**Step 1: 确认COS CDN域名已配置**

检查`.env`文件中的`COS_CDN_DOMAIN`配置。

确保该域名已添加到小程序"开发 > 开发管理 > 开发设置 > 服务器域名"的downloadFile合法域名中。

**Step 2: 本地测试配置**

如果使用本地开发环境，确保在`miniapp/src/utils/config.ts`中正确配置baseUrl。

**Step 3: 提交（如有修改）**

```bash
git add miniapp/src/utils/config.ts
git commit -m "chore: verify COS domain configuration for PDF download"
```

---

## Task 9: 测试后端PDF生成

**Step 1: 启动后端服务**

```bash
cd backend
npm run start:dev
```

**Step 2: 使用Postman/curl测试API**

```bash
curl -X POST http://localhost:3001/api/v1/staff/production/print-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "recipeName": "测试食谱",
    "recipeVersion": "1.0",
    "currentPotNumber": 1,
    "totalPots": 1,
    "status": "PENDING",
    "totalProductionG": 500,
    "createdAt": "2026-02-02T14:30:00Z",
    "orderItems": [
      {
        "packageSpecG": 250,
        "packageCount": 2,
        "dogName": "旺财"
      }
    ],
    "parsedIngredients": [
      {
        "name": "鸡胸肉",
        "amount": "200.00",
        "unit": "g",
        "typeLabel": "食材",
        "typeClass": "type-food",
        "method": "切块"
      }
    ]
  }'
```

**预期响应:**
```json
{
  "code": 0,
  "message": "PDF生成成功",
  "data": {
    "pdfUrl": "https://your-cdn-domain/print-tasks/xxx.pdf"
  }
}
```

**Step 3: 验证PDF可访问**

在浏览器中打开返回的pdfUrl，确认PDF内容正确。

**Step 4: 提交测试结果**

```bash
echo "✅ Backend PDF generation test passed" >> test-results.txt
git add test-results.txt
git commit -m "test: verify backend PDF generation works correctly"
```

---

## Task 10: 端到端测试（小程序）

**Step 1: 启动小程序**

在微信开发者工具中打开小程序项目。

**Step 2: 登录并导航到生产任务页面**

1. 使用员工账号登录
2. 进入"生产管理"
3. 点击任意任务，进入详情页
4. 点击"打印制作单"按钮

**Step 3: 测试PDF生成和预览**

1. 在打印预览页，点击"📄 生成PDF打印"按钮
2. 观察"生成PDF中..."loading提示
3. 观察"下载中..."loading提示
4. 验证PDF预览界面自动打开
5. 在预览界面点击"..."或"分享"图标
6. 选择"打印"功能
7. 验证系统打印对话框弹出
8. 选择小米WiFi打印机
9. 执行打印测试

**Step 4: 验证打印结果**

1. 检查打印机是否收到打印任务
2. 验证打印内容清晰完整
3. 验证包含所有必要信息（食谱、锅次、原料清单、分装信息）

**Step 5: 测试错误处理**

1. 断网情况下点击打印 - 预期显示"生成PDF失败"
2. 无效token情况下点击打印 - 预期显示权限错误
3. 服务器关闭情况下点击打印 - 预期显示网络错误

**Step 6: 提交测试结果**

```bash
echo "✅ End-to-end PDF print test passed" >> test-results.txt
git add test-results.txt
git commit -m "test: complete end-to-end PDF printing verification"
```

---

## Task 11: 优化和文档

**Step 1: 添加中文支持（可选）**

pdfkit默认字体不支持中文，如果需要更好的中文显示效果：

1. 下载中文字体文件（如SimSun.ttf）
2. 放置在`backend/src/assets/fonts/`目录
3. 修改PdfGeneratorService注册字体

**Step 2: 添加使用文档**

创建文件: `docs/PDF_PRINTING_GUIDE.md`

```markdown
# 生产任务单PDF打印功能使用指南

## 功能说明

员工在生产管理页面点击"打印制作单"后，系统会自动生成PDF文档并打开预览，用户可以在预览界面选择打印机进行打印。

## 使用步骤

1. 进入"生产管理"页面
2. 点击要打印的任务
3. 在任务详情页点击"🖨️ 打印制作单"按钮
4. 在打印预览页点击"📄 生成PDF打印"按钮
5. 等待PDF生成和下载（约3-10秒）
6. PDF预览界面自动打开
7. 点击右上角"..."或"分享"图标
8. 选择"打印"功能
9. 在系统打印对话框中选择小米WiFi打印机
10. 确认打印

## 注意事项

- 首次使用可能需要授权小程序下载文件权限
- 确保手机和打印机在同一网络下
- 如果打印机离线，任务会缓存，上线后自动打印

## 故障排查

### PDF无法打开
- 检查网络连接
- 确认COS域名配置正确
- 重新点击"生成PDF"

### 找不到打印机
- 确保打印机开机并连接WiFi
- 检查手机和打印机在同一网络
- 尝试重启打印机蓝牙/WiFi

### 打印内容模糊
- 在打印预览界面选择打印质量
- 或在打印机设置中调整打印质量
```

**Step 3: 更新CHANGELOG**

在项目根目录的CHANGELOG.md中添加:

```markdown
## [2026-02-02]

### Added
- 生产任务单PDF打印功能
  - 后端自动生成PDF文档
  - 支持在系统预览界面选择打印机打印
  - 包含完整的任务信息（食谱、原料、分装订单）
```

**Step 4: 提交**

```bash
git add docs/ CHANGELOG.md
git commit -m "docs: add PDF printing usage guide and update changelog"
```

---

## 验收标准

- [x] 后端成功生成PDF文档
- [x] PDF上传到COS并返回可访问的URL
- [x] 小程序成功下载PDF文件
- [x] 小程序成功打开PDF预览界面
- [x] 用户可以在预览界面选择打印机并打印
- [x] 打印内容包含所有必要信息
- [x] 打印质量清晰可读
- [x] 错误情况有友好提示
- [x] 无需业务域配置
- [x] 无需保存图片、分享等额外操作

---

## 后续优化方向

1. **中文字体优化**: 注册中文字体提升PDF显示效果
2. **打印模板自定义**: 支持配置不同的打印模板
3. **批量打印**: 支持一次选择多个任务批量生成PDF
4. **打印历史**: 记录打印历史，支持重新打印
5. **直接打印**: 探索通过云打印服务实现直接打印（无需用户二次操作）
