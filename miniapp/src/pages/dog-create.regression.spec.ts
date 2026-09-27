import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

    it('未选择时如实说明后果，而不是假装已经选好', () => {
      const source = readPage()

      expect(source).toContain('还没选择')
      expect(source).toContain('不选也能继续建档')
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
   * 建档新增「健康信息」第 3 步（2026-09-27，U1 第 6 步）
   *
   * 原先建档三步里一个字都没提健康信息，而它只藏在「健康管理」页 ——
   * 那个入口要去「编辑基础信息」里找。实测 93.6% 的狗狗档案完全没有健康信息
   * （过敏仅 24 只 / 4544，占 0.5%）。
   * 建档是顾客注意力最集中的时刻，因此把它做成可跳过的第 3 步，并一点即选。
   */
  describe('健康信息步骤', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('步骤顺序为 基础信息 → 喂食信息 → 健康信息 → 结果页', () => {
      const constants = readFileSync(
        resolve(process.cwd(), 'src/constants/dog-profile.ts'),
        'utf-8',
      )

      expect(constants).toContain(
        "['basic', 'feeding', 'health', 'recommendation']",
      )
    })

    it('可跳过：不填任何健康信息也能进入结果页', () => {
      const source = readPage()

      expect(source).toContain('skipHealthStep')
      expect(source).toContain('暂时跳过')
      // 健康步骤的推进分支里不得出现必填拦截
      const healthBranch =
        source.match(/currentCreateStep\.value === 'health'[\s\S]*?return\n  \}/)?.[0] || ''
      expect(healthBranch).not.toBe('')
      expect(healthBranch).not.toContain('showCreateStepBlockedToast')
    })

    it('常见过敏原一点即选，不用顾客手打', () => {
      const source = readPage()

      expect(source).toContain('commonAllergens')
      expect(source).toContain('toggleAllergen')
      expect(source).toContain('selectedAllergens')
      // 至少要覆盖最常见的几类
      for (const allergen of ['鸡肉', '牛肉', '鸡蛋', '牛奶']) {
        expect(source).toContain(`'${allergen}'`)
      }
    })

    it('写进的是顾客真正能维护的那份结构化记录', () => {
      const source = readPage()

      // 必须写 allergyRecords（结构化表），而不是顾客端没人能维护的旧文本字段
      expect(source).toContain('formData.value.allergyRecords = [')
      expect(source).toContain("allergen,")
    })
  })

  /**
   * 上传报告 → AI 自动识别（2026-09-27，M3b）
   *
   * 老板批准「先只做过敏原检测报告这一个」。让顾客自由填写的做法实测失败
   * （生产 4544 只狗只有 24 只填过过敏原），而过敏是定制食谱的安全底线。
   *
   * 三条不能退让的约束：
   *   1. 识别结果只是**候选**，顾客确认后才写入档案（AI 不得直接落库）
   *   2. 识别失败**降级为手工填写**，不阻断建档（A2）
   *   3. 不在服务端做诊断
   */
  describe('AI 报告识别', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('提供上传入口，并走「上传 → 识别」两步', () => {
      const source = readPage()

      expect(source).toContain('pickHealthReport')
      expect(source).toContain('上传报告')
      expect(source).toContain('dogCreateApi.uploadHealthAttachment(')
      expect(source).toContain('dogCreateApi.extractHealthReport(')
    })

    it('识别结果先放进候选区，顾客点了才写进档案', () => {
      const source = readPage()

      expect(source).toContain('healthReportCandidates')
      expect(source).toContain('识别到以下过敏原，请确认')
      // 候选点击走的就是 toggleAllergen（写入 allergyRecords 的唯一路径）
      const candidateBlock =
        source.match(/health-candidate-card[\s\S]*?<\/view>/)?.[0] || ''
      expect(candidateBlock).toContain('toggleAllergen')
    })

    it('识别失败时降级为手工填写，不阻断建档', () => {
      const source = readPage()

      expect(source).toContain('手工补充')
      // 失败路径只提示，不得抛出让流程中断，也不得弹必填拦截
      const catchBlock =
        source.match(/catch \(error: any\) \{[\s\S]*?healthReportExtracting.value = false/)?.[0] || ''
      expect(catchBlock).not.toBe('')
      expect(catchBlock).not.toContain('showCreateStepBlockedToast')
    })

    it('顾客取消选图不算失败（静默返回）', () => {
      const source = readPage()

      expect(source).toContain('顾客取消选图：静默返回，不算失败')
    })

    it('接口层带上了超时与错误提示抑制（识别要跑 OCR + AI）', () => {
      const apiSource = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

      expect(apiSource).toContain("url: '/health/extract-report'")
      expect(apiSource).toContain('suppressErrorToast: true')
      expect(apiSource).toContain('timeout: 60000')
    })
  })

  /**
   * 头像后置到完成页（2026-09-27，U1 第 3 步）
   *
   * 建档第一步顾客最想快点看到喂食建议，此时问"上传头像"是负担；
   * 头像本来就只是可选装饰，放到结果页更合适。
   */
  describe('头像后置', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('第一步不再有头像选择器', () => {
      const source = readPage()
      const basicSection =
        source.match(/showBasicSection[\s\S]*?showFeedingSection/)?.[0] || ''

      expect(basicSection).not.toBe('')
      expect(basicSection).not.toContain('profile-card__avatar-picker')
    })

    it('完成页提供可选的头像入口', () => {
      const source = readPage()

      expect(source).toContain('给它挑个头像吧')
      expect(source).toContain('avatar-prompt-card')
      // 复用同一套裁剪与上传流程，不能另起一套
      expect(source).toContain('handleCreateAvatarTap')
      expect(source).toContain('hasCreateAvatarPreview')
    })
  })

  /**
   * 活动量的可视化强度（2026-09-27，U1 第 5 步）
   *
   * 活动量是最影响热量的一项，却只有文字、没有配图（体况评分反而有参考图）。
   * 真实插图需要单独的素材决策，这里先用**不需要素材**的强度条，
   * 让顾客一眼看出档位高低。
   */
  describe('活动量可视化', () => {
    it('五个档位都带活动强度', () => {
      const viewSource = readFileSync(
        resolve(process.cwd(), 'src/utils/dog-profile-create-view.ts'),
        'utf-8',
      )
      const choices =
        viewSource.match(/const ACTIVITY_LEVEL_CHOICES = \[[\s\S]*?\n\] as const/)?.[0] || ''

      expect(choices).not.toBe('')
      for (const level of ['1', '2', '3', '4', '5']) {
        expect(choices).toContain(`intensity: ${level},`)
      }
    })

    it('卡片上渲染强度条，且与档位对应', () => {
      const source = readFileSync(
        resolve(process.cwd(), 'src/pages/dog-create/index.vue'),
        'utf-8',
      )

      expect(source).toContain('activity-intensity__bar')
      expect(source).toContain('option.intensity')
    })

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
  describe('喜欢与不吃的食材', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('两项都是一点即选，不用顾客手打', () => {
      const source = readPage()

      expect(source).toContain('喜欢吃的食材')
      expect(source).toContain('不吃的食材')
      expect(source).toContain('commonFoodTags')
      expect(source).toContain('toggleFoodTag')
    })

    it('分别写入 preferredFoods 与 pickyFoods', () => {
      const source = readPage()

      expect(source).toContain("toggleFoodTag('preferredFoods', item)")
      expect(source).toContain("toggleFoodTag('pickyFoods', item)")
    })

    it('提交 payload 带上 preferredFoods（否则这一列永远为空）', () => {
      const formSource = readFileSync(
        resolve(process.cwd(), 'src/utils/dog-profile-form.ts'),
        'utf-8',
      )

      expect(formSource).toContain('preferredFoods: normalizeOptionalText(form.preferredFoods)')
    })
  })
})
