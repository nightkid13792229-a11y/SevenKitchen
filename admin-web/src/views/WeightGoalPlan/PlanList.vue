<template>
  <div class="plan-page">
    <el-card shadow="never" class="filters-card">
      <div class="page-head">
        <div>
          <div class="page-title">体重管理计划</div>
          <div class="page-subtitle">
            顾客自己定的增减重方案。系统会按实际称重速度自动调整热量，
            下面每条调整记录都写明了原因 —— 顾客问「为什么这个月热量降了」时照这个回答。
          </div>
        </div>
      </div>

      <el-form :inline="true" :model="filters" class="filter-form">
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部" style="width: 140px">
            <el-option label="进行中" value="ACTIVE" />
            <el-option label="维持期" value="MAINTENANCE" />
            <el-option label="已暂停" value="PAUSED" />
            <el-option label="已结束" value="COMPLETED" />
            <el-option label="已取消" value="CANCELLED" />
          </el-select>
        </el-form-item>

        <el-form-item label="方向">
          <el-select v-model="filters.direction" clearable placeholder="全部" style="width: 120px">
            <el-option label="减重" value="LOSS" />
            <el-option label="增重" value="GAIN" />
          </el-select>
        </el-form-item>

        <el-form-item label="搜索">
          <el-input
            v-model="filters.keyword"
            placeholder="狗名 / 品种 / 主人昵称 / 手机号"
            clearable
            style="width: 260px"
            @keyup.enter="reload"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="loading" @click="reload">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="items" v-loading="loading" stripe>
        <el-table-column label="狗狗" min-width="140">
          <template #default="{ row }">
            <div class="cell-main">{{ row.dogName || '（未命名）' }}</div>
            <div class="cell-sub">{{ row.breedName || '未知品种' }}</div>
          </template>
        </el-table-column>

        <el-table-column label="主人" min-width="130">
          <template #default="{ row }">
            <div class="cell-main">{{ row.ownerNickname || '—' }}</div>
            <div class="cell-sub">{{ row.ownerPhone || '—' }}</div>
          </template>
        </el-table-column>

        <el-table-column label="方向" width="80">
          <template #default="{ row }">
            <el-tag :type="row.direction === 'LOSS' ? 'warning' : 'success'" size="small">
              {{ row.direction === 'LOSS' ? '减重' : '增重' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="体重进度" min-width="160">
          <template #default="{ row }">
            <div class="cell-main">
              {{ row.currentWeightKg }} kg
              <span class="cell-muted"> → {{ row.targetWeightKg }} kg</span>
            </div>
            <el-progress
              :percentage="row.progressPercent"
              :stroke-width="6"
              :show-text="false"
              style="margin-top: 6px"
            />
            <div class="cell-sub">已完成 {{ row.progressPercent }}%</div>
          </template>
        </el-table-column>

        <el-table-column label="每日能量" width="100">
          <template #default="{ row }">
            <span class="cell-main">{{ row.currentKcal }} kcal</span>
          </template>
        </el-table-column>

        <el-table-column label="最近速率" width="120">
          <template #default="{ row }">
            <span :class="rateClass(row)">
              {{ formatRate(row.lastRatePercentPerWeek) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="最近称重" width="110">
          <template #default="{ row }">
            {{ formatDate(row.lastWeighInDate) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" fixed="right" width="90">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty description="没有符合条件的计划" />
        </template>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="load"
          @current-change="load"
        />
      </div>
    </el-card>

    <!-- 详情抽屉：计划全貌 + 完整调整历史 -->
    <el-drawer v-model="drawerVisible" title="计划详情" size="620px">
      <div v-if="detail" v-loading="detailLoading" class="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="狗狗">
            {{ detail.dog.name || '（未命名）' }}
          </el-descriptions-item>
          <el-descriptions-item label="品种">
            {{ detail.dog.breedName || '未知品种' }}
          </el-descriptions-item>
          <el-descriptions-item label="主人">
            {{ detail.owner.nickname || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="手机号">
            {{ detail.owner.phone || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="方向">
            {{ detail.direction === 'LOSS' ? '减重' : '增重' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            {{ statusLabel(detail.status) }}
          </el-descriptions-item>
          <el-descriptions-item label="建档体况分">
            {{ detail.startBcsScore }} 分
          </el-descriptions-item>
          <el-descriptions-item label="当前体况分">
            {{ detail.dog.bcsScore ?? '—' }} 分
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-section">
          <div class="detail-section__title">体重</div>
          <el-descriptions :column="3" border size="small">
            <el-descriptions-item label="起始">{{ detail.startWeightKg }} kg</el-descriptions-item>
            <el-descriptions-item label="当前">{{ detail.currentWeightKg }} kg</el-descriptions-item>
            <el-descriptions-item label="目标">{{ detail.targetWeightKg }} kg</el-descriptions-item>
            <el-descriptions-item label="系统建议">
              {{ detail.suggestedTargetWeightKg }} kg
            </el-descriptions-item>
            <el-descriptions-item label="已完成">
              {{ detail.progressPercent }}%
            </el-descriptions-item>
            <el-descriptions-item label="是否达标">
              {{ detail.goalReached ? '是' : '否' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="detail-section">
          <div class="detail-section__title">能量</div>
          <el-descriptions :column="3" border size="small">
            <el-descriptions-item label="当前每日">{{ detail.currentKcal }} kcal</el-descriptions-item>
            <el-descriptions-item label="安全下限">{{ detail.floorKcal }} kcal</el-descriptions-item>
            <el-descriptions-item label="安全上限">{{ detail.ceilingKcal }} kcal</el-descriptions-item>
            <el-descriptions-item label="目标速率">
              {{ detail.targetRatePercentPerWeek }}%/周
            </el-descriptions-item>
            <el-descriptions-item label="最近速率" :span="2">
              {{ formatRate(detail.lastRatePercentPerWeek) }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="detail-section">
          <div class="detail-section__title">日程</div>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="开始">{{ formatDate(detail.startDate) }}</el-descriptions-item>
            <el-descriptions-item label="预计达标">
              {{ formatDate(detail.estimatedGoalDate) }}
            </el-descriptions-item>
            <el-descriptions-item label="最近称重">
              {{ formatDate(detail.lastWeighInDate) }}
            </el-descriptions-item>
            <el-descriptions-item label="下次复查">
              {{ formatDate(detail.nextReviewDate) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detail.pausedReason" label="暂停原因" :span="2">
              {{ detail.pausedReason }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="detail-section">
          <div class="detail-section__title">
            调整记录（{{ detail.adjustments.length }} 条）
          </div>
          <el-empty v-if="detail.adjustments.length === 0" description="还没有调整过" :image-size="60" />
          <el-timeline v-else>
            <el-timeline-item
              v-for="item in detail.adjustments"
              :key="item.id"
              :timestamp="formatDateTime(item.createdAt)"
              placement="top"
            >
              <div class="adjust-item">
                <div class="adjust-item__head">
                  <el-tag size="small" :type="reasonTagType(item.reason)">
                    {{ reasonLabel(item.reason) }}
                  </el-tag>
                  <span class="adjust-item__energy">
                    {{ item.energyBefore }} → {{ item.energyAfter }} kcal
                  </span>
                </div>
                <div v-if="item.ratePercentPerWeek !== null" class="adjust-item__meta">
                  当时速率 {{ formatRate(item.ratePercentPerWeek) }}
                  <template v-if="item.weightKg"> · 体重 {{ item.weightKg }} kg</template>
                </div>
                <div v-if="item.note" class="adjust-item__note">{{ item.note }}</div>
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api } from '@/api'

/**
 * 体重管理计划 · 管理后台（阶段 B3）
 *
 * 只读。计划是顾客自己的方案 —— 调整要么由顾客操作，要么由系统按实测速率
 * 自动做。后台的作用是**看得见**：
 *   · 谁在减重、进行到哪一步
 *   · 系统为什么调过热量（每条调整历史都带原因与当时的速率）
 */
const API_BASE = '/admin/weight-goal-plan'

const loading = ref(false)
const items = ref<any[]>([])

const filters = reactive({
  status: '',
  direction: '',
  keyword: '',
})

const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const drawerVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<any>(null)

async function load() {
  loading.value = true
  try {
    const data: any = await api.get(API_BASE, {
      params: {
        status: filters.status || undefined,
        direction: filters.direction || undefined,
        keyword: filters.keyword || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    })
    items.value = data?.items ?? []
    pagination.total = data?.total ?? 0
  } finally {
    loading.value = false
  }
}

function reload() {
  pagination.page = 1
  void load()
}

function resetFilters() {
  filters.status = ''
  filters.direction = ''
  filters.keyword = ''
  reload()
}

async function openDetail(planId: string) {
  drawerVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await api.get(`${API_BASE}/${planId}`)
  } finally {
    detailLoading.value = false
  }
}

onMounted(() => {
  void load()
})

// ==================== 展示辅助 ====================

function statusLabel(status: string) {
  const map: Record<string, string> = {
    ACTIVE: '进行中',
    MAINTENANCE: '维持期',
    PAUSED: '已暂停',
    COMPLETED: '已结束',
    CANCELLED: '已取消',
  }
  return map[status] || status
}

function statusTagType(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'primary',
    MAINTENANCE: 'success',
    PAUSED: 'warning',
    COMPLETED: 'info',
    CANCELLED: 'info',
  }
  return (map[status] || 'info') as any
}

function reasonLabel(reason: string) {
  const map: Record<string, string> = {
    RATE_TOO_SLOW: '减得偏慢，系统加大力度',
    RATE_TOO_FAST: '减得偏快，系统放缓力度',
    MANUAL: '顾客手动调整',
    GOAL_REACHED: '达标转维持期',
    MAINTENANCE_UNDERSHOOT: '维持期仍在掉重，热量上调',
    FLOOR_REACHED: '已到安全边界，不再调整',
  }
  return map[reason] || reason
}

function reasonTagType(reason: string) {
  if (reason === 'RATE_TOO_FAST' || reason === 'FLOOR_REACHED') return 'warning'
  if (reason === 'GOAL_REACHED') return 'success'
  return 'info'
}

function formatRate(rate: number | null) {
  if (rate === null || rate === undefined) return '—'
  const abs = Math.abs(rate).toFixed(1)
  if (Math.abs(rate) < 0.05) return '基本持平'
  return rate < 0 ? `−${abs}%/周` : `+${abs}%/周`
}

function rateClass(row: any) {
  const rate = row.lastRatePercentPerWeek
  if (rate === null || rate === undefined) return 'cell-muted'
  // 朝目标推进的速率：减重时掉重（负）才是好事
  const progress = row.direction === 'LOSS' ? -rate : rate
  if (progress < 0.5) return 'rate-slow'
  if (progress > 2) return 'rate-fast'
  return 'rate-normal'
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${formatDate(value)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.plan-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.filters-card {
  border: none;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2d3d;
}

.page-subtitle {
  margin-top: 6px;
  color: #6b7785;
  font-size: 13px;
  line-height: 1.6;
}

.filter-form {
  margin-top: 18px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.cell-main {
  color: #1f2d3d;
  font-size: 13px;
}

.cell-sub {
  margin-top: 2px;
  color: #9aa5b1;
  font-size: 12px;
}

.cell-muted {
  color: #9aa5b1;
}

.rate-normal {
  color: #1a7f37;
}

.rate-slow {
  color: #b8730b;
}

.rate-fast {
  color: #c05621;
}

.detail-section {
  margin-top: 22px;
}

.detail-section__title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
}

.adjust-item__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.adjust-item__energy {
  font-size: 13px;
  font-weight: 600;
  color: #1f2d3d;
}

.adjust-item__meta {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7785;
}

.adjust-item__note {
  margin-top: 6px;
  font-size: 12px;
  color: #9aa5b1;
  line-height: 1.6;
}
</style>
