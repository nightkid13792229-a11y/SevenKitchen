import { describe, expect, it } from 'vitest'
import type {
  CheckItem,
  CheckRunView,
  ExceptionRecord
} from '@/types/ingredientCreation'
import {
  checkRunCounts,
  formatCheckedAt,
  gateState,
  toAuthorizeReasons,
  toCheckReportSections,
  toCheckRunSummary,
  toLocateTarget,
  type CheckRunSummary
} from './checkReportView'

function makeRun(overrides: Partial<CheckRunView> = {}): CheckRunView {
  const result = overrides.result ?? {
    blocking: [],
    exceptionable: [],
    warnings: []
  }
  return {
    id: 'run-1',
    draftId: 'draft-1',
    domain: 'INGREDIENT',
    trigger: 'USER',
    rulesVersion: 'ingredient-card-v1',
    payloadHash: 'hash-1',
    result,
    counts: {
      blocking: result.blocking.length,
      exceptionable: result.exceptionable.length,
      warning: result.warnings.length
    },
    createdBy: 'admin-1',
    createdAt: '2026-10-26T10:00:00.000Z',
    ...overrides
  }
}

function freshSummary(run: CheckRunView): CheckRunSummary {
  const summary = toCheckRunSummary(run, true)
  if (!summary) {
    throw new Error('expected a summary')
  }
  return summary
}

function makeException(code: string): ExceptionRecord {
  return {
    code,
    reason: '本地库没有这一项，按供应商资料登记',
    approvedBy: 'admin',
    approvedAt: '2026-10-26T10:05:00.000Z'
  }
}

const edibleItem: CheckItem = {
  code: 'EDIBLE_RANGE',
  message: '可食部比例超出范围',
  fieldPath: 'ingredient.edibleYieldPercent',
  suggestion: '按实际可食比例填写'
}

