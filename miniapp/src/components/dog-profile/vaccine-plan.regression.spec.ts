import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 疫苗计划（2026-10-01，第四期）。
 *
 * 老板第 15–18 条：
 *   15. 按免疫程序提醒还需要打哪些、什么时候打
 *   16. 首选 WSAVA、结合国内法规；**引导顾客自己决策**
 *   17. 顾客计划与我们不一致时提醒
 *   18. 提醒只在小程序内
 */
describe('疫苗计划 · 界面', () => {
  function readSection() {
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )
  }

  it('第 15 条：给出"下一步"与完整计划，每步带时间窗与依据', () => {
    const section = readSection()

    expect(section).toContain('next-step')
    expect(section).toContain('step.windowStart')
    expect(section).toContain('step.windowEnd')
    expect(section).toContain('step.basis')
  })

  /**
   * 第 16 条原样是"给顾客三个按钮自己选（按建议/推迟/不做）"。
   *
   * 2026-10-06 老板实测："目前这 3 个按钮，我选中之后没有任何反应。"
   * （后端是好的 —— 生产实测 PUT 200 落库成功，只是界面只变了个很不明显的
   * 样式，列表里那几项连一句说明都没有。）老板的方案是重构成两个按钮：
   *   「记录疫苗接种信息」→ 直接走新增记录流程
   *   「忽略」→ 弹窗确认后把这一步从计划里去掉
   */
  it('第 16 条（2026-10-06 改版）：每一步两个按钮 —— 记录疫苗接种信息 / 忽略', () => {
    const section = readSection()

    // 文案 2026-10-06 简化：老板说"可以简化为记录接种信息"
    expect(section).toContain('记录接种信息')
    expect(section).toContain('>忽略<')
    // 已完成的步骤不给按钮（否则"已经打完了还给记录/忽略"很奇怪）
    expect(section).toContain("v-if=\"step.status !== 'DONE'\" class=\"step-actions\"")
    expect(section).toContain('@tap.stop="recordStep(step)"')
    expect(section).toContain('@tap.stop="ignoreStep(step)"')
    // 老的三个按钮彻底下线
    expect(section).not.toContain("label: '按建议'")
    expect(section).not.toContain("label: '推迟'")
    expect(section).not.toContain('DECISION_OPTIONS')
  })

  it('「记录疫苗接种信息」把这一步的分类一起带过去（不让顾客再选一次）', () => {
    const section = readSection()

    expect(section).toContain("emit('record-step', { kinds: [step.kind], stepLabel: step.label })")
  })

  it('「忽略」先弹窗确认，再落一个 SKIP 决定；并且给得回来', () => {
    const section = readSection()

    expect(section).toContain('uni.showModal({')
    expect(section).toContain("void decide(step.key, 'SKIP')")
    // 忽略不是"删了就找不回来"
    expect(section).toContain('已忽略 {{ ignoredCount }} 项 · 点这里恢复')
    expect(section).toContain('function restoreIgnored()')
  })

  it('第 17 条：不一致的地方单独成块提醒，且说明"只是提醒"', () => {
    const section = readSection()

    expect(section).toContain('plan.conflicts')
    expect(section).toContain('你的记录与建议不一致')
    expect(section).toContain('这只是提醒，不是结论')
  })

  it('第 18 条：提醒只在小程序内，不碰订阅消息', () => {
    const section = readSection()

    expect(section).not.toContain('requestSubscribeMessage')
    expect(section).not.toContain('subscribe-reminder')
    expect(section).not.toContain('订阅')
  })

  it('措辞是建议不是命令（老板要求不做诊断、不替顾客拍板）', () => {
    const section = readSection()

    expect(section).toContain('接种窗口期')
    expect(section).toContain('依据')
    expect(section).not.toContain('必须接种')
    expect(section).not.toContain('立刻去打')
  })

  it('计划没开时整块不出现（2026-10-04 改，原来显示"待开放"卡）', () => {
    const section = readSection()

    expect(section).toContain('available === false')
    // 一张写着"疫苗计划待开放"的卡片，告诉顾客一个还不存在、也没说什么时候
    // 会有的功能 —— 只会被读成"坏了"。开了才出现。
    expect(section).not.toContain('疫苗计划待开放')
    expect(section).toContain('planHidden')
    // 根节点条件已升级成 !sectionHidden（它也管"零记录时不渲染"）
    expect(section).toContain('v-if="!sectionHidden"')
  })

  it('整个板块默认收起，收起时只有"下一针的分类 + 接种窗口期"（2026-10-06 改版）', () => {
    const section = readSection()

    // 老板："合并后的板块默认收起，在收起页面中只展示下一针要打的疫苗分类
    // 和接种窗口期。"
    expect(section).toContain('const expanded = ref(false)')
    expect(section).toContain('@tap="toggleExpanded"')
    expect(section).toContain('plan-card__kind')
    expect(section).toContain('plan-card__window')
    // 老的两层折叠（下一步卡 + 计划列表各自收起）已经合并掉
    expect(section).not.toContain('planListExpanded')
  })

  it('但"记录与建议不一致"不折叠 —— 藏起来等于没说', () => {
    const section = readSection()

    // conflicts 必须在折叠之外
    const expandAt = section.indexOf('<template v-if="expanded">')
    const conflictsAt = section.indexOf('plan.conflicts')
    expect(expandAt).toBeGreaterThan(-1)
    expect(conflictsAt).toBeGreaterThan(-1)
    expect(conflictsAt).toBeGreaterThan(expandAt)
  })

  it('收起那一行只报"下一针是什么、什么时候打"，不报假进度', () => {
    const section = readSection()

    // 原来收起那行会写"已完成 N 项" —— 一条都对不上号时那是假进度。
    // 现在收起行只有分类 + 窗口期（老板 2026-10-06 指定的两项）。
    expect(section).not.toContain('已完成 ${done}')
    expect(section).not.toContain('planListHint')
    expect(section).toContain('plan-card__eyebrow')
  })

  it('🔴 底部那句"仍在做专业审核"已经删掉（2026-10-06 老板）', () => {
    const section = readSection()

    // 老板："这句话删除掉…我们现在就按审核通过的标准部署。"
    expect(section).not.toContain('仍在做专业审核')
    expect(section).not.toContain('plan-note')
  })
})

