import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IngredientCreationCandidateService } from '../../application/ingredient-creation/ingredient-creation-candidate.service';
import {
  IngredientCreationCommitService,
  type CommitIngredientCreationResult,
} from '../../application/ingredient-creation/ingredient-creation-commit.service';
import { IngredientCreationDraftService } from '../../application/ingredient-creation/ingredient-creation-draft.service';
import type {
  CandidateSearchResult,
  CreationStep,
  FinalCheckResult,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  MergePlan,
  NutritionEvidenceEntry,
} from '../../application/ingredient-creation/ingredient-creation.types';
import { buildEvidenceLedger } from '../../domain/ingredient-creation/evidence-ledger';
import {
  runFinalCheck,
  type FinalCheckBasis,
} from '../../domain/ingredient-creation/final-check';
import {
  applyManualResolution,
  buildMergePlan,
  type SourceNutrition,
} from '../../domain/ingredient-creation/nutrition-merge';
import {
  normalizePreparationState,
  type PreparationState,
} from '../../domain/ingredient-creation/preparation-state';
import {
  resolveStateCoverage,
  type CoverageCategory,
} from '../../domain/ingredient-creation/state-coverage';
import { NUTRITION_FIELD_CATALOG } from '../../domain/ingredient/nutrition-field-catalog';
import { PrismaService } from '../../infrastructure/prisma.service';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  CommitIngredientCreationDto,
  CreateDraftDto,
  CreateMergePlanDto,
  FindCandidatesDto,
  ResolveMergeConflictDto,
  UpdateDraftDto,
  type UpdateDraftPayloadDto,
} from '../dto/ingredient-creation';
import {
  COVERAGE_CATEGORIES,
  PREPARATION_STATES,
} from '../dto/ingredient-creation/ingredient-creation.constants';
import { AdminGuard } from '../guards/role.guard';

/** 从营养库读到的来源记录（只需要缝合与证据账本用到的两列）。 */
interface SourceRecordNutrition {
  id: string;
  normalizedNutrition: unknown;
}

interface FieldProvenance {
  sourceValue: number | null;
  sourceUnit: string | null;
}

/**
 * 宏观质量项：水分 / 蛋白 / 脂肪 / 灰分 / 碳水。
 *
 * 膳食纤维不重复计入——USDA 的碳水是「by difference」，已经把纤维包含在内，
 * 再加一次会让宏量之和虚高、误报 `MACRO_SUM_OVER_100`。
 */
const MACRO_MASS_FIELD_PATHS = [
  'macros.moisture',
  'macros.crudeProtein',
  'macros.crudeFat',
  'macros.ash',
  'macros.carbohydrate',
] as const;

const ENERGY_KCAL_FIELD_PATH = 'macros.energyKcal';
const CRUDE_PROTEIN_FIELD_PATH = 'macros.crudeProtein';
const CRUDE_FAT_FIELD_PATH = 'macros.crudeFat';
const CARBOHYDRATE_FIELD_PATH = 'macros.carbohydrate';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function isPreparationState(value: unknown): value is PreparationState {
  return (
    typeof value === 'string' &&
    (PREPARATION_STATES as readonly string[]).includes(value)
  );
}

