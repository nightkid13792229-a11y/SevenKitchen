<template>
  <section class="advice-step">
    <header class="advice-step__head">
      <div>
        <h3>① 定形态</h3>
        <p class="advice-step__desc">
          选一个营养素，Agent 去知识库读原文、去商品标题看市场，给出这一类的形态与来源。
          <b>标「有原文」的才有依据</b>；只标「无依据」的是市场常见说法，得你自己判断。
        </p>
      </div>
    </header>

    <div class="advice-step__query">
      <el-select
        v-model="nutrientKey"
        placeholder="要给狗补什么"
        filterable
        data-action="nutrient-select"
        style="width: 260px"
      >
        <el-option
          v-for="item in nutrientOptions"
          :key="item.fieldPath"
          :label="item.label"
          :value="item.fieldPath"
        />
      </el-select>
      <el-input
        v-model="question"
        placeholder="补充一句背景（可不填），例如：狗肝铜偏高"
        clearable
        style="width: 320px"
      />
      <el-button
        type="primary"
        :loading="loading"
        :disabled="!nutrientKey"
        data-action="ask-advice"
        @click="ask"
      >
        查一下
      </el-button>
    </div>

    <el-alert v-if="errorText" type="error" :closable="false" show-icon>
      <span>{{ errorText }}</span>
      <el-button text size="small" @click="ask">重试</el-button>
    </el-alert>

    <div v-loading="loading" class="advice-step__body">
      <template v-if="advice">
        <!-- 没有维度可问：不硬凑，直接去比价 -->
        <div v-if="isEmptyAdvice(advice)" class="advice-step__empty" data-testid="advice-empty">
          <b>这一类不按形态判断</b>
          <p>{{ advice.gaps[0] || '知识库与市场都没给出可比的形态，直接去比价即可' }}</p>
          <el-button type="primary" size="small" data-action="skip-to-compare" @click="emit('skip')">
            去比价
          </el-button>
        </div>

        <template v-else>
          <div
            v-if="advice.recommendation"
            class="advice-step__verdict"
            data-testid="advice-verdict"
          >
            <b>{{ recommendationText(advice) }}</b>
            <span class="advice-step__verdict-reason">
              {{ recommendedCandidate?.reason }}
            </span>
          </div>
          <div v-else class="advice-step__verdict advice-step__verdict--none">
            <b>{{ allMarketOnly ? '知识库里没有依据，请你判断' : '有原文，但没给出可用结论' }}</b>
            <span class="advice-step__verdict-reason">
              {{ allMarketOnly ? '下面都是市场常见说法，没有原文支撑' : '下面的结论需要你自己判断' }}
            </span>
          </div>

          <section v-for="group in advice.dimensions" :key="group.key" class="dimension">
            <p class="dimension__title">
              {{ group.label }} · 共 {{ group.candidates.length }} 种
            </p>

            <article
              v-for="candidate in group.candidates"
              :key="candidate.key"
              class="advice-card"
              :class="{ 'advice-card--muted': !statusMeta(candidate.status).recommendable }"
            >
              <div class="advice-card__head">
                <b>{{ candidate.labelZh }}</b>
                <el-tag :type="statusMeta(candidate.status).type" size="small" effect="plain">
                  {{ statusMeta(candidate.status).label }}
                </el-tag>
                <el-tag
                  v-if="candidate.status === 'EVIDENCED'"
                  :type="verdictMeta(candidate.verdict).type"
                  size="small"
                  effect="plain"
                >
                  {{ verdictMeta(candidate.verdict).label }}
                </el-tag>
                <span v-if="candidate.market" class="advice-card__market">
                  {{ candidate.market.count }} 个商品在用这个说法
                </span>
                <span v-else class="advice-card__market">市场上没见到这个说法</span>
                <el-button
                  v-if="canPick(candidate)"
                  class="advice-card__pick"
                  type="primary"
                  size="small"
                  :data-action="`pick-${candidate.key}`"
                  @click="pick(candidate)"
                >
                  用这个
                </el-button>
                <el-button
                  v-else
                  class="advice-card__pick"
                  text
                  size="small"
                  :data-action="`force-${candidate.key}`"
                  @click="forcePick(candidate)"
                >
                  仍用这一档
                </el-button>
              </div>

              <p class="advice-card__reason">{{ candidate.reason }}</p>

              <details v-if="citationsOf(candidate).length > 0" class="advice-card__cites">
                <summary>出处 {{ citationsOf(candidate).length }} 条</summary>
                <blockquote
                  v-for="(citation, index) in citationsOf(candidate)"
                  :key="index"
                  class="advice-card__quote"
                >
                  <span class="advice-card__quote-src">{{ citationText(citation) }}</span>
                  <span class="advice-card__quote-text">“{{ citation.quote }}”</span>
                </blockquote>
              </details>
              <p v-else class="advice-card__nocite">没有原文，不构成推荐</p>
            </article>
          </section>

          <div v-if="advice.gaps.length > 0" class="advice-step__gaps">
            <p class="advice-step__gaps-title">没覆盖到的：</p>
            <p v-for="(gap, index) in advice.gaps" :key="index" class="advice-step__gap">
              · {{ gap }}
            </p>
          </div>

          <details v-if="advice.retrieval" class="advice-step__retrieval">
            <summary>这次读了哪几页（{{ advice.retrieval.pages.length }} 页）</summary>
            <p v-for="page in advice.retrieval.pages" :key="`${page.documentId}-${page.page}`">
              · {{ page.documentId }} 第 {{ page.page }} 页
            </p>
            <p v-if="advice.retrieval.queries.length > 0" class="advice-step__queries">
              查询：{{ advice.retrieval.queries.join(' / ') }}
            </p>
          </details>
        </template>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { supplementNutrientGroups } from '@/constants/supplementNutrients'
