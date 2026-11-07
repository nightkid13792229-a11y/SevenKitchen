<template>
  <div class="compare">
    <p class="compare__hint">
      把几个候选填进来，按「形态 → 人用还是犬用 → 性价比」逐层淘汰。
      目录那一列只是提示，不参与淘汰。
    </p>

    <div class="compare__search">
      <el-input
        v-model="keyword"
        placeholder="要补什么？例如：锌 / 鱼油"
        style="width: 240px"
      />
      <el-button :loading="searching" data-action="search-candidates" @click="searchCandidates">
        帮我找候选
      </el-button>
      <span class="compare__count">
        搜的是 iHerb，只带名字和标价回来；规格与含量照标签补
      </span>
    </div>

    <el-table :data="rows" size="small" border>
      <el-table-column label="候选" min-width="150">
        <template #default="{ row }">
          <el-input v-model="row.name" placeholder="如：甘氨酸锌 15mg" />
        </template>
      </el-table-column>
      <el-table-column label="形态" width="120">
        <template #default="{ row }">
          <el-select v-model="row.formGrade" style="width: 100%">
            <el-option label="最好" value="BEST" />
            <el-option label="好" value="GOOD" />
            <el-option label="一般" value="FAIR" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="人用/饲料级" width="130">
        <template #default="{ row }">
          <el-select v-model="row.usage" style="width: 100%">
            <el-option label="人用" value="HUMAN" />
            <el-option label="饲料级" value="FEED_GRADE" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="采购价" width="110">
        <template #default="{ row }">
          <el-input-number v-model="row.price" :min="0" :controls="false" style="width: 100%" />
        </template>
      </el-table-column>
      <el-table-column label="每单位粒数" width="110">
        <template #default="{ row }">
          <el-input-number v-model="row.units" :min="0" :controls="false" style="width: 100%" />
        </template>
      </el-table-column>
      <el-table-column label="每份有效成分(mg)" width="140">
        <template #default="{ row }">
          <el-input-number v-model="row.activeMg" :min="0" :controls="false" style="width: 100%" />
        </template>
      </el-table-column>
      <el-table-column label="每份粒数" width="110">
        <template #default="{ row }">
          <el-input-number v-model="row.servingUnits" :min="1" :controls="false" style="width: 100%" />
        </template>
      </el-table-column>
      <el-table-column label="" width="70">
        <template #default="{ $index }">
          <el-button text size="small" @click="removeRow($index)">删</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="compare__actions">
      <el-button size="small" :disabled="rows.length >= 4" @click="addRow">再加一个</el-button>
      <span class="compare__count">最多 4 个，多了反而看不清</span>
    </div>

    <div class="compare__verdict">
      <div v-if="result.recommendedKey" class="compare__rec">
        推荐：<b>{{ recommendedName }}</b>　{{ result.reason }}
      </div>
      <div v-else class="compare__rec compare__rec--none">{{ result.reason }}</div>

      <el-table :data="result.verdicts" size="small">
        <el-table-column prop="name" label="候选" min-width="130" />
        <el-table-column label="每 1000mg" width="110">
          <template #default="{ row }">
            {{ row.costPer1000Mg === null ? '—' : `¥${row.costPer1000Mg.toFixed(2)}` }}
          </template>
        </el-table-column>
        <el-table-column label="处境" min-width="200">
          <template #default="{ row }">
            <el-tag v-if="row.eliminatedBy" type="danger" size="small" effect="plain">出局</el-tag>
            <el-tag v-else-if="row.key === result.recommendedKey" type="success" size="small" effect="plain">
              选它
            </el-tag>
            <el-tag v-else size="small" effect="plain">留着</el-tag>
            <span class="compare__note">{{ row.note }}</span>
          </template>
        </el-table-column>
        <el-table-column width="110">
          <template #default="{ row }">
            <el-button
              text
              size="small"
              :data-action="`use-${row.key}`"
              @click="useCandidate(row.key)"
            >
              用这个
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  compareCandidates,
  type CandidateFacts,
  type ComparisonResult
} from './compareCandidates'
import { findHardExclusion } from '@/constants/supplementHardExclusions'
import { ingredientCreationApi } from '@/api/ingredientCreation'

