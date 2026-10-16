/**
 * 渲染契约 · 三件套（2026-10-16，食谱定制重构 批次 1.5）
 *
 * ## 这是什么
 *
 * 老板的要求是「**前端只负责渲染和呈现**」。要做到这一点，
 * 光把"计算"搬到后端还不够 —— 前端还得自己判断：
 * "这个状态该显示什么颜色"、"这个按钮现在能不能点"、"为什么不能点"、
 * "进度到哪一步了"。这些判断散在各端，就是"改一处漏三处"的根源。
 *
 * 这三件套把那些判断也收成**后端下发的数据**：
 *
 *   · `RenderableStatus`   —— 状态码 + 中文 + 色彩档位 + 一句给顾客的说明
 *   · `RenderableAction[]` —— 现在能做什么：按钮文案、能不能点、为什么不能点、
 *                             点了要不要二次确认、是不是危险操作
 *   · `RenderableProgress` —— 进度时间轴：每个节点的文案、是否完成、时间
 *
 * 前端拿到之后**遍历渲染**，不做任何业务判断。
 *
 * ## 一条贯穿的设计口径：`tone` 是语义档位，不是颜色值
 *
 * `tone` 取 `neutral | info | progress | success | warning | danger`，
 * 前端把档位映射到自己的样式类。这样换配色不用改后端，
 * 而后端也不必知道前端用的是什么组件库。
 */

/** 色彩档位（与选项字典共用同一套口径，见 platform-options 的 OPTION_TONES） */
export type RenderableTone =
  | 'neutral'
  | 'info'
  | 'progress'
  | 'success'
  | 'warning'
  | 'danger';

/**
 * 可直接渲染的状态。
 *
 * `customerHint` 是**一句给顾客的话**（"我们正在设计，预计 X 月 X 日前给你"），
 * 而不是状态名的重复 —— 顾客看到"制作中"三个字仍然不知道要等多久。
 */
export interface RenderableStatus {
  /** 状态码，例如 PENDING_PAYMENT */
  code: string;
  /** 中文，例如「待付款」 */
  label: string;
  /** 色彩档位 */
  tone: RenderableTone;
  /** 一句给顾客的说明；没有合适的话时为 null（前端不显示） */
  customerHint?: string | null;
}

/**
 * 可直接渲染的动作。
 *
 * ⚠️ **`enabled` 是后端算好的**，包含三件事：业务状态允不允许、
 * 角色有没有权限、业务规则（窗口/次数）满不满足。
 * 前端**不许**再判断 `role === 'ADMIN'` 或 `status === 'PAID'`。
 *
 * ⚠️ **禁用时必须给 `disabledReason`**：一个点不动又不说话的按钮，
 * 顾客只会以为系统坏了。这条在测试里是被断言的。
 */
export interface RenderableAction {
  /** 动作码，例如 CONFIRM_RECEIPT / APPLY_AFTERSALE */
  code: string;
  /** 按钮文案，例如「确认收到」 */
  label: string;
  /** 能不能点（后端算好） */
  enabled: boolean;
  /** 不能点时给顾客看的原因；`enabled=true` 时可以为空 */
  disabledReason?: string | null;
  /** 二次确认文案；为空表示不需要确认 */
  confirmText?: string | null;
  /** 是不是危险操作（前端用红色） */
  danger?: boolean;
  /** 按钮样式建议 */
  style?: 'primary' | 'ghost' | 'line';
}

/** 进度时间轴的一个节点 */
export interface RenderableProgressStep {
  code: string;
  label: string;
  /** 是否已完成 */
  done: boolean;
  /** 是否是当前所处的一步 */
  active?: boolean;
  /** 完成时间（ISO）；未完成时为 null */
  at?: string | null;
  /** 这一步的补充说明 */
  note?: string | null;
}

/**
 * 可直接渲染的进度。
 *
 * 时间轴的**节点集合与文案由后端决定** —— 后台加一个内部环节，
 * 只要后端加一个节点，小程序不用发版。
 */
export interface RenderableProgress {
  /** 当前节点 code */
  current: string;
  timeline: RenderableProgressStep[];
}

/**
 * 把一个「订单类」响应组装成前端可直接渲染的形态。
 *
 * 各接口只要把这三样塞进响应体，前端就能零判断地渲染。
 */
export interface RenderableOrderView {
  status: RenderableStatus;
  actions: RenderableAction[];
  progress?: RenderableProgress;
}
