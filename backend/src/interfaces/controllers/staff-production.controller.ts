/**
 * Staff Production Controller
 * Handles staff production management endpoints
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
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
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { StaffGuard } from '../guards/role.guard';

@ApiTags('Staff Production')
@Controller('api/v1/staff/production')
@UseGuards(AuthGuard, StaffGuard)
export class StaffProductionController {
  constructor(
    private readonly staffProductionService: StaffProductionService,
    private readonly cosService: TencentCosService,
  ) {}

  @Get('statistics/today')
  @ApiOperation({ summary: 'Get today production statistics' })
  @ApiResponse({
    status: 200,
    description: 'Today statistics',
    type: ApiResponseDto<TodayStatisticsDto>,
  })
  async getTodayStatistics(): Promise<ApiResponseDto<TodayStatisticsDto>> {
    const stats = await this.staffProductionService.getTodayStatistics();
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
  ): Promise<ApiResponseDto<{ list: PackagingUnitDetailDto[]; total: number }>> {
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
  @ApiOperation({ summary: 'Upload production preparation photos (2-3 photos)' })
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
    // Validate file count
    if (!files || files.length < 2 || files.length > 3) {
      return {
        code: 400,
        message: '必须上传2-3张备料照片',
        data: null,
      };
    }

    // Upload to Tencent COS
    const uploadPromises = files.map(async (file) => {
      const result = await this.cosService.uploadImage(file, file.originalname, `production/${id}`);
      return result.url;
    });

    const photoUrls = await Promise.all(uploadPromises);

    // Save to packaging unit
    const unit = await this.staffProductionService.uploadProductionPhotos(id, photoUrls);

    return {
      code: 0,
      message: '照片上传成功',
      data: {
        photosRaw: unit.photosRaw || [],
      },
    };
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
          },
        },
      },
    },
  })
  async completeProductionTask(
    @Param('id') id: string,
    @Body() dto: CompleteProductionDto,
  ): Promise<ApiResponseDto<any>> {
    const unit = await this.staffProductionService.completeProductionTask(id);
    return {
      code: 0,
      message: '制作完成',
      data: {
        id: unit.id,
        status: unit.status,
      },
    };
  }
}
