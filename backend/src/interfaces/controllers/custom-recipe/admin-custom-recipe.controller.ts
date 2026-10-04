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
  ForbiddenException,
  NotFoundException,
  Req,
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
import { StaffGuard } from '../../guards/role.guard';
import { AuthGuard } from '../../auth/auth.guard';
import { CustomRecipeStatus } from '@prisma/client';
import { WechatService } from '../../../infrastructure/wechat/wechat.service';
import { WechatPaymentService } from '../../../application/payment/wechat-payment.service';
import { ApiResponseDto } from '../../dto/common/response.dto';
import {
  formatDateToYYYYMMDD,
  getMonthRange,
  isPublicHoliday,
} from '../../../utils/date-helpers';

@ApiTags('admin/custom-recipe')
@Controller('api/v1/admin/custom-recipe')
/**
 * 权限口径（老板 2026-10-04 口径 2）：
 *   · **客服/员工**可以做日常：看订单、确认收款、开始制作、上传附件；
 *   · **仅管理员**：食谱定制设置、恢复抵扣额度、交付食谱（含重新交付）、取消订单、排期批量设置。
 *
 * 此前整个控制器只放开 ADMIN，而后台菜单对所有登录者可见 ——
 * 员工看得见菜单、点进去任何操作都 403，只能找管理员。
 * 敏感动作在各自路由上单独挂 AdminGuard。
 */
@UseGuards(AuthGuard, StaffGuard)
@ApiBearerAuth()
export class AdminCustomRecipeController {
  constructor(
    private readonly customRecipeService: CustomRecipeService,
    private readonly customRecipeConfigService: CustomRecipeConfigService,
    private readonly wechatService: WechatService,
    /**
     * 后台取消"已付款"订单时要先原路退款（2026-10-04 老板口径 3），
     * 所以这里需要支付服务。注入方向是 controller → payment → custom-recipe，
     * 不构成循环依赖。
     */
    private readonly wechatPaymentService: WechatPaymentService,
  ) {}

  // ---------- 食谱定制设置 ----------

  /**
   * 读取食谱定制配置（定制费 / 可抵扣金额 / 交付周期 / 接单上限 / 支付超时）
   */
  @Get('config')
  /** 设置类接口保持仅管理员：单价与产能参数不该由客服改（口径 2） */
  @UseGuards(AdminGuard)
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
  /** 改价格与产能只允许管理员（口径 2） */
  @UseGuards(AdminGuard)
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
  /** 恢复抵扣额度等于把顾客的钱还回去，仅管理员（口径 2） */
  @UseGuards(AdminGuard)
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

