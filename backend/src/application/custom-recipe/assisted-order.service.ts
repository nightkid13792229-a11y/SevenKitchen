/**
 * 后台代客下单 Application Service（2026-10-21 · 代客定制食谱订单 Task 3）
 *
 * ## 它解决什么
 *
 * 老板/客服会替微信里、到店的顾客下定制食谱单，钱是**线下**收的
 * （微信/支付宝转账、现金）。这类单不能走顾客自助下单入口：
 *   · 真实顾客可能没有小程序账号（`User.isGuest=true` 的代客客户）；
 *   · 已收的钱不是微信支付，不能记成 `WECHAT_ONLINE`，否则退款会走错通道；
 *   · 实际收到的钱可能和系统报价不同（抹零、老客户优惠），必须留原因。
 *
 * ## 一条铁律：不新建第二套订单
 *
 * 代客单仍然是 `CustomRecipeOrder`：报价用 `CustomRecipePricingService.quote`，
 * 排期/落库复用 `CustomRecipeService.createOrderAtNextAvailableSlot`（与顾客
 * 自助单同一套容量、假期、份数、并发抢占逻辑）。本服务只负责三件事：
 *
 *   1. **归属校验**：顾客存在、狗属于该顾客；
 *   2. **收款口径**：应付=服务端报价，实收另存；不一致必须有原因；
 *   3. **来源留痕**：orderSource=ASSISTED、createdByStaffId、assistedForGuest。
 *
 * ## 绝不调用微信支付/退款
 *
 * 本服务不注入 `WechatPaymentService` / `WechatService`：线下收款只是登记。
 * 线下单的退款分流由 Task 5 在后台控制器按 `paymentChannel` 处理，
 * 本服务不产生任何微信支付单、也不发起退款。
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AllergyAnswerStatus,
  CustomRecipeOrderSource,
  CustomRecipeStatus,
  TargetGoal,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  CustomRecipeConfigService,
  MAX_MULTI_RECIPE_QUANTITY,
  type CustomRecipeConfigDto,
} from './custom-recipe-config.service';
import { CustomRecipePricingService } from './custom-recipe-pricing.service';
import { CustomRecipeService } from './custom-recipe.service';

/** 代客单可登记的线下收款渠道（不含 WECHAT_ONLINE） */
export const ASSISTED_PAYMENT_CHANNELS = [
  'OFFLINE_WECHAT',
  'OFFLINE_ALIPAY',
  'OTHER',
] as const;

export type AssistedPaymentChannel = (typeof ASSISTED_PAYMENT_CHANNELS)[number];

/** 线下收款入参（对应请求体里的 `payment`） */
export interface AssistedOrderPaymentInput {
  /** 是否已收款：true 直接建 PAID 单，false 建待付款单 */
  collected: boolean;
  /** 线下收款渠道 */
  channel: AssistedPaymentChannel | string;
  /** 实际收到的金额（元） */
  amount: number;
  /** 线下微信/支付宝流水号或备注；可选 */
  externalRef?: string | null;
  /** 实收与系统报价不一致时的原因（管理员必填） */
  overrideReason?: string | null;
}

/** 后台代客下单入参（对应 POST /admin/custom-recipe/orders/assisted） */
export interface CreateAssistedOrderInput {
  customerId: string;
  dogId: string;
  targetGoal: TargetGoal;
  recipeQuantity: number;
  requestedProteinCodes?: string[] | null;
  allergies?: string[] | null;
  allergyText?: string | null;
  allergyStatus: AllergyAnswerStatus;
  currentFoodMain?: string | null;
  currentFoodOther?: string | null;
  changeReasons?: string[] | null;
  stomachConditions?: string[] | null;
  additionalNotes?: string | null;
  /** 本单过敏报告草稿（付款成功后由健康档案同步转成正式报告） */
  allergyReportDrafts?: unknown[] | null;
  /** COS key，优先于 URL 落库 */
  attachmentKeys?: string[] | null;
  attachmentUrls?: string[] | null;
  payment: AssistedOrderPaymentInput;
  /** 是否付款后写狗狗档案；默认 true，与自助单一致 */
  syncToHealthProfile?: boolean;
}

/** 下单结果摘要（后台页面只需要这些） */
export interface AssistedOrderResult {
  id: string;
  orderId: string;
  status: CustomRecipeStatus;
  amount: number;
  actualPaidAmount: number | null;
  paymentChannel: string | null;
  recipeQuantity: number;
  assistedForGuest: boolean;
  /** 付款后档案同步结果；失败不影响订单已付款 */
  healthSync: { synced: boolean; reason?: string };
}

