/**
 * ══ 疫苗录入的**共享字段层**（老板 2026-10-14 定）════════════════════════════
 *
 * 老板："我想的是，这3个页面可不可以用同一个页面呢？"
 *
 * ── 结论：页面不合并，但**字段必须只有一份** ────────────────────────────
 *
 * 三个界面的**任务不同**，布局不能合并：
 *   · 确认页（扫疫苗本后核对识别结果）—— **一次核多条**，一行一条、一屏多条
 *     （老板 2026-10-09 明确要求"不要一条一屏，要优化一屏多条"）
 *   · 录入卡（计划里录入 / 记录里编辑）—— **编辑一条**，完整表单（还有备注）
 *   · 记录板块 —— 它是**列表**，不是录入界面
 *
 * 但"疫苗名 / 含哪些疫苗 / 接种日期"这三样**两边完全一样** ——
 * 所以字段的**标题、顺序、毒株词表、值→中文名**都收到这里，只写一份。
 *
 * ── 为什么必须收（2026-10-14 查出来的实证）────────────────────────────
 *
 * 同一样东西在两个界面各写了一份，**内容已经矛盾**：
 *   · 确认页那份：`犬细小` / `副流感` / `冠状病毒` —— 7 项，用简称
 *   · 录入卡那份：`犬细小病毒` / `犬副流感` / `犬冠状病毒` —— 5 项，缺副流感与冠状病毒
 * 平时看不出来（两个界面都**优先用后端下发**的那份），
 * 可一旦接口失败、退到兜底，**同一天同一支苗在两个界面会显示成不同的名字**。
 *
 * ⚠️ 权威定义在**后端**（`vaccine-products.ts` 的 `VACCINE_COMPONENT_LABELS`）✓，
 *    随 `/dogs/vaccines/catalog` 下发 ✓（平时用的就是它 ✓）。
 *    这里这份只是**接口失败时的兜底** ✓ —— 内容与后端逐字对齐 ✓，
 *    并有测试盯着"两边不许再漂开"（`vaccine-fields.spec.ts` ✓）。
 */

/** 毒株选项（值 + 中文名），与后端 `VACCINE_COMPONENT_LABELS` 逐字一致 */
export interface VaccineComponentOption {
  value: string
  label: string
}

/**
 * 毒株词表兜底（**与后端 `VACCINE_COMPONENTS` 同序、同文案**）。
 *
 * ⚠️ 改这里之前先看后端是不是也改了 —— 两处必须一致 ✓
 *    （测试会把两份读出来逐项比 ✓）
 * ⚠️ 顺序别乱动：后端的顺序就是界面上的顺序 ✓
 */
export const VACCINE_COMPONENT_FALLBACK: VaccineComponentOption[] = [
  { value: 'cdv', label: '犬瘟热' },
  { value: 'cpv', label: '犬细小病毒' },
  { value: 'cav', label: '犬腺病毒' },
  { value: 'rabies', label: '狂犬病' },
  { value: 'lepto', label: '钩端螺旋体' },
  { value: 'cpi', label: '犬副流感' },
  { value: 'ccov', label: '犬冠状病毒' },
  { value: 'bordetella', label: '博德特氏菌' },
  { value: 'lyme', label: '莱姆病' },
]

/**
 * 三个界面共用的**字段标题**（老板点名的那几处不一致，就出在这儿）。
 *
 * ⚠️ 2026-10-12 老板把"含哪些病种"改成了"含哪些疫苗"——
 *    当时录入卡改了、确认页漏了 ✗，于是同一样东西两处叫法不同 ✗。
 *    收到这里之后就不存在"改一处漏一处"了 ✓。
 */
export const VACCINE_FIELD_LABELS = {
  name: '疫苗名称',
  /** 确认页是紧凑行，用简称"疫苗名"（老板要的一屏多条）*/
  nameCompact: '疫苗名',
  components: '含哪些疫苗',
  componentsWithHint: '含哪些疫苗（可多选）',
  /** 确认页的紧凑行历史上不带"（可多选）"，保持原样 */
  componentsCompact: '含哪些疫苗',
  date: '接种日期',
  notes: '备注（可选）',
} as const

/**
 * 字段在界面上的**先后顺序**（老板 2026-10-14 定：名字 → 含哪些疫苗 → 接种日期）。
 *
 * 原为"名字 → 日期 → 毒株"（当时的口径是"跟确认页一致"）——
 * 老板改成毒株紧跟名字：名字决定这支苗是什么，紧接着就说清它含什么。
 */
export const VACCINE_FIELD_ORDER = ['name', 'components', 'date', 'notes'] as const

/**
 * 毒株值 → 中文名（**唯一的一份实现**）。
 *
 * 优先用传入的词表（界面平时拿的是后端下发的那份），查不到再退到兜底，
 * 最后才原样显示值 —— 这样"库里新加了一个毒株、前端还没更新"时也不会显示成英文码。
 */
export function componentLabelOf(
  options: VaccineComponentOption[] | undefined,
  value: string,
): string {
  const fromOptions = (options || []).find((item) => item.value === value)
  if (fromOptions) return fromOptions.label
  const fromFallback = VACCINE_COMPONENT_FALLBACK.find((item) => item.value === value)
  return fromFallback ? fromFallback.label : value
}

/** 词表：优先用传入的（接口下发的），空则退到兜底 */
export function componentOptionsOf(
  options: VaccineComponentOption[] | undefined,
): VaccineComponentOption[] {
  return options && options.length > 0 ? options : VACCINE_COMPONENT_FALLBACK
}
