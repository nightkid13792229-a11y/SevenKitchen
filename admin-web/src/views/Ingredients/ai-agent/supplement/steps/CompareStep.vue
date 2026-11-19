<template>
  <section class="compare-step">
    <header class="compare-step__head">
      <div>
        <h3>② 比价</h3>
        <p class="compare-step__desc">
          按「每 1000 单位有效成分多少钱」排；算不出的排在后面并写明缺哪一格。
          形态不同的商品会一起列出——中文站搜不到「硫酸铜」这种精确词，看标签确认。
        </p>
      </div>
      <div class="compare-step__actions">
        <el-button text data-action="back-to-form" @click="emit('back')">← 改形态</el-button>
        <el-button :loading="loading" data-action="reload" @click="load">换一批</el-button>
      </div>
    </header>

    <el-alert v-if="errorText" type="error" :closable="false" show-icon class="compare-step__alert">
      <span>{{ errorText }}</span>
    </el-alert>

    <div v-loading="loading" class="compare-step__body">
      <template v-if="comparison">
        <p class="compare-step__basis">{{ basisText }}</p>

        <div v-if="recommendation" class="compare-step__rec">
          <b>建议这瓶：</b>{{ recommendation.name }}
          <span class="compare-step__rec-reason">{{ comparison.reason }}</span>
        </div>
        <div v-else class="compare-step__rec compare-step__rec--none">{{ comparison.reason }}</div>

        <el-table :data="rows" size="small" border class="compare-step__table">
          <el-table-column label="商品" min-width="240">
            <template #default="{ row }">
              <a :href="row.url" target="_blank" rel="noreferrer">{{ row.name }}</a>
              <el-tag v-if="row.recommended" size="small" type="success" effect="plain">推荐</el-tag>
              <el-tag v-if="!row.sameForm" size="small" type="info" effect="plain">形态不同档</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="unitsPerBottle" label="每瓶" width="90" />
          <el-table-column prop="servingUnits" label="每份" width="100" />
          <el-table-column prop="amount" label="每份含量" width="110" />
          <el-table-column prop="servings" label="每瓶份数" width="100" />
          <el-table-column prop="price" label="到手价" width="90" />
          <el-table-column label="每 1000 单位" width="130">
            <template #default="{ row }">
              <b :class="{ 'compare-step__price--unknown': !row.selectable }">{{ row.unitPrice }}</b>
            </template>
          </el-table-column>
          <el-table-column label="结论" min-width="180">
            <template #default="{ row }">
              <el-button
                v-if="row.selectable"
                text
                type="primary"
                size="small"
                :data-action="`pick-${row.url}`"
                @click="pick(row.url)"
              >
                就买这瓶
              </el-button>
              <span v-else class="compare-step__missing">{{ row.missingText }}</span>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="comparison.failed.length > 0" class="compare-step__failed">
          <p class="compare-step__failed-title">这些没读出来（不影响上面这几瓶）：</p>
          <p v-for="item in comparison.failed" :key="item.url" class="compare-step__failed-row">
            {{ item.name }} —— {{ item.reason }}
          </p>
        </div>

        <p v-if="comparison.partial" class="compare-step__partial">
          时间到了，后面几瓶没读完；可以点「换一批」再试。
        </p>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import type { SupplementComparisonDto, SupplementOfferDto } from '@/types/ingredientCreation'
import { basisHeader, toRowViews } from './compareRows'

/**
 * 第 2 步：比价。
 *
 * 这里**不做任何算术**——单价、排序、推荐都来自后端；
 * 页面只负责把数字摆清楚、把「算不出」的原因写出来。
 */
const props = defineProps<{
  nutrientKey: string
  nutrientLabel: string
  formLevel: string
  /** 维度模式下用中文候选名当搜索词（iHerb 中文站按中文更好搜） */
  formKeyword?: string
  comparison: SupplementComparisonDto | null
}>()

const emit = defineEmits<{
  (event: 'update:comparison', value: SupplementComparisonDto): void
  (event: 'chosen', value: SupplementOfferDto): void
  (event: 'back'): void
}>()

const loading = ref(false)
const errorText = ref('')
const comparison = computed(() => props.comparison)
const rows = computed(() => (props.comparison ? toRowViews(props.comparison) : []))
const basisText = computed(() => (props.comparison ? basisHeader(props.comparison.basis) : ''))
const recommendation = computed(() => {
  const data = props.comparison
  if (!data?.recommendedUrl) {
    return null
  }
  return data.offers.find((offer) => offer.url === data.recommendedUrl) ?? null
})

async function load(): Promise<void> {
  loading.value = true
  errorText.value = ''
  try {
    const data = await ingredientCreationApi.compareSupplementOffers({
      nutrientKey: props.nutrientKey,
      // 没选形态（空表直接比价）时不传，后端按"不做同档分组"处理
      ...(props.formLevel ? { formLevel: props.formLevel } : {}),
      // 不用候选的中文名当搜索词：中文站搜「硫酸铜」会返回一堆多维片，
      // 搜索统一按营养素（后端用英文名），形态只记在档案快照里
      limit: 8
    })
    emit('update:comparison', data)
    if (data.offers.length === 0) {
      ElMessage.info('这一轮一瓶都没读出来，换个搜索词或直接贴链接')
    }
  } catch (error) {
    errorText.value = apiErrorMessage(error, '这轮没比出来，稍后再试')
  } finally {
    loading.value = false
  }
}

function pick(url: string): void {
  const offer = props.comparison?.offers.find((item) => item.url === url)
  if (offer) {
    emit('chosen', offer)
  }
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
  if (!props.comparison) {
    void load()
  }
})
</script>

<style scoped>
.compare-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fff;
  border: 1px solid #e3e6ea;
  border-radius: 8px;
  padding: 16px;
}
.compare-step__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.compare-step__head h3 {
  margin: 0 0 4px;
  font-size: 15px;
}
.compare-step__desc {
  margin: 0;
  font-size: 12px;
  color: #8a9099;
  line-height: 1.6;
}
.compare-step__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.compare-step__basis {
  margin: 0;
  font-size: 12px;
  color: #5b6470;
}
.compare-step__rec {
  font-size: 13px;
  color: #0f7a54;
  background: #f6fdfa;
  border: 1px solid #cfe7db;
  border-radius: 6px;
  padding: 8px 10px;
}
.compare-step__rec-reason {
  margin-left: 8px;
  color: #3c6b57;
}
.compare-step__rec--none {
  color: #b26a00;
  background: #fff6e8;
  border-color: #f0d9a8;
}
.compare-step__price--unknown {
  color: #9aa2ab;
  font-weight: 400;
}
.compare-step__missing {
  font-size: 11.5px;
  color: #b26a00;
}
.compare-step__failed {
  font-size: 12px;
  color: #8a9099;
  border-top: 1px dashed #e3e6ea;
  padding-top: 8px;
}
.compare-step__failed-title {
  margin: 0 0 4px;
  font-weight: 600;
}
.compare-step__failed-row {
  margin: 0 0 2px;
}
.compare-step__partial {
  margin: 0;
  font-size: 12px;
  color: #b26a00;
}
</style>