describe('授权闸门 gateState', () => {
  it('两域都新鲜、无阻断、例外也覆盖齐了才放行', () => {
    const ingredient = freshSummary(
      makeRun({
        result: {
          blocking: [],
          exceptionable: [edibleItem],
          warnings: []
        }
      })
    )
    const nutrition = freshSummary(
      makeRun({
        domain: 'NUTRITION',
        result: {
          blocking: [],
          exceptionable: [
            {
              code: 'ENERGY_MISMATCH',
              message: '能量与宏量对不上',
              fieldPath: 'macros.energyKcal'
            }
          ],
          warnings: []
        }
      })
    )

    expect(
      gateState({
        ingredient,
        nutrition,
        exceptions: [
          makeException('EDIBLE_RANGE'),
          makeException('ENERGY_MISMATCH')
        ]
      })
    ).toEqual({ ready: true, reasons: [] })
  })

  it('没有报告 → 不可点，并说清是哪一页还没核验', () => {
    const ingredient = freshSummary(makeRun())
    const gate = gateState({ ingredient, nutrition: null, exceptions: [] })

    expect(gate.ready).toBe(false)
    expect(gate.reasons[0]).toContain('营养档案')
    expect(gate.reasons[0]).toContain('核验')
  })

  it('报告过期 → 不可点，并给出人话原因', () => {
    const ingredient = freshSummary(makeRun())
    const staleNutrition = {
      ...freshSummary(makeRun({ domain: 'NUTRITION' })),
      fresh: false
    }

    const gate = gateState({
      ingredient,
      nutrition: staleNutrition,
      exceptions: []
    })

    expect(gate.ready).toBe(false)
    expect(gate.reasons[0]).toContain('营养档案')
    expect(gate.reasons[0]).toContain('过期')
    expect(gate.reasons[0]).toContain('重跑核验')
  })

  it('counts 说 0 但结果里有阻断项 → 按结果挡住（fail-closed）', () => {
    const run = makeRun({
      result: {
        blocking: [{ code: 'NAME_REQUIRED', message: '名称为空' }],
        exceptionable: [],
        warnings: []
      },
      counts: { blocking: 0, exceptionable: 0, warning: 0 }
    })
    const ingredient = freshSummary(run)
    const nutrition = freshSummary(makeRun({ domain: 'NUTRITION' }))

    // 摘要里的计数可能来自脏报告，但明细里有 blocking 就必须挡住。
    const gate = gateState({ ingredient, nutrition, exceptions: [] })

    expect(gate.ready).toBe(false)
    expect(gate.reasons[0]).toContain('阻断')
  })

  it('有阻断项 → 不可点，原因里带阻断数量', () => {
    const ingredient = freshSummary(
      makeRun({
        result: {
          blocking: [
            { code: 'NAME_REQUIRED', message: '名称为空' },
            { code: 'BASE_UNIT_INVALID', message: '单位不可用' }
          ],
          exceptionable: [],
          warnings: []
        }
      })
    )
    const nutrition = freshSummary(makeRun({ domain: 'NUTRITION' }))

    const gate = gateState({ ingredient, nutrition, exceptions: [] })

    expect(gate.ready).toBe(false)
    expect(gate.reasons[0]).toContain('阻断')
    expect(gate.reasons[0]).toContain('2')
  })

  it('exceptionable 没登记例外 → 不可点，并点名具体规则码', () => {
    const ingredient = freshSummary(
      makeRun({
        result: {
          blocking: [],
          exceptionable: [edibleItem],
          warnings: []
        }
      })
    )
    const nutrition = freshSummary(makeRun({ domain: 'NUTRITION' }))

    const gate = gateState({ ingredient, nutrition, exceptions: [] })

    expect(gate.ready).toBe(false)
    expect(gate.reasons.some((reason) => reason.includes('EDIBLE_RANGE'))).toBe(
      true
    )
  })

  it('例外只覆盖了别的规则码，也不算数', () => {
    const ingredient = freshSummary(
      makeRun({
        result: {
          blocking: [],
          exceptionable: [edibleItem],
          warnings: []
        }
      })
    )
    const nutrition = freshSummary(makeRun({ domain: 'NUTRITION' }))

    const gate = gateState({
      ingredient,
      nutrition,
      exceptions: [makeException('SHELF_LIFE_RANGE')]
    })

    expect(gate.ready).toBe(false)
    expect(gate.reasons.some((reason) => reason.includes('EDIBLE_RANGE'))).toBe(
      true
    )
  })

  it('例外也接受裸 code 字符串（页面从 verify.exceptions 里取 code 传进来）', () => {
    const ingredient = freshSummary(
      makeRun({
        result: {
          blocking: [],
          exceptionable: [edibleItem],
          warnings: []
        }
      })
    )
    const nutrition = freshSummary(makeRun({ domain: 'NUTRITION' }))

    expect(
      gateState({
        ingredient,
        nutrition,
        exceptions: ['EDIBLE_RANGE']
      }).ready
    ).toBe(true)
  })

  it('只从计数拿不到规则码时，仍然挡住并说明有几项不合格', () => {
    const ingredient = freshSummary(makeRun())
    const nutrition = freshSummary(makeRun({ domain: 'NUTRITION' }))
    const countOnly: CheckRunSummary = {
      ...nutrition,
      exceptionable: 2,
      exceptionableItems: []
    }

    const gate = gateState({ ingredient, nutrition: countOnly, exceptions: [] })

    expect(gate.ready).toBe(false)
    expect(gate.reasons[0]).toContain('2')
    expect(gate.reasons[0]).toContain('例外')
  })

  it('摘要只有计数、没有明细数组时也不抛错，且不放行', () => {
    const ingredient = {
      domain: 'INGREDIENT',
      fresh: true,
      blocking: 0,
      exceptionable: 1,
      warning: 0,
      checkedAt: null
    } as unknown as CheckRunSummary
    const nutrition = {
      domain: 'NUTRITION',
      fresh: true,
      blocking: 0,
      exceptionable: 0,
      warning: 0,
      checkedAt: null
    } as unknown as CheckRunSummary

    const gate = gateState({ ingredient, nutrition, exceptions: [] })

    expect(gate.ready).toBe(false)
    expect(gate.reasons[0]).toContain('1')
    expect(gate.reasons[0]).toContain('例外')
  })

  it('正在保存草稿时不可点，且不丢掉真正挡路的原因', () => {
    const ingredient = freshSummary(makeRun())
    const nutrition = freshSummary(makeRun({ domain: 'NUTRITION' }))

    expect(
      gateState({ ingredient, nutrition, exceptions: [], saving: true })
    ).toEqual({ ready: false, reasons: ['正在保存草稿，保存完再授权。'] })
  })
})

