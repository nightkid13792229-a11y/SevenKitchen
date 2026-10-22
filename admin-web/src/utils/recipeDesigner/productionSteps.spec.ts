import { describe, expect, it } from 'vitest'
import type { DesignerProductionStep } from '@/types/recipeDesigner'
import {
  PRODUCTION_STEP_LIMITS,
  appendProductionStep,
  buildProductionStepsPayload,
  createProductionStep,
  moveProductionStep,
  normalizeProductionSteps,
  removeProductionStep,
  renumberProductionSteps,
  validateProductionStep,
  validateProductionStepsForSave
} from '@/utils/recipeDesigner/productionSteps'

function step(
  instruction: string,
  overrides: Partial<DesignerProductionStep> = {}
): DesignerProductionStep {
  return {
    sortOrder: 1,
    instruction,
    durationMinutes: null,
    temperatureC: null,
    equipment: null,
    ...overrides
  }
}

describe('制作步骤 · 读取结构化步骤', () => {
  it('按 sortOrder 排序并重排为 1..n，保证显示顺序与排序值一致', () => {
    const steps = normalizeProductionSteps([
      step('第二步', { sortOrder: 5 }),
      step('第一步', { sortOrder: 2 })
    ])

    expect(steps.map((item) => item.instruction)).toEqual(['第一步', '第二步'])
    expect(steps.map((item) => item.sortOrder)).toEqual([1, 2])
  })

  it('丢弃坏条目而不是让整份步骤加载失败', () => {
    const steps = normalizeProductionSteps([
      step('有效步骤', { sortOrder: 1, temperatureC: -18, durationMinutes: 0 }),
      step('  ', { sortOrder: 2 }),
      { sortOrder: 3 },
      step('重复排序', { sortOrder: 1 }),
      step('温度越界', { sortOrder: 4, temperatureC: 501 }),
      step('设备超长', {
        sortOrder: 5,
        equipment: 'x'.repeat(PRODUCTION_STEP_LIMITS.maxEquipmentLength + 1)
      })
    ])

    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      instruction: '有效步骤',
      sortOrder: 1,
      durationMinutes: 0,
      temperatureC: -18
    })
  })

  it('非数组或空值返回空数组（旧草稿没有结构化步骤是正常状态）', () => {
    expect(normalizeProductionSteps(undefined)).toEqual([])
    expect(normalizeProductionSteps(null)).toEqual([])
    expect(normalizeProductionSteps({ steps: [] })).toEqual([])
    expect(normalizeProductionSteps([])).toEqual([])
  })

  it('去掉操作说明与设备两端的空白，空设备归一为 null', () => {
    const [result] = normalizeProductionSteps([
      step('  称重  ', { equipment: '  厨房秤  ', durationMinutes: null })
    ])

    expect(result?.instruction).toBe('称重')
    expect(result?.equipment).toBe('厨房秤')
  })
})

describe('制作步骤 · 新增 / 删除 / 上下移动', () => {
  it('新增空步骤自动排到最后，sortOrder 始终为 1..n', () => {
    const steps = appendProductionStep([step('称重'), step('混合', { sortOrder: 2 })])

    expect(steps).toHaveLength(3)
    expect(steps.map((item) => item.sortOrder)).toEqual([1, 2, 3])
    expect(steps[2]).toMatchObject({
      instruction: '',
      durationMinutes: null,
      temperatureC: null,
      equipment: null
    })
  })

  it('上移 / 下移会交换位置并重排 sortOrder', () => {
    const steps = [step('第一步'), step('第二步', { sortOrder: 2 }), step('第三步', { sortOrder: 3 })]

    const movedDown = moveProductionStep(steps, 0, 'down')
    expect(movedDown.map((item) => item.instruction)).toEqual(['第二步', '第一步', '第三步'])
    expect(movedDown.map((item) => item.sortOrder)).toEqual([1, 2, 3])

    const movedUp = moveProductionStep(steps, 2, 'up')
    expect(movedUp.map((item) => item.instruction)).toEqual(['第一步', '第三步', '第二步'])
    expect(movedUp.map((item) => item.sortOrder)).toEqual([1, 2, 3])
  })

  it('已经在首 / 尾时移动是空操作，不会丢步骤', () => {
    const steps = [step('第一步'), step('第二步', { sortOrder: 2 })]

    expect(moveProductionStep(steps, 0, 'up').map((item) => item.instruction)).toEqual([
      '第一步',
      '第二步'
    ])
    expect(moveProductionStep(steps, 1, 'down').map((item) => item.instruction)).toEqual([
      '第一步',
      '第二步'
    ])
    expect(moveProductionStep(steps, 9, 'up')).toHaveLength(2)
  })

  it('删除后重新编号，不留下 sortOrder 空洞', () => {
    const steps = [step('第一步'), step('第二步', { sortOrder: 2 }), step('第三步', { sortOrder: 3 })]
    const result = removeProductionStep(steps, 1)

    expect(result.map((item) => item.instruction)).toEqual(['第一步', '第三步'])
    expect(result.map((item) => item.sortOrder)).toEqual([1, 2])
  })

  it('重排只改序号，不改其他字段', () => {
    const steps = renumberProductionSteps([
      step('称重', { sortOrder: 7, durationMinutes: 5, temperatureC: 20, equipment: '厨房秤' })
    ])

    expect(steps[0]).toEqual({
      sortOrder: 1,
      instruction: '称重',
      durationMinutes: 5,
      temperatureC: 20,
      equipment: '厨房秤'
    })
  })

  it('新建步骤默认字段为空，便于直接编辑', () => {
    expect(createProductionStep(4)).toEqual({
      sortOrder: 4,
      instruction: '',
      durationMinutes: null,
      temperatureC: null,
      equipment: null
    })
  })
})

