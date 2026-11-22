/**
 * 补剂 AI 起草编排（Task 8）。
 *
 * 一次 AI 起草分三步（spec §6.4）：
 * 1. **读图/读链接**：复用 `SupplementLabelIntakeService` 与
 *    `SupplementLinkPreviewService`，拿到标签原文、每份量、营养素、正面字段、
 *    商品页价格/品牌/规格/主图；
 * 2. **补全字段**：解析器/链接能确定的事实先叠进草稿（确定性事实优先级高于
 *    模型首轮分析），再交给审核服务查目录、配置、等价组候选；
 * 3. **做决定**：拼一次决策提示词，让模型输出上架/归组/DIY/采购/标签名等决定，
 *    解析后合并进草稿。
 *
 * 三条硬规则：
 * - **只写草稿**：只调 `draftService.update`，绝不创建 `ingredient` /
 *   `nutrition_food` / 证据 / 标签关系；
 * - **不覆盖人改**：`manualFields` 里的路径，事实和 AI 都不写；
 * - **失败不丢草稿**：读链接失败跳过链接；决策调用失败/回包解析失败仍保存
 *   确定性事实，`aiSnapshot.status = 'PARTIAL'`，草稿状态与名称照旧。
 *
 * 并发：同一 `draftId` 同时只允许一次 AI 起草（进程内 `Set` 锁），第二次
 * 返回 409「AI 正在起草这张草稿」；`finally` 释放锁，失败也能重试。
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { listSupplementTargetFields } from '../../domain/ingredient/nutrition-field-catalog';
import {
  SUPPLEMENT_AI_DIY_PLATFORMS,
  parseSupplementAiDraft,
  type SupplementAiDecisions,
  type SupplementAiDraft,
  type SupplementAiMissingItem,
  type SupplementAiParseContext,
  type SupplementAiSnapshot,
  type SupplementAiWarning,
} from './supplement-draft-ai.schema';
import {
  buildSupplementDraftPrompt,
  type SupplementDraftPromptGroupCandidate,
} from './supplement-draft-ai.prompt';
import { SupplementDraftReviewService } from './supplement-draft-review.service';
import {
  SupplementDraftService,
  type SupplementDraftView,
  type UpdateSupplementDraftInput,
} from './supplement-draft.service';
import {
  SupplementLabelIntakeService,
  type LabelIntakeResult,
} from './supplement-label-intake.service';
import { SupplementLabelVisionService } from './supplement-label-vision.service';
import {
  SupplementLinkPreviewService,
  type SupplementLinkPreview,
} from './supplement-link-preview.service';
import {
  normalizeSupplementDraftPayload,
  type SupplementBaseUnit,
  type SupplementDraftBasic,
  type SupplementDraftDiy,
  type SupplementDraftEquivalence,
  type SupplementDraftEvidence,
  type SupplementDraftLabel,
  type SupplementDraftNutrition,
  type SupplementDraftPayload,
  type SupplementDraftProcurement,
  type SupplementDraftRetail,
  type SupplementPhysicalForm,
} from './supplement-draft.types';
import type { SupplementDraftValidationContext } from './supplement-draft-validation';

/** 与 `supplement-draft-validation.ts` / 读图服务同一套词表（那边没有导出，这里照抄）。 */
const ALLOWED_TAGS: readonly string[] = [
  '矿物质',
  '维生素',
  '脂肪酸',
  '氨基酸',
  '基础营养',
];
/** 添加时机允许值，与 `supplement-draft-validation.ts` 保持一致。 */
const ALLOWED_ADD_TIMINGS: readonly string[] = ['BEFORE_MIXING', 'BEFORE_MEAL'];
/** 不上架原因四选一，与 `supplement-draft-validation.ts` 保持一致。 */
const ALLOWED_NO_SALE_REASONS: readonly string[] = [
  'SELF_MADE',
  'BULK',
  'NO_SUPPLY',
  'UNDECIDED',
];

/** 「暂不归组」的显式表态值（与草稿校验/前端一致）。 */
const GROUP_SKIPPED_ID = '__SKIP__';

/** 采购单位默认「瓶」；spec §12.1 要求非空。 */
const DEFAULT_PURCHASE_UNIT = '瓶';
/** 生产损耗率默认 1.05；spec §12.1。 */
const DEFAULT_PRODUCTION_LOSS_RATE = 1.05;
/** 添加时机默认值与旧流程一致（人可在审核屏改）。 */
const DEFAULT_ADD_TIMING = 'BEFORE_MIXING';

/** 物理形态 → 基准单位（spec §7.2）。 */
const BASE_UNIT_BY_FORM: Record<SupplementPhysicalForm, SupplementBaseUnit> = {
  POWDER: 'G',
  LIQUID: 'ML',
  TABLET: 'PCS',
  CAPSULE: 'PCS',
};

/** 基准单位 → 展示单位默认值；只在不填时兜底。 */
const UNIT_LABEL_BY_BASE_UNIT: Record<SupplementBaseUnit, string> = {
  PCS: '粒',
  G: 'g',
  ML: 'ml',
};

