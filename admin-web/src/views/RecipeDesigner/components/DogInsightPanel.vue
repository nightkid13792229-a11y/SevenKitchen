<template>
  <div class="dog-insight-panel">
    <div v-if="loading" v-loading="true" class="panel-loading" />

    <template v-else-if="insight">
      <!--
        只陈述档案 / 订单 / 健康记录里的事实。
        这里不判断过敏可信度、不提示配方里是否含某过敏原、不给替换建议。
      -->
      <div class="panel-section dog-profile">
        <div class="section-title">
          <span>🐶 {{ insight.dog.name }}</span>
          <el-tag v-if="insight.dog.lifeStageLabel" size="small" effect="plain">
            {{ insight.dog.lifeStageLabel }}
          </el-tag>
        </div>
        <div class="dog-summary">{{ profileSummary }}</div>
        <div class="dog-header-meta">
          <span v-if="insight.customRecipeOrder" class="dog-order-no">
            本单 {{ insight.customRecipeOrder.orderId }}
          </span>
          <el-button
            v-if="!lockReferenceDog"
            size="small"
            text
            type="primary"
            @click="openDogPicker"
          >
            更换参考爱犬
          </el-button>
          <span v-else class="dog-lock-tip">本单已绑定该犬，不能更换</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="section-title">主蛋白</div>
        <div class="fact-primary">{{ proteinText }}</div>
      </div>

      <div class="panel-section">
        <div class="section-title">本单需求</div>
        <template v-if="insight.customRecipeOrder">
          <div class="fact-row fact-row--stacked">
            <span class="fact-label">肠胃情况</span>
            <span class="fact-value">{{ stomachText }}</span>
          </div>
          <div v-if="currentFoodText" class="fact-row fact-row--stacked fact-row--secondary">
            <span class="fact-label">现在主要喂</span>
            <span class="fact-value">{{ currentFoodText }}</span>
          </div>
          <div v-if="changeReasonText" class="fact-row fact-row--stacked fact-row--secondary">
            <span class="fact-label">定制原因</span>
            <span class="fact-value">{{ changeReasonText }}</span>
          </div>
        </template>
        <div v-else class="empty-tip">暂无本单定制需求</div>
      </div>

      <div class="panel-section">
        <div class="section-title">过敏信息</div>
        <div v-if="allergyFacts.allergens.length" class="allergy-list">
          <el-tag
            v-for="item in allergyFacts.allergens"
            :key="item.text"
            size="small"
            effect="plain"
            class="allergy-chip"
          >
            {{ item.text }}
            <span class="allergy-chip__source">{{ sourceLabel(item.sources) }}</span>
          </el-tag>
        </div>
        <div v-if="orderAllergyTextExtra" class="fact-row">
          <span class="fact-label">本单填写</span>
          <span class="fact-value fact-value--block">{{ orderAllergyTextExtra }}</span>
        </div>
        <div v-if="!allergyFacts.hasAny" class="empty-tip">无过敏记录</div>
      </div>

      <div v-if="insight.customRecipeOrder" class="panel-section">
        <div class="section-title">顾客额外备注</div>
        <div class="fact-value fact-value--block">{{ additionalNotes || '无' }}</div>
        <div v-if="orderAttachments.length" class="order-attachments">
          <span class="fact-label">顾客随单附件</span>
          <div class="attachment-links">
            <button
              v-for="(url, index) in orderAttachments"
              :key="url"
              type="button"
              class="attachment-link"
              @click="openAttachment(url, `顾客附件 ${index + 1}`)"
            >
              附件 {{ index + 1 }}
            </button>
          </div>
        </div>
      </div>

      <div class="panel-section panel-section--collapse">
        <el-collapse v-model="openSections">
          <el-collapse-item name="health" title="就诊 / 体检">
            <div v-if="!healthFacts.hasAny" class="empty-tip">暂无就诊 / 体检记录</div>
            <div v-if="healthFacts.medical" class="record-block">
              <div class="record-head">
                <span class="record-title">最近就诊</span>
                <span class="record-date">{{ healthFacts.medical.date }}</span>
              </div>
              <div class="record-line">诊断：{{ healthFacts.medical.diagnosis }}</div>
              <div v-if="healthFacts.medical.attachments.length" class="attachment-links">
                <button
                  v-for="(url, index) in healthFacts.medical.attachments"
                  :key="url"
                  type="button"
                  class="attachment-link"
                  @click="openAttachment(url, `就诊附件 ${index + 1}`)"
                >
                  查看就诊附件 {{ index + 1 }}
                </button>
              </div>
            </div>
            <div v-if="healthFacts.checkup" class="record-block">
              <div class="record-head">
                <span class="record-title">最近体检</span>
                <span class="record-date">{{ healthFacts.checkup.date }}</span>
              </div>
              <div class="record-line">结论：{{ healthFacts.checkup.findings }}</div>
              <div v-if="healthFacts.checkup.attachments.length" class="attachment-links">
                <button
                  v-for="(url, index) in healthFacts.checkup.attachments"
                  :key="url"
                  type="button"
                  class="attachment-link"
                  @click="openAttachment(url, `体检附件 ${index + 1}`)"
                >
                  查看体检附件 {{ index + 1 }}
                </button>
              </div>
            </div>
          </el-collapse-item>

          <el-collapse-item name="profile" title="基础档案">
            <div class="profile-grid">
              <div class="profile-item">
                <span class="label">绝育状态</span>
                <span class="value">{{ neuteredText }}</span>
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
          </el-collapse-item>

          <el-collapse-item
            name="history"
            :title="`历史订单食谱（${historyRecipes.length}）`"
          >
            <div v-if="historyRecipes.length === 0" class="empty-tip">
              暂无历史订单食谱
            </div>
            <div v-else class="history-recipe-list">
              <div
                v-for="item in historyRecipes"
                :key="`${item.kind}-${item.id}`"
                class="history-recipe-row history-recipe-row--clickable"
                @click="openHistoryRecipe(item)"
              >
                <div class="history-recipe-name">{{ item.name }}</div>
                <div class="history-recipe-meta">
                  <el-tag size="small" effect="plain">{{ historyKindLabel(item.kind) }}</el-tag>
                  <span>{{ formatInsightDate(item.date) || '日期未知' }}</span>
                </div>
              </div>
            </div>
          </el-collapse-item>

          <el-collapse-item
            name="recent"
            :title="`最近 ${recentDays} 天吃过的食材（${recentEaten.length} 种）`"
          >
            <div class="recent-toolbar">
              <el-tooltip
                content="该犬名下订单已进入冷冻/发货/完成的食谱中使用的食材（按标准原料统计，不含补剂）"
                placement="top"
              >
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
            <div v-if="recentEaten.length === 0" class="empty-tip">
              最近 {{ recentDays }} 天暂无已下单的食谱食材
            </div>
            <div v-else class="ingredient-cloud">
              <el-tag
                v-for="row in recentEaten"
                :key="row.ingredientId"
                size="small"
                effect="plain"
                class="ingredient-chip"
                :title="`最近 ${relativeTimeText(row.lastUsedAt)} 用过 ${row.count} 次`"
              >
                {{ row.name }}<span class="chip-count">×{{ row.count }}</span>
                <span class="chip-time">{{ relativeTimeText(row.lastUsedAt) }}</span>
              </el-tag>
            </div>
          </el-collapse-item>
        </el-collapse>
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
    <el-dialog
      v-model="historyDialogVisible"
      :title="historySelection?.name || '历史食谱'"
      width="720px"
      append-to-body
      destroy-on-close
    >
      <template v-if="historySelection">
        <div class="history-dialog-meta">
          <el-tag size="small" effect="plain">{{ historyKindLabel(historySelection.kind) }}</el-tag>
          <span>{{ formatInsightDate(historySelection.date) || '日期未知' }}</span>
        </div>
        <div class="history-dialog-grid">
          <div>
            <h4>原料清单</h4>
            <div v-if="historySelection.ingredients.length === 0" class="empty-tip">暂无原料明细</div>
            <ul v-else class="history-ingredient-list">
              <li v-for="item in historySelection.ingredients" :key="`${item.name}-${item.amount}`">
                <span>{{ item.name }}</span>
                <span>{{ item.amount }}</span>
              </li>
            </ul>
          </div>
          <div>
            <h4>宏量营养素</h4>
            <div v-if="historySelection.macros.length === 0" class="empty-tip">暂无宏量营养数据</div>
            <table v-else class="history-macro-table">
              <thead>
                <tr>
                  <th>项目</th>
                  <th>占干物质</th>
                  <th>占热量</th>
                  <th>占配方</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in historySelection.macros" :key="row.name">
                  <td>{{ row.name }}</td>
                  <td>{{ row.dryMatter }}</td>
                  <td>{{ row.energyPercent }}</td>
                  <td>{{ row.weightPercent }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="attachmentDialogVisible"
      :title="attachmentTitle"
      width="860px"
      append-to-body
      destroy-on-close
      class="attachment-preview-dialog"
    >
      <div class="attachment-preview-body">
        <el-image
          v-if="attachmentKind === 'image'"
          :src="attachmentUrl"
          :preview-src-list="[attachmentUrl]"
          fit="contain"
          class="attachment-preview-image"
        />
        <iframe
          v-else-if="attachmentKind === 'pdf'"
          :src="attachmentUrl"
          class="attachment-preview-pdf"
          title="附件预览"
        />
        <div v-else class="attachment-preview-fallback">
          <p>该文件类型暂不支持内嵌预览。</p>
          <el-button type="primary" plain tag="a" :href="attachmentUrl" target="_blank" rel="noopener noreferrer">
            在新窗口打开
          </el-button>
        </div>
      </div>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import { useOptionSet } from '@/composables/useOptionSet'
import { dogApi } from '@/api/dogs'
import {
  ActivityLevelLabels,
  DogGenderLabels,
  TreatInputMode,
  TreatLevel,
  TreatLevelLabels,
  type DogProfile
} from '@/types/dog'
import type { DogDesignInsight } from '@/types/recipeDesigner'
import {
  buildAllergyFacts,
  buildLatestHealthFacts,
  formatAllergySources,
  formatInsightDate,
  formatRequestedProteins,
  type AllergyFactSource,
} from '@/utils/recipeDesigner/dogInsight'

const props = defineProps<{
  dogId?: string | null
  draftId?: string
  seriesId?: string
  lockReferenceDog?: boolean
  /** 当前配方能量密度（kcal/kg），用于把每日目标能量换算成饭量克数 */
  energyDensityKcalPerKg?: number | null
}>()

const emit = defineEmits<{
  (e: 'dog-changed', dogId: string | null): void
}>()

const loading = ref(false)
const insight = ref<DogDesignInsight | null>(null)

/* ---------- 本单需求：中文只从选项字典取 ---------- */

const { ensure: ensureCurrentFoodOptions, labelOf: currentFoodLabel } =
  useOptionSet('custom_recipe_current_food')
const { ensure: ensureChangeReasonOptions, labelOf: changeReasonLabel } =
  useOptionSet('custom_recipe_change_reason')
const { ensure: ensureStomachOptions, labelOf: stomachLabel } =
  useOptionSet('custom_recipe_stomach')

/** 主蛋白：顾客选了就显示选的，没选就是由营养师搭配 */
const proteinText = computed(() =>
  formatRequestedProteins(insight.value?.customRecipeOrder?.requestedProteinCodes)
)
const profileSummary = computed(() =>
  [
    insight.value?.dog.breedName || '未知品种',
    genderText.value,
    ageText.value,
    weightText.value,
    bcsText.value,
  ]
    .filter(Boolean)
    .join(' · ')
)

const orderAttachments = computed(() =>
  Array.from(
    new Set(
      (insight.value?.customRecipeOrder?.attachments || [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  )
)

const stomachText = computed(() => {
  const codes = insight.value?.customRecipeOrder?.stomachConditions || []
  const other = String(insight.value?.customRecipeOrder?.stomachOther || '').trim()
  if (codes.length === 0 && !other) return '无'
  return `${codes.map((code) => stomachLabel(code) || code).join('、')}${
    other ? `（${other}）` : ''
  }`
})

/** 只有订单里真的填了才显示；没有就整行不出现 */
const currentFoodText = computed(() => {
  const order = insight.value?.customRecipeOrder
  if (!order) return ''
  const code = order.currentFoodMain
  const other = String(order.currentFoodOther || '').trim()
  if (!code && !other) return ''
  const label = code ? currentFoodLabel(code) || code : ''
  if (label && other) return `${label}（${other}）`
  return label || other
})

/** 只有订单里真的填了才显示；没有就整行不出现 */
const changeReasonText = computed(() => {
  const order = insight.value?.customRecipeOrder
  if (!order) return ''
  const codes = order.changeReasons || []
  const other = String(order.changeReasonOther || '').trim()
  if (codes.length === 0 && !other) return ''
  return `${codes.map((code) => changeReasonLabel(code) || code).join('、')}${
    other ? `（${other}）` : ''
  }`
})

const additionalNotes = computed(() =>
  String(insight.value?.customRecipeOrder?.additionalNotes || '').trim()
)

/* ---------- 过敏信息：合并去重，不判断 ---------- */

const allergyFacts = computed(() =>
  buildAllergyFacts({
    allergyDetail: insight.value?.dog?.allergyDetail,
    structuredAllergies: insight.value?.dog?.structuredAllergies,
    orderAllergies: insight.value?.customRecipeOrder?.allergies,
    orderAllergyText: insight.value?.customRecipeOrder?.allergyText,
  })
)

function sourceLabel(sources: readonly AllergyFactSource[]) {
  return formatAllergySources(sources)
}
/**
 * 本单过敏原文只在“确实提供了新信息”时显示。
 * 例如档案已有鸭/猪，订单原文也是鸭、猪，就不再重复列一行。
 */
const orderAllergyTextExtra = computed(() => {
  const raw = allergyFacts.value.orderText
  if (!raw) return ''
  const covered = new Set(
    allergyFacts.value.allergens.map((item) => item.text.trim().toLowerCase())
  )
  const tokens = raw
    .split(/[、,，;；\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (tokens.length === 0) return ''
  return tokens.some((item) => !covered.has(item.toLowerCase())) ? raw : ''
})


/* ---------- 最近一次就诊 / 体检 ---------- */

const historyRecipes = computed(() =>
  (insight.value?.historyRecipes || []).filter((item) => item?.name)
)

const historyKindLabel = (kind: string) =>
  kind === 'FINISHED' ? '成品鲜食' : '定制食谱'

const historyDialogVisible = ref(false)
const historySelection = ref<DogDesignInsight['historyRecipes'][number] | null>(null)

function openHistoryRecipe(item: DogDesignInsight['historyRecipes'][number]) {
  historySelection.value = item
  historyDialogVisible.value = true
}

const healthFacts = computed(() =>
  buildLatestHealthFacts({
    latestMedicalRecord: insight.value?.latestMedicalRecord,
    latestCheckupRecord: insight.value?.latestCheckupRecord,
  })
)

/* ---------- 基础档案展示辅助 ---------- */

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

const weightText = computed(() => {
  const kg = insight.value?.dog.currentWeightKg
  if (kg == null || kg <= 0) return '未填写'
  return `${kg} kg`
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

/** 三个折叠区默认全部收起（基础档案 / 就诊体检 / 最近食材） */
const openSections = ref<string[]>([])
const attachmentDialogVisible = ref(false)
const attachmentUrl = ref('')
const attachmentTitle = ref('')
const attachmentKind = ref<'image' | 'pdf' | 'other'>('other')

function detectAttachmentKind(url: string): 'image' | 'pdf' | 'other' {
  const value = String(url || '').trim()
  // 媒体代理为了保护 COS key，URL 路径不含扩展名，扩展名放在 ?ext=jpg 里。
  let ext = ''
  try {
    ext = String(new URL(value).searchParams.get('ext') || '').toLowerCase()
  } catch {
    ext = ''
  }
  if (!ext) {
    const path = (value.split('?')[0] || '').toLowerCase()
    ext = (path.match(/\.([a-z0-9]+)$/)?.[1] || '').toLowerCase()
  }
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) return 'image'
  return 'other'
}

function openAttachment(url: string, title: string) {
  const value = String(url || '').trim()
  if (!value) return
  attachmentUrl.value = value
  attachmentTitle.value = title
  attachmentKind.value = detectAttachmentKind(value)
  attachmentDialogVisible.value = true
}


function handleRecentDaysChange() {
  void loadInsight()
}

const recentEaten = computed(
  () => insight.value?.designHistory.recentEatenIngredients ?? []
)

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
  const ownerText = dogOwnerLabel(dog)
  if (ownerText) parts.push(ownerText)
  return parts.filter(Boolean).join(' · ')
}

/** 归属客户展示：微信昵称优先，缺失/占位时用手机号后四位兜底，都没有则显示"客户" */
function dogOwnerLabel(dog: DogProfile): string {
  const nickname = dog.ownerNickname?.trim()
  if (nickname && nickname !== '微信用户') return nickname
  const phone = dog.ownerPhone?.trim()
  if (phone) return maskPhone(phone)
  return '客户'
}

/** 手机号后四位掩码，如 138****5678 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return phone
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`
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
  } catch {
    insight.value = null
  } finally {
    loading.value = false
  }
}

// 中文来自选项字典（不阻塞面板加载）
ensureCurrentFoodOptions()
ensureChangeReasonOptions()
ensureStomachOptions()

watch(
  () => props.dogId,
  () => {
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
.dog-profile .section-title {
  margin-bottom: 4px;
}
/* 「更换参考爱犬」按钮：位于狗狗姓名下方 */
.profile-actions {
  margin: 0 0 2px;
  display: flex;
  justify-content: flex-start;
}
.profile-actions .el-button {
  padding: 0;
  height: auto;
}
.fact-primary {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  line-height: 1.5;
  word-break: break-all;
}
.fact-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
}
.fact-row--secondary .fact-label,
.fact-row--secondary .fact-value {
  color: #909399;
}
.fact-label {
  font-size: 11px;
  color: #909399;
}
.fact-value {
  font-size: 13px;
  color: #303133;
  word-break: break-all;
  white-space: pre-wrap;
}
.dog-summary {
  margin-top: 4px;
  color: #606266;
  font-size: 12px;
  line-height: 1.6;
}

.dog-header-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  min-height: 24px;
}

.dog-order-no {
  color: #909399;
  font-size: 11px;
}

.dog-lock-tip {
  color: #909399;
  font-size: 11px;
  text-align: right;
}

.fact-row--stacked {
  display: block;
}

.fact-row--stacked .fact-label {
  display: block;
  margin-bottom: 3px;
}

.fact-row--stacked .fact-value {
  display: block;
  text-align: left;
  line-height: 1.6;
  word-break: break-word;
}



.history-recipe-row--clickable {
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.history-recipe-row--clickable:hover {
  border-color: var(--el-color-primary);
  background: #f5f8ff;
}

.history-dialog-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  color: #909399;
  font-size: 12px;
}

.history-dialog-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.history-dialog-grid h4 {
  margin: 0 0 10px;
  color: #303133;
  font-size: 14px;
}

.history-ingredient-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
}

.history-ingredient-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 10px;
  border-bottom: 1px solid #f2f3f5;
  color: #606266;
  font-size: 12px;
}

.history-ingredient-list li:last-child {
  border-bottom: 0;
}

.history-ingredient-list li span:last-child {
  color: #909399;
  white-space: nowrap;
}

.history-macro-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #ebeef5;
  font-size: 12px;
}

.history-macro-table th,
.history-macro-table td {
  padding: 7px 8px;
  border-bottom: 1px solid #f2f3f5;
  text-align: left;
}

.history-macro-table th {
  color: #909399;
  font-weight: 500;
  background: #fafafa;
}

.history-macro-table tr:last-child td {
  border-bottom: 0;
}

.history-recipe-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-recipe-row {
  padding: 8px 10px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fafafa;
}

.history-recipe-name {
  color: #303133;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  word-break: break-word;
}

.history-recipe-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  color: #909399;
  font-size: 11px;
}

