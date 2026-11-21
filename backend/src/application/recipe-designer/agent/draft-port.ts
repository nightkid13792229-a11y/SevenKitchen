/**
 * 草稿端口：把 RecipeDesignerService 包成 Agent 能用的 5 个动作。
 *
 * 旧适配器（recipe-designer-agent.adapter.ts，103KB / 约 3,000 行）把每个字段
 * 都映射了一遍，其中大量是为了给模型"看全量"。新版的原则相反：
 * 只回这一步用得上的摘要，细节按需再取。
 */
import { Injectable } from '@nestjs/common';
import { RecipeDesignerService } from '../recipe-designer.service';
import type { RecipeEditOp } from './agent-types';
import type {
  AssessmentTargetOverride,
  FediafAssessmentTarget,
} from '../../../domain/recipe-designer/types';
import type { AgentDesignContext } from './design-context.types';
import type { AgentNutritionPlan } from './propose-plan';
import { buildPlanTargetOverrides } from './plan-target-overrides';

type Access = Parameters<RecipeDesignerService['getDraft']>[1];

/** 读草稿时返回给模型的摘要（不是完整的草稿对象）。 */
export interface DraftSummary {
  draftId: string;
  name: string;
  contentRevision: number;
  scenario: string;
  series: { id: string; name: string; designMode: 'CATALOG' | 'ORDER' } | null;
  totalWeightG: number;
  itemCount: number;
  items: Array<{
    itemId: string;
    name: string;
    weightG: number;
    preparationMethod: string | null;
  }>;
  lastAssessment: {
    isCompliant: boolean;
    revision: number | null;
    stale: boolean;
    /** 上次评估的缺口；直接读草稿里已存的结果，避免每轮重跑 assess。 */
    gaps: Array<{
      key: string;
      label: string;
      status: string;
      value: number | null;
      min: number | null;
      max: number | null;
      unit: string;
    }>;
    /** 上次评估命中的过敏/忌口提示。 */
    warnings: DraftWarning[];
  } | null;
}

/** 评估里命中的一条过敏或忌口提示。 */
export interface DraftWarning {
  itemName: string;
  allergen: string;
  level: string;
  message: string;
  /** ALLERGY = 医学过敏；AVOID = 本单忌口/不吃。 */
  kind: 'ALLERGY' | 'AVOID';
}

/** 一个候选原料的极简投影。 */
export interface FoodCandidate {
  ingredientId: string;
  nutritionFoodId: string;
  name: string;
  /** FOOD / SUPPLEMENT；选材阶段只能留下 FOOD。 */
  type?: string | null;
  /** 补剂是否已开启生产/采购；补剂只能选 true。 */
  procurementEnabled?: boolean;
  category: string | null;
  preparationState: string | null;
  isPrimary: boolean;
  nutrientMatch?: {
    nutrientKey: string;
    label: string;
    amount: number;
    unit: string;
    basis: string;
    basisLabel: string;
    displayText: string;
  } | null;
}

export interface AssessmentGap {
  key: string;
  label: string;
  status: string;
  value: number | null;
  min: number | null;
  max: number | null;
  unit: string;
  /** 还差多少（DEFICIENT: max(0, min - value)；EXCESS: max(0, value - max)）。 */
  deficit?: number | null;
  /** 补剂剂量的可执行提示，如「1 片 ≈ 0.064/1000kcal；目标 0.26；约需 4 片」。 */
  doseGuidance?: string;
  /** 这个缺口主要来自哪些原料；用于让模型改对 item，而不是盲试。 */
  contributors?: Array<{
    itemName: string;
    amountUnit?: string;
    ingredientType?: string;
    amount: number | null;
    unit: string;
    missing?: boolean;
    missingAsZero?: boolean;
  }>;
}

export interface AssessmentSummary {
  isCompliant: boolean;
  contentRevision: number;
  totalEnergyKcal: number | null;
  counts: {
    compliant: number;
    deficient: number;
    excess: number;
    missingData: number;
  };
  gaps: AssessmentGap[];
  /** 全部或部分原料缺字段、无法判断的营养素。 */
  missingData: Array<{
    key: string;
    label: string;
    missingItemCount: number;
    totalItemCount: number;
    allMissing?: boolean;
  }>;
  allergens: string[];
  /** 命中的过敏/忌口提示（含 item 与原因），比 allergens 名字更有用。 */
  warnings: DraftWarning[];
}