/** AI 起草入参：正面图、标签图必填，链接/选品依据可选。 */
export interface SupplementDraftAiFillInput {
  frontImageUrl: string;
  labelImageUrl: string;
  productUrl?: string;
  selectionNote?: string;
}

/**
 * AI 起草的操作人。
 *
 * 项目里的 `RequestUser`（`src/interfaces/auth/request-user.interface.ts`）
 * 是 `{ userId, customerId, role }`，所以正式调用直接传 `user`；
 * 为了兼容单测/内部调用，这里也接受 `{ id }` 和直接传 userId 字符串。
 * 注意：本服务只需要 id；`name` 只有最终写入审计才用，这里不消费。
 */
export interface SupplementDraftAiUser {
  userId?: string;
  id?: string;
  name?: string;
}

export type SupplementDraftAiActor = SupplementDraftAiUser | string;

/** 确定性事实（解析器/链接/首轮分析）；**不含**默认值，默认值在合并末尾补。 */
export interface SupplementDraftAiFacts {
  basic?: Partial<SupplementDraftBasic>;
  nutrition?: Partial<SupplementDraftNutrition>;
  label?: Partial<SupplementDraftLabel>;
  retail?: Partial<SupplementDraftRetail>;
  diy?: Partial<SupplementDraftDiy>;
  procurement?: Partial<SupplementDraftProcurement>;
  equivalence?: Partial<SupplementDraftEquivalence>;
  evidence?: Partial<SupplementDraftEvidence>;
}

interface SupplementDraftAiFactsBundle {
  facts: SupplementDraftAiFacts;
  /** 已有确定值的路径；决策模型不能再覆盖。 */
  paths: string[];
}

/** 纯合并函数的入参：临时草稿 + 事实路径 + AI 结果。 */
export interface SupplementDraftAiMergeInput {
  /** 已叠加确定性事实的草稿（AI 在这上面补） */
  provisional: SupplementDraftPayload;
  /** 解析器/链接/首轮分析确定的事实路径 */
  factPaths: readonly string[];
  /** 人改过的路径；事实和 AI 都不写 */
  manualFields: readonly string[];
  aiDraft: SupplementAiDraft | null;
  /** 本次等价组候选（按推荐顺序） */
  groupCandidates?: readonly { groupId: string }[];
  /** 名称兜底（建议名/商品标题），优先级低于 AI */
  nameFallback?: string | null;
}

export interface SupplementDraftAiMergeResult {
  payload: SupplementDraftPayload;
  /** AI 自己承认缺的项 + 等价组没候选时系统补的缺项 */
  missing: SupplementAiMissingItem[];
}

/**
 * 落 `aiSnapshot` 的完整记录。
 *
 * `decisions` 是**生效后**的值（人改/事实保留后），`proposedDecisions` 是
 * 解析器给出的**原始提议**（含 reasons，未被合并或推荐兜底修改），用于事后
 * 审计“AI 当初想怎么判、最后实际怎么落”。
 */
export type SupplementDraftAiSnapshot = SupplementAiSnapshot & {
  proposedDecisions: SupplementAiDecisions;
};

@Injectable()
export class SupplementDraftAiService {
  private readonly logger = new Logger(SupplementDraftAiService.name);

  /** 草稿级进程内锁：同一草稿同时只跑一次 AI。 */
  private readonly runningDrafts = new Set<string>();

  constructor(
    private readonly draftService: SupplementDraftService,
    private readonly review: SupplementDraftReviewService,
    private readonly intake: SupplementLabelIntakeService,
    private readonly vision: SupplementLabelVisionService,
    private readonly linkPreview: SupplementLinkPreviewService,
  ) {}

  /**
   * 对一张草稿跑一次 AI 起草。
   *
   * 顺序：校验两图 → 拿锁 → 读草稿 → 读图 →（可选）读链接 → 叠事实 →
   * 审核上下文/等价组候选 → 决策模型 → 合并 → 只更新草稿。
   */
  async fill(
    user: SupplementDraftAiActor,
    draftId: string,
    input: SupplementDraftAiFillInput,
  ): Promise<SupplementDraftView> {
    const frontImageUrl = trimText(input?.frontImageUrl);
    const labelImageUrl = trimText(input?.labelImageUrl);
    if (!frontImageUrl || !labelImageUrl) {
      throw new BadRequestException('正面图和标签图都要有');
    }

    const userId = resolveUserId(user);

    if (this.runningDrafts.has(draftId)) {
      throw new ConflictException('AI 正在起草这张草稿');
    }
    this.runningDrafts.add(draftId);

    try {
      return await this.fillLocked(userId, draftId, {
        ...input,
        frontImageUrl,
        labelImageUrl,
      });
    } finally {
      this.runningDrafts.delete(draftId);
    }
  }

