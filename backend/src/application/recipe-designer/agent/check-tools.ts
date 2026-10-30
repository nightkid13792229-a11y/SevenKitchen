/**
 * 检查工具（P0a Task 4）。
 *
 * 四个工具只提供交付前参考信息，都不改草稿、也不阻断本轮运行：
 * `run_assessment` / `check_coverage` / `check_catalog_conflicts` / `check_ready`。
 *
 * 依据 `docs/superpowers/specs/2026-10-24-ai-recipe-design-agent-design.md`
 * 第 4.1–4.4 节与第 5.2 节：
 *
 * - 评估必须跑在**当前内容版本**上；`check_ready` 只看 `draft.lastAssessment`，
 *   不重新跑评估，版本对不上就算“没准备好”。
 * - 11 类选料检查清单不是门禁：基础类缺只 WARN，建议类缺只提示，都不阻断交付。
 * - 20% 余量是工作标准不是门禁：不足只 WARN，但必须逐条列出来。
 * - 目录对比只给证据：主蛋白（畜/禽/水产）重合 HARD，内脏/碳水/蔬菜/菌藻/坚果/水果/乳/蛋/豆重合 SOFT；
 *   油脂/调味/补剂不比。
 *
 * 入参来自模型（运行时会绕过 TypeScript 类型），所以所有字段先做 `typeof`
 * 守卫：非法值返回 `INVALID_ARGUMENT`，绝不让 `TypeError` 冒出去。
 */
import {
  BASE_FOOD_CATEGORIES,
  CHECKLIST_FOOD_CATEGORIES,
  SUGGESTED_FOOD_CATEGORIES,
  summarizeFoodCategoryCoverage,
} from '../../../domain/recipe-designer/food-category-map';
import { isPreparationRequiredFoodCategory } from '../../../domain/recipe-designer/preparation-field.constants';
import type {
  BaseFoodCategory,
  FoodCategory,
  OptionalFoodCategory,
  SuggestedFoodCategory,
} from '../../../domain/recipe-designer/food-category-map';
import {
  RecipeAgentPortError,
  type AgentAssessmentEntry,
  type AgentAssessmentView,
  type AgentDraftItem,
  type AgentToolErrorCode,
  type AgentToolResult,
  type HealthTagPolicy,
} from './agent-types';
import type { RecipeAgentDraftPort } from './recipe-agent.port';

/** 关键指标要留的余量比例：20%。 */
export const MARGIN_RATIO = 0.2;

/** 低于这个百分数就算“余量不足”。 */
const MARGIN_PERCENT = MARGIN_RATIO * 100;

/** 目录对比里算硬撞的类别（主蛋白必须不同；水产也算主蛋白）。 */
const HARD_CATEGORIES: readonly FoodCategory[] = ['PROTEIN', 'AQUATIC'];

/** 目录对比里算软撞的类别；油脂/调味/补剂不参与。 */
const SOFT_CATEGORIES: readonly FoodCategory[] = [
  'ORGAN',
  'CARB',
  'VEGETABLE',
  'MUSHROOM',
  'NUTS',
  'FRUIT',
  'DAIRY',
  'EGG',
  'LEGUME',
];

const COMPARED_CATEGORIES = new Set<FoodCategory>([
  ...HARD_CATEGORIES,
  ...SOFT_CATEGORIES,
]);

const CATEGORY_LABELS: Record<FoodCategory, string> = {
  PROTEIN: '蛋白',
  ORGAN: '内脏',
  AQUATIC: '水产',
  CARB: '碳水',
  VEGETABLE: '蔬菜',
  MUSHROOM: '菌藻',
  NUTS: '坚果种子',
  OIL: '油脂',
  FRUIT: '水果',
  DAIRY: '乳',
  EGG: '蛋',
  LEGUME: '豆',
  SEASONING: '调味',
  SUPPLEMENT: '补剂',
  UNCLASSIFIED: '未归类',
};

