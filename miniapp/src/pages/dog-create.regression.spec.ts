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
   * 性别与是否绝育改成「选填 + 折叠」（2026-09-27，U2）
   *
   * 实测：性别不参与任何热量计算（只在繁殖期给个提示），绝育也只在
   * 「成犬且为工作犬」时才用得到。让顾客在最想快点看到喂食建议的时候
   * 停下来回答两个不影响结果的问题，代价不值。
   */
  describe('性别与绝育收进「更多信息」', () => {
    const readPage = () =>
      readFileSync(resolve(process.cwd(), 'src/pages/dog-create/index.vue'), 'utf-8')

    it('默认收起，需要顾客主动展开', () => {
      const source = readPage()

      expect(source).toContain('const showMoreInfo = ref(false)')
      expect(source).toContain('更多信息（选填）')
      expect(source).toContain('toggleMoreInfo')
      expect(source).toContain('v-if="showMoreInfo"')
    })

    it('两项都还有入口（折叠不等于删掉）', () => {
      const source = readPage()

      expect(source).toContain('selectGender(')
      expect(source).toContain('selectNeutered(')
    })

    it('绝育的话术与真实算法一致（不再宣称"会影响热量评估"）', () => {
      const viewSource = readFileSync(
        resolve(process.cwd(), 'src/utils/dog-profile-create-view.ts'),
        'utf-8',
      )

      expect(viewSource).not.toContain('是否绝育会影响小家伙的热量评估')
      expect(viewSource).toContain('极少数情况')
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
})
