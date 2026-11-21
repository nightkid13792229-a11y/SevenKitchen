/**
 * 新 Agent 运行时（2026-10-31 重建，替代原来的 1,135 行循环 + 适配器）。
 *
 * 与旧版的四处关键差异：
 * 1. 工具预算 200 → 60；单次运行 6 分钟不变。
 * 2. 历史只回灌「人说的话 + AI 的结论」，工具结果不回灌 ——
 *    草稿本身就是工具结果的沉淀，模型下次读草稿即可。
 * 3. 目的（会话第一条用户消息）固定放在上下文最前面，永远不会被截断丢掉。
 * 4. 不再有审批、快照、交付确认卡；三个不可逆动作由人来点。
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma.service';
import { KnowledgeGatewayService } from '../../knowledge-v3/knowledge-gateway.service';
import { AgentProviderConfigService } from '../../nutrition-governance/agent-provider-config.service';
import {
  recipeDesignPurposesForFlow,
  type RecipeDesignFlow,
} from '../recipe-design-agent-purpose';
import {
  callDeepSeekTools,
  type DeepSeekToolCall,
  type DeepSeekToolsMessage,
  type DeepSeekToolsResult,
} from '../deepseek-tools-chat';
import { RecipeDesignerService } from '../recipe-designer.service';
import { buildSystemPrompt } from './prompt';
import { redactDrugDoses } from './dose-redaction';
import { RecipeDraftPort } from './draft-port';
import { RecipeCatalogPort } from './catalog-port';
import { executeTool } from './tools';
import {
  PHASE_TOOL_BUDGET,
  forceProposeToolFor,
  phaseSystemLine,
  toolsForPhase,
  type AgentPhase,
} from './phase-policy';
import {
  countFindHits,
  findQueryKey,
  nextZeroHitStreak,
} from './research-guard';
import {
  buildEvidenceDigest,
  buildPlanSynthesisMessages,
} from './plan-synthesis';
import {
  buildFoodCandidateDigest,
  buildSelectionSynthesisMessages,
} from './selection-synthesis';
import {
  PROPOSE_PLAN_TOOL,
  PROPOSE_SELECTION_TOOL,
  type AgentNutritionPlan,
  type AgentSelection,
} from './propose-plan';
import type { AgentSupplementProposal } from './propose-supplement';
import { matchSelectionToLibrary } from './selection-match';
import { assessmentGapSignature } from './assessment-progress';
import {
  auditPlanCitations,
  collectKnowledgeCitationIds,
} from './citation-audit';
import { loadSkillsForPhase } from './skill-loader';
import {
  buildSessionStateMessages,
  planRevisionUpdate,
  selectionSubmissionUpdate,
} from './session-state';
import { fail, type RecipeAgentActor, type ToolOutcome } from './agent-types';
import {
  buildKnowledgeImageMessage,
  hasImageContent,
  splitReadImages,
  stripImageContent,
  type KnowledgePageImage,
} from './knowledge-tool-bridge';
import {
  buildDesignContextImageMessage,
  splitDesignContextImages,
  type DesignContextImage,
} from './design-context-images';
import { findToolMessageOrderViolation } from './message-order';

/**
 * 一次运行最多调多少次工具。
 * 旧版 200 次；最小图书馆版收紧到 80。加入知识库检索后，完整"设计一天食谱"
 * 会超过 80（实测 80 次仍停在 find_food/edit_recipe 循环），因此支持环境变量覆盖：
 * `AGENT_MAX_TOOL_CALLS`（默认 80）、`AGENT_MAX_RUN_MS`（默认 6 分钟）。
 */
function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
const MAX_TOOL_CALLS = positiveInt(process.env.AGENT_MAX_TOOL_CALLS, 320);
/** 方案/选材阶段先收口，避免在检索里把预算烧光。 */
/** 方案/选材阶段单次读页的 token 预算上限（默认 20k 太大）。 */
const EARLY_PHASE_READ_BUDGET = 12000;
const MAX_NO_PROGRESS_ASSESSMENTS = 6;
/** 连续改配方多少次没有评估，就强制先评估一次。 */
const MAX_EDITS_BETWEEN_ASSESS = 20;
/** 一次运行最长多久。 */
const MAX_RUN_MS = positiveInt(process.env.AGENT_MAX_RUN_MS, 30 * 60 * 1000);
/** 回灌给模型的历史条数（只含用户与助手）。 */
const HISTORY_MESSAGES = 200;

@Injectable()
export class RecipeAgentService implements OnModuleInit {
  /** 一个草稿同一时间只允许一次运行。 */
  private readonly active = new Set<string>();
  private readonly stopped = new Set<string>();
  /** 选材确认后当前运行还没释放 active，下一阶段延到 finally 再启动。 */
  private readonly pendingStageStart = new Map<
    string,
    { actor: RecipeAgentActor; message: string }
  >();
  private readonly logger = new Logger(RecipeAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerConfig: AgentProviderConfigService,
    private readonly designer: RecipeDesignerService,
    private readonly knowledge: KnowledgeGatewayService,
  ) {}

