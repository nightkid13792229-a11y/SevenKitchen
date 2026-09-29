import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

describe('dog-create runtime regressions', () => {
  it('keeps a local avatar preview during creation and uploads it after create succeeds', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-create/index.vue'),
      'utf-8',
    )

    expect(source).toContain('<DogAvatarCropper')
    expect(source).toContain('showAvatarCropper')
    expect(source).toContain('avatarCropSourcePath')
    expect(source).toContain('handleCreateAvatarCropConfirm')
    expect(source).toContain('persistDogAvatarLocalPreviewPath')
    expect(source).toContain('avatarTempFilePath')
    expect(source).toContain('await dogCreateApi.uploadAvatar(')
    expect(source).toContain('档案已创建，头像上传失败')
  })

  it('uses the hot breed api instead of deriving shortcuts from isCommon metadata', () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-create/index.vue'),
      'utf-8',
    )
    const apiSource = readFileSync(
      resolve(process.cwd(), 'src/api/dogs.ts'),
      'utf-8',
    )

    expect(apiSource).toContain("hotBreeds: () => request({ url: '/dogs/breeds/hot', method: 'GET' })")
    expect(pageSource).toContain("const hotBreeds = ref<Breed[]>([])")
    expect(pageSource).toContain('dogCreateApi.hotBreeds()')
    expect(pageSource).toContain('热门品种')
    expect(pageSource).not.toContain('breeds.value.filter(b => b.isCommon).map(b => b.name)')
  })

  it('routes dog create requests through stable api references', () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-create/index.vue'),
      'utf-8',
    )

    expect(pageSource).not.toContain("import { request } from '../../utils/api'")
    expect(pageSource).toContain('const dogCreateApi = {')
    expect(pageSource).toContain('breeds: dogApi.breeds')
    expect(pageSource).toContain('hotBreeds: dogApi.hotBreeds')
    expect(pageSource).toContain('preview: dogApi.preview')
    expect(pageSource).toContain('create: dogApi.create')
    expect(pageSource).toContain('createWeightRecord: dogApi.createWeightRecord')
    expect(pageSource).toContain('uploadAvatar: dogApi.uploadAvatar')
    expect(pageSource).toContain('await dogCreateApi.preview(payload)')
    expect(pageSource).toContain('await dogCreateApi.create(payload)')
    expect(pageSource).not.toContain('await dogApi.preview(payload)')
    expect(pageSource).not.toContain('await dogApi.create(payload)')
  })

  /**
   * 体况评分 / 活动量不再"替顾客预选"（2026-09-27，U1 + U3）
   *
   * 原先这两项都预填了默认值（5 分 / 低活动）且渲染成"已选中"，
   * 顾客一路点下一步也会提交 —— 数据库里因此永远有值，分不清
   * "顾客真的选过"还是"系统替他选的"（生产 4544 只狗里 3466 只等于默认值 5）。
   * 老板定的定制门槛若只看"有没有值"，就永远拦不住任何人。
   */
  describe('不再替顾客预选喂食信息', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('体况评分与活动量的初始值都是"未选择"', () => {
      const source = readPage()

      expect(source).toContain('bcsScore: null,')
      expect(source).toContain("activityLevel: '',")
      // 不许再把默认值写回去
      expect(source).not.toContain('bcsScore: 5,\n  activityLevel')
    })

    it('顾客点过才记确认，并且把确认状态提交给后端', () => {
      const source = readPage()

      expect(source).toContain('formData.value.bcsScoreConfirmed = true')
      expect(source).toContain('formData.value.activityLevelConfirmed = true')
      // 未确认时用兜底值算热量，但确认状态如实上报
      expect(source).toContain('FALLBACK_BCS_SCORE')
      expect(source).toContain('FALLBACK_ACTIVITY_LEVEL')
    })

    it('不强制阻断：活动量不再出现在必填校验里', () => {
      const source = readPage()
      const canSubmitSource =
        source.match(/const canSubmit = computed\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''

      expect(canSubmitSource).not.toBe('')
      expect(canSubmitSource).not.toContain('formData.value.activityLevel')
    })

    it('未选择时不假装已经选好（改成断言机制，不靠页面文案）', () => {
      // 2026-09-29 调整：老板要求删掉「还没选择 · 定制食谱需要这一项」这类文字提醒
      // （页面能引导清楚就不需要文字）。
      // 但**这条测试原本要防的事仍然必须成立** —— 不能默认选中 5 分让顾客
      // 无意识地跳过。所以改成断言机制，而不是断言那句文案：
      const source = readPage()

      // 1) 确认状态默认 false：没选就是没选
      expect(source).toContain('bcsScoreConfirmed: false')
      expect(source).toContain('activityLevelConfirmed: false')

      // 2) 提交时如实上报确认状态，不是"有值就算确认"
      const form = readFileSync(
        resolve(process.cwd(), 'src/utils/dog-profile-form.ts'),
        'utf-8',
      )
      expect(form).toContain('bcsScoreConfirmed: Boolean(form.bcsScoreConfirmed)')
    })

    it('每日餐数按老板定稿文案标注，且不写成"影响价格"', () => {
      const source = readPage()

      expect(source).toContain('影响制作单的生成，请确认')
      // 只检查真正渲染出来的文本，避免把注释也算进来
      expect(source).not.toMatch(/<text[^>]*>[^<]*影响价格/)
    })
  })

  it('提交 payload 会带上确认标记（否则门槛永远失效）', () => {
    const formSource = readFileSync(
      resolve(process.cwd(), 'src/utils/dog-profile-form.ts'),
      'utf-8',
    )

    expect(formSource).toContain('bcsScoreConfirmed: Boolean(form.bcsScoreConfirmed)')
    expect(formSource).toContain('activityLevelConfirmed: Boolean(form.activityLevelConfirmed)')
    expect(formSource).toContain('mealsPerDayConfirmed: Boolean(form.mealsPerDayConfirmed)')
    // 兜底值必须存在，否则后端校验会因为 undefined 直接拒单
    expect(formSource).toContain('DEFAULT_BCS_SCORE')
    expect(formSource).toContain('DEFAULT_ACTIVITY_LEVEL')
  })

  /**
   * 性别与绝育：放在第 1 步姓名下方，且必填（2026-09-27 老板决定）
   *
   * 背景：这两项一度被改成「选填 + 默认收起」（基于"实测不影响热量计算"）。
   * 老板判断填写成本对顾客极低，要求放回姓名下方顺手完成，并恢复必填。
   *
   * 但**不能因此恢复预选默认值** —— 原先默认「弟弟 / 未绝育」会让顾客
   * 无意识跳过，母狗被存成公狗（生产里性别分布明显偏向公狗就是证据之一）。
   * 所以做成：必填 + 不预选。
   */
  describe('性别与绝育（第 1 步必填）', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('放在第 1 步姓名下方，不再有折叠的「更多信息」', () => {
      const source = readPage()
      const basicSection =
        source.match(/showBasicSection[\s\S]*?showFeedingSection/)?.[0] || ''

      expect(basicSection).not.toBe('')
      expect(basicSection).toContain('性别 *')
      expect(basicSection).toContain('绝育状态 *')
      // 姓名要在性别之前（"顺手完成"的位置）
      expect(basicSection.indexOf('狗狗名字')).toBeLessThan(
        basicSection.indexOf('性别 *'),
      )
      expect(source).not.toContain('更多信息（选填）')
      expect(source).not.toContain('showMoreInfo')
    })

    it('必填但不预选：顾客必须自己选过', () => {
      const source = readPage()

      expect(source).toContain("gender: '',")
      expect(source).toContain('isNeutered: null,')
      // 不许再写回默认值
      expect(source).not.toContain("gender: 'MALE',\n  isNeutered")
    })

    it('校验要求两者都真的选过（false 也算选过）', () => {
      const viewSource = readFileSync(
        resolve(process.cwd(), 'src/utils/dog-profile-create-view.ts'),
        'utf-8',
      )

      expect(viewSource).toContain('hasValue(form.gender)')
      // 绝育必须用 === true / === false 判断：hasValue(false) 为真，会误判
      expect(viewSource).toContain('form.isNeutered === true || form.isNeutered === false')
    })
  })

  /**
   * 品种板块的 UX 优化（2026-09-27）
   *
   * 背景（生产数据）：手填品种名的狗有 333 只，其中 **70%（234 只）**
   * 是「田园犬 / 中华田园犬 / 田园 / 串串 / 混血」这一类 ——
   * 顾客不是在找纯种，而是搜不到只好手打。
   *
   * 另一边：「恢复按品种自动匹配」原先是一行纯文字（无底色/无边框），
   * 看不出能点；而旁边同级的「手动选择」反而有底色，视觉权重反了。
   */
  describe('品种与体型的交互优化', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('「没有明确品种」的常见叫法一点即选，不用打字', () => {
      const source = readPage()

      expect(source).toContain('mixedBreedQuickOptions')
      expect(source).toContain("'中华田园犬'")
      expect(source).toContain("'串串'")
      expect(source).toContain('startQuickMixedBreed')
      expect(source).toContain('没有明确品种')
    })

    it('一键选项走的是已有的混血通道，不预判体型', () => {
      const helper =
        readPage().match(/function startQuickMixedBreed[\s\S]*?\n\}/)?.[0] || ''

      expect(helper).not.toBe('')
      // 体型必须由顾客自己选（混血犬无法从品种推算）
      expect(helper).toContain('customBreedSizeClass.value = null')
      expect(helper).toContain("showCustomBreedInput.value = true")
    })

    it('「恢复自动匹配」做成按钮样式，并写明会恢复到哪个体型', () => {
      const source = readPage()

      expect(source).toContain('restore-auto-btn')
      expect(source).toContain('autoMatchedSizeLabel')
      expect(source).toContain('恢复为：')
      // 不再是那行没有底色、看不出能点的纯文字
      expect(source).not.toContain('class="restore-auto-link"')
    })

    it('恢复按钮的样式具备按钮外观（底色 + 边框 + 圆角）', () => {
      const source = readPage()
      const style = source.match(/\.restore-auto-btn \{[\s\S]*?\n\}/)?.[0] || ''

      expect(style).not.toBe('')
      expect(style).toContain('background-color')
      expect(style).toContain('border')
      expect(style).toContain('border-radius')
    })
  })

  /**
   * 建档流程**不含**健康信息（2026-09-27 老板决定）
   *
   * 历史：先做过「健康信息」第 3 步（可跳过 + 一点即选 + 上传报告 AI 识别）。
   * 老板随后否掉了整个做法 —— 建档是顾客只想尽快填完的时刻，
   * 往里塞健康信息就是在给建档加填写成本。健康记录改由顾客主动去
   * 「健康管理」板块补充，那两个降低填写成本的做法一并搬了过去。
   */
  describe('建档流程不含健康信息', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('步骤只有 基础信息 → 喂食信息 → 结果页', () => {
      const constants = readFileSync(
        resolve(process.cwd(), 'src/constants/dog-profile.ts'),
        'utf-8',
      )

      expect(constants).toContain("['basic', 'feeding', 'recommendation']")
      expect(constants).not.toContain("'health'")
    })

    it('建档页里没有任何健康信息步骤的残留（模板 / 状态 / 样式）', () => {
      const source = readPage()

      for (const dead of [
        'showHealthSection',
        'wizard-step--health',
        'skipHealthStep',
        '暂时跳过',
        '对什么过敏（可多选）',
        'commonAllergens',
        'toggleAllergen',
        'pickHealthReport',
        'healthReportCandidates',
        'health-tag-section',
        'health-skip-btn',
      ]) {
        expect(source).not.toContain(dead)
      }
    })

    it('建档完成页不推销健康信息（老板：不要提）', () => {
      const source = readPage()
      const recommendationSection =
        source.match(/showRecommendationSection[\s\S]*?<StickyActionBar/)?.[0] || ''

      expect(recommendationSection).not.toBe('')
      expect(recommendationSection).not.toContain('健康管理')
      expect(recommendationSection).not.toContain('过敏')
    })

    it('AI 报告识别整块搬到了「健康管理」，而不是在建档页留下死代码', () => {
      const source = readPage()
      const quickAdd = readFileSync(
        resolve(process.cwd(), 'src/components/dog-profile/AllergyQuickAddSection.vue'),
        'utf-8',
      )

      // 建档页不再有识别入口
      expect(source).not.toContain('extractHealthReport')
      expect(source).not.toContain('uploadHealthAttachment')
      // 能力没有丢：上传 → 识别 两步搬到了过敏快速添加
      expect(quickAdd).toContain('dogApi.uploadHealthAttachment(')
      expect(quickAdd).toContain('dogApi.extractHealthReport(')
    })
  })

  /**
   * 接口层：AI 报告识别要跑 OCR + AI，默认 15s 超时不够
   */
  describe('健康报告识别接口配置', () => {
    it('带上了超时与错误提示抑制', () => {
      const apiSource = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

      expect(apiSource).toContain("url: '/health/extract-report'")
      expect(apiSource).toContain('suppressErrorToast: true')
      expect(apiSource).toContain('timeout: 60000')
    })
  })

  /**
   * 头像位置（2026-09-30 调整）
   *
   * 曾经后置到完成页，老板要求放回第一步 —— 放在「姓名」正下方。
   * 头像仍然纯可选，不影响建档。
   */
  describe('头像放在第一步姓名的下方', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('第一步（姓名之后）有头像入口', () => {
      const basicSection =
        readPage().match(/showBasicSection[\s\S]*?wizard-step--feeding/)?.[0] || ''

      expect(basicSection).not.toBe('')
      expect(basicSection).toContain('handleCreateAvatarTap')
      expect(basicSection).toContain('avatar-prompt-card')
    })

    it('头像紧跟在「狗狗名字」字段之后', () => {
      const basicSection =
        readPage().match(/showBasicSection[\s\S]*?wizard-step--feeding/)?.[0] || ''
      const nameIdx = basicSection.indexOf('狗狗名字')
      const avatarIdx = basicSection.indexOf('handleCreateAvatarTap')

      expect(nameIdx).toBeGreaterThan(-1)
      expect(avatarIdx).toBeGreaterThan(nameIdx)
    })

    it('第三步不再出现头像入口', () => {
      const source = readPage()
      const recommendation = source.match(/showRecommendationSection[\s\S]*$/)?.[0] || ''

      expect(recommendation).not.toContain('给它挑个头像吧')
    })
  })

  /**
   * 活动量卡片右侧的"信号条"已按老板要求移除（2026-09-27 验收）
   *
   * 之前为满足"活动量加图示"加过 1-5 格的强度条，但老板认为它在视觉上是多余的
   * 装饰（像手机信号图标），要求删掉。这里锁住"不要再加回来"。
   */
  describe('活动量卡片不再有强度条', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('模板与样式中都没有强度条', () => {
      const source = readPage()

      expect(source).not.toContain('activity-intensity')
      expect(source).not.toContain('option.intensity')
    })

    it('活动量选项里也不再带强度值', () => {
      const viewSource = readFileSync(
        resolve(process.cwd(), 'src/utils/dog-profile-create-view.ts'),
        'utf-8',
      )
      const choices =
        viewSource.match(/const ACTIVITY_LEVEL_CHOICES = \[[\s\S]*?\n\] as const/)?.[0] || ''

      expect(choices).not.toBe('')
      expect(choices).not.toContain('intensity')
    })
  })

  /**
   * 品种板块的 UX 优化（2026-09-27）
   *
   * 背景（生产数据）：手填品种名的狗有 333 只，其中 **70%（234 只）**
   * 是「田园犬 / 中华田园犬 / 田园 / 串串 / 混血」这一类 ——
   * 顾客不是在找纯种，而是搜不到只好手打。
   *
   * 另一边：「恢复按品种自动匹配」原先是一行纯文字（无底色/无边框），
   * 看不出能点；而旁边同级的「手动选择」反而有底色，视觉权重反了。
   */
  describe('活动量参考图', () => {
    it('提供活动量参考图，并带加载失败降级', () => {
      const source = readFileSync(
        resolve(process.cwd(), 'src/pages/dog-create/index.vue'),
        'utf-8',
      )

      expect(source).toContain('activityGuideImageUrl')
      expect(source).toContain('img.sevenkitchen.cloud')
      expect(source).toContain('onActivityImageError')
      expect(source).toContain('showActivityFallback')
    })
  })

  /**
   * 活动量的「热量影响」说明必须与真实算法一致（2026-09-27）
   *
   * 原文案按 5 档列出 ×0.8/×0.9/×1.0/×1.2/×1.5，但实测成年犬只分两档
   * （休息静养 与 城市日常 同档；规律运动 与 高活动 同档）。
   * 按原文案提问，顾客会以为自己正在做 5 档精细调节 —— 说明与结果对不上，
   * 会直接损害对喂食建议的信任。
   */
  describe('活动量热量说明与算法一致', () => {
    it('不再对成年犬宣称 5 档细分乘数', () => {
      const source = readFileSync(
        resolve(process.cwd(), 'src/utils/dog-profile-overview.ts'),
        'utf-8',
      )
      // 只取真正渲染给顾客的 items 段，避免把代码注释也算进来
      const activityBlock =
        source.match(/activity: \{[\s\S]*?\n    \},/)?.[0] || ''
      const itemsBlock = activityBlock.match(/items: \[[\s\S]*?\n      \],/)?.[0] || ''

      expect(itemsBlock).not.toBe('')
      expect(itemsBlock).not.toContain('×0.9')
      expect(itemsBlock).toContain('只分两档')
    })
  })

  /**
   * 喜欢 / 不吃的食材（2026-09-27，决策 7）
   *
   * preferredFoods 这一列一直存在、配方设计器与 AI 早就在读，
   * 但顾客端完全没有入口 —— 生产 4544 只狗里整列为空。
   */
  /**
   * 健康管理步骤的边界（2026-09-27 老板验收）
   *
   * 老板要求：
   *   1. 步骤文案由「健康信息」改为「健康管理」
   *   2. 标题「有什么要注意的吗」与其说明小字都去掉
   *   3. **食材偏好不属于健康信息** —— 喜欢/不吃的食材要单独填写
   *
   * 后续（同日）：整个健康管理步骤已从建档流程删除，上述要求随之下沉为
   * 「建档页不出现这些字样」的守卫，真正的承载方是「健康管理」板块。
   */
  describe('健康管理步骤的边界', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('步骤条里不再有健康管理这一步，也不再叫「健康信息」', () => {
      const header = readFileSync(
        resolve(process.cwd(), 'src/components/dog-profile/StepProgressHeader.vue'),
        'utf-8',
      )

      expect(header).not.toContain('健康信息')
      expect(header).not.toContain('健康管理')
    })

    it('不再有「有什么要注意的吗」标题与说明小字', () => {
      const source = readPage()

      expect(source).not.toContain('有什么要注意的吗')
      expect(source).not.toContain(
        '告诉我们它不能吃什么，我们会在推荐食谱时自动避开',
      )
    })

    it('建档页不含任何食材偏好输入（那不属于喂食参数）', () => {
      const source = readPage()
      // 只看渲染部分：字段注释里出现"不吃的食材"是允许的
      const template = source.slice(0, source.indexOf('<script'))

      expect(template).not.toContain('喜欢吃的食材')
      expect(template).not.toContain('不吃的食材')
      // 辅助代码一并移除，避免留死代码
      expect(source).not.toContain('commonFoodTags')
      expect(source).not.toContain('toggleFoodTag')
    })
  })
})

