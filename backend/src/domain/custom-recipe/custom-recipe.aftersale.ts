import { CustomRecipeAftersaleStatus } from '@prisma/client';

/**
 * 定制售后 · 领域规则（2026-10-16，批次 2.5）
 *
 * 与状态机（`custom-recipe.state.ts`）同一个思路：纯函数、不碰数据库，
 * 可以穷举测试。售后单的状态比订单简单，但**"谁能做什么"的规则更绕** ——
 * 顾客能撤回、客服能受理、没人能回到 PENDING，这些放在一处才看得清。
 */

/** 售后状态的中文。给顾客与后台共用（后台也要显示给客服看） */
export const CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS: Readonly<
  Record<CustomRecipeAftersaleStatus, string>
> = {
  PENDING: '待受理',
  ACCEPTED: '已受理',
  PROCESSING: '处理中',
  RESOLVED: '已解决',
  REJECTED: '未受理',
};

/**
 * 合法流转表。
 *
 * | 从 | 到 | 谁能做 |
 * |---|---|---|
 * | PENDING | ACCEPTED / REJECTED | 客服受理或驳回；**顾客撤回也走 REJECTED** |
 * | ACCEPTED | PROCESSING / RESOLVED / REJECTED | 客服 |
 * | PROCESSING | RESOLVED / REJECTED | 客服 |
 * | RESOLVED | — | 终态 |
 * | REJECTED | — | 终态（顾客可以**重新提一条**，但不是把这条改回去） |
 */
export const ALLOWED_AFTERSALE_TRANSITIONS: Readonly<
  Record<CustomRecipeAftersaleStatus, readonly CustomRecipeAftersaleStatus[]>
> = {
  PENDING: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['PROCESSING', 'RESOLVED', 'REJECTED'],
  PROCESSING: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
};

/** 终态 */
export const AFTERSALE_TERMINAL_STATUSES: readonly CustomRecipeAftersaleStatus[] =
  ['RESOLVED', 'REJECTED'];

/** 还在处理中（后台待办要看的、顾客不能重复提的） */
export function isAftersaleOpen(
  status: CustomRecipeAftersaleStatus,
): boolean {
  return !AFTERSALE_TERMINAL_STATUSES.includes(status);
}

/**
 * 顾客能不能撤回。
 *
 * **只在"还没人受理"时允许**（PENDING）—— 客服已经在处理了还抽走，
 * 会让客服白忙一轮，而且顾客真正想表达的是"补充情况"而不是"撤销"。
 */
export function canCustomerCancelAftersale(
  status: CustomRecipeAftersaleStatus,
): boolean {
  return status === 'PENDING';
}

/** 这一步流转合不合法 */
export function canTransitionAftersale(
  from: CustomRecipeAftersaleStatus,
  to: CustomRecipeAftersaleStatus,
): boolean {
  return (ALLOWED_AFTERSALE_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * 进度时间轴（与订单进度同一套渲染思路，前端照着画即可）。
 *
 * 节点集合固定三个：提交 → 受理 → 出结果。
 * **不做成"处理中"单独一个节点** —— 顾客不关心我们在内部转了几手。
 */
export function describeAftersaleProgress(input: {
  status: CustomRecipeAftersaleStatus;
  createdAt: Date;
  acceptedAt?: Date | null;
  resolvedAt?: Date | null;
}): {
  current: string;
  timeline: Array<{
    code: string;
    label: string;
    done: boolean;
    active?: boolean;
    at?: string | null;
    note?: string | null;
  }>;
} {
  const rejected = input.status === 'REJECTED';
  const accepted = Boolean(input.acceptedAt) || input.status !== 'PENDING';
  const finished = AFTERSALE_TERMINAL_STATUSES.includes(input.status);

  const timeline: Array<{
    code: string;
    label: string;
    done: boolean;
    active?: boolean;
    at?: string | null;
    note?: string | null;
  }> = [
    {
      code: 'SUBMITTED',
      label: '已提交',
      done: true,
      at: input.createdAt.toISOString(),
      note: null,
    },
    {
      code: 'ACCEPTED',
      label: rejected ? '未受理' : '已受理',
      done: accepted,
      at: input.acceptedAt ? input.acceptedAt.toISOString() : null,
      note: rejected
        ? '这条售后我们没法处理，原因见下方说明'
        : accepted
          ? null
          : '我们会在 1 个工作日内看一下',
    },
    {
      code: 'RESOLVED',
      label: rejected ? '已结束' : '已处理',
      done: finished,
      at: input.resolvedAt ? input.resolvedAt.toISOString() : null,
      note: null,
    },
  ];

  const current =
    [...timeline].reverse().find((step) => step.done)?.code ?? 'SUBMITTED';
  for (const step of timeline) {
    if (step.code === current) step.active = true;
  }

  return { current, timeline };
}

/**
 * 待受理超过这么多小时就算"催得急"（后台会标红）。
 *
 * 24 小时是**一天**：顾客昨天提的还没人理，今天就该显眼。
 */
export const AFTERSALE_URGENT_HOURS = 24;

/**
 * 后台待办排序用的紧急度。
 *
 * 规则很简单，但**写出来比藏在排序代码里好**：
 * ① 等太久的排前面（顾客在等）；
 * ② 同等待了多久时，"调整食谱"比"问个问题"急 ——
 *    前者顾客的狗可能正在吃着不合适的饭。
 */
export function aftersaleUrgency(input: {
  status: CustomRecipeAftersaleStatus;
  type: string;
  createdAt: Date;
  now: Date;
}): {
  hoursWaiting: number;
  typeWeight: number;
  score: number;
  isUrgent: boolean;
} {
  const hoursWaiting = Math.max(
    0,
    (input.now.getTime() - input.createdAt.getTime()) / (60 * 60 * 1000),
  );
  const typeWeight = input.type === 'ADJUST_RECIPE' ? 2 : 1;
  const pendingWeight = input.status === 'PENDING' ? 1.5 : 1;

  const roundedHours = Math.round(hoursWaiting * 10) / 10;

  return {
    hoursWaiting: roundedHours,
    typeWeight,
    score: roundedHours * typeWeight * pendingWeight,
    /**
     * 是不是"催得急"。
     *
     * ⚠️ **放在这里而不是让前端判** —— 前端原来写的是
     * `item.status === 'PENDING' && item.hoursWaiting >= 24`，
     * 那又是"前端在判断业务状态"。阈值这种东西改一次
     * （比如老板说"12 小时就该催"）不该去改前端。
     */
    isUrgent:
      input.status === 'PENDING' && roundedHours >= AFTERSALE_URGENT_HOURS,
  };
}