/**
 * 选品对比。
 *
 * 这里**不抓网页、不算推荐以外的判断**：形态和"人用还是饲料级"由人勾，
 * 价格与规格由人填或链接读进来，比较与淘汰交给 `compareCandidates`（有单测）。
 * 目录那一列只作提示——目录不是门禁。
 */
interface CompareRow {
  key: string
  name: string
  formGrade: 'BEST' | 'GOOD' | 'FAIR'
  usage: 'HUMAN' | 'FEED_GRADE'
  price: number | null
  units: number | null
  activeMg: number | null
  servingUnits: number | null
  catalogDogAllowed: boolean | null
}

const emit = defineEmits<{
  (event: 'use', payload: { name: string; price: number | null; units: number | null }): void
}>()

let seq = 0
const rows = reactive<CompareRow[]>([newRow(), newRow()])
const keyword = ref('')
const searching = ref(false)

function newRow(): CompareRow {
  seq += 1
  return {
    key: `c${seq}`,
    name: '',
    formGrade: 'GOOD',
    usage: 'HUMAN',
    price: null,
    units: null,
    activeMg: null,
    servingUnits: 1,
    catalogDogAllowed: null
  }
}

/** 搜到的候选直接排成行：名字和标价先填上，规格含量还得照标签补。 */
async function searchCandidates(): Promise<void> {
  const q = keyword.value.trim()
  if (!q) {
    return
  }
  searching.value = true
  try {
    const found = await ingredientCreationApi.searchSupplementCandidates(q)
    rows.splice(0, rows.length, ...found.map(toRow))
    if (found.length === 0) {
      ElMessage.info('没搜到候选，换个说法再试，或者直接贴商品链接')
    }
  } catch (error) {
    const body = (error as { response?: { data?: { message?: unknown } } })?.response?.data
    const message = typeof body?.message === 'string' ? body.message : '搜不到，稍后再试'
    ElMessage.error(message)
  } finally {
    searching.value = false
  }
}

function toRow(candidate: { name: string; priceUsd: number | null }): CompareRow {
  const row = newRow()
  row.name = candidate.name
  row.price = candidate.priceUsd
  return row
}

function addRow(): void {
  rows.push(newRow())
}

function removeRow(index: number): void {
  rows.splice(index, 1)
}

const filled = computed(() => rows.filter((row) => row.name.trim()))

const result = computed<ComparisonResult>(() =>
  compareCandidates(
    filled.value.map(
      (row): CandidateFacts => ({
        key: row.key,
        name: row.name.trim(),
        formGrade: row.formGrade,
        usage: row.usage,
        pricePerPurchaseUnit: row.price,
        unitsPerPurchaseUnit: row.units,
        activeMgPerServing: row.activeMg,
        servingUnitsPerDose: row.servingUnits,
        catalogDogAllowed: row.catalogDogAllowed,
        // 名字里带「氧化铁 / 碳酸亚铁 / 氧化铜」的直接判不能用，理由来自文献
        hardExclusionReason: findHardExclusion(row.name)?.reason ?? null
      })
    )
  )
)

const recommendedName = computed(() => {
  const key = result.value.recommendedKey
  return filled.value.find((row) => row.key === key)?.name ?? ''
})

function useCandidate(key: string): void {
  const row = rows.find((item) => item.key === key)
  if (!row) {
    return
  }
  emit('use', { name: row.name.trim(), price: row.price, units: row.units })
}
</script>

<style scoped>
.compare {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.compare__hint {
  margin: 0;
  font-size: 12px;
  color: #8a9099;
  line-height: 1.6;
}
.compare__search{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.compare__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.compare__count {
  font-size: 11.5px;
  color: #9aa2ab;
}
.compare__verdict {
  border-top: 1px dashed #e3e6ea;
  padding-top: 10px;
}
.compare__rec {
  font-size: 12.5px;
  color: #0f7a54;
  background: #f6fdfa;
  border: 1px solid #cfe7db;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
}
.compare__rec--none {
  color: #b26a00;
  background: #fff6e8;
  border-color: #f0d9a8;
}
.compare__note {
  margin-left: 6px;
  font-size: 11.5px;
  color: #8a9099;
}
</style>
