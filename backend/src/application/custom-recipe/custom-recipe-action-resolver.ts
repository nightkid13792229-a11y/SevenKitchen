import { CustomRecipeStatus } from '@prisma/client';
import type {
  RenderableAction,
  RenderableProgress,
  RenderableProgressStep,
  RenderableStatus,
  RenderableTone,
} from '../../interfaces/dto/common/renderable.dto';

/**
 * 食谱定制 · 动作解析器（2026-10-16，批次 1.5）
 *
 * ## 这个文件要解决的问题
 *
 * 老板要求「前端只负责渲染」。要做到，前端就不能再自己判断
 * "这个按钮现在能不能点 / 为什么不能点"。那些判断此前散在三端：
 *
 *   · 小程序：`canSelfCancel` 判状态、`canApplyAftersale` 判窗口
 *   · 后台：`useAdminRole` 判角色、`canDeliverCustomRecipe` 判白名单
 *   · 后端：`ALLOWED_STATUS_TRANSITIONS` 又判一遍
 *
 * 两处判断一旦不一致就出事（比如前端显示可点、后端拒绝）。
 * 现在收敛成**一处**：这里算好，前端照着渲染。
 *
 * ## 为什么是纯函数
 *
 * 刻意不注入 Prisma：输入是一个**上下文对象**（`CustomRecipeActionContext`），
 * 由调用方从数据库组装。好处有三个：
 *
 *   ① 可以**穷举**测试（角色 × 状态 × 各种边界），不需要数据库；
 *   ② 交付/售后那两张表要到批次 2 才建，本解析器**先于它们存在**，
 *      到时候只是把上下文字段填上，逻辑一行不用改；
 *   ③ 逻辑与取数分开，将来拆分服务（批次 1.1）时这个文件原样搬走。
 *
 * ## 三条硬口径
 *
 * **一、禁用的动作必须给原因。** 一个点不动又不说话的按钮，
 *   顾客只会以为系统坏了。这条有测试守着。
 *
 * **二、顾客看不到后台动作。** 不是"禁用"，是**根本不下发** ——
 *   下发一个顾客永远点不了的东西只会让人困惑。
 *
 * **三、权限在后端算。** 客服与管理员看到不同的按钮，
 *   前端不许出现 `role === 'ADMIN'`。
 */

/** 观察者角色。客服与管理员分开：交付与取消只允许管理员（2026-10-04 老板口径） */
export type CustomRecipeViewer = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export interface CustomRecipeActionContext {
  status: CustomRecipeStatus;
  viewer: CustomRecipeViewer;

  /** 当前时间（可注入，便于测窗口边界） */
  now?: Date;

  /** 支付截止时间；null = 不自动关单 */
  paymentDeadlineAt?: Date | null;

  /** 有没有**未确认**的有效交付（决定「确认收到」能不能点） */
  hasUnconfirmedDelivery?: boolean;
  /** 有没有任何交付记录（决定「查看定制食谱」显不显示） */
  hasAnyDelivery?: boolean;

  /** 售后窗口关闭时间；null = 不限期 */
  aftersaleWindowClosesAt?: Date | null;
  /** 有没有未解决的售后单 */
  hasOpenAftersale?: boolean;

  /** 是否要求顾客确认收货（配置项） */
  requireCustomerConfirm?: boolean;
}

// ==================== 动作码 ====================

export const CUSTOM_RECIPE_ACTIONS = {
  /** 去支付 */
  PAY: 'PAY',
  /** 顾客自助取消（未开始制作时可全额退） */
  CANCEL_SELF: 'CANCEL_SELF',
  /** 联系客服 */
  CONTACT_SERVICE: 'CONTACT_SERVICE',
  /** 确认收到 */
  CONFIRM_RECEIPT: 'CONFIRM_RECEIPT',
  /** 申请售后 */
  APPLY_AFTERSALE: 'APPLY_AFTERSALE',
  /** 查看定制食谱（交付物） */
  VIEW_DELIVERY: 'VIEW_DELIVERY',
  /** 去订购成品（用定制费抵扣） */
  ORDER_FINISHED_FOOD: 'ORDER_FINISHED_FOOD',

  /** 后台：接单 */
  ACCEPT_ORDER: 'ACCEPT_ORDER',
  /** 后台：去设计食谱 */
  DESIGN: 'DESIGN',
  /** 后台：交付 / 重新交付 */
  DELIVER: 'DELIVER',
  /** 后台：取消订单（含退款） */
  CANCEL_ADMIN: 'CANCEL_ADMIN',
  /** 后台：处理售后 */
  RESOLVE_AFTERSALE: 'RESOLVE_AFTERSALE',
  /** 后台：恢复抵扣额度 */
  RESTORE_CREDIT: 'RESTORE_CREDIT',
} as const;

