/**
 * 营养评估（2026-10-16 批次 5.3 改成**后端算**）
 *
 * ## 改了什么
 *
 * 此前这里调的是后台自己那份**评估引擎副本**（1779 行），
 * 与后端权威实现逐字重复。现在改成把**当前编辑内容**发给后端算。
 *
 * ## ⚠️ 这次正面解决了一个矛盾
 *
 * 原来的注释写着：本地计算是为了
 * 「避免每次编辑都请求服务器评估（**小程序端卡顿根因之一**）」。
 *
 * 也就是说：**每秒都请求后端确实会卡**。所以这次不是简单换掉，而是：
 *   · **防抖 400ms** —— 连续敲键盘时只在停下来之后请求一次；
 *   · **保留上一次结果** —— 请求进行中不把面板清空，
 *     否则每敲一个字右侧就闪一下、滚动位置还会被顶回顶部
 *     （这个坑原来就有，注释里写着）；
 *   · **失败也不清空** —— 网络抖一下不该让面板变成"评估引擎准备中"。
 *
 * 这样既满足"计算在后端"，又不会把卡顿带回来。
 */
import { ref, shallowRef } from 'vue'
import type { DesignRecipeAssessmentResult } from '@/utils/recipeDesigner/assessmentTypes'
import type { NutritionProfile } from '@/utils/recipeDesigner/nutritionProfileTypes'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type {
  AssessmentTarget,
  DesignerItem,
  DraftAssessmentInputs,
  FediafDogScenario
} from '@/types/recipeDesigner'

export interface LocalAssessmentEngineItem {
  id: string
  name: string
  ingredientType?: string | null
  weightG: number
  nutritionProfile: NutritionProfile | null
}

/**
 * 按草稿缓存评估输入（服务端归一化后的营养档案），避免重复请求。
 *
 * ⚠️ **不再缓存 targets** —— 目标值现在由后端按 scenario 自己取，
 * 客户端不需要（也就不会缓存一份可能过期的）。
 */
const inputsCache = new Map<string, DraftAssessmentInputs>()

/** 防抖定时器：连续编辑时只在停下来之后请求一次 */
const DEBOUNCE_MS = 400

/**
 * 缓存的评估输入是否仍然对得上当前草稿。
 *
 * 为什么必须有这道校验：「复制其他阶段原料」「切换阶段」等服务端动作会把目标草稿
 * 的原料记录整批删掉再重建，原料 id 全部换新；而缓存里的营养档案是按原料 id 索引的。
 * 只要校验缺失，缓存命中后评估引擎就会拿新原料 id 去旧档案里查，一条都对不上，
 * 于是「关键比例仪表」全是「—」、「营养评估」整片「缺数据」——而配方明细看起来完全正常。
 * 所以：情境（决定标准表）不同、或计入评估的原料集合和缓存不一致时，一律重新拉取。
 */
function isCachedInputsUsable(
  cached: DraftAssessmentInputs | undefined,
  scenario: FediafDogScenario,
  items?: DesignerItem[]
): cached is DraftAssessmentInputs {
  if (!cached) return false
  if (cached.scenario !== scenario) return false
  if (!items) return true

  const cachedItemIds = new Set(cached.items.map((item) => item.id))
  const currentIncludedIds = items
    .filter((item) => item.includeInAssessment !== false)
    .map((item) => item.id)

  if (currentIncludedIds.length !== cachedItemIds.size) return false
  return currentIncludedIds.every((id) => cachedItemIds.has(id))
}