/** 金额统一舍入到分（与报价服务同一口径） */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class AssistedOrderService {
  private readonly logger = new Logger(AssistedOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: CustomRecipeConfigService,
    /** 金额的唯一来源：禁止前端/控制器自行算价 */
    private readonly pricingService: CustomRecipePricingService,
    /**
     * 复用自助单的排期/落库入口。
     *
     * 代客单与自助单必须共用同一套容量与日期逻辑（`createOrderAtNextAvailableSlot`），
     * 不允许在这里再写一遍循环 —— 两边一旦分叉就会超卖或排错交期。
     */
    private readonly customRecipeService: CustomRecipeService,
  ) {}

  /**
   * 创建一笔代客定制订单。
   *
   * @param input 后台表单
   * @param operatorId 当前操作人（后台 user.id），写进 createdByStaffId 留痕
   */
  async create(
    input: CreateAssistedOrderInput,
    operatorId: string,
  ): Promise<AssistedOrderResult> {
    const staffId = this.normalizeOptional(operatorId);
    if (!staffId) {
      // 没有操作人就没有留痕，对账时说不清是谁收的钱 —— 宁可拒绝
      throw new BadRequestException('缺少操作人信息，无法代客下单');
    }

    const customerId = this.normalizeOptional(input?.customerId);
    if (!customerId) {
      throw new BadRequestException('请选择顾客');
    }

    const dogId = this.normalizeOptional(input?.dogId);
    if (!dogId) {
      throw new BadRequestException('请选择狗狗');
    }

    // 1) 顾客必须存在（有账号顾客或 isGuest 代客客户都可以）
    const customer = await this.prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, isGuest: true },
    });

    if (!customer) {
      throw new NotFoundException('顾客不存在');
    }

    // 2) 狗必须属于这位顾客 —— 否则会把 A 的狗写进 B 的订单/档案
    const dog = await this.prisma.dog.findUnique({
      where: { id: dogId },
      select: { id: true, ownerId: true },
    });

    if (!dog || dog.ownerId !== customerId) {
      throw new BadRequestException('狗狗不存在或不属于该顾客');
    }

    // 3) 报价与排期必须来自**同一份配置快照**
    const config = await this.configService.getConfig();

    const recipeQuantity = this.resolveQuantity(input?.recipeQuantity, config);

    /**
     * 多份开关与自助单同口径：关闭时只能下 1 份。
     *
     * 代客入口是员工用的，但开关属于产品配置 —— 不能因为走后台就绕过。
     */
    if (recipeQuantity > 1 && config.multiRecipeEnabled !== true) {
      throw new BadRequestException('多份购买暂未开放，请选择 1 份');
    }

    this.assertIntake(input);

    /**
     * 先把数组类回答归一化/校验完，再进排期事务。
     *
     * 不能等到事务里才校验：那时名额已经被抢，靠事务回滚虽然也能还原，
     * 但一次坏输入会白白占用/竞争一次排期。
     */
    const allergies = this.resolveStringArray(input.allergies, '过敏食物');
    const changeReasons = this.resolveStringArray(
      input.changeReasons,
      '定制原因',
    );
    const stomachConditions = this.resolveStringArray(
      input.stomachConditions,
      '肠胃情况',
    );
    const attachmentKeys = this.resolveStringArray(
      input.attachmentKeys,
      '附件',
    );
    const attachmentUrls = this.resolveStringArray(
      input.attachmentUrls,
      '附件',
    );

    // 肉类偏好复用自助单校验：不选=营养师搭配，选了必须等于份数且不重复
    const requestedProteinCodes =
      this.customRecipeService.resolveRequestedProteinCodes(
        input.requestedProteinCodes,
        recipeQuantity,
      );

    const quote = this.pricingService.quote(recipeQuantity, config);

    // 4) 收款口径：应付取报价，实收另算（允许 0 元赠送）；不一致必须有原因
    const payment = this.resolvePayment(input?.payment, quote.payableAmount);

    const collectedAt = payment.collected ? new Date() : null;

    // 5) 排期 + 落库（与自助单共用；按份数占名额）
    const order = await this.customRecipeService.createOrderAtNextAvailableSlot(
      recipeQuantity,
      config,
      () => ({
        customerId,
        dogId,
        targetGoal: input.targetGoal,
        /**
         * 代客单目前不单独收「需要健康管理」勾选：
         * 目标是顾客定的，勾选与否不影响报价/排期。
         */
        needsHealthManagement: false,
        allergies,
        // 与自助单一致：有结构化数组时不再同时写文本快照
        allergyText:
          allergies.length > 0
            ? null
            : this.normalizeOptional(input.allergyText),
        allergyStatus: input.allergyStatus,
        // 代客单没有顾客端幂等键；同一顾客重复下单由人工判断
        clientRequestId: null,
        allergyReportDrafts: Array.isArray(input.allergyReportDrafts)
          ? input.allergyReportDrafts
          : [],
        medicalConditions: [],
        additionalNotes: this.normalizeOptional(input.additionalNotes),
        currentFoodMain: this.normalizeOptional(input.currentFoodMain),
        currentFoodOther: this.normalizeOptional(input.currentFoodOther),
        changeReasons,
        changeReasonOther: null,
        stomachConditions,
        stomachOther: null,
        preferredIngredients: [],
        dislikedIngredients: [],
        // 与自助单一致：优先存 COS key，避免媒体代理 URL 过期后读不到附件
        attachments:
          attachmentKeys.length > 0 ? attachmentKeys : attachmentUrls,
        /**
         * 价格快照永远是**服务端报价**；实际线下收款只在 amount/actualPaidAmount
         * 上体现，不能用实收覆盖 snapshot —— 否则报表会以为系统报价就是 500。
         */
        recipeQuantity,
        requestedProteinCodes,
        unitAmount: quote.unitAmount,
        originalAmount: quote.originalAmount,
        discountRate: quote.discountRate,
        discountAmount: quote.discountAmount,
        pricingSnapshot: {
          quantity: quote.quantity,
          unitAmount: quote.unitAmount,
          originalAmount: quote.originalAmount,
          discountRate: quote.discountRate,
          discountAmount: quote.discountAmount,
          payableAmount: quote.payableAmount,
        },
        /**
         * 已收款：订单金额 = 实际收到的钱（退款/对账以它为准）；
         * 未收款：仍是系统应付，实收字段留空，等后台确认收款时再写。
         */
        amount: payment.collected ? payment.amount : quote.payableAmount,
        actualPaidAmount: payment.collected ? payment.amount : null,
        paymentChannel: payment.collected ? payment.channel : null,
        externalPaymentRef: payment.collected ? payment.externalRef : null,
        priceOverrideReason: payment.collected ? payment.overrideReason : null,
        paymentConfirmedAt: collectedAt,
        status: payment.collected
          ? CustomRecipeStatus.PAID
          : CustomRecipeStatus.PENDING_PAYMENT,
        orderSource: CustomRecipeOrderSource.ASSISTED,
        createdByStaffId: staffId,
        // 无账号代客客户：下游分享链接/客服流程据此识别
        assistedForGuest: customer.isGuest === true,
        syncToHealthProfile: input.syncToHealthProfile !== false,
      }),
    );

    /**
     * 付款后写狗狗档案：与后台「确认收款」同口径。
     *
     * 必须在订单事务**提交之后**再调：同步方法内部自己开事务/查订单，
     * 在外层事务里调用会看不到未提交的订单。失败不回滚订单（钱已经收了），
     * 只把原因带回后台，供页面提示或稍后重试。
     */
    let healthSync: { synced: boolean; reason?: string } = {
      synced: false,
      reason: '未收款，暂不写档案',
    };
    if (payment.collected) {
      try {
        healthSync =
          await this.customRecipeService.syncPaidOrderToHealthProfile(order.id);
      } catch (error: any) {
        healthSync = {
          synced: false,
          reason: error?.message || '档案同步失败，请稍后重试',
        };
        this.logger.error(
          `[AssistedOrder] 订单 ${order.id} 付款后档案同步失败: ${
            error?.message || error
          }`,
        );
      }
    }

    this.logger.log(
      `[AssistedOrder] 员工 ${staffId} 为顾客 ${customerId} 创建代客订单 ` +
        `${order.orderId}（${recipeQuantity} 份，${payment.collected ? '已收款' : '待收款'}）`,
    );

    return {
      id: order.id,
      orderId: order.orderId,
      status: order.status,
      amount: payment.collected ? payment.amount : quote.payableAmount,
      actualPaidAmount: payment.collected ? payment.amount : null,
      paymentChannel: payment.collected ? payment.channel : null,
      recipeQuantity,
      assistedForGuest: customer.isGuest === true,
      healthSync,
    };
  }

  /**
   * 份数校验：整数 1..后台当前上限（业务硬上限 5）。
   *
   * 报价服务也会再校验一次（它是金额的最终防线），这里先校验是为了在
   * 读报价之前就能给出「份数必须是 1~N 的整数」这种明确错误。
   */
  private resolveQuantity(raw: unknown, config: CustomRecipeConfigDto): number {
    const configuredMax = Number(config?.maxRecipeQuantity);
    const maxQuantity =
      Number.isInteger(configuredMax) &&
      configuredMax >= 1 &&
      configuredMax <= MAX_MULTI_RECIPE_QUANTITY
        ? configuredMax
        : MAX_MULTI_RECIPE_QUANTITY;

    if (
      typeof raw !== 'number' ||
      !Number.isInteger(raw) ||
      raw < 1 ||
      raw > maxQuantity
    ) {
      throw new BadRequestException(`份数必须是 1~${maxQuantity} 的整数`);
    }

    return raw;
  }

  /**
   * 需求问卷必填项（与顾客自助单同一套口径）。
   *
   * 员工代客填单时同样不能跳过：过敏回答、当前食物、定制原因直接决定
   * 设计器能不能安全出食谱；缺了就是一张信息不全的单。
   */
  private assertIntake(input: CreateAssistedOrderInput): void {
    if (
      !input?.allergyStatus ||
      input.allergyStatus === AllergyAnswerStatus.UNKNOWN
    ) {
      throw new BadRequestException('请先回答：狗狗是否对部分食物过敏');
    }

    const allergyText = this.normalizeOptional(input.allergyText);
    const allergies = this.resolveStringArray(input.allergies, '过敏食物');

    if (
      input.allergyStatus === AllergyAnswerStatus.HAS_ALLERGY &&
      !allergyText &&
      allergies.length === 0
    ) {
      throw new BadRequestException('请补充过敏食物');
    }

    if (
      input.allergyStatus === AllergyAnswerStatus.NO_ALLERGY &&
      (allergyText || allergies.length > 0)
    ) {
      throw new BadRequestException('回答“没有过敏”时请清空过敏食物');
    }

    const currentFoodMain = this.normalizeOptional(input.currentFoodMain);
    if (!currentFoodMain) {
      throw new BadRequestException('请补充现在主要喂什么');
    }

    if (
      currentFoodMain === 'OTHER' &&
      !this.normalizeOptional(input.currentFoodOther)
    ) {
      throw new BadRequestException('请补充现在主要喂什么的说明');
    }

    if (
      !Array.isArray(input.changeReasons) ||
      input.changeReasons.length === 0
    ) {
      throw new BadRequestException('请选择定制原因');
    }

    if (
      !input.targetGoal ||
      !Object.values(TargetGoal).includes(input.targetGoal)
    ) {
      throw new BadRequestException('请选择定制目标');
    }
  }

  /**
   * 收款信息校验 + 归一化。
   *
   * 关键规则（设计文档 4.3 / 老板口径）：
   *   · 代客只登记**线下**收款渠道，`WECHAT_ONLINE` 一律拒绝
   *     —— 否则退款会走微信原路退回，而微信里根本没有这笔支付；
   *   · 实收 ≠ 系统报价时，管理员**必须**写原因，否则对账/退款口径会错。
   */
  private resolvePayment(
    raw: AssistedOrderPaymentInput | undefined | null,
    payableAmount: number,
  ): {
    collected: boolean;
    channel: AssistedPaymentChannel;
    amount: number;
    externalRef: string | null;
    overrideReason: string | null;
  } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('请填写收款信息');
    }

    if (typeof raw.collected !== 'boolean') {
      throw new BadRequestException('请确认是否已收款');
    }

    const channel = this.normalizeOptional(raw.channel);
    if (
      !channel ||
      !(ASSISTED_PAYMENT_CHANNELS as readonly string[]).includes(channel)
    ) {
      throw new BadRequestException('收款渠道只能是线下微信、线下支付宝或其他');
    }

    if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount)) {
      throw new BadRequestException('实收金额必须是数字');
    }

    const amount = round2(raw.amount);
    if (amount < 0) {
      throw new BadRequestException('实收金额不能为负数');
    }

    const externalRef = this.normalizeOptional(raw.externalRef);
    if (externalRef && externalRef.length > 100) {
      throw new BadRequestException('线下流水号/备注不能超过 100 个字符');
    }

    const overrideReason = this.normalizeOptional(raw.overrideReason);
    if (overrideReason && overrideReason.length > 200) {
      throw new BadRequestException('实收金额差异原因不能超过 200 个字符');
    }

    // 金额精确到分：500 与 538.20 必然不等；538.2 与 538.20 相等
    if (amount !== payableAmount && !overrideReason) {
      throw new BadRequestException('实收金额与系统报价不一致时，必须填写原因');
    }

    return {
      collected: raw.collected,
      channel: channel as AssistedPaymentChannel,
      amount,
      externalRef,
      // 一致时即使填了原因也不落库：避免报表把「已按报价收款」标成改价
      overrideReason: amount === payableAmount ? null : overrideReason,
    };
  }

  /** 字符串数组归一化：非数组 → 空；数组内非字符串/空串直接报错 */
  private resolveStringArray(raw: unknown, label: string): string[] {
    if (raw === undefined || raw === null) {
      return [];
    }

    if (!Array.isArray(raw)) {
      throw new BadRequestException(`${label}必须是数组`);
    }

    return raw.map((item) => {
      if (typeof item !== 'string' || !item.trim()) {
        throw new BadRequestException(`${label}不能为空`);
      }
      return item.trim();
    });
  }

  /** 字符串去空格；非字符串/空串 → null */
  private normalizeOptional(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
}
