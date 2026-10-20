/**
 * 食谱定制配置 Application Service
 *
 * 单例配置：定制费、交付工作日数、每日接单上限、支付超时。
 *
 * 为什么单独一张表（而不是并进 GlobalConfig）：
 * 定制是独立产品线（顶层设计 v4 产品线 ③），它的价格与产能参数不该和
 * 鲜食、补剂共用一个值 —— 否则调一边会影响另一边。
 * 与 SupplementShopConfig 的做法保持一致。
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';

export const CUSTOM_RECIPE_CONFIG_ID = 'singleton';

/** 定制费默认 ¥300 */
export const DEFAULT_CUSTOM_RECIPE_FEE = 300;
/** 交付周期默认 3 个工作日 */
export const DEFAULT_CUSTOM_RECIPE_WORK_DAYS = 3;
/** 每日接单上限默认 4 单 */
export const DEFAULT_CUSTOM_RECIPE_DAILY_CAPACITY = 4;
/** 支付超时默认 30 分钟；0 = 不自动关单 */
export const DEFAULT_CUSTOM_RECIPE_PAYMENT_TIMEOUT_MINUTES = 30;

// ===== 2026-10-16 批次 1.4 新增的默认值 =====
// 这些原先散落在代码里写死（有的还写死在两处），现在统一从这张表读。

/** 每日交付上限默认 4 份 */
export const DEFAULT_CUSTOM_RECIPE_DAILY_DELIVERY_CAPACITY = 4;
/** 售后受理窗口默认 30 天 */
export const DEFAULT_CUSTOM_RECIPE_AFTERSALE_WINDOW_DAYS = 30;
/** 免费调整次数默认 1 次 */
export const DEFAULT_CUSTOM_RECIPE_FREE_REVISION_COUNT = 1;
/** 免费调整时间窗默认 7 天 */
export const DEFAULT_CUSTOM_RECIPE_FREE_REVISION_WINDOW_DAYS = 7;
/** 交付后自动完成默认 3 天（老板 2026-10-16 定） */
export const DEFAULT_CUSTOM_RECIPE_AUTO_COMPLETE_DAYS = 3;
/** 是否要求顾客确认收到，默认要求 */
export const DEFAULT_CUSTOM_RECIPE_REQUIRE_CUSTOMER_CONFIRM = true;
/** 交付物默认包含哪几样（取值来自选项集 custom_recipe_delivery_item） */
export const DEFAULT_CUSTOM_RECIPE_DELIVERY_ITEM_CODES = [
  'RECIPE',
  'SHOPPING_SOP',
  'NUTRITION_REPORT',
];
/** 附件张数上限默认 9 张 */
export const DEFAULT_CUSTOM_RECIPE_ATTACHMENT_MAX_COUNT = 9;
/** 附件大小上限默认 10MB（原先在两个控制器里各写一遍） */
export const DEFAULT_CUSTOM_RECIPE_ATTACHMENT_MAX_SIZE_MB = 10;
/** 后台手工建食谱的默认营养标准 */
export const DEFAULT_CUSTOM_RECIPE_NUTRITION_STANDARD = 'FEDIAF_2025';
/** 默认能量密度 kcal/kg */
export const DEFAULT_CUSTOM_RECIPE_ENERGY_DENSITY_KCAL_PER_KG = 3200;
/**
 * 生产损耗率默认值。
 *
 * ⚠️ **口径冲突未决**：设计器发布路径用 1.05、后台手工建食谱用 1.07、
 * 小程序 DIY 按 7% 展示给顾客。这里取 1.07（与顾客看到的 7% 一致），
 * 但**尚未改动那两处写死的取值** —— 改取值会改变生产用料，需老板拍板。
 */
export const DEFAULT_CUSTOM_RECIPE_PRODUCTION_LOSS_RATE = 1.07;
/** 默认工时（小时） */
export const DEFAULT_CUSTOM_RECIPE_LABOR_HOURS = 2;
/** 排期往前找多少天 */
export const DEFAULT_CUSTOM_RECIPE_SCHEDULE_LOOKAHEAD_DAYS = 45;
/** 占位冲突最多换几天重试 */
export const DEFAULT_CUSTOM_RECIPE_SLOT_RETRY_TIMES = 5;
/** 定制单业务编号前缀 */
export const DEFAULT_CUSTOM_RECIPE_ORDER_NO_PREFIX = 'CR';

// ===== 2026-10-20 多份购买 · 第一阶段：价格与配置 =====

/** 多份购买开关默认关闭：第二阶段（多份设计/一次性交付）上线前不得开启 */
export const DEFAULT_MULTI_RECIPE_ENABLED = false;
/** 单笔最多份数的业务硬上限：后台只能调低，不能配到 5 以上 */
export const MAX_MULTI_RECIPE_QUANTITY = 5;
/** 单笔最多份数默认值（也是存量/坏值时的兜底值） */
export const DEFAULT_MAX_RECIPE_QUANTITY = 5;
/** 最高折扣：20%。后台不能配置超过这个值 */
export const MAX_MULTI_RECIPE_DISCOUNT_RATE = 0.2;
/**
 * 优惠档位必须覆盖的份数：2/3/4/5 四档齐全。
 *
 * 计划 Review Focus 明确要求「缺少档位时，后台保存必须失败」——
 * 少一档会让某个份数静默变成"无优惠"，顾客看到的价格与预期不符。
 */