  private async fillLocked(
    userId: string,
    draftId: string,
    input: SupplementDraftAiFillInput,
  ): Promise<SupplementDraftView> {
    const draft = await this.draftService.get(draftId, userId);
    assertDraftFillable(draft);
    const manualFields = normalizeManualFields(draft.manualFields);

    const intake = await this.intake.read({
      frontImageUrl: input.frontImageUrl,
      labelImageUrl: input.labelImageUrl,
    });

    const productUrl = trimText(input.productUrl);
    let link: SupplementLinkPreview | null = null;
    let linkWarning: SupplementAiWarning | null = null;
    if (productUrl) {
      try {
        link = await this.linkPreview.preview(productUrl);
      } catch (error) {
        // 链接只是“补信息”，读失败不能拦住整次起草。
        this.logger.warn(
          `[supplement-draft-ai] 商品链接读取失败，跳过链接信息：${describeError(error)}`,
        );
        linkWarning = {
          code: 'LINK_PREVIEW_FAILED',
          message:
            '商品链接没读出来，已跳过链接里的价格/品牌/规格/主图；可以重试或手动补',
        };
      }
    }

    const bundle = buildSupplementDraftAiFacts({
      intake,
      link,
      input: {
        frontImageUrl: input.frontImageUrl,
        labelImageUrl: input.labelImageUrl,
        productUrl,
        selectionNote: trimText(input.selectionNote),
      },
    });
    // 临时草稿 = 当前草稿 + 确定性事实（跳过 manualFields）；同时给提示词和审核服务。
    const provisional = applyFactsToPayload(
      draft.payload,
      bundle.facts,
      manualFields,
    );

    // 等价组推荐要能看见"这次标签里有什么营养素"，但它的数值**不落库**：
    // 首轮分析是模型的阅读结果，只当推荐线索用；真正写进档案的数值仍由
    // 起草模型按字段单位给（2026-11-23）。
    const recommendationPayload = withNutrientHints(
      provisional,
      intake.analysis?.nutrients ?? [],
    );

    const [context, recommendations] = await Promise.all([
      this.review.buildContext(provisional),
      // 全新草稿的 payload 还是空的，必须按「草稿现值 + 本次事实」推荐，
      // 不能按 id 再读持久化草稿，否则候选全是 MISSING。
      this.review.recommendGroupsForPayload(recommendationPayload),
    ]);

    const groupCandidates: SupplementDraftPromptGroupCandidate[] =
      recommendations.candidates.map((candidate) => ({
        groupId: candidate.groupId,
        name: candidate.name,
        nutrientLabel: candidate.nutrientLabel,
        nutrientUnit: candidate.nutrientUnit,
        memberCount: candidate.memberCount,
        reason: candidate.reason,
      }));

    const nutrientFields = listSupplementTargetFields().map((field) => ({
      fieldPath: field.fieldPath,
      label: field.label,
      unit: field.unit,
    }));
    const allowedFields = nutrientFields.map((field) => field.fieldPath);
    const parseContext: SupplementAiParseContext = {
      allowedFields,
      allowedTags: [...ALLOWED_TAGS],
      allowedTimings: [...ALLOWED_ADD_TIMINGS],
      allowedNoSaleReasons: [...ALLOWED_NO_SALE_REASONS],
      allowedPlatforms: [...SUPPLEMENT_AI_DIY_PLATFORMS],
      groupIds: groupCandidates.map((candidate) => candidate.groupId),
    };

    const prompt = buildSupplementDraftPrompt({
      labelText: provisional.nutrition.labelText,
      frontText: intake.frontText,
      linkPreview: link,
      catalogNames: collectCatalogNames(intake, context),
      groupCandidates,
      config: context.config,
      provisionalDraft: provisional,
      manualFields,
      nutrientFields,
      allowedTags: parseContext.allowedTags,
      allowedTimings: parseContext.allowedTimings,
      allowedNoSaleReasons: parseContext.allowedNoSaleReasons,
    });

    let aiDraft: SupplementAiDraft | null = null;
    let replyTruncated = false;
    try {
      const reply = await this.vision.analyze(prompt);
      replyTruncated = reply?.truncated === true;
      aiDraft = reply ? parseSupplementAiDraft(reply.text, parseContext) : null;
      if (reply && !aiDraft) {
        // 空结果最常见的原因是输出被 max_tokens 截断成半截 JSON；
        // 留一段原文，下次能直接看出是截断还是模型没按格式回。
        this.logger.warn(
          `[supplement-draft-ai] 模型返回的不是可解析 JSON` +
            `（${replyTruncated ? '输出被截断' : '格式不对'}，finish 之后 ${reply.text.length} 字）：` +
            reply.text.slice(0, 200),
        );
      }
    } catch (error) {
      // 决策模型不可用：确定性事实照样保存，草稿留给人补。
      this.logger.warn(
        `[supplement-draft-ai] 决策模型调用失败，按 PARTIAL 保存：${describeError(error)}`,
      );
      aiDraft = null;
    }

    // AI 跑的这段时间里人可能已经自动保存过：写回前必须重读最新草稿。
    // 用最新的 payload/manualFields 合并，并把 updatedAt 交给 update 的乐观锁；
    // 如果又被人改过，update 会 409，不能拿旧草稿把人改的内容盖掉。
    const latest = await this.draftService.get(draftId, userId);
    assertDraftFillable(latest);
    const latestManualFields = normalizeManualFields(latest.manualFields);
    const latestProvisional = applyFactsToPayload(
      latest.payload,
      bundle.facts,
      latestManualFields,
    );

    const merged = mergeDraftAiResult({
      provisional: latestProvisional,
      factPaths: bundle.paths,
      manualFields: latestManualFields,
      aiDraft,
      groupCandidates,
      nameFallback: intake.suggestedName ?? link?.productName ?? null,
    });

    // spec §7.3：AI 重跑后旧的提醒确认全部失效，必须让人重新确认。
    // merged.payload 已过 normalize，review 结构一定存在（缺了也会补默认）。
    const mergedPayload: SupplementDraftPayload = {
      ...merged.payload,
      review: { acknowledgedWarnings: [] },
    };

    const warnings: SupplementAiWarning[] = [...(aiDraft?.warnings ?? [])];
    if (linkWarning) {
      warnings.push(linkWarning);
    }
    if (!aiDraft) {
      warnings.push({
        code: 'AI_DRAFT_UNAVAILABLE',
        message: replyTruncated
          ? 'AI 这次写的内容太长被截断，没读全；重试一次，还不行就对照标签手填营养栏'
          : 'AI 没有返回可用的起草结果，已先保存能确定的字段；可以重试，不影响已有草稿',
      });
    }

    const aiSnapshot: SupplementDraftAiSnapshot = {
      status: aiDraft ? 'OK' : 'PARTIAL',
      fields: aiDraft?.fields ?? {},
      // 快照里的决定项写「实际生效后的值」：不要出现 snapshot 说关、
      // payload 却是开（人改过/AI 没真正表态都会被保留）。
      decisions: buildEffectiveDecisions(aiDraft, mergedPayload),
      // 额外保留 AI 原始提议（含 reason），供审计对照生效值；不能和 decisions 混用。
      proposedDecisions: aiDraft
        ? structuredClone(aiDraft.decisions)
        : createEmptyAiDecisions(),
      // AI 自己报的缺项 + 系统补的缺项（如没有等价组候选）都要留在快照里。
      missing: [...(aiDraft?.missing ?? []), ...merged.missing],
      warnings,
    };

    // update 会整份替换 payload：这里传的是「最新草稿 + 事实 + AI」的完整合并结果。
    // 不回传 manualFields（服务端已有列表），也不写 status/finalized*；带乐观锁。
    const update: UpdateSupplementDraftInput = {
      name: mergedPayload.basic.name.trim() || latest.name,
      payload: mergedPayload,
      aiSnapshot,
      expectedUpdatedAt: latest.updatedAt.toISOString(),
    };

    return this.draftService.update(draftId, userId, update);
  }
}

