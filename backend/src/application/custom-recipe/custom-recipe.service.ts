/**
 * Custom Recipe Service
 * Business logic for custom recipe orders
 */

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import {
  CustomRecipeOrderQuery,
  ICustomRecipeRepository,
  CreateCustomRecipeOrderDTO,
  UpdateCustomRecipeOrderDTO,
} from '../../domain/custom-recipe/custom-recipe.repository';
import {
  CustomRecipeConfigService,
  DEFAULT_CUSTOM_RECIPE_WORK_DAYS,
  MAX_MULTI_RECIPE_QUANTITY,
  type CustomRecipeConfigDto,
} from './custom-recipe-config.service';
import { CustomRecipePricingService } from './custom-recipe-pricing.service';
import {
  assertTransition,
  canTransition,
  suggestSubStage,
  timestampFieldFor,
} from '../../domain/custom-recipe/custom-recipe.state';
import {
  OFFLINE_REFUND_CHANNEL,
  OFFLINE_REFUND_METHODS,
  buildOfflineRefundCancellationReason,
  isOfflinePaidCustomRecipeOrder,
  isValidOfflineRefundMethod,
  normalizePaymentChannel,
  resolveOfflineRefundCap,
} from '../../domain/custom-recipe/custom-recipe.refund';
import {
  defaultWeekdayRules,
  resolveDay,
  type ResolvedDay,
  type WeekdayRule,
} from '../../domain/custom-recipe/custom-recipe.calendar';
import {
  CustomRecipeAftersaleStatus,
  CustomRecipeStatus,
  TargetGoal,
  CustomAttachmentType,
  AllergyAnswerStatus,
} from '@prisma/client';
import {
  isNegativeLevel,
  mapLevelToCertainty,
  normalizeResults,
  normalizeTestMethod,
} from '../health/allergy-report.service';
import {
  addWorkDays,
  isPublicHoliday,
  getPublicHolidaysForYear,
} from '../../utils/date-helpers';
import { TimezoneUtil } from '../../utils/timezone.util';
import { WechatService } from '../../infrastructure/wechat/wechat.service';

/**
 * 定制订单过敏文本 → 结构化档案的**保守**拆分规则（2026-10-21）。
 *
 * `custom_recipe_order.allergy_text` 是顾客原话，至少有两种形态：
 *   · 能直接归档的单一过敏原（“鸡肉、牛肉”“鸭、猪”）；
 *   · 报告结论 / 完整句子（“弱阳性：* 鸡肉”“对粗粮过敏”“胡萝卜不消化”）。
 *
 * 这里只放行第一种。拿不准的一律不写进 allergy_record，
 * 宁可让顾客或营养师人工确认，也不制造一条假过敏原。
 */
const ALLERGY_TEXT_SEPARATORS = /[,，、;；\n\r]/;

/** 否定 / 占位说法：它们不是过敏原，不能写成记录 */
const ALLERGY_TEXT_PLACEHOLDERS = new Set([
  '无',
  '没有',
  '暂无',
  '不清楚',
  '正常吃',
  '不过敏',
  '无过敏',
  '没有过敏',
  '暂无过敏',
  '无过敏原',
  '没有过敏原',
  '暂无过敏原',
  '未发现',
  '没发现',
  '没有发现',
  '暂未发现',
  '暂时没有发现',
  '未知',
  '不详',
  '正常',
  '正常饮食',
  '正常喂食',
  '无异常',
  '没有异常',
  '无特殊',
]);

/** 出现这些标记说明是报告原文或整句描述，不能当作单一过敏原 */
const ALLERGY_TEXT_AMBIGUOUS_MARKERS = [
  '*',
  '＊',
  '阳性',
  '阴性',
  '报告',
  '检测',
  '过敏',
  '不耐受',
  '消化',
];

/** 超过这个长度的“词”更可能是句子，不自动归档 */
const ALLERGY_TEXT_MAX_TOKEN_LENGTH = 20;

/**
 * 从订单过敏文本里提取**可以安全归档**的单一过敏原。
 *
 * 规则与迁移清单保持一致：
 *   · 按中英文逗号/顿号/分号/换行拆分，trim 后保留原始大小写；
 *   · 去掉空值、否定/占位说法；
 *   · 去掉过长、带引号/报告标记、含空白或医学判断词的 token；
 *   · 同一个文本内按大小写不敏感去重。
 */
export function extractSimpleAllergyTokens(
  allergyText?: string | null,
): string[] {
  const raw = String(allergyText || '');
  if (!raw.trim()) return [];

  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const part of raw.split(ALLERGY_TEXT_SEPARATORS)) {
    const token = part.trim();
    if (!token) continue;

    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (ALLERGY_TEXT_PLACEHOLDERS.has(token)) continue;
    if (token.length > ALLERGY_TEXT_MAX_TOKEN_LENGTH) continue;
    if (/\s/.test(token)) continue;
    if (
      ALLERGY_TEXT_AMBIGUOUS_MARKERS.some((marker) => token.includes(marker))
    ) {
      continue;
    }

    tokens.push(token);
  }

  return tokens;
}