describe('toCheckRunSummary', () => {
  it('没有报告时返回 null（页面据此提示「还没核验」）', () => {
    expect(toCheckRunSummary(null, false)).toBeNull()
    expect(toCheckRunSummary(undefined, true)).toBeNull()
  })

  it('计数与三档明细都从报告来', () => {
    const run = makeRun({
      result: {
        blocking: [{ code: 'NAME_REQUIRED', message: '名称为空' }],
        exceptionable: [edibleItem],
        warnings: [{ code: 'STORAGE_EMPTY', message: '贮存条件为空' }]
      }
    })

    expect(toCheckRunSummary(run, true)).toMatchObject({
      domain: 'INGREDIENT',
      fresh: true,
      blocking: 1,
      exceptionable: 1,
      warning: 1,
      checkedAt: '2026-10-26T10:00:00.000Z',
      rulesVersion: 'ingredient-card-v1'
    })
  })

  it('缺少 counts 时按明细数组兜底，不把 undefined 漏到页面', () => {
    const run = {
      ...makeRun({
        result: {
          blocking: [],
          exceptionable: [edibleItem],
          warnings: []
        }
      }),
      counts: undefined
    } as unknown as CheckRunView

    const summary = toCheckRunSummary(run, false)

    expect(summary).toMatchObject({ blocking: 0, exceptionable: 1, warning: 0 })
    expect(summary?.fresh).toBe(false)
  })

  it('脏数据里的非数组明细按空数组处理', () => {
    const run = {
      ...makeRun(),
      result: { blocking: 'oops', exceptionable: null, warnings: 3 }
    } as unknown as CheckRunView

    expect(toCheckRunSummary(run, true)).toMatchObject({
      blocking: 0,
      exceptionable: 0,
      warning: 0,
      blockingItems: [],
      exceptionableItems: [],
      warningItems: []
    })
  })
})

describe('授权被拒 reasons 的提取', () => {
  it('没有 error 时返回空数组，不抛错', () => {
    expect(toAuthorizeReasons(undefined)).toEqual([])
    expect(toAuthorizeReasons(null)).toEqual([])
    expect(toAuthorizeReasons('boom')).toEqual([])
  })

  it('从 axios 错误的 response.data.reasons 里取（后端 400 的顶层 reasons）', () => {
    const errorLike = {
      response: {
        status: 400,
        data: {
          message: '授权前还有未满足的条件',
          reasons: [
            {
              code: 'CHECK_STALE',
              domain: 'NUTRITION',
              detail: '营养档案的重跑核验之后又改过草稿'
            },
            {
              code: 'CHECK_EXCEPTIONABLE',
              domain: 'INGREDIENT',
              detail: 'EDIBLE_RANGE 还没有登记例外'
            }
          ]
        }
      }
    }

    expect(toAuthorizeReasons(errorLike)).toEqual([
      {
        code: 'CHECK_STALE',
        domain: 'NUTRITION',
        detail: '营养档案的重跑核验之后又改过草稿'
      },
      {
        code: 'CHECK_EXCEPTIONABLE',
        domain: 'INGREDIENT',
        detail: 'EDIBLE_RANGE 还没有登记例外'
      }
    ])
  })

  it('丢掉形状不对的原因，不把 undefined 渲染成一行', () => {
    const errorLike = {
      response: {
        data: {
          reasons: [
            { code: 'CHECK_MISSING', detail: '原料档案没有核验报告' },
            { code: 42, detail: '坏数据' },
            null,
            'oops',
            { detail: '没有 code' },
            { code: 'SOURCE_PENDING', detail: 123 }
          ]
        }
      }
    }

    expect(toAuthorizeReasons(errorLike)).toEqual([
      { code: 'CHECK_MISSING', detail: '原料档案没有核验报告' },
      { code: 'SOURCE_PENDING', detail: '' }
    ])
  })

  it('不认识的 domain 不硬塞进结果', () => {
    const errorLike = {
      response: {
        data: {
          reasons: [
            { code: 'CHECK_VERSION', domain: 'SOURCE', detail: '规则版本升级' }
          ]
        }
      }
    }

    expect(toAuthorizeReasons(errorLike)).toEqual([
      { code: 'CHECK_VERSION', detail: '规则版本升级' }
    ])
  })
})

