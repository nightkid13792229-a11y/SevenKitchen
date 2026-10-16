import { Injectable } from '@nestjs/common';
import { CustomRecipeStatus } from '@prisma/client';
import { PlatformOptionsService } from '../platform-options/platform-options.service';
import { CUSTOM_RECIPE_STATUS_SET } from '../platform-options/option-sets.registry';
import {
  buildCustomerHint,
  buildProgress,
  buildRenderableStatus,
  resolveCustomerActions,
  resolveStaffActions,
  type CustomRecipeActionContext,
  type CustomRecipeViewer,
} from './custom-recipe-action-resolver';
import type { RenderableTone } from '../../interfaces/dto/common/renderable.dto';
import type { RenderableOrderView } from '../../interfaces/dto/common/renderable.dto';

/**
 * 食谱定制 · 视图组装（2026-10-16，批次 1.5）
 *
 * ## 它做的事
 *
 * 把"解析器算出来的动作"与"选项字典里的中文"拼成前端可直接渲染的形态。
 *
 * 分开两个文件的理由：
 *   · `custom-recipe-action-resolver.ts` 是**纯函数**（可穷举测试、不碰数据库）
 *   · 这里负责**取数**（字典里的中文、配置里的窗口天数）
 *
 * ## 为什么中文一定要从字典取
 *
 * 如果这里自己写一份中文，那又变成了"同一份文案两处维护" ——
 * 正是这次重构要消灭的东西（2026-10-04 加「已取消」时漏了两处半）。
 * 字典取不到时**退回状态码本身**并不可怕（界面显示英文码），
 * 可怕的是这里悄悄写一份"看起来对"的中文，从此与字典分叉。
 */
/** 调用方传进来的日期可能是 Date、ISO 字符串或 null —— 统一归一化 */
function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

@Injectable()
export class CustomRecipeViewService {
  constructor(private readonly platformOptions: PlatformOptionsService) {}

  /**
   * 组装顾客视角的三件套。
   *
   * 参数刻意用**原始字段**而不是整个订单对象：这样这个服务不依赖
   * `custom_recipe_order` 的具体形状，将来拆服务（批次 1.1）时也好搬。
   */
  async buildCustomerView(input: {
    status: CustomRecipeStatus;
    /**
     * 日期字段同时接受 `Date` 与 ISO 字符串。
     *
     * 调用方给的东西不统一：从 Prisma 出来的是 Date，
     * 而 `resolvePaymentDeadline()` 返回的是 ISO 字符串。
     * 要求每个调用方自己转一次，迟早有人忘 —— 这里统一归一化更省事。
     */
    createdAt?: Date | string | null;
    paymentConfirmedAt?: Date | string | null;
    deliveredAt?: Date | string | null;
    completedAt?: Date | string | null;
    estimatedDeliveryDate?: Date | string | null;
    paymentDeadlineAt?: Date | string | null;
    cancellationReason?: string | null;
    refundStatus?: string | null;
    refundAmount?: number | null;
    /** 有没有交付记录（批次 2 之前用 recipeId 是否有值代替） */
    hasAnyDelivery?: boolean;
    hasUnconfirmedDelivery?: boolean;
    hasOpenAftersale?: boolean;
    /** 售后窗口天数（来自配置） */
    aftersaleWindowDays?: number | null;
    requireCustomerConfirm?: boolean;
    /** 便于测试注入 */
    now?: Date;
  }): Promise<RenderableOrderView> {
    const labels = await this.statusLabels();
    const meta = labels[input.status] ?? {
      label: String(input.status),
      tone: 'neutral' as RenderableTone,
    };

    const now = input.now ?? new Date();
    const deliveredAt = toDateOrNull(input.deliveredAt);
    const paymentDeadlineAt = toDateOrNull(input.paymentDeadlineAt);
    const estimatedDeliveryDate = toDateOrNull(input.estimatedDeliveryDate);

    /**
     * 售后窗口从**交付时间**起算（不是下单时间）。
     * 未交付时给 null —— 解析器把 null 理解成"不限期"，
     * 但 `resolveCustomerActions` 里还有 `hasAnyDelivery` 挡着，
     * 所以未交付的单不会出现「有问题」按钮。
     */
    const aftersaleWindowClosesAt =
      deliveredAt && input.aftersaleWindowDays
        ? new Date(
            deliveredAt.getTime() +
              input.aftersaleWindowDays * 24 * 60 * 60 * 1000,
          )
        : null;

    const context: CustomRecipeActionContext = {
      status: input.status,
      viewer: 'CUSTOMER',
      now,
      paymentDeadlineAt,
      hasAnyDelivery: Boolean(input.hasAnyDelivery),
      hasUnconfirmedDelivery: Boolean(input.hasUnconfirmedDelivery),
      hasOpenAftersale: Boolean(input.hasOpenAftersale),
      aftersaleWindowClosesAt,
      requireCustomerConfirm: input.requireCustomerConfirm,
    };

    return {
      status: buildRenderableStatus({
        code: input.status,
        label: meta.label,
        tone: meta.tone,
        customerHint: buildCustomerHint({
          status: input.status,
          estimatedDeliveryDate,
          autoCompleteAt: null, // 等定时任务落地后从订单上取
          paymentDeadlineAt,
          cancellationReason: input.cancellationReason ?? null,
          refundStatus: input.refundStatus ?? null,
          refundAmount: input.refundAmount ?? null,
        }),
      }),
      actions: resolveCustomerActions(context),
      progress: buildProgress({
        status: input.status,
        createdAt: toDateOrNull(input.createdAt),
        paymentConfirmedAt: toDateOrNull(input.paymentConfirmedAt),
        deliveredAt,
        completedAt: toDateOrNull(input.completedAt),
        estimatedDeliveryDate,
      }),
    };
  }

  /** 组装后台视角的三件套（动作集不同：多出接单/设计/交付/取消等） */
  async buildStaffView(input: {
    status: CustomRecipeStatus;
    viewer: CustomRecipeViewer;
    hasOpenAftersale?: boolean;
    hasAnyDelivery?: boolean;
    /** 便于测试注入 */
    now?: Date;
  }): Promise<RenderableOrderView> {
    const labels = await this.statusLabels();
    const meta = labels[input.status] ?? {
      label: String(input.status),
      tone: 'neutral' as RenderableTone,
    };

    return {
      status: buildRenderableStatus({
        code: input.status,
        label: meta.label,
        tone: meta.tone,
        // 后台不需要"给顾客的一句话"（那句话的读者是顾客）
        customerHint: null,
      }),
      actions: resolveStaffActions({
        status: input.status,
        viewer: input.viewer,
        now: input.now ?? new Date(),
        hasOpenAftersale: Boolean(input.hasOpenAftersale),
        hasAnyDelivery: Boolean(input.hasAnyDelivery),
      }),
    };
  }

  /**
   * 从选项字典取"状态码 → 中文与色调"。
   *
   * 取不到时**返回空表**，调用方退回状态码本身 —— 不在这里写兜底中文，
   * 免得与字典分叉（见类注释）。
   */
  private async statusLabels(): Promise<
    Record<string, { label: string; tone: RenderableTone }>
  > {
    try {
      const items = await this.platformOptions.listSet(
        CUSTOM_RECIPE_STATUS_SET,
      );
      const map: Record<string, { label: string; tone: RenderableTone }> = {};
      for (const item of items) {
        map[item.code] = {
          label: item.label,
          tone: (item.tone as RenderableTone | null) ?? 'neutral',
        };
      }
      return map;
    } catch {
      return {};
    }
  }
}
