import { BadRequestException, Injectable } from '@nestjs/common';
import {
  applyManualResolution,
  buildMergePlan,
  type SourceNutrition,
} from '../../domain/ingredient-creation/nutrition-merge';
import { NUTRITION_FIELD_CATALOG } from '../../domain/ingredient/nutrition-field-catalog';
import { PrismaService } from '../../infrastructure/prisma.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import type {
  IngredientCreationDraft,
  MergePlan,
} from './ingredient-creation.types';

/** 选中主来源与补位来源，生成缝合方案。 */
export interface CreateMergePlanInput {
  primarySourceRecordId: string;
  supplementalSourceRecordIds: string[];
}

/** 人工裁决一个冲突字段。 */
export interface ResolveMergeConflictInput {
  fieldPath: string;
  sourceRecordId: string;
}

/** 从营养库读到的来源记录（只需要适配缝合方案用到的两列）。 */
interface SourceRecordNutrition {
  id: string;
  normalizedNutrition: unknown;
}

interface FieldProvenance {
  sourceValue: number | null;
  sourceUnit: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** 来源原文值可能是数字或数字字符串；空串、`n/a` 一律算「没给」，不写 0。 */
function readNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMergePlan(value: unknown): value is MergePlan {
  return (
    isRecord(value) &&
    typeof value.primarySourceRecordId === 'string' &&
    Array.isArray(value.rows) &&
    Array.isArray(value.conflicts) &&
    Array.isArray(value.missingFields)
  );
}

function readMeta(profile: unknown): Record<string, unknown> | null {
  if (!isRecord(profile) || !isRecord(profile.meta)) {
    return null;
  }
  return profile.meta;
}

/**
 * 读来源档案的字段级溯源（优先 `meta.fieldSources`，回退 `meta.sourceForms`）。
 *
 * 只搬运已存在的原文值 / 原文单位，不做任何换算；`SourceNutrition.values`
 * 里放的仍是目录单位下的 canonical 值。
 */
function readFieldProvenance(
  meta: Record<string, unknown> | null,
  fieldPath: string,
): FieldProvenance {
  const fieldSources =
    meta && isRecord(meta.fieldSources) ? meta.fieldSources : null;
  const sourceForms =
    meta && isRecord(meta.sourceForms) ? meta.sourceForms : null;
  const primary =
    fieldSources && isRecord(fieldSources[fieldPath])
      ? fieldSources[fieldPath]
      : null;
  const secondary =
    sourceForms && isRecord(sourceForms[fieldPath])
      ? sourceForms[fieldPath]
      : null;

  return {
    sourceValue: readNumeric(
      primary?.originalValue ?? secondary?.originalValue,
    ),
    sourceUnit: readNonEmptyString(
      primary?.originalUnit ?? secondary?.originalUnit,
    ),
  };
}

/** 把来源的 `normalizedNutrition` 适配成缝合模块认识的 `SourceNutrition`。 */
export function toSourceNutrition(
  sourceRecordId: string,
  normalizedNutrition: unknown,
): SourceNutrition {
  const profile = isRecord(normalizedNutrition) ? normalizedNutrition : {};
  const meta = readMeta(profile);
  const values: Record<string, number | null | undefined> = {};
  const units: Record<string, string | null | undefined> = {};
  const sourceValues: Record<string, number | null | undefined> = {};

  for (const field of NUTRITION_FIELD_CATALOG) {
    const fieldPath = field.fieldPath as string;
    const [tabKey, fieldKey] = fieldPath.split('.') as [string, string];
    const tab = isRecord(profile[tabKey]) ? profile[tabKey] : null;
    const value = tab?.[fieldKey];
    if (typeof value === 'number' && Number.isFinite(value)) {
      values[fieldPath] = value;
    }

    const provenance = readFieldProvenance(meta, fieldPath);
    if (provenance.sourceValue !== null) {
      sourceValues[fieldPath] = provenance.sourceValue;
      if (provenance.sourceUnit !== null) {
        units[fieldPath] = provenance.sourceUnit;
      }
    }
  }

  return { sourceRecordId, values, units, sourceValues };
}

/**
 * 缝合方案的应用服务。
 *
 * 职责：读来源记录 → 适配 `SourceNutrition` → 调领域层生成/裁决方案 →
 * 写 MERGE 提案快照 → 把当前方案 patch 进草稿。控制器只转发。
 *
 * 快照与当前方案的顺序有硬要求：**先存原始快照，再写当前方案**。人工裁决会覆盖
 * `mergePlan`，但 `proposalHistory` 里必须永远保留 AI 当初提的那一版（含冲突候选）。
 */
@Injectable()
export class IngredientCreationMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly draftService: IngredientCreationDraftService,
  ) {}

  async createMergePlan(
    draftId: string,
    input: CreateMergePlanInput,
  ): Promise<MergePlan> {
    const draft = await this.draftService.get(draftId);
    const sourceIds = [
      input.primarySourceRecordId,
      ...input.supplementalSourceRecordIds,
    ];
    const records = await this.loadSourceRecords(sourceIds);

    const primaryRecord = records.get(input.primarySourceRecordId);
    if (!primaryRecord) {
      throw new BadRequestException(
        `营养来源记录 ${input.primarySourceRecordId} 不存在，不能作为主来源`,
      );
    }

    const supplementals = input.supplementalSourceRecordIds.map(
      (sourceRecordId): SourceNutrition => {
        const record = records.get(sourceRecordId);
        if (!record) {
          throw new BadRequestException(
            `营养来源记录 ${sourceRecordId} 不存在，不能作为补位来源`,
          );
        }
        return toSourceNutrition(record.id, record.normalizedNutrition);
      },
    );

    const plan = buildMergePlan({
      primary: toSourceNutrition(
        primaryRecord.id,
        primaryRecord.normalizedNutrition,
      ),
      supplementals,
    });

    // 1) 先把 AI 原始方案存成快照（只追加，不覆盖）。
    await this.draftService.appendProposal(
      draftId,
      plan as unknown as Record<string, unknown>,
      'MERGE',
    );
    // 2) 再写当前方案；人工裁决只会改这一步的结果。
    await this.draftService.patch(draftId, draft.step, { mergePlan: plan });

    return plan;
  }

  async resolveConflict(
    draftId: string,
    input: ResolveMergeConflictInput,
  ): Promise<MergePlan> {
    const draft = await this.draftService.get(draftId);
    const plan = this.requireMergePlan(draft);

    let resolved: MergePlan;
    try {
      resolved = applyManualResolution(plan, input.fieldPath, {
        sourceRecordId: input.sourceRecordId,
      });
    } catch (error) {
      // 领域层抛的是普通 Error（无值可裁决 / 来源没提供该字段 / 未知字段），
      // 这些都是入参问题，统一映射成 400，而不是落到 500。
      throw new BadRequestException(
        error instanceof Error ? error.message : '人工裁决失败',
      );
    }

    // 只更新当前方案；proposalHistory 是 appendProposal 的专属领地，这里绝不碰。
    await this.draftService.patch(draftId, draft.step, { mergePlan: resolved });

    return resolved;
  }

  private requireMergePlan(draft: IngredientCreationDraft): MergePlan {
    const plan = draft.payload.mergePlan;
    if (!isMergePlan(plan)) {
      throw new BadRequestException('草稿还没有缝合方案，请先生成缝合方案');
    }
    return plan;
  }

  /** 读齐来源记录；不存在或没有营养数据都不进缝合（不猜、不补 0）。 */
  private async loadSourceRecords(
    ids: readonly string[],
  ): Promise<Map<string, SourceRecordNutrition>> {
    const uniqueIds = [...new Set(ids.filter((id) => id.length > 0))];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.nutritionSourceRecord.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, normalizedNutrition: true },
    });

    const byId = new Map<string, SourceRecordNutrition>();
    for (const row of rows) {
      if (
        row.normalizedNutrition === null ||
        row.normalizedNutrition === undefined
      ) {
        throw new BadRequestException(
          `营养来源记录 ${row.id} 没有营养数据，不能参与缝合`,
        );
      }
      byId.set(row.id, {
        id: row.id,
        normalizedNutrition: row.normalizedNutrition,
      });
    }

    return byId;
  }
}