/**
 * 纯合并：在「已叠加事实」的临时草稿上补 AI 字段/决定。
 *
 * 优先级（从高到低）：
 * `manualFields` > 事实路径（解析器/链接/首轮分析）> AI 字段/决定 > 默认值。
 *
 * 导出是为了让合并规则可以脱离网络单独测；`fill` 内部也只走这一个入口。
 */
export function mergeDraftAiResult(
  input: SupplementDraftAiMergeInput,
): SupplementDraftAiMergeResult {
  const payload = normalizeSupplementDraftPayload(input.provisional);
  const manualFields = normalizeManualFields(input.manualFields);
  const factPaths = new Set(
    input.factPaths.map((path) => path.trim()).filter(Boolean),
  );
  const missing: SupplementAiMissingItem[] = [];

  const canWrite = (path: string): boolean =>
    !isManualPath(manualFields, path) && !isFactPath(factPaths, path);

  if (input.aiDraft) {
    const aiDraft = input.aiDraft;

    for (const [path, fieldValue] of Object.entries(aiDraft.fields)) {
      if (!canWrite(path)) {
        continue;
      }
      applyAiFieldValue(payload, path, fieldValue.value);
    }

    const decisions = aiDraft.decisions;
    const fieldValue = (path: string): unknown => aiDraft.fields[path]?.value;
    const fieldBoolean = (path: string): boolean | undefined => {
      const value = fieldValue(path);
      return typeof value === 'boolean' ? value : undefined;
    };

    // 「AI 没真正表态」时解析器会给安全默认值（false / null）。这些默认值
    // 不能把人已经改过的值冲掉：只有 reason 非空、明确 true，或对应字段有值
    // 才应用；否则保留 current。
    const retailEnabled =
      decisions.retail.reason.trim() || decisions.retail.enabled
        ? decisions.retail.enabled
        : fieldBoolean('retail.enabled');
    if (retailEnabled !== undefined && canWrite('retail.enabled')) {
      payload.retail.enabled = retailEnabled;
    }
    if (canWrite('retail.noSaleReason') && decisions.noSaleReason !== null) {
      payload.retail.noSaleReason = decisions.noSaleReason;
    }

    const diyEnabled =
      decisions.diy.reason.trim() || decisions.diy.enabled
        ? decisions.diy.enabled
        : fieldBoolean('diy.enabled');
    if (diyEnabled !== undefined && canWrite('diy.enabled')) {
      payload.diy.enabled = diyEnabled;
    }
    if (canWrite('diy.linkUrl')) {
      const linkUrl = trimText(decisions.diy.linkUrl);
      if (linkUrl) {
        payload.diy.linkUrl = linkUrl;
      }
    }
    // 链接主图是确定性事实（已在 factPaths 里）；AI 的 diy.imageUrl 不会覆盖它。
    if (canWrite('diy.imageUrl')) {
      const imageUrl = trimText(decisions.diy.imageUrl);
      if (imageUrl) {
        payload.diy.imageUrl = imageUrl;
      }
    }

    const procurementReason = decisions.procurement.reason.trim();
    const procurementEnabled = procurementReason
      ? decisions.procurement.enabled
      : decisions.procurement.enabled
        ? true
        : fieldBoolean('procurement.enabled');
    if (procurementEnabled !== undefined && canWrite('procurement.enabled')) {
      payload.procurement.enabled = procurementEnabled;
    }

    if (canWrite('label.labelNames') && decisions.labelNames.length > 0) {
      payload.label.labelNames = uniqueStrings(decisions.labelNames);
    }
    if (canWrite('basic.addTiming') && decisions.addTiming) {
      payload.basic.addTiming = decisions.addTiming;
    }
    if (
      canWrite('nutrition.defaultTargetFields') &&
      decisions.defaultTargetFields.length > 0
    ) {
      const targets = decisions.defaultTargetFields.filter((fieldPath) =>
        Number.isFinite(payload.nutrition.servingNutrients[fieldPath]),
      );
      if (targets.length > 0) {
        payload.nutrition.defaultTargetFields = uniqueStrings(targets);
      }
    }
  }

  // 等价组：AI 给了有效组或 __SKIP__ 才采纳；没表态时用推荐第一名填草稿，
  // 连候选都没有就保留当前选择（若有）；最终仍空着则记 missing 让人明确表态。
  if (canWrite('equivalence.groupId')) {
    const candidates = input.groupCandidates ?? [];
    const candidateIds = new Set(
      candidates.map((candidate) => candidate.groupId),
    );
    const decisionGroup = input.aiDraft?.decisions.equivalence.groupId ?? null;
    if (
      decisionGroup &&
      (decisionGroup === GROUP_SKIPPED_ID || candidateIds.has(decisionGroup))
    ) {
      payload.equivalence.groupId = decisionGroup;
    } else if (candidates.length > 0) {
      payload.equivalence.groupId = candidates[0].groupId;
    } else if (payload.equivalence.groupId) {
      // 没有候选时保留当前选择，不把已选组清掉。
    } else {
      payload.equivalence.groupId = null;
      missing.push({
        fieldPath: 'equivalence.groupId',
        reason: '没有可用的等价组候选；请人工选择等价组，或标记「暂不归组」',
      });
    }
  }

  // 默认值只在缺的时候补，且不能覆盖人改/事实。
  if (canWrite('basic.purchaseUnit') && !payload.basic.purchaseUnit.trim()) {
    payload.basic.purchaseUnit = DEFAULT_PURCHASE_UNIT;
  }
  if (
    canWrite('basic.productionLossRate') &&
    (!Number.isFinite(payload.basic.productionLossRate) ||
      payload.basic.productionLossRate <= 0)
  ) {
    payload.basic.productionLossRate = DEFAULT_PRODUCTION_LOSS_RATE;
  }
  if (canWrite('basic.addTiming') && !payload.basic.addTiming.trim()) {
    payload.basic.addTiming = DEFAULT_ADD_TIMING;
  }
  if (
    canWrite('basic.unitDisplayLabel') &&
    !payload.basic.unitDisplayLabel.trim()
  ) {
    payload.basic.unitDisplayLabel =
      UNIT_LABEL_BY_BASE_UNIT[payload.basic.baseUnit];
  }
  if (canWrite('basic.name') && !payload.basic.name.trim()) {
    const nameFallback = trimText(input.nameFallback);
    if (nameFallback) {
      payload.basic.name = nameFallback;
    }
  }
  if (
    canWrite('nutrition.defaultTargetFields') &&
    payload.nutrition.defaultTargetFields.length === 0
  ) {
    payload.nutrition.defaultTargetFields = Object.keys(
      payload.nutrition.servingNutrients,
    ).filter((fieldPath) => {
      const value = payload.nutrition.servingNutrients[fieldPath];
      return Number.isFinite(value) && value > 0;
    });
  }

  return { payload: normalizeSupplementDraftPayload(payload), missing };
}

