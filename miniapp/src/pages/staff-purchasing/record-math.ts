/**
 * 采购记录弹窗 / 记录卡的纯计算（2026-11-07）。
 *
 * 后端在生成清单时把「要买多少」写在 purchaseShortageQuantity / quantityNeeded，
 * 之后新增采购记录**不会**回写这个值。所以：
 *   · targetShortage 是清单生成时的目标缺口，不是「还差多少」；
 *   · 还差 = max(0, targetShortage - 已有记录折算量)；
 *   · 正在编辑的那条旧记录要加回「这条记录要覆盖的量」，否则编辑会重复扣减。
 *
 * 放在纯函数里，是为了能用单测覆盖「无记录 / 一条 / 两条 / 编辑 / 超买 / 库存抵扣」。
 */

const toNonNegative = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export interface RecordProgressInput {
  targetShortage: number;
  existingBought: number;
  editingBought?: number;
}

export interface RecordProgress {
  targetShortage: number;
  existingBought: number;
  remaining: number;
  total: number;
  progressPercent: number;
  progressOver: boolean;
  needForThisRecord: number;
}

export function computeRecordProgress(input: RecordProgressInput): RecordProgress {
  const targetShortage = toNonNegative(input.targetShortage);
  const existingBought = toNonNegative(input.existingBought);
  const editingBought = toNonNegative(input.editingBought);
  const remaining = Math.max(0, targetShortage - existingBought);
  const total = targetShortage;
  const progressPercent =
    total > 0 ? Math.min(100, Math.round((existingBought / total) * 100)) : 0;
  const progressOver = existingBought > total + 1e-6 && existingBought > 0;

  return {
    targetShortage,
    existingBought,
    remaining,
    total,
    progressPercent,
    progressOver,
    needForThisRecord: remaining + editingBought,
  };
}

export interface RecordOutcome {
  kind: 'over' | 'short' | 'ok';
  value: number;
}

export function computeRecordOutcome(
  inputBase: number,
  needForThisRecord: number,
): RecordOutcome {
  const input = toNonNegative(inputBase);
  const need = toNonNegative(needForThisRecord);
  const diff = input - need;
  if (Math.abs(diff) <= 1e-6) {
    return { kind: 'ok', value: 0 };
  }
  return diff > 0
    ? { kind: 'over', value: diff }
    : { kind: 'short', value: -diff };
}

export interface ItemOutcomeInput {
  targetShortage: number;
  bought: number;
  grossNeed: number;
}

/**
 * 记录卡上的整项状态：
 *   · 目标缺口还没买够 → 还差；
 *   · 买够了，且超过订单总需求 → 多（与原型「多 189g」口径一致）；
 *   · 其余 → 买齐（可能是库存 + 记录一起覆盖）。
 */
export function computeItemOutcome(input: ItemOutcomeInput): RecordOutcome {
  const targetShortage = toNonNegative(input.targetShortage);
  const bought = toNonNegative(input.bought);
  const grossNeed = toNonNegative(input.grossNeed);

  if (targetShortage - bought > 1e-6) {
    return { kind: 'short', value: targetShortage - bought };
  }
  if (grossNeed > 0 && bought > grossNeed + 1e-6) {
    return { kind: 'over', value: bought - grossNeed };
  }
  return { kind: 'ok', value: 0 };
}
