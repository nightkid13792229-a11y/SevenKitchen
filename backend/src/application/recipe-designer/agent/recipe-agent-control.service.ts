/**
 * Agent 控制面（P0b-3 Task 1）。
 *
 * 实现 `RecipeAgentControlPort`：把模型发起的「问人 / 申请例外或确认缺类 /
 * 交付确认卡」落进当前会话（`recipe_design_agent_message` /
 * `recipe_design_agent_approval` / `recipe_design_agent_snapshot`）。
 *
 * 安全边界（spec 4.3 / 5.2）：
 * - 缺类确认的 categories 只能从**当前草稿**重新算，模型传的自由文本
 *   `detail` 不参与（避免模型自己编缺类）；
 * - 达标例外的 `detail` 是可选的模型说明，原样存，不做解析；
 * - 审批结果只由 `getApprovalState()` 从数据库读，本服务不缓存、不接收模型传值。
 *
 * 这个类按「一次运行」创建（构造时绑定 sessionId / draftId），不做单例。
 */
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { summarizeFoodCategoryCoverage } from '../../../domain/recipe-designer/food-category-map';
import type { RequiredFoodCategory } from '../../../domain/recipe-designer/food-category-map';
import { PrismaService } from '../../../infrastructure/prisma.service';
import type { RecipeAgentDraftPort, RecipeAgentControlPort } from './recipe-agent.port';
import type { AgentApprovalType } from './recipe-agent-approval.service';
import { RecipeAgentApprovalService } from './recipe-agent-approval.service';
import { RecipeAgentSessionService } from './recipe-agent-session.service';

export class RecipeAgentControlService implements RecipeAgentControlPort {
  constructor(
    private readonly sessionService: RecipeAgentSessionService,
    private readonly approvalService: RecipeAgentApprovalService,
    private readonly prisma: PrismaService,
    private readonly port: RecipeAgentDraftPort,
    private readonly sessionId: string,
    private readonly draftId: string,
  ) {}

  async askUser(input: {
    questions: Array<{ question: string; options?: string[] }>;
  }): Promise<void> {
    const content = input.questions
      .map(
        (question, index) =>
          `${index + 1}. ${question.question}${
            question.options?.length
              ? `（可选：${question.options.join(' / ')}）`
              : ''
          }`,
      )
      .join('\n');

    await this.sessionService.appendMessage({
      sessionId: this.sessionId,
      role: 'ASSISTANT',
      content,
    });
    await this.sessionService.updateStatus(this.sessionId, 'WAITING_USER');
  }

  async requestException(input: {
    type: 'COMPLIANCE' | 'CATEGORY_OMISSION';
    reason: string;
    detail?: string;
  }): Promise<void> {
    let approvalType: AgentApprovalType;
    let approvalDetail: string | { categories: RequiredFoodCategory[] } | undefined;

    if (input.type === 'COMPLIANCE') {
      // 达标例外：detail 是可选的人工说明，原样存，不解析。
      approvalType = 'COMPLIANCE_EXCEPTION';
      approvalDetail = input.detail;
    } else {
      // 缺类确认：categories 只能从当前草稿的缺类算，模型传的 detail 不看。
      approvalType = 'CATEGORY_OMISSION';
      const draft = await this.port.getDraft(this.draftId);
      const missing = summarizeFoodCategoryCoverage(draft.items).missing;
      if (missing.length === 0) {
        throw new BadRequestException('当前没有缺类需要确认');
      }
      approvalDetail = { categories: missing };
    }

    const approval = await this.approvalService.request({
      sessionId: this.sessionId,
      type: approvalType,
      reason: input.reason,
      detail: approvalDetail,
    });

    const label =
      approvalType === 'COMPLIANCE_EXCEPTION'
        ? '达标例外申请'
        : '缺类确认申请';
    await this.sessionService.appendMessage({
      sessionId: this.sessionId,
      role: 'ASSISTANT',
      content: `已发起${label}，审批编号 ${approval.id}。`,
    });
  }

  async finishDraft(input: {
    summary: string;
    warnings: string[];
  }): Promise<void> {
    const draft = await this.port.getDraft(this.draftId);

    const snapshot = {
      draft,
      summary: input.summary,
      warnings: input.warnings,
    } as unknown as Prisma.InputJsonValue;

    await this.prisma.recipeDesignAgentSnapshot.create({
      data: {
        designRecipeId: this.draftId,
        sessionId: this.sessionId,
        contentRevision: draft.contentRevision,
        snapshot,
      },
    });

    await this.sessionService.updateStatus(this.sessionId, 'COMPLETED');

    const lines = [input.summary];
    if (input.warnings.length > 0) {
      lines.push(
        '',
        '需要注意：',
        ...input.warnings.map((warning, index) => `${index + 1}. ${warning}`),
      );
    }
    await this.sessionService.appendMessage({
      sessionId: this.sessionId,
      role: 'ASSISTANT',
      content: lines.join('\n'),
    });
  }

  async getApprovalState(): Promise<{
    approvedException: boolean;
    confirmedOmissions: RequiredFoodCategory[];
  }> {
    return this.approvalService.getApprovalState(this.sessionId);
  }
}
