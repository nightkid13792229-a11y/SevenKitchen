/**
 * 产品线「发布 / 更新」范围与门槛（2026-10-26 · 发布范围改由阶段状态推导）。
 *
 * 业务背景：
 *  · 产品线的一个系列 = 同一道产品在多个生命阶段的配方；
 *  · 阶段设计先以 `Recipe.status=DRAFT` 写入系列仓库（阶段级 `publishDraft`）；
 *  · 单独一个阶段不对外可见，只有**整个系列**才能发布：
 *    当前已就绪（READY）或已上线但有更新（PUBLIC + hasPendingUpdate）的阶段
 *    就是本次可以发布 / 更新的范围。
 *
 * 因此本文件把「系列能不能发布」算成一份 **与前端无关、可单测** 的结论：
 *  · 逐阶段状态 EMPTY / DRAFT / READY / PUBLIC；
 *  · 问题按归属标注 SERIES / PRESENTATION / STAGE（本期阻断项都在 PRESENTATION）；
 *  · 封面角标只提醒（没配角标时封面左下角没有文字，仍可上线）。
 *
 * 本文件是纯函数：阶段快照、展示资料由调用方（RecipeDesignerService）查库后传入，
 * 不在这里访问数据库、也不推断任何缺失数据。
 *
 * 口径说明：
 *  · **EMPTY**：该阶段既没有设计稿，也没有任何阶段食谱；
 *  · **DRAFT**：有设计稿，但还没有写进系列仓库（没有阶段 Recipe）；
 *  · **READY**：系列仓库里已有该阶段 `Recipe.status=DRAFT`（待发布）；
 *  · **PUBLIC**：系列仓库里已有该阶段 `Recipe.status=PUBLIC`（已发布）。
 *
 * 2026-10-26 发布口径：
 *  · 发布范围不再由 `requiredLifeStages` 声明，而是由阶段现状推导；
 *  · `actionable` = READY（待发布）或 PUBLIC 且有更新草稿（待更新）；
 *  · 首次发布只要有 1 个 READY 阶段即可，不要求所有生命阶段齐全；
 *  · `canRelease` = 没有阻断项且至少 1 个可操作阶段；
 *  · 封面标题不再参与发布校验（小程序展示已不再回退 coverTitle）。
 *
 * 2026-10-22 补充「重新发布」口径：
 *  · 已发布阶段如果再写入一版新的 `Recipe.status=DRAFT`，阶段状态仍是 PUBLIC
 *    （兼容老前端），但 `hasPendingUpdate=true`，表示有一版更新的草稿等待发布；
 *  · 整条系列的展示状态由 `releaseState` 给出：
 *      UNPUBLISHED  系列还不是 PUBLIC；
 *      PUBLISHED    系列 PUBLIC 且没有任何待更新阶段；
 *      NEEDS_UPDATE 系列 PUBLIC，但至少一个阶段有更新草稿。
 *  · 待更新**不阻断**发布：发布动作只把选中的阶段最新 DRAFT 版本发出去。
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

/**
 * 整条产品线的展示状态（由系列 businessStatus + 各阶段待更新情况推导）。
 *
 * 这是后台列表/发布抽屉判断按钮文案用的结论，**不参与**能否发布的判断：
 * 只要 blockers 为空，NEEDS_UPDATE 的系列也可以直接重新发布。
 */
export const SERIES_RELEASE_STATES = [
  'UNPUBLISHED',
  'PUBLISHED',
  'NEEDS_UPDATE',
] as const;

export type SeriesReleaseState = (typeof SERIES_RELEASE_STATES)[number];

/** 问题归属：系列级设置 / 产品展示 / 单个生命阶段。 */
export type SeriesReleaseIssueScope = 'SERIES' | 'PRESENTATION' | 'STAGE';

/** 阻断发布的问题（封面图 / 卖点是唯一的发布门槛）。 */
export type SeriesReleaseBlockerCode =
  | 'COVER_IMAGE_REQUIRED'
  | 'SELLING_POINT_REQUIRED'
  | 'TAXONOMY_REQUIRED';

/** 只提醒、不阻断的问题（未设置封面角标时封面左下角为空）。 */
export type SeriesReleaseWarningCode = 'COVER_BADGE_MISSING';

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
  /** 保留字段：小程序已不再回退展示，发布也不再要求 */
  coverTitle?: string | null;
  sellingPoint?: string | null;
  /** 保留字段：本期前台不展示、发布不校验 */
  targetHealthTags?: string[] | null;
  /** 系列封面角标（合规词表名称，只读回传，便于发布抽屉预览） */
  coverBadges?: string[] | null;
}