export interface PreparationChange {
  itemId: string;
  itemName: string;
  before: string;
  after: string;
  source: 'DRAFT' | 'HISTORY';
}

export type EditRecipeResult = {
  op: string;
  ok: boolean;
  message: string;
  preparationChange?: PreparationChange;
};

@Injectable()
export class RecipeDraftPort {
  constructor(
    private readonly designer: RecipeDesignerService,
    private readonly access: Access,
    private readonly draftId: string,
  ) {}

  /**
   * 读本单设计上下文：路径、订单、狗狗档案、全部健康记录与附件。
   * 只按当前草稿的绑定关系取，不接受外部 id。
   */
  async readDesignContext(): Promise<AgentDesignContext> {
    return this.designer.getAgentDesignContext(this.draftId, this.access);
  }

  /** 读草稿摘要：不含营养明细，那些由 assess 给。 */
  async readDraft(): Promise<DraftSummary> {
    const draft = (await this.designer.getDraft(
      this.draftId,
      this.access,
    )) as any;

    const items = Array.isArray(draft.items) ? draft.items : [];
    const assessmentRevision =
      typeof draft.assessmentContentRevision === 'number'
        ? draft.assessmentContentRevision
        : null;

    return {
      draftId: draft.id,
      name: draft.name,
      contentRevision: draft.contentRevision,
      scenario: String(draft.fediafDogScenario ?? ''),
      series: draft.series
        ? {
            id: draft.series.id,
            name: draft.series.name,
            designMode:
              draft.series.designMode === 'ORDER' ? 'ORDER' : 'CATALOG',
          }
        : null,
      totalWeightG: Number(draft.totalWeightG ?? 0),
      itemCount: items.length,
      items: items.map((item: any) => ({
        itemId: item.id,
        name:
          item.ingredient?.name ??
          item.nutritionFood?.displayNameZh ??
          item.nutritionFood?.name ??
          '未命名',
        weightG: Number(item.weightG ?? 0),
        preparationMethod:
          item.preparationMethodLabel ?? item.preparationMethod ?? null,
      })),
      lastAssessment:
        assessmentRevision === null
          ? null
          : {
              isCompliant: Boolean(draft.isCompliant),
              revision: assessmentRevision,
              stale: assessmentRevision !== draft.contentRevision,
              ...readStoredAssessment(draft),
            },
    };
  }

  /**
   * 找原料。默认只回 8 条极简候选，够模型做决定；
   * 它要更多会再调一次带具体营养素的搜索。
   */
  async findFoods(input: {
    search?: string;
    nutrientKey?: string;
    limit?: number;
  }): Promise<FoodCandidate[]> {
    const limit = Math.min(20, Math.max(1, Number(input.limit ?? 8)));
    const result = (await this.designer.listIngredientOptions({
      search: input.search,
      nutrientKey: input.nutrientKey,
      page: 1,
      pageSize: limit,
    } as any)) as any;

    const rows: any[] = Array.isArray(result?.data) ? result.data : [];
    const candidates: FoodCandidate[] = [];
    for (const row of rows) {
      const profiles: any[] = Array.isArray(row.nutritionProfiles)
        ? row.nutritionProfiles
        : [];
      if (profiles.length === 0) continue;
      // 补剂只允许选已开启生产/采购的；关闭的直接不给 Agent 看到。
      if (row.type === 'SUPPLEMENT' && row.procurementEnabled !== true) {
        continue;
      }
      const primary =
        profiles.find((profile) => profile.isPrimary) ?? profiles[0];
      candidates.push({
        ingredientId: String(row.id),
        nutritionFoodId: String(primary.nutritionFoodId),
        name: String(row.name ?? primary.displayNameZh ?? ''),
        type: row.type ?? null,
        procurementEnabled: row.procurementEnabled === true,
        category: row.category ?? primary.category ?? null,
        preparationState: primary.preparationStateLabel ?? null,
        isPrimary: Boolean(primary.isPrimary),
        nutrientMatch: primary.nutrientMatch ?? row.nutrientMatch ?? null,
      });
      if (candidates.length >= limit) break;
    }
    return candidates;
  }

