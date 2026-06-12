<template>
  <div class="dog-detail-page">
    <!-- Header -->
    <div class="page-header">
      <el-button @click="handleBack" :icon="ArrowLeft">返回</el-button>
      <h2>{{ isCreateMode ? '新增档案' : (isEditMode ? '编辑档案' : '档案详情') }}</h2>
    </div>

    <el-card v-loading="loading">
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
        :disabled="isViewMode"
      >
        <!-- Basic Info -->
        <div class="section-title">基本信息</div>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="formData.name" placeholder="请输入狗狗姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="品种" prop="breedId">
              <el-select
                v-model="formData.breedId"
                placeholder="请选择品种"
                filterable
                @change="handleBreedChange"
                style="width: 100%"
              >
                <el-option
                  v-for="breed in breeds"
                  :key="breed.id"
                  :label="breed.name"
                  :value="breed.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- Common Breeds Quick Select -->
        <el-form-item label="常见品种">
          <div class="common-breeds-scroll">
            <el-tag
              v-for="breedName in commonBreeds"
              :key="breedName"
              class="common-breed-tag"
              @click="selectBreedByName(breedName)"
              :type="isBreedSelected(breedName) ? 'primary' : 'info'"
              style="cursor: pointer"
            >
              {{ breedName }}
            </el-tag>
          </div>
        </el-form-item>

        <!-- Breeds by Size Category -->
        <el-form-item label="按体型选择">
          <div class="size-category-selector">
            <el-button
              v-for="category in sizeCategories"
              :key="category.key"
              :type="expandedSizeCategory === category.key ? 'primary' : 'default'"
              :class="{ 'is-active': expandedSizeCategory === category.key }"
              @click="toggleSizeCategory(category.key)"
              class="size-category-btn"
            >
              {{ category.label }} ({{ getBreedsBySize(category.key).length }}种)
            </el-button>
          </div>

          <div v-if="expandedSizeCategory" class="breeds-by-size-expanded">
            <el-tag
              v-for="breed in getBreedsBySize(expandedSizeCategory)"
              :key="breed.id"
              class="breed-tag"
              @click="formData.breedId = breed.id; handleBreedChange()"
              :type="formData.breedId === breed.id ? 'primary' : 'info'"
              style="cursor: pointer"
            >
              {{ breed.name }}
            </el-tag>
          </div>
        </el-form-item>

        <!-- Custom Breed Name (only for mixed breeds) -->
        <el-row v-if="isMixedBreed" :gutter="20">
          <el-col :span="12">
            <el-form-item label="自定义品种名" prop="customBreedName">
              <el-input v-model="formData.customBreedName" placeholder="如：田园犬、金毛边牧混血" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- Size Class Override (moved here) -->
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="体型分类" prop="sizeClassOverride">
              <el-select
                v-model="formData.sizeClassOverride"
                placeholder="系统自动匹配"
                clearable
                style="width: 100%"
              >
                <el-option
                  v-for="(label, value) in DogSizeLabels"
                  :key="value"
                  :label="label"
                  :value="value"
                />
              </el-select>
              <div class="hint-text" v-if="!formData.sizeClassOverride">
                系统将根据品种自动判断体型，点击选择可修改
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="生日" prop="birthday">
              <el-date-picker
                v-model="formData.birthday"
                type="date"
                placeholder="选择日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生命阶段" prop="lifeStageOverride">
              <el-select v-model="formData.lifeStageOverride" placeholder="请选择" style="width: 100%">
                <el-option
                  v-for="(label, value) in LifeStageLabels"
                  :key="value"
                  :label="label"
                  :value="value"
                />
              </el-select>
              <div class="hint-text" v-if="formData.lifeStageOverride === LifeStageOverride.NONE && calcResult?.calcDetails">
                自动识别: {{ getLifeStageLabel(calcResult.calcDetails.lifeStage) }}
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="性别" prop="gender">
              <div class="gender-cards">
                <div
                  class="gender-card"
                  :class="{ 'is-active': formData.gender === DogGender.MALE }"
                  @click="formData.gender = DogGender.MALE"
                >
                  <span class="gender-icon">♂</span>
                  <span class="gender-label">公</span>
                </div>
                <div
                  class="gender-card"
                  :class="{ 'is-active': formData.gender === DogGender.FEMALE }"
                  @click="formData.gender = DogGender.FEMALE"
                >
                  <span class="gender-icon">♀</span>
                  <span class="gender-label">母</span>
                </div>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="是否绝育" prop="isNeutered">
              <div class="neutered-cards">
                <div
                  class="neutered-card"
                  :class="{ 'is-active': formData.isNeutered === true }"
                  @click="formData.isNeutered = true"
                >
                  <span class="neutered-label">是</span>
                </div>
                <div
                  class="neutered-card"
                  :class="{ 'is-active': formData.isNeutered === false }"
                  @click="formData.isNeutered = false"
                >
                  <span class="neutered-label">否</span>
                </div>
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- Body Metrics -->
        <div class="section-title">身体指标</div>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="当前体重" prop="currentWeightKg">
              <el-input-number
                v-model="formData.currentWeightKg"
                :min="0.1"
                :max="100"
                :step="0.1"
                :precision="1"
                controls-position="right"
                style="width: 200px"
              />
              <span class="unit-label">kg</span>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="BCS 体况评分" prop="bcsScore">
          <BCSSlider v-model="formData.bcsScore" />
        </el-form-item>

        <el-form-item label="活动水平" prop="activityLevel">
          <div class="activity-level-cards">
            <div
              v-for="option in activityLevelConfigs"
              :key="option.value"
              class="activity-level-card"
              :class="{ 'is-active': formData.activityLevel === option.value }"
              @click="formData.activityLevel = option.value"
            >
              <div class="activity-level-header">
                <span class="activity-level-label">{{ option.label }}</span>
                <span class="activity-level-coefficient">×{{ option.coefficient }}</span>
              </div>
              <div class="activity-level-description">{{ option.description }}</div>
            </div>
          </div>
        </el-form-item>

        <!-- Nutrition Settings -->
        <div class="section-title">营养设置</div>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="每日餐数" prop="mealsPerDay">
              <el-input-number
                v-model="formData.mealsPerDay"
                :min="1"
                :max="6"
                controls-position="right"
                style="width: 120px"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="零食配置">
          <TreatConfig
            v-model:treatInputMode="formData.treatInputMode"
            v-model:treatLevel="formData.treatLevel"
            v-model:manualTreatKcal="formData.manualTreatKcal"
          />
        </el-form-item>

        <el-form-item label="病史记录" prop="medicalHistory">
          <el-input
            v-model="formData.medicalHistory"
            type="textarea"
            :rows="3"
            placeholder="如有特殊病史请记录，如：心脏病、胰腺炎、过敏史等"
          />
        </el-form-item>

        <el-form-item label="过敏食物" prop="allergyFoods">
          <el-input
            v-model="formData.allergyFoods"
            type="textarea"
            :rows="2"
            placeholder="记录过敏的食材，如：鸡肉、牛肉、大豆等"
          />
        </el-form-item>

        <el-form-item label="挑食食物" prop="pickyFoods">
          <el-input
            v-model="formData.pickyFoods"
            type="textarea"
            :rows="2"
            placeholder="记录不爱吃或挑食的食物"
          />
        </el-form-item>

        <!-- Calc Result (Read-only) -->
        <div v-if="calcResult" class="section-title">喂食建议</div>
        <div v-if="calcResult" class="feeding-recommendation">
          <!-- Warning if treats are capped -->
          <div v-if="calcResult.isTreatCapped" class="treat-warning">
            <el-icon class="warning-icon"><Warning /></el-icon>
            <span>零食能量已超过10%上限，已自动调整为10%</span>
          </div>

          <!-- Energy Summary Cards -->
          <div class="energy-cards">
            <div class="energy-card total-der">
              <div class="energy-label">总能量需求 (DER)</div>
              <div class="energy-value">{{ calcResult.totalDer.toFixed(1) }} <span class="unit">kcal/天</span></div>
            </div>

            <div v-if="calcResult.treatDeduction > 0" class="energy-card treat">
              <div class="energy-label">零食能量估算</div>
              <div class="energy-value">-{{ calcResult.treatDeduction.toFixed(1) }} <span class="unit">kcal/天</span></div>
            </div>

            <div class="energy-card main-food">
              <div class="energy-label">每日主食能量</div>
              <div class="energy-value highlight">{{ calcResult.finalFoodKcal.toFixed(1) }} <span class="unit">kcal/天</span></div>
            </div>
          </div>

          <!-- Daily Intake -->
          <div v-if="calcResult.dailyIntakeG" class="daily-intake">
            <div class="intake-label">每日建议喂食量</div>
            <div class="intake-value">{{ calcResult.dailyIntakeG.toFixed(1) }} <span class="unit">克/天</span></div>
            <div class="intake-hint">分 {{ formData.mealsPerDay }} 餐喂食，每餐约 {{ Math.round(calcResult.dailyIntakeG / formData.mealsPerDay) }} 克</div>
            <div class="intake-hint intake-adjustment-note">
              起始喂食建议：已按国内城市犬常见活动量保守估算，请观察2-4周体重、便便和饥饿感，再按5%-10%小幅调整。
            </div>
          </div>
        </div>

        <!-- Actions -->
        <el-form-item v-if="isCreateMode || isEditMode">
          <el-button type="primary" @click="handleSubmit" :loading="submitting">保存</el-button>
          <el-button @click="handleCancel">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ArrowLeft, Warning } from '@element-plus/icons-vue'
