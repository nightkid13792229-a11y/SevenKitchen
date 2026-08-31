<template>
  <div class="ai-panel">
    <div class="ai-panel-head" @click="toggleExpanded">
      <span class="ai-panel-title">🤖 AI 设计建议</span>
      <el-tooltip
        content="基于爱犬档案与历史食材生成，仅供设计参考，最终以 FEDIAF 营养评估为准"
        placement="top"
      >
        <el-icon class="ai-tip"><QuestionFilled /></el-icon>
      </el-tooltip>
      <el-icon class="ai-expand-icon" :class="{ expanded }">
        <ArrowDown v-if="!expanded" />
        <ArrowUp v-else />
      </el-icon>
    </div>

    <div v-if="expanded" class="ai-panel-body">
      <!-- 未设置参考爱犬 -->
      <div v-if="!dogId" class="ai-empty">
        <el-icon><WarningFilled /></el-icon>
        <span>未设置参考爱犬，无法生成 AI 设计建议。请在「爱犬指导」中先设置参考爱犬。</span>
      </div>

      <!-- 设置了爱犬但 AI 未启用 -->
      <div v-else-if="!aiEnabled" class="ai-empty">
        暂无可用 AI 助手，请联系管理员在「AI 服务配置」中启用。
      </div>

      <!-- 可生成 / 显示结果 -->
      <template v-else>
        <el-button
          v-if="!aiSuggestion"
          size="small"
          type="primary"
          plain
          :loading="aiLoading"
          :disabled="aiLoading"
          @click="requestAiSuggestions"
        >
          {{ aiLoading ? 'AI 分析中…' : '生成设计建议' }}
        </el-button>
        <div v-else class="ai-result">
          <div class="ai-summary">{{ aiSuggestion.summary }}</div>
          <div v-if="aiSuggestion.warnings.length" class="ai-warnings">
            <div v-for="(warning, index) in aiSuggestion.warnings" :key="index" class="ai-warning">
              ⚠️ {{ warning }}
            </div>
          </div>
          <div v-if="aiSuggestion.ingredientSuggestions.length" class="ai-block">
            <div class="ai-block-title">推荐食材</div>
            <div v-for="(item, index) in aiSuggestion.ingredientSuggestions" :key="index" class="ai-row">
              <span class="ai-name">{{ item.name }}</span>
              <span class="ai-reason">{{ item.reason }}</span>
            </div>
          </div>
          <div v-if="aiSuggestion.avoidIngredients.length" class="ai-block">
            <div class="ai-block-title avoid">避免食材</div>
            <div v-for="(item, index) in aiSuggestion.avoidIngredients" :key="index" class="ai-row">
              <span class="ai-name">{{ item.name }}</span>
              <span class="ai-reason">{{ item.reason }}</span>
            </div>
          </div>
          <div v-if="aiSuggestion.nutritionFocus.length" class="ai-block">
            <div class="ai-block-title">营养注意</div>
            <div v-for="(item, index) in aiSuggestion.nutritionFocus" :key="index" class="ai-row">
              <span class="ai-name">{{ item.point }}</span>
              <span class="ai-reason">{{ item.reason }}</span>
            </div>
          </div>
          <div v-if="aiSuggestion.supplementSuggestions.length" class="ai-block">
            <div class="ai-block-title">补剂建议</div>
            <div v-for="(item, index) in aiSuggestion.supplementSuggestions" :key="index" class="ai-row">
              <span class="ai-name">{{ item.name }}</span>
              <span class="ai-reason">{{ item.reason }}</span>
            </div>
          </div>
          <div v-if="aiSuggestion.reuseSuggestions.length" class="ai-block">
            <div class="ai-block-title">可沿用既往食材</div>
            <div v-for="(item, index) in aiSuggestion.reuseSuggestions" :key="index" class="ai-row">
              <span class="ai-name">{{ item.name }}</span>
              <span class="ai-reason">{{ item.reason }}</span>
            </div>
          </div>
          <div class="ai-footer">
            <el-button size="small" text type="primary" :loading="aiLoading" @click="requestAiSuggestions">
              重新生成
            </el-button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, QuestionFilled, WarningFilled } from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type { AiDesignSuggestion } from '@/types/recipeDesigner'

const props = defineProps<{
  dogId?: string | null
  draftId?: string
}>()

const expanded = ref(false)
const aiLoading = ref(false)
const aiEnabled = ref(false)
const aiSuggestion = ref<AiDesignSuggestion | null>(null)

function toggleExpanded() {
  expanded.value = !expanded.value
}

async function loadAiEnabled() {
  aiEnabled.value = false
  if (!props.dogId) return
  try {
    const insight = await recipeDesignerApi.getDogDesignInsight(props.dogId)
    aiEnabled.value = Boolean(insight?.aiEnabled)
  } catch {
    aiEnabled.value = false
  }
}

async function requestAiSuggestions() {
  if (!props.dogId) return
  aiLoading.value = true
  try {
    aiSuggestion.value = await recipeDesignerApi.generateAiSuggestions(
      props.dogId,
      props.draftId,
    )
  } catch {
    aiSuggestion.value = null
  } finally {
    aiLoading.value = false
  }
}

watch(
  () => props.dogId,
  () => {
    aiSuggestion.value = null
    aiEnabled.value = false
    void loadAiEnabled()
  },
  { immediate: true }
)

onMounted(() => {
  void loadAiEnabled()
})
</script>

<style scoped>
.ai-panel {
  border-bottom: 1px solid #ebeef5;
}
.ai-panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
  background: #fafafa;
}
.ai-panel-head:hover {
  background: #f0f2f5;
}
.ai-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.ai-tip {
  font-size: 13px;
  color: #909399;
}
.ai-expand-icon {
  margin-left: auto;
  font-size: 13px;
  color: #909399;
  transition: transform 0.2s;
}
.ai-expand-icon.expanded {
  transform: rotate(180deg);
}
.ai-panel-body {
  padding: 10px;
}
.ai-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #909399;
  font-size: 12.5px;
  line-height: 1.5;
}
.ai-summary {
  font-size: 13px;
  color: #303133;
  line-height: 1.6;
  margin-bottom: 8px;
}
.ai-warnings {
  margin-bottom: 8px;
}
.ai-warning {
  font-size: 12px;
  color: #e6a23c;
  line-height: 1.5;
}
.ai-block {
  margin-bottom: 8px;
}
.ai-block-title {
  font-size: 12.5px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 4px;
}
.ai-block-title.avoid {
  color: #f56c6c;
}
.ai-row {
  display: flex;
  gap: 8px;
  font-size: 12.5px;
  line-height: 1.5;
  padding: 2px 0;
}
.ai-name {
  flex-shrink: 0;
  color: #409eff;
  font-weight: 500;
}
.ai-reason {
  color: #606266;
}
.ai-footer {
  margin-top: 8px;
}
</style>
