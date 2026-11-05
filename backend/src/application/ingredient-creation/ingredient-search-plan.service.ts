import { BadRequestException, Injectable } from '@nestjs/common';
import {
  approveSearchPlan,
  readSearchPlan,
  type SearchPlan,
  type SearchPlanApprovalInput,
} from '../../domain/ingredient-creation/search-plan';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';

/**
 * 检索方案的确认。
 *
 * 只做一件事：把草稿里**待确认**的方案变成**已确认**，记下是谁、什么时候，
 * 人改过什么也一并留下。确认之后，起草循环里的写工具才会放行。
 *
 * 单独成服务而不是塞进控制器：确认是审计动作（谁批的、批的是什么），
 * 将来还要接权限与通知，不值得和 HTTP 参数解析混在一起。
 */
@Injectable()
export class IngredientSearchPlanService {
  constructor(private readonly draftService: IngredientCreationDraftService) {}

  async confirm(
    draftId: string,
    input: SearchPlanApprovalInput,
    approver: { userId: string; now?: Date },
  ): Promise<SearchPlan> {
    const draft = await this.draftService.get(draftId);
    const current = readSearchPlan(draft.payload.searchPlan);

    if (!current) {
      throw new BadRequestException(
        '这份草稿还没有检索方案，先让 AI 查库并提交方案再确认。',
      );
    }

    const approved = approveSearchPlan(current, input, approver);
    if (!approved.ok) {
      throw new BadRequestException(approved.error);
    }

    await this.draftService.patch(draftId, draft.step, {
      searchPlan: approved.plan,
    });

    return approved.plan;
  }

  /**
   * 跳过当前待确认方案：只清掉 `searchPlan`，不写正式库。
   *
   * 跳过不等于批准：写工具仍然要求一份新的、已确认的方案；
   * AI 可以继续查库/提问/重新提方案。
   */
  async dismiss(draftId: string): Promise<void> {
    const draft = await this.draftService.get(draftId);
    const current = readSearchPlan(draft.payload.searchPlan);

    if (!current) {
      return;
    }
    if (current.status !== 'PENDING') {
      throw new BadRequestException(
        '这份检索方案已经确认，不能跳过；如需改方案请重新检索。',
      );
    }

    await this.draftService.patch(draftId, draft.step, {
      searchPlan: null,
    });
  }

}
