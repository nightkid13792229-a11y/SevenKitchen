/**
 * Staff Kitchen Controller
 * Phase 8.12: Kitchen Task Data Capture MVP
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { KitchenService, type UpdateTaskDto } from '../../application/kitchen/kitchen.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { PackagingUnitStatus } from '../../domain/production';
import { BadRequestException } from '@nestjs/common';

@ApiTags('Staff Kitchen')
@Controller('api/v1/staff/kitchen')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class StaffKitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get('batches')
  @ApiOperation({ summary: 'List production batches by task status' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: PackagingUnitStatus,
    description: 'Filter by packaging unit status (PENDING, IN_PROGRESS, COMPLETED)',
  })
  @ApiResponse({
    status: 200,
    description: 'Production batch summary list',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          productionDate: { type: 'string', format: 'date' },
          status: { type: 'string' },
          taskCount: { type: 'number' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                recipeSnapshotId: { type: 'string' },
                recipeName: { type: 'string' },
                totalProductionG: { type: 'number' },
                status: { type: 'string' },
                hasPhotos: { type: 'boolean' },
                hasActualUsage: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  })
  async listBatches(
    @Query('status') status?: string,
  ): Promise<ApiResponseDto<any[]>> {
    try {
      // Validate status parameter if provided
      let statusEnum: PackagingUnitStatus | undefined = undefined;
      if (status) {
        const upperStatus = status.toUpperCase();
        if (!Object.values(PackagingUnitStatus).includes(upperStatus as PackagingUnitStatus)) {
          throw new BadRequestException(
            `Invalid status: ${status}. Must be one of: ${Object.values(PackagingUnitStatus).join(', ')}`,
          );
        }
        statusEnum = upperStatus as PackagingUnitStatus;
      }

      const batches = await this.kitchenService.listBatchesByStatus(statusEnum);
      return ApiResponseDto.success(batches);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message) as any;
      }
      // Log unexpected errors for debugging
      console.error('Error in listBatches:', {
        message: error?.message,
        stack: error?.stack,
        status: status,
      });
      throw error;
    }
  }

  @Get('batches/:batchId')
  @ApiOperation({ summary: 'Get production batch detail with tasks' })
  @ApiParam({ name: 'batchId', description: 'Production Batch ID' })
  @ApiResponse({
    status: 200,
    description: 'Production batch detail',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        productionDate: { type: 'string', format: 'date' },
        status: { type: 'string' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              recipeSnapshotId: { type: 'string' },
              recipeName: { type: 'string' },
              totalProductionG: { type: 'number' },
              status: { type: 'string' },
              ingredientsUsageSnapshot: { type: 'object' },
              photosRaw: { type: 'array', items: { type: 'string' } },
              photosCooked: { type: 'array', items: { type: 'string' } },
              photosPortioned: { type: 'array', items: { type: 'string' } },
              sourceOrderItemIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Production batch not found' })
  async getBatchDetail(
    @Param('batchId') batchId: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const batch = await this.kitchenService.getBatchDetail(batchId);
      return ApiResponseDto.success(batch);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Post('tasks/:taskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update production task with actual usage and photos' })
  @ApiParam({ name: 'taskId', description: 'Task ID (PackagingUnit ID)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        actualWeightG: {
          type: 'number',
          description: 'Single actual weight (alternative to ingredientsActual)',
        },
        ingredientsActual: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ingredientId: { type: 'string' },
              actual_g: { type: 'number' },
            },
          },
          description: 'Per-ingredient actual weights',
        },
        photosRaw: {
          type: 'array',
          items: { type: 'string' },
          description: 'Raw ingredient photo URLs',
        },
        photosCooked: {
          type: 'array',
          items: { type: 'string' },
          description: 'Cooked food photo URLs',
        },
        photosPortioned: {
          type: 'array',
          items: { type: 'string' },
          description: 'Portioned food photo URLs',
        },
        status: {
          type: 'string',
          enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED'],
          description: 'Task status (optional)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Task updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        ingredientsUsageSnapshot: { type: 'object' },
        photosRaw: { type: 'array', items: { type: 'string' } },
        photosCooked: { type: 'array', items: { type: 'string' } },
        photosPortioned: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async updateTask(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const unit = await this.kitchenService.updateTask(taskId, dto);
      return ApiResponseDto.success({
        id: unit.id,
        status: unit.status,
        ingredientsUsageSnapshot: unit.ingredientsUsageSnapshot,
        photosRaw: unit.photosRaw,
        photosCooked: unit.photosCooked,
        photosPortioned: unit.photosPortioned,
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }
}
