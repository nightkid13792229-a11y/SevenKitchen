/**
 * Admin Purchasing Controller
 * 管理员采购管理Controller（Web端）
 * Phase 1: Purchasing Management Feature
 */

import {
  Controller,
  Get,
  Post,
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
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  ReimbursementStatus,
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
   * 报销审核管理
   * ==========================================
   */

  @Get('reimbursements')
  @ApiOperation({ summary: '查询报销单列表' })
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
                      'APPROVED',
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
  @ApiOperation({ summary: '审核报销单' })
  @ApiParam({ name: 'id', description: '报销单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        decision: {
          type: 'string',
          enum: ['APPROVE', 'REJECT', 'REQUIRES_RESUBMIT'],
          description: '审核决策',
        },
        comment: {
          type: 'string',
          description: '审核意见',
        },
      },
      required: ['decision'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '报销单审核成功',
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
                'APPROVED',
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
    @Query('reviewerId') reviewerId: string,
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
              description: '待审核报销单数',
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
      await this.reimbursementService.uploadPaymentProofFiles(id, files);

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