describe('定位到字段', () => {
  it('原料卡的 fieldPath 是 ingredient.<key>，切到原料页并高亮 key', () => {
    expect(toLocateTarget(edibleItem)).toEqual({
      tab: 'ingredient',
      key: 'edibleYieldPercent',
      fieldPath: 'ingredient.edibleYieldPercent'
    })
  })

  it('营养档案的 fieldPath 直接就是行键，切到营养页', () => {
    expect(
      toLocateTarget({
        code: 'ENERGY_MISMATCH',
        message: '能量与宏量对不上',
        fieldPath: 'macros.energyKcal'
      })
    ).toEqual({
      tab: 'profiles',
      key: 'macros.energyKcal',
      fieldPath: 'macros.energyKcal'
    })
  })

  it('没有 fieldPath 或只有前缀时返回 null（不跳到随便一格）', () => {
    expect(toLocateTarget({ code: 'X', message: '没有定位' })).toBeNull()
    expect(
      toLocateTarget({ code: 'X', message: '只有前缀', fieldPath: 'ingredient.' })
    ).toBeNull()
  })
})

describe('报告分区与计数', () => {
  it('三档固定顺序、固定标签，空的档位也保留（页面据此写「没有」）', () => {
    const run = makeRun({
      result: {
        blocking: [],
        exceptionable: [edibleItem],
        warnings: [{ code: 'STORAGE_EMPTY', message: '贮存条件为空' }]
      }
    })

    const sections = toCheckReportSections(run)

    expect(sections.map((section) => section.key)).toEqual([
      'blocking',
      'exceptionable',
      'warning'
    ])
    expect(sections.map((section) => section.label)).toEqual([
      '阻断',
      '不合格（可例外）',
      '提醒'
    ])
    expect(sections[1]?.items).toHaveLength(1)
  })

  it('计数按三档汇总，total 是问题总数', () => {
    const run = makeRun({
      result: {
        blocking: [{ code: 'A', message: 'a' }],
        exceptionable: [edibleItem, { code: 'B', message: 'b' }],
        warnings: [{ code: 'C', message: 'c' }]
      }
    })

    expect(checkRunCounts(run)).toEqual({
      blocking: 1,
      exceptionable: 2,
      warning: 1,
      total: 4
    })
  })

  it('没有报告时计数全是 0', () => {
    expect(checkRunCounts(null)).toEqual({
      blocking: 0,
      exceptionable: 0,
      warning: 0,
      total: 0
    })
  })

  it('检查时间缺失或非法显示「—」，不显示 Invalid Date', () => {
    expect(formatCheckedAt(null)).toBe('—')
    expect(formatCheckedAt('not-a-date')).toBe('—')
    expect(formatCheckedAt('2026-10-26T10:00:00.000Z')).not.toContain('Invalid')
  })
})
