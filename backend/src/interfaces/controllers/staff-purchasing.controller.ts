/**
 * Staff Purchasing Controller
 * 员工采购管理Controller（小程序端）
 * Phase 1: Purchasing Management Feature
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UsePipes,
  ValidationPipe,
  Logger,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Req,
  UploadedFile,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiSecurity,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { PurchasingService } from '../../application/purchasing/purchasing.service';
import type {
  GeneratePurchaseListDto,
  CompletePurchaseDto,
  AddPurchaseRecordDto,
  UpdatePurchaseRecordDto,
} from '../../application/purchasing/purchasing.service';
import { ReimbursementService } from '../../application/purchasing/reimbursement.service';
import type { SubmitReimbursementDto } from '../../application/purchasing/reimbursement.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  PurchaseListStatus,
  ReimbursementStatus,
} from '../../domain/purchasing';
import { AuthGuard } from '../auth';
import { UserId, UserRole } from '../auth/user.decorator';
import { Put, Delete } from '@nestjs/common';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';

@ApiTags('Staff Purchasing')
@Controller('api/v1/staff/purchasing')
@UseGuards(AuthGuard)
@ApiSecurity('bearer')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class StaffPurchasingController {
  private readonly logger = new Logger(StaffPurchasingController.name);

  constructor(
    private readonly purchasingService: PurchasingService,
    private readonly reimbursementService: ReimbursementService,
    private readonly cosService: TencentCosService,
  ) {}

  /**
   * ==========================================
   * 采购清单管理
   * ==========================================
   */

  @Get('preview')
  @ApiOperation({ summary: '预览采购需求（不创建采购清单，不改变订单状态）' })
  @ApiQuery({
    name: 'startDate',
    required: true,
    type: String,
    description: '目标日期 YYYY-MM-DD',
    example: '2026-01-10',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: '结束日期 YYYY-MM-DD（可选）',
    example: '2026-01-10',
  })
  @ApiResponse({
    status: 200,
    description: '预览成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            targetDateRange: {
              type: 'object',
              properties: {
                start: { type: 'string', example: '2026-01-10' },
                end: { type: 'string', example: '2026-01-10' },
              },
            },
            itemCount: { type: 'number', example: 15 },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ingredientId: { type: 'string' },
                  ingredientName: { type: 'string' },
                  quantityNeeded: { type: 'number' },
                  quantityUnit: { type: 'string' },
                  purchaseChannel: { type: 'string' },
                  productModel: { type: 'string' },
                },
              },
            },
            affectedOrders: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  orderId: { type: 'string' },
                  targetProductionDate: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  async previewPurchaseList(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate?: string,
  ) {
    this.logger.log(
      `Previewing purchase list for ${startDate} - ${endDate || startDate}`,
    );

    const preview = await this.purchasingService.previewPurchaseRequirements(
      startDate,
      endDate,
    );

    return ApiResponseDto.success(preview, '预览成功');
  }

  @Post('lists')
  @ApiOperation({ summary: '生成采购清单' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: '目标日期 YYYY-MM-DD',
          example: '2026-01-10',
        },
        endDate: {
          type: 'string',
          description: '结束日期 YYYY-MM-DD（可选）',
          example: '2026-01-10',
        },
      },
      required: ['startDate'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '采购清单创建成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            targetDate: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['PENDING', 'COMPLETED'] },
            totalEstimatedCost: { type: 'number' },
            itemCount: { type: 'number' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  ingredientId: { type: 'string' },
                  ingredientName: { type: 'string' },
                  quantityNeeded: { type: 'number' },
                  quantityUnit: { type: 'string' },
                  estimatedCost: { type: 'number' },
                  purchaseChannel: { type: 'string' },
                  productModel: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  async generatePurchaseList(
    @Body() dto: GeneratePurchaseListDto,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(
      `Generating purchase list for ${dto.startDate} - ${dto.endDate || dto.startDate} by user ${userId}`,
    );

    const purchaseList = await this.purchasingService.generatePurchaseList(
      dto,
      userId,
    );

    return ApiResponseDto.success(purchaseList, '采购清单生成成功');
  }

  @Get('lists')
  @ApiOperation({ summary: '查看采购清单列表' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'COMPLETED'],
    description: '筛选状态',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: '开始日期 YYYY-MM-DD',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: '结束日期 YYYY-MM-DD',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: '页码',
    example: 1,
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: '每页数量',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: '采购清单列表',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            list: { type: 'array', items: { type: 'object' } },
            total: { type: 'number' },
          },
        },
      },
    },
  })
  async getPurchaseLists(
    @Query('status') status?: PurchaseListStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @UserId() userId?: string,
    @UserRole() userRole?: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(
      `Fetching purchase lists with filters: status=${status}, userId=${userId}, role=${userRole}`,
    );

    // 管理员可以看到所有采购清单，员工只能看到自己创建的
    const createdById = userRole === 'ADMIN' ? undefined : userId;

    const result = await this.purchasingService.getPurchaseLists({
      status,
      createdById,
      startDate,
      endDate,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
    });

    return ApiResponseDto.success(result, '获取采购清单列表成功');
  }

  @Get('lists/:id')
  @ApiOperation({ summary: '查看采购清单详情' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiResponse({
    status: 200,
    description: '采购清单详情',
  })
  async getPurchaseListDetail(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Fetching purchase list detail: ${id}`);

    const purchaseList = await this.purchasingService.getPurchaseListDetail(id);

    return ApiResponseDto.success(purchaseList, '获取采购清单详情成功');
  }

  @Post('lists/:id/orders')
  @ApiOperation({ summary: '追加订单到采购清单' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        orderIds: {
          type: 'array',
          items: { type: 'string' },
          description: '订单ID列表',
        },
      },
      required: ['orderIds'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '追加订单成功',
  })
  async addOrdersToList(
    @Param('id') id: string,
    @Body() dto: { orderIds: string[] },
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Adding orders to purchase list ${id}`);

    const result = await this.purchasingService.addOrdersToPurchaseList(
      id,
      dto.orderIds,
      userId,
    );

    return ApiResponseDto.success(result, '追加订单成功');
  }

  @Delete('lists/:id/orders')
  @ApiOperation({ summary: '从采购清单剔除订单' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        orderIds: {
          type: 'array',
          items: { type: 'string' },
          description: '订单ID列表',
        },
      },
      required: ['orderIds'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '剔除订单成功',
  })
  async removeOrdersFromList(
    @Param('id') id: string,
    @Body() dto: { orderIds: string[] },
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Removing orders from purchase list ${id}`);

    const result = await this.purchasingService.removeOrdersFromPurchaseList(
      id,
      dto.orderIds,
      userId,
    );

    return ApiResponseDto.success(result, '剔除订单成功');
  }

  @Post('lists/:id/items')
  @ApiOperation({ summary: '添加原料到采购清单' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ingredientId: { type: 'string', description: '原料ID' },
        ingredientName: { type: 'string', description: '原料名称' },
        type: {
          type: 'string',
          enum: ['FOOD', 'SUPPLEMENT', 'PACKAGING'],
          description: '原料类型',
        },
        quantityNeeded: { type: 'number', description: '需求数量' },
        quantityUnit: { type: 'string', description: '数量单位' },
        estimatedCost: { type: 'number', description: '预估成本' },
        purchaseChannel: { type: 'string', description: '采购渠道' },
        productModel: { type: 'string', description: '产品型号' },
      },
      required: [
        'ingredientId',
        'ingredientName',
        'type',
        'quantityNeeded',
        'quantityUnit',
        'estimatedCost',
      ],
    },
  })
  @ApiResponse({
    status: 200,
    description: '添加原料成功',
  })
  async addManualItem(
    @Param('id') id: string,
    @Body()
    dto: {
      ingredientId: string;
      ingredientName: string;
      type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
      quantityNeeded: number;
      quantityUnit: string;
      estimatedCost: number;
      purchaseChannel?: string;
      productModel?: string;
    },
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Adding manual item to purchase list ${id}`);

    const purchaseList = await this.purchasingService.addManualItem(
      id,
      dto,
      userId,
    );

    return ApiResponseDto.success(purchaseList, '添加原料成功');
  }

  @Delete('lists/:id/items/:itemId')
  @ApiOperation({ summary: '从采购清单删除原料' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiParam({ name: 'itemId', description: '原料项ID' })
  @ApiResponse({
    status: 200,
    description: '删除原料成功',
  })
  async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Removing item ${itemId} from purchase list ${id}`);

    const purchaseList = await this.purchasingService.removeItem(
      id,
      itemId,
      userId,
    );

    return ApiResponseDto.success(purchaseList, '删除原料成功');
  }

  @Post('lists/:id/recalculate')
  @ApiOperation({ summary: '重新计算采购清单需求' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiResponse({
    status: 200,
    description: '重新计算成功',
  })
  async recalculatePurchaseList(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Recalculating purchase list ${id}`);

    const purchaseList = await this.purchasingService.recalculatePurchaseList(
      id,
      userId,
    );

    return ApiResponseDto.success(purchaseList, '重新计算需求成功');
  }

  @Delete('lists/:id')
  @ApiOperation({ summary: '删除采购清单' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiResponse({
    status: 200,
    description: '删除采购清单成功',
  })
  async deletePurchaseList(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Deleting purchase list ${id}`);

    const result = await this.purchasingService.deletePurchaseList(id, userId);

    return ApiResponseDto.success(result, '删除采购清单成功');
  }

  @Get('lists/:id/check-date-changes')
  @ApiOperation({ summary: '检查采购清单中订单的制作日期变更' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiResponse({
    status: 200,
    description: '检查完成',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            hasChanges: { type: 'boolean', description: '是否有日期变更' },
            changedOrders: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  orderId: { type: 'string' },
                  originalDate: { type: 'string', description: '原始日期' },
                  currentDate: { type: 'string', description: '当前日期' },
                },
              },
            },
          },
        },
      },
    },
  })
  async checkDateChanges(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Checking date changes for purchase list ${id}`);

    const result = await this.purchasingService.checkOrderDateChanges(id);

    return ApiResponseDto.success(result, '检查完成');
  }

  @Post('lists/:id/complete')
  @ApiOperation({ summary: '确认采购完成' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        actualCosts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              actualCost: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '采购完成确认成功',
  })
  async completePurchase(
    @Param('id') id: string,
    @Body() dto: CompletePurchaseDto,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Completing purchase list: ${id}`);

    const purchaseList = await this.purchasingService.completePurchase(id, dto);

    return ApiResponseDto.success(purchaseList, '采购完成确认成功');
  }

  /**
   * ==========================================
   * 采购记录管理
   * ==========================================
   */

  @Post('lists/:id/start')
  @ApiOperation({ summary: '开始采购' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiResponse({
    status: 200,
    description: '开始采购成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            startedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  async startPurchase(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    this.logger.log(`Starting purchase list: ${id}`);

    const purchaseList = await this.purchasingService.startPurchase(id);

    return ApiResponseDto.success(purchaseList, '开始采购成功');
  }

  @Post('lists/:id/records')
  @ApiOperation({ summary: '添加采购记录' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        purchaseItemId: { type: 'string', description: '采购项目ID' },
        ingredientId: { type: 'string', description: '原料ID' },
        ingredientName: { type: 'string', description: '原料名称' },
        purchaseChannel: { type: 'string', description: '采购渠道' },
        actualQuantity: { type: 'number', description: '实际采购重量（克）' },
        actualCost: { type: 'number', description: '实际采购金额（元）' },
        productModel: { type: 'string', description: '产品型号（选填）' },
        notes: { type: 'string', description: '备注信息（选填）' },
      },
      required: [
        'purchaseItemId',
        'ingredientId',
        'ingredientName',
        'purchaseChannel',
        'actualQuantity',
        'actualCost',
      ],
    },
  })
  @ApiResponse({
    status: 200,
    description: '采购记录添加成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            purchaseListId: { type: 'string' },
            ingredientName: { type: 'string' },
            purchaseChannel: { type: 'string' },
            actualQuantity: { type: 'number' },
            actualCost: { type: 'number' },
          },
        },
      },
    },
  })
  async addPurchaseRecord(
    @Param('id') id: string,
    @Body() dto: AddPurchaseRecordDto,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Adding purchase record to purchase list: ${id}`);

    const record = await this.purchasingService.addPurchaseRecord(id, dto);

    return ApiResponseDto.success(record, '采购记录添加成功');
  }

  @Get('lists/:id/records')
  @ApiOperation({ summary: '查询采购记录列表' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiResponse({
    status: 200,
    description: '采购记录列表',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              purchaseListId: { type: 'string' },
              ingredientName: { type: 'string' },
              purchaseChannel: { type: 'string' },
              actualQuantity: { type: 'number' },
              actualCost: { type: 'number' },
              productModel: { type: 'string' },
              notes: { type: 'string' },
              purchasedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  async getPurchaseRecords(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Fetching purchase records for purchase list: ${id}`);

    const records = await this.purchasingService.getPurchaseRecords(id);

    return ApiResponseDto.success(records, '获取采购记录列表成功');
  }

  @Put('lists/:id/records/:recordId')
  @ApiOperation({ summary: '更新采购记录' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiParam({ name: 'recordId', description: '采购记录ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        purchaseChannel: { type: 'string', description: '采购渠道' },
        actualQuantity: { type: 'number', description: '实际采购重量（克）' },
        actualCost: { type: 'number', description: '实际采购金额（元）' },
        productModel: { type: 'string', description: '产品型号' },
        notes: { type: 'string', description: '备注信息' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '采购记录更新成功',
  })
  async updatePurchaseRecord(
    @Param('recordId') recordId: string,
    @Body() dto: UpdatePurchaseRecordDto,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Updating purchase record: ${recordId}`);

    const record = await this.purchasingService.updatePurchaseRecord(
      recordId,
      dto,
    );

    return ApiResponseDto.success(record, '采购记录更新成功');
  }

  @Delete('lists/:id/records/:recordId')
  @ApiOperation({ summary: '删除采购记录' })
  @ApiParam({ name: 'id', description: '采购清单ID' })
  @ApiParam({ name: 'recordId', description: '采购记录ID' })
  @ApiResponse({
    status: 200,
    description: '采购记录删除成功',
  })
  async deletePurchaseRecord(
    @Param('recordId') recordId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Deleting purchase record: ${recordId}`);

    await this.purchasingService.deletePurchaseRecord(recordId);

    return ApiResponseDto.success(null, '采购记录删除成功');
  }

  /**
   * ==========================================
   * 报销单管理
   * ==========================================
   */

  @Post('upload-receipt-photo')
  @ApiOperation({ summary: '上传报销转账/支付记录照片' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '上传成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              example:
                'https://img.sevenkitchen.cloud/reimbursement-receipts/xxx.jpg',
            },
            key: { type: 'string', example: 'reimbursement-receipts/xxx.jpg' },
          },
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadReceiptPhoto(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    if (!file) {
      throw new BadRequestException('请选择文件');
    }

    this.logger.log(
      `Uploading reimbursement receipt photo: ${file.originalname}, size: ${file.size}`,
    );

    try {
      const result = await this.cosService.uploadImage(
        file,
        file.originalname,
        'reimbursement-receipts',
      );
      return ApiResponseDto.success(result, '上传成功');
    } catch (error) {
      this.logger.error('Failed to upload reimbursement receipt photo:', error);
      throw new BadRequestException('上传失败，请重试');
    }
  }

  @Delete('reimbursement-receipts')
  @ApiOperation({ summary: '删除报销发票照片' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'COS文件Key',
          example: 'reimbursement-receipts/1234567890-abc123.jpg',
        },
      },
      required: ['key'],
    },
  })
  async deleteReceiptPhoto(
    @Body() dto: { key: string },
  ): Promise<ApiResponseDto<any>> {
    if (!dto.key) {
      throw new BadRequestException('缺少文件Key');
    }

    this.logger.log(`Deleting reimbursement receipt photo: ${dto.key}`);

    try {
      await this.cosService.deleteImage(dto.key);
      return ApiResponseDto.success(null, '删除成功');
    } catch (error) {
      this.logger.error('Failed to delete reimbursement receipt photo:', error);
      throw new BadRequestException('删除失败，请重试');
    }
  }

  @Post('reimbursements')
  @ApiOperation({ summary: '提交报销申请' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        purchaseListIds: {
          type: 'array',
          items: { type: 'string' },
          description: '采购清单ID列表（可选）',
        },
        receiptUrls: {
          type: 'array',
          items: { type: 'string' },
          description: '发票照片URL列表',
        },
        totalActualCost: {
          type: 'number',
          description: '实际采购总额',
        },
        platformShippingFee: {
          type: 'number',
          description: '平台运费（可选）',
          example: 10.0,
        },
        platformPackagingFee: {
          type: 'number',
          description: '平台打包费（可选）',
          example: 5.0,
        },
        customFees: {
          type: 'array',
          description: '自定义费用明细（可选）',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', example: '打车费' },
              amount: { type: 'number', example: 30.0 },
            },
          },
        },
      },
      required: ['receiptUrls', 'totalActualCost'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '报销申请提交成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            claimNumber: { type: 'string', example: 'BX20260110001' },
            status: {
              type: 'string',
              enum: [
                'PENDING_REVIEW',
                'APPROVED',
                'REJECTED',
                'REQUIRES_RESUBMIT',
              ],
            },
            totalActualCost: { type: 'number' },
            totalEstimatedCost: { type: 'number' },
            submittedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  async submitReimbursement(
    @Body() dto: SubmitReimbursementDto,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(
      `Submitting reimbursement for ${dto.purchaseListIds.length} purchase lists by user ${userId}`,
    );

    const reimbursement = await this.reimbursementService.submitReimbursement(
      dto,
      userId,
    );

    return ApiResponseDto.success(reimbursement, '报销申请提交成功');
  }

  @Get('reimbursements')
  @ApiOperation({ summary: '查看我的报销申请列表' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REQUIRES_RESUBMIT'],
    description: '筛选状态',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: '开始日期 YYYY-MM-DD',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: '结束日期 YYYY-MM-DD',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: '页码',
    example: 1,
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: '每页数量',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: '报销申请列表',
  })
  async getMyReimbursements(
    @Query('status') status?: ReimbursementStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @UserId() userId?: string,
    @UserRole() role?: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(
      `Fetching reimbursements for user ${userId} (role=${role}) with status=${status}`,
    );

    // 管理员可以看到所有报销单，员工只能看到自己的
    const submittedById = role === 'ADMIN' ? undefined : userId;

    this.logger.log(
      `[DEBUG] submittedById value: ${submittedById}, type: ${typeof submittedById}, is ADMIN: ${role === 'ADMIN'}`,
    );

    const result = await this.reimbursementService.getReimbursements({
      status,
      submittedById,
      startDate,
      endDate,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
    });

    this.logger.log(
      `[DEBUG] Query result: found ${result.list.length} reimbursements, total: ${result.total}`,
    );

    return ApiResponseDto.success(result, '获取报销申请列表成功');
  }

  @Get('reimbursements/:id')
  @ApiOperation({ summary: '查看报销单详情' })
  @ApiParam({ name: 'id', description: '报销单ID' })
  @ApiResponse({
    status: 200,
    description: '报销单详情',
  })
  async getReimbursementDetail(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Fetching reimbursement detail: ${id}`);

    const reimbursement =
      await this.reimbursementService.getReimbursementDetail(id);

    return ApiResponseDto.success(reimbursement, '获取报销单详情成功');
  }

  @Delete('reimbursements/:id')
  @ApiOperation({ summary: '删除报销单' })
  @ApiParam({ name: 'id', description: '报销单ID' })
  @ApiResponse({
    status: 200,
    description: '删除成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
      },
    },
  })
  async deleteReimbursement(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<null>> {
    this.logger.log(`Deleting reimbursement: ${id} by user ${userId}`);

    await this.reimbursementService.deleteReimbursement(id, userId, false);

    return ApiResponseDto.success(null, '删除成功');
  }

  @Post('reimbursements/:id/resubmit')
  @ApiOperation({ summary: '重新提交被驳回的报销单' })
  @ApiParam({ name: 'id', description: '报销单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        purchaseListIds: {
          type: 'array',
          items: { type: 'string' },
          description: '采购清单ID列表',
        },
        receiptUrls: {
          type: 'array',
          items: { type: 'string' },
          description: '发票照片URL列表',
        },
        totalActualCost: {
          type: 'number',
          description: '实际采购总额',
        },
        platformShippingFee: {
          type: 'number',
          description: '平台运费（可选）',
          example: 10.0,
        },
        platformPackagingFee: {
          type: 'number',
          description: '平台打包费（可选）',
          example: 5.0,
        },
        customFees: {
          type: 'array',
          description: '自定义费用明细（可选）',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', example: '打车费' },
              amount: { type: 'number', example: 30.0 },
            },
          },
        },
      },
      required: ['purchaseListIds', 'receiptUrls', 'totalActualCost'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '报销单重新提交成功',
  })
  async resubmitReimbursement(
    @Param('id') id: string,
    @Body() dto: SubmitReimbursementDto,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Resubmitting reimbursement: ${id}`);

    const reimbursement = await this.reimbursementService.resubmitReimbursement(
      id,
      dto,
    );

    return ApiResponseDto.success(reimbursement, '报销单重新提交成功');
  }

  @Post('reimbursements/:id/receipts')
  @ApiOperation({ summary: '追加支付凭证（发票照片）' })
  @ApiParam({ name: 'id', description: '报销单ID' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: '上传成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            receiptUrls: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10))
  async appendReceiptUrls(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(
      `Appending receipt URLs for reimbursement: ${id} by user ${userId}`,
    );

    if (!files || files.length === 0) {
      throw new BadRequestException('请至少上传一张图片');
    }

    // Validate file size (10MB max per file)
    const maxSize = 10 * 1024 * 1024;
    for (const file of files) {
      if (file.size > maxSize) {
        throw new BadRequestException('文件大小不能超过10MB');
      }
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    for (const file of files) {
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException('只支持JPG、PNG、GIF、WEBP格式的文件');
      }
    }

    const reimbursement = await this.reimbursementService.appendReceiptUrls(
      id,
      files,
      userId,
      false,
    );

    return ApiResponseDto.success(reimbursement, '支付凭证上传成功');
  }

  @Delete('reimbursements/:id/receipts')
  @ApiOperation({ summary: '删除支付凭证（发票照片）' })
  @ApiParam({ name: 'id', description: '报销单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        urlIndex: {
          type: 'number',
          description: '要删除的图片索引（从0开始）',
        },
      },
      required: ['urlIndex'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '删除成功',
  })
  async removeReceiptUrl(
    @Param('id') id: string,
    @Body() body: { urlIndex: number },
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(
      `Removing receipt at index ${body.urlIndex} from reimbursement: ${id} by user ${userId}`,
    );

    if (body.urlIndex === undefined || body.urlIndex === null) {
      throw new BadRequestException('请提供要删除的图片索引');
    }

    const reimbursement = await this.reimbursementService.removeReceiptUrl(
      id,
      body.urlIndex,
      userId,
      false,
    );

    return ApiResponseDto.success(reimbursement, '支付凭证删除成功');
  }

  /**
   * 获取所有采购渠道列表
   */
  @Get('purchase-channels')
  @ApiOperation({ summary: '获取所有采购渠道' })
  @ApiResponse({
    status: 200,
    description: '采购渠道列表',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'array',
          items: { type: 'string' },
          example: ['淘宝', '京东', '天猫超市', '山姆会员店', '盒马鲜生'],
        },
      },
    },
  })
  async getPurchaseChannels(): Promise<ApiResponseDto<string[]>> {
    this.logger.log('Fetching purchase channels');

    const channels = await this.purchasingService.getPurchaseChannels();

    return ApiResponseDto.success(channels, '获取采购渠道成功');
  }
}
