import { Injectable } from '@nestjs/common';
import type { IngredientCheckRun, Prisma } from '@prisma/client';
import { hashDraftPayload } from '../../domain/ingredient-creation/draft-payload-hash';
import {
  INGREDIENT_CARD_RULES,
  runIngredientCardCheck,
} from '../../domain/ingredient-creation/ingredient-card-check';
import { PrismaService } from '../../infrastructure/prisma.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import { IngredientDraftFinalCheckEvaluator } from './ingredient-draft-final-check.evaluator';
import type {
  CheckItem,
  FinalCheckResult,
  IngredientCreationDraft,
  IngredientDraft,
} from './ingredient-creation.types';

/**
 * 按域跑核验 + 落报告。
 *
 * 两域（原料卡 / 营养档案）各有自己的判定来源：
 * - `INGREDIENT`：只读原料卡 + 库里已有 FOOD 名字，跑领域层
 *   `runIngredientCardCheck`；查重**只查 `type = 'FOOD'`**——补剂 / 包装跟食材
 *   同在 `ingredient` 表，名字撞了不该拦住食材建档；
 * - `NUTRITION`：有可用的生/熟档案时，原样复用
 *   `IngredientDraftFinalCheckEvaluator` 的终检结果（与 `POST drafts/:id/check`、
 *   提交前置检查同一份计算），不重算一遍；档案还没有时不调评估器（它没有输入会
 *   抛 400），直接落一条 `NUTRITION_PROFILE_MISSING` 拦死项，弹窗用同一套形状
 *   显示原因而不是弹错误。
 *
 * 每次核验落一条 `ingredient_check_run`，`payloadHash` 记下「检查的是哪份内容」。
 * 过期判定只看内容哈希、不看 `updatedAt`：同一毫秒内的两次改动时间戳可能相同，
 * 旧报告会被当成新的。
 *
 * 本服务是 `ingredient_check_run` 的**唯一写入方**；接口只由
 * `IngredientCreationCheckService.runDomain()` 转发调用，controller 拿到的
 * `trigger` 固定 `USER`、`createdBy` 固定当前登录人。
 */

export type CheckDomain = 'INGREDIENT' | 'NUTRITION';
export type CheckTrigger = 'AGENT' | 'USER';

export interface CheckRunCounts {
  blocking: number;
  exceptionable: number;
  warning: number;
}

/** 一次核验报告的对外视图（时间统一 ISO 字符串，前端不用再转）。 */
export interface CheckRunView {
  id: string;
  draftId: string;
  domain: CheckDomain;
  trigger: CheckTrigger;
  rulesVersion: string;
  payloadHash: string;
  result: FinalCheckResult;
  counts: CheckRunCounts;
  createdBy: string;
  createdAt: string;
}

/**
 * 两域各自的规则版本号。
 *
 * 规则改了必须升版本：授权前除了比哈希，还要比版本，旧规则跑出来的「通过」
 * 不能拿来当新规则的依据（规则细节见 `INGREDIENT_CARD_RULES` / 终检领域函数）。
 */
export const CHECK_RULES_VERSION: Record<CheckDomain, string> = {
  INGREDIENT: 'ingredient-card-v1',
  NUTRITION: 'final-check-v1',
};

/** 查重只回前 200 条就够：`contains` 已经收窄到 3 个字的前缀，再多也没意义。 */
const EXISTING_NAME_LOOKUP_LIMIT = 200;

/**
 * 按名字前 3 个字做 `contains` 预筛。
 *
 * 为什么只用 3 个字：中文原料名很短，「冷冻三文鱼」的前缀足以收窄候选，查重
 * 的最终比较仍由 `runIngredientCardCheck` 做全名归一化比较——这里只是少读行，
 * 不放宽判定。
 */
const EXISTING_NAME_PREFIX_LENGTH = 3;

/** 规则档位表：领域层只回问题清单，落报告时要按这张表分成三档。 */
const INGREDIENT_RULE_LEVELS = new Map<
  string,
  'blocking' | 'exceptionable' | 'warning'
>(INGREDIENT_CARD_RULES.map((rule) => [rule.code, rule.level]));

/** 营养档案只有生 / 熟两种状态；状态缺失或非法都不算「可用档案」。 */
const NUTRITION_PROFILE_STATES: readonly string[] = ['RAW', 'COOKED'];

