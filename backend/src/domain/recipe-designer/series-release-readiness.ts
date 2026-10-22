/**
 * 产品线「整系列分阶段发布」门槛（2026-10-22 · 两阶段发布任务）。
 *
 * 业务背景：
 *  · 产品线的一个系列 = 同一道产品在多个生命阶段的配方；
 *  · 阶段设计先以 `Recipe.status=DRAFT` 写入系列仓库（阶段级 `publishDraft`）；
 *  · 单独一个阶段不对外可见，只有**整个系列**才能发布：
 *    `requiredLifeStages` 全部有阶段食谱 + 系列展示资料齐全 → 管理员一键发布。
 *
 * 因此本文件把「系列能不能发布」算成一份 **与前端无关、可单测** 的结论：
 *  · 逐阶段状态 EMPTY / DRAFT / READY / PUBLIC；
 *  · 阻断项按归属分成 SERIES / PRESENTATION / STAGE 三类；
 *  · 目标健康标签只提醒（没有标签仍可上线，只是顾客筛不到）。
 *
 * 本文件是纯函数：阶段快照、展示资料由调用方（RecipeDesignerService）查库后传入，
 * 不在这里访问数据库、也不推断任何缺失数据。
 *
 * 口径说明：
 *  · **EMPTY**：该阶段既没有设计稿，也没有任何阶段食谱；
 *  · **DRAFT**：有设计稿，但还没有写进系列仓库（没有阶段 Recipe）；
 *  · **READY**：系列仓库里已有该阶段 `Recipe.status=DRAFT`（可随系列一起发布）；
 *  · **PUBLIC**：系列仓库里已有该阶段 `Recipe.status=PUBLIC`（已发布）。
 *  · 必填阶段只要有 READY 或 PUBLIC 的阶段食谱就算就绪 —— 已发布阶段不需要重做；
 *  · 未设置 requiredLifeStages（空数组）直接阻断：整系列发布必须知道发哪几个阶段。
 */

/** 阶段在系列仓库里的就绪状态（不含历史版本 / 私密定制等实现细节）。 */
export const SERIES_RELEASE_STAGE_STATUSES = [
  'EMPTY',
  'DRAFT',
  'READY',
  'PUBLIC',
] as const;

export type SeriesReleaseStageStatus =
  (typeof SERIES_RELEASE_STAGE_STATUSES)[number];

/** 问题归属：系列级设置 / 产品展示 / 单个生命阶段。 */
export type SeriesReleaseIssueScope = 'SERIES' | 'PRESENTATION' | 'STAGE';

export type SeriesReleaseBlockerCode =
  | 'REQUIRED_LIFE_STAGES_EMPTY'
  | 'REQUIRED_LIFE_STAGE_UNKNOWN'
  | 'REQUIRED_STAGE_NOT_READY'
  | 'COVER_IMAGE_REQUIRED'
  | 'COVER_TITLE_REQUIRED'
  | 'SELLING_POINT_REQUIRED';

export type SeriesReleaseWarningCode = 'TARGET_HEALTH_TAGS_MISSING';

export interface SeriesReleaseIssue<TCode extends string = string> {
  code: TCode;
  message: string;
  scope: SeriesReleaseIssueScope;
  /** 相关字段名，便于后台定位到具体输入框 */
  field?: string;
  /** 相关生命阶段（SERIES / PRESENTATION 级问题没有这个字段） */
  stageCode?: string;
}

export type SeriesReleaseBlocker = SeriesReleaseIssue<SeriesReleaseBlockerCode>;
export type SeriesReleaseWarning = SeriesReleaseIssue<SeriesReleaseWarningCode>;

/** 系列级产品展示资料（发布时复制到每条 Recipe）。 */
export interface SeriesReleasePresentation {
  coverImageUrl?: string | null;
  coverTitle?: string | null;
  sellingPoint?: string | null;
  targetHealthTags?: string[] | null;
}

/** 一个生命阶段在系列仓库里的现状（由服务层查库后传入）。 */
export interface SeriesReleaseStageSnapshot {
  stageCode: string;
  label: string;
  status: SeriesReleaseStageStatus;
  /** 该阶段最新一条系列仓库食谱（优先 PUBLIC，其次 DRAFT）的业务 id */
  latestRecipeId?: string | null;
  latestRecipeVersion?: number | null;
  /** 该阶段当前可编辑的设计草稿 id（没有草稿时为 null） */
  designDraftId?: string | null;
}

export interface SeriesReleaseStageReadiness extends SeriesReleaseStageSnapshot {
  /** 是否在 requiredLifeStages 里 */
  required: boolean;
}

export interface BuildSeriesReleaseReadinessInput {
  seriesId: string;
  /** CATALOG | ORDER；订单系列不适用产品线发布，由服务层先行拒绝 */
  designMode: string;
  requiredLifeStages?: string[] | null;
  presentation?: SeriesReleasePresentation | null;
  /** 全量阶段快照，顺序即后台展示顺序 */
  stages: SeriesReleaseStageSnapshot[];
}

