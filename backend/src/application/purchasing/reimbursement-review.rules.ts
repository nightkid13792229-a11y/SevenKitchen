/**
 * 报销单审核规则（纯函数，2026-11-04 阶段 E）。
 *
 * 只做确定性判断：金额、凭证、截图完整性、重复单号、改动痕迹。
 * 模型只负责把结论写成一句话摘要，不参与判定。
 */

export type ReviewRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReviewFindingLevel = 'INFO' | 'WARN' | 'HIGH';

export interface ReviewFinding {
  code: string;
  level: ReviewFindingLevel;
  message: string;
}

export interface ReviewRecordInput {
  id: string;
  ingredientName: string;
  procurementSkuName: string | null;
  actualCost: number;
  hasSourceImport: boolean;
}

export interface ReviewImportInput {
  /** 渠道；null = 识别时没认出来、员工还没确认（这类单子按现有流程也生成不了） */
  channel: string | null;
  orderNo: string | null;
  incomplete: boolean;
  /** 商品小计 − 各行合计；没读到商品小计时为 null。差额由员工确认后生成的，这里只做提示 */
  amountDiff: number | null;
  personalAmount: number;
  /** 只是换原料/标个人，金额没动 */
  matchEditedLines: number;
  /** 金额被改过 */
  amountEditedLines: number;
  /** 金额改动的最大差额（元） */
  maxAmountDelta: number;
}

export interface ReviewClaimInput {
  claimNumber: string;
  totalActualCost: number;
  voucherAmount: number | null;
  differenceAmount: number | null;
  differenceNote: string | null;
  receiptCount: number;
  hasPaymentProof: boolean;
  records: ReviewRecordInput[];
  imports: ReviewImportInput[];
  listKinds: string[];
}

