/**
 * 报销审核 Agent（2026-11-04 阶段 E）。
 *
 * 规则负责判定，模型只负责把结论写成一句人话。
 * 结果落库可追溯；管理员看到的是「建议」，最终决定仍由人点。
 */

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  AgentProviderConfigService,
  PURCHASE_REIMBURSEMENT_AGENT_PURPOSE,
} from '../nutrition-governance/agent-provider-config.service';
import type { DeepSeekChatOptions } from '../recipe-designer/deepseek-chat';
import {
  buildFallbackSummary,
  evaluateReimbursement,
  type ReviewClaimInput,
} from './reimbursement-review.rules';

/** 与采购截图识别共用「采购报销 Agent」配置 */
export const REIMBURSEMENT_REVIEW_PURPOSE =
  PURCHASE_REIMBURSEMENT_AGENT_PURPOSE;
export const REIMBURSEMENT_REVIEW_MODEL = Symbol('REIMBURSEMENT_REVIEW_MODEL');
export const REIMBURSEMENT_REVIEW_PROMPT_VERSION = '2026-11-04.1';

export interface ReimbursementReviewModelPort {
  callDeepSeekJson(
    options: DeepSeekChatOptions,
  ): Promise<Record<string, unknown>>;
}

const SYSTEM_PROMPT = `你是报销审核助手。用户会给你一张报销单的规则校验结果。
请只根据给定事实写两段中文，输出 JSON：
{"summary":"一句话说明本单最需要人工关注的点","advice":"给管理员的一句操作建议"}
要求：
1. 不要编造没有出现的事实；没有异常就直说未发现明显异常。
2. 不要做最终结论（通过/驳回由人决定）。
3. 每条不超过 60 个字。`;

@Injectable()
export class ReimbursementReviewService {
  private readonly logger = new Logger(ReimbursementReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentConfig: AgentProviderConfigService,
    @Inject(REIMBURSEMENT_REVIEW_MODEL)
    private readonly model: ReimbursementReviewModelPort,
  ) {}