  /**
   * 进程启动时把上次留在 RUNNING 的会话标成 INTERRUPTED。
   *
   * 为什么必须有：部署会重启进程，正在跑的那次运行就断了，但库里还是
   * RUNNING —— 抽屉看到 RUNNING 就一直禁用输入框、只轮询不给你打字，
   * 表现就是"对话框点不了"（2026-11-01 实测）。
   */
  async onModuleInit(): Promise<void> {
    await this.prisma.recipeDesignAgentSession.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'INTERRUPTED',
        endedAt: new Date(),
        lastError: '服务重启，本次运行中断',
      },
    });
  }

  private accessFor(actor: RecipeAgentActor) {
    return {
      userId: actor.userId,
      role: actor.role ?? null,
      customerId: actor.customerId ?? null,
    } as Parameters<RecipeDesignerService['getDraft']>[1];
  }

  /** 开跑：校验访问权 → 抢草稿锁 → 复用或新建会话 → 后台跑。 */
  async start(input: {
    draftId: string;
    actor: RecipeAgentActor;
    message: string;
    /** 阶段确认后的自动续跑：内部指令，不写进用户消息。 */
    silent?: boolean;
  }): Promise<{ sessionId: string }> {
    if (this.active.has(input.draftId)) {
      throw new ConflictException('这个草稿已经有一个 AI 运行');
    }
    this.active.add(input.draftId);

    let launched = false;
    try {
      const access = this.accessFor(input.actor);
      const draft = (await this.designer.getDraft(
        input.draftId,
        access,
      )) as any;
      const flow: RecipeDesignFlow =
        draft?.series?.designMode === 'ORDER' ? 'ORDER' : 'CATALOG';

      const existing = await this.prisma.recipeDesignAgentSession.findFirst({
        where: { designRecipeId: input.draftId },
        orderBy: { startedAt: 'desc' },
      });
      let sessionId: string;
      const phase: AgentPhase = (existing?.phase ?? 'PLAN') as AgentPhase;
      if (existing) {
        // 不因为库里写着 RUNNING 就拒绝：真正的并发由前面的 active 锁保证。
        // 库里残留的 RUNNING 是上次进程被重启留下的，必须能接着用。
        await this.prisma.recipeDesignAgentSession.update({
          where: { id: existing.id },
          data: { status: 'RUNNING', lastError: null, endedAt: null },
        });
        sessionId = existing.id;
      } else {
        const session = await this.prisma.recipeDesignAgentSession.create({
          data: {
            designRecipeId: input.draftId,
            status: 'RUNNING',
            phase: 'PLAN',
            skillName: 'recipe-design',
            skillVersion: 'v2',
            createdBy: input.actor.userId,
          },
        });
        sessionId = session.id;
      }

      await this.createRunSnapshot(sessionId, input.draftId, input.actor);
      if (!input.silent) {
        await this.appendMessage(sessionId, 'USER', input.message);
      }
      this.launch(
        sessionId,
        input.draftId,
        input.actor,
        input.message,
        flow,
        phase,
      );
      launched = true;
      return { sessionId };
    } finally {
      if (!launched) {
        this.active.delete(input.draftId);
      }
    }
  }

  /** 会话视图：会话 + 全部消息（给抽屉展示）。 */
  async getSession(draftId: string, actor: RecipeAgentActor) {
    const draft = await this.designer.getDraft(
      draftId,
      this.accessFor(actor),
    );
    const session = await this.prisma.recipeDesignAgentSession.findFirst({
      where: { designRecipeId: draftId },
      orderBy: { startedAt: 'desc' },
    });
    if (!session) return null;
    const messages = await this.prisma.recipeDesignAgentMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { seq: 'asc' },
    });
    return {
      session,
      messages,
      canRevert: await this.canRevertRun(session.id, session.status, draft.contentRevision),
    };
  }

  /**
   * C4：每次 run 开始存一份草稿快照。
   * 快照失败不阻断设计，只记日志；回滚入口会自然不存在。
   */
  private async createRunSnapshot(
    sessionId: string,
    draftId: string,
    actor: RecipeAgentActor,
  ): Promise<void> {
    try {
      const draft = await this.designer.getDraft(
        draftId,
        this.accessFor(actor),
      );
      const snapshot = {
        version: 1,
        runStartRevision: draft.contentRevision,
        runEndRevision: null,
        draft: JSON.parse(JSON.stringify(draft)),
      };
      await this.prisma.recipeDesignAgentSnapshot.create({
        data: {
          designRecipeId: draftId,
          sessionId,
          contentRevision: draft.contentRevision,
          snapshot: snapshot as never,
        },
      });
    } catch (error) {
      this.logger.warn(
        `[agent] 草稿 ${draftId} 运行快照创建失败：${(error as Error)?.message ?? String(error)}`,
      );
    }
  }

  /** run 结束后记录“AI 改到的版本”，回滚时用它判断之后有没有人工再改。 */
  private async finalizeRunSnapshot(
    sessionId: string,
    draftId: string,
    actor: RecipeAgentActor,
  ): Promise<void> {
    try {
      const record = await this.prisma.recipeDesignAgentSnapshot.findFirst({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
      });
      if (!record) return;
      const payload =
        typeof record.snapshot === 'object' &&
        record.snapshot !== null &&
        !Array.isArray(record.snapshot)
          ? (record.snapshot as Record<string, unknown>)
          : null;
      if (!payload || payload.version !== 1 || !payload.draft) return;
      const draft = await this.designer.getDraft(
        draftId,
        this.accessFor(actor),
      );
      await this.prisma.recipeDesignAgentSnapshot.update({
        where: { id: record.id },
        data: {
          snapshot: {
            ...payload,
            runEndRevision: draft.contentRevision,
            runEndAt: new Date().toISOString(),
          } as never,
        },
      });
    } catch (error) {
      this.logger.warn(
        `[agent] 会话 ${sessionId} 运行快照收尾失败：${(error as Error)?.message ?? String(error)}`,
      );
    }
  }

  private async canRevertRun(
    sessionId: string,
    status: string,
    currentRevision: number,
  ): Promise<boolean> {
    if (status === 'RUNNING') return false;
    try {
      const record = await this.prisma.recipeDesignAgentSnapshot.findFirst({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
      });
      if (!record) return false;
      const payload =
        typeof record.snapshot === 'object' &&
        record.snapshot !== null &&
        !Array.isArray(record.snapshot)
          ? (record.snapshot as Record<string, unknown>)
          : null;
      if (!payload?.draft) return false;
      const start = Number(payload.runStartRevision);
      const hasEnd =
        payload.runEndRevision !== null &&
        payload.runEndRevision !== undefined;
      const end = hasEnd ? Number(payload.runEndRevision) : NaN;
      return Number.isInteger(end)
        ? currentRevision === end
        : currentRevision === start;
    } catch {
      return false;
    }
  }

  /**
   * C4：撤销本次 AI 运行。
   * 只允许在 AI 跑完、且草稿之后没被人工改过时回滚。
   */
  async revertRun(
    sessionId: string,
    actor: RecipeAgentActor,
  ): Promise<{ reverted: boolean; contentRevision: number }> {
    const session = await this.prisma.recipeDesignAgentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');
    if (session.status === 'RUNNING') {
      throw new BadRequestException('运行中不能撤销');
    }
    const access = this.accessFor(actor);
    const draft = await this.designer.getDraft(session.designRecipeId, access);
    const record = await this.prisma.recipeDesignAgentSnapshot.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    const payload =
      record &&
      typeof record.snapshot === 'object' &&
      record.snapshot !== null &&
      !Array.isArray(record.snapshot)
        ? (record.snapshot as Record<string, any>)
        : null;
    if (!payload?.draft) {
      throw new BadRequestException('这次运行没有可撤销的快照');
    }
    const start = Number(payload.runStartRevision);
    const hasEnd =
      payload.runEndRevision !== null &&
      payload.runEndRevision !== undefined;
    const end = hasEnd ? Number(payload.runEndRevision) : NaN;
    const allowed = Number.isInteger(end)
      ? draft.contentRevision === end
      : draft.contentRevision === start;
    if (!allowed) {
      throw new BadRequestException(
        '草稿在 AI 运行后又被修改过，不能撤销；请手动调整',
      );
    }
    const restored = await this.designer.restoreFromAgentSnapshot(
      session.designRecipeId,
      payload.draft,
      access,
    );
    await this.prisma.recipeDesignAgentSession.update({
      where: { id: sessionId },
      data: {
        supplementProposal: Prisma.DbNull,
        citationAudit: Prisma.DbNull,
        status: 'WAITING_USER',
        endedAt: new Date(),
      },
    });
    await this.appendMessage(
      sessionId,
      'ASSISTANT',
      '已撤销本次 AI 运行，配方恢复到运行前；请重新评估。',
    );
    return { reverted: true, contentRevision: restored.contentRevision };
  }

  /**
   * 方案/选材确认（2026-11-20）。
   *
   * 阶段推进由人点按钮触发；CONTINUE 只表示继续讨论，不推进阶段。
   */
  async confirmPlan(
    draftId: string,
    actor: RecipeAgentActor,
    decision: 'APPROVE' | 'CONTINUE',
  ): Promise<{ phase: AgentPhase }> {
    return this.confirmStage(draftId, actor, 'PLAN', decision);
  }

  async confirmSelection(
    draftId: string,
    actor: RecipeAgentActor,
    decision: 'APPROVE' | 'CONTINUE',
  ): Promise<{ phase: AgentPhase }> {
    return this.confirmStage(draftId, actor, 'SELECT', decision);
  }

  /**
   * 库外食材新增后，按名称重新匹配原料库；不推进阶段、不写方案。
   * 只更新 selection 的 dataStatus / 原料 ID。
   */
  async rematchSelection(
    draftId: string,
    actor: RecipeAgentActor,
  ): Promise<AgentSelection> {
    await this.designer.getDraft(draftId, this.accessFor(actor));
    const session = await this.prisma.recipeDesignAgentSession.findFirst({
      where: { designRecipeId: draftId },
      orderBy: { startedAt: 'desc' },
    });
    if (!session) throw new NotFoundException('会话不存在');
    if (!session.selection) {
      throw new BadRequestException('还没有提交选材候选');
    }
    const port = new RecipeDraftPort(
      this.designer,
      this.accessFor(actor),
      draftId,
    );
    const matched = await matchSelectionToLibrary(
      session.selection as unknown as AgentSelection,
      (input) => port.findFoods(input),
    );
    await this.prisma.recipeDesignAgentSession.update({
      where: { id: session.id },
      data: { selection: matched as never },
    });
    return matched;
  }

  /**
   * 选材卡逐项勾选：只保留用户勾中的食材，不推进阶段。
   * 空清单拒绝；已确认后不能再改。
   */
  async updateSelectionItems(
    draftId: string,
    actor: RecipeAgentActor,
    itemNames: string[],
  ): Promise<AgentSelection> {
    await this.designer.getDraft(draftId, this.accessFor(actor));
    const session = await this.prisma.recipeDesignAgentSession.findFirst({
      where: { designRecipeId: draftId },
      orderBy: { startedAt: 'desc' },
    });
    if (!session) throw new NotFoundException('会话不存在');
    if (session.phase !== 'SELECT' || session.selectionConfirmedAt) {
      throw new BadRequestException('当前不在选材确认阶段，不能修改选材清单');
    }
    if (!session.selection) {
      throw new BadRequestException('还没有提交选材候选');
    }
    const wanted = new Set(
      (Array.isArray(itemNames) ? itemNames : [])
        .map((name) => String(name).trim())
        .filter(Boolean),
    );
    if (wanted.size === 0) {
      throw new BadRequestException('至少要保留一条选材');
    }
    const selection = session.selection as unknown as AgentSelection;
    const items = (selection.items ?? []).filter((item) =>
      wanted.has(item.name),
    );
    if (items.length === 0) {
      throw new BadRequestException('选中的食材不在当前清单里');
    }
    const unavailable = items.filter(
      (item) => item.dataStatus !== 'AVAILABLE',
    );
    if (unavailable.length > 0) {
      throw new BadRequestException(
        `还有 ${unavailable.length} 项食材未匹配或营养档案不全（${unavailable
          .map((item) => item.name)
          .join('、')}），不能保存选中清单；请先让 AI 判断同物异名或补档案`,
      );
    }
    const updated: AgentSelection = {
      ...selection,
      items,
      confirmed: false,
    };
    await this.prisma.recipeDesignAgentSession.update({
      where: { id: session.id },
      data: { selection: updated as never },
    });
    return updated;
  }

  /**
   * 补剂提案的人工决定：ACCEPT 才写入配方，DECLINE 只清掉提案。
   * 提案本身不写草稿，避免 AI 自行加补剂。
   */
  async decideSupplementProposal(
    draftId: string,
    actor: RecipeAgentActor,
    decision: 'ACCEPT' | 'DECLINE',
  ): Promise<{ accepted: number }> {
    const access = this.accessFor(actor);
    await this.designer.getDraft(draftId, access);
    const session = await this.prisma.recipeDesignAgentSession.findFirst({
      where: { designRecipeId: draftId },
      orderBy: { startedAt: 'desc' },
    });
    if (!session) throw new NotFoundException('会话不存在');
    if (!session.supplementProposal) {
      throw new BadRequestException('没有待确认的补剂提案');
    }
    if (session.phase !== 'DESIGN') {
      throw new BadRequestException('补剂提案只能在配方编辑阶段处理');
    }
    const proposal =
      session.supplementProposal as unknown as AgentSupplementProposal;
    if (decision === 'DECLINE') {
      await this.prisma.recipeDesignAgentSession.update({
        where: { id: session.id },
        data: {
          supplementProposal: Prisma.DbNull,
          status: 'WAITING_USER',
          endedAt: new Date(),
        },
      });
      await this.appendMessage(session.id, 'ASSISTANT', '已忽略补剂提案。');
      return { accepted: 0 };
    }
    if (!Array.isArray(proposal.items) || proposal.items.length === 0) {
      throw new BadRequestException('补剂提案为空');
    }
    let accepted = 0;
    for (const item of proposal.items) {
      await this.designer.addItem(
        draftId,
        {
          nutritionFoodId: item.nutritionFoodId,
          ingredientId: item.ingredientId,
          weightG: item.weightG,
          supplementTargets: [
            {
              fieldPath: item.fieldPath,
              ...(item.unit ? { unit: item.unit } : {}),
            },
          ],
        } as any,
        access,
      );
      accepted += 1;
    }
    await this.prisma.recipeDesignAgentSession.update({
      where: { id: session.id },
      data: {
        supplementProposal: Prisma.DbNull,
        status: 'WAITING_USER',
        endedAt: new Date(),
      },
    });
    await this.appendMessage(
      session.id,
      'ASSISTANT',
      `已按补剂提案加入 ${accepted} 项；请重新评估。`,
    );
    return { accepted };
  }

  private async confirmStage(
    draftId: string,
    actor: RecipeAgentActor,
    stage: 'PLAN' | 'SELECT',
    decision: 'APPROVE' | 'CONTINUE',
  ): Promise<{ phase: AgentPhase }> {
    await this.designer.getDraft(draftId, this.accessFor(actor));
    const session = await this.prisma.recipeDesignAgentSession.findFirst({
      where: { designRecipeId: draftId },
      orderBy: { startedAt: 'desc' },
    });
    if (!session) {
      throw new NotFoundException('会话不存在');
    }
    const current = session.phase as AgentPhase;
    if (decision === 'CONTINUE') {
      await this.prisma.recipeDesignAgentSession.update({
        where: { id: session.id },
        data: { status: 'WAITING_USER' },
      });
      return { phase: current };
    }

    if (stage === 'PLAN') {
      if (!session.plan) {
        throw new BadRequestException('还没有提交营养方案');
      }
      if (current !== 'PLAN' && current !== 'SELECT' && current !== 'DESIGN') {
        throw new BadRequestException('当前不在方案确认阶段');
      }
      // 已确认过就不要再起一轮，避免重复点按钮产生重复运行。
      if (session.planConfirmedAt && current !== 'PLAN') {
        return { phase: current };
      }
      const nextPhase: AgentPhase = current === 'PLAN' ? 'SELECT' : current;
      await this.prisma.recipeDesignAgentSession.update({
        where: { id: session.id },
        data: {
          planConfirmedAt: new Date(),
          phase: nextPhase,
          status: 'WAITING_USER',
        },
      });
      await this.startOrQueue({
        draftId,
        actor,
        silent: true,
        message:
          nextPhase === 'SELECT'
            ? '方案已确认。请进入选材阶段：只列食材，不列补剂；基于已确认方案和忌口自由选食材，不要查原料库；库外食材系统会自动标 MISSING；用 propose_selection 提交。'
            : '方案已确认。请核对现有选材和配方：按新方案检查已有清单与配方，必要时用 edit_recipe 调整；不要重造方案。',
      });
      return { phase: nextPhase };
    }

    if (current === 'DESIGN' && session.selectionConfirmedAt) {
      return { phase: 'DESIGN' };
    }
    if (current !== 'SELECT') {
      throw new BadRequestException('当前不在选材确认阶段');
    }
    if (!session.selection) {
      throw new BadRequestException('还没有提交选材候选');
    }
    const selection = session.selection as unknown as AgentSelection;
    const unavailable = (selection.items ?? []).filter(
      (item) => item.dataStatus !== 'AVAILABLE',
    );
    if (unavailable.length > 0) {
      throw new BadRequestException(
        `选材清单还有 ${unavailable.length} 项未匹配或营养档案不全（${unavailable
          .map((item) => item.name)
          .join('、')}），不能进入配方编辑；请先让 AI 判断同物异名或补档案`,
      );
    }
    await this.prisma.recipeDesignAgentSession.update({
      where: { id: session.id },
      data: {
        phase: 'DESIGN',
        selectionConfirmedAt: new Date(),
        status: 'WAITING_USER',
      },
    });
    await this.startOrQueue({
      draftId,
      actor,
      silent: true,
      message:
        '选材已确认。请进入配方编辑阶段：读取当前草稿，按已确认方案与选材编辑配方，并调用评估验证；不要改动已确认的方案约束。',
    });
    return { phase: 'DESIGN' };
  }

  /**
   * 阶段确认后的自动续跑。
   *
   * 极少数情况下草稿还有一次 run 没释放 active（状态已写成等待用户、但 finally
   * 还没执行）。这里不把 409 抛给前端，而是登记 pendingStageStart，等 active
   * 释放后由 launch.finally 起跑。
   */
  private async startOrQueue(input: {
    draftId: string;
    actor: RecipeAgentActor;
    message: string;
    silent?: boolean;
  }): Promise<void> {
    try {
      await this.start({ ...input, silent: input.silent ?? true });
    } catch (error) {
      if (error instanceof ConflictException) {
        this.pendingStageStart.set(input.draftId, {
          actor: input.actor,
          message: input.message,
        });
        return;
      }
      throw error;
    }
  }

  /** 人工停止。 */
  async stop(sessionId: string, actor: RecipeAgentActor): Promise<void> {
    const session = await this.prisma.recipeDesignAgentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');
    await this.designer.getDraft(session.designRecipeId, this.accessFor(actor));
    this.stopped.add(sessionId);
    await this.prisma.recipeDesignAgentSession.updateMany({
      where: { id: sessionId, status: { in: ['RUNNING', 'WAITING_USER'] } },
      data: { status: 'STOPPED', endedAt: new Date() },
    });
  }

  private launch(
    sessionId: string,
    draftId: string,
    actor: RecipeAgentActor,
    message: string,
    flow: RecipeDesignFlow,
    phase: AgentPhase,
  ): void {
    void this.run(sessionId, draftId, actor, message, flow, phase)
      .catch(async (error: unknown) => {
        await this.prisma.recipeDesignAgentSession
          .update({
            where: { id: sessionId },
            data: {
              status: 'FAILED',
              lastError: (error as Error)?.message?.slice(0, 500) ?? '运行失败',
              endedAt: new Date(),
            },
          })
          .catch(() => undefined);
      })
      .finally(async () => {
        await this.finalizeRunSnapshot(sessionId, draftId, actor);
        this.active.delete(draftId);
        this.stopped.delete(sessionId);
        const pending = this.pendingStageStart.get(draftId);
        if (pending) {
          this.pendingStageStart.delete(draftId);
          void this.start({
            draftId,
            actor: pending.actor,
            message: pending.message,
            silent: true,
          }).catch(async (error: unknown) => {
            await this.prisma.recipeDesignAgentSession
              .update({
                where: { id: sessionId },
                data: {
                  status: 'FAILED',
                  lastError:
                    (error as Error)?.message?.slice(0, 500) ??
                    '下一阶段启动失败',
                  endedAt: new Date(),
                },
              })
              .catch(() => undefined);
          });
        }
      });
  }

  private async run(
    sessionId: string,
    draftId: string,
    actor: RecipeAgentActor,
    message: string,
    flow: RecipeDesignFlow,
    phase: AgentPhase,
  ): Promise<void> {
    const startedAt = Date.now();
    // 用户明确要求重新选材：确定性回到选材，不依赖模型是否调用工具。
    if (phase !== 'PLAN' && /重新打开选材|回到选材|重新选材/.test(message)) {
      await this.prisma.recipeDesignAgentSession.update({
        where: { id: sessionId },
        data: {
          phase: 'SELECT',
          selection: Prisma.DbNull,
          selectionConfirmedAt: null,
          status: 'WAITING_USER',
          endedAt: new Date(),
        },
      });
      await this.appendMessage(
        sessionId,
        'ASSISTANT',
        '已回到选材阶段；正在重新生成食材清单，请稍候确认。',
      );
      // 当前 run 还占着 active；登记续跑，等 finally 释放后自动进入选材。
      this.pendingStageStart.set(draftId, {
        actor,
        message:
          '已按用户要求回到选材阶段。请按已确认方案重新列食材，用 propose_selection 提交；不要列补剂。',
      });
      await this.markWaiting(sessionId);
      return;
    }
    const config = await this.resolveConfig(flow);
    const port = new RecipeDraftPort(
      this.designer,
      this.accessFor(actor),
      draftId,
    );
    const catalog = new RecipeCatalogPort(this.prisma);
    // 阶段白名单：PLAN/SELECT 阶段写工具根本不出现在模型面前。
    const tools = toolsForPhase(phase, flow);

    let messages = await this.buildMessages(sessionId, message, phase);
    let toolCalls = 0;
    let editsSinceAssess = 0;
    let lastGapSignature: string | null = null;
    let sameGapCount = 0;
    let lastAssessHadGaps = false;
    let thinkingFallbackDisabled = false;
    let selectionRepairAttempts = 0;
    const verifiedCitationIds = new Set<string>();
    /**
     * 每次运行的第一轮强制读设计上下文。
     *
     * 只靠提示词说“先读”不可靠；工具选择策略是接口能力，
     * 第一轮指定 read_design_context，之后恢复 auto。
     */
    let firstModelCall = true;
    /** 方案/选材阶段在预算快用完时，强制提交方案/选材。 */
    let forceProposeTool: 'propose_plan' | 'propose_selection' | null = null;
    /** 连续 0 命中到 5 次时，强制先问用户，而不是硬交方案。 */
    let forceAsk = false;
    /** 已经 0 命中的查询 key：同一条不再执行。 */
    const zeroHitQueries = new Set<string>();
    let consecutiveZeroHits = 0;
    let zeroHitNudged = false;
    /** 首次读到的本单档案，强制提交方案时作为干净上下文的一部分。 */
    let designContextJson: string | null = null;
    const planRow = await this.prisma.recipeDesignAgentSession.findUnique({
      where: { id: sessionId },
      select: { plan: true },
    });
    let currentPlan = planRow?.plan as AgentNutritionPlan | null;
    const phaseMaxToolCalls =
      phase === 'DESIGN' ? MAX_TOOL_CALLS : PHASE_TOOL_BUDGET[phase];
    /** 健康档案附件只在本次运行注入一次，避免模型重读时重复计费。 */
    let designContextImagesInjected = false;

    while (true) {
      if (this.stopped.has(sessionId)) return;
      if (Date.now() - startedAt > MAX_RUN_MS) {
        await this.fail(sessionId, '超过运行时长上限');
        return;
      }

      // 调模型前先检查工具消息顺序：assistant(tool_calls) 后必须紧跟全部 tool 消息。
      // 图片消息一律排在本轮所有 tool 消息之后，否则供应商会直接判 400。
      const orderViolation = findToolMessageOrderViolation(messages);
      if (orderViolation) {
        await this.fail(sessionId, `消息顺序错误：${orderViolation}`);
        return;
      }

      const isFirstModelCall = firstModelCall;
      let forcedTool = isFirstModelCall
        ? 'read_design_context'
        : forceAsk
          ? 'ask'
          : forceProposeTool;
      // 防止盲改：连续改配方 20 次还没评估，先强制跑一次评估。
      if (
        !forcedTool &&
        phase === 'DESIGN' &&
        editsSinceAssess >= MAX_EDITS_BETWEEN_ASSESS
      ) {
        forcedTool = 'assess';
      }
      // 强制工具选择时先不开思考：首轮 read_design_context / 强制评估都是
      // 机械动作，不需要推理，也能绕开“thinking + tool_choice”不兼容的网关。
      const thinkingEnabled =
        !thinkingFallbackDisabled &&
        !forcedTool &&
        shouldEnableThinking(
          phase,
          toolCalls,
          lastAssessHadGaps,
          editsSinceAssess,
        );
      const callModel = (forcedTool: string | null) =>
        callDeepSeekTools({
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: config.apiKey,
          requestTimeoutMs: thinkingEnabled
            ? Math.max(config.requestTimeoutMs, 300_000)
            : config.requestTimeoutMs,
          messages,
          tools,
          thinking: thinkingEnabled ? 'enabled' : 'disabled',
          toolChoice: forcedTool
            ? { type: 'function', function: { name: forcedTool } }
            : 'auto',
        });
      let response: DeepSeekToolsResult;
      try {
        response = await callModel(forcedTool);
      } catch (error) {
        if (!hasImageContent(messages)) {
          throw error;
        }
        // 不是所有模型/网关都接受 image_url content。保留页文本，
        // 去掉页图后重试一次；再失败才交给上层标记运行失败。
        this.logger.warn(
          `模型调用失败，去掉页图后重试一次：${(error as Error)?.message ?? String(error)}`,
        );
        messages = stripImageContent(messages);
        response = await callModel(forcedTool);
      }

      if (response.thinkingFallback) {
        thinkingFallbackDisabled = true;
        this.logger.warn(
          '思考模式被供应商拒绝，本次运行剩余调用已降级为关闭思考',
        );
      }

      if (forcedTool) {
        const called = (response.toolCalls ?? []).some(
          (call) => call.function.name === forcedTool,
        );
        if (!called) {
          // 强制失败：再给一次机会；仍不调用就终止。
          this.logger.warn(`未调用强制工具 ${forcedTool}，重试一次`);
          response = await callModel(forcedTool);
          const retried = (response.toolCalls ?? []).some(
            (call) => call.function.name === forcedTool,
          );
          if (!retried) {
            if (forcedTool === 'propose_plan') {
              // 历史里全是 tool_calls 时，模型会无视 tool_choice 继续调 kb_find。
              // 换一份“档案 + 证据摘录”的干净上下文，再强制一次。
              const fallback = await this.callPlanSynthesis({
                sessionId,
                config,
                phase,
                userMessage: message,
                designContextJson,
                messages,
              });
              if (fallback) {
                response = fallback;
              } else {
                await this.appendMessage(
                  sessionId,
                  'ASSISTANT',
                  '方案还没整理好，我先停在这里。请回复“继续整理方案”，或指出要先查的点。',
                );
                await this.markWaiting(sessionId);
                return;
              }
            } else if (forcedTool === 'ask') {
              await this.appendMessage(
                sessionId,
                'ASSISTANT',
                '连续检索没有结果，我先停在这里。请换一个关键词、指定文档，或告诉我下一步。',
              );
              await this.markWaiting(sessionId);
              return;
            } else if (forcedTool === 'propose_selection') {
              // 与方案阶段同理：长工具历史会让模型无视 tool_choice。
              const fallback = await this.callSelectionSynthesis({
                sessionId,
                config,
                phase,
                userMessage: message,
                designContextJson,
                messages,
              });
              if (fallback) {
                response = fallback;
              } else {
                await this.appendMessage(
                  sessionId,
                  'ASSISTANT',
                  '选材还没整理好，我先停在这里。请回复“继续整理选材”，或指出要先确认的食材。',
                );
                await this.markWaiting(sessionId);
                return;
              }
            } else {
              throw new Error(`模型未调用 ${forcedTool}`);
            }
          }
        }
        if (isFirstModelCall) {
          firstModelCall = false;
        } else if (forcedTool === 'ask') {
          forceAsk = false;
        } else {
          forceProposeTool = null;
        }
      }

      await this.recordUsage(
        sessionId,
        response.usage?.promptTokens ?? 0,
        response.usage?.completionTokens ?? 0,
      );
      if (this.stopped.has(sessionId)) return;

      const calls = response.toolCalls ?? [];
      if (calls.length === 0) {
        if (response.content) {
          const finalContent = redactDrugDoses(response.content).text;
          await this.appendMessage(sessionId, 'ASSISTANT', finalContent);
        }
        await this.markWaiting(sessionId);
        return;
      }

      messages.push({
        role: 'assistant',
        content: response.content ?? null,
        tool_calls: calls,
        ...(thinkingEnabled && response.reasoningContent
          ? { reasoning_content: response.reasoningContent }
          : {}),
      });
      // 方案/选材以卡片呈现；同一轮的说明文字不再写入消息，避免和卡片重复。
      const hasCardProposal = calls.some(
        (call) =>
          call.function.name === 'propose_plan' ||
          call.function.name === 'propose_selection',
      );
      if (response.content && !hasCardProposal) {
        await this.appendMessage(sessionId, 'ASSISTANT', response.content);
      }

      // 本轮所有调用的图片先收集，等全部 tool 消息写完后统一追加。
      // 原因：assistant(tool_calls) 之后必须紧跟**全部** tool 消息；
      // 在中间插一条 user 图片消息，下一轮请求会被供应商判 400
      //（2026-11-19 线上两次实测：kb_read 与 kb_find 并行时触发）。
      const turnImages: KnowledgePageImage[] = [];
      const turnContextImages: DesignContextImage[] = [];
      /** 零命中提示/强制提问要等本轮全部 tool 消息写完再插，避免破坏协议。 */
      let pendingZeroHitNudge: string | null = null;
      let pendingForceAsk = false;
      let pendingProposeRepair: string | null = null;
      let pendingSelectionRepair: string | null = null;

      for (const call of calls) {
        if (toolCalls >= phaseMaxToolCalls) {
          await this.fail(
            sessionId,
            `超过${phase === 'PLAN' ? '方案' : phase === 'SELECT' ? '选材' : '设计'}阶段工具调用上限（${phaseMaxToolCalls}）`,
          );
          return;
        }
        // ask 的问题先攒着，等工具结果落库后再写助手消息：
        // 顺序反了会出现"执行记录有、问题没显示"（2026-11-01 实测）。
        let pendingAsk: { question: string; options: string[] } | null = null;
        const parsedArgs = safeParse(call.function.arguments);
        const findKey =
          call.function.name === 'kb_find' ? findQueryKey(parsedArgs) : null;
        let outcome: ToolOutcome;
        let images: KnowledgePageImage[] = [];
        let contextImages: DesignContextImage[] = [];

        if (findKey && zeroHitQueries.has(findKey)) {
          // 同一条查询已经 0 命中过：不再打后端，直接让模型换词。
          outcome = fail(
            'DUPLICATE_ZERO_HIT_QUERY',
            '这条查询之前 0 命中；请换更宽的词、去掉剂量/单位，或换文档，不要重复原查询。',
          );
          consecutiveZeroHits += 1;
        } else {
          const result = await this.runTool(
            port,
            catalog,
            this.knowledge,
            call,
            currentPlan,
            (question, options) => {
              pendingAsk = { question, options };
            },
          );
          outcome = result.outcome;
          images = result.images;
          contextImages = result.contextImages;
          if (
            outcome.ok &&
            (call.function.name === 'kb_find' ||
              call.function.name === 'kb_read')
          ) {
            for (const id of collectKnowledgeCitationIds(
              call.function.name,
              outcome.data,
            )) {
              verifiedCitationIds.add(id);
            }
          }
          if (call.function.name === 'assess') {
            editsSinceAssess = 0;
          } else if (call.function.name === 'edit_recipe' && outcome.ok) {
            editsSinceAssess += 1;
          }
          if (call.function.name === 'read_design_context' && outcome.ok) {
            designContextJson = JSON.stringify(outcome.data).slice(0, 20000);
          }

          if (call.function.name === 'kb_find') {
            const hits = countFindHits(outcome);
            if (findKey && hits !== null) {
              consecutiveZeroHits = nextZeroHitStreak(
                consecutiveZeroHits,
                hits,
              );
              if (hits === 0) {
                zeroHitQueries.add(findKey);
              } else {
                zeroHitNudged = false;
              }
            }
          } else if (call.function.name === 'kb_read' && outcome.ok) {
            // 读到页说明有进展，连续 0 命中计数归零。
            consecutiveZeroHits = 0;
            zeroHitNudged = false;
          }
        }
        toolCalls += 1;

        await this.recordTool(sessionId, call, outcome);

        // 设计完成：显式收口，前端显示“已完成”和上线检查结果。
        if (call.function.name === 'finish' && outcome.ok) {
          const finishData = outcome.data as {
            summary?: string;
            readiness?: { blockers?: unknown[] };
          };
          const blockerCount = Array.isArray(finishData.readiness?.blockers)
            ? finishData.readiness!.blockers!.length
            : 0;
          await this.prisma.recipeDesignAgentSession.update({
            where: { id: sessionId },
            data: {
              status: 'COMPLETED',
              endedAt: new Date(),
              lastError: null,
            },
          });
          await this.appendMessage(
            sessionId,
            'ASSISTANT',
            `设计完成：${finishData.summary ?? '已完成'}。${
              blockerCount > 0
                ? `上线检查还有 ${blockerCount} 项阻断，请打开上线检查处理。`
                : '可以打开上线检查交付。'
            }`,
          );
          return;
        }

        if (
          (call.function.name === 'propose_plan' ||
            call.function.name === 'propose_selection') &&
          !outcome.ok
        ) {
          pendingProposeRepair =
            `${call.function.name} 校验失败：只修正被指出的字段/约束，其余保持不变；` +
            '无法确定的约束删掉，或给一个大致边界并在 basis 写「待确认」。不要重新检索。';
        }

        // 用户明确要求重新选材：方案不变，回到选材阶段。
        if (call.function.name === 'reopen_selection' && outcome.ok) {
          await this.prisma.recipeDesignAgentSession.update({
            where: { id: sessionId },
            data: {
              phase: 'SELECT',
              selection: Prisma.DbNull,
              selectionConfirmedAt: null,
              status: 'WAITING_USER',
              endedAt: new Date(),
            },
          });
          await this.appendMessage(
            sessionId,
            'ASSISTANT',
            '已回到选材阶段；正在重新生成食材清单，请稍候确认。',
          );
          // 当前 run 还占着 active；登记续跑，等 finally 释放后自动进入选材。
          this.pendingStageStart.set(draftId, {
            actor,
            message:
              '已按用户要求回到选材阶段。请按已确认方案重新列食材，用 propose_selection 提交；不要列补剂。',
          });
          await this.markWaiting(sessionId);
          return;
        }

        // 用户明确要求修改已确认方案：写回新方案，但不自行确认、不清空选材。
        if (call.function.name === 'revise_plan' && outcome.ok) {
          currentPlan = outcome.data as AgentNutritionPlan;
          await this.prisma.recipeDesignAgentSession.update({
            where: { id: sessionId },
            data: {
              ...planRevisionUpdate(currentPlan),
              citationAudit: auditPlanCitations(
                currentPlan,
                verifiedCitationIds,
              ) as never,
            },
          });
          await this.appendMessage(
            sessionId,
            'ASSISTANT',
            '方案已按你的要求更新；请点“重新确认方案”，确认后继续核对现有选材/配方。',
          );
          await this.markWaiting(sessionId);
          return;
        }

        // 方案/选材提交：落库 + 暂停等用户确认。
        if (call.function.name === 'propose_plan' && outcome.ok) {
          const plan = outcome.data as AgentNutritionPlan;
          const citationAudit = auditPlanCitations(
            plan,
            verifiedCitationIds,
          );
          await this.prisma.recipeDesignAgentSession.update({
            where: { id: sessionId },
            data: {
              plan: plan as never,
              citationAudit: citationAudit as never,
              status: 'WAITING_USER',
              endedAt: new Date(),
            },
          });
          return;
        }
        if (call.function.name === 'propose_selection' && outcome.ok) {
          const selection = outcome.data as AgentSelection;
          // 阶段推进只认人工 confirmSelection；模型传的 confirmed 只作为提示，不改变阶段。
          await this.prisma.recipeDesignAgentSession.update({
            where: { id: sessionId },
            data: selectionSubmissionUpdate(selection),
          });
          const unavailable = selection.items.filter(
            (item) => item.dataStatus !== 'AVAILABLE',
          );
          if (unavailable.length > 0 && selectionRepairAttempts < 2) {
            selectionRepairAttempts += 1;
            pendingSelectionRepair =
              `选材清单里有 ${unavailable.length} 项未匹配或档案不全：` +
              `${unavailable.map((item) => `${item.name}（${item.dataStatus}）`).join('、')}。` +
              '请用 match_food_name 结合你的知识判断同物异名/标准名（例如鲭鱼/青花鱼、马铃薯/土豆），' +
              '确认后用库内标准名再次提交 propose_selection；不要用其他食材替代，也不要因为营养值改食材。' +
              '确实没有就保留 MISSING 并明确告诉用户。';
            continue;
          }
          return;
        }

        if (call.function.name === 'propose_supplement' && outcome.ok) {
          await this.prisma.recipeDesignAgentSession.update({
            where: { id: sessionId },
            data: {
              supplementProposal: outcome.data as never,
              status: 'WAITING_USER',
              endedAt: new Date(),
            },
          });
          return;
        }

        // 读不到档案就不要在没有约束的情况下继续设计。
        if (call.function.name === 'read_design_context' && !outcome.ok) {
          await this.fail(
            sessionId,
            `读取本单设计上下文失败：${outcome.error?.message ?? '未知错误'}`,
          );
          return;
        }

        if (call.function.name === 'assess') {
          const signature = assessmentGapSignature(outcome);
          lastAssessHadGaps = Boolean(
            signature && signature !== 'compliant',
          );
          if (signature === 'compliant') {
            lastGapSignature = null;
            sameGapCount = 0;
          } else if (signature) {
            if (signature === lastGapSignature) {
              sameGapCount += 1;
            } else {
              lastGapSignature = signature;
              sameGapCount = 1;
            }
            if (sameGapCount >= MAX_NO_PROGRESS_ASSESSMENTS) {
              const gaps = Array.isArray((outcome as any)?.data?.gaps)
                ? (outcome as any).data.gaps
                : [];
              const gapText = gaps
                .slice(0, 5)
                .map((gap: any) => {
                  const value =
                    gap.value === null || gap.value === undefined
                      ? '?'
                      : Number(gap.value).toFixed(2);
                  return `${gap.label ?? gap.key} ${value}${gap.unit ?? ''}（目标 ${gap.min ?? '?'}–${gap.max ?? '?'}${gap.unit ?? ''}）`;
                })
                .join('；');
              await this.appendMessage(
                sessionId,
                'ASSISTANT',
                `连续 ${MAX_NO_PROGRESS_ASSESSMENTS} 次评估没有实质进展，我先停止，避免继续空转。当前缺口：${gapText || '见评估结果'}。请把这份缺口和已经试过的调整交给营养师/用户确认，不要继续盲试。`,
              );
              await this.fail(sessionId, '连续3次评估无实质进展');
              return;
            }
          } else {
            lastGapSignature = null;
            sameGapCount = 0;
          }
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(outcome),
        });

        if (images.length > 0) {
          turnImages.push(...images);
        }
        if (contextImages.length > 0) {
          turnContextImages.push(...contextImages);
        }

        if (pendingAsk) {
          await this.appendMessage(
            sessionId,
            'ASSISTANT',
            formatAsk(pendingAsk),
          );
          await this.markWaiting(sessionId);
          return;
        }

        if (
          call.function.name === 'kb_find' &&
          consecutiveZeroHits >= 3 &&
          !zeroHitNudged
        ) {
          pendingZeroHitNudge =
            '连续 3 次检索 0 命中：换更宽的词、去掉剂量/单位，或换文档；不要重复原查询。';
          zeroHitNudged = true;
        }
        if (
          consecutiveZeroHits >= 5 &&
          (phase === 'PLAN' || phase === 'SELECT')
        ) {
          pendingZeroHitNudge =
            '连续 5 次检索 0 命中：请把已经查到的内容和缺口告诉用户，并询问下一步；不要编造。';
          pendingForceAsk = true;
          consecutiveZeroHits = 0;
        }

        const nextForce = forceProposeToolFor(phase, toolCalls);
        if (nextForce) {
          forceProposeTool = nextForce;
        }
      }

      // 全部 tool 消息写完后，再追加零命中提示/图片消息。
      if (pendingZeroHitNudge) {
        messages.push({ role: 'system', content: pendingZeroHitNudge });
      }
      if (pendingProposeRepair) {
        messages.push({ role: 'system', content: pendingProposeRepair });
      }
      if (pendingSelectionRepair) {
        messages.push({ role: 'system', content: pendingSelectionRepair });
      }
      if (pendingForceAsk) {
        forceAsk = true;
      }
      if (turnImages.length > 0) {
        messages.push(
          buildKnowledgeImageMessage(dedupeKnowledgeImages(turnImages)),
        );
      }
      if (turnContextImages.length > 0 && !designContextImagesInjected) {
        const uniqueContextImages = [
          ...new Map(
            turnContextImages.map((image) => [image.url, image]),
          ).values(),
        ];
        messages.push(buildDesignContextImageMessage(uniqueContextImages));
        designContextImagesInjected = true;
        this.logger.log(
          `注入本单健康档案附件 ${uniqueContextImages.length} 张`,
        );
      }
    }
  }

  /**
   * 强制提交方案失败时的兜底：用“档案 + 证据摘录 + 只给 propose_plan”的
   * 干净上下文再要一次。历史里全是 tool_calls 时，模型会无视 tool_choice。
   */
  private async callPlanSynthesis(input: {
    sessionId: string;
    config: {
      baseUrl: string;
      model: string;
      apiKey: string;
      requestTimeoutMs: number;
    };
    phase: AgentPhase;
    userMessage: string;
    designContextJson: string | null;
    messages: DeepSeekToolsMessage[];
  }): Promise<DeepSeekToolsResult | null> {
    try {
      const response = await callDeepSeekTools({
        baseUrl: input.config.baseUrl,
        model: input.config.model,
        apiKey: input.config.apiKey,
        requestTimeoutMs: input.config.requestTimeoutMs,
        messages: buildPlanSynthesisMessages({
          systemPrompt: buildSystemPrompt(),
          phaseLine: phaseSystemLine(input.phase),
          userMessage: input.userMessage,
          designContextJson: input.designContextJson,
          evidenceDigest: buildEvidenceDigest(input.messages),
        }),
        tools: [PROPOSE_PLAN_TOOL],
        toolChoice: {
          type: 'function',
          function: { name: 'propose_plan' },
        },
        thinking: 'disabled',
        temperature: 0.2,
      });
      await this.recordUsage(
        input.sessionId,
        response.usage?.promptTokens ?? 0,
        response.usage?.completionTokens ?? 0,
      );
      const called = (response.toolCalls ?? []).some(
        (call) => call.function.name === 'propose_plan',
      );
      if (!called) {
        this.logger.warn('方案合成兜底仍未调用 propose_plan');
        return null;
      }
      return response;
    } catch (error) {
      this.logger.warn(
        `方案合成兜底失败：${(error as Error)?.message ?? String(error)}`,
      );
      return null;
    }
  }

  /**
   * 强制提交选材失败时的兜底：用“已确认方案 + 档案 + find_food 候选摘录”
   * 的干净上下文，只给 propose_selection，避免模型继续检索。
   */
  private async callSelectionSynthesis(input: {
    sessionId: string;
    config: {
      baseUrl: string;
      model: string;
      apiKey: string;
      requestTimeoutMs: number;
    };
    phase: AgentPhase;
    userMessage: string;
    designContextJson: string | null;
    messages: DeepSeekToolsMessage[];
  }): Promise<DeepSeekToolsResult | null> {
    try {
      const session = await this.prisma.recipeDesignAgentSession.findUnique({
        where: { id: input.sessionId },
        select: { plan: true },
      });
      if (!session?.plan) return null;
      const response = await callDeepSeekTools({
        baseUrl: input.config.baseUrl,
        model: input.config.model,
        apiKey: input.config.apiKey,
        requestTimeoutMs: input.config.requestTimeoutMs,
        messages: buildSelectionSynthesisMessages({
          systemPrompt: buildSystemPrompt(),
          phaseLine: phaseSystemLine(input.phase),
          userMessage: input.userMessage,
          planJson: JSON.stringify(session.plan),
          designContextJson: input.designContextJson,
          candidateDigest: buildFoodCandidateDigest(input.messages),
        }),
        tools: [PROPOSE_SELECTION_TOOL],
        toolChoice: {
          type: 'function',
          function: { name: 'propose_selection' },
        },
        thinking: 'disabled',
        temperature: 0.2,
      });
      await this.recordUsage(
        input.sessionId,
        response.usage?.promptTokens ?? 0,
        response.usage?.completionTokens ?? 0,
      );
      const called = (response.toolCalls ?? []).some(
        (call) => call.function.name === 'propose_selection',
      );
      if (!called) {
        this.logger.warn('选材合成兜底仍未调用 propose_selection');
        return null;
      }
      return response;
    } catch (error) {
      this.logger.warn(
        `选材合成兜底失败：${(error as Error)?.message ?? String(error)}`,
      );
      return null;
    }
  }

  private async runTool(
    port: RecipeDraftPort,
    catalog: RecipeCatalogPort,
    knowledge: KnowledgeGatewayService,
    call: DeepSeekToolCall,
    plan: AgentNutritionPlan | null,
    onAsk: (question: string, options: string[]) => void,
  ): Promise<{
    outcome: ToolOutcome;
    images: KnowledgePageImage[];
    contextImages: DesignContextImage[];
  }> {
    let args: unknown = {};
    try {
      args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      args = {};
    }
    const outcome = await executeTool(call.function.name, args, {
      port,
      catalog,
      knowledge,
      plan,
      onAsk: (question: string, options: string[]) => onAsk(question, options),
    });
    const readSplit = splitReadImages(call.function.name, outcome);
    const contextSplit = splitDesignContextImages(
      call.function.name,
      readSplit.outcome,
    );
    return {
      outcome: contextSplit.outcome,
      images: readSplit.images,
      contextImages: contextSplit.images,
    };
  }

  /**
   * 组装上下文：
   *   系统提示词（角色、边界、硬约束）
   *   最近的历史（只含用户与助手，不含工具结果）
   *   本轮用户输入
   *
   * 2026-11-19：去掉“本份食谱的目的”置顶与第三段流程说明。
   * 目的不该由第一句话钉死，改由首轮 read_design_context + 对话确认；
   * 流程规则合并进系统提示词。
   */
  private async buildMessages(
    sessionId: string,
    currentMessage: string,
    phase: AgentPhase,
  ): Promise<DeepSeekToolsMessage[]> {
    const rows = await this.prisma.recipeDesignAgentMessage.findMany({
      where: { sessionId, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { seq: 'asc' },
    });

    // 普通输入的最后一条 USER 就是本轮输入，不重复放进历史；
    // 阶段确认后的 silent 续跑没有写 USER，历史要完整保留。
    const lastRow = rows[rows.length - 1];
    const historyRows =
      lastRow?.role === 'USER' && lastRow.content === currentMessage
        ? rows.slice(0, -1).slice(-HISTORY_MESSAGES)
        : rows.slice(-HISTORY_MESSAGES);

    const messages: DeepSeekToolsMessage[] = [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'system', content: phaseSystemLine(phase) },
    ];
    const skill = loadSkillsForPhase(phase);
    if (skill) {
      messages.push({ role: 'system', content: skill });
    }
    const sessionState = await this.prisma.recipeDesignAgentSession.findUnique({
      where: { id: sessionId },
      select: {
        plan: true,
        planConfirmedAt: true,
        selection: true,
        selectionConfirmedAt: true,
        supplementProposal: true,
      },
    });
    messages.push(
      ...buildSessionStateMessages({
        plan: (sessionState?.plan as unknown as AgentNutritionPlan) ?? null,
        planConfirmedAt: sessionState?.planConfirmedAt ?? null,
        selection: (sessionState?.selection as unknown as AgentSelection) ?? null,
        selectionConfirmedAt: sessionState?.selectionConfirmedAt ?? null,
        supplementProposal:
          (sessionState?.supplementProposal as unknown as AgentSupplementProposal) ??
          null,
      }),
    );
    for (const row of historyRows) {
      messages.push({
        role: row.role === 'USER' ? 'user' : 'assistant',
        content: row.content ?? '',
      });
    }
    messages.push({ role: 'user', content: currentMessage });
    return messages;
  }

  private async appendMessage(
    sessionId: string,
    role: 'USER' | 'ASSISTANT' | 'TOOL',
    content: string,
    extra?: { toolName?: string; toolArgs?: unknown; toolResult?: unknown },
  ): Promise<void> {
    const count = await this.prisma.recipeDesignAgentMessage.count({
      where: { sessionId },
    });
    await this.prisma.recipeDesignAgentMessage.create({
      data: {
        sessionId,
        seq: count + 1,
        role,
        content,
        toolName: extra?.toolName ?? null,
        toolArgs: (extra?.toolArgs ?? null) as never,
        toolResult: (extra?.toolResult ?? null) as never,
      },
    });
  }

  private async recordTool(
    sessionId: string,
    call: DeepSeekToolCall,
    result: unknown,
  ): Promise<void> {
    const parsedArgs = safeParse(call.function.arguments);
    await this.appendMessage(sessionId, 'TOOL', JSON.stringify(result), {
      toolName: call.function.name,
      toolArgs: parsedArgs,
      toolResult: result,
    });
    await this.prisma.recipeDesignAgentSession.update({
      where: { id: sessionId },
      data: { stepCount: { increment: 1 } },
    });
  }

  private async recordUsage(
    sessionId: string,
    promptTokens: number,
    completionTokens: number,
  ): Promise<void> {
    if (promptTokens === 0 && completionTokens === 0) return;
    await this.prisma.recipeDesignAgentSession.update({
      where: { id: sessionId },
      data: {
        promptTokens: { increment: promptTokens },
        completionTokens: { increment: completionTokens },
      },
    });
  }

  private async markWaiting(sessionId: string): Promise<void> {
    await this.prisma.recipeDesignAgentSession.updateMany({
      where: { id: sessionId, status: 'RUNNING' },
      data: { status: 'WAITING_USER', endedAt: new Date() },
    });
  }

  private async fail(sessionId: string, reason: string): Promise<void> {
    await this.prisma.recipeDesignAgentSession
      .update({
        where: { id: sessionId },
        data: { status: 'FAILED', lastError: reason, endedAt: new Date() },
      })
      .catch(() => undefined);
  }

  /**
   * 按流程取模型配置：先本流程（产品线 / 订单），再共享键 RECIPE_DESIGN。
   *
   * 刻意**不回退到系统默认 DEFAULT** —— 食谱设计必须有自己的一行配置，
   * 否则就是用健康识别或某个不相干的模型在设计食谱。
   */
  private async resolveConfig(flow: RecipeDesignFlow) {
    const purposes = recipeDesignPurposesForFlow(flow);
    let lastError: unknown = null;
    for (const purpose of purposes) {
      try {
        return await this.providerConfig.getEnabledDeepSeekRuntimeConfig({
          purpose,
          fallbackToDefault: false,
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw new BadRequestException(
      `AI 食谱设计（${flow === 'ORDER' ? '定制订单' : '产品线'}）还没有配置模型：` +
        `请在后台「AI 配置」里配置 ${purposes[0]}。` +
        `（原始错误：${(lastError as Error)?.message ?? '未配置'}）`,
    );
  }
}

/**
 * 同一轮里可能并行读同一页两次；按锚点/页码去重，避免重复注入同一张图。
 */
/**
 * 思考模式的“阶段/决策点”开关（不是随机百分比）。
 *
 * - PLAN：一定开，方案取舍最需要推理；
 * - SELECT：关，方案已定，主要是按约束列清单；
 * - DESIGN：第一轮/刚拿到评估缺口/连续改多次时开，机械工具调用时关。
 * - RECIPE_AGENT_THINKING=off 可整体关闭。
 */
export function shouldEnableThinking(
  phase: AgentPhase,
  toolCalls: number,
  lastAssessHadGaps: boolean,
  editsSinceAssess: number,
): boolean {
  const mode = (process.env.RECIPE_AGENT_THINKING ?? 'stage')
    .trim()
    .toLowerCase();
  if (mode === 'off') return false;
  if (phase === 'PLAN') return true;
  if (phase === 'SELECT') return false;
  if (phase !== 'DESIGN') return false;
  return toolCalls <= 1 || lastAssessHadGaps || editsSinceAssess >= 8;
}

function dedupeKnowledgeImages(
  images: KnowledgePageImage[],
): KnowledgePageImage[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = image.anchor || `p${image.pageNo}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatAsk(ask: { question: string; options: string[] }): string {
  if (ask.options.length === 0) return ask.question;
  return `${ask.question}\n\n${ask.options
    .map((option, index) => `${index + 1}. ${option}`)
    .join('\n')}`;
}

function safeParse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