  /** 一次可执行多个编辑操作；返回每一条的结果。 */
  async editRecipe(ops: RecipeEditOp[]): Promise<EditRecipeResult[]> {
    const results: EditRecipeResult[] = [];
    let beforeItems: Map<string, any> | null = null;

    const getBeforeItem = async (itemId: string): Promise<any | null> => {
      if (!beforeItems) {
        const draft = (await this.designer.getDraft(
          this.draftId,
          this.access,
        )) as any;
        beforeItems = new Map(
          (Array.isArray(draft?.items) ? draft.items : []).map(
            (item: any) => [String(item.id), item] as const,
          ),
        );
      }
      return beforeItems.get(itemId) ?? null;
    };

    const getHistory = async (
      ingredientId: unknown,
    ): Promise<string | null> => {
      try {
        return await this.designer.getLatestPreparationMethodText(
          typeof ingredientId === 'string' ? ingredientId : null,
        );
      } catch {
        return null;
      }
    };

    for (const op of ops) {
      try {
        if (op.op === 'add') {
          const created = (await this.designer.addItem(
            this.draftId,
            {
              nutritionFoodId: op.nutritionFoodId,
              ingredientId: op.ingredientId,
              weightG: op.weightG,
              preparationMethod: op.preparationMethod,
              supplementTargets: op.supplementTargets,
            } as any,
            this.access,
          )) as any;
          const after = String(
            created?.preparationMethod ?? op.preparationMethod ?? '',
          ).trim();
          const before = await getHistory(
            op.ingredientId ?? created?.ingredientId,
          );
          const preparationChange = buildPreparationChange(
            created,
            before,
            after,
            'HISTORY',
          );
          results.push({
            op: 'add',
            ok: true,
            message: '已加入',
            ...(preparationChange ? { preparationChange } : {}),
          });
          continue;
        }

        if (op.op === 'update_item') {
          const beforeItem = await getBeforeItem(op.itemId);
          const updated = (await this.designer.updateItem(
            op.itemId,
            {
              ...(op.weightG !== undefined ? { weightG: op.weightG } : {}),
              ...(op.preparationMethod !== undefined
                ? { preparationMethod: op.preparationMethod }
                : {}),
              ...(op.supplementTargets
                ? { supplementTargets: op.supplementTargets }
                : {}),
            } as any,
            this.access,
          )) as any;
          const currentBefore = String(
            beforeItem?.preparationMethod ?? '',
          ).trim();
          const before =
            currentBefore || (await getHistory(beforeItem?.ingredientId));
          const after = String(
            updated?.preparationMethod ?? op.preparationMethod ?? '',
          ).trim();
          const preparationChange = buildPreparationChange(
            updated ?? beforeItem,
            before,
            after,
            currentBefore ? 'DRAFT' : 'HISTORY',
          );
          results.push({
            op: 'update_item',
            ok: true,
            message: '已更新',
            ...(preparationChange ? { preparationChange } : {}),
          });
          continue;
        }

        if (op.op === 'set_weight') {
          await this.designer.updateItem(
            op.itemId,
            { weightG: op.weightG } as any,
            this.access,
          );
          results.push({ op: 'set_weight', ok: true, message: '已改克数' });
          continue;
        }

        if (op.op === 'remove') {
          await this.designer.removeItem(op.itemId, this.access);
          results.push({ op: 'remove', ok: true, message: '已删除' });
          continue;
        }

        if (op.op === 'replace') {
          // 用事务版 replaceItem：失败不删旧项，保留排序/计入开关/预处理/补剂目标。
          await this.designer.replaceItem(
            op.itemId,
            {
              nutritionFoodId: op.nutritionFoodId,
              ingredientId: op.ingredientId,
            } as any,
            this.access,
          );
          results.push({ op: 'replace', ok: true, message: '已替换' });
        }
      } catch (error) {
        results.push({
          op: op.op,
          ok: false,
          message: (error as Error).message,
        });
      }
    }

    return results;
  }

  /**
   * 覆盖写制作步骤。只写 instruction；序号由服务端按顺序补，
   * 时间/温度/设备留空（家庭厨房 SOP 不要求）。
   */
  async writeProductionSteps(
    steps: Array<{ instruction: string }>,
  ): Promise<{ stepCount: number }> {
    const normalized = steps.map((step, index) => ({
      sortOrder: index + 1,
      instruction: step.instruction.trim(),
      durationMinutes: null,
      temperatureC: null,
      equipment: null,
    }));
    const result = await this.designer.updateDraftProductionSteps(
      this.draftId,
      { steps: normalized } as any,
      this.access,
    );
    return { stepCount: result.productionSteps.length };
  }

