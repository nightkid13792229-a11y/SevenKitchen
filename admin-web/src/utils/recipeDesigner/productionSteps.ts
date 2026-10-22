/**
 * 结构化制作步骤（2026-10-22 · Task 7）。
 *
 * 与后端 `backend/src/domain/recipe-designer/production-steps.ts` 对齐：
 * 写入必须是 1..n 的连续 sortOrder（空数组表示清空），读取时宽松丢弃坏条目。
 * 编辑器用这里的纯函数完成新增 / 删除 / 上下移动 / 校验 / 生成 PATCH 载荷，
 * 组件本身只负责交互与请求。
 */
import type { DesignerProductionStep } from '@/types/recipeDesigner'

export const PRODUCTION_STEP_LIMITS = {
  /** 单份食谱最多步骤数（与后端一致） */
  maxSteps: 50,
  /** 操作说明最大长度 */
  maxInstructionLength: 500,
  /** 设备名称最大长度 */
  maxEquipmentLength: 100,
  /** 步骤时长（分钟）上限：24 小时 */
  maxDurationMinutes: 1440,
  /** 温度（摄氏度）范围 */
  minTemperatureC: -50,
  maxTemperatureC: 500,
  /** sortOrder 允许范围 */
  minSortOrder: 1,
  maxSortOrder: 999
} as const

export type ProductionStepMoveDirection = 'up' | 'down'

type ProductionStepsValidationResult =
  | { ok: true; steps: DesignerProductionStep[] }
  | { ok: false; error: string }

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeOptionalText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const normalizeOptionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const isValidSortOrder = (value: unknown): value is number =>
  Number.isInteger(value) &&
  Number(value) >= PRODUCTION_STEP_LIMITS.minSortOrder &&
  Number(value) <= PRODUCTION_STEP_LIMITS.maxSortOrder

/**
 * 宽松读取存量步骤：与后端 `readProductionSteps` 一样，
 * 非数组返回空数组，坏条目跳过，最后按 sortOrder 排序。
 * 读取后统一重排为 1..n（编辑器显示序号以当前顺序为准）。
 */
export function normalizeProductionSteps(value: unknown): DesignerProductionStep[] {
  if (!Array.isArray(value)) return []

  const steps: DesignerProductionStep[] = []
  const seenSortOrders = new Set<number>()

  for (const raw of value) {
    if (!isPlainObject(raw)) continue
    if (!isValidSortOrder(raw.sortOrder)) continue
    if (seenSortOrders.has(raw.sortOrder)) continue

    if (typeof raw.instruction !== 'string' || !raw.instruction.trim()) continue
    const instruction = raw.instruction.trim()
    if (instruction.length > PRODUCTION_STEP_LIMITS.maxInstructionLength) continue

    const durationMinutes = normalizeOptionalNumber(raw.durationMinutes)
    if (
      durationMinutes !== null &&
      (durationMinutes < 0 ||
        durationMinutes > PRODUCTION_STEP_LIMITS.maxDurationMinutes)
    ) {
      continue
    }

    const temperatureC = normalizeOptionalNumber(raw.temperatureC)
    if (
      temperatureC !== null &&
      (temperatureC < PRODUCTION_STEP_LIMITS.minTemperatureC ||
        temperatureC > PRODUCTION_STEP_LIMITS.maxTemperatureC)
    ) {
      continue
    }

    const equipment = normalizeOptionalText(raw.equipment)
    if (
      equipment !== null &&
      equipment.length > PRODUCTION_STEP_LIMITS.maxEquipmentLength
    ) {
      continue
    }

    seenSortOrders.add(raw.sortOrder)
    steps.push({
      sortOrder: raw.sortOrder,
      instruction,
      durationMinutes,
      temperatureC,
      equipment
    })
  }

  return renumberProductionSteps(
    steps.sort((left, right) => left.sortOrder - right.sortOrder)
  )
}

/** 按当前数组顺序重排 sortOrder 为 1..n（新增 / 删除 / 移动后统一调用）。 */
export function renumberProductionSteps(
  steps: DesignerProductionStep[]
): DesignerProductionStep[] {
  return steps.map((step, index) => ({ ...step, sortOrder: index + 1 }))
}

/** 新建一条空白步骤；时长 / 温度 / 设备保持 null，由用户按需填写。 */
export function createProductionStep(sortOrder = 1): DesignerProductionStep {
  return {
    sortOrder,
    instruction: '',
    durationMinutes: null,
    temperatureC: null,
    equipment: null
  }
}

/** 追加一条空白步骤（已达上限时原样返回并重排，防止超过后端 50 步限制）。 */
export function appendProductionStep(
  steps: DesignerProductionStep[]
): DesignerProductionStep[] {
  if (steps.length >= PRODUCTION_STEP_LIMITS.maxSteps) {
    return renumberProductionSteps([...steps])
  }
  return renumberProductionSteps([
    ...steps,
    createProductionStep(steps.length + 1)
  ])
}

