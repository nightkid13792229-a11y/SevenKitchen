<template>
  <div class="dog-detail-page">
    <!-- Header -->
    <div class="page-header">
      <el-button @click="handleBack" :icon="ArrowLeft">返回</el-button>
      <h2>{{ isEditMode ? '编辑档案' : '档案详情' }}</h2>
    </div>

    <el-card v-loading="loading">
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
        :disabled="!isEditMode"
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

        <!-- Custom Breed Name (only for mixed breeds) -->
        <el-row v-if="isMixedBreed" :gutter="20">
          <el-col :span="12">
            <el-form-item label="自定义品种名" prop="customBreedName">
              <el-input v-model="formData.customBreedName" placeholder="如：田园犬、金毛边牧混血" />
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
            <el-form-item label="性别" prop="gender">
              <el-radio-group v-model="formData.gender">
                <el-radio :value="DogGender.MALE">公 ♂</el-radio>
                <el-radio :value="DogGender.FEMALE">母 ♀</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="是否绝育" prop="isNeutered">
              <el-switch v-model="formData.isNeutered" />
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
          <el-select v-model="formData.activityLevel" placeholder="请选择活动水平" style="width: 200px">
            <el-option
              v-for="(label, value) in ActivityLevelLabels"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
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
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="体型覆盖" prop="sizeClassOverride">
              <el-select v-model="formData.sizeClassOverride" placeholder="未设置" clearable style="width: 100%">
                <el-option
                  v-for="(label, value) in DogSizeLabels"
                  :key="value"
                  :label="label"
                  :value="value"
                />
              </el-select>
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
            :rows="4"
            placeholder="如有特殊病史请记录，如：心脏病、胰腺炎、过敏史等"
          />
        </el-form-item>

        <!-- Calc Result (Read-only) -->
        <div v-if="calcResult && !isEditMode" class="section-title">喂食建议</div>
        <div v-if="calcResult && !isEditMode" class="calc-result">
          <el-row :gutter="20">
            <el-col :span="8">
              <div class="calc-item">
                <span class="calc-label">RER</span>
                <span class="calc-value">{{ calcResult.rer }} kcal</span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="calc-item">
                <span class="calc-label">DER</span>
                <span class="calc-value">{{ calcResult.totalDer }} kcal</span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="calc-item">
                <span class="calc-label">鲜食需求</span>
                <span class="calc-value">{{ calcResult.finalFoodKcal }} kcal</span>
              </div>
            </el-col>
          </el-row>
          <el-row v-if="calcResult.dailyIntakeG" :gutter="20" style="margin-top: 12px">
            <el-col :span="24">
              <div class="calc-item">
                <span class="calc-label">每日建议摄入</span>
                <span class="calc-value">{{ calcResult.dailyIntakeG }} g</span>
              </div>
            </el-col>
          </el-row>
        </div>

        <!-- Actions -->
        <el-form-item v-if="isEditMode">
          <el-button type="primary" @click="handleSubmit" :loading="submitting">保存</el-button>
          <el-button @click="handleCancel">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import BCSSlider from '@/components/Dog/BCSSlider.vue'
import TreatConfig from '@/components/Dog/TreatConfig.vue'
import { dogApi } from '@/api/dogs'
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
  type DogCalcResult,
  type UpdateDogDto
} from '@/types/dog'

const router = useRouter()
const route = useRoute()

// Computed
const dogId = computed(() => route.params.id as string)
const isEditMode = computed(() => route.name === 'DogEdit' || route.path === '/dogs/create')
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
  activityLevel: ActivityLevel.NORMAL,
  lifeStageOverride: LifeStageOverride.NONE,
  sizeClassOverride: null as DogSizeCategory | null,
  mealsPerDay: 2,
  treatInputMode: TreatInputMode.ESTIMATE_LEVEL,
  treatLevel: TreatLevel.LOW,
  manualTreatKcal: null as number | null,
  medicalHistory: ''
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
  if (dogId.value === 'create') return

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
      medicalHistory: profile.medicalHistory || ''
    }

    calcResult.value = response.calcResult
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

const handleBreedChange = () => {
  // Reset custom breed name when breed changes
  formData.value.customBreedName = ''
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
    if (dogId.value === 'create') {
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
  if (dogId.value === 'create') {
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
</style>
