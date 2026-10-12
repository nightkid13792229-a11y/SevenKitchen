/**
 * 一条疫苗记录 / 它的编辑草稿 —— 两个文件共用的形状（2026-10-12 第一步）。
 *
 * ⚠️ 为什么单独放一个文件 ✗：原来这两个 interface 长在 VaccineManagementSection.vue
 * 里面 ✓，而"一条记录的编辑卡"现在搬去了 VaccineRecordCard.vue ✓ ——
 * 两边都要用同一个形状 ✓，复制一份迟早对不上 ✗（这个模块以前就吃过亏 ✓）。
 *
 * 这次只是**搬家**，字段含义一个字没改 ✓（说明都照抄原处 ✓）。
 */

export interface VaccineRecord {
  id: string
  vaccineName: string
  vaccinationDate: string
  nextDueDate: string
  notes: string
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
  /**
   * 报告原件（2026-10-01 第九期）。
   * 拍疫苗本识别出来的记录会把顾客拍的原图存在这里，是接种凭证；
   * 手工填写的记录是空数组。
   */
  attachments?: string[]
  /**
   * 后端把这条归成了哪几类（2026-10-05）。
   *
   * 取值 core / rabies / lepto。一支组合苗可能同时属于好几类 ——
   * 卫佳捌既是核心疫苗又含钩端螺旋体。
   * 分类逻辑在后端 domain 层，前端只显示，不重写一套。
   */
  kinds?: string[]
  /** 归类的中文名（"核心疫苗""狂犬疫苗""钩端螺旋体"）—— 内部用，不给顾客看 */
  kindLabels?: string[]
  /**
   * 这一针含哪些病种（2026-10-06）—— **顾客看的就是它**。
   * 类别（kinds）由病种推导，只用来排期。
   */
  components: string[]
  /** 病种的中文名（犬瘟热 / 犬细小病毒 / 犬腺病毒 …） */
  componentLabels?: string[]
  /**
   * 名字**没读全**时的候选产品（2026-10-06 老板要求"认不准就诚实说"）。
   *
   * 识别出「卫佳」而漏了「捌」时，后端会把「卫佳伍 / 卫佳捌 / 卫佳细」
   * 一起给下来 —— 界面如实告诉顾客"这行字可能没读全，请看瓶子核对"，
   * 点一下就用那支（名字和分类一起带对）。
   */
  nameSuggestions?: string[]
  /**
   * 产品名有没有被人工核对过（2026-10-09 安全默认值）；缺省 = true。
   *
   * 为 false 时这一针**先不算进接种计划** ✓ ——
   * 卡片上给「待核对」徽标 + 说明 + 一个「我已对照本子核对」✓。
   */
  productVerified?: boolean
}

export interface VaccineDraft {
  vaccineName: string
  vaccinationDate: string
  nextDueDate: string
  notes: string
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
  /**
   * 归类（2026-10-05）：core / rabies / lepto / other。
   *
   * 来源：选产品库 / 系统按名字自动判 / 顾客自己点。**必须有值**才能存 ——
   * 系统再也不猜（以前认不出来默认当核心苗，一针驱虫药也能把
   * 核心苗的某一针标记成已完成，我们从此不再提醒）。
   */
  kinds: string[]
  /**
   * 这一针含哪些病种（2026-10-06）—— 顾客勾的、产品库带的都写在这里。
   * 类别由后端按它推导。
   */
  components: string[]
  /**
   * 归类是**顾客自己点的**（不是系统判的）。
   *
   * 为真时不再用自动判定覆盖他的选择；改了疫苗名称会重置成 false ——
   * 名字变了就该重新判一次，这是符合直觉的。
   */
  kindsManual: boolean
  /**
   * 安全默认值（2026-10-09）：没核对过的先不算进计划 ✓。
   * 缺省 = true（跟后端字段同义）。
   */
  productVerified?: boolean
}

/* ══ 产品名归一化（2026-10-12 第一步收尾：从两个文件里提出来 ✗→✓）══════════
 *
 * ⚠️ 为什么必须只有一份 ✗：抽卡片那天这个函数被复制到了
 * 记录板块和编辑卡两边 ✓（各 1 份 ✓），当时留了一句"改了这里要改两处"✓。
 * 但那句话是靠人记住的 ✗ —— 而它一旦不一致，症状是
 * **一边认得出这支苗、另一边认不出** ✓：
 *   · 卡片认不出 → 冒出"＋ 从产品库选一支"和一个手填框 ✗
 *   · 板块认不出 → 疫苗本重拍时**同一支苗会被重复记一遍** ✗
 * （2026-10-06 老板报的"疫苗名称并未正确加载出来"就是这套规则对不上 ✗）
 *
 * 所以从今往后**只有这一份** ✓：谁要改，改这里 ✓。
 */

