/**
 * 产品展示（2026-10-22）· 纯函数
 *
 * 后台编辑器在「上线检查」抽屉里维护产品线 / 本单设计共用的展示资料。
 * 这里只做「草稿 → 表单」「表单 → PATCH」的归一化与差异计算，
 * 不发请求、不参与上线门槛判断 —— 门槛始终以后端为准。
 *
 * 关键约定：
 *  · 展示文案保存前统一 trim，空字符串按 null 处理（显式清空）；
 *  · PATCH 只发送**真正变化**的字段，避免无意义地让 contentRevision +1；
 *  · 适用生命阶段 / 目标健康标签走既有草稿更新接口，不在展示 PATCH 里。
 */
import type {
  DesignRecipeDesignMode,
  DesignRecipeDraftDetail,
  UpdateDesignRecipeDraftPayload,
  UpdateDraftPresentationPayload
} from '@/types/recipeDesigner'

/** 与后端 RECIPE_PRESENTATION_LIMITS / 数据库 VarChar 对齐 */
export const RECIPE_PRESENTATION_LIMITS = {
  coverTitle: 20,
  sellingPoint: 200,
  description: 4000
} as const

/** 封面图上传限制（与食谱管理里的封面图规则一致） */
export const PRESENTATION_COVER_MAX_BYTES = 5 * 1024 * 1024
export const PRESENTATION_COVER_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const

export interface RecipePresentationForm {
  coverImageUrl: string
  coverTitle: string
  description: string
  sellingPoint: string
  applicableLifeStages: string[]
  targetHealthTags: string[]
}

