const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'

const ATTENTION_LABELS: Record<string, string> = {
  KEY_ATTENTION: '重点关注',
  RECOMMENDED_AWARENESS: '建议了解',
  SUPPLEMENTAL_AWARENESS: '补充了解',
}

export interface BreedHealthRiskSource {
  sourceType: string
  sourceName: string
  publisher?: string | null
  title: string
  url: string
  accessedAt: string
  note?: string | null
}

export interface BreedHealthRiskItem {
  id: string
  conditionId: string
  conditionName: string
  category: string
  attentionPriority: string
  attentionLabel: string
  oneLineSummary: string
  breedSpecificReason: string
  commonSigns: string[]
  screeningAdvice: string
  careAdvice: string
  sourceCount: number
  sources: BreedHealthRiskSource[]
}

export interface BreedHealthRiskLookup {
  breedId: string
  breedName: string
  risks: BreedHealthRiskItem[]
}

type BreedHealthRiskEmptyReason = 'mixed' | 'no-data' | 'unavailable'

function readData(response: any) {
  return response?.data && response.data.breed ? response.data : response
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(item => readString(item)).filter(Boolean)
    : []
}

export function getBreedHealthAttentionLabel(priority: string) {
  return ATTENTION_LABELS[priority] || ATTENTION_LABELS.SUPPLEMENTAL_AWARENESS
}

export function canRequestBreedHealthRisks(profile: {
  breedId?: string | null
  customBreedName?: string | null
}) {
  const breedId = readString(profile.breedId)
  return Boolean(breedId && breedId !== MIXED_BREED_VIRTUAL_ID && !readString(profile.customBreedName))
}

export function resolveBreedHealthRiskEmptyText(reason: BreedHealthRiskEmptyReason) {
  if (reason === 'mixed') {
    return '混血/手动填写品种暂不展示品种专属资料，可使用品种查询页查看相近标准品种。'
  }

  if (reason === 'unavailable') {
    return '品种健康资料库正在同步，暂时无法读取来源数据。'
  }

  return '暂未收录该品种的健康关注项，后续会逐步补充。'
}

export function isBreedHealthRiskEndpointUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  const normalized = message.toLowerCase()

  return normalized.includes('health-risks') && (
    normalized.includes('cannot get') ||
    normalized.includes('404') ||
    normalized.includes('not found')
  )
}

export function normalizeBreedHealthRiskResponse(response: any): BreedHealthRiskLookup {
  const data = readData(response) || {}
  const breed = data.breed || {}
  const risks = Array.isArray(data.risks) ? data.risks : []

  return {
    breedId: readString(breed.id),
    breedName: readString(breed.name),
    risks: risks.map((risk: any): BreedHealthRiskItem => {
      const attentionPriority = readString(risk.attentionPriority) || 'SUPPLEMENTAL_AWARENESS'
      const sources = Array.isArray(risk.sources) ? risk.sources : []

      return {
        id: readString(risk.id),
        conditionId: readString(risk.conditionId),
        conditionName: readString(risk.conditionName),
        category: readString(risk.category),
        attentionPriority,
        attentionLabel: readString(risk.attentionLabel) || getBreedHealthAttentionLabel(attentionPriority),
        oneLineSummary: readString(risk.oneLineSummary),
        breedSpecificReason: readString(risk.breedSpecificReason),
        commonSigns: readStringArray(risk.commonSigns),
        screeningAdvice: readString(risk.screeningAdvice),
        careAdvice: readString(risk.careAdvice),
        sourceCount: Number(risk.sourceCount) || sources.length,
        sources: sources.map((source: any) => ({
          sourceType: readString(source.sourceType),
          sourceName: readString(source.sourceName),
          publisher: readString(source.publisher) || null,
          title: readString(source.title),
          url: readString(source.url),
          accessedAt: readString(source.accessedAt),
          note: readString(source.note) || null,
        })),
      }
    }),
  }
}
