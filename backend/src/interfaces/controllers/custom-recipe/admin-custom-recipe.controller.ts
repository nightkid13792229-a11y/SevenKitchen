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
import { CustomRecipeDeliveryService } from '../../../application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeAftersaleService } from '../../../application/custom-recipe/custom-recipe-aftersale.service';
import { CustomRecipeViewService } from '../../../application/custom-recipe/custom-recipe-view.service';
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
import { TimezoneUtil } from '../../../utils/timezone.util';
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
    /**
     * 交付服务（2026-10-16 批次 2.1）：建交付记录 + 内容快照 + 算喂食量。
     */
    private readonly deliveryService: CustomRecipeDeliveryService,
    /** 售后处理（批次 3.1）：待办列表、受理、处理完成、不受理 */
    private readonly aftersaleService: CustomRecipeAftersaleService,
    /**
     * 后台视角的渲染契约（批次 5.5）。
     *
     * `buildStaffView` 从批次 2 就写好了（接单/去设计/交付/重新交付/
     * 取消/处理售后/恢复抵扣/联系客户 全都算得出），但**一直没人调用** ——
     * 于是后台页面只能自己写死状态判断，也就有了"订单一变已完成、
     * 「查看食谱」就消失"这一类 bug。
     */
    private readonly viewService: CustomRecipeViewService,
  ) {}

  /**
   * 取当前操作人标识，用于交付留痕（"谁交的"）。
   *
   * 后台现阶段只有老板一个人操作，但留痕不嫌早 ——
   * 将来加人时不用回头补数据。取不到就记 `unknown`，不编造。
   */
  private currentOperatorId(req: {
    user?: { userId?: string; staffId?: string; id?: string };
  }): string {
    const user = req?.user;
    return user?.userId || user?.staffId || user?.id || 'unknown';
  }

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
    @Req() req: any,
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

    /**
     * ★ 后台列表也下发渲染契约（批次 5.6）。
     *
     * 与详情页同一套判定。此前列表页自己写死 `status === 'DELIVERED'`
     * 决定「查看食谱」按钮 —— 订单一变已完成，那个按钮就消失了。
     * 这与顾客端那个 bug **是同一个成因**：判定散在前端，改一处漏一处。
     */
    const viewer = this.resolveViewerRole(req);
    const renderables = await Promise.all(
      orders.map(async (order) =>
        this.viewService.buildStaffView({
          status: order.status,
          viewer,
          hasAnyDelivery: (order.deliveries ?? []).length > 0,
          hasOpenAftersale: await this.aftersaleService.hasOpenForOrder(
            order.id,
          ),
        }),
      ),
    );

    return ApiResponseDto.success({
      orders: orders.map((order, index) => ({
        ...order,
        amount: Number(order.amount),
        creditAmount: Number(order.creditAmount),
        creditUsed: Number(order.creditUsed),
        creditRemaining: Math.max(
          0,
          Number(order.creditAmount) - Number(order.creditUsed),
        ),
        renderable: renderables[index],
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
  async getOrderDetail(@Req() req: any, @Param('orderId') orderId: string) {
    const order = await this.customRecipeService.getOrderByOrderId(orderId);

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const hasAnyDelivery = (order.deliveries ?? []).length > 0;

    return ApiResponseDto.success({
      ...order,
      amount: Number(order.amount),
      creditAmount: Number(order.creditAmount),
      creditUsed: Number(order.creditUsed),
      creditRemaining: Math.max(
        0,
        Number(order.creditAmount) - Number(order.creditUsed),
      ),
      /**
       * ★ 后台视角的渲染契约（批次 5.5）。
       *
       * 后台页面此前自己用 `status === 'XXX'` 决定显示哪些按钮 ——
       * 于是"订单一变已完成，「查看食谱」就消失"这类 bug 反复出现。
       * 现在与顾客端走同一套思路：**判定在后端，前端只画**。
       */
      renderable: await this.viewService.buildStaffView({
        status: order.status,
        /**
         * ⚠️ **按登录人的真实角色**，不能写死。
         *
         * 第一版这里硬编码了 `'STAFF'` —— 于是老板以管理员登录时
         * 「重新交付」也是灰的，提示"需要管理员权限，请联系管理员操作"：
         * 他自己就是管理员，却被告知去找管理员。
         */
        viewer: this.resolveViewerRole(req),
        hasAnyDelivery,
        hasOpenAftersale: await this.aftersaleService.hasOpenForOrder(order.id),
      }),
    });
  }

  /**
   * 登录人的角色 → 渲染契约里的"看的人是谁"。
   *
   * 认不出来时按 `STAFF`（**权限更小的那个**）——
   * 宁可少显示一个按钮，也不要因为角色解析失败把管理员动作漏给普通员工。
   */
  private resolveViewerRole(req: any): 'STAFF' | 'ADMIN' {
    return String(req?.user?.role ?? '').toUpperCase() === 'ADMIN'
      ? 'ADMIN'
      : 'STAFF';
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
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Body('recipeId') recipeId: string,
  ) {
    const target = (recipeId || '').trim();
    if (!target) {
      throw new BadRequestException('请选择要交付的食谱');
    }

    /**
     * 2026-10-16（批次 2.1）：改走**交付服务**。
     *
     * 此前这里是 `deliverExistingRecipe` —— 它只改订单（写 recipeId + 改状态），
     * **不留交付记录、不留内容快照**，而且**绕过了状态机**。
     * 现在交付服务做同样的事，但会：生成快照、建版本记录、走状态机、
     * 算出"每天喂多少克"、设置自动完成闹钟。
     */
    const result = await this.deliveryService.deliver({
      orderIdOrId: orderId,
      recipeIdOrBizId: target,
      deliveredBy: this.currentOperatorId(req),
    });

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

  // ---------- 售后处理（批次 3.1）----------

  /**
   * 售后待办列表。
   *
   * 默认只列**未处理完**的 —— 客服打开就要看到"还有几件事没做"。
   * 排序由后端算（等太久的排前面；同等的"调整食谱"比"问个问题"急），
   * 前端不再自己排。
   */
  @Get('aftersales')
  @ApiOperation({ summary: 'List aftersale requests for staff' })
  async listAftersales(
    @Query('status') status?: string,
    @Query('includeClosed') includeClosed?: string,
  ) {
    const items = await this.aftersaleService.listForStaff({
      status: status || null,
      includeClosed: includeClosed === 'true',
    });
    return ApiResponseDto.success({ items });
  }

  /** 受理 */
  @Post('aftersales/:id/accept')
  @ApiOperation({ summary: 'Accept an aftersale request' })
  async acceptAftersale(@Req() req: any, @Param('id') id: string) {
    return ApiResponseDto.success(
      await this.aftersaleService.accept({
        aftersaleId: id,
        handlerId: this.currentOperatorId(req),
      }),
    );
  }

  /** 标记处理中 */
  @Post('aftersales/:id/processing')
  @ApiOperation({ summary: 'Mark an aftersale request as processing' })
  async startAftersale(@Req() req: any, @Param('id') id: string) {
    return ApiResponseDto.success(
      await this.aftersaleService.startProcessing({
        aftersaleId: id,
        handlerId: this.currentOperatorId(req),
      }),
    );
  }

  /**
   * 处理完成。
   *
   * 处理说明**必填** —— 顾客看到"已处理"却不知道处理了什么，等于没处理。
   */
  @Post('aftersales/:id/resolve')
  @ApiOperation({ summary: 'Resolve an aftersale request' })
  async resolveAftersale(
    @Req() req: any,
    @Param('id') id: string,
    @Body('handleNote') handleNote: string,
    @Body('linkedDeliveryId') linkedDeliveryId?: string,
  ) {
    return ApiResponseDto.success(
      await this.aftersaleService.resolve({
        aftersaleId: id,
        handlerId: this.currentOperatorId(req),
        handleNote,
        linkedDeliveryId: linkedDeliveryId || null,
      }),
    );
  }

  /** 不受理（原因必填，顾客要知道为什么） */
  @Post('aftersales/:id/reject')
  @ApiOperation({ summary: 'Reject an aftersale request' })
  async rejectAftersale(
    @Req() req: any,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return ApiResponseDto.success(
      await this.aftersaleService.reject({
        aftersaleId: id,
        handlerId: this.currentOperatorId(req),
        reason,
      }),
    );
  }

  // ---------- 排期日历（批次 4.2）----------

  /**
   * 按星期的排期规则。
   *
   * 表里没配时返回**全开的默认值**（不落库）——
   * 不替老板决定"周日休息"：默认值是一种主张，他哪天想周日接单
   * 却发现约不上、又不知道为什么，那才是麻烦。
   */
  @Get('weekday-rules')
  @ApiOperation({ summary: 'Get weekday scheduling rules' })
  async getWeekdayRules() {
    const rows = await this.customRecipeService.getWeekdayRules();
    return ApiResponseDto.success({
      items: rows,
      /** 提醒前端：这些是默认值、还没保存过 */
      isDefault: rows.every((row) => row.isDefault),
    });
  }

  /** 保存按星期的排期规则（管理员） */
  @Put('weekday-rules')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Save weekday scheduling rules' })
  async saveWeekdayRules(
    @Body()
    body: {
      items: Array<{
        weekday: number;
        isOpen: boolean;
        capacity?: number | null;
        deliveryCapacity?: number | null;
        note?: string | null;
      }>;
    },
  ) {
    const result = await this.customRecipeService.saveWeekdayRules(
      body?.items ?? [],
    );
    return ApiResponseDto.success(result);
  }

  /**
   * 一段时间里每一天的真实状态。
   *
   * **可约与否、为什么不能约，都由后端算好**（三层优先级 +
   * 接单/交付两套容量），后台日历页与小程序排期页共用，
   * 两边都不再自己判断。
   */
  @Get('calendar')
  @ApiOperation({ summary: 'Get resolved calendar for a date range' })
  async getCalendar(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') ||
        !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      throw new BadRequestException('from / to 格式应为 YYYY-MM-DD');
    }

    const days = await this.customRecipeService.resolveCalendarRange(
      new Date(`${from}T00:00:00+08:00`),
      new Date(`${to}T00:00:00+08:00`),
    );

    /**
     * ⚠️ `date` 必须序列化成 **`YYYY-MM-DD`**，不能直接扔 Date。
     *
     * 2026-10-16 的 bug（后台排期日历整张是空的）：
     * 这里原来直接返回 `days`，`date` 于是被序列化成
     * `2026-09-30T16:00:00.000Z`（上海时间 10-01 的 UTC 表示）。
     * 而日历页是**按 `YYYY-MM-DD` 建索引**的 —— 键对不上，
     * 于是每个格子都查不到数据，月历一片空白；
     * 格子里取"几日"用的是 `date.slice(-2)`，得到 `"0Z"` → `NaN`。
     *
     * 根子在于：**日历是"日期"概念，不是"时刻"**。
     * 用时间戳表示日期，就一定会有人按字符串去比、然后对不上。
     * 这里统一在接口边界转成上海日期字符串。
     */
    return ApiResponseDto.success({
      days: days.map((day) => ({
        ...day,
        date: TimezoneUtil.toShanghaiDateString(day.date),
      })),
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

    const attachment = await this.customRecipeService.uploadAttachment(
      file,
      orderId,
    );

    return ApiResponseDto.success(attachment);
  }
}
