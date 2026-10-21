<template>
  <el-drawer
    v-model="visible"
    title="从模板新建本单食谱"
    size="760px"
    destroy-on-close
  >
    <div class="template-picker">
      <div class="picker-toolbar">
        <el-input
          v-model="keyword"
          class="picker-search"
          placeholder="搜索食谱名称 / 原料"
          clearable
          @keyup.enter="loadTemplates"
          @clear="loadTemplates"
        >
          <template #append>
            <el-button :icon="Search" @click="loadTemplates">搜索</el-button>
          </template>
        </el-input>
        <el-select v-model="kind" class="picker-kind" @change="loadTemplates">
          <el-option label="全部来源" value="ALL" />
          <el-option label="橱窗食谱" value="CATALOG" />
          <el-option label="顾客定制（私密）" value="CUSTOM" />
        </el-select>
      </div>

      <p class="picker-note">
        模板只会被复制成新的本单草稿，原食谱和原狗狗/顾客不会改动。
        同一模板可以重复使用，每次都会生成独立的食谱。
      </p>

      <div v-loading="loading" class="template-list">
        <el-empty
          v-if="!loading && templates.length === 0"
          :image-size="72"
          description="没有找到可用的模板食谱"
        />

        <div
          v-for="template in templates"
          :key="template.recipeId"
          class="template-item"
          :class="{ 'template-item--selected': selectedRecipeId === template.recipeId }"
          role="button"
          tabindex="0"
          @click="selectTemplate(template)"
          @keydown.enter="selectTemplate(template)"
        >
          <div class="template-item__head">
            <span class="template-item__name">{{ template.name }}</span>
            <el-tag size="small" effect="plain">
              {{ sourceKindLabel(template.sourceKind) }}
            </el-tag>
            <el-tag size="small" type="info" effect="plain">
              v{{ template.recipeVersion }}
            </el-tag>
            <el-tag
              v-if="isUsed(template.recipeId)"
              size="small"
              type="success"
              effect="plain"
            >
              本单已用过 · 可重复
            </el-tag>
          </div>

          <div class="template-item__meta">
            <span>阶段：{{ formatOrderDesignLifeStage(template.lifeStage) }}</span>
            <span>主蛋白：{{ template.primaryProtein || '未标注' }}</span>
            <span>原料 {{ template.ingredientCount }} 种</span>
            <span>更新于 {{ formatDateTime(template.updatedAt) }}</span>
          </div>

          <div v-if="template.macroSummary.length" class="template-item__macros">
            <span
              v-for="row in template.macroSummary"
              :key="row.name"
              class="macro-row"
            >
              <span class="macro-row__name">{{ row.name }}</span>
              干物质 {{ row.dryMatterLabel }} · 能量 {{ row.energyPercentLabel }} · 重量 {{ row.weightPercentLabel }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="selectedRecipe" class="picker-selected">
        <div class="picker-selected__title">
          已选择：{{ selectedRecipe.name }}
        </div>

        <el-alert
          v-if="stageComparison?.warning"
          class="stage-warning"
          type="warning"
          :closable="false"
          show-icon
          :title="stageComparison.warning"
        >
          <template #default>
            阶段不一致只提示，不会阻止创建；创建后可在编辑器里按本单狗狗的实际情况调整。
          </template>
        </el-alert>

        <el-input
          v-model="name"
          class="picker-name"
          maxlength="60"
          show-word-limit
          placeholder="可选：本份食谱名称（不填按「狗名定制 · 模板名」生成）"
        />

        <div class="picker-selected__actions">
          <el-button @click="visible = false">取消</el-button>
          <el-button
            type="primary"
            :disabled="!selectedRecipeId || creating"
            :loading="creating"
            @click="confirmCreate"
          >
            确认创建
          </el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { orderRecipeDesignApi } from '@/api/orderRecipeDesign'
import type {
  CreateOrderDesignFromTemplateResult,
  OrderRecipeTemplateKind,
  RecipeTemplateStageComparison,
  RecipeTemplateSummary,
} from '@/types/orderRecipeDesign'
import {
  formatOrderDesignLifeStage,
  formatOrderDesignSourceKind,
} from '@/utils/orderRecipeDesign'
import { formatDateTime } from '@/utils/date'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    orderId: string
    /** 本单已经用过的模板，用于标记；仍可重复选择 */
    usedSourceRecipeIds?: string[]
  }>(),
  {
    usedSourceRecipeIds: () => [],
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (
    e: 'created',
    payload: CreateOrderDesignFromTemplateResult & { templateName: string },
  ): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const keyword = ref('')
const kind = ref<OrderRecipeTemplateKind>('ALL')
const templates = ref<RecipeTemplateSummary[]>([])
const loading = ref(false)
const selectedRecipeId = ref('')
const stageComparison = ref<RecipeTemplateStageComparison | null>(null)
const comparing = ref(false)
const creating = ref(false)
const name = ref('')

let compareSeq = 0

const usedSet = computed(() => new Set(props.usedSourceRecipeIds))

const selectedRecipe = computed(
  () =>
    templates.value.find(
      (template) => template.recipeId === selectedRecipeId.value,
    ) ?? null,
)

const isUsed = (recipeId: string) => usedSet.value.has(recipeId)
const sourceKindLabel = formatOrderDesignSourceKind

async function loadTemplates() {
  loading.value = true
  try {
    const list = await orderRecipeDesignApi.listTemplates({
      ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
      kind: kind.value,
    })
    templates.value = Array.isArray(list) ? list : []
    if (
      selectedRecipeId.value &&
      !templates.value.some(
        (template) => template.recipeId === selectedRecipeId.value,
      )
    ) {
      selectedRecipeId.value = ''
      stageComparison.value = null
    }
  } catch {
    templates.value = []
    ElMessage.error('模板加载失败，请重试')
  } finally {
    loading.value = false
  }
}

async function selectTemplate(template: RecipeTemplateSummary) {
  if (selectedRecipeId.value !== template.recipeId) {
    name.value = ''
  }
  selectedRecipeId.value = template.recipeId
  stageComparison.value = null
  comparing.value = true
  const seq = ++compareSeq
  const orderId = props.orderId
  const recipeId = template.recipeId
  try {
    const comparison = await orderRecipeDesignApi.getTemplateStage(orderId, recipeId)
    if (seq === compareSeq) {
      stageComparison.value = comparison
    }
  } catch {
    // 阶段比较失败不影响选择：阶段只是提示，不是硬门槛
    if (seq === compareSeq) {
      stageComparison.value = null
    }
  } finally {
    if (seq === compareSeq) {
      comparing.value = false
    }
  }
}

async function confirmCreate() {
  if (!selectedRecipeId.value || creating.value) return
  const orderId = props.orderId
  creating.value = true
  try {
    const created = await orderRecipeDesignApi.createFromTemplate(orderId, {
      sourceRecipeId: selectedRecipeId.value,
      ...(name.value.trim() ? { name: name.value.trim() } : {}),
    })
    visible.value = false
    emit('created', {
      ...created,
      templateName: selectedRecipe.value?.name ?? '',
    })
  } catch {
    // 错误提示由 API 拦截器统一处理
  } finally {
    creating.value = false
  }
}

function resetPicker() {
  keyword.value = ''
  kind.value = 'ALL'
  selectedRecipeId.value = ''
  stageComparison.value = null
  comparing.value = false
  name.value = ''
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    resetPicker()
    void loadTemplates()
  },
)

onMounted(() => {
  if (props.modelValue) {
    void loadTemplates()
  }
})
</script>

<style scoped>
.template-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}

.picker-toolbar {
  display: flex;
  gap: 10px;
}

.picker-search {
  flex: 1;
}

.picker-kind {
  width: 190px;
  flex-shrink: 0;
}

.picker-note {
  margin: 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 200px;
  max-height: calc(100vh - 380px);
  overflow-y: auto;
  padding-right: 4px;
}

.template-item {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: #fff;
}

.template-item:hover {
  border-color: #c0c4cc;
}

.template-item:focus-visible {
  outline: 2px solid #409eff;
  outline-offset: 1px;
}

.template-item--selected {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff inset;
}

.template-item__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.template-item__name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.template-item__meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: 12px;
  color: #606266;
}

.template-item__macros {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

.macro-row__name {
  color: #606266;
}

.picker-selected {
  border-top: 1px solid #ebeef5;
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.picker-selected__title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.stage-warning :deep(.el-alert__content) {
  font-size: 12px;
}

.picker-selected__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