/** 删除指定下标的步骤，并保证剩余步骤 sortOrder 连续。 */
export function removeProductionStep(
  steps: DesignerProductionStep[],
  index: number
): DesignerProductionStep[] {
  return renumberProductionSteps(steps.filter((_, itemIndex) => itemIndex !== index))
}

/** 上移 / 下移一步；越界时是空操作（只重排，不丢步骤）。 */
export function moveProductionStep(
  steps: DesignerProductionStep[],
  index: number,
  direction: ProductionStepMoveDirection
): DesignerProductionStep[] {
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (
    index < 0 ||
    index >= steps.length ||
    targetIndex < 0 ||
    targetIndex >= steps.length
  ) {
    return renumberProductionSteps([...steps])
  }

  const next = [...steps]
  const [moved] = next.splice(index, 1)
  if (!moved) return renumberProductionSteps([...steps])
  next.splice(targetIndex, 0, moved)
  return renumberProductionSteps(next)
}

/** 逐条校验（界面行内错误提示用），返回 null 表示合法。 */
export function validateProductionStep(
  step: DesignerProductionStep,
  index: number
): string | null {
  const label = `第 ${index + 1} 步`
  const instruction = String(step.instruction ?? '').trim()
  if (!instruction) {
    return `${label}：请填写操作说明`
  }
  if (instruction.length > PRODUCTION_STEP_LIMITS.maxInstructionLength) {
    return `${label}：操作说明不能超过 ${PRODUCTION_STEP_LIMITS.maxInstructionLength} 个字符`
  }

  if (step.durationMinutes !== null && step.durationMinutes !== undefined) {
    const duration = Number(step.durationMinutes)
    if (
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > PRODUCTION_STEP_LIMITS.maxDurationMinutes
    ) {
      return `${label}：时长必须是 0-${PRODUCTION_STEP_LIMITS.maxDurationMinutes} 分钟`
    }
  }

  if (step.temperatureC !== null && step.temperatureC !== undefined) {
    const temperature = Number(step.temperatureC)
    if (
      !Number.isFinite(temperature) ||
      temperature < PRODUCTION_STEP_LIMITS.minTemperatureC ||
      temperature > PRODUCTION_STEP_LIMITS.maxTemperatureC
    ) {
      return `${label}：温度必须是 ${PRODUCTION_STEP_LIMITS.minTemperatureC}-${PRODUCTION_STEP_LIMITS.maxTemperatureC} ℃`
    }
  }

  const equipment = String(step.equipment ?? '').trim()
  if (equipment.length > PRODUCTION_STEP_LIMITS.maxEquipmentLength) {
    return `${label}：设备不能超过 ${PRODUCTION_STEP_LIMITS.maxEquipmentLength} 个字符`
  }

  return null
}

/**
 * 保存前整体校验与规范化。
 *
 * - 空数组 = 清空制作步骤（后端允许，用于删除全部步骤后保存）；
 * - 非空时最多 50 步，sortOrder 必须是 1-999 的唯一整数；
 * - 返回的 steps 已按当前顺序重排为 1..n，可直接作为 PATCH 载荷。
 */
export function validateProductionStepsForSave(
  input: DesignerProductionStep[]
): ProductionStepsValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: '制作步骤必须是数组' }
  }
  if (input.length > PRODUCTION_STEP_LIMITS.maxSteps) {
    return {
      ok: false,
      error: `制作步骤不能超过 ${PRODUCTION_STEP_LIMITS.maxSteps} 步`
    }
  }

  const seenSortOrders = new Set<number>()
  for (const [index, step] of input.entries()) {
    if (!isValidSortOrder(step.sortOrder)) {
      return {
        ok: false,
        error: `第 ${index + 1} 步：排序值必须是 ${PRODUCTION_STEP_LIMITS.minSortOrder}-${PRODUCTION_STEP_LIMITS.maxSortOrder} 的整数`
      }
    }
    if (seenSortOrders.has(step.sortOrder)) {
      return { ok: false, error: `制作步骤的排序值 ${step.sortOrder} 重复` }
    }
    seenSortOrders.add(step.sortOrder)

    const error = validateProductionStep(step, index)
    if (error) return { ok: false, error }
  }

  return { ok: true, steps: buildProductionStepsPayload(input) }
}

/**
 * 生成 PATCH 载荷：按当前顺序重排为 1..n，裁剪文本两端，
 * 空的可选字段统一为 null（与后端 `validateProductionSteps` 的规范化一致）。
 */
export function buildProductionStepsPayload(
  steps: DesignerProductionStep[]
): DesignerProductionStep[] {
  return steps.map((step, index) => ({
    sortOrder: index + 1,
    instruction: String(step.instruction ?? '').trim(),
    durationMinutes: normalizeOptionalNumber(step.durationMinutes),
    temperatureC: normalizeOptionalNumber(step.temperatureC),
    equipment: normalizeOptionalText(step.equipment)
  }))
}
