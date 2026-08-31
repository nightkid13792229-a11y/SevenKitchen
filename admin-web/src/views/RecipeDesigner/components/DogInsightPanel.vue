<template>
  <div class="dog-insight-panel">
    <div v-if="loading" v-loading="true" class="panel-loading" />

    <template v-else-if="insight">
      <div class="panel-section dog-profile">
        <div class="section-title">
          <span>🐶 {{ insight.dog.name }} 的档案</span>
          <el-tag v-if="insight.dog.lifeStageLabel" size="small" effect="plain">
            {{ insight.dog.lifeStageLabel }}
          </el-tag>
        </div>
        <div class="profile-actions">
          <el-button size="small" text type="primary" @click="openDogPicker">更换</el-button>
        </div>
        <div class="profile-grid">
          <div class="profile-item">
            <span class="label">性别</span>
            <span class="value">{{ genderText }}</span>
          </div>
          <div class="profile-item">
            <span class="label">年龄</span>
            <span class="value">{{ ageText }}</span>
          </div>
          <div class="profile-item">
            <span class="label">绝育状态</span>
            <span class="value">{{ neuteredText }}</span>
          </div>
          <div class="profile-item">
            <span class="label">品种</span>
            <span class="value">{{ insight.dog.breedName || '未知' }}</span>
          </div>
          <div class="profile-item">
            <span class="label">体重</span>
            <span class="value">{{ insight.dog.currentWeightKg }} kg</span>
          </div>
          <div class="profile-item">
            <span class="label">体况评分</span>
            <span class="value">{{ bcsText }}</span>
          </div>
          <div class="profile-item">
            <span class="label">活动量</span>
            <span class="value">{{ activityText }}</span>
          </div>
          <div class="profile-item">
            <span class="label">每日餐数</span>
            <span class="value">{{ mealsText }}</span>
          </div>
          <div class="profile-item">
            <span class="label">零食摄入</span>
            <span class="value">{{ treatText }}</span>
          </div>
        </div>
        <div class="energy-card">
          <span class="energy-label">每日目标能量</span>
          <span class="energy-value">{{ energyText }}</span>
          <span v-if="energyPerDayG" class="energy-detail">≈ {{ energyPerDayG }} g/天</span>
        </div>
        <div class="profile-divider">饮食与健康</div>
        <div class="profile-grid">
          <div class="profile-item full">
            <span class="label">过敏食材</span>
            <span class="value" :class="{ empty: !insight.dog.allergyFoods }">
              {{ insight.dog.allergyFoods || '无记录' }}
            </span>
          </div>
          <div class="profile-item full">
            <span class="label">挑食</span>
            <span class="value" :class="{ empty: !insight.dog.pickyFoods }">
              {{ insight.dog.pickyFoods || '无记录' }}
            </span>
          </div>
          <div class="profile-item full">
            <span class="label">偏好食材</span>
            <span class="value" :class="{ empty: !insight.dog.preferredFoods }">
              {{ insight.dog.preferredFoods || '无记录' }}
            </span>
          </div>
          <div class="profile-item full">
            <span class="label">健康史</span>
            <span class="value" :class="{ empty: !insight.dog.medicalHistory }">
              {{ insight.dog.medicalHistory || '无记录' }}
            </span>
          </div>
        </div>
        <div class="notes-actions">
          <el-button size="small" text type="primary" @click="editingNotes = !editingNotes">
            {{ editingNotes ? '收起' : '编辑备注' }}
          </el-button>
        </div>
        <div v-if="editingNotes" class="notes-editor">
          <el-input
            v-model="notesForm.allergyFoods"
            type="textarea"
            :rows="2"
            placeholder="过敏食材（逗号分隔）"
          />
          <el-input
            v-model="notesForm.pickyFoods"
            type="textarea"
            :rows="2"
            placeholder="挑食记录"
          />
          <el-input
            v-model="notesForm.preferredFoods"
            type="textarea"
            :rows="2"
            placeholder="偏好食材"
          />
          <el-input
            v-model="notesForm.medicalHistory"
            type="textarea"
            :rows="2"
            placeholder="健康史 / 注意事项"
          />
          <div class="notes-actions">
            <el-button size="small" type="primary" :loading="savingNotes" @click="saveNotes">
              保存到爱犬档案
            </el-button>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="section-title">
          <span>🍽️ 最近 {{ recentDays }} 天吃过的食材（{{ recentEaten.length }} 种）</span>
          <el-tooltip content="该犬名下订单已进入冷冻/发货/完成的食谱中使用的食材（按标准原料统计，不含补剂）" placement="top">
            <el-icon class="ai-tip"><QuestionFilled /></el-icon>
          </el-tooltip>
          <el-select
            v-model="recentDays"
            size="small"
            class="recent-days-select"
            @change="handleRecentDaysChange"
          >
            <el-option v-for="d in RECENT_DAYS_OPTIONS" :key="d" :label="`${d} 天`" :value="d" />
          </el-select>
        </div>
        <div v-if="collisionCount > 0" class="collision-tip">
          <span class="collision-warning">⚠ 有 {{ collisionCount }} 种与当前配方重合，建议替换</span>
        </div>
        <div v-if="recentEaten.length === 0" class="empty-tip">
          最近 {{ recentDays }} 天暂无已下单的食谱食材
        </div>
        <div v-else class="ingredient-cloud">
          <el-tag
            v-for="row in recentEaten"
            :key="row.ingredientId"
            size="small"
            :type="collisionIds.has(row.ingredientId) ? 'danger' : 'success'"
            :effect="collisionIds.has(row.ingredientId) ? 'light' : 'plain'"
            class="ingredient-chip"
            :title="`最近 ${relativeTimeText(row.lastUsedAt)} 用过 ${row.count} 次`"
          >
            {{ row.name }}<span class="chip-count">×{{ row.count }}</span>
            <span class="chip-time">{{ relativeTimeText(row.lastUsedAt) }}</span>
          </el-tag>
        </div>
      </div>

      <div class="panel-section ai-section">
        <div class="section-title">
          <span>🤖 AI 设计建议</span>
          <el-tooltip content="基于爱犬档案与历史食材生成，仅供设计参考，最终以 FEDIAF 营养评估为准" placement="top">
            <el-icon class="ai-tip"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
        <template v-if="!insight.aiEnabled">
          <div class="empty-tip">AI 助手尚未配置，请联系管理员在「AI 服务配置」中启用</div>
        </template>
        <template v-else>
          <el-button
            v-if="!aiSuggestion"
            size="small"
            type="primary"
            plain
            :loading="aiLoading"
            :disabled="aiLoading"
            @click="requestAiSuggestions"
          >
            {{ aiLoading ? 'AI 分析中…' : '生成设计建议' }}
          </el-button>
          <div v-else class="ai-result">
            <div class="ai-summary">{{ aiSuggestion.summary }}</div>
            <div v-if="aiSuggestion.warnings.length" class="ai-warnings">
              <div v-for="(warning, index) in aiSuggestion.warnings" :key="index" class="ai-warning">
                ⚠️ {{ warning }}
              </div>
            </div>
            <div v-if="aiSuggestion.ingredientSuggestions.length" class="ai-block">
              <div class="ai-block-title">推荐食材</div>
              <div v-for="(item, index) in aiSuggestion.ingredientSuggestions" :key="index" class="ai-row">
                <span class="ai-name">{{ item.name }}</span>
                <span class="ai-reason">{{ item.reason }}</span>
              </div>
            </div>
            <div v-if="aiSuggestion.avoidIngredients.length" class="ai-block">
              <div class="ai-block-title avoid">避免食材</div>
              <div v-for="(item, index) in aiSuggestion.avoidIngredients" :key="index" class="ai-row">
                <span class="ai-name">{{ item.name }}</span>
                <span class="ai-reason">{{ item.reason }}</span>
              </div>
            </div>
            <div v-if="aiSuggestion.nutritionFocus.length" class="ai-block">
              <div class="ai-block-title">营养注意</div>
              <div v-for="(item, index) in aiSuggestion.nutritionFocus" :key="index" class="ai-row">
                <span class="ai-name">{{ item.point }}</span>
                <span class="ai-reason">{{ item.reason }}</span>
              </div>
            </div>
            <div v-if="aiSuggestion.supplementSuggestions.length" class="ai-block">
              <div class="ai-block-title">补剂建议</div>
              <div v-for="(item, index) in aiSuggestion.supplementSuggestions" :key="index" class="ai-row">
                <span class="ai-name">{{ item.name }}</span>
                <span class="ai-reason">{{ item.reason }}</span>
              </div>
            </div>
            <div v-if="aiSuggestion.reuseSuggestions.length" class="ai-block">
              <div class="ai-block-title">可沿用既往食材</div>
              <div v-for="(item, index) in aiSuggestion.reuseSuggestions" :key="index" class="ai-row">
                <span class="ai-name">{{ item.name }}</span>
                <span class="ai-reason">{{ item.reason }}</span>
              </div>
            </div>
            <div class="ai-footer">
              <el-button size="small" text type="primary" @click="aiSuggestion = null">重新生成</el-button>
            </div>
          </div>
        </template>
      </div>
    </template>

    <div v-else class="empty-tip">
      <div>该系列未设置参考爱犬</div>
      <el-button size="small" type="primary" plain @click="openDogPicker">选择参考爱犬</el-button>
    </div>

    <el-dialog v-model="dogPickerVisible" title="设置参考爱犬" width="480px" append-to-body>
      <el-select
        v-model="dogPickerId"
        filterable
        remote
        clearable
        placeholder="选择一位客户的爱犬；清空并保存即解除关联"
        :remote-method="searchDogs"
        :loading="dogLoading"
        style="width: 100%"
      >
        <el-option v-for="dog in dogOptions" :key="dog.id" :label="dogLabel(dog)" :value="dog.id" />
      </el-select>
      <div class="form-tip">参考爱犬仅作为设计参考：其档案与历史食材会在本面板展示，AI 设计建议也会结合该犬档案生成；正式食谱发布后与犬解耦，不影响其他犬使用</div>
      <template #footer>
        <el-button @click="dogPickerVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingDog" @click="saveDog">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import { dogApi } from '@/api/dogs'