/**
 * BCS 体态评分板块的整改（2026-09-29，老板逐条确认的 5 项）
 *
 *   1. 挪到「喂食信息」这一步的**最后** —— 它是最重的输入（要摸狗、答四题）
 *   2. 指导改为两张实拍图，贴在对应问题的**上方**
 *   3. 之前 AI 生成的指导图（质量太差）不再使用
 *   4. 删掉「热量影响」入口与面板 —— 太专业
 *   5. 删掉提醒文案与逐题小字，只留一个轻量 Banner
 */
describe('dog-create · BCS 板块整改', () => {
  const read = () => readFileSync(
    resolve(process.cwd(), 'src/pages/dog-create/index.vue'),
    'utf-8',
  )

  it('实拍指导图挂在题干上方', () => {
    const q = readFileSync(
      resolve(process.cwd(), 'src/utils/bcs-questionnaire.ts'),
      'utf-8',
    )
    expect(q).toContain('bcs-guide-palpate-ribs.jpg')

    // 模板里图片必须在标题**之前**渲染，才是"上方"
    const page = read()
    const qBlock = page.match(/v-for="question in bcsQuestions"[\s\S]*?<\/view>\s*<\/view>/)?.[0] || ''
    expect(qBlock).not.toBe('')
    expect(qBlock.indexOf('bcs-question__image')).toBeGreaterThan(-1)
    expect(qBlock.indexOf('bcs-question__image')).toBeLessThan(
      qBlock.indexOf('bcs-question__title'),
    )
  })

  it('指导图走 CDN，不能打进小程序包', () => {
    const q = readFileSync(
      resolve(process.cwd(), 'src/utils/bcs-questionnaire.ts'),
      'utf-8',
    )
    // 包内媒体资源只有 200KB 额度、且已用到 97%，塞不下 ——
    // 必须放 CDN（与「活动量参考图」同一套做法）。
    const urls = q.match(/image: '([^']+)'/g) || []
    expect(urls).toHaveLength(1)
    for (const line of urls) {
      expect(line).toContain('https://img.sevenkitchen.cloud/')
      expect(line).not.toContain('/static/')
    }
    // 包内不得再留副本（留了就超预算）
    expect(existsSync(resolve(process.cwd(), 'src/static/bcs-guide'))).toBe(false)
  })

  it('不再使用之前 AI 生成的指导图', () => {
    const page = read()
    expect(page).not.toContain('bcs-how-to-feel.jpg')
    expect(page).not.toContain('bcs-side-reference.jpg')
    expect(page).not.toContain('bcs-howto')
  })

  it('所有板块的「热量影响」入口与说明全部下线', () => {
    const page = read()
    // 2026-09-30 老板要求：活动量、零食的也一并删掉（此前只删了 BCS 的）
    expect(page).not.toContain('热量影响')
    expect(page).not.toContain('toggleFeedingImpact')
    expect(page).not.toContain('feedingImpactExpanded')
    expect(page).not.toContain('feedingImpactContent')
    expect(page).not.toContain('feeding-impact')
  })

  it('删掉提醒文案与逐题小字，只留一个 Banner', () => {
    const page = read()
    expect(page).not.toContain('还没选择 · 定制食谱需要这一项')
    expect(page).not.toContain('长毛狗狗看不出来')
    expect(page).not.toContain('bcs-question__hint')
    expect(page).toContain('回答以下问题，确认狗狗的体态健康！')
    expect(page).toContain('bcs-banner')

    // 逐题小字连**数据**一并删掉 —— 留着字段迟早又被渲染回界面
    const q = readFileSync(
      resolve(process.cwd(), 'src/utils/bcs-questionnaire.ts'),
      'utf-8',
    )
    expect(q).not.toContain('hint')
  })

  it('BCS 问卷挪到第三步「体态评估」的最上面', () => {
    const page = read()
    const recIdx = page.indexOf('showRecommendationSection')
    const feedingIdx = page.indexOf('wizard-step--feeding')
    const bcsIdx = page.indexOf('BCS 体态评分')

    expect(recIdx).toBeGreaterThan(-1)
    expect(feedingIdx).toBeGreaterThan(-1)
    expect(bcsIdx).toBeGreaterThan(-1)

    // BCS 必须在第三步里，且不再出现在第二步
    expect(bcsIdx).toBeGreaterThan(recIdx)
    expect(page.slice(feedingIdx, recIdx)).not.toContain('BCS 体态评分')
  })

  it('第三步可以整步跳过：按钮不再依赖「能量卡已就绪」', () => {
    const actions = readFileSync(
      resolve(process.cwd(), 'src/utils/dog-profile-create-actions.ts'),
      'utf-8',
    )
    const page = read()

    // 原先禁用条件里带 recommendationReady，会让"没答体况"变成
    // "完成建档点不动"，与"可跳过"直接矛盾
    expect(actions).not.toContain('!input.recommendationReady')
    expect(page).not.toContain('recommendationReady:')
  })

  it('能量卡在第三步最下面，且体况答完才展示', () => {
    const page = read()
    const recBlock = page.slice(page.indexOf('showRecommendationSection'))

    expect(recBlock).toContain('v-if="effectiveBcs !== null"')
    expect(recBlock).toContain('RecommendationSummaryCard')
    // 顺序：问卷在前、能量卡在后
    expect(recBlock.indexOf('bcs-question__option')).toBeLessThan(
      recBlock.indexOf('RecommendationSummaryCard'),
    )
  })

  it('单一动作题：不需要「看不出来」按钮，也不按犬种分类', () => {
    const page = read()
    // 摸肋骨这一个动作，任何毛长、任何胸型都答得了 ——
    // 所以既不需要「看不出来」跳过，也不需要按犬种猜长毛。
    expect(page).not.toContain('isLongHaired')
    expect(page).not.toContain('resolveQuestions')
    expect(page).not.toContain('skippable')
    expect(page).not.toContain('BCS_SKIP')
    expect(page).not.toContain('看不出来')
    expect(page).toContain('BCS_QUESTIONS')
  })

  it('应用犬种分数下限，且展示与保存用同一个数', () => {
    const page = read()
    // 下限的名单与数值都在后端数据库，小程序只负责应用
    expect(page).toContain('applyBcsScoreMap')
    expect(page).toContain('bcsScoreMap')
    // 屏幕显示的分必须就是写进表单的分，否则顾客会看到两个数
    expect(page).toContain('effectiveBcs')
    expect(page).toContain('formData.value.bcsScore = applyBcsScoreMap(')
  })
})
