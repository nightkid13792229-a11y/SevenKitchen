<template>
  <view class="container">
    <view class="form-section">
      <!-- Loading breeds indicator -->
      <view class="loading-notice" v-if="loadingBreeds">
        <text>正在加载品种列表...</text>
      </view>

      <view class="form-item">
        <text class="label">姓名 *</text>
        <input
          class="input"
          placeholder="请输入狗狗姓名"
          :value="String(formData.name || '')"
          @input="e => formData.name = e.detail.value"
        />
      </view>

      <!-- 性别 -->
      <view class="form-item">
        <text class="label">性别</text>
        <view class="gender-selector">
          <view
            class="gender-option gender-option-male"
            :class="{ active: formData.gender === 'MALE' }"
            @tap="selectGender('MALE')"
          >
            <text class="gender-icon">♂</text>
            <text class="gender-label">公</text>
          </view>
          <view
            class="gender-option gender-option-female"
            :class="{ active: formData.gender === 'FEMALE' }"
            @tap="selectGender('FEMALE')"
          >
            <text class="gender-icon">♀</text>
            <text class="gender-label">母</text>
          </view>
        </view>
      </view>

      <!-- Breed Selection with Search -->
      <view class="form-item breed-section">
        <text class="label">品种 *</text>

        <!-- Selected Breed Display -->
        <view v-if="selectedBreed || isMixedBreed" class="selected-breed-display">
          <text class="selected-text">
            {{ isMixedBreed
              ? (formData.customBreedName || '混血/其他')
              : selectedBreed?.name
            }}
          </text>
          <text class="change-btn" @tap="clearBreed">重新选择</text>
        </view>

        <!-- Breed Selection UI (shown when no breed selected) -->
        <view v-else class="breed-selector">
          <!-- Search Input -->
          <view class="search-box">
            <input
              class="search-input"
              placeholder="🔍 搜索品种（如：拉布拉多、金毛）"
              v-model="searchKeyword"
              @input="onSearchInput"
            />
          </view>

          <!-- Search Results -->
          <view v-if="searchKeyword" class="search-results">
            <text class="section-title">搜索结果 ({{ filteredBreeds.length }}个品种)</text>
            <view class="breed-list">
              <view
                v-for="breed in filteredBreeds"
                :key="breed.id"
                class="breed-item"
                @tap="selectBreed(breed)"
              >
                {{ breed.name }}
              </view>
            </view>
            <view v-if="filteredBreeds.length === 0" class="no-results">
              未找到匹配的品种
            </view>
          </view>

          <!-- No Search: Show Common Breeds -->
          <view v-else>
            <!-- Common Breeds (Collapsible) -->
            <view class="section">
              <view class="section-header" @tap="toggleCommonBreeds">
                <text class="section-title">💡 常见品种</text>
                <text class="toggle-icon">{{ showCommonBreeds ? '▲' : '▼' }}</text>
              </view>
              <view v-if="showCommonBreeds" class="common-breeds">
                <view
                  v-for="breedName in commonBreeds"
                  :key="breedName"
                  class="breed-tag"
                  @tap="selectBreedByName(breedName)"
                >
                  {{ breedName }}
                </view>
              </view>
              <view v-else class="common-breeds collapsed">
                <view
                  v-for="breedName in commonBreeds.slice(0, 5)"
                  :key="breedName"
                  class="breed-tag"
                  @tap="selectBreedByName(breedName)"
                >
                  {{ breedName }}
                </view>
              </view>
            </view>

            <!-- All Breeds Toggle (Grouped by Size with Sidebar Navigation) -->
            <view class="section">
              <view class="section-header" @tap="toggleAllBreeds">
                <text class="section-title">📋 全部品种 (按体型分类)</text>
                <text class="toggle-icon">{{ showAllBreeds ? '▲' : '▼' }}</text>
              </view>

              <view v-if="showAllBreeds" class="breed-selector-with-sidebar">
                <!-- 左侧：快速导航栏 -->
                <view class="quick-nav-sidebar">
                  <view
                    v-for="cat in sizeCategories"
                    :key="cat.key"
                    class="nav-item"
                    :class="{ active: activeCategory === cat.key }"
                    @tap="scrollToCategory(cat.key)"
                  >
                    <text class="nav-icon">{{ cat.icon }}</text>
                    <text class="nav-label">{{ cat.shortLabel }}</text>
                  </view>
                </view>

                <!-- 右侧：可滚动的品种列表 -->
                <scroll-view
                  class="breed-content-scroll"
                  scroll-y
                  :scroll-into-view="scrollToViewId"
                  scroll-with-animation
                  @scroll="onScroll"
                >
                  <view
                    v-for="(breedList, category) in breedsBySizeCategory"
                    :key="category"
                    :id="'category-' + category"
                    class="size-category-group"
                    :data-category="category"
                  >
                    <view class="size-category-title" :data-icon="sizeCategories.find(c => c.key === category)?.icon">
                      {{ sizeCategoryLabels[category] }} ({{ breedList.length }}种)
                    </view>
                    <view class="breed-grid">
                      <view
                        v-for="breed in breedList"
                        :key="breed.id"
                        class="breed-item"
                        @tap="selectBreed(breed)"
                      >
                        {{ breed.name }}
                      </view>
                    </view>
                  </view>
                </scroll-view>
              </view>
            </view>

            <!-- Mixed Breed Option -->
            <view class="section">
              <view class="mixed-breed-btn" @tap="selectMixedBreed">
                混血/其他
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- Size Class Display (Inline) -->
      <view v-if="selectedBreed || isMixedBreed" class="form-item size-display">
        <text class="label">📏 体型分类</text>
        <picker
          mode="selector"
          :range="sizeClassOptionsForPicker"
          :value="sizeClassIndex"
          @change="onSizeClassChange"
        >
          <view class="size-info" :class="{ 'size-required': isMixedBreed && !formData.sizeClassOverride }">
            <text class="size-text">{{ getSizeClassDisplay() }}</text>
            <text class="edit-icon">✏️</text>
          </view>
        </picker>
        <text class="hint" :class="{ 'hint-warning': isMixedBreed && !formData.sizeClassOverride }">
          {{ getSizeClassHint() }}
        </text>
      </view>

      <view class="form-item">
        <text class="label">生日 *</text>
        <picker mode="date" :value="formData.birthday || ''" @change="onBirthdayChange">
          <view class="picker">{{ formData.birthday || '请选择生日' }}</view>
        </picker>
      </view>

      <!-- 身体状态区 -->
      <view class="form-item">
        <text class="label">体重(kg) *</text>
        <input class="input" type="text" placeholder="请输入体重" v-model="formData.currentWeightKg" />
      </view>

      <view class="form-item">
        <text class="label">BCS评分 (1-9分)</text>
        <view class="bcs-score-row">
          <slider
            class="bcs-slider"
            :min="1"
            :max="9"
            :value="formData.bcsScore"
            step="1"
            show-value
            @change="onBcsChange"
          />
          <text class="bcs-body-status" :style="{ color: bcsStatusColor }">
            身材：{{ bcsStatusText }}
          </text>
        </view>
      </view>

      <!-- BCS体态示意图弹窗 -->
      <uni-popup ref="bcsPopup" type="center" :show="showBcsGuide" @close="onCloseBcsGuide">
        <view class="bcs-guide-popup" @tap.stop>
          <view class="bcs-guide-title">BCS体态评分标准</view>

          <!-- BCS评分图片 -->
          <view class="bcs-image-container">
            <image
              class="bcs-guide-image"
              :src="bcsGuideImageUrl"
              mode="widthFix"
              @load="onBcsImageLoad"
              @error="onBcsImageError"
            />
            <!-- 加载失败提示 -->
            <view v-if="bcsImageError" class="bcs-image-error">
              <text>图片加载失败，请稍后重试</text>
            </view>
          </view>
        </view>
      </uni-popup>

      <view class="form-item">
        <text class="label">是否绝育</text>
        <view class="neutered-selector">
          <view
            class="neutered-option"
            :class="{ active: formData.isNeutered === true }"
            @tap="selectNeutered(true)"
          >
            <text class="neutered-label">是</text>
          </view>
          <view
            class="neutered-option"
            :class="{ active: formData.isNeutered === false }"
            @tap="selectNeutered(false)"
          >
            <text class="neutered-label">否</text>
          </view>
        </view>
      </view>

      <view class="form-item">
        <text class="label">活动水平 *</text>

        <view class="activity-level-container">
          <view
            v-for="option in activityLevelConfigs"
            :key="option.value"
            class="activity-level-option"
            :class="{ active: formData.activityLevel === option.value }"
            @tap="selectActivityLevel(option.value)"
          >
            <view class="activity-level-header">
              <text class="activity-level-label">{{ option.label }}</text>
            </view>
            <text class="activity-level-description">{{ option.description }}</text>
          </view>
        </view>
      </view>

      <!-- 生命阶段（自动匹配 + 手动选择） -->
      <view class="form-item life-stage-section">
        <text class="label">生命阶段</text>

        <!-- 已填写生日：显示自动匹配结果 -->
        <view v-if="formData.birthday" class="life-stage-content">
          <!-- 自动匹配结果展示 -->
          <view class="auto-match-result">
            <text class="auto-match-text">{{ autoDetectedLifeStage.label }}（{{ autoDetectedLifeStage.detail }}）</text>
            <text class="auto-match-label">- 自动匹配</text>
          </view>

          <!-- 未手动覆盖：显示手动选择按钮 -->
          <view v-if="!isLifeStageOverride" class="manual-select-trigger" @tap="enableLifeStageOverride">
            <text class="manual-select-text">手动选择生命阶段</text>
            <text class="manual-select-icon">▶</text>
          </view>

          <!-- 已手动覆盖：显示手动选择面板 -->
          <view v-else class="life-stage-override-panel">
            <view class="override-title">请选择生命阶段</view>
            <view class="override-options">
              <view
                v-for="option in lifeStageOverrideOptions"
                :key="option.value"
                class="override-option"
                :class="{ active: formData.lifeStageOverride === option.value }"
                @tap="selectLifeStageOverride(option.value)"
              >
                <text class="override-option-label">{{ option.label }}</text>
                <text class="override-option-desc">{{ option.description }}</text>
              </view>
            </view>

            <!-- 取消按钮 -->
            <view class="cancel-override-btn" @tap="cancelLifeStageOverride">
              <text class="cancel-override-icon">✖️</text>
              <text class="cancel-override-text">取消，返回自动匹配</text>
            </view>
          </view>
        </view>

        <!-- 未填写生日时的提示 -->
        <view v-else class="life-stage-prompt">
          <text class="prompt-text">请先选择狗狗的生日，系统将自动判断生命阶段</text>
        </view>
      </view>

      <view class="form-item">
        <text class="label">每日餐数</text>
        <input class="input" type="text" placeholder="请输入每日餐数" v-model="formData.mealsPerDay" />
      </view>

      <!-- 零食设置区（卡片式） -->
      <view class="treat-section">
        <text class="section-label">零食设置（选填）</text>

        <!-- 新增：未选择模式时的提示 -->
        <view v-if="!formData.treatInputMode" class="treat-mode-hint">
          <text class="hint-icon">💡</text>
          <text class="hint-text">请先选择零食热量输入方式</text>
        </view>

        <!-- 零食输入模式（卡片单选，左右布局） -->
        <view class="treat-mode-selector">
          <view class="card-options card-options-horizontal">
            <view
              v-for="mode in treatInputModeOptions"
              :key="mode.value"
              class="card-option card-option-simple"
              :class="{ active: formData.treatInputMode === mode.value }"
              @tap="selectTreatInputMode(mode.value)"
            >
              <text class="card-label-simple">{{ mode.label }}</text>
            </view>
          </view>
        </view>

        <!-- 估算模式：零食量选择 -->
        <view v-if="formData.treatInputMode === 'ESTIMATE_LEVEL'" class="treat-level-selector">
          <text class="field-label">零食量（大概）</text>
          <view class="card-options">
            <view
              v-for="level in treatLevelOptions"
              :key="level.value"
              class="card-option treat-level-card"
              :class="{ active: formData.treatLevel === level.value }"
              @tap="selectTreatLevel(level.value)"
            >
              <view class="card-radio">
                <view v-if="formData.treatLevel === level.value" class="radio-checked"></view>
              </view>
              <view class="card-content">
                <text class="card-label">{{ level.label }}</text>
                <text class="card-desc">{{ level.description }}（{{ level.detail }}）</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 精确模式：手动输入 -->
        <view v-if="formData.treatInputMode === 'EXACT_KCAL'" class="treat-exact-input">
          <text class="field-label">每日零食能量(kcal) *</text>
          <input
            class="input input-white-bg"
            type="text"
            placeholder="请输入每日零食能量"
            v-model="formData.manualTreatKcal"
          />
        </view>
      </view>

      <!-- 健康记录区（折叠面板） -->
      <view class="health-record-section">
        <view class="health-record-header" @tap="toggleHealthRecord">
          <text class="health-record-title">📋 健康记录（选填）</text>
          <text class="toggle-icon">{{ showHealthRecord ? '▼' : '▶' }}</text>
        </view>

        <view v-if="showHealthRecord" class="health-record-content">
          <view class="form-item">
            <text class="label">病史描述</text>
            <textarea class="textarea" placeholder="请输入病史（选填）" v-model="formData.medicalHistory" />
          </view>

          <view class="form-item">
            <text class="label">过敏食物</text>
            <textarea class="textarea" placeholder="请记录过敏的食物（选填）" />
          </view>

          <view class="form-item">
            <text class="label">挑食食物</text>
            <textarea class="textarea" placeholder="请记录不爱吃或挑食的食物（选填）" />
          </view>

          <view class="form-item">
            <text class="label">检查报告存档</text>
            <view class="placeholder-box">
              <text class="placeholder-text">📁 敬请期待：检查报告上传功能即将上线</text>
            </view>
          </view>
        </view>
      </view>

      <button class="btn" @tap="submit" :disabled="canSubmit === false">{{ isEditMode ? '保存档案' : '创建档案' }}</button>

      <!-- Preview Calculation Button -->
      <button class="btn btn-secondary" @tap="previewCalculation" :disabled="canPreview === false">
        试算喂食建议
      </button>

      <!-- Feeding Recommendation Card -->
      <view class="recommendation-card" v-if="calcResult">
        <view class="card-title">📊 喂食建议</view>
        <view class="calc-item">
          <text class="calc-label">静息能量需求 (RER):</text>
          <text class="calc-value">{{ calcResult.rer?.toFixed(1) || 'N/A' }} kcal/天</text>
        </view>
        <view class="calc-item">
          <text class="calc-label">每日总能量需求 (DER):</text>
          <text class="calc-value">{{ calcResult.totalDer?.toFixed(1) || 'N/A' }} kcal/天</text>
        </view>
        <view class="calc-item highlight-item">
          <text class="calc-label">每日建议能量 (鲜食):</text>
          <text class="calc-value highlight">{{ calcResult.finalFoodKcal?.toFixed(1) || 'N/A' }} kcal/天</text>
        </view>
        <view class="calc-item" v-if="calcResult.dailyIntakeG">
          <text class="calc-label">每日建议鲜食摄入量:</text>
          <text class="calc-value highlight">{{ calcResult.dailyIntakeG.toFixed(0) }} g/天</text>
        </view>
        <view class="calc-item" v-if="calcResult.treatDeduction && calcResult.treatDeduction > 0">
          <text class="calc-label">零食扣减:</text>
          <text class="calc-value">{{ calcResult.treatDeduction.toFixed(1) }} kcal/天</text>
        </view>
        <view class="calc-warning" v-if="calcResult.isTreatCapped">
          ⚠️ 零食热量已超过安全上限(10%)，系统已自动调整为安全最大值
        </view>
      </view>
    </view>

    <!-- Custom Breed Name Input Modal -->
    <view v-if="showCustomBreedInput" class="custom-breed-modal" @tap.self="cancelCustomBreed">
      <view class="custom-breed-content">
        <text class="custom-breed-title">请输入品种名称</text>
        <input
          class="custom-breed-input"
          v-model="customBreedName"
          placeholder="如：泰迪串串、田园犬等"
          focus
        />
        <view class="custom-breed-actions">
          <button class="custom-breed-btn-cancel" @tap="cancelCustomBreed">取消</button>
          <button class="custom-breed-btn-confirm" @tap="confirmCustomBreed">确定</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import { addDogToCache } from '../../utils/dog-cache'