import {
  ActivityLevelLabels,
  DogGenderLabels,
  TreatInputMode,
  TreatLevel,
  TreatLevelLabels,
  type DogProfile
} from '@/types/dog'
import type { AiDesignSuggestion, DogDesignInsight, UpdateDogDesignNotesPayload } from '@/types/recipeDesigner'

const props = defineProps<{
  dogId?: string | null
  draftId?: string
  seriesId?: string
  /** 当前配方能量密度（kcal/kg），用于把每日目标能量换算成饭量克数 */
  energyDensityKcalPerKg?: number | null
  /** 当前配方已使用的标准原料 ID（食材类），用于与历史食材对比提醒 */
  currentIngredientIds?: string[]
}>()

const emit = defineEmits<{
  (e: 'dog-changed', dogId: string | null): void
}>()

const loading = ref(false)
const insight = ref<DogDesignInsight | null>(null)
const editingNotes = ref(false)
const savingNotes = ref(false)
const notesForm = reactive<UpdateDogDesignNotesPayload>({})

const aiLoading = ref(false)
const aiSuggestion = ref<AiDesignSuggestion | null>(null)

/* ---------- 设计档案展示辅助 ---------- */

const genderText = computed(() => {
  const gender = insight.value?.dog.gender
  if (!gender) return '未填写'
  return DogGenderLabels[gender as keyof typeof DogGenderLabels] ?? gender
})

