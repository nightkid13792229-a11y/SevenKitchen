/**
 * 补剂草稿 → 营养档案（纯函数）。
 *
 * 草稿里存的是「标签每份含量」，正式档案要的是「每 1 个基准单位含量」：
 *
 * - 基准口径按基准单位走：PCS → `PER_SERVING`（按 1 个单位记，单位标签写粒/片/胶囊），
 *   G → `PER_1_G`，ML → `PER_1_ML`。
 *   PCS 不用 `PER_1_PCS`：领域 raw basis（`isRawBasisType`、配方设计器读路径）不认它，
 *   会当成缺失；`SupplementDosageService.normalizeBasis` 本来就把 `PER_1_PCS`
 *   映射成 `PER_SERVING`，所以两边口径一致。
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
 * PCS 用 `PER_SERVING` 而不是 `PER_1_PCS`：后者不在 `NutritionRawBasisType` 里，
 * `nutrition-profile-reader.getStrictRawBasisType` 会判为不支持，配方设计器读到
 * 的就是「缺失」；而 `SupplementDosageService.normalizeBasis` 又会把 `PER_1_PCS`
 * 当成 `PER_SERVING`，两边口径本就一致。`servingUnitLabel` 写粒/片/胶囊，
 * 读路径据此按「1 个单位 = 1 个 PCS」直接乘用量。
 *
 * 下面给 meta 赋值整体走与 `SupplementIngredientService.buildProfile` 相同的
 * `as unknown as NutritionProfileV2['meta']` 转换（amountUnitLabel /
 * servingUnitLabel 没在 NutritionMeta 里声明）。
 */
const RAW_BASIS_BY_BASE_UNIT: Record<SupplementBaseUnit, string> = {
  PCS: 'PER_SERVING',
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
