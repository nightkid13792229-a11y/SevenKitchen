import type {
  AssessmentTargetOverride,
  FediafAssessmentTarget,
} from '../../../domain/recipe-designer/types';
import { convertNutrientValue } from '../../../domain/recipe-designer/unit-conversion';
import type { AgentNutritionPlan } from './propose-plan';

const KEY_ALIASES: Record<string, string[]> = {
  fat: ['fat', 'crudeFat'],
  protein: ['protein', 'crudeProtein'],
  sodium: ['sodium'],
  calcium: ['calcium'],
  phosphorus: ['phosphorus'],
  caPRatio: ['calciumPhosphorusRatio', 'ca_p_ratio'],
  linoleicAcid: ['linoleicAcid', 'linoleic_acid'],
  epaDha: ['epaDha', 'epa_dha', 'omega3', 'omega_3'],
};

export interface PlanTargetResolution {
  overrides: AssessmentTargetOverride[];
  unsupported: Array<{ key: string; reason: string }>;
}

/**
 * 把已确认方案的数值约束翻译成评估引擎的 target overrides。
 *
 * - 只覆盖方案明确写到的方向；缺失的一侧沿用 FEDIAF 基线；
 * - PERCENT_DM / PER_1000_KCAL 直接映射；
 * - PER_MJ 换算成 /1000 kcal；
 * - G_PER_DAY / OTHER 暂不自动评估，明确列 unsupported。
 */
export function buildPlanTargetOverrides(
  plan: AgentNutritionPlan,
  targets: FediafAssessmentTarget[],
): PlanTargetResolution {
  const overrides: AssessmentTargetOverride[] = [];
  const unsupported: Array<{ key: string; reason: string }> = [];

  for (const constraint of plan.constraints) {
    if (constraint.min === null && constraint.max === null) continue;
    const unit = constraint.unit.trim().toUpperCase();
    let basis: 'DM' | 'PER_1000_KCAL';
    let factor = 1;
    if (unit === 'PERCENT_DM') {
      basis = 'DM';
    } else if (unit === 'PER_1000_KCAL') {
      basis = 'PER_1000_KCAL';
    } else if (unit === 'PER_MJ') {
      basis = 'PER_1000_KCAL';
      // 1 MJ = 239.006 kcal；1 g/MJ = 4.1839 g/1000 kcal
      factor = 4.1839;
    } else {
      unsupported.push({
        key: constraint.key,
        reason: `单位 ${constraint.unit} 暂不支持自动评估`,
      });
      continue;
    }

    const aliases = KEY_ALIASES[constraint.key] ?? [constraint.key];
    const candidates = targets.filter((target) =>
      aliases.includes(target.nutrientKey),
    );
    if (candidates.length === 0) {
      unsupported.push({
        key: constraint.key,
        reason: '通用评估里没有对应营养素，需要 Agent/人工按方案资料判断',
      });
      continue;
    }
    const desiredBasis =
      basis === 'DM' ? 'PER_100G_DRY_MATTER' : 'PER_1000_KCAL_ME';
    const base =
      candidates.find((target) => target.expressionBasis === desiredBasis) ??
      candidates[0];
    if (base.expressionBasis !== desiredBasis) {
      unsupported.push({
        key: constraint.key,
        reason: `通用评估没有 ${basis} 基准的对应目标`,
      });
      continue;
    }

    /**
     * 只覆盖方案明确写到的方向；缺失的一侧沿用基线的值。
     *
     * 方案值先按表达基准换算（PER_MJ → 每 1000kcal），再按营养素单位换算到
     * 目标单位；基线那一侧本来就是目标单位，不能再换算。两侧混用不同单位时，
     * 用一个 `unit` 字段统一解释会算错，所以这里直接换算成目标单位。
     */
    const targetUnit = base.unit;
    const planUnit = constraint.nutrientUnit?.trim() || targetUnit;
    const toTargetUnit = (value: number): number | null => {
      const converted = convertNutrientValue(
        value * factor,
        planUnit,
        targetUnit,
      );
      return converted === null ? null : round(converted);
    };
    const minValue =
      constraint.min === null ? base.minValue : toTargetUnit(constraint.min);
    const maxValue =
      constraint.max === null ? base.maxValue : toTargetUnit(constraint.max);
    if (
      (constraint.min !== null && minValue === null) ||
      (constraint.max !== null && maxValue === null)
    ) {
      unsupported.push({
        key: constraint.key,
        reason: `单位 ${planUnit} 不能换算为评估标准单位 ${targetUnit}`,
      });
      continue;
    }

    overrides.push({
      nutrientKey: base.nutrientKey,
      basis,
      minValue,
      maxValue,
      unit: targetUnit,
      citationId: constraint.citationId ?? 'plan',
    });
  }

  return { overrides, unsupported };
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
