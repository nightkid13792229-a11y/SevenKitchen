export const reimbursementCustomFeeCategoryOptions = [
  { value: 'RENT', label: '房租' },
  { value: 'UTILITIES', label: '水电' },
  { value: 'TOOLS', label: '工具' },
  { value: 'SUNDRIES', label: '杂物' },
  { value: 'PAYROLL', label: '工资' },
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