import type {
  SupplementDimensionCandidateDto,
  SupplementDimensionsAdviceDto
} from '@/types/ingredientCreation'
import {
  canPick,
  citationsOf,
  citationText,
  isEmptyAdvice,
  recommendationText,
  statusMeta,
  verdictMeta
} from './formAdviceView'

/**
 * 第 1 步：定形态（维度驱动）。
 *
 * 页面不做营养判断：候选、状态、理由、出处都来自后端。
 * 这里只把「有原文」和「市场有但没依据」分成两种样子，
 * 别让人把猜的当成查到的。
 */
const props = defineProps<{
  initialNutrientKey?: string | null
}>()

const emit = defineEmits<{
  (
    event: 'chosen',
    value: {
      dimensionKey: 'FORM' | 'SOURCE'
      candidateKey: string
      labelZh: string
      status: 'EVIDENCED' | 'MARKET_ONLY'
      verdict: 'RECOMMENDED' | 'ACCEPTABLE' | 'AVOID' | 'NO_EVIDENCE'
    }
  ): void
  (event: 'skip'): void
  (event: 'loaded', value: SupplementDimensionsAdviceDto): void
}>()

const nutrientOptions = supplementNutrientGroups.flatMap((group) =>
  group.fields.map((field) => ({
    fieldPath: field.fieldPath,
    label: `${group.title} · ${field.label}`
  }))
)

const nutrientKey = ref<string | null>(props.initialNutrientKey ?? null)
const question = ref('')
const loading = ref(false)
const errorText = ref('')
const advice = ref<SupplementDimensionsAdviceDto | null>(null)

const allMarketOnly = computed(
  () =>
    (advice.value?.dimensions ?? []).every((group) =>
      group.candidates.every((item) => item.status === 'MARKET_ONLY')
    ) && (advice.value?.dimensions.length ?? 0) > 0
)

const recommendedCandidate = computed(() => {
  const target = advice.value?.recommendation
  if (!target) {
    return null
  }
  return (
    advice.value?.dimensions
      .flatMap((group) => group.candidates)
      .find((item) => item.key === target.candidateKey) ?? null
  )
})

async function ask(): Promise<void> {
  const key = nutrientKey.value
  if (!key) {
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const label = nutrientOptions.find((item) => item.fieldPath === key)?.label ?? key
    advice.value = await ingredientCreationApi.supplementFormDimensions({
      nutrientKey: key,
      nutrientLabel: label,
      question: question.value.trim() || undefined
    })
    emit('loaded', advice.value)
    if (advice.value.dimensions.length === 0) {
      ElMessage.info('这次没抽到可比的形态，可以直接去比价')
    }
  } catch (error) {
    errorText.value = apiErrorMessage(error, '这次没查成，稍后再试')
  } finally {
    loading.value = false
  }
}