interface FormData {
  name: string
  breedId: string
  customBreedName?: string
  birthday: string
  gender: string
  isNeutered: boolean
  currentWeightKg: string
  bcsScore: number
  activityLevel: string
  lifeStageOverride: string
  sizeClassOverride: string | null
  mealsPerDay: string
  treatInputMode: string
  treatLevel: string
  manualTreatKcal: string
  medicalHistory: string
}

// Constants
const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'
const commonBreeds = [
  '拉布拉多', '泰迪', '贵宾犬(小型)', '贵宾犬(标准)', '金毛',
  '比熊', '哈士奇', '德牧', '边牧', '柯基',
  '萨摩耶', '法国斗牛犬', '吉娃娃', '博美', '雪纳瑞(小型)',
  '约克夏', '马尔济斯', '腊肠犬', '阿拉斯加', '杜宾'
]

const formData = ref<FormData>({
  name: '',
  breedId: '',
  customBreedName: '',
  birthday: '',
  gender: 'MALE',
  isNeutered: false,
  currentWeightKg: '',
  bcsScore: 5,
  activityLevel: 'NORMAL',
  lifeStageOverride: 'NONE',
  sizeClassOverride: null,
  mealsPerDay: '2',
  treatInputMode: '',
  treatLevel: 'LOW',
  manualTreatKcal: '',
  medicalHistory: ''
})