import BCSSlider from '@/components/Dog/BCSSlider.vue'
import TreatConfig from '@/components/Dog/TreatConfig.vue'
import { dogApi, type UpdateDogDto, type CalcPreviewDto } from '@/api/dogs'
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
  ActivityLevelLabels,
  LifeStageLabels,
  DogSizeLabels,
  MIXED_BREED_VIRTUAL_ID,
  type DogProfile,
  type DogBreed,
  type DogDetailResponse,
  type DogCalcResult
} from '@/types/dog'

// Common breeds for quick selection
const DEFAULT_COMMON_BREEDS = [
  '拉布拉多', '泰迪', '贵宾犬(小型)', '贵宾犬(标准)', '金毛',
  '比熊', '哈士奇', '德牧', '边牧', '柯基',
  '萨摩耶', '法国斗牛犬', '吉娃娃', '博美', '雪纳瑞（迷你）',
  '约克夏', '马尔济斯', '腊肠犬', '阿拉斯加', '杜宾'
]

// Load common breeds from localStorage or use defaults
const loadCommonBreedsFromStorage = (): string[] => {
  try {
    const stored = localStorage.getItem('sevenkitchen_common_breeds')
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('Failed to load common breeds:', error)
  }
  return [...DEFAULT_COMMON_BREEDS]
}

