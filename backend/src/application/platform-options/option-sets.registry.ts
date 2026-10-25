import { CustomRecipeStatus, TargetGoal } from '@prisma/client';

/**
 * 平台选项字典 · **选项集登记表**（2026-10-16，食谱定制重构 批次 1.3）
 *
 * ## 为什么要有这份登记表
 *
 * 选项集分成两类（见 `platform_option_set.source_type`）：
 *
 *   · `ENUM` —— 选项由代码里的 Prisma 枚举定义（代码有 if-else 依赖）。
 *     这类**必须**在代码里登记，因为服务启动时要照着它去 upsert、
 *     并检查「枚举值与字典项是否一一对应」。
 *   · `DATA` —— 选项纯粹是数据，后台可自由增删。这里只给一份**初始值**，
 *     之后以数据库为准（重启不会把手改的内容覆盖回去）。
 *
 * ## 为什么 ENUM 类要做「启动时自动同步」
 *
 * 「加了枚举忘了加文案」是这次重构要根治的病之一 ——
 * 2026-10-04 加「已取消」时漏了两处半，顾客在订单列表里看到英文 `CANCELLED`。
 *
 * Prisma 生成的客户端会在**运行时导出枚举对象**（实测：
 * `export const CustomRecipeStatus = { PENDING_PAYMENT: 'PENDING_PAYMENT', … }`），
 * 所以启动时可以遍历它，把缺的行补上 —— 这类疏漏从此不可能发生。
 */

/** 选项集的来源类型 */
export type OptionSetSourceType = 'ENUM' | 'DATA';

export interface OptionSeedItem {
  code: string;
  label: string;
  description?: string;
  tone?: string;
  icon?: string;
  sortOrder?: number;
  isDefault?: boolean;
  extra?: Record<string, unknown>;
}

export interface OptionSetDefinition {
  code: string;
  name: string;
  description?: string;
  sourceType: OptionSetSourceType;
  /** sourceType=ENUM 时必填：代码里 Prisma 枚举的名字 */
  enumName?: string;
  /** sourceType=DATA 时的初始项；ENUM 类的标签配在这里（缺失的会自动补成英文码并告警） */
  seed?: OptionSeedItem[];
}

/**
 * 色彩档位（前端据此选样式类，**不写死颜色值**）。
 * 换配色只改前端样式，不用动数据库。
 */
export const OPTION_TONES = [
  'neutral',
  'info',
  'progress',
  'success',
  'warning',
  'danger',
] as const;
export type OptionTone = (typeof OPTION_TONES)[number];

/**
 * Prisma 枚举对象 → 名字。
 *
 * 刻意**显式列出**而不是动态 `require`：这样加一个选项集时，
 * TypeScript 会在这里报错提醒你登记，不会静默漏掉。
 */
export const ENUM_SOURCES: Record<
  string,
  Record<string, string>
> = {
  CustomRecipeStatus,
  TargetGoal,
};

/** 定制订单状态（主状态，顾客看的那六档） */
export const CUSTOM_RECIPE_STATUS_SET = 'custom_recipe_status';

/**
 * 定制售后类型选项集（2026-10-16 批次 2.5）。
 *
 * 售后类型**不写死在代码里**：老板想加一类"要发票"或改个说法，
 * 后台改一次就行，不用发版 —— 这正是批次 1.3 建字典的用处。
 */
export const CUSTOM_RECIPE_AFTERSALE_TYPE_SET = 'custom_recipe_aftersale_type';

/**
 * 定制退款原因（2026-10-25）。
 * 顾客在退款页选择；后台可以改说法/加一项，不用发版。
 */
export const CUSTOM_RECIPE_REFUND_REASON_SET = 'custom_recipe_refund_reason';