export type CustomRecipeActionCode =
  (typeof CUSTOM_RECIPE_ACTIONS)[keyof typeof CUSTOM_RECIPE_ACTIONS];

// ==================== 工具 ====================

function isBefore(deadline: Date | null | undefined, now: Date): boolean {
  if (!deadline) return true;
  return now.getTime() < deadline.getTime();
}

function isAfter(deadline: Date | null | undefined, now: Date): boolean {
  if (!deadline) return false;
  return now.getTime() >= deadline.getTime();
}

/** 还在"可以反悔"的阶段：钱付了但还没开始做 */
const SELF_CANCELLABLE: CustomRecipeStatus[] = [
  CustomRecipeStatus.PENDING_PAYMENT,
  CustomRecipeStatus.PAID,
];

/** 可以交付的状态（含已交付 = 重新交付、已完成 = 售后改稿后重交） */
const DELIVERABLE: CustomRecipeStatus[] = [
  CustomRecipeStatus.PAID,
  CustomRecipeStatus.IN_PROGRESS,
  CustomRecipeStatus.DELIVERED,
  CustomRecipeStatus.COMPLETED,
];

// ==================== 顾客侧 ====================

/**
 * 算顾客能做什么。
 *
 * 注意"能不能看见"与"能不能点"是两件事：
 * 不能点的按钮**照样下发**（带原因），因为"这里本来有个入口、
 * 但现在不行"比"入口凭空消失"更容易理解。
 * 唯一例外是**权限**类：顾客永远不该看到后台动作，那些直接不下发。
 */
export function resolveCustomerActions(
  ctx: CustomRecipeActionContext,
): RenderableAction[] {
  const now = ctx.now ?? new Date();
  const actions: RenderableAction[] = [];

  // ---- 去支付 ----
  if (ctx.status === CustomRecipeStatus.PENDING_PAYMENT) {
    const withinDeadline = isBefore(ctx.paymentDeadlineAt, now);
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.PAY,
      label: '去支付',
      enabled: withinDeadline,
      disabledReason: withinDeadline
        ? null
        : '已超过支付时限，订单可能已被自动取消',
      style: 'primary',
    });
  }

  // ---- 自助取消 ----
  if (SELF_CANCELLABLE.includes(ctx.status)) {
    const unpaid = ctx.status === CustomRecipeStatus.PENDING_PAYMENT;
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.CANCEL_SELF,
      /**
       * 已付款的单按钮上就写「取消并退款」。
       *
       * 小程序原来在页面里写 `status === 'PENDING_PAYMENT' ? '取消订单' : '取消并退款'` ——
       * 那是前端在判断业务。2026-10-16 把它挪到这里：**措辞本身是业务口径**，
       * 而且"会不会退款"后端最清楚（万一将来改成部分退款，前端不用动）。
       */
      label: unpaid ? '取消订单' : '取消并退款',
      enabled: true,
      confirmText: unpaid
        ? '取消后这张定制单就没了，要重新下单才能再约。确定取消吗？'
        : '取消后会**全额原路退回**已付的定制费（通常几分钟到几小时到账）。确定取消吗？',
      danger: true,
      style: 'line',
    });
  } else if (
    ctx.status === CustomRecipeStatus.IN_PROGRESS ||
    ctx.status === CustomRecipeStatus.DELIVERED
  ) {
    /**
     * 已经开始制作之后不能自助取消（2026-10-04 口径）。
     * 仍然下发按钮并说明原因 —— 顾客点了发现没反应会更慌。
     */
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.CANCEL_SELF,
      label: '取消订单',
      enabled: false,
      disabledReason:
        ctx.status === CustomRecipeStatus.IN_PROGRESS
          ? '营养师已经开始设计了，不能自助取消；有问题请联系客服'
          : '食谱已经交付，不能取消；不满意可以申请售后',
      danger: true,
      style: 'line',
    });
  }

  // ---- 查看交付物 ----
  if (ctx.hasAnyDelivery) {
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.VIEW_DELIVERY,
      label: '查看定制食谱',
      enabled: true,
      style: 'primary',
    });
  }

  // ---- 确认收到 ----
  if (ctx.hasUnconfirmedDelivery) {
    const required = ctx.requireCustomerConfirm !== false;
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.CONFIRM_RECEIPT,
      label: '确认收到',
      enabled: true,
      confirmText: required
        ? null
        : '确认后这单就完成了',
      style: 'primary',
    });
  }

  // ---- 申请售后 ----
  // 注意 `Boolean(...)`：hasAnyDelivery 是可选的，直接 `&&` 会得到 boolean | undefined，
  // 而 enabled 要求严格的 boolean（undefined 会让前端 `if (enabled)` 走 else，行为不可预期）
  const inWindow =
    Boolean(ctx.hasAnyDelivery) && !isAfter(ctx.aftersaleWindowClosesAt, now);
  const alreadyOpen = Boolean(ctx.hasOpenAftersale);

  if (ctx.hasAnyDelivery) {
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.APPLY_AFTERSALE,
      label: '有问题',
      enabled: inWindow && !alreadyOpen,
      disabledReason: alreadyOpen
        ? '你已经提交过售后，正在处理中'
        : inWindow
          ? null
          : '已超过售后受理期，如需帮助请联系客服',
      style: 'ghost',
    });
  }

  // ---- 用这份食谱订购成品 ----
  if (
    ctx.status === CustomRecipeStatus.DELIVERED ||
    ctx.status === CustomRecipeStatus.COMPLETED
  ) {
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.ORDER_FINISHED_FOOD,
      label: '用这份食谱订购成品',
      enabled: true,
      style: 'primary',
    });
  }

  // ---- 联系客服（恒可用，永远放最后）----
  actions.push({
    code: CUSTOM_RECIPE_ACTIONS.CONTACT_SERVICE,
    label: '联系客服',
    enabled: true,
    style: 'line',
  });

  return actions;
}