  private lastTargetOverrides?: AssessmentTargetOverride[];

  /** 本次会话最后一次评估使用的目标覆盖；edit_recipe 做前后对比时沿用。 */
  getLastTargetOverrides(): AssessmentTargetOverride[] | undefined {
    return this.lastTargetOverrides;
  }

  async getAssessmentTargets(): Promise<FediafAssessmentTarget[]> {
    return this.designer.getDraftAssessmentTargets(this.draftId, this.access);
  }

  /**
   * 方案专属评估：引擎能算的用引擎算，不写回草稿（编辑器仍显示通用标准）。
   */
  async assessPlan(plan: AgentNutritionPlan): Promise<{
    assessment: any | null;
    overrides: AssessmentTargetOverride[];
    unsupported: Array<{ key: string; reason: string }>;
  }> {
    const targets = await this.getAssessmentTargets();
    const resolution = buildPlanTargetOverrides(plan, targets);
    if (resolution.overrides.length === 0) {
      return {
        assessment: null,
        overrides: [],
        unsupported: resolution.unsupported,
      };
    }
    this.lastTargetOverrides = resolution.overrides;
    const result: any = await this.designer.assessDraftForAgentPreview(
      this.draftId,
      this.access,
      resolution.overrides,
    );
    const raw = result?.assessment ?? null;
    const groups = Array.isArray(raw?.groupedEntries) ? raw.groupedEntries : [];
    const gaps = groups
      .filter((entry: any) => {
        const status = String(entry?.status ?? '');
        return status === 'DEFICIENT' || status === 'EXCESS';
      })
      .slice(0, 12)
      .map((entry: any) => {
        const value = toNumber(entry.currentValue ?? entry.value);
        const min = toNumber(entry.minValue ?? entry.min);
        const max = toNumber(entry.maxValue ?? entry.max);
        const status = String(entry.status ?? '');
        return {
          key: String(entry.nutrientKey ?? entry.key ?? ''),
          label: String(entry.label ?? entry.name ?? ''),
          status,
          value,
          min,
          max,
          unit: String(entry.unit ?? ''),
          deficit:
            status === 'DEFICIENT' && min !== null && value !== null
              ? Math.max(0, min - value)
              : status === 'EXCESS' && max !== null && value !== null
                ? Math.max(0, value - max)
                : null,
        };
      });
    return {
      assessment: raw?.summary
        ? {
            isCompliant:
              raw.isCompliant === true ||
              String(raw.overallStatus ?? '').toUpperCase() === 'COMPLIANT',
            counts: raw.summary,
            gaps,
          }
        : null,
      overrides: resolution.overrides,
      unsupported: resolution.unsupported,
    };
  }