// 活动水平配置
interface ActivityLevelOption {
  value: string
  label: string
  description: string
  coefficient: number
}

const activityLevelConfigs: ActivityLevelOption[] = [
  {
    value: 'RESTING',
    label: '休息',
    description: '几乎不运动，主要时间休息',
    coefficient: 0.8
  },
  {
    value: 'LOW',
    label: '低活动',
    description: '偶尔散步，每日运动少于30分钟',
    coefficient: 0.9
  },
  {
    value: 'NORMAL',
    label: '正常活动',
    description: '每日散步1-2小时，正常活动量',
    coefficient: 1.0
  },
  {
    value: 'HIGH',
    label: '高活动',
    description: '每日运动2-4小时，经常跑步或玩耍',
    coefficient: 1.2
  },
  {
    value: 'WORKING',
    label: '工作犬',
    description: '高强度训练或工作，如搜救犬、警犬',
    coefficient: 1.5
  }
]

const lifeStageOptions = ['NONE', 'PUPPY', 'ADULT', 'SENIOR', 'PREGNANCY', 'LACTATION']

// 生命阶段手动覆盖选项（排除 NONE）
const lifeStageOverrideOptions = [
  { value: 'PUPPY', label: '幼犬期', description: '成长发育阶段，需要更高能量' },
  { value: 'ADULT', label: '成年期', description: '成年犬，标准能量需求' },
  { value: 'SENIOR', label: '老年期', description: '老年犬，新陈代谢减缓' },
  { value: 'PREGNANCY', label: '妊娠期', description: '怀孕母犬，需要额外营养' },
  { value: 'LACTATION', label: '哺乳期', description: '哺乳母犬，高能量需求' }
]
const sizeClassOptions = ['SMALL', 'MEDIUM', 'LARGE', 'GIANT']
const sizeClassOptionsForPicker = ['小型犬', '中型犬', '大型犬', '巨型犬']

// ========== 零食设置选项（卡片式） ==========

// 零食输入模式选项
interface TreatInputModeOption {
  value: string
  label: string
  description: string
}

const treatInputModeOptions: TreatInputModeOption[] = [
  {
    value: 'ESTIMATE_LEVEL',
    label: '估算零食热量（推荐）',
    description: '根据零食量等级自动计算'
  },
  {
    value: 'EXACT_KCAL',
    label: '精确输入零食热量',
    description: '手动输入具体热量值'
  }
]

// 零食量选项
interface TreatLevelOption {
  value: string
  label: string
  percent: string
  description: string
  detail: string // 括弧内的详细说明
}

const treatLevelOptions: TreatLevelOption[] = [
  {
    value: 'NONE',
    label: '不给零食',
    percent: '0%',
    description: '占每日总能量需求约0%',
    detail: '完全不给零食'
  },
  {
    value: 'LOW',
    label: '较少',
    percent: '3%',
    description: '占每日总能量需求约3%',
    detail: '偶尔给小零食'
  },
  {
    value: 'MODERATE',
    label: '适中',
    percent: '6%',
    description: '占每日总能量需求约6%',
    detail: '每天都有小零食'
  },
  {
    value: 'HIGH',
    label: '较多',
    percent: '10%',
    description: '占每日总能量需求约10%',
    detail: '经常给零食或大零食'
  }
]

interface Breed {
  id: string
  name: string
  sizeCategory: string
  adultAgeMonths: number
  seniorAgeYears: number
  averageAdultWeightKg?: number
}

interface CalcResult {
  rer?: number
  totalDer?: number
  finalFoodKcal?: number
  treatDeduction?: number
  isTreatCapped?: boolean
  dailyIntakeG?: number
}

const breeds = ref<Breed[]>([])
const selectedBreed = ref<Breed | null>(null)
const calcResult = ref<CalcResult | null>(null)
const loadingBreeds = ref(false)
const calculating = ref(false)

// Store dogId for edit mode
const dogId = ref<string | null>(null)

// New state variables
const searchKeyword = ref('')
const showCommonBreeds = ref(false)
const showAllBreeds = ref(false)
const isMixedBreed = ref(false)
const showCustomBreedInput = ref(false)
const customBreedName = ref('')
const showBcsGuide = ref(false)

// BCS评分图URL
const bcsGuideImageUrl = ref('https://lhcos-3c860-1392823718.cos.ap-chengdu.myqcloud.com/bcs-chart.png')
const bcsImageError = ref(false)
const bcsGuideShown = ref(false) // 记录是否已显示过BCS图
const showHealthRecord = ref(false) // 健康记录折叠面板展开状态
const showLifeStageOverride = ref(false) // 生命阶段手动覆盖折叠面板

// 侧边导航状态变量
const activeCategory = ref<string>('')
const scrollToViewId = ref<string>('')
const categoryPositions = ref<Record<string, number>>({})
const scrollViewHeight = ref(600) // scroll-view 的高度（单位：px）

const filteredBreeds = computed(() => {
  if (!searchKeyword.value) {
    return []
  }
  const keyword = searchKeyword.value.trim()
  return breeds.value.filter(b => b.name.includes(keyword))
})

const breedsBySizeCategory = computed(() => {
  const grouped: Record<string, typeof breeds.value> = {
    'SMALL': [],
    'MEDIUM': [],
    'LARGE': [],
    'GIANT': []
  }

  breeds.value.forEach(breed => {
    const category = breed.sizeCategory
    if (grouped[category]) {
      grouped[category].push(breed)
    }
  })

  return grouped
})

const sizeCategoryLabels: Record<string, string> = {
  'SMALL': '小型犬',
  'MEDIUM': '中型犬',
  'LARGE': '大型犬',
  'GIANT': '巨型犬'
}

// 体型分类配置（用于侧边导航和视觉样式）
const sizeCategories = [
  { key: 'SMALL', label: '小型犬', shortLabel: '小型', icon: '🔵', color: '#1890ff' },
  { key: 'MEDIUM', label: '中型犬', shortLabel: '中型', icon: '🟡', color: '#faad14' },
  { key: 'LARGE', label: '大型犬', shortLabel: '大型', icon: '🟢', color: '#52c41a' },
  { key: 'GIANT', label: '巨型犬', shortLabel: '巨型', icon: '🟣', color: '#722ed1' }
]

const lifeStageIndex = computed(() => {
  const idx = lifeStageOptions.indexOf(formData.value.lifeStageOverride)
  return Math.max(0, idx) // 确保返回非负整数
})
const sizeClassIndex = computed(() => {
  const override = formData.value.sizeClassOverride
  if (!override) return 0
  const idx = sizeClassOptions.indexOf(override)
  return Math.max(0, idx) // 确保返回非负整数
})

// BCS身材状态文字
const bcsStatusText = computed(() => {
  const score = formData.value.bcsScore
  if (score <= 2) return '很瘦'
  if (score === 3) return '偏瘦'
  if (score >= 4 && score <= 5) return '标准'
  if (score >= 6 && score <= 7) return '偏胖'
  return '很胖'
})

// BCS身材状态颜色
const bcsStatusColor = computed(() => {
  const score = formData.value.bcsScore
  if (score <= 2) return '#ff4d4f' // 红色
  if (score === 3) return '#faad14' // 深黄色
  if (score >= 4 && score <= 5) return '#52c41a' // 绿色
  if (score >= 6 && score <= 7) return '#faad14' // 深黄色
  return '#ff4d4f' // 红色
})

// ========== 生命阶段自动计算逻辑 ==========

/**
 * 计算狗狗的年龄（月）
 */
const calculateAgeMonths = computed(() => {
  if (!formData.value.birthday) return 0
  const birthday = new Date(formData.value.birthday)
  const today = new Date()
  const diffTime = today.getTime() - birthday.getTime()
  const diffDays = diffTime / (1000 * 60 * 60 * 24)
  return Math.floor(diffDays / 30.4375) // 平均每月30.4375天
})

/**
 * 获取体型分类的成年标准（月）
 */