/* ------------------------------------------------------------------ */
/* 事实构建：解析器/链接/首轮分析                                       */
/* ------------------------------------------------------------------ */

interface BuildFactsInput {
  intake: LabelIntakeResult;
  link: SupplementLinkPreview | null;
  input: {
    frontImageUrl: string;
    labelImageUrl: string;
    productUrl: string;
    selectionNote: string;
  };
}

function buildSupplementDraftAiFacts(
  params: BuildFactsInput,
): SupplementDraftAiFactsBundle {
  const { intake, link, input } = params;
  const basic: Record<string, unknown> = {};
  const nutrition: Record<string, unknown> = {};
  const label: Record<string, unknown> = {};
  const diy: Record<string, unknown> = {};
  const evidence: Record<string, unknown> = {};
  const paths: string[] = [];

  const put = (
    bucket: Record<string, unknown>,
    section: string,
    key: string,
    value: unknown,
  ): void => {
    if (!hasMeaningfulValue(value)) {
      return;
    }
    bucket[key] = value;
    paths.push(`${section}.${key}`);
  };
  const has = (bucket: Record<string, unknown>, key: string): boolean =>
    key in bucket;

  const analysis = intake.analysis;
  const front = intake.front;

  // 1) 链接/读图的确定性事实（优先级最高）：
  //    每份量、商品页价格/品牌/规格、标签原文。
  //    营养素**不在这里出**：数值与单位换算统一由起草模型按字段单位给出，
  //    避免“解析器读到的 mg 被当成 IU 写死、模型又不许覆盖”（2026-11-23）。
  const linkBrand = trimText(link?.brand);
  const linkModel = trimText(link?.productModel);
  put(basic, 'basic', 'brand', linkBrand);
  put(basic, 'basic', 'productModel', linkModel);
  put(
    basic,
    'basic',
    'servingUnitsPerDose',
    positiveNumber(intake.servingUnitsPerDose) ??
      positiveNumber(link?.servingUnitsPerDose),
  );
  put(
    basic,
    'basic',
    'currentPricePerPurchaseUnit',
    positiveNumber(link?.pagePriceCny),
  );
  // 商品页主图是确定性事实：DIY 展示图由它兜底，AI 不能改成别的图。
  put(diy, 'diy', 'imageUrl', trimText(link?.imageUrl));

  // 营养素：只由起草模型出（见【允许的营养字段】里的字段单位）。
  // 代码不再从标签文本里抠数字，避免单位口径在这里被写死。

  put(nutrition, 'nutrition', 'labelText', trimText(intake.labelText));
  if (!has(nutrition, 'labelText')) {
    put(nutrition, 'nutrition', 'labelText', trimText(link?.labelText));
  }

  // 2) 首轮分析：确定性事实没有的字段才补（分析 < 解析器/链接）。
  if (analysis) {
    put(basic, 'basic', 'name', trimText(analysis.name));
    if (!has(basic, 'brand')) {
      put(basic, 'basic', 'brand', trimText(analysis.brand));
    }
    if (!has(basic, 'productModel')) {
      put(basic, 'basic', 'productModel', trimText(analysis.productModel));
    }
    put(basic, 'basic', 'purchaseChannel', trimText(analysis.purchaseChannel));
    if (analysis.physicalForm) {
      put(basic, 'basic', 'physicalForm', analysis.physicalForm);
      put(basic, 'basic', 'baseUnit', BASE_UNIT_BY_FORM[analysis.physicalForm]);
    }
    if (!has(basic, 'baseUnit')) {
      put(basic, 'basic', 'baseUnit', analysis.baseUnit);
    }
    put(
      basic,
      'basic',
      'unitDisplayLabel',
      trimText(analysis.unitDisplayLabel),
    );
    if (!has(basic, 'servingUnitsPerDose')) {
      put(
        basic,
        'basic',
        'servingUnitsPerDose',
        positiveNumber(analysis.servingUnitsPerDose),
      );
    }
    if (!has(basic, 'currentPricePerPurchaseUnit')) {
      put(
        basic,
        'basic',
        'currentPricePerPurchaseUnit',
        positiveNumber(analysis.priceCny) ??
          positiveNumber(intake.detectedPriceCny),
      );
    }
    put(
      basic,
      'basic',
      'purchaseToBaseRatio',
      positiveNumber(analysis.perBottleUnits) ??
        positiveNumber(intake.perBottleUnits),
    );
    put(basic, 'basic', 'addTiming', trimText(analysis.addTiming));

    put(label, 'label', 'labelCategory', analysis.labelCategory);
    if (analysis.labelNames.length > 0) {
      put(label, 'label', 'labelNames', uniqueStrings(analysis.labelNames));
    }
    // 默认目标营养素不在这里定：营养数值由起草模型给，
    // 目标项由模型的 decisions（或合并时的兜底）从已填营养素里选，
    // 否则会出现“目标项指向一个还没填的字段”。
  }

  // 3) 正面图兜底（原文规则；分析/链接都没有时才用，仍然算事实，AI 不覆盖）。
  if (!has(basic, 'brand')) {
    put(basic, 'basic', 'brand', trimText(front.brandCandidate));
  }
  if (!has(basic, 'productModel')) {
    put(basic, 'basic', 'productModel', trimText(front.productModel));
  }
  if (!has(basic, 'physicalForm') && front.physicalForm) {
    put(basic, 'basic', 'physicalForm', front.physicalForm);
    put(basic, 'basic', 'baseUnit', BASE_UNIT_BY_FORM[front.physicalForm]);
  }
  if (!has(basic, 'unitDisplayLabel')) {
    put(basic, 'basic', 'unitDisplayLabel', trimText(front.unitDisplayLabel));
  }
  if (!has(basic, 'purchaseToBaseRatio')) {
    put(
      basic,
      'basic',
      'purchaseToBaseRatio',
      positiveNumber(intake.perBottleUnits),
    );
  }

  // 4) 证据：两张图这次传什么就记什么；链接/选品依据有才写。
  evidence.frontImageUrl = input.frontImageUrl;
  evidence.labelImageUrl = input.labelImageUrl;
  paths.push('evidence.frontImageUrl', 'evidence.labelImageUrl');
  put(evidence, 'evidence', 'productUrl', trimText(input.productUrl));
  put(evidence, 'evidence', 'selectionNote', trimText(input.selectionNote));

  const facts: SupplementDraftAiFacts = {};
  if (Object.keys(basic).length > 0) {
    facts.basic = basic as Partial<SupplementDraftBasic>;
  }
  if (Object.keys(nutrition).length > 0) {
    facts.nutrition = nutrition as Partial<SupplementDraftNutrition>;
  }
  if (Object.keys(label).length > 0) {
    facts.label = label as Partial<SupplementDraftLabel>;
  }
  if (Object.keys(diy).length > 0) {
    facts.diy = diy as Partial<SupplementDraftDiy>;
  }
  if (Object.keys(evidence).length > 0) {
    facts.evidence = evidence as Partial<SupplementDraftEvidence>;
  }

  return { facts, paths: [...new Set(paths)] };
}

