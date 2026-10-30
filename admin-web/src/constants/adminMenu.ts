import type { Component } from 'vue'
import {
  Box,
  Calendar,
  Collection,
  Connection,
  DataBoard,
  Dish,
  DocumentChecked,
  FirstAidKit,
  Food,
  Goods,
  List,
  Money,
  Operation,
  PriceTag,
  Search,
  Service,
  Setting,
  Star,
  TrendCharts,
  User,
} from '@element-plus/icons-vue'

/**
 * 后台左侧导航配置（2026-10-30 导航整理）。
 *
 * 为什么要有这份清单：
 * 以前菜单是直接写在 MainLayout.vue 里的，谁做完一个功能就往下加一条，
 * 于是 45 个入口按"开发日期"排队，售后/退款/设置各自散在 4–8 个地方。
 * 现在改成"一份清单 + 一个渲染器"：
 * · 新功能只能挂到已有分组里，想加一级分组要单独确认；
 * · 改名、调序、暂时灰显都只改这里，不用碰布局；
 * · 合并页面时，旧地址在 router 里保留 redirect，书签不会失效。
 */

export type MenuBadgeKey = 'orders' | 'stock' | 'finance'

export interface AdminMenuItem {
  key: string
  label: string
  path: string
  icon: Component
  /** 搜索用的旧名 / 近义词，例如"档案管理"能搜到"狗档案" */
  keywords?: string[]
  /** 详情页、旧地址也归到这个入口（用于高亮和面包屑） */
  aliases?: string[]
  /** 未上线：保留入口但灰显、不可点 */
  disabled?: boolean
  disabledTip?: string
  badgeKey?: MenuBadgeKey
}

export interface AdminMenuGroup {
  key: string
  label: string
  icon: Component
  badgeKey?: MenuBadgeKey
  items: AdminMenuItem[]
}

/** 工作台是单页，不放进分组 */
export const dashboardItem: AdminMenuItem = {
  key: 'dashboard',
  label: '工作台',
  path: '/dashboard',
  icon: DataBoard,
  keywords: ['首页', '仪表盘', '今天', '待办'],
}

export const adminMenuGroups: AdminMenuGroup[] = [
  {
    key: 'orders',
    label: '订单与售后',
    icon: List,
    badgeKey: 'orders',
    items: [
      {
        key: 'order-center',
        label: '订单中心',
        path: '/order-center',
        icon: List,
        keywords: ['订单', '鲜食订单', '定制订单', '补剂订单', '代客下单'],
        aliases: [
          '/orders/',
          '/custom-recipes/assisted-order',
          '/supplement-shop/orders',
        ],
      },
      {
        key: 'aftersale-center',
        label: '售后与退款',
        path: '/aftersale-center',
        icon: Service,
        keywords: ['售后', '退款', '工单', '补剂售后', '退款申请', '退款记录'],
        aliases: [
          '/refunds',
          '/custom-recipes/aftersales',
          '/custom-recipes/refunds',
          '/supplement-shop/aftersales',
          '/aftersale',
        ],
      },
      {
        key: 'schedule',
        label: '排期日历',
        path: '/custom-recipes/schedule',
        icon: Calendar,
        keywords: ['排期', '日历', '接单', '休息日'],
      },
    ],
  },
  {
    key: 'customers',
    label: '顾客与客服',
    icon: User,
    items: [
      {
        key: 'customers',
        label: '顾客',
        path: '/users',
        icon: User,
        keywords: ['用户管理', '用户', '客户', '顾客列表'],
      },
      {
        key: 'dogs',
        label: '狗档案',
        path: '/dogs',
        icon: PriceTag,
        keywords: ['档案管理', '档案', '狗', '品种', '健康档案'],
        aliases: ['/dogs/', '/breeds'],
      },
      {
        key: 'weight-goal-plan',
        label: '体重管理计划',
        path: '/weight-goal-plan',
        icon: TrendCharts,
        keywords: ['体重', '增减重', '热量'],
        disabled: true,
        disabledTip: '功能还没上线，上线后开放',
      },
      {
        key: 'dog-profile-analytics',
        label: '转化分析',
        path: '/analytics/dog-profile',
        icon: DataBoard,
        keywords: ['转化', '漏斗', '建档', '分析'],
      },
      {
        key: 'customer-service',
        label: '客服会话',
        path: '/customer-service',
        icon: Service,
        keywords: ['客服', '会话', '咨询'],
        disabled: true,
        disabledTip: '客服功能还没正式启用，上线后开放',
      },
    ],
  },
  {
    key: 'recipes',
    label: '食谱与原料',
    icon: Food,
    items: [
      {
        key: 'recipe-designer',
        label: '食谱设计',
        path: '/recipe-designer',
        icon: Food,
        keywords: ['食谱', '配方', '设计器', '食谱列表', '新建食谱'],
        aliases: ['/recipe-designer/', '/order-design/', '/recipes'],
      },
      {
        key: 'ingredients',
        label: '原料库',
        path: '/ingredients',
        icon: Goods,
        keywords: ['原料', '食材', '营养治理', '标签', 'AI 添加原料'],
        aliases: ['/ingredients/', '/nutrition-governance', '/ingredient-tags'],
      },
      {
        key: 'nutrition-standards',
        label: '营养标准',
        path: '/nutrition-standards',
        icon: DocumentChecked,
        keywords: ['FEDIAF', '标准', '就绪度', '目标值', '营养'],
        aliases: ['/nutrition-standards/'],
      },
      {
        key: 'reviews',
        label: '评价管理',
        path: '/reviews',
        icon: Star,
        keywords: ['评价', '评分', '留言'],
        disabled: true,
        disabledTip: '食谱评价还没上线，上线后开放',
      },
      {
        key: 'search-governance',
        label: '搜索治理',
        path: '/search-governance',
        icon: Search,
        keywords: ['搜索', '别名', '词库', '建议'],
        disabled: true,
        disabledTip: '内部工具，暂不开放',
      },
    ],
  },
  {
    key: 'goods',
    label: '商品与库存',
    icon: Box,
    badgeKey: 'stock',
    items: [
      {
        key: 'supplement-shop',
        label: '补剂',
        path: '/supplement-shop',
        icon: FirstAidKit,
        keywords: ['补剂', '看板', '上架', '等价组', '分装', '包材', '商城'],
        aliases: ['/supplement-shop/'],
      },
      {
        key: 'tasting-pack',
        label: '试吃装',
        path: '/tasting-pack',
        icon: Dish,
        keywords: ['试吃', '试吃装', '备货', '现货'],
        aliases: ['/tasting-pack/'],
      },
      {
        key: 'inventory',
        label: '库存',
        path: '/inventory',
        icon: Box,
        keywords: ['库存', '盘点', '安全库存', '补货'],
      },
      {
        key: 'production',
        label: '生产',
        path: '/production',
        icon: Operation,
        keywords: ['生产', '批次', '制作'],
      },
    ],
  },
  {
    key: 'finance',
    label: '采购与财务',
    icon: Money,
    badgeKey: 'finance',
    items: [
      {
        key: 'purchasing',
        label: '采购',
        path: '/purchasing',
        icon: List,
        keywords: ['采购', '采购单', '采购历史', '进货'],
        aliases: ['/purchasing/lists', '/purchasing/history'],
      },
      {
        key: 'reimbursements',
        label: '报销',
        path: '/purchasing/reimbursements',
        icon: Money,
        keywords: ['报销', '费用', '付款'],
        aliases: ['/purchasing/reimbursements/'],
      },
      {
        key: 'finance',
        label: '财务',
        path: '/finance',
        icon: Money,
        keywords: ['财务', '费用', '经营贡献', '收款', '付款'],
        aliases: ['/finance/'],
      },
    ],
  },
  {
    key: 'settings',
    label: '设置',
    icon: Setting,
    items: [
      {
        key: 'pricing',
        label: '成本与定价',
        path: '/settings/pricing',
        icon: PriceTag,
        keywords: [
          '全局配置',
          '定价',
          '成本',
          '定制设置',
          '补剂设置',
          '试吃设置',
        ],
      },
      {
        key: 'payment',
        label: '支付与客服',
        path: '/settings/payment',
        icon: Connection,
        keywords: ['支付配置', '客服配置', '微信支付', '回调'],
      },
      {
        key: 'options',
        label: '选项与文案',
        path: '/settings/options',
        icon: Collection,
        keywords: ['选项字典', '下拉', '状态文案', '枚举'],
      },
      {
        key: 'ai',
        label: 'AI 配置',
        path: '/settings/ai',
        icon: Setting,
        keywords: ['AI', 'Agent', '模型', '提示词', '生图'],
      },
    ],
  },
]