const READY_CHECK_LABELS = {
  ITEMS: '原料',
  IDENTITY: '原料身份',
  ASSESSMENT_FRESH: '评估版本',
  ASSESSMENT_COMPLIANT: '评估达标',
  MARGIN: '指标余量',
  COVERAGE: '分类检查',
  COPY: '文案',
  PRODUCTION_STEPS: '制作步骤',
  PREPARATION: '部位 / 状态 / 预处理',
  TAGS: '健康标签',
  ALLERGENS: '过敏原',
} as const;

/** `check_coverage` 的结果；`missing` 是真实的基础类缺口，不受确认记录影响。 */
export interface AgentCoverageResult {
  covered: BaseFoodCategory[];
  missing: BaseFoodCategory[];
  suggestedCovered: SuggestedFoodCategory[];
  suggestedMissing: SuggestedFoodCategory[];
  /** @deprecated 缺类确认已不参与门禁，仅回显后端审批状态以兼容旧调用方。 */
  confirmedOmissions: BaseFoodCategory[];
  /** 实际只会出现 DAIRY / SEASONING。 */
  optionalPresent: OptionalFoodCategory[];
  supplementCount: number;
  unclassifiedCount: number;
}

/** 一道跟当前草稿重合的目录菜。 */
export interface AgentConflictResult {
  recipeId: string;
  recipeName: string;
  severity: 'HARD' | 'SOFT';
  categories: FoodCategory[];
}

/** `check_ready` 里的一条检查项。 */
export interface AgentReadyCheck {
  key: string;
  label: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail?: string;
}

/** `check_ready` 的整份检查单。 */
export interface AgentReadyResult {
  status: 'PASS' | 'PASS_WITH_WARNINGS' | 'BLOCKED';
  checks: AgentReadyCheck[];
}

export interface CheckCoverageArgs {
  /** @deprecated 仅用于兼容旧调用方，不再过滤缺类。 */
  confirmedOmissions?: BaseFoodCategory[];
}

export interface CheckCatalogConflictsArgs {
  mainProteinName?: string;
}

export interface CheckReadyArgs {
  /** @deprecated 缺类确认已不参与门禁，传了也会被忽略。 */
  confirmedOmissions?: BaseFoodCategory[];
  exceptionApproved?: boolean;
}

export interface CheckToolDeps {
  port: RecipeAgentDraftPort;
  draftId: string;
  tagPolicy: HealthTagPolicy;
}

/** `createCheckTools` 的返回类型；Task 5 的注册表按这个形状挂 handler。 */
export interface RecipeAgentCheckTools {
  run_assessment(): Promise<AgentToolResult<AgentAssessmentView>>;
  check_coverage(
    args?: CheckCoverageArgs,
  ): Promise<AgentToolResult<AgentCoverageResult>>;
  check_catalog_conflicts(
    args?: CheckCatalogConflictsArgs,
  ): Promise<AgentToolResult<AgentConflictResult[]>>;
  check_ready(
    args?: CheckReadyArgs,
  ): Promise<AgentToolResult<AgentReadyResult>>;
}

type RawToolArgs = Record<string, unknown>;

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const ok = <T>(data: T, summary: string): AgentToolResult<T> => ({
  ok: true,
  data,
  summary,
});

const fail = <T>(
  code: AgentToolErrorCode,
  message: string,
): AgentToolResult<T> => ({
  ok: false,
  error: { code, message },
});

function asRawArgs(args: unknown): RawToolArgs | null {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return null;
  }
  return args as RawToolArgs;
}