.order-attachments {
  margin-top: 8px;
}

.attachment-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
}

.attachment-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--el-color-primary);
  font: inherit;
  cursor: pointer;
}

.attachment-link:hover {
  text-decoration: underline;
}

.attachment-preview-body {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.attachment-preview-image {
  max-width: 100%;
  max-height: 68vh;
}

.attachment-preview-pdf {
  width: 100%;
  height: 68vh;
  border: 0;
}

.attachment-preview-fallback {
  text-align: center;
  color: #606266;
}

.fact-value--block {
  padding: 6px 8px;
  background: #fafafa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  line-height: 1.6;
}
/* 过敏信息：只列事实与来源，不分档、不标风险 */
.allergy-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.allergy-chip {
  max-width: 100%;
}
.allergy-chip__source {
  margin-left: 5px;
  font-size: 10px;
  opacity: 0.65;
}
/* 就诊 / 体检：只显示最近一条的日期 + 结论 */
.record-block {
  padding: 8px 0;
  border-bottom: 1px dashed #ebeef5;
}
.record-block:last-child {
  border-bottom: none;
}
.record-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.record-title {
  font-size: 12px;
  font-weight: 600;
  color: #303133;
}
.record-date {
  font-size: 11px;
  color: #909399;
}
.record-line {
  font-size: 13px;
  color: #303133;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.panel-section--collapse {
  padding-top: 4px;
}
.panel-section--collapse :deep(.el-collapse) {
  border-top: none;
  border-bottom: none;
}
.panel-section--collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px dashed #ebeef5;
}
.panel-section--collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}
.panel-section--collapse :deep(.el-collapse-item__content) {
  padding-bottom: 8px;
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
/* 每日目标能量卡片（信息展示，不是风险提示） */
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
.recent-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.recent-days-select {
  margin-left: auto;
  width: 88px;
  flex-shrink: 0;
}
</style>
