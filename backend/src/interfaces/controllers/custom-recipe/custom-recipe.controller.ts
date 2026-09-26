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
      scheduledDate: new Date(dto.scheduledDate),
      syncToHealthProfile: dto.syncToHealthProfile,
    });

    return ApiResponseDto.success({
      orderId: order.orderId,
      scheduledDate: order.scheduledDate,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      wechatId: process.env.WECHAT_CUSTOMER_SERVICE_ID || 'SevenKitchen',
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

    return ApiResponseDto.success({
      orders: orders.map((order) => ({
        orderId: order.orderId,
        dogName: order.dog?.name ?? '',
        targetGoal: order.targetGoal,
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
        recipeId: order.recipeId,
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
      recipeId: order.recipeId,
      recipeName: order.recipe?.name ?? null,
      recipeCoverImageUrl: order.recipe?.coverImageUrl ?? null,
      allergies: order.allergies,
      medicalConditions: order.medicalConditions,
      preferredIngredients: order.preferredIngredients,
      dislikedIngredients: order.dislikedIngredients,
      additionalNotes: order.additionalNotes,
      attachments: order.attachmentsRecords ?? order.attachments ?? [],
      createdAt: order.createdAt,
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
