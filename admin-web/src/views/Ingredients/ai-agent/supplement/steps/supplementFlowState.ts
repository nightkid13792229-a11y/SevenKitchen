/**
 * 补剂建档流程的状态（两步：建档 → 上架）。
 *
 * 三条规矩：
 * 1. 能不能进下一步，由**产物**决定（写入成功才能上架）；
 * 2. 状态是纯数据，不碰 Vue，好在 node 里直接测；
 * 3. 当天一气呵成，所以只做 sessionStorage 快照，不做服务端草稿。
 */
import { emptySupplementDraft, type SupplementDraftValue } from '../supplementFormState'

export type FlowStep = 1 | 2

export interface SupplementSavedResult {
  ingredientId: string
  nutritionFoodId: string
  evidenceId: string
}

/**
 * 补剂建档流程（2026-11-20 收敛）。
 *
 * 定形态与比价已移到 DSH 的 supplement-product-selection Skill：
 * 这里只负责「拿到最终选定的商品 → 录档案 → 门禁 → 写入 → 上架」。
 * 选品依据（形态结论、比价、链接）由人从 Skill 的结论里粘一段进来，随档案留档。
 */
export interface SupplementFlowState {
  step: FlowStep
  /** 选品依据：形态、出处、选中商品与单价，人从 Skill 结论里粘过来 */
  selectionNote: string
  archive: SupplementDraftValue
  saved: SupplementSavedResult | null
}

export const FLOW_STORAGE_KEY = 'supplement-flow-v4'

export interface SimpleStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function emptyFlowState(): SupplementFlowState {
  return {
    step: 1,
    selectionNote: '',
    archive: emptySupplementDraft(),
    saved: null
  }
}

export function canEnter(state: SupplementFlowState, step: FlowStep): boolean {
  switch (step) {
    case 1:
      return true
    case 2:
      return !!state.saved?.ingredientId
    default:
      return false
  }
}

/** 进不去就原地不动——不靠弹窗拦，避免"看起来进去了其实什么都没" 。 */
export function goTo(state: SupplementFlowState, step: FlowStep): SupplementFlowState {
  if (!canEnter(state, step)) {
    return state
  }
  return { ...state, step }
}

function defaultStorage(): SimpleStorage | null {
  try {
    if (typeof sessionStorage === 'undefined') {
      return null
    }
    return sessionStorage
  } catch {
    return null
  }
}

export function saveSnapshot(state: SupplementFlowState, storage?: SimpleStorage): void {
  const target = storage ?? defaultStorage()
  if (!target) {
    return
  }
  try {
    target.setItem(FLOW_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 存不下（配额/隐私模式）只影响刷新恢复，不拦流程
  }
}

export function loadSnapshot(storage?: SimpleStorage): SupplementFlowState | null {
  const target = storage ?? defaultStorage()
  if (!target) {
    return null
  }
  try {
    const raw = target.getItem(FLOW_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as Partial<SupplementFlowState> | null
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const step = parsed.step
    if (step !== 1 && step !== 2) {
      return null
    }
    // 老快照可能缺字段：以空状态为底，只覆盖有的
    return {
      ...emptyFlowState(),
      ...parsed,
      archive: {
        ...emptySupplementDraft(),
        ...(parsed.archive ?? {})
      }
    }
  } catch {
    return null
  }
}

export function clearSnapshot(storage?: SimpleStorage): void {
  const target = storage ?? defaultStorage()
  if (!target) {
    return
  }
  try {
    target.removeItem(FLOW_STORAGE_KEY)
  } catch {
    // ignore
  }
}
