import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  stepWhenText,
  stepWindowText,
} from './status'
import {
  resolveVisibleHealthTabs,
  shouldMountVaccineSection,
  vaccineFeatureFailed,
} from '../../utils/vaccine-feature'
import type { VaccineStep } from './types'

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const done = {
  key: 'core-puppy-1',
  kind: 'core',
  kindLabel: '核心疫苗',
  kindShort: '核心',
  label: '第 1 针',
  layer: 'MUST',
  windowStart: '2026-09-01',
  windowEnd: '2026-09-15',
  matchedRecordDate: '2026-09-03',
  status: 'DONE',
  statusLabel: '已完成',
  titerable: true,
  products: [],
} as VaccineStep

describe('F7 / V13 · 已完成行显示实际接种日', () => {
  it('计划行左边用实际日，不用计划日', () => {
    expect(stepWindowText(done).main).toBe('2026/09/03')
  })

  it('“什么时候”用实际日', () => {
    expect(stepWhenText(done)).toContain('2026/09/03')
    expect(stepWhenText(done)).not.toContain('2026/09/01')
  })
})

describe('F3 / F8 · 补记入口与计划行记录', () => {
  it('记录区有“补记以前打过的针”入口', () => {
    const source = read('../../components/vaccine/RecordList.vue')
    expect(source).toContain('补记以前打过的针')
    expect(source).toContain("(event: 'add-record')")
  })

  it('计划当前行能直接“记录这一针”（不展开详情）', () => {
    const source = read('../../components/vaccine/PlanTimeline.vue')
    expect(source).toContain('记录这一针')
    expect(source).toContain('@tap.stop="onRecord(step)"')
    expect(source).toContain("(event: 'record', step: VaccineStep)")
  })
})

describe('F9 · 缺生日不挡记录 + 返回刷新', () => {
  it('NextCard/PlanTimeline 才依赖生日，记录区不被一起挡掉', () => {
    const source = read('../../components/vaccine/VaccineTab.vue')
    expect(source).toContain('v-if="planData?.birthday"')
    expect(source).toContain('@add-record="onBackfillRecord"')
    expect(source).toContain('  reload,')
  })

  it('页面 onShow 会重拉疫苗计划', () => {
    const page = read('../../pages/dog-profile-health/index.vue')
    expect(page).toContain('vaccineSectionRef.value?.reload?.()')
  })
})

describe('F10 / V12 · 开关失败保留书签 + 页内重试', () => {
  const tabs = [
    { key: 'medical' },
    { key: 'vaccine' },
    { key: 'weight' },
  ]

  it('失败时书签仍在，但不挂载板块（不请求疫苗数据）', () => {
    const failed = vaccineFeatureFailed('暂时没连上开关服务，请重试')
    expect(failed.failed).toBe(true)
    expect(resolveVisibleHealthTabs(tabs, failed)).toHaveLength(3)
    expect(shouldMountVaccineSection('vaccine', failed)).toBe(false)
  })

  it('页面有页内重试入口', () => {
    const page = read('../../pages/dog-profile-health/index.vue')
    expect(page).toContain('retryVaccineFeature')
    expect(page).toContain('疫苗板块暂时没打开')
  })
})
