<template>
  <div class="custom-breed-section">
    <div class="section-header">
      <h3>用户自定义品种</h3>
      <el-alert
        type="info"
        :closable="false"
        show-icon
      >
        系统会自动汇总用户手动输入的品种词；你可以在这里人工确认，并把它收录为某个系统品种的搜索别名
      </el-alert>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <el-radio-group v-model="sizeFilter" @change="handleFilter">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button :value="DogSizeCategory.SMALL">小型</el-radio-button>
        <el-radio-button :value="DogSizeCategory.MEDIUM">中型</el-radio-button>
        <el-radio-button :value="DogSizeCategory.LARGE">大型</el-radio-button>
        <el-radio-button :value="DogSizeCategory.GIANT">巨型</el-radio-button>
      </el-radio-group>
    </div>

    <!-- Table -->
    <el-card v-loading="loading" shadow="never">
      <el-table :data="displayData" stripe style="width: 100%">
        <el-table-column prop="breedName" label="品种名称" width="200" fixed="left">
          <template #default="{ row }">
            <el-icon style="vertical-align: middle; margin-right: 4px">
              <Document />
            </el-icon>
            {{ row.breedName }}
          </template>
        </el-table-column>

        <el-table-column prop="estimatedSizeCategory" label="体型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getSizeTagType(row.estimatedSizeCategory)">
              {{ getSizeLabel(row.estimatedSizeCategory) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="usageCount" label="使用次数" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.usageCount }} 个档案</el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="firstUsedAt" label="首次使用" width="120">
          <template #default="{ row }">
            {{ formatDate(row.firstUsedAt) }}
          </template>
        </el-table-column>

        <el-table-column prop="avgWeight" label="平均体重" width="120" align="right">
          <template #default="{ row }">
            {{ row.avgWeight.toFixed(1) }} kg
          </template>
        </el-table-column>

        <el-table-column label="当前状态" min-width="220">
          <template #default="{ row }">
            <div class="match-status">
              <el-tag
                :type="getMatchedBreed(row) ? 'success' : getSuggestedBreed(row) ? 'warning' : 'info'"
                size="small"
              >
                {{ getMatchedBreed(row) ? '已收录' : getSuggestedBreed(row) ? '待确认' : '待人工处理' }}
              </el-tag>
              <span v-if="getMatchedBreed(row)" class="match-text">
                当前已命中 {{ getMatchedBreed(row)?.name }}
              </span>
              <span v-else-if="getSuggestedBreed(row)" class="match-text">
                建议归入 {{ getSuggestedBreed(row)?.name }}
              </span>
              <span v-else class="match-text">
                暂无自动建议，可手动选择目标品种
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="收录为别名" min-width="340">
          <template #default="{ row }">
            <div class="alias-action">
              <el-select
                v-model="selectedBreedIds[row.breedName]"
                filterable
                clearable
                placeholder="选择系统品种"
                class="alias-target-select"
              >
                <el-option
                  v-for="breed in systemBreeds"
                  :key="breed.id"
                  :label="formatBreedOptionLabel(breed)"
                  :value="breed.id"
                />
              </el-select>
              <el-button
                type="primary"
                size="small"
                :loading="savingBreedName === row.breedName"
                :disabled="!getEffectiveBreedId(row)"
                @click="handleAssignAlias(row)"
              >
                收录
              </el-button>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              link
              @click="handleViewDogs(row)"
            >
              查看档案
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Empty State -->
      <div v-if="displayData.length === 0 && !loading" class="empty-state">
        <el-empty description="暂无用户自定义品种" />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document } from '@element-plus/icons-vue'
import { DogSizeCategory, DogSizeLabels } from '@/types/dog'
import { breedApi } from '@/api'
import type { CustomBreedStats, DogBreed } from '@/types/breed'

interface Props {
  data: CustomBreedStats[]
  loading: boolean
  systemBreeds: DogBreed[]
}

