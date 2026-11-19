/**
 * 补剂三步流程的状态。
 *
 * 三条规矩：
 * 1. 每一步能不能进，由**产物**决定（有形态结论才能比价，选中商品才能建档，写入成功才能上架）；
 * 2. 状态是纯数据，不碰 Vue，好在 node 里直接测；
 * 3. 当天一气呵成，所以只做 sessionStorage 快照，不做服务端草稿。
 */
import type {
  SupplementComparisonDto,
  SupplementDimensionsAdviceDto
} from '@/types/ingredientCreation'
import { emptySupplementDraft, type SupplementDraftValue } from '../supplementFormState'

export type FlowStep = 1 | 2 | 3 | 4

export interface SupplementSavedResult {
  ingredientId: string
  nutritionFoodId: string
  evidenceId: string
}

/** 人选定的形态/来源候选（维度驱动） */
export interface ChosenForm {
  dimensionKey: 'FORM' | 'SOURCE'
  candidateKey: string
  labelZh: string
  status: 'EVIDENCED' | 'MARKET_ONLY'
}

export interface SupplementFlowState {
  step: FlowStep
  nutrientKey: string | null
  nutrientLabel: string
  formAdvice: SupplementDimensionsAdviceDto | null
  chosenForm: ChosenForm | null
  comparison: SupplementComparisonDto | null
  chosenOfferUrl: string | null
  archive: SupplementDraftValue
  saved: SupplementSavedResult | null
}

export const FLOW_STORAGE_KEY = 'supplement-flow-v2'

export interface SimpleStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function emptyFlowState(): SupplementFlowState {
  return {
    step: 1,
    nutrientKey: null,
    nutrientLabel: '',
    formAdvice: null,
    chosenForm: null,
    comparison: null,
    chosenOfferUrl: null,
    archive: emptySupplementDraft(),
    saved: null
  }
}

/** 选定的形态候选：人点过的优先；没点过但有推荐时，用推荐那条。 */
export function effectiveForm(state: SupplementFlowState): ChosenForm | null {
  if (state.chosenForm) {
    return state.chosenForm
  }
  const recommendation = state.formAdvice?.recommendation
  if (!recommendation) {
    return null
  }
  for (const group of state.formAdvice?.dimensions ?? []) {
    const hit = group.candidates.find((item) => item.key === recommendation.candidateKey)
    if (hit) {
      return {
        dimensionKey: hit.dimension,
        candidateKey: hit.key,
        labelZh: hit.labelZh,
        status: hit.status
      }
    }
  }
  return null
}

export function canEnter(state: SupplementFlowState, step: FlowStep): boolean {
  switch (step) {
    case 1:
      return true
    case 2:
      return !!effectiveForm(state)
    case 3:
      return !!state.chosenOfferUrl
    case 4:
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
    if (step !== 1 && step !== 2 && step !== 3 && step !== 4) {
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
