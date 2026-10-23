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
import { CustomRecipePricingService } from '../../../application/custom-recipe/custom-recipe-pricing.service';
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
    /** 多份购买（2026-10-20）：报价必须由服务端权威计算 */
    private readonly customRecipeConfigService: CustomRecipeConfigService,
    private readonly customRecipePricingService: CustomRecipePricingService,
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
      // 2026-10-19：顾客自由文本（报告识别也回填到这里）
      allergyText: dto.allergyText ?? null,
      // 本单报告草稿：付款前只存订单，不写狗狗档案
      allergyReportDrafts: dto.allergyReportDrafts ?? [],
      medicalConditions: dto.medicalConditions || [],
      additionalNotes: dto.additionalNotes,
      // 2026-10-18：需求 2.3.4 第二段（只问档案里没有的）
      allergyStatus: dto.allergyStatus,
      clientRequestId: dto.clientRequestId || null,
      currentFoodMain: dto.currentFoodMain || null,
      currentFoodOther: dto.currentFoodOther || null,
      changeReasons: Array.isArray(dto.changeReasons) ? dto.changeReasons : [],
      changeReasonOther: dto.changeReasonOther || null,
      stomachConditions: Array.isArray(dto.stomachConditions)
        ? dto.stomachConditions
        : [],
      stomachOther: dto.stomachOther || null,
      preferredIngredients: dto.preferredIngredients || [],
      dislikedIngredients: dto.dislikedIngredients || [],
      attachmentUrls: dto.attachmentUrls || [],
      attachmentKeys: dto.attachmentKeys || [],
      syncToHealthProfile: dto.syncToHealthProfile,
      needsHealthManagement: dto.needsHealthManagement === true,
      // 2026-10-20 多份购买：份数与肉类偏好只做透传，金额一律由服务端报价
      recipeQuantity: dto.recipeQuantity,
      requestedProteinCodes: dto.requestedProteinCodes,
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
          hasAnyDelivery:
            (order.deliveries ?? []).length > 0 ||
            (order.deliveryBatches ?? []).length > 0,
          hasUnconfirmedDelivery:
            (order.deliveries ?? []).some(
              (delivery: any) => !delivery.confirmedAt,
            ) ||
            (order.deliveryBatches ?? []).some(
              (batch: any) => !batch.confirmedAt,
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
        dogId: order.dogId,
        dogName: order.dog?.name ?? '',
        targetGoal: order.targetGoal,
        needsHealthManagement: Boolean(order.needsHealthManagement),
        scheduledDate: order.scheduledDate,
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        status: order.status,
        amount: Number(order.amount),
        /**
         * 交付后的食谱，给小程序的是**业务编号**（Recipe.recipeId）。
         *
         * 2026-09-28 修复：这里原先回的是 order.recipeId，那是 Recipe 的主键。
         * 而小程序打开食谱详情走 GET /recipes/:id，后端按业务编号查
         * （prisma-recipe.repository.ts 的 where: { recipeId: id }），
         * 于是"查看定制食谱"必然 404 —— 生产上已交付的那一单就是这么坏的。
         */
        recipeId: order.recipe?.recipeId ?? null,
        recipeName: order.recipe?.name ?? null,
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
   * 多份定制报价（2026-10-20 多份购买 · 第一阶段）
   *
   * 金额只能由后端算：小程序确认页展示的 900 / 72 / 828 必须与这里一致，
   * 下单时服务端还会用同一个 `CustomRecipePricingService` 再算一遍并快照。
   *
   * ⚠️ 必须排在 `orders/:orderId` 这类通配路由之前。`quote` 本身是静态段，
   * 但今后若有人加 `@Get(':id')` 之类的通配，声明顺序错了就会被吞掉。
   * 登录守卫沿用控制器上的 `@UseGuards(AuthGuard)`，报价不对未登录用户开放。
   */
  @Get('quote')
  @ApiOperation({ summary: 'Quote multi recipe order' })
  async quote(@Query('quantity') quantity?: string) {
    const config = await this.customRecipeConfigService.getConfig();
    const parsed = this.parseQuoteQuantity(quantity, config.maxRecipeQuantity);

    /**
     * 开关关闭时连报价也不能给多份价格（2026-10-20 复核）。
     *
     * 与下单侧同一条规则：前端隐藏选择器只是体验层，接口直调也必须挡住。
     * 1 份不受影响 —— 单份订单在开关关闭时仍然正常卖。
     */
    if (parsed > 1 && config.multiRecipeEnabled !== true) {
      throw new BadRequestException('多份购买暂未开放，请选择 1 份');
    }

    return ApiResponseDto.success(
      this.customRecipePricingService.quote(parsed, config),
    );
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

    // 私有 COS 附件 → 短时签名 URL（2026-10-19 P0）
    Object.assign(
      order,
      await this.customRecipeService.signOrderMedia(order),
    );

    /**
     * 当前有效的那一版交付（`replacedByDeliveryId = null`）。
     *
     * 重新交付后只会有最新一版符合条件 —— 旧版本留着可查，
     * 但顾客默认看到的是最新的那份。
     */
    const currentDelivery = (order.deliveries ?? [])[0] ?? null;

    /**
     * 多份交付批次（2026-10-21 · 顾客交付切片）。
     *
     * 多份订单整批交付走的是批次表，**不写老的单份交付表** ——
     * 所以 `delivery` 对这类订单是 null，信息必须从 `deliveryBatch` 取。
     * 老订单没有批次 → null，`delivery` 字段与以前完全一致。
     */
    const deliveryBatch = await this.deliveryService.findLatestBatchForOrder(
      order.id,
    );

    /**
     * 「有没有交付」要把批次算进来：只认老交付表的话，多份订单交付后
     * 顾客看不到「查看定制食谱」，也点不到「确认收到」。
     */
    const hasAnyDelivery = Boolean(currentDelivery || deliveryBatch);
    const hasUnconfirmedDelivery = Boolean(
      (currentDelivery && !currentDelivery.confirmedAt) ||
      (deliveryBatch && !deliveryBatch.confirmedAt),
    );
    const hasOpenAftersale =
      typeof this.aftersaleService.hasOpenForOrder === 'function'
        ? await this.aftersaleService.hasOpenForOrder(order.id)
        : false;

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
      // 同上：给小程序必须回业务编号，否则"查看定制食谱"打不开
      recipeId: order.recipe?.recipeId ?? null,
      recipeName: order.recipe?.name ?? null,
      recipeCoverImageUrl: order.recipe?.coverImageUrl ?? null,
      allergies: order.allergies,
      // 2026-10-19：自由文本原样返回（老订单为 null）
      allergyText: order.allergyText ?? null,
      allergyStatus: order.allergyStatus ?? null,
      // 需求 2.3.4：顾客填的饲喂历史必须回给客户详情
      currentFoodMain: order.currentFoodMain ?? null,
      currentFoodOther: order.currentFoodOther ?? null,
      changeReasons: order.changeReasons ?? [],
      changeReasonOther: order.changeReasonOther ?? null,
      stomachConditions: order.stomachConditions ?? [],
      stomachOther: order.stomachOther ?? null,
      // 本单报告草稿（付款后转正式报告）
      allergyReportDrafts: order.allergyReportDrafts ?? [],
      medicalConditions: order.medicalConditions,
      preferredIngredients: order.preferredIngredients,
      dislikedIngredients: order.dislikedIngredients,
      additionalNotes: order.additionalNotes,
      /**
       * 顾客端只需要 URL 字符串。
       * 优先用订单上的 attachmentUrls（备注区上传），
       * 没有时才从后台附件记录里取 fileUrl。
       */
      attachments:
        Array.isArray(order.attachments) && order.attachments.length > 0
          ? order.attachments
          : (order.attachmentsRecords ?? []).map(
              (record: any) => record.fileUrl,
            ),
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
       * 多份交付摘要（2026-10-21）—— 同样是**不含快照本体**的列表。
       *
       * 形状与老的 `delivery` 刻意不同：
       *   · 老字段保持原样（老小程序 / 老订单不受影响）；
       *   · 新字段用 `items` 表达 N 份，每份带自己的交付物清单；
       *   · `recipeId` 给的是**业务编号**，前端拿它打开食谱详情 / DIY。
       */
      deliveryBatch: deliveryBatch
        ? {
            id: deliveryBatch.id,
            version: deliveryBatch.version,
            deliveredAt: deliveryBatch.deliveredAt,
            confirmedAt: deliveryBatch.confirmedAt,
            autoCompleteAt: order.autoCompleteAt ?? null,
            items: (deliveryBatch.items ?? []).map((item) => ({
              deliveryItemId: item.id,
              recipeId: item.recipe?.recipeId ?? null,
              recipeName: item.recipe?.name ?? null,
              recipeCoverImageUrl: item.recipe?.coverImageUrl ?? null,
              itemCodes: Array.isArray(item.items) ? item.items : [],
            })),
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
         * 2026-10-21：多份订单的交付在批次表里，也要算进来 ——
         * 否则整批交付后顾客既看不到「查看定制食谱」也点不到「确认收到」。
         */
        hasAnyDelivery,
        hasUnconfirmedDelivery,
        hasOpenAftersale,
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
    const versionFilter =
      parsedVersion !== null && Number.isInteger(parsedVersion)
        ? parsedVersion
        : null;

    /**
     * 多份交付批次（2026-10-21）：整批交付的订单没有老的单份交付记录，
     * 先看批次；有批次就返回 N 份各自的内容快照。
     *
     * 返回形状与老接口**不同**（`batchId` + `items`），但路径与鉴权一致：
     * 前端拿到 `batchId` 就知道这是多份交付，按 `items` 渲染 N 张卡片。
     */
    const batch = await this.deliveryService.findBatchForCustomer({
      orderId: order.id,
      version: versionFilter,
    });

    if (batch) {
      return ApiResponseDto.success({
        batchId: batch.id,
        version: batch.version,
        deliveredAt: batch.deliveredAt,
        confirmedAt: batch.confirmedAt,
        /**
         * 批次级交付物 = 各份的**并集**（去重、保持出现顺序）。
         *
         * 每份自己还有 `items[].itemCodes` —— 前端要判断"这一份有没有采购单"
         * 必须用份级字段；批次级只表示"整批里出现过哪些交付物"。
         */
        itemCodes: Array.from(
          new Set(
            (batch.items ?? []).flatMap((item) =>
              Array.isArray(item.items) ? item.items : [],
            ),
          ),
        ),
        items: (batch.items ?? []).map((item) => ({
          /** 交付明细 id —— 售后指定"哪一份"时要用它 */
          id: item.id,
          recipeId: item.recipe?.recipeId ?? null,
          recipeName: item.recipe?.name ?? null,
          recipeCoverImageUrl: item.recipe?.coverImageUrl ?? null,
          itemCodes: Array.isArray(item.items) ? item.items : [],
          /** 内容快照：前端照着渲染，不做任何加工 */
          content: item.contentSnapshot,
        })),
      });
    }

    const delivery = await this.deliveryService.findForCustomer({
      orderId: order.id,
      version: versionFilter,
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
   *
   * 2026-10-21：多份订单整批交付只有批次、没有老的单份交付记录；
   * 由 `deliveryService.confirmReceipt` 先判批次 —— 一次确认代表 N 份全收到，
   * 接口形状（confirmed / alreadyConfirmed）保持原样。
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
    /**
     * 多份订单可选：涉及哪几份 / 每份的诉求说明（2026-10-21）。
     * 原样交给服务层校验 —— 归属批次、非空说明都由那里统一判断，
     * 控制器不复制一套规则（否则两处口径迟早不一致）。
     */
    @Body('deliveryItemIds') deliveryItemIds?: string[],
    @Body('recipeRequests') recipeRequests?: unknown,
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
      deliveryItemIds,
      recipeRequests,
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
    /**
     * 配额一起返回（2026-10-18 · 需求 2.5.7）。
     *
     * 「**必须先显示两个数字**：窗口还剩几天、免费修改还剩几次 ——
     *   不让顾客猜自己还能不能提。」
     *
     * 放在同一个响应里而不是另开一个接口：页面本来就只调这一次，
     * 拆成两次会让"数字还没到、表单先出来"的中间态存在。
     */
    const quota = await this.aftersaleService.getQuota(
      orderId,
      req.user.userId,
    );
    return ApiResponseDto.success({ items: list, quota });
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
   * 2026-10-21：接受 `quantity`，按份数返回交期（N 份要找剩余产能 ≥ N 的日期，
   * 并按设计工时往后推）。不传时仍按 1 份，老版本小程序不用改。
   *
   * 多份开关关闭时 >1 与报价接口同一条规则：接口直调也不能绕开。
   *
   * ⚠️ 必须声明在 `@Get('orders/:orderId')` 之类的通配之前 ——
   * 这条路径不会跟它们冲突（`next-delivery-date` 不是 `orders/...`），
   * 但放在 `@Get('schedule')` 旁边保持"排期相关"聚在一起。
   */
  @Get('next-delivery-date')
  @ApiOperation({ summary: '预估交付日期（下单前告知用，不占位）' })
  async getNextDeliveryDate(@Query('quantity') quantity?: string) {
    const config = await this.customRecipeConfigService.getConfig();
    const parsed =
      quantity === undefined
        ? 1
        : this.parseQuoteQuantity(quantity, config.maxRecipeQuantity);

    if (parsed > 1 && config.multiRecipeEnabled !== true) {
      throw new BadRequestException('多份购买暂未开放，请选择 1 份');
    }

    return ApiResponseDto.success(
      await this.customRecipeService.getEstimatedDeliveryDate(parsed),
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
   * 备注区附件的草稿上传（2026-10-19）。
   *
   * 订单还没创建，所以不挂订单、不做归属校验；只校验登录 + 大小 + 类型，
   * 存到 `custom-recipe-attachments/`，返回 url/key。
   * 提交订单时 URL 随 `attachmentUrls` 保存；不会写狗狗档案。
   */
  @Post('draft-attachments')
  @ApiOperation({ summary: 'Upload a draft note attachment' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDraftAttachment(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('请选择文件');
    }

    const allowedMimes = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    const allowedExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.heic',
      '.heif',
      '.pdf',
      '.doc',
      '.docx',
    ];
    const name = String(file.originalname || '').toLowerCase();
    if (
      !allowedMimes.has(file.mimetype) &&
      !allowedExtensions.some((extension) => name.endsWith(extension))
    ) {
      throw new BadRequestException(
        '仅支持 JPG、PNG、GIF、WEBP、HEIC、PDF、DOC、DOCX 文件',
      );
    }

    const limits = await this.customRecipeService.getAttachmentLimits();
    if (file.size > limits.maxSizeBytes) {
      throw new BadRequestException(
        `文件大小不能超过${limits.maxSizeMb}MB`,
      );
    }

    const result =
      await this.customRecipeService.uploadDraftAttachment(file);
    return ApiResponseDto.success(result);
  }

  /**
   * 重新签发本地草稿附件的预览 URL（2026-10-19）。
   *
   * 媒体代理 token 是进程内的，后端重启/多实例后旧 URL 会失效；
   * 小程序草稿里保存了 COS key，打开页面时可用这个接口刷新。
   */
  @Post('draft-attachments/sign')
  @ApiOperation({ summary: 'Refresh draft attachment preview URLs' })
  async signDraftAttachmentUrls(
    @Body() body: { keys?: string[] },
  ) {
    const keys = Array.isArray(body?.keys)
      ? body.keys.map((key) => String(key || '').trim()).filter(Boolean)
      : [];
    if (keys.length > 30) {
      throw new BadRequestException('附件数量异常');
    }
    return ApiResponseDto.success(
      await this.customRecipeService.signDraftAttachmentKeys(keys),
    );
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

  /**
   * 严格解析报价份数：只接受十进制整数字符串。
   *
   * 不能直接用 Number()：`Number('')` / `Number(undefined)` 会得到 0/NaN，
   * `Number('1e0')`、`Number('0x3')` 又会把各种写法放进来。报价参数只应
   * 接受 `1`、`2`、`3` 这样的数字串；缺参、小数、科学计数法、数组统一 400。
   * 上限取**后台当前配置**（最多 5），而不是永远写死 5。
   */
  private parseQuoteQuantity(
    raw: string | undefined,
    maxQuantity: number,
  ): number {
    const message = `份数必须是 1~${maxQuantity} 的整数`;

    if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) {
      throw new BadRequestException(message);
    }

    const quantity = Number(raw.trim());
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > maxQuantity
    ) {
      throw new BadRequestException(message);
    }
    return quantity;
  }
}

/**
 * 食谱定制的公开配置（无需登录）
 *
 * 首页入口卡与定制页在未登录时就要显示价格，所以这部分必须公开。
 * 只暴露顾客看得懂的两项：定制费、交付周期。
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
  @ApiOperation({ summary: '读取食谱定制的公开配置（定制费 / 交付周期）' })
  async getPublicConfig() {
    return ApiResponseDto.success(
      await this.customRecipeConfigService.getPublicConfig(),
    );
  }
}
