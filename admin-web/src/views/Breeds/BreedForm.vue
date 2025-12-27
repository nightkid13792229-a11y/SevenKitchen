<template>
  <el-dialog
    :title="isEditMode ? '编辑品种' : '新增品种'"
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    width="600px"
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-width="120px"
    >
      <el-form-item label="品种名称" prop="name">
        <el-input
          v-model="formData.name"
          placeholder="请输入品种名称，如：金毛、泰迪"
          maxlength="20"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="体型分类" prop="sizeCategory">
        <el-radio-group v-model="formData.sizeCategory">
          <el-radio :value="DogSizeCategory.SMALL">小型</el-radio>
          <el-radio :value="DogSizeCategory.MEDIUM">中型</el-radio>
          <el-radio :value="DogSizeCategory.LARGE">大型</el-radio>
          <el-radio :value="DogSizeCategory.GIANT">巨型</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="成年月龄" prop="adultAgeMonths">
        <el-input-number
          v-model="formData.adultAgeMonths"
          :min="6"
          :max="48"
          controls-position="right"
          style="width: 200px"
        />
        <span style="margin-left: 8px">个月</span>
        <div class="form-tip">
          💡 小型犬通常10-12个月成年，大型犬通常18-24个月成年
        </div>
      </el-form-item>

      <el-form-item label="老年年龄" prop="seniorAgeYears">
        <el-input-number
          v-model="formData.seniorAgeYears"
          :min="5"
          :max="15"
          controls-position="right"
          style="width: 200px"
        />
        <span style="margin-left: 8px">岁</span>
        <div class="form-tip">
          💡 大型犬通常8岁进入老年期，小型犬通常10岁进入老年期
        </div>
      </el-form-item>

      <el-form-item label="平均成年体重" prop="averageAdultWeightKg">
        <el-input-number
          v-model="formData.averageAdultWeightKg"
          :min="0.5"
          :max="100"
          :step="0.5"
          :precision="1"
          controls-position="right"
          style="width: 200px"
        />
        <span style="margin-left: 8px">kg</span>
        <div class="form-tip">
          💡 用于营养计算的参考值
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        {{ isEditMode ? '保存' : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { DogSizeCategory } from '@/types/dog'
import type { BreedForm, DogBreed } from '@/types/breed'

interface Props {
  visible: boolean
  breed?: DogBreed | null
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'submit', data: BreedForm): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const formRef = ref<FormInstance>()
const submitting = ref(false)

const formData = reactive<BreedForm>({
  name: '',
  sizeCategory: DogSizeCategory.MEDIUM,
  adultAgeMonths: 12,
  seniorAgeYears: 8,
  averageAdultWeightKg: 20
})

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入品种名称', trigger: 'blur' },
    { min: 2, max: 20, message: '品种名称长度在2-20个字符', trigger: 'blur' }
  ],
  sizeCategory: [
    { required: true, message: '请选择体型分类', trigger: 'change' }
  ],
  adultAgeMonths: [
    { required: true, message: '请输入成年月龄', trigger: 'blur' }
  ],
  seniorAgeYears: [
    { required: true, message: '请输入老年年龄', trigger: 'blur' }
  ],
  averageAdultWeightKg: [
    { required: true, message: '请输入平均体重', trigger: 'blur' }
  ]
}

const isEditMode = computed(() => !!props.breed?.id)

const resetForm = () => {
  formData.id = undefined
  formData.name = ''
  formData.sizeCategory = DogSizeCategory.MEDIUM
  formData.adultAgeMonths = 12
  formData.seniorAgeYears = 8
  formData.averageAdultWeightKg = 20
  formRef.value?.clearValidate()
}

// 监听breed变化，填充表单
watch(
  () => props.breed,
  (breed) => {
    if (breed) {
      formData.id = breed.id
      formData.name = breed.name
      formData.sizeCategory = breed.sizeCategory as DogSizeCategory
      formData.adultAgeMonths = breed.adultAgeMonths
      formData.seniorAgeYears = breed.seniorAgeYears
      formData.averageAdultWeightKg = breed.averageAdultWeightKg || 20
    } else {
      resetForm()
    }
  },
  { immediate: true }
)

const handleCancel = () => {
  emit('update:visible', false)
  resetForm()
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
    emit('submit', { ...formData })
  } catch (error) {
    console.log('表单验证失败:', error)
  }
}
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