export function useRecipeDesignerAssessment() {
  const loadingInputs = shallowRef(false)
  const inputsError = shallowRef<string | null>(null)

  /**
   * 进入编辑器时加载评估输入。
   * 传入 items（当前草稿的原料）后，缓存会先和原料 id 比对：
   * 对得上才复用，对不上（例如刚做过跨阶段复制）就重新拉取，避免面板整片缺数据。
   */
  async function loadInputs(
    draftId: string,
    scenario: FediafDogScenario,
    items?: DesignerItem[]
  ): Promise<void> {
    const cached = inputsCache.get(draftId)
    if (isCachedInputsUsable(cached, scenario, items)) {
      return
    }
    loadingInputs.value = true
    inputsError.value = null
    try {
      const inputs = await recipeDesignerApi.getAssessmentInputs(draftId)
      inputsCache.set(draftId, inputs)
    } catch (error: any) {
      inputsError.value = error?.message || '评估数据加载失败'
    } finally {
      loadingInputs.value = false
    }
  }

  /**
   * 添加/删除原料后刷新（新原料的档案在服务端归一化）。
   *
   * 注意：这里必须「先取新数据、拿到后再替换缓存」，不能先清空缓存再请求。
   * 清空会让 compute() 在请求返回前拿不到目标值而返回 null，
   * 右侧营养评估面板会整块塌成「评估引擎准备中…」，
   * 滚动位置随之被顶回顶部——用户刚点完「智能添加」就被弹回列表最上面。
   * 刷新失败时同样保留上一次可用的输入，避免面板变空白。
   */
  async function refreshInputs(draftId: string): Promise<void> {
    loadingInputs.value = true
    inputsError.value = null
    try {
      const inputs = await recipeDesignerApi.getAssessmentInputs(draftId)
      inputsCache.set(draftId, inputs)
    } catch (error: any) {
      inputsError.value = error?.message || '评估数据加载失败'
    } finally {
      loadingInputs.value = false
    }
  }

  function clearInputs(draftId: string) {
    inputsCache.delete(draftId)
  }

  function buildEngineItems(draftId: string, items: DesignerItem[]): LocalAssessmentEngineItem[] {
    const cached = inputsCache.get(draftId)
    const profileByItemId = new Map<string, NutritionProfile | null>()
    if (cached) {
      for (const inputItem of cached.items) {
        profileByItemId.set(inputItem.id, (inputItem.nutritionProfile as NutritionProfile | null) ?? null)
      }
    }
    return items
      .filter((item) => item.includeInAssessment !== false)
      .map((item) => ({
        id: item.id,
        name:
          item.name ||
          item.ingredientName ||
          item.ingredient?.name ||
          item.nutritionFoodName ||
          item.nutritionFood?.displayNameZh ||
          item.nutritionFood?.name ||
          item.nutritionProfileDisplayName ||
          '',
        ingredientType: item.ingredientType ?? item.ingredient?.type ?? null,
        weightG: Number(item.weightG ?? 0),
        nutritionProfile: profileByItemId.get(item.id) ?? null
      }))
  }

  /**
   * 最近一次成功的评估结果。
   *
   * ⚠️ 用 `ref` 而不是 `computed` —— 结果是异步来的，
   * 而且**请求进行中要保留上一次的值**（见文件头：清空会让面板闪、
   * 还会把滚动位置顶回顶部）。
   */
  const assessment = ref<DesignRecipeAssessmentResult | null>(null)
  const assessing = ref(false)
  const assessError = ref<string | null>(null)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * 请求序号：只认最后一次。
   *
   * 防抖之后仍可能有两个请求在飞（先发的慢、后发的快），
   * 不做这个校验就会**用旧结果覆盖新结果** —— 用户改完了，
   * 面板上却是改之前那几个数字，而且不会自己恢复。
   */
  let requestSeq = 0

  /**
   * 触发一次评估（防抖）。
   *
   * 连续编辑时只在停下来 400ms 后请求一次 —— 这是"计算交给后端"
   * 与"编辑时不卡"之间的平衡点。
   */
  function schedule(
    scenario: FediafDogScenario,
    draftId: string,
    items: DesignerItem[]
  ): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void runAssess(scenario, draftId, items)
    }, DEBOUNCE_MS)
  }

  /** 立即评估一次（不等防抖）—— 进出编辑器、刷新输入后用 */
  async function compute(
    scenario: FediafDogScenario,
    draftId: string,
    items: DesignerItem[]
  ): Promise<void> {
    if (debounceTimer) clearTimeout(debounceTimer)
    await runAssess(scenario, draftId, items)
  }

  async function runAssess(
    scenario: FediafDogScenario,
    draftId: string,
    items: DesignerItem[]
  ): Promise<void> {
    const engineItems = buildEngineItems(draftId, items).filter(
      (item) => item.weightG > 0
    )

    /**
     * 没有有效原料时不请求 —— 后端也会拒（"配方里还没有原料"），
     * 这里先拦一道省一次往返。结果置空让面板显示"还没有原料"。
     */
    if (engineItems.length === 0) {
      assessment.value = null
      assessError.value = null
      return
    }

    const seq = ++requestSeq
    assessing.value = true
    assessError.value = null
    try {
      const result = await recipeDesignerApi.assessItems({
        scenario: String(scenario),
        items: engineItems
      })
      // 只认最后一次：慢响应回来晚了就丢掉，别覆盖新结果
      if (seq !== requestSeq) return
      assessment.value = result as unknown as DesignRecipeAssessmentResult
    } catch (error: any) {
      if (seq !== requestSeq) return
      /**
       * ⚠️ **失败不清空上一次结果** —— 网络抖一下不该让整个面板
       * 变成"评估引擎准备中"。只在确实还没有任何结果时才显示错误。
       */
      assessError.value = error?.message || '营养评估失败'
    } finally {
      if (seq === requestSeq) assessing.value = false
    }
  }

  /** 离开编辑器时清掉待执行的防抖任务（免得对着已销毁的组件写状态） */
  function dispose(): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = null
    requestSeq += 1
  }

  return {
    loadingInputs,
    inputsError,
    loadInputs,
    refreshInputs,
    clearInputs,
    assessment,
    assessing,
    assessError,
    schedule,
    compute,
    dispose
  }
}
