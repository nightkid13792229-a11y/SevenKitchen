import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CHECK_RULES_VERSION,
  IngredientCheckRunService,
  type CheckDomain,
  type CheckRunView,
} from './ingredient-check-run.service';
import {
  IngredientCreationCommitService,
  type CommitIngredientCreationResult,
} from './ingredient-creation-commit.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import { LINE_NOT_OPEN_MESSAGE } from './ingredient-line';
import type {
  IngredientCreationDraft,
  IngredientDraft,
  ProfileDraft,
} from './ingredient-creation.types';

/** 授权失败的机器可读原因；前端按 code + domain 列表显示。 */
export type AuthorizeBlockedReasonCode =
  | 'CHECK_MISSING'
  | 'CHECK_STALE'
  | 'CHECK_VERSION'
  | 'CHECK_BLOCKING'
  | 'CHECK_EXCEPTIONABLE'
  | 'SOURCE_PENDING';

export interface AuthorizeBlockedReason {
  code: AuthorizeBlockedReasonCode;
  domain?: CheckDomain;
  detail: string;
}

/**
 * 授权入参：请求体只带主档案下标。
 *
 * 原料卡与营养档案一律从**库里当前草稿**取（`payload.ingredient` /
 * `payload.profiles`），请求体里的同名字段不参与授权，也不参与写入：
 * 否则拿一份「通过」的报告配另一份没被核验过的数据，就能把没验过的内容
 * 写进正式表。
 */
export interface AuthorizeInput {
  draftId: string;
  userId: string;
  primaryProfileIndex: number;
}

/** 授权成功 = 提交结果 + 授权时间（审计与页面显示用）。 */
export type AuthorizeResult = CommitIngredientCreationResult & {
  authorizedAt: string;
};

const AUTHORIZE_BLOCKED_MESSAGE = '授权前还有未满足的条件';

/** 两域固定按这个顺序判定：缺报告时前端拿到的原因顺序也是稳定的。 */
const CHECK_DOMAINS: readonly CheckDomain[] = ['INGREDIENT', 'NUTRITION'];

const DOMAIN_LABELS: Record<CheckDomain, string> = {
  INGREDIENT: '原料',
  NUTRITION: '营养',
};

/**
 * 第四条件（来源）的占位原因：本阶段没有来源表，`SOURCE_PENDING` 恒不触发。
 *
 * 常量与分支先留着，P3 接来源记录核验时在 `collectSourceReasons` 里补判定，
 * 对外形状不用再改（前端已经按 code 列表渲染）。
 */
export const SOURCE_PENDING_REASON: AuthorizeBlockedReason = {
  code: 'SOURCE_PENDING',
  detail: '来源信息还没核验',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 营养档案只有生 / 熟两种状态；状态缺失或非法都不算「可用档案」。 */
const NUTRITION_PROFILE_STATES: readonly string[] = ['RAW', 'COOKED'];

/**
 * 一份档案是否可用于提交：生/熟状态合法，且带着来源记录 id。
 *
 * 与按域核验的「可用档案」同一口径：没有来源就没有任何营养数据可写。
 */
function isUsableProfile(value: unknown): value is ProfileDraft {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.preparationState === 'string' &&
    NUTRITION_PROFILE_STATES.includes(value.preparationState) &&
    typeof value.sourceRecordId === 'string' &&
    value.sourceRecordId.length > 0
  );
}

/** 草稿里的原料卡；还没走到这一步或缺数据时返回 null。 */
function readDraftIngredient(
  draft: IngredientCreationDraft,
): IngredientDraft | null {
  const ingredient: unknown = draft.payload.ingredient;
  return isRecord(ingredient)
    ? (ingredient as unknown as IngredientDraft)
    : null;
}

/** 草稿里的营养档案；脏数据（不是数组）按没有档案处理。 */
function readDraftProfiles(draft: IngredientCreationDraft): ProfileDraft[] {
  const profiles: unknown = draft.payload.profiles;
  return Array.isArray(profiles) ? (profiles as ProfileDraft[]) : [];
}