  /** 跑评估，只回缺口和一个总数；不回全量明细。 */
  async assess(
    targetOverrides?: AssessmentTargetOverride[],
  ): Promise<AssessmentSummary> {
    if (targetOverrides !== undefined) {
      this.lastTargetOverrides = targetOverrides;
    }
    const result: any = await this.designer.assessDraftForAgent(
      this.draftId,
      this.access,
      targetOverrides,
    );
    const assessment = result?.assessment ?? {};
    const summary = assessment.summary ?? {};
    const groups: any[] = Array.isArray(assessment.groupedEntries)
      ? assessment.groupedEntries
      : [];

    const allGroups = groups;
    const isAllMissing = (entry: any): boolean => {
      const contributors = Array.isArray(entry?.contributors)
        ? entry.contributors
        : [];
      return (
        entry?.missingAsZero === true &&
        contributors.length > 0 &&
        contributors.every(
          (contributor: any) =>
            contributor?.missing === true ||
            contributor?.missingAsZero === true ||
            contributor?.amount === null ||
            contributor?.amount === undefined,
        )
      );
    };
    const missingData = allGroups
      .filter((entry) => {
        const status = String(entry?.status ?? '');
        return status === 'MISSING_DATA' || isAllMissing(entry);
      })
      .map((entry) => {
        const contributors = Array.isArray(entry.contributors)
          ? entry.contributors
          : [];
        return {
          key: String(entry.nutrientKey ?? entry.key ?? ''),
          label: String(
            entry.label ?? entry.name ?? entry.nutrientKey ?? entry.key ?? '',
          ),
          missingItemCount: contributors.filter(
            (contributor: any) =>
              contributor?.missing === true ||
              contributor?.missingAsZero === true ||
              contributor?.amount === null ||
              contributor?.amount === undefined,
          ).length,
          totalItemCount: contributors.length,
          allMissing: isAllMissing(entry),
        };
      });
    const allMissingDeficientCount = missingData.filter(
      (item) => item.allMissing,
    ).length;

    const totalEnergyKcal = toNumber(assessment.totalEnergyKcal);
    const gaps: AssessmentGap[] = allGroups
      .filter((entry) => {
        const status = String(entry?.status ?? '');
        return (
          (status === 'DEFICIENT' || status === 'EXCESS') &&
          !isAllMissing(entry)
        );
      })
      .slice(0, 12)
      .map((entry) => {
        const value = toNumber(entry.currentValue ?? entry.value);
        const min = toNumber(entry.minValue ?? entry.min);
        const max = toNumber(entry.maxValue ?? entry.max);
        const status = String(entry.status ?? '');
        const contributors = Array.isArray(entry.contributors)
          ? entry.contributors
          : [];
        const mappedContributors = contributors
          .slice(0, 3)
          .map((contributor: any) => ({
            itemName: String(contributor.itemName ?? ''),
            amountUnit:
              typeof contributor.amountUnit === 'string'
                ? contributor.amountUnit
                : undefined,
            ingredientType:
              typeof contributor.ingredientType === 'string'
                ? contributor.ingredientType
                : undefined,
            amount: toNumber(contributor.amount),
            unit: String(contributor.unit ?? ''),
            missing: contributor.missing === true,
            missingAsZero: contributor.missingAsZero === true,
          }));
        const deficit =
          status === 'DEFICIENT' && min !== null && value !== null
            ? Math.max(0, min - value)
            : status === 'EXCESS' && max !== null && value !== null
              ? Math.max(0, value - max)
              : null;
        const supplement = contributors.find(
          (contributor: any) =>
            contributor?.ingredientType === 'SUPPLEMENT' &&
            toNumber(contributor.amount) !== null &&
            toNumber(contributor.amount)! > 0,
        );
        let doseGuidance: string | undefined;
        if (supplement && min !== null && value !== null && totalEnergyKcal) {
          const amount = toNumber(supplement.amount)!;
          const perUnit = (amount / totalEnergyKcal) * 1000;
          if (perUnit > 0) {
            const units = Math.ceil(Math.max(0, min - value) / perUnit);
            doseGuidance = `1${supplement.amountUnit ?? '份'} ≈ ${round(perUnit)}${String(entry.unit ?? '')}/1000kcal；目标 ${min}${String(entry.unit ?? '')}；约需 ${units}${supplement.amountUnit ?? '份'}`;
          }
        }
        return {
          key: String(entry.nutrientKey ?? entry.key ?? ''),
          label: String(
            entry.label ?? entry.name ?? entry.nutrientKey ?? entry.key ?? '',
          ),
          status,
          value,
          min,
          max,
          unit: String(entry.unit ?? ''),
          deficit,
          ...(doseGuidance ? { doseGuidance } : {}),
          contributors: mappedContributors,
        };
      });

    const warnings: DraftWarning[] = Array.isArray(result?.allergenWarnings)
      ? result.allergenWarnings
          .filter(isRecord)
          .map((warning: any) => ({
            itemName: String(warning.itemName ?? ''),
            allergen: String(
              warning.allergen ?? warning.allergenName ?? warning.name ?? '',
            ),
            level: String(warning.level ?? 'WARNING'),
            message: String(warning.message ?? ''),
            kind: warning.kind === 'AVOID' ? 'AVOID' : 'ALLERGY',
          }))
          .filter((warning: DraftWarning) => Boolean(warning.allergen))
      : [];
    const allergens = [...new Set(warnings.map((warning) => warning.allergen))];

    return {
      isCompliant:
        assessment.isCompliant === true ||
        String(assessment.overallStatus ?? '').toUpperCase() === 'COMPLIANT',
      contentRevision: Number(result?.contentRevision ?? 0),
      totalEnergyKcal,
      counts: {
        compliant: Number(summary.compliant ?? 0),
        deficient: Math.max(
          0,
          Number(summary.deficient ?? 0) - allMissingDeficientCount,
        ),
        excess: Number(summary.excess ?? 0),
        missingData:
          Number(summary.missingData ?? 0) + allMissingDeficientCount,
      },
      gaps,
      missingData,
      allergens,
      warnings,
    };
  }