/**
 * 给等价组推荐用的临时载荷补上"这次读到的营养素"。
 *
 * 只补草稿里还没有的字段，不改已有值；返回值只用于推荐，不写库。
 */
function withNutrientHints(
  payload: SupplementDraftPayload,
  nutrients: readonly { fieldPath: string; value: number }[],
): SupplementDraftPayload {
  if (nutrients.length === 0) {
    return payload;
  }
  const servingNutrients = { ...payload.nutrition.servingNutrients };
  for (const nutrient of nutrients) {
    if (
      nutrient.fieldPath &&
      Number.isFinite(nutrient.value) &&
      nutrient.value > 0 &&
      !(nutrient.fieldPath in servingNutrients)
    ) {
      servingNutrients[nutrient.fieldPath] = nutrient.value;
    }
  }
  return {
    ...payload,
    nutrition: { ...payload.nutrition, servingNutrients },
  };
}

/** 当前草稿 + 确定性事实（跳过 manualFields）；事实里的营养素整组替换。 */
function applyFactsToPayload(
  current: SupplementDraftPayload,
  facts: SupplementDraftAiFacts,
  manualFields: readonly string[],
): SupplementDraftPayload {
  const payload = normalizeSupplementDraftPayload(current);
  const sections: Array<keyof SupplementDraftAiFacts> = [
    'basic',
    'nutrition',
    'label',
    'retail',
    'diy',
    'procurement',
    'equivalence',
    'evidence',
  ];

  for (const section of sections) {
    const sectionFacts = facts[section] as Record<string, unknown> | undefined;
    if (!sectionFacts) {
      continue;
    }

    for (const [key, value] of Object.entries(sectionFacts)) {
      if (value === undefined) {
        continue;
      }

      if (section === 'nutrition' && key === 'servingNutrients') {
        const incoming = value as Record<string, number>;
        const merged: Record<string, number> = {};
        // 人改过的单个营养素保留；其余按这次读到的整组替换，避免残留旧值。
        for (const [fieldPath, nutrientValue] of Object.entries(
          payload.nutrition.servingNutrients,
        )) {
          if (
            isManualPath(
              manualFields,
              `nutrition.servingNutrients.${fieldPath}`,
            )
          ) {
            merged[fieldPath] = nutrientValue;
          }
        }
        for (const [fieldPath, nutrientValue] of Object.entries(incoming)) {
          if (
            !isManualPath(
              manualFields,
              `nutrition.servingNutrients.${fieldPath}`,
            )
          ) {
            merged[fieldPath] = nutrientValue;
          }
        }
        payload.nutrition.servingNutrients = merged;
        continue;
      }

      const path = `${section}.${key}`;
      if (isManualPath(manualFields, path)) {
        continue;
      }
      const target = payload[section] as unknown as Record<string, unknown>;
      target[key] = value;
    }
  }

  return normalizeSupplementDraftPayload(payload);
}