const getAdultThresholdMonths = computed(() => {
  const sizeClass = getCurrentSizeClass.value
  const thresholds: Record<string, number> = {
    'SMALL': 10,
    'MEDIUM': 12,
    'LARGE': 18,
    'GIANT': 24
  }
  // 如果有品种且品种有自定义成年标准，使用品种的
  if (selectedBreed.value && selectedBreed.value.adultAgeMonths) {
    return selectedBreed.value.adultAgeMonths
  }
  return thresholds[sizeClass] || 12
})

/**
 * 获取体型分类的老年标准（年）
 */
const getSeniorThresholdYears = computed(() => {
  const sizeClass = getCurrentSizeClass.value
  const thresholds: Record<string, number> = {
    'SMALL': 11,
    'MEDIUM': 10,
    'LARGE': 8,
    'GIANT': 7
  }
  // 如果有品种且品种有自定义老年标准，使用品种的
  if (selectedBreed.value && selectedBreed.value.seniorAgeYears) {
    return selectedBreed.value.seniorAgeYears
  }
  return thresholds[sizeClass] || 10
})

/**
 * 获取当前体型分类
 */
const getCurrentSizeClass = computed(() => {
  // 优先使用手动覆盖
  if (formData.value.sizeClassOverride) {
    return formData.value.sizeClassOverride
  }
  // 使用品种的体型分类
  if (selectedBreed.value) {
    return selectedBreed.value.sizeCategory
  }
  return 'MEDIUM' // 默认中型
})

/**
 * 计算自动识别的生命阶段
 */
const autoDetectedLifeStage = computed(() => {
  const ageMonths = calculateAgeMonths.value
  const adultThreshold = getAdultThresholdMonths.value
  const ageYears = ageMonths / 12.0
  const seniorThreshold = getSeniorThresholdYears.value

  // 判断生命阶段
  if (ageMonths < adultThreshold) {
    // 幼犬期 - 根据月龄显示详细信息
    if (ageMonths < 4) {
      return { stage: 'PUPPY', label: '幼犬期', detail: `${ageMonths}个月（快速成长期）` }
    } else if (ageMonths < 6) {
      return { stage: 'PUPPY', label: '幼犬期', detail: `${ageMonths}个月（成长期）` }
    } else if (ageMonths < 12) {
      return { stage: 'PUPPY', label: '幼犬期', detail: `${ageMonths}个月` }
    } else {
      return { stage: 'PUPPY', label: '幼犬期', detail: `${ageMonths}个月（接近成年）` }
    }
  } else if (ageYears >= seniorThreshold) {
    // 老年期
    return { stage: 'SENIOR', label: '老年期', detail: `${Math.floor(ageYears)}岁` }
  } else {
    // 成年期
    return { stage: 'ADULT', label: '成年期', detail: `${Math.floor(ageYears)}岁` }
  }
})

/**
 * 显示的生命阶段文本（如果有手动覆盖则显示覆盖后的，否则显示自动识别的）
 */
const displayLifeStage = computed(() => {
  const override = formData.value.lifeStageOverride
  if (override && override !== 'NONE') {
    // 显示手动覆盖的选项
    const labels: Record<string, string> = {
      'PUPPY': '幼犬期（手动覆盖）',
      'ADULT': '成年期（手动覆盖）',
      'SENIOR': '老年期（手动覆盖）',
      'PREGNANCY': '妊娠期',
      'LACTATION': '哺乳期'
    }
    return labels[override] || override
  }
  // 显示自动识别的
  return autoDetectedLifeStage.value.label
})

/**
 * 判断是否处于手动覆盖模式
 */
const isLifeStageOverride = computed(() => {
  return formData.value.lifeStageOverride && formData.value.lifeStageOverride !== 'NONE'
})

// ========== 生命阶段计算逻辑结束 ==========

const canSubmit = computed(() => {
  return Boolean(
    formData.value.name &&
    formData.value.breedId &&
    formData.value.birthday &&
    formData.value.currentWeightKg &&
    formData.value.activityLevel &&
    !calculating.value &&
    (isMixedBreed.value ? formData.value.sizeClassOverride !== null : true)
  )
})

const canPreview = computed(() => {
  return Boolean(
    formData.value.breedId &&
    formData.value.birthday &&
    formData.value.currentWeightKg &&
    !calculating.value &&
    (isMixedBreed.value ? formData.value.sizeClassOverride !== null : true)
  )
})

// Check if we're in edit mode (use dogId ref instead of getCurrentPages)
const isEditMode = computed(() => {
  return !!dogId.value
})

// onLoad lifecycle hook - receives page parameters
onLoad((options: any) => {
  console.log('[DogCreate] onLoad called with options:', options)

  // Store dogId if provided (edit mode)
  if (options?.dogId) {
    dogId.value = options.dogId
    console.log('[DogCreate] Edit mode detected, dogId:', dogId.value)
  } else {
    console.log('[DogCreate] Create mode')
  }
})

onMounted(async () => {
  // Load breeds first (required for breed selection)
  await loadBreeds()

  // Check if editing existing dog (use dogId ref set in onLoad)
  if (dogId.value) {
    // Edit mode: load existing dog profile
    console.log('[DogCreate] onMounted: loading dog profile for edit mode')
    // Wait a bit to ensure breeds data is processed
    setTimeout(() => {
      loadDogProfile(dogId.value!)
    }, 100)
  } else {
    console.log('[DogCreate] onMounted: create mode, no dogId')

    // Auto-show BCS guide on first load (delay 1.5s)
    setTimeout(() => {
      if (!bcsGuideShown.value) {
        showBcsGuide.value = true
        bcsGuideShown.value = true
        console.log('[DogCreate] Auto-showing BCS guide')
      }
    }, 1500)
  }
})