function isBaseFoodCategory(value: string): value is BaseFoodCategory {
  return (BASE_FOOD_CATEGORIES as readonly string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function categoryLabels(categories: readonly FoodCategory[]): string {
  return categories.map((category) => CATEGORY_LABELS[category]).join('、');
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 余量方向后缀；方向未知时不加，避免把“无法判断”说成某一侧。 */
function formatMarginSide(entry: AgentAssessmentEntry): string {
  if (entry.marginSide === 'LOWER') return '（距下限）';
  if (entry.marginSide === 'UPPER') return '（距上限）';
  return '';
}

type MarginSide = 'LOWER' | 'UPPER';

interface MarginCandidate {
  side: MarginSide;
  margin: number;
}

/**
 * 列出某条指标所有可用的余量（未四舍五入）。
 *
 * 下限型：(value - min) / min × 100；上限型：(max - value) / max × 100。
 * 没有可用限值、或分母为 0 时返回空数组。
 */
function listMarginCandidates(
  entry: Pick<AgentAssessmentEntry, 'value' | 'min' | 'max'>,
): MarginCandidate[] {
  const { value, min, max } = entry;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return [];
  }

  const candidates: MarginCandidate[] = [];
  if (typeof min === 'number' && Number.isFinite(min) && min !== 0) {
    candidates.push({ side: 'LOWER', margin: ((value - min) / min) * 100 });
  }
  if (typeof max === 'number' && Number.isFinite(max) && max !== 0) {
    candidates.push({ side: 'UPPER', margin: ((max - value) / max) * 100 });
  }
  return candidates;
}

/** 取更小的余量；相等时保留下限，保证方向稳定。 */
function pickSmallestMargin(
  candidates: readonly MarginCandidate[],
): MarginCandidate | null {
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((best, candidate) =>
    candidate.margin < best.margin ? candidate : best,
  );
}

/**
 * 计算某条指标离最近一边限值的余量百分比。
 *
 * 结果保留 1 位小数。
 */
export function computeMarginPercent(
  entry: Pick<AgentAssessmentEntry, 'value' | 'min' | 'max'>,
): number | null {
  const smallest = pickSmallestMargin(listMarginCandidates(entry));
  if (!smallest) {
    return null;
  }

  const rounded = Math.round(smallest.margin * 10) / 10;
  // 避免 -0 这种对模型无意义的输出。
  return rounded === 0 ? 0 : rounded;
}

/** 余量更近的一边；缺值或缺限值时无法判断，返回 null。 */
export function computeMarginSide(
  entry: Pick<AgentAssessmentEntry, 'value' | 'min' | 'max'>,
): MarginSide | null {
  return pickSmallestMargin(listMarginCandidates(entry))?.side ?? null;
}

/**
 * 补齐评估里缺失的余量，并给每条指标标出更近的一边。
 *
 * P0b 的评估适配器可能只给 `value/min/max` 而不填 `marginPercent`；这里对
 * `marginPercent == null` 的条目用 `computeMarginPercent` 补算，算不出来就保持
 * null，让 `check_ready` 如实说“无法计算余量”，而不是假装达标。
 * `marginSide` 与 `marginPercent` 是否已存在无关，永远按 value/min/max 重算：
 * 警告文案要靠它说清“距下限”还是“距上限”。
 */
export function withComputedMargins(
  view: AgentAssessmentView,
): AgentAssessmentView {
  return {
    ...view,
    entries: view.entries.map((entry) => ({
      ...entry,
      marginPercent:
        typeof entry.marginPercent === 'number' &&
        Number.isFinite(entry.marginPercent)
          ? entry.marginPercent
          : computeMarginPercent(entry),
      marginSide: computeMarginSide(entry),
    })),
  };
}

/** 解析兼容用的缺类确认：必须是基础类别之一，去空白、去重。 */
function readConfirmedOmissions(value: unknown): Parsed<BaseFoodCategory[]> {
  if (value === undefined) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      message: `confirmedOmissions 必须是数组，只能确认基础类别：${BASE_FOOD_CATEGORIES.join('、')}。`,
    };
  }

  const seen = new Set<BaseFoodCategory>();
  const omissions: BaseFoodCategory[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      return {
        ok: false,
        message: `confirmedOmissions 必须是基础类别的字符串数组：${BASE_FOOD_CATEGORIES.join('、')}。`,
      };
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      return {
        ok: false,
        message: 'confirmedOmissions 不能包含空白类别。',
      };
    }
    if (!isBaseFoodCategory(trimmed)) {
      return {
        ok: false,
        message: `confirmedOmissions 里的「${trimmed}」不是基础类别；只能确认：${BASE_FOOD_CATEGORIES.join('、')}。`,
      };
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    omissions.push(trimmed);
  }
  return { ok: true, value: omissions };
}

