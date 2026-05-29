/**
 * Admin Purchasing Controller
 * 管理员采购管理Controller（Web端）
 * Phase 1: Purchasing Management Feature
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UsePipes,
  ValidationPipe,
  Logger,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { ReimbursementService } from '../../application/purchasing/reimbursement.service';
import type { ReviewReimbursementDto } from '../../application/purchasing/reimbursement.service';
import { PurchasingService } from '../../application/purchasing/purchasing.service';
import type {
  AddPurchaseRecordDto,
  CompletePurchaseDto,
  CreateStockPurchaseListDto,
  GeneratePurchaseListDto,
  MarkPurchaseItemNoPurchaseDto,
  UpdatePurchaseRecordDto,
} from '../../application/purchasing/purchasing.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  ReimbursementStatus,
  PurchaseListKind,
  PurchaseListStatus,
} from '../../domain/purchasing';
import { UserId } from '../auth/user.decorator';
import { AuthGuard } from '../auth';
// import { AdminGuard } from './auth/admin.guard';

@ApiTags('Admin Purchasing')
@Controller('api/v1/admin/purchasing')
@UseGuards(AuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class AdminPurchasingController {
  private readonly logger = new Logger(AdminPurchasingController.name);

  constructor(
    private readonly reimbursementService: ReimbursementService,
    private readonly purchasingService: PurchasingService,
  ) {}

  /**
   * ==========================================
   * 报销管理
   * ==========================================
   */

  @Get('reimbursements')
  @ApiOperation({ summary: '查询报销单列表' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING_REVIEW', 'REIMBURSED', 'REJECTED', 'REQUIRES_RESUBMIT'],
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
    description: '报销单列表',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            list: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  claimNumber: { type: 'string', example: 'BX20260110001' },
                  status: {
                    type: 'string',
                    enum: [
                      'PENDING_REVIEW',
                      'REIMBURSED',
                      'REJECTED',
                      'REQUIRES_RESUBMIT',
                    ],
                  },
                  totalActualCost: { type: 'number' },
                  totalEstimatedCost: { type: 'number' },
                  receiptUrls: { type: 'array', items: { type: 'string' } },
                  submittedById: { type: 'string' },
                  submittedBy: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      nickname: { type: 'string' },
                      phone: { type: 'string' },
                    },
                  },
                  submittedAt: { type: 'string', format: 'date-time' },
                  reviewedById: { type: 'string' },
                  reviewedBy: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      nickname: { type: 'string' },
                      phone: { type: 'string' },
                    },
                  },
                  reviewedAt: { type: 'string', format: 'date-time' },
                  reviewComment: { type: 'string' },
                  purchaseLists: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        targetDate: { type: 'string', format: 'date-time' },
                        status: {
                          type: 'string',
                          enum: ['DRAFT', 'PENDING', 'COMPLETED', 'CANCELLED'],
                        },
                        totalEstimatedCost: { type: 'number' },
                        itemCount: { type: 'number' },
                        sourceOrderIds: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            total: { type: 'number' },
          },
        },
      },
    },
  })
  async getReimbursements(
    @Query('status') status?: ReimbursementStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Admin fetching reimbursements with status=${status}`);

    const result = await this.reimbursementService.getReimbursements({
      status,
      startDate,
      endDate,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
    });

    return ApiResponseDto.success(
      result,
      'Reimbursements retrieved successfully',
    );
  }

  @Get('reimbursements/:id')
  @ApiOperation({ summary: '查询报销单详情' })
  @ApiParam({ name: 'id', description: '报销单ID' })
  @ApiResponse({
    status: 200,
    description: '报销单详情',
  })
  async getReimbursementDetail(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Admin fetching reimbursement detail: ${id}`);

    const reimbursement =
      await this.reimbursementService.getReimbursementDetail(id);

    return ApiResponseDto.success(
      reimbursement,
      'Reimbursement detail retrieved successfully',
    );
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
    this.logger.log(`Admin deleting reimbursement: ${id}`);

    await this.reimbursementService.deleteReimbursement(id, userId, true);

    return ApiResponseDto.success(null, '删除成功');
  }

  @Post('reimbursements/:id/review')
  @ApiOperation({ summary: '处理报销单（兼容旧审核接口）' })
  @ApiParam({ name: 'id', description: '报销单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        decision: {
          type: 'string',
          enum: ['APPROVE', 'REJECT', 'REQUIRES_RESUBMIT'],
          description: '处理决策',
        },
        comment: {
          type: 'string',
          description: '处理备注',
        },
      },
      required: ['decision'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '报销单处理成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            claimNumber: { type: 'string' },
            status: {
              type: 'string',
              enum: [
                'PENDING_REVIEW',
                'REIMBURSED',
                'REJECTED',
                'REQUIRES_RESUBMIT',
              ],
            },
            reviewedById: { type: 'string' },
            reviewedAt: { type: 'string', format: 'date-time' },
            reviewComment: { type: 'string' },
          },
        },
      },
    },
  })
  async reviewReimbursement(
    @Param('id') id: string,
    @Body() dto: ReviewReimbursementDto,
    @UserId() reviewerId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(
      `Admin ${reviewerId} reviewing reimbursement ${id} with decision: ${dto.decision}`,
    );

    const reimbursement = await this.reimbursementService.reviewReimbursement(
      id,
      reviewerId,
      dto,
    );

    return ApiResponseDto.success(
      reimbursement,
      'Reimbursement reviewed successfully',
    );
  }

  /**
   * ==========================================
   * 采购清单管理
   * ==========================================
   */

  @Get('preview')
  @ApiOperation({ summary: '预览采购需求（管理端）' })
  async previewPurchaseList(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate?: string,
  ): Promise<ApiResponseDto<any>> {
    const preview = await this.purchasingService.previewPurchaseRequirements(
      startDate,
      endDate,
    );

    return ApiResponseDto.success(preview, '预览成功');
  }

  @Post('lists')
  @ApiOperation({ summary: '生成采购清单（管理端）' })
  async generatePurchaseList(
    @Body() dto: GeneratePurchaseListDto,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.purchasingService.generatePurchaseList(
      dto,
      userId,
    );
    const message = result.purchaseList
      ? '采购清单生成成功'
      : '库存已分配，本批订单无需采购';

    return ApiResponseDto.success(result, message);
  }

  @Get('stock-ingredients')
  @ApiOperation({ summary: '查询可补货原料列表（管理端）' })
  async getStockReplenishmentIngredients(
    @Query('keyword') keyword?: string,
    @Query('type') type?: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING',
    @Query('onlyNeedsReplenishment') onlyNeedsReplenishment?: string,
  ): Promise<ApiResponseDto<any>> {
    const ingredients =
      await this.purchasingService.getStockReplenishmentIngredients({
        keyword,
        type,
        onlyNeedsReplenishment: onlyNeedsReplenishment === 'true',
        includeDaily: true,
      });

    return ApiResponseDto.success(ingredients, '获取补货原料成功');
  }

  @Post('lists/stock')
  @ApiOperation({ summary: '创建库存补货采购单（管理端）' })
  async createStockPurchaseList(
    @Body() dto: CreateStockPurchaseListDto,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const purchaseList = await this.purchasingService.createStockPurchaseList(
      dto,
      userId,
    );

    return ApiResponseDto.success(purchaseList, '库存补货采购单创建成功');
  }

  @Get('lists')
  @ApiOperation({ summary: '查看采购清单列表（管理端）' })
  async getPurchaseLists(
    @Query('status') status?: PurchaseListStatus,
    @Query('kind') kind?: PurchaseListKind,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('excludeReimbursed') excludeReimbursed?: string,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.purchasingService.getPurchaseLists({
      status,
      kind,
      startDate,
      endDate,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      excludeReimbursed: excludeReimbursed === 'true',
    });

    return ApiResponseDto.success(result, '获取采购清单列表成功');
  }

  @Get('lists/:id')
  @ApiOperation({ summary: '查看采购清单详情（管理端）' })
  async getPurchaseListDetail(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    const purchaseList = await this.purchasingService.getPurchaseListDetail(id);

    return ApiResponseDto.success(purchaseList, '获取采购清单详情成功');
  }

  @Post('lists/:id/orders')
  @ApiOperation({ summary: '追加订单到采购清单（管理端）' })
  async addOrdersToList(
    @Param('id') id: string,
    @Body() dto: { orderIds: string[] },
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.purchasingService.addOrdersToPurchaseList(
      id,
      dto.orderIds,
      userId,
    );

    return ApiResponseDto.success(result, '追加订单成功');
  }

  @Delete('lists/:id/orders')
  @ApiOperation({ summary: '从采购清单剔除订单（管理端）' })
  async removeOrdersFromList(
    @Param('id') id: string,
    @Body() dto: { orderIds: string[] },
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.purchasingService.removeOrdersFromPurchaseList(
      id,
      dto.orderIds,
      userId,
    );

    return ApiResponseDto.success(result, '剔除订单成功');
  }

  @Post('lists/:id/items')
  @ApiOperation({ summary: '添加原料到采购清单（管理端）' })
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
    const purchaseList = await this.purchasingService.addManualItem(
      id,
      dto,
      userId,
    );

    return ApiResponseDto.success(purchaseList, '添加原料成功');
  }

  @Delete('lists/:id/items/:itemId')
  @ApiOperation({ summary: '从采购清单删除原料（管理端）' })
  async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const purchaseList = await this.purchasingService.removeItem(
      id,
      itemId,
      userId,
    );

    return ApiResponseDto.success(purchaseList, '删除原料成功');
  }

  @Post('lists/:id/recalculate')
  @ApiOperation({ summary: '重新计算采购清单需求（管理端）' })
  async recalculatePurchaseList(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const purchaseList = await this.purchasingService.recalculatePurchaseList(
      id,
      userId,
    );

    return ApiResponseDto.success(purchaseList, '重新计算成功');
  }

  @Delete('lists/:id')
  @ApiOperation({ summary: '删除采购清单（管理端）' })
  async deletePurchaseList(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.purchasingService.deletePurchaseList(id, userId);

    return ApiResponseDto.success(result, '删除采购清单成功');
  }

  @Get('lists/:id/check-date-changes')
  @ApiOperation({ summary: '检查采购清单中订单的制作日期变更（管理端）' })
  async checkOrderDateChanges(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.purchasingService.checkOrderDateChanges(id);

    return ApiResponseDto.success(result, '检查完成');
  }

  @Post('lists/:id/start')
  @ApiOperation({ summary: '开始采购（管理端）' })
  async startPurchase(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    const purchaseList = await this.purchasingService.startPurchase(id);

    return ApiResponseDto.success(purchaseList, '开始采购成功');
  }

  @Post('lists/:id/complete')
  @ApiOperation({ summary: '确认采购完成（管理端）' })
  async completePurchase(
    @Param('id') id: string,
    @Body() dto: CompletePurchaseDto,
  ): Promise<ApiResponseDto<any>> {
    const purchaseList = await this.purchasingService.completePurchase(id, dto);

    return ApiResponseDto.success(purchaseList, '采购完成');
  }

  @Post('lists/:id/reopen')
  @ApiOperation({ summary: '撤回采购完成（管理端）' })
  async reopenPurchaseList(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const purchaseList = await this.purchasingService.reopenPurchaseList(
      id,
      userId,
    );

    return ApiResponseDto.success(purchaseList, '撤回完成成功');
  }

  @Post('lists/:id/items/:itemId/no-purchase')
  @ApiOperation({ summary: '标记采购明细无需采购（管理端）' })
  async markPurchaseItemNoPurchase(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: MarkPurchaseItemNoPurchaseDto,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const purchaseList =
      await this.purchasingService.markPurchaseItemNoPurchase(
        id,
        itemId,
        dto,
        userId,
      );

    return ApiResponseDto.success(purchaseList, '已标记无需采购');
  }

  @Delete('lists/:id/items/:itemId/no-purchase')
  @ApiOperation({ summary: '取消采购明细无需采购标记（管理端）' })
  async clearPurchaseItemNoPurchase(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<ApiResponseDto<any>> {
    const purchaseList =
      await this.purchasingService.clearPurchaseItemNoPurchase(id, itemId);

    return ApiResponseDto.success(purchaseList, '已取消无需采购标记');
  }

  @Post('lists/:id/records')
  @ApiOperation({ summary: '添加采购记录（管理端）' })
  async addPurchaseRecord(
    @Param('id') id: string,
    @Body() dto: AddPurchaseRecordDto,
  ): Promise<ApiResponseDto<any>> {
    const record = await this.purchasingService.addPurchaseRecord(id, dto);

    return ApiResponseDto.success(record, '采购记录添加成功');
  }

  @Get('lists/:id/records')
  @ApiOperation({ summary: '查询采购记录列表（管理端）' })
  async getPurchaseRecords(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    const records = await this.purchasingService.getPurchaseRecords(id);

    return ApiResponseDto.success(records, '获取采购记录列表成功');
  }

  @Put('lists/:id/records/:recordId')
  @ApiOperation({ summary: '更新采购记录（管理端）' })
  async updatePurchaseRecord(
    @Param('recordId') recordId: string,
    @Body() dto: UpdatePurchaseRecordDto,
  ): Promise<ApiResponseDto<any>> {
    const record = await this.purchasingService.updatePurchaseRecord(
      recordId,
      dto,
    );

    return ApiResponseDto.success(record, '采购记录更新成功');
  }

  @Delete('lists/:id/records/:recordId')
  @ApiOperation({ summary: '删除采购记录（管理端）' })
  async deletePurchaseRecord(
    @Param('recordId') recordId: string,
  ): Promise<ApiResponseDto<any>> {
    await this.purchasingService.deletePurchaseRecord(recordId);

    return ApiResponseDto.success(null, '采购记录删除成功');
  }

  @Get('purchase-channels')
  @ApiOperation({ summary: '获取所有采购渠道（管理端）' })
  async getPurchaseChannels(): Promise<ApiResponseDto<string[]>> {
    const channels = await this.purchasingService.getPurchaseChannels();

    return ApiResponseDto.success(channels, '获取采购渠道成功');
  }

  /**
   * ==========================================
   * 采购历史记录
   * ==========================================
   */

  @Get('history')
  @ApiOperation({ summary: '查询采购历史记录' })
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
    name: 'ingredientId',
    required: false,
    type: String,
    description: '原料ID筛选',
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
    description: '采购历史记录',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            list: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  targetDate: { type: 'string', format: 'date-time' },
                  status: {
                    type: 'string',
                    enum: ['DRAFT', 'PENDING', 'COMPLETED', 'CANCELLED'],
                  },
                  totalEstimatedCost: { type: 'number' },
                  itemCount: { type: 'number' },
                  createdById: { type: 'string' },
                  createdBy: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      nickname: { type: 'string' },
                      phone: { type: 'string' },
                    },
                  },
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
                  sourceOrderIds: { type: 'array', items: { type: 'string' } },
                  completedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            total: { type: 'number' },
          },
        },
      },
    },
  })
  async getPurchaseHistory(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(
      `Admin fetching purchase history from ${startDate} to ${endDate}`,
    );

    const result = await this.purchasingService.getPurchaseLists({
      startDate,
      endDate,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
    });

    return ApiResponseDto.success(
      result,
      'Purchase history retrieved successfully',
    );
  }

  @Get('statistics')
  @ApiOperation({ summary: '查询采购统计数据' })
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
  @ApiResponse({
    status: 200,
    description: '采购统计数据',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            totalPurchaseLists: { type: 'number', description: '采购清单总数' },
            completedPurchaseLists: {
              type: 'number',
              description: '已完成的采购清单数',
            },
            totalReimbursements: { type: 'number', description: '报销单总数' },
            pendingReimbursements: {
              type: 'number',
              description: '待报销单数',
            },
            approvedReimbursements: {
              type: 'number',
              description: '已批准报销单数',
            },
            totalEstimatedCost: { type: 'number', description: '预估总成本' },
            totalActualCost: { type: 'number', description: '实际总成本' },
            costDifference: { type: 'number', description: '成本差异' },
            costDifferencePercentage: {
              type: 'number',
              description: '成本差异百分比',
            },
          },
        },
      },
    },
  })
  async getPurchaseStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(
      `Admin fetching purchase statistics from ${startDate} to ${endDate}`,
    );

    // 获取采购清单列表（不限制数量）
    const { list: purchaseLists } =
      await this.purchasingService.getPurchaseLists({
        startDate,
        endDate,
        page: 1,
        pageSize: 10000,
      });

    // 获取报销单列表（不限制数量）
    const { list: reimbursements } =
      await this.reimbursementService.getReimbursements({
        startDate,
        endDate,
        page: 1,
        pageSize: 10000,
      });

    // 计算统计数据
    const totalPurchaseLists = purchaseLists.length;
    const completedPurchaseLists = purchaseLists.filter(
      (list) => list.status === PurchaseListStatus.COMPLETED,
    ).length;

    const totalReimbursements = reimbursements.length;
    const pendingReimbursements = reimbursements.filter(
      (r) => r.status === ReimbursementStatus.PENDING_REVIEW,
    ).length;
    const approvedReimbursements = reimbursements.filter(
      (r) => r.status === ReimbursementStatus.REIMBURSED,
    ).length;

    const totalEstimatedCost = reimbursements.reduce(
      (sum, r) => sum + r.totalEstimatedCost,
      0,
    );
    const totalActualCost = reimbursements.reduce(
      (sum, r) => sum + r.totalActualCost,
      0,
    );
    const costDifference = totalActualCost - totalEstimatedCost;
    const costDifferencePercentage =
      totalEstimatedCost > 0 ? (costDifference / totalEstimatedCost) * 100 : 0;

    const statistics = {
      totalPurchaseLists,
      completedPurchaseLists,
      totalReimbursements,
      pendingReimbursements,
      approvedReimbursements,
      totalEstimatedCost,
      totalActualCost,
      costDifference,
      costDifferencePercentage,
    };

    return ApiResponseDto.success(
      statistics,
      'Purchase statistics retrieved successfully',
    );
  }

  @Post('reimbursements/:id/payment-proof')
  @ApiOperation({ summary: '上传报销凭证' })
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
            claimNumber: { type: 'string' },
            status: { type: 'string' },
            paymentProofUrls: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadPaymentProof(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(
      `Uploading payment proof for reimbursement: ${id}, files count: ${files?.length || 0}`,
    );

    // Validate file size (10MB max per file)
    const maxSize = 10 * 1024 * 1024;
    for (const file of files) {
      if (file.size > maxSize) {
        throw new BadRequestException('文件大小不能超过10MB');
      }
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
    ];
    for (const file of files) {
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          '只支持JPG、PNG、GIF、WEBP和PDF格式的文件',
        );
      }
    }

    const reimbursement =
      await this.reimbursementService.uploadPaymentProofFiles(id, files, userId);

    return ApiResponseDto.success(reimbursement, '报销凭证上传成功');
  }

  @Delete('reimbursements/:id/payment-proof')
  @ApiOperation({ summary: '清空报销凭证' })
  @ApiParam({ name: 'id', description: '报销单ID' })
  @ApiResponse({
    status: 200,
    description: '清空成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            claimNumber: { type: 'string' },
            status: { type: 'string' },
            paymentProofUrls: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  async clearPaymentProof(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log(`Clearing payment proof for reimbursement: ${id}`);

    const reimbursement = await this.reimbursementService.clearPaymentProof(id);

    return ApiResponseDto.success(reimbursement, '报销凭证已清空');
  }
}