describe('制作步骤 · 逐条校验', () => {
  it('操作说明必填，错误信息带步骤序号', () => {
    expect(validateProductionStep(step('   '), 0)).toContain('第 1 步')
    expect(validateProductionStep(step('称重'), 0)).toBeNull()
  })

  it('操作说明最多 500 字', () => {
    expect(
      validateProductionStep(step('x'.repeat(PRODUCTION_STEP_LIMITS.maxInstructionLength)), 0)
    ).toBeNull()
    expect(
      validateProductionStep(
        step('x'.repeat(PRODUCTION_STEP_LIMITS.maxInstructionLength + 1)),
        0
      )
    ).toContain('500')
  })

  it('时长可选，范围 0-1440 分钟', () => {
    expect(validateProductionStep(step('称重', { durationMinutes: 0 }), 0)).toBeNull()
    expect(validateProductionStep(step('称重', { durationMinutes: 1440 }), 0)).toBeNull()
    expect(validateProductionStep(step('称重', { durationMinutes: -1 }), 0)).toContain('1440')
    expect(validateProductionStep(step('称重', { durationMinutes: 1441 }), 0)).toContain('1440')
  })

  it('温度可选，范围 -50-500 ℃', () => {
    expect(validateProductionStep(step('冷冻', { temperatureC: -50 }), 0)).toBeNull()
    expect(validateProductionStep(step('烘烤', { temperatureC: 500 }), 0)).toBeNull()
    expect(validateProductionStep(step('冷冻', { temperatureC: -51 }), 0)).toContain('温度')
    expect(validateProductionStep(step('烘烤', { temperatureC: 501 }), 0)).toContain('温度')
  })

  it('设备可选，最多 100 字', () => {
    expect(
      validateProductionStep(
        step('称重', { equipment: 'x'.repeat(PRODUCTION_STEP_LIMITS.maxEquipmentLength) }),
        0
      )
    ).toBeNull()
    expect(
      validateProductionStep(
        step('称重', {
          equipment: 'x'.repeat(PRODUCTION_STEP_LIMITS.maxEquipmentLength + 1)
        }),
        0
      )
    ).toContain('100')
  })
})

describe('制作步骤 · 保存前整体校验', () => {
  it('最多 50 步，超过时整体拒绝保存', () => {
    const tooMany = Array.from(
      { length: PRODUCTION_STEP_LIMITS.maxSteps + 1 },
      (_, index) => step(`第 ${index + 1} 步`, { sortOrder: index + 1 })
    )

    const result = validateProductionStepsForSave(tooMany)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('50')
  })

  it('空数组代表清空制作步骤，后端契约允许', () => {
    expect(validateProductionStepsForSave([])).toEqual({ ok: true, steps: [] })
  })

  it('sortOrder 必须是不重复的 1-999 整数', () => {
    const duplicated = validateProductionStepsForSave([
      step('第一步', { sortOrder: 1 }),
      step('第二步', { sortOrder: 1 })
    ])
    expect(duplicated.ok).toBe(false)
    if (!duplicated.ok) expect(duplicated.error).toContain('重复')

    const outOfRange = validateProductionStepsForSave([step('第一步', { sortOrder: 1000 })])
    expect(outOfRange.ok).toBe(false)
  })

  it('任意一条不合法都拒绝，并返回第一条明确原因', () => {
    const result = validateProductionStepsForSave([
      step('称重', { sortOrder: 1, durationMinutes: 10 }),
      step('冷冻', { sortOrder: 2, temperatureC: -80 })
    ])

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('第 2 步')
      expect(result.error).toContain('温度')
    }
  })

  it('全部合法时返回规范化后的步骤（可直接 PATCH）', () => {
    const result = validateProductionStepsForSave([
      step('  称重  ', { sortOrder: 10, durationMinutes: 10, temperatureC: null, equipment: ' 厨房秤 ' }),
      step('冷冻', { sortOrder: 20, temperatureC: -18, equipment: '   ' })
    ])

    expect(result).toEqual({
      ok: true,
      steps: [
        {
          sortOrder: 1,
          instruction: '称重',
          durationMinutes: 10,
          temperatureC: null,
          equipment: '厨房秤'
        },
        {
          sortOrder: 2,
          instruction: '冷冻',
          durationMinutes: null,
          temperatureC: -18,
          equipment: null
        }
      ]
    })
  })
})

describe('制作步骤 · 保存载荷', () => {
  it('按当前显示顺序生成 1..n 的 sortOrder，并裁剪可选字段', () => {
    const payload = buildProductionStepsPayload([
      step('第一步', { sortOrder: 5, equipment: '  ' }),
      step(' 第二步 ', { sortOrder: 9, durationMinutes: 0, temperatureC: -18 })
    ])

    expect(payload.map((item) => item.sortOrder)).toEqual([1, 2])
    expect(payload[0]).toMatchObject({ instruction: '第一步', equipment: null })
    expect(payload[1]).toMatchObject({
      instruction: '第二步',
      durationMinutes: 0,
      temperatureC: -18
    })
  })
})