// ==================== 后台侧 ====================

export function resolveStaffActions(
  ctx: CustomRecipeActionContext,
): RenderableAction[] {
  /** 顾客不该看到后台动作 —— 直接返回空，而不是"都禁用" */
  if (ctx.viewer === 'CUSTOMER') return [];

  const now = ctx.now ?? new Date();
  const isAdmin = ctx.viewer === 'ADMIN';
  const actions: RenderableAction[] = [];

  // ---- 接单 ----
  if (ctx.status === CustomRecipeStatus.PAID) {
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.ACCEPT_ORDER,
      label: '接单',
      enabled: true,
      style: 'primary',
    });
  }

  // ---- 去设计 ----
  if (
    ctx.status === CustomRecipeStatus.PAID ||
    ctx.status === CustomRecipeStatus.IN_PROGRESS
  ) {
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.DESIGN,
      label: '去设计食谱',
      enabled: true,
      style: 'primary',
    });
  }

  // ---- 交付 / 重新交付（仅管理员）----
  if (DELIVERABLE.includes(ctx.status)) {
    const redelivery =
      ctx.status === CustomRecipeStatus.DELIVERED ||
      ctx.status === CustomRecipeStatus.COMPLETED;
    const withinStatus = DELIVERABLE.includes(ctx.status);

    if (!isAdmin) {
      /**
       * 客服看得到"这里该交付了"，但点不了 —— 并说明该找谁。
       * 比按钮直接消失好：客服知道下一步该催谁。
       */
      actions.push({
        code: CUSTOM_RECIPE_ACTIONS.DELIVER,
        label: redelivery ? '重新交付' : '交付食谱',
        enabled: false,
        disabledReason: '交付食谱需要管理员权限，请联系管理员操作',
        style: 'primary',
      });
    } else {
      actions.push({
        code: CUSTOM_RECIPE_ACTIONS.DELIVER,
        label: redelivery ? '重新交付' : '交付食谱',
        enabled: withinStatus,
        confirmText: redelivery
          ? '会用新的一版替换原来的食谱，并**再次通知顾客**。旧版本仍可查看。确定重新交付吗？'
          : null,
        style: 'primary',
      });
    }
  }

  // ---- 取消订单（仅管理员，且会退款）----
  if (
    ctx.status !== CustomRecipeStatus.CANCELLED &&
    ctx.status !== CustomRecipeStatus.COMPLETED
  ) {
    const paid =
      ctx.status !== CustomRecipeStatus.PENDING_PAYMENT;
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.CANCEL_ADMIN,
      label: '取消订单',
      enabled: isAdmin,
      disabledReason: isAdmin ? null : '取消订单需要管理员权限',
      confirmText: paid
        ? '这张单已经收过款，取消会**立即原路全额退款**给顾客。确定取消吗？'
        : '确定取消这张待付款的订单吗？',
      danger: true,
      style: 'line',
    });
  }

  // ---- 处理售后 ----
  if (ctx.hasOpenAftersale) {
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.RESOLVE_AFTERSALE,
      label: '处理售后',
      enabled: true,
      style: 'primary',
    });
  }

  // ---- 恢复抵扣额度（仅管理员；已经用掉额度时才需要）----
  if (
    isAdmin &&
    (ctx.status === CustomRecipeStatus.DELIVERED ||
      ctx.status === CustomRecipeStatus.COMPLETED)
  ) {
    actions.push({
      code: CUSTOM_RECIPE_ACTIONS.RESTORE_CREDIT,
      label: '恢复抵扣额度',
      enabled: true,
      confirmText: '用于人工退款场景：恢复后顾客可以再次使用这部分额度抵扣。确定吗？',
      danger: true,
      style: 'line',
    });
  }

  // ---- 联系客户 ----
  actions.push({
    code: CUSTOM_RECIPE_ACTIONS.CONTACT_SERVICE,
    label: '联系客户',
    enabled: true,
    style: 'line',
  });

  // 留一个显式的 now 使用，避免 lint 报未使用（语义上上面已用到）
  void now;

  return actions;
}

