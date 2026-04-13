import {
  getIngredientNutritionResolvedDisplayUnit,
  INGREDIENT_NUTRITION_TAB_DEFINITIONS,
  INGREDIENT_NUTRITION_FIELD_UNITS,
  INGREDIENT_NUTRITION_TAB_EMPTY_RECORDS,
  type IngredientNutritionTabKey
} from '@/constants/ingredientNutrition'
import type {
  ActiveNutrientValue,
  AminoAcidNutritionProfileTab,
  FattyAcidNutritionProfileTab,
  MacroNutritionProfileTab,
  MineralNutritionProfileTab,
  NutritionCustomItem,
  NutritionItem,
  NutritionProfile,
  NutritionProfileV2,
  NutritionRawBasisType,
  VitaminNutritionProfileTab
} from '@/types/ingredient'

interface LegacyNutritionProfile {
  items: NutritionItem[]
}

type NutritionProfileInput = NutritionProfile | LegacyNutritionProfile

function createAliasMap<TKey extends string>(
  tabKey: IngredientNutritionTabKey,
  extraAliases: Record<string, TKey>
): Record<string, TKey> {
  const tabDefinition = INGREDIENT_NUTRITION_TAB_DEFINITIONS.find((tab) => tab.key === tabKey)
  const baseAliases = Object.fromEntries(
    (tabDefinition?.fields ?? []).flatMap((field) => ([
      [normalizeAlias(field.key), field.key as TKey],
      [normalizeAlias(field.label), field.key as TKey]
    ]))
  ) as Record<string, TKey>

  return {
    ...baseAliases,
    ...extraAliases
  }
}

const MACRO_ALIASES = createAliasMap<keyof NutritionProfileV2['macros']>('macros', {
  protein: 'crudeProtein',
  proteincontent: 'crudeProtein',
  fiber: 'fiber',
  solublefiber: 'solubleFiber',
  insolublefiber: 'insolubleFiber'
})

const MINERAL_ALIASES = createAliasMap<keyof NutritionProfileV2['minerals']>('minerals', {
  ca: 'calcium',
  p: 'phosphorus',
  i: 'iodine',
  '氯化物': 'chloride'
})

const VITAMIN_ALIASES = createAliasMap<keyof NutritionProfileV2['vitamins']>('vitamins', {
  vitaminb1: 'vitaminB1',
  thiamine: 'vitaminB1',
  vitaminb2: 'vitaminB2',
  riboflavin: 'vitaminB2',
  vitaminb3: 'vitaminB3',
  niacin: 'vitaminB3',
  vitaminb5: 'vitaminB5',
  pantothenicacid: 'vitaminB5',
  vitaminb6: 'vitaminB6',
  pyridoxine: 'vitaminB6',
  vitaminb7: 'vitaminB7',
  biotin: 'vitaminB7',
  vitaminb9: 'vitaminB9',
  folate: 'vitaminB9',
  folicacid: 'vitaminB9',
  vitaminb12: 'vitaminB12',
  cobalamin: 'vitaminB12',
  b7: 'vitaminB7',
  b9: 'vitaminB9'
})

const FATTY_ACID_ALIASES = createAliasMap<keyof NutritionProfileV2['fattyAcids']>('fattyAcids', {
  alphalinolenicacid: 'alphaLinolenicAcid',
  'α亚麻酸': 'alphaLinolenicAcid',
  omega3: 'alphaLinolenicAcid'
})

const AMINO_ACID_ALIASES = createAliasMap<keyof NutritionProfileV2['aminoAcids']>('aminoAcids', {})

type IngredientNutritionFormValue = NutritionProfileV2

function cloneTabRecord(tabKey: IngredientNutritionTabKey) {
  return { ...INGREDIENT_NUTRITION_TAB_EMPTY_RECORDS[tabKey] }
}

function isRawBasisType(value: unknown): value is NutritionRawBasisType {
  return (
    value === 'PER_100_G' ||
    value === 'PER_100_ML' ||
    value === 'PER_1_G' ||
    value === 'PER_1_ML' ||
    value === 'PER_SERVING'
  )
}

function normalizeAlias(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[_\s-]+/g, '')
}