/* ------------------------------------------------------------------ */
/* AI 字段/决定的小工具                                                */
/* ------------------------------------------------------------------ */

/** 把一条通过 parser 白名单的 AI 字段写入草稿；未知路径直接忽略。 */
function applyAiFieldValue(
  payload: SupplementDraftPayload,
  path: string,
  value: unknown,
): void {
  // 等价组由 decision 统一处理（需要候选校验和推荐兜底），字段不直接写。
  // reapproveGroup 只有人能取消，AI 字段一律忽略。
  if (path === 'equivalence.groupId' || path === 'equivalence.reapproveGroup') {
    return;
  }

  if (path.startsWith('nutrition.servingNutrients.')) {
    const fieldPath = path.slice('nutrition.servingNutrients.'.length);
    if (fieldPath && typeof value === 'number' && Number.isFinite(value)) {
      payload.nutrition.servingNutrients[fieldPath] = value;
    }
    return;
  }

  const dotIndex = path.indexOf('.');
  if (dotIndex <= 0) {
    return;
  }
  const section = path.slice(0, dotIndex) as keyof SupplementDraftPayload;
  const key = path.slice(dotIndex + 1);
  if (section === 'review') {
    return;
  }

  const target = payload[section] as unknown as
    | Record<string, unknown>
    | undefined;
  if (!target || typeof target !== 'object' || !(key in target)) {
    return;
  }
  target[key] = value;
}

