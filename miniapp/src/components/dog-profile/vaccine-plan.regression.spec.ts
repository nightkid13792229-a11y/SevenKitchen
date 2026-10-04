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

  it('第 16 条：每一步都能让顾客自己选（按建议 / 推迟 / 不做）', () => {
    const section = readSection()

    expect(section).toContain("value: 'ACCEPT', label: '按建议'")
    expect(section).toContain("value: 'DEFER', label: '推迟'")
    expect(section).toContain("value: 'SKIP', label: '不做'")
    // 点同一个选项两次 = 取消决定，回到"按建议"
    expect(section).toContain('const isCancel = current === decision')
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

    expect(section).toContain('建议时间')
    expect(section).toContain('请以执业兽医的意见为准')
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
    expect(section).toContain('v-if="!planHidden"')
  })

  it('完整计划收成一行，点开才铺开（2026-10-04）', () => {
    const section = readSection()

    // 顾客来这一页是看"下一针什么时候打"，不是来读免疫程序表的。
    // 一屏直接铺 9 项，把上面那行"下一步"淹掉了。
    expect(section).toContain('planListExpanded')
    expect(section).toContain('@tap="planListExpanded = !planListExpanded"')
    expect(section).toContain('planListHint')
  })

  it('但"记录与建议不一致"不折叠 —— 藏起来等于没说', () => {
    const section = readSection()

    // conflicts 必须在折叠之外
    const expandAt = section.indexOf('<template v-if="planListExpanded">')
    const conflictsAt = section.indexOf('plan.conflicts')
    expect(expandAt).toBeGreaterThan(-1)
    expect(conflictsAt).toBeGreaterThan(-1)
    expect(conflictsAt).toBeLessThan(expandAt)
  })

  it('一条都对不上号时不报"已完成 N 项"（那是假进度）', () => {
    const section = readSection()

    expect(section).toContain('if (noEvidence.value) {')
  })

  it('结尾有"仍在专业审核"的说明', () => {
    const section = readSection()

    expect(section).toContain('本计划仍在做专业审核')
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
    // 状态标签走 noEvidence
    expect(section).toContain('if (noEvidence.value && (status === \'OVERDUE\' || status === \'DUE\'))')
  })
})

describe('疫苗计划 · 接线', () => {
  it('挂在疫苗书签下，且排在疫苗记录上方', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('<VaccinePlanSection :dog-id="dogId" />')
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
