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
})