const REQUIRED_MULTI_RECIPE_DISCOUNT_QUANTITIES = [2, 3, 4, 5];
/** 每日设计工时默认 480 分钟（8 小时） */
export const DEFAULT_DAILY_DESIGN_MINUTES = 480;
/** 每份食谱默认设计工时 96 分钟（1.6 小时） */
export const DEFAULT_MINUTES_PER_RECIPE = 96;

/** 多份优惠的一档：quantity 份享 discountRate 的整单折扣 */
export interface MultiRecipeDiscountTier {
  quantity: number;
  discountRate: number;
  label: string;
}

/**
 * 默认多份优惠档位（老板 2026-10-20 定）。
 *
 * 为什么放在代码里而不是只靠数据库默认值：
 *   · 迁移后存量配置行的 `multi_recipe_discounts` 是 `[]`，
 *     **必须能读出默认四档**，否则顾客看到"多份无优惠"；
 *   · 后台页面、报价、配置读取的默认值必须是同一份数据，
 *     不能三处各写一遍。
 */
export const DEFAULT_MULTI_RECIPE_DISCOUNTS: readonly MultiRecipeDiscountTier[] =
  [
    { quantity: 2, discountRate: 0.05, label: '2 份享 95 折' },
    { quantity: 3, discountRate: 0.08, label: '3 份享 92 折' },
    { quantity: 4, discountRate: 0.1, label: '4 份享 9 折' },
    { quantity: 5, discountRate: 0.12, label: '5 份享 88 折' },
  ];

/** 复制默认档位，避免调用方改到共享常量 */
function cloneDefaultDiscountTiers(): MultiRecipeDiscountTier[] {
  return DEFAULT_MULTI_RECIPE_DISCOUNTS.map((tier) => ({ ...tier }));
}

export interface CustomRecipeConfigDto {
  /** 定制费（元） */
  feeAmount: number;
  /** 交付周期（工作日） */
  deliveryWorkDays: number;
  /** 每日接单上限 */
  dailyCapacity: number;
  /** 支付超时（分钟）；0 = 不自动关单 */
  paymentTimeoutMinutes: number;

  // ===== 批次 1.4 新增（原先写死在代码里）=====
  /** 每日交付上限（份） */
  dailyDeliveryCapacity: number;
  /** 售后受理窗口（天） */
  aftersaleWindowDays: number;
  /** 免费调整次数 */
  freeRevisionCount: number;
  /** 免费调整时间窗（天） */
  freeRevisionWindowDays: number;
  /** 售后单超多少小时未处理要标红（2026-10-18 · V44） */
  aftersaleOverdueHours: number;
  /** 交付前是否允许无理由全额退款（2026-10-18 · V24） */
  allowRefundBeforeDelivery: boolean;
  /** 站内消息中心总开关（2026-10-18） */
  messageCenterEnabled: boolean;
  /** 交付后自动完成天数 */
  autoCompleteDays: number;
  /** 是否要求顾客确认收到 */
  requireCustomerConfirm: boolean;
  /** 交付物包含哪几样（选项集 custom_recipe_delivery_item 的码） */
  deliveryItemCodes: string[];
  /** 附件张数上限 */
  attachmentMaxCount: number;
  /** 附件大小上限（MB） */
  attachmentMaxSizeMb: number;
  /** 默认营养标准 */
  defaultNutritionStandard: string;
  /** 默认能量密度 kcal/kg */
  defaultEnergyDensityKcalPerKg: number;
  /** 生产损耗率（⚠️ 口径冲突未决，见常量注释） */
  productionLossRate: number;
  /** 默认工时（小时） */
  defaultLaborHours: number;
  /** 排期往前找多少天 */
  scheduleLookaheadDays: number;
  /** 占位冲突最多重试几天 */
  slotRetryTimes: number;
  /** 业务编号前缀 */
  orderNoPrefix: string;

  // ===== 2026-10-20 多份购买 · 第一阶段 =====
  /** 是否启用多份购买（默认关闭，第二阶段前不得开启） */
  multiRecipeEnabled: boolean;
  /** 单笔最多份数：1–5，5 是业务硬上限 */
  maxRecipeQuantity: number;
  /** 多份优惠档位（2–5 份；1 份不折扣） */
  multiRecipeDiscounts: MultiRecipeDiscountTier[];
  /** 每日设计工时（分钟），用于计算每日产能 */
  dailyDesignMinutes: number;
  /** 每份食谱默认设计工时（分钟），用于计算交付日期 */
  minutesPerRecipe: number;

  updatedAt: string | null;
}