/** 克数最大的主蛋白（PROTEIN / AQUATIC）项名；没有主蛋白时返回 null。 */
function findLargestProteinName(
  items: readonly AgentDraftItem[],
): string | null {
  let selected: AgentDraftItem | null = null;
  for (const item of items) {
    if (item.category !== 'PROTEIN' && item.category !== 'AQUATIC') continue;
    if (selected === null || item.weightG > selected.weightG) {
      selected = item;
    }
  }
  const name = selected?.name?.trim();
  return name || null;
}

function summarizeAssessment(view: AgentAssessmentView): string {
  const total =
    view.compliant + view.deficient + view.excess + view.missingData;
  const parts = [
    `评估完成（内容版本 v${view.contentRevision}）：${view.compliant}/${total} 项达标`,
  ];
  if (view.deficient > 0) parts.push(`${view.deficient} 项不足`);
  if (view.excess > 0) parts.push(`${view.excess} 项超标`);
  if (view.missingData > 0) parts.push(`${view.missingData} 项缺数据`);
  const text = `${parts.join('，')}。`;
  const allergenWarnings = view.allergenWarnings ?? [];
  if (allergenWarnings.length === 0) return text;

  const allergens = Array.from(
    new Set(
      allergenWarnings.map((warning) => warning.allergen).filter(Boolean),
    ),
  ).join('、');
  return `${text} 过敏提示 ${allergenWarnings.length} 条：${allergens}；必须逐条告知用户，并替换原料或请人确认。`;
}

function buildReadyCheck(
  key: keyof typeof READY_CHECK_LABELS,
  status: AgentReadyCheck['status'],
  detail: string,
): AgentReadyCheck {
  return { key, label: READY_CHECK_LABELS[key], status, detail };
}

function summarizeReady(checks: readonly AgentReadyCheck[]): string {
  const failCount = checks.filter((check) => check.status === 'FAIL').length;
  const warnCount = checks.filter((check) => check.status === 'WARN').length;
  if (failCount > 0) {
    const warnings = warnCount > 0 ? `、${warnCount} 项警告` : '';
    return `还不能交付：${failCount} 项不通过${warnings}。`;
  }
  if (warnCount > 0) {
    return `可以交付，但有 ${warnCount} 项警告，请在最终总结里说明并请人确认。`;
  }
  return '检查全部通过，可以交付。';
}

/**
 * 造四个检查工具。
 *
 * @param deps.port 草稿端口（P0a 用内存假端口）
 * @param deps.draftId 当前这份草稿的 id
 * @param deps.tagPolicy 健康标签白名单
 */
