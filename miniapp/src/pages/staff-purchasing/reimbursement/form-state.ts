import {
  getReimbursementCustomFeeCategoryLabel,
  isReimbursementCustomFeeCategory,
  type ReimbursementCustomFeeCategory,
} from '../constants/reimbursement';

export type ReimbursementFlowType = 'PURCHASE' | 'OPERATING';
export type ReimbursementFlowStep =
  | 'TYPE'
  | 'PURCHASE_DETAILS'
  | 'OPERATING_DETAILS'
  | 'RECEIPTS'
  | 'CONFIRM'
  | 'SUCCESS';

export interface ReimbursementValidationResult {
  ok: boolean;
  message?: string;
}

export interface ReimbursementPurchaseListLike {
  id: string;
  kind?: string | null;
  totalActualCost?: number | string | null;
  totalEstimatedCost?: number | string | null;
  items?: Array<{ type?: string | null }>;
}

export interface OperatingExpenseFeeInput {
  category?: string | null;
  description?: string | null;
  amount?: string | number | null;
}

export interface NormalizedOperatingExpenseFee {
  category: ReimbursementCustomFeeCategory;
  description: string;
  amount: number;
}

export interface NormalizeOperatingExpenseResult {
  ok: boolean;
  message?: string;
  fees: NormalizedOperatingExpenseFee[];
}

const toAmount = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

export const isPackagingPurchaseList = (
  list: ReimbursementPurchaseListLike,
) => {
  return Array.isArray(list.items)
    ? list.items.some((item) => item?.type === 'PACKAGING')
    : false;
};

export const getPurchaseListKindLabel = (
  list: Pick<ReimbursementPurchaseListLike, 'kind' | 'items'>,
) => {
  if (isPackagingPurchaseList({ id: '', ...list })) {
    return '包材';
  }

  return list.kind === 'STOCK_REPLENISHMENT' ? '补货' : '日采';
};

export const normalizeOperatingExpenseFees = (
  fees: OperatingExpenseFeeInput[] = [],
): NormalizeOperatingExpenseResult => {
  const normalized: NormalizedOperatingExpenseFee[] = [];

  for (const fee of fees) {
    const description = `${fee.description || ''}`.trim();
    const rawAmount =
      typeof fee.amount === 'string' ? fee.amount.trim() : fee.amount;
    const isBlank = !description && (rawAmount === '' || rawAmount == null);

    if (isBlank) {
      continue;
    }

    const amount = toAmount(rawAmount);
    if (amount <= 0) {
      return {
        ok: false,
        message: '经营费用金额需大于0',
        fees: [],
      };
    }

    const category = isReimbursementCustomFeeCategory(fee.category)
      ? fee.category
      : 'OTHER';

    if (category === 'OTHER' && !description) {
      return {
        ok: false,
        message: '其它费用请补充说明',
        fees: [],
      };
    }

    normalized.push({
      category,
      description:
        description || getReimbursementCustomFeeCategoryLabel(category),
      amount,
    });
  }

  return {
    ok: true,
    fees: normalized,
  };
};

export const calculateReimbursementTotal = (params: {
  purchaseLists?: ReimbursementPurchaseListLike[];
  selectedListIds?: string[];
  platformShippingFee?: string | number | null;
  platformPackagingFee?: string | number | null;
  customFees?: OperatingExpenseFeeInput[];
}) => {
  const selectedIds = new Set(params.selectedListIds || []);
  const purchaseListsTotal = (params.purchaseLists || [])
    .filter((list) => selectedIds.has(list.id))
    .reduce((sum, list) => {
      return (
        sum +
        toAmount(
          list.totalActualCost ?? list.totalEstimatedCost,
        )
      );
    }, 0);
  const customFeesResult = normalizeOperatingExpenseFees(params.customFees);
  const customFeesTotal = customFeesResult.ok
    ? customFeesResult.fees.reduce((sum, fee) => sum + fee.amount, 0)
    : 0;

  return Number(
    (
      purchaseListsTotal +
      toAmount(params.platformShippingFee) +
      toAmount(params.platformPackagingFee) +
      customFeesTotal
    ).toFixed(2),
  );
};

export const validateReimbursementStep = (params: {
  currentStep?: ReimbursementFlowStep;
  flowType?: ReimbursementFlowType | '';
  selectedListIds?: string[];
  customFees?: OperatingExpenseFeeInput[];
  receiptUrls?: Array<{ url?: string } | string>;
  purchaseLists?: ReimbursementPurchaseListLike[];
}): ReimbursementValidationResult => {
  if (params.currentStep === 'TYPE' && !params.flowType) {
    return { ok: false, message: '请选择报销类型' };
  }

  if (
    params.currentStep === 'PURCHASE_DETAILS' &&
    params.flowType === 'PURCHASE' &&
    (!params.selectedListIds || params.selectedListIds.length === 0)
  ) {
    return { ok: false, message: '请选择至少一张采购清单' };
  }

  if (
    params.currentStep === 'PURCHASE_DETAILS' &&
    params.flowType === 'PURCHASE'
  ) {
    const loadedIds = new Set((params.purchaseLists || []).map((list) => list.id));
    const hasMissingSelectedList = (params.selectedListIds || []).some(
      (id) => !loadedIds.has(id),
    );

    if (hasMissingSelectedList) {
      return {
        ok: false,
        message: '采购清单数据未加载，请重新进入报销',
      };
    }
  }

  if (
    params.currentStep === 'OPERATING_DETAILS' &&
    params.flowType === 'OPERATING'
  ) {
    const normalized = normalizeOperatingExpenseFees(params.customFees);
    if (!normalized.ok) {
      return { ok: false, message: normalized.message };
    }
    if (normalized.fees.length === 0) {
      return { ok: false, message: '请至少填写一项经营费用' };
    }
  }

  if (
    params.currentStep === 'RECEIPTS' &&
    (!params.receiptUrls || params.receiptUrls.length === 0)
  ) {
    return { ok: false, message: '请上传支付凭证' };
  }

  return { ok: true };
};