/**
 * 草稿里有没有可用的营养档案：`payload.profiles` 至少一份生/熟档案，且带着
 * 来源记录 id（没有来源就没有任何营养数据可算）。
 *
 * 为什么核验入口要先自己判一次：`evaluateDraft` 在没有 profiles 且没有 mergePlan
 * 时会抛 400。核验是「拿报告去看」，不是「提交」，缺档案应如实落一条可展示的
 * 拦死项，而不是让弹窗收到一个错误。
 */
function hasUsableNutritionProfile(draft: IngredientCreationDraft): boolean {
  const profiles: unknown = draft.payload.profiles;
  if (!Array.isArray(profiles)) {
    return false;
  }

  return profiles.some((profile: unknown) => {
    if (
      typeof profile !== 'object' ||
      profile === null ||
      Array.isArray(profile)
    ) {
      return false;
    }

    const record = profile as Record<string, unknown>;
    return (
      typeof record.preparationState === 'string' &&
      NUTRITION_PROFILE_STATES.includes(record.preparationState) &&
      typeof record.sourceRecordId === 'string' &&
      record.sourceRecordId.length > 0
    );
  });
}

/**
 * 没有营养档案时的报告内容：与普通核验完全相同的三档形状，弹窗不用特判，
 * 授权闸门也会因为 blocking=1 正常拦住。
 */
function missingNutritionProfileResult(): FinalCheckResult {
  return {
    blocking: [
      {
        code: 'NUTRITION_PROFILE_MISSING',
        message: '还没有营养档案，先在营养页建立生/熟档案',
        fieldPath: 'profiles',
        suggestion: '让 AI 先查库写入，或手动选来源',
      },
    ],
    exceptionable: [],
    warnings: [],
  };
}

/**
 * 草稿里的原料卡；还没走到这一步时返回 null（终检会报 NAME_REQUIRED）。
 *
 * payload 是 JSONB，历史脏数据可能是字符串 / 数组；不是对象就当「还没有卡」，
 * 让规则报 NAME_REQUIRED，而不是在取 `.name` 时炸掉。
 */
function readIngredientCard(
  draft: IngredientCreationDraft,
): IngredientDraft | null {
  const ingredient: unknown = draft.payload.ingredient;
  if (
    typeof ingredient !== 'object' ||
    ingredient === null ||
    Array.isArray(ingredient)
  ) {
    return null;
  }

  return ingredient as IngredientDraft;
}

/** 取名字前 3 个字；名字为空（或脏数据不是字符串）时返回 null，跳过查库。 */
function toLookupPrefix(name: unknown): string | null {
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }
  // 用 Array.from 按字符切，避免把 emoji / 组合字符切坏。
  return Array.from(trimmed).slice(0, EXISTING_NAME_PREFIX_LENGTH).join('');
}

/**
 * 原料域问题清单 → 三档终检结果。
 *
 * 规则表里查不到的 code 一律按 blocking 处理（fail-closed）：新增规则却忘了同步
 * 规则表时，问题会显眼地挡住授权，而不是悄悄降级成提醒。
 */
function groupIngredientItems(items: readonly CheckItem[]): FinalCheckResult {
  const result: FinalCheckResult = {
    blocking: [],
    exceptionable: [],
    warnings: [],
  };

  for (const item of items) {
    const level = INGREDIENT_RULE_LEVELS.get(item.code) ?? 'blocking';
    if (level === 'blocking') {
      result.blocking.push(item);
    } else if (level === 'exceptionable') {
      result.exceptionable.push(item);
    } else {
      result.warnings.push(item);
    }
  }

  return result;
}

function countItems(result: FinalCheckResult): CheckRunCounts {
  return {
    blocking: result.blocking.length,
    exceptionable: result.exceptionable.length,
    warning: result.warnings.length,
  };
}