async function loadBreeds() {
  loadingBreeds.value = true
  try {
    const res: any = await request({
      url: '/dogs/breeds',
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      breeds.value = res.data
      console.log('[DogCreate] Loaded breeds:', breeds.value.length)
      if (breeds.value.length === 0) {
        uni.showToast({
          title: '品种列表为空，请先运行seed脚本',
          icon: 'none',
          duration: 3000
        })
      }
    } else {
      throw new Error(res.message || 'Failed to load breeds')
    }
  } catch (err) {
    console.error('[DogCreate] Load breeds error:', err)
    uni.showToast({
      title: '加载品种列表失败',
      icon: 'none',
      duration: 2000
    })
  } finally {
    loadingBreeds.value = false
  }
}

// 加载已有的狗狗档案
async function loadDogProfile(dogId: string) {
  try {
    console.log('[DogCreate] loadDogProfile called with dogId:', dogId)
    uni.showLoading({ title: '加载中...' })

    const res: any = await request({
      url: `/dogs/${dogId}`,
      method: 'GET'
    })

    console.log('[DogCreate] loadDogProfile API response:', res)

    if (res.code === 0 && res.data && res.data.profile) {
      populateFormData(res.data.profile)

      console.log('[DogCreate] Dog profile loaded successfully:', res.data.profile)
      uni.showToast({
        title: '加载成功',
        icon: 'success',
        duration: 1000
      })
    } else {
      console.error('[DogCreate] API response format error:', res)
      throw new Error(res.message || 'Failed to load dog profile')
    }
  } catch (err: any) {
    console.error('[DogCreate] Load dog profile error:', err)
    uni.showToast({
      title: err.message || '加载档案失败',
      icon: 'none',
      duration: 2000
    })
  } finally {
    uni.hideLoading()
  }
}

// 将 API 数据填充到表单
function populateFormData(profile: any) {
  console.log('[DogCreate] populateFormData called with profile:', profile)

  // 基本信息
  formData.value.name = profile.name || ''
  formData.value.birthday = profile.birthday ?
    new Date(profile.birthday).toISOString().split('T')[0] : ''
  formData.value.gender = profile.gender || 'MALE'
  formData.value.isNeutered = profile.isNeutered ?? false
  formData.value.currentWeightKg = profile.currentWeightKg?.toString() || ''
  formData.value.bcsScore = profile.bcsScore || 5
  formData.value.activityLevel = profile.activityLevel || 'NORMAL'
  formData.value.lifeStageOverride = profile.lifeStageOverride || 'NONE'
  formData.value.sizeClassOverride = profile.sizeClassOverride || null
  formData.value.mealsPerDay = (profile.mealsPerDay || 2).toString()
  formData.value.treatInputMode = profile.treatInputMode || 'ESTIMATE_LEVEL'
  formData.value.treatLevel = profile.treatLevel || 'LOW'
  formData.value.manualTreatKcal = profile.manualTreatKcal?.toString() || ''
  formData.value.medicalHistory = profile.medicalHistory || ''

  // 品种信息
  formData.value.breedId = profile.breedId || ''
  formData.value.customBreedName = profile.customBreedName || ''

  console.log('[DogCreate] Breed info - breedId:', formData.value.breedId, 'customBreedName:', formData.value.customBreedName)

  // 判断是否为混血犬
  const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'
  if (profile.breedId === MIXED_BREED_VIRTUAL_ID) {
    isMixedBreed.value = true
    selectedBreed.value = null
    console.log('[DogCreate] Detected mixed breed dog')
  } else {
    // 查找品种对象
    const breed = breeds.value.find(b => b.id === profile.breedId)
    if (breed) {
      selectedBreed.value = breed
      isMixedBreed.value = false
      console.log('[DogCreate] Found breed in list:', breed)
    } else {
      console.warn('[DogCreate] Breed not found in list:', profile.breedId)
      selectedBreed.value = null
      isMixedBreed.value = false
    }
  }

  console.log('[DogCreate] Form data after populate:', {
    name: formData.value.name,
    breedId: formData.value.breedId,
    customBreedName: formData.value.customBreedName,
    sizeClassOverride: formData.value.sizeClassOverride,
    isMixedBreed: isMixedBreed.value,
    selectedBreed: selectedBreed.value?.name
  })

  // 如果有缓存的计算结果，可以选择显示
  if (profile.cachedTargetFoodKcal) {
    console.log('[DogCreate] Cached target food kcal:', profile.cachedTargetFoodKcal)
  }
}

function onSearchInput(e: any) {
  searchKeyword.value = e.detail.value
}

function selectBreed(breed: Breed) {
  selectedBreed.value = breed
  isMixedBreed.value = false
  formData.value.breedId = breed.id
  formData.value.sizeClassOverride = null  // Reset override
  searchKeyword.value = ''
  previewCalculation()
}

function selectBreedByName(name: string) {
  const breed = breeds.value.find(b => b.name === name)
  if (breed) {
    selectBreed(breed)
  }
}

function selectMixedBreed() {
  showCustomBreedInput.value = true
}

function confirmCustomBreed() {
  const name = customBreedName.value.trim() || '混血/其他'
  selectedBreed.value = null
  isMixedBreed.value = true
  formData.value.breedId = MIXED_BREED_VIRTUAL_ID
  formData.value.customBreedName = name
  formData.value.sizeClassOverride = null  // User must select
  showCustomBreedInput.value = false
  customBreedName.value = ''
}

function cancelCustomBreed() {
  showCustomBreedInput.value = false
  customBreedName.value = ''
}

function clearBreed() {
  selectedBreed.value = null
  isMixedBreed.value = false
  formData.value.breedId = ''
  formData.value.customBreedName = ''
  formData.value.sizeClassOverride = null
  searchKeyword.value = ''
}

function toggleCommonBreeds() {
  showCommonBreeds.value = !showCommonBreeds.value
}

function toggleAllBreeds() {
  showAllBreeds.value = !showAllBreeds.value

  // 展开时计算各分类的位置
  if (showAllBreeds.value) {
    // 延迟执行，确保 DOM 已完全渲染
    // 增加延迟时间到 500ms，确保布局稳定
    setTimeout(() => {
      calculateCategoryPositions()
    }, 500)
  }
}

// 计算各分类的顶部位置（使用真实 DOM 位置）
function calculateCategoryPositions() {
  const positions: Record<string, number> = {}

  // 使用 Promise 包装查询，确保顺序执行
  const promises = sizeCategories.map(cat => {
    return new Promise<number>((resolve) => {
      const query = uni.createSelectorQuery()
      query.select('#category-' + cat.key).boundingClientRect()
      query.select('.breed-content-scroll').boundingClientRect()
      query.exec((res) => {
        if (res && res[0] && res[1]) {
          const categoryRect = res[0]
          const scrollRect = res[1]
          // 计算相对于 scroll-view 内容顶部的位置
          // categoryRect.top 是分类标题相对于视口的位置
          // scrollRect.top 是 scroll-view 相对于视口的位置
          // 两者相减得到分类标题相对于 scroll-view 顶部的位置
          resolve(categoryRect.top - scrollRect.top)
        } else {
          resolve(0)
        }
      })
    })
  })

  Promise.all(promises).then((positionValues) => {
    sizeCategories.forEach((cat, index) => {
      positions[cat.key] = positionValues[index]
    })
    categoryPositions.value = positions
    console.log('[DogCreate] Real category positions:', positions)
  })
}

// 滚动到指定体型分类
function scrollToCategory(categoryKey: string) {
  activeCategory.value = categoryKey
  scrollToViewId.value = 'category-' + categoryKey

  // 滚动完成后，高亮会由 onScroll 自动维护
  // 这里只需设置 scrollToViewId，让 scroll-view 自动滚动
}

// 监听滚动事件，更新当前激活的分类
function onScroll(e: any) {
  const scrollTop = e.detail.scrollTop

  // 如果还没有计算位置，先计算
  if (Object.keys(categoryPositions.value).length === 0) {
    calculateCategoryPositions()
    // 位置计算是异步的，暂时返回
    return
  }

  const positions = categoryPositions.value
  const viewportHeight = scrollViewHeight.value // 600px

  // 找到当前最可见的分类
  // 策略：选择分类标题最接近视口顶部（但在视口上半部分）的分类
  let bestCategory = 'SMALL'
  let bestScore = Infinity

  for (const [category, position] of Object.entries(positions)) {
    // 计算分类标题距离视口顶部的距离
    const distanceFromTop = position - scrollTop

    // 如果分类标题在视口上半部分（距离顶部 0 到 viewportHeight/2 之间）
    // 并且距离越小越好
    if (distanceFromTop >= 0 && distanceFromTop <= viewportHeight / 2) {
      if (distanceFromTop < bestScore) {
        bestScore = distanceFromTop
        bestCategory = category
      }
    }
    // 如果所有分类都在视口上方（滚动到底部），选择最后一个
    else if (scrollTop > position) {
      // 找出所有位置小于 scrollTop 的分类中，最大的那个
      const currentBestPos = positions[bestCategory]
      if (position > currentBestPos) {
        bestCategory = category
      }
    }
  }

  activeCategory.value = bestCategory
}

function onSizeClassChange(e: any) {
  const index = e.detail.value
  formData.value.sizeClassOverride = sizeClassOptions[index]
  previewCalculation()
}

function getSizeClassDisplay(): string {
  const override = formData.value.sizeClassOverride
  const labels: Record<string, string> = {
    'SMALL': '小型犬',
    'MEDIUM': '中型犬',
    'LARGE': '大型犬',
    'GIANT': '巨型犬'
  }

  if (isMixedBreed.value) {
    return override ? labels[override] : '请选择'
  }

  if (override) {
    return `${labels[override]} (手动调整)`
  }

  if (selectedBreed.value) {
    return `${labels[selectedBreed.value.sizeCategory]} (自动匹配)`
  }

  return '请先选择品种'
}

function getSizeClassHint(): string {
  if (isMixedBreed.value) {
    return '混血犬需要手动选择体型分类'
  }
  if (formData.value.sizeClassOverride) {
    return '点击 ✏️ 可重新调整'
  }
  return '点击 ✏️ 可修改系统自动判断的体型'
}

function onBirthdayChange(e: any) {
  formData.value.birthday = e.detail.value
}

// 选择性别
function selectGender(gender: 'MALE' | 'FEMALE') {
  formData.value.gender = gender
}

// 选择是否绝育
function selectNeutered(value: boolean) {
  formData.value.isNeutered = value
}

function onBcsChange(e: any) {
  formData.value.bcsScore = e.detail.value
}

// 选择活动水平
function selectActivityLevel(value: string) {
  formData.value.activityLevel = value
}

// BCS弹窗相关函数
function onBcsImageLoad() {
  console.log('[BCS Guide] Image loaded successfully')
  bcsImageError.value = false
}

function onBcsImageError() {
  console.error('[BCS Guide] Failed to load BCS guide image')
  bcsImageError.value = true
}

function onCloseBcsGuide() {
  showBcsGuide.value = false
  bcsGuideShown.value = true
}

// 切换健康记录折叠面板
function toggleHealthRecord() {
  showHealthRecord.value = !showHealthRecord.value
}

// ========== 生命阶段选择函数 ==========

/**
 * 保持自动识别
 */
function keepAutoDetectedLifeStage() {
  formData.value.lifeStageOverride = 'NONE'
  showLifeStageOverride.value = false
}

/**
 * 切换到手动覆盖模式
 */
function enableLifeStageOverride() {
  showLifeStageOverride.value = true
  // 如果当前还没有设置覆盖，默认设置为幼犬期
  if (!formData.value.lifeStageOverride || formData.value.lifeStageOverride === 'NONE') {
    formData.value.lifeStageOverride = 'PUPPY'
  }
}

/**
 * 选择手动覆盖的生命阶段
 */
function selectLifeStageOverride(stage: string) {
  formData.value.lifeStageOverride = stage
}

/**
 * 取消手动覆盖，恢复自动识别
 */
function cancelLifeStageOverride() {
  formData.value.lifeStageOverride = 'NONE'
  showLifeStageOverride.value = false
}

// ========== 生命阶段选择函数结束 ==========

function onLifeStageChange(e: any) {
  formData.value.lifeStageOverride = lifeStageOptions[e.detail.value]
}

// ========== 零食选择函数 ==========

/**
 * 选择零食输入模式
 */
function selectTreatInputMode(mode: string) {
  formData.value.treatInputMode = mode
  // 切换模式时设置默认值
  if (mode === 'ESTIMATE_LEVEL') {
    // 估算模式：使用默认LOW级别
    if (!formData.value.treatLevel || formData.value.treatLevel === 'NONE') {
      formData.value.treatLevel = 'LOW'
    }
  }
  // 精确模式不需要特殊处理，保持原有输入值
}

/**
 * 选择零食量级别
 */
function selectTreatLevel(level: string) {
  formData.value.treatLevel = level
}

// ========== 零食选择函数结束 ==========

async function previewCalculation() {
  // Only calculate if we have minimum required fields
  // Silently return if not ready - don't show error to user
  if (!canPreview.value) {
    return
  }

  calculating.value = true
  try {
    const payload: any = {
      breedId: formData.value.breedId,
      birthday: new Date(formData.value.birthday).toISOString(),
      gender: formData.value.gender,
      isNeutered: formData.value.isNeutered,
      currentWeightKg: parseFloat(formData.value.currentWeightKg),
      bcsScore: formData.value.bcsScore,
      activityLevel: formData.value.activityLevel,
      lifeStageOverride: formData.value.lifeStageOverride,
      sizeClassOverride: formData.value.sizeClassOverride,
      mealsPerDay: parseInt(formData.value.mealsPerDay) || 2,
      treatInputMode: formData.value.treatInputMode,
      treatLevel: formData.value.treatLevel
    }

    if (formData.value.treatInputMode === 'EXACT_KCAL' && formData.value.manualTreatKcal) {
      payload.manualTreatKcal = parseFloat(formData.value.manualTreatKcal)
    }

    console.log('[DogCreate] Preview calculation payload:', payload)

    const res: any = await request({
      url: '/dogs/calc-preview',
      method: 'POST',
      data: payload
    })

    console.log('[DogCreate] Preview calculation response:', res)

    if (res.code === 0 && res.data) {
      calcResult.value = {
        rer: res.data.rer,
        totalDer: res.data.totalDer,
        finalFoodKcal: res.data.finalFoodKcal,
        treatDeduction: res.data.treatDeduction,
        isTreatCapped: res.data.isTreatCapped,
        dailyIntakeG: res.data.dailyIntakeG
      }
      console.log('[DogCreate] Preview calculation result:', calcResult.value)
      uni.showToast({
        title: '计算完成',
        icon: 'success',
        duration: 1500
      })
    } else {
      throw new Error(res.message || 'Calculation failed')
    }
  } catch (err: any) {
    console.error('[DogCreate] Preview calculation error:', err)
    uni.showToast({
      title: err?.message || '计算失败，请检查输入',
      icon: 'none',
      duration: 2000
    })
    calcResult.value = null
  } finally {
    calculating.value = false
  }
}

function submit() {
  const { name, breedId, birthday, currentWeightKg, activityLevel } = formData.value

  // Validation
  if (!name || !breedId || !birthday || !currentWeightKg || !activityLevel) {
    uni.showToast({
      title: '请填写必填项',
      icon: 'none'
    })
    return
  }

  // For mixed breed, require size class override
  if (isMixedBreed.value && !formData.value.sizeClassOverride) {
    uni.showToast({
      title: '混血犬请选择体型分类',
      icon: 'none'
    })
    return
  }

  if (formData.value.treatInputMode === 'EXACT_KCAL' && !formData.value.manualTreatKcal) {
    uni.showToast({
      title: '精确模式需填写零食能量',
      icon: 'none'
    })
    return
  }

  // Check if we're in edit mode (use dogId ref)
  const isEditModeValue = !!dogId.value

  uni.showLoading({ title: isEditModeValue ? '保存中...' : '创建中...' })

  const payload: any = {
    name,
    breedId,
    customBreedName: formData.value.customBreedName || null,
    birthday: new Date(birthday).toISOString(),
    gender: formData.value.gender,
    isNeutered: formData.value.isNeutered,
    currentWeightKg: parseFloat(currentWeightKg),
    bcsScore: formData.value.bcsScore,
    activityLevel: formData.value.activityLevel,
    lifeStageOverride: formData.value.lifeStageOverride,
    sizeClassOverride: formData.value.sizeClassOverride,
    mealsPerDay: parseInt(formData.value.mealsPerDay) || 2,
    medicalHistory: formData.value.medicalHistory || null
  }

  // 只有当用户选择了零食输入模式时才发送相关字段
  if (formData.value.treatInputMode) {
    payload.treatInputMode = formData.value.treatInputMode
    payload.treatLevel = formData.value.treatLevel
  }

  if (formData.value.treatInputMode === 'EXACT_KCAL') {
    payload.manualTreatKcal = parseFloat(formData.value.manualTreatKcal)
  }

  // Debug log: Show submit payload
  console.log('[DogCreate] Submit payload:', JSON.stringify(payload, null, 2))
  console.log('[DogCreate] Submit payload breedId:', payload.breedId)
  console.log('[DogCreate] formData.breedId:', formData.value.breedId)
  console.log('[DogCreate] selectedBreed:', selectedBreed.value)

  // Use different endpoint for edit vs create
  const requestConfig = {
    url: isEditModeValue ? `/dogs/${dogId.value}` : '/dogs',
    method: isEditModeValue ? 'PUT' : 'POST',
    data: payload
  }

  request(requestConfig).then((res: any) => {
    console.log('[DogCreate] Submit response:', res)
    if (res.code === 0 && res.data) {
      const updatedDog = res.data.profile || res.data
      console.log('[DogCreate] Updated dog data:', updatedDog)
      console.log('[DogCreate] Updated dog breedId:', updatedDog.breedId)
      const resultDogId = updatedDog.id

      if (!resultDogId) {
        console.error('[DogCreate] Response missing dog id:', res.data)
        uni.showToast({
          title: isEditModeValue ? '保存失败：响应格式错误' : '创建失败：响应格式错误',
          icon: 'none',
          duration: 2000
        })
        return
      }

      console.info(`[DogCreate] Dog ${isEditModeValue ? 'updated' : 'created'} successfully: id=${resultDogId}, name=${updatedDog.name}`)

      // Update cache
      if (isEditModeValue) {
        addDogToCache(updatedDog)
      } else {
        uni.setStorageSync('dogId', resultDogId)
        addDogToCache(updatedDog)
      }

      uni.showToast({
        title: isEditModeValue ? '保存成功' : '创建成功',
        icon: 'success',
        duration: 1500
      })

      setTimeout(() => {
        // 跳转到狗狗档案列表页面
    // dog-profile-list 是 tabBar 页面，必须使用 switchTab
    uni.switchTab({
      url: '/pages/dog-profile-list/index'
    })
  }, 1500)
    } else {
      const errorMsg = res.message || (isEditModeValue ? '保存失败' : '创建失败')
      console.error('[DogCreate] API error:', res.code, errorMsg)
      uni.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 2000
      })
    }
  }).catch((err: any) => {
    const errMsg = err?.message || String(err) || '网络错误'
    console.error('[DogCreate]', isEditModeValue ? 'Update' : 'Create', 'dog error:', err)

    let userMsg = isEditModeValue ? '保存失败，请稍后重试' : '创建失败，请稍后重试'
    if (errMsg.includes('400') || errMsg.includes('Bad Request')) {
      userMsg = '请求参数错误，请检查填写内容'
    } else if (errMsg.includes('网络') || errMsg.includes('连接') || errMsg.includes('timeout')) {
      userMsg = '网络连接失败，请检查网络设置'
    }

    uni.showToast({
      title: userMsg,
      icon: 'none',
      duration: 2000
    })
  }).finally(() => {
    uni.hideLoading()
  })
}
</script>