/**
 * 市场有、库里没依据的候选也允许用，但要弹一次确认。
 *
 * 理由：老板可能因为"只有这瓶买得到"改选，软件不该把他堵死；
 * 选中的事实（status）会写进档案快照，事后看得出这是人拍的板。
 */
async function forcePick(candidate: SupplementDimensionCandidateDto): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `${candidate.labelZh} 在知识库里没有原文依据（${candidate.reason}）。仍要用它建档吗？`,
      '这一档没有原文支撑',
      { confirmButtonText: '仍要用', cancelButtonText: '先不用', type: 'warning' }
    )
  } catch {
    return
  }
  pick(candidate)
}

function pick(candidate: SupplementDimensionCandidateDto): void {
  emit('chosen', {
    dimensionKey: candidate.dimension,
    candidateKey: candidate.key,
    labelZh: candidate.labelZh,
    status: candidate.status,
    verdict: candidate.verdict
  })
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: { message?: unknown } } })?.response?.data
  const message = body?.message
  if (typeof message === 'string' && message.trim()) {
    return message
  }
  return fallback
}

onMounted(() => {
  if (nutrientKey.value) {
    void ask()
  }
})
</script>

<style scoped>
.advice-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fff;
  border: 1px solid #e3e6ea;
  border-radius: 8px;
  padding: 16px;
}
.advice-step__head h3 {
  margin: 0 0 4px;
  font-size: 15px;
}
.advice-step__desc {
  margin: 0;
  font-size: 12px;
  color: #8a9099;
  line-height: 1.6;
}
.advice-step__query {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.advice-step__verdict {
  font-size: 13px;
  color: #0f7a54;
  background: #f6fdfa;
  border: 1px solid #cfe7db;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 10px;
}
.advice-step__verdict-reason {
  margin-left: 8px;
  color: #3c6b57;
}
.advice-step__verdict--none {
  color: #b26a00;
  background: #fff6e8;
  border-color: #f0d9a8;
}
.advice-step__empty {
  border: 1px dashed #dfe3e8;
  border-radius: 8px;
  padding: 16px;
  font-size: 13px;
  color: #5b6470;
}
.advice-step__empty p {
  margin: 6px 0 12px;
  font-size: 12px;
  color: #8a9099;
}
.dimension {
  margin-bottom: 12px;
}
.dimension__title {
  margin: 8px 0 6px;
  font-size: 12px;
  color: #8a9099;
}
.advice-card {
  border: 1px solid #eef0f3;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
.advice-card--muted {
  background: #fafbfc;
}
.advice-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.advice-card__market {
  font-size: 11.5px;
  color: #9aa2ab;
}
.advice-card__pick {
  margin-left: auto;
}
.advice-card__reason {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: #5b6470;
  line-height: 1.6;
}
.advice-card__cites {
  margin-top: 6px;
  font-size: 12px;
}
.advice-card__cites summary {
  cursor: pointer;
  color: #3370ff;
}
.advice-card__quote {
  margin: 6px 0 0;
  padding: 6px 10px;
  border-left: 3px solid #dfe3e8;
  background: #fafbfc;
  font-size: 11.5px;
  color: #5b6470;
  line-height: 1.7;
}
.advice-card__quote-src {
  display: block;
  color: #8a9099;
}
.advice-card__nocite {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: #9aa2ab;
}
.advice-step__gaps {
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px dashed #f0d9a8;
  border-radius: 6px;
  background: #fffdf8;
  font-size: 12px;
  color: #b26a00;
}
.advice-step__gaps-title {
  margin: 0 0 4px;
  font-weight: 600;
}
.advice-step__gap {
  margin: 0;
  line-height: 1.6;
}
.advice-step__retrieval {
  margin-top: 10px;
  font-size: 11.5px;
  color: #8a9099;
}
.advice-step__retrieval summary {
  cursor: pointer;
}
.advice-step__retrieval p {
  margin: 2px 0;
}
.advice-step__queries {
  color: #9aa2ab;
}
</style>
