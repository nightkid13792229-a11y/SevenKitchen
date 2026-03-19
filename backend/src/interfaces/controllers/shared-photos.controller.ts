/**
 * Shared Photos Controller
 * Handles public access to shared order photos via token
 */

import {
  Controller,
  Get,
  Param,
  NotFoundException,
  GoneException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/prisma.service';
import { ApiResponseDto } from '../dto/common/response.dto';

export class SharedPhotosResponseDto {
  photos!: string[];
  uploadedAt!: Date;
}

@ApiTags('Shared Photos')
@Controller('api/v1/shared-photos')
export class SharedPhotosController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Get shared photos by token' })
  @ApiParam({ name: 'token', description: 'Share token' })
  @ApiResponse({
    status: 200,
    description: 'Photos retrieved successfully',
    type: SharedPhotosResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Token not found or order not found',
  })
  @ApiResponse({ status: 410, description: 'Token has expired' })
  async getSharedPhotos(
    @Param('token') token: string,
  ): Promise<ApiResponseDto<SharedPhotosResponseDto> | ApiResponseDto<null>> {
    try {
      // Find the share token
      const shareToken = await this.prisma.photoShareToken.findUnique({
        where: { token },
      });

      // Token not found
      if (!shareToken) {
        return ApiResponseDto.error(
          404,
          'Share link not found or has been deleted',
        );
      }

      // Check if token has expired
      if (new Date() > shareToken.expiresAt) {
        return ApiResponseDto.error(410, 'Share link has expired');
      }

      // Get order items for this order
      const orderItems = await this.prisma.orderItem.findMany({
        where: { orderId: shareToken.orderId },
        select: { id: true },
      });

      if (!orderItems || orderItems.length === 0) {
        return ApiResponseDto.error(404, 'No order items found');
      }

      const orderItemIds = orderItems.map((item) => item.id);

      // Find packaging units that contain these order items
      // The sourceOrderItemIds is a String[] field
      const packagingUnits = await this.prisma.packagingUnit.findMany({
        where: {
          sourceOrderItemIds: {
            hasSome: orderItemIds,
          },
        },
        select: {
          photosCooked: true,
          photosPortioned: true,
          photosRaw: true,
          createdAt: true,
        },
      });

      if (!packagingUnits || packagingUnits.length === 0) {
        return ApiResponseDto.error(404, 'No photos found for this order');
      }

      // Collect all photos from all packaging units
      const allPhotos: string[] = [];
      let latestCreatedAt = packagingUnits[0]?.createdAt || new Date();

      for (const unit of packagingUnits) {
        // Add raw photos (原料照片)
        if (unit.photosRaw && unit.photosRaw.length > 0) {
          allPhotos.push(...unit.photosRaw);
        }
        // Add cooked photos
        if (unit.photosCooked && unit.photosCooked.length > 0) {
          allPhotos.push(...unit.photosCooked);
        }
        // Add portioned photos
        if (unit.photosPortioned && unit.photosPortioned.length > 0) {
          allPhotos.push(...unit.photosPortioned);
        }
        // Track the latest creation date
        if (unit.createdAt > latestCreatedAt) {
          latestCreatedAt = unit.createdAt;
        }
      }

      if (allPhotos.length === 0) {
        return ApiResponseDto.error(404, 'No photos found for this order');
      }

      const response: SharedPhotosResponseDto = {
        photos: allPhotos,
        uploadedAt: latestCreatedAt,
      };

      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof GoneException) {
        return ApiResponseDto.error(410, error.message);
      }
      throw error;
    }
  }
}