export const OPTION_SET_DEFINITIONS: readonly OptionSetDefinition[] = [
  {
    code: CUSTOM_RECIPE_STATUS_SET,
    name: '定制订单状态',
    description: '顾客与后台看到的订单状态；文案与色彩档位由这里下发',
    sourceType: 'ENUM',
    enumName: 'CustomRecipeStatus',
    seed: [
      {
        code: 'PENDING_PAYMENT',
        label: '待付款',
        tone: 'warning',
        sortOrder: 10,
      },
      // 2026-10-18 · 需求 2.6.4：已付款是**橙**，不是蓝
      { code: 'PAID', label: '已付款', tone: 'progress', sortOrder: 20 },
      /**
       * 2026-10-18 · 需求 2.6.1：顾客看到的**只有 6 个说法**。
       *
       * `IN_PROGRESS` 在顾客眼里就是「已付款」——
       * "制作中"是**内部进度**，不该成为顾客可见的第 7 个词。
       * （进度条里仍然有"制作中"这个步骤名，那是两回事。）
       */
      {
        code: 'IN_PROGRESS',
        label: '已付款',
        tone: 'progress',
        sortOrder: 30,
      },
      { code: 'DELIVERED', label: '已交付', tone: 'success', sortOrder: 40 },
      /**
       * 2026-10-16（批次 1.2）新增的这一档。
       *
       * 加它的**同一轮**就在这里补了标签 —— 这正是启动同步机制要保证的事：
       * 忘了配也不会漏到顾客眼前（会自动补一行并在启动日志里 warn）。
       * 对照 2026-10-04 加「已取消」时，三个端漏了两处半。
       */
      // 2026-10-18 · 需求 2.6.4：已完成是**灰**（事情结束了，不需要再吸引注意）
      { code: 'COMPLETED', label: '已完成', tone: 'info', sortOrder: 50 },
      /**
       * 2026-10-04 新增的这一档，当时三个端漏了两处半。
       * 现在它有唯一来源 —— 就是这一行。
       */
      // ⚠️ 用 muted 不用 neutral：组件的 CSS 类名是 `--muted`，`neutral` 匹配不到任何背景色
      { code: 'CANCELLED', label: '已取消', tone: 'muted', sortOrder: 60 },
    ],
  },

  {
    code: 'custom_recipe_goal',
    name: '定制目标',
    description: '顾客在定制页选的方向',
    /**
     * ⚠️ 目前是 ENUM：`custom_recipe_order.target_goal` 列是枚举类型，
     * 想「加一个目标不用改库」需要先把那列改成字符串 —— 属于后续步骤。
     * 现在先拿到最大的一块收益：**前端不再各写一份中文**（实测存量 16 处）。
     */
    sourceType: 'ENUM',
    enumName: 'TargetGoal',
    seed: [
      { code: 'LOSE_WEIGHT', label: '减重', tone: 'warning', sortOrder: 10 },
      { code: 'MAINTAIN', label: '维持体重', tone: 'info', sortOrder: 20 },
      { code: 'GAIN_WEIGHT', label: '增重', tone: 'progress', sortOrder: 30 },
      {
        code: 'HEALTH_SUPPORT',
        label: '健康管理',
        tone: 'success',
        sortOrder: 40,
      },
    ],
  },

  {
    code: 'custom_recipe_current_food',
    name: '目前在喂什么',
    description: '定制页必填：决定过渡方案怎么写',
    /**
     * 为什么是 DATA 而不是 ENUM：库里存的是 VARCHAR(32)，不是枚举列 ——
     * 以后加一种喂法（比如"冻干"）**不用改库**，加一条选项就行。
     */
    sourceType: 'DATA',
    seed: [
      { code: 'DRY', label: '干粮', tone: 'info', sortOrder: 10 },
      { code: 'WET', label: '湿粮或罐头', tone: 'info', sortOrder: 20 },
      { code: 'HOMEMADE', label: '自制/商业鲜食', tone: 'info', sortOrder: 30 },
      { code: 'RAW', label: '生骨肉', tone: 'info', sortOrder: 40 },
      { code: 'MIXED', label: '混着喂', tone: 'info', sortOrder: 50 },
      { code: 'OTHER', label: '其他', tone: 'info', sortOrder: 60 },
    ],
  },

  {
    code: 'custom_recipe_change_reason',
    name: '定制原因',
    description: '定制页必填（多选）：直接决定配方方向',
    sourceType: 'DATA',
    seed: [
      { code: 'HEALTHIER', label: '更健康', tone: 'success', sortOrder: 10 },
      { code: 'MEDICAL', label: '疾病调理', tone: 'warning', sortOrder: 20 },
      { code: 'PICKY', label: '挑食', tone: 'warning', sortOrder: 30 },
      // 选它会要求顾客手填原因（changeReasonOther）
      { code: 'OTHER', label: '其他', tone: 'info', sortOrder: 40 },
    ],
  },

  {
    code: 'custom_recipe_stomach',
    name: '最近肠胃情况',
    description: '定制页选填（多选）：换粮最常见的诱因',
    sourceType: 'DATA',
    seed: [
      { code: 'NORMAL', label: '正常', tone: 'success', sortOrder: 10 },
      { code: 'SOFT', label: '软便', tone: 'warning', sortOrder: 20 },
      { code: 'CONSTIPATION', label: '便秘', tone: 'warning', sortOrder: 30 },
      { code: 'VOMIT', label: '呕吐', tone: 'warning', sortOrder: 40 },
      { code: 'TRANSITION_DIARRHEA', label: '换粮拉稀', tone: 'warning', sortOrder: 50 },
      { code: 'OTHER', label: '其他', tone: 'info', sortOrder: 60 },
    ],
  },

  {
    code: 'custom_recipe_aftersale_type',
    name: '定制售后类型',
    description: '顾客提交售后时可选的类型',
    sourceType: 'DATA',
    seed: [
      {
        code: 'QUESTION',
        label: '问个问题',
        description: '食材买不到、不知道怎么换、做法不清楚',
        tone: 'info',
        icon: '💬',
        sortOrder: 10,
        isDefault: true,
      },
      {
        code: 'ADJUST_RECIPE',
        label: '调整食谱',
        description: '喂了之后不太适应，希望营养师改一版',
        tone: 'warning',
        icon: '🔄',
        sortOrder: 20,
      },
      {
        code: 'OTHER',
        label: '其他意见',
        description: '沟通、交付速度等',
        tone: 'neutral',
        icon: '📝',
        sortOrder: 30,
      },
    ],
  },

  {
    code: 'custom_recipe_refund_reason',
    name: '定制退款原因',
    description: '顾客申请退款时可选的原因；后台可调整文案',
    sourceType: 'DATA',
    seed: [
      {
        code: 'NOT_EXPECTED',
        label: '与预期不符',
        tone: 'warning',
        sortOrder: 10,
        isDefault: true,
      },
      { code: 'TASTE', label: '口味不合适', tone: 'info', sortOrder: 20 },
      { code: 'DOG_UNWELL', label: '狗狗不适应', tone: 'warning', sortOrder: 30 },
      { code: 'OTHER', label: '其他', tone: 'info', sortOrder: 40 },
    ],
  },

  {
    code: 'custom_recipe_delivery_item',
    name: '定制交付物',
    description: '交付给顾客的内容清单；后台可开关',
    sourceType: 'DATA',
    seed: [
      {
        code: 'RECIPE',
        label: '专属食谱',
        description: '食材配比、营养成分、每天喂多少',
        icon: '📋',
        sortOrder: 10,
        isDefault: true,
        extra: { required: true },
      },
      {
        code: 'SHOPPING_SOP',
        label: '采购与制作单',
        description: '要买什么、买多少、怎么做',
        icon: '🛒',
        sortOrder: 20,
        isDefault: true,
      },
      {
        code: 'NUTRITION_REPORT',
        label: '营养评估报告',
        description: '营养是否达标，附一句白话结论',
        icon: '📊',
        sortOrder: 30,
        isDefault: true,
      },
    ],
  },

  {
    code: 'activity_level',
    name: '活动量档位',
    description: '补确认时顾客选的活动量；`extra.factor` 供后端算能量用',
    sourceType: 'DATA',
    seed: [
      { code: 'LOW', label: '很少动', sortOrder: 10 },
      { code: 'NORMAL', label: '城市日常', sortOrder: 20, isDefault: true },
      { code: 'HIGH', label: '运动量大', sortOrder: 30 },
      { code: 'VERY_HIGH', label: '工作犬', sortOrder: 40 },
    ],
  },

  {
    code: 'meal_count',
    name: '每日餐数',
    description: '补确认时顾客选的每天喂几餐',
    sourceType: 'DATA',
    seed: [
      { code: '1', label: '1 餐', sortOrder: 10 },
      { code: '2', label: '2 餐', sortOrder: 20, isDefault: true },
      { code: '3', label: '3 餐', sortOrder: 30 },
      { code: '4', label: '4 餐', sortOrder: 40 },
      { code: '5', label: '5 餐', sortOrder: 50 },
    ],
  },
] as const;

export function findOptionSetDefinition(
  code: string,
): OptionSetDefinition | undefined {
  return OPTION_SET_DEFINITIONS.find((set) => set.code === code);
}