export interface SeriesReleaseReadiness {
  seriesId: string;
  designMode: string;
  ready: boolean;
  requiredLifeStages: string[];
  /** 必填阶段（按传入阶段快照的顺序，只包含配置里的阶段） */
  requiredStages: SeriesReleaseStageReadiness[];
  /** 全量阶段（便于后台展示「其它已设计阶段」） */
  stages: SeriesReleaseStageReadiness[];
  presentation: {
    coverImageUrl: string | null;
    coverTitle: string | null;
    sellingPoint: string | null;
    targetHealthTags: string[];
  };
  blockers: SeriesReleaseBlocker[];
  warnings: SeriesReleaseWarning[];
  summary: {
    requiredStageCount: number;
    readyStageCount: number;
    publishedStageCount: number;
    designedStageCount: number;
  };
}

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .map((entry) => normalizeText(entry))
        .filter((entry) => entry.length > 0),
    ),
  ];
};

const isStageReady = (status: SeriesReleaseStageStatus): boolean =>
  status === 'READY' || status === 'PUBLIC';

const describeStageStatus = (status: SeriesReleaseStageStatus): string => {
  if (status === 'EMPTY') {
    return '还没有任何设计稿或阶段食谱';
  }
  if (status === 'DRAFT') {
    return '阶段设计还停留在设计器草稿，尚未保存为系列仓库的阶段食谱';
  }
  return '';
};

export const buildSeriesReleaseReadiness = (
  input: BuildSeriesReleaseReadinessInput,
): SeriesReleaseReadiness => {
  const blockers: SeriesReleaseBlocker[] = [];
  const warnings: SeriesReleaseWarning[] = [];

  const requiredLifeStages = normalizeStringList(input.requiredLifeStages);
  const presentation = input.presentation ?? {};
  const coverImageUrl = normalizeText(presentation.coverImageUrl) || null;
  const coverTitle = normalizeText(presentation.coverTitle) || null;
  const sellingPoint = normalizeText(presentation.sellingPoint) || null;
  const targetHealthTags = normalizeStringList(presentation.targetHealthTags);

  const stageByCode = new Map(
    input.stages.map((stage) => [stage.stageCode, stage]),
  );
  const requiredStageCodeSet = new Set(requiredLifeStages);

  const stages: SeriesReleaseStageReadiness[] = input.stages.map((stage) => ({
    ...stage,
    required: requiredStageCodeSet.has(stage.stageCode),
  }));
  const requiredStages = stages.filter((stage) => stage.required);

  if (requiredLifeStages.length === 0) {
    blockers.push({
      code: 'REQUIRED_LIFE_STAGES_EMPTY',
      scope: 'SERIES',
      message: '还没有选择必需的适用生命阶段，不能发布整条产品线',
      field: 'requiredLifeStages',
    });
  }

  for (const stageCode of requiredLifeStages) {
    const stage = stageByCode.get(stageCode);
    if (!stage) {
      blockers.push({
        code: 'REQUIRED_LIFE_STAGE_UNKNOWN',
        scope: 'STAGE',
        message: `必填生命阶段「${stageCode}」不是有效的阶段代码，请重新选择`,
        field: 'requiredLifeStages',
        stageCode,
      });
      continue;
    }

    if (isStageReady(stage.status)) {
      continue;
    }

    const stageLabel = stage.label || stageCode;
    const statusHint = describeStageStatus(stage.status);
    blockers.push({
      code: 'REQUIRED_STAGE_NOT_READY',
      scope: 'STAGE',
      message: `「${stageLabel}」阶段还不就绪${statusHint ? `：${statusHint}` : ''}；请先完成该阶段设计并发布为阶段食谱`,
      field: 'requiredLifeStages',
      stageCode,
    });
  }

  if (!coverImageUrl) {
    blockers.push({
      code: 'COVER_IMAGE_REQUIRED',
      scope: 'PRESENTATION',
      message: '请上传产品线封面图后再发布',
      field: 'coverImageUrl',
    });
  }
  if (!coverTitle) {
    blockers.push({
      code: 'COVER_TITLE_REQUIRED',
      scope: 'PRESENTATION',
      message: '请填写封面标题（最多 20 个字符）',
      field: 'coverTitle',
    });
  }
  if (!sellingPoint) {
    blockers.push({
      code: 'SELLING_POINT_REQUIRED',
      scope: 'PRESENTATION',
      message: '请填写一句话卖点（最多 200 个字符）',
      field: 'sellingPoint',
    });
  }
  if (targetHealthTags.length === 0) {
    warnings.push({
      code: 'TARGET_HEALTH_TAGS_MISSING',
      scope: 'PRESENTATION',
      message: '未设置目标健康标签，上线后顾客无法按健康需求筛选到这条产品线',
      field: 'targetHealthTags',
    });
  }

  return {
    seriesId: input.seriesId,
    designMode: input.designMode,
    ready: blockers.length === 0,
    requiredLifeStages,
    requiredStages,
    stages,
    presentation: {
      coverImageUrl,
      coverTitle,
      sellingPoint,
      targetHealthTags,
    },
    blockers,
    warnings,
    summary: {
      requiredStageCount: requiredLifeStages.length,
      readyStageCount: requiredStages.filter((stage) =>
        isStageReady(stage.status),
      ).length,
      publishedStageCount: requiredStages.filter(
        (stage) => stage.status === 'PUBLIC',
      ).length,
      designedStageCount: stages.filter((stage) => stage.status !== 'EMPTY')
        .length,
    },
  };
};