<style scoped>
.container {
  padding: 20rpx;
}

.form-section {
  background-color: #fff;
  padding: 30rpx;
  border-radius: 8rpx;
}

.loading-notice {
  background-color: #f0f0f0;
  border-radius: 8rpx;
  padding: 20rpx;
  margin-bottom: 30rpx;
  text-align: center;
  font-size: 28rpx;
  color: #666;
}

.form-item {
  margin-bottom: 30rpx;
}

.breed-section {
  margin-bottom: 40rpx;
}

.label {
  display: block;
  font-size: 28rpx;
  margin-bottom: 10rpx;
  color: #333;
  font-weight: bold;
}

/* Breed Selection Styles */
.breed-selector {
  border: 1px solid #ddd;
  border-radius: 8rpx;
  overflow: hidden;
}

.search-box {
  padding: 20rpx;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
}

.search-input {
  width: 100%;
  height: 70rpx;
  border: 1px solid #ddd;
  border-radius: 6rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.section {
  padding: 20rpx;
  border-bottom: 1px solid #e9ecef;
}

.section:last-child {
  border-bottom: none;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15rpx;
}

.section-title {
  font-size: 26rpx;
  color: #666;
  font-weight: bold;
  display: block;
  margin-bottom: 15rpx;
}

.toggle-icon {
  font-size: 24rpx;
  color: #999;
}

/* Common Breeds Tags */
.common-breeds {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
}

.breed-tag {
  background-color: #e6f7ff;
  color: #1890ff;
  padding: 10rpx 20rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  border: 1px solid #91d5ff;
}

/* Breed List */
.breed-list {
  max-height: 400rpx;
  overflow-y: auto;
}

.all-breeds-list {
  max-height: 600rpx;
}

.breed-item {
  padding: 20rpx;
  border-bottom: 1px solid #f0f0f0;
  font-size: 28rpx;
  color: #333;
}

.breed-item:last-child {
  border-bottom: none;
}

.no-results {
  padding: 40rpx;
  text-align: center;
  color: #999;
  font-size: 26rpx;
}

/* Mixed Breed Button */
.mixed-breed-btn {
  background-color: #fff7e6;
  color: #fa8c16;
  padding: 25rpx;
  border-radius: 8rpx;
  text-align: center;
  font-size: 28rpx;
  font-weight: bold;
  border: 1px solid #ffd591;
}

/* Selected Breed Display */
.selected-breed-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background-color: #f8f9fa;
  border: 1px solid #ddd;
  border-radius: 8rpx;
}

