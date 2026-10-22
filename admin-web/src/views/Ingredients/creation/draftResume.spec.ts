import { describe, expect, it } from 'vitest'
import {
  creationStepLabel,
  formatDraftUpdatedAt,
  hasUnfinishedDrafts,
  resumeEntryLabel,
  UNKNOWN_STEP_LABEL
} from './draftResume'

/**
 * 「继续未完成」入口用到的展示函数。
 *
 * 后端只给英文站点枚举与 ISO 时间；页面必须翻成人话，
 * 并且没有未完成草稿时不能显示入口（避免点开一个空弹窗）。
 */
describe('原料创建向导 · 未完成草稿入口', () => {
  it('六个英文站点枚举都映射成中文人话', () => {
    expect(creationStepLabel('INTAKE')).toBe('起手')
    expect(creationStepLabel('SOURCES')).toBe('营养依据')
    expect(creationStepLabel('PROFILE')).toBe('档案成型')
    expect(creationStepLabel('CHECK')).toBe('终检')
    expect(creationStepLabel('INGREDIENT')).toBe('原料档案')
    expect(creationStepLabel('COMMIT')).toBe('收尾')
  })

  it('未知站点不把英文枚举裸露给用户', () => {
    expect(creationStepLabel('NOT_A_STEP')).toBe(UNKNOWN_STEP_LABEL)
    expect(creationStepLabel('')).toBe(UNKNOWN_STEP_LABEL)
  })

  it('空列表（含接口没返回/加载失败）时不显示入口', () => {
    expect(hasUnfinishedDrafts([])).toBe(false)
    expect(hasUnfinishedDrafts(null)).toBe(false)
    expect(hasUnfinishedDrafts(undefined)).toBe(false)
  })

  it('有一条及以上未完成草稿时才显示入口', () => {
    expect(hasUnfinishedDrafts([{ draftId: 'draft-1' }])).toBe(true)
  })

  it('入口文案带未完成数量', () => {
    expect(resumeEntryLabel(3)).toBe('继续未完成（3）')
  })

  it('最后编辑时间翻成「刚刚 / N 分钟前 / N 小时前 / N 天前」', () => {
    const now = new Date('2026-10-22T12:00:00.000Z')

    expect(formatDraftUpdatedAt('2026-10-22T11:59:30.000Z', now)).toBe('刚刚')
    expect(formatDraftUpdatedAt('2026-10-22T11:55:00.000Z', now)).toBe(
      '5 分钟前'
    )
    expect(formatDraftUpdatedAt('2026-10-22T09:00:00.000Z', now)).toBe(
      '3 小时前'
    )
    expect(formatDraftUpdatedAt('2026-10-20T12:00:00.000Z', now)).toBe(
      '2 天前'
    )
  })

  it('时间缺失或非法时给占位符，不显示 Invalid Date', () => {
    const now = new Date('2026-10-22T12:00:00.000Z')

    expect(formatDraftUpdatedAt('', now)).toBe('-')
    expect(formatDraftUpdatedAt('not-a-date', now)).toBe('-')
  })
})
