import { computed, ref } from 'vue'
import {
  DEFAULT_ORDER_CYCLE_DAYS,
  MIN_PACKAGE_SPEC_G,
  buildDefaultPackagePlan,
  type PackagePlanItem,
} from '@/utils/order-package-plan'

/**
 * 分装计划 · 公共状态（2026-10-18）
 *
 * ## 为什么抽它
 *
 * 「顾客自己定每袋多少克、多少袋」这套状态，在 **成品订购页** 和 **DIY 配置页**
 * 里各写了一遍 —— 而且**一字不差**：
 *
 * ```ts
 * const selectedCycleDays = ref<number | null>(DEFAULT_ORDER_CYCLE_DAYS)
 * const lastSelectedCycleDays = ref(DEFAULT_ORDER_CYCLE_DAYS)
 * const packagePlan = ref<PackagePlanItem[]>([])
 * const packagePlanDogId = ref<string | null>(null)
 * const showPackageEditor = ref(false)
 * const isCustomPackagePlan = ref(false)
 * ```
 *
 * 加上 **9 个同名函数**（`rebuildPackagePlan` / `togglePackageEditor` /
 * `cancelCustomPackagePlan` / `addPackagePlanRow` / `updatePackagePlanRow` /
 * `removePackagePlanRow` / `normalizePackagePlanRow` / `normalizePackageSpecValue` /
 * `getPrimaryPackageSpecG`）。
 *
 * 两份实现漂移过一次就会出"同一个操作在两个页面行为不同"的问题。
 *
 * ## 它不做什么
 *
 * **不算价格、不下单**。价格由后端算（本项目硬规矩）；
 * 这里只管"顾客填了什么"，以及把填写内容整理成后端要的形状。
 *
 * ## 参数为什么是函数
 *
 * `dailyIntakeG` / `mealsPerDay` 来自页面的响应式数据（会随选狗、选周期变化）。
 * 传值会让 composable 永远看到第一次的快照 —— 这是抽 composable 最容易踩的坑。
 *
 * ## ⚠️ 关于"重置"
 *
 * 选狗切换时，两个页面都要把分装清空。**这个重置不放在 composable 的自动副作用里**
 * （同样是踩过的坑：隐式副作用会把调用方的守卫条件悄悄变真），
 * 而是导出 `resetPackagePlan()` 让页面在合适的位置显式调用。
 */
