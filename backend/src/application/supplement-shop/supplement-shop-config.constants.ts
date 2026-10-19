/**
 * 补剂商城配置的唯一起点。
 *
 * 这里放两类值：
 * - DEFAULTS：新环境第一次创建配置行时落的值（安全默认，商城仍默认关闭）
 * - LAUNCH_TARGETS：老板确认的首发目标值，只用于后台差异检查/上线脚本，
 *   不会在每次读配置时强行覆盖运营已经改过的值。
 *
 * ⚠️ schema 默认值、admin 表单默认值、测试 fixture 都以这里为口径；
 * 不要再在别处手写 8 / 49 / 9.9。
 */
export const SUPPLEMENT_SHOP_CONFIG_DEFAULTS = {
  enabled: false,
  markupMultiplier: 2.5,
  serviceFeeMode: 'PER_ORDER',
  serviceFeeAmount: 10,
  packagingFeePerBag: 0,
  priceRoundingMode: 'CEIL_TO_0_1',
  minOrderAmount: 0,
  roundUpUsage: true,
  maxPortionMultiplier: 3,
  maxTotalDays: 90,
  paymentTimeoutMinutes: 30,
  dailyCutoffTime: '17:00',
  dailyPackingCapacity: 30,
  autoScheduleEnabled: true,
  aftersaleWindowDays: 7,
  autoCompleteDays: 10,
  freeServiceThreshold: 99,
  shippingMode: 'FLAT_RATE',
  flatShippingFee: 6,
  shippingTemplateId: null,
  freeShippingThreshold: 129,
  powderShelfLifeMonths: 6,
  solidShelfLifeMonths: 9,
  oilShelfLifeMonths: 6,
  minRemainingShelfLifeDays: 90,
  aftersalePolicy: null,
  labelBrandName: '赛文的食堂',
  labelIncludeDesiccantNotice: true,
} as const;

/**
 * 首发目标值。与 DEFAULTS 的差异只在 enabled（上线后由运营手动打开）。
 * 差异检查不包含 enabled：暂停营业不是配置错误。
 */
export const SUPPLEMENT_SHOP_LAUNCH_TARGETS = {
  ...SUPPLEMENT_SHOP_CONFIG_DEFAULTS,
  enabled: true,
} as const;

export type SupplementShopConfigTargetKey =
  keyof typeof SUPPLEMENT_SHOP_LAUNCH_TARGETS;

export interface SupplementShopConfigTargetDiff {
  field: SupplementShopConfigTargetKey;
  label: string;
  current: unknown;
  target: unknown;
}

const TARGET_LABELS: Partial<
  Record<SupplementShopConfigTargetKey, string>
> = {
  markupMultiplier: '加价倍率',
  serviceFeeMode: '服务费方式',
  serviceFeeAmount: '分装服务费',
  packagingFeePerBag: '包材费/袋',
  priceRoundingMode: '价格圆整',
  minOrderAmount: '最低起送',
  roundUpUsage: '用量进位',
  maxPortionMultiplier: '最多份数',
  maxTotalDays: '总天数上限',
  paymentTimeoutMinutes: '支付超时',
  dailyCutoffTime: '截单时间',
  dailyPackingCapacity: '每日产能',
  autoScheduleEnabled: '自动排期',
  aftersaleWindowDays: '售后窗口',
  autoCompleteDays: '自动完成',
  freeServiceThreshold: '免服务费门槛',
  shippingMode: '运费策略',
  flatShippingFee: '一口价运费',
  shippingTemplateId: '运费模板',
  freeShippingThreshold: '包邮门槛',
  powderShelfLifeMonths: '粉剂效期',
  solidShelfLifeMonths: '片剂效期',
  oilShelfLifeMonths: '油性效期',
  minRemainingShelfLifeDays: '最短剩余效期',
  aftersalePolicy: '售后说明',
  labelBrandName: '标签品牌名',
  labelIncludeDesiccantNotice: '干燥剂提示',
};

export function diffSupplementLaunchTargets(
  config: Record<string, unknown>,
): SupplementShopConfigTargetDiff[] {
  const result: SupplementShopConfigTargetDiff[] = [];
  for (const [key, target] of Object.entries(
    SUPPLEMENT_SHOP_LAUNCH_TARGETS,
  ) as Array<[SupplementShopConfigTargetKey, unknown]>) {
    // enabled 是运营开关；aftersalePolicy 是自由文案，不属于首发数值目标
    if (key === 'enabled' || key === 'aftersalePolicy') continue;
    const current = config[key];
    if (normalize(current) !== normalize(target)) {
      result.push({
        field: key,
        label: TARGET_LABELS[key] ?? key,
        current,
        target,
      });
    }
  }
  return result;
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return Number(numeric.toFixed(2));
    return trimmed;
  }
  if (typeof value === 'number') return Number(value.toFixed(2));
  return value ?? null;
}
