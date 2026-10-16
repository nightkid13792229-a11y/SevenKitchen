<template>
  <div class="schedule-calendar">
    <div class="page-header">
      <h1>排期日历</h1>
      <div class="header-actions">
        <el-button @click="monthOffset -= 1">上个月</el-button>
        <span class="month-label">{{ monthLabel }}</span>
        <el-button @click="monthOffset += 1">下个月</el-button>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="isDefaultRules"
      type="warning"
      :closable="false"
      show-icon
      title="按星期的规则还没设置过"
      description="现在七天都按全局配置开放。设成你想要的样子（比如周日休息）后点保存 —— 这样以后每个周日都自动休息，不用一天一天关。"
      class="tip"
    />

    <!--
      按星期的规则。
      「接单」与「交付」是两套容量 —— 收钱和交货对一个人来说是两件事：
      一天能收 4 单不等于一天能交出 4 份。
    -->
    <el-card shadow="never" class="rules-card">
      <template #header>
        <div class="card-header">
          <span>每周规则</span>
          <el-button
            type="primary"
            size="small"
            :loading="saving"
            @click="saveRules"
          >
            保存
          </el-button>
        </div>
      </template>

      <el-table :data="rules" size="small" border>
        <el-table-column label="星期" width="90">
          <template #default="{ row }">{{ weekdayLabel(row.weekday) }}</template>
        </el-table-column>
        <el-table-column label="接单" width="110">
          <template #default="{ row }">
            <el-switch v-model="row.isOpen" />
          </template>
        </el-table-column>
        <el-table-column label="每天最多接几单" width="180">
          <template #default="{ row }">
            <el-input-number
              v-model="row.capacity"
              :min="1"
              :max="200"
              :disabled="!row.isOpen"
              size="small"
              controls-position="right"
              style="width: 120px"
            />
          </template>
        </el-table-column>
        <el-table-column label="每天最多交几份" width="180">
          <template #default="{ row }">
            <el-input-number
              v-model="row.deliveryCapacity"
              :min="1"
              :max="200"
              :disabled="!row.isOpen"
              size="small"
              controls-position="right"
              style="width: 120px"
            />
          </template>
        </el-table-column>
        <el-table-column label="备注">
          <template #default="{ row }">
            <el-input
              v-model="row.note"
              size="small"
              maxlength="100"
              placeholder="例如：例休"
            />
          </template>
        </el-table-column>
      </el-table>

      <div class="rules-hint">
        留空表示用「食谱定制设置」里的全局值。
        <strong>交付上限低于接单上限时，多接的单会交不出来</strong>
        —— 建议交付上限不小于接单上限。
      </div>
    </el-card>

    <!--
      月历。
      每一天能不能约、为什么不能约，**全部由后端算好**
      （三层优先级：具体某天 > 按星期规则 > 全局配置）——
      这一页不自己判断，也不重算剩余量。
    -->
    <el-card shadow="never" class="month-card">
      <template #header>
        <div class="card-header">
          <span>每天的情况</span>
          <div class="legend">
            <span class="legend-item"><i class="dot open" />可约</span>
            <span class="legend-item"><i class="dot closed" />不可约</span>
            <span class="legend-item"><i class="dot override" />单独设过</span>
          </div>
        </div>
      </template>

      <div class="weekday-row">
        <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
      </div>

      <div class="day-grid">
        <div
          v-for="cell in calendarCells"
          :key="cell.key"
          class="day-cell"
          :class="{
            'is-empty': !cell.day,
            'is-open': cell.day?.isOpen,
            'is-closed': cell.day && !cell.day.isOpen,
            'is-override': cell.day?.source === 'override',
          }"
          @click="cell.day && openDayDetail(cell.day)"
        >
          <template v-if="cell.day">
            <span class="day-number">{{ dayNumber(cell.day.date) }}</span>
            <span class="day-info">
              {{ cell.day.isOpen ? `剩 ${cell.day.remaining} 单` : '休息' }}
            </span>
          </template>
        </div>
      </div>
    </el-card>

    <!-- 某一天的详情：为什么不能约、这一天的设置是哪来的 -->
    <el-dialog v-model="detailVisible" :title="detailTitle" width="460px">
      <template v-if="activeDay">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="能不能约">
            <el-tag :type="activeDay.isOpen ? 'success' : 'info'">
              {{ activeDay.isOpen ? '可约' : '不可约' }}
            </el-tag>
            <span v-if="activeDay.closedReason" class="reason">
              {{ activeDay.closedReason }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="接单">
            {{ activeDay.bookedCount }} / {{ activeDay.capacity }}
            （剩 {{ activeDay.remaining }}）
          </el-descriptions-item>
          <el-descriptions-item label="交付">
            {{ activeDay.deliveryCount }} / {{ activeDay.deliveryCapacity }}
            （剩 {{ activeDay.deliveryRemaining }}）
          </el-descriptions-item>
          <el-descriptions-item label="这一天的设置来自">
            {{ sourceLabel(activeDay.source) }}
          </el-descriptions-item>
        </el-descriptions>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  customRecipeApi,
  type ResolvedDay,
  type WeekdayRule,
} from '@/api/customRecipe';
import { getApiErrorMessage, toastApiError } from '@/utils/apiError';

