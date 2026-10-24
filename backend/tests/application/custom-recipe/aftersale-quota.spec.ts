import { CustomRecipeAftersaleService } from '../../../src/application/custom-recipe/custom-recipe-aftersale.service'

/**
 * 售后配额（2026-10-18 · 需求 2.5.7 / 2.5.9）
 *
 * 此前**次数限制完全没做** —— 顾客可以无限提。
 */
function createQuotaService(options: {
  deliveredAt?: Date | null
  status?: string
  rows?: Array<{ status: string; rejectReason?: string | null; type?: string }>
  freeRevisionCount?: number
  aftersaleWindowDays?: number
}) {
  const deliveredAt =
    'deliveredAt' in options
      ? options.deliveredAt
      : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 两天前交付

  const prisma = {
    customRecipeOrder: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'cr-1',
        customerId: 'user-1',
        status: options.status ?? 'DELIVERED',
        deliveredAt: deliveredAt ?? null,
      }),
    },
    customRecipeAftersale: {
      findMany: jest.fn().mockImplementation(async ({ where }: any) => {
        return (options.rows ?? [])
          .filter((row) => !where?.type || (row.type ?? 'ADJUST_RECIPE') === where.type)
          .map((row, index) => ({
            id: `a-${index}`,
            status: row.status,
            rejectReason: row.rejectReason ?? null,
            createdAt: new Date(),
          }));
      }),
    },
  }

  const configService = {
    getConfig: jest.fn().mockResolvedValue({
      aftersaleWindowDays: options.aftersaleWindowDays ?? 7,
      freeRevisionCount: options.freeRevisionCount ?? 2,
    }),
  }

  const service = new CustomRecipeAftersaleService(
    prisma as never,
    configService as never,
    { listSet: jest.fn().mockResolvedValue([]) } as never,
  )

  return { service, prisma }
}

describe('售后配额', () => {
  it('★ 一次都没提过：2 次免费、窗口约 5 天', async () => {
    const { service } = createQuotaService({ rows: [] })
    const quota = await service.getQuota('CR1', 'user-1')

    expect(quota.freeRevisionCount).toBe(2)
    expect(quota.freeRevisionsLeft).toBe(2)
    expect(quota.canSubmit).toBe(true)
    expect(quota.reason).toBeNull()
    // 两天前交付、窗口 7 天 → 还剩 5 天
    expect(quota.windowDaysLeft).toBe(5)
  })

  it('★ 提过一次：还剩 1 次', async () => {
    const { service } = createQuotaService({ rows: [{ status: 'RESOLVED' }] })
    const quota = await service.getQuota('CR1', 'user-1')
    expect(quota.freeRevisionsLeft).toBe(1)
    expect(quota.canSubmit).toBe(true)
  })

  it('★ 两次用完：不能再提，且说清原因', async () => {
    const { service } = createQuotaService({
      rows: [{ status: 'RESOLVED' }, { status: 'RESOLVED' }],
    })
    const quota = await service.getQuota('CR1', 'user-1')

    expect(quota.freeRevisionsLeft).toBe(0)
    expect(quota.canSubmit).toBe(false)
    expect(quota.reason).toContain('次数已用完')
  })

  it('★ 撤回不计入次数（需求 2.5.9）', async () => {
    const { service } = createQuotaService({
      rows: [
        { status: 'REJECTED', rejectReason: '顾客自行撤回' },
        { status: 'REJECTED', rejectReason: '顾客自行撤回' },
      ],
    })
    const quota = await service.getQuota('CR1', 'user-1')

    expect(quota.usedCount).toBe(0)
    expect(quota.freeRevisionsLeft).toBe(2)
    expect(quota.canSubmit).toBe(true)
  })

  it('★ 有进行中的售后：不能再提', async () => {
    const { service } = createQuotaService({ rows: [{ status: 'PROCESSING' }] })
    const quota = await service.getQuota('CR1', 'user-1')

    expect(quota.hasOpen).toBe(true)
    expect(quota.canSubmit).toBe(false)
    expect(quota.reason).toContain('正在处理')
  })

  it('★ 旧的问题单不占调整次数、也不挡住调整', async () => {
    const { service } = createQuotaService({
      rows: [
        { status: 'RESOLVED', type: 'QUESTION' },
        { status: 'PENDING', type: 'OTHER' },
      ],
    })
    const quota = await service.getQuota('CR1', 'user-1')

    expect(quota.usedCount).toBe(0)
    expect(quota.freeRevisionsLeft).toBe(2)
    expect(quota.hasOpen).toBe(false)
    expect(quota.canSubmit).toBe(true)
  })

  it('★ 商家驳回不占次数（顾客撤回同样不占）', async () => {
    const { service } = createQuotaService({
      rows: [
        { status: 'REJECTED', rejectReason: '不符合调整范围' },
        { status: 'REJECTED', rejectReason: '顾客自行撤回' },
        { status: 'RESOLVED' },
      ],
    })
    const quota = await service.getQuota('CR1', 'user-1')

    expect(quota.usedCount).toBe(1)
    expect(quota.freeRevisionsLeft).toBe(1)
  })

  it('★ 窗口过了：不能再提', async () => {
    const { service } = createQuotaService({
      deliveredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    })
    const quota = await service.getQuota('CR1', 'user-1')

    expect(quota.windowDaysLeft).toBe(0)
    expect(quota.canSubmit).toBe(false)
    expect(quota.reason).toContain('受理期')
  })

  it('★ 还没交付：不能提，窗口剩余为 null（不是 0）', async () => {
    const { service } = createQuotaService({ deliveredAt: null })
    const quota = await service.getQuota('CR1', 'user-1')

    expect(quota.windowDaysLeft).toBeNull()
    expect(quota.canSubmit).toBe(false)
    expect(quota.reason).toContain('还没有交付')
  })
})
