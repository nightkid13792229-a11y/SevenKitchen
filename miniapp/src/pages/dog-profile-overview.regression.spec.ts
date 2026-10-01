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

  it('成品食谱历史板块已按老板要求移除（含相关请求与死代码）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )

    expect(source).not.toContain('成品食谱历史')
    // 一并清掉：列表状态、加载函数、格式化函数、跳订单详情的入口
    expect(source).not.toContain('finishedFoodHistory')
    expect(source).not.toContain('FinishedFoodHistory')
    expect(source).not.toContain('formatHistory')
    expect(source).not.toContain('loadFinishedFoodHistory')
  })

  it('orders activity choices from resting through city routine to active levels', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )
    // 2026-10-01：概览页不再自己写一份选项，改用与建档页**同一份**共享定义。
    // （此前两页各写一份，描述已经开始不一致 —— 同一个问题两个页面说法不同。）
    expect(source).toContain('getCreateActivityChoices()')

    const sharedSource = readFileSync(
      resolve(process.cwd(), 'src/utils/dog-profile-create-view.ts'),
      'utf-8',
    )
    // 声明上可能带类型标注（2026-10-01 起显式写了 readonly ActivityLevelChoice[]），
    // 所以正则只锚定数组本身
    const optionsSource =
      sharedSource.match(/const ACTIVITY_LEVEL_CHOICES(?::[^=]+)? = \[[\s\S]*?\n\]/)?.[0] || ''

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

    // 前三档起始热量相同这件事要在界面上说清楚，不能让顾客以为算错了
    expect(source).toContain('activityLevelNote')
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

    it('给出显眼的健康管理入口，指向真正能保存的健康管理页', () => {
      const source = readOverview()

      // 2026-09-30：「健康档案」改称「健康管理」，入口按钮同步改名
      expect(source).toContain('健康管理')
      expect(source).toContain('goToHealthProfile')
      expect(source).toContain('/pages/dog-profile-health/index?dogId=')
      // 这两段说明文案已按老板要求删除
      expect(source).not.toContain('查看病史、体检、过敏与挑食信息')
      expect(source).not.toContain('都在这里维护')
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

  it('九宫格、旧参考图、热量影响全部下线', () => {
    // 只查代码，不查注释 —— 注释里正解释着为什么把热量影响删掉
    const source = readOverview()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')

    expect(source).not.toContain('bcs-choice')
    expect(source).not.toContain('getBcsChoiceOptions')
    expect(source).not.toContain('BCS_GUIDE_IMAGE_URL')
    expect(source).not.toContain('bcs-guide-image')
    // 2026-09-30 老板要求：活动量、零食的热量影响也一并删掉（此前只删了 BCS 的）
    expect(source).not.toContain('热量影响')
    expect(source).not.toContain('toggleFeedingImpactInfo')
    expect(source).not.toContain('activeFeedingImpactInfo')
    expect(source).not.toContain('getFeedingImpactExplanation')
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