describe('疫苗计划 · 一条接种记录都没有时（2026-10-02 顾客侧开放当天补）', () => {
  function readSection() {
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )
  }

  it('零记录时这一块整个不渲染，把话让给记录板块的空态去说', () => {
    const section = readSection()

    // 实测：8 个月、没记过疫苗的狗，页面直接顶着 5 个「已逾期」——
    // 家长明明打过、只是没记，会以为系统算错了
    expect(section).toContain('noRecordAtAll')
    // 2026-10-04 老板第二次提问：计划板块和记录板块的空态说了同一件事。
    // 现在这句话只在记录板块说（那里的空态文案是"档案里还没有接种记录"）。
    expect(section).not.toContain('档案里还没有接种记录')
    // 内容那一层挂 v-if="!noRecordAtAll"，根节点那一层挂 !sectionHidden
    expect(section).toContain('v-if="!noRecordAtAll"')
  })

  it('判定条件来自后端的 summary.done 与 matchedRecordId，不自己猜', () => {
    const section = readSection()

    expect(section).toContain('plan.value.summary?.done')
    expect(section).toContain('step.matchedRecordId')
  })
})

/**
 * 零记录时**不显示计划**（2026-10-04 老板提问后改）。
 *
 * 老板：「狗狗在没有任何疫苗信息记录的时候，为什么还会显示下一步和接种计划呢？
 * 这是不是不合理呢？」—— 是不合理，而且比他看到的更严重。
 *
 * 实测（面包，2023-09-23 生、0 条记录）修复前看到的是：
 *     下一步：狂犬疫苗 第 3 次
 *     建议时间：2025-11-16 ~ 2026-03-16
 * 两处都不成立：
 *   · "第 3 次"是程序表里的序号，顾客会读成"我家狗打过两次"—— 我们一条记录都没有；
 *   · 那个窗口早就过去了，它既不是"计划"，也不是这只狗的历史。
 *
 * 根子：步骤过滤只保留"对现在还有意义"的（窗口过期一年内的），
 * 于是零记录的老狗看到的是一段**被截断的假定历史的中段**。
 * 计划是"接下来怎么打"，没有记录就没有"接下来"可言。
 */