const ageText = computed(() => {
  const months = insight.value?.dog.ageMonths
  if (months == null) return '未填写'
  if (months < 12) return `${months} 个月`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest > 0 ? `${years} 岁 ${rest} 个月` : `${years} 岁`
})

const neuteredText = computed(() => {
  const value = insight.value?.dog.isNeutered
  if (value == null) return '未填写'
  return value ? '已绝育' : '未绝育'
})

const bcsText = computed(() => {
  const score = insight.value?.dog.bcsScore
  if (score == null || score <= 0) return '未评估'
  const category = score <= 3 ? '偏瘦' : score >= 6 ? '偏胖' : '标准'
  return `${score}/9 ${category}`
})

const activityText = computed(() => {
  const level = insight.value?.dog.activityLevel
  if (!level) return '未填写'
  return ActivityLevelLabels[level as keyof typeof ActivityLevelLabels] ?? level
})

const mealsText = computed(() => {
  const meals = insight.value?.dog.mealsPerDay
  if (meals == null || meals <= 0) return '未填写'
  return `${meals} 顿`
})

const treatText = computed(() => {
  const dog = insight.value?.dog
  if (!dog) return '未填写'
  if (dog.treatInputMode === TreatInputMode.EXACT_KCAL && dog.manualTreatKcal != null) {
    return `每日 ${Math.round(dog.manualTreatKcal)} kcal`
  }
  if (dog.treatLevel && dog.treatLevel !== TreatLevel.NONE) {
    return TreatLevelLabels[dog.treatLevel as keyof typeof TreatLevelLabels] ?? dog.treatLevel
  }
  if (dog.treatLevel === TreatLevel.NONE) return '不喂零食'
  return '未填写'
})

const energyText = computed(() => {
  const kcal = insight.value?.dog.targetFoodKcal
  if (kcal == null || kcal <= 0) return '未填写'
  return `约 ${Math.round(kcal)} kcal/天`
})

