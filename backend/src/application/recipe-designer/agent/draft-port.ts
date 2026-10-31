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
}

export interface AssessmentGap {
  key: string;
  label: string;
  status: string;
  value: number | null;
  min: number | null;
  max: number | null;
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

  /** 跑评估，只回缺口和一个总数；不回全量明细。 */
  async assess(): Promise<AssessmentSummary> {
    const result: any = await this.designer.assessDraftForAgent(
      this.draftId,
      this.access,
    );
    const assessment = result?.assessment ?? {};
    const summary = assessment.summary ?? {};
    const groups: any[] = Array.isArray(assessment.groupedEntries)
      ? assessment.groupedEntries
      : [];

    const gaps: AssessmentGap[] = groups
      .filter((entry) => {
        const status = String(entry?.status ?? '');
        return status === 'DEFICIENT' || status === 'EXCESS';
      })
      .slice(0, 12)
      .map((entry) => ({
        key: String(entry.key ?? ''),
        label: String(entry.label ?? entry.name ?? entry.key ?? ''),
        status: String(entry.status ?? ''),
        value: toNumber(entry.value),
        min: toNumber(entry.min),
        max: toNumber(entry.max),
      }));

    const allergens = Array.isArray(result?.allergenWarnings)
      ? result.allergenWarnings.map((warning: any) =>
          String(warning?.allergenName ?? warning?.name ?? warning),
        )
      : [];

    return {
      isCompliant: Boolean(assessment.isCompliant),
      contentRevision: Number(result?.contentRevision ?? 0),
      totalEnergyKcal: toNumber(assessment.totalEnergyKcal),
      counts: {
        compliant: Number(summary.compliant ?? 0),
        deficient: Number(summary.deficient ?? 0),
        excess: Number(summary.excess ?? 0),
        missingData: Number(summary.missingData ?? 0),
      },
      gaps,
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
