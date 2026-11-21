import type {
  AssessmentTargetOverride,
  FediafAssessmentTarget,
} from '../../../domain/recipe-designer/types';
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

    overrides.push({
      nutrientKey: base.nutrientKey,
      basis,
      minValue:
        constraint.min === null
          ? base.minValue
          : round(constraint.min * factor),
      maxValue:
        constraint.max === null
          ? base.maxValue
          : round(constraint.max * factor),
      citationId: constraint.citationId ?? 'plan',
    });
  }

  return { overrides, unsupported };
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