/** 人登记过的例外 code 集合；脏数据（非对象 / 缺 code）直接忽略。 */
function approvedExceptionCodes(draft: IngredientCreationDraft): Set<string> {
  const exceptions: unknown = draft.payload.verify?.exceptions;
  const codes = new Set<string>();
  if (!Array.isArray(exceptions)) {
    return codes;
  }

  for (const record of exceptions) {
    if (isRecord(record) && typeof record.code === 'string') {
      codes.add(record.code);
    }
  }

  return codes;
}

/**
 * 第四条件开关：本阶段没有来源表可查，恒为 false。
 *
 * P3 接来源记录核验时把这里打开，并在下面补真实的来源判定；对外形状不变。
 */
const SOURCE_CHECK_ENABLED = false;

/**
 * 第四条件：来源记录核验（P3 接来源表）。
 *
 * 本阶段分支恒不触发（`SOURCE_PENDING_REASON` 不会被返回），接口与前端
 * 已经按 code 列表渲染，P3 不需要再改契约。
 */
function collectSourceReasons(): AuthorizeBlockedReason[] {
  if (!SOURCE_CHECK_ENABLED) {
    return [];
  }

  return [SOURCE_PENDING_REASON];
}

/**
 * 授权闸门：四条件全过才允许写正式表。
 *
 * 判定对着**库里当前草稿**与两域**最新一份核验报告**：
 * 1. 两域都有报告，报告内容哈希等于当前草稿（改过一格就作废）；
 * 2. 报告的 `rulesVersion` 等于当前规则版本（规则升级后旧报告不算数）；
 * 3. 两域都没有拦死项；
 * 4. 两域所有 `exceptionable` 都被 `payload.verify.exceptions` 按 code 覆盖；
 * 5. 来源核验（本阶段占位，恒不触发）。
 *
 * 唯一被写入的数据就是**被核验的那份草稿**：原料卡与档案直接取
 * `payload.ingredient` / `payload.profiles`，请求体只提供主档案下标。
 *
 * 失败时一次返回**全部**未满足条件（不是第一条），前端才能一次列清楚；
 * 只有全过才调用提交服务，`authorizedAt` 是真正写库的时间。
 */
@Injectable()
export class IngredientCreationAuthorizeService {
  constructor(
    private readonly draftService: IngredientCreationDraftService,
    private readonly checkRunService: IngredientCheckRunService,
    private readonly commitService: IngredientCreationCommitService,
  ) {}

  async authorize(input: AuthorizeInput): Promise<AuthorizeResult> {
    const draft = await this.draftService.get(input.draftId);
    // 本期只放行食材线：补剂草稿连核验报告都不该看，更不该提交。
    if (draft.type !== 'FOOD') {
      throw new BadRequestException(LINE_NOT_OPEN_MESSAGE);
    }
    // 先确认草稿里有可写的东西：缺原料卡 / 缺可用档案时不用再查核验报告。
    const material = this.readDraftMaterial(draft);
    const runs = await this.checkRunService.latestRuns(input.draftId);
    const reasons = this.collectReasons(draft, runs);

    if (reasons.length > 0) {
      throw new BadRequestException({
        message: AUTHORIZE_BLOCKED_MESSAGE,
        reasons,
      });
    }

    this.assertPrimaryProfile(material.profiles, input.primaryProfileIndex);

    const result = await this.commitService.commit({
      draftId: input.draftId,
      userId: input.userId,
      ingredient: material.ingredient,
      profiles: material.profiles,
      primaryProfileIndex: input.primaryProfileIndex,
    });

    return { ...result, authorizedAt: new Date().toISOString() };
  }

