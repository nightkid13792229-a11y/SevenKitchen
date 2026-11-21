/**
 * 补剂的三道门禁。
 *
 * 只有三件事值得在写入前自动拦一下：数字能不能折回去、单位和口径有没有串、
 * 成本算不算得出来。其它（标签分类、添加时机、标签名称）属于"人定的"或
 * "查目录查的"，不在这里判——判不出来的一律算不过，绝不静默放行。
 */
export type SupplementGateKey = 'CONVERSION' | 'UNIT' | 'COST'

export interface SupplementGateInput {
  /** 每份几粒。标签上 Serving Size 后面那个数。 */
  servingUnitsPerDose: number | null
  /** 标签上每份的各营养素含量（键名小写）。 */
  servingNutrients: Record<string, number>
  /** 折算后要写进档案的每粒含量（键名小写）。 */
  perUnitNutrients: Record<string, number>
  baseUnit: 'G' | 'ML' | 'PCS'
  purchasePricePerPurchaseUnit: number | null
  purchaseToBaseRatio: number | null
}

export interface SupplementGateItem {
  key: SupplementGateKey
  label: string
  passed: boolean
  detail: string
  anchor: 'servingUnitsPerDose' | 'baseUnit' | 'purchasePricePerPurchaseUnit'
}

export interface SupplementGateReport {
  passed: boolean
  items: SupplementGateItem[]
}

/** 折算的显示精度：四位小数以内算相等，避免 325.0000001 被误杀。 */
const EPSILON = 1e-4

const GATE_LABELS: Record<SupplementGateKey, string> = {
  CONVERSION: '每份→每粒 折对了',
  UNIT: '单位闭合',
  COST: '成本算得出'
}

function isPositiveInteger(value: number | null): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isPositiveNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** 每份值 ÷ 每份用量。用量不是正数时返回 null——不猜，也不当 1。 */

export function convertPerUnit(
  servingValue: number,
  servingUnitsPerDose: number | null
): number | null {
  // 粉剂/液体的"每份"是小数量（0.9 g、2.5 ml），不能只认整数
  if (!isPositiveNumber(servingUnitsPerDose)) {
    return null
  }
  if (typeof servingValue !== 'number' || !Number.isFinite(servingValue)) {
    return null
  }
  return servingValue / servingUnitsPerDose
}

function checkConversion(input: SupplementGateInput): SupplementGateItem {
  const { servingUnitsPerDose, servingNutrients, perUnitNutrients } = input

  if (!isPositiveNumber(servingUnitsPerDose)) {
    return {
      key: 'CONVERSION',
      label: GATE_LABELS.CONVERSION,
      passed: false,
      detail: '先填每份多少（粒 / 克 / 毫升），才知道怎么折',
      anchor: 'servingUnitsPerDose'
    }
  }

  const keys = Object.keys(servingNutrients)
  if (keys.length === 0) {
    return {
      key: 'CONVERSION',
      label: GATE_LABELS.CONVERSION,
      passed: false,
      detail: '还没有任何营养素可以折',
      anchor: 'servingUnitsPerDose'
    }
  }

  const mismatched: string[] = []
  for (const key of keys) {
    const servingValue = servingNutrients[key]
    if (typeof servingValue !== 'number') {
      continue
    }
    const expected = servingValue / servingUnitsPerDose
    const actual = perUnitNutrients[key]
    if (typeof actual !== 'number' || Math.abs(actual - expected) > EPSILON) {
      mismatched.push(key.toLowerCase())
    }
  }

  if (mismatched.length > 0) {
    return {
      key: 'CONVERSION',
      label: GATE_LABELS.CONVERSION,
      passed: false,
      detail: `对不上：${mismatched.join(', ')}`,
      anchor: 'servingUnitsPerDose'
    }
  }

  const unitText = input.baseUnit === 'G' ? 'g' : input.baseUnit === 'ML' ? 'ml' : '粒'
  return {
    key: 'CONVERSION',
    label: GATE_LABELS.CONVERSION,
    passed: true,
    detail: `每份 ${servingUnitsPerDose} ${unitText}，已折成每 1 ${unitText}`,
    anchor: 'servingUnitsPerDose'
  }
}

function checkUnit(input: SupplementGateInput): SupplementGateItem {
  if (!isPositiveNumber(input.servingUnitsPerDose)) {
    return {
      key: 'UNIT',
      label: GATE_LABELS.UNIT,
      passed: false,
      detail: '每份多少必须大于 0（粉按克、液体按毫升，可以是小数）',
      anchor: 'servingUnitsPerDose'
    }
  }

  if (input.baseUnit === 'PCS') {
    return {
      key: 'UNIT',
      label: GATE_LABELS.UNIT,
      passed: true,
      detail: '按粒记账，营养按每 1 粒记',
      anchor: 'baseUnit'
    }
  }

  return {
    key: 'UNIT',
    label: GATE_LABELS.UNIT,
    passed: true,
    detail:
      input.baseUnit === 'G'
        ? '按克记账，营养按每 1 g 记'
        : '按毫升记账，营养按每 1 ml 记',
    anchor: 'baseUnit'
  }
}

function checkCost(input: SupplementGateInput): SupplementGateItem {
  if (!isPositiveNumber(input.purchasePricePerPurchaseUnit)) {
    return {
      key: 'COST',
      label: GATE_LABELS.COST,
      passed: false,
      detail: '采购价要大于 0，不然算不出每粒成本',
      anchor: 'purchasePricePerPurchaseUnit'
    }
  }

  if (!isPositiveNumber(input.purchaseToBaseRatio)) {
    return {
      key: 'COST',
      label: GATE_LABELS.COST,
      passed: false,
      detail: '换算倍数要大于 0，否则不知道 1 个采购单位是多少粒',
      anchor: 'purchasePricePerPurchaseUnit'
    }
  }

  return {
    key: 'COST',
    label: GATE_LABELS.COST,
    passed: true,
    detail: '每粒成本算得出来',
    anchor: 'purchasePricePerPurchaseUnit'
  }
}

export function evaluateSupplementGates(
  input: SupplementGateInput
): SupplementGateReport {
  const items = [checkConversion(input), checkUnit(input), checkCost(input)]
  return { passed: items.every((item) => item.passed), items }
}