describe('疫苗计划 · 零记录时不显示计划（2026-10-04 老板定）', () => {
  function readSection() {
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )
  }

  it('零记录时**连根节点都不渲染**（否则留一条 24rpx 的紫色空白）', () => {
    const section = readSection()

    // 老板 2026-10-05："疫苗板块为什么还是有紫色的空白区域呢？"
    // 上一轮只藏了里面的内容，根 <view class="health-section vaccine-plan">
    // 还在，它带着 .vaccine-plan { margin-bottom: 24rpx } —— 空白就是它。
    expect(section).toContain('const sectionHidden = computed')
    expect(section).toContain('v-if="!sectionHidden"')
    expect(section).toContain('planHidden.value || (loaded.value && noRecordAtAll.value)')
  })

  it('零记录时整块藏掉"下一步 / 不一致提醒 / 接种计划"', () => {
    const section = readSection()

    // 计划整块挂在 v-if="!noRecordAtAll" 里
    const guardAt = section.indexOf('<template v-if="!noRecordAtAll">')
    const nextStepAt = section.indexOf('① 下一针')
    expect(guardAt).toBeGreaterThan(-1)
    expect(nextStepAt).toBeGreaterThan(guardAt)
  })

  it('文案里不再出现任何"零记录专属"的说明卡残留', () => {
    const section = readSection()

    // 前一轮那张卡已经把话说完就删了（跟记录板块空态重复），
    // 连样式一起清掉，免得后人以为还有这个 UI
    expect(section).not.toContain('plan-empty-note')
    expect(section).not.toContain('下面是按免疫程序推算的进度')
  })

  it('措辞软硬用 noEvidence，显不显示计划用 noRecordAtAll —— 两个概念分开', () => {
    const section = readSection()

    // 后端原来用一个字段兼两件事：算的是"没有任何一步对上号"，
    // 名字和文案说的却是"一条记录都没有"。只录一条钩端螺旋体（非核心苗）
    // 的人会被这张卡告知"档案里还没有接种记录"。
    expect(section).toContain('const noEvidence = computed')
    expect(section).toContain('const noRecordAtAll = computed')
    expect(section).toContain('plan.value.noEvidence')
    expect(section).toContain('plan.value.noRecordAtAll')
    /*
     * 状态标签的口气（2026-10-07 老板审计后改成**按类**判断）。
     *
     * 原来是整只狗一把尺：只记过狂犬的狗，钩端那两针会说"已逾期"；
     * 而什么记录都没有的狗同样两针却说"还没记录" —— 同一件事两种口气。
     * 现在优先用后端下发的**每一步所属类别**有没有记录，老后端不带
     * 这个字段时才退回整只狗判断。
     */
    // 2026-10-07：后端下发的 statusLabel 优先（口径在后端一处维护）
    expect(section).toContain('if (step.statusLabel)')
    expect(section).toContain("typeof step.noEvidence === 'boolean'")
    expect(section).toContain("if (kindNoEvidence && (step.status === 'OVERDUE' || step.status === 'DUE'))")
    expect(section).not.toContain("if (noEvidence.value && (status === 'OVERDUE'")
  })
})

describe('疫苗计划 · 接线', () => {
  it('挂在疫苗书签下，且排在疫苗记录上方', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('ref="vaccinePlanRef"')
    expect(page).toContain(':data-version="vaccineDataVersion"')
    // 记录一变就重算计划（2026-10-05）—— 否则顾客原地录完几条，
    // 计划还停在"没有记录"的状态、整块不显示
    expect(page).toContain('@records-changed="onVaccineRecordsChanged"')
    expect(page).toContain('vaccineDataVersion.value += 1')
    const planIndex = page.indexOf('<VaccinePlanSection')
    const recordsIndex = page.indexOf('<VaccineManagementSection')
    expect(planIndex).toBeGreaterThan(-1)
    expect(planIndex).toBeLessThan(recordsIndex)
  })

  it('API 层四个接口都在（计划 / 程序表 / 设决定 / 清决定）', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

    expect(api).toContain('/dogs/${dogId}/vaccine-plan?audience=')
    expect(api).toContain('/dogs/${dogId}/vaccine-plan/schedule')
    expect(api).toContain('/vaccine-plan/decisions/')
    expect(api).toContain('method: \'PUT\'')
    expect(api).toContain('method: \'DELETE\'')
  })
})

/**
 * 两条新的排期规则（2026-10-05 老板加）。
 */