/** 对外公开的部分（小程序在未登录时也要能看到价格） */
export interface PublicCustomRecipeConfigDto {
  feeAmount: number;
  deliveryWorkDays: number;
  /** 售后单超多少小时要提醒（顾客侧用来显示"我们多久内响应"）· 2026-10-18 */
  aftersaleOverdueHours: number;
  /** 交付前是否允许无理由全额退款 · 2026-10-18 · V24 */
  allowRefundBeforeDelivery: boolean;
  /** 站内消息中心开关 · 2026-10-18 */
  messageCenterEnabled: boolean;
  /**
   * 支付超时（分钟）；0 = 不自动关单。
   *
   * 2026-10-04 加入公开配置：订单超时会被自动取消，但此前这个值只存在于后台，
   * 小程序从不提示，顾客付款前完全不知道有时限，被关单后一头雾水。
   */
  paymentTimeoutMinutes: number;
  /** 订阅消息模板 ID；未配置时为 null，小程序据此跳过申请 */
  orderNotifyTemplateId: string | null;

  // ===== 批次 1.4：顾客确实需要知道的几个 =====
  //
  // ⚠️ 这张公开清单是**白名单**，不是"把配置全发出去"。
  // 公开的理由都写在每一项上；没有理由的不进（见 assertPublicWhitelist 的测试）。
  /** 附件张数上限 —— 小程序要据此限制上传 */
  attachmentMaxCount: number;
  /** 交付后几天自动完成 —— 顾客要知道"几天内确认" */
  autoCompleteDays: number;
  /** 是否要求确认收货 —— 决定小程序是否显示「确认收到」 */
  requireCustomerConfirm: boolean;
  /** 售后窗口（天）—— 顾客要知道还能不能提售后 */
  aftersaleWindowDays: number;
  /** 免费调整次数与时间窗 —— 售后页要写明 */
  freeRevisionCount: number;
  freeRevisionWindowDays: number;

  // ===== 2026-10-20 多份购买 =====
  //
  // 只放顾客下单需要的三项；设计工时是内部产能参数，不进公开白名单。
  /** 多份购买开关：决定小程序是否显示份数选择器 */
  multiRecipeEnabled: boolean;
  /** 最多可选份数：小程序步进器的上限 */
  maxRecipeQuantity: number;
  /** 优惠档位：确认页展示"几份享几折"的文案 */
  multiRecipeDiscounts: MultiRecipeDiscountTier[];
}

export type UpdateCustomRecipeConfigDto = Partial<
  Omit<CustomRecipeConfigDto, 'updatedAt'>
>;

