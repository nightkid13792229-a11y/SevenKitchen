/**
 * Custom Recipe Admin Controller
 * Handles custom recipe order management for administrators
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomRecipeService } from '../../../application/custom-recipe/custom-recipe.service';
import {
  CreateRecipeDTO,
  UpdateScheduleDTO,
} from '../../../application/custom-recipe/dto/custom-recipe.dto';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../../auth/auth.guard';
import { CustomRecipeStatus, TargetGoal } from '@prisma/client';
import { WechatService } from '../../../infrastructure/wechat/wechat.service';

@ApiTags('admin/custom-recipe')
@Controller('admin/custom-recipe')
@UseGuards(AuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminCustomRecipeController {
  constructor(
    private readonly customRecipeService: CustomRecipeService,
    private readonly wechatService: WechatService,
  ) {}

  /**
   * Get all custom recipe orders (admin only)
   */
  @Get('orders')
  @ApiOperation({ summary: 'Get all custom recipe orders' })
  async getAllOrders(
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 20,
  ) {
    const { orders, total } = await this.customRecipeService.getOrders({
      status: status as CustomRecipeStatus,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      search,
      page,
      pageSize,
    });

    return {
      orders,
      total,
      page,
      pageSize,
      summary: await this.customRecipeService.getStatistics({
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
      }),
    };
  }

  /**
   * Get order detail (admin)
   */
  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Get order detail' })
  async getOrderDetail(@Param('orderId') orderId: string) {
    const order = await this.customRecipeService.getOrderByOrderId(orderId);

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return order;
  }

  /**
   * Confirm payment
   */
  @Patch('orders/:orderId/confirm-payment')
  @ApiOperation({ summary: 'Confirm payment' })
  async confirmPayment(@Param('orderId') orderId: string) {
    const order = await this.customRecipeService.getOrderByOrderId(orderId);

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    await this.customRecipeService.updateOrder(orderId, {
      status: CustomRecipeStatus.PAID,
      paymentConfirmedAt: new Date(),
    });

    // Send WeChat notification
    if (order.customer?.wechatOpenid) {
      await this.wechatService
        .sendCustomRecipeOrderNotification(
          order.customer.wechatOpenid,
          order.orderId,
          'PAID',
        )
        .catch((error) => {
          console.error('Failed to send WeChat notification:', error);
        });
    }

    return {
      code: 200,
      message: '付款已确认',
      data: {
        status: 'PAID',
        paymentConfirmedAt: new Date(),
      },
    };
  }

  /**
   * Update order status
   */
  @Patch('orders/:orderId/status')
  @ApiOperation({ summary: 'Update order status' })
  async updateStatus(
    @Param('orderId') orderId: string,
    @Body('status') status: CustomRecipeStatus,
  ) {
    await this.customRecipeService.updateOrderStatus(orderId, status);

    return {
      code: 200,
      message: '订单状态已更新',
    };
  }

  /**
   * Create recipe and deliver
   */
  @Post('orders/:orderId/create-recipe')
  @ApiOperation({ summary: 'Create recipe and deliver' })
  async createRecipe(
    @Param('orderId') orderId: string,
    @Body() dto: CreateRecipeDTO,
  ) {
    const order = await this.customRecipeService.getOrderByOrderId(orderId);

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (order.status !== CustomRecipeStatus.PAID) {
      throw new BadRequestException('订单未付款，无法创建食谱');
    }

    // Create recipe
    const recipe = await this.customRecipeService['prisma'].recipe.create({
      data: {
        recipeId: `CR${Date.now()}`,
        version: 1,
        name: dto.name,
        description: dto.description,
        coverImageUrl: dto.coverImageUrl,
        nutritionDetailedData: dto.nutritionTarget,
        productionSteps: dto.productionSteps,
        detailImages: dto.detailImages || [],
        videoUrl: dto.videoUrl,
        nutritionStandard: 'FEDIAF_2021',
        status: 'PUBLIC',
        isCustomRecipe: true,
        customOrderId: orderId,
        nutritionReportUrl: dto.nutritionReportUrl,
        energyDensityKcalPerKg:
          dto.nutritionTarget?.energy_density_kcal_per_kg || 3200,
        productionLossRate: 1.07,
      },
    });

    // Create recipe items if provided
    if (dto.items && dto.items.length > 0) {
      await this.customRecipeService['prisma'].recipeItem.createMany({
        data: dto.items.map((item: any) => ({
          recipeId: recipe.recipeId,
          recipeVersion: recipe.version,
          ingredientId: item.ingredientId,
          preparationMethod: item.preparationMethod,
          ratioPercent: item.ratioPercent,
          sortOrder: item.sortOrder || 0,
        })),
      });
    }

    // Update order
    await this.customRecipeService.updateOrder(orderId, {
      recipeId: recipe.id,
      status: CustomRecipeStatus.DELIVERED,
      deliveredAt: new Date(),
    });

    // Send WeChat notification to customer
    if (order.customer?.wechatOpenid) {
      await this.wechatService
        .sendCustomRecipeOrderNotification(
          order.customer.wechatOpenid,
          order.orderId,
          'DELIVERED',
          recipe.id,
        )
        .catch((error) => {
          console.error('Failed to send WeChat notification:', error);
        });
    }

    return {
      code: 200,
      data: {
        recipeId: recipe.id,
        orderId: order.orderId,
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    };
  }

  /**
   * Get schedule (admin)
   */
  @Get('schedule')
  @ApiOperation({ summary: 'Get schedule' })
  async getSchedule(@Query('month') month: string) {
    const [year, monthNum] = month.split('-').map(Number);
    const { start, end } = require('../../../utils/date-helpers').getMonthRange(
      year,
      monthNum,
    );

    const schedules = await this.customRecipeService.getScheduleRange(
      start,
      end,
    );

    return {
      dates: schedules.map((schedule) => ({
        date: require('../../../utils/date-helpers').formatDateToYYYYMMDD(
          schedule.date,
        ),
        capacity: schedule.capacity,
        bookedCount: schedule.bookedCount,
        remainingCapacity: Math.max(
          0,
          schedule.capacity - schedule.bookedCount,
        ),
        isAvailable: schedule.isAvailable,
        isPublicHoliday: schedule.isPublicHoliday,
      })),
    };
  }

  /**
   * Batch update schedule
   */
  @Post('schedule/batch-set')
  @ApiOperation({ summary: 'Batch update schedule' })
  async batchSetSchedule(@Body() dto: UpdateScheduleDTO) {
    const dateFrom = new Date(dto.dateFrom);
    const dateTo = new Date(dto.dateTo);

    let updatedDates = 0;
    let skippedDates = 0;

    const currentDate = new Date(dateFrom);
    const endDate = new Date(dateTo);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();

      // Skip weekends if not included
      if (!dto.includeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        skippedDates++;
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Skip public holidays if requested
      if (dto.skipPublicHolidays) {
        const isHoliday =
          await require('../../../utils/date-helpers').isPublicHoliday(
            currentDate,
          );
        if (isHoliday) {
          skippedDates++;
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }
      }

      await this.customRecipeService.updateSchedule(new Date(currentDate), {
        capacity: dto.capacity,
        isAvailable: true,
      });

      updatedDates++;
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const totalCapacitySet = updatedDates * dto.capacity;

    return {
      code: 200,
      data: {
        updatedDates,
        skippedDates,
        totalCapacitySet,
      },
    };
  }

  /**
   * Get order statistics
   */
  @Get('statistics')
  @ApiOperation({ summary: 'Get order statistics' })
  async getStatistics(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const stats = await this.customRecipeService.getStatistics({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });

    return {
      code: 200,
      data: stats,
    };
  }

  /**
   * Delete attachment
   */
  @Delete('attachments/:attachmentId')
  @ApiOperation({ summary: 'Delete attachment' })
  async deleteAttachment(@Param('attachmentId') attachmentId: string) {
    await this.customRecipeService.deleteAttachment(attachmentId);

    return {
      code: 200,
      message: '附件已删除',
    };
  }

  /**
   * Upload attachment
   */
  @Post('upload-attachment')
  @ApiOperation({ summary: 'Upload attachment' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @UploadedFile() file: Express.Multer.File,
    @Body('orderId') orderId: string,
  ) {
    if (!file) {
      throw new BadRequestException('请选择文件');
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('文件大小不能超过10MB');
    }

    const attachment = await this.customRecipeService.uploadAttachment(
      file,
      orderId,
    );

    return {
      code: 200,
      data: attachment,
    };
  }
}