export interface ReviewEvaluation {
  riskLevel: ReviewRisk;
  findings: ReviewFinding[];
  stats: {
    recordCount: number;
    receiptCount: number;
    voucherAmount: number | null;
    differenceAmount: number | null;
    personalAmount: number;
    matchEditedLines: number;
    amountEditedLines: number;
    manualRecordCount: number;
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function evaluateReimbursement(
  input: ReviewClaimInput,
): ReviewEvaluation {
  const findings: ReviewFinding[] = [];

  if (input.receiptCount === 0) {
    findings.push({
      code: 'NO_RECEIPT',
      level: 'HIGH',
      message: '没有任何支付凭证，不能通过',
    });
  }

  const incompleteImports = input.imports.filter((item) => item.incomplete);
  if (incompleteImports.length > 0) {
    findings.push({
      code: 'INCOMPLETE_SCREENSHOT',
      level: 'WARN',
      message: `有 ${incompleteImports.length} 笔订单截图模型认为没读完整，员工确认后已生成，请抽查原图`,
    });
  }

  // 商品金额与各行合计的差额：优惠/特价/包装费都会造成差额，只提示不拦截。
  const diffImports = input.imports.filter(
    (item) => item.amountDiff !== null && Math.abs(item.amountDiff) > 0.011,
  );
  if (diffImports.length > 0) {
    const maxDiff = round2(
      diffImports.reduce(
        (max, item) => Math.max(max, Math.abs(item.amountDiff ?? 0)),
        0,
      ),
    );
    findings.push({
      code: 'AMOUNT_DIFF',
      level: 'WARN',
      message: `有 ${diffImports.length} 笔订单的商品金额与各行合计最大差 ¥${maxDiff.toFixed(2)}（员工确认后已生成），请抽查原图`,
    });
  }

  if (
    input.voucherAmount !== null &&
    input.voucherAmount < input.totalActualCost
  ) {
    findings.push({
      code: 'VOUCHER_LESS_THAN_CLAIM',
      level: 'HIGH',
      message: `凭证金额 ¥${round2(input.voucherAmount).toFixed(2)} 小于报销金额 ¥${round2(input.totalActualCost).toFixed(2)}`,
    });
  }

  const personalAmount = round2(
    input.imports.reduce((sum, item) => sum + (item.personalAmount || 0), 0),
  );
  if (personalAmount > 0) {
    if (input.differenceAmount === null) {
      findings.push({
        code: 'PERSONAL_WITHOUT_DIFFERENCE',
        level: 'WARN',
        message: `标了个人采购 ¥${personalAmount.toFixed(2)}，但没有凭证差额，无法核对是否真的排除`,
      });
    } else if (
      input.differenceAmount + 0.5 <
      personalAmount
    ) {
      // 个人金额大于差额：很可能把个人消费报进来了（或只排除了 part）
      findings.push({
        code: 'PERSONAL_EXCEEDS_DIFFERENCE',
        level: 'HIGH',
        message: `个人采购 ¥${personalAmount.toFixed(2)} 大于凭证差额 ¥${round2(input.differenceAmount).toFixed(2)}，请核对是否把个人消费报进报销`,
      });
    } else {
      findings.push({
        code: 'PERSONAL_ITEMS',
        level: 'INFO',
        message: `本单含个人采购 ¥${personalAmount.toFixed(2)}，与凭证差额一致`,
      });
    }
    if (!input.differenceNote || !input.differenceNote.trim()) {
      findings.push({
        code: 'PERSONAL_WITHOUT_NOTE',
        level: 'WARN',
        message: '有个人采购但没有填写差额说明',
      });
    }
  } else if (input.differenceAmount !== null && input.differenceAmount > 0.01) {
    findings.push({
      code: 'DIFFERENCE_WITHOUT_PERSONAL',
      level: 'WARN',
      message: `凭证比报销多 ¥${round2(input.differenceAmount).toFixed(2)}，但没有标记任何个人采购，请确认差额原因`,
    });
  }

  const matchEditedLines = input.imports.reduce(
    (sum, item) => sum + (item.matchEditedLines || 0),
    0,
  );
  if (matchEditedLines > 0) {
    findings.push({
      code: 'MATCH_EDITED_LINES',
      level: 'INFO',
      message: `有 ${matchEditedLines} 行只是换了原料或标了个人，金额没动`,
    });
  }

  const amountEditedLines = input.imports.reduce(
    (sum, item) => sum + (item.amountEditedLines || 0),
    0,
  );
  const maxAmountDelta = round2(
    input.imports.reduce(
      (max, item) => Math.max(max, item.maxAmountDelta || 0),
      0,
    ),
  );
  if (amountEditedLines > 0) {
    const level: ReviewFindingLevel = maxAmountDelta > 100 ? 'HIGH' : 'WARN';
    findings.push({
      code: 'AMOUNT_EDITED_LINES',
      level,
      message:
        `有 ${amountEditedLines} 行金额被员工改过，最大差 ¥${maxAmountDelta.toFixed(2)}` +
        (level === 'HIGH' ? '，改动过大，必须对照原图' : '，请对照原图复核'),
    });
  }

  const orderNos = input.imports
    .map((item) => item.orderNo?.trim())
    .filter((value): value is string => Boolean(value));
  const duplicates = orderNos.filter(
    (value, index) => orderNos.indexOf(value) !== index,
  );
  if (duplicates.length > 0) {
    findings.push({
      code: 'DUPLICATE_ORDER',
      level: 'WARN',
      message: `同一订单号出现多次：${Array.from(new Set(duplicates)).join('、')}`,
    });
  }

  const manualRecords = input.records.filter((record) => !record.hasSourceImport);
  if (manualRecords.length > 0) {
    findings.push({
      code: 'MANUAL_RECORDS',
      level: 'INFO',
      message: `有 ${manualRecords.length} 条采购记录是手填的（农贸市场/便利店等），只能人工核对转账截图`,
    });
  }

  if (input.records.length === 0) {
    findings.push({
      code: 'NO_RECORD',
      level: 'HIGH',
      message: '没有关联任何采购记录',
    });
  }

  if (input.listKinds.length > 0 && input.listKinds.every((kind) => kind !== 'ORDER_DEMAND')) {
    findings.push({
      code: 'NON_DAILY_ONLY',
      level: 'INFO',
      message: '本单只含补货/包材清单，成本不进订单成本',
    });
  }

  if (input.hasPaymentProof) {
    findings.push({
      code: 'ALREADY_PAID',
      level: 'INFO',
      message: '已经上传过付款凭证，本单已完成报销',
    });
  }

  const hasHigh = findings.some((item) => item.level === 'HIGH');
  const hasWarn = findings.some((item) => item.level === 'WARN');
  const riskLevel: ReviewRisk = hasHigh
    ? 'HIGH'
    : hasWarn
      ? 'MEDIUM'
      : 'LOW';

  return {
    riskLevel,
    findings,
    stats: {
      recordCount: input.records.length,
      receiptCount: input.receiptCount,
      voucherAmount: input.voucherAmount,
      differenceAmount: input.differenceAmount,
      personalAmount,
      matchEditedLines,
      amountEditedLines,
      manualRecordCount: manualRecords.length,
    },
  };
}

/** 模型不可用时的兜底摘要：直接按规则结论拼一句话 */
export function buildFallbackSummary(evaluation: ReviewEvaluation): string {
  if (evaluation.riskLevel === 'HIGH') {
    const first = evaluation.findings.find((item) => item.level === 'HIGH');
    return `存在必须处理的问题：${first?.message ?? '资料不完整'}。建议退回补充后再审。`;
  }
  if (evaluation.riskLevel === 'MEDIUM') {
    const first = evaluation.findings.find((item) => item.level === 'WARN');
    return `建议复核：${first?.message ?? '有需要确认的改动'}。`;
  }
  return '金额、凭证与采购记录一致，未发现明显异常。';
}