    /**
     * 只有待付款的单才需要"确认收款"。
     *
     * 原先这里没有任何前置判断，重复点击或误操作会把**已交付**的单打回已付款，
     * 而订单上的交付时间/食谱关联还留着 —— 状态和数据就对不上了。
     */
    if (order.status !== CustomRecipeStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        `订单当前状态是 ${order.status}，无需确认收款`,
      );
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
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Body('status') status: CustomRecipeStatus,
    @Body('reason') reason?: string,
  ) {
    /**
     * 2026-10-04 补校验：原来 status 直接透传给 Prisma，
     * 写错一个字母就变成 500（Prisma 枚举错误），提示也看不懂。
     */
    if (!Object.values(CustomRecipeStatus).includes(status)) {
      throw new BadRequestException(
        `状态值不合法，可选：${Object.values(CustomRecipeStatus).join(' / ')}`,
      );
    }

    /**
     * 口径 2：「开始制作」是日常操作（客服可做），但**取消订单只允许管理员**。
     * 取消会退款、会释放当天名额、还会通知顾客，是不可逆动作。
     */
    if (
      status === CustomRecipeStatus.CANCELLED &&
      req?.user?.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('取消订单需要管理员权限');
    }

    /**
     * 取消一张**已付款**的定制单要先原路退款（老板 2026-10-04 口径 3）。
     *
     * 此前后台取消只释放当天名额、既不退款也不提示，钱留在我们账上，
     * 往往要等顾客来问才发现。退款失败就不取消 ——
     * 宁可保持原状，也不要出现"取消了钱没退"。
     */
    if (status === CustomRecipeStatus.CANCELLED) {
      const order = await this.customRecipeService.getOrderByOrderId(orderId);

      if (!order) {
        throw new NotFoundException('订单不存在');
      }

      if (order.status === CustomRecipeStatus.PAID) {
        await this.wechatPaymentService.createCustomRecipeRefund({
          orderId: order.orderId,
          reason: (reason || '').trim() || '后台取消定制订单',
        });
      }
    }

    // 流转合法性、取消释放名额、各时间戳都在 service 里统一处理
    await this.customRecipeService.updateOrderStatus(orderId, status, {
      reason,
    });

    return ApiResponseDto.success({ status });
  }

  /**
   * Create recipe and deliver
   */
  @Post('orders/:orderId/create-recipe')
  /** 交付食谱只允许管理员（口径 2）：交付即终态，且会给顾客发通知 */
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create recipe and deliver' })
  async createRecipe(
    @Param('orderId') orderId: string,
    @Body() dto: CreateRecipeDTO,
  ) {
    const order = await this.customRecipeService.getOrderByOrderId(orderId);

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    // 「开始制作」之后也要能交付：原来的判断只允许 PAID，
    // 而工作台的自然动线是 确认付款 → 开始制作 → 填食谱 → 提交，
    // 于是这条动线必定报错，且报的是一句看不懂的"订单未付款，无法创建食谱"。
    if (
      order.status !== CustomRecipeStatus.PAID &&
      order.status !== CustomRecipeStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        `当前状态（${order.status}）无法创建食谱，请先确认收款`,
      );
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
        nutritionStandard: dto.nutritionStandard || 'FEDIAF_2025',
        /**
         * 定制食谱**不是公开食谱**。
         *
         * 2026-09-28 修复：原先写成 PUBLIC，而公开列表只按 status 过滤、
         * 不排除定制食谱 —— 等于按某一只狗的病情做的食谱会出现在
         * 所有顾客的食谱列表里。改成 PRIVATE_CUSTOM 后：
         *   · 不出现在任何公开列表（buildPublicRecipeWhere 要求 status = PUBLIC）
         *   · 只有这只狗的主人（customerOwnerId）和员工能打开
         *     （recipes.controller.ts 的 getAccessibleRecipe 已支持这个判断）
         * 同时补上 customerOwnerId，否则主人自己也被挡在外面。
         */
        status: 'PRIVATE_CUSTOM',
        isCustomRecipe: true,
        customOrderId: order.id,
        customerOwnerId: order.customerId,
        /**
         * W4-B：定制食谱必须记清"给哪个客户、哪只狗"。
         * 客户和狗在订单上本来就有（order.customerId / order.dogId），
         * 之前只写了客户、漏了狗 —— 补上。
         */
        customerDogId: order.dogId,
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
          // 传**业务编号**：通知里点击后跳到 /pages/recipe-detail/index?id=...
          // 而那个页面按业务编号查食谱。传主键的话顾客点开就是 404。
          recipe.recipeId,
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
   * 列出可以交付到这张定制单的食谱（2026-10-04）。
   *
   * 员工在设计器里做完食谱后，回到订单页从这里选一下就能交付，
   * 不必再把数值、食材、步骤手工重抄进「创建定制食谱」表单。
   */
  @Get('orders/:orderId/recipe-candidates')
  @ApiOperation({ summary: 'List recipes that can be delivered to this order' })
  async getRecipeCandidates(@Param('orderId') orderId: string) {
    return ApiResponseDto.success(
      await this.customRecipeService.listDeliverableRecipes(orderId),
    );
  }

  /**
   * 把已设计好的食谱交付到订单（含口径 4 的「重新交付」）。
   *
   * 与手工交付共用同一套结果口径：订单转已交付 + 给顾客发订阅消息（带业务编号）。
   */
  @Post('orders/:orderId/deliver-recipe')
  /** 交付（含重新交付）只允许管理员（口径 2） */
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Deliver an existing custom recipe to the order' })
  async deliverRecipe(
    @Param('orderId') orderId: string,
    @Body('recipeId') recipeId: string,
  ) {
    const target = (recipeId || '').trim();
    if (!target) {
      throw new BadRequestException('请选择要交付的食谱');
    }

    const result = await this.customRecipeService.deliverExistingRecipe(
      orderId,
      target,
    );

    /**
     * 重新交付也要发通知：顾客手里那份已经换了，不通知他会一直按旧食谱看。
     * 通知失败不影响交付结果（订单已经改好了）。
     */
    const order = await this.customRecipeService.getOrderByOrderId(orderId);
    if (order?.customer?.wechatOpenid && this.wechatService) {
      await this.wechatService
        .sendCustomRecipeOrderNotification(
          order.customer.wechatOpenid,
          order.orderId,
          'DELIVERED',
          // 传业务编号：通知里点开的是 /pages/recipe-detail/index?id=...
          result.recipeBizId,
        )
        .catch((error) => {
          console.error('[CustomRecipe] 交付通知发送失败:', error);
        });
    }

    return ApiResponseDto.success({
      ...result,
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
    // 2026-10-04：缺 month 时原来会 `undefined.split` 崩成 500，这里回 400
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
  /** 批量改产能与可约状态只允许管理员（口径 2） */
  @UseGuards(AdminGuard)
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