  /** 写文案：名称、封面标题、卖点、描述。 */
  async writeCopy(patch: {
    name?: string;
    coverTitle?: string;
    sellingPoint?: string;
    description?: string;
  }): Promise<string[]> {
    const draft = (await this.designer.getDraft(
      this.draftId,
      this.access,
    )) as any;
    const changed: string[] = [];

    if (patch.name) {
      if (draft.series?.id) {
        await this.designer.renameSeries(
          draft.series.id,
          { name: patch.name } as any,
          this.access,
        );
      } else {
        await this.designer.updateDraft(
          this.draftId,
          { name: patch.name } as any,
          this.access,
        );
      }
      changed.push('名称');
    }

    const presentation: Record<string, string> = {};
    if (patch.coverTitle !== undefined) {
      presentation.coverTitle = patch.coverTitle;
      changed.push('封面标题');
    }
    if (patch.sellingPoint !== undefined) {
      presentation.sellingPoint = patch.sellingPoint;
      changed.push('卖点');
    }
    if (patch.description !== undefined) {
      presentation.description = patch.description;
      changed.push('描述');
    }
    if (Object.keys(presentation).length > 0) {
      await this.designer.updateDraftPresentation(
        this.draftId,
        presentation as any,
        this.access,
      );
    }

    return changed;
  }
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 从草稿里读上次评估的缺口与提示。
 *
 * `assess` 已经把结果原子写回草稿（complianceStatus / assessmentSummary），
 * 这里只是把它投影出来，避免模型每轮为了看缺口再跑一次评估。
 */
function readStoredAssessment(draft: any): {
  gaps: Array<{
    key: string;
    label: string;
    status: string;
    value: number | null;
    min: number | null;
    max: number | null;
    unit: string;
  }>;
  warnings: DraftWarning[];
} {
  const entries = Array.isArray(draft?.complianceStatus)
    ? draft.complianceStatus
    : [];
  const gaps = entries
    .filter((entry: unknown) => {
      const status = String((entry as any)?.status ?? '');
      return status === 'DEFICIENT' || status === 'EXCESS';
    })
    .slice(0, 12)
    .map((entry: any) => ({
      key: String(entry?.nutrientKey ?? entry?.key ?? ''),
      label: String(entry?.label ?? entry?.name ?? ''),
      status: String(entry?.status ?? ''),
      value: toNumber(entry?.currentValue ?? entry?.value),
      min: toNumber(entry?.minValue ?? entry?.min),
      max: toNumber(entry?.maxValue ?? entry?.max),
      unit: String(entry?.unit ?? ''),
    }));

  const summary = isRecord(draft?.assessmentSummary)
    ? draft.assessmentSummary
    : {};
  const rawWarnings = Array.isArray(summary.allergenWarnings)
    ? summary.allergenWarnings
    : [];
  const warnings: DraftWarning[] = rawWarnings
    .filter(isRecord)
    .map((warning: Record<string, any>) => ({
      itemName: String(warning.itemName ?? ''),
      allergen: String(warning.allergen ?? ''),
      level: String(warning.level ?? 'WARNING'),
      message: String(warning.message ?? ''),
      kind: warning.kind === 'AVOID' ? 'AVOID' : 'ALLERGY',
    }));

  return { gaps, warnings };
}

function buildPreparationChange(
  item: any,
  before: string | null | undefined,
  after: string | null | undefined,
  source: 'DRAFT' | 'HISTORY',
): PreparationChange | undefined {
  const itemId = String(item?.id ?? '');
  const beforeText = String(before ?? '').trim();
  const afterText = String(after ?? '').trim();
  if (!itemId || !beforeText || !afterText || beforeText === afterText) {
    return undefined;
  }
  const itemName = String(
    item?.ingredient?.name ??
      item?.nutritionFood?.displayNameZh ??
      item?.nutritionFood?.name ??
      '原料',
  );
  return { itemId, itemName, before: beforeText, after: afterText, source };
}

function round(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '?';
}
