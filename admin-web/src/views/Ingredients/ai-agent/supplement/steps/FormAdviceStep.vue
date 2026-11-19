<template>
  <section class="advice-step">
    <header class="advice-step__head">
      <div>
        <h3>① 定形态</h3>
        <p class="advice-step__desc">
          选一个营养素，Agent 去知识库读原文，给出「形态档位 + 结论 + 出处」。
          没有原文支撑的档位只会标「证据不足」，不会给推荐。
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
        <div
          v-if="advice.recommendedLevel"
          class="advice-step__verdict"
          data-testid="advice-verdict"
        >
          <b>建议用：{{ recommendedLabel }}</b>
          <span class="advice-step__verdict-reason">{{ advice.recommendationReason }}</span>
        </div>
        <div v-else class="advice-step__verdict advice-step__verdict--none">
          <b>这一项没有足够原文支撑，请你判断</b>
          <span class="advice-step__verdict-reason">{{ advice.recommendationReason }}</span>
        </div>

        <article
          v-for="option in advice.options"
          :key="option.level"
          class="advice-card"
          :class="{ 'advice-card--muted': !metaOf(option).pickable }"
        >
          <div class="advice-card__head">
            <b>{{ option.labelZh }}</b>
            <el-tag :type="metaOf(option).type" size="small" effect="plain">
              {{ metaOf(option).label }}
            </el-tag>
            <span v-if="option.examples.length > 0" class="advice-card__examples">
              例：{{ option.examples.join('、') }}
            </span>
            <el-button
              v-if="metaOf(option).pickable"
              class="advice-card__pick"
              type="primary"
              size="small"
              :data-action="`pick-${option.level}`"
              @click="pick(option)"
            >
              用这个档位
            </el-button>
          </div>

          <p class="advice-card__reason">{{ option.reason }}</p>

          <details v-if="citationsOf(option).length > 0" class="advice-card__cites">
            <summary>出处 {{ citationsOf(option).length }} 条</summary>
            <blockquote
              v-for="(citation, index) in citationsOf(option)"
              :key="index"
              class="advice-card__quote"
            >
              <span class="advice-card__quote-src">{{ citationText(citation) }}</span>
              <span class="advice-card__quote-text">“{{ citation.quote }}”</span>
            </blockquote>
          </details>
          <p v-else class="advice-card__nocite">没有原文，不构成推荐</p>
        </article>

        <div v-if="advice.gaps.length > 0" class="advice-step__gaps">
          <p class="advice-step__gaps-title">知识库没覆盖到的：</p>
          <p v-for="(gap, index) in advice.gaps" :key="index" class="advice-step__gap">
            · {{ gap }}
          </p>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { supplementNutrientGroups } from '@/constants/supplementNutrients'
import type {
  SupplementFormAdviceDto,
  SupplementFormOptionDto
} from '@/types/ingredientCreation'
import { citationText, citationsOf, verdictMeta } from './formAdviceView'

/**
 * 第 1 步：定形态。
 *
 * 页面不做营养判断：结论、理由、出处都来自后端；这里只负责把
 * 「有原文的」和「没原文的」分成两种样子，别让人把猜的当成查到的。
 */
const props = defineProps<{
  initialNutrientKey?: string | null
}>()

const emit = defineEmits<{
  (event: 'chosen', value: { nutrientKey: string; nutrientLabel: string; level: string }): void
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
const advice = ref<SupplementFormAdviceDto | null>(null)

const recommendedLabel = computed(() => {
  const level = advice.value?.recommendedLevel
  return advice.value?.options.find((option) => option.level === level)?.labelZh ?? level ?? ''
})

function metaOf(option: SupplementFormOptionDto) {
  return verdictMeta(option.verdict)
}

async function ask(): Promise<void> {
  const key = nutrientKey.value
  if (!key) {
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const label = nutrientOptions.find((item) => item.fieldPath === key)?.label ?? key
    advice.value = await ingredientCreationApi.supplementFormAdvice({
      nutrientKey: key,
      nutrientLabel: label,
      question: question.value.trim() || undefined
    })
    if (advice.value.options.length === 0) {
      ElMessage.info('知识库里没查到相关的页，换个营养素试试')
    }
  } catch (error) {
    errorText.value = apiErrorMessage(error, '这次没查成，稍后再试')
  } finally {
    loading.value = false
  }
}

function pick(option: SupplementFormOptionDto): void {
  const key = nutrientKey.value
  if (!key) {
    return
  }
  const label = nutrientOptions.find((item) => item.fieldPath === key)?.label ?? key
  emit('chosen', { nutrientKey: key, nutrientLabel: label, level: option.level })
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
.advice-card__examples {
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
</style>
