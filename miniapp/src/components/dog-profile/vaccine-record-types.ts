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