/** 常用置顶：默认 4 个，改这里即可 */
export const pinnedMenuKeys = [
  'order-center',
  'recipe-designer',
  'dogs',
  'ingredients',
]

export interface FlatMenuItem extends AdminMenuItem {
  groupKey: string
  groupLabel: string
}

/** 展开成一份平铺清单，搜索 / 面包屑 / 高亮都用它 */
export const flatMenuItems: FlatMenuItem[] = [
  {
    ...dashboardItem,
    groupKey: 'dashboard',
    groupLabel: '工作台',
  },
  ...adminMenuGroups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupKey: group.key,
      groupLabel: group.label,
    })),
  ),
]

export const pinnedMenuItems = pinnedMenuKeys
  .map((key) => flatMenuItems.find((item) => item.key === key))
  .filter((item): item is FlatMenuItem => Boolean(item))

export function findMenuItemByKey(key: string) {
  return flatMenuItems.find((item) => item.key === key) || null
}

/**
 * 当前地址属于哪个菜单入口。
 * 先看精确匹配，再看 aliases（详情页/旧地址），最后按最长路径前缀匹配。
 */
export function resolveMenuLocation(path: string): FlatMenuItem | null {
  const exact = flatMenuItems.find((item) => item.path === path)
  if (exact) return exact

  let best: FlatMenuItem | null = null
  let bestLength = -1

  for (const item of flatMenuItems) {
    for (const alias of item.aliases || []) {
      if (
        (path === alias || path.startsWith(alias.endsWith('/') ? alias : `${alias}/`)) &&
        alias.length > bestLength
      ) {
        best = item
        bestLength = alias.length
      }
    }
  }
  if (best) return best

  for (const item of flatMenuItems) {
    if (path.startsWith(`${item.path}/`) && item.path.length > bestLength) {
      best = item
      bestLength = item.path.length
    }
  }

  return best
}

export function resolveActiveMenuPath(path: string): string {
  return resolveMenuLocation(path)?.path || path
}

export function resolveMenuGroup(
  item: FlatMenuItem | null,
): AdminMenuGroup | null {
  if (!item || item.groupKey === 'dashboard') return null
  return adminMenuGroups.find((group) => group.key === item.groupKey) || null
}

/** 搜索：中文名、旧名、路径都能命中；灰显项也返回，方便解释为什么点不了 */
export function searchMenuItems(keyword: string): FlatMenuItem[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return []
  return flatMenuItems
    .filter((item) => {
      const haystack = [
        item.label,
        item.path,
        item.groupLabel,
        ...(item.keywords || []),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
    .slice(0, 10)
}
