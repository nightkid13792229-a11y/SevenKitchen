/**
 * 食谱 AI Agent 审批的持久化服务（P0b Task 4）。
 *
 * 依据 `docs/superpowers/specs/2026-10-24-ai-recipe-design-agent-design.md`
 * 第 4.3 节「例外与缺类确认」：
 *
 * - 达标例外只有管理员能批；营养师可发起；理由必填。
 * - 缺类确认由设计者确认即可，不算达标例外。
 * - 审批状态落库，不由模型传入；模型只能发起，不能自己把例外设成已批准。
 *
 * 这里只负责记录，管理员权限在 controller / guard 层校验。
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RecipeDesignAgentApproval } from '@prisma/client';
import { REQUIRED_FOOD_CATEGORIES } from '../../../domain/recipe-designer/food-category-map';
import type { RequiredFoodCategory } from '../../../domain/recipe-designer/food-category-map';
import { PrismaService } from '../../../infrastructure/prisma.service';

export type AgentApprovalType = 'COMPLIANCE_EXCEPTION' | 'CATEGORY_OMISSION';
export type AgentApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AgentApprovalState {
  approvedException: boolean;
  confirmedOmissions: RequiredFoodCategory[];
}

export interface AgentApprovalRecord {
  id: string;
  sessionId: string;
  type: AgentApprovalType;
  status: AgentApprovalStatus;
  reason: string;
  detail: unknown;
  requestedAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
}

const MAX_REASON_LENGTH = 500;

const REQUIRED_CATEGORY_SET: ReadonlySet<string> = new Set(
  REQUIRED_FOOD_CATEGORIES,
);

const isRequiredFoodCategory = (
  value: string,
): value is RequiredFoodCategory => REQUIRED_CATEGORY_SET.has(value);

@Injectable()
export class RecipeAgentApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  async request(input: {
    sessionId: string;
    type: AgentApprovalType;
    reason: string;
    detail?: unknown;
  }): Promise<AgentApprovalRecord> {
    if (
      input.type !== 'COMPLIANCE_EXCEPTION' &&
      input.type !== 'CATEGORY_OMISSION'
    ) {
      throw new BadRequestException('审批类型只能是达标例外或缺类确认');
    }

    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason) {
      throw new BadRequestException('审批理由不能为空');
    }
    if (reason.length > MAX_REASON_LENGTH) {
      throw new BadRequestException(
        `审批理由不能超过 ${MAX_REASON_LENGTH} 字`,
      );
    }

    // 缺类确认只存规范化后的基础类别；达标例外的 detail 原样存。
    const detail =
      input.type === 'CATEGORY_OMISSION'
        ? this.normalizeOmissionDetail(input.detail)
        : input.detail;

    const approval = await this.prisma.recipeDesignAgentApproval.create({
      data: {
        sessionId: input.sessionId,
        type: input.type,
        status: 'PENDING',
        reason,
        detail: this.toJsonInput(detail),
      },
    });

    return this.toApprovalRecord(approval);
  }

  async decide(
    approvalId: string,
    input: { status: 'APPROVED' | 'REJECTED'; decidedBy: string },
  ): Promise<AgentApprovalRecord> {
    if (input.status !== 'APPROVED' && input.status !== 'REJECTED') {
      throw new BadRequestException('审批结果只能是 APPROVED 或 REJECTED');
    }

    const decidedBy =
      typeof input.decidedBy === 'string' ? input.decidedBy.trim() : '';
    if (!decidedBy) {
      throw new BadRequestException('审批人不能为空');
    }

    const existing = await this.prisma.recipeDesignAgentApproval.findUnique({
      where: { id: approvalId },
    });
    if (!existing) {
      throw new NotFoundException('审批不存在');
    }
    if (existing.status !== 'PENDING') {
      throw new ConflictException('这条审批已经处理过了');
    }

    const result = await this.prisma.recipeDesignAgentApproval.updateMany({
      where: { id: approvalId, status: 'PENDING' },
      data: {
        status: input.status,
        decidedAt: new Date(),
        decidedBy,
      },
    });
    if (result.count === 0) {
      const latest = await this.prisma.recipeDesignAgentApproval.findUnique({
        where: { id: approvalId },
      });
      if (!latest) {
        throw new NotFoundException('审批不存在');
      }
      throw new ConflictException('这条审批已经处理过了');
    }

    const updated = await this.prisma.recipeDesignAgentApproval.findUnique({
      where: { id: approvalId },
    });
    return this.toApprovalRecord(updated!);
  }

  async getApprovalState(sessionId: string): Promise<AgentApprovalState> {
    const approvals = await this.prisma.recipeDesignAgentApproval.findMany({
      where: { sessionId, status: 'APPROVED' },
    });

    let approvedException = false;
    const omissions = new Set<RequiredFoodCategory>();

    for (const approval of approvals ?? []) {
      // 查询已经带了 status 条件，这里再拦一次：adapter / 测试桩可能回脏数据。
      if (approval.status !== 'APPROVED') {
        continue;
      }
      if (approval.type === 'COMPLIANCE_EXCEPTION') {
        approvedException = true;
        continue;
      }
      if (approval.type === 'CATEGORY_OMISSION') {
        for (const category of this.readOmissionCategories(approval.detail)) {
          omissions.add(category);
        }
      }
    }

    return {
      approvedException,
      confirmedOmissions: REQUIRED_FOOD_CATEGORIES.filter((category) =>
        omissions.has(category),
      ),
    };
  }

  /** 校验并规范化缺类确认的 detail；非法一律 400。 */
  private normalizeOmissionDetail(
    detail: unknown,
  ): { categories: RequiredFoodCategory[] } {
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
      throw new BadRequestException('缺类确认需要 detail.categories');
    }

    const raw = (detail as { categories?: unknown }).categories;
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('缺类确认的 detail.categories 不能为空');
    }

    const picked = new Set<RequiredFoodCategory>();
    for (const value of raw) {
      const category = typeof value === 'string' ? value.trim() : '';
      if (!category || !isRequiredFoodCategory(category)) {
        throw new BadRequestException(
          '缺类确认的 categories 只能是基础类别之一',
        );
      }
      picked.add(category);
    }

    return {
      categories: REQUIRED_FOOD_CATEGORIES.filter((category) =>
        picked.has(category),
      ),
    };
  }

  /** 读取已批准缺类的 categories；畸形 detail 一律忽略，不抛。 */
  private readOmissionCategories(detail: unknown): RequiredFoodCategory[] {
    try {
      const parsed = this.parseDetail(detail);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return [];
      }

      const raw = (parsed as { categories?: unknown }).categories;
      if (!Array.isArray(raw)) {
        return [];
      }

      const picked = new Set<RequiredFoodCategory>();
      for (const value of raw) {
        if (typeof value !== 'string') {
          continue;
        }
        const category = value.trim();
        if (isRequiredFoodCategory(category)) {
          picked.add(category);
        }
      }

      return REQUIRED_FOOD_CATEGORIES.filter((category) =>
        picked.has(category),
      );
    } catch {
      return [];
    }
  }

  /** detail 可能是字符串（旧数据 / 测试桩），能解析就解析，坏数据留空。 */
  private parseDetail(detail: unknown): unknown {
    if (typeof detail !== 'string') {
      return detail;
    }
    try {
      return JSON.parse(detail);
    } catch {
      return null;
    }
  }

  private toJsonInput(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return Prisma.JsonNull;
    }
    return value as Prisma.InputJsonValue;
  }

  private toApprovalRecord(
    approval: RecipeDesignAgentApproval,
  ): AgentApprovalRecord {
    return {
      id: approval.id,
      sessionId: approval.sessionId,
      type: approval.type,
      status: approval.status,
      reason: approval.reason,
      detail: approval.detail,
      requestedAt: approval.requestedAt,
      decidedAt: approval.decidedAt,
      decidedBy: approval.decidedBy,
    };
  }
}