/** 一个生命阶段在系列仓库里的现状（由服务层查库后传入）。 */
export interface SeriesReleaseStageSnapshot {
  stageCode: string;
  label: string;
  status: SeriesReleaseStageStatus;
  /** 该阶段最新一条系列仓库食谱（优先 PUBLIC，其次 DRAFT）的业务 id */
  latestRecipeId?: string | null;
  /** 该阶段最新一条食谱行的版本号（不区分 DRAFT / PUBLIC） */
  latestRecipeVersion?: number | null;
  /** 该阶段最新一条 PUBLIC 食谱行的版本号（从未发布过为 null） */
  publishedRecipeVersion?: number | null;
  /**
   * 是否有比已发布版本更新的 DRAFT 等待发布。
   *
   * 服务层会按版本号 / 行 id 精确判断后传入；如果调用方只给了版本号，
   * 这里也会用 `latestRecipeVersion > publishedRecipeVersion` 兜底推断。
   */
  hasPendingUpdate?: boolean;
  /** 该阶段当前可编辑的设计草稿 id（没有草稿时为 null） */
  designDraftId?: string | null;
}

export interface SeriesReleaseStageReadiness extends SeriesReleaseStageSnapshot {
  /**
   * 本次发布 / 更新是否可以操作：
   *  · READY（已入库、待发布）；
   *  · PUBLIC 且 hasPendingUpdate（已上线、有更新草稿）。
   */
  actionable: boolean;
}

export interface BuildSeriesReleaseReadinessInput {
  seriesId: string;
  /** CATALOG | ORDER；订单系列不适用产品线发布，由服务层先行拒绝 */
  designMode: string;
  /** 系列业务状态 DRAFT | PUBLIC | PRIVATE_CUSTOM；缺省按 DRAFT 处理 */
  businessStatus?: string | null;
  presentation?: SeriesReleasePresentation | null;
  /**
   * 该系列挂了几个需求分类（2026-10-27）。
   * 只数条数，不区分分类种类：双拼菜不挂主蛋白、只挂场景，也算已归类。
   */
  taxonomyLinkCount?: number;
  /** 全量阶段快照，顺序即后台展示顺序 */
  stages: SeriesReleaseStageSnapshot[];
}