/** 每日饭量估算（按当前配方能量密度换算） */
const energyPerDayG = computed(() => {
  const kcal = insight.value?.dog.targetFoodKcal
  const density = props.energyDensityKcalPerKg
  if (kcal == null || kcal <= 0 || density == null || density <= 0) return null
  return String(Math.round((kcal / density) * 1000))
})

/* ---------- 最近吃过的食材 ---------- */

/** 时间窗口可选档位（天） */
const RECENT_DAYS_OPTIONS = [30, 60, 90, 180] as const

/** 当前选中的时间窗口（天），默认 90 */
const recentDays = ref<number>(90)

function handleRecentDaysChange() {
  void loadInsight()
}

const recentEaten = computed(
  () => insight.value?.designHistory.recentEatenIngredients ?? []
)

/** 当前配方使用的标准原料 ID 集合 */
const currentIngredientIdSet = computed(
  () => new Set(props.currentIngredientIds ?? [])
)

const collisionIds = computed(
  () =>
    new Set(
      recentEaten.value
        .filter((row) => currentIngredientIdSet.value.has(row.ingredientId))
        .map((row) => row.ingredientId)
    )
)

const collisionCount = computed(() => collisionIds.value.size)

/** ISO 时间 → 相对时间文案（X 天前 / X 个月前） */
function relativeTimeText(iso: string | null): string {
  if (!iso) return '未知时间'
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return '未知时间'
  const days = Math.floor((Date.now() - then.getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return '今天'
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  return `${months} 个月前`
}

// 参考爱犬选择器
const dogPickerVisible = ref(false)
const dogPickerId = ref<string | null>(null)
const dogOptions = ref<DogProfile[]>([])
const dogLoading = ref(false)
const savingDog = ref(false)

/** 重名狗狗的区分：姓名 + 品种 + 性别 + 体重 + 年龄 */
function dogLabel(dog: DogProfile): string {
  const parts: string[] = [dog.name || '未命名']
  const breed = dog.breedName || dog.customBreedName
  if (breed) parts.push(breed)
  if (dog.gender) parts.push(DogGenderLabels[dog.gender])
  if (dog.currentWeightKg) parts.push(`${dog.currentWeightKg}kg`)
  const ageText = dogAgeText(dog.birthday)
  if (ageText) parts.push(ageText)
  return parts.filter(Boolean).join(' · ')
}

/** 从出生日期计算年龄文本（岁/月） */
function dogAgeText(birthday?: string): string {
  if (!birthday) return ''
  const birth = new Date(birthday)
  const now = new Date()
  if (Number.isNaN(birth.getTime()) || birth > now) return ''
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  if (months < 0) return ''
  if (months < 12) return `${months} 个月`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return remMonths ? `${years} 岁 ${remMonths} 个月` : `${years} 岁`
}

async function searchDogs(keyword: string) {
  dogLoading.value = true
  try {
    const res = await dogApi.list({ search: keyword, pageSize: 50 })
    dogOptions.value = ((res as unknown as { data: DogProfile[] }).data ?? res ?? []) as DogProfile[]
  } catch {
    dogOptions.value = []
  } finally {
    dogLoading.value = false
  }
}

function openDogPicker() {
  dogPickerId.value = props.dogId ?? null
  dogPickerVisible.value = true
  searchDogs('')
}

async function saveDog() {
  if (!props.seriesId) {
    ElMessage.warning('缺少系列信息，无法设置参考爱犬')
    return
  }
  savingDog.value = true
  try {
    await recipeDesignerApi.setReferenceDog(props.seriesId, dogPickerId.value ?? null)
    ElMessage.success('参考爱犬已更新')
    dogPickerVisible.value = false
    emit('dog-changed', dogPickerId.value ?? null)
  } finally {
    savingDog.value = false
  }
}

async function loadInsight() {
  if (!props.dogId) {
    insight.value = null
    return
  }
  loading.value = true
  try {
    insight.value = await recipeDesignerApi.getDogDesignInsight(
      props.dogId,
      recentDays.value
    )
    notesForm.allergyFoods = insight.value.dog.allergyFoods ?? ''
    notesForm.pickyFoods = insight.value.dog.pickyFoods ?? ''
    notesForm.preferredFoods = insight.value.dog.preferredFoods ?? ''
    notesForm.medicalHistory = insight.value.dog.medicalHistory ?? ''
  } catch {
    insight.value = null
  } finally {
    loading.value = false
  }
}

async function saveNotes() {
  if (!props.dogId) return
  savingNotes.value = true
  try {
    const payload: UpdateDogDesignNotesPayload = {}
    if (notesForm.allergyFoods !== undefined) payload.allergyFoods = notesForm.allergyFoods?.trim() || null
    if (notesForm.pickyFoods !== undefined) payload.pickyFoods = notesForm.pickyFoods?.trim() || null
    if (notesForm.preferredFoods !== undefined) payload.preferredFoods = notesForm.preferredFoods?.trim() || null
    if (notesForm.medicalHistory !== undefined) payload.medicalHistory = notesForm.medicalHistory?.trim() || null
    await recipeDesignerApi.updateDogDesignNotes(props.dogId, payload)
    ElMessage.success('备注已保存到爱犬档案')
    editingNotes.value = false
    await loadInsight()
  } finally {
    savingNotes.value = false
  }
}

async function requestAiSuggestions() {
  if (!props.dogId) return
  aiLoading.value = true
  try {
    aiSuggestion.value = await recipeDesignerApi.generateAiSuggestions(props.dogId, props.draftId)
  } catch {
    aiSuggestion.value = null
  } finally {
    aiLoading.value = false
  }
}

watch(
  () => props.dogId,
  () => {
    aiSuggestion.value = null
    loadInsight()
  },
  { immediate: true }
)

defineExpose({ loadInsight })
</script>

<style scoped>
.dog-insight-panel {
  min-height: 80px;
}
.panel-loading {
  min-height: 80px;
}
.panel-section {
  padding: 12px 0;
  border-bottom: 1px dashed #ebeef5;
}
.panel-section:last-child {
  border-bottom: none;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 10px;
  color: #303133;
}
.ai-tip {
  color: #c0c4cc;
  cursor: help;
}
/* 「更换」按钮：位于狗狗姓名下方 */
.profile-actions {
  margin: -4px 0 2px;
  display: flex;
  justify-content: flex-start;
}
.profile-actions .el-button {
  padding: 0;
  height: auto;
}
.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}
.profile-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.profile-item.full {
  grid-column: 1 / -1;
}
.profile-item .label {
  font-size: 11px;
  color: #909399;
}
.profile-item .value {
  font-size: 13px;
  color: #303133;
  word-break: break-all;
  white-space: pre-wrap;
}
.profile-item .value.empty {
  color: #c0c4cc;
}
/* 每日目标能量卡片 */
.energy-card {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 10px;
  background: #ecf5ff;
  border-radius: 6px;
  padding: 8px 10px;
}
.energy-label {
  font-size: 11px;
  color: #409eff;
  flex-shrink: 0;
}
.energy-value {
  font-size: 14px;
  font-weight: 700;
  color: #303133;
}
.energy-detail {
  font-size: 12px;
  color: #909399;
}
/* 饮食与健康分隔 */
.profile-divider {
  margin-top: 12px;
  padding-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #909399;
  border-bottom: 1px dashed #ebeef5;
}
.profile-divider + .profile-grid {
  margin-top: 8px;
}
.notes-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.notes-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.empty-tip {
  font-size: 12px;
  color: #909399;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
  line-height: 1.6;
}
.ingredient-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ingredient-chip .chip-count {
  opacity: 0.7;
  margin-left: 2px;
}
.ingredient-chip .chip-time {
  margin-left: 5px;
  font-size: 10px;
  opacity: 0.6;
}
/* 与当前配方重合提醒 */
.collision-tip {
  margin-bottom: 8px;
}
.collision-warning {
  font-size: 12px;
  font-weight: 600;
  color: #f56c6c;
}
.recent-days-select {
  margin-left: auto;
  width: 88px;
  flex-shrink: 0;
}
.ai-result {
  font-size: 12px;
}
.ai-summary {
  background: #f0f9eb;
  border-radius: 6px;
  padding: 8px 10px;
  color: #529b2e;
  margin-bottom: 8px;
}
.ai-warnings {
  margin-bottom: 8px;
}
.ai-warning {
  color: #e6a23c;
  font-size: 12px;
  padding: 2px 0;
}
.ai-block {
  margin-bottom: 8px;
}
.ai-block-title {
  font-weight: 600;
  color: #409eff;
  margin-bottom: 4px;
}
.ai-block-title.avoid {
  color: #f56c6c;
}
.ai-row {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}
.ai-name {
  flex-shrink: 0;
  font-weight: 500;
}
.ai-reason {
  color: #606266;
}
.ai-footer {
  text-align: right;
}
</style>
