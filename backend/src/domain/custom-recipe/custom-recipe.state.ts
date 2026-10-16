import { CustomRecipeStatus, CustomRecipeSubStage } from '@prisma/client';

/**
 * 定制单状态机（2026-10-16，食谱定制重构 批次 1.2）
 *
 * ## 为什么单独一个文件
 *
 * 此前流转表是 `CustomRecipeService` 里的一个 `private static readonly`，
 * 而且**有三条路径绕过它**（交付、建食谱交付、人工确认收款都直接写库）。
 * 结果是：合法流转被校验的地方只有一处，而实际能改状态的地方有四处 ——
 * "有校验"是假的。
 *
 * 现在收敛成这个文件里的纯函数，**所有改状态的地方都必须过它**。
 *
 * ## 为什么是纯函数
 *
 * 不注入任何东西、不碰数据库 → 可以**穷举 6×6=36 种状态对**逐一验证，
 * 不需要夹具也不需要 mock。加一个状态时，穷举测试会立刻告诉你漏了哪些组合。
 *
 * ## 相对旧表的四处变化（都有理由）
 *
 * | 从 | 到 | 变化 |
 * |---|---|---|
 * | `DELIVERED` | `COMPLETED` | **新增**：旧表里 `DELIVERED` 的可流转列表是**空数组**，交货之后系统再也不会有动作，"顾客确认收货"无处安放 |
 * | `DELIVERED` | `DELIVERED` | **新增自环**：重新交付（2026-10-04 口径允许） |
 * | `COMPLETED` | `DELIVERED` | **新增回退**：售后改稿后重新交付，顾客需要重新确认 |
 * | `CANCELLED` | 任何 | 保持**终态**不变 |
 */

/**
 * 合法流转表。
 *
 * ⚠️ 这是**唯一真源**。加状态时必须同时改这里与穷举测试，
 * 否则 TypeScript 会先报错（`Record<CustomRecipeStatus, …>` 要求每个状态都有键）。
 */
export const ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<CustomRecipeStatus, readonly CustomRecipeStatus[]>
> = {
  [CustomRecipeStatus.PENDING_PAYMENT]: [
    CustomRecipeStatus.PAID,
    CustomRecipeStatus.CANCELLED,
  ],
  [CustomRecipeStatus.PAID]: [
    CustomRecipeStatus.IN_PROGRESS,
    // 已付款可以直接交付（小额单、或顾客只要食谱不要成品的场景）
    CustomRecipeStatus.DELIVERED,
    CustomRecipeStatus.CANCELLED,
  ],
  [CustomRecipeStatus.IN_PROGRESS]: [
    CustomRecipeStatus.DELIVERED,
    CustomRecipeStatus.CANCELLED,
  ],
  [CustomRecipeStatus.DELIVERED]: [
    // 顾客确认收到 / 超期自动完成
    CustomRecipeStatus.COMPLETED,
    // 自环 = 重新交付（替换版本并再次通知）
    CustomRecipeStatus.DELIVERED,
  ],
  [CustomRecipeStatus.COMPLETED]: [
    // 售后改稿后重新交付：顾客要重新确认
    CustomRecipeStatus.DELIVERED,
  ],
  // 终态：取消之后不再流转
  [CustomRecipeStatus.CANCELLED]: [],
};

/** 主状态的中文（后端内部用；给前端的中文由选项字典下发） */
export const STATUS_LABELS: Readonly<Record<CustomRecipeStatus, string>> = {
  [CustomRecipeStatus.PENDING_PAYMENT]: '待付款',
  [CustomRecipeStatus.PAID]: '已付款',
  [CustomRecipeStatus.IN_PROGRESS]: '制作中',
  [CustomRecipeStatus.DELIVERED]: '已交付',
  [CustomRecipeStatus.COMPLETED]: '已完成',
  [CustomRecipeStatus.CANCELLED]: '已取消',
};

/** 子阶段的中文（仅后台工作台用，顾客侧不展示） */
export const SUB_STAGE_LABELS: Readonly<Record<CustomRecipeSubStage, string>> = {
  [CustomRecipeSubStage.PENDING_ACCEPT]: '待接单',
  [CustomRecipeSubStage.ACCEPTED]: '已接单',
  [CustomRecipeSubStage.NEED_INFO]: '等顾客补资料',
  [CustomRecipeSubStage.DESIGNING]: '设计中',
  [CustomRecipeSubStage.IN_REVIEW]: '内部审核中',
  [CustomRecipeSubStage.READY_TO_DELIVER]: '待交付',
};

/** 终态（不再流转） */
export const TERMINAL_STATUSES: readonly CustomRecipeStatus[] = [
  CustomRecipeStatus.CANCELLED,
];

/** 这一单还在进行中吗（用于"超期"判断等） */
export function isOpenStatus(status: CustomRecipeStatus): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

/** 从某状态能去哪里 */
export function allowedNextStatuses(
  from: CustomRecipeStatus,
): readonly CustomRecipeStatus[] {
  return ALLOWED_STATUS_TRANSITIONS[from] ?? [];
}

/** 这一步流转合不合法 */
export function canTransition(
  from: CustomRecipeStatus,
  to: CustomRecipeStatus,
): boolean {
  return allowedNextStatuses(from).includes(to);
}

/**
 * 校验流转，不合法就抛。
 *
 * 抛的是 `Error` 而不是 Nest 的 `BadRequestException` —— 这一层是领域层，
 * 不该认识 Web 框架。调用方负责翻译成合适的 HTTP 语义。
 * 错误信息里带上「从哪到哪」，排查时不用再去翻流转表。
 */
