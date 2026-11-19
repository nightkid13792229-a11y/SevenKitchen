/**
 * 经营费用报销的可选类别（2026-11-19 收窄）。
 *
 * 房租、工资、社保、税费已经移到「财务 → 固定费用」按月自动出账，
 * 这里不再提供，避免同一笔钱既走报销又走固定费用被扣两次。
 */
export const reimbursementCustomFeeCategoryOptions = [
  { value: 'UTILITIES', label: '水电' },
  { value: 'TOOLS', label: '工具' },
  { value: 'SUNDRIES', label: '杂物' },
  { value: 'OTHER', label: '其它' },
] as const;

export type ReimbursementCustomFeeCategory =
  (typeof reimbursementCustomFeeCategoryOptions)[number]['value'];

const reimbursementCustomFeeCategoryLabelMap: Record<
  ReimbursementCustomFeeCategory,
  string
> = reimbursementCustomFeeCategoryOptions.reduce(
  (map, option) => ({ ...map, [option.value]: option.label }),
  {} as Record<ReimbursementCustomFeeCategory, string>,
);

export const isReimbursementCustomFeeCategory = (
  value?: string | null,
): value is ReimbursementCustomFeeCategory => {
  return reimbursementCustomFeeCategoryOptions.some(
    (option) => option.value === value,
  );
};

export const getReimbursementCustomFeeCategoryLabel = (
  category?: string | null,
) => {
  if (!category || !isReimbursementCustomFeeCategory(category)) {
    return '其它费用';
  }

  return reimbursementCustomFeeCategoryLabelMap[category];
};

export const inferReimbursementCustomFeeCategory = (
  description?: string | null,
): ReimbursementCustomFeeCategory | undefined => {
  const normalized = `${description || ''}`.trim();

  if (!normalized) return undefined;
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
    normalized.includes('杂') ||
    normalized.includes('耗材') ||
    normalized.includes('办公') ||
    normalized.includes('清洁')
  ) {
    return 'SUNDRIES';
  }

  return 'OTHER';
};

export const formatReimbursementCustomFeeTitle = (fee?: {
  category?: string | null;
  description?: string | null;
}) => {
  const description = `${fee?.description || ''}`.trim();

  if (fee?.category && isReimbursementCustomFeeCategory(fee.category)) {
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