/**
 * 排期日历（2026-10-16，批次 4.2）
 *
 * ## 这一页不判断"能不能约"
 *
 * 三层优先级（具体某天 > 按星期规则 > 全局配置）与
 * 接单/交付两套容量的判定全部在后端领域层。
 * 前端只负责画 —— 因为它自己算一遍就会出现两套口径，
 * 而"某一天到底能不能约"这种错，顾客会比你先发现。
 */

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const loading = ref(false);
const saving = ref(false);
const monthOffset = ref(0);
const days = ref<ResolvedDay[]>([]);
const rules = ref<WeekdayRule[]>([]);
const isDefaultRules = ref(false);

const detailVisible = ref(false);
const activeDay = ref<ResolvedDay | null>(null);

const monthStart = computed(() => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + monthOffset.value, 1);
});

const monthLabel = computed(
  () => `${monthStart.value.getFullYear()} 年 ${monthStart.value.getMonth() + 1} 月`,
);

const detailTitle = computed(() =>
  activeDay.value ? `${activeDay.value.date} 的安排` : '安排',
);

const weekdayLabel = (weekday: number) => WEEKDAY_LABELS[weekday] ?? '';

/** 来源 → 人话 */
const sourceLabel = (source: string) => {
  switch (source) {
    case 'override':
      return '单独设过这一天';
    case 'weekday':
      return '按星期的规则';
    default:
      return '全局配置（没单独设过）';
  }
};

const dayNumber = (date: string) => Number(date.slice(-2));

/**
 * 月历格子：前面补空格让 1 号落在正确的星期几上。
 *
 * 这是**纯排版**（把日期摆进星期网格），不含任何业务判断。
 */
const calendarCells = computed(() => {
  const cells: Array<{ key: string; day: ResolvedDay | null }> = [];
  const byDate = new Map(days.value.map((d) => [d.date, d]));

  const first = monthStart.value;
  const leading = first.getDay();
  for (let i = 0; i < leading; i += 1) {
    cells.push({ key: `empty-${i}`, day: null });
  }

  const daysInMonth = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();
  for (let d = 1; d <= daysInMonth; d += 1) {
    const key = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ key, day: byDate.get(key) ?? null });
  }

  return cells;
});

const load = async () => {
  loading.value = true;
  try {
    const from = `${monthStart.value.getFullYear()}-${String(monthStart.value.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(
      monthStart.value.getFullYear(),
      monthStart.value.getMonth() + 1,
      0,
    ).getDate();
    const to = `${monthStart.value.getFullYear()}-${String(monthStart.value.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [calendar, ruleData] = await Promise.all([
      customRecipeApi.getCalendar(from, to),
      customRecipeApi.getWeekdayRules(),
    ]);

    days.value = calendar?.days ?? [];
    rules.value = (ruleData?.items ?? []).map((item) => ({ ...item }));
    isDefaultRules.value = Boolean(ruleData?.isDefault);
  } catch (error) {
    toastApiError(error, '加载排期失败', ElMessage);
  } finally {
    loading.value = false;
  }
};

const saveRules = async () => {
  saving.value = true;
  try {
    await customRecipeApi.saveWeekdayRules(
      rules.value.map((rule) => ({
        weekday: rule.weekday,
        isOpen: rule.isOpen,
        capacity: rule.capacity ?? null,
        deliveryCapacity: rule.deliveryCapacity ?? null,
        note: rule.note ?? null,
      })),
    );
    ElMessage.success('已保存，之后的排期会按这个规则算');
    await load();
  } catch (error) {
    // 后端会说清原因（比如"周日的接单上限必须是 1~200 的整数"）
    ElMessage.error(getApiErrorMessage(error, '保存失败'));
  } finally {
    saving.value = false;
  }
};

const openDayDetail = (day: ResolvedDay) => {
  activeDay.value = day;
  detailVisible.value = true;
};

watch(monthOffset, load);
onMounted(load);
</script>

<style scoped>
.schedule-calendar {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.page-header h1 {
  margin: 0;
  font-size: 20px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.month-label {
  font-weight: 600;
  min-width: 120px;
  text-align: center;
}

.tip {
  margin-bottom: 16px;
}

.rules-card {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.rules-hint {
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.legend {
  display: flex;
  gap: 16px;
  font-size: 13px;
  font-weight: 400;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.dot.open {
  background: var(--el-color-success);
}

.dot.closed {
  background: var(--el-color-info-light-5);
}

.dot.override {
  background: var(--el-color-warning);
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.day-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
}

.day-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 64px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: transform 0.1s;
}

.day-cell:hover:not(.is-empty) {
  transform: scale(1.04);
}

.day-cell.is-empty {
  border: none;
  cursor: default;
}

.day-cell.is-open {
  background: var(--el-color-success-light-9);
  border-color: var(--el-color-success-light-5);
}

.day-cell.is-closed {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-placeholder);
}

/* 单独设过的日子用橙色边框标出来 —— 与"按规则算的"区分开 */
.day-cell.is-override {
  border-color: var(--el-color-warning);
  border-width: 2px;
}

.day-number {
  font-size: 15px;
  font-weight: 600;
}

.day-info {
  font-size: 11px;
}

.reason {
  margin-left: 8px;
  font-size: 13px;
  color: var(--el-color-info);
}
</style>
