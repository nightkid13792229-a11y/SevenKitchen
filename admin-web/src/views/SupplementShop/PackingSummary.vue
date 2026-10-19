<template>
  <div class="summary-page">
    <div class="page-header">
      <div>
        <h2>分装汇总</h2>
        <p class="page-desc">当天单数、袋数、补剂总量、包材需求、缺料和产能。只算需求量，不扣包材库存。</p>
      </div>
      <div class="header-actions">
        <el-date-picker
          v-model="date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择分装日"
          @change="load"
        />
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-row :gutter="12">
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="metric"><div class="label">订单</div><div class="value">{{ data?.orderCount ?? '—' }}</div><div class="hint">产能 {{ data?.capacity ?? '—' }}</div></el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="metric"><div class="label">总袋数</div><div class="value">{{ data?.bagCount ?? '—' }}</div><div class="hint">一袋一张标签</div></el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="metric"><div class="label">缺料补剂</div><div class="value warning">{{ shortageCount }}</div><div class="hint">按账面数量对比</div></el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="metric"><div class="label">未配置袋型</div><div class="value danger">{{ data?.missingPouchRules?.length ?? 0 }}</div><div class="hint">不阻塞分装，但需补规则</div></el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="block">
      <div class="section-title">补剂总用量</div>
      <el-table :data="data?.ingredientTotals || []" size="small" stripe>
        <el-table-column prop="name" label="补剂" min-width="160" />
        <el-table-column label="总量" width="140">
          <template #default="{ row }">{{ row.quantity }} {{ row.unit }}</template>
        </el-table-column>
        <el-table-column prop="orderCount" label="涉及订单" width="100" />
        <el-table-column label="账面" width="120">
          <template #default="{ row }">{{ row.onHand }} {{ row.unit }}</template>
        </el-table-column>
        <el-table-column label="缺口" width="120">
          <template #default="{ row }">
            <span :class="{ danger: row.shortage > 0 }">{{ row.shortage > 0 ? `缺 ${row.shortage} ${row.unit}` : '足' }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="block">
      <div class="section-title">包材需求</div>
      <el-table :data="data?.packagingNeeds || []" size="small" stripe>
        <el-table-column label="角色" width="100">
          <template #default="{ row }">{{ roleLabel(row.role) }}</template>
        </el-table-column>
        <el-table-column prop="name" label="包材" min-width="180" />
        <el-table-column prop="quantity" label="数量" width="120" />
        <el-table-column label="配置" width="120">
          <template #default="{ row }">
            <el-tag :type="row.configured ? 'success' : 'warning'" size="small">{{ row.configured ? '已配置' : '未配置' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-alert
        v-if="data?.missingPouchRules?.length"
        type="warning"
        :closable="false"
        show-icon
        class="missing-alert"
        :title="`${data.missingPouchRules.length} 个补剂没有匹配到袋型规则`"
      >
        <div class="missing-list">{{ data.missingPouchRules.join('；') }}</div>
      </el-alert>
    </el-card>

    <el-card shadow="never" class="block">
      <div class="section-title">当天订单</div>
      <el-table :data="data?.orders || []" size="small" stripe>
        <el-table-column prop="orderNo" label="订单号" min-width="200" />
        <el-table-column prop="status" label="状态" width="120" />
        <el-table-column prop="bagCount" label="袋数" width="100" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { supplementPackagingApi } from '@/api/supplementPackaging'
import type { PackingSummary } from '@/api/supplementPackaging'

const loading = ref(false)
const data = ref<PackingSummary | null>(null)
const date = ref(new Date().toISOString().slice(0, 10))

const shortageCount = computed(
  () => data.value?.ingredientTotals.filter((item) => item.shortage > 0).length ?? 0,
)

function roleLabel(role: string) {
  return ({ POUCH: '分装袋', DESICCANT: '干燥剂', LABEL: '标签' } as Record<string, string>)[role] || role
}

async function load() {
  loading.value = true
  try {
    data.value = await supplementPackagingApi.packingSummary(date.value)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.summary-page { padding: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.page-header h2 { margin: 0; font-size: 20px; }
.page-desc { margin: 6px 0 0; color: #909399; font-size: 13px; }
.header-actions { display: flex; gap: 8px; }
.metric { margin-bottom: 12px; }
.metric .label { color: #606266; font-size: 13px; }
.metric .value { margin-top: 8px; font-size: 28px; font-weight: 600; }
.metric .hint { margin-top: 6px; color: #909399; font-size: 12px; }
.warning { color: #e6a23c; }
.danger { color: #f56c6c; }
.block { margin-bottom: 12px; }
.section-title { font-weight: 600; margin-bottom: 12px; }
.missing-alert { margin-top: 12px; }
.missing-list { margin-top: 6px; color: #8a5a00; font-size: 12px; line-height: 1.6; }
</style>
