/**
 * 「员工新增的采购商品」清单的查询参数构造（2026-11-01）。
 *
 * 单独抽出来是因为这里是页面上唯一有分支的逻辑：空条件必须**不发给后端**，
 * 否则后端会收到 `keyword=`、`createdFrom=` 这类空串，要么报校验错，要么查出空结果。
 */

export interface StaffSkuFilterInput {
  ingredientId?: string | null
  createdById?: string | null
  createdFrom?: string | null
  createdTo?: string | null
  keyword?: string | null
  page: number
  pageSize: number
}

export interface StaffSkuQueryParams {
  ingredientId?: string
  createdById?: string
  createdFrom?: string
  createdTo?: string
  keyword?: string
  page: number
  pageSize: number
}

const clean = (value?: string | null): string | undefined => {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : undefined
}

export function buildStaffSkuQueryParams(
  input: StaffSkuFilterInput
): StaffSkuQueryParams {
  const params: StaffSkuQueryParams = {
    page: input.page,
    pageSize: input.pageSize
  }

  const ingredientId = clean(input.ingredientId)
  const createdById = clean(input.createdById)
  const createdFrom = clean(input.createdFrom)
  const createdTo = clean(input.createdTo)
  const keyword = clean(input.keyword)

  if (ingredientId) params.ingredientId = ingredientId
  if (createdById) params.createdById = createdById
  if (createdFrom) params.createdFrom = createdFrom
  if (createdTo) params.createdTo = createdTo
  if (keyword) params.keyword = keyword

  return params
}