/** 库里的行 → 对外视图；`domain` / `trigger` 是 varchar，读回来时收窄回字面量。 */
function toView(row: IngredientCheckRun): CheckRunView {
  return {
    id: row.id,
    draftId: row.draftId,
    domain: row.domain as CheckDomain,
    trigger: row.trigger as CheckTrigger,
    rulesVersion: row.rulesVersion,
    payloadHash: row.payloadHash,
    result: row.result as unknown as FinalCheckResult,
    counts: {
      blocking: row.blockingCount,
      exceptionable: row.exceptionableCount,
      warning: row.warningCount,
    },
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * 按域核验报告的读写服务。
 *
 * - `runDomain`：跑核验 + 落一条报告（唯一写入口）；
 * - `latestRuns`：两域各取最新一条，供页面显示与授权闸门判定；
 * - `isFresh`：报告是否还对得上当前草稿（内容哈希相等）。
 */
@Injectable()
export class IngredientCheckRunService {
  private readonly evaluator: IngredientDraftFinalCheckEvaluator;

  constructor(
    private readonly prisma: PrismaService,
    private readonly draftService: IngredientCreationDraftService,
  ) {
    this.evaluator = new IngredientDraftFinalCheckEvaluator(prisma);
  }

  /**
   * 跑某一域的核验并落报告。
   *
   * `createdBy` 由调用方（controller 取当前登录人）传入；不传时回退到草稿创建人，
   * 保证这一列永远有值——授权审计要能回答「谁在什么时候按了什么」。
   */
  async runDomain(
    draftId: string,
    domain: CheckDomain,
    trigger: CheckTrigger,
    createdBy?: string,
  ): Promise<CheckRunView> {
    const draft = await this.draftService.get(draftId);
    const result = await this.evaluateDomain(draft, domain);
    const counts = countItems(result);

    const data: Prisma.IngredientCheckRunUncheckedCreateInput = {
      draftId,
      domain,
      trigger,
      rulesVersion: CHECK_RULES_VERSION[domain],
      payloadHash: hashDraftPayload(draft.payload),
      result: result as unknown as Prisma.InputJsonValue,
      blockingCount: counts.blocking,
      exceptionableCount: counts.exceptionable,
      warningCount: counts.warning,
      createdBy:
        typeof createdBy === 'string' && createdBy.length > 0
          ? createdBy
          : draft.createdBy,
    };

    const row = await this.prisma.ingredientCheckRun.create({ data });
    return toView(row);
  }

  /** 两域各自的最新报告；没有跑过就是 null（页面据此显示「未核验」）。 */
  async latestRuns(
    draftId: string,
  ): Promise<Record<CheckDomain, CheckRunView | null>> {
    const [ingredient, nutrition] = await Promise.all([
      this.findLatest(draftId, 'INGREDIENT'),
      this.findLatest(draftId, 'NUTRITION'),
    ]);

    return { INGREDIENT: ingredient, NUTRITION: nutrition };
  }

  /**
   * 报告是否还对得上当前草稿。
   *
   * 只比**内容哈希**：`updatedAt` 在同一毫秒内的两次改动可能一样，用它判断会把
   * 改过内容的旧报告当成新的。草稿任意一格变化（含 payload 内其它站点）都算过期。
   */
  isFresh(run: CheckRunView, draft: { payload: unknown }): boolean {
    return run.payloadHash === hashDraftPayload(draft.payload);
  }

  private async findLatest(
    draftId: string,
    domain: CheckDomain,
  ): Promise<CheckRunView | null> {
    const row = await this.prisma.ingredientCheckRun.findFirst({
      where: { draftId, domain },
      // 同一毫秒可能落两条（连点、AI 自动跟跑）：created_at 相同再用 id 倒序兜底，
      // 保证「最新一份」是确定的、可重复的。
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return row ? toView(row) : null;
  }

  private async evaluateDomain(
    draft: IngredientCreationDraft,
    domain: CheckDomain,
  ): Promise<FinalCheckResult> {
    if (domain === 'INGREDIENT') {
      return this.evaluateIngredientDomain(draft);
    }

    if (!hasUsableNutritionProfile(draft)) {
      return missingNutritionProfileResult();
    }

    return this.evaluator.evaluate(draft);
  }

  private async evaluateIngredientDomain(
    draft: IngredientCreationDraft,
  ): Promise<FinalCheckResult> {
    const ingredient = readIngredientCard(draft);
    // 查重查的是**将被创建的那个名字**：卡片还没有或名字还空着时不查库，
    // 由 `runIngredientCardCheck` 报 NAME_REQUIRED——没名字就谈不上重名。
    const prefix = toLookupPrefix(ingredient?.name);
    const existingNames = prefix
      ? await this.findExistingFoodNames(prefix)
      : [];

    return groupIngredientItems(
      runIngredientCardCheck({ ingredient, existingNames }),
    );
  }

  /**
   * 库里已有的食材名（用于查重）。
   *
   * 只取 `type = 'FOOD'`：补剂 / 包装同名不能挡住食材建档。名字还没填时调用方
   * 不会进来（`toLookupPrefix` 已挡住），不会触发全表扫。
   */
  private async findExistingFoodNames(prefix: string): Promise<string[]> {
    const rows = await this.prisma.ingredient.findMany({
      where: {
        type: 'FOOD',
        name: { contains: prefix, mode: 'insensitive' },
      },
      select: { name: true },
      take: EXISTING_NAME_LOOKUP_LIMIT,
    });

    return rows.map((row) => row.name);
  }
}
