/**
 * 采购商品的「包装层级」（2026-11-11）。
 *
 * ## 它解决什么
 *
 * 改造前，采购商品只有两个数字：采购单位 + 一个换算倍数（`purchaseToBaseRatio`）。
 * 页面能填「一箱 = 10 捆 × 500 克」，但保存时**被折叠成一个 5000**，中间那层
 * 「10 捆」从此消失。后台再想改，只能手拍一个倍数 —— 单位、倍数、规格文本三者
 * 互不校验，谁也不知道 5000 是"10 捆 × 500 克"还是"1 箱 5 公斤"。
 *
 * 现在层级本身就是数据：`links`（中间层）+ `amount`（末层，恒为原料基准单位），
 * 倍数由它**派生**，任何接口都不许单独改倍数。
 *
 * ## 口径（三条，别混）
 *
 * 1. `links` 只用于展示和录入，**不参与**除连乘以外的任何判断；
 * 2. `amount` 永远用原料的基准单位（克 / 毫升 / 个），所以「1 斤」= `amount: 500`；
 * 3. 采购单位单独一列（字典里的一项），保存时和层级一起校验 —— 不允许出现
 *    "单位是盒、层级是袋" 的组合。
 */

import { BaseUnit } from '../ingredient/enums';

export interface PackagingLink {
  count: number;
  unit: string;
}

export interface PackagingSpec {
  /** 中间层，可以为空。例：一箱 10 捆 → [{ count: 10, unit: '捆' }] */
  links: PackagingLink[];
  /** 末层数量，单位恒为原料基准单位。例：每捆 500 克 → 500 */
  amount: number;
  amountUnit: BaseUnit;
  /** 末层的显示说法（按个记账时可能是「枚」「张」），不影响换算 */
  amountLabel?: string;
  /** 包装原文，例如「30枚 1.59kg」，用于订单截图匹配 */
  printedText?: string;
}

export type PackagingProblem =
  | 'INVALID_SHAPE'
  | 'EMPTY_AMOUNT'
  | 'BAD_LINK'
  | 'TOO_MANY_LINKS'
  | 'AMOUNT_UNIT_MISMATCH'
  | 'PURCHASE_UNIT_MISSING'
  | 'PURCHASE_UNIT_NOT_ALLOWED';

export type PackagingValidation =
  | { ok: true; spec: PackagingSpec; ratio: number }
  | { ok: false; problems: PackagingProblem[] };

const MAX_LINKS = 3;
const MAX_UNIT_LENGTH = 4;
/** 连乘后保留 6 位小数，和 `roundNumber(x, 6)` 的历史口径一致 */
const RATIO_SCALE = 1e6;

const BASE_UNIT_LABEL: Record<BaseUnit, string> = {
  [BaseUnit.G]: '克',
  [BaseUnit.ML]: '毫升',
  [BaseUnit.PCS]: '个',
};

const BASE_UNIT_TEXT_ALIASES: Record<string, BaseUnit> = {
  g: BaseUnit.G,
  克: BaseUnit.G,
  公克: BaseUnit.G,
  ml: BaseUnit.ML,
  毫升: BaseUnit.ML,
  pcs: BaseUnit.PCS,
  个: BaseUnit.PCS,
 只: BaseUnit.PCS,
  枚: BaseUnit.PCS,
  张: BaseUnit.PCS,
};

export function baseUnitLabel(baseUnit: BaseUnit | string): string {
  return BASE_UNIT_LABEL[baseUnit as BaseUnit] ?? '克';
}

/** 把「克 / g / 个 / 枚」等写法归一到 BaseUnit；认不出返回 null */
export function normalizeBaseUnitText(value: unknown): BaseUnit | null {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!text) return null;
  return BASE_UNIT_TEXT_ALIASES[text] ?? null;
}

function roundRatio(value: number): number {
  return Math.round(value * RATIO_SCALE) / RATIO_SCALE;
}

/** 层数连乘 × 末层数量。这里不做校验，调用方先用 `validatePackaging` */
export function deriveRatio(spec: PackagingSpec): number {
  const product = (spec.links ?? []).reduce(
    (acc, link) => acc * Number(link.count),
    1,
  );
  return roundRatio(product * Number(spec.amount));
}

function normalizeLink(raw: unknown): PackagingLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as { count?: unknown; unit?: unknown };
  const count = Number(item.count);
  const unit = String(item.unit ?? '').trim();
  if (!Number.isFinite(count) || count <= 0 || !Number.isInteger(count)) {
    return null;
  }
  if (!unit || unit.length > MAX_UNIT_LENGTH) return null;
  return { count, unit };
}

/**
 * 校验并归一一条层级。
 *
 * 只有全部通过才返回 `ok: true`：这里不做"猜你想说什么"——
 * 层级是库存和成本的唯一来源，猜错就是整倍数错账。
 */
