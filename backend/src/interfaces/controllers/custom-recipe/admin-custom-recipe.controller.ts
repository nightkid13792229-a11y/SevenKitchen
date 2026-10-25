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
  Optional,
  Req,
  ServiceUnavailableException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomRecipeService } from '../../../application/custom-recipe/custom-recipe.service';
import { CustomRecipeDeliveryService } from '../../../application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeAftersaleService } from '../../../application/custom-recipe/custom-recipe-aftersale.service';
import { CustomRecipeRefundService } from '../../../application/custom-recipe/custom-recipe-refund.service';
import { PrismaService } from '../../../infrastructure/prisma.service';
import {
  DEFAULT_PRODUCTION_LOSS_RATE,
  MAX_PRODUCTION_LOSS_RATE,
  MIN_PRODUCTION_LOSS_RATE,
  GlobalConfigService,
} from '../../../application/config/global-config.service';
import { CustomRecipeViewService } from '../../../application/custom-recipe/custom-recipe-view.service';
import {
  CustomRecipeConfigService,
  type UpdateCustomRecipeConfigDto,
} from '../../../application/custom-recipe/custom-recipe-config.service';
import {
  CreateAssistedOrderDTO,
  CreateRecipeDTO,
  RegisterOfflineRefundDTO,
  UpdateScheduleDTO,
} from '../../../application/custom-recipe/dto/custom-recipe.dto';
import { AssistedOrderService } from '../../../application/custom-recipe/assisted-order.service';
import { OrderDesignSubmitService } from '../../../application/custom-recipe/order-design-submit.service';
import { isOfflinePaidCustomRecipeOrder } from '../../../domain/custom-recipe/custom-recipe.refund';
import { AdminGuard } from '../auth/admin.guard';
import { StaffGuard } from '../../guards/role.guard';
import { AuthGuard } from '../../auth/auth.guard';
import { CustomRecipeStatus, UserRole } from '@prisma/client';
import { canTransition } from '../../../domain/custom-recipe/custom-recipe.state';
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
 *   · **仅管理员**：食谱定制设置、交付食谱（含重新交付）、取消订单、排期批量设置。
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
     * 取消/处理售后/联系客户 全都算得出），但**一直没人调用** ——
     * 于是后台页面只能自己写死状态判断，也就有了"订单一变已完成、
     * 「查看食谱」就消失"这一类 bug。
     */
    private readonly viewService: CustomRecipeViewService,
    /** 只读查询（交付历史这类）走它，不必为一条列表在 service 里加方法 */
    private readonly prisma: PrismaService,
    /**
     * 全局配置（2026-10-21）：只用来读「内部生产损耗系数」。
     *
     * 这个值原先在 `CustomRecipeConfig.productionLossRate`，现迁到
     * `GlobalConfig.productionLossRate`。放参数表**最后**并 `@Optional`：
     * 既有测试按位置构造控制器，插在中间会让它们全部错位；
     * DI 没接上时 resolveProductionLossRate 会回落到 1.07。
     */
    @Optional()
    private readonly globalConfigService?: GlobalConfigService,
    /**
     * 代客下单（2026-10-21 · Task 3）。
     *
     * 同样放参数表**最后**并 `@Optional`：既有测试按构造签名提供依赖，
     * 插在中间会让它们全部错位。DI 没接上时只有代客下单路由不可用，
     * 其余后台功能不受影响（见 `createAssistedOrder` 的守卫）。
     */
    @Optional()
    private readonly assistedOrderService?: AssistedOrderService,
    /**
     * 订单设计最终提交（2026-10-22 · Task 4）。
     *
     * 旧交付入口（`deliver-recipe` / `deliver-batch`）在交付前要问它一句：
     * 这张单是不是走新版「订单设计」流程？是的话必须回工作台整批提交。
     *
     * 同样放参数表**最后**并 `@Optional`：既有测试按位置构造控制器，
     * 插在中间会让它们全部错位。DI 没接上时旧交付入口拒绝服务（宁可报错，
     * 也不能放过绕过 N 份整批交付的路径）。
     */
    @Optional()
    private readonly orderDesignSubmitService?: OrderDesignSubmitService,
    /** 已交付/制作中的退款申请审核（2026-10-25） */
    @Optional()
    private readonly refundService?: CustomRecipeRefundService,
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
   * 读取食谱定制配置（定制费 / 交付周期 / 接单上限 / 支付超时）
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
   * 只影响**之后提交**的订单：定制费在下单时已快照进订单，
   * 改价不会动到已提交/已付款顾客的金额。
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
   * 代客下单：顾客 + 狗狗合并搜索（2026-10-21 · 仅管理员）。
   *
   * ## 为什么不再复用员工端那个搜索接口
   *
   * `/staff/customer-service/customers/search` 写死了 `role: CUSTOMER`、
   * 不返回角色、且只给 20 条 —— 它服务的补剂/客服流程不能被改。
   * 代客下单需要**一个结果卡片同时选顾客和狗**，还要能识别内部测试账号，
   * 所以单独开一条只读接口，返回角色与完整狗狗列表。
   *
   * - 默认只搜真实顾客（CUSTOMER）；
   * - `includeInternal=true` 才把 ADMIN / STAFF 一起带出来（仅用于测试单）；
   * - 匹配顾客昵称、手机号、狗狗名字；
   * - 每个顾客**返回全部狗狗**，不按关键词截断（否则同名狗会漏选）；
   * - 最多 30 条，按 `updatedAt` 倒序。
   */
  @Get('customer-dog-search')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '顾客与狗狗合并搜索（代客下单，仅管理员）' })
  async searchCustomerDog(
    @Query('keyword') rawKeyword?: string,
    @Query('includeInternal') rawIncludeInternal?: string,
  ) {
    const keyword = String(rawKeyword ?? '').trim();
    if (!keyword) {
      return ApiResponseDto.success({ items: [] });
    }

    const includeInternal = ['true', '1'].includes(
      String(rawIncludeInternal ?? '').trim().toLowerCase(),
    );
    const roles: UserRole[] = includeInternal
      ? [UserRole.CUSTOMER, UserRole.ADMIN, UserRole.STAFF]
      : [UserRole.CUSTOMER];

    const customers = await this.prisma.user.findMany({
      where: {
        role: { in: roles },
        OR: [
          { phone: { contains: keyword } },
          { nickname: { contains: keyword, mode: 'insensitive' } },
          {
            dogs: {
              some: { name: { contains: keyword, mode: 'insensitive' } },
            },
          },
        ],
      },
      select: {
        id: true,
        nickname: true,
        phone: true,
        role: true,
        dogs: {
          select: {
            id: true,
            name: true,
            breedId: true,
            customBreedName: true,
            birthday: true,
            currentWeightKg: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });

    const breedIds = Array.from(
      new Set(
        customers
          .flatMap((customer) => customer.dogs.map((dog) => dog.breedId))
          .filter(Boolean),
      ),
    );
    const breeds = breedIds.length
      ? await this.prisma.dogBreed.findMany({
          where: { id: { in: breedIds } },
          select: { id: true, name: true },
        })
      : [];
    const breedMap = new Map(breeds.map((breed) => [breed.id, breed.name]));

    return ApiResponseDto.success({
      items: customers.map((customer) => ({
        id: customer.id,
        name: customer.nickname,
        phone: customer.phone,
        role: customer.role,
        isInternal: customer.role !== UserRole.CUSTOMER,
        dogs: customer.dogs.map((dog) => ({
          id: dog.id,
          name: dog.name,
          breedName:
            dog.customBreedName || breedMap.get(dog.breedId) || null,
          birthday: dog.birthday,
          ageText: this.dogAgeText(dog.birthday),
          currentWeightKg: dog.currentWeightKg,
        })),
      })),
    });
  }

  /**
   * 生日 → 「2岁3个月 / 5个月 / 12天」。
   *
   * 后台搜索结果直接展示，不必让页面为每个顾客再算一遍；
   * 口径与 admin-web `calculateAge` 保持一致。没填生日返回 null，
   * 页面显示「年龄未填」。
   */
  private dogAgeText(birthday: Date | null | undefined): string | null {
    if (!birthday) return null;
    const birth = new Date(birthday);
    if (Number.isNaN(birth.getTime())) return null;

    const days = Math.floor(
      (Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (!Number.isFinite(days) || days < 0) return null;

    const months = Math.floor(days / 30.44);
    const years = Math.floor(days / 365.25);
    if (years >= 1) {
      const restMonths = months - years * 12;
      return restMonths > 0 ? `${years}岁${restMonths}个月` : `${years}岁`;
    }
    if (months >= 1) return `${months}个月`;
    return `${days}天`;
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
   * 后台代客下单（2026-10-21 · 代客定制食谱订单 Task 3）。
   *
   * ⚠️ 路由必须放在 `orders/:orderId` 这一类**参数路由之前**：
   * 否则 `orders/assisted` 会被 `orders/:orderId` 先匹配走（Express 按声明顺序）。
   *
   * 仅管理员：这个接口会创建订单并登记线下收款，属于收钱动作。
   * 需求问卷字段与顾客自助单一致；金额一律由服务端报价，前端传什么不算数。
   * 线下收款只登记，**不调用任何微信支付/退款**。
   */
  @Post('orders/assisted')
  @UseGuards(AdminGuard)
  /**
   * 只给这一条路由加校验管道（transform 让嵌套 payment 被真正校验）：
   * 不给整个控制器加，避免改变既有接口的校验行为。
   */
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: '代客创建定制订单（线下收款，仅管理员）' })
  async createAssistedOrder(
    @Req() req: any,
    @Body() dto: CreateAssistedOrderDTO,
  ) {
    if (!this.assistedOrderService) {
      // 正常情况下 DI 一定会注入；这里只防"模块漏注册"时给出可读错误
      throw new ServiceUnavailableException('代客下单服务暂不可用');
    }

    const result = await this.assistedOrderService.create(
      {
        customerId: dto.customerId,
        dogId: dto.dogId,
        targetGoal: dto.targetGoal,
        recipeQuantity: dto.recipeQuantity,
        requestedProteinCodes: dto.requestedProteinCodes,
        allergies: dto.allergies,
        allergyText: dto.allergyText,
        allergyStatus: dto.allergyStatus,
        currentFoodMain: dto.currentFoodMain,
        currentFoodOther: dto.currentFoodOther,
        changeReasons: dto.changeReasons,
        stomachConditions: dto.stomachConditions,
        additionalNotes: dto.additionalNotes,
        allergyReportDrafts: dto.allergyReportDrafts,
        attachmentKeys: dto.attachmentKeys,
        attachmentUrls: dto.attachmentUrls,
        payment: {
          collected: dto.payment.collected,
          channel: dto.payment.channel,
          amount: dto.payment.amount,
          externalRef: dto.payment.externalRef,
          overrideReason: dto.payment.overrideReason,
        },
        syncToHealthProfile: dto.syncToHealthProfile,
      },
      this.currentOperatorId(req),
    );

    return ApiResponseDto.success(result);
  }

  /**
   * Get order detail (admin)
   */
  /**
   * 交付历史（2026-10-18 · 需求 2.8.6）
   *
   * ## 为什么单独一个接口
   *
   * 订单详情里的 `deliveries` 只取**最新那一版**（`take: 1` + `replacedByDeliveryId: null`）——
   * 那是给"当前生效的交付"用的。
   * 而"顾客说我收到的是旧版"这类问题时，要的是**全部版本**。
   *
   * ## 为什么必须能查
   *
   * 交付完**只是改一个状态**，此前没有任何地方能回答：
   * 「这一单交过几版、每版什么时候、谁交的、通知发出去没有」。
   * 顾客说"我收到的是旧版"时，**现在查不出来**。
   *
   * 只读，不改任何数据。
   */
  @Get('orders/:orderId/deliveries')
  @ApiOperation({ summary: '交付历史（全部版本，含交付人与通知状态）' })
  async getOrderDeliveries(@Param('orderId') orderId: string) {
    const order = await this.prisma.customRecipeOrder.findFirst({
      where: { OR: [{ orderId }, { id: orderId }] },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const rows = await this.prisma.customRecipeDelivery.findMany({
      where: { orderId: order.id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        recipeId: true,
        recipeVersion: true,
        deliveredBy: true,
        deliveredAt: true,
        notifyStatus: true,
        notifiedAt: true,
        confirmedAt: true,
        revokedAt: true,
        /**
         * 最新一版 = 没有被别的版本替换掉。
         * **不是在页面里算的** —— 那样页面就得知道"替换"是怎么表达的。
         */
        replacedByDeliveryId: true,
      },
    });

    return ApiResponseDto.success({
      items: rows.map((row: { replacedByDeliveryId: string | null; revokedAt: Date | null }) => ({
        ...row,
        /** 当前生效的那一版（页面直接用它标"当前版本"，不自己判断） */
        isCurrent: row.replacedByDeliveryId === null && row.revokedAt === null,
      })),
    });
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Get order detail' })
  async getOrderDetail(@Req() req: any, @Param('orderId') orderId: string) {
    const order = await this.customRecipeService.getOrderByOrderId(orderId);

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    // 私有 COS 附件 → 短时签名 URL（2026-10-19 P0）
    Object.assign(
      order,
      await this.customRecipeService.signOrderMedia(order),
    );

    const hasAnyDelivery = (order.deliveries ?? []).length > 0;

    return ApiResponseDto.success({
      ...order,
      amount: Number(order.amount),
      /**
       * 线下收/退款金额是 Prisma Decimal，JSON 里默认会变成字符串。
       * 页面要直接拿它做金额比较与默认值，这里统一成 number | null。
       */
      actualPaidAmount: this.toNullableNumber(order.actualPaidAmount),
      offlineRefundAmount: this.toNullableNumber(order.offlineRefundAmount),
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
   * 内部生产损耗系数（≥1 的系数，1.07 = 多买 7%）。
   *
   * 2026-10-21 起读 `GlobalConfig.productionLossRate`，不再读
   * `CustomRecipeConfig.productionLossRate` —— 后者已废弃但保留列，
   * 只为兼容旧数据/回滚。
   *
   * 只影响**新建**食谱：写进 `Recipe.productionLossRate` 的初始值。
   * 已有食谱的该字段与交付快照保持原值，这里不回溯修改。
   *
   * 读不到 / 值不合法 → 回落到 1.07，并在日志里留一行。
   */
  private async resolveProductionLossRate(): Promise<number> {
    try {
      const config = await this.globalConfigService?.getGlobalConfig();
      const value = Number(config?.productionLossRate);
      if (
        Number.isFinite(value) &&
        value >= MIN_PRODUCTION_LOSS_RATE &&
        value <= MAX_PRODUCTION_LOSS_RATE
      ) {
        return value;
      }
      console.warn(
        '[CustomRecipe] 全局配置里的生产损耗率不合法，按 1.07 处理：',
        config?.productionLossRate,
      );
    } catch (error) {
      console.warn('[CustomRecipe] 读取生产损耗率失败，按 1.07 处理：', error);
    }
    return DEFAULT_PRODUCTION_LOSS_RATE;
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

  /** Prisma Decimal / 字符串金额 → number | null，供页面直接使用 */
  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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

    /**
     * 2026-10-19：人工确认收款同样要在付款成功后写档案。
     * 失败不影响“收款已确认”，把结果带回后台，供页面提示/重试。
     */
    let healthSync: { synced: boolean; reason?: string } = {
      synced: false,
      reason: '未执行',
    };
    try {
      healthSync = await this.customRecipeService.syncPaidOrderToHealthProfile(
        orderId,
      );
    } catch (error: any) {
      healthSync = {
        synced: false,
        reason: error?.message || '档案同步失败，请稍后重试',
      };
      console.error('[AdminCustomRecipe] 确认收款后档案同步失败:', error);
    }

    // 微信一次性订阅留给「已交付」通知，这里不再发「已付款」，
    // 否则会消耗顾客提交订单时唯一的一次订阅授权。

    return ApiResponseDto.success({
      status: 'PAID',
      paymentConfirmedAt: new Date(),
      healthSync,
    });
  }

  /**
   * 重试“付款后写狗狗档案”（2026-10-19）。
   *
   * 支付成功但同步失败时，订单仍是已付款、healthInfoSyncedAt 为空；
   * 后台可以点这个接口重试。幂等：已同步的直接返回。
   */
  @Post('orders/:orderId/sync-health')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '重试把订单同步到狗狗档案' })
  async retryHealthSync(@Param('orderId') orderId: string) {
    const result =
      await this.customRecipeService.syncPaidOrderToHealthProfile(orderId);
    return ApiResponseDto.success(result);
  }

  /**
   * Update order status
   */
  @Patch('orders/:orderId/status')
  /**
   * ⚠️ **这个接口能力比名字大**：它能把订单改成 CANCELLED，也就是**取消订单**。
   *
   * 需求 2.8.7 的权限表写得很清楚：
   *   确认收款 / 查看订单 / 处理售后 → 员工或管理员
   *   **交付食谱 / 取消订单 / 改配置 → 仅管理员**
   *
   * 此前这里只有类级的 `AuthGuard + StaffGuard` —— 也就是说**员工能取消订单**。
   * 与"交付"那个接口（有 `@UseGuards(AdminGuard)`）不一致。
   *
   * 代价：员工要改其它状态（比如从 PAID 推进到 IN_PROGRESS）也会被挡。
   * 但"取消"是**不可逆且涉及退款**的动作，宁可让员工去找管理员，
   * 也不能让它成为一个员工随手能点的按钮。
   */
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update order status（取消订单仅管理员）' })
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
     * 取消一张**已付款但还没交付**的定制单要先原路退款（老板 2026-10-04 口径 3）。
     *
     * 此前后台取消只释放当天名额、既不退款也不提示，钱留在我们账上，
     * 往往要等顾客来问才发现。退款失败就不取消 ——
     * 宁可保持原状，也不要出现"取消了钱没退"。
     *
     * 2026-10-21 修：原来只认 `PAID`，**制作中（IN_PROGRESS）被漏掉**。
     * 生产单 CR202610201196 有 paymentConfirmedAt / paymentTransactionId，
     * 后台取消后 refundStatus 仍为 null —— 钱收了、单取消了、没人退。
     * "已付款"不会因为开始制作而消失，所以退款条件应是
     * **已收款且还没交付**，而不是某一个状态。
     *
     * 兜底 `paymentConfirmedAt`：状态可能因异常流程停在待付款，但钱已确认到账；
     * 只要这张单**还能取消**（交付/完成都不在可取消之列），就不能漏退。
     * 正常未付款的待付款单没有 paymentConfirmedAt，行为不变。
     */
    if (status === CustomRecipeStatus.CANCELLED) {
      const order = await this.customRecipeService.getOrderByOrderId(orderId);

      if (!order) {
        throw new NotFoundException('订单不存在');
      }

      /**
       * ★ 线下收款单不能走这条「取消订单」（2026-10-21 · Task 5）。
       *
       * 这个接口原来的口径是"已经收到钱就先调微信原路退款，再取消"。
       * 代客单是线下收款、状态同样是 PAID，但微信里没有这笔交易 ——
       * 调退款只会失败，极端情况下还会退错钱。
       *
       * 所以线下单必须改走 `POST orders/:orderId/offline-refund`：
       * 管理员在那里登记"谁/何时/退多少/怎么退"，系统不碰微信。
       * 这里直接 400，绝不允许"取消了钱没处理"。
       *
       * 只拦"已经收到钱"的单：未付款的待付款单取消不涉及退款（行为不变）。
       */
      const hasCollectedPayment =
        Boolean(order.paymentConfirmedAt) ||
        order.status === CustomRecipeStatus.PAID ||
        order.status === CustomRecipeStatus.IN_PROGRESS;
      const offlinePaidAmount =
        this.toNullableNumber(order.actualPaidAmount) ??
        this.toNullableNumber(order.amount) ??
        0;
      const isOfflineOrder = isOfflinePaidCustomRecipeOrder(order);

      /**
       * 线下单有实收金额：必须先登记线下退款，不能直接取消。
       * 0 元赠送单没有款可退，允许直接取消（不调用微信退款）。
       */
      if (
        order.status !== CustomRecipeStatus.CANCELLED &&
        hasCollectedPayment &&
        isOfflineOrder &&
        offlinePaidAmount > 0
      ) {
        throw new BadRequestException(
          '线下收款订单不能直接取消：请使用「线下退款并取消」登记线下退款（系统不会调用微信退款）',
        );
      }

      const shouldRefund =
        !isOfflineOrder &&
        (order.status === CustomRecipeStatus.PAID ||
          order.status === CustomRecipeStatus.IN_PROGRESS ||
          (Boolean(order.paymentConfirmedAt) &&
            canTransition(order.status, CustomRecipeStatus.CANCELLED)));

      if (shouldRefund) {
        /**
         * 必须先退再取消：这个 await 抛错时下面的 `updateOrderStatus` 不会执行，
         * 订单保持原状，管理员可以在微信商户平台核查后重试。
         */
        const refund =
          await this.wechatPaymentService.createCustomRecipeRefund({
            orderId: order.orderId,
            reason: (reason || '').trim() || '后台取消定制订单',
          });

        /**
         * 微信也可能**不抛错、但返回一个失败状态**（CLOSED / ABNORMAL）。
         * 只认「成功 / 处理中 / 待处理」；其它状态同样不能取消 ——
         * 否则又会回到"单取消了、钱没退"。
         */
        const refundStatus = String(refund?.status || '').toUpperCase();
        if (
          refundStatus &&
          !['SUCCESS', 'PROCESSING', 'PENDING'].includes(refundStatus)
        ) {
          throw new BadRequestException(
            `退款未成功（${refundStatus}），订单保持原状；请到微信商户平台核查后再试`,
          );
        }
      }
    }

    // 流转合法性、取消释放名额、各时间戳都在 service 里统一处理
    await this.customRecipeService.updateOrderStatus(orderId, status, {
      reason,
    });

    return ApiResponseDto.success({ status });
  }

  /**
   * 线下退款并取消（2026-10-21 · 代客定制食谱订单 Task 5）。
   *
   * 代客单的钱是**线下**收的（微信转账/支付宝/现金），订单却没有微信退款单可对账。
   * 这个接口只做两件事：
   *   ① 把「金额 / 方式 / 操作人 / 时间 / 备注」登记到订单上（`offlineRefund*`）；
   *   ② 取消订单并释放当天接单名额（service 里一个事务完成）。
   *
   * **绝不调用微信退款** —— 微信里根本没有这笔支付。
   *
   * 仅管理员：退款是资金动作，与「取消订单」同级。
   * 校验：
   *   · 必须已确认收款（`paymentConfirmedAt`）；
   *   · 必须是线下收款单（线上单请走原来的微信原路退款）；
   *   · 金额 > 0 且不超过实收金额；
   *   · 已取消 / 已登记过线下退款的单拒绝重复登记（service 里 CAS 认领）。
   */
  @Post('orders/:orderId/offline-refund')
  @UseGuards(AdminGuard)
  /** 只给这一条路由加校验管道：不改变既有接口的校验行为 */
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: '线下退款并取消（仅管理员，不调用微信退款）' })
  async registerOfflineRefund(
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Body() dto: RegisterOfflineRefundDTO,
  ) {
    const result = await this.customRecipeService.registerOfflineRefund(
      orderId,
      {
        amount: dto.amount,
        method: dto.method,
        note: dto.note,
      },
      this.currentOperatorId(req),
    );

    return ApiResponseDto.success(result);
  }

  /**
   * 手工补退款（2026-10-21 · 生产单 CR202610201196 的一刀）。
   *
   * ## 为什么需要它
   *
   * 退款此前只挂在两条路径上：顾客自助取消、后台取消。
   * 生产单 CR202610201196 在**修复前**被取消（当时取消制作中的单不退钱），
   * 结果 `status=CANCELLED`、`refundStatus=null`、钱已收 ——
   * 而这时**没有任何入口能把钱退回去**：订单已取消，取消按钮也不见了。
   *
   * 这个接口只做一件事：对一张**已经取消**的已付款单补发起一次原路退款。
   * 不改订单状态、不释放名额、不发通知 —— 那些在取消时已经做过了。
   *
   * ## 为什么这里不拦状态
   *
   * 任务口径是"已取消但没退成钱"的历史单，但控制器不写死 `CANCELLED`：
   * ① 生产上真出过的另一种形态是**状态漂移**（例如停在 PAID 但已退款失败），
   *    把它挡在门外只会逼人改数据库；
   * ② 真正不能退的是"没收到钱"，那一条下面已经拦了；
   * ③ 重复退款由 `createCustomRecipeRefund` 自己幂等（成功/处理中直接复用），
   *    这里再写一份状态白名单只会形成第二套口径。
   *
   * 仅管理员：退款是资金动作，与"取消订单"同级。
   */
  /**
   * 退款申请列表（2026-10-25）。
   *
   * 只给管理员：审核通过会直接触发微信退款，是资金动作。
   */
  @Get('refund-requests')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List custom recipe refund requests' })
  async listRefundRequests(@Query('status') status?: string) {
    if (!this.refundService) {
      throw new ServiceUnavailableException('退款服务暂不可用');
    }
    const items = await this.refundService.listForAdmin(
      String(status || '').trim() || undefined,
    );
    return ApiResponseDto.success({ items });
  }

  @Post('refund-requests/:id/approve')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Approve a refund request and refund via WeChat' })
  async approveRefundRequest(
    @Req() req: any,
    @Param('id') id: string,
    @Body('note') note?: string,
  ) {
    if (!this.refundService) {
      throw new ServiceUnavailableException('退款服务暂不可用');
    }
    const request = await this.refundService.approve(
      id,
      this.adminUserId(req),
      String(note || ''),
    );
    return ApiResponseDto.success({ request });
  }

  @Post('refund-requests/:id/reject')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Reject a refund request' })
  async rejectRefundRequest(
    @Req() req: any,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    if (!this.refundService) {
      throw new ServiceUnavailableException('退款服务暂不可用');
    }
    const request = await this.refundService.reject(
      id,
      this.adminUserId(req),
      String(reason || ''),
    );
    return ApiResponseDto.success({ request });
  }

  private adminUserId(req: any): string {
    return String(req?.user?.userId || req?.user?.id || '').trim() || 'admin';
  }

  @Post('orders/:orderId/refund')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '手工补退款（仅管理员，已付款的已取消单）' })
  async refundOrder(
    @Param('orderId') orderId: string,
    @Body('reason') reason?: string,
  ) {
    const order = await this.customRecipeService.getOrderByOrderId(orderId);

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    /**
     * 没收到钱的单不能退。
     *
     * 与 `createCustomRecipeRefund` 里那条"该定制订单尚未支付"是同一条口径，
     * 提前在这里拦一次，为的是**返回 400 与可读原因**，而不是把
     * "能否退款"的知识留给前端去猜。
     */
    if (!order.paymentConfirmedAt && !order.paymentTransactionId) {
      throw new BadRequestException('该定制订单尚未支付，无需退款');
    }

    /**
     * ★ 线下收款单不能走微信原路退款（2026-10-21 · Task 5）。
     *
     * 页面已把线下单的「补退款」换成「线下退款并取消」，但接口必须自己再拦一次：
     * 直接调接口（或旧页面缓存）不能绕过去调微信退款。
     */
    if (isOfflinePaidCustomRecipeOrder(order)) {
      throw new BadRequestException(
        '线下收款订单不能走微信原路退款，请在订单详情使用「线下退款并取消」登记线下退款',
      );
    }

    /**
     * 退款失败（未开启线上退款、微信报错）**原样抛出去**：
     * 页面必须看到"钱没退成"的真实原因，绝不能吞掉后回一个成功。
     */
    const refund = await this.wechatPaymentService.createCustomRecipeRefund({
      orderId: order.orderId,
      reason: String(reason ?? '').trim() || '后台手工补退款',
    });

    /**
     * 已经退成功/处理中的单，helper 会原样复用同一条退款记录（`reused: true`），
     * 不会重复打款 —— 把 `reused` 一并回给页面，点击后能说清"这笔早就退过了"。
     */
    return ApiResponseDto.success({
      orderId: order.orderId,
      status: refund.status,
      amount: refund.amount,
      outRefundNo: refund.outRefundNo,
      refundId: refund.refundId,
      reused: refund.reused,
    });
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
    @Req() req: any,
  ) {
    /**
     * 内部生产损耗系数读**全局配置**（2026-10-21 从 CustomRecipeConfig 迁来）。
     *
     * ## 这里原来写死 1.07，而设计器那边写死 1.05
     *
     * 后果：**同一道食谱，从哪个入口发布，顾客要买的量差 2%**。
     * 而采购量就是按这个值算的 —— 顾客照着买，多买少买都不对。
     *
     * ## 现在两个入口读同一个值
     *
     * `GlobalConfig.productionLossRate` 是唯一来源：后台「全局配置 → 生产配置」
     * 改完即时生效，两边自然一致。CustomRecipeConfig 里的同名列已废弃，
     * 只为兼容旧数据/回滚保留，不再参与新建食谱。
     *
     * ⚠️ 只影响新建的食谱；已有 `Recipe.productionLossRate` 与交付快照
     * 一律保持原值（迁移不回溯改数）。
     */
    const lossRate = await this.resolveProductionLossRate();

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
        productionLossRate: lossRate,
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

    /**
     * 交付必须走交付服务：建交付记录/快照、写 autoCompleteAt、
     * 走状态机。绝不能再直接 updateOrder 把状态写成 DELIVERED ——
     * 那样顾客确认、售后、自动完成都会找不到交付记录。
     */
    await this.deliveryService.deliver({
      orderIdOrId: orderId,
      recipeIdOrBizId: recipe.id,
      deliveredBy: this.currentOperatorId(req),
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
   * 新版「订单设计」流程的订单不能从订单页绕行单份交付。
   *
   * 工作台里 N 份设计逐份「加入待提交」后，必须由管理员在
   * `POST /orders/:orderId/submit-designs` 一次性交齐；否则客服可以从这里
   * 先交一份，顾客收到的就是不完整的一批。
   *
   * 没有设计槽位的老订单不受影响，行为与以前完全一致。
   */
  private async assertLegacyDeliveryAllowed(
    orderIdOrId: string,
  ): Promise<void> {
    if (!this.orderDesignSubmitService) {
      // 正常情况下 DI 一定注入；这里只防"模块漏注册"时把绕行入口放开
      throw new ServiceUnavailableException('订单设计提交服务暂不可用');
    }
    await this.orderDesignSubmitService.assertLegacyDeliveryAllowed(
      orderIdOrId,
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

    // 新流程订单必须回工作台整批提交，不能在这里单份交付（Task 4）
    await this.assertLegacyDeliveryAllowed(orderId);

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

  /**
   * 一次性交付多份食谱（2026-10-21 · 多份购买第二阶段）。
   *
   * 与 `deliver-recipe` 的分工：
   *   · 单份订单仍走 `deliver-recipe`（老的交付记录与重新交付都在那边）；
   *   · 多份订单首次交付走这里：N 份必须一次交齐，由 `deliverBatch`
   *     在一个事务里写批次 + 每份快照。
   *
   * 通知只发**一条**：顾客买的是「一次交付」，按份发 N 条会像多笔订单；
   * 链接用第一份食谱的业务编号（老通知模板只能带一个食谱入口）。
   */
  @Post('orders/:orderId/deliver-batch')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Deliver all recipes of a multi-recipe order at once',
  })
  async deliverBatch(
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Body('recipeIds') rawRecipeIds: unknown,
  ) {
    const recipeIds = this.resolveBatchRecipeIds(rawRecipeIds);

    // 新流程订单必须回工作台整批提交，不能在这里绕行交付（Task 4）
    await this.assertLegacyDeliveryAllowed(orderId);

    const result = await this.deliveryService.deliverBatch({
      orderIdOrId: orderId,
      recipeIds,
      deliveredBy: this.currentOperatorId(req),
    });

    /**
     * 交付通知只发一次，失败不影响交付结果（事务已经完成）。
     * 用第一份的业务编号做落地页 —— 微信模板只带得动一个食谱入口，
     * 顾客从那里能回到订单看到整批 N 份。
     *
     * 整个通知块（含查询 openid）都兜住：交付已经成功，
     * 不能因为一条消息或一次查询失败就给后台回 500。
     */
    try {
      // 用 service 回的业务订单号查：路由也接受主键，主键查不到 openid
      const order = await this.customRecipeService.getOrderByOrderId(
        result.orderId,
      );
      const openid = order?.customer?.wechatOpenid;
      if (openid && this.wechatService) {
        await this.wechatService.sendCustomRecipeOrderNotification(
          openid,
          result.orderId,
          'DELIVERED',
          result.recipes[0]?.recipeId,
        );
      }
    } catch (error) {
      console.error('[CustomRecipe] 批量交付通知发送失败:', error);
    }

    return ApiResponseDto.success({
      ...result,
      status: 'DELIVERED',
    });
  }

  /**
   * 按选中份重新交付（2026-10-21 · 多份售后改稿）。
   *
   * 后台售后详情里，处理人看到「涉及哪几份食谱」后，只重交被选中的份：
   * `redeliverBatchItems` 会生成新批次，未选中的份原样复制，其他份不动。
   *
   * 通知仍然只发**一条**：顾客买的是「一次交付」，按份发 N 条会像多笔订单；
   * 链接用**第一份被选中的食谱**业务编号 —— 那是这次真正改过的那份。
   */
  @Post('orders/:orderId/redeliver-batch')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Redeliver selected items of a multi-recipe order',
  })
  async redeliverBatch(
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Body('deliveryItemIds') rawDeliveryItemIds: unknown,
  ) {
    const deliveryItemIds = this.resolveRedeliverDeliveryItemIds(
      rawDeliveryItemIds,
    );

    const result = await this.deliveryService.redeliverBatchItems({
      orderIdOrId: orderId,
      deliveryItemIds,
      deliveredBy: this.currentOperatorId(req),
    });

    /**
     * 与批量交付同一个兜底：交付事务已经完成，不能因为一条消息
     * 或一次 openid 查询失败就给后台回 500。
     */
    try {
      // 用 service 回的业务订单号查：路由也接受主键，主键查不到 openid
      const order = await this.customRecipeService.getOrderByOrderId(
        result.orderId,
      );
      const openid = order?.customer?.wechatOpenid;
      if (openid && this.wechatService) {
        await this.wechatService.sendCustomRecipeOrderNotification(
          openid,
          result.orderId,
          'DELIVERED',
          result.selectedRecipes[0]?.recipeId,
        );
      }
    } catch (error) {
      console.error('[CustomRecipe] 按份重新交付通知发送失败:', error);
    }

    return ApiResponseDto.success({
      ...result,
      status: 'DELIVERED',
    });
  }

  /**
   * 批量交付入参：必须是非空字符串数组，且不超过业务硬上限 5 份。
   *
   * 份数是否等于订单的 `recipeQuantity` 由 `deliverBatch` 判断 ——
   * 那件事需要先查订单，放在 service 里做才不会两边口径各写一遍。
   */
  private resolveBatchRecipeIds(raw: unknown): string[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('请选择要交付的食谱（recipeIds 不能为空）');
    }
    if (raw.length > MAX_BATCH_RECIPE_QUANTITY) {
      throw new BadRequestException(
        `一次最多交付 ${MAX_BATCH_RECIPE_QUANTITY} 份食谱`,
      );
    }
    const ids = raw.map((value) =>
      typeof value === 'string' ? value.trim() : '',
    );
    if (ids.some((id) => id.length === 0)) {
      throw new BadRequestException(
        'recipeIds 必须是非空字符串数组，请为每一份选择食谱',
      );
    }
    return ids;
  }

  /**
   * 按份重新交付入参：必须是非空字符串数组，且不超过业务硬上限 5 份。
   *
   * 份数是否都在**最新批次**里、有没有重复，由 `redeliverBatchItems`
   * 拿到批次明细后判断 —— 控制器看不到批次，复制一套规则只会让两处口径分叉。
   */
  private resolveRedeliverDeliveryItemIds(raw: unknown): string[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException(
        '请选择要重新交付的食谱（deliveryItemIds 不能为空）',
      );
    }
    if (raw.length > MAX_BATCH_RECIPE_QUANTITY) {
      throw new BadRequestException(
        `一次最多重新交付 ${MAX_BATCH_RECIPE_QUANTITY} 份食谱`,
      );
    }
    const ids = raw.map((value) =>
      typeof value === 'string' ? value.trim() : '',
    );
    if (ids.some((id) => id.length === 0)) {
      throw new BadRequestException(
        'deliveryItemIds 必须是非空字符串数组，请选择要调整的食谱',
      );
    }
    return ids;
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

/**
 * 多份购买的业务硬上限（spec 2.2：一张订单最多 5 份）。
 *
 * 后台配置可以调低，但不能调高到 6 —— 这里再挡一次，
 * 免得有人绕过配置直接调接口交 6 份。
 */
const MAX_BATCH_RECIPE_QUANTITY = 5;