function isCoverageCategory(value: unknown): value is CoverageCategory {
  return (
    typeof value === 'string' &&
    (COVERAGE_CATEGORIES as readonly string[]).includes(value)
  );
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
function toSourceNutrition(
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

function readPreparationStateFromProfile(
  profile: unknown,
): PreparationState | null {
  const meta = readMeta(profile);
  const sampleState = meta?.sampleState;
  if (typeof sampleState !== 'string') {
    return null;
  }
  return normalizePreparationState(sampleState);
}

function readEntryValue(
  entries: readonly NutritionEvidenceEntry[],
  fieldPath: string,
): number | null {
  const entry = entries.find((candidate) => candidate.fieldPath === fieldPath);
  return entry ? readFiniteNumber(entry.finalValue) : null;
}

/** 宏量质量之和（g/100g）；缺失项不按 0 计，只累加确有的值。 */
function sumMacroGrams(entries: readonly NutritionEvidenceEntry[]): number {
  let sum = 0;
  for (const fieldPath of MACRO_MASS_FIELD_PATHS) {
    const value = readEntryValue(entries, fieldPath);
    if (value !== null) {
      sum += value;
    }
  }
  return sum;
}

/**
 * 4/9/4 反算能量。蛋白 / 脂肪 / 碳水任一缺失时返回 null：
 * 缺数据不能当成 0，否则会凭空造出一个「反算值」去和声明能量比较。
 */
function energyFromMacrosKcal(
  entries: readonly NutritionEvidenceEntry[],
): number | null {
  const protein = readEntryValue(entries, CRUDE_PROTEIN_FIELD_PATH);
  const fat = readEntryValue(entries, CRUDE_FAT_FIELD_PATH);
  const carbohydrate = readEntryValue(entries, CARBOHYDRATE_FIELD_PATH);
  if (protein === null || fat === null || carbohydrate === null) {
    return null;
  }

  return 4 * protein + 9 * fat + 4 * carbohydrate;
}

/** 终检口径：档案一律每 100g；来源按每份时把份量克数交给终检判断能否换算。 */
function resolveFinalCheckBasis(primaryProfile: unknown): FinalCheckBasis {
  const meta = readMeta(primaryProfile);
  const rawBasisType =
    meta && typeof meta.rawBasisType === 'string' ? meta.rawBasisType : null;
  const servingGrams = readFiniteNumber(meta?.servingWeightG);

  return {
    profileBasis: 'PER_100_G',
    sourceBasis: rawBasisType === 'PER_SERVING' ? 'PER_SERVING' : 'PER_100_G',
    servingGrams:
      servingGrams !== null && servingGrams > 0 ? servingGrams : null,
  };
}

function collectRequiredStates(
  draft: IngredientCreationDraft,
): PreparationState[] {
  const intake = isRecord(draft.payload.intake) ? draft.payload.intake : null;
  if (intake && Array.isArray(intake.requiredStates)) {
    return intake.requiredStates.filter(isPreparationState);
  }

  // 草稿里没存显式清单时，按类别给默认值；非法类别在 PATCH 时已被挡住。
  if (intake && isCoverageCategory(intake.category)) {
    return resolveStateCoverage(intake.category).required;
  }

  return [];
}

/**
 * 已具备哪些生熟档案。
 *
 * 优先读前端 patch 进来的 `profiles`（HTTP DTO 已允许该键；共享的 payload 类型
 * 还没声明它）；否则至少能从本次缝合的主来源 `meta.sampleState` 确定一份。
 * 都不确定时返回空数组，让终检如实报缺，不假装已经有了。
 */
function collectPresentStates(
  draft: IngredientCreationDraft,
  primaryProfile: unknown,
): PreparationState[] {
  const present = new Set<PreparationState>();
  const payload = draft.payload as IngredientCreationDraftPayload & {
    profiles?: unknown;
  };

  if (Array.isArray(payload.profiles)) {
    for (const profile of payload.profiles) {
      if (isRecord(profile) && isPreparationState(profile.preparationState)) {
        present.add(profile.preparationState);
      }
    }
  }

  const primaryState = readPreparationStateFromProfile(primaryProfile);
  if (primaryState) {
    present.add(primaryState);
  }

  return [...present];
}

/** 服务层兜底之外的显式防线：payload 回传整份快照时也不得覆盖 AI 提案历史。 */
function stripProposalHistory(
  payload: UpdateDraftPayloadDto,
): Partial<IngredientCreationDraftPayload> {
  const { proposalHistory: _ignored, ...rest } =
    payload as UpdateDraftPayloadDto & {
      proposalHistory?: unknown;
    };
  return rest as unknown as Partial<IngredientCreationDraftPayload>;
}

/**
 * AI 辅助新建标准原料的后台接口。
 *
 * 只做参数校验、编排与转发：数字规则、缝合、终检全部在领域层 / 服务层，
 * 控制器不重算任何营养结果（终检结果直接来自 `runFinalCheck`）。
 */
@ApiTags('Admin Ingredient Creation')
@ApiBearerAuth()
@Controller('api/v1/admin/ingredient-creation')
@UseGuards(AuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class IngredientCreationController {
  constructor(
    private readonly draftService: IngredientCreationDraftService,
    private readonly candidateService: IngredientCreationCandidateService,
    private readonly commitService: IngredientCreationCommitService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('drafts')
  @ApiOperation({ summary: '创建 AI 新建原料草稿（INTAKE 站）' })
  async createDraft(
    @Body() dto: CreateDraftDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<{ draftId: string; step: CreationStep }>> {
    const draft = await this.draftService.create({
      name: dto.name,
      type: 'FOOD',
      createdBy: user.userId,
    });

    return new ApiResponseDto(0, 'Success', {
      draftId: draft.id,
      step: draft.step,
    });
  }

  @Get('drafts/:id')
  @ApiOperation({ summary: '读取草稿（找不到 → 404）' })
  async getDraft(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<IngredientCreationDraft>> {
    const draft = await this.draftService.get(id);
    return new ApiResponseDto(0, 'Success', draft);
  }

  @Patch('drafts/:id')
  @ApiOperation({ summary: '推进站点并浅合并本站 payload' })
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateDraftDto,
  ): Promise<ApiResponseDto<IngredientCreationDraft>> {
    const draft = await this.draftService.patch(
      id,
      dto.step,
      stripProposalHistory(dto.payload),
    );

    return new ApiResponseDto(0, 'Success', draft);
  }

  @Post('drafts/:id/candidates')
  @ApiOperation({ summary: '按名字与生熟状态检索本地候选' })
  async findCandidates(
    @Param('id') id: string,
    @Body() dto: FindCandidatesDto,
  ): Promise<ApiResponseDto<CandidateSearchResult>> {
    // 候选服务本身不读草稿；先确认草稿存在，避免给不存在的草稿返回结果。
    await this.draftService.get(id);

    const result = await this.candidateService.findCandidates({
      name: dto.name,
      nameEn: dto.nameEn,
      state: dto.state,
    });

    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('drafts/:id/merge')
  @ApiOperation({ summary: '按主来源与补位来源生成缝合方案并存入草稿' })
  async createMergePlan(
    @Param('id') id: string,
    @Body() dto: CreateMergePlanDto,
  ): Promise<ApiResponseDto<MergePlan>> {
    const draft = await this.draftService.get(id);
    const sourceIds = [
      dto.primarySourceRecordId,
      ...dto.supplementalSourceRecordIds,
    ];
    const records = await this.loadSourceRecords(sourceIds);

    const primaryRecord = records.get(dto.primarySourceRecordId);
    if (!primaryRecord) {
      throw new BadRequestException(
        `营养来源记录 ${dto.primarySourceRecordId} 不存在，不能作为主来源`,
      );
    }

    const supplementals = dto.supplementalSourceRecordIds.map(
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

    await this.draftService.patch(id, draft.step, { mergePlan: plan });

    return new ApiResponseDto(0, 'Success', plan);
  }

  @Post('drafts/:id/merge/resolve')
  @ApiOperation({ summary: '人工裁决一个冲突字段' })
  async resolveMergeConflict(
    @Param('id') id: string,
    @Body() dto: ResolveMergeConflictDto,
  ): Promise<ApiResponseDto<MergePlan>> {
    const draft = await this.draftService.get(id);
    const plan = this.requireMergePlan(draft);

    let resolved: MergePlan;
    try {
      resolved = applyManualResolution(plan, dto.fieldPath, {
        sourceRecordId: dto.sourceRecordId,
      });
    } catch (error) {
      // 领域层抛的是普通 Error（无值可裁决 / 来源没提供该字段 / 未知字段），
      // 这些都是入参问题，统一映射成 400，而不是落到 500。
      throw new BadRequestException(
        error instanceof Error ? error.message : '人工裁决失败',
      );
    }

    await this.draftService.patch(id, draft.step, { mergePlan: resolved });

    return new ApiResponseDto(0, 'Success', resolved);
  }

  @Post('drafts/:id/check')
  @ApiOperation({ summary: '跑服务端终检，返回拦死 / 可例外 / 提醒三档' })
  async runCheck(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<FinalCheckResult>> {
    const draft = await this.draftService.get(id);
    const plan = this.requireMergePlan(draft);

    const sourceIds = new Set<string>([plan.primarySourceRecordId]);
    for (const row of plan.rows) {
      if (row.sourceRecordId) {
        sourceIds.add(row.sourceRecordId);
      }
    }
    for (const conflict of plan.conflicts) {
      for (const candidate of conflict.candidates) {
        if (candidate.sourceRecordId) {
          sourceIds.add(candidate.sourceRecordId);
        }
      }
    }

    const records = await this.loadSourceRecords([...sourceIds]);
    const primaryRecord = records.get(plan.primarySourceRecordId);
    const ledger = buildEvidenceLedger({
      plan,
      sources: [...records.values()].map((record) => ({
        sourceRecordId: record.id,
        normalizedNutrition: record.normalizedNutrition,
      })),
    });

    const result = runFinalCheck({
      entries: ledger.entries,
      basis: resolveFinalCheckBasis(primaryRecord?.normalizedNutrition),
      macroSumG: sumMacroGrams(ledger.entries),
      energyKcal: readEntryValue(ledger.entries, ENERGY_KCAL_FIELD_PATH),
      energyFromMacrosKcal: energyFromMacrosKcal(ledger.entries),
      coverage: {
        required: collectRequiredStates(draft),
        present: collectPresentStates(
          draft,
          primaryRecord?.normalizedNutrition,
        ),
      },
    });

    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('drafts/:id/commit')
  @ApiOperation({ summary: '一次性提交原料、营养档案与映射' })
  async commit(
    @Param('id') id: string,
    @Body() dto: CommitIngredientCreationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<CommitIngredientCreationResult>> {
    const result = await this.commitService.commit({
      draftId: id,
      userId: user.userId,
      ingredient: {
        name: dto.ingredient.name,
        type: dto.ingredient.type,
        baseUnit: dto.ingredient.baseUnit,
        unitDisplayLabel: dto.ingredient.unitDisplayLabel,
        cfctClass: dto.ingredient.cfctClass ?? null,
        edibleYieldRate: dto.ingredient.edibleYieldRate ?? null,
      },
      profiles: dto.profiles.map((profile) => ({
        preparationState: profile.preparationState,
        sourceRecordId: profile.sourceRecordId,
        entries: profile.entries,
        notes: profile.notes ?? null,
      })),
      primaryProfileIndex: dto.primaryProfileIndex,
    });

    return new ApiResponseDto(0, 'Success', result);
  }

  private requireMergePlan(draft: IngredientCreationDraft): MergePlan {
    const plan = draft.payload.mergePlan;
    if (!isMergePlan(plan)) {
      throw new BadRequestException('草稿还没有缝合方案，请先生成缝合方案');
    }
    return plan;
  }

  /**
   * 读来源记录并校验存在性与「有营养数据」。
   *
   * 这是本控制器里唯一直接碰库的地方：应用层没有对应的读来源服务，
   * 而任务边界不允许新增/修改服务层。该编排更适合下沉成一个
   * `IngredientCreationMergeService`（见交付报告）。
   */
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
          `营养来源记录 ${row.id} 没有营养数据，不能参与缝合或终检`,
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
