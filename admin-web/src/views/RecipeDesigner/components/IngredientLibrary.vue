<template>
  <div class="ingredient-library">
    <div class="library-search">
      <el-input
        v-model="keyword"
        placeholder="搜索食材 / 补剂"
        clearable
        :prefix-icon="Search"
        @input="debouncedSearch"
      />
    </div>
    <el-tabs v-model="activeTab" class="library-tabs">
      <el-tab-pane label="食材" name="food" />
      <el-tab-pane label="补剂" name="supplement" />
    </el-tabs>
    <div class="library-category">
      <el-select
        v-model="category"
        size="small"
        placeholder="全部分类"
        clearable
        class="category-select"
        @change="handleCategoryChange"
      >
        <el-option
          v-for="c in categoryOptions"
          :key="c"
          :label="categoryLabel(c)"
          :value="c"
        />
      </el-select>
    </div>

    <div v-loading="loading" class="option-list" @scroll.passive="handleScroll">
      <el-empty v-if="!loading && visibleOptions.length === 0" description="没有找到可添加的原料" :image-size="60" />
      <template v-for="option in visibleOptions" :key="option.id">
        <!-- 食材：点击展开营养档案，从档案行添加 -->
        <div v-if="!isSupplement(option)" class="option-item food-item" :class="{ expanded: expandedIds.has(option.id) }">
          <div class="option-head" @click="toggleExpand(option.id)">
            <span class="option-name">{{ option.name }}</span>
            <el-icon class="expand-arrow"><ArrowDown v-if="!expandedIds.has(option.id)" /><ArrowUp v-else /></el-icon>
          </div>
          <div v-if="expandedIds.has(option.id)" class="profile-list">
            <div
              v-for="profile in option.nutritionProfiles"
              :key="profile.mappingId"
              class="profile-row"
            >
              <div class="profile-info">
                <span class="profile-name">{{ profile.name }}</span>
                <span v-if="profile.nutrientMatch?.displayText" class="nutrient-match">
                  {{ profile.nutrientMatch.displayText }}
                </span>
              </div>
              <el-button
                size="small"
                type="primary"
                class="profile-add-btn"
                :disabled="props.disabled"
                @click.stop="handleAddProfile(option, profile)"
              >添加</el-button>
            </div>
            <div v-if="option.nutritionProfiles.length === 0" class="empty-tip">
              暂无可用营养档案
            </div>
          </div>
        </div>
        <!-- 补剂：展示规格信息，通过添加按钮加入 -->
        <div v-else class="option-item supplement-item">
          <div class="option-body">
            <div class="option-name">
              {{ option.name }}
            </div>
            <div class="option-meta">
              <span v-if="supplementSpec(option)" class="supplement-spec">
                {{ supplementSpec(option) }}
              </span>
              <span v-if="option.nutrientMatch" class="nutrient-match">
                {{ option.nutrientMatch.displayText }}
              </span>
            </div>
          </div>
          <el-button
            size="small"
            type="primary"
            class="supplement-add-btn"
            :disabled="props.disabled"
            @click="handleAdd(option)"
          >添加</el-button>
        </div>
      </template>
      <div v-if="hasMore && !loading" class="load-more-tip">
        {{ loadingMore ? '加载中…' : '继续向下滚动加载更多' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown, ArrowUp, Search } from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type { RecipeDesignerIngredientOption } from '@/types/recipeDesigner'
import type { IngredientNutritionProfileOption } from '@/types/recipeDesigner'
import { SupplementCategoryLabels } from '@/types/ingredient'

const props = defineProps<{
  scenario?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (
    event: 'add',
    option: RecipeDesignerIngredientOption,
    profile?: IngredientNutritionProfileOption
  ): void
}>()

const keyword = ref('')
const activeTab = ref<'food' | 'supplement'>('food')
const category = ref('')
const loading = ref(false)
const loadingMore = ref(false)
const allOptions = ref<RecipeDesignerIngredientOption[]>([])
const page = ref(1)
const pageSize = 30
const total = ref(0)
/** 展开营养档案的食材 ID 集合 */
const expandedIds = ref<Set<string>>(new Set())
const foodCategories = ref<string[]>([])
const supplementCategories = ref<string[]>([])
let searchTimer: ReturnType<typeof setTimeout> | null = null

const visibleOptions = computed(() => {
  if (activeTab.value === 'supplement') {
    return allOptions.value.filter((option) => isSupplement(option))
  }
  return allOptions.value.filter((option) => !isSupplement(option))
})

const categoryOptions = computed(() =>
  activeTab.value === 'supplement' ? supplementCategories.value : foodCategories.value
)

const hasMore = computed(() => allOptions.value.length < total.value)

function isSupplement(option: RecipeDesignerIngredientOption): boolean {
  return String(option.type || '').trim().toUpperCase() === 'SUPPLEMENT'
}

function categoryLabel(value: string): string {
  if (activeTab.value === 'supplement') {
    return SupplementCategoryLabels[value] ?? value
  }
  return value
}

function primaryProfile(option: RecipeDesignerIngredientOption) {
  return (
    option.nutritionProfiles.find((profile) => profile.isPrimary) ??
    option.nutritionProfiles[0] ??
    null
  )
}

/** 补剂规格展示：品牌 · 产品规格（用于区分同名补剂，如不同品牌/规格的骨粉） */
function supplementSpec(option: RecipeDesignerIngredientOption): string {
  const parts = [option.brand, option.productModel].filter(
    (value): value is string => Boolean(value && String(value).trim())
  )
  return parts.map((value) => String(value).trim()).join(' · ')
}

function toggleExpand(optionId: string) {
  const next = new Set(expandedIds.value)
  if (next.has(optionId)) {
    next.delete(optionId)
  } else {
    next.add(optionId)
  }
  expandedIds.value = next
}

function debouncedSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    allOptions.value = []
    load()
  }, 300)
}

