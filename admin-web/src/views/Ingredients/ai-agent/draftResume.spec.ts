import { describe, expect, it } from 'vitest'
import {
  formatDraftUpdatedAt,
  pickLatestDraft,
  readDraftIdFromQuery,
  readPendingPlan,
} from './draftResume'
import type { IngredientCreationDraftSummary } from '@/types/ingredientCreation'

function draft(
  draftId: string,
  updatedAt: string,
): IngredientCreationDraftSummary {
  return {
    draftId,
    name: draftId,
    step: 'PROFILE',
    updatedAt,
    intake: null,
  }
}

describe('readDraftIdFromQuery', () => {
  it('只认非空字符串，其它一律 null', () => {
    expect(readDraftIdFromQuery('draft-1')).toBe('draft-1')
    expect(readDraftIdFromQuery('  draft-1  ')).toBe('draft-1')
    expect(readDraftIdFromQuery('')).toBeNull()
    expect(readDraftIdFromQuery(undefined)).toBeNull()
    expect(readDraftIdFromQuery(['draft-1'])).toBeNull()
  })
})

describe('formatDraftUpdatedAt', () => {
  const now = new Date('2026-11-21T12:00:00.000Z')

  it('刚刚 / 分钟 / 小时 / 日期', () => {
    expect(formatDraftUpdatedAt('2026-11-21T11:59:30.000Z', now)).toBe('刚刚')
    expect(formatDraftUpdatedAt('2026-11-21T11:30:00.000Z', now)).toBe(
      '30 分钟前',
    )
    expect(formatDraftUpdatedAt('2026-11-21T09:00:00.000Z', now)).toBe(
      '3 小时前',
    )
    expect(formatDraftUpdatedAt('2026-11-19T09:00:00.000Z', now)).toBe(
      '2026-11-19',
    )
  })

  it('非法时间返回空串，不显示 Invalid Date', () => {
    expect(formatDraftUpdatedAt('not-a-date', now)).toBe('')
  })
})

describe('pickLatestDraft', () => {
  it('取最近编辑的一条，空列表返回 null', () => {
    const list = [
      draft('a', '2026-11-20T10:00:00.000Z'),
      draft('b', '2026-11-21T10:00:00.000Z'),
      draft('c', '2026-11-19T10:00:00.000Z'),
    ]
    expect(pickLatestDraft(list)?.draftId).toBe('b')
    expect(pickLatestDraft([])).toBeNull()
  })
})

describe('readPendingPlan', () => {
  it('只恢复 PENDING 方案；其它状态不弹卡', () => {
    expect(
      readPendingPlan({
        searchPlan: { status: 'PENDING', keywords: [], libraries: [] },
      }),
    ).toMatchObject({ status: 'PENDING' })
    expect(
      readPendingPlan({ searchPlan: { status: 'APPROVED' } }),
    ).toBeNull()
    expect(readPendingPlan({})).toBeNull()
  })
})