export function createCheckTools(deps: CheckToolDeps): RecipeAgentCheckTools {
  const { port, draftId, tagPolicy } = deps;

  return {
    async run_assessment(): Promise<AgentToolResult<AgentAssessmentView>> {
      let assessment: AgentAssessmentView;
      try {
        assessment = await port.runAssessment(draftId);
      } catch (error) {
        // 端口自带错误码（如 409 → ASSESSMENT_STALE）时原样还给模型；
        // 其他异常继续往上抛，由 tool-registry 的边界转成 CONTROL_NOT_AVAILABLE。
        if (error instanceof RecipeAgentPortError) {
          return fail(error.code, error.message);
        }
        throw error;
      }
      const view = withComputedMargins(assessment);
      return ok(view, summarizeAssessment(view));
    },

    async check_coverage(
      args: CheckCoverageArgs = {},
    ): Promise<AgentToolResult<AgentCoverageResult>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }
      const omissions = readConfirmedOmissions(raw.confirmedOmissions);
      if (!omissions.ok) {
        return fail('INVALID_ARGUMENT', omissions.message);
      }

      const draft = await port.getDraft(draftId);
      const coverage = summarizeFoodCategoryCoverage(draft.items);

      const result: AgentCoverageResult = {
        covered: coverage.covered,
        // 真实缺口照实报；缺类确认只回显，不再过滤。
        missing: coverage.missing,
        suggestedCovered: coverage.suggestedCovered,
        suggestedMissing: coverage.suggestedMissing,
        confirmedOmissions: omissions.value,
        optionalPresent: coverage.optionalPresent,
        supplementCount: coverage.supplementCount,
        unclassifiedCount: coverage.unclassifiedCount,
      };

      const totalCovered =
        coverage.covered.length + coverage.suggestedCovered.length;
      const parts = [
        `分类检查 ${totalCovered}/${CHECKLIST_FOOD_CATEGORIES.length}（基础 ${coverage.covered.length}/${BASE_FOOD_CATEGORIES.length}，建议 ${coverage.suggestedCovered.length}/${SUGGESTED_FOOD_CATEGORIES.length}）`,
      ];
      if (
        coverage.missing.length === 0 &&
        coverage.suggestedMissing.length === 0
      ) {
        parts.push(`${CHECKLIST_FOOD_CATEGORIES.length} 类检查项齐全`);
      } else {
        parts.push(
          coverage.missing.length === 0
            ? `基础 ${BASE_FOOD_CATEGORIES.length} 类齐全`
            : `基础缺「${categoryLabels(coverage.missing)}」`,
        );
        parts.push(
          coverage.suggestedMissing.length === 0
            ? `建议 ${SUGGESTED_FOOD_CATEGORIES.length} 类齐全`
            : `建议未覆盖「${categoryLabels(coverage.suggestedMissing)}」`,
        );
      }
      if (coverage.optionalPresent.length > 0) {
        parts.push(`可选类：${categoryLabels(coverage.optionalPresent)}`);
      }
      parts.push(
        `补剂 ${coverage.supplementCount} 种、未归类 ${coverage.unclassifiedCount} 种`,
      );
      return ok(result, `${parts.join('；')}。`);
    },

    async check_catalog_conflicts(
      args: CheckCatalogConflictsArgs = {},
    ): Promise<AgentToolResult<AgentConflictResult[]>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }
      const proteinValue = raw.mainProteinName;
      if (proteinValue !== undefined && typeof proteinValue !== 'string') {
        return fail('INVALID_ARGUMENT', 'mainProteinName 必须是字符串。');
      }

      const draft = await port.getDraft(draftId);
      const explicitName =
        typeof proteinValue === 'string' ? proteinValue.trim() : '';
      const mainProteinName =
        explicitName || findLargestProteinName(draft.items);
      if (!mainProteinName) {
        return ok([], '没有主蛋白可对比。');
      }

      const usage = await port.getCatalogUsage({ mainProteinName });
      const conflicts: AgentConflictResult[] = [];
      for (const recipe of usage.recipes) {
        const categories = recipe.overlappingCategories.filter((category) =>
          COMPARED_CATEGORIES.has(category),
        );
        if (categories.length === 0) continue;
        const isHard = categories.some((category) =>
          HARD_CATEGORIES.includes(category),
        );
        conflicts.push({
          recipeId: recipe.recipeId,
          recipeName: recipe.name,
          severity: isHard ? 'HARD' : 'SOFT',
          categories,
        });
      }

      const hardConflicts = conflicts.filter(
        (conflict) => conflict.severity === 'HARD',
      );
      const softConflicts = conflicts.filter(
        (conflict) => conflict.severity === 'SOFT',
      );
      const parts = [
        `目录 ${usage.totalPublishedRecipes} 道菜`,
        `主蛋白「${mainProteinName}」`,
      ];
      if (conflicts.length === 0) {
        parts.push('没有硬/软撞车');
      } else {
        if (hardConflicts.length > 0) {
          parts.push(
            `硬撞 ${hardConflicts.length} 道（${hardConflicts
              .map((conflict) => conflict.recipeName)
              .join('、')}）`,
          );
        }
        if (softConflicts.length > 0) {
          parts.push(
            `软撞 ${softConflicts.length} 道（${softConflicts
              .map((conflict) => conflict.recipeName)
              .join('、')}）`,
          );
        }
      }
      return ok(conflicts, `${parts.join('；')}。`);
    },

    async check_ready(
      args: CheckReadyArgs = {},
    ): Promise<AgentToolResult<AgentReadyResult>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }
      // confirmedOmissions 保留在参数里只为兼容；缺类确认已不参与门禁，直接忽略。
      const exceptionValue = raw.exceptionApproved;
      if (exceptionValue !== undefined && typeof exceptionValue !== 'boolean') {
        return fail('INVALID_ARGUMENT', 'exceptionApproved 必须是布尔值。');
      }
      const exceptionApproved = exceptionValue === true;

      const draft = await port.getDraft(draftId);
      const assessment = draft.lastAssessment
        ? withComputedMargins(draft.lastAssessment)
        : null;
      const checks: AgentReadyCheck[] = [];

      // ITEMS：至少 1 条、总重 > 0。
      if (draft.items.length === 0 || draft.totalWeightG <= 0) {
        checks.push(
          buildReadyCheck(
            'ITEMS',
            'FAIL',
            `至少要有 1 条原料且总重 > 0（当前 ${draft.items.length} 条、${draft.totalWeightG}g）。`,
          ),
        );
      } else {
        checks.push(
          buildReadyCheck(
            'ITEMS',
            'PASS',
            `${draft.items.length} 条原料，共 ${draft.totalWeightG}g。`,
          ),
        );
      }

      // IDENTITY：每条原料都要落到真实营养档案上。
      const missingIdentity = draft.items.filter(
        (item) => !isNonEmptyString(item.nutritionFoodId),
      );
      if (missingIdentity.length > 0) {
        checks.push(
          buildReadyCheck(
            'IDENTITY',
            'FAIL',
            `${missingIdentity.length} 条原料没有 nutritionFoodId：${missingIdentity
              .map((item) => item.name || item.id)
              .join('、')}。`,
          ),
        );
      } else {
        checks.push(
          buildReadyCheck('IDENTITY', 'PASS', '每条原料都落到真实原料上。'),
        );
      }

      // ASSESSMENT_FRESH：必须存在且跑在当前内容版本上。
      if (!assessment) {
        checks.push(
          buildReadyCheck(
            'ASSESSMENT_FRESH',
            'FAIL',
            '还没跑过评估；先跑 run_assessment 再交付。',
          ),
        );
      } else if (assessment.contentRevision !== draft.contentRevision) {
        checks.push(
          buildReadyCheck(
            'ASSESSMENT_FRESH',
            'FAIL',
            `评估是在内容版本 v${assessment.contentRevision} 跑的，当前是 v${draft.contentRevision}；内容改过，必须重跑评估。`,
          ),
        );
      } else {
        checks.push(
          buildReadyCheck(
            'ASSESSMENT_FRESH',
            'PASS',
            `评估与内容版本 v${draft.contentRevision} 一致。`,
          ),
        );
      }

      // ASSESSMENT_COMPLIANT：评估必须达标；已批例外降为警告。
      if (!assessment) {
        checks.push(
          buildReadyCheck(
            'ASSESSMENT_COMPLIANT',
            'FAIL',
            '还没有评估结果，无法判断是否达标。',
          ),
        );
      } else {
        const compliant =
          assessment.entries.length > 0 &&
          assessment.deficient === 0 &&
          assessment.excess === 0 &&
          assessment.missingData === 0;
        if (compliant) {
          checks.push(
            buildReadyCheck(
              'ASSESSMENT_COMPLIANT',
              'PASS',
              `${assessment.compliant} 项达标，无不足、超标或缺数据。`,
            ),
          );
        } else if (assessment.entries.length === 0) {
          checks.push(
            buildReadyCheck(
              'ASSESSMENT_COMPLIANT',
              'FAIL',
              '评估结果里没有任何指标，无法判断是否达标；请重跑评估。',
            ),
          );
        } else {
          const problems: string[] = [];
          if (assessment.deficient > 0) {
            problems.push(`不足 ${assessment.deficient} 项`);
          }
          if (assessment.excess > 0) {
            problems.push(`超标 ${assessment.excess} 项`);
          }
          if (assessment.missingData > 0) {
            problems.push(`缺数据 ${assessment.missingData} 项`);
          }
          const detail = `评估未完全达标：${problems.join('、')}。`;
          checks.push(
            buildReadyCheck(
              'ASSESSMENT_COMPLIANT',
              exceptionApproved ? 'WARN' : 'FAIL',
              exceptionApproved
                ? `${detail}已批例外放行，请在最终总结里说明。`
                : `${detail}需调整配方，或请管理员批准例外。`,
            ),
          );
        }
      }

      // ALLERGENS：配方命中的狗狗过敏原。只提示、不硬拦（与人工评估口径一致），
      // 但交付前必须逐条确认或替换；没有评估结果时无法判断，给 WARN 让模型重跑。
      const allergenWarnings = assessment?.allergenWarnings ?? [];
      if (draft.context.kind !== 'ORDER') {
        checks.push(
          buildReadyCheck(
            'ALLERGENS',
            'PASS',
            '产品线食谱未绑定狗狗，不做过敏核对。',
          ),
        );
      } else if (!assessment) {
        checks.push(
          buildReadyCheck(
            'ALLERGENS',
            'WARN',
            '还没跑评估，无法核对配料是否命中狗狗过敏原；先跑 run_assessment。',
          ),
        );
      } else if (allergenWarnings.length > 0) {
        const detail = allergenWarnings
          .map(
            (warning) =>
              `${warning.itemName || warning.itemId}：${warning.allergen}`,
          )
          .join('、');
        checks.push(
          buildReadyCheck(
            'ALLERGENS',
            'WARN',
            `配方命中 ${allergenWarnings.length} 条狗狗过敏原（${detail}）；交付前必须逐条确认或替换。`,
          ),
        );
      } else {
        checks.push(
          buildReadyCheck('ALLERGENS', 'PASS', '配方没有命中狗狗的过敏原。'),
        );
      }

      // MARGIN：INFO 条目只是参考；缺失的余量先补算，补不出来的如实说。
      const measured = assessment
        ? assessment.entries.filter((entry) => entry.status !== 'INFO')
        : [];
      const hasMargin = (entry: AgentAssessmentEntry): boolean =>
        typeof entry.marginPercent === 'number' &&
        Number.isFinite(entry.marginPercent);
      const lowMargin = measured.filter(
        (entry) =>
          hasMargin(entry) && (entry.marginPercent as number) < MARGIN_PERCENT,
      );
      const unresolvedMargin = measured.filter((entry) => !hasMargin(entry));
      if (lowMargin.length > 0) {
        const unresolvedNote =
          unresolvedMargin.length > 0
            ? `；另有 ${unresolvedMargin.length} 项无法计算余量`
            : '';
        checks.push(
          buildReadyCheck(
            'MARGIN',
            'WARN',
            `余量不足 ${formatPercent(MARGIN_PERCENT)}%：${lowMargin
              .map(
                (entry) =>
                  `${entry.label} ${formatPercent(entry.marginPercent as number)}%${formatMarginSide(entry)}`,
              )
              .join('、')}。交付前需逐条确认${unresolvedNote}。`,
          ),
        );
      } else if (unresolvedMargin.length > 0) {
        const resolvedCount = measured.length - unresolvedMargin.length;
        const detail =
          resolvedCount > 0
            ? `有 ${unresolvedMargin.length} 项无法计算余量（缺数值或上下限），其余 ${resolvedCount} 项余量都 ≥ ${formatPercent(MARGIN_PERCENT)}%。`
            : `有 ${unresolvedMargin.length} 项无法计算余量（缺数值或上下限），需要人工核对。`;
        checks.push(buildReadyCheck('MARGIN', 'PASS', detail));
      } else {
        checks.push(
          buildReadyCheck(
            'MARGIN',
            'PASS',
            measured.length > 0
              ? `${measured.length} 项指标余量都在 ${formatPercent(MARGIN_PERCENT)}% 以上。`
              : '没有需要检查余量的指标。',
          ),
        );
      }

      // COVERAGE：11 类选料检查清单，不是门禁。
      // 基础类缺只 WARN；建议类缺只提示（仍 PASS）；都不阻断交付。
      const coverage = summarizeFoodCategoryCoverage(draft.items);
      if (coverage.missing.length > 0) {
        checks.push(
          buildReadyCheck(
            'COVERAGE',
            'WARN',
            `基础分类还缺「${categoryLabels(coverage.missing)}」；分类是选料检查清单，不阻断交付；能补就补，不能补请在交付说明里写原因。`,
          ),
        );
      } else if (coverage.suggestedMissing.length > 0) {
        checks.push(
          buildReadyCheck(
            'COVERAGE',
            'PASS',
            `基础 ${BASE_FOOD_CATEGORIES.length} 类齐全；建议项未覆盖：${categoryLabels(coverage.suggestedMissing)}。`,
          ),
        );
      } else {
        checks.push(
          buildReadyCheck(
            'COVERAGE',
            'PASS',
            `${CHECKLIST_FOOD_CATEGORIES.length} 类检查项齐全。`,
          ),
        );
      }

      // COPY：四个字段都要有内容。
      const copyMissing: string[] = [];
      if (!isNonEmptyString(draft.name)) copyMissing.push('系列名');
      if (!isNonEmptyString(draft.copy.coverTitle))
        copyMissing.push('封面标题');
      if (!isNonEmptyString(draft.copy.sellingPoint)) copyMissing.push('卖点');
      if (!isNonEmptyString(draft.copy.description)) copyMissing.push('描述');
      if (copyMissing.length > 0) {
        checks.push(
          buildReadyCheck(
            'COPY',
            'FAIL',
            `文案还缺：${copyMissing.join('、')}。`,
          ),
        );
      } else {
        checks.push(
          buildReadyCheck(
            'COPY',
            'PASS',
            '系列名、封面标题、卖点、描述都有内容。',
          ),
        );
      }

      // PRODUCTION_STEPS：至少 1 步。
      if (draft.productionSteps.length === 0) {
        checks.push(
          buildReadyCheck('PRODUCTION_STEPS', 'FAIL', '还没有制作步骤。'),
        );
      } else {
        checks.push(
          buildReadyCheck(
            'PRODUCTION_STEPS',
            'PASS',
            `${draft.productionSteps.length} 步制作步骤。`,
          ),
        );
      }

      // PREPARATION：只有必填食材类别要求填写；补剂/油脂/调味/乳制品/未分类豁免。
      const missingPreparation = draft.items.filter(
        (item) =>
          isPreparationRequiredFoodCategory(item.category) &&
          item.ingredientType !== 'SUPPLEMENT' &&
          !isNonEmptyString(item.preparationMethod),
      );
      if (missingPreparation.length > 0) {
        checks.push(
          buildReadyCheck(
            'PREPARATION',
            'FAIL',
            `${missingPreparation.length} 条食材没写部位 / 状态 / 预处理：${missingPreparation
              .map((item) => item.name || item.id)
              .join('、')}。`,
          ),
        );
      } else {
        checks.push(
          buildReadyCheck(
            'PREPARATION',
            'PASS',
            '必填食材都有部位 / 状态 / 预处理。',
          ),
        );
      }

      // TAGS：所有健康标签都要过白名单。
      const rejectedTags = draft.copy.targetHealthTags.filter(
        (tag) =>
          typeof tag !== 'string' ||
          !tag.trim() ||
          !tagPolicy.isAllowedTag(tag.trim()),
      );
      if (rejectedTags.length > 0) {
        checks.push(
          buildReadyCheck(
            'TAGS',
            'FAIL',
            `健康标签不在白名单内：${rejectedTags.join('、')}。`,
          ),
        );
      } else {
        checks.push(
          buildReadyCheck(
            'TAGS',
            'PASS',
            draft.copy.targetHealthTags.length > 0
              ? `健康标签都在白名单内：${draft.copy.targetHealthTags.join('、')}。`
              : '没有挂健康标签。',
          ),
        );
      }

      const hasFail = checks.some((check) => check.status === 'FAIL');
      const hasWarn = checks.some((check) => check.status === 'WARN');
      const status: AgentReadyResult['status'] = hasFail
        ? 'BLOCKED'
        : hasWarn
          ? 'PASS_WITH_WARNINGS'
          : 'PASS';

      return ok({ status, checks }, summarizeReady(checks));
    },
  };
}