function mapLegacyBasisType(
  basisType: NutritionItem['basisType'] | undefined
): NutritionRawBasisType {
  if (basisType === 'PER_1_PCS') {
    return 'PER_SERVING'
  }

  return isRawBasisType(basisType) ? basisType : 'PER_100_G'
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeUnitLabel(unit: string | null | undefined): string {
  const normalized = (unit ?? '').trim()
  const compact = normalized.toLowerCase()

  if (compact === 'ug' || compact === 'μg' || compact === 'mcg') {
    return 'μg'
  }

  if (compact === 'iu') {
    return 'IU'
  }

  return normalized
}

function hasCompatibleCanonicalUnit(fieldKey: string, unit: string): boolean {
  return normalizeUnitLabel(INGREDIENT_NUTRITION_FIELD_UNITS[fieldKey]) === normalizeUnitLabel(unit)
}

function normalizeCustomItem(item: NutritionCustomItem): NutritionCustomItem | null {
  const name = item.name?.trim()
  const unit = item.unit?.trim()
  const value = normalizeNumber(item.value)

  if (!name || !unit || value === null) {
    return null
  }

  return {
    name,
    value,
    unit,
    rawBasisType: isRawBasisType(item.rawBasisType) ? item.rawBasisType : undefined,
    note: item.note?.trim() || null
  }
}

function normalizeFieldDisplayUnits(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }

  return Object.entries(input as Record<string, unknown>).reduce<Record<string, string>>((result, [fieldKey, unit]) => {
    if (fieldKey.trim().length === 0 || typeof unit !== 'string' || unit.trim().length === 0) {
      return result
    }

    const resolvedUnit = getIngredientNutritionResolvedDisplayUnit(fieldKey, unit)
    if (!resolvedUnit) {
      return result
    }

    result[fieldKey] = resolvedUnit
    return result
  }, {})
}

function assignLegacyItem(profile: NutritionProfileV2, item: NutritionItem): void {
  const nutrientCode = normalizeAlias(item.nutrientCode)
  const nutrientName = normalizeAlias(item.nutrientName)
  const macroKey = MACRO_ALIASES[nutrientCode] ?? MACRO_ALIASES[nutrientName]

  if (macroKey) {
    if (hasCompatibleCanonicalUnit(macroKey, item.unit)) {
      profile.macros[macroKey] = item.value
      return
    }
  }

  const mineralKey = MINERAL_ALIASES[nutrientCode] ?? MINERAL_ALIASES[nutrientName]
  if (mineralKey) {
    if (hasCompatibleCanonicalUnit(mineralKey, item.unit)) {
      profile.minerals[mineralKey] = item.value
      return
    }
  }

  const vitaminKey = VITAMIN_ALIASES[nutrientCode] ?? VITAMIN_ALIASES[nutrientName]
  if (vitaminKey) {
    if (hasCompatibleCanonicalUnit(vitaminKey, item.unit)) {
      profile.vitamins[vitaminKey] = item.value
      return
    }
  }

  const fattyAcidKey = FATTY_ACID_ALIASES[nutrientCode] ?? FATTY_ACID_ALIASES[nutrientName]
  if (fattyAcidKey) {
    if (hasCompatibleCanonicalUnit(fattyAcidKey, item.unit)) {
      profile.fattyAcids[fattyAcidKey] = item.value
      return
    }
  }

  const aminoAcidKey = AMINO_ACID_ALIASES[nutrientCode] ?? AMINO_ACID_ALIASES[nutrientName]
  if (aminoAcidKey) {
    if (hasCompatibleCanonicalUnit(aminoAcidKey, item.unit)) {
      profile.aminoAcids[aminoAcidKey] = item.value
      return
    }
  }

  profile.customItems.push({
    name: item.nutrientName,
    value: item.value,
    unit: item.unit,
    rawBasisType: mapLegacyBasisType(item.basisType),
    note: item.notes ?? null
  })
}

function isLegacyNutritionProfile(input: unknown): input is LegacyNutritionProfile {
  return !!input && typeof input === 'object' && Array.isArray((input as LegacyNutritionProfile).items)
}

function hasMixedLegacyBasisType(items: NutritionItem[]): boolean {
  return new Set(items.map((item) => mapLegacyBasisType(item.basisType))).size > 1
}