@Injectable()
export class CustomRecipeService implements ICustomRecipeRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cosService: TencentCosService,
    private readonly configService: CustomRecipeConfigService,
    /**
     * 多份权威报价（2026-10-20）。
     *
     * 下单金额**只能**来自这里：服务端算完再把单价/原价/折扣/应付
     * 快照进订单，前端传来的金额一律不采信。
     */
    private readonly pricingService: CustomRecipePricingService,
    /**
     * 微信订阅消息（2026-09-28）。
     *
     * 顾客**自己付款**时也要通知他 —— 此前只有客服在后台点「确认收款」才发，
     * 顾客付完钱什么都没收到。声明为可选，避免影响既有测试的构造签名。
     */
    @Optional()
    private readonly wechatService?: WechatService,
  ) {}

  /**
   * 自动排期的防呆上限的**兜底值**（2026-10-04）。
   *
   * 连续这么多天都排不上就明确报错，而不是无声地一直往后找。
   * 正常 1~2 天内必然有空位。
   *
   * 2026-10-16（批次 1.4）：真正取值改从后台配置读（`resolveScheduleLookaheadDays`）——
   * 这个常量只作为配置读不到时的兜底。下同。
   */
  private static readonly FALLBACK_SCHEDULE_LOOKAHEAD_DAYS = 45;

  /** 并发抢名额的重试次数的**兜底值**：抢输一次就换下一天，最多换这么多天 */
  private static readonly FALLBACK_SLOT_BOOKING_ATTEMPTS = 5;

  /**
   * 生成订单号：`<前缀>YYYYMMDDXXXX`。
   *
   * 前缀原先写死 'CR'，2026-10-16（批次 1.4）改为从后台配置读。
   */
  private async generateOrderId(): Promise<string> {
    const prefix = await this.resolveOrderNoPrefix();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `${prefix}${year}${month}${day}${random}`;
  }

  /**
   * 生成一个库中不存在的订单号。
   *
   * 日期 + 4 位随机数，当天最多 1 万个组合；而 orderId 是 unique 列，
   * 原先**没有任何重试** —— 撞号时顾客看到的是数据库唯一约束错误（500）。
   * 这里先查再返回，最多试 10 次。
   */
  private async generateUniqueOrderId(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = await this.generateOrderId();
      const existing = await this.prisma.customRecipeOrder.findUnique({
        where: { orderId: candidate },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictException('订单号生成失败，请稍后重试');
  }

  /**
   * 按份数计算交付需要的工作日（2026-10-21 第二阶段地基）。
   *
   * 规则（设计文档 6.4 / 8）：
   *   totalWorkDays = ceil(基础工作日 + (份数 - 1) × 每份工时 / 每日工时)
   *   最少 1 个工作日。
   *
   * 基础工作日来自后台 `deliveryWorkDays`（老板可调到 1 天）；
   * 多出来的部分是「同一交付批次里多设计几份」的产能占用。
   * 只算工作日，周末和公众假期由 `addWorkDays` 跳过。
   */
  calculateDeliveryWorkDays(
    quantity: number,
    config: {
      deliveryWorkDays: number;
      dailyDesignMinutes: number;
      minutesPerRecipe: number;
    },
  ): number {
    const normalizedQuantity =
      Number.isInteger(quantity) && quantity > 0 ? quantity : 1;

    const rawBase = Number(config.deliveryWorkDays);
    const baseWorkDays =
      Number.isFinite(rawBase) && rawBase >= 0
        ? rawBase
        : DEFAULT_CUSTOM_RECIPE_WORK_DAYS;

    const dailyDesignMinutes = Number(config.dailyDesignMinutes);
    const minutesPerRecipe = Number(config.minutesPerRecipe);
    const extraWorkDays =
      Number.isFinite(dailyDesignMinutes) &&
      dailyDesignMinutes > 0 &&
      Number.isFinite(minutesPerRecipe) &&
      minutesPerRecipe >= 0
        ? ((normalizedQuantity - 1) * minutesPerRecipe) / dailyDesignMinutes
        : 0;

    return Math.max(1, Math.ceil(baseWorkDays + extraWorkDays));
  }

  /**
   * Calculate estimated delivery date (配置的工作日数，遇公众假期顺延)
   */
  private async calculateDeliveryDate(
    scheduledDate: Date,
    workDays: number,
  ): Promise<Date> {
    return await addWorkDays(scheduledDate, workDays);
  }

  /**
   * 已落库订单的份数（兼容老订单）。
   *
   * 2026-10-20 之前的订单没有 recipeQuantity，Prisma 默认值也会给 1；
   * 这里再兜一层，避免历史数据/脏数据让释放名额时漏掉或释放成负数。
   */
  private resolveStoredRecipeQuantity(value: unknown): number {
    const quantity = Number(value);
    return Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  }

  /**
   * 释放一天里被一张订单占掉的产能（取消/超时/后台改状态共用）。
   *
   * 必须按订单份数释放：一张 3 份订单只还 1 个名额，那天仍然少 2 个。
   * 条件带上 `gte`，重复取消或脏数据不会把 bookedCount 减成负数。
   */
  private async releaseScheduleCapacity(
    tx: any,
    scheduledDate: Date,
    rawQuantity: unknown,
  ): Promise<number> {
    const quantity = this.resolveStoredRecipeQuantity(rawQuantity);
    await tx.customRecipeSchedule.updateMany({
      where: { date: scheduledDate, bookedCount: { gte: quantity } },
      data: { bookedCount: { decrement: quantity } },
    });
    return quantity;
  }

  /**
   * 校验这只狗确实属于当前顾客。
   *
   * 2026-09-28 修复的安全问题：提交定制单原先**完全不校验归属** ——
   * 任何登录顾客只要知道别人的 dogId，就能拿别人的狗下定制单；
   * 而提交时又会把顾客填的过敏/疾病写回那只狗的档案（syncToHealthProfile），
   * 等于任何人都能往别人家狗的医疗档案里写过敏和疾病。
   *
   * 两个 id 都比对：登录签发的 token 里 customerId 与 userId 取值相同，
   * 这里仍留出容错，避免以后两者分家时把正常顾客挡在门外。
   */
  private async assertDogOwnership(
    customerId: string,
    dogId: string,
  ): Promise<void> {
    const dog = await this.prisma.dog.findFirst({
      where: { id: dogId },
      select: { id: true, ownerId: true },
    });

    if (!dog || dog.ownerId !== customerId) {
      throw new BadRequestException('狗狗不存在或无权访问');
    }
  }

  /**
   * 校验这张定制单确实属于当前顾客。
   *
   * 2026-10-04 修复越权：附件上传接口此前只校验"订单号非空"，
   * 任何登录顾客都能把文件挂到别人的定制单上；订单号不存在时还会打成 500。
   * 现在统一走这里 —— 顺带把"订单不存在"变成业务错误（resolveOrderRef 负责）。
   */
  async assertOrderOwnership(
    customerId: string,
    orderIdOrId: string,
  ): Promise<void> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: { customerId: true },
    });

    if (!order || order.customerId !== customerId) {
      throw new BadRequestException('定制订单不存在或无权操作');
    }
  }

  /**
   * Create a new custom recipe order
   */
  /**
   * 提交定制单。
   *
   * 2026-10-04 两处结构性调整（老板拍板口径 1 + 修复超卖）：
   *
   * ① **日期改由系统排**：顾客传来的 scheduledDate 一律忽略（老版本小程序
   *    仍会带这个字段，留着兼容但不采信）。原来前端把它写死成"今天"，
   *    后端一旦回"该日期已约满，请选择其他日期"，顾客根本无处可选 —— 直接流失。
   *    现在从今天起找最近的空位，满了/遇假期就顺延。
   *
   * ② **抢名额改 CAS**：原来先在事务外读余量、再无条件 booked_count + 1，
   *    两个并发请求会同时看到空位、同时 +1，每日上限形同虚设。
   */
  /**
   * 后端必填校验（2026-10-19 P0）。
   *
   * 前端校验不能作为唯一防线：旧版本小程序、接口直接调用都可能绕过。
   * 这里返回中文错误，老客户端至少能看到“缺什么”，而不是生成信息不全的单。
   */
  private assertRequiredIntakeFields(data: CreateCustomRecipeOrderDTO): void {
    if (!data.allergyStatus || data.allergyStatus === AllergyAnswerStatus.UNKNOWN) {
      throw new BadRequestException('请先回答：狗狗是否对部分食物过敏');
    }
    if (
      data.allergyStatus === AllergyAnswerStatus.HAS_ALLERGY &&
      !(data.allergyText || '').trim() &&
      (!Array.isArray(data.allergies) || data.allergies.length === 0)
    ) {
      throw new BadRequestException('请补充过敏食物');
    }
    if (
      data.allergyStatus === AllergyAnswerStatus.NO_ALLERGY &&
      ((data.allergyText || '').trim() ||
        (Array.isArray(data.allergies) && data.allergies.length > 0))
    ) {
      throw new BadRequestException('回答“没有过敏”时请清空过敏食物');
    }
    if (!(data.currentFoodMain || '').trim()) {
      throw new BadRequestException('请补充现在主要喂什么');
    }
    if (
      data.currentFoodMain === 'OTHER' &&
      !(data.currentFoodOther || '').trim()
    ) {
      throw new BadRequestException('请补充现在主要喂什么的说明');
    }
    if (!Array.isArray(data.changeReasons) || data.changeReasons.length === 0) {
      throw new BadRequestException('请选择定制原因');
    }
    if (
      data.changeReasons.includes('OTHER') &&
      !(data.changeReasonOther || '').trim()
    ) {
      throw new BadRequestException('请补充定制原因的说明');
    }
    if (
      Array.isArray(data.stomachConditions) &&
      data.stomachConditions.includes('OTHER') &&
      !(data.stomachOther || '').trim()
    ) {
      throw new BadRequestException('请补充肠胃情况的说明');
    }
  }

  /**
   * 份数（2026-10-20 多份购买 · 第一阶段）。
   *
   * 老版本小程序不传这个字段，按 1 份处理——不能因为新增多份能力
   * 就让存量单变成"份数缺失"而下不了单。
   */
  private resolveRecipeQuantity(raw: number | undefined | null): number {
    if (raw === undefined || raw === null) return 1;

    if (
      !Number.isInteger(raw) ||
      raw < 1 ||
      raw > MAX_MULTI_RECIPE_QUANTITY
    ) {
      throw new BadRequestException(
        `份数必须是 1~${MAX_MULTI_RECIPE_QUANTITY} 的整数`,
      );
    }

    return raw;
  }

  /**
   * 顾客选择的主蛋白（2026-10-20 多份购买 · 第一阶段）。
   *
   * 规则见设计文档 4.2/10：
   *   · 不选（空数组）= 交给营养师搭配；
   *   · 一旦选了，数量必须恰好等于份数；
   *   · 同一种肉不能重复；
   *   · 空字符串无效。
   *
   * 这里**不校验**肉类与过敏是否冲突：过敏安全由营养师结合档案人工判断，
   * 选中的肉也不是绕过过敏检查的授权（设计文档第 10 节）。
   *
   * 2026-10-21 由 private 改为 public：后台代客下单（AssistedOrderService）
   * 必须和自助单用**同一套规则**（数量等于份数、不重复、不选=营养师搭配），
   * 否则接口直调可以绕过前台把 2 份单塞成 1 种肉或重复肉。
   */
  resolveRequestedProteinCodes(
    raw: string[] | undefined | null,
    quantity: number,
  ): string[] {
    if (raw === undefined || raw === null) return [];

    if (!Array.isArray(raw)) {
      throw new BadRequestException('肉类偏好必须是数组');
    }

    const codes: string[] = [];
    for (const code of raw) {
      if (typeof code !== 'string' || !code.trim()) {
        throw new BadRequestException('肉类选项不能为空');
      }
      codes.push(code.trim());
    }

    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException('肉类不能重复选择');
    }

    if (codes.length !== 0 && codes.length !== quantity) {
      throw new BadRequestException(
        `请选择 ${quantity} 种肉类，或留空让营养师搭配`,
      );
    }

    return codes;
  }

  /**
   * 在最近的可用日期排一张订单（自助单 / 代客单共用 · 2026-10-21）。
   *
   * 为什么抽出来：后台代客下单（AssistedOrderService）必须和顾客自助单
   * **完全同一套**容量、份数、假期与并发抢占逻辑。再写一遍的话，两边迟早
   * 分叉 —— 最危险的是「一边按份数占名额、另一边只占 1 个」，直接超卖。
   *
   * 调用方只提供要写进订单的业务字段；订单号、排期日、预计交付日由这里
   * 统一生成，抢名额与落库在同一个事务里，抢不到就换下一天重试。
   *
   * @param recipeQuantity 本单份数（1–5）：一张 N 份单要占 N 个设计名额
   * @param config 本次下单使用的配置快照（报价与排期必须来自同一份配置）
   * @param buildData 生成订单业务字段；不得覆盖 orderId / scheduledDate /
   *                  estimatedDeliveryDate（这三个由本方法写入）
   */
  async createOrderAtNextAvailableSlot(
    recipeQuantity: number,
    config: CustomRecipeConfigDto,
    buildData: (slot: {
      scheduledDate: Date;
      estimatedDeliveryDate: Date;
    }) => Record<string, any>,
  ): Promise<any> {
    const capacity = config.dailyCapacity;
    /** 一张 N 份订单要占 N 个设计名额，不能只占 1 个 */
    const deliveryWorkDays = this.calculateDeliveryWorkDays(
      recipeQuantity,
      config,
    );
    /** 抢输的日子记下来跳过，避免反复撞同一天 */
    const takenDays = new Set<string>();
    /** 最多换几天重试（原写死 5，2026-10-16 起从配置读） */
    const maxAttempts = await this.resolveSlotRetryTimes();

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const scheduledDate = await this.findNextAvailableDate(
        capacity,
        takenDays,
        recipeQuantity,
      );

      // 连续这么多天都排不上：明确报错，不让顾客对着转圈猜
      if (!scheduledDate) break;

      const created = await this.prisma.$transaction(async (tx) => {
        const booked = await this.tryBookSlotTx(
          tx,
          scheduledDate,
          capacity,
          recipeQuantity,
        );

        // 并发下名额被别人抢走了：本次不写任何订单，交给外层换一天重试
        if (!booked) return null;

        const estimatedDeliveryDate = await this.calculateDeliveryDate(
          scheduledDate,
          deliveryWorkDays,
        );

        const orderId = await this.generateUniqueOrderId();

        return tx.customRecipeOrder.create({
          /**
           * buildData 是调用方提供的业务字段（自助单/代客单各一套），
           * 这里只统一补订单号与排期。Prisma 的 CreateInput 联合类型
           * 无法从 Record<string, any> 推断关联字段，故在此收口为 any；
           * 字段合法性由两边调用方的类型与测试保证。
           */
          data: {
            ...buildData({ scheduledDate, estimatedDeliveryDate }),
            orderId,
            scheduledDate,
            estimatedDeliveryDate,
          } as any,
        });
      });

      if (created) return created;

      takenDays.add(TimezoneUtil.toShanghaiDateString(scheduledDate));
    }

    throw new ConflictException('近期定制名额已满，请稍后再试或联系客服');
  }

  async createOrder(data: CreateCustomRecipeOrderDTO): Promise<any> {
    // 定制费从后台配置读取，并在下单这一刻**快照进订单**。
    // 之后后台调价只影响新提交的单，已提交的订单金额不会被改。
    const config = await this.configService.getConfig();

    // 先确认这只狗是他的，再谈别的
    await this.assertDogOwnership(data.customerId, data.dogId);

    this.assertRequiredIntakeFields(data);

    /**
     * 份数语法校验（整数 1–5）放在幂等之前：后面的排期和落库都依赖它，
     * 而且它是**请求本身的合法性**，不随后台配置变化。
     * 开关、肉类与报价则放在幂等返回之后（见下）。
     */
    const recipeQuantity = this.resolveRecipeQuantity(data.recipeQuantity);

    /**
     * 幂等（2026-10-19 P0）：同一顾客 + 同一 clientRequestId 只生成一张订单。
     * 网络超时后前端用同一个 key 重试，不能变成两张待付款单。
     *
     * 必须排在开关/最多份数/报价校验之前：重试可能发生在后台改配置之后，
     * 此时应原样返回已创建的订单，而不是被新配置打回去。
     */
    if (data.clientRequestId) {
      const existing = await this.prisma.customRecipeOrder.findUnique({
        where: {
          customerId_clientRequestId: {
            customerId: data.customerId,
            clientRequestId: data.clientRequestId,
          },
        },
      });
      if (existing) return existing;
    }

    /**
     * 多份（2026-10-20 第一阶段）：开关、肉类选择、报价全部在幂等返回之后校验。
     * 前端选择器只是体验层，接口直调也必须挡住开关关闭、重复肉类和坏配置。
     */
    if (recipeQuantity > 1 && config.multiRecipeEnabled !== true) {
      throw new BadRequestException('多份购买暂未开放，请选择 1 份');
    }

    const requestedProteinCodes = this.resolveRequestedProteinCodes(
      data.requestedProteinCodes,
      recipeQuantity,
    );

    /**
     * 权威报价（2026-10-20）：整单金额只算一次，写进订单快照。
     *
     * 同样放在幂等返回之后：配置后来被改坏/调价，不能用新报价改写老订单。
     */
    const quote = this.pricingService.quote(recipeQuantity, config);

    try {
      return await this.createOrderAtNextAvailableSlot(
        recipeQuantity,
        config,
        ({ scheduledDate, estimatedDeliveryDate }) => ({
          customerId: data.customerId,
          dogId: data.dogId,
          targetGoal: data.targetGoal,
          needsHealthManagement: data.needsHealthManagement === true,
          allergies: data.allergies || [],
          /**
           * 2026-10-21：订单只保留一份过敏快照。
           * 有结构化数组时不再同时保存自由文本，避免同一批过敏原双写；
           * 只有顾客没有结构化数组时，才保留文本兜底。
           */
          allergyText:
            (data.allergies || []).length > 0
              ? null
              : data.allergyText?.trim() || null,
          allergyStatus: data.allergyStatus as AllergyAnswerStatus,
          clientRequestId: data.clientRequestId || null,
          // 本单报告草稿：付款前只存订单，不写狗狗档案
          allergyReportDrafts: (data.allergyReportDrafts || []) as any,
          medicalConditions: data.medicalConditions || [],
          additionalNotes: data.additionalNotes,
          // 2026-10-18：需求 2.3.4 第二段（只问档案里没有的）
          currentFoodMain: data.currentFoodMain || null,
          currentFoodOther: data.currentFoodOther || null,
          changeReasons: data.changeReasons || [],
          changeReasonOther: data.changeReasonOther || null,
          stomachConditions: data.stomachConditions || [],
          stomachOther: data.stomachOther || null,
          preferredIngredients: data.preferredIngredients || [],
          dislikedIngredients: data.dislikedIngredients || [],
          // 优先存 COS key：媒体代理 URL 的 token 只在当前进程有效，
          // 重启后再拿旧代理 URL 读附件会 404。
          attachments:
            Array.isArray(data.attachmentKeys) &&
            data.attachmentKeys.length > 0
              ? data.attachmentKeys
              : data.attachmentUrls || [],
          /**
           * 2026-10-20 多份购买：份数、肉类偏好、价格快照。
           *
           * amount 只认 quote.payableAmount —— data 里即使带了
           * amount / unitAmount / payableAmount，这里也一律不读。
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
          amount: quote.payableAmount,
          status: CustomRecipeStatus.PENDING_PAYMENT,
          /**
           * 2026-10-19：提交订单时**不写狗狗档案**，只记下顾客的意愿。
           * 真正写入放在付款成功后（syncPaidOrderToHealthProfile），
           * 避免未付款/放弃的单把临时输入带进医疗档案。
           */
          syncToHealthProfile: data.syncToHealthProfile !== false,
        }),
      );
    } catch (error) {
      // 并发重试撞上 (customerId, clientRequestId) 唯一键：返回先创建的那张
      if (data.clientRequestId && (error as any)?.code === 'P2002') {
        const existing = await this.prisma.customRecipeOrder.findUnique({
          where: {
            customerId_clientRequestId: {
              customerId: data.customerId,
              clientRequestId: data.clientRequestId,
            },
          },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  /**
   * 支付时限（分钟），0 = 不自动关单。
   *
   * 2026-10-04：小程序要告诉顾客"请在 X 分钟内完成支付"，
   * 但此前这个值只存在于后台配置里，顾客完全不知道，
   * 订单被自动关掉时只会以为系统坏了。
   */
  async getPaymentTimeoutMinutes(): Promise<number> {
    const config = await this.configService.getConfig();
    return Number.isFinite(config.paymentTimeoutMinutes)
      ? config.paymentTimeoutMinutes
      : 0;
  }

  /**
   * Get order by ID
   */
  async getOrderById(id: string): Promise<any | null> {
    return await this.prisma.customRecipeOrder.findUnique({
      where: { id },
    });
  }

  /**
   * Get order by orderId
   *
   * 必须带上 dog / recipe / attachmentsRecords：
   * 顾客端订单详情与后台详情都要读这些关联，之前没 include，
   * 调用方访问 order.dog.name 会直接抛 TypeError（500）。
   */
  /**
   * 把订单里的私有 COS 附件替换成短时签名 URL（2026-10-19 P0）。
   *
   * 只用于**读接口**；数据库里仍保留原始 URL/key，写操作不受影响。
   * 覆盖：备注附件、订单附件记录、本单过敏报告草稿。
   */
  async signOrderMedia(order: any): Promise<any> {
    if (!order) return order;
    if (typeof (this.cosService as any).getSensitiveMediaUrl !== 'function') {
      return order;
    }
    const sign = (url: unknown) =>
      this.cosService.getSensitiveMediaUrl(String(url || '')) ||
      String(url || '');

    const attachments = Array.isArray(order.attachments)
      ? await Promise.all(order.attachments.map((url: string) => sign(url)))
      : order.attachments;
    const attachmentRecords = Array.isArray(order.attachmentsRecords)
      ? await Promise.all(
          order.attachmentsRecords.map(async (record: any) => ({
            ...record,
            fileUrl: await sign(record?.fileUrl),
          })),
        )
      : order.attachmentsRecords;
    const drafts = Array.isArray(order.allergyReportDrafts)
      ? await Promise.all(
          order.allergyReportDrafts.map(async (draft: any) => {
            const {
              attachmentKeys,
              ...safeDraft
            } = draft;
            const keys = Array.isArray(attachmentKeys) ? attachmentKeys : [];
            return {
              ...safeDraft,
              attachments: (
                Array.isArray(draft?.attachments) ? draft.attachments : []
              ).map((url: string, index: number) =>
                // 前端上传后存的是媒体代理 URL，不是 COS key；
                // attachmentKeys 才是可重新签发的原始 key。
                sign(keys[index] || url),
              ),
            };
          }),
        )
      : order.allergyReportDrafts;

    return {
      ...order,
      attachments,
      attachmentsRecords: attachmentRecords,
      allergyReportDrafts: drafts,
    };
  }

  async getOrderByOrderId(orderId: string): Promise<any | null> {
    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { orderId },
      include: {
        dog: {
          select: {
            id: true,
            name: true,
            birthday: true,
            currentWeightKg: true,
            bcsScore: true,
            activityLevel: true,
            mealsPerDay: true,
            /** 定制对象档案（2026-10-24）：详情页要显示品种 */
            customBreedName: true,
            breedId: true,
            /**
             * 过敏（2026-10-04 第四期补）。
             *
             * 改造前这里只取了 6 个字段，订单页**看不到狗档案里的过敏**，
             * 只有顾客下单当时手填的那一份 —— 顾客后来在健康档案里
             * 更新过过敏，定制单页仍显示旧文本。
             *
             * 两个来源都带上，与设计器侧栏、健康页口径一致。
             */
            allergyFoods: true,
            allergyRecords: {
              select: { allergen: true, certainty: true, source: true },
              orderBy: { createdAt: 'asc' },
            },
            /**
             * 疾病史（2026-10-04 补）。
             *
             * 与过敏同理：订单上那份 `medicalConditions` 是顾客**下单当时**填的，
             * 顾客之后在健康档案里改了，后台订单页仍显示旧文本 ——
             * 员工可能按过期信息设计食谱。字段本来就在狗档案上，只是没取出来。
             */
            medicalHistory: true,
          },
        },
        customer: {
          select: {
            id: true,
            nickname: true,
            phone: true,
            /**
             * 角色（2026-10-21）：后台订单详情据此标「内部测试」。
             * 内部测试账号下的订单不是真实顾客单，不能让运营误当成真实业绩。
             */
            role: true,
            wechatOpenid: true,
          },
        },
        recipe: {
          // recipeId（业务编号）必须带出来：小程序拿它打开食谱详情页，
          // 而详情页是按业务编号查的。id（主键）只用于后台关联。
          select: {
            id: true,
            recipeId: true,
            name: true,
            coverImageUrl: true,
          },
        },
        attachmentsRecords: true,
        /**
         * 交付记录（2026-10-16 批次 2.4）。
         *
         * 只取当前有效的那一版（`replacedByDeliveryId = null`），
         * 且只取页面要用到的字段 —— 完整快照有几十 KB，
         * 订单详情不该背着它（要看内容走交付详情接口）。
         */
        deliveries: {
          where: { replacedByDeliveryId: null },
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            deliveredAt: true,
            confirmedAt: true,
            items: true,
            notifyStatus: true,
          },
        },
      },
    });
    if (!order) return null;
    await this.attachDogBreedNames([order]);
    return order;
  }

  /**
   * 给订单的 dog 补上品种名（2026-10-24）。
   *
   * Dog 表只有 breedId，Prisma 里没有 breed 关联；列表/详情要显示"柯基"，
   * 就在这里按 id 批量查一次 dog_breed，挂到 dog.breedName 上。
   * 不改 schema、不加迁移，避免为了一个展示字段动数据模型。
   */
  private async attachDogBreedNames(orders: any[]): Promise<void> {
    const ids = Array.from(
      new Set(
        orders
          .map((order) => order?.dog?.breedId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    if (ids.length === 0) return;

    const breeds = await this.prisma.dogBreed.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(breeds.map((breed) => [breed.id, breed.name]));
    for (const order of orders) {
      if (order?.dog) {
        order.dog.breedName = nameById.get(order.dog.breedId) ?? '';
      }
    }
  }

  /**
   * Get orders with filters
   */
  async getOrders(
    query: CustomRecipeOrderQuery,
  ): Promise<{ orders: any[]; total: number }> {
    const where: any = {};

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.dateFrom || query.dateTo) {
      where.scheduledDate = {};
      if (query.dateFrom) {
        where.scheduledDate.gte = query.dateFrom;
      }
      if (query.dateTo) {
        where.scheduledDate.lte = query.dateTo;
      }
    }

    if (query.search) {
      where.OR = [
        { orderId: { contains: query.search, mode: 'insensitive' } },
        {
          customer: {
            nickname: { contains: query.search, mode: 'insensitive' },
          },
        },
        { dog: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const [orders, total] = await Promise.all([
      this.prisma.customRecipeOrder.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              nickname: true,
              phone: true,
              wechatOpenid: true,
            },
          },
          dog: {
            select: {
              id: true,
              name: true,
              birthday: true,
              currentWeightKg: true,
              bcsScore: true,
              activityLevel: true,
              mealsPerDay: true,
              /** 列表卡要显示"豆豆 · 柯基 · 11.2kg"（2026-10-24） */
              customBreedName: true,
              breedId: true,
            },
          },
          recipe: {
            // recipeId（业务编号）必须带出来：小程序拿它打开食谱详情页，
            // 而详情页是按业务编号查的。id（主键）只用于后台关联。
            select: {
              id: true,
              recipeId: true,
              name: true,
              coverImageUrl: true,
            },
          },
          attachmentsRecords: true,
          /**
           * 交付与售后（2026-10-16 批次 5.4）。
           *
           * 加它们是为了让**列表也能下发渲染契约** ——
           * 此前列表页用写死的 `status === 'DELIVERED'` 决定按钮，
           * 结果订单一变成「已完成」，列表上就再也看不到「查看定制食谱」：
           * 顾客确认收货后反而找不到自己的食谱了。
           *
           * `deliveries` 只取当前有效的那版（被替换掉的不算），
           * 因为"有没有交付""有没有待确认的交付"问的都是当前这版。
           */
          deliveries: {
            where: { replacedByDeliveryId: null },
            select: { confirmedAt: true },
          },
          deliveryBatches: {
            orderBy: { version: 'desc' },
            take: 1,
            select: { confirmedAt: true },
          },
          aftersales: {
            where: { status: { in: ['PENDING', 'ACCEPTED', 'PROCESSING'] } },
            select: { id: true },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.customRecipeOrder.count({ where }),
    ]);

    await this.attachDogBreedNames(orders);
    return { orders, total };
  }

  /**
   * Update order
   *
   * 调用方（后台控制器）传的是**对外订单号 CR...**，不是 uuid 主键。
   * 之前直接 where:{id} 会命中不到记录（P2025），后台"确认收款/改状态/交付"
   * 三个动作全部 500。这里统一先解析成真实主键。
   */
  async updateOrder(
    orderIdOrId: string,
    data: UpdateCustomRecipeOrderDTO,
  ): Promise<any> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    return await this.prisma.customRecipeOrder.update({
      where: { id: ref.id },
      data,
    });
  }

  /**
   * Update order status
   */
  /**
   * 允许的状态流转。后台「改状态」此前是一个裸写：任何状态都能改成任何状态。
   *
   * 2026-09-28 修复，三件事：
   *   1. 加了流转合法性校验（例如已交付不能退回待付款）；
   *   2. 改成「已取消」时**释放当天名额**并记录取消时间/原因 ——
   *      原先不释放，而每天只有 5 个名额，僵尸单会直接吃掉接单能力；
   *   3. 「制作中」补记 inProgressAt（这一列此前从来没被写过）。
   */
  /**
   * 合法流转表**已搬到领域层**（2026-10-16 批次 1.2）：
   * `domain/custom-recipe/custom-recipe.state.ts`。
   *
   * 搬走的原因：此前它是这里的私有常量，而**有三条路径绕过它**直接写库
   * （交付、建食谱交付、人工确认收款），于是"有校验"是假的 ——
   * 能改状态的地方有四处，被校验的只有一处。
   *
   * 现在所有改状态的地方统一走 `assertTransition`。
   */

  async updateOrderStatus(
    orderIdOrId: string,
    status: CustomRecipeStatus,
    options?: { reason?: string },
  ): Promise<void> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: {
        id: true,
        status: true,
        scheduledDate: true,
        recipeQuantity: true,
        allergyReportDrafts: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    if (order.status === status) {
      return;
    }

    /**
     * DELIVERED 只能由交付服务写入（它同时建快照/交付记录）。
     * COMPLETED 只有存在交付时才允许从后台手动推进，否则顾客
     * 确认、售后和自动完成都会找不到内容。
     */
    if (status === CustomRecipeStatus.DELIVERED) {
      throw new BadRequestException(
        '不能直接把订单改成已交付，请通过交付流程交付食谱',
      );
    }
    if (status === CustomRecipeStatus.COMPLETED) {
      const [deliveryCount, batchCount] = await Promise.all([
        this.prisma.customRecipeDelivery.count({
          where: { orderId: order.id },
        }),
        this.prisma.customRecipeDeliveryBatch.count({
          where: { orderId: order.id },
        }),
      ]);
      if (deliveryCount === 0 && batchCount === 0) {
        throw new BadRequestException(
          '订单还没有交付记录，不能直接改成已完成',
        );
      }
    }

    /**
     * 流转校验走**领域层唯一真源**（批次 1.2）。
     * 把领域层抛的 Error 翻译成 Web 层的 400 —— 领域层不认识 Nest。
     */
    try {
      assertTransition(order.status, status);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '订单状态不能这样变更',
      );
    }

    /**
     * 时间戳由状态机统一决定写哪个字段（批次 1.2）。
     * 此前这三个 if 散在这里，而 `inProgressAt` 曾有一段时间**从来没被写过**
     * （2026-09-28 才补上）—— 集中到 `timestampFieldFor` 就不会再漏。
     */
    const timestampField = timestampFieldFor(status);
    const subStage = suggestSubStage(status);

    await this.prisma.$transaction(async (tx) => {
      /**
       * ⚠️ 这里用了**计算属性名**（`[timestampField]`），而它会让 TypeScript 的
       * "多余属性检查"失效 —— 写一个 schema 里根本不存在的列，`tsc` **不报错**，
       * 只在运行时炸。
       *
       * 2026-10-16 实测踩到：顺手在这里写了 `autoCompleteAt: null`，
       * 而那个列属于批次 1.6（交付单）还没建，类型检查一声不吭地放过了。
       * ⇒ 往这个 data 里加字段时，**必须回 schema.prisma 确认列真的存在**。
       */
      await tx.customRecipeOrder.update({
        where: { id: order.id },
        data: {
          status,
          ...(status === CustomRecipeStatus.CANCELLED
            ? {}
            : subStage
              ? { subStage }
              : {}),
          ...(timestampField ? { [timestampField]: new Date() } : {}),
          /**
           * 完成后清掉"自动完成闹钟"（批次 1.2 加的列）——
           * 留着的话定时任务会一直扫到这张已完成的单。
           */
          ...(status === CustomRecipeStatus.COMPLETED
            ? { autoCompleteAt: null }
            : {}),
          ...(status === CustomRecipeStatus.CANCELLED
            ? {
                cancelledAt: new Date(),
                cancellationReason: options?.reason || '后台手动取消',
              }
            : {}),
        },
      });

      // 取消要把名额还回去，否则这一天就白占了（按订单份数释放）
      if (status === CustomRecipeStatus.CANCELLED) {
        await this.releaseScheduleCapacity(
          tx,
          order.scheduledDate,
          order.recipeQuantity,
        );
      }
    });

    /**
     * 2026-10-19：任何路径把订单改成“已付款”，都要补一次档案同步。
     * 主路径是微信回调/后台确认收款（它们已单独调用）；这里兜住
     * 后台“改状态”直接改成 PAID 的情况。同步失败不影响状态变更。
     */
    if (status === CustomRecipeStatus.PAID) {
      try {
        await this.syncPaidOrderToHealthProfile(ref.id);
      } catch (error: any) {
        console.error(
          '[CustomRecipe] 改状态为已付款后档案同步失败:',
          error?.message ?? error,
        );
      }
    }

    // 取消后保留报告原件：订单详情仍展示「本单资料」，
    // 立刻删 COS 文件会让已取消订单的预览窗 404（2026-10-20 修）。
  }

  /**
   * 把「对外订单号」或「uuid」统一解析成真实主键。
   * 两个都查是为了兼容既有调用方，避免再次踩到"传了友好单号却按主键查"的坑。
   *
   * 2026-10-22：订单绑定食谱设计（Task 3）也复用这个口径解析订单，
   * 因此从 private 放开为 public，避免各处自己写一套「单号还是主键」的判断。
   */
  async resolveOrderRef(
    orderIdOrId: string,
  ): Promise<{ id: string; orderId: string }> {
    const record = await this.prisma.customRecipeOrder.findFirst({
      where: { OR: [{ orderId: orderIdOrId }, { id: orderIdOrId }] },
      select: { id: true, orderId: true },
    });

    if (!record) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    return record;
  }

  // ==================== 交付 ====================

  /**
   * 列出可以交付给这张定制单的食谱（后台「选择已设计好的食谱」用）。
   *
   * 2026-10-04：只列**这位顾客、这只狗**的私密定制食谱。设计器发布时会自动
   * 挂上订单号，所以最常见的候选就是"刚在设计器里做完的那一道"。
   */
  async listDeliverableRecipes(orderIdOrId: string): Promise<
    Array<{
      recipeId: string;
      name: string;
      version: number;
      updatedAt: Date;
      linkedToThisOrder: boolean;
    }>
  > {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: { id: true, customerId: true, dogId: true, recipeId: true },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    const recipes = await this.prisma.recipe.findMany({
      where: {
        isCustomRecipe: true,
        customerOwnerId: order.customerId,
        customerDogId: order.dogId,
      },
      select: {
        id: true,
        recipeId: true,
        name: true,
        version: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return recipes.map((recipe) => ({
      recipeId: recipe.recipeId,
      name: recipe.name,
      version: recipe.version,
      updatedAt: recipe.updatedAt,
      linkedToThisOrder: recipe.id === order.recipeId,
    }));
  }

  /**
   * ⚠️ 这里原来有一个 `deliverExistingRecipe`（2026-10-16 批次 5.7 删除）。
   *
   * 它只改订单（写 recipeId + 改状态），**不留交付记录、不留内容快照**，
   * 而且**绕过状态机**。批次 2.1 起，交付一律走
   * `CustomRecipeDeliveryService.deliver()` —— 那一条会生成快照、
   * 建版本记录、走状态机、算喂食量、设自动完成闹钟。
   *
   * ## 为什么现在才删
   *
   * 它**已经没有任何生产代码在调**（只有测试还在调），
   * 而它的允许清单停在 `[已付款, 制作中, 已交付]` —— **少了「已完成」**，
   * 报错文案还是"该订单已取消，不能交付"（对一张已完成的单是句错话）。
   *
   * 死代码本身不危险，**但一条过期的规则留在那里就是个陷阱**：
   * 哪天有人想"复用一下"，就会把售后改稿后重新交付的流程挡死，
   * 而且得到的是一句驴唇不对马嘴的错误提示。
   *
   * 它原来的 8 条测试（归属校验、一食谱一单、待付款/已取消不能交付）
   * 在交付服务的测试里都有等价覆盖，所以一并删除不会丢保护。
   */

  // ==================== 支付相关 ====================

  /**
   * 微信支付回调/主动查单确认收款（幂等）。
   *
   * 幂等很重要：微信回调可能重试多次，主动查单也可能与回调同时到达。
   * 这里用条件更新（只有仍处于 PENDING_PAYMENT 才改），
   * 避免把订单从 IN_PROGRESS / DELIVERED 打回 PAID。
   */
  async confirmPaymentFromWechat(
    orderIdOrId: string,
    transactionId?: string,
  ): Promise<any> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const result = await this.prisma.customRecipeOrder.updateMany({
      where: { id: ref.id, status: CustomRecipeStatus.PENDING_PAYMENT },
      data: {
        status: CustomRecipeStatus.PAID,
        paymentConfirmedAt: new Date(),
        paymentTransactionId: transactionId || null,
      },
    });

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      include: {
        customer: { select: { wechatOpenid: true } },
      },
    });

    const alreadyPaid = result.count === 0;

    /**
     * 微信订阅消息是一次性的，一次授权只能发一条。
     *
     * 顾客在提交定制订单时只申请了一次订阅，这次授权**专门留给「已交付」**；
     * 这里不能再发「已付款」，否则会把唯一一次订阅消耗掉，
     * 真正交付时顾客反而收不到通知。
     * 付款成功在订单详情/站内消息里仍然可见。
     */
    /**
     * 2026-10-19：付款成功后才把这一单写进狗狗档案。
     * 同步失败不能影响支付结果 —— 钱已经收了；留 healthInfoSyncedAt=null
     * 供后台/后续重试。
     */
    let healthSync: { synced: boolean; reason?: string } = {
      synced: false,
      reason: '未执行',
    };
    if (order) {
      try {
        healthSync = await this.syncPaidOrderToHealthProfile(order.id);
      } catch (error: any) {
        healthSync = {
          synced: false,
          reason: error?.message || '档案同步失败，请稍后重试',
        };
        console.error(
          '[CustomRecipe] 付款后档案同步失败:',
          error?.message ?? error,
        );
      }
    }

    return { order, alreadyPaid, healthSync };
  }

  /**
   * 关闭未付款的定制订单，并**释放当天占用的排期名额**。
   *
   * 不释放名额的后果：每有一张超时僵尸单，那一天的接单能力就永久少 1 个，
   * 几天之后"明明没人下单却提示约满"。
   */
  async cancelOrder(
    orderIdOrId: string,
    options: { reason: string; actorId?: string | null },
  ): Promise<{ cancelled: boolean }> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: {
        id: true,
        status: true,
        scheduledDate: true,
        recipeQuantity: true,
        allergyReportDrafts: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    if (order.status !== CustomRecipeStatus.PENDING_PAYMENT) {
      // 已付款/已交付的单不允许被自动关单悄悄改掉
      return { cancelled: false };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      /**
       * 条件更新，而不是按 id 无条件改写（2026-10-04 修复"钱收了单被关"）。
       *
       * 原写法：函数开头读到"待付款"就认定可以关，事务里直接按 id 改写状态。
       * 若微信支付回调恰好在这几毫秒内把订单推成 PAID，就会被这里覆盖回 CANCELLED ——
       * 顾客钱付了、单没了、还不会退款。现在只有"此刻仍是待付款"才关得掉，
       * 抢不过回调就放弃关单（返回 cancelled: false）。
       */
      const updated = await tx.customRecipeOrder.updateMany({
        where: { id: order.id, status: CustomRecipeStatus.PENDING_PAYMENT },
        data: {
          status: CustomRecipeStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: options.reason,
        },
      });

      // 没抢到 = 订单已被支付回调或别的流程改走，绝不能顺手把名额还掉
      if (updated.count === 0) {
        return { cancelled: false };
      }

      // 按订单份数释放，并保护 booked_count 不变负
      await this.releaseScheduleCapacity(
        tx,
        order.scheduledDate,
        order.recipeQuantity,
      );

      return { cancelled: true };
    });

    return result;
  }

  /**
   * 顾客自助取消（老板拍板的决策 12 + Q2）。
   *
   * 口径：
   *   · 只要**还没开始制作**就能取消 —— 即"待付款"和"已付款"两个状态；
   *   · 已付款的全额原路退回微信，不需要客服先确认；
   *   · 已开始制作/已交付的不能自助取消（要走客服）；
   *   · 取消一律释放当天接单名额。
   *
   * 退款由调用方（控制器）注入，避免这里直接依赖支付服务形成环。
   */
  async cancelOrderByCustomer(
    orderIdOrId: string,
    customerId: string,
    refund: (orderId: string, reason: string) => Promise<{ status: string }>,
    reason = '顾客取消定制订单',
  ): Promise<{ cancelled: boolean; refundStatus: string | null }> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: {
        id: true,
        orderId: true,
        customerId: true,
        status: true,
        scheduledDate: true,
        recipeQuantity: true,
        allergyReportDrafts: true,
        /**
         * 退款分流要用的三个字段（2026-10-21 · Task 5）。
         *
         * 代客单是线下收款、状态同样是 PAID；不看这三个字段就会去调微信退款。
         */
        paymentChannel: true,
        orderSource: true,
        paymentConfirmedAt: true,
        amount: true,
        actualPaidAmount: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    if (order.customerId !== customerId) {
      throw new BadRequestException('无权操作此订单');
    }

    /**
     * 什么时候顾客能自助取消（2026-10-18 按 V39 改）。
     *
     * 老板原话（V39）：
     *   "只要还没交付，随时都可以退，没有问题，我是这个意思"
     *
     * 所以口径是**「交付前」**，而不是"还没开始做"——
     * 此前把 `IN_PROGRESS`（制作中）排除在外、提示"已开始制作，请联系客服"，
     * 与 V39 冲突：制作中仍然**没交付**，顾客就该能退。
     *
     * 代价是可能已经买了食材 —— 但那是**老板明确接受的**风险
     * （"不要做复杂了"），不能因此把顾客卡住。
     */
    const cancellable: CustomRecipeStatus[] = [
      CustomRecipeStatus.PENDING_PAYMENT,
      CustomRecipeStatus.PAID,
      CustomRecipeStatus.IN_PROGRESS,
    ];

    if (!cancellable.includes(order.status)) {
      throw new BadRequestException(
        order.status === CustomRecipeStatus.DELIVERED
          ? '订单已交付，不能取消；如果有问题请提交售后'
          : '该订单当前状态无法取消',
      );
    }

    /**
     * ★ 线下收款订单**不能**由顾客自助取消（2026-10-21 · Task 5）。
     *
     * 钱是线下收的，微信里没有这笔交易 —— 这里如果继续走下面的原路退款，
     * 要么退款失败、要么退错钱。而又**不能悄悄取消不退钱**，
     * 所以明确拒绝并让顾客联系客服，由管理员登记线下退款。
     *
     * 只拦"已经收到钱"的单：未付款的待付款单取消不涉及退款，行为不变。
     */
    const hasCollectedPayment =
      Boolean(order.paymentConfirmedAt) ||
      order.status === CustomRecipeStatus.PAID ||
      order.status === CustomRecipeStatus.IN_PROGRESS;

    const isOfflineOrder = isOfflinePaidCustomRecipeOrder(order);
    const offlinePaidAmount = Math.round(
      resolveOfflineRefundCap(order as any) * 100,
    ) / 100;
    if (hasCollectedPayment && isOfflineOrder && offlinePaidAmount > 0) {
      throw new BadRequestException('线下收款订单请联系客服处理退款');
    }

    let refundStatus: string | null = null;

    /**
     * ① 先**认领**这次取消（CAS），拿到的一方才有权动名额与退款。
     *
     * 2026-10-04 修复两件事：原写法在事务里按 id 无条件改写状态，于是
     *   · "顾客连点两次取消"或"顾客取消 + 定时关单同时到"会把名额**重复释放**，
     *     每日上限被悄悄放大；
     *   · 若订单在被读成 PAID 之后、改写之前被后台推进到"制作中"，
     *     这一刀会把制作中的订单覆盖成已取消。
     * 现在只有抢到状态迁移的那一方继续往下走。
     */
    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customRecipeOrder.updateMany({
        where: { id: order.id, status: order.status },
        data: {
          status: CustomRecipeStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
      });

      if (updated.count === 0) return false;

      // 按订单份数释放当天名额
      await this.releaseScheduleCapacity(
        tx,
        order.scheduledDate,
        order.recipeQuantity,
      );

      return true;
    });

    if (!claimed) {
      // 抢输说明它已被别处取消（定时关单/重复点击）：名额与退款都不能再动一次
      const latest = await this.prisma.customRecipeOrder.findUnique({
        where: { id: order.id },
        select: { status: true },
      });

      return {
        cancelled: latest?.status === CustomRecipeStatus.CANCELLED,
        refundStatus: null,
      };
    }

    /**
     * ② 已付款但还没交付的再退款。退款失败就**把取消回滚**，
     * 避免"取消了钱没退"这种最糟的结果。
     *
     * 2026-10-21 修：原来只认 `PAID`，制作中（IN_PROGRESS）取消**不退钱**。
     * 但 IN_PROGRESS 同样是"钱已收、货未交"，V39 又明确允许顾客在这个阶段
     * 自助取消 —— 不退就是白拿顾客的钱。生产单 CR202610201196 即此情况。
     *
     * 回滚是安全的：CANCELLED 是终态，我们刚认领成功，期间不会有别的流程改动它。
     */
    const refundableBeforeDelivery =
      order.status === CustomRecipeStatus.PAID ||
      order.status === CustomRecipeStatus.IN_PROGRESS;

    if (refundableBeforeDelivery) {
      try {
        const result = await refund(order.orderId, reason);
        refundStatus = result?.status ?? null;

        /**
         * 微信可能**不抛错、但返回失败状态**（CLOSED / ABNORMAL）。
         * 只认「成功 / 处理中 / 待处理」；其它状态按失败处理，
         * 走下面的回滚 —— 不能留下"单取消了、钱没退"。
         */
        const normalizedStatus = String(refundStatus || '').toUpperCase();
        if (
          normalizedStatus &&
          !['SUCCESS', 'PROCESSING', 'PENDING'].includes(normalizedStatus)
        ) {
          throw new BadRequestException(
            `退款未成功（${normalizedStatus}），取消已回滚；请到微信商户平台核查后再试`,
          );
        }
      } catch (error) {
        await this.prisma.$transaction(async (tx) => {
          await tx.customRecipeOrder.updateMany({
            where: { id: order.id, status: CustomRecipeStatus.CANCELLED },
            data: {
              /**
               * 回到**取消前的真实状态**（PAID 或 IN_PROGRESS），不能写死 PAID：
               * 把制作中的单回滚成已付款，等于凭空抹掉"已开始制作"，
               * 后台工作台与顾客页都会显示错误进度。
               */
              status: order.status,
              cancelledAt: null,
              cancellationReason: null,
            },
          });

          // 名额也还回去：取消时释放了，回滚就得按同一份数重新占上
          const quantity = this.resolveStoredRecipeQuantity(
            order.recipeQuantity,
          );
          await tx.customRecipeSchedule.updateMany({
            where: { date: order.scheduledDate },
            data: { bookedCount: { increment: quantity } },
          });
        });

        throw error;
      }
    }

    return { cancelled: true, refundStatus };
  }

  /**
   * 线下退款登记 + 取消订单（2026-10-21 · 代客定制食谱订单 Task 5）。
   *
   * ## 为什么不能复用「取消订单」
   *
   * 后台取消原来的动作是"先调微信退款，再改状态"。代客单的钱**不在微信支付**里，
   * 调用退款只会失败（或更糟：如果商户侧有同单号交易会退错钱）。
   * 而线下退款也没有微信退款单可对账，所以只能把
   * 「谁、什么时候、退了多少、怎么退、备注什么」留在订单上。
   *
   * ## 一个事务里做完三件事
   *
   * ① 写线下退款登记字段 + `refundChannel=OFFLINE`；
   * ② 状态改 `CANCELLED`（记取消时间/原因）；
   * ③ 按订单份数释放当天接单名额（复用 `releaseScheduleCapacity`，
   *    它保证 `bookedCount` 不会被减成负数）。
   *
   * ## 幂等
   *
   * 用**条件更新**认领这次登记：只有"此刻仍未取消、未登记过线下退款"才写得进去。
   * 连点两次/两个管理员同时点，只有一方成功，另一方拿到 400 ——
   * 不会重复释放名额，也不会把两条退款记录叠在一起。
   *
   * 金额上限是**实收金额**（`actualPaidAmount`，缺失时退回订单金额）：
   * 线下实收可能与系统报价不同，退款口径必须跟实收走。
   */
  async registerOfflineRefund(
    orderIdOrId: string,
    input: { amount: number; method: string; note?: string | null },
    operatorId: string,
  ): Promise<{
    orderId: string;
    status: string;
    refundChannel: string;
    amount: number;
    method: string;
    note: string | null;
    offlineRefundedAt: Date;
    cancelledAt: Date;
    cancellationReason: string;
    releasedCapacity: number;
    operatorId: string;
  }> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: {
        id: true,
        orderId: true,
        status: true,
        scheduledDate: true,
        recipeQuantity: true,
        amount: true,
        actualPaidAmount: true,
        paymentConfirmedAt: true,
        paymentChannel: true,
        orderSource: true,
        offlineRefundedAt: true,
        cancelledAt: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    /**
     * 没收到钱的单没有"退款"可登记。
     *
     * 线下单的收款凭据就是 `paymentConfirmedAt`；`paymentTransactionId` 是微信
     * 交易号，不适用于线下，所以这里只看前者。
     */
    if (!order.paymentConfirmedAt) {
      throw new BadRequestException('该订单尚未确认收款，不能登记线下退款');
    }

    /**
     * 线上单必须走微信原路退款。允许它在这里登记线下退款，等于给一条
     * **绕过微信退款**的后门 —— 钱退没退、退多少都无法对账。
     */
    if (!isOfflinePaidCustomRecipeOrder(order)) {
      throw new BadRequestException(
        '该订单不是线下收款订单，请使用微信原路退款',
      );
    }

    const method = normalizePaymentChannel(input.method);
    if (!isValidOfflineRefundMethod(method)) {
      throw new BadRequestException(
        `退款方式不合法，可选：${OFFLINE_REFUND_METHODS.join(' / ')}`,
      );
    }

    const rawAmount = Number(input.amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      throw new BadRequestException('退款金额必须大于 0');
    }

    // 金额列是 Decimal(10,2)：先按分取整，避免 0.001 这类值绕过 >0 校验
    const amount = Math.round(rawAmount * 100) / 100;
    if (amount <= 0) {
      throw new BadRequestException('退款金额必须大于 0');
    }

    const cap = Math.round(resolveOfflineRefundCap(order) * 100) / 100;
    if (cap <= 0) {
      throw new BadRequestException('该订单没有可退的实收金额');
    }
    if (amount > cap) {
      throw new BadRequestException(
        `退款金额不能超过实收金额 ¥${cap.toFixed(2)}`,
      );
    }

    /**
     * 幂等前置检查：已取消 / 已登记过线下退款的单直接拒绝。
     *
     * 真正防并发的是下面事务里的 CAS；这个前置检查只是让常见情况
     * 不必白跑一次事务、错误信息也更直接。
     */
    if (
      order.offlineRefundedAt ||
      order.cancelledAt ||
      order.status === CustomRecipeStatus.CANCELLED
    ) {
      throw new BadRequestException(
        '该订单已取消或已登记线下退款，不能重复登记',
      );
    }

    /**
     * 已交付/已完成的单必须走售后，不能借"线下退款"把订单撤销 ——
     * 否则顾客已经拿到食谱，订单却被关掉，售后与对账都失去依据。
     */
    if (!canTransition(order.status, CustomRecipeStatus.CANCELLED)) {
      throw new BadRequestException(
        order.status === CustomRecipeStatus.DELIVERED ||
          order.status === CustomRecipeStatus.COMPLETED
          ? '订单已交付，不能取消；如有问题请提交售后'
          : `当前状态（${order.status}）不能取消`,
      );
    }

    const note = String(input.note ?? '').trim() || null;
    const now = new Date();
    const cancellationReason = buildOfflineRefundCancellationReason({
      amount,
      method,
      note,
    });

    const releasedCapacity = await this.prisma.$transaction(async (tx) => {
      /**
       * CAS 认领：带 `offlineRefundedAt: null / cancelledAt: null` 且状态仍可取消
       * 的条件更新，只有仍处于"未退未取消"的那一方能写成。抢输返回 count=0，
       * 绝不能顺手再释放一次名额。
       *
       * 状态用白名单（而不是 `not CANCELLED`）：如果在我们读完订单之后
       * 恰好被推进到「已交付」，这里必须抢输 —— 不能给已交付的单退款并撤销。
       */
      const updated = await tx.customRecipeOrder.updateMany({
        where: {
          id: order.id,
          status: {
            in: [
              CustomRecipeStatus.PENDING_PAYMENT,
              CustomRecipeStatus.PAID,
              CustomRecipeStatus.IN_PROGRESS,
            ],
          },
          offlineRefundedAt: null,
          cancelledAt: null,
        },
        data: {
          status: CustomRecipeStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason,
          refundChannel: OFFLINE_REFUND_CHANNEL,
          offlineRefundedAt: now,
          offlineRefundAmount: amount,
          offlineRefundMethod: method,
          offlineRefundNote: note,
          offlineRefundByStaffId: operatorId,
        },
      });

      if (updated.count === 0) {
        throw new BadRequestException(
          '该订单已取消或已登记线下退款，不能重复登记',
        );
      }

      return await this.releaseScheduleCapacity(
        tx,
        order.scheduledDate,
        order.recipeQuantity,
      );
    });

    return {
      orderId: order.orderId,
      status: CustomRecipeStatus.CANCELLED,
      refundChannel: OFFLINE_REFUND_CHANNEL,
      amount,
      method,
      note,
      offlineRefundedAt: now,
      cancelledAt: now,
      cancellationReason,
      releasedCapacity,
      operatorId,
    };
  }

  /**
   * 找出超过支付时限仍未付款的定制订单（供定时任务关单）
   */
  async findExpiredUnpaidOrders(
    timeoutMinutes: number,
  ): Promise<Array<{ id: string; orderId: string; createdAt: Date }>> {
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
      return [];
    }

    const deadline = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    return await this.prisma.customRecipeOrder.findMany({
      where: {
        status: CustomRecipeStatus.PENDING_PAYMENT,
        createdAt: { lt: deadline },
      },
      select: { id: true, orderId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get statistics
   */
  async getStatistics(filters?: any): Promise<any> {
    const where: any = {};
    if (filters?.dateFrom) {
      where.createdAt = { ...where.createdAt, gte: filters.dateFrom };
    }
    if (filters?.dateTo) {
      where.createdAt = { ...where.createdAt, lte: filters.dateTo };
    }

    const [pendingPayment, inProgress, delivered, orders, pendingAftersale] =
      await Promise.all([
      this.prisma.customRecipeOrder.count({
        where: { ...where, status: CustomRecipeStatus.PENDING_PAYMENT },
      }),
      this.prisma.customRecipeOrder.count({
        where: { ...where, status: CustomRecipeStatus.IN_PROGRESS },
      }),
      this.prisma.customRecipeOrder.count({
        where: { ...where, status: CustomRecipeStatus.DELIVERED },
      }),
      /**
       * 收入口径：**已经收到的钱**。
       *
       * 2026-09-28 修复：原先只统计"已交付"，于是已付款/制作中的单不计收入，
       * 后台金额系统性偏低。定制费是下单即付的，收款发生在前两个状态。
       */
      this.prisma.customRecipeOrder.findMany({
        where: {
          ...where,
          status: {
            in: [
              CustomRecipeStatus.PAID,
              CustomRecipeStatus.IN_PROGRESS,
              CustomRecipeStatus.DELIVERED,
            ],
          },
        },
        select: { amount: true },
      }),
      /**
       * 待售后（2026-10-18 加）。
       *
       * 老板定的两档待办之一。口径：**未处理完的售后单**数量 ——
       * 排除 RESOLVED（已完成）与 WITHDRAWN（顾客撤回）。
       *
       * 注意**不受日期范围过滤**：一单半个月前提交、现在还没处理，
       * 它今天仍然是待办。按创建日期筛掉它等于把漏掉的事藏起来。
       */
      this.prisma.customRecipeAftersale.count({
        where: {
          status: {
            in: [
              CustomRecipeAftersaleStatus.PENDING,
              CustomRecipeAftersaleStatus.ACCEPTED,
              CustomRecipeAftersaleStatus.PROCESSING,
            ],
          },
        },
      }),
    ]);

    const totalRevenue = orders.reduce(
      (sum, order) => sum + Number(order.amount),
      0,
    );

    return {
      pendingPayment,
      inProgress,
      delivered,
      totalRevenue,
      /** 两档待办（2026-10-18）：待交付 = inProgress，待售后 = pendingAftersale */
      pendingAftersale,
    };
  }

  /**
   * 按星期的排期规则（批次 4.2）。
   *
   * 一次取全部七条，调用方在内存里查 —— 否则算一个月的日历时
   * 要查 30 次库。
   *
   * 取不到（表还没配）时返回**空表**，由领域层退回"按全局配置全周开放"。
   * 这里**不替老板决定"周日休息"** —— 默认值是一种主张，
   * 他哪天想周日接单却发现约不上、又不知道为什么，那才是麻烦。
   */
  private async resolveWeekdayRules(): Promise<Map<number, WeekdayRule>> {
    try {
      const rows = await this.prisma.customRecipeWeekdayRule.findMany();
      const map = new Map<number, WeekdayRule>();
      for (const row of rows) {
        map.set(row.weekday, {
          weekday: row.weekday,
          isOpen: row.isOpen,
          capacity: row.capacity,
          deliveryCapacity: row.deliveryCapacity,
          note: row.note,
        });
      }
      return map;
    } catch {
      return new Map();
    }
  }

  /**
   * 算某一天的真实状态（批次 4.2）。
   *
   * 三层优先级：具体某天 > 按星期规则 > 全局配置。
   * 判定本身在领域层（`resolveDay`），这里只负责取数。
   */
  async resolveDayStatus(
    date: Date,
    options?: {
      weekdayRules?: Map<number, WeekdayRule>;
      defaultCapacity?: number;
      defaultDeliveryCapacity?: number;
    },
  ): Promise<ResolvedDay> {
    const [config, rules] = await Promise.all([
      this.configService.getConfig(),
      options?.weekdayRules
        ? Promise.resolve(options.weekdayRules)
        : this.resolveWeekdayRules(),
    ]);

    const override = await this.prisma.customRecipeSchedule.findUnique({
      where: { date },
    });

    return resolveDay({
      date,
      override: override
        ? {
            isAvailable: override.isAvailable,
            capacity: override.capacity,
            bookedCount: override.bookedCount,
            deliveryCapacity: override.deliveryCapacity,
            deliveryCount: override.deliveryCount,
            isPublicHoliday: override.isPublicHoliday,
          }
        : null,
      weekdayRule: rules.get(date.getDay()) ?? null,
      defaultCapacity:
        options?.defaultCapacity ?? (Number(config.dailyCapacity) || 4),
      defaultDeliveryCapacity:
        options?.defaultDeliveryCapacity ??
        (Number(config.dailyDeliveryCapacity) || 4),
    });
  }

  /**
   * 取按星期的排期规则（后台用）。
   *
   * 库里没配时**返回默认值并标 `isDefault`** —— 不落库，
   * 免得仅仅因为后台打开了一次页面，就替老板"决定"了七天规则。
   */
  async getWeekdayRules(): Promise<
    Array<WeekdayRule & { isDefault: boolean }>
  > {
    const [config, rules] = await Promise.all([
      this.configService.getConfig(),
      this.resolveWeekdayRules(),
    ]);

    const defaultCapacity = Number(config.dailyCapacity) || 4;
    const defaultDeliveryCapacity = Number(config.dailyDeliveryCapacity) || 4;

    if (rules.size === 0) {
      return defaultWeekdayRules(defaultCapacity, defaultDeliveryCapacity).map(
        (rule) => ({ ...rule, isDefault: true }),
      );
    }

    return Array.from({ length: 7 }, (_, weekday) => {
      const rule = rules.get(weekday);
      return rule
        ? { ...rule, isDefault: false }
        : {
            weekday,
            isOpen: true,
            capacity: defaultCapacity,
            deliveryCapacity: defaultDeliveryCapacity,
            note: null,
            isDefault: true,
          };
    });
  }

  /** 保存按星期的排期规则（整体覆盖七条） */
  async saveWeekdayRules(
    items: Array<{
      weekday: number;
      isOpen: boolean;
      capacity?: number | null;
      deliveryCapacity?: number | null;
      note?: string | null;
    }>,
  ): Promise<{ saved: number }> {
    const valid = (items ?? []).filter(
      (item) =>
        Number.isInteger(item.weekday) &&
        item.weekday >= 0 &&
        item.weekday <= 6,
    );

    if (valid.length === 0) {
      throw new BadRequestException('至少要有一条规则');
    }

    for (const item of valid) {
      if (
        item.capacity !== null &&
        item.capacity !== undefined &&
        (!Number.isInteger(item.capacity) ||
          item.capacity < 1 ||
          item.capacity > 200)
      ) {
        throw new BadRequestException(
          `周${item.weekday}的接单上限必须是 1~200 的整数`,
        );
      }
      if (
        item.deliveryCapacity !== null &&
        item.deliveryCapacity !== undefined &&
        (!Number.isInteger(item.deliveryCapacity) ||
          item.deliveryCapacity < 1 ||
          item.deliveryCapacity > 200)
      ) {
        throw new BadRequestException(
          `周${item.weekday}的交付上限必须是 1~200 的整数`,
        );
      }
    }

    /**
     * 逐条 upsert，**不删没传的**。
     *
     * 后台页总是传满七条，但万一将来有别的调用方只传改过的那几条，
     * 删掉其余的会把没动的规则弄丢 —— upsert 更安全。
     */
    await this.prisma.$transaction(
      valid.map((item) =>
        this.prisma.customRecipeWeekdayRule.upsert({
          where: { weekday: item.weekday },
          update: {
            isOpen: item.isOpen,
            capacity: item.capacity ?? null,
            deliveryCapacity: item.deliveryCapacity ?? null,
            note: item.note ?? null,
          },
          create: {
            weekday: item.weekday,
            isOpen: item.isOpen,
            capacity: item.capacity ?? null,
            deliveryCapacity: item.deliveryCapacity ?? null,
            note: item.note ?? null,
          },
        }),
      ),
    );

    return { saved: valid.length };
  }

  /**
   * 每日接单上限来自后台配置（原为写死的 4）
   */
  private async resolveDailyCapacity(): Promise<number> {
    const config = await this.configService.getConfig();
    return config.dailyCapacity;
  }

  /**
   * 从配置里读一个正整数，读不到就用兜底值。
   *
   * ⚠️ **为什么不能只判 catch**（2026-10-16 踩到的，坏了 5 条排期测试）：
   * 只 try/catch 的话，"配置取到了、但**字段是 undefined**"（配置表还没升级、
   * 或调用方只传了部分字段）会把 undefined 当成 0 天往下走 ——
   * 排期循环一次都不执行，顾客直接看到「近期名额已满」这种莫名其妙的错。
   */
  private async resolvePositiveIntFromConfig(
    read: (
      config: Awaited<ReturnType<CustomRecipeConfigService['getConfig']>>,
    ) => unknown,
    fallback: number,
  ): Promise<number> {
    try {
      const config = await this.configService.getConfig();
      const value = Number(read(config));
      return Number.isInteger(value) && value > 0 ? value : fallback;
    } catch {
      /**
       * 配置读不到也不能拦住下单：排期是下单链路的一环，
       * 退回兜底值继续跑，总比让顾客下不了单好。
       */
      return fallback;
    }
  }

  /**
   * 排期往前找多少天（原为写死的 45）· 批次 1.4
   */
  private resolveScheduleLookaheadDays(): Promise<number> {
    return this.resolvePositiveIntFromConfig(
      (config) => config.scheduleLookaheadDays,
      CustomRecipeService.FALLBACK_SCHEDULE_LOOKAHEAD_DAYS,
    );
  }

  /** 占位冲突时最多换几天重试（原为写死的 5）· 批次 1.4 */
  private resolveSlotRetryTimes(): Promise<number> {
    return this.resolvePositiveIntFromConfig(
      (config) => config.slotRetryTimes,
      CustomRecipeService.FALLBACK_SLOT_BOOKING_ATTEMPTS,
    );
  }

  /**
   * 附件限额（批次 1.4）。
   *
   * 原先**在两个控制器里各写一遍 `10 * 1024 * 1024`**，
   * 而且小程序那边的"最多 9 张"又是第三处。现在统一从这里读。
   */
  async getAttachmentLimits(): Promise<{
    maxSizeBytes: number;
    maxSizeMb: number;
    maxCount: number;
  }> {
    const maxSizeMb = await this.resolvePositiveIntFromConfig(
      (config) => config.attachmentMaxSizeMb,
      10,
    );
    const maxCount = await this.resolvePositiveIntFromConfig(
      (config) => config.attachmentMaxCount,
      9,
    );
    return {
      maxSizeMb,
      maxSizeBytes: maxSizeMb * 1024 * 1024,
      maxCount,
    };
  }

  /** 业务编号前缀（原为写死的 'CR'）· 批次 1.4 */
  private async resolveOrderNoPrefix(): Promise<string> {
    try {
      const config = await this.configService.getConfig();
      const prefix = String(config.orderNoPrefix ?? '').trim();
      return prefix || 'CR';
    } catch {
      return 'CR';
    }
  }

  // ==================== 渲染契约要用的配置（批次 1.5）====================

  /**
   * 售后窗口天数（批次 1.5 加）。
   *
   * 顾客侧的「有问题」按钮能不能点，由后端按交付时间 + 这个天数算出来 ——
   * 此前是小程序自己判 `7 天`（写死），而后端配置是 30 天，
   * **两边口径本来就不一致**。现在以配置为准。
   */
  async getAftersaleWindowDays(): Promise<number | null> {
    const value = await this.resolvePositiveIntFromConfig(
      (config) => config.aftersaleWindowDays,
      30,
    );
    return value;
  }

  /** 是否要求顾客确认收货（批次 1.5 加）—— 决定小程序显不显示「确认收到」 */
  async getRequireCustomerConfirm(): Promise<boolean> {
    try {
      const config = await this.configService.getConfig();
      return config.requireCustomerConfirm !== false;
    } catch {
      return true;
    }
  }

  /**
   * Get schedule for a specific date
   */
  async getSchedule(date: Date): Promise<any | null> {
    const schedule = await this.prisma.customRecipeSchedule.findUnique({
      where: { date },
    });

    if (!schedule) {
      // Create default schedule
      return await this.createSchedule(
        date,
        await this.resolveDailyCapacity(),
      );
    }

    return schedule;
  }

  /**
   * Get schedule range
   */
  async getScheduleRange(dateFrom: Date, dateTo: Date): Promise<any[]> {
    const defaultCapacity = await this.resolveDailyCapacity();
    const schedules = await this.prisma.customRecipeSchedule.findMany({
      where: {
        date: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
      orderBy: { date: 'asc' },
    });

    // Fill in missing dates with default schedules
    const result = [];
    const currentDate = new Date(dateFrom);
    const endDate = new Date(dateTo);

    while (currentDate <= endDate) {
      const existing = schedules.find(
        (s) => s.date.getTime() === currentDate.getTime(),
      );
      if (existing) {
        result.push(existing);
      } else {
        result.push({
          date: new Date(currentDate),
          capacity: defaultCapacity,
          bookedCount: 0,
          isAvailable: true,
          isPublicHoliday: false,
        });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  /**
   * Create schedule
   */
  async createSchedule(
    date: Date,
    capacity: number,
    isPublicHoliday = false,
  ): Promise<any> {
    return await this.prisma.customRecipeSchedule.create({
      data: {
        date,
        capacity,
        bookedCount: 0,
        isAvailable: true,
        isPublicHoliday,
      },
    });
  }

  /**
   * Update schedule
   */
  async updateSchedule(date: Date, data: Partial<any>): Promise<void> {
    await this.prisma.customRecipeSchedule.upsert({
      where: { date },
      update: data,
      create: {
        date,
        capacity: data.capacity || (await this.resolveDailyCapacity()),
        bookedCount: 0,
        isAvailable: data.isAvailable ?? true,
        isPublicHoliday: data.isPublicHoliday ?? false,
      },
    });
  }

  /**
   * Check availability
   */
  async checkAvailability(date: Date): Promise<boolean> {
    /**
     * 2026-09-28 修复（节假日可以被绕过）：
     *
     * 原实现是"先落一条默认排期行（isPublicHoliday 一律写 false），再按假期判断返回"。
     * 于是节假日虽然会被拒，但那行"这不是假期"已经写进库了；
     * 顾客**再点一次**时走的是"行已存在"分支，而那个分支只看
     * isAvailable / bookedCount，完全不看 isPublicHoliday —— 节假日就能约上了。
     *
     * 现在：先把假期判断做完，落库时写真实的 isPublicHoliday；
     * 已存在的行也必须尊重它。另外补上"不能约过去的日期"。
     */
    const capacity = await this.resolveDailyCapacity();
    const holiday = await isPublicHoliday(date);

    if (this.isPastDate(date)) {
      return false;
    }

    const schedule = await this.prisma.customRecipeSchedule.findUnique({
      where: { date },
    });

    if (!schedule) {
      // 首次访问该日期：落一条**带真实假期标记**的默认排期
      await this.createSchedule(date, capacity, holiday);
      return !holiday;
    }

    /**
     * 2026-10-16（批次 4.2）：改走 `resolveDayStatus` —— 三层优先级
     * （具体某天 > 按星期规则 > 全局配置）与**接单/交付两套容量**
     * 都收在领域层，这里只问"开不开"。
     *
     * 上面已经处理过"没有这一天的记录"的分支（会落一条默认行），
     * 所以走到这里 schedule 一定存在；但 `resolveDayStatus` 会重新读一次，
     * 多一次查询换"判定只有一处"，这个交换是划算的 ——
     * 日历的错一旦出现就是"某一天悄悄约不上"，排查成本远高于一次查询。
     */
    const day = await this.resolveDayStatus(date);
    return day.isOpen;
  }

  /**
   * 取一段时间的排期，带上**按星期规则算出来的**可约状态。
   *
   * 供后台日历页与小程序排期页共用 —— 两边都不再自己判断
   * "这天为什么不能约"，原因由后端给。
   */
  async resolveCalendarRange(
    dateFrom: Date,
    dateTo: Date,
  ): Promise<ResolvedDay[]> {
    const [config, rules] = await Promise.all([
      this.configService.getConfig(),
      this.resolveWeekdayRules(),
    ]);

    const defaultCapacity = Number(config.dailyCapacity) || 4;
    const defaultDeliveryCapacity = Number(config.dailyDeliveryCapacity) || 4;

    const overrides = await this.prisma.customRecipeSchedule.findMany({
      where: { date: { gte: dateFrom, lte: dateTo } },
    });
    const byDate = new Map(
      overrides.map((row) => [row.date.getTime(), row]),
    );

    const days: ResolvedDay[] = [];
    const cursor = new Date(dateFrom);
    while (cursor <= dateTo) {
      const row = byDate.get(cursor.getTime());
      days.push(
        resolveDay({
          date: new Date(cursor),
          override: row
            ? {
                isAvailable: row.isAvailable,
                capacity: row.capacity,
                bookedCount: row.bookedCount,
                deliveryCapacity: row.deliveryCapacity,
                deliveryCount: row.deliveryCount,
                isPublicHoliday: row.isPublicHoliday,
              }
            : null,
          weekdayRule: rules.get(cursor.getDay()) ?? null,
          defaultCapacity,
          defaultDeliveryCapacity,
        }),
      );
      cursor.setDate(cursor.getDate() + 1);
    }

    return days;
  }

  /**
   * 排期是按"天"的，早于今天的都不该能约。
   *
   * 用**上海日期**比较，不用服务器本地时区：scheduledDate 是按 UTC 零点存的
   * DATE，用本地 setHours 去截断，一旦服务器时区变了就会整体偏一天。
   */
  private isPastDate(date: Date): boolean {
    const target = TimezoneUtil.toShanghaiDateString(new Date(date));
    const today = TimezoneUtil.toShanghaiDateString(new Date());

    return target < today;
  }

  /**
   * Book a slot
   */
  async bookSlot(date: Date): Promise<void> {
    await this.prisma.customRecipeSchedule.update({
      where: { date },
      data: {
        bookedCount: { increment: 1 },
      },
    });
  }

  /**
   * 自动排期的起点：上海时区的"今天"，且按 DATE 列的存储口径（UTC 零点）。
   *
   * 必须走 TimezoneUtil + parseYYYYMMDD：直接用 new Date() 会带上当前时刻，
   * 服务器时区一变就会整体偏一天（历史上就踩过 0-8 点下单写成昨天）。
   */
  private getScheduleStartDate(): Date {
    /**
     * DATE 列按 UTC 零点存（Prisma @db.Date 取 UTC 日期部分）。
     * 这里必须显式构造 UTC 零点；用 new Date(y,m,d)（服务器本地零点）
     * 会被写成前一天，进而把预计交付也算早一天（2026-10-19 生产问题）。
     */
    const [year, month, day] = TimezoneUtil.toShanghaiDateString(new Date())
      .split('-')
      .map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  /** 日期游标 +1 天（按 UTC 毫秒推进，避开夏令时/时区把日期挪走） */
  private addOneDay(date: Date): Date {
    return new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }

  /**
   * 预估交付日期（2026-10-18 · 需求 2.3.5）
   *
   * 下单页要在提交**之前**告诉顾客"预计几号交付" —— 此前线上对 ¥300 没有任何解释，
   * 顾客以为含食材，说明只在付完钱之后才出现。
   *
   * ## 为什么不在前端算
   *
   * 需求写死了：「交付日期由后端按排单算法算出，**前端不做日期推算**」。
   * 前端算的话，跟真正下单时排到的那天可能不是同一天（并发占位），
   * 顾客会觉得"说好的 20 号怎么变成 22 号"。
   *
   * ## 它只读不占位
   *
   * 只是查"下一个有空的日子"，**不锁位**。
   * 真正确认是在下单事务里 `tryBookSlotTx` —— 那一步才算数。
   *
   * 2026-10-21：接受 quantity —— N 份要找到**剩余产能 ≥ N** 的那一天，
   * 并按份数把交期往后推，不能拿 1 份的日期糊弄 5 份订单。
   */
  async getEstimatedDeliveryDate(quantity = 1): Promise<{
    quantity: number;
    scheduledDate: string | null;
    estimatedDeliveryDate: string | null;
    deliveryWorkDays: number;
  }> {
    const config = await this.configService.getConfig();
    const normalizedQuantity = this.resolveDeliveryQuantity(quantity, config);
    const deliveryWorkDays = this.calculateDeliveryWorkDays(
      normalizedQuantity,
      config,
    );
    const next = await this.findNextAvailableDate(
      config.dailyCapacity,
      new Set(),
      normalizedQuantity,
    );

    if (!next) {
      return {
        quantity: normalizedQuantity,
        scheduledDate: null,
        estimatedDeliveryDate: null,
        deliveryWorkDays,
      };
    }

    const estimated = await addWorkDays(next, deliveryWorkDays);

    return {
      quantity: normalizedQuantity,
      scheduledDate: TimezoneUtil.toShanghaiDateString(next),
      estimatedDeliveryDate: TimezoneUtil.toShanghaiDateString(estimated),
      deliveryWorkDays,
    };
  }

  /**
   * 预估/报价接口的份数校验：1..后台当前最多份数。
   *
   * 控制器已经解析过一遍，这里再校验是为了防住服务内部调用
   * 和以后新增的入口绕过 HTTP 层。
   */
  private resolveDeliveryQuantity(
    raw: number,
    config: { maxRecipeQuantity: number },
  ): number {
    const configuredMax = Number(config.maxRecipeQuantity);
    const maxQuantity =
      Number.isInteger(configuredMax) &&
      configuredMax >= 1 &&
      configuredMax <= MAX_MULTI_RECIPE_QUANTITY
        ? configuredMax
        : MAX_MULTI_RECIPE_QUANTITY;

    if (!Number.isInteger(raw) || raw < 1 || raw > maxQuantity) {
      throw new BadRequestException(
        `份数必须是 1~${maxQuantity} 的整数`,
      );
    }
    return raw;
  }

  private async findNextAvailableDate(
    capacity: number,
    excludeDays: Set<string> = new Set(),
    units = 1,
  ): Promise<Date | null> {
    const unitsToBook = Number.isInteger(units) && units > 0 ? units : 1;
    const todayKey = TimezoneUtil.toShanghaiDateString(new Date());
    let cursor = this.getScheduleStartDate();
    /** 往前找多少天（原写死 45，2026-10-16 起从配置读） */
    const lookaheadDays = await this.resolveScheduleLookaheadDays();

    for (let i = 0; i < lookaheadDays; i += 1) {
      const key = TimezoneUtil.toShanghaiDateString(cursor);

      if (key >= todayKey && !excludeDays.has(key)) {
        // 周末不接单；不能只靠 addWorkDays 跳周末，否则排期日可能落在周六/周日
        const weekday = cursor.getUTCDay();
        if (weekday === 0 || weekday === 6) {
          cursor = this.addOneDay(cursor);
          continue;
        }

        const holiday = await isPublicHoliday(cursor);

        if (!holiday) {
          const schedule = await this.prisma.customRecipeSchedule.findUnique({
            where: { date: cursor },
          });

          // 还没有排期行 = 这天没人碰过，按"空着"算
          const bookable = schedule
            ? schedule.isAvailable && !schedule.isPublicHoliday
            : true;
          /**
           * 必须一次留出 N 个名额。
           * 原判断是 `bookedCount < capacity` —— 只剩 1 个空位也会把 5 份订单排进去，
           * 结果就是超卖；多份订单必须找"剩余 ≥ N"的整天。
           */
          const hasRoom = schedule
            ? schedule.bookedCount + unitsToBook <=
              (schedule.capacity ?? capacity)
            : unitsToBook <= capacity;

          if (bookable && hasRoom) {
            return cursor;
          }
        }
      }

      cursor = this.addOneDay(cursor);
    }

    return null;
  }

  /**
   * 事务内**条件式**抢 N 个排期名额（CAS）。
   *
   * 抢得到返回 true，抢不到返回 false（调用方换一天重试）。
   * 关键在最后那步 updateMany 带着"读到的 bookedCount 原值"做条件 ——
   * 两个并发请求里只有一个能把原值改成原值 +N，另一个 count 为 0 自然落败。
   */
  private async tryBookSlotTx(
    tx: any,
    date: Date,
    capacity: number,
    units = 1,
  ): Promise<boolean> {
    const unitsToBook = Number.isInteger(units) && units > 0 ? units : 1;
    const existing = await tx.customRecipeSchedule.findUnique({
      where: { date },
    });

    if (!existing) {
      // 首次访问该日期：落一条**带真实假期标记**的排期行。
      // skipDuplicates 兜住"两个请求同时首次访问"的唯一约束冲突。
      await tx.customRecipeSchedule.createMany({
        data: [
          {
            date,
            capacity,
            bookedCount: 0,
            isAvailable: true,
            isPublicHoliday: await isPublicHoliday(date),
          },
        ],
        skipDuplicates: true,
      });
    }

    const schedule = await tx.customRecipeSchedule.findUnique({
      where: { date },
    });

    if (!schedule || !schedule.isAvailable || schedule.isPublicHoliday) {
      return false;
    }

    if (
      schedule.bookedCount + unitsToBook >
      (schedule.capacity ?? capacity)
    ) {
      return false;
    }

    const updated = await tx.customRecipeSchedule.updateMany({
      where: {
        date,
        bookedCount: schedule.bookedCount,
        isAvailable: true,
        isPublicHoliday: false,
      },
      data: { bookedCount: { increment: unitsToBook } },
    });

    return updated.count === 1;
  }

  /**
   * Release a slot
   */
  async releaseSlot(date: Date, quantity = 1): Promise<void> {
    const units = this.resolveStoredRecipeQuantity(quantity);
    await this.prisma.customRecipeSchedule.updateMany({
      where: { date, bookedCount: { gte: units } },
      data: {
        bookedCount: { decrement: units },
      },
    });
  }

  /**
   * Add attachment
   */
  async addAttachment(orderId: string, data: any): Promise<any> {
    return await this.prisma.customRecipeAttachment.create({
      data: {
        orderId,
        ...data,
      },
    });
  }

  /**
   * Get attachments
   */
  async getAttachments(orderId: string): Promise<any[]> {
    return await this.prisma.customRecipeAttachment.findMany({
      where: { orderId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  /**
   * Delete attachment
   */
  /**
   * 删除附件（2026-10-25）。
   *
   * 必须连 COS 对象一起删：只删数据库记录会留下永久孤儿文件。
   * 顾客调用时传 `customerId` 校验归属；后台不传，沿用后台权限。
   * COS 删除失败就抛错、保留记录，让顾客重试，避免“页面删了、桶里还在”。
   */
  async deleteAttachment(id: string, customerId?: string): Promise<void> {
    const attachment = await this.prisma.customRecipeAttachment.findUnique({
      where: { id },
      include: { order: { select: { customerId: true } } },
    });
    if (!attachment) {
      throw new NotFoundException('附件不存在');
    }
    if (customerId && attachment.order.customerId !== customerId) {
      throw new ForbiddenException('无权删除此附件');
    }
    if (attachment.fileUrl) {
      await this.cosService.deleteImageByUrl(attachment.fileUrl);
    }
    await this.prisma.customRecipeAttachment.delete({
      where: { id },
    });
  }

  /**
   * 付款成功后，把这一单的**最终快照**写进狗狗档案（2026-10-19）。
   *
   * 为什么不在提交订单时写：
   * 提交后还有“待付款”阶段，顾客可能放弃支付、取消或超时；
   * 定制页里的文字/报告在付款前都只是草稿，不能提前改医疗档案。
   *
   * 幂等：`healthInfoSyncedAt` 已存在直接返回；报告草稿用
   * `allergy_report.source_key = 订单ID:序号` 唯一键防重。
   * 失败不回滚订单（钱已收），保留 `healthInfoSyncedAt = null` 供重试。
   */
  async syncPaidOrderToHealthProfile(
    orderIdOrId: string,
  ): Promise<{ synced: boolean; reason?: string }> {
    const ref = await this.resolveOrderRef(orderIdOrId);
    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    if (order.healthInfoSyncedAt) {
      return { synced: true };
    }

    if (!order.syncToHealthProfile) {
      return { synced: false, reason: '订单未要求同步档案' };
    }

    const syncable: CustomRecipeStatus[] = [
      CustomRecipeStatus.PAID,
      CustomRecipeStatus.IN_PROGRESS,
      CustomRecipeStatus.DELIVERED,
      CustomRecipeStatus.COMPLETED,
    ];
    if (!syncable.includes(order.status)) {
      return { synced: false, reason: '订单尚未付款，不能写档案' };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const drafts = Array.isArray(order.allergyReportDrafts)
          ? (order.allergyReportDrafts as any[])
          : [];

        for (const [index, draft] of drafts.entries()) {
          const sourceKey = `${order.id}:${index}`;
          const existingReport = await tx.allergyReport.findUnique({
            where: { sourceKey },
            select: { id: true },
          });
          if (existingReport) continue;

          const dateText = String(draft?.testDate || '').trim();
          const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateText)
            ? new Date(`${dateText}T00:00:00.000Z`)
            : null;
          const testDate =
            parsedDate && !Number.isNaN(parsedDate.getTime())
              ? parsedDate
              : null;
          /**
           * 2026-10-21：附件必须存 **COS key**，不能存媒体代理 URL。
           *
           * 代理 URL 的 token 只活在后端内存里，服务重启后正式报告的预览
           * 就变成“有张数、没图片”。草稿里已经有 attachmentKeys，
           * 转换时优先用它；只有老草稿没有 keys 时才退回 URL。
           */
          const attachmentKeys = Array.isArray(draft?.attachmentKeys)
            ? draft.attachmentKeys
                .map((item: unknown) => String(item || '').trim())
                .filter(Boolean)
            : [];
          const attachments =
            attachmentKeys.length > 0
              ? attachmentKeys
              : Array.isArray(draft?.attachments)
                ? draft.attachments
                    .map((item: unknown) => String(item || '').trim())
                    .filter(Boolean)
                : [];

          const report = await tx.allergyReport.create({
            data: {
              dogId: order.dogId,
              sourceKey,
              testDate,
              testMethod: normalizeTestMethod(draft?.testMethod),
              summary: draft?.summary
                ? String(draft.summary).trim().slice(0, 2000)
                : null,
              ocrText: draft?.ocrText
                ? String(draft.ocrText).trim().slice(0, 20000)
                : null,
              attachments,
            },
          });

          const results = normalizeResults(draft?.results);
          for (const result of results) {
            if (isNegativeLevel(result.level)) continue;

            const allergen = String(result.allergen || '').trim().slice(0, 40);
            if (!allergen) continue;

            const existing = await tx.allergyRecord.findUnique({
              where: {
                dogId_allergen: { dogId: order.dogId, allergen },
              },
            });

            if (existing) {
              await tx.allergyRecord.update({
                where: { id: existing.id },
                data: {
                  certainty: mapLevelToCertainty(result.level),
                  reportId: existing.reportId ?? report.id,
                  source: existing.source === 'OWNER' ? 'REPORT' : existing.source,
                },
              });
              continue;
            }

            await tx.allergyRecord.create({
              data: {
                dogId: order.dogId,
                allergen,
                notes: result.notes,
                certainty: mapLevelToCertainty(result.level),
                source: 'REPORT',
                reportId: report.id,
              },
            });
          }
        }

        await this.syncToHealthProfileTx(
          tx,
          order.dogId,
          order.allergies || [],
          order.medicalConditions || [],
          {
            preferredIngredients: order.preferredIngredients || [],
            dislikedIngredients: order.dislikedIngredients || [],
          },
        );
        // 2026-10-21：不再把订单文本写进旧字段 dog.allergyFoods；
        // 自由文本里能明确判断为单一过敏原的词，补进结构化 allergy_record。
        await this.syncSimpleAllergyTextTx(tx, order.dogId, order.allergyText);

        await tx.customRecipeOrder.updateMany({
          where: { id: order.id, healthInfoSyncedAt: null },
          data: { healthInfoSyncedAt: new Date() },
        });
      });

      return { synced: true };
    } catch (error: any) {
      /**
       * 并发重试可能撞上 source_key 唯一键：
       * 另一个请求已经建完报告并写入档案时，这里按“已同步”返回。
       */
      const latest = await this.prisma.customRecipeOrder.findUnique({
        where: { id: ref.id },
        select: { healthInfoSyncedAt: true },
      });
      if (latest?.healthInfoSyncedAt) {
        return { synced: true };
      }
      throw error;
    }
  }

  /**
   * Sync to health profile
   */
  async syncToHealthProfile(
    dogId: string,
    allergies: string[],
    medicalConditions: string[],
    dietPreferences: {
      preferredIngredients?: string[];
      dislikedIngredients?: string[];
    } = {},
  ): Promise<void> {
    await this.syncToHealthProfileTx(
      this.prisma,
      dogId,
      allergies,
      medicalConditions,
      dietPreferences,
    );
  }

  private async syncToHealthProfileTx(
    tx: any,
    dogId: string,
    allergies: string[],
    medicalConditions: string[],
    dietPreferences: {
      preferredIngredients?: string[];
      dislikedIngredients?: string[];
    } = {},
  ): Promise<void> {
    /**
     * 同步过敏史 → 结构化过敏记录。
     *
     * ⚠️ 这里曾经写坏了：`AllergyRecord` 只有 `allergen` / `notes` 两个业务字段
     * （没有严重程度、过敏类型、发现日期、确认方），而代码却写入了那 4 个
     * 不存在的列 —— Prisma 直接抛 `Unknown argument`，**整个下单事务回滚**。
     *
     * 而小程序端的 `syncToHealthProfile` 恒为 true，等于：
     * **顾客只要填了一个过敏原，就永远提交不了定制单**（已实测复现 500）。
     *
     * 现在只写真实存在的字段，并把来源记进 notes 留痕；
     * 同时不再替顾客臆断"中度过敏 / 食物型 / 主人确认"这类医学判断 ——
     * 数据模型里本来也没有地方承载它们。
     */
    for (const allergen of allergies) {
      const existing = await tx.allergyRecord.findFirst({
        where: { dogId, allergen },
      });

      if (!existing) {
        await tx.allergyRecord.create({
          data: {
            dogId,
            allergen,
            notes: '顾客提交定制需求时填写',
          },
        });
      }
    }

    /**
     * 同步疾病史 → 结构化疾病记录。
     *
     * 2026-09-28 修复（老板拍板的决策 5）：这里原先写死 `status: 'CHRONIC'`，
     * 也就是**系统替顾客/兽医断言"这是慢性病"**。生产上已经真实发生过
     * （一条"肠胃敏感"被标成慢性）。而"肠胃敏感是不是慢性病"只有兽医能判断。
     *
     * 现在一律标为 PENDING_CONFIRMATION（待确认），
     * 来源写进 chiefComplaint 留痕，由顾客/客服在「健康管理」页确认成实际情况。
     */
    for (const condition of medicalConditions) {
      const existing = await tx.medicalRecord.findFirst({
        where: { dogId, diagnosis: condition },
      });

      if (!existing) {
        await tx.medicalRecord.create({
          data: {
            dogId,
            visitDate: new Date(),
            chiefComplaint: '定制食谱时提供',
            diagnosis: condition,
            status: 'PENDING_CONFIRMATION',
          },
        });
      }
    }

    /**
     * 同步饮食偏好 → 档案（2026-10-02 补）。
     *
     * 背景：老板定了"饮食偏好只在定制食谱时填写"，健康管理页的编辑入口已下线。
     * 但下单时只把偏好存进了订单、**没有回写档案** ——
     * 于是 AI 健康分析里的"饮食偏好"、营养师侧的标签派生读到的一直是空值，等于断源。
     * 这里补两条路：
     *   · dog.preferredFoods / pickyFoods（自由文本，分析与分享在读）
     *   · dog_diet_preference（结构化「爱吃/不吃」+ 变更历史，营养师端在读）
     *
     * 写法是**并入**而不是覆盖：顾客以前填过的、这次没提到的都留着。
     */
    await this.mergeDietPreferencesTx(
      tx,
      dogId,
      dietPreferences.preferredIngredients || [],
      dietPreferences.dislikedIngredients || [],
    );
  }

  /**
   * 把订单过敏文本里**简单、无歧义**的过敏原补进结构化档案（2026-10-21）。
   *
   * 背景：顾客侧已改为一个自由文本框，订单快照保留原文
   * （`custom_recipe_order.allergy_text`），但 `dog.allergyFoods`
   * 是旧文本字段，新订单不再写入。为避免顾客填的简单文本
   * （“鸭、猪”）完全到不了档案，这里做一次保守转换：
   *   · 只收单一过敏原，报告原文/整句描述一律跳过；
   *   · 与订单数组、报告结论、档案已有记录重复的不再建；
   *   · 同一段文本内忽略大小写去重；
   *   · 来源记 OWNER、可信度记 SUSPECTED，notes 标明同步日期，方便回溯。
   */
  private async syncSimpleAllergyTextTx(
    tx: any,
    dogId: string,
    allergyText?: string | null,
  ): Promise<void> {
    const tokens = extractSimpleAllergyTokens(allergyText);
    if (tokens.length === 0) return;

    const syncDate = TimezoneUtil.toShanghaiDateString(new Date());
    for (const allergen of tokens) {
      const existing = await tx.allergyRecord.findFirst({
        where: { dogId, allergen },
        select: { id: true },
      });
      if (existing) continue;

      await tx.allergyRecord.create({
        data: {
          dogId,
          allergen,
          notes: `从定制订单过敏文本同步（${syncDate}）`,
          certainty: 'SUSPECTED',
          source: 'OWNER',
        },
      });
    }
  }

  /** 把这次的饮食偏好并进档案（自由文本 + 结构化表），不覆盖旧内容 */
  private async mergeDietPreferencesTx(
    tx: any,
    dogId: string,
    preferred: string[],
    disliked: string[],
  ): Promise<void> {
    const clean = (list: string[]) =>
      Array.from(
        new Set(
          (list || []).map((item) => String(item || '').trim()).filter(Boolean),
        ),
      );

    const liked = clean(preferred);
    const notLiked = clean(disliked);

    if (liked.length === 0 && notLiked.length === 0) {
      return;
    }

    const dog = await tx.dog.findUnique({
      where: { id: dogId },
      select: { preferredFoods: true, pickyFoods: true },
    });

    const mergeText = (existing: string | null, additions: string[]) => {
      const parts = String(existing || '')
        .split(/[、,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

      for (const item of additions) {
        if (!parts.includes(item)) {
          parts.push(item);
        }
      }

      return parts.join('、');
    };

    if (dog) {
      await tx.dog.update({
        where: { id: dogId },
        data: {
          ...(liked.length > 0
            ? { preferredFoods: mergeText(dog.preferredFoods, liked) }
            : {}),
          ...(notLiked.length > 0
            ? { pickyFoods: mergeText(dog.pickyFoods, notLiked) }
            : {}),
        },
      });
    }

    // 结构化偏好：爱吃 = LIKED、不爱吃 = DISLIKED；已存在的不重复加、也不记变更
    for (const [kind, items] of [
      ['LIKED', liked],
      ['DISLIKED', notLiked],
    ] as const) {
      for (const foodName of items) {
        const existing = await tx.dogDietPreference.findUnique({
          where: { dogId_kind_foodName: { dogId, kind, foodName } },
        });

        if (existing) {
          continue;
        }

        await tx.dogDietPreference.create({
          data: { dogId, kind, foodName, source: 'CUSTOM_RECIPE' },
        });
        await tx.dogDietPreferenceChange.create({
          data: {
            dogId,
            kind,
            foodName,
            action: 'ADDED',
            changedBy: 'CUSTOM_RECIPE',
          },
        });
      }
    }
  }

  /**
   * 备注区附件的**草稿上传**（2026-10-19）。
   *
   * 备注附件在提交订单前就要能上传，而订单此时还不存在。
   * 所以这里只把文件传到 `custom-recipe-attachments/` 并返回 url/key，
   * **不建订单附件记录、不写狗狗档案**；提交时 URL 随订单保存。
   */
  /**
   * 给本地草稿里已上传的附件重新签发预览 URL。
   *
   * 媒体代理 token 只在当前进程有效，后端重启后旧 URL 会 404；
   * 前端手里有 COS key，刷新页面时用这个接口换新 URL。
   */
  async signDraftAttachmentKeys(
    keys: string[],
  ): Promise<Array<{ key: string; url: string }>> {
    return (keys || [])
      .map((key) => String(key || '').trim())
      .filter((key) => key.startsWith('custom-recipe-sensitive-attachments/'))
      .map((key) => ({
        key,
        url: this.cosService.getSensitiveMediaUrl(key, 86400) || '',
      }));
  }

  async uploadDraftAttachment(
    file: Express.Multer.File,
  ): Promise<{ url: string; key: string }> {
    const result = await this.cosService.uploadImage(
      file,
      file.originalname,
      'custom-recipe-sensitive-attachments',
    );
    // 私有目录：上传响应给短时签名 URL 供预览；数据库/订单后续用 key 重新签发
    const signedUrl =
      this.cosService.getSensitiveMediaUrl(result.key, 86400) || result.url;
    return { url: signedUrl, key: result.key };
  }

  /**
   * Upload attachment
   */
  async uploadAttachment(file: Express.Multer.File, orderId: string) {
    const result = await this.cosService.uploadImage(
      file,
      file.originalname,
      'custom-recipe-attachments',
    );

    const attachment = await this.addAttachment(orderId, {
      fileName: file.originalname,
      fileUrl: result.url,
      fileSize: file.size,
      fileType: this.getFileType(file.originalname),
    });

    const signedUrl =
      this.cosService.getSensitiveMediaUrl(attachment.fileUrl, 86400) ||
      attachment.fileUrl;
    return { ...attachment, fileUrl: signedUrl };
  }

  private getFileType(filename: string): CustomAttachmentType {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      return CustomAttachmentType.MEDICAL_REPORT;
    }
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) {
      return CustomAttachmentType.IMAGE;
    }
    return CustomAttachmentType.OTHER;
  }

  /**
   * Get dog health summary
   */
  /**
   * 档案已有信息汇总 —— 供定制页"带出档案已有信息"用（老板拍板的决策 3）。
   *
   * 2026-09-28 补齐：除过敏/疾病/体检/体重趋势外，再加上
   *   · vaccines      疫苗记录（"健康管理"板块 2026-09-27 才有的新数据）
   *   · preferredFoods / pickyFoods  口味偏好（饮食偏好要带出上次填的）
   *   · bcsScore / currentWeightKg   体况与体重（用于"体况只给建议"的文案）
   */
  async getDogHealthSummary(dogId: string) {
    const [
      allergies,
      medicalRecords,
      checkups,
      weightRecords,
      vaccines,
      dog,
    ] = await Promise.all([
        this.prisma.allergyRecord.findMany({
          where: { dogId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.medicalRecord.findMany({
          where: { dogId },
          orderBy: { visitDate: 'desc' },
          take: 5,
        }),
        this.prisma.checkupRecord.findMany({
          where: { dogId },
          orderBy: { checkupDate: 'desc' },
          take: 3,
        }),
        this.prisma.weightRecord.findMany({
          where: { dogId },
          orderBy: { recordDate: 'desc' },
          take: 5,
        }),
        this.prisma.vaccineRecord.findMany({
          where: { dogId },
          orderBy: { vaccinationDate: 'desc' },
          take: 10,
        }),
        this.prisma.dog.findUnique({
          where: { id: dogId },
          select: {
            currentWeightKg: true,
            bcsScore: true,
            activityLevel: true,
            preferredFoods: true,
            pickyFoods: true,
            allergyFoods: true,
          },
        }),
      ]);

    return {
      allergies: allergies.map((a) => a.allergen),
      medicalConditions: medicalRecords.map((m) => m.diagnosis),
      /**
       * 需求 2.3.3「健康档案」只读块：最近就诊要显示「日期 + 诊断」。
       * 原来的 medicalConditions 只有诊断名，页面无法显示日期（2026-10-19）。
       */
      recentVisits: medicalRecords.map((m) => ({
        id: m.id,
        visitDate: m.visitDate,
        diagnosis: m.diagnosis,
      })),
      recentCheckups: checkups,
      weightTrend: weightRecords,
      vaccines: vaccines.map((v) => ({
        id: v.id,
        vaccineName: v.vaccineName,
        vaccinationDate: v.vaccinationDate,
      })),
      currentWeightKg: dog?.currentWeightKg ?? null,
      bcsScore: dog?.bcsScore ?? null,
      activityLevel: dog?.activityLevel ?? null,
      preferredFoods: dog?.preferredFoods ?? null,
      pickyFoods: dog?.pickyFoods ?? null,
      allergyFoods: dog?.allergyFoods ?? null,
    };
  }

  /**
   * Analyze dog preferences from order history
   */
  async analyzeDogPreferences(dogId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        dogId,
        status: { in: ['COMPLETED', 'SHIPPED'] },
      },
      include: {
        items: {
          include: {
            order: true,
          },
        },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    const preferredIngredients = new Set<string>();
    const dislikedIngredients = new Set<string>();

    // Analyze recipe snapshots from orders
    // This is a simplified version - in production, you'd analyze actual ingredients

    return {
      preferredIngredients: Array.from(preferredIngredients),
      dislikedIngredients: Array.from(dislikedIngredients),
    };
  }
}
