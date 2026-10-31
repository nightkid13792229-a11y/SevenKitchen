import { NUTRITION_FIELD_CATALOG } from './nutrition-field-catalog';

/**
 * 一条来源记录的「字段覆盖率」。
 *
 * 分子只数**有值且不为 0** 的目录字段：来源库里大量 0 是“没测”而不是“真的是 0”，
 * 把它们算成已填会让覆盖率虚高。分母固定是营养字段目录的字段总数（当前 60）。
 *
 * 注意：这和导入审计的「必需营养素覆盖率」（FEDIAF 46 项、0 算已填）是两套口径，
 * 不要合并——后者服务合规门槛，改了口径会影响导入。
 */
export interface CatalogCoverage {
  filled: number;
  total: number;
  percent: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 只认有限数字（含数字字符串）；null / 缺失 / 非数字都算没有值。 */
function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** 按目录读一个字段（形如 `macros.crudeProtein`）。 */
export function readCatalogFieldValue(
  profile: unknown,
  fieldPath: string,
): number | null {
  if (!isRecord(profile)) {
    return null;
  }
  const [tabKey, fieldKey] = fieldPath.split('.');
  const tab = tabKey ? profile[tabKey] : undefined;
  if (!isRecord(tab) || !fieldKey) {
    return null;
  }
  return readFiniteNumber(tab[fieldKey]);
}

export function computeCatalogCoverage(profile: unknown): CatalogCoverage {
  const total = NUTRITION_FIELD_CATALOG.length;
  let filled = 0;

  for (const field of NUTRITION_FIELD_CATALOG) {
    const value = readCatalogFieldValue(profile, field.fieldPath);
    if (value !== null && value !== 0) {
      filled += 1;
    }
  }

  return {
    filled,
    total,
    percent: total === 0 ? 0 : Math.round((filled / total) * 1000) / 10,
  };
}
