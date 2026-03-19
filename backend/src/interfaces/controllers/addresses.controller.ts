/**
 * Addresses Controller
 * Handles address management endpoints
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UsePipes,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { AddressService } from '../../application/address/address.service';
import { CreateAddressDto } from '../dto/addresses/create-address.dto';
import { UpdateAddressDto } from '../dto/addresses/update-address.dto';
import { AddressDto } from '../dto/addresses/address-response.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { Address, AddressRegion } from '../../domain/address/address.entity';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

@ApiTags('Addresses')
@Controller('api/v1/addresses')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AddressesController {
  constructor(private readonly addressService: AddressService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List all addresses for the current user' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Address list retrieved successfully',
    type: [AddressDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async listAddresses(
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<AddressDto[]>> {
    // Map customerId to userId (domain uses userId)
    const userId = user.customerId;

    const addresses = await this.addressService.listAddresses(userId);
    const response = addresses.map((addr) => this.mapAddressToDto(addr));

    return ApiResponseDto.success(response);
  }

  @Post()
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new address' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({ type: CreateAddressDto })
  @ApiResponse({
    status: 201,
    description: 'Address created successfully',
    type: AddressDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async createAddress(
    @Body() createAddressDto: CreateAddressDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<AddressDto>> {
    // Map customerId to userId (domain uses userId)
    const userId = user.customerId;

    const address = await this.addressService.createAddress({
      userId,
      recipientName: createAddressDto.recipientName,
      phone: createAddressDto.phone,
      region: this.mapRegionDtoToDomain(createAddressDto.region),
      detail: createAddressDto.detail,
      isDefault: createAddressDto.isDefault,
    });

    return ApiResponseDto.success(this.mapAddressToDto(address));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an address' })
  @ApiParam({ name: 'id', description: 'Address ID' })
  @ApiBody({ type: UpdateAddressDto })
  @ApiResponse({
    status: 200,
    description: 'Address updated successfully',
    type: AddressDto,
  })
  @ApiResponse({ status: 404, description: 'Address not found' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async updateAddress(
    @Param('id') id: string,
    @Body() updateAddressDto: UpdateAddressDto,
  ): Promise<ApiResponseDto<AddressDto> | ApiResponseDto<null>> {
    try {
      const updateData: {
        recipientName?: string;
        phone?: string;
        region?: AddressRegion;
        detail?: string;
      } = {};

      if (updateAddressDto.recipientName !== undefined) {
        updateData.recipientName = updateAddressDto.recipientName;
      }
      if (updateAddressDto.phone !== undefined) {
        updateData.phone = updateAddressDto.phone;
      }
      if (updateAddressDto.region !== undefined) {
        updateData.region = this.mapRegionDtoToDomain(updateAddressDto.region);
      }
      if (updateAddressDto.detail !== undefined) {
        updateData.detail = updateAddressDto.detail;
      }

      const address = await this.addressService.updateAddress(id, updateData);

      return ApiResponseDto.success(this.mapAddressToDto(address));
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Post(':id/set-default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set an address as default' })
  @ApiParam({ name: 'id', description: 'Address ID' })
  @ApiResponse({
    status: 200,
    description: 'Address set as default successfully',
    type: AddressDto,
  })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async setDefaultAddress(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<AddressDto> | ApiResponseDto<null>> {
    try {
      const address = await this.addressService.setDefaultAddress(id);

      return ApiResponseDto.success(this.mapAddressToDto(address));
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an address' })
  @ApiParam({ name: 'id', description: 'Address ID' })
  @ApiResponse({
    status: 204,
    description: 'Address deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async deleteAddress(@Param('id') id: string): Promise<void> {
    return this.addressService.deleteAddress(id);
  }

  private mapAddressToDto(address: Address): AddressDto {
    return {
      id: address.id,
      userId: address.userId,
      recipientName: address.recipientName,
      phone: address.phone,
      region: {
        province: address.region.province,
        city: address.region.city,
        district: address.region.district,
      },
      detail: address.detail,
      isDefault: address.isDefault,
    };
  }

  private mapRegionDtoToDomain(region: {
    province: string;
    city: string;
    district: string;
  }): AddressRegion {
    return {
      province: region.province,
      city: region.city,
      district: region.district,
    };
  }
}