function cleanTabRecord<TTab extends Record<string, number | null>>(
  tabKey: IngredientNutritionTabKey,
  input: Record<string, unknown> | null | undefined
): TTab {
  const nextRecord = cloneTabRecord(tabKey) as TTab
  const writableRecord = nextRecord as Record<string, number | null>

  for (const field of INGREDIENT_NUTRITION_TAB_DEFINITIONS.find((tab) => tab.key === tabKey)?.fields ?? []) {
    writableRecord[field.key] = normalizeNumber(input?.[field.key])
  }

  return nextRecord
}

export function createEmptyIngredientNutritionFormValue(): IngredientNutritionFormValue {
  return {
    meta: {
      rawBasisType: 'PER_100_G',
      sampleState: undefined,
      isEdiblePortionBasis: false,
      ediblePortionRate: null,
      densityGPerMl: null,
      servingWeightG: null,
      sourceType: null,
      sourceTitle: null,
      sourceProvider: null,
      attachments: [],
      confidenceLevel: null,
      fieldDisplayUnits: {},
      versionNote: null
    },
    macros: cloneTabRecord('macros') as MacroNutritionProfileTab,
    minerals: cloneTabRecord('minerals') as MineralNutritionProfileTab,
    vitamins: cloneTabRecord('vitamins') as VitaminNutritionProfileTab,
    fattyAcids: cloneTabRecord('fattyAcids') as FattyAcidNutritionProfileTab,
    aminoAcids: cloneTabRecord('aminoAcids') as AminoAcidNutritionProfileTab,
    customItems: []
  }
}

export function normalizeIngredientNutritionProfileToForm(
  input: NutritionProfileInput | null | undefined
): IngredientNutritionFormValue {
  if (!input) {
    return createEmptyIngredientNutritionFormValue()
  }

  if (isLegacyNutritionProfile(input)) {
    const profile = createEmptyIngredientNutritionFormValue()
    const mixedBasisType = hasMixedLegacyBasisType(input.items)
    if (!mixedBasisType) {
      profile.meta.rawBasisType = mapLegacyBasisType(input.items[0]?.basisType)
    } else {
      profile.meta.versionNote = '历史营养数据存在混合口径，请人工复核'
    }

    for (const item of input.items) {
      if (mixedBasisType) {
        profile.customItems.push({
          name: item.nutrientName,
          value: item.value,
          unit: item.unit,
          rawBasisType: mapLegacyBasisType(item.basisType),
          note: item.notes ?? null
        })
        continue
      }

      assignLegacyItem(profile, item)
    }

    return profile
  }

  const empty = createEmptyIngredientNutritionFormValue()

  return {
    meta: {
      ...empty.meta,
      ...(input.meta ?? {}),
      rawBasisType: isRawBasisType(input.meta?.rawBasisType)
        ? input.meta.rawBasisType
        : 'PER_100_G',
      isEdiblePortionBasis: !!input.meta?.isEdiblePortionBasis,
      ediblePortionRate: normalizeNumber(input.meta?.ediblePortionRate),
      densityGPerMl: normalizeNumber(input.meta?.densityGPerMl),
      servingWeightG: normalizeNumber(input.meta?.servingWeightG),
      fieldDisplayUnits: normalizeFieldDisplayUnits(input.meta?.fieldDisplayUnits),
      attachments: Array.isArray(input.meta?.attachments)
        ? input.meta.attachments.filter((attachment): attachment is string => typeof attachment === 'string' && attachment.trim().length > 0)
        : []
    },
    macros: cleanTabRecord<MacroNutritionProfileTab>('macros', input.macros),
    minerals: cleanTabRecord<MineralNutritionProfileTab>('minerals', input.minerals),
    vitamins: cleanTabRecord<VitaminNutritionProfileTab>('vitamins', input.vitamins),
    fattyAcids: cleanTabRecord<FattyAcidNutritionProfileTab>('fattyAcids', input.fattyAcids),
    aminoAcids: cleanTabRecord<AminoAcidNutritionProfileTab>('aminoAcids', input.aminoAcids),
    customItems: Array.isArray(input.customItems)
      ? input.customItems
          .map((item) => normalizeCustomItem(item))
          .filter((item): item is NutritionCustomItem => item !== null)
      : []
  }
}