export interface RecipePresentationOrderInfo {
  orderId: string | null
  orderQuantity: number | null
  customerDogId: string | null
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 数组字段去空、去重、保序 */
export function normalizePresentationStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

/** 后端 detailImages 是 JSON，历史数据可能不是数组；这里统一成字符串数组 */
export function normalizePresentationDetailImages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function emptyPresentationForm(): RecipePresentationForm {
  return {
    coverImageUrl: '',
    coverTitle: '',
    description: '',
    sellingPoint: '',
    applicableLifeStages: [],
    targetHealthTags: []
  }
}

/** 草稿 → 可编辑表单；旧草稿缺字段时全部归一成空值 */
export function buildPresentationForm(
  draft:
    | Partial<
        Pick<
          DesignRecipeDraftDetail,
          | 'coverImageUrl'
          | 'coverTitle'
          | 'description'
          | 'sellingPoint'
          | 'applicableLifeStages'
          | 'targetHealthTags'
        >
      >
    | null
    | undefined
): RecipePresentationForm {
  return {
    coverImageUrl: normalizeText(draft?.coverImageUrl),
    coverTitle: normalizeText(draft?.coverTitle),
    description: normalizeText(draft?.description),
    sellingPoint: normalizeText(draft?.sellingPoint),
    applicableLifeStages: normalizePresentationStrings(
      draft?.applicableLifeStages
    ),
    targetHealthTags: normalizePresentationStrings(draft?.targetHealthTags)
  }
}

/** 深拷贝表单，避免保存成功后把用户继续输入的内容误当成已保存基线 */
export function clonePresentationForm(
  form: RecipePresentationForm
): RecipePresentationForm {
  return {
    coverImageUrl: form.coverImageUrl,
    coverTitle: form.coverTitle,
    description: form.description,
    sellingPoint: form.sellingPoint,
    applicableLifeStages: [...form.applicableLifeStages],
    targetHealthTags: [...form.targetHealthTags]
  }
}

function assignTextPatch(
  patch: UpdateDraftPresentationPayload,
  key: 'coverImageUrl' | 'coverTitle' | 'description' | 'sellingPoint',
  form: RecipePresentationForm,
  baseline: RecipePresentationForm
): void {
  const current = normalizeText(form[key])
  const previous = normalizeText(baseline[key])
  if (current === previous) return
  // 空字符串表示清空；后端按 patch semantics 接受显式 null
  patch[key] = current || null
}

/**
 * 只返回真正变化的展示字段。
 *
 * 这样只改适用生命阶段 / 健康标签时不会误触发 presentation PATCH，
 * 也就不会让已生成的营养报告无谓地过期。
 */
export function buildPresentationPatch(
  form: RecipePresentationForm,
  baseline: RecipePresentationForm
): UpdateDraftPresentationPayload {
  const patch: UpdateDraftPresentationPayload = {}
  assignTextPatch(patch, 'coverImageUrl', form, baseline)
  assignTextPatch(patch, 'coverTitle', form, baseline)
  assignTextPatch(patch, 'description', form, baseline)
  assignTextPatch(patch, 'sellingPoint', form, baseline)
  return patch
}

/** 无序比较两个字符串数组（标签 / 生命阶段的顺序不参与差异判断） */
export function isSameStringSet(left: unknown, right: unknown): boolean {
  const leftSet = normalizePresentationStrings(left).sort()
  const rightSet = normalizePresentationStrings(right).sort()
  if (leftSet.length !== rightSet.length) return false
  return leftSet.every((value, index) => value === rightSet[index])
}

/** 产品线专属字段：适用生命阶段 / 目标健康标签（走既有草稿 PATCH） */
export function buildPresentationTargetPatch(
  form: RecipePresentationForm,
  baseline: RecipePresentationForm
): UpdateDesignRecipeDraftPayload {
  const patch: UpdateDesignRecipeDraftPayload = {}
  if (!isSameStringSet(form.applicableLifeStages, baseline.applicableLifeStages)) {
    patch.applicableLifeStages = normalizePresentationStrings(
      form.applicableLifeStages
    )
  }
  if (!isSameStringSet(form.targetHealthTags, baseline.targetHealthTags)) {
    patch.targetHealthTags = normalizePresentationStrings(
      form.targetHealthTags
    )
  }
  return patch
}

export function hasPresentationPatch(
  patch: UpdateDraftPresentationPayload
): boolean {
  return Object.keys(patch).length > 0
}

export function hasPresentationTargetPatch(
  patch: UpdateDesignRecipeDraftPayload
): boolean {
  return Object.keys(patch).length > 0
}

/** 表单是否和保存基线不同（产品线字段是否参与由调用方决定） */
export function isPresentationDirty(
  form: RecipePresentationForm,
  baseline: RecipePresentationForm,
  includeCatalogFields = true
): boolean {
  if (hasPresentationPatch(buildPresentationPatch(form, baseline))) return true
  if (!includeCatalogFields) return false
  return hasPresentationTargetPatch(buildPresentationTargetPatch(form, baseline))
}

/** 本单信息：订单号 / 份数在系列上，顾客爱犬在草稿上 */
export function resolveOrderPresentationInfo(
  draft: Pick<DesignRecipeDraftDetail, 'customerDogId' | 'series'> | null | undefined
): RecipePresentationOrderInfo {
  const series = draft?.series ?? null
  const orderQuantity = Number(series?.orderQuantity)
  return {
    orderId: normalizeText(series?.orderId) || null,
    orderQuantity:
      series?.orderQuantity !== null &&
      series?.orderQuantity !== undefined &&
      Number.isFinite(orderQuantity)
        ? orderQuantity
        : null,
    customerDogId: normalizeText(draft?.customerDogId) || null
  }
}

/** 本单份数的只读展示；缺失时明确写「未设置」，不伪造成 0 份 */
export function formatOrderQuantityLabel(
  value: number | null | undefined
): string {
  const quantity = Number(value)
  if (!Number.isFinite(quantity) || quantity <= 0) return '未设置'
  return `${quantity} 份`
}

/** 设计模式归一化：历史缺省按产品线处理，与后端一致 */
export function normalizePresentationDesignMode(
  designMode?: string | null
): DesignRecipeDesignMode {
  return String(designMode ?? '').trim().toUpperCase() === 'ORDER'
    ? 'ORDER'
    : 'CATALOG'
}

/**
 * 封面图上传前置校验；返回错误文案，null 表示可以上传。
 */
export function validatePresentationCoverFile(file: {
  type?: string | null
  size?: number | null
}): string | null {
  const mimeType = String(file.type ?? '').toLowerCase()
  if (
    !PRESENTATION_COVER_MIME_TYPES.includes(
      mimeType as (typeof PRESENTATION_COVER_MIME_TYPES)[number]
    )
  ) {
    return '封面图只支持 JPG、PNG、WebP 格式'
  }
  const size = Number(file.size)
  if (!Number.isFinite(size) || size <= 0) {
    return '封面图文件为空，请重新选择'
  }
  if (size > PRESENTATION_COVER_MAX_BYTES) {
    return `封面图不能超过 5MB（当前 ${(size / 1024 / 1024).toFixed(2)}MB）`
  }
  return null
}
