import { computed } from 'vue'
import {
  buildLifeStageReminderText,
  getLifeStageLabel,
  type LifeStageMatchVerdict,
} from '@/utils/life-stage-match'
import {
  resolveLifeStageUiState,
  type LifeStageUiState,
} from '@/utils/life-stage-ui'

/**
 * 生命阶段匹配 · 公共状态（2026-11-02 重构）
 *
 * ## 它现在只做一件事
 *
 * 把 `/recipes/:id` 返回里的 `lifeStageMatch`（后端算好的结论）翻译成界面八态：
 * `no_dog / unknown / matched / manual_low / manual_high / fallback_low / fallback_high / legacy`。
 *
 * ## 为什么不再自己请求
 *
 * 以前订购页、DIY 页各发一次 `/life-stage-match`，和菜谱请求是两条线，
 * 先后顺序一乱就会出现"版本是甲的、结论是乙的"。现在换狗/换版都重新加载菜谱，
 * 版本与结论天然同源。
 *
 * ## 它不做什么
 *
 * **不判定匹配、不判定风险**。`riskLevel` 直接读后端；文案在 `utils/life-stage-ui.ts`。
 */
export function useLifeStageVersion(options: {
  /** 菜谱返回里的 `lifeStageMatch`（没有就传 null） */
  verdict: () => LifeStageMatchVerdict | null | undefined
  /** 当前选中的狗；为空表示"没选狗" */
  dogId: () => string | null | undefined
  /** 食谱适用阶段（兜底文案里用；后端没给 message 时才用到） */
  applicableStages?: () => unknown
  /** 狗狗名字（兜底文案里用） */
  dogName?: () => string | null | undefined
}) {
  const { verdict, dogId, applicableStages, dogName } = options

  const state = computed<LifeStageUiState>(() =>
    resolveLifeStageUiState({
      hasDog: Boolean(dogId()),
      verdict: verdict(),
    }),
  )

  /** 后端算的风险等级；没有结论时按 NONE（不拦） */
  const riskLevel = computed<'HIGH' | 'LOW' | 'NONE'>(
    () => verdict()?.riskLevel || 'NONE',
  )

  /** 这只狗该吃的版本（后端算出来的），用于"切换到 X"的文案 */
  const dogLifeStage = computed(() => verdict()?.dogLifeStage || '')

  /**
   * 是否"不需要提醒"。
   *
   * ⚠️ 拿不到结论（unknown）也返回 true —— 网络抖动不该挡住顾客；
   * 但界面会同时显示"暂时无法确认"，不假装匹配。
   */
  const isMatch = computed(
    () =>
      state.value === 'matched' ||
      state.value === 'legacy' ||
      state.value === 'no_dog' ||
      state.value === 'unknown',
  )

  /** 当前展示的版本中文名 */
  const selectedLabel = computed(() => {
    const current = verdict()
    return (
      current?.selectedLifeStageLabel ||
      (current?.selectedLifeStage
        ? getLifeStageLabel(current.selectedLifeStage)
        : '')
    )
  })

  /**
   * 兜底提醒文案。
   *
   * 优先用后端 `message`（它知道为什么没匹配上）；后端没给才本地拼。
   */
  const reminderText = computed(() => {
    if (verdict()?.message) return verdict()?.message as string
    return buildLifeStageReminderText({
      applicableStages: applicableStages?.() ?? [],
      dogLifeStage: dogLifeStage.value,
      dogName: dogName?.() ?? undefined,
    })
  })

  return {
    state,
    riskLevel,
    dogLifeStage,
    isMatch,
    selectedLabel,
    reminderText,
  }
}