// ==================== 状态与进度 ====================

/**
 * 组装状态三件套。
 *
 * 中文与色调**不由本函数决定** —— 由调用方从选项字典取（批次 1.3）。
 * 这里只负责把状态码、说明、以及"给顾客的一句话"拼起来，
 * 保证三端拿到的是同一份。
 */
export function buildRenderableStatus(input: {
  code: CustomRecipeStatus | string;
  label: string;
  tone: RenderableTone;
  customerHint?: string | null;
}): RenderableStatus {
  return {
    code: String(input.code),
    label: input.label,
    tone: input.tone,
    customerHint: input.customerHint ?? null,
  };
}

/**
 * 给顾客的一句话（比状态名多一层"所以呢"）。
 *
 * 文案与状态一一对应；新增状态时这里**必须**补一行 ——
 * 否则顾客只会看到光秃秃的状态名（这正是 2026-10-04 踩过的坑：
 * 加了「已取消」却没有任何一句解释）。
 */
export function buildCustomerHint(input: {
  status: CustomRecipeStatus;
  estimatedDeliveryDate?: Date | null;
  autoCompleteAt?: Date | null;
  paymentDeadlineAt?: Date | null;
  cancellationReason?: string | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
}): string | null {
  const fmt = (date?: Date | null) =>
    date
      ? `${date.getMonth() + 1} 月 ${date.getDate()} 日`
      : null;

  switch (input.status) {
    case CustomRecipeStatus.PENDING_PAYMENT: {
      const deadline = fmt(input.paymentDeadlineAt);
      return deadline
        ? `请在 ${deadline}前完成支付，超时订单会自动取消。`
        : '订单还没付款，付款后我们就开始安排。';
    }
    case CustomRecipeStatus.PAID: {
      const due = fmt(input.estimatedDeliveryDate);
      return due
        ? `我们已经收到款，会在 ${due}前把食谱交给你。`
        : '我们已经收到款，马上开始安排。';
    }
    case CustomRecipeStatus.IN_PROGRESS: {
      const due = fmt(input.estimatedDeliveryDate);
      return due
        ? `营养师正在为它设计专属食谱，预计 ${due}前交付。`
        : '营养师正在为它设计专属食谱。';
    }
    case CustomRecipeStatus.DELIVERED: {
      const auto = fmt(input.autoCompleteAt);
      return auto
        ? `专属食谱已经完成，请在 ${auto}前确认收到。`
        : '专属食谱已经完成，确认一下就能开始用了。';
    }
    case CustomRecipeStatus.COMPLETED:
      return '这单已经完成。喂的过程中有任何问题，都可以申请售后。';
    case CustomRecipeStatus.CANCELLED: {
      const amount =
        input.refundAmount && input.refundAmount > 0
          ? ` ¥${input.refundAmount}`
          : '';
      const refund =
        input.refundStatus === 'SUCCESS'
          ? `已退款${amount}。`
          : input.refundStatus
            ? '退款处理中。'
            : '';
      return `${input.cancellationReason || '订单已取消。'}${refund}`;
    }
    default:
      return null;
  }
}

