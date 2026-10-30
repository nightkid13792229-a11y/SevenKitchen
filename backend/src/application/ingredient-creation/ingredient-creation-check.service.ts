import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  IngredientCheckRunService,
  type CheckDomain,
  type CheckRunView,
  type CheckTrigger,
} from './ingredient-check-run.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import { IngredientDraftFinalCheckEvaluator } from './ingredient-draft-final-check.evaluator';
import type {
  FinalCheckResult,
  IngredientCreationDraft,
} from './ingredient-creation.types';

/**
 * `GET drafts/:id/checks` 的返回体：两域各自的最新报告 + 是否还对得上当前草稿。
 *
 * `fresh` 为 false 有两种情况：没跑过（报告为 null）或跑完之后草稿又改过。
 */
export interface IngredientDraftChecksView {
  ingredient: CheckRunView | null;
  nutrition: CheckRunView | null;
  fresh: { ingredient: boolean; nutrition: boolean };
}

/**
 * 终检的应用服务。
 *
 * 职责：确定终检输入 → 算宏量与 4/9/4 反算能量 → 判断生熟覆盖 →
 * 调领域层 `runFinalCheck`。控制器不重算任何营养规则。
 *
 * 计算本身在 `IngredientDraftFinalCheckEvaluator` 里（提交前置检查、按域核验都要
 * 复用同一份结果），本服务只保留接口层的入口；按域核验的编排与落库在
 * `IngredientCheckRunService`，这里只做转发，保证「报告只有一个写入口」。
 *
 * 提交路径不再使用本服务的 `assertCommitAllowed`：授权闸门
 * （`IngredientCreationAuthorizeService`）还要求报告新鲜、版本一致、例外已登记，
 * 只查 blocking 的旧检查不足以放行写入。
 */
@Injectable()
export class IngredientCreationCheckService {
  private readonly evaluator: IngredientDraftFinalCheckEvaluator;

  constructor(
    prisma: PrismaService,
    private readonly draftService: IngredientCreationDraftService,
    private readonly checkRunService: IngredientCheckRunService,
  ) {
    this.evaluator = new IngredientDraftFinalCheckEvaluator(prisma);
  }

  async runCheck(draftId: string): Promise<FinalCheckResult> {
    const draft = await this.draftService.get(draftId);
    return this.evaluateDraft(draft);
  }

  /**
   * @deprecated 不是授权闸门（只查 blocking，不含新鲜度 / 版本 / 例外），
   * 勿用于任何提交路径。提交前必须走 `IngredientCreationAuthorizeService`；
   * 该方法先保留，只给仍需要单跑终检的内部场景参考。
   */
  async assertCommitAllowed(draftId: string): Promise<void> {
    const draft = await this.draftService.get(draftId);
    const result = await this.evaluateDraft(draft);

    if (result.blocking.length > 0) {
      throw new BadRequestException({
        message: '终检存在阻断项，不能提交',
        blocking: result.blocking,
      });
    }
  }

  /**
   * 跑某一域的核验（原料 / 营养），落一条带草稿哈希的报告。
   *
   * 对外只暴露这一个入口：controller 不直接碰核验报告服务，触发方式与操作人也
   * 由这里固定下来（当前登录人、`USER`），避免前端传 `AGENT` 冒充 AI 自检。
   */
  async runDomain(
    draftId: string,
    domain: CheckDomain,
    trigger: CheckTrigger,
    createdBy?: string,
  ): Promise<CheckRunView> {
    return this.checkRunService.runDomain(draftId, domain, trigger, createdBy);
  }

  /**
   * 读两域最新报告，并对着**当前草稿**判断是否过期。
   *
   * 先确认草稿存在（不存在 → 404）：没有草稿就没有「当前内容」，也就谈不上新鲜度。
   */
  async latestChecks(draftId: string): Promise<IngredientDraftChecksView> {
    const draft = await this.draftService.get(draftId);
    const runs = await this.checkRunService.latestRuns(draftId);

    return {
      ingredient: runs.INGREDIENT,
      nutrition: runs.NUTRITION,
      fresh: {
        ingredient: runs.INGREDIENT
          ? this.checkRunService.isFresh(runs.INGREDIENT, draft)
          : false,
        nutrition: runs.NUTRITION
          ? this.checkRunService.isFresh(runs.NUTRITION, draft)
          : false,
      },
    };
  }

  private evaluateDraft(
    draft: IngredientCreationDraft,
  ): Promise<FinalCheckResult> {
    return this.evaluator.evaluate(draft);
  }
}
