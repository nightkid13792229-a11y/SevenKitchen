import { computed, ref, type Ref } from 'vue'
import {
  buildLifeStageReminderText,
  fetchLifeStageMatch,
  isLifeStageMismatch,
  type LifeStageMatchVerdict,
} from '@/utils/life-stage-match'

/**
 * 生命阶段匹配 · 公共状态（2026-10-18）
 *
 * ## 它替掉了什么
 *
 * 这段状态在**四个页面**里各写了一遍：
 * 详情页 / 成品订购 / DIY 配置 / DIY 制作单。
 * 四份加起来 21 个 computed + 13 个函数，而且**同一件事四种说法** ——
 * 比如"没拿到后端结论"这一种情况，四个页面的处理都不太一样。
 *
 * UI 已经在 2026-10-18 收成 `LifeStageVersionCard` 一个组件了；
 * 这个 composable 收的是**它背后的数据**。
 *
 * ## 它不做什么
 *
 * **不判定匹配**。`isLifeStageMismatch` 和 `verdict.message` 都来自
 * `utils/life-stage-match.ts` 与后端 —— 这里只是把结论摆成页面好用的形状。
 *
 * ## 目前谁在用（诚实标注，2026-10-18）
 *
 * | 页面 | 状态 | 数据来源 |
 * |---|---|---|
 * | **DIY 制作单** | ✅ 已接入 | 自己 `fetchLifeStageMatch` |
 * | 详情页 | ⏳ 未接 | 结论**内嵌在配方接口**里（`recipe.lifeStageMatch`），不单独请求 |
 * | DIY 配置页 | ⏳ 未接 | `isLifeStageMatch` 是**可变 ref**，实际值在别处赋 |
 * | 成品订购页 | ⏳ 未接 | 自己 fetch，但**请求时机不同**（选狗变化时要重查） |
 *
 * **为什么没有一次接完**：这四页的**界面**已经统一（都用 `LifeStageVersionCard`），
 * 但**数据流确实不一样** —— 有的内嵌、有的后赋、有的在选狗变化时重查。
 * 硬塞进一个 composable 要改三页的请求时机，那是真重构，不是机械替换。
 * **半途而废比不接更糟**，所以宁可先接一页、把边界写清楚。
 *
 * ## 用法
 *
 * ```ts
 * const { verdict, isMatch, reminderText, checkFailed, check } =
 *   useLifeStageVersion({
 *     recipeId: () => recipe.value?.recipeId,
 *     dogId: () => dogId.value,
 *     applicableStages: () => recipe.value?.applicableLifeStages,
 *     dogName: () => dog.value?.name,
 *   })
 * ```
 *
 * 参数都是**函数**而不是值 —— 因为页面里这些来源是响应式的，
 * 传值会让 composable 永远看到第一次的快照。
 */
export function useLifeStageVersion(options: {
  /** 食谱 id；为空时不查（还没有食谱没什么可匹配的） */
  recipeId: () => string | null | undefined
  /** 狗狗 id；为空时不查 */
  dogId: () => string | null | undefined
  /** 食谱适用阶段（兜底文案里用，后端没给 message 时才用到） */
  applicableStages?: () => unknown
  /** 狗狗名字（兜底文案里用） */
  dogName?: () => string | null | undefined
  /**
   * 当前选中的食谱版本（生命阶段）。
   *
   * ⚠️ **只有 DIY 配置页需要**（2026-10-18 对比得出）：
   * 那页允许顾客手动切版本，切完要按**新版**重新判定是否匹配，
   * 所以请求要带上 `lifeStage`。其它页不传即可。
   */
  lifeStage?: () => string | null | undefined
  /**
   * 拿到结论后的回调（可选）。
   *
   * ⚠️ DIY 配置页每次拿到结论都要把 `showWarning` 置回 `true` ——
   * 否则顾客切了版本、结论变了，提醒却不弹了。
   */
  onVerdict?: (verdict: LifeStageMatchVerdict | null) => void
}) {
  /**
   * 先解构再使用。
   *
   * 这不只是风格问题：项目守卫 `no-undefined-identifiers` 的正则
   * 会把 `options.recipeId()` 这类链式调用误读成 `options()`，
   * 于是报"调用了却没定义"。解构后没有这个前缀，守卫就不误报了。
   */
  const { recipeId, dogId, applicableStages, dogName, lifeStage, onVerdict } = options

  const verdict = ref<LifeStageMatchVerdict | null>(null) as Ref<LifeStageMatchVerdict | null>

  /**
   * 没能拿到后端结论。
   *
   * **单独一个标记**而不是"verdict 为 null 就算失败" ——
   * 因为"还没开始查"和"查了但失败"要区分：
   * 前者不该显示任何提示，后者必须显示"暂时无法确认"。
   */
  const checkFailed = ref(false)

  /** 后端算出的「这只狗需要哪个生命阶段」 */
  const dogLifeStage = computed(() => verdict.value?.dogLifeStage || '')

  /**
   * 是否匹配。
   *
   * ⚠️ 拿不到结论时返回 `true`（不拦）—— 这是**刻意**的：
   * 网络抖动不该把顾客挡在下单/生成制作单之外。
   * 但页面要同时看 `checkFailed`，把"无法确认"如实说出来，
   * 而不是假装匹配。
   */
  const isMatch = computed(() => {
    const current = verdict.value
    if (!current) return true
    return !isLifeStageMismatch(current.matchType)
  })

  /**
   * 提醒文案。
   *
   * 优先用后端给的 `message`（它知道"为什么没匹配上"）；
   * 后端没给才用本地兜底 —— 兜底依赖食谱的适用阶段与狗狗阶段。
   */
  const reminderText = computed(() => {
    if (verdict.value?.message) return verdict.value.message
    return buildLifeStageReminderText({
      applicableStages: applicableStages?.() ?? [],
      dogLifeStage: dogLifeStage.value,
      dogName: dogName?.() ?? undefined,
    })
  })

  /**
   * 向后端要一次结论。
   *
   * 失败**不抛错**，只把 `checkFailed` 置真 —— 由页面决定怎么提示。
   */
  async function check(): Promise<void> {
    const currentRecipeId = recipeId()
    const currentDogId = dogId()
    if (!currentRecipeId || !currentDogId) {
      /**
       * 没有食谱或没有狗 —— **要重置**，不是直接返回。
       *
       * ⚠️ 这一点是 DIY 配置页的做法（2026-10-18 对比得出）：顾客把狗取消选中后，
       * 上一次的结论还挂在页面上会显示"不匹配"，属于假警报。所以要清干净。
       */
      verdict.value = null
      checkFailed.value = false
      onVerdict?.(null)
      return
    }

    const result = await fetchLifeStageMatch({
      recipeId: currentRecipeId,
      dogId: currentDogId,
      ...(lifeStage?.() ? { lifeStage: lifeStage() as string } : {}),
    })
    verdict.value = result
    checkFailed.value = !result
    onVerdict?.(result)
  }

  /** 供"切换狗狗后重新查"这类场景使用 */
  function reset() {
    verdict.value = null
    checkFailed.value = false
  }

  return {
    verdict,
    checkFailed,
    dogLifeStage,
    isMatch,
    reminderText,
    check,
    reset,
  }
}
