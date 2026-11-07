import { BadRequestException } from '@nestjs/common';

/**
 * 建档时携带的那一条采购商品（2026-11-07 硬门禁）。
 *
 * 为什么必须和建档同一次提交：食材的成本只能有两个来源 ——
 * ① 建档时用第一条采购商品初始化；② 之后由采购报销覆盖。
 * 如果建档和补商品是两步，中间就存在「有原料、没价」的状态，
 * 一进食谱就按 0 元算，于是又要靠红标、待补清单、发布拦截去擦屁股。
 * 一次提交之后，这种原料在库里根本不存在。
 *
 * 换算由服务端算（件数 × 每件净含量）：前端乘错一次，库存就差几十倍。
 */
export interface CommitProcurementSkuInput {
  /** 商品名；留空时用原料名兜底 */
  name?: string | null;
  /** 采购单位：袋 / 盒 / 箱 */
  purchaseUnit: string;
  /** 一箱（一袋、一盒）几件 */
  packCount: number;
  /** 每件净含量，单位是原料的基准单位（g / ml / 个） */
  netContentPerPack: number;
  /** 这一件多少钱 */
  currentPurchasePrice: number;
  /** 商品名留空时的兜底（原料名） */
  fallbackName?: string;
}

export interface BuiltCommitProcurementSku {
  name: string;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPurchasePrice: number;
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * 整块采购商品都没带时的提示（2026-11-08）。
 *
 * 这条提示是给「页面还是旧版本、压根没有采购商品表单」的人看的：
 * 以前这里被 `{...undefined}` 摊成空对象，于是报「一箱几件必须是正整数」，
 * 人只会去翻件数，永远找不到真正要填的东西。
 */
export const MISSING_COMMIT_PROCUREMENT_SKU =
  '写入前必须填这条原料的采购商品（每件净含量 + 这一件多少钱），否则这条原料没有成本；如果页面上根本没有这块表单，说明当前页面是旧版本，刷新页面就能看到';

/** 缺省（没传 / 空串）和「传了但不合法」要分开说：前者让人去填，后者让人去改。 */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * 校验这条采购商品能不能和原料一起写入。
 *
 * 一次把**所有**没填 / 填错的问题列完：五格表单如果一处只报一个，
 * 人得来回四轮才能提交。
 */
export function assertCommitProcurementSku(
  input: CommitProcurementSkuInput | null | undefined,
): void {
  if (!input || typeof input !== 'object') {
    throw new BadRequestException(MISSING_COMMIT_PROCUREMENT_SKU);
  }

  const problems: string[] = [];

  if (isBlank(input.packCount)) {
    problems.push('「一箱几件」没填（只买 1 件就填 1）');
  } else if (
    !Number.isInteger(Number(input.packCount)) ||
    Number(input.packCount) <= 0
  ) {
    problems.push('「一箱几件」（件数）必须是正整数');
  }

  if (isBlank(input.netContentPerPack)) {
    problems.push('「每件净含量」没填（一件多少克 / 多少毫升）');
  } else if (
    !Number.isFinite(Number(input.netContentPerPack)) ||
    Number(input.netContentPerPack) <= 0
  ) {
    problems.push('「每件净含量」必须大于 0');
  }

  if (isBlank(input.currentPurchasePrice)) {
    problems.push('「这一件多少钱」没填');
  } else if (
    !Number.isFinite(Number(input.currentPurchasePrice)) ||
    Number(input.currentPurchasePrice) <= 0
  ) {
    problems.push('「这一件多少钱」（价格）必须大于 0');
  }

  if (isBlank(input.purchaseUnit)) {
    problems.push('「采购单位」（袋 / 盒 / 箱）不能为空');
  }

  if (problems.length > 0) {
    throw new BadRequestException(`采购商品还不能写入：${problems.join('；')}`);
  }
}

export function buildCommitProcurementSku(
  input: CommitProcurementSkuInput,
): BuiltCommitProcurementSku {
  assertCommitProcurementSku(input);

  const name = String(input.name ?? '').trim() || input.fallbackName || '';

  return {
    name,
    purchaseUnit: String(input.purchaseUnit).trim(),
    purchaseToBaseRatio: round6(
      Number(input.packCount) * Number(input.netContentPerPack),
    ),
    currentPurchasePrice: Number(input.currentPurchasePrice),
  };
}
