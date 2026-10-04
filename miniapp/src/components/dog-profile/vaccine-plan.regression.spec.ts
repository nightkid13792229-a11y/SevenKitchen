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

  it('一条记录都没有时不报"已完成 N 项"（那是假进度）', () => {
    const section = readSection()

    expect(section).toContain('if (noRecordAtAll.value) {')
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

  it('先说明"档案里还没有接种记录"，再谈逾期', () => {
    const section = readSection()

    // 实测：8 个月、没记过疫苗的狗，页面直接顶着 5 个「已逾期」——
    // 家长明明打过、只是没记，会以为系统算错了
    expect(section).toContain('noRecordAtAll')
    expect(section).toContain('档案里还没有接种记录')
    expect(section).toContain('把接种记录补上，这里会自动对齐')
  })

  it('判定条件来自后端的 summary.done 与 matchedRecordId，不自己猜', () => {
    const section = readSection()

    expect(section).toContain('plan.value.summary?.done')
    expect(section).toContain('step.matchedRecordId')
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