.selected-text {
  font-size: 28rpx;
  color: #333;
  font-weight: bold;
}

.change-btn {
  color: #1890ff;
  font-size: 26rpx;
}

/* Size Class Display */
.size-display {
  background-color: #f8f9fa;
  padding: 20rpx;
  border-radius: 8rpx;
  border: 1px solid #e9ecef;
}

.size-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15rpx;
  background-color: #fff;
  border: 1px solid #ddd;
  border-radius: 6rpx;
}

.size-text {
  font-size: 28rpx;
  color: #333;
  font-weight: bold;
}

.edit-icon {
  font-size: 32rpx;
  color: #1890ff;
}

/* Original Input Styles */
.input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.textarea {
  width: 100%;
  min-height: 150rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.picker {
  height: 80rpx;
  line-height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
}

.hint {
  display: block;
  font-size: 24rpx;
  color: #999;
  margin-top: 5rpx;
}

.size-required {
  border-color: #ff4d4f !important;
  background-color: #fff1f0 !important;
}

.hint-warning {
  color: #ff4d4f !important;
  font-weight: bold;
}

.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  margin-top: 20rpx;
  border: none;
}

.btn:disabled {
  background-color: #ccc;
  color: #999;
}

.btn-secondary {
  background-color: #1890ff;
  margin-top: 20rpx;
}

.recommendation-card {
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8rpx;
  padding: 30rpx;
  margin-top: 30rpx;
}

.card-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
  border-bottom: 1px solid #e9ecef;
  padding-bottom: 15rpx;
}

.calc-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15rpx 0;
  border-bottom: 1px solid #f0f0f0;
}

.calc-item:last-child {
  border-bottom: none;
}

.calc-item.highlight-item {
  background-color: #e6f7ff;
  padding: 20rpx;
  border-radius: 4rpx;
  margin: 10rpx 0;
  border-bottom: none;
}

.calc-label {
  font-size: 28rpx;
  color: #666;
  flex: 1;
}

.calc-value {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.calc-value.highlight {
  color: #1890ff;
  font-weight: bold;
  font-size: 32rpx;
}

.calc-warning {
  background-color: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 4rpx;
  padding: 15rpx;
  margin-top: 15rpx;
  font-size: 26rpx;
  color: #fa8c16;
  line-height: 1.5;
}

/* Collapsed Common Breeds */
.common-breeds.collapsed {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
  max-height: 80rpx;
  overflow: hidden;
}

/* Size Category Groups with Sidebar Navigation */
.breed-selector-with-sidebar {
  display: flex;
  height: 600rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  overflow: hidden;
  background-color: #fff;
}

/* 侧边快速导航栏 */
.quick-nav-sidebar {
  width: 100rpx;
  background-color: #f5f5f5;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20rpx 10rpx;
  border-bottom: 1px solid #e8e8e8;
  transition: all 0.3s ease;
  cursor: pointer;
}

.nav-item:last-child {
  border-bottom: none;
}

.nav-item.active {
  background-color: #fff;
  box-shadow: 0 0 10rpx rgba(0, 0, 0, 0.1);
  border-left: 3px solid #1890ff;
}

.nav-icon {
  font-size: 28rpx;
  margin-bottom: 4rpx;
}

.nav-label {
  font-size: 20rpx;
  color: #666;
}

.nav-item.active .nav-label {
  color: #1890ff;
  font-weight: bold;
}

/* 品种内容滚动区 */
.breed-content-scroll {
  flex: 1;
  height: 100%;
  overflow-y: auto;
}

.size-category-group {
  margin-bottom: 20rpx;
}

.size-category-group:last-child {
  margin-bottom: 0;
}

.size-category-title {
  font-size: 28rpx;
  font-weight: bold;
  padding: 20rpx;
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  border-radius: 4rpx;
  margin-bottom: 15rpx;
}

/* 不同分类的颜色主题 */
.size-category-group[data-category="SMALL"] .size-category-title {
  background: linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%);
  color: #0050b3;
  border-left: 4px solid #1890ff;
}

.size-category-group[data-category="MEDIUM"] .size-category-title {
  background: linear-gradient(135deg, #fffbe6 0%, #fff1b8 100%);
  color: #ad6800;
  border-left: 4px solid #faad14;
}

.size-category-group[data-category="LARGE"] .size-category-title {
  background: linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%);
  color: #389e0d;
  border-left: 4px solid #52c41a;
}

.size-category-group[data-category="GIANT"] .size-category-title {
  background: linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%);
  color: #722ed1;
  border-left: 4px solid #722ed1;
}

/* 品种网格布局 */
.breed-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
  padding: 0 20rpx 20rpx 20rpx;
}

.breed-item {
  background-color: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6rpx;
  padding: 15rpx 25rpx;
  font-size: 26rpx;
  color: #333;
  text-align: center;
  min-width: 120rpx;
  transition: all 0.2s ease;
  cursor: pointer;
}

.breed-item:active {
  background-color: #e6f7ff;
  border-color: #1890ff;
  transform: scale(0.95);
}

/* Custom Breed Input Modal */
.custom-breed-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.custom-breed-content {
  width: 600rpx;
  background-color: #fff;
  border-radius: 12rpx;
  padding: 40rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.15);
}

.custom-breed-title {
  font-size: 32rpx;
  color: #333;
  font-weight: bold;
  margin-bottom: 30rpx;
  display: block;
  text-align: center;
}

.custom-breed-input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
  margin-bottom: 30rpx;
}

.custom-breed-actions {
  display: flex;
  gap: 20rpx;
}

.custom-breed-btn-cancel,
.custom-breed-btn-confirm {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  text-align: center;
  border: none;
}

.custom-breed-btn-cancel {
  background-color: #f5f5f5;
  color: #666;
  border: 1px solid #ddd;
}

.custom-breed-btn-confirm {
  background-color: #07c160;
  color: #fff;
}

/* Gender Selector */
.gender-selector {
  display: flex;
  gap: 20rpx;
}

.gender-option {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 18rpx 20rpx;
  background-color: #f5f5f5;
  border: 2px solid #e0e0e0;
  border-radius: 12rpx;
  transition: all 0.3s;
}

