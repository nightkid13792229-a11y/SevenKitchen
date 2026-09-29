import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('dog-profile-overview runtime regressions', () => {
  it('does not reference removed applyProfile helper in diet reminder save flow', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )

    expect(source).toContain('applyServerState(')
    expect(source).not.toContain('applyProfile(')
  })

  it('uses hot breeds for the default breed shortcuts instead of isCommon metadata', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )

    expect(source).toContain("const hotBreeds = ref<DogBreedItem[]>([])")
    expect(source).toContain('dogApi.hotBreeds()')
    expect(source).not.toContain('breeds.value.filter(breed => breed.isCommon).slice(0, 8)')
  })

  it('routes avatar replacement through the shared dogApi helper and refreshes local cache', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )

    expect(source).toContain('<DogAvatarCropper')
    expect(source).toContain('avatarCropSourcePath')
    expect(source).toContain('avatarLocalPreviewPath')
    expect(source).toContain('handleOverviewAvatarCropConfirm')
    expect(source).toContain('await dogApi.uploadAvatar(')
    expect(source).toContain('addDogToCache({')
  })

  it('shows customer-visible finished-food recipe history without DIY records', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )

    expect(source).toContain('成品食谱历史')
    expect(source).toContain('finishedFoodHistory')
    expect(source).toContain('finishedFoodHistoryItems')
    expect(source).toContain('/pages/order-detail/index?orderId=')
    expect(source).not.toContain('DIY历史')
  })

  it('orders activity choices from resting through city routine to active levels', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )
    const optionsSource = source.match(/const activityLevelOptions = \[[\s\S]*?\n\]/)?.[0] || ''

    expect(optionsSource.indexOf("value: 'RESTING'")).toBeLessThan(
      optionsSource.indexOf("value: 'LOW'"),
    )
    expect(optionsSource.indexOf("value: 'LOW'")).toBeLessThan(
      optionsSource.indexOf("value: 'NORMAL'"),
    )
    expect(optionsSource.indexOf("value: 'NORMAL'")).toBeLessThan(
      optionsSource.indexOf("value: 'HIGH'"),
    )
    expect(source).toContain("activityLevel: 'LOW'")
  })

  /**
   * 健康档案唯一入口（2026-09-27，老板决定 D6）
   *
   * 概览页原先内嵌了三个 HealthRecordsSection 编辑器，但**保存/删除事件从未接线** ——
   * 组件靠 emit 把保存动作交给父页面，概览页只监听了 @record-saved
   * （那是"记录已保存"的通知，不是"请保存"的请求）。
   * 结果：顾客展开填完病史/过敏、点"保存这一条"，不入库、不提示、退出即丢。
   *
   * 决定：删掉这个坏编辑器，只保留真正能保存的「健康管理」页一个入口。
   * 这组测试防止它被重新加回来。
   */
  describe('健康档案唯一入口', () => {
    const readOverview = () =>
      readFileSync(
        resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
        'utf-8',
      )

    it('不再内嵌健康记录编辑器（它的保存从未接线，会让顾客白填）', () => {
      const source = readOverview()

      expect(source).not.toContain('<HealthRecordsSection')
      expect(source).not.toContain('HealthRecordsSection.vue')
      // 保存/删除事件没有被监听，是当初失效的根因
      expect(source).not.toContain('@save-record')
      expect(source).not.toContain('@delete-record')
    })

    it('给出显眼的健康档案入口，指向真正能保存的健康管理页', () => {
      const source = readOverview()

      expect(source).toContain('管理健康档案')
      expect(source).toContain('goToHealthProfile')
      expect(source).toContain('/pages/dog-profile-health/index?dogId=')
    })

    it('只读态直接列出过敏原，而不是只给一个条数', () => {
      const source = readOverview()

      // 明细必须可见：否则顾客想看"我对什么过敏"就得进编辑态，而编辑态曾经是坏的
      expect(source).toContain('allergyNames')
      expect(source).toContain('过敏原')
    })
  })
})

/**
 * 体况输入口径统一（2026-09-29）
 *
 * 此前三个入口各说各话：建档页/定制页已是「摸一摸」动作问卷，
 * 总览页却还是 1-9 分九宫格 —— 顾客在那里能直接点一个分数，
 * 整条引导被绕过，而生产库 76.2% 的狗停在默认 5 分正是这种入口造成的。
 */
describe('dog-profile-overview · 体况输入口径统一', () => {
  const readOverview = () => readFileSync(
    resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
    'utf-8',
  )

  it('改用与建档页同一套动作问卷', () => {
    const source = readOverview()

    expect(source).toContain("from '../../utils/bcs-questionnaire'")
    for (const fn of ['BCS_QUESTIONS', 'resolveBcsFromAnswers', 'getBcsLabel']) {
      expect(source).toContain(fn)
    }
    // 不再按犬种分类，也不需要「看不出来」：单一动作题人人答得了
    expect(source).not.toContain('isLongHaired')
    expect(source).not.toContain('resolveQuestions')
    expect(source).not.toContain('skippable')
    // 犬种分数下限（名单与数值在后端数据库）
    expect(source).toContain('applyBcsScoreMap')
    expect(source).toContain('bcsScoreMap')
    // 题目与指导图必须真的渲染出来
    expect(source).toContain('bcs-question__title')
    expect(source).toContain('bcs-question__image')
    expect(source).toContain('bcs-question__option')
  })

  it('九宫格、旧参考图、BCS 热量影响全部下线', () => {
    const source = readOverview()

    expect(source).not.toContain('bcs-choice')
    expect(source).not.toContain('getBcsChoiceOptions')
    expect(source).not.toContain('BCS_GUIDE_IMAGE_URL')
    expect(source).not.toContain('bcs-guide-image')
    expect(source).not.toContain("toggleFeedingImpactInfo('bcs')")
    expect(source).not.toContain("activeFeedingImpactInfo === 'bcs'")
    // 活动量与零食的热量影响保留
    expect(source).toContain("toggleFeedingImpactInfo('activity')")
    expect(source).toContain("toggleFeedingImpactInfo('treat')")
  })

  it('不替顾客编答案：已有分数只如实显示，不预填选项', () => {
    const source = readOverview()

    // 「当前 N 分」是把已确认的值显示出来，不是把答案填上
    expect(source).toContain('bcs-current')
    expect(source).toContain('bcsStatus.confirmed && effectiveBcs === null')
    // 反向还原会把 6 分塌成 5 分（选项只有 1/5/7/9），已整体移除
    expect(source).not.toContain('resolveAnswersFromBcs')
    expect(source).not.toContain('seedBcsAnswersFromForm')
  })
})