export function usePackagePlan(options: {
  /** 当前狗狗的每日摄入量（克） */
  dailyIntakeG: () => number | null | undefined
  /** 每天喂几餐 —— 缺省 2 */
  mealsPerDay?: () => number | null | undefined
  /** 当前狗狗 id（记进 `packagePlanDogId`，用于判断分装是不是这只狗的） */
  dogId?: () => string | null | undefined
  /** 每餐克数（新增一行时的默认每袋克数会参考它） */
  perMealG?: () => number | null | undefined
  /**
   * 分装被改动后的回调（**可选**）。
   *
   * ⚠️ 这个参数是被一个真回归逼出来的：
   *
   * 成品订购页原来的 `addPackagePlanRow` / `updatePackagePlanRow` / `removePackagePlanRow`
   * 末尾都会 `invalidatePackagePlanPricingPreview()` + `schedulePricePreview()` ——
   * **改分装要重新算价**。
   *
   * 而 DIY 配置页的同名函数**没有**这两句（那页不算价）。
   *
   * 两个同名函数**行为其实不一样**。抽进 composable 时如果只保留 DIY 版，
   * 订购页就会出现「顾客改完每袋克数，价格还是旧的」——**顾客会按错价格下单**。
   *
   * 所以用回调把"改完之后要做什么"交还给页面。
   */
  onPlanChanged?: () => void
  /**
   * 进入「自定义分装」时是否**清空天数选择**（默认 `false`）。
   *
   * ⚠️ 这是两个页面**真实的产品差异**，不是实现细节：
   *
   * · **成品订购页要清** —— 顾客既然自己定每袋多少克、多少袋，
   *   "按 7 天配送"就不再是约束条件了，留着会让人以为还按天数算
   * · **DIY 配置页不清** —— 那页的天数还参与饭量/用量换算
   *
   * 一开始我把两个页面的 `togglePackageEditor` 当成"一字不差"合并了，
   * 结果订购页少了这一句 —— 表现为**进入自定义分装后天数还显示着**，容易误导。
   */
  clearCycleOnCustom?: boolean
}) {
  // 参数解构（链式调用会被项目守卫误读成 `options()`，见 useLifeStageVersion 里的同类说明）
  const { dailyIntakeG, mealsPerDay, dogId, perMealG, onPlanChanged, clearCycleOnCustom } =
    options

  /** 配送周期（7 / 15 / 30 天） */
  const selectedCycleDays = ref<number | null>(DEFAULT_ORDER_CYCLE_DAYS)
  /**
   * 上一次**非自定义**的周期。
   *
   * 用途：顾客切到自定义分装后，周期输入被禁用；点"取消自定义"要能**回到他之前选的那个周期**，
   * 而不是一律回到 7 天。
   */
  const lastSelectedCycleDays = ref(DEFAULT_ORDER_CYCLE_DAYS)

  const packagePlan = ref<PackagePlanItem[]>([])
  /** 这份分装是按哪只狗算的 —— 换狗后必须重算，否则会拿旧狗的饭量分装 */
  const packagePlanDogId = ref<string | null>(null)

  const showPackageEditor = ref(false)
  /** 是否处于"顾客自己定"模式 */
  const isCustomPackagePlan = ref(false)

  /** 每袋克数的合法化：非数字/负数/0 一律按 0 处理（0 表示"还没填"，不是"填了 0 克"） */
  function normalizePackageSpecValue(
    value: string | number | null | undefined,
  ): number {
    const normalized = Math.floor(Number(value))
    return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
  }

  function normalizePackagePlanRow(row: PackagePlanItem): PackagePlanItem {
    return {
      packageSpecG: normalizePackageSpecValue(row.packageSpecG),
      packageCount: Math.max(1, Math.floor(Number(row.packageCount) || 1)),
    }
  }

  /** 按当前饭量/周期重算默认分装 */
  function rebuildPackagePlan() {
    packagePlan.value = buildDefaultPackagePlan({
      dailyIntakeG: dailyIntakeG() ?? 0,
      mealsPerDay: mealsPerDay?.() ?? 2,
      days: selectedCycleDays.value,
    })
    packagePlanDogId.value = dogId?.() ?? null
    onPlanChanged?.()
  }

  /** 清空分装（换狗时由页面显式调用） */
  function resetPackagePlan() {
    packagePlan.value = []
    packagePlanDogId.value = null
    isCustomPackagePlan.value = false
    showPackageEditor.value = false
  }

  /**
   * 点「自定义分装」/ 点「取消自定义」。
   *
   * 取消时**要二次确认** —— 会丢掉顾客填的每袋克数与袋数。
   */
  function togglePackageEditor() {
    if (isCustomPackagePlan.value) {
      // ⚠️ confirmText / cancelText 最多 4 个汉字：超出时微信既不显示弹窗也不报错，
      //    表现就是「点了没反应」（此处踩过一次）。
      uni.showModal({
        title: '取消自定义分装',
        content: '取消后你填写的每袋克数和袋数会恢复为系统默认分装。',
        confirmText: '仍要取消',
        cancelText: '继续编辑',
        success: (res) => {
          if (res.confirm) {
            cancelCustomPackagePlan()
            uni.showToast({ title: '已恢复默认分装', icon: 'none' })
          }
        },
      })
      return
    }

    lastSelectedCycleDays.value =
      selectedCycleDays.value || lastSelectedCycleDays.value
    if (clearCycleOnCustom) {
      // 顾客自己定分装，天数不再是约束 —— 清掉，免得看着以为还按天数算
      selectedCycleDays.value = null
    }
    isCustomPackagePlan.value = true
    showPackageEditor.value = true
    // 进入自定义后分装变了（要按默认重建），价格得重算
    onPlanChanged?.()
  }

  /** 取消自定义：退回上一次的非自定义周期，并重算默认分装 */
  function cancelCustomPackagePlan() {
    isCustomPackagePlan.value = false
    showPackageEditor.value = false
    selectedCycleDays.value = lastSelectedCycleDays.value
    rebuildPackagePlan()
  }

  function addPackagePlanRow() {
    const reference =
      perMealG?.() || dailyIntakeG() || 100
    packagePlan.value = [
      ...packagePlan.value,
      {
        packageSpecG: Math.max(MIN_PACKAGE_SPEC_G, Math.round(reference)),
        packageCount: 1,
      },
    ]
    onPlanChanged?.()
  }

  function updatePackagePlanRow(
    index: number,
    field: keyof PackagePlanItem,
    value: string | number,
  ) {
    const nextValue =
      field === 'packageSpecG'
        ? normalizePackageSpecValue(value)
        : Math.max(1, Math.floor(Number(value) || 1))
    packagePlan.value = packagePlan.value.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: nextValue } : row,
    )
    onPlanChanged?.()
  }

  function removePackagePlanRow(index: number) {
    // 至少留一行 —— 全删光的话顾客没有输入框可用
    if (packagePlan.value.length <= 1) {
      return
    }
    packagePlan.value = packagePlan.value.filter(
      (_, rowIndex) => rowIndex !== index,
    )
    onPlanChanged?.()
  }

  /** 袋数最多的那一行的每袋克数（用来给"主规格"一个说法） */
  function getPrimaryPackageSpecG(plan: PackagePlanItem[]): number {
    const primaryRow = [...plan].sort(
      (left, right) =>
        right.packageCount - left.packageCount ||
        right.packageSpecG - left.packageSpecG,
    )[0]
    return primaryRow?.packageSpecG || 0
  }

  /** 分装总克数（顾客填的每袋克数 × 袋数之和） */
  const packagePlanTotalG = computed(() =>
    packagePlan.value.reduce(
      (sum, row) =>
        sum + normalizePackageSpecValue(row.packageSpecG) * (row.packageCount || 0),
      0,
    ),
  )

  return {
    selectedCycleDays,
    lastSelectedCycleDays,
    packagePlan,
    packagePlanDogId,
    showPackageEditor,
    isCustomPackagePlan,
    packagePlanTotalG,
    normalizePackageSpecValue,
    normalizePackagePlanRow,
    rebuildPackagePlan,
    resetPackagePlan,
    togglePackageEditor,
    cancelCustomPackagePlan,
    addPackagePlanRow,
    updatePackagePlanRow,
    removePackagePlanRow,
    getPrimaryPackageSpecG,
  }
}
