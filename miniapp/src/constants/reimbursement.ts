/**
 * 经营费用报销类别：与 `pages/staff-purchasing/constants/reimbursement.ts` 保持同步。
 *
 * 分包页面不能跨包引用主包常量（`mp-weixin-build-assets.regression.spec.ts` 锁着），
 * 所以这份是同一份逻辑的副本；改的时候两份一起改。
 *
 * 经营费用报销的可选类别（2026-11-19 收窄）。
 *
 * 房租、水电、工资、社保、税费已经移到「财务 → 固定费用」按月自动出账，
 * 这里不再提供，避免同一笔钱既走报销又走固定费用被扣两次。
 */
export const reimbursementCustomFeeCategoryOptions = [
  { value: 'TOOLS', label: '工具' },
  { value: 'SUNDRIES', label: '杂物' },
  { value: 'OTHER', label: '其它' },
] as const;

export type ReimbursementCustomFeeCategory =
  (typeof reimbursementCustomFeeCategoryOptions)[number]['value'];

/**
 * 历史类别：2026-11-19 之前的老报销单里可能还有房租/工资/水电。
 *
 * 只用于**只读回显**（详情、列表、编辑回填），不参与新增选项；
 * 编辑老单时原样保留回传，不能因为下拉里没有就改写成「其它」。
 */
export const LEGACY_REIMBURSEMENT_CUSTOM_FEE_CATEGORIES = [
  'RENT',
  'PAYROLL',
  'UTILITIES',
] as const;

export type LegacyReimbursementCustomFeeCategory =
  (typeof LEGACY_REIMBURSEMENT_CUSTOM_FEE_CATEGORIES)[number];

/** 展示 / 编辑回填时可能遇到的类别（新增只允许上述三项） */
export type ReimbursementCustomFeeCategoryForDisplay =
  | ReimbursementCustomFeeCategory
  | LegacyReimbursementCustomFeeCategory;

const reimbursementCustomFeeCategoryLabelMap: Record<
  ReimbursementCustomFeeCategory,
  string
> = reimbursementCustomFeeCategoryOptions.reduce(
  (map, option) => ({ ...map, [option.value]: option.label }),
  {} as Record<ReimbursementCustomFeeCategory, string>,
);

/** 老类别的中文标签：只用于把历史单据显示成人能看懂的字 */
const legacyReimbursementCustomFeeCategoryLabelMap: Record<
  LegacyReimbursementCustomFeeCategory,
  string
> = {
  RENT: '房租',
  PAYROLL: '工资/人工',
  UTILITIES: '水电',
};

export const isReimbursementCustomFeeCategory = (
  value?: string | null,
): value is ReimbursementCustomFeeCategory => {
  return reimbursementCustomFeeCategoryOptions.some(
    (option) => option.value === value,
  );
};

export const isLegacyReimbursementCustomFeeCategory = (
  value?: string | null,
): value is LegacyReimbursementCustomFeeCategory => {
  return (
    typeof value === 'string' &&
    (LEGACY_REIMBURSEMENT_CUSTOM_FEE_CATEGORIES as readonly string[]).includes(
      value,
    )
  );
};

export const getReimbursementCustomFeeCategoryLabel = (
  category?: string | null,
) => {
  if (!category) {
    return '其它费用';
  }

  if (isReimbursementCustomFeeCategory(category)) {
    return reimbursementCustomFeeCategoryLabelMap[category];
  }

  // 历史类别继续显示原名，不让老单突然变成「其它费用」
  if (isLegacyReimbursementCustomFeeCategory(category)) {
    return legacyReimbursementCustomFeeCategoryLabelMap[category];
  }

  return '其它费用';
};

/**
 * 按描述猜类别。
 *
 * 房租/水电/工资的猜测只服务历史数据回填，新增入口不提供这三项；
 * 猜不出返回 undefined，由调用方落到「其它」。
 */
export const inferReimbursementCustomFeeCategory = (
  description?: string | null,
): ReimbursementCustomFeeCategoryForDisplay | undefined => {
  const normalized = `${description || ''}`.trim();

  if (!normalized) return undefined;
  if (normalized.includes('房租')) return 'RENT';
  if (
    normalized.includes('水电') ||
    normalized.includes('水费') ||
    normalized.includes('电费') ||
    normalized.includes('燃气') ||
    normalized.includes('物业')
  ) {
    return 'UTILITIES';
  }
  if (normalized.includes('工具') || normalized.includes('设备')) {
    return 'TOOLS';
  }
  if (
    normalized.includes('工资') ||
    normalized.includes('薪资') ||
    normalized.includes('社保') ||
    normalized.includes('提成')
  ) {
    return 'PAYROLL';
  }
  if (
    normalized.includes('杂') ||
    normalized.includes('耗材') ||
    normalized.includes('办公') ||
    normalized.includes('清洁')
  ) {
    return 'SUNDRIES';
  }

  return 'OTHER';
};

/**
 * 编辑历史报销时还原类别（2026-11-19 审查打回）。
 *
 * 老单的 RENT/PAYROLL 必须原样保留：一旦重新推断成 OTHER，
 * 重提交就把历史账目改掉了。只有原值为空时才按描述兜底推断。
 */
export const resolveReimbursementCustomFeeCategoryForEdit = (
  category?: string | null,
  description?: string | null,
): ReimbursementCustomFeeCategoryForDisplay => {
  if (isReimbursementCustomFeeCategory(category)) return category;
  if (isLegacyReimbursementCustomFeeCategory(category)) return category;

  return inferReimbursementCustomFeeCategory(description) || 'OTHER';
};

export const formatReimbursementCustomFeeTitle = (fee?: {
  category?: string | null;
  description?: string | null;
}) => {
  const description = `${fee?.description || ''}`.trim();

  // 新类别与历史类别（房租/工资）都拼成「标签 · 说明」，只是历史类别不再可选
  if (
    fee?.category &&
    (isReimbursementCustomFeeCategory(fee.category) ||
      isLegacyReimbursementCustomFeeCategory(fee.category))
  ) {
    const label = getReimbursementCustomFeeCategoryLabel(fee.category);
    return description && description !== label
      ? `${label} · ${description}`
      : label;
  }

  return description || '其它费用';
};

export const summarizeReimbursementCustomFees = (
  fees?: Array<{ category?: string | null; description?: string | null }>,
) => {
  if (!Array.isArray(fees) || fees.length === 0) {
    return '';
  }

  const labels = fees
    .map((fee) => formatReimbursementCustomFeeTitle(fee))
    .filter(Boolean);

  return Array.from(new Set(labels)).slice(0, 3).join('、');
};