/**
 * 组装顾客侧进度时间轴。
 *
 * **节点集合与文案由后端决定** —— 后台加一个内部环节，
 * 只要这里加一个节点，小程序不用发版。
 *
 * 内部子阶段（设计中等）**不单独成为节点**：
 * 顾客只需要知道"在做"，不需要知道我们在内部怎么分工。
 */
export function buildProgress(input: {
  status: CustomRecipeStatus;
  createdAt?: Date | null;
  paymentConfirmedAt?: Date | null;
  deliveredAt?: Date | null;
  completedAt?: Date | null;
  estimatedDeliveryDate?: Date | null;
}): RenderableProgress {
  const steps: RenderableProgressStep[] = [];

  const reached = (status: CustomRecipeStatus) => {
    const order: CustomRecipeStatus[] = [
      CustomRecipeStatus.PENDING_PAYMENT,
      CustomRecipeStatus.PAID,
      CustomRecipeStatus.IN_PROGRESS,
      CustomRecipeStatus.DELIVERED,
      CustomRecipeStatus.COMPLETED,
    ];
    const current = order.indexOf(input.status);
    const target = order.indexOf(status);
    if (current < 0 || target < 0) return false;
    return current >= target;
  };

  steps.push({
    code: 'CREATED',
    label: '已下单',
    done: true,
    at: input.createdAt ? input.createdAt.toISOString() : null,
  });

  steps.push({
    code: 'PAID',
    label: '已付款',
    done: reached(CustomRecipeStatus.PAID),
    at: input.paymentConfirmedAt
      ? input.paymentConfirmedAt.toISOString()
      : null,
    note:
      input.status === CustomRecipeStatus.PENDING_PAYMENT
        ? '还没收到款，付款后开始安排'
        : null,
  });

  steps.push({
    code: 'IN_PROGRESS',
    label: '制作中',
    done: reached(CustomRecipeStatus.IN_PROGRESS),
    at: null,
    note: reached(CustomRecipeStatus.PAID)
      ? input.estimatedDeliveryDate
        ? `预计 ${input.estimatedDeliveryDate.getMonth() + 1} 月 ${input.estimatedDeliveryDate.getDate()} 日前完成`
        : null
      : null,
  });

  steps.push({
    code: 'DELIVERED',
    label: '交付食谱',
    done: reached(CustomRecipeStatus.DELIVERED),
    at: input.deliveredAt ? input.deliveredAt.toISOString() : null,
    note: reached(CustomRecipeStatus.IN_PROGRESS)
      ? '完成后会通知你，在这里查看'
      : null,
  });

  steps.push({
    code: 'COMPLETED',
    label: '已完成',
    done: reached(CustomRecipeStatus.COMPLETED),
    at: input.completedAt ? input.completedAt.toISOString() : null,
  });

  // 已取消的单不进正常时间轴（它属于另一条支线）
  if (input.status === CustomRecipeStatus.CANCELLED) {
    return {
      current: 'CANCELLED',
      timeline: [
        {
          code: 'CREATED',
          label: '已下单',
          done: true,
          at: input.createdAt ? input.createdAt.toISOString() : null,
        },
        {
          code: 'CANCELLED',
          label: '已取消',
          done: true,
          active: true,
          at: null,
        },
      ],
    };
  }

  const current =
    [...steps].reverse().find((step) => step.done)?.code ?? 'CREATED';
  for (const step of steps) {
    if (step.code === current) step.active = true;
  }

  return { current, timeline: steps };
}
