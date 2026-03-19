/**
 * Shipping Controller
 * Handles shipping related endpoints
 */

import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { ShippingService } from '../../application/shipping/shipping.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import type { AddressRepository } from '../../domain/address/address.repository';
import { ADDRESS_REPOSITORY } from '../../application/address/address.service';
import { Inject } from '@nestjs/common';

export class ShippingFeePreviewDto {
  amountShipping!: number;
  templateId!: string;
  ruleAppliedDescription!: string;
}

@ApiTags('Shipping')
@Controller('api/v1/shipping')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ShippingController {
  constructor(
    private readonly shippingService: ShippingService,
    @Inject(ADDRESS_REPOSITORY)
    private readonly addressRepository: AddressRepository,
  ) {}

  @Get('fee/preview')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Preview shipping fee' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiQuery({
    name: 'addressId',
    description: 'Address ID',
    required: true,
  })
  @ApiQuery({
    name: 'totalGrams',
    description: 'Total weight in grams',
    required: true,
    type: Number,
  })
  @ApiQuery({
    name: 'shippingTemplateId',
    description:
      'Optional shipping template ID (uses active template if not provided)',
    required: false,
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Shipping fee preview',
    type: ShippingFeePreviewDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Address or shipping template not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async previewShippingFee(
    @Query('addressId') addressId: string,
    @Query('totalGrams') totalGrams: number,
    @Query('shippingTemplateId') shippingTemplateId?: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ApiResponseDto<ShippingFeePreviewDto> | ApiResponseDto<null>> {
    try {
      // Load address
      const address = await this.addressRepository.findById(addressId);
      if (!address) {
        return ApiResponseDto.error(404, 'Address not found');
      }

      // Validate address belongs to user (optional security check)
      if (user && address.userId !== user.customerId) {
        return ApiResponseDto.error(403, 'Address does not belong to user');
      }

      // Calculate shipping fee
      const result = await this.shippingService.calculateShippingFeePreview({
        region: address.region,
        totalWeightG: totalGrams,
        shippingTemplateId: shippingTemplateId || null,
      });

      return ApiResponseDto.success(result);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }
}
