<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="1180px"
    top="4vh"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <template v-if="ingredient">
      <div class="dialog-header">
        <div>
          <div class="dialog-name">{{ ingredient.name }}</div>
          <div class="dialog-desc">
            {{ dialogDescription }}
          </div>
        </div>
        <div class="dialog-tags">
          <el-tag :type="ingredient.type === IngredientType.SUPPLEMENT ? 'warning' : 'success'">
            {{ ingredient.type === IngredientType.SUPPLEMENT ? '补剂' : '食材' }}
          </el-tag>
          <el-tag effect="plain">{{ baseUnitLabel }}</el-tag>
        </div>
      </div>

      <IngredientNutritionEditor
        v-model="draftNutritionProfile"
        :ingredient-type="ingredient.type"
      />
    </template>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">
        保存营养数据
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ingredientApi } from '@/api/ingredients'
import {
  BaseUnitLabels,
  type IngredientForm,
  IngredientType,
  type Ingredient,
  type NutritionProfile
} from '@/types/ingredient'
import IngredientNutritionEditor from './IngredientNutritionEditor.vue'

interface Props {
  modelValue: boolean
  ingredient: Ingredient | null
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const saving = ref(false)
const draftNutritionProfile = ref<NutritionProfile | null>(null)

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const dialogTitle = computed(() => (
  props.ingredient ? `编辑营养数据 · ${props.ingredient.name}` : '编辑营养数据'
))

const baseUnitLabel = computed(() => (
  props.ingredient ? BaseUnitLabels[props.ingredient.baseUnit] || props.ingredient.baseUnit : ''
))

const dialogDescription = computed(() => {
  if (!props.ingredient) {
    return ''
  }

  if (props.ingredient.type === IngredientType.SUPPLEMENT) {
    return '该补剂产品的营养数据将直接影响补剂默认浓度、食谱营养目标、定价预览和 DIY 制作单中的默认添加量。'
  }

  return '仅维护该标准原料的营养数据，不影响 DIY 推荐商品和采购 SKU 信息。'
})

watch(
  () => props.ingredient,
  (ingredient) => {
    draftNutritionProfile.value = ingredient?.nutritionProfile
      ? JSON.parse(JSON.stringify(ingredient.nutritionProfile))
      : null
  },
  { immediate: true }
)

const handleSave = async () => {
  if (!props.ingredient?.id) {
    return
  }

  saving.value = true

  try {
    const payload: Partial<IngredientForm> = {
      nutritionProfile: draftNutritionProfile.value
    }

    await ingredientApi.update(props.ingredient.id, payload)
    ElMessage.success('营养数据已保存')
    emit('saved')
    visible.value = false
  } catch (error: any) {
    ElMessage.error(error?.message || '保存营养数据失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.dialog-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.dialog-desc {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
}

.dialog-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 960px) {
  .dialog-header {
    flex-direction: column;
  }
}
</style>
