<template>
  <div class="ai-panel">
    <div class="ai-panel-head">
      <span class="ai-panel-title">🤖 AI 设计建议</span>
      <el-tooltip
        content="四步向导：营养方案（权威资料引用）→ 食材推荐 → 食谱审核 → 制作 SOP。结果保存在配方草稿上，仅供设计参考。"
        placement="top"
      >
        <el-icon class="ai-tip"><QuestionFilled /></el-icon>
      </el-tooltip>
      <el-icon class="ai-close-icon" @click="emit('close')"><Close /></el-icon>
    </div>

    <div class="ai-panel-body">
      <!-- 未设置参考爱犬 -->
      <div v-if="!dogId" class="ai-empty">
        <el-icon><WarningFilled /></el-icon>
        <span>未设置参考爱犬，无法生成 AI 设计建议。请在「爱犬指导」中先设置参考爱犬。</span>
      </div>

      <!-- 设置了爱犬但 AI 未启用 -->
      <div v-else-if="!aiEnabled" class="ai-empty">
        暂无可用 AI 助手，请联系管理员在「AI 服务配置」中启用。
      </div>

      <template v-else>
        <!-- 步骤指示器 -->
        <div class="wizard-steps">
          <div
            v-for="(step, index) in wizardSteps"
            :key="step.key"
            class="wizard-step"
            :class="{ active: currentStep === index, done: step.done }"
            @click="currentStep = index"
          >
            <span class="wizard-step-index">{{ index + 1 }}</span>
            <span class="wizard-step-label">{{ step.label }}</span>
          </div>
        </div>

        <!-- 步骤 1：营养方案 -->
        <div v-show="currentStep === 0" class="wizard-block">
          <div class="block-head">
            <span class="block-title">营养方案</span>
            <el-button
              v-if="!planLoading"
              size="small"
              type="primary"
              plain
              @click="generateNutritionPlan(planNote || null)"
            >
              {{ nutritionPlan ? '重新生成' : '生成营养方案' }}
            </el-button>
            <el-button v-else size="small" type="primary" plain loading>AI 分析中…</el-button>
          </div>
          <div v-if="planLoading" class="ai-loading">正在基于爱犬档案与权威资料生成营养方案…</div>

          <div v-else-if="nutritionPlan" class="ai-result">
            <div v-if="nutritionPlanAccepted" class="plan-accepted-row">
              <div class="plan-accepted-tag">
                ✅ 方案已认可
                <span v-if="nutritionPlanNote" class="plan-note">（{{ nutritionPlanNote }}）</span>
              </div>
              <el-button size="small" text type="warning" :loading="unacceptLoading" @click="unacceptPlan">
                撤销认可
              </el-button>
            </div>
            <div class="plan-summary">{{ nutritionPlan.summary }}</div>

            <div class="plan-metrics">
              <div class="metric">
                <span class="metric-label">每日热量</span>
                <span class="metric-value">
                  {{ nutritionPlan.caloriesPerDayKcal != null ? nutritionPlan.caloriesPerDayKcal + ' kcal' : '数据不足' }}
                </span>
              </div>
              <div class="metric">
                <span class="metric-label">餐数</span>
                <span class="metric-value">{{ nutritionPlan.mealsPerDay ?? '—' }}</span>
              </div>
              <div v-if="nutritionPlan.macroRatio" class="metric">
                <span class="metric-label">宏量配比</span>
                <span class="metric-value">
                  蛋白 {{ nutritionPlan.macroRatio.protein || '—' }} · 脂肪 {{ nutritionPlan.macroRatio.fat || '—' }} · 碳水 {{ nutritionPlan.macroRatio.carbohydrate || '—' }}
                </span>
              </div>
            </div>
            <div v-if="nutritionPlan.caloriesBasis" class="plan-basis">依据：{{ nutritionPlan.caloriesBasis }}</div>

            <div v-if="nutritionPlan.nutritionFocus.length" class="ai-block">
              <div class="ai-block-title">营养关注点</div>
              <div v-for="(item, index) in nutritionPlan.nutritionFocus" :key="index" class="ai-row">
                <span class="ai-name">{{ item.point }}</span>
                <span class="ai-reason">{{ item.reason }}</span>
                <div
                  v-if="item.citationIds?.length"
                  class="ai-cite-toggle"
                  @click="toggleCitation('f' + index)"
                >
                  <el-icon><Notebook /></el-icon>
                  <span>引用 {{ item.citationIds.length }}</span>
                  <el-icon class="ai-cite-arrow" :class="{ open: expandedCitationKey === 'f' + index }"><ArrowDown /></el-icon>
                </div>
                <div v-if="expandedCitationKey === 'f' + index" class="ai-cite-list">
                  <div v-for="(c, ci) in citationRefs(item.citationIds)" :key="ci" class="ai-citation">
                    <el-tag size="small" type="info">{{ c.id }}</el-tag>
                    <span>{{ c.source }}{{ c.chapter ? ' · ' + c.chapter : '' }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="nutritionPlan.precautions.length" class="ai-block">
              <div class="ai-block-title avoid">注意事项</div>
              <div v-for="(item, index) in nutritionPlan.precautions" :key="index" class="ai-row">
                <span class="ai-name">{{ item.point }}</span>
                <span class="ai-reason">{{ item.reason }}</span>
                <div
                  v-if="item.citationIds?.length"
                  class="ai-cite-toggle"
                  @click="toggleCitation('p' + index)"
                >
                  <el-icon><Notebook /></el-icon>
                  <span>引用 {{ item.citationIds.length }}</span>
                  <el-icon class="ai-cite-arrow" :class="{ open: expandedCitationKey === 'p' + index }"><ArrowDown /></el-icon>
                </div>
                <div v-if="expandedCitationKey === 'p' + index" class="ai-cite-list">
                  <div v-for="(c, ci) in citationRefs(item.citationIds)" :key="ci" class="ai-citation">
                    <el-tag size="small" type="info">{{ c.id }}</el-tag>
                    <span>{{ c.source }}{{ c.chapter ? ' · ' + c.chapter : '' }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="nutritionPlan.warnings.length" class="ai-warnings">
              <div v-for="(warning, index) in nutritionPlan.warnings" :key="index" class="ai-warning">
                ⚠️ {{ warning }}
              </div>
            </div>

            <div v-if="!nutritionPlanAccepted" class="plan-actions">
              <el-input
                v-model="planNote"
                type="textarea"
                :rows="2"
                placeholder="如需修改方案，请在此填写修改建议，然后点「按建议重新生成」；满意则点「认可方案」"
                class="plan-note-input"
              />
              <div class="plan-action-buttons">
                <el-button type="primary" size="small" :loading="planLoading" @click="generateNutritionPlan(planNote || null)">
                  按建议重新生成
                </el-button>
                <el-button size="small" :loading="acceptLoading" @click="acceptPlan">
                  认可方案
                </el-button>
              </div>
            </div>
          </div>

          <div v-else class="ai-empty">
            <span>先让 AI 结合爱犬档案与权威资料（小动物临床营养学 / NRC / FEDIAF 等）生成营养方案。</span>
          </div>
        </div>

        <!-- 步骤 2：食材推荐 -->
        <div v-show="currentStep === 1" class="wizard-block">
          <div class="block-head">
            <span class="block-title">食材推荐</span>
            <el-button
              v-if="!recommendationLoading"
              size="small"
              type="primary"
              plain
              :disabled="!nutritionPlanAccepted"
              @click="generateRecommendation"
            >
              {{ recommendation ? '重新推荐' : '生成食材推荐' }}
            </el-button>
            <el-button v-else size="small" type="primary" plain loading>AI 分析中…</el-button>
          </div>
          <div v-if="!nutritionPlanAccepted" class="ai-empty">
            <span>请先在「营养方案」步骤生成并认可方案，再进行食材推荐。</span>
          </div>
          <div v-else-if="recommendationLoading" class="ai-loading">正在结合方案、多样性、过敏与框架推荐食材…</div>

          <div v-else-if="recommendation" class="ai-result">
            <div class="plan-summary">
              框架：{{ recommendation.framework.templateName }}
              <span v-if="recommendation.framework.missing.length" class="framework-missing">
                （缺失类别：{{ recommendation.framework.missing.join('、') }}）
              </span>
            </div>
            <div class="ai-block">
              <div class="ai-block-title">推荐食材（按框架分类）</div>
              <div v-for="(item, index) in recommendation.recommendations" :key="index" class="ai-rec-row">
                <div class="ai-rec-main">
                  <div class="ai-rec-name">
                    <el-tag v-if="item.categoryLabel" size="small" type="warning">{{ item.categoryLabel }}</el-tag>
                    <span class="ai-name">{{ item.name }}</span>
                    <el-tag v-if="item.avoidRecent" size="small" type="warning">近期吃过，建议间隔</el-tag>
                  </div>
                  <div class="ai-reason">{{ item.reason }}</div>
                </div>
                <div class="ai-rec-actions">
                  <span v-if="item.suggestedWeightG != null" class="ai-weight">约 {{ item.suggestedWeightG }}g</span>
                  <el-button
                    v-if="item.inLibrary && item.nutritionFoodId"
                    size="small"
                    type="primary"
                    :loading="addingName === item.name"
                    @click="addRecommendation(item)"
                  >添加</el-button>
                  <el-tag v-else-if="item.inLibrary" size="small" type="info">原料库有</el-tag>
                  <el-tooltip v-else content="原料库暂无此食材，请走原料新增流程" placement="top">
                    <el-tag size="small" type="info">新增食材</el-tag>
                  </el-tooltip>
                </div>
              </div>
            </div>
            <div v-if="recommendation.avoidIngredients.length" class="ai-block">
              <div class="ai-block-title avoid">建议避免</div>
              <div v-for="(item, index) in recommendation.avoidIngredients" :key="index" class="ai-row">
                <span class="ai-name">{{ item.name }}</span>
                <span class="ai-reason">{{ item.reason }}</span>
              </div>
            </div>
            <div v-if="recommendation.diversityNotes.length" class="ai-block">
              <div class="ai-block-title">多样性说明</div>
              <div v-for="(note, index) in recommendation.diversityNotes" :key="index" class="ai-row">
                <span class="ai-reason">• {{ note }}</span>
              </div>
            </div>
            <div v-if="recommendation.warnings.length" class="ai-warnings">
              <div v-for="(warning, index) in recommendation.warnings" :key="index" class="ai-warning">
                ⚠️ {{ warning }}
              </div>
            </div>
          </div>

          <div v-else class="ai-empty">
            <span>推荐会综合：已认可的营养方案、最近 90 天吃过的食材（多样性）、过敏/挑食/偏好、应季（常识提示）与食谱结构框架。</span>
          </div>
        </div>

        <!-- 步骤 3：食谱审核 -->
        <div v-show="currentStep === 2" class="wizard-block">
          <div class="block-head">
            <span class="block-title">食谱审核</span>
            <el-button
              v-if="!reviewLoading"
              size="small"
              type="primary"
              plain
              @click="generateReview"
            >
              {{ review ? '重新审核' : 'AI 审核当前配方' }}
            </el-button>
            <el-button v-else size="small" type="primary" plain loading>AI 审核中…</el-button>
          </div>
          <div v-if="reviewLoading" class="ai-loading">正在对照营养方案、框架与多样性要求审核配方…</div>
          <div v-else-if="review" class="ai-result">
            <div class="review-overall" :class="review.overall">
              {{ overallLabel }}
            </div>
            <div class="plan-summary">{{ review.summary }}</div>
            <div v-if="review.issues.length" class="ai-block">
              <div class="ai-block-title">问题清单</div>
              <div v-for="(issue, index) in review.issues" :key="index" class="review-issue" :class="issue.level">
                <div class="review-issue-head">
                  <el-tag size="small" :type="(issueTagType(issue.level) as any)">{{ issueLevelLabel(issue.level) }}</el-tag>
                  <el-tag size="small" type="info">{{ issueCategoryLabel(issue.category) }}</el-tag>
                  <span class="ai-reason">{{ issue.message }}</span>
                </div>
                <div v-if="issue.suggestion" class="review-suggestion">
                  💡 {{ issue.suggestion }}
                  <el-button
                    v-if="issue.suggestedIngredient"
                    size="small"
                    type="primary"
                    :loading="addingName === issue.suggestedIngredient.name"
                    @click="addSuggested(issue.suggestedIngredient)"
                  >
                    一键采纳（加入 {{ issue.suggestedIngredient.name }}）
                  </el-button>
                </div>
              </div>
            </div>
            <div v-if="review.planDeviations.length" class="ai-block">
              <div class="ai-block-title avoid">与营养方案的偏差</div>
              <div v-for="(dev, index) in review.planDeviations" :key="index" class="ai-row">
                <span class="ai-name">{{ dev.item }}</span>
                <span class="ai-reason">期望：{{ dev.expected }} · 实际：{{ dev.actual }}</span>
              </div>
            </div>
            <div v-if="review.warnings.length" class="ai-warnings">
              <div v-for="(warning, index) in review.warnings" :key="index" class="ai-warning">
                ⚠️ {{ warning }}
              </div>
            </div>
          </div>
          <div v-else class="ai-empty">
            <span>配方设计完成后，让 AI 检查结构覆盖、比例、多样性，以及与已认可营养方案的一致性。</span>
          </div>
        </div>

        <!-- 步骤 4：制作 SOP -->
        <div v-show="currentStep === 3" class="wizard-block">
          <div class="block-head">
            <span class="block-title">制作 SOP</span>
            <el-button
              v-if="!sopLoading"
              size="small"
              type="primary"
              plain
              @click="generateSop"
            >
              {{ sop ? '重新生成' : '生成制作 SOP' }}
            </el-button>
            <el-button v-else size="small" type="primary" plain loading>生成中…</el-button>
          </div>
          <div v-if="sopLoading" class="ai-loading">正在把配方明细转化为可执行制作流程…</div>
          <div v-else-if="sop" class="ai-result">
            <el-tabs v-model="sopTab" size="small">
              <el-tab-pane label="生产版" name="production">
                <div v-if="sop.production.length === 0" class="ai-empty">未生成生产版</div>
                <div v-for="(stage, si) in sop.production" :key="si" class="sop-stage">
                  <div class="sop-stage-title">{{ si + 1 }}. {{ stage.stage }}</div>
                  <div v-for="(step, ti) in stage.steps" :key="ti" class="sop-step">
                    <div class="sop-step-title">{{ step.title }}</div>
                    <div class="sop-step-desc">{{ step.description }}</div>
                    <div class="sop-step-meta">
                      <el-tag v-if="step.temperature" size="small" type="danger">🌡 {{ step.temperature }}</el-tag>
                      <el-tag v-if="step.duration" size="small" type="warning">⏱ {{ step.duration }}</el-tag>
                      <el-tag v-if="step.equipment" size="small">⚙ {{ step.equipment }}</el-tag>
                      <el-tag v-if="step.qualityCheck" size="small" type="success">✅ {{ step.qualityCheck }}</el-tag>
                      <span v-if="step.ingredients?.length" class="sop-ingredients">食材：{{ step.ingredients.join('、') }}</span>
                    </div>
                  </div>
                </div>
              </el-tab-pane>
              <el-tab-pane label="客户 DIY 版" name="customer">
                <div v-if="sop.customer.length === 0" class="ai-empty">未生成客户版</div>
                <div v-for="(stage, si) in sop.customer" :key="si" class="sop-stage">
                  <div class="sop-stage-title">{{ si + 1 }}. {{ stage.stage }}</div>
                  <div v-for="(step, ti) in stage.steps" :key="ti" class="sop-step">
                    <div class="sop-step-title">{{ step.title }}</div>
                    <div class="sop-step-desc">{{ step.description }}</div>
                    <div class="sop-step-meta">
                      <el-tag v-if="step.temperature" size="small" type="danger">🌡 {{ step.temperature }}</el-tag>
                      <el-tag v-if="step.duration" size="small" type="warning">⏱ {{ step.duration }}</el-tag>
                      <el-tag v-if="step.qualityCheck" size="small" type="success">✅ {{ step.qualityCheck }}</el-tag>
                    </div>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
            <div v-if="sop.warnings.length" class="ai-warnings">
              <div v-for="(warning, index) in sop.warnings" :key="index" class="ai-warning">
                ⚠️ {{ warning }}
              </div>
            </div>
          </div>
          <div v-else class="ai-empty">
            <span>配方确认后，AI 会生成生产版（温度/时间/设备/质检点）与客户 DIY 版两套制作流程。</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown, Close, Notebook, QuestionFilled, WarningFilled } from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type {
  IngredientRecommendationItem,
  IngredientRecommendationResult,
  NutritionPlanCitation,
  NutritionPlanResult,
  RecipeAiDesignData,
  RecipeReviewResult,
  ReviewIssue,
  SopResult,
} from '@/types/recipeDesigner'

const props = defineProps<{
  dogId?: string | null
  draftId?: string
}>()

const emit = defineEmits<{
  (event: 'add-item', payload: {
    name: string
    ingredientId?: string
    nutritionFoodId?: string
    weightG?: number
  }): void
  (event: 'close'): void
}>()

const aiEnabled = ref(false)
const currentStep = ref(0)
const planLoading = ref(false)
const recommendationLoading = ref(false)
const reviewLoading = ref(false)
const sopLoading = ref(false)
const acceptLoading = ref(false)
const unacceptLoading = ref(false)
const planNote = ref('')
const sopTab = ref<'production' | 'customer'>('production')
const addingName = ref('')

const nutritionPlan = ref<NutritionPlanResult | null>(null)
const nutritionPlanAccepted = ref(false)
const nutritionPlanNote = ref('')
const recommendation = ref<IngredientRecommendationResult | null>(null)
const review = ref<RecipeReviewResult | null>(null)
const sop = ref<SopResult | null>(null)

const wizardSteps = computed(() => [
  { key: 'plan', label: '营养方案', done: Boolean(nutritionPlan.value) },
  { key: 'recommend', label: '食材推荐', done: Boolean(recommendation.value) },
  { key: 'review', label: '食谱审核', done: Boolean(review.value) },
  { key: 'sop', label: '制作 SOP', done: Boolean(sop.value) },
])

const overallLabel = computed(() => {
  if (!review.value) return ''
  const map: Record<string, string> = {
    pass: '✅ 审核通过',
    attention: '⚠️ 需要关注',
    risk: '🚨 存在风险',
  }
  return map[review.value.overall] ?? review.value.overall
})

function issueLevelLabel(level: ReviewIssue['level']): string {
  return { error: '问题', warning: '提醒', info: '提示' }[level] ?? level
}

function issueTagType(level: ReviewIssue['level']): 'danger' | 'warning' | 'info' | 'primary' | 'success' {
  if (level === 'error') return 'danger'
  if (level === 'warning') return 'warning'
  return 'info'
}

function issueCategoryLabel(category: ReviewIssue['category']): string {
  return {
    structure: '结构',
    ratio: '比例',
    diversity: '多样性',
    plan: '方案一致',
    nutrition: '营养',
  }[category] ?? category
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

async function loadAiDesignData() {
  if (!props.draftId || !props.dogId) return
  try {
    const data: RecipeAiDesignData = await recipeDesignerApi.getAiDesignData(props.draftId)
    nutritionPlan.value = data.nutritionPlan?.result ?? null
    nutritionPlanAccepted.value = data.nutritionPlan?.accepted ?? false
    nutritionPlanNote.value = data.nutritionPlan?.note ?? ''
    recommendation.value = data.ingredientRecommendations[data.ingredientRecommendations.length - 1]?.result ?? null
    review.value = data.reviewResults[data.reviewResults.length - 1]?.result ?? null
    sop.value = data.sop?.result ?? null
  } catch {
    // 尚无数据时保持空
  }
}

async function generateNutritionPlan(userNotes?: string | null) {
  if (!props.dogId) return
  planLoading.value = true
  try {
    nutritionPlan.value = await recipeDesignerApi.generateAiNutritionPlan(
      props.dogId,
      props.draftId,
      userNotes ?? null,
    )
    nutritionPlanAccepted.value = false
    if (userNotes) {
      ElMessage.success('已按您填写的修改建议重新生成营养方案')
    }
    await loadAiDesignData()
  } catch {
    // 拦截器已提示
  } finally {
    planLoading.value = false
  }
}

async function acceptPlan() {
  if (!props.draftId || !nutritionPlan.value) return
  acceptLoading.value = true
  try {
    await recipeDesignerApi.acceptAiNutritionPlan(props.draftId, {
      accepted: true,
      note: planNote.value || null,
      plan: nutritionPlan.value,
    })
    ElMessage.success('营养方案已认可，自动进入食材推荐')
    planNote.value = ''
    await loadAiDesignData()
    // 认可成功后：跳到第二步 食材推荐 并自动生成推荐
    currentStep.value = 1
    void generateRecommendation()
  } catch {
    // 拦截器已提示
  } finally {
    acceptLoading.value = false
  }
}

async function unacceptPlan() {
  if (!props.draftId || !nutritionPlan.value) return
  unacceptLoading.value = true
  try {
    await recipeDesignerApi.acceptAiNutritionPlan(props.draftId, {
      accepted: false,
      note: planNote.value || null,
      plan: nutritionPlan.value,
    })
    ElMessage.info('已撤销认可，方案可继续修改')
    await loadAiDesignData()
  } catch {
    // 拦截器已提示
  } finally {
    unacceptLoading.value = false
  }
}

async function generateRecommendation() {
  if (!props.draftId || !nutritionPlanAccepted.value) return
  recommendationLoading.value = true
  try {
    recommendation.value = await recipeDesignerApi.generateAiIngredientRecommendation(props.draftId)
  } catch {
    // 拦截器已提示
  } finally {
    recommendationLoading.value = false
  }
}

async function generateReview() {
  if (!props.draftId) return
  reviewLoading.value = true
  try {
    review.value = await recipeDesignerApi.reviewAiRecipe(props.draftId)
  } catch {
    // 拦截器已提示
  } finally {
    reviewLoading.value = false
  }
}

async function generateSop() {
  if (!props.draftId) return
  sopLoading.value = true
  try {
    sop.value = await recipeDesignerApi.generateAiSop(props.draftId)
    sopTab.value = 'production'
  } catch {
    // 拦截器已提示
  } finally {
    sopLoading.value = false
  }
}

function addRecommendation(item: IngredientRecommendationItem) {
  if (!props.draftId || !item.nutritionFoodId) return
  addingName.value = item.name
  emit('add-item', {
    name: item.name,
    ingredientId: item.ingredientId,
    nutritionFoodId: item.nutritionFoodId,
    weightG: item.suggestedWeightG ?? 100,
  })
  // 让父组件完成添加后清除 loading（通过 watch 在下一个 tick 清掉）
  setTimeout(() => {
    addingName.value = ''
  }, 800)
}

function addSuggested(ingredient: { name: string; category?: string; weightG?: number }) {
  // 审核建议中的食材可能不在原料库，需先尝试匹配；无法匹配时提示走原料新增流程
  addingName.value = ingredient.name
  ElMessage.info(`建议加入「${ingredient.name}」：请从左侧原料库搜索添加（AI 建议约 ${ingredient.weightG ?? 100}g）`)
  setTimeout(() => {
    addingName.value = ''
  }, 800)
}

watch(
  () => [props.dogId, props.draftId],
  () => {
    nutritionPlan.value = null
    recommendation.value = null
    review.value = null
    sop.value = null
    nutritionPlanAccepted.value = false
    aiEnabled.value = false
    currentStep.value = 0
    void loadAiDesignData()
    void loadAiEnabled()
  },
  { immediate: true }
)

onMounted(() => {
  void loadAiEnabled()
})

// 需求2：观点旁的出处引用（点击展开/收起）
const expandedCitationKey = ref<string>('')

function citationRefs(citationIds?: string[]) {
  if (!citationIds?.length || !nutritionPlan.value?.citations?.length) return []
  const map = new Map(
    nutritionPlan.value.citations.map((c) => [c.id, c]),
  )
  return citationIds.map((id) => map.get(id)).filter(Boolean) as Array<
    NonNullable<NutritionPlanCitation>
  >
}

function toggleCitation(key: string) {
  expandedCitationKey.value =
    expandedCitationKey.value === key ? '' : key
}
</script>

<style scoped>
.ai-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 360px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid #ebeef5;
  box-shadow: -2px 0 12px rgba(0, 0, 0, 0.08);
  z-index: 20;
}
.ai-panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
  background: #fafafa;
  flex-shrink: 0;
  border-bottom: 1px solid #ebeef5;
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
.ai-close-icon {
  margin-left: auto;
  font-size: 14px;
  color: #909399;
  cursor: pointer;
}
.ai-close-icon:hover {
  color: #f56c6c;
}
.ai-panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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
.ai-loading {
  color: #909399;
  font-size: 12.5px;
  padding: 8px 0;
}
.wizard-steps {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
  padding-bottom: 8px;
}
.wizard-step {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  color: #909399;
  cursor: pointer;
}
.wizard-step.active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 600;
}
.wizard-step.done {
  color: #67c23a;
}
.wizard-step-index {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #dcdfe6;
  color: #fff;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.wizard-step.done .wizard-step-index {
  background: #67c23a;
}
.wizard-step.active .wizard-step-index {
  background: #409eff;
}
.wizard-block {
  padding: 4px 0;
}
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.block-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.ai-result {
  font-size: 12.5px;
  color: #303133;
}
/* 各内容块统一间距：标题与内容、块与块之间留白更清晰 */
.ai-result .ai-block {
  margin: 0 0 12px;
}
.ai-result .ai-block-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}
.ai-result .ai-block-title::before {
  content: '';
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: #409eff;
  flex-shrink: 0;
}
.ai-result .ai-block-title.avoid::before {
  background: #f56c6c;
}
.ai-result .ai-block-title.avoid {
  color: #f56c6c;
}.plan-accepted-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.plan-accepted-tag {
  color: #67c23a;
  font-size: 12.5px;
  font-weight: 600;
}
.plan-note {
  color: #909399;
  font-weight: 400;
}
.plan-summary {
  font-size: 13px;
  color: #303133;
  line-height: 1.8;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: #f8f9fb;
  border-radius: 6px;
}
.plan-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.metric {
  background: #f5f7fa;
  border-radius: 4px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.metric-label {
  font-size: 11px;
  color: #909399;
}
.metric-value {
  font-size: 12.5px;
  color: #303133;
  font-weight: 600;
}
.plan-basis {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}
.plan-actions {
  margin-top: 10px;
}
.plan-note-input {
  margin-bottom: 8px;
}
.plan-action-buttons {
  display: flex;
  gap: 8px;
}
.ai-warnings {
  margin: 4px 0 10px;
}
.ai-warning {
  font-size: 12px;
  color: #e6a23c;
  line-height: 1.6;
  padding: 4px 8px;
  background: #fdf6ec;
  border-radius: 4px;
  margin-bottom: 4px;
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
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
  line-height: 1.6;
  padding: 6px 0;
  border-bottom: 1px dashed #f0f2f5;
}
.ai-row:last-child {
  border-bottom: none;
}
.ai-name {
  color: #303133;
  font-weight: 600;
  font-size: 12.5px;
}
.ai-reason {
  color: #606266;
  font-size: 12.5px;
}
.ai-citation {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: #909399;
  padding: 4px 0;
  line-height: 1.5;
}
.ai-citation .el-tag {
  flex-shrink: 0;
  margin-top: 1px;
}
.ai-cite-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  cursor: pointer;
  user-select: none;
}
.ai-cite-toggle:hover {
  color: #409eff;
}
.ai-cite-arrow {
  font-size: 12px;
  transition: transform 0.2s;
}
.ai-cite-arrow.open {
  transform: rotate(180deg);
}
.ai-cite-list {
  margin-top: 4px;
  padding: 4px 8px;
  background: #f8f9fb;
  border-radius: 6px;
  border-left: 3px solid #409eff;
}
.ai-cite-list .ai-citation {
  padding: 3px 0;
}
.ai-rec-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px dashed #f0f2f5;
}
.ai-rec-main {
  flex: 1;
  min-width: 0;
}
.ai-rec-name {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.ai-rec-name .ai-name {
  color: #303133;
  font-weight: 600;
  font-size: 13px;
}
.ai-weight {
  color: #e6a23c;
  font-size: 12px;
}
.ai-rec-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.framework-missing {
  color: #e6a23c;
  font-size: 12px;
}
.review-overall {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.review-overall.pass {
  color: #67c23a;
}
.review-overall.attention {
  color: #e6a23c;
}
.review-overall.risk {
  color: #f56c6c;
}
.review-issue {
  padding: 8px 0;
  border-bottom: 1px dashed #f0f2f5;
}
.review-issue-head {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex-wrap: wrap;
  line-height: 1.6;
}
.review-suggestion {
  margin-top: 4px;
  padding-left: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: #606266;
  font-size: 12.5px;
  line-height: 1.6;
}
.sop-stage {
  margin-bottom: 12px;
}
.sop-stage-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}
.sop-step {
  padding: 8px 10px;
  background: #fafafa;
  border-radius: 6px;
  margin-bottom: 6px;
}
.sop-step-title {
  font-size: 12.5px;
  font-weight: 600;
  color: #409eff;
  line-height: 1.5;
}
.sop-step-desc {
  font-size: 12.5px;
  color: #606266;
  line-height: 1.6;
  margin: 3px 0;
}
.sop-step-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.sop-ingredients {
  font-size: 12px;
  color: #909399;
}
</style>