describe('疫苗计划 · 新增的两条排期规则', () => {
  function readSection() {
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )
  }

  it('「别同一天打」的提醒跟在"下一针说明"里', () => {
    const section = readSection()

    // 老板 2026-10-05："不同分类的疫苗不可以在同一天接种，尽量避开 2~3 天。
    // 比如狂犬疫苗、核心疫苗和钩端螺旋体要分开打。"
    // 2026-10-06 改版后，这一段归到"下一针的进一步说明"里
    // （家长最容易犯的错就是两针一起去打，所以它跟着下一针走）。
    expect(section).toContain('spacingNote')
    expect(section).toContain('spacing-note__text')
    const nextDetailAt = section.indexOf('class="next-detail"')
    const spacingAt = section.indexOf('spacing-note__text')
    expect(nextDetailAt).toBeGreaterThan(-1)
    expect(spacingAt).toBeGreaterThan(nextDetailAt)
  })

  it('计划列表每一步按老板 2026-10-06 的字段清单显示，不多不少', () => {
    const section = readSection()

    // 状态 / 疫苗种类 / 接种窗口期 / 接种时间 / 推荐疫苗 / 依据
    // （2026-10-07 起整个 step 传进去 —— 口气要按"这一类"判断）
    expect(section).toContain('statusLabel(step)')
    expect(section).toContain('step.kindLabel')
    expect(section).toContain('step.windowStart')
    expect(section).toContain('step.matchedRecordDate')
    expect(section).toContain('stepProducts(step)')
    expect(section).toContain('step.basis')
  })

  it('已记录/已接种的步骤不再推荐产品', () => {
    const section = readSection()

    // 老板："推荐疫苗（如果已记录或者已接种，就不需要推荐了。）"
    expect(section).toContain('if (step.matchedRecordId) return []')
  })

  it('接种计划按接种窗口期由近到远排序', () => {
    const section = readSection()

    // 老板："接种计划按照接种窗口期时间顺序，由近到远往下排序。"
    expect(section).toContain('orderedSteps')
    expect(section).toContain('.sort((a, b) => String(a.windowStart).localeCompare(String(b.windowStart)))')
  })

  it('被忽略的步骤从计划里去掉（展示层过滤，库里那条决定留着好恢复）', () => {
    const section = readSection()

    expect(section).toContain("plan.value.decisions[step.key] !== 'SKIP'")
    expect(section).toContain('ignoredCount')
  })

  it('同品牌优先的结果直接用后端的（前端不自己排）', () => {
    const section = readSection()

    // 推荐顺序（同品牌优先、批签发排序、核心苗要覆盖四病）全在后端算，
    // 前端只显示 —— 否则两边迟早不一致
    expect(section).toContain('commonProducts')
    expect(section).not.toContain('coversCoreSeries')
    expect(section).not.toContain('VACCINE_PRODUCTS')
  })
})

/**
 * 计划和提醒要**跟着记录实时变**（2026-10-06 老板报的问题 1 和 6）。
 *
 * 原话：
 *   1. "如果我把疫苗记录全部删空，依然还会显示疫苗的提醒和计划。
 *       只有在切换到其他的标签，再切回疫苗标签的时候，显示内容才会为空。"
 *   6. "这次在录入疫苗接种记录之后，疫苗的计划和提醒板块又没有显示出来。"
 *
 * 两条是同一个机理的两面：板块停在上一次加载的结果上。
 * 一个该出现却没出现，一个该消失却没消失。
 */
describe('疫苗计划 · 跟着记录实时刷新（2026-10-06）', () => {
  it('同一条狗刷新时不许先抹掉 loaded —— 那会让整块先消失再出现', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

    // sectionHidden = planHidden || (loaded && noRecordAtAll)
    // 刷新一开始就 loaded=false 的话，块会闪一下；
    // 而换狗时**必须**重置，否则新狗顶着上一条狗的计划。
    expect(section).toContain('const loadedDogId = ref(')
    expect(section).toContain('if (loadedDogId.value !== props.dogId) {')
    expect(section).not.toContain('  loaded.value = false\n  loadError.value = \'\'')
  })

  it('拉记录失败也要通知计划板块（否则删空后拉失败会一直挂着旧的）', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

    // catch 里原来只 showToast，不通知 —— 计划那边毫无察觉
    const loadAt = section.indexOf('async function loadRecords')
    const catchBlock = section.slice(
      section.indexOf('} catch (error: any) {', loadAt),
      section.indexOf('} finally {', loadAt),
    )
    expect(catchBlock).toContain('notifyRecordsChanged()')
    // 文案 2026-10-08 审计第 6 块改成"能行动的话"（原来只有"加载疫苗记录失败"）
    expect(catchBlock).toContain('接种记录没加载出来，下拉刷新一下试试')
  })

  it('"一条记录都没有"由后端按记录条数算，前端只负责照做', () => {
    const backend = readFileSync(
      resolve(process.cwd(), '../backend/src/domain/health/immunization-schedule.ts'),
      'utf-8',
    )

    // 后端口径：records.length === 0 —— 删空之后它必须是 true，
    // 计划板块才会整块藏掉。前端不重算这个判断。
    expect(backend).toContain('const noRecordAtAll = input.records.length === 0;')
  })
})