export function assertTransition(
  from: CustomRecipeStatus,
  to: CustomRecipeStatus,
): void {
  if (canTransition(from, to)) return;

  const allowed = allowedNextStatuses(from);
  const allowedText = allowed.length
    ? allowed.map((status) => `${status}（${STATUS_LABELS[status]}）`).join('、')
    : '无（这是终态）';

  throw new Error(
    `定制单状态不能从 ${from}（${STATUS_LABELS[from]}）改为 ${to}（${STATUS_LABELS[to]}）；` +
      `允许的去向：${allowedText}`,
  );
}

/**
 * 进入某状态时该补写哪个时间戳。
 *
 * 此前这几个时间戳**散在调用各处**，于是 `inProgressAt` 有一段时间
 * **从来没被写过**（2026-09-28 才补上）。集中在这里就不会再漏。
 */
export function timestampFieldFor(
  status: CustomRecipeStatus,
): 'paymentConfirmedAt' | 'inProgressAt' | 'deliveredAt' | 'completedAt' | null {
  switch (status) {
    case CustomRecipeStatus.PAID:
      return 'paymentConfirmedAt';
    case CustomRecipeStatus.IN_PROGRESS:
      return 'inProgressAt';
    case CustomRecipeStatus.DELIVERED:
      return 'deliveredAt';
    case CustomRecipeStatus.COMPLETED:
      return 'completedAt';
    default:
      return null;
  }
}

/**
 * 子阶段与主状态的**一致性要求**（宽松校验，只拦明显的自相矛盾）。
 *
 * 刻意宽松：子阶段是**内部**标记，不同的工作方式不该被代码卡死。
 * 这里只拦"一看就不可能"的组合 —— 例如已取消的单还标着"设计中"。
 * 返回 null 表示没问题，否则返回人话原因。
 */
export function describeSubStageConflict(
  status: CustomRecipeStatus,
  subStage: CustomRecipeSubStage | null | undefined,
): string | null {
  if (!subStage) return null;

  if (status === CustomRecipeStatus.CANCELLED) {
    return '订单已取消，不该再有进行中的子阶段';
  }
  if (
    status === CustomRecipeStatus.PENDING_PAYMENT &&
    subStage !== CustomRecipeSubStage.PENDING_ACCEPT
  ) {
    return '订单还没付款，不该处于设计相关阶段';
  }
  if (
    status === CustomRecipeStatus.COMPLETED &&
    subStage !== CustomRecipeSubStage.READY_TO_DELIVER
  ) {
    // 完成后回退到"待交付"是售后改稿的正常路径，但"设计中"就矛盾了
    return '订单已完成，子阶段只应是「待交付」';
  }
  return null;
}

/**
 * 按主状态推断一个**合理的默认子阶段**（供接单、开始设计等动作使用）。
 *
 * 只是为了后台工作台有个可显示的标记；不确定时返回 null，
 * 不硬猜（猜错会让后台待办队列失真）。
 */
export function suggestSubStage(
  status: CustomRecipeStatus,
): CustomRecipeSubStage | null {
  switch (status) {
    case CustomRecipeStatus.PAID:
      return CustomRecipeSubStage.PENDING_ACCEPT;
    case CustomRecipeStatus.IN_PROGRESS:
      return CustomRecipeSubStage.DESIGNING;
    case CustomRecipeStatus.DELIVERED:
    case CustomRecipeStatus.COMPLETED:
      return CustomRecipeSubStage.READY_TO_DELIVER;
    default:
      return null;
  }
}

/**
 * 自动完成的判定（2026-10-16，批次 4.1）。
 *
 * ## 为什么单独抽出来
 *
 * 定时任务最怕的就是"边界写错，半夜批量改错状态" ——
 * 而这类错**很难在事后发现**：顾客不会因为订单被提前完成来投诉，
 * 他只会觉得"我还没确认怎么就完成了"。
 *
 * 抽成纯函数之后可以**穷举边界**：没设闹钟、时间没到、时间刚到、
 * 已经完成了、已取消了、还没交付……每一种都能单独测。
 *
 * ## 判定规则
 *
 * 只有**同时**满足这三条才自动完成：
 *   ① 状态是「已交付」（顾客还没确认）
 *   ② 设了闹钟（`autoCompleteAt` 非空）
 *   ③ 闹钟时间已到（`now >= autoCompleteAt`）
 *
 * 其余情况一律**不做**，并给出人能看懂的原因 —— 日志里要能答出
 * "这一单为什么没被自动完成"。
 */
export function decideAutoComplete(input: {
  status: CustomRecipeStatus;
  autoCompleteAt: Date | null | undefined;
  now: Date;
}): { shouldComplete: boolean; reason: string } {
  if (input.status !== CustomRecipeStatus.DELIVERED) {
    return {
      shouldComplete: false,
      reason: `状态是「${STATUS_LABELS[input.status] ?? input.status}」，不在等确认`,
    };
  }

  if (!input.autoCompleteAt) {
    return {
      shouldComplete: false,
      reason: '没有设自动完成时间（可能是历史订单，或交付时配置为「不自动完成」）',
    };
  }

  if (input.now.getTime() < input.autoCompleteAt.getTime()) {
    return {
      shouldComplete: false,
      reason: `还没到点（${input.autoCompleteAt.toISOString()}）`,
    };
  }

  return { shouldComplete: true, reason: '到点且仍在等确认' };
}