const commonBreeds = ref<string[]>(loadCommonBreedsFromStorage())

// Expanded size category
const expandedSizeCategory = ref<string | null>(null)

// Size categories for grouping
const sizeCategories = [
  { key: 'SMALL', label: '小型犬' },
  { key: 'MEDIUM', label: '中型犬' },
  { key: 'LARGE', label: '大型犬' },
  { key: 'GIANT', label: '巨型犬' }
]

// Activity level configurations
const activityLevelConfigs = [
  {
    value: ActivityLevel.RESTING,
    label: '休息静养',
    description: '几乎不运动，主要时间休息或医嘱控量',
    coefficient: 0.8
  },
  {
    value: ActivityLevel.LOW,
    label: '城市日常',
    description: '每日散步约30-45分钟，适合多数国内城市犬',
    coefficient: 0.9
  },
  {
    value: ActivityLevel.NORMAL,
    label: '规律运动',
    description: '每日主动运动约1小时，活动量稳定',
    coefficient: 1.0
  },
  {
    value: ActivityLevel.HIGH,
    label: '高活动',
    description: '每日运动2-4小时，经常跑步或玩耍',
    coefficient: 1.2
  },
  {
    value: ActivityLevel.WORKING,
    label: '工作犬',
    description: '高强度训练或工作，如搜救犬、警犬',
    coefficient: 1.5
  }
]

const router = useRouter()
const route = useRoute()

// Computed
const dogId = computed(() => route.params.id as string)
const isCreateMode = computed(() => route.name === 'DogCreate')
const isEditMode = computed(() => route.name === 'DogEdit')
const isViewMode = computed(() => route.name === 'DogDetail')
const isMixedBreed = computed(() => formData.value.breedId === MIXED_BREED_VIRTUAL_ID)

