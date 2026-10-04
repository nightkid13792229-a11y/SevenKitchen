/**
 * Custom Recipe Controller (Mini Program)
 * Handles custom recipe orders for customers
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomRecipeService } from '../../../application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../application/custom-recipe/custom-recipe-config.service';
import { WechatPaymentService } from '../../../application/payment/wechat-payment.service';
import { SubmitCustomRecipeOrderDTO } from '../../../application/custom-recipe/dto/custom-recipe.dto';
import { AuthGuard } from '../../auth/auth.guard';
import { ApiResponseDto } from '../../dto/common/response.dto';
import {
  formatDateToYYYYMMDD,
  getMonthRange,
} from '../../../utils/date-helpers';

@ApiTags('custom-recipe')
@Controller('api/v1/custom-recipe')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class CustomRecipeController {
  constructor(
    private readonly customRecipeService: CustomRecipeService,
    private readonly wechatPaymentService: WechatPaymentService,
  ) {}

  /**
   * Submit a new custom recipe order
   */
  @Post('orders')
  @ApiOperation({ summary: 'Submit custom recipe order' })
  async submitOrder(@Req() req: any, @Body() dto: SubmitCustomRecipeOrderDTO) {
    const userId = req.user.userId;

    const order = await this.customRecipeService.createOrder({
      customerId: userId,
      dogId: dto.dogId,
      targetGoal: dto.targetGoal,
      allergies: dto.allergies || [],
      medicalConditions: dto.medicalConditions || [],
      additionalNotes: dto.additionalNotes,
      preferredIngredients: dto.preferredIngredients || [],
      dislikedIngredients: dto.dislikedIngredients || [],
      attachmentUrls: dto.attachmentUrls || [],
      syncToHealthProfile: dto.syncToHealthProfile,
      needsHealthManagement: dto.needsHealthManagement === true,
    });

    return ApiResponseDto.success({
      orderId: order.orderId,
      /**
       * 2026-10-04：scheduledDate / estimatedDeliveryDate 现在都**由服务端排期**得出
       * （顾客不再选日期），小程序必须用这里返回的值展示，不能再自己假定"今天"。
       */
      scheduledDate: order.scheduledDate,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      paymentDeadlineAt: this.resolvePaymentDeadline(
        order,
        await this.customRecipeService.getPaymentTimeoutMinutes(),
      ),
      /**
       * 2026-09-28 移除 wechatId：定制链路找客服已改走**企业微信客服**
       * （wx.openCustomerServiceChat，后台 corp_id / open_kfid 已配置），
       * 不再需要告诉顾客"加哪个个人微信号"。
       * 这个字段此前还把环境变量缺失时的兜底值当成真号显示给顾客。
       */
      amount: Number(order.amount),
      creditAmount: Number(order.creditAmount),
    });
  }

  /**
   * Get my custom recipe orders
   */
  @Get('my-orders')
  @ApiOperation({ summary: 'Get my custom recipe orders' })
  async getMyOrders(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 20,
  ) {
    const userId = req.user.userId;

    const { orders, total } = await this.customRecipeService.getOrders({
      customerId: userId,
      status: status as any,
      page,
      pageSize,
    });

    const paymentTimeoutMinutes =
      await this.customRecipeService.getPaymentTimeoutMinutes();

    return ApiResponseDto.success({
      orders: orders.map((order) => ({
        orderId: order.orderId,
        dogName: order.dog?.name ?? '',
        targetGoal: order.targetGoal,
        needsHealthManagement: Boolean(order.needsHealthManagement),
        scheduledDate: order.scheduledDate,
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        status: order.status,
        amount: Number(order.amount),
        creditAmount: Number(order.creditAmount),
        creditUsed: Number(order.creditUsed),
        creditRemaining: Math.max(
          0,
          Number(order.creditAmount) - Number(order.creditUsed),
        ),
        /**
         * 交付后的食谱，给小程序的是**业务编号**（Recipe.recipeId）。
         *
         * 2026-09-28 修复：这里原先回的是 order.recipeId，那是 Recipe 的主键。
         * 而小程序打开食谱详情走 GET /recipes/:id，后端按业务编号查
         * （prisma-recipe.repository.ts 的 where: { recipeId: id }），
         * 于是"查看定制食谱"必然 404 —— 生产上已交付的那一单就是这么坏的。
         */
        recipeId: order.recipe?.recipeId ?? null,
        /**
         * 支付时限与退款进展（2026-10-04）。
         * 小程序据此显示"请在 X 分钟内支付"和"退款中 / 已退款 ¥XX"。
         * 此前这两件事顾客完全看不到，超时被关单、退款成没成都只能来问客服。
         */
        paymentDeadlineAt: this.resolvePaymentDeadline(
          order,
          paymentTimeoutMinutes,
        ),
        refundStatus: order.refundStatus ?? null,
        refundAmount: this.toNullableNumber(order.refundAmount),
        refundedAt: order.refundedAt ?? null,
        createdAt: order.createdAt,
      })),
      total,
      page,
      pageSize,
    });
  }

  /**
   * 发起微信支付（返回小程序调起支付所需参数）
   */
  @Post('orders/:orderId/pay')
  @ApiOperation({ summary: '发起定制订单微信支付' })
  async payOrder(@Req() req: any, @Param('orderId') orderId: string) {
    return ApiResponseDto.success(
      await this.wechatPaymentService.createCustomRecipeJsapiPayment(
        orderId,
        req.user.userId,
      ),
    );
  }

  /**
   * 主动查询微信支付结果（回调丢失时兜底）
   */
  @Post('orders/:orderId/sync-payment')
  @ApiOperation({ summary: '主动查询定制订单支付结果' })
  async syncPayment(@Req() req: any, @Param('orderId') orderId: string) {
    return ApiResponseDto.success(
      await this.wechatPaymentService.syncCustomRecipePayment(
        orderId,
        req.user.userId,
      ),
    );
  }

  /**
   * Get order detail
   */
  /**
   * 顾客自助取消（老板拍板的决策 12 + Q2）。
   *
   * 还没开始制作就能取消；已付款的全额原路退回微信，不需要客服先确认。
   */
  @Post('orders/:orderId/cancel')
  @ApiOperation({ summary: 'Cancel my custom recipe order and refund if paid' })
  async cancelMyOrder(
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Body('reason') reason?: string,
  ) {
    const userId = req.user.userId;

    const result = await this.customRecipeService.cancelOrderByCustomer(
      orderId,
      userId,
      async (targetOrderId, refundReason) =>
        this.wechatPaymentService.createCustomRecipeRefund({
          orderId: targetOrderId,
          reason: refundReason,
        }),
      (reason || '').trim() || undefined,
    );

    return ApiResponseDto.success({
      status: 'CANCELLED',
      refundStatus: result.refundStatus,
    });
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Get order detail' })
  async getOrderDetail(@Req() req: any, @Param('orderId') orderId: string) {
    const userId = req.user.userId;

    const order = await this.customRecipeService.getOrderByOrderId(orderId);

    if (!order) {
      throw new BadRequestException('订单不存在');
    }

    if (order.customerId !== userId) {
      throw new BadRequestException('无权访问此订单');
    }

    return ApiResponseDto.success({
      orderId: order.orderId,
      dogId: order.dogId,
      dogName: order.dog?.name ?? '',
      targetGoal: order.targetGoal,
      needsHealthManagement: Boolean(order.needsHealthManagement),
      scheduledDate: order.scheduledDate,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      status: order.status,
      amount: Number(order.amount),
      creditAmount: Number(order.creditAmount),
      creditUsed: Number(order.creditUsed),
      creditRemaining: Math.max(
        0,
        Number(order.creditAmount) - Number(order.creditUsed),
      ),
      // 同上：给小程序必须回业务编号，否则"查看定制食谱"打不开
      recipeId: order.recipe?.recipeId ?? null,
      recipeName: order.recipe?.name ?? null,
      recipeCoverImageUrl: order.recipe?.coverImageUrl ?? null,
      allergies: order.allergies,
      medicalConditions: order.medicalConditions,
      preferredIngredients: order.preferredIngredients,
      dislikedIngredients: order.dislikedIngredients,
      additionalNotes: order.additionalNotes,
      attachments: order.attachmentsRecords ?? order.attachments ?? [],
      createdAt: order.createdAt,
      /**
       * 支付时限 + 退款/取消进展（2026-10-04）。
       * 顾客要能看懂"为什么这单被取消了""钱退到哪一步了"，
       * 而不是只看到一个冷冰冰的"已取消"。
       */
      paymentDeadlineAt: this.resolvePaymentDeadline(
        order,
        await this.customRecipeService.getPaymentTimeoutMinutes(),
      ),
      refundStatus: order.refundStatus ?? null,
      refundAmount: this.toNullableNumber(order.refundAmount),
      refundedAt: order.refundedAt ?? null,
      cancelledAt: order.cancelledAt ?? null,
      cancellationReason: order.cancellationReason ?? null,
      paymentConfirmedAt: order.paymentConfirmedAt,
      inProgressAt: order.inProgressAt,
      deliveredAt: order.deliveredAt,
    });
  }

  /**
   * Get available schedule
   */
  @Get('schedule')
  @ApiOperation({ summary: 'Get available schedule' })
  async getSchedule(@Query('month') month: string) {
    /**
     * 2026-10-04：原来没校验 month，缺参数时 `undefined.split` 直接崩成 500。
     * 参数缺失属于调用方问题，应该回 400 而不是服务器错误。
     */
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('month 参数格式应为 YYYY-MM');
    }

    const [year, monthNum] = month.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNum);

    const schedules = await this.customRecipeService.getScheduleRange(
      start,
      end,
    );

    return ApiResponseDto.success({
      dates: schedules.map((schedule) => ({
        date: formatDateToYYYYMMDD(schedule.date),
        isAvailable:
          schedule.isAvailable &&
          !schedule.isPublicHoliday &&
          schedule.bookedCount < schedule.capacity,
        isPublicHoliday: schedule.isPublicHoliday,
        remainingCapacity: Math.max(
          0,
          schedule.capacity - schedule.bookedCount,
        ),
        bookedCount: schedule.bookedCount,
      })),
    });
  }

  /**
   * Upload attachment
   */
  @Post('upload-attachment')
  @ApiOperation({ summary: 'Upload attachment' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('orderId') orderId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('请选择文件');
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('文件大小不能超过10MB');
    }

    if (!orderId) {
      throw new BadRequestException('缺少订单ID');
    }

    /**
     * 归属校验（2026-10-04 修复越权）。
     *
     * 此前这里只检查"有没有传订单号"，于是任何登录顾客都能把文件挂到
     * **别人**的定制单上；订单号不存在时还会因外键失败打成 500。
     * 现在先确认这张单确实是本人的，订单不存在则返回业务错误。
     */
    await this.customRecipeService.assertOrderOwnership(
      req.user.userId,
      orderId,
    );

    const attachment = await this.customRecipeService.uploadAttachment(
      file,
      orderId,
    );

    return ApiResponseDto.success({
      fileUrl: attachment.fileUrl,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
      uploadedAt: attachment.uploadedAt,
    });
  }

  /**
   * Get dog health summary
   */
  @Get('dogs/:dogId/health-summary')
  @ApiOperation({ summary: 'Get dog health summary' })
  async getDogHealthSummary(@Req() req: any, @Param('dogId') dogId: string) {
    const userId = req.user.userId;

    // Verify dog ownership
    const dog = await this.customRecipeService['prisma'].dog.findFirst({
      where: { id: dogId, ownerId: userId },
    });

    if (!dog) {
      throw new BadRequestException('狗狗不存在或无权访问');
    }

    const summary = await this.customRecipeService.getDogHealthSummary(dogId);

    return ApiResponseDto.success(summary);
  }

  /**
   * Analyze dog preferences
   */
  @Get('dogs/:dogId/preference-analysis')
  @ApiOperation({ summary: 'Analyze dog preferences from order history' })
  async analyzeDogPreferences(@Req() req: any, @Param('dogId') dogId: string) {
    const userId = req.user.userId;

    // Verify dog ownership
    const dog = await this.customRecipeService['prisma'].dog.findFirst({
      where: { id: dogId, ownerId: userId },
    });

    if (!dog) {
      throw new BadRequestException('狗狗不存在或无权访问');
    }

    const preferences =
      await this.customRecipeService.analyzeDogPreferences(dogId);

    return ApiResponseDto.success(preferences);
  }

  /**
   * 待付款订单的支付截止时间（2026-10-04）。
   *
   * 小程序据此显示"还剩 X 分钟"，避免顾客在毫不知情的情况下被自动关单。
   * 非待付款单、或后台把支付超时配成 0（不自动关单）时返回 null，
   * 小程序拿到 null 就不显示时限文案。
   */
  private resolvePaymentDeadline(
    order: { status: string; createdAt: Date },
    timeoutMinutes: number,
  ): string | null {
    if (order.status !== 'PENDING_PAYMENT') return null;
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) return null;

    return new Date(
      new Date(order.createdAt).getTime() + timeoutMinutes * 60 * 1000,
    ).toISOString();
  }

  /** Decimal / null 统一成 number | null，避免小程序收到字符串金额 */
  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}

/**
 * 食谱定制的公开配置（无需登录）
 *
 * 首页入口卡与定制页在未登录时就要显示价格，所以这部分必须公开。
 * 只暴露顾客看得懂的三项：定制费、可抵扣金额、交付周期。
 * 接单上限等内部产能参数不对外。
 */
@ApiTags('custom-recipe')
@Controller('api/v1/custom-recipe-config')
export class PublicCustomRecipeConfigController {
  constructor(
    private readonly customRecipeConfigService: CustomRecipeConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: '读取食谱定制的公开配置（定制费 / 可抵扣金额 / 交付周期）' })
  async getPublicConfig() {
    return ApiResponseDto.success(
      await this.customRecipeConfigService.getPublicConfig(),
    );
  }
}