  async latest(reimbursementId: string): Promise<any | null> {
    const [row, claim] = await Promise.all([
      this.prisma.reimbursementReview.findFirst({
        where: { reimbursementId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.reimbursement.findUnique({
        where: { id: reimbursementId },
        select: { updatedAt: true },
      }),
    ]);
    if (!row) return null;
    // 报销单在建议之后被改过（例如员工重新提交），旧建议不再展示。
    if (claim?.updatedAt) {
      const basis =
        row.claimUpdatedAt instanceof Date
          ? row.claimUpdatedAt
          : row.createdAt;
      if (basis.getTime() < claim.updatedAt.getTime() - 1000) {
        return null;
      }
    }
    return this.toView(row);
  }

  async generate(reimbursementId: string, userId?: string): Promise<any> {
    const claim = await this.prisma.reimbursement.findUnique({
      where: { id: reimbursementId },
      select: { status: true, updatedAt: true },
    });
    if (!claim) {
      throw new BadRequestException('报销单不存在');
    }
    if (claim.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('只有待报销的单据可以生成审核建议');
    }

    // 60 秒内重复点「生成」直接复用，避免多标签页重复调用模型。
    const recent = await this.prisma.reimbursementReview.findFirst({
      where: {
        reimbursementId,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const basis =
        recent.claimUpdatedAt instanceof Date
          ? recent.claimUpdatedAt
          : recent.createdAt;
      // 重新提交后 claim.updatedAt 会变新；这时不能复用 60 秒内的旧建议。
      if (basis.getTime() >= claim.updatedAt.getTime() - 1000) {
        return this.toView(recent);
      }
    }

    const input = await this.buildInput(reimbursementId);
    const evaluation = evaluateReimbursement(input);

    let summary = buildFallbackSummary(evaluation);
    let advice: string | null = null;
    let modelName: string | null = null;

    try {
      const runtime = await this.agentConfig.getEnabledDeepSeekRuntimeConfig({
        purpose: REIMBURSEMENT_REVIEW_PURPOSE,
        fallbackToDefault: true,
      });
      const raw = await this.model.callDeepSeekJson({
        baseUrl: runtime.baseUrl,
        model: runtime.model,
        apiKey: runtime.apiKey,
        requestTimeoutMs: Math.min(runtime.requestTimeoutMs, 20000),
        systemPrompt: SYSTEM_PROMPT,
        userPayload: {
          claimNumber: input.claimNumber,
          totalActualCost: input.totalActualCost,
          voucherAmount: input.voucherAmount,
          differenceAmount: input.differenceAmount,
          findings: evaluation.findings,
          stats: evaluation.stats,
        },
        temperature: 0.2,
        maxTokens: 600,
        extraBody: { thinking: { type: 'disabled' } },
      });
      let modelSummary = sanitizeModelText(raw.summary);
      let modelAdvice = sanitizeModelText(raw.advice);
      // 规则判高风险时，不接受“建议通过/没问题”这类结论性话术。
      const riskyClaimWords = /通过|可以报|没问题|无异常/;
      if (
        evaluation.riskLevel === 'HIGH' &&
        modelAdvice &&
        riskyClaimWords.test(modelAdvice)
      ) {
        modelAdvice = null;
      }
      if (
        evaluation.riskLevel === 'HIGH' &&
        modelSummary &&
        riskyClaimWords.test(modelSummary)
      ) {
        modelSummary = null;
      }
      if (modelSummary) summary = modelSummary;
      if (modelAdvice) advice = modelAdvice;
      modelName = runtime.model;
    } catch (error: any) {
      // 模型不可用不影响审核：规则结论已经在 findings 里。
      this.logger.warn(
        `Reimbursement review model failed, fallback to rules: ${error?.message}`,
      );
    }

    const saved = await this.prisma.reimbursementReview.create({
      data: {
        reimbursementId,
        riskLevel: evaluation.riskLevel,
        claimUpdatedAt: claim.updatedAt,
        findings: JSON.parse(JSON.stringify(evaluation.findings)),
        summary,
        advice,
        model: modelName,
        promptVersion: REIMBURSEMENT_REVIEW_PROMPT_VERSION,
        createdById: userId ?? null,
      },
    });

    return {
      ...this.toView(saved),
      stats: evaluation.stats,
    };
  }

  private async buildInput(
    reimbursementId: string,
  ): Promise<ReviewClaimInput> {
    const claim = await this.prisma.reimbursement.findUnique({
      where: { id: reimbursementId },
      include: {
        purchaseLists: {
          include: { records: true },
        },
      },
    });
    if (!claim) {
      throw new Error('报销单不存在');
    }

    const listIds = claim.purchaseLists.map((list) => list.id);
    const imports = listIds.length
      ? await this.prisma.purchaseOrderImport.findMany({
          where: { purchaseListId: { in: listIds }, status: 'CONFIRMED' },
          include: { lines: true },
        })
      : [];

    const records = claim.purchaseLists.flatMap((list) =>
      list.records.map((record) => ({
        id: record.id,
        ingredientName: record.ingredientName,
        procurementSkuName: record.procurementSkuName,
        actualCost: Number(record.actualCost),
        hasSourceImport: Boolean(record.sourceImportId),
      })),
    );

    return {
      claimNumber: claim.claimNumber,
      totalActualCost: Number(claim.totalActualCost),
      voucherAmount:
        claim.voucherAmount === null ? null : Number(claim.voucherAmount),
      differenceAmount:
        claim.differenceAmount === null
          ? null
          : Number(claim.differenceAmount),
      differenceNote: claim.differenceNote ?? null,
      receiptCount:
        (claim.receiptUrls?.length || 0) + (claim.receiptKeys?.length || 0),
      hasPaymentProof: (claim.paymentProofUrls?.length || 0) > 0,
      records,
      imports: imports.map((item) => {
        const rawItems = Array.isArray((item.rawResult as any)?.items)
          ? ((item.rawResult as any).items as any[])
          : [];
        let matchEditedLines = 0;
        let amountEditedLines = 0;
        let maxAmountDelta = 0;
        for (const line of item.lines) {
          if (!line.editedByUser) continue;
          const rawAiAmount =
            rawItems[line.lineNo - 1]?.lineTotal ??
            rawItems[line.lineNo - 1]?.total;
          // 模型允许返回 null：必须当作“没有基准”，不能 Number(null)=0。
          const aiAmount =
            rawAiAmount === null || rawAiAmount === undefined || rawAiAmount === ''
              ? NaN
              : Number(rawAiAmount);
          const currentAmount =
            line.lineTotal === null || line.lineTotal === undefined
              ? NaN
              : Number(line.lineTotal);
          if (!Number.isFinite(currentAmount)) {
            // 员工把金额清空了：算金额改动（确认时会被拦），不能说成“金额没动”。
            amountEditedLines += 1;
          } else if (!Number.isFinite(aiAmount)) {
            // 模型当时没读出金额，员工补填：算金额改动，但没有基准差额，不据此升高风险。
            amountEditedLines += 1;
          } else if (Math.abs(currentAmount - aiAmount) > 0.011) {
            amountEditedLines += 1;
            maxAmountDelta = Math.max(
              maxAmountDelta,
              Math.abs(currentAmount - aiAmount),
            );
          } else {
            matchEditedLines += 1;
          }
        }

        return {
          channel: item.channel,
          orderNo: item.orderNo,
          incomplete: item.incomplete,
          personalAmount: item.lines
            .filter((line) => line.isPersonal)
            .reduce((sum, line) => sum + Number(line.lineTotal ?? 0), 0),
          matchEditedLines,
          amountEditedLines,
          maxAmountDelta: Math.round(maxAmountDelta * 100) / 100,
        };
      }),
      listKinds: claim.purchaseLists.map((list) => list.kind),
    };
  }

  private toView(row: any): any {
    return {
      id: row.id,
      reimbursementId: row.reimbursementId,
      riskLevel: row.riskLevel,
      findings: row.findings,
      summary: row.summary,
      advice: row.advice,
      model: row.model,
      claimUpdatedAt: row.claimUpdatedAt ?? null,
      createdAt: row.createdAt,
    };
  }
}


function sanitizeModelText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}