// Data
const loading = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const breeds = ref<DogBreed[]>([])
const calcResult = ref<DogCalcResult | null>(null)

const formData = ref({
  ownerId: '',
  name: '',
  breedId: '',
  customBreedName: '',
  birthday: '',
  gender: DogGender.MALE,
  isNeutered: false,
  currentWeightKg: 10.0,
  bcsScore: 5,
  activityLevel: ActivityLevel.LOW,
  lifeStageOverride: LifeStageOverride.NONE,
  sizeClassOverride: null as DogSizeCategory | null,
  mealsPerDay: 2,
  treatInputMode: TreatInputMode.ESTIMATE_LEVEL,
  treatLevel: TreatLevel.LOW,
  manualTreatKcal: null as number | null,
  medicalHistory: '',
  allergyFoods: '',
  pickyFoods: ''
})

const formRules: FormRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  breedId: [{ required: true, message: '请选择品种', trigger: 'change' }],
  birthday: [{ required: true, message: '请选择生日', trigger: 'change' }],
  currentWeightKg: [{ required: true, message: '请输入体重', trigger: 'blur' }],
  bcsScore: [{ required: true, message: '请选择 BCS 评分', trigger: 'change' }]
}

// Methods
const loadDogDetail = async () => {
  // Skip loading if in create mode
  if (isCreateMode.value) return

  loading.value = true
  try {
    const response = await dogApi.getDetail(dogId.value)
    const profile = response.profile

    formData.value = {
      ownerId: profile.ownerId,
      name: profile.name,
      breedId: profile.breedId,
      customBreedName: profile.customBreedName || '',
      birthday: profile.birthday.slice(0, 10),
      gender: profile.gender,
      isNeutered: profile.isNeutered,
      currentWeightKg: profile.currentWeightKg,
      bcsScore: profile.bcsScore,
      activityLevel: profile.activityLevel,
      lifeStageOverride: profile.lifeStageOverride,
      sizeClassOverride: profile.sizeClassOverride,
      mealsPerDay: profile.mealsPerDay,
      treatInputMode: profile.treatInputMode,
      treatLevel: profile.treatLevel,
      manualTreatKcal: profile.manualTreatKcal,
      medicalHistory: profile.medicalHistory || '',
      allergyFoods: profile.allergyFoods || '',
      pickyFoods: profile.pickyFoods || ''
    }

    calcResult.value = response.calcResult

    // Auto-match size category if sizeClassOverride is null
    if (!formData.value.sizeClassOverride && formData.value.breedId) {
      const breed = breeds.value.find(b => b.id === formData.value.breedId)
      if (breed) {
        formData.value.sizeClassOverride = breed.sizeCategory as DogSizeCategory
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const loadBreeds = async () => {
  try {
    breeds.value = await dogApi.getBreeds()
  } catch (error: any) {
    console.error('Failed to load breeds:', error)
  }
}

// Preview calculation for life stage display
const previewCalc = async () => {
  // Skip if required fields are missing
  if (!formData.value.breedId || !formData.value.birthday || !formData.value.currentWeightKg) {
    calcResult.value = null
    return
  }

  try {
    const previewData: CalcPreviewDto = {
      breedId: formData.value.breedId,
      // Only include customBreedName if breedId is NOT the mixed breed virtual ID
      ...(formData.value.breedId !== MIXED_BREED_VIRTUAL_ID && formData.value.customBreedName ? {
        customBreedName: formData.value.customBreedName
      } : {}),
      birthday: formData.value.birthday,
      gender: formData.value.gender,
      isNeutered: formData.value.isNeutered,
      currentWeightKg: formData.value.currentWeightKg,
      bcsScore: formData.value.bcsScore,
      activityLevel: formData.value.activityLevel,
      lifeStageOverride: formData.value.lifeStageOverride,
      sizeClassOverride: formData.value.sizeClassOverride || undefined,
      mealsPerDay: formData.value.mealsPerDay,
      treatInputMode: formData.value.treatInputMode,
      treatLevel: formData.value.treatLevel,
      manualTreatKcal: formData.value.manualTreatKcal || undefined
    }

    calcResult.value = await dogApi.calcPreview(previewData)
  } catch (error: any) {
    console.error('Failed to preview calculation:', error)
    calcResult.value = null
  }
}

// Watch for form data changes to update life stage preview
watch(
  () => [
    formData.value.breedId,
    formData.value.birthday,
    formData.value.currentWeightKg,
    formData.value.bcsScore,
    formData.value.activityLevel,
    formData.value.lifeStageOverride,
    formData.value.sizeClassOverride,
    formData.value.gender,
    formData.value.isNeutered
  ],
  () => {
    previewCalc()
  },
  { deep: true }
)

const handleBreedChange = () => {
  // Reset custom breed name when breed changes
  formData.value.customBreedName = ''

  // Auto-match size category from breed
  if (formData.value.breedId) {
    const breed = breeds.value.find(b => b.id === formData.value.breedId)
    if (breed) {
      formData.value.sizeClassOverride = breed.sizeCategory as DogSizeCategory
    }
  } else {
    formData.value.sizeClassOverride = null
  }
}

const toggleSizeCategory = (categoryKey: string) => {
  if (expandedSizeCategory.value === categoryKey) {
    // If already expanded, collapse it
    expandedSizeCategory.value = null
  } else {
    // Otherwise, expand the clicked category
    expandedSizeCategory.value = categoryKey
  }
}

const selectBreedByName = (breedName: string) => {
  const breed = breeds.value.find(b => b.name === breedName)
  if (breed) {
    formData.value.breedId = breed.id
    handleBreedChange()
  }
}

const isBreedSelected = (breedName: string) => {
  const breed = breeds.value.find(b => b.name === breedName)
  return breed && formData.value.breedId === breed.id
}

const getBreedsBySize = (sizeCategory: string) => {
  return breeds.value.filter(b => b.sizeCategory === sizeCategory)
}

const getLifeStageLabel = (lifeStage: string) => {
  const stageMap: Record<string, string> = {
    'GROWTH': '生长期',
    'PUPPY': '幼犬',
    'ADULT': '成犬',
    'SENIOR': '老年',
    'PREGNANCY': '妊娠期',
    'LACTATION': '哺乳期'
  }
  return stageMap[lifeStage] || lifeStage
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    if (isCreateMode.value) {
      // Create new dog (requires ownerId, need to handle this)
      ElMessage.warning('创建功能需要指定客户ID，暂未实现')
    } else {
      // Update existing dog
      const updateData: UpdateDogDto = {
        name: formData.value.name,
        currentWeightKg: formData.value.currentWeightKg,
        bcsScore: formData.value.bcsScore,
        activityLevel: formData.value.activityLevel,
        lifeStageOverride: formData.value.lifeStageOverride,
        sizeClassOverride: formData.value.sizeClassOverride,
        mealsPerDay: formData.value.mealsPerDay,
        treatInputMode: formData.value.treatInputMode,
        treatLevel: formData.value.treatLevel,
        manualTreatKcal: formData.value.manualTreatKcal,
        medicalHistory: formData.value.medicalHistory || null
      }

      await dogApi.update(dogId.value, updateData)
      ElMessage.success('保存成功')
      router.push(`/dogs/${dogId.value}`)
    }
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

const handleCancel = () => {
  if (isCreateMode.value) {
    router.push('/dogs')
  } else {
    router.push(`/dogs/${dogId.value}`)
  }
}

const handleBack = () => {
  router.push('/dogs')
}

// Lifecycle
onMounted(() => {
  loadBreeds()
  loadDogDetail()
})
</script>

<style scoped>
.dog-detail-page {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  color: #303133;
}

.section-title {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  margin: 24px 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #dcdfe6;
}

.unit-label {
  margin-left: 8px;
  color: #909399;
  font-size: 14px;
}

.calc-result {
  background-color: #f5f7fa;
  padding: 16px;
  border-radius: 8px;
}

.calc-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.calc-label {
  font-size: 14px;
  color: #606266;
}

.calc-value {
  font-size: 18px;
  font-weight: 500;
  color: #303133;
}

/* Feeding Recommendation Styles */
.feeding-recommendation {
  padding: 20px;
  background-color: #f5f7fa;
  border-radius: 12px;
}

.treat-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background-color: #fff6e6;
  border: 1px solid #ffd591;
  border-radius: 8px;
  color: #fa8c16;
  font-size: 14px;
}

.warning-icon {
  font-size: 18px;
}

.energy-cards {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.energy-card {
  flex: 1;
  padding: 16px;
  border-radius: 12px;
  background-color: #fff;
  border: 2px solid #e8e8e8;
  transition: all 0.3s;
}

.energy-card.total-der {
  border-color: #b7eb8f;
  background: linear-gradient(135deg, #f6ffed 0%, #ffffff 100%);
}

.energy-card.treat {
  border-color: #ffd591;
  background: linear-gradient(135deg, #fffbe6 0%, #ffffff 100%);
}

.energy-card.main-food {
  border-color: #1890ff;
  background: linear-gradient(135deg, #e6f7ff 0%, #ffffff 100%);
}

.energy-label {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
}

.energy-value {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.energy-value .unit {
  font-size: 14px;
  font-weight: 400;
  color: #999;
  margin-left: 4px;
}

.energy-value.highlight {
  color: #1890ff;
}

.daily-intake {
  padding: 20px;
  margin-bottom: 16px;
  background-color: #fff;
  border-radius: 12px;
  text-align: center;
  border: 2px solid #1890ff;
}

.intake-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.intake-value {
  font-size: 32px;
  font-weight: 700;
  color: #1890ff;
  margin-bottom: 8px;
}

.intake-value .unit {
  font-size: 16px;
  font-weight: 400;
  color: #999;
  margin-left: 4px;
}

.intake-hint {
  font-size: 13px;
  color: #999;
}

.intake-adjustment-note {
  margin-top: 6px;
  color: #5b7f63;
}

.common-breeds-scroll {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  max-height: 120px;
  overflow-y: auto;
  padding: 8px;
  background-color: #f5f7fa;
  border-radius: 8px;
}

.common-breed-tag {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: 14px;
}

.breeds-by-size {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px;
}

.breeds-by-size-expanded {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 16px;
  margin-top: 12px;
  background-color: #f5f7fa;
  border-radius: 8px;
  min-height: 60px;
}

.size-category-selector {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.size-category-btn {
  flex: 1;
  min-width: 120px;
}

.breed-tag {
  padding: 6px 12px;
  font-size: 13px;
  margin: 2px;
}

.activity-level-cards {
  display: flex;
  flex-direction: row;
  gap: 12px;
  flex-wrap: wrap;
}

.activity-level-card {
  flex: 1;
  min-width: 150px;
  padding: 16px;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  background-color: #fff;
}

.activity-level-card:hover {
  border-color: #1890ff;
}

.activity-level-card.is-active {
  border-color: #1890ff;
  background-color: #e6f7ff;
}

.activity-level-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.activity-level-label {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.activity-level-card.is-active .activity-level-label {
  color: #1890ff;
}

.activity-level-coefficient {
  font-size: 14px;
  font-weight: bold;
  color: #ff4d4f;
  background-color: #fff1f0;
  padding: 4px 12px;
  border-radius: 6px;
}

.activity-level-description {
  font-size: 13px;
  color: #666;
  line-height: 1.5;
}

.gender-cards {
  display: flex;
  gap: 16px;
}

.gender-card {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  background-color: #f5f5f5;
}

.gender-card:hover {
  border-color: #1890ff;
}

.gender-card.is-active {
  background-color: #e6f7ff;
  border-color: #1890ff;
}

.gender-card.is-active .gender-icon,
.gender-card.is-active .gender-label {
  color: #1890ff;
  font-weight: bold;
}

.gender-icon {
  font-size: 24px;
  color: #666;
}

.gender-label {
  font-size: 16px;
  color: #666;
}

.neutered-cards {
  display: flex;
  gap: 16px;
}

.neutered-card {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  background-color: #f5f5f5;
}

.neutered-card:hover {
  border-color: #1890ff;
}

.neutered-card.is-active {
  background-color: #e6f7ff;
  border-color: #1890ff;
}

.neutered-card.is-active .neutered-label {
  color: #1890ff;
  font-weight: bold;
}

.neutered-label {
  font-size: 15px;
  color: #666;
}
</style>