function hasAnyStructuredNutritionValue(profile: IngredientNutritionFormValue): boolean {
  const tabKeys: IngredientNutritionTabKey[] = ['macros', 'minerals', 'vitamins', 'fattyAcids', 'aminoAcids']

  return tabKeys.some((tabKey) =>
    Object.values(profile[tabKey]).some((value) => value !== null)
  ) || profile.customItems.length > 0
}

function hasMeaningfulMetaValue(profile: IngredientNutritionFormValue): boolean {
  return (
    profile.meta.rawBasisType !== 'PER_100_G' ||
    !!profile.meta.sampleState ||
    profile.meta.densityGPerMl !== null ||
    profile.meta.servingWeightG !== null ||
    !!profile.meta.sourceType ||
    (profile.meta.attachments?.length ?? 0) > 0 ||
    !!profile.meta.versionNote?.trim()
  )
}

export function buildIngredientNutritionPayload(
  formValue: IngredientNutritionFormValue | null | undefined
): NutritionProfileV2 | null {
  if (!formValue) {
    return null
  }

  const normalized = normalizeIngredientNutritionProfileToForm(formValue)

  if (!hasAnyStructuredNutritionValue(normalized)) {
    if (!hasMeaningfulMetaValue(normalized)) {
      return null
    }
  }

  return {
    meta: {
      rawBasisType: normalized.meta.rawBasisType,
      sampleState: normalized.meta.sampleState,
      densityGPerMl: normalized.meta.densityGPerMl,
      servingWeightG: normalized.meta.servingWeightG,
      sourceType: normalized.meta.sourceType ?? null,
      fieldDisplayUnits: normalizeFieldDisplayUnits(normalized.meta.fieldDisplayUnits),
      attachments: normalized.meta.attachments ?? [],
      versionNote: normalized.meta.versionNote?.trim() || null
    },
    macros: cleanTabRecord<MacroNutritionProfileTab>('macros', normalized.macros),
    minerals: cleanTabRecord<MineralNutritionProfileTab>('minerals', normalized.minerals),
    vitamins: cleanTabRecord<VitaminNutritionProfileTab>('vitamins', normalized.vitamins),
    fattyAcids: cleanTabRecord<FattyAcidNutritionProfileTab>('fattyAcids', normalized.fattyAcids),
    aminoAcids: cleanTabRecord<AminoAcidNutritionProfileTab>('aminoAcids', normalized.aminoAcids),
    customItems: normalized.customItems
      .map((item) => normalizeCustomItem(item))
      .filter((item): item is NutritionCustomItem => item !== null)
  }
}

export function buildSupplementActiveNutrientsFromNutritionProfile(
  nutritionProfile: NutritionProfile | null | undefined,
  fallback: Record<string, ActiveNutrientValue> = {}
): Record<string, ActiveNutrientValue> {
  if (!nutritionProfile) {
    return { ...(fallback || {}) }
  }

  const activeNutrients: Record<string, ActiveNutrientValue> = {}
  const normalizedProfile = normalizeIngredientNutritionProfileToForm(nutritionProfile)
  const normalizeLegacyTargetKey = (label: string) => label.replace(/\s+/g, '')

  for (const tab of INGREDIENT_NUTRITION_TAB_DEFINITIONS) {
    const tabValues = normalizedProfile[tab.key] as Record<string, number | null>

    for (const field of tab.fields) {
      const value = tabValues[field.key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        activeNutrients[normalizeLegacyTargetKey(field.label)] = { value, unit: field.unit }
      }
    }
  }

  const epa = normalizedProfile.fattyAcids.epa
  const dha = normalizedProfile.fattyAcids.dha
  const combinedOmega3 = [epa, dha]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0)

  if (combinedOmega3 > 0) {
    activeNutrients['EPA+DHA'] = { value: combinedOmega3, unit: 'g' }
  }

  for (const item of normalizedProfile.customItems ?? []) {
    const name = item.name.trim()
    const unit = item.unit.trim()
    if (name && unit && typeof item.value === 'number' && Number.isFinite(item.value)) {
      activeNutrients[name] = { value: item.value, unit }
    }
  }

  return activeNutrients
}

export type { IngredientNutritionFormValue }