function handleCategoryChange() {
  page.value = 1
  allOptions.value = []
  load()
}

/** 滚动到底部时加载下一页 */
function handleScroll(event: Event) {
  const el = event.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
    void loadMore()
  }
}

async function load() {
  loading.value = true
  try {
    const res = await recipeDesignerApi.listIngredientOptions({
      search: keyword.value.trim() || undefined,
      category: category.value || undefined,
      type: activeTab.value === 'supplement' ? 'SUPPLEMENT' : 'FOOD',
      page: page.value,
      pageSize: activeTab.value === 'supplement' ? 500 : pageSize
    })
    allOptions.value = page.value === 1 ? res.data : [...allOptions.value, ...res.data]
    total.value = res.total ?? allOptions.value.length
    if (page.value === 1) {
      foodCategories.value = res.foodCategories ?? []
      supplementCategories.value = res.supplementCategories ?? []
    }
  } catch {
    allOptions.value = []
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || loading.value || !hasMore.value) return
  loadingMore.value = true
  try {
    page.value += 1
    const res = await recipeDesignerApi.listIngredientOptions({
      search: keyword.value.trim() || undefined,
      category: category.value || undefined,
      type: activeTab.value === 'supplement' ? 'SUPPLEMENT' : 'FOOD',
      page: page.value,
      pageSize
    })
    allOptions.value = [...allOptions.value, ...res.data]
    total.value = res.total ?? allOptions.value.length
  } finally {
    loadingMore.value = false
  }
}

/** 补剂：无多个档案，点击直接添加（使用主档案） */
function handleAdd(option: RecipeDesignerIngredientOption) {
  if (props.disabled) return
  const profile = primaryProfile(option)
  if (!profile) {
    ElMessage.warning(`「${option.name}」暂无可用营养档案，无法加入配方`)
    return
  }
  emit('add', option)
}

/** 食材：从展开的档案行添加指定营养档案 */
function handleAddProfile(
  option: RecipeDesignerIngredientOption,
  profile: IngredientNutritionProfileOption
) {
  if (props.disabled) return
  emit('add', option, profile)
}

watch(
  () => props.scenario,
  () => {
    // 场景变化时清空重载（营养匹配优先级可能变化）
    allOptions.value = []
    page.value = 1
    load()
  }
)

watch(activeTab, () => {
  // 切换页签：分类体系不同，重置分类并重载
  category.value = ''
  page.value = 1
  allOptions.value = []
  expandedIds.value = new Set()
  load()
})

onMounted(load)
</script>

<style scoped>
.ingredient-library {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 10px;
  box-sizing: border-box;
}
.library-search {
  margin-bottom: 4px;
}
.library-tabs :deep(.el-tabs__header) {
  margin-bottom: 6px;
}
.library-category {
  margin-bottom: 6px;
}
.category-select {
  width: 100%;
}
.option-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.option-item {
  padding: 8px 10px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  margin-bottom: 6px;
  transition: border-color 0.15s, background 0.15s;
}
.food-item {
  cursor: default;
}
.option-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  cursor: pointer;
}
.option-item:hover {
  border-color: #409eff;
  background: #f5f9ff;
}
.food-item.expanded {
  border-color: #409eff;
  background: #f5f9ff;
}
.option-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}
.expand-arrow {
  color: #909399;
  font-size: 12px;
  flex-shrink: 0;
}
.option-meta {
  margin-top: 2px;
  font-size: 11px;
  color: #909399;
}
.supplement-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.option-body {
  min-width: 0;
}
.supplement-spec {
  display: block;
  font-size: 11px;
  color: #606266;
  line-height: 1.4;
}
.supplement-add-btn {
  flex-shrink: 0;
  margin-left: 4px;
}
.profile-list {
  margin-top: 6px;
  border-top: 1px dashed #e4e7ed;
  padding-top: 6px;
}
.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 0;
}
.profile-info {
  min-width: 0;
}
.profile-name {
  display: block;
  font-size: 12px;
  color: #303133;
  line-height: 1.4;
}
.nutrient-match {
  display: block;
  margin-top: 1px;
  font-size: 11px;
  color: #67c23a;
  line-height: 1.3;
}
.profile-add-btn {
  flex-shrink: 0;
  margin-left: 4px;
}
.empty-tip {
  font-size: 12px;
  color: #909399;
  padding: 4px 0;
}
.load-more-tip {
  text-align: center;
  padding: 6px 0;
  font-size: 12px;
  color: #909399;
}
</style>