/**
 * 快照里的决定项必须写「实际生效后的值」。
 *
 * AI 没表态时保留的是草稿原值（如 procurement=true），如果快照直接回放
 * 解析器的安全默认值，就会出现 snapshot 说关、payload 却是开。这里统一从
 * 合并后的 payload 取生效值，只保留 AI 给出的理由和 recommendCreate。
 */
function buildEffectiveDecisions(
  aiDraft: SupplementAiDraft | null,
  payload: SupplementDraftPayload,
): SupplementAiDecisions {
  const base = aiDraft?.decisions ?? createEmptyAiDecisions();
  return {
    recommendCreate: { ...base.recommendCreate },
    retail: { enabled: payload.retail.enabled, reason: base.retail.reason },
    noSaleReason: payload.retail.noSaleReason,
    diy: {
      enabled: payload.diy.enabled,
      linkUrl: payload.diy.linkUrl,
      imageUrl: payload.diy.imageUrl,
      reason: base.diy.reason,
    },
    procurement: {
      enabled: payload.procurement.enabled,
      reason: base.procurement.reason,
    },
    equivalence: {
      groupId: payload.equivalence.groupId,
      reason: base.equivalence.reason,
    },
    labelNames: [...payload.label.labelNames],
    defaultTargetFields: [...payload.nutrition.defaultTargetFields],
    tagNames: [...payload.label.tagNames],
    addTiming: payload.basic.addTiming.trim() || null,
  };
}

/** 只有 DRAFT 能跑 AI；已写入/已放弃的草稿返回 409。 */
function assertDraftFillable(draft: SupplementDraftView): void {
  if (draft.status !== 'DRAFT') {
    throw new ConflictException('已写入或已放弃的草稿不能再起草');
  }
}

/** AI 完全不可用时的安全决定项：只展示，不丢草稿。 */
function createEmptyAiDecisions(): SupplementAiDecisions {
  return {
    recommendCreate: { value: true, reason: '' },
    retail: { enabled: false, reason: '' },
    noSaleReason: null,
    diy: { enabled: false, linkUrl: '', imageUrl: '', reason: '' },
    procurement: { enabled: false, reason: '' },
    equivalence: { groupId: null, reason: '' },
    labelNames: [],
    defaultTargetFields: [],
    tagNames: [],
    addTiming: null,
  };
}

/** 提示词里的目录名：精确命中 + 目录建议 + 当前标签名的缺失候选。 */
function collectCatalogNames(
  intake: LabelIntakeResult,
  context: SupplementDraftValidationContext,
): string[] {
  const names: string[] = [];
  const add = (value: unknown): void => {
    const name = trimText(value);
    if (name && !names.includes(name)) {
      names.push(name);
    }
  };

  for (const match of intake.catalog.matches) {
    if (match.exact) {
      add(match.name);
    }
  }
  add(intake.catalog.suggestion?.name);
  for (const name of context.catalog?.missingNames ?? []) {
    add(name);
  }
  for (const candidates of Object.values(
    context.catalog?.candidatesByName ?? {},
  )) {
    for (const name of candidates) {
      add(name);
    }
  }

  return names.slice(0, 100);
}

/* ------------------------------------------------------------------ */
/* 纯工具                                                              */
/* ------------------------------------------------------------------ */

function resolveUserId(user: SupplementDraftAiActor): string {
  if (typeof user === 'string') {
    const id = user.trim();
    if (id) {
      return id;
    }
  } else if (user) {
    const id = trimText(user.userId) || trimText(user.id);
    if (id) {
      return id;
    }
  }
  throw new BadRequestException('缺少操作人');
}

function normalizeManualFields(
  fields: readonly string[] | null | undefined,
): string[] {
  if (!Array.isArray(fields)) {
    return [];
  }
  const result: string[] = [];
  for (const field of fields) {
    const path = trimText(field);
    if (path && !result.includes(path)) {
      result.push(path);
    }
  }
  return result;
}

/** 人改过的路径：精确命中，或父/子路径都算（如整块 nutrients 被锁）。 */
function isManualPath(manualFields: readonly string[], path: string): boolean {
  return manualFields.some(
    (field) =>
      field === path ||
      path.startsWith(`${field}.`) ||
      field.startsWith(`${path}.`),
  );
}

/** 事实路径：精确命中，或父/子路径都算。 */
function isFactPath(factPaths: ReadonlySet<string>, path: string): boolean {
  if (factPaths.has(path)) {
    return true;
  }
  for (const factPath of factPaths) {
    if (path.startsWith(`${factPath}.`) || factPath.startsWith(`${path}.`)) {
      return true;
    }
  }
  return false;
}

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return false;
}

function uniqueStrings(values: readonly unknown[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    const text = trimText(value);
    if (text && !result.includes(text)) {
      result.push(text);
    }
  }
  return result;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