/**
 * 记录变了要**直接调组件方法**重算（2026-10-06 实测出来的）。
 *
 * 光靠 `:data-version` 传下去实测不生效：用微信官方自动化驱动模拟器
 * 删光记录之后，书签红点灭掉了（说明通知到了页面），
 * 计划板块却原地挂着删掉那条记录算出来的计划 ——
 * 正是老板报的"删空了还显示计划和提醒，切走再切回才空"。
 */
describe('疫苗计划 · 记录一变就重算（2026-10-06 实测修复）', () => {
  function readPage() {
    return readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )
  }

  it('🔴 页面拿到计划板块的 ref，并在记录变化时直接调 reload', () => {
    const page = readPage()

    expect(page).toContain('const vaccinePlanRef = ref<{ reload?: () => void } | null>(null)')
    expect(page).toContain('ref="vaccinePlanRef"')
    expect(page).toContain('vaccinePlanRef.value?.reload?.()')
  })

  it('reload 由组件 defineExpose 暴露出来', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

    expect(section).toContain('defineExpose({ reload: () => load() })')
  })

  it('reload 必须排在"红点也跟着更新"同一条链上（两件事一起发生）', () => {
    const page = readPage()

    const handler = page.slice(
      page.indexOf('function onVaccineRecordsChanged()'),
      page.indexOf('}', page.indexOf('vaccinePlanRef.value?.reload?.()')),
    )
    expect(handler).toContain('loadVaccineDot()')
    expect(handler).toContain('vaccinePlanRef.value?.reload?.()')
  })
})

/**
 * 接种计划的显示口径（2026-10-06 老板实测七问）。
 */
describe('接种计划 · 显示口径（2026-10-06）', () => {
  const readSection = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

  it('标题不再带"（按接种窗口期由近到远）"', () => {
    const source = readSection()

    expect(source).toContain('<text class="plan-steps__title">接种计划</text>')
    expect(source).not.toContain('由近到远）</text>')
  })

  it('🔴 已完成的步骤不显示接种窗口期（那扇窗早过了）', () => {
    const source = readSection()

    expect(source).toContain("v-if=\"step.status !== 'DONE'\" class=\"kv\"")
  })

  it('🔴 已完成的步骤不给动作按钮', () => {
    const source = readSection()

    expect(source).toContain("v-if=\"step.status !== 'DONE'\" class=\"step-actions\"")
  })

  it('🔴 已完成的沉底，未完成的在前（各自仍按窗口期由近到远）', () => {
    const source = readSection()

    expect(source).toContain('const pendingRank = (step: PlanStep) => (step.status === \'DONE\' ? 1 : 0)')
    expect(source).toContain('pendingRank(a) - pendingRank(b)')
  })

  /**
   * 老板："狂犬疫苗第 4 次显示已逾期，但为什么待安排的狂犬疫苗却显示是第 5 次呢？
   * 如果第 4 次已经逾期了，那不是第 4 次就是应该是待安排的吗？"
   */
  it('🔴 同一类里前面没做完，就不显示后面那些（不许跳步）', () => {
    const source = readSection()

    expect(source).toContain('const seenPending = new Set<string>()')
    expect(source).toContain('blocked.add(step.key)')
  })
})


/**
 * 「下一针」变了就轻轻闪一下（2026-10-08 老板审计第 4 块）
 *
 * 家长改完一条记录之后，计划会重算 —— 但界面上看不出来。
 * 闪一下是为了回答"我刚才那下改动，让计划前进了吗"；
 * 只在**真的换了**的时候闪，第一次加载不闪。
 */
describe('计划 · 「下一针」变了闪一下（2026-10-08）', () => {
  const section = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

  it('只在 key 真的变了、而且不是第一次加载时闪', () => {
    const source = section()

    expect(source).toContain('function highlightNextStepIfChanged()')
    expect(source).toContain("if (lastNextStepKey.value && key && key !== lastNextStepKey.value)")
    expect(source).toContain('plan-card__head--flash')
  })
})
