/**
 * Staff Production Controller
 * Handles staff production management endpoints
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { StaffProductionService } from '../../application/production/kitchen.service';
import { ProductionService } from '../../application/production/production.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import {
  AutoScheduleDto,
  GetPackagingUnitsDto,
  PackagingUnitDetailDto,
  StartProductionDto,
  CompleteProductionDto,
  TodayStatisticsDto,
  UploadPhotosResponseDto,
} from '../../interfaces/dto/production/kitchen.dto';
import { PrintTaskDto } from '../../interfaces/dto/production/print-task.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { StaffGuard } from '../guards/role.guard';

@ApiTags('Staff Production')
@Controller('api/v1/staff/production')
@UseGuards(AuthGuard, StaffGuard)
export class StaffProductionController {
  constructor(
    private readonly staffProductionService: StaffProductionService,
    private readonly productionService: ProductionService,
    private readonly cosService: TencentCosService,
  ) {}

  @Get('statistics/today')
  @ApiOperation({ summary: 'Get today production statistics' })
  @ApiResponse({
    status: 200,
    description: 'Today statistics',
    type: ApiResponseDto<TodayStatisticsDto>,
  })
  async getTodayStatistics(
    @Query('targetDate') targetDate?: string,
  ): Promise<ApiResponseDto<TodayStatisticsDto>> {
    const stats = await this.staffProductionService.getTodayStatistics(
      targetDate,
    );
    return {
      code: 0,
      message: 'Success',
      data: stats,
    };
  }

  @Get('packaging-units')
  @ApiOperation({ summary: 'Get packaging units list with filtering' })
  @ApiResponse({
    status: 200,
    description: 'Packaging units list',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Success' },
        data: {
          type: 'object',
          properties: {
            list: {
              type: 'array',
              items: { $ref: '#/components/schemas/PackagingUnitDetailDto' },
            },
            total: { type: 'number' },
          },
        },
      },
    },
  })
  async getPackagingUnits(
    @Query() query: GetPackagingUnitsDto,
  ): Promise<
    ApiResponseDto<{ list: PackagingUnitDetailDto[]; total: number }>
  > {
    const result = await this.staffProductionService.getPackagingUnits(query);
    return {
      code: 0,
      message: 'Success',
      data: result,
    };
  }

  @Post('auto-schedule')
  @ApiOperation({ summary: 'Auto-schedule production for today' })
  @ApiBody({ type: AutoScheduleDto })
  @ApiResponse({
    status: 201,
    description: 'Production batch created',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Auto-schedule completed' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            productionDate: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
  })
  async autoSchedule(
    @Body() dto: AutoScheduleDto,
  ): Promise<ApiResponseDto<any>> {
    const batch = await this.staffProductionService.autoScheduleToday(dto);
    return {
      code: 0,
      message: '排单成功',
      data: {
        id: batch.id,
        productionDate: batch.productionDate,
        status: batch.status,
        packagingUnitsCount: batch.packagingUnits.length,
      },
    };
  }

  @Post('packaging-units/:id/start')
  @ApiOperation({ summary: 'Start production task' })
  @ApiParam({
    name: 'id',
    description: 'Packaging unit ID',
    example: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Production task started',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Task started' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
  })
  async startProductionTask(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    const unit = await this.staffProductionService.startProductionTask(id);
    return {
      code: 0,
      message: '开始制作',
      data: {
        id: unit.id,
        status: unit.status,
      },
    };
  }

  @Post('packaging-units/:id/photos')
  @ApiOperation({
    summary: 'Upload production preparation photos (2-3 photos)',
  })
  @ApiParam({
    name: 'id',
    description: 'Packaging unit ID',
    example: 'uuid',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 3))
  @ApiResponse({
    status: 200,
    description: 'Photos uploaded successfully',
    type: UploadPhotosResponseDto,
  })
  async uploadProductionPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<ApiResponseDto<UploadPhotosResponseDto>> {
    try {
      console.log('[uploadProductionPhotos] Starting upload for unit:', id);
      console.log('[uploadProductionPhotos] Files received:', files?.length);

      // Validate file count (允许单文件上传以支持微信小程序的分次上传)
      if (!files || files.length === 0) {
        console.log('[uploadProductionPhotos] No files provided');
        return {
          code: 400,
          message: '请选择要上传的照片',
          data: null,
        };
      }

      if (files.length > 3) {
        console.log('[uploadProductionPhotos] Too many files:', files.length);
        return {
          code: 400,
          message: '最多只能上传3张照片',
          data: null,
        };
      }

      console.log('[uploadProductionPhotos] Uploading to COS...');
      // Upload to Tencent COS
      const uploadPromises = files.map(async (file) => {
        console.log(
          '[uploadProductionPhotos] Uploading file:',
          file.originalname,
        );
        const result = await this.cosService.uploadImage(
          file,
          file.originalname,
          `production/${id}`,
        );
        console.log('[uploadProductionPhotos] Upload result:', result.url);
        return result.url;
      });

      const photoUrls = await Promise.all(uploadPromises);
      console.log('[uploadProductionPhotos] All photos uploaded:', photoUrls);

      console.log('[uploadProductionPhotos] Saving to database...');
      // Save to packaging unit (累加模式)
      const unit = await this.staffProductionService.uploadProductionPhotos(
        id,
        photoUrls,
      );
      console.log(
        '[uploadProductionPhotos] Database updated. Photos:',
        unit.photosRaw,
      );

      return {
        code: 0,
        message: '照片上传成功',
        data: {
          photosRaw: unit.photosRaw || [],
        },
      };
    } catch (error) {
      console.error('[uploadProductionPhotos] Error:', error);
      throw error;
    }
  }

  @Post('packaging-units/:id/complete')
  @ApiOperation({ summary: 'Complete production task' })
  @ApiParam({
    name: 'id',
    description: 'Packaging unit ID',
    example: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Production task completed',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Task completed' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            resultStatus: { type: 'string' },
            actualOutputG: { type: 'number' },
            surplusG: { type: 'number' },
            shortageG: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        resultStatus: {
          type: 'string',
          enum: ['NORMAL', 'SURPLUS', 'SHORTAGE'],
          description: '生产结果：正常、有余量、有缺口',
        },
        surplusG: { type: 'number', description: '成品余量克数' },
        shortageG: { type: 'number', description: '成品缺口克数' },
        resultPhotoUrls: {
          type: 'array',
          items: { type: 'string' },
          description: '可选生产结果照片',
        },
      },
    },
  })
  async completeProductionTask(
    @Param('id') id: string,
    @Body() dto: CompleteProductionDto,
  ): Promise<ApiResponseDto<any>> {
    const unit = await this.staffProductionService.completeProductionTask(
      id,
      dto,
    );
    return {
      code: 0,
      message: '制作完成',
      data: {
        id: unit.id,
        status: unit.status,
        resultStatus: unit.resultStatus,
        actualOutputG: unit.actualOutputG,
        surplusG: unit.surplusG,
        shortageG: unit.shortageG,
        resultPhotoUrls: unit.resultPhotoUrls,
      },
    };
  }

  @Delete('packaging-units/:id/photos')
  @ApiOperation({ summary: 'Delete a single production photo from COS' })
  @ApiParam({
    name: 'id',
    description: 'Packaging unit ID',
    example: 'uuid',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        photoUrl: {
          type: 'string',
          description: 'Photo URL to delete',
          example:
            'https://xxx.cos.ap-guangzhou.myqcloud.com/production/uuid/xxx.jpg',
        },
      },
      required: ['photoUrl'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Photo deleted successfully',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: '照片删除成功' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            photosRaw: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  async deleteProductionPhoto(
    @Param('id') id: string,
    @Body() body: { photoUrl: string },
  ): Promise<ApiResponseDto<any>> {
    if (!body.photoUrl) {
      return {
        code: 400,
        message: 'photoUrl is required',
        data: null,
      };
    }

    const unit = await this.staffProductionService.deleteProductionPhoto(
      id,
      body.photoUrl,
    );

    return {
      code: 0,
      message: '照片删除成功',
      data: {
        id: unit.id,
        photosRaw: unit.photosRaw || [],
      },
    };
  }

  @Put('packaging-units/:id/photos')
  @ApiOperation({ summary: 'Replace production photos' })
  @ApiParam({
    name: 'id',
    description: 'Packaging unit ID',
    example: 'uuid',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: 'Photos replaced successfully',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: '照片替换成功' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            photosRaw: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  async replaceProductionPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<ApiResponseDto<any>> {
    // Validate file count
    if (!files || files.length < 2 || files.length > 3) {
      return {
        code: 400,
        message: '必须上传2-3张照片',
        data: null,
      };
    }

    // Upload to Tencent COS
    const uploadPromises = files.map(async (file) => {
      const result = await this.cosService.uploadImage(
        file,
        file.originalname,
        `production/${id}`,
      );
      return result.url;
    });

    const photoUrls = await Promise.all(uploadPromises);

    // Replace photos (deletes old photos from COS)
    const unit = await this.staffProductionService.replaceProductionPhotos(
      id,
      photoUrls,
    );

    return {
      code: 0,
      message: '照片替换成功',
      data: {
        id: unit.id,
        photosRaw: unit.photosRaw || [],
      },
    };
  }

  @Get('recipe-batches/:recipeId')
  @ApiOperation({
    summary: 'Get all batches for a specific recipe with order items',
  })
  @ApiParam({
    name: 'recipeId',
    description: 'Recipe ID',
    example: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Recipe batches with order items',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Success' },
        data: {
          type: 'object',
          properties: {
            batches: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  batchId: { type: 'string' },
                  batchCode: { type: 'string' },
                  productionDate: { type: 'string' },
                  isCurrentBatch: { type: 'boolean' },
                  orderItems: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        orderItemId: { type: 'string' },
                        orderId: { type: 'string' },
                        dogName: { type: 'string' },
                        recipeName: { type: 'string' },
                        packageSpecG: { type: 'number' },
                        packageCount: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  async getRecipeBatchesWithOrders(
    @Param('recipeId') recipeId: string,
    @Query('recipeVersion') recipeVersion?: number,
    @Query('targetDate') targetDate?: string,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.productionService.getRecipeBatchesWithOrders({
      recipeId,
      recipeVersion,
      targetDate,
    });

    return {
      code: 0,
      message: 'Success',
      data: result,
    };
  }

  @Get('batch-production-guide')
  @ApiOperation({
    summary: 'Get batch production guide for all batches on a specific date',
  })
  @ApiResponse({
    status: 200,
    description: 'Batch production guide',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Success' },
        data: {
          type: 'object',
          properties: {
            productionDate: { type: 'string' },
            totalBatches: { type: 'number' },
            recipes: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
      },
    },
  })
  async getBatchProductionGuide(
    @Query('targetDate') targetDate: string,
  ): Promise<ApiResponseDto<any>> {
    if (!targetDate) {
      return {
        code: 400,
        message: 'targetDate is required (YYYY-MM-DD format)',
        data: null,
      };
    }

    const result = await this.productionService.getBatchProductionGuide({
      targetDate,
    });

    return {
      code: 0,
      message: 'Success',
      data: result,
    };
  }

  @Delete('batches/:batchId')
  @ApiOperation({ summary: 'Delete production batch' })
  @ApiParam({
    name: 'batchId',
    description: 'Production batch ID',
    example: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Batch deleted successfully',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: '删除成功' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete batch in current status',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 400 },
        message: {
          type: 'string',
          example: 'Cannot delete batch with status COMPLETED',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Batch not found',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Production batch not found' },
      },
    },
  })
  async deleteBatch(
    @Param('batchId') batchId: string,
  ): Promise<ApiResponseDto<void>> {
    await this.productionService.deleteProductionBatch(batchId);
    return {
      code: 0,
      message: '删除成功',
      data: null,
    };
  }

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
              adminRemark: { type: 'string', nullable: true },
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
            pdfUrl: {
              type: 'string',
              example: 'https://cdn.../print-tasks/task-xxx.pdf',
            },
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
}