/**
 * 产品名归一化 —— 规则与后端 `normalizeProductText` **逐条一致**。
 *
 * ⚠️ 2026-10-06 老板报的 bug 就出在这里：产品库下发的规范名是
 * 「宠必威幼犬保」，而疫苗本识别出来的是「宠必威® 幼犬保」。
 * 前端原来拿 `===` 比，比不中 → 名称那一行退回显示"从产品库选择"，
 * 识别出来的名字只能留在下面的手填输入框里 ——
 * 老板看到的就是"疫苗名称并未正确加载出来"。
 *
 * 后端判定归类时本来就会去掉 ® / 空格 / 分隔符（所以分类一直是对的），
 * 前端显示也得用同一套规则，否则"库里有这只苗"这件事两边说法不一致。
 * **后端改了这里也要跟着改** —— 两边不一致会直接表现为"名字显示不出来"。
 */
export function normalizeProductName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[®™©]/g, '')
    .replace(/[·・\-_/\\、,，.。．()（）【】\[\]]/g, '')
}

/** 在目录里找这个名字对应的产品（归一化之后比），找不到回 null */
export function findCatalogProduct<Product extends { name: string }>(
  products: readonly Product[],
  name: string,
): Product | null {
  const key = normalizeProductName(name)
  if (!key) return null
  return products.find((item) => normalizeProductName(item.name) === key) || null
}

/* ══ 草稿与提交载荷（2026-10-12 第三步：从记录板块提出来，两个板块共用 ✓）══
 *
 * ⚠️ 为什么提出来 ✗：第三步要把录入卡画在**计划块**里 ✓，而它也需要
 * "从记录造草稿"和"把草稿变成提交载荷"这两件事 ✓。
 * 抄一份迟早对不上 ✗（这个项目已经因为"同一套规则两份"吃过一次亏 ✓：
 * 分类算错、名字显示不出来 ✓）。所以只有这一份 ✓。
 */

/** 状态显示名（**只用于显示** —— 顾客端已经不选状态了 ✓，老记录的值要照旧显示 ✓）*/
export const STATUS_LABELS: Record<string, string> = {
  COMPLETED: '已接种',
  SCHEDULED: '已预约',
  OVERDUE: '已逾期',
}

/** 从一条记录造出它的编辑草稿（**规则与原来逐条一致** ✓）*/
export function toVaccineDraft(record: Partial<VaccineRecord>): VaccineDraft {
  const status = String(record.status || '')
  return {
    vaccineName: String(record.vaccineName || ''),
    vaccinationDate: String(record.vaccinationDate || '').slice(0, 10),
    nextDueDate: String(record.nextDueDate || '').slice(0, 10),
    notes: String(record.notes || ''),
    // 认的是"显示名表"（含退休的 OVERDUE），不是"可选项表" ——
    // 老记录是 OVERDUE 就原样带着，别因为选项里没有了就悄悄改成已接种。
    status: (STATUS_LABELS[status] ? status : 'COMPLETED') as VaccineDraft['status'],
    kinds: Array.isArray(record.kinds) ? record.kinds.map(String) : [],
    components: Array.isArray(record.components) ? record.components.map(String) : [],
    kindsManual: Array.isArray(record.kinds) && record.kinds.length > 0,
  }
}

/** 提交给后端的载荷（字段与原来逐条一致 ✓）*/
export interface VaccineRecordPayload {
  vaccineName: string
  vaccinationDate: string
  status: string
  notes: string | null
  components: string[]
  kinds: string[]
  productVerified: boolean
  attachments: string[]
  nextDueDate?: string
}

export function buildVaccinePayload(
  draft: VaccineDraft,
  attachments: string[] = [],
): VaccineRecordPayload {
  const payload: VaccineRecordPayload = {
    vaccineName: draft.vaccineName.trim(),
    vaccinationDate: draft.vaccinationDate,
    status: draft.status,
    notes: draft.notes.trim() || null,
    /*
     * 病种（2026-10-06）：顾客勾的就是它，**类别由后端按病种推导** ✓。
     * 两个都带上：kinds 只在"都不是/不确定"时用到 ✓。
     */
    components: draft.components,
    kinds: draft.kinds,
    // 安全默认值（2026-10-09）：没核对过的先不算进计划 ✓
    productVerified: draft.productVerified !== false,
    // 报告原件：手工填写时是空数组 ✓（明确传空数组才算"这条没有原件" ✓）
    attachments,
  }
  // 空到期日不能传空字符串（后端按日期校验），直接不带这个字段 ✓
  if (draft.nextDueDate) {
    payload.nextDueDate = draft.nextDueDate
  }
  return payload
}
