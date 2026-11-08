/**
 * 草稿端口：把 RecipeDesignerService 包成 Agent 能用的 5 个动作。
 *
 * 旧适配器（recipe-designer-agent.adapter.ts，103KB / 约 3,000 行）把每个字段
 * 都映射了一遍，其中大量是为了给模型"看全量"。新版的原则相反：
 * 只回这一步用得上的摘要，细节按需再取。
 */
import { Injectable } from '@nestjs/common';
import { RecipeDesignerService } from '../recipe-designer.service';
import { AgentToolError, type RecipeEditOp } from './agent-types';
import type { AssessmentTargetOverride } from '../../../domain/recipe-designer/types';

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
  } | null;
}

/** 一个候选原料的极简投影。 */
export interface FoodCandidate {
  ingredientId: string;
  nutritionFoodId: string;
  name: string;
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
}

@Injectable()
export class RecipeDraftPort {
  constructor(
    private readonly designer: RecipeDesignerService,
    private readonly access: Access,
    private readonly draftId: string,
  ) {}

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
            designMode: draft.series.designMode === 'ORDER' ? 'ORDER' : 'CATALOG',
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
      const primary =
        profiles.find((profile) => profile.isPrimary) ?? profiles[0];
      candidates.push({
        ingredientId: String(row.id),
        nutritionFoodId: String(primary.nutritionFoodId),
        name: String(row.name ?? primary.displayNameZh ?? ''),
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
  async editRecipe(
    ops: RecipeEditOp[],
  ): Promise<Array<{ op: string; ok: boolean; message: string }>> {
    const results: Array<{ op: string; ok: boolean; message: string }> = [];

    for (const op of ops) {
      try {
        if (op.op === 'add') {
          await this.designer.addItem(
            this.draftId,
            {
              nutritionFoodId: op.nutritionFoodId,
              ingredientId: op.ingredientId,
              weightG: op.weightG,
              preparationMethod: op.preparationMethod,
            } as any,
            this.access,
          );
          results.push({ op: 'add', ok: true, message: '已加入' });
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
          const before = (await this.designer.getDraft(
            this.draftId,
            this.access,
          )) as any;
          const oldItem = (before.items ?? []).find(
            (item: any) => item.id === op.itemId,
          );
          if (!oldItem) {
            throw new AgentToolError('ITEM_NOT_FOUND', '要替换的原料不存在');
          }
          const weightG = Number(oldItem.weightG ?? 0);
          await this.designer.removeItem(op.itemId, this.access);
          await this.designer.addItem(
            this.draftId,
            {
              nutritionFoodId: op.nutritionFoodId,
              ingredientId: op.ingredientId,
              weightG,
              preparationMethod: oldItem.preparationMethod ?? undefined,
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

  private lastTargetOverrides?: AssessmentTargetOverride[];

  /** 本次会话最后一次评估使用的目标覆盖；edit_recipe 做前后对比时沿用。 */
  getLastTargetOverrides(): AssessmentTargetOverride[] | undefined {
    return this.lastTargetOverrides;
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
        const mappedContributors = contributors.slice(0, 3).map((contributor: any) => ({
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

    const allergens = Array.isArray(result?.allergenWarnings)
      ? result.allergenWarnings.map((warning: any) =>
          String(warning?.allergenName ?? warning?.name ?? warning),
        )
      : [];

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

function round(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '?';
}
