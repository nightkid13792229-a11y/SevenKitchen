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
import { SubmitCustomRecipeOrderDTO } from '../../../application/custom-recipe/dto/custom-recipe.dto';
import { AuthGuard } from '../../auth/auth.guard';

@ApiTags('custom-recipe')
@Controller('custom-recipe')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class CustomRecipeController {
  constructor(private readonly customRecipeService: CustomRecipeService) {}

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

    return {
      orderId: order.orderId,
      scheduledDate: order.scheduledDate,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      wechatId: process.env.WECHAT_CUSTOMER_SERVICE_ID || 'SevenKitchen',
      amount: order.amount,
    };
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

    return {
      orders: orders.map((order) => ({
        orderId: order.orderId,
        dogName: order.dog.name,
        targetGoal: order.targetGoal,
        scheduledDate: order.scheduledDate,
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        status: order.status,
        amount: order.amount,
        recipeId: order.recipeId,
        createdAt: order.createdAt,
      })),
      total,
      page,
      pageSize,
    };
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

    return {
      orderId: order.orderId,
      dogId: order.dogId,
      dogName: order.dog.name,
      targetGoal: order.targetGoal,
      scheduledDate: order.scheduledDate,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      status: order.status,
      amount: order.amount,
      recipeId: order.recipeId,
      allergies: order.allergies,
      medicalConditions: order.medicalConditions,
      preferredIngredients: order.preferredIngredients,
      dislikedIngredients: order.dislikedIngredients,
      additionalNotes: order.additionalNotes,
      attachments: order.attachments,
      createdAt: order.createdAt,
      paymentConfirmedAt: order.paymentConfirmedAt,
      inProgressAt: order.inProgressAt,
      deliveredAt: order.deliveredAt,
    };
  }

  /**
   * Get available schedule
   */
  @Get('schedule')
  @ApiOperation({ summary: 'Get available schedule' })
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
    };
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

    return {
      fileUrl: attachment.fileUrl,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
      uploadedAt: attachment.uploadedAt,
    };
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

    return summary;
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

    return preferences;
  }
}
