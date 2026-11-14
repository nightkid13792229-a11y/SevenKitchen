<template>
  <div class="archive-panel">
    <el-form label-width="120px" size="small" @submit.prevent>
      <el-form-item label="物理形态">
        <el-select
          :model-value="form.physicalForm ?? undefined"
          placeholder="请选择"
          clearable
          style="width: 180px"
          @update:model-value="(value: any) => (form.physicalForm = value ?? null)"
        >
          <el-option
            v-for="option in PHYSICAL_FORM_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <span
          v-if="!form.physicalForm && item.suggestedPhysicalForm"
          class="archive-hint archive-hint--action"
          @click="form.physicalForm = item.suggestedPhysicalForm"
        >
          建议：{{ formLabel(item.suggestedPhysicalForm) }}（点击采用）
        </span>
      </el-form-item>

      <el-form-item label="原厂保质期（月）">
        <el-input-number
          :model-value="form.shelfLifeMonths ?? undefined"
          :min="1"
          :max="120"
          :controls="false"
          placeholder="待填"
          style="width: 120px"
          @update:model-value="(value: any) => (form.shelfLifeMonths = value ?? null)"
        />
        <span
          v-if="!form.shelfLifeMonths && item.suggestedShelfLifeMonths"
          class="archive-hint archive-hint--action"
          @click="form.shelfLifeMonths = item.suggestedShelfLifeMonths"
        >
          建议：{{ item.suggestedShelfLifeMonths }} 个月（点击采用）
        </span>
        <span v-else-if="!form.shelfLifeMonths" class="archive-hint archive-hint--warn">
          上架前必填
        </span>
      </el-form-item>

      <el-form-item label="储存条件">
        <el-input
          :model-value="form.storageCondition ?? ''"
          placeholder="例如：避光、密封、阴凉干燥处保存"
          style="width: 320px"
          @update:model-value="(value: string) => (form.storageCondition = value)"
        />
      </el-form-item>

      <el-form-item label="内容物油性">
        <el-switch
          :model-value="form.isOilBased"
          @update:model-value="(value: any) => (form.isOilBased = !!value)"
        />
        <span
          v-if="!form.isOilBased && item.suggestedOilBased"
          class="archive-hint archive-hint--action"
          @click="form.isOilBased = true"
        >
          建议开启（点击采用）
        </span>
      </el-form-item>

      <el-form-item label="商城上架">
        <el-tooltip
          :disabled="!showListingBlockedHint(toggleRow)"
          content="档案未补齐，无法上架"
          placement="top"
        >
          <span>
            <el-switch
              :model-value="form.supplementRetailEnabled"
              :disabled="!canToggleListing(toggleRow)"
              @update:model-value="(value: any) => (form.supplementRetailEnabled = !!value)"
            />
          </span>
        </el-tooltip>
        <span class="archive-hint">打开后顾客才能在制作单里购买</span>
      </el-form-item>
    </el-form>

    <div v-if="(item.issues || []).length" class="archive-issues">
      <span class="archive-issues__title">数据体检</span>
      <el-tooltip
        v-for="issue in item.issues || []"
        :key="issue.code + issue.message"
        :content="issue.message"
        placement="top"
      >
        <el-tag
          :type="issue.level === 'ERROR' ? 'danger' : 'warning'"
          size="small"
          effect="plain"
          class="archive-issue"
        >
          {{ ISSUE_LABELS[issue.code] || issue.code }}
        </el-tag>
      </el-tooltip>
    </div>

    <div class="archive-actions">
      <el-button type="primary" size="small" :loading="saving" @click="submit">
        保存本段并确认
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import {
  ISSUE_LABELS,
  type SupplementCatalogItem,
  type UpdateSupplementCatalogItemDto,
} from '@/api/supplementShop'
import {
  canToggleListing,
  showListingBlockedHint,
} from '@/views/SupplementShop/catalog-listing'

const props = defineProps<{
  item: SupplementCatalogItem
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'save', patch: UpdateSupplementCatalogItemDto): void
}>()

const PHYSICAL_FORM_OPTIONS = [
  { value: 'POWDER', label: '粉剂' },
  { value: 'TABLET', label: '片剂' },
  { value: 'CAPSULE', label: '胶囊' },
  { value: 'LIQUID', label: '液体' },
]

const LABELS: Record<string, string> = {
  POWDER: '粉剂',
  TABLET: '片剂',
  CAPSULE: '胶囊',
  LIQUID: '液体',
}

const form = reactive({
  physicalForm: null as string | null,
  shelfLifeMonths: null as number | null,
  storageCondition: null as string | null,
  isOilBased: false,
  supplementRetailEnabled: false,
})

function reset() {
  form.physicalForm = props.item.physicalForm ?? null
  form.shelfLifeMonths = props.item.shelfLifeMonths ?? null
  form.storageCondition = props.item.storageCondition ?? null
  form.isOilBased = props.item.isOilBased === true
  form.supplementRetailEnabled = props.item.supplementRetailEnabled === true
}

watch(() => props.item, reset, { immediate: true })

function formLabel(value: string | null | undefined): string {
  return value ? LABELS[value] || value : '—'
}

/** 给「上架开关能不能点」用的行数据：用**表单里的值**，不是库里旧值 */
const toggleRow = computed(() => ({
  supplementRetailEnabled: form.supplementRetailEnabled,
  issues: props.item.issues || [],
}))

function buildPatch(): UpdateSupplementCatalogItemDto {
  return {
    physicalForm: (form.physicalForm as any) ?? null,
    shelfLifeMonths: form.shelfLifeMonths,
    storageCondition: form.storageCondition?.trim() || null,
    isOilBased: form.isOilBased,
    supplementRetailEnabled: form.supplementRetailEnabled,
  }
}

function submit() {
  emit('save', buildPatch())
}

/** 供「保存全部四段」读取当前表单值 */
defineExpose({ buildPatch })
</script>

<style scoped>
.archive-panel {
  padding: 4px 0 0;
}
.archive-hint {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}
.archive-hint--action {
  color: #409eff;
  cursor: pointer;
}
.archive-hint--warn {
  color: #e6a23c;
}
.archive-issues {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 12px;
}
.archive-issues__title {
  font-size: 12px;
  color: #909399;
  margin-right: 4px;
}
.archive-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
