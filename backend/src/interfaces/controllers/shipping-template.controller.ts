/**
 * Shipping Template Controller
 * Admin-only endpoint for managing shipping templates
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PrismaShippingTemplateRepository } from '../../infrastructure/repositories/prisma-shipping-template.repository';
import { ShippingFeeService } from '../../domain/shipping/shipping-fee.service';
import {
  CreateShippingTemplateDto,
  UpdateShippingTemplateDto,
} from '../dto/shipping-template.dto';
import { AuthGuard } from '../auth/auth.guard';
import { ApiResponseDto } from '../dto/common/response.dto';

@Controller('api/v1/admin/shipping-templates')
@UseGuards(AuthGuard)
export class ShippingTemplateController {
  constructor(
    private readonly shippingTemplateRepo: PrismaShippingTemplateRepository,
    private readonly shippingFeeService: ShippingFeeService,
  ) {}

  /**
   * List all shipping templates
   * GET /api/v1/admin/shipping-templates
   */
  @Get()
  async listTemplates() {
    const templates = await this.shippingTemplateRepo.findAll();
    return ApiResponseDto.success(templates);
  }

  /**
   * Get a single shipping template by ID
   * GET /api/v1/admin/shipping-templates/:id
   */
  @Get(':id')
  async getTemplate(@Param('id') id: string) {
    const template = await this.shippingTemplateRepo.findById(id);
    if (!template) {
      return ApiResponseDto.error(404, 'Shipping template not found');
    }
    return ApiResponseDto.success(template);
  }

  /**
   * Create a new shipping template
   * POST /api/v1/admin/shipping-templates
   */
  @Post()
  async createTemplate(@Body() dto: CreateShippingTemplateDto) {
    // Create new template with UUID
    const template = {
      id: crypto.randomUUID(),
      ...dto,
      isActive: dto.isActive ?? false,
    };

    const created = await this.shippingTemplateRepo.save(template);
    return ApiResponseDto.success(created);
  }

  /**
   * Update a shipping template
   * PUT /api/v1/admin/shipping-templates/:id
   */
  @Put(':id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateShippingTemplateDto,
  ) {
    const existing = await this.shippingTemplateRepo.findById(id);
    if (!existing) {
      return ApiResponseDto.error(404, 'Shipping template not found');
    }

    const updated = await this.shippingTemplateRepo.save({
      ...existing,
      ...dto,
    });

    return ApiResponseDto.success(updated);
  }

  /**
   * Delete a shipping template
   * DELETE /api/v1/admin/shipping-templates/:id
   */
  @Delete(':id')
  async deleteTemplate(@Param('id') id: string) {
    const existing = await this.shippingTemplateRepo.findById(id);
    if (!existing) {
      return ApiResponseDto.error(404, 'Shipping template not found');
    }

    await this.shippingTemplateRepo.delete(id);
    return ApiResponseDto.success({ message: 'Template deleted successfully' });
  }

  /**
   * Activate a shipping template (deactivates all others)
   * PUT /api/v1/admin/shipping-templates/:id/activate
   */
  @Put(':id/activate')
  async activateTemplate(@Param('id') id: string) {
    const existing = await this.shippingTemplateRepo.findById(id);
    if (!existing) {
      return ApiResponseDto.error(404, 'Shipping template not found');
    }

    const activated = await this.shippingTemplateRepo.activate(id);
    return ApiResponseDto.success(activated);
  }

  /**
   * Preview shipping fee calculation
   * POST /api/v1/admin/shipping-templates/preview
   */
  @Post('preview')
  async previewFee(@Body() body: { templateId: string; totalWeightG: number }) {
    const template = await this.shippingTemplateRepo.findById(body.templateId);
    if (!template) {
      return ApiResponseDto.error(404, 'Shipping template not found');
    }

    const result = this.shippingFeeService.calculateShippingFee(
      {
        region: { province: '', city: '', district: '' },
        totalWeightG: body.totalWeightG,
      },
      template,
    );

    return ApiResponseDto.success(result);
  }
}
