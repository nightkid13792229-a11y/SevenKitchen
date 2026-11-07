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

export function assertCommitProcurementSku(
  input: CommitProcurementSkuInput,
): void {
  if (!input || typeof input !== 'object') {
    throw new BadRequestException(
      '建档必须同时新增一条采购商品（含价格与换算），否则这条原料没有成本',
    );
  }

  const packCount = Number(input.packCount);
  if (!Number.isInteger(packCount) || packCount <= 0) {
    throw new BadRequestException('采购商品的「一箱几件」（件数）必须是正整数');
  }

  const netContent = Number(input.netContentPerPack);
  if (!Number.isFinite(netContent) || netContent <= 0) {
    throw new BadRequestException('采购商品的「每件净含量」必须大于 0');
  }

  const price = Number(input.currentPurchasePrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new BadRequestException(
      '采购商品的「这一件多少钱」（价格）必须大于 0',
    );
  }

  if (!input.purchaseUnit || !String(input.purchaseUnit).trim()) {
    throw new BadRequestException('采购商品的采购单位（袋 / 盒 / 箱）不能为空');
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