export function validatePackaging(input: {
  packaging: unknown;
  purchaseUnit: string | null | undefined;
  baseUnit: BaseUnit | string;
  allowedUnits: string[];
}): PackagingValidation {
  const problems: PackagingProblem[] = [];
  const baseUnit = input.baseUnit as BaseUnit;
  const purchaseUnit = String(input.purchaseUnit ?? '').trim();
  const allowedUnits = Array.isArray(input.allowedUnits) ? input.allowedUnits : [];

  if (!purchaseUnit) {
    problems.push('PURCHASE_UNIT_MISSING');
  } else if (allowedUnits.length > 0 && !allowedUnits.includes(purchaseUnit)) {
    problems.push('PURCHASE_UNIT_NOT_ALLOWED');
  }

  const raw = input.packaging as
    | { links?: unknown; amount?: unknown; amountUnit?: unknown; amountLabel?: unknown; printedText?: unknown }
    | null
    | undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, problems: [...problems, 'INVALID_SHAPE'] };
  }

  const rawLinks = Array.isArray(raw.links) ? raw.links : [];
  if (rawLinks.length > MAX_LINKS) {
    problems.push('TOO_MANY_LINKS');
  }

  const links: PackagingLink[] = [];
  for (const item of rawLinks) {
    const link = normalizeLink(item);
    if (!link) {
      problems.push('BAD_LINK');
      continue;
    }
    links.push(link);
  }

  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    problems.push('EMPTY_AMOUNT');
  }

  const amountUnit = normalizeBaseUnitText(raw.amountUnit);
  if (amountUnit !== baseUnit) {
    problems.push('AMOUNT_UNIT_MISMATCH');
  }

  if (problems.length > 0) {
    return { ok: false, problems: [...new Set(problems)] };
  }

  const amountLabelText = String(raw.amountLabel ?? '').trim();
  const printedText = String(raw.printedText ?? '').trim();
  const spec: PackagingSpec = {
    links,
    amount: Number(Number(amount).toFixed(6)),
    amountUnit: baseUnit,
    ...(amountLabelText ? { amountLabel: amountLabelText.slice(0, 4) } : {}),
    ...(printedText ? { printedText: printedText.slice(0, 100) } : {}),
  };

  const ratio = deriveRatio(spec);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { ok: false, problems: [...new Set([...problems, 'EMPTY_AMOUNT'])] };
  }

  return { ok: true, spec, ratio };
}

/** 「1 箱 = 10 捆 × 500 克」 */
export function formatPackaging(
  spec: PackagingSpec,
  purchaseUnit: string,
): string {
  const head = `1 ${String(purchaseUnit ?? '').trim() || '件'}`;
  const parts = (spec.links ?? []).map(
    (link) => `${link.count} ${link.unit}`,
  );
  const amountLabel = spec.amountLabel || baseUnitLabel(spec.amountUnit);
  parts.push(`${spec.amount} ${amountLabel}`);
  return `${head} = ${parts.join(' × ')}`;
}

/**
 * 老数据（只有倍数）转成层级：`links: []`、末层就是那个倍数。
 *
 * 这是**无损**的：倍数不变、库存金额不变，只是从此可以在后台按层编辑。
 * 例：1590 = 1 盒 1590 克，先这么存，员工以后补上「30 枚 × 53 克」即可。
 */
export function packagingFromLegacy(input: {
  ratio: number;
  baseUnit: BaseUnit | string;
  printedText?: string | null;
}): PackagingSpec {
  const amount = Number(input.ratio);
  const printedText = String(input.printedText ?? '').trim();
  return {
    links: [],
    amount: Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(6)) : 0,
    amountUnit: input.baseUnit as BaseUnit,
    ...(printedText ? { printedText: printedText.slice(0, 100) } : {}),
  };
}

/** 从数据库 JSON 列读出层级（坏数据返回 null，调用方走 legacy 兜底） */
export function readPackaging(value: unknown): PackagingSpec | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as {
    links?: unknown;
    amount?: unknown;
    amountUnit?: unknown;
    amountLabel?: unknown;
    printedText?: unknown;
  };
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const amountUnit = normalizeBaseUnitText(raw.amountUnit);
  if (!amountUnit) return null;
  const links = Array.isArray(raw.links)
    ? raw.links.map(normalizeLink).filter((link): link is PackagingLink => link !== null)
    : [];
  const amountLabelText = String(raw.amountLabel ?? '').trim();
  const printedText = String(raw.printedText ?? '').trim();
  return {
    links,
    amount: Number(amount.toFixed(6)),
    amountUnit,
    ...(amountLabelText ? { amountLabel: amountLabelText.slice(0, 4) } : {}),
    ...(printedText ? { printedText: printedText.slice(0, 100) } : {}),
  };
}

/** 层级里出现过的单位（用于"层单位词表"和巡检） */
export function packagingUnits(spec: PackagingSpec | null): string[] {
  if (!spec) return [];
  return (spec.links ?? []).map((link) => link.unit).filter(Boolean);
}
