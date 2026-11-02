/**
 * 「新增采购商品」的表单校验与换算（2026-11-01）。
 *
 * 单独抽出来是为了能在单测里钉死那条最要命的规矩：
 * **换算 = 件数 × 每件净含量**，由前端算给用户看、服务端再算一次入库。
 * 只把单件规格（330）当成一箱（7920）会让库存差 N 倍，而且系统不会报错。
 */

export interface ProcurementSkuFormState {
  name: string;
  purchaseChannel: string;
  purchaseUnit: string;
  packCount: number | null;
  netContentPerPack: number | null;
  currentPurchasePrice: number | null;
}

export interface ProcurementSkuFormOptions {
  /** 服务端白名单里、这道原料基准单位允许的采购单位 */
  purchaseUnits: string[];
  /** 「克 / 毫升 / 个」，只用于提示文案 */
  baseUnitText: string;
}

export interface ProcurementSkuFormError {
  field: keyof ProcurementSkuFormState;
  message: string;
}

export type ProcurementSkuFormValidation =
  | { ok: true }
  | { ok: false; errors: ProcurementSkuFormError[] };

const isPositiveNumber = (value: number | null): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function computePurchaseToBaseRatio(input: {
  packCount: number | null;
  netContentPerPack: number | null;
}): number {
  const { packCount, netContentPerPack } = input;
  if (!isPositiveNumber(packCount) || !isPositiveNumber(netContentPerPack)) {
    return 0;
  }
  return packCount * netContentPerPack;
}

export function validateProcurementSkuForm(
  state: ProcurementSkuFormState,
  options: ProcurementSkuFormOptions,
): ProcurementSkuFormValidation {
  const errors: ProcurementSkuFormError[] = [];

  if (!state.name || state.name.trim().length === 0) {
    errors.push({ field: 'name', message: '请填商品名称' });
  }

  if (!state.purchaseChannel || state.purchaseChannel.trim().length === 0) {
    errors.push({ field: 'purchaseChannel', message: '请选采购渠道' });
  }

  if (!state.purchaseUnit) {
    errors.push({ field: 'purchaseUnit', message: '请选采购单位' });
  } else if (!options.purchaseUnits.includes(state.purchaseUnit)) {
    errors.push({
      field: 'purchaseUnit',
      message: `采购单位只能是：${options.purchaseUnits.join('、')}`,
    });
  }

  if (!isPositiveNumber(state.packCount)) {
    errors.push({ field: 'packCount', message: '请填一箱/一袋里几件' });
  }

  if (!isPositiveNumber(state.netContentPerPack)) {
    errors.push({
      field: 'netContentPerPack',
      message: `请填每件多少${options.baseUnitText}`,
    });
  }

  if (state.currentPurchasePrice !== null) {
    if (
      !Number.isFinite(state.currentPurchasePrice) ||
      state.currentPurchasePrice < 0
    ) {
      errors.push({ field: 'currentPurchasePrice', message: '单价不能是负数' });
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
