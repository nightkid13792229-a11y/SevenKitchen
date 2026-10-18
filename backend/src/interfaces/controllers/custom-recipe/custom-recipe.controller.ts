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
  NotFoundException,
  UseInterceptors,
  UploadedFile,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomRecipeService } from '../../../application/custom-recipe/custom-recipe.service';
import { CustomRecipeDeliveryService } from '../../../application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeAftersaleService } from '../../../application/custom-recipe/custom-recipe-aftersale.service';
import { CustomRecipeViewService } from '../../../application/custom-recipe/custom-recipe-view.service';
import { MiniProgramCodeService } from '../../../application/wechat/mini-program-code.service';
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
    /**
     * 渲染契约的视图组装（2026-10-16 批次 1.5）。
     *
     * 加上它之后，响应里会多一个 `renderable` 字段 ——
     * 状态中文、能不能点、进度时间轴都在里面，前端照着渲染即可。
     * **这是追加字段**，老小程序忽略它、继续用原来的 `status` 字符串，
     * 因此两端可以不同步上线（真正切换在批次 2）。
     */
    private readonly viewService: CustomRecipeViewService,
    /** 交付记录（批次 2.4）：顾客看内容、确认收到 */
    private readonly deliveryService: CustomRecipeDeliveryService,
    /** 售后（批次 2.5）：顾客提交、查看进度、撤回 */
    private readonly aftersaleService: CustomRecipeAftersaleService,
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
      // 2026-10-18：需求 2.3.4 第二段（只问档案里没有的）
      currentFoodMain: dto.currentFoodMain || null,
      changeReasons: Array.isArray(dto.changeReasons) ? dto.changeReasons : [],
      changeReasonOther: dto.changeReasonOther || null,
      stomachConditions: Array.isArray(dto.stomachConditions)
        ? dto.stomachConditions
        : [],
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

    /**
     * ★ 渲染契约（2026-10-16 批次 5.4）。
     *
     * 列表页此前用**写死的状态判断**决定按钮
     * （`status === 'PENDING_PAYMENT'` / `status === 'DELIVERED'`），
     * 于是订单一变成「已完成」，列表上就**再也看不到「查看定制食谱」** ——
     * 顾客确认收货后反而找不到自己的食谱，只能绕进详情页。
     *
     * 现在按钮与状态文案都由后端算（与详情页同一套判定）。
     *
     * ⚠️ 三个配置值在这里取**一次**，不是每单取一次；渲染契约并发组装。
     * 逐单去取配置会让 20 单的列表查 60 次配置。
     */
    const [requireCustomerConfirm, aftersaleWindowDays] = await Promise.all([
      this.customRecipeService.getRequireCustomerConfirm(),
      this.customRecipeService.getAftersaleWindowDays(),
    ]);

    const renderables = await Promise.all(
      orders.map((order) =>
        this.viewService.buildCustomerView({
          status: order.status,
          createdAt: order.createdAt,
          paymentConfirmedAt: order.paymentConfirmedAt,
          deliveredAt: order.deliveredAt,
          completedAt: order.completedAt,
          estimatedDeliveryDate: order.estimatedDeliveryDate,
          paymentDeadlineAt: this.resolvePaymentDeadline(
            order,
            paymentTimeoutMinutes,
          ),
          cancellationReason: order.cancellationReason,
          refundStatus: order.refundStatus ?? null,
          refundAmount: this.toNullableNumber(order.refundAmount),
          hasAnyDelivery: (order.deliveries ?? []).length > 0,
          hasUnconfirmedDelivery: (order.deliveries ?? []).some(
            (delivery: any) => !delivery.confirmedAt,
          ),
          hasOpenAftersale: (order.aftersales ?? []).length > 0,
          requireCustomerConfirm,
          aftersaleWindowDays,
        }),
      ),
    );

    return ApiResponseDto.success({
      orders: orders.map((order, index) => ({
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
        renderable: renderables[index],
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

    /**
     * 当前有效的那一版交付（`replacedByDeliveryId = null`）。
     *
     * 重新交付后只会有最新一版符合条件 —— 旧版本留着可查，
     * 但顾客默认看到的是最新的那份。
     */
    const currentDelivery = (order.deliveries ?? [])[0] ?? null;

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
      /**
       * 交付摘要（批次 2.4）—— **不含快照本体**。
       *
       * 快照有几十 KB，而订单详情页只需要知道"交没交、第几版、
       * 包含哪几样"。要看内容走 `orders/:orderId/delivery`。
       */
      delivery: currentDelivery
        ? {
            id: currentDelivery.id,
            version: currentDelivery.version,
            deliveredAt: currentDelivery.deliveredAt,
            confirmedAt: currentDelivery.confirmedAt,
            itemCodes: Array.isArray(currentDelivery.items)
              ? currentDelivery.items
              : [],
            /** 交付后几天自动完成 —— 页面要写"请在 X 前确认" */
            autoCompleteAt: order.autoCompleteAt ?? null,
          }
        : null,

      /**
       * 渲染契约三件套（2026-10-16 批次 1.5）。
       *
       * 状态中文、能不能点、为什么不能点、进度时间轴 —— 全在这里，
       * 小程序拿到后**只管渲染**，不再自己写映射表与判断。
       *
       * ⚠️ 这是**追加字段**：上面的 `status` 字符串原样保留，
       * 老小程序忽略 `renderable` 照常工作，所以两端不必同批上线。
       * 真正切到三件套、删掉旧字段是在批次 2。
       */
      renderable: await this.viewService.buildCustomerView({
        status: order.status,
        createdAt: order.createdAt,
        paymentConfirmedAt: order.paymentConfirmedAt,
        deliveredAt: order.deliveredAt,
        completedAt: order.completedAt ?? null,
        estimatedDeliveryDate: order.estimatedDeliveryDate ?? null,
        paymentDeadlineAt: this.resolvePaymentDeadline(
          order,
          await this.customRecipeService.getPaymentTimeoutMinutes(),
        ),
        cancellationReason: order.cancellationReason ?? null,
        refundStatus: order.refundStatus ?? null,
        refundAmount: this.toNullableNumber(order.refundAmount),
        /**
         * 批次 2.4：改成看**真的交付记录**，不再拿"订单上挂了食谱"顶替。
         *
         * 两者的区别在重新交付与撤回时会体现出来：食谱挂着不等于顾客
         * 手里有一版可看的内容（撤回后食谱还在，但交付记录已经失效）。
         */
        hasAnyDelivery: Boolean(currentDelivery),
        hasUnconfirmedDelivery: Boolean(
          currentDelivery && !currentDelivery.confirmedAt,
        ),
        /**
         * 售后窗口从**交付时间**起算，不是下单时间。
         *
         * ⚠️ 这里刻意**不重复传 deliveredAt** —— 上面响应体里已经有一个
         * `deliveredAt: order.deliveredAt`，两处重名会直接编译不过
         * （`order.deliveredAt` 与交付记录的 `deliveredAt` 在正常路径下
         * 是同一个时刻，交付服务写订单时就用了它）。
         * 没交付时 `hasAnyDelivery=false` 已经挡住「有问题」，不需要靠窗口兜。
         */
        aftersaleWindowDays:
          await this.customRecipeService.getAftersaleWindowDays(),
        requireCustomerConfirm:
          await this.customRecipeService.getRequireCustomerConfirm(),
      }),
    });
  }

  /**
   * 取当前交付内容（批次 2.4）。
   *
   * ## 为什么单独一个接口，不塞进订单详情
   *
   * 交付快照有几十 KB（完整食材、喂食参数、采购清单、步骤、补充剂），
   * 而**列表与详情页绝大多数时候不需要它** —— 顾客十次里只有一次会点开看。
   * 塞进详情会白白拖慢每一次打开。
   *
   * ## 只返回**当前有效**的那一版
   *
   * 重新交付后旧版本仍然留在库里（客服与顾客都可能要回看），
   * 但默认看到的是最新的。要看历史版本走 `?version=N`。
   */
  @Get('orders/:orderId/delivery')
  @ApiOperation({ summary: 'Get the current delivery of an order' })
  async getOrderDelivery(
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Query('version') version?: string,
  ) {
    const userId = req.user.userId;
    const order = await this.customRecipeService.getOrderByOrderId(orderId);

    if (!order) {
      throw new BadRequestException('订单不存在');
    }
    /** 归属校验：别人的订单连"有没有交付"都不该知道 */
    if (order.customerId !== userId) {
      throw new BadRequestException('无权访问此订单');
    }

    const parsedVersion = version ? Number(version) : null;
    const delivery = await this.deliveryService.findForCustomer({
      orderId: order.id,
      version:
        parsedVersion !== null && Number.isInteger(parsedVersion)
          ? parsedVersion
          : null,
    });

    if (!delivery) {
      /**
       * 还没交付时回 404 而不是空对象 ——
       * 前端能明确区分"还没交"与"交了个空的"。
       */
      throw new NotFoundException('这张订单还没有交付内容');
    }

    return ApiResponseDto.success({
      id: delivery.id,
      version: delivery.version,
      deliveredAt: delivery.deliveredAt,
      confirmedAt: delivery.confirmedAt,
      itemCodes: Array.isArray(delivery.items) ? delivery.items : [],
      /** 内容快照：前端照着渲染，不做任何加工 */
      content: delivery.contentSnapshot,
      /** 交付后几天自动完成 —— 页面要写"请在 X 前确认" */
      autoCompleteAt: order.autoCompleteAt ?? null,
    });
  }

  /**
   * 顾客确认收到（批次 2.4）。
   *
   * 幂等：重复点不报错，也**不刷新确认时间** ——
   * 那个时间是售后窗口的起算依据，不能被第二次点击改掉。
   */
  @Post('orders/:orderId/confirm-receipt')
  @ApiOperation({ summary: 'Customer confirms receipt of the delivery' })
  async confirmReceipt(
    @Req() req: any,
    @Param('orderId') orderId: string,
  ) {
    const userId = req.user.userId;
    const order = await this.customRecipeService.getOrderByOrderId(orderId);

    if (!order) {
      throw new BadRequestException('订单不存在');
    }
    if (order.customerId !== userId) {
      throw new BadRequestException('无权操作此订单');
    }

    const result = await this.deliveryService.confirmReceipt({
      orderIdOrId: orderId,
      channel: 'CUSTOMER',
    });

    return ApiResponseDto.success({
      confirmed: result.confirmed,
      /** 之前已经确认过 —— 前端据此提示"你已经确认过了"，而不是报错 */
      alreadyConfirmed: result.alreadyConfirmed,
    });
  }

  /**
   * 提交售后（批次 2.5）。
   *
   * 类型来自选项字典（`custom_recipe_aftersale_type`），
   * 窗口天数取配置 —— 两者都不写死在这里。
   */
  @Post('orders/:orderId/aftersale')
  @ApiOperation({ summary: 'Customer submits an aftersale request' })
  async createAftersale(
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Body('type') type: string,
    @Body('description') description: string,
    @Body('photos') photos?: string[],
  ) {
    const userId = req.user.userId;

    if (!type) {
      throw new BadRequestException('请选择问题类型');
    }

    const result = await this.aftersaleService.create({
      orderIdOrId: orderId,
      customerId: userId,
      type,
      description,
      photos: Array.isArray(photos) ? photos : [],
    });

    return ApiResponseDto.success(result);
  }

  /**
   * 看这张单的售后（含进度）。
   *
   * 返回的是**能直接渲染的形态**：状态中文、进度时间轴、
   * 能不能撤回都在里面 —— 与订单详情那边的渲染契约同一套思路。
   */
  @Get('orders/:orderId/aftersale')
  @ApiOperation({ summary: 'List aftersale requests of an order' })
  async listAftersale(@Req() req: any, @Param('orderId') orderId: string) {
    const list = await this.aftersaleService.listForCustomer(
      orderId,
      req.user.userId,
    );
    return ApiResponseDto.success({ items: list });
  }

  /**
   * 撤回售后。
   *
   * 只在"还没人受理"时允许 —— 客服已经在处理了还抽走会让客服白忙一轮。
   */
  @Post('aftersale/:aftersaleId/cancel')
  @ApiOperation({ summary: 'Customer cancels an aftersale request' })
  async cancelAftersale(
    @Req() req: any,
    @Param('aftersaleId') aftersaleId: string,
  ) {
    const result = await this.aftersaleService.cancel({
      aftersaleId,
      customerId: req.user.userId,
    });
    return ApiResponseDto.success(result);
  }

  /**
   * 预估交付日期（2026-10-18 · 需求 2.3.5）
   *
   * ⚠️ 必须声明在 `@Get('orders/:orderId')` 之类的通配之前 ——
   * 这条路径不会跟它们冲突（`next-delivery-date` 不是 `orders/...`），
   * 但放在 `@Get('schedule')` 旁边保持"排期相关"聚在一起。
   */
  @Get('next-delivery-date')
  @ApiOperation({ summary: '预估交付日期（下单前告知用，不占位）' })
  async getNextDeliveryDate() {
    return ApiResponseDto.success(
      await this.customRecipeService.getEstimatedDeliveryDate(),
    );
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

    /**
     * 附件大小上限来自后台配置（批次 1.4）。
     * 此前这个 10MB **在两个控制器里各写一遍**，改一处会漏另一处。
     */
    const limits = await this.customRecipeService.getAttachmentLimits();
    if (file.size > limits.maxSizeBytes) {
      throw new BadRequestException(
        `文件大小不能超过${limits.maxSizeMb}MB`,
      );
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
    private readonly miniProgramCodeService: MiniProgramCodeService,
  ) {}

  /**
   * 小程序码地址（2026-10-18）
   *
   * 长图底部要放它，扫了进小程序首页。
   *
   * **由服务端生成**，不需要人工从微信后台下载图片再塞进 `static/` ——
   * 那要求人去做一件机器能做的事，而且图片不进代码仓库就没法上线。
   *
   * 第一次调用会去微信生成（几百毫秒），之后走进程内缓存。
   * 生成失败返回 503，让前端**优雅地不画那一块**（而不是画个空白方块）。
   */
  @Get('miniapp-code')
  @ApiOperation({ summary: '小程序码图片地址（扫码进小程序首页）' })
  async getMiniProgramCode(): Promise<ApiResponseDto<{ url: string }>> {
    try {
      return ApiResponseDto.success({
        url: await this.miniProgramCodeService.getCodeUrl(),
      });
    } catch (error: any) {
      /**
       * 用 503 而不是 500：这是"暂时拿不到"（微信配额/网络），不是程序错误。
       * 前端据此**跳过二维码那一块**，长图照常生成。
       */
      throw new ServiceUnavailableException(
        error?.message || '小程序码暂时不可用',
      );
    }
  }

  @Get()
  @ApiOperation({ summary: '读取食谱定制的公开配置（定制费 / 可抵扣金额 / 交付周期）' })
  async getPublicConfig() {
    return ApiResponseDto.success(
      await this.customRecipeConfigService.getPublicConfig(),
    );
  }
}