@Injectable()
export class CustomRecipeConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** 读取配置；首次访问自动建单例并落默认值 */
  async getConfig(): Promise<CustomRecipeConfigDto> {
    const existing = await this.prisma.customRecipeConfig.findUnique({
      where: { id: CUSTOM_RECIPE_CONFIG_ID },
    });

    if (existing) {
      return this.toDto(existing);
    }

    const created = await this.prisma.customRecipeConfig.create({
      data: { id: CUSTOM_RECIPE_CONFIG_ID },
    });
    return this.toDto(created);
  }

  /** 小程序侧只需要价格与交付周期，不暴露接单上限等内部参数 */
  async getPublicConfig(): Promise<PublicCustomRecipeConfigDto> {
    const config = await this.getConfig();
    return {
      feeAmount: config.feeAmount,
      deliveryWorkDays: config.deliveryWorkDays,
      /**
       * 支付时限要给到小程序（2026-10-04）：顾客必须知道"多久不付会被自动取消"，
       * 否则订单被关掉时他会以为是系统出故障。
       */
      paymentTimeoutMinutes: config.paymentTimeoutMinutes,
      /**
       * 定制订单状态通知的订阅消息模板 ID（2026-09-28）。
       *
       * 小程序必须在**用户点击时**调用 wx.requestSubscribeMessage 才能收到
       * 订阅消息；模板 ID 由环境变量提供。未配置时返回 null，
       * 小程序就跳过申请（而不是拿空 ID 去调、必然失败）。
       */
      orderNotifyTemplateId:
        process.env.WECHAT_TEMPLATE_CUSTOM_RECIPE_ORDER || null,
      attachmentMaxCount: config.attachmentMaxCount,
      autoCompleteDays: config.autoCompleteDays,
      requireCustomerConfirm: config.requireCustomerConfirm,
      aftersaleWindowDays: config.aftersaleWindowDays,
      /**
       * 这三个是**给顾客看的政策**，不是内部参数 —— 所以放公开 DTO 里：
       *   · 交付前可无理由退 → 下单页要说清楚
       *   · 售后超时小时数 → 顾客等多久该催，这是承诺
       *   · 消息中心开关 → 关了就藏入口
       */
      aftersaleOverdueHours: config.aftersaleOverdueHours,
      allowRefundBeforeDelivery: config.allowRefundBeforeDelivery,
      messageCenterEnabled: config.messageCenterEnabled,
      freeRevisionCount: config.freeRevisionCount,
      freeRevisionWindowDays: config.freeRevisionWindowDays,
      /**
       * 2026-10-20 多份购买：小程序确认页据此决定
       * 「是否显示份数选择器 / 最多几份 / 展示哪几档优惠」。
       * 设计工时（dailyDesignMinutes / minutesPerRecipe）是内部参数，不公开。
       */
      multiRecipeEnabled: config.multiRecipeEnabled,
      maxRecipeQuantity: config.maxRecipeQuantity,
      multiRecipeDiscounts: config.multiRecipeDiscounts,
    };
  }

  async updateConfig(
    dto: UpdateCustomRecipeConfigDto,
  ): Promise<CustomRecipeConfigDto> {
    const current = await this.getConfig();
    this.assertValid(dto, current);

    const updated = await this.prisma.customRecipeConfig.upsert({
      where: { id: CUSTOM_RECIPE_CONFIG_ID },
      create: { id: CUSTOM_RECIPE_CONFIG_ID, ...this.toWriteData(dto) },
      update: this.toWriteData(dto),
    });

    return this.toDto(updated);
  }

  /**
   * 校验规则。
   */
  private assertValid(
    dto: UpdateCustomRecipeConfigDto,
    current: CustomRecipeConfigDto,
  ): void {
    if (dto.feeAmount !== undefined) {
      if (!Number.isFinite(dto.feeAmount) || dto.feeAmount < 0) {
        throw new BadRequestException('定制费不能为负数');
      }
      if (dto.feeAmount > 100000) {
        throw new BadRequestException('定制费不能超过 100000 元');
      }
    }

    const nextFee = dto.feeAmount ?? current.feeAmount;

    /**
     * 2026-10-04：定制费为 0 时**顾客根本付不了款** ——
     * 微信下单接口要求金额 ≥ 1 分，订单只会卡在"待付款"，30 分钟后被自动取消。
     * 与其让顾客撞上这个死路，不如不让后台保存这个值。
     *
     * 这里判的是 nextFee（含库里已有的历史值），所以即使某天线上已经是 0，
     * 下一次保存也必须先把它改回正数才能过。
     */
    if (nextFee === 0) {
      throw new BadRequestException(
        '定制费不能为 0：为 0 时顾客无法发起微信支付，订单只会超时被取消。',
      );
    }

    if (dto.deliveryWorkDays !== undefined) {
      const value = dto.deliveryWorkDays;
      // 上限 60 个工作日是防呆：再长就不叫"定制周期"了，只会让顾客流失
      if (!Number.isInteger(value) || value < 1 || value > 60) {
        throw new BadRequestException('交付周期必须是 1~60 的整数（工作日）');
      }
    }

    if (dto.dailyCapacity !== undefined) {
      const value = dto.dailyCapacity;
      if (!Number.isInteger(value) || value < 1 || value > 200) {
        throw new BadRequestException('每日接单上限必须是 1~200 的整数');
      }
    }

    if (dto.paymentTimeoutMinutes !== undefined) {
      const value = dto.paymentTimeoutMinutes;
      // 上限 24 小时，与补剂订单同一口径
      if (!Number.isInteger(value) || value < 0 || value > 1440) {
        throw new BadRequestException(
          '支付超时必须是 0~1440 的整数（分钟）；0 表示不自动关单',
        );
      }
    }

    // ===== 批次 1.4 新增参数的校验 =====

    if (dto.dailyDeliveryCapacity !== undefined) {
      const value = dto.dailyDeliveryCapacity;
      // 上限 200 与「每日接单上限」一致
      if (!Number.isInteger(value) || value < 1 || value > 200) {
        throw new BadRequestException('每日交付上限必须是 1~200 的整数');
      }
    }

    if (dto.aftersaleWindowDays !== undefined) {
      const value = dto.aftersaleWindowDays;
      // 上限 365 天：再长就不叫"售后窗口"了，等于无限责任
      if (!Number.isInteger(value) || value < 0 || value > 365) {
        throw new BadRequestException('售后窗口必须是 0~365 的整数（天）');
      }
    }

    if (dto.aftersaleOverdueHours !== undefined) {
      const value = dto.aftersaleOverdueHours;
      // 下限 1 小时：0 意味着"一提交就标红"，没有意义；上限 720（30 天）够长了
      if (!Number.isInteger(value) || value < 1 || value > 720) {
        throw new BadRequestException('售后超时提醒必须是 1~720 的整数（小时）');
      }
    }

    if (dto.freeRevisionCount !== undefined) {
      const value = dto.freeRevisionCount;
      if (!Number.isInteger(value) || value < 0 || value > 20) {
        throw new BadRequestException('免费调整次数必须是 0~20 的整数');
      }
    }

    if (dto.freeRevisionWindowDays !== undefined) {
      const value = dto.freeRevisionWindowDays;
      /**
       * 免费调整窗口**不能超过**售后窗口 —— 否则会出现
       * "已经过了免费期、但还能提售后"的矛盾说明，客服与顾客都说不清。
       */
      const nextAftersaleWindow =
        dto.aftersaleWindowDays ?? current.aftersaleWindowDays;
      if (!Number.isInteger(value) || value < 0 || value > 365) {
        throw new BadRequestException('免费调整窗口必须是 0~365 的整数（天）');
      }
      if (value > nextAftersaleWindow) {
        throw new BadRequestException(
          `免费调整窗口（${value} 天）不能超过售后窗口（${nextAftersaleWindow} 天）`,
        );
      }
    }

    if (dto.autoCompleteDays !== undefined) {
      const value = dto.autoCompleteDays;
      // 上限 90 天：再长顾客会一直"待确认"，后台待办清不掉
      if (!Number.isInteger(value) || value < 1 || value > 90) {
        throw new BadRequestException(
          '交付后自动完成天数必须是 1~90 的整数（天）',
        );
      }
    }

    if (dto.deliveryItemCodes !== undefined) {
      const codes = dto.deliveryItemCodes;
      if (!Array.isArray(codes) || codes.some((code) => typeof code !== 'string')) {
        throw new BadRequestException('交付物清单必须是字符串数组');
      }
      /**
       * 至少要有一样 —— 一样都没有的"交付"对顾客是空的，
       * 但后台会显示"已交付"，属于会挨投诉的状态。
       */
      if (codes.length === 0) {
        throw new BadRequestException(
          '交付物至少要留一样；一样都不给的话顾客收到的是空的',
        );
      }
    }

    if (dto.attachmentMaxCount !== undefined) {
      const value = dto.attachmentMaxCount;
      if (!Number.isInteger(value) || value < 1 || value > 30) {
        throw new BadRequestException('附件张数上限必须是 1~30 的整数');
      }
    }

    if (dto.attachmentMaxSizeMb !== undefined) {
      const value = dto.attachmentMaxSizeMb;
      // 上限 50MB：微信小程序单次上传本身就有限制，配太大也没用
      if (!Number.isInteger(value) || value < 1 || value > 50) {
        throw new BadRequestException('附件大小上限必须是 1~50 的整数（MB）');
      }
    }

    if (dto.defaultNutritionStandard !== undefined) {
      if (!dto.defaultNutritionStandard.trim()) {
        throw new BadRequestException('默认营养标准不能为空');
      }
    }

    if (dto.defaultEnergyDensityKcalPerKg !== undefined) {
      const value = dto.defaultEnergyDensityKcalPerKg;
      if (!Number.isInteger(value) || value < 500 || value > 9000) {
        throw new BadRequestException(
          '默认能量密度必须是 500~9000 的整数（kcal/kg）',
        );
      }
    }

    if (dto.productionLossRate !== undefined) {
      const value = dto.productionLossRate;
      /**
       * 损耗率是 ≥1 的**系数**（1.07 = 损耗 7%）。
       * 必须 ≥1：小于 1 意味着"做出来比投料还多"，物理上不成立。
       * 上限 2 是防呆：超过 100% 的损耗只可能是填错了。
       */
      if (!Number.isFinite(value) || value < 1 || value > 2) {
        throw new BadRequestException(
          '生产损耗率必须是 1~2 的系数（1.07 表示损耗 7%）',
        );
      }
    }

    if (dto.defaultLaborHours !== undefined) {
      const value = dto.defaultLaborHours;
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new BadRequestException('默认工时必须是 0~100 的数字（小时）');
      }
    }

    if (dto.scheduleLookaheadDays !== undefined) {
      const value = dto.scheduleLookaheadDays;
      if (!Number.isInteger(value) || value < 7 || value > 365) {
        throw new BadRequestException('排期往前找必须是 7~365 的整数（天）');
      }
    }

    if (dto.slotRetryTimes !== undefined) {
      const value = dto.slotRetryTimes;
      if (!Number.isInteger(value) || value < 1 || value > 30) {
        throw new BadRequestException('占位重试次数必须是 1~30 的整数');
      }
    }

    if (dto.orderNoPrefix !== undefined) {
      const value = dto.orderNoPrefix;
      /**
       * 前缀会拼进业务编号（如 CR20261016-0001），并被顾客看到、
       * 被客服拿去查单 —— 限定成大写字母，长度 ≤8，避免出现
       * 带空格/符号的编号让人没法照着念。
       */
      if (!/^[A-Z]{1,8}$/.test(value)) {
        throw new BadRequestException(
          '业务编号前缀只能是大写字母，长度 1~8（例如 CR）',
        );
      }
    }

    // ===== 2026-10-20 多份购买 =====

    if (
      dto.multiRecipeEnabled !== undefined &&
      typeof dto.multiRecipeEnabled !== 'boolean'
    ) {
      throw new BadRequestException('多份购买开关必须是布尔值');
    }

    if (dto.maxRecipeQuantity !== undefined) {
      const value = dto.maxRecipeQuantity;
      /**
       * 5 是**业务硬上限**，不是"建议值"：设计文档要求后台只能在 1–5
       * 之间调低当前上限，永远不能配到 6。
       */
      if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > MAX_MULTI_RECIPE_QUANTITY
      ) {
        throw new BadRequestException(
          `最多份数必须是 1~${MAX_MULTI_RECIPE_QUANTITY} 的整数（业务硬上限为 ${MAX_MULTI_RECIPE_QUANTITY}）`,
        );
      }
    }

    if (dto.multiRecipeDiscounts !== undefined) {
      this.assertValidMultiRecipeDiscounts(dto.multiRecipeDiscounts);
    }

    if (dto.dailyDesignMinutes !== undefined) {
      const value = dto.dailyDesignMinutes;
      if (!Number.isInteger(value) || value < 1) {
        throw new BadRequestException(
          '每日设计工时必须是大于 0 的整数（分钟）',
        );
      }
    }

    if (dto.minutesPerRecipe !== undefined) {
      const value = dto.minutesPerRecipe;
      if (!Number.isInteger(value) || value < 1) {
        throw new BadRequestException(
          '每份设计工时必须是大于 0 的整数（分钟）',
        );
      }
    }
  }

  /**
   * 多份优惠档位校验（设计文档 6.3）。
   *
   * 规则：
   *   · 2–5 份四档必须齐全（缺档位时某个份数会静默变成"无优惠"）；
   *   · 只能配置 2–5 份（1 份不允许折扣）；
   *   · 份数不能重复；
   *   · 份数越高，折扣不能降低（可以持平）；
   *   · 每档折扣 > 0 且 ≤ 20%。
   *
   * 错误统一带「优惠配置不合法」前缀：后台保存失败时，运营一眼能看出
   * 是优惠配置的问题，而不是笼统的 400。
   *
   * 空数组在保存时直接拒绝（四档全缺）。读取侧对存量 `[]` 另有兜底，
   * 见 normalizeMultiRecipeDiscounts。
   */
  private assertValidMultiRecipeDiscounts(value: unknown): void {
    if (!Array.isArray(value)) {
      throw new BadRequestException('优惠配置不合法：优惠档位必须是数组');
    }

    const tiers = value.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new BadRequestException(
          '优惠配置不合法：每一档优惠必须是一个对象',
        );
      }
      return item as Record<string, unknown>;
    });

    // 先按份数排序再校验"不能降低"，否则后台换一下行的顺序就会被误判
    tiers.sort((a, b) => Number(a.quantity) - Number(b.quantity));

    const seen = new Set<number>();
    let previousRate = -Infinity;

    for (const tier of tiers) {
      const quantity = tier.quantity;
      const discountRate = tier.discountRate;
      const label = tier.label;

      if (
        typeof quantity !== 'number' ||
        !Number.isInteger(quantity) ||
        quantity < 2 ||
        quantity > MAX_MULTI_RECIPE_QUANTITY
      ) {
        throw new BadRequestException(
          `优惠配置不合法：优惠份数必须是 2~${MAX_MULTI_RECIPE_QUANTITY} 的整数`,
        );
      }

      if (seen.has(quantity)) {
        throw new BadRequestException(
          `优惠配置不合法：${quantity} 份的优惠档位重复了`,
        );
      }
      seen.add(quantity);

      if (
        typeof discountRate !== 'number' ||
        !Number.isFinite(discountRate) ||
        discountRate <= 0 ||
        discountRate > MAX_MULTI_RECIPE_DISCOUNT_RATE
      ) {
        throw new BadRequestException(
          `优惠配置不合法：${quantity} 份的折扣率必须大于 0 且不超过 ${
            MAX_MULTI_RECIPE_DISCOUNT_RATE * 100
          }%`,
        );
      }

      if (discountRate < previousRate) {
        throw new BadRequestException(
          `优惠配置不合法：份数越高折扣不能降低（${quantity} 份的折扣低于上一档）`,
        );
      }
      previousRate = discountRate;

      if (typeof label !== 'string') {
        throw new BadRequestException(
          `优惠配置不合法：${quantity} 份的展示文案必须是字符串`,
        );
      }
    }

    // 四档必须齐全：2/3/4/5 缺任何一档都拒绝保存
    const missing = REQUIRED_MULTI_RECIPE_DISCOUNT_QUANTITIES.filter(
      (quantity) => !seen.has(quantity),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `优惠配置不合法：优惠档位必须覆盖 2/3/4/5 份，缺少 ${missing.join(
          '、',
        )} 份`,
      );
    }
  }

  private toWriteData(dto: UpdateCustomRecipeConfigDto) {
    return {
      ...(dto.feeAmount !== undefined && { feeAmount: dto.feeAmount }),
      ...(dto.deliveryWorkDays !== undefined && {
        deliveryWorkDays: dto.deliveryWorkDays,
      }),
      ...(dto.dailyCapacity !== undefined && {
        dailyCapacity: dto.dailyCapacity,
      }),
      ...(dto.paymentTimeoutMinutes !== undefined && {
        paymentTimeoutMinutes: dto.paymentTimeoutMinutes,
      }),

      // ===== 批次 1.4 =====
      ...(dto.dailyDeliveryCapacity !== undefined && {
        dailyDeliveryCapacity: dto.dailyDeliveryCapacity,
      }),
      ...(dto.aftersaleWindowDays !== undefined && {
        aftersaleWindowDays: dto.aftersaleWindowDays,
      }),
      ...(dto.freeRevisionCount !== undefined && {
        freeRevisionCount: dto.freeRevisionCount,
      }),
      ...(dto.freeRevisionWindowDays !== undefined && {
        freeRevisionWindowDays: dto.freeRevisionWindowDays,
      }),
      ...(dto.autoCompleteDays !== undefined && {
        autoCompleteDays: dto.autoCompleteDays,
      }),
      ...(dto.requireCustomerConfirm !== undefined && {
        requireCustomerConfirm: dto.requireCustomerConfirm,
      }),
      ...(dto.deliveryItemCodes !== undefined && {
        deliveryItemCodes: dto.deliveryItemCodes,
      }),
      ...(dto.attachmentMaxCount !== undefined && {
        attachmentMaxCount: dto.attachmentMaxCount,
      }),
      ...(dto.attachmentMaxSizeMb !== undefined && {
        attachmentMaxSizeMb: dto.attachmentMaxSizeMb,
      }),
      ...(dto.defaultNutritionStandard !== undefined && {
        defaultNutritionStandard: dto.defaultNutritionStandard.trim(),
      }),
      ...(dto.defaultEnergyDensityKcalPerKg !== undefined && {
        defaultEnergyDensityKcalPerKg: dto.defaultEnergyDensityKcalPerKg,
      }),
      ...(dto.productionLossRate !== undefined && {
        productionLossRate: dto.productionLossRate,
      }),
      ...(dto.defaultLaborHours !== undefined && {
        defaultLaborHours: dto.defaultLaborHours,
      }),
      ...(dto.scheduleLookaheadDays !== undefined && {
        scheduleLookaheadDays: dto.scheduleLookaheadDays,
      }),
      ...(dto.slotRetryTimes !== undefined && {
        slotRetryTimes: dto.slotRetryTimes,
      }),
      ...(dto.orderNoPrefix !== undefined && {
        orderNoPrefix: dto.orderNoPrefix,
      }),

      // ===== 2026-10-20 多份购买 =====
      ...(dto.multiRecipeEnabled !== undefined && {
        multiRecipeEnabled: dto.multiRecipeEnabled,
      }),
      ...(dto.maxRecipeQuantity !== undefined && {
        maxRecipeQuantity: dto.maxRecipeQuantity,
      }),
      ...(dto.multiRecipeDiscounts !== undefined && {
        /**
         * 校验已保证四档齐全（2/3/4/5）；这里按份数排序后落库，
         * 保证读出来的顺序稳定。
         */
        multiRecipeDiscounts: ([...dto.multiRecipeDiscounts]
          .sort((a, b) => a.quantity - b.quantity)
          .map((tier) => ({ ...tier }))) as unknown as Prisma.InputJsonValue,
      }),
      ...(dto.dailyDesignMinutes !== undefined && {
        dailyDesignMinutes: dto.dailyDesignMinutes,
      }),
      ...(dto.minutesPerRecipe !== undefined && {
        minutesPerRecipe: dto.minutesPerRecipe,
      }),
    };
  }

  private toDto(row: {
    feeAmount: unknown;
    deliveryWorkDays: number;
    dailyCapacity: number;
    paymentTimeoutMinutes: number;
    dailyDeliveryCapacity: number;
    aftersaleWindowDays: number;
    aftersaleOverdueHours: number;
    allowRefundBeforeDelivery: boolean;
    messageCenterEnabled: boolean;
    freeRevisionCount: number;
    freeRevisionWindowDays: number;
    autoCompleteDays: number;
    requireCustomerConfirm: boolean;
    deliveryItemCodes: string[];
    attachmentMaxCount: number;
    attachmentMaxSizeMb: number;
    defaultNutritionStandard: string;
    defaultEnergyDensityKcalPerKg: number;
    productionLossRate: unknown;
    defaultLaborHours: unknown;
    scheduleLookaheadDays: number;
    slotRetryTimes: number;
    orderNoPrefix: string;
    // ===== 2026-10-20 多份购买 =====
    multiRecipeEnabled: boolean;
    maxRecipeQuantity: number;
    multiRecipeDiscounts: unknown;
    dailyDesignMinutes: number;
    minutesPerRecipe: number;
    updatedAt: Date | null;
  }): CustomRecipeConfigDto {
    return {
      feeAmount: Number(row.feeAmount),
      deliveryWorkDays: Number(row.deliveryWorkDays),
      dailyCapacity: Number(row.dailyCapacity),
      paymentTimeoutMinutes: Number(row.paymentTimeoutMinutes),

      dailyDeliveryCapacity: Number(row.dailyDeliveryCapacity),
      aftersaleWindowDays: Number(row.aftersaleWindowDays),
      aftersaleOverdueHours: Number(row.aftersaleOverdueHours),
      allowRefundBeforeDelivery: Boolean(row.allowRefundBeforeDelivery),
      messageCenterEnabled: Boolean(row.messageCenterEnabled),
      freeRevisionCount: Number(row.freeRevisionCount),
      freeRevisionWindowDays: Number(row.freeRevisionWindowDays),
      autoCompleteDays: Number(row.autoCompleteDays),
      requireCustomerConfirm: Boolean(row.requireCustomerConfirm),
      deliveryItemCodes: Array.isArray(row.deliveryItemCodes)
        ? row.deliveryItemCodes
        : [],
      attachmentMaxCount: Number(row.attachmentMaxCount),
      attachmentMaxSizeMb: Number(row.attachmentMaxSizeMb),
      defaultNutritionStandard: row.defaultNutritionStandard,
      defaultEnergyDensityKcalPerKg: Number(
        row.defaultEnergyDensityKcalPerKg,
      ),
      // Decimal 列：Prisma 给的是 Decimal 对象，转成 number 再出接口
      productionLossRate: Number(row.productionLossRate),
      defaultLaborHours: Number(row.defaultLaborHours),
      scheduleLookaheadDays: Number(row.scheduleLookaheadDays),
      slotRetryTimes: Number(row.slotRetryTimes),
      orderNoPrefix: row.orderNoPrefix,

      // ===== 2026-10-20 多份购买 =====
      multiRecipeEnabled:
        typeof row.multiRecipeEnabled === 'boolean'
          ? row.multiRecipeEnabled
          : DEFAULT_MULTI_RECIPE_ENABLED,
      maxRecipeQuantity: this.normalizeMaxRecipeQuantity(
        row.maxRecipeQuantity,
      ),
      multiRecipeDiscounts: this.normalizeMultiRecipeDiscounts(
        row.multiRecipeDiscounts,
      ),
      dailyDesignMinutes: this.normalizePositiveMinutes(
        row.dailyDesignMinutes,
        DEFAULT_DAILY_DESIGN_MINUTES,
      ),
      minutesPerRecipe: this.normalizePositiveMinutes(
        row.minutesPerRecipe,
        DEFAULT_MINUTES_PER_RECIPE,
      ),

      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  /**
   * 读取时把「最多份数」夹回合法范围。
   *
   * 为什么读取也要兜底：配置行可能是迁移前的（字段不存在）、人工改过的，
   * 或将来被别的脚本写坏的。报价/下单会直接吃这个值 ——
   * 一个 0 会让"最多 0 份"，一个 99 会放过 6 份订单，都必须退 5。
   */
  private normalizeMaxRecipeQuantity(value: unknown): number {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > MAX_MULTI_RECIPE_QUANTITY
    ) {
      return DEFAULT_MAX_RECIPE_QUANTITY;
    }
    return value;
  }

  /** 设计工时（分钟）读取兜底：0/负数/非整数都退默认值 */
  private normalizePositiveMinutes(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      return fallback;
    }
    return value;
  }

  /**
   * 读取时校验优惠档位。
   *
   * 坏配置不能进报价（否则可能出现"折扣下降"或负金额），统一退默认四档：
   *   · 空数组 / 缺字段 → 默认档位（迁移后的存量行就是 `[]`）；
   *   · 档位不齐（如只有 2、4 份）→ 默认档位（缺档位等于某个份数无优惠）；
   *   · 任一档不合法 → 整体退默认，不保留"看起来还行"的部分。
   */
  private normalizeMultiRecipeDiscounts(
    value: unknown,
  ): MultiRecipeDiscountTier[] {
    const parsed = typeof value === 'string' ? this.parseJson(value) : value;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return cloneDefaultDiscountTiers();
    }

    const tiers: MultiRecipeDiscountTier[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return cloneDefaultDiscountTiers();
      }
      const { quantity, discountRate, label } = item as Record<string, unknown>;
      if (
        typeof quantity !== 'number' ||
        !Number.isInteger(quantity) ||
        quantity < 2 ||
        quantity > MAX_MULTI_RECIPE_QUANTITY ||
        typeof discountRate !== 'number' ||
        !Number.isFinite(discountRate) ||
        discountRate <= 0 ||
        discountRate > MAX_MULTI_RECIPE_DISCOUNT_RATE ||
        typeof label !== 'string'
      ) {
        return cloneDefaultDiscountTiers();
      }
      tiers.push({ quantity, discountRate, label });
    }

    // 排序后再判"折扣不能降低"，库里顺序不影响结果
    tiers.sort((a, b) => a.quantity - b.quantity);

    const seen = new Set<number>();
    let previousRate = -Infinity;
    for (const tier of tiers) {
      if (seen.has(tier.quantity) || tier.discountRate < previousRate) {
        return cloneDefaultDiscountTiers();
      }
      seen.add(tier.quantity);
      previousRate = tier.discountRate;
    }

    // 四档不齐也视为坏配置：缺失档位会让对应份数静默变成"无优惠"
    const missing = REQUIRED_MULTI_RECIPE_DISCOUNT_QUANTITIES.filter(
      (quantity) => !seen.has(quantity),
    );
    if (missing.length > 0) {
      return cloneDefaultDiscountTiers();
    }

    return tiers;
  }

  private parseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
