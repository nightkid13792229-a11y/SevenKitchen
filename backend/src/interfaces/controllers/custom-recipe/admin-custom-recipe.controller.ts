/**
 * Custom Recipe Admin Controller
 * Handles custom recipe order management for administrators
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
  CustomRecipeConfigService,
  type UpdateCustomRecipeConfigDto,
} from '../../../application/custom-recipe/custom-recipe-config.service';
import {
  CreateRecipeDTO,
  UpdateScheduleDTO,
} from '../../../application/custom-recipe/dto/custom-recipe.dto';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../../auth/auth.guard';
import { CustomRecipeStatus } from '@prisma/client';
import { WechatService } from '../../../infrastructure/wechat/wechat.service';
import { ApiResponseDto } from '../../dto/common/response.dto';
import {
  formatDateToYYYYMMDD,
  getMonthRange,
  isPublicHoliday,
} from '../../../utils/date-helpers';

@ApiTags('admin/custom-recipe')
@Controller('api/v1/admin/custom-recipe')
@UseGuards(AuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminCustomRecipeController {
  constructor(
    private readonly customRecipeService: CustomRecipeService,
    private readonly customRecipeConfigService: CustomRecipeConfigService,
    private readonly wechatService: WechatService,
  ) {}

  // ---------- 食谱定制设置 ----------

  /**
   * 读取食谱定制配置（定制费 / 可抵扣金额 / 交付周期 / 接单上限 / 支付超时）
   */
  @Get('config')
  @ApiOperation({ summary: '读取食谱定制设置' })
  async getConfig() {
    return ApiResponseDto.success(
      await this.customRecipeConfigService.getConfig(),
    );
  }

  /**
   * 更新食谱定制配置
   *
   * 只影响**之后提交**的订单：定制费与可抵扣金额在下单时已快照进订单，
   * 改价不会动到已提交/已付款顾客的额度。
   */
  @Put('config')
  @ApiOperation({ summary: '更新食谱定制设置' })
  async updateConfig(@Body() dto: UpdateCustomRecipeConfigDto) {
    return ApiResponseDto.success(
      await this.customRecipeConfigService.updateConfig(dto),
    );
  }

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

    return ApiResponseDto.success({
      orders: orders.map((order) => ({
        ...order,
        amount: Number(order.amount),
        creditAmount: Number(order.creditAmount),
        creditUsed: Number(order.creditUsed),
        creditRemaining: Math.max(
          0,
          Number(order.creditAmount) - Number(order.creditUsed),
        ),
      })),
      total,
      page,
      pageSize,
      summary: await this.customRecipeService.getStatistics({
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
      }),
    });
  }

  /**
   * 恢复抵扣额度（人工处理退款时使用）
   *
   * 顾客用了定制费抵扣成品货款之后又退款，已用掉的额度需要还回去。
   * 本次退款走后台人工，所以这里也是人工按钮，不做自动恢复。
   * 不传 amount 表示"把已用的全部还回去"。
   */
  @Post('orders/:orderId/restore-credit')
  @ApiOperation({ summary: '恢复定制抵扣额度' })
  async restoreCredit(
    @Param('orderId') orderId: string,
    @Body('amount') amount?: number | string | null,
  ) {
    const parsedAmount =
      amount === undefined || amount === null || amount === ''
        ? undefined
        : Number(amount);

    if (parsedAmount !== undefined && !Number.isFinite(parsedAmount)) {
      throw new BadRequestException('恢复金额必须是数字');
    }

    const result = await this.customRecipeService.restoreCredit({
      orderIdOrId: orderId,
      amount: parsedAmount,
    });

    const summary = await this.customRecipeService.getCreditSummary(orderId);

    return ApiResponseDto.success({
      ...summary,
      restored: result.restored,
    });
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

    return ApiResponseDto.success({
      ...order,
      amount: Number(order.amount),
      creditAmount: Number(order.creditAmount),
      creditUsed: Number(order.creditUsed),
      creditRemaining: Math.max(
        0,
        Number(order.creditAmount) - Number(order.creditUsed),
      ),
    });
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

    return ApiResponseDto.success({
      status: 'PAID',
      paymentConfirmedAt: new Date(),
    });
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

    return ApiResponseDto.success({ status });
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
        customOrderId: order.id,
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

    return ApiResponseDto.success({
      recipeId: recipe.id,
      orderId: order.orderId,
      status: 'DELIVERED',
      deliveredAt: new Date(),
    });
  }

  /**
   * Get schedule (admin)
   */
  @Get('schedule')
  @ApiOperation({ summary: 'Get schedule' })
  async getSchedule(@Query('month') month: string) {
    const [year, monthNum] = month.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNum);

    const schedules = await this.customRecipeService.getScheduleRange(
      start,
      end,
    );

    return ApiResponseDto.success({
      dates: schedules.map((schedule) => ({
        date: formatDateToYYYYMMDD(schedule.date),
        capacity: schedule.capacity,
        bookedCount: schedule.bookedCount,
        remainingCapacity: Math.max(
          0,
          schedule.capacity - schedule.bookedCount,
        ),
        isAvailable: schedule.isAvailable,
        isPublicHoliday: schedule.isPublicHoliday,
      })),
    });
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
        const holiday = await isPublicHoliday(currentDate);
        if (holiday) {
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

    return ApiResponseDto.success({
      updatedDates,
      skippedDates,
      totalCapacitySet,
    });
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

    return ApiResponseDto.success(stats);
  }

  /**
   * Delete attachment
   */
  @Delete('attachments/:attachmentId')
  @ApiOperation({ summary: 'Delete attachment' })
  async deleteAttachment(@Param('attachmentId') attachmentId: string) {
    await this.customRecipeService.deleteAttachment(attachmentId);

    return ApiResponseDto.success({ deleted: true });
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

    return ApiResponseDto.success(attachment);
  }
}
