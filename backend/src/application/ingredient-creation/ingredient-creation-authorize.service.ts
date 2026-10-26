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
 * 授权入参：与提交入参完全同字段。
 *
 * 闸门判定对着**库里当前草稿**，与这份入参无关；入参原样转交给提交服务，
 * 由提交服务做字段级校验与写入。
 */
export interface AuthorizeInput {
  draftId: string;
  userId: string;
  ingredient: IngredientDraft;
  profiles: ProfileDraft[];
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
    const runs = await this.checkRunService.latestRuns(input.draftId);
    const reasons = this.collectReasons(draft, runs);

    if (reasons.length > 0) {
      throw new BadRequestException({
        message: AUTHORIZE_BLOCKED_MESSAGE,
        reasons,
      });
    }

    const result = await this.commitService.commit({
      draftId: input.draftId,
      userId: input.userId,
      ingredient: input.ingredient,
      profiles: input.profiles,
      primaryProfileIndex: input.primaryProfileIndex,
    });

    return { ...result, authorizedAt: new Date().toISOString() };
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