interface Emits {
  (e: 'refresh'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const router = useRouter()
const sizeFilter = ref<string>('')
const selectedBreedIds = reactive<Record<string, string>>({})
const savingBreedName = ref('')

// 计算显示的数据
const displayData = computed(() => {
  let result = props.data

  // 按体型筛选
  if (sizeFilter.value) {
    result = result.filter(item => item.estimatedSizeCategory === sizeFilter.value)
  }

  return result
})

const getSizeTagType = (size: string) => {
  const typeMap: Record<string, any> = {
    SMALL: 'success',
    MEDIUM: 'primary',
    LARGE: 'warning',
    GIANT: 'danger'
  }
  return typeMap[size] || ''
}

const getSizeLabel = (size: string) => {
  return DogSizeLabels[size as DogSizeCategory] || size
}

const formatDate = (dateStr: string) => {
  return dateStr.slice(0, 10)
}

const normalizeBreedText = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）]/g, '')
}

const buildBreedTokens = (breed: DogBreed) => {
  const tokens = new Set<string>()
  const addToken = (value?: string) => {
    if (!value) return
    const normalized = normalizeBreedText(value)
    if (!normalized) return
    tokens.add(normalized)
    const withoutSuffix = normalized.replace(/[犬狗]/g, '')
    if (withoutSuffix) {
      tokens.add(withoutSuffix)
    }
  }

  addToken(breed.name)
  addToken(breed.name.split(/[（(]/)[0])
  ;(breed.aliases || []).forEach(addToken)
  return Array.from(tokens)
}

const getMatchedBreed = (row: CustomBreedStats): DogBreed | null => {
  const target = normalizeBreedText(row.breedName)
  return props.systemBreeds.find((breed) =>
    buildBreedTokens(breed).includes(target)
  ) || null
}

const getSuggestedBreed = (row: CustomBreedStats): DogBreed | null => {
  const target = normalizeBreedText(row.breedName)
  if (!target) {
    return null
  }

  let bestMatch: DogBreed | null = null
  let bestScore = 0

  props.systemBreeds.forEach((breed) => {
    const score = buildBreedTokens(breed).reduce((currentScore, token) => {
      if (token === target) return Math.max(currentScore, 100)
      if (token.includes(target) || target.includes(token)) return Math.max(currentScore, 70)
      return currentScore
    }, 0)

    if (score > bestScore) {
      bestScore = score
      bestMatch = breed
    }
  })

  return bestScore >= 70 ? bestMatch : null
}

const getEffectiveBreedId = (row: CustomBreedStats) => {
  return selectedBreedIds[row.breedName] || getSuggestedBreed(row)?.id || ''
}

const formatBreedOptionLabel = (breed: DogBreed) => {
  if (!breed.aliases?.length) {
    return breed.name
  }
  return `${breed.name} | 别名：${breed.aliases.join(' / ')}`
}

const handleFilter = () => {
  // 筛选是响应式的，无需额外处理
}

const handleAssignAlias = async (row: CustomBreedStats) => {
  const breedId = getEffectiveBreedId(row)
  const targetBreed = props.systemBreeds.find((breed) => breed.id === breedId)
  const alias = row.breedName.trim()

  if (!targetBreed || !alias) {
    return
  }

  const nextAliases = Array.from(new Set([...(targetBreed.aliases || []), alias]))

  savingBreedName.value = row.breedName
  try {
    await breedApi.update(targetBreed.id, { aliases: nextAliases })
    ElMessage.success(`已将“${alias}”收录为“${targetBreed.name}”的搜索别名`)
    delete selectedBreedIds[row.breedName]
    emit('refresh')
  } catch (error: any) {
    ElMessage.error(error.message || '收录别名失败')
  } finally {
    savingBreedName.value = ''
  }
}

const handleViewDogs = (row: CustomBreedStats) => {
  // 跳转到档案管理页面，并传递筛选参数
  router.push({
    path: '/dogs',
    query: {
      customBreedName: row.breedName
    }
  })
}
</script>

<style scoped>
.custom-breed-section {
  margin-bottom: 20px;
}

.section-header {
  margin-bottom: 20px;
}

.section-header h3 {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.filter-bar {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  align-items: center;
}

.match-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-text {
  color: #606266;
  line-height: 1.5;
}

.alias-action {
  display: flex;
  gap: 12px;
  align-items: center;
}

.alias-target-select {
  flex: 1;
}

.empty-state {
  padding: 60px 0;
  text-align: center;
}
</style>