export interface SeriesReleaseReadiness {
  seriesId: string;
  designMode: string;
  /** 系列业务状态（原样返回，便于后台展示） */
  businessStatus: string;
  /**
   * 整条系列的展示状态：
   *  · UNPUBLISHED  系列不是 PUBLIC；
   *  · PUBLISHED    系列 PUBLIC 且没有待更新阶段；
   *  · NEEDS_UPDATE 系列 PUBLIC 且至少一个阶段有更新草稿。
   */
  releaseState: SeriesReleaseState;
  /** 展示资料是否齐全（封面图 + 一句话卖点） */
  ready: boolean;
  /** 是否可点「发布 / 更新」：展示资料齐全，且至少有一个可操作阶段 */
  canRelease: boolean;
  /** 全量阶段（便于后台展示「其它已设计阶段」） */
  stages: SeriesReleaseStageReadiness[];
  presentation: {
    coverImageUrl: string | null;
    coverTitle: string | null;
    sellingPoint: string | null;
    targetHealthTags: string[];
    coverBadges: string[];
  };
  blockers: SeriesReleaseBlocker[];
  warnings: SeriesReleaseWarning[];
  /** 是否存在「已发布过、但又有更新草稿」的阶段 */
  hasPendingUpdates: boolean;
  /** 有待更新草稿的阶段代码（按阶段顺序） */
  pendingStageCodes: string[];
  summary: {
    totalStageCount: number;
    /** READY 阶段数（待发布） */
    publishableStageCount: number;
    /** 有待更新草稿的阶段数 */
    pendingStageCount: number;
    publishedStageCount: number;
    /** 已上线且没有待更新草稿的阶段数 */
    upToDateStageCount: number;
    /** 有设计稿或已有阶段食谱的阶段数（不含 EMPTY） */
    designedStageCount: number;
    /** 可操作阶段数（READY + PUBLIC 待更新） */
    actionableStageCount: number;
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

/** 版本号：只接受有限的数字；缺失/非法统一按 null（前端展示为「暂无」）。 */
const normalizeVersion = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.trunc(value);
};

/**
 * 是否有一版更新的 DRAFT 等待发布。
 *
 * 明确传入 `hasPendingUpdate=true` 时以它为准（服务层可以识别
 * 「同一版本号但换了 recipeId」的替换场景）；
 * 否则用版本号兜底：只要最新版本号高于已发布版本号，最新一条必然是 DRAFT。
 */
const resolveStagePendingUpdate = (
  stage: SeriesReleaseStageSnapshot,
  latestRecipeVersion: number | null,
  publishedRecipeVersion: number | null,
): boolean => {
  if (stage.hasPendingUpdate === true) {
    return true;
  }
  if (latestRecipeVersion === null || publishedRecipeVersion === null) {
    return false;
  }
  return latestRecipeVersion > publishedRecipeVersion;
};

/** 可操作阶段：待发布（READY）或已上线待更新（PUBLIC + hasPendingUpdate）。 */
const isStageActionable = (
  status: SeriesReleaseStageStatus,
  hasPendingUpdate: boolean,
): boolean => status === 'READY' || (status === 'PUBLIC' && hasPendingUpdate);

export const buildSeriesReleaseReadiness = (
  input: BuildSeriesReleaseReadinessInput,
): SeriesReleaseReadiness => {
  const blockers: SeriesReleaseBlocker[] = [];
  const warnings: SeriesReleaseWarning[] = [];

  const businessStatus =
    normalizeText(input.businessStatus).toUpperCase() || 'DRAFT';
  const presentation = input.presentation ?? {};
  const coverImageUrl = normalizeText(presentation.coverImageUrl) || null;
  const coverTitle = normalizeText(presentation.coverTitle) || null;
  const sellingPoint = normalizeText(presentation.sellingPoint) || null;
  const targetHealthTags = normalizeStringList(presentation.targetHealthTags);
  const coverBadges = normalizeStringList(presentation.coverBadges);

  const stages: SeriesReleaseStageReadiness[] = input.stages.map((stage) => {
    const latestRecipeVersion = normalizeVersion(stage.latestRecipeVersion);
    const publishedRecipeVersion = normalizeVersion(
      stage.publishedRecipeVersion,
    );
    const hasPendingUpdate = resolveStagePendingUpdate(
      stage,
      latestRecipeVersion,
      publishedRecipeVersion,
    );
    return {
      ...stage,
      latestRecipeVersion,
      publishedRecipeVersion,
      hasPendingUpdate,
      actionable: isStageActionable(stage.status, hasPendingUpdate),
    };
  });

  const pendingStages = stages.filter((stage) => stage.hasPendingUpdate);
  const hasPendingUpdates = pendingStages.length > 0;
  const pendingStageCodes = pendingStages.map((stage) => stage.stageCode);
  const releaseState: SeriesReleaseState =
    businessStatus === 'PUBLIC'
      ? hasPendingUpdates
        ? 'NEEDS_UPDATE'
        : 'PUBLISHED'
      : 'UNPUBLISHED';

  if (!coverImageUrl) {
    blockers.push({
      code: 'COVER_IMAGE_REQUIRED',
      scope: 'PRESENTATION',
      message: '请上传产品线封面图后再发布',
      field: 'coverImageUrl',
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

  // 需求分类门禁（2026-10-27）：只卡产品线。
  // 定制系列不进橱窗、也不参与货架分组，因此不计算这条。
  const isProductLine =
    normalizeText(input.designMode).toUpperCase() !== 'ORDER' &&
    businessStatus !== 'PRIVATE_CUSTOM';
  if (
    isProductLine &&
    typeof input.taxonomyLinkCount === 'number' &&
    input.taxonomyLinkCount <= 0
  ) {
    blockers.push({
      code: 'TAXONOMY_REQUIRED',
      scope: 'SERIES',
      field: 'taxonomy',
      message:
        '这道菜还没有任何需求分类，发布后它进不了货架分组。在「快速归类」里挂一个即可',
    });
  }

  if (coverBadges.length === 0) {
    warnings.push({
      code: 'COVER_BADGE_MISSING',
      scope: 'PRESENTATION',
      message: '未设置封面角标，封面左下角将没有文字（不影响发布）',
      field: 'coverBadges',
    });
  }

  const totalStageCount = stages.length;
  const publishableStageCount = stages.filter(
    (stage) => stage.status === 'READY',
  ).length;
  const publishedStages = stages.filter((stage) => stage.status === 'PUBLIC');
  const upToDateStageCount = publishedStages.filter(
    (stage) => !stage.hasPendingUpdate,
  ).length;
  const designedStageCount = stages.filter(
    (stage) => stage.status !== 'EMPTY',
  ).length;
  const actionableStageCount = stages.filter(
    (stage) => stage.actionable,
  ).length;

  const ready = blockers.length === 0;

  return {
    seriesId: input.seriesId,
    designMode: input.designMode,
    businessStatus,
    releaseState,
    ready,
    canRelease: ready && actionableStageCount > 0,
    stages,
    presentation: {
      coverImageUrl,
      coverTitle,
      sellingPoint,
      targetHealthTags,
      coverBadges,
    },
    blockers,
    warnings,
    hasPendingUpdates,
    pendingStageCodes,
    summary: {
      totalStageCount,
      publishableStageCount,
      pendingStageCount: pendingStages.length,
      publishedStageCount: publishedStages.length,
      upToDateStageCount,
      designedStageCount,
      actionableStageCount,
    },
  };
};
