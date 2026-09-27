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
