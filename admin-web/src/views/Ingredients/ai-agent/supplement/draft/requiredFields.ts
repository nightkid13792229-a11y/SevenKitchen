/**
 * 必填项展示：后端 completeness.missing 只回键名（name/groupId...），
 * 这里翻成「字段名 + 所在区块」，编辑页才能告诉人还差什么、点一下跳过去。
 */
export type DraftSectionKey =
  | 'basic'
  | 'nutrition'
  | 'label'
  | 'retail'
  | 'diy'
  | 'procurement'
  | 'equivalence'
  | 'evidence'

export interface RequiredFieldMeta {
  label: string
  section: DraftSectionKey
}

export interface RequiredMissingRow extends RequiredFieldMeta {
  key: string
}

const REQUIRED_FIELD_META: Record<string, RequiredFieldMeta> = {
  name: { label: '原料名称', section: 'basic' },
  baseUnit: { label: '基准单位', section: 'basic' },
  unitDisplayLabel: { label: '展示单位', section: 'basic' },
  physicalForm: { label: '物理形态', section: 'basic' },
  servingUnitsPerDose: { label: '每份量', section: 'basic' },
  purchaseUnit: { label: '采购单位', section: 'basic' },
  purchaseToBaseRatio: { label: '换算倍数', section: 'basic' },
  currentPricePerPurchaseUnit: { label: '采购价', section: 'basic' },
  addTiming: { label: '添加时机', section: 'label' },
  nutrition: { label: '营养含量与默认目标', section: 'nutrition' },
  labelCategory: { label: '标签分类', section: 'label' },
  labelNames: { label: '标签名称', section: 'label' },
  tagNames: { label: '分类标签', section: 'label' },
  shelfLifeMonths: { label: '原厂保质期', section: 'retail' },
  noSaleReason: { label: '不上架原因', section: 'retail' },
  platform: { label: 'DIY 平台', section: 'diy' },
  linkUrl: { label: 'DIY 购买链接', section: 'diy' },
  groupId: { label: '等价组意向', section: 'equivalence' }
}

export function requiredFieldMeta(key: string): RequiredFieldMeta | null {
  return REQUIRED_FIELD_META[key] ?? null
}

/** 只返回认识的键；未知键不展示，避免把内部 key 露给用户。 */
export function requiredMissingRows(
  missing: readonly string[]
): RequiredMissingRow[] {
  const rows: RequiredMissingRow[] = []
  for (const key of missing) {
    const meta = REQUIRED_FIELD_META[key]
    if (meta) rows.push({ key, ...meta })
  }
  return rows
}
