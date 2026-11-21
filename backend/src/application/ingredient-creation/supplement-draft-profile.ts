/**
 * 补剂草稿 → 营养档案（纯函数）。
 *
 * 草稿里存的是「标签每份含量」，正式档案要的是「每 1 个基准单位含量」：
 *
 * - 基准口径按基准单位走：PCS → `PER_1_PCS`，G → `PER_1_G`，ML → `PER_1_ML`；
 *   不能统一成 `PER_SERVING`，否则 0.9 g / 2.5 ml 这类小数份量会被读成「一份」。
 * - 每单位值 = 每份含量 ÷ 每份量，只在服务端算；客户端不送、服务端也不信。
 * - 只写后端营养字段目录里认识的字段；目录外字段、非法数值（负/NaN/Infinity）
 *   直接跳过，由 `validateSupplementDraftBasics` 报阻断，不在写入阶段抛错。
 *
 * 本函数只负责建档案，不做任何 DB 操作，方便 Task 6/10 复用同一份折算结果。
 */

import { findNutritionField } from '../../domain/ingredient/nutrition-field-catalog';
import { createEmptyNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';
import type {
  SupplementBaseUnit,
  SupplementDraftPayload,
} from './supplement-draft.types';

/**
 * 基准单位 → 档案口径。
 *
 * `PER_1_PCS` 还没写进 `NutritionRawBasisType`（类型在领域层，Task 4 不改），
 * 所以下面给 meta 赋值的整体走与 `SupplementIngredientService.buildProfile`
 * 相同的 `as unknown as NutritionProfileV2['meta']` 转换。
 */
const RAW_BASIS_BY_BASE_UNIT: Record<SupplementBaseUnit, string> = {
  PCS: 'PER_1_PCS',
  G: 'PER_1_G',
  ML: 'PER_1_ML',
};

export function buildSupplementProfile(
  payload: SupplementDraftPayload,
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  const { basic, nutrition } = payload;

  profile.meta = {
    ...profile.meta,
    rawBasisType: RAW_BASIS_BY_BASE_UNIT[basic.baseUnit],
    sampleState: 'CONCENTRATE',
    isEdiblePortionBasis: true,
    // amountUnitLabel / servingUnitLabel 在 NutritionMeta 里没有声明，但档案读取器
    // 按约定读它们；不写这两个键，按粒记的补剂会被当成「按克记」。
    amountUnitLabel: basic.unitDisplayLabel,
    servingUnitLabel: basic.unitDisplayLabel,
    sourceType: 'SUPPLEMENT_LABEL',
    fieldSources: {},
    fieldDisplayUnits: {},
  } as unknown as NutritionProfileV2['meta'];

  const servingUnitsPerDose = basic.servingUnitsPerDose;
  // 份量缺失/非正：档案保持空值，不抛错（基础校验会拦）。
  if (
    servingUnitsPerDose === null ||
    !Number.isFinite(servingUnitsPerDose) ||
    servingUnitsPerDose <= 0
  ) {
    return profile;
  }

  for (const [fieldPath, servingValue] of Object.entries(
    nutrition.servingNutrients,
  )) {
    const field = findNutritionField(fieldPath);
    if (!field) {
      continue;
    }
    if (!Number.isFinite(servingValue) || servingValue < 0) {
      continue;
    }

    const tab = profile[field.tabKey] as unknown as Record<
      string,
      number | null
    >;
    tab[field.fieldKey] = servingValue / servingUnitsPerDose;
  }

  return profile;
}
