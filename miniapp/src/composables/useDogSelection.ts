import { computed, ref, type Ref } from 'vue'

/**
 * 选狗 · 公共状态（2026-10-18）
 *
 * ## 它解决什么
 *
 * 「当前选的是哪只狗」这件事，在**七个页面**里各写了一遍：
 * 详情 / 成品订购 / DIY 配置 / DIY 制作单 / 定制页 / 饭量计算 / 健康档案。
 *
 * 写法还不太一样 —— 有的用 `dogId`、有的用 `selectedDogId`，
 * 甚至同一页里两个都在（还有一个 `selectedDogId || dogId` 的兜底链）。
 * **两个变量管同一件事**，改一处忘一处就会打架。
 *
 * ## 它只管"选哪只"，不管"怎么拉列表"
 *
 * 拉列表的接口各页不同（有的按顾客、有的按权限），塞进来会变成一个
 * 需要 5 个回调参数的巨型函数。所以：**列表由页面拉，灌进 `setDogs`**。
 *
 * ## 持久化
 *
 * 选中后会写 `uni.setStorageSync('dogId')` —— 这是全站约定（其它页读它做默认值）。
 * 但**读**的时候不在这里做：各页的优先级不同（URL 参数 > storage > 第一只），
 * 那属于页面的入口逻辑。
 */
export function useDogSelection<T extends { id: string } = any>(
  options: { storageKey?: string } = {},
) {
  const storageKey = options.storageKey ?? 'dogId'

  /**
   * 泛型：调用方的狗类型（各页可能是 `Dog` / `DogProfile` / 简化对象）。
   * 不声明泛型的话返回值是 `any[]`，赋给 `Dog[]` 会丢类型。
   */
  const dogs = ref<T[]>([]) as Ref<T[]>
  const selectedDogId = ref('')

  /**
   * 当前选中的那只。
   *
   * 找不到返回 `null` —— **不要返回 `dogs[0]`**：
   * "没选"和"选了第一只"是两回事，前者该提示顾客选，后者不该。
   */
  const selectedDog = computed<T | null>(
    () => dogs.value.find((dog) => dog.id === selectedDogId.value) || null,
  )

  /**
   * 灌入列表。
   *
   * ## ⚠️ 它**不会自动选中**（2026-10-18 改过一次）
   *
   * 第一版会顺手按 `preferredId > 当前选中 > 第一只` 自动选。
   * 结果在接页面时**连踩两次坑**：
   *
   *   页面原来的写法是 `if (!selectedDogId.value) selectDog(x)` ——
   *   而 `selectDog()` 里除了选中，还有一堆副作用
   *   （饭量计算、生命阶段检查、价格预览……）。
   *   一旦 `setDogs` 先把 `selectedDogId` 填上，那个守卫就**永远短路**，
   *   副作用全不跑，页面表现为"列表出来了但什么都不算"。
   *
   * 其中一个页面的 `selectDog` 开头还有 `if (dogId === selectedDogId.value) return` ——
   * 自动选中会让它**立刻返回**，问题更隐蔽。
   *
   * ## 所以现在的约定
   *
   * · `setDogs(list)` —— **只灌列表 + 清理失效的选中项**，绝不替你选
   * · `setDogsAndSelect(list, preferredId)` —— 想自动选就用这个，**名字里写明白**
   *
   * 让副作用出现在函数名里，调用方就不会被它悄悄改变行为。
   */
  function setDogs(list: T[]) {
    dogs.value = Array.isArray(list) ? list : []
    // 选中项已不在列表里（顾客删了狗）→ 清掉，免得页面停在一个不存在的 id 上
    if (
      selectedDogId.value &&
      !dogs.value.some((dog) => dog.id === selectedDogId.value)
    ) {
      selectedDogId.value = ''
    }
  }

  /**
   * 灌列表**并且**选一只（显式版本）。
   *
   * 优先级：`preferredId` > 当前选中（还在列表里）> 第一只。
   * 只用在你确定"选完之后不需要额外副作用"的场合；
   * 需要跑页面自己的 `selectDog()` 时，请用 `setDogs()` + 手动调用。
   */
  function setDogsAndSelect(list: T[], preferredId?: string | null) {
    setDogs(list)

    const candidates = [preferredId, selectedDogId.value, dogs.value[0]?.id].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    )
    const valid = candidates.find((id) =>
      dogs.value.some((dog) => dog.id === id),
    )
    selectedDogId.value = valid ?? ''
  }

  /**
   * 选一只并持久化。
   *
   * 不校验存在性 —— 调用方通常是点击列表项，一定存在；
   * 而 `syncFromMatch` 那种"外部给的 id"才需要校验。
   */
  function select(dogId: string, options: { persist?: boolean } = {}) {
    const id = String(dogId || '')
    if (!id) return
    selectedDogId.value = id
    if (options.persist !== false) {
      uni.setStorageSync(storageKey, id)
    }
  }

  /**
   * 按后端返回的匹配结论校正选中项。
   *
   * 校验存在性：后端给的 `matchedDogId` 可能在列表外（顾客刚删了这只狗）。这种情况下**什么都不做**，
   * 而不是把选中项改成一个不存在的 id。
   */
  function syncFromMatch(matchedDogId?: string | null) {
    const id = String(matchedDogId || '')
    if (!id) return
    if (dogs.value.length > 0 && !dogs.value.some((dog) => dog.id === id)) return
    select(id)
  }

  return {
    dogs,
    selectedDogId,
    selectedDog,
    setDogs,
    setDogsAndSelect,
    select,
    syncFromMatch,
  }
}