.gender-option-male.active {
  background-color: #e6f7ff;
  border-color: #1890ff;
}

.gender-option-male.active .gender-icon,
.gender-option-male.active .gender-label {
  color: #1890ff;
  font-weight: bold;
}

.gender-option-female.active {
  background-color: #fff0f6;
  border-color: #FF99CC;
}

.gender-option-female.active .gender-icon,
.gender-option-female.active .gender-label {
  color: #FF99CC;
  font-weight: bold;
}

.gender-icon {
  font-size: 36rpx;
  color: #666;
}

.gender-label {
  font-size: 26rpx;
  color: #666;
}

/* Neutered Selector */
.neutered-selector {
  display: flex;
  gap: 20rpx;
}

.neutered-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18rpx 20rpx;
  background-color: #f5f5f5;
  border: 2px solid #e0e0e0;
  border-radius: 12rpx;
  transition: all 0.3s;
}

.neutered-option.active {
  background-color: #e6f7ff;
  border-color: #1890ff;
}

.neutered-label {
  font-size: 28rpx;
  color: #666;
}

.neutered-option.active .neutered-label {
  color: #1890ff;
  font-weight: bold;
}

/* BCS Score Row */
.bcs-score-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
}

.bcs-slider {
  flex: 1;
  min-width: 0;
}

.bcs-body-status {
  font-size: 26rpx;
  font-weight: bold;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 8rpx 12rpx;
  background-color: #f5f5f5;
  border-radius: 8rpx;
}

/* Activity Level Options */
.activity-level-container {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.activity-level-option {
  padding: 20rpx;
  background-color: #f5f5f5;
  border: 2px solid #e0e0e0;
  border-radius: 12rpx;
  transition: all 0.3s;
}

.activity-level-option.active {
  background-color: #e6f7ff;
  border-color: #1890ff;
}

.activity-level-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}

.activity-level-label {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.activity-level-option.active .activity-level-label {
  color: #1890ff;
}

.activity-level-coefficient {
  font-size: 26rpx;
  font-weight: bold;
  color: #ff4d4f;
  background-color: #fff1f0;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.activity-level-description {
  font-size: 24rpx;
  color: #666;
  line-height: 1.5;
}

/* BCS Guide Popup */
.bcs-guide-popup {
  width: 650rpx;
  max-height: 85vh;
  background-color: #fff;
  border-radius: 16rpx;
  padding: 30rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.bcs-guide-title {
  font-size: 32rpx;
  font-weight: bold;
  text-align: center;
  color: #333;
  margin-bottom: 20rpx;
  width: 100%;
}

.bcs-image-container {
  width: 100%;
  flex: 1;
  overflow-y: auto;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.bcs-guide-image {
  width: 100%;
  height: auto;
  border-radius: 8rpx;
  display: block;
}

.bcs-image-error {
  padding: 60rpx 20rpx;
  text-align: center;
  color: #999;
  font-size: 26rpx;
}

/* Health Record Section */
.health-record-section {
  margin-bottom: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  overflow: hidden;
}

.health-record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 30rpx;
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 12rpx;
  cursor: pointer;
}

.health-record-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.toggle-icon {
  font-size: 24rpx;
  color: #999;
  transition: transform 0.3s;
}

.health-record-content {
  padding: 20rpx 30rpx;
  background-color: #f9f9f9;
}

.placeholder-box {
  padding: 40rpx 20rpx;
  background-color: #fff;
  border: 2px dashed #d0d0d0;
  border-radius: 8rpx;
  text-align: center;
}

.placeholder-text {
  font-size: 26rpx;
  color: #999;
}

/* ========== 生命阶段样式 ========== */

.life-stage-section {
  background-color: #f8f9fa;
  border-radius: 12rpx;
  padding: 24rpx;
  border: 1px solid #e9ecef;
}

/* 生命阶段内容区域 */
.life-stage-content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

/* 自动匹配结果展示 */
.auto-match-result {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx;
  background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%);
  border-radius: 8rpx;
  border-left: 4px solid #1890ff;
  flex-wrap: wrap;
}

.auto-match-text {
  font-size: 30rpx;
  color: #1890ff;
  font-weight: bold;
}

.auto-match-label {
  font-size: 26rpx;
  color: #666;
  font-weight: 500;
}

/* 手动选择触发按钮 */
.manual-select-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 24rpx;
  background-color: #fff;
  border: 2px dashed #d0d0d0;
  border-radius: 12rpx;
  transition: all 0.3s;
}

.manual-select-trigger:active {
  background-color: #f5f5f5;
  border-color: #1890ff;
}

.manual-select-text {
  font-size: 28rpx;
  color: #1890ff;
  font-weight: 500;
}

.manual-select-icon {
  font-size: 24rpx;
  color: #1890ff;
}

/* 未填写生日提示 */
.life-stage-prompt {
  padding: 32rpx;
  background-color: #fffbe6;
  border-radius: 8rpx;
  text-align: center;
  border: 1px solid #ffe58f;
}

.prompt-text {
  font-size: 26rpx;
  color: #ad6800;
  line-height: 1.6;
}

/* 手动选择面板 */
.life-stage-override-panel {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 20rpx;
  background-color: #fff;
  border-radius: 8rpx;
  border: 2px solid #e0e0e0;
}

.override-title {
  font-size: 26rpx;
  color: #666;
  font-weight: bold;
  padding-bottom: 12rpx;
  border-bottom: 1px solid #f0f0f0;
}

.override-options {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.override-option {
  padding: 16rpx;
  background-color: #f5f5f5;
  border: 2px solid #e0e0e0;
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  transition: all 0.2s;
}

.override-option.active {
  background-color: #e6f7ff;
  border-color: #1890ff;
}

.override-option-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.override-option.active .override-option-label {
  color: #1890ff;
  font-weight: bold;
}

.override-option-desc {
  font-size: 24rpx;
  color: #999;
  line-height: 1.4;
}

/* 取消按钮 */
.cancel-override-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 20rpx;
  margin-top: 8rpx;
  background-color: #f5f5f5;
  border: 1px solid #d0d0d0;
  border-radius: 8rpx;
  transition: all 0.2s;
}

.cancel-override-btn:active {
  background-color: #e8e8e8;
}

.cancel-override-icon {
  font-size: 28rpx;
  color: #999;
}

.cancel-override-text {
  font-size: 26rpx;
  color: #666;
  font-weight: 500;
}

/* ========== 零食设置样式 ========== */

.treat-section {
  background-color: #f8f9fa;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-label {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 20rpx;
}

.field-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  display: block;
  margin-bottom: 12rpx;
}

/* 零食模式提示 */
.treat-mode-hint {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;
  background-color: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 8rpx;
}

.hint-icon {
  font-size: 32rpx;
  flex-shrink: 0;
}

.hint-text {
  font-size: 26rpx;
  color: #ad6800;
  line-height: 1.5;
}

/* 零食输入模式选择器 */
.treat-mode-selector,
.treat-level-selector {
  margin-bottom: 20rpx;
}

.treat-exact-input {
  margin-bottom: 20rpx;
}

/* 卡片选项容器 */
.card-options {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

/* 横向布局的卡片选项容器 */
.card-options-horizontal {
  flex-direction: row;
  gap: 16rpx;
}

/* 单个卡片 */
.card-option {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx;
  background-color: #fff;
  border: 2px solid #e0e0e0;
  border-radius: 12rpx;
  transition: all 0.3s;
}

.card-option.active {
  background-color: #e6f7ff;
  border-color: #1890ff;
}

/* 简化卡片（无圆圈，用于输入模式选择） */
.card-option-simple {
  flex: 1;
  justify-content: center;
  padding: 24rpx 16rpx;
}

/* 单选按钮 */
.card-radio {
  width: 40rpx;
  height: 40rpx;
  border: 3px solid #d0d0d0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-option.active .card-radio {
  border-color: #1890ff;
}

.radio-checked {
  width: 20rpx;
  height: 20rpx;
  background-color: #1890ff;
  border-radius: 50%;
}

/* 卡片内容 */
.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.card-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.card-option.active .card-label {
  color: #1890ff;
  font-weight: bold;
}

.card-label-simple {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  flex: 1;
  text-align: center;
}

.card-option-simple.active .card-label-simple {
  color: #1890ff;
  font-weight: bold;
}

.card-desc {
  font-size: 24rpx;
  color: #999;
  line-height: 1.4;
}

/* 零食量卡片特殊样式 */
.treat-level-card .card-label {
  font-size: 28rpx;
}

/* 精确输入框 */
.treat-exact-input .input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.input-white-bg {
  background-color: #ffffff !important;
}
</style>