  /**
   * 从草稿取这次要写的材料；缺原料卡 / 缺可用档案时直接 400。
   *
   * 两条缺失原因一起收集（而不是只报第一条），detail 分开写清是缺原料卡
   * 还是缺营养档案。这份材料同时是提交入参，请求体不可能替换它。
   */
  private readDraftMaterial(draft: IngredientCreationDraft): {
    ingredient: IngredientDraft;
    profiles: ProfileDraft[];
  } {
    const ingredient = readDraftIngredient(draft);
    const profiles = readDraftProfiles(draft);
    const reasons: AuthorizeBlockedReason[] = [];

    if (!ingredient) {
      reasons.push({
        code: 'CHECK_MISSING',
        detail: '草稿里还没有原料卡，先把原料页填好再授权',
      });
    }
    if (!profiles.some((profile) => isUsableProfile(profile))) {
      reasons.push({
        code: 'CHECK_MISSING',
        detail:
          '草稿里还没有可用的营养档案（生/熟且带来源记录），先建档案再授权',
      });
    }

    if (!ingredient || reasons.length > 0) {
      throw new BadRequestException({
        message: AUTHORIZE_BLOCKED_MESSAGE,
        reasons,
      });
    }

    return { ingredient, profiles };
  }

  /**
   * 主档案下标必须指向草稿里一份可用档案（生/熟 + 来源记录）。
   *
   * 下标按草稿 `profiles` 原数组计，与前端看到的下标一致；不做过滤后重排，
   * 否则下标错位会把错误的那份档案标成主档案。
   */
  private assertPrimaryProfile(
    profiles: readonly ProfileDraft[],
    primaryProfileIndex: number,
  ): void {
    const profile: ProfileDraft | undefined = profiles[primaryProfileIndex];
    if (
      !Number.isInteger(primaryProfileIndex) ||
      primaryProfileIndex < 0 ||
      !isUsableProfile(profile)
    ) {
      throw new BadRequestException(
        `主档案下标 ${primaryProfileIndex} 不指向草稿里可用的营养档案（生/熟且带来源记录）`,
      );
    }
  }

  /**
   * 收集两域所有阻断原因。
   *
   * 同一个域的多条原因是并列的：报告过期但里面也有拦死项时两条都报，
   * 页面上人能看到「要重跑」也能看到「重跑前先处理什么问题」。
   */
  private collectReasons(
    draft: IngredientCreationDraft,
    runs: Record<CheckDomain, CheckRunView | null>,
  ): AuthorizeBlockedReason[] {
    const reasons: AuthorizeBlockedReason[] = [];

    for (const domain of CHECK_DOMAINS) {
      const run = runs[domain];
      const label = DOMAIN_LABELS[domain];

      if (!run) {
        reasons.push({
          code: 'CHECK_MISSING',
          domain,
          detail: `${label}域还没有核验报告，先跑一次核验`,
        });
        continue;
      }

      if (!this.checkRunService.isFresh(run, draft)) {
        reasons.push({
          code: 'CHECK_STALE',
          domain,
          detail: `${label}域的报告是旧内容的，草稿改过之后要重跑`,
        });
      }

      if (run.rulesVersion !== CHECK_RULES_VERSION[domain]) {
        reasons.push({
          code: 'CHECK_VERSION',
          domain,
          detail: `${label}域报告的规则版本 ${run.rulesVersion} 不是当前版本 ${CHECK_RULES_VERSION[domain]}，要重跑`,
        });
      }

      if (run.result.blocking.length > 0) {
        reasons.push({
          code: 'CHECK_BLOCKING',
          domain,
          detail: `${label}域还有 ${run.result.blocking.length} 个拦死项：${run.result.blocking
            .map((item) => item.code)
            .join('、')}`,
        });
      }

      const uncovered = this.uncoveredExceptionableCodes(run, draft);
      if (uncovered.length > 0) {
        reasons.push({
          code: 'CHECK_EXCEPTIONABLE',
          domain,
          detail: `${label}域有可例外项没有登记理由：${uncovered.join('、')}`,
        });
      }
    }

    reasons.push(...collectSourceReasons());
    return reasons;
  }

  /** 可例外项里，`payload.verify.exceptions` 没按 code 覆盖到的那些。 */
  private uncoveredExceptionableCodes(
    run: CheckRunView,
    draft: IngredientCreationDraft,
  ): string[] {
    const approved = approvedExceptionCodes(draft);
    return run.result.exceptionable
      .map((item) => item.code)
      .filter((code) => !approved.has(code));
  }
}
