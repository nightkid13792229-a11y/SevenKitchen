<template>
  <div class="ai-agent-page">
    <header class="ai-agent-header">
      <div>
        <h2 class="ai-agent-header__title">AI 添加原料（Agent）</h2>
        <p class="ai-agent-header__subtitle">
          说一句话，AI 会在这份草稿上查库、写原料卡与营养档案、跑终检；
          跑完一轮后右侧出现「原料卡 / 营养档案」，你核对、改完就能提交。
        </p>
      </div>
      <el-button text @click="goBackToList">返回原料列表</el-button>
    </header>

    <div class="ai-agent-layout">
      <el-card class="agent-panel" shadow="never">
        <div class="agent-panel__head">
          <span class="agent-panel__dot" aria-hidden="true"></span>
          <b>Agent 运行</b>
          <el-tag
            v-if="state.pendingQuestion"
            class="agent-panel__waiting"
            size="small"
            type="warning"
            effect="plain"
          >
            等你回答
          </el-tag>
          <span class="agent-panel__draft">
            草稿：<code>{{ state.draftId || '运行后创建' }}</code>
          </span>
        </div>

        <div ref="bodyRef" class="agent-panel__body">
          <el-empty
            v-if="state.runs.length === 0 && !state.pendingQuestion"
            description="还没有运行。输入一句话开始，例如「帮我加鸡肝」。"
            :image-size="72"
          />

          <div v-for="run in state.runs" :key="run.id" class="agent-run">
            <div class="agent-run__ask">
              <span class="agent-run__role agent-run__role--me">你</span>
              <p class="agent-run__ask-text">{{ run.text }}</p>
            </div>

            <div v-if="run.error" class="agent-run__failure">
              <div class="agent-run__failure-head">
                <el-tag type="danger" size="small" effect="plain">失败</el-tag>
                <span v-if="run.steps.length > 0">
                  这一轮中断了，已保留收到的 {{ run.steps.length }} 步
                </span>
                <span v-else>这一轮没有跑完</span>
              </div>
              <p class="agent-run__failure-text">{{ run.error }}</p>
            </div>

            <details v-if="run.steps.length > 0" class="agent-steps">
              <summary class="agent-steps__summary">
                已执行 {{ run.steps.length }} 步
                <template v-if="run.report">
                  · {{ run.report.toolCalls }} 次工具 ·
                  {{ formatAgentDuration(run.report.durationMs) }} ·
                  {{
                    formatAgentTokenCount(
                      run.report.tokensIn + run.report.tokensOut
                    )
                  }}
                  tokens
                </template>
                · 展开
              </summary>
              <div class="agent-steps__body">
                <div class="agent-run__meta">
                  <span>草稿 {{ run.draftId || state.draftId }}</span>
                  <span v-if="run.meta">steps {{ run.meta.steps }}</span>
                  <span v-if="run.meta">
                    工具调用 {{ run.meta.toolCallCount }} 次
                  </span>
                  <span v-if="run.report">结果 {{ run.report.result }}</span>
                  <span v-if="run.report">
                    输入 {{ formatAgentTokenCount(run.report.tokensIn) }} /
                    输出 {{ formatAgentTokenCount(run.report.tokensOut) }} tokens
                  </span>
                </div>
                <!-- 每个工具的耗时在下面每一步右侧；失败工具在报告里再汇总一次。 -->
                <div
                  v-if="run.report && run.report.failedTools.length"
                  class="agent-run__report-failures"
                >
                  <span
                    v-for="(failure, index) in run.report.failedTools"
                    :key="`${failure.name}-${index}`"
                    class="agent-run__report-failure"
                  >
                    {{ toolLabel(failure.name) }}：{{ failure.error }}
                  </span>
                </div>
                <div
                  v-for="step in run.steps"
                :key="step.index"
                class="agent-step"
                :class="{
                  'agent-step--running': step.status === 'running',
                  'agent-step--failed': step.status === 'failed',
                  'agent-step--empty': step.found === false
                }"
              >
                <span class="agent-step__index">{{ step.index }}</span>
                <div class="agent-step__body">
                  <div class="agent-step__head">
                    <b class="agent-step__label">{{ step.label }}</b>
                    <span v-if="stepSummary(step)" class="agent-step__summary">
                      {{ stepSummary(step) }}
                    </span>
                    <span v-if="step.durationMs !== undefined" class="agent-step__duration">
                      · {{ formatAgentDuration(step.durationMs) }}
                    </span>
                    <el-tag
                      size="small"
                      effect="plain"
                      :type="stepTagType(step)"
                    >
                      {{ stepTagLabel(step) }}
                    </el-tag>
                  </div>
                  <p v-if="step.resultSummary" class="agent-step__result">
                    {{ step.resultSummary }}
                  </p>
                  <p v-if="step.status === 'failed'" class="agent-step__error">
                    {{ step.error || '工具执行失败（后端没有给出原因）' }}
                  </p>
                  <p v-if="step.record" class="agent-step__record">
                    {{ step.record.message }}
                  </p>
                  <details v-if="step.search" class="agent-step__evidence">
                    <summary class="agent-step__evidence-summary">
                      匹配依据 · {{ step.search.message }}
                    </summary>
                    <div class="agent-step__evidence-body">
                      <div class="agent-step__keywords">
                        <span>本次关键词：</span>
                        <el-tag
                          v-for="keyword in step.search.keywords"
                          :key="keyword"
                          size="small"
                          effect="plain"
                        >
                          {{ keyword }}
                        </el-tag>
                      </div>
                      <!--
                        候选多时先给人看「每个部位组多少条」：收窄问题与这里
                        使用同一份后端 groups，避免「11 条相关」却只显示 5 个。
                      -->
                      <div
                        v-if="step.search.groups.length"
                        class="agent-step__groups"
                      >
                        <span class="agent-step__groups-title">分组概览：</span>
                        <el-tag
                          v-for="group in step.search.groups"
                          :key="group.key"
                          size="small"
                          effect="plain"
                          type="info"
                          class="agent-step__group"
                        >
                          {{ group.labelWithCount }}
                          <template v-if="group.stateLabel">
                            · {{ group.stateLabel }}
                          </template>
                        </el-tag>
                      </div>
                      <p v-if="!step.search.found" class="agent-step__empty">
                        没有找到匹配词条
                      </p>
                      <ul v-else class="agent-step__matches">
                        <li
                          v-for="(match, matchIndex) in step.search.matches"
                          :key="matchIndex"
                          class="agent-step__match"
                        >
                          <span class="agent-step__match-name">
                            {{ match.foodName }}
                          </span>
                          <span
                            v-if="
                              match.foodNameEn &&
                              match.foodNameEn !== match.foodName
                            "
                            class="agent-step__match-en"
                          >
                            {{ match.foodNameEn }}
                          </span>
                          <el-tag size="small" effect="plain" type="info">
                            匹配方式：{{ match.matchedByLabel }}
                          </el-tag>
                          <template v-if="match.classification">
                            <el-tag
                              size="small"
                              effect="plain"
                              type="success"
                            >
                              AI 分类：{{ match.classification.label }}
                            </el-tag>
                            <span
                              v-if="match.classification.evidence"
                              class="agent-step__match-meta"
                            >
                              依据词「{{ match.classification.evidence }}」
                            </span>
                          </template>
                          <span class="agent-step__match-meta">
                            关键词「{{ match.matchedKeyword }}」
                          </span>
                          <span class="agent-step__match-meta">
                            分数 {{ match.scoreLabel }}
                          </span>
                          <span
                            v-if="match.aiVerdict"
                            class="agent-step__match-ai"
                          >
                            <el-tag
                              size="small"
                              :type="match.aiVerdictTagType"
                              effect="plain"
                            >
                              AI 判断：{{ match.aiVerdictLabel }}
                            </el-tag>
                            <span
                              v-if="match.aiReason"
                              class="agent-step__match-reason"
                            >
                              {{ match.aiReason }}
                            </span>
                          </span>
                        </li>
                      </ul>
                      <p
                        v-if="
                          step.search.found &&
                          step.search.totalCount > step.search.matches.length
                        "
                        class="agent-step__match-more"
                      >
                        共 {{ step.search.totalCount }} 条，这里显示前
                        {{ step.search.matches.length }} 条。
                      </p>
                    </div>
                  </details>
                </div>
                </div>
              </div>
            </details>

            <div v-if="run.reply" class="agent-run__reply">
              <span class="agent-run__role agent-run__role--ai">AI</span>
              <p class="agent-run__reply-text">{{ run.reply }}</p>
            </div>

            <div v-if="run.running" class="agent-typing">
              <span class="agent-typing__dot" aria-hidden="true"></span>
              AI 正在执行…
              <span class="agent-typing__elapsed">
                已运行 {{ runElapsedSeconds(run) }} 秒 · 已收到
                {{ run.steps.length }} 步
              </span>
            </div>
          </div>

          <div v-if="state.pendingQuestion" class="agent-ask">
            <div class="agent-run__reply">
              <span class="agent-run__role agent-run__role--ai">AI</span>
              <p class="agent-run__reply-text">
                {{ state.pendingQuestion.question }}
              </p>
            </div>
            <div class="agent-ask__options">
              <div class="agent-ask__legend">
                <span class="agent-ask__legend-item">
                  <el-tag size="small" type="info" effect="plain">
                    AI 判断
                  </el-tag>
                  <span>仅供参考，不是你的选择</span>
                </span>
                <span class="agent-ask__legend-item">
                  <el-tag size="small" type="primary" effect="plain">
                    你的选择
                  </el-tag>
                  <span>点一个答案继续</span>
                </span>
              </div>
              <div class="agent-ask__buttons">
                <!--
                  一行一个卡片：el-button 自带固定高度（小号仅 24px），多行内容会溢出
                  压到下一个选项上；这里用原生 button + height auto 承载三行。
                -->
                <button
                  v-for="(option, index) in askOptionViews"
                  :key="`${option.label}-${index}`"
                  type="button"
                  class="agent-ask__option"
                  :title="option.title || undefined"
                  :disabled="
                    state.running || saving || Boolean(commitResult)
                  "
                  @click="handleAnswerOption(option.label)"
                >
                  <span class="agent-ask__option-head">
                    <span class="agent-ask__option-text">
                      {{ option.displayLabel }}
                    </span>
                    <span
                      v-if="option.aiBadge || option.badge"
                      class="agent-ask__option-meta"
                    >
                      <el-tag
                        v-if="option.aiBadge"
                        size="small"
                        :type="option.aiBadge.type"
                        effect="plain"
                      >
                        AI 判断：{{ option.aiBadge.label }}
                      </el-tag>
                      <el-tag
                        v-if="option.badge"
                        size="small"
                        :type="option.badge.type"
                        effect="plain"
                        class="agent-ask__option-tag"
                      >
                        {{ option.badge.label }}
                      </el-tag>
                    </span>
                  </span>
                  <span
                    v-if="option.aiBadge?.reason"
                    class="agent-ask__option-reason"
                  >
                    {{ option.aiBadge.reason }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="agent-composer">
          <el-input
            ref="composerRef"
            v-model="inputText"
            :disabled="state.running || saving || Boolean(commitResult)"
            maxlength="500"
            placeholder="例如：帮我加鸡肝，按生档案补粗蛋白 19.5 g"
            @keyup.enter="handleRun"
          />
          <el-button
            type="primary"
            :loading="state.running"
            :disabled="!canRun"
            @click="handleRun"
          >
            {{ runButtonLabel }}
          </el-button>
        </div>
      </el-card>

      <el-card v-if="reviewVisible" class="review-panel" shadow="never">
        <div class="review-panel__head">
          <div class="review-panel__title">
            <b>草稿审核</b>
            <span v-if="draft" class="review-panel__step">
              当前站点 {{ draft.step }}
            </span>
          </div>
          <div class="review-stats">
            <el-tag size="small" type="warning" effect="plain">
              待补 {{ pendingCount }} 项
            </el-tag>
            <el-tag
              size="small"
              :type="conflictCount > 0 ? 'danger' : 'info'"
              effect="plain"
            >
              冲突 {{ conflictCount }} 项
            </el-tag>
            <el-tag size="small" :type="checkTagType" effect="plain">
              检查：{{ checkSummary.label }}
            </el-tag>
          </div>
        </div>

        <el-alert
          v-if="draftError"
          class="review-alert"
          type="error"
          :closable="false"
          show-icon
          title="草稿加载失败（后端返回原文）"
        >
          <p class="review-error-text">{{ draftError }}</p>
        </el-alert>

        <div v-else-if="draftLoading" v-loading="true" class="review-loading" />

        <div v-else-if="draft" class="review-panel__body">
          <el-tabs v-model="activeTab" class="review-tabs">
            <el-tab-pane label="原料卡" name="ingredient">
              <el-form
                class="ingredient-form"
                :disabled="Boolean(commitResult) || saving || submitting"
                @submit.prevent
              >
                <section
                  v-for="group in ingredientCardGroups"
                  :key="group.key"
                  class="ingredient-group"
                >
                  <h4 class="ingredient-group__head">{{ group.label }}</h4>

                  <div class="ingredient-form__grid">
                    <div
                      v-for="cell in group.cells"
                      :key="cell.key"
                      class="ingredient-cell"
                      :class="{
                        'ingredient-cell--empty': isIngredientCellEmpty(cell),
                        'ingredient-cell--after-create': cell.isAfterCreate
                      }"
                    >
                      <div class="ingredient-cell__head">
                        <span
                          class="ingredient-cell__label"
                          :title="cell.key"
                        >
                          {{ cell.label }}
                        </span>
                        <span v-if="cell.unit" class="ingredient-cell__unit">
                          {{ cell.unit }}
                        </span>
                        <el-tag
                          v-if="cell.sourceLabel"
                          size="small"
                          effect="plain"
                          class="ingredient-cell__source"
                          :type="cell.isManual ? 'warning' : 'success'"
                        >
                          {{ cell.sourceLabel }}
                        </el-tag>
                        <span
                          v-if="cell.isAfterCreate"
                          class="ingredient-cell__note"
                        >
                          建完后补
                        </span>
                      </div>

                      <el-select
                        v-if="cell.kind === 'select'"
                        :model-value="ingredientCellText(cell)"
                        :disabled="isIngredientCellDisabled(cell)"
                        :clearable="isIngredientCellClearable(cell)"
                        placeholder="空"
                        class="ingredient-cell__control"
                        @update:model-value="
                          setIngredientCellTextValue(cell.key, $event)
                        "
                        @change="handleIngredientSelectChange(cell.key, $event)"
                      >
                        <el-option
                          v-for="option in ingredientCellOptions(cell)"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </el-select>

                      <el-select
                        v-else-if="cell.kind === 'boolean'"
                        :model-value="ingredientCellBoolean(cell)"
                        :disabled="isIngredientCellDisabled(cell)"
                        clearable
                        placeholder="空"
                        class="ingredient-cell__control"
                        @update:model-value="
                          setIngredientCellBooleanValue(cell.key, $event)
                        "
                        @change="handleIngredientBooleanChange(cell.key, $event)"
                      >
                        <el-option label="是" :value="true" />
                        <el-option label="否" :value="false" />
                      </el-select>

                      <el-input-number
                        v-else-if="cell.kind === 'number'"
                        :model-value="ingredientCellNumber(cell)"
                        :disabled="isIngredientCellDisabled(cell)"
                        :controls="false"
                        :precision="ingredientCellPrecision(cell)"
                        :min="ingredientCellMin(cell)"
                        :max="ingredientCellMax(cell)"
                        placeholder="空"
                        class="ingredient-cell__control"
                        @update:model-value="
                          setIngredientCellNumberValue(cell.key, $event)
                        "
                        @change="handleIngredientNumberChange(cell.key, $event)"
                      />

                      <div
                        v-else-if="cell.kind === 'tags'"
                        class="ingredient-tags"
                      >
                        <template v-if="ingredientCellTags(cell).length > 0">
                          <el-tag
                            v-for="tag in ingredientCellTags(cell)"
                            :key="tag"
                            size="small"
                            effect="plain"
                          >
                            {{ tag }}
                          </el-tag>
                        </template>
                        <span v-else class="ingredient-cell__empty-text">
                          空
                        </span>
                      </div>

                      <el-input
                        v-else
                        :model-value="ingredientCellText(cell)"
                        :disabled="isIngredientCellDisabled(cell)"
                        :maxlength="ingredientCellMaxlength(cell)"
                        placeholder="空"
                        class="ingredient-cell__control"
                        @update:model-value="
                          setIngredientCellTextValue(cell.key, $event)
                        "
                        @change="handleIngredientTextChange(cell.key, $event)"
                      />

                      <span
                        v-if="cell.hint"
                        class="ingredient-cell__hint"
                      >
                        {{ cell.hint }}
                      </span>
                    </div>
                  </div>
                </section>
              </el-form>

              <p class="review-hint">
                改动会在离开输入框时自动保存；每次保存整张卡（30 项）一起发，
                不会丢字段。标「人工」的格子 AI 之后不会再覆盖；库存三项与标签
                要等原料建完再补，这里先灰显只读。
              </p>
            </el-tab-pane>

            <el-tab-pane label="营养档案" name="profiles">
              <el-empty
                v-if="profileGroups.length === 0"
                description="草稿里还没有营养档案。先让 AI 查库写入，或继续对话补数据。"
                :image-size="64"
              />

              <section
                v-for="group in profileGroups"
                :key="group.profileIndex"
                class="profile-group"
              >
                <header class="profile-group__head">
                  <b>{{ group.stateLabel }}档案</b>
                  <span class="profile-group__source">
                    来源：{{ group.sourceLabel }}
                  </span>
                  <el-tag
                    size="small"
                    :type="group.pendingCount > 0 ? 'warning' : 'success'"
                    effect="plain"
                  >
                    待补 {{ group.pendingCount }} 项
                  </el-tag>
                </header>

                <div
                  v-for="section in tabSections(group)"
                  :key="`${group.profileIndex}-${section.key}`"
                  class="profile-section"
                >
                  <div class="profile-section__head">{{ section.label }}</div>
                  <div class="profile-rows">
                    <div
                      v-for="row in section.rows"
                      :key="row.fieldPath"
                      class="profile-row"
                    >
                      <span class="profile-row__label" :title="row.fieldPath">
                        {{ row.label }}
                      </span>
                      <el-input-number
                        :model-value="cellValue(group.profileIndex, row) ?? undefined"
                        :min="0"
                        :controls="false"
                        size="small"
                        class="profile-row__input"
                        :disabled="Boolean(commitResult) || saving || submitting"
                        @change="
                          handleCellChange(group.profileIndex, row, $event)
                        "
                      />
                      <span class="profile-row__unit">{{ row.unit }}</span>
                      <el-tag
                        size="small"
                        :type="row.statusType"
                        effect="plain"
                        class="profile-row__status"
                      >
                        {{ row.statusLabel }}
                      </el-tag>
                      <span
                        class="profile-row__source"
                        :title="row.sourceRecordId || '暂无来源'"
                      >
                        {{ row.sourceLabel }}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <p class="review-hint">
                清空一格会保留证据行、值变成空（显示「待补」），不会写成 0。
              </p>
            </el-tab-pane>
          </el-tabs>

          <div class="review-feedback">
            <el-alert
              v-if="saveError"
              type="error"
              :closable="false"
              show-icon
              title="保存草稿失败（后端返回原文）"
            >
              <p class="review-error-text">{{ saveError }}</p>
            </el-alert>

            <el-alert
              v-if="submitError"
              type="error"
              :closable="false"
              show-icon
              title="提交失败（后端返回原文）"
            >
              <p class="review-error-text">{{ submitError }}</p>
            </el-alert>

            <el-alert
              v-if="checkSummary.state === 'BLOCK'"
              type="error"
              :closable="false"
              show-icon
              title="终检有阻断项，已阻止提交"
            >
              <ul class="review-blocking">
                <li
                  v-for="item in checkSummary.blocking"
                  :key="`${item.code}-${item.fieldPath ?? ''}`"
                >
                  <code>{{ item.code }}</code
                  >：{{ item.message }}
                  <span v-if="item.fieldPath" class="review-blocking__path">
                    （{{ item.fieldPath }}）
                  </span>
                </li>
              </ul>
            </el-alert>

            <el-alert
              v-if="verifyError"
              type="error"
              :closable="false"
              show-icon
              title="确认可用失败（后端返回原文）"
            >
              <p class="review-error-text">{{ verifyError }}</p>
            </el-alert>

            <el-alert
              v-if="commitResult"
              type="success"
              :closable="false"
              show-icon
              :title="
                verified
                  ? '已提交，原料与营养档案已确认可用'
                  : '已提交，营养档案当前是「待验证」'
              "
            >
              <p class="review-commit-result">
                原料 {{ shortId(commitResult.ingredientId) }} ·
                营养档案
                {{ commitResult.nutritionFoodIds.map(shortId).join('、') }}
              </p>
              <p v-if="!verified" class="review-error-text">
                {{
                  isAdmin
                    ? '点「确认可用」后，这些档案才会进入配方链路。'
                    : ADMIN_ONLY_TIP
                }}
              </p>
            </el-alert>
          </div>

          <footer class="review-footer">
            <el-button
              type="primary"
              size="large"
              :loading="submitting"
              :disabled="!canSubmit"
              @click="handleSubmit"
            >
              提交
            </el-button>
            <el-button
              v-if="commitResult"
              type="success"
              size="large"
              :loading="verifying"
              :disabled="!isAdmin || verified || verifying"
              @click="handleVerify"
            >
              确认可用
            </el-button>
            <span class="review-footer__hint">{{ submitHint }}</span>
          </footer>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch
} from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { nutritionFoodApi } from '@/api/ingredients'
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole'
import {
  INGREDIENT_CARD_FIELDS,
  INGREDIENT_CARD_FIELD_GROUPS,
  type IngredientCardFieldKey
} from '@/constants/ingredientCardFields'
import { INGREDIENT_NUTRITION_TAB_DEFINITIONS } from '@/constants/ingredientNutrition'
import { getApiErrorMessage } from '@/utils/apiError'
import type {
  CommitIngredientCreationResult,
  FinalCheckResult,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  ProfileDraft
} from '@/types/ingredientCreation'
import {
  applyProfileCellEdit,
  countPendingRows,
  countPlanConflicts,
  markIngredientFieldManual,
  toCheckSummary,
  toCommitInput,
  toIngredientCard,
  toIngredientDraft,
  toProfileRows,
  type IngredientCardForm,
  type IngredientCardFormValue,
  type ProfileFieldRow,
  type ProfileGroup
} from './draftReview'
import { toolLabel } from './stepView'
import {
  buildIngredientCardCells,
  ingredientCellValuesEqual,
  isEmptyIngredientCardValue,
  selectOptionsForValue,
  toIngredientDraftFromCells,
  type IngredientCardCell
} from './ingredientCardView'
import {
  answerInputFromPendingQuestion,
  askOptionAiBadge,
  askOptionTitle,
  formatAgentDuration,
  formatAgentTokenCount,
  pendingOptionBadge,
  readPendingQuestion,
  streamIngredientAgent,
  type AgentPendingQuestion,
  type AgentRunReport,
  type AgentStreamMeta,
  type AgentStreamState,
  type AgentStreamStep
} from './agentStream'

/**
 * Agent 审核页：
 * - 左边是受控循环的对话与工具记录；
 * - 跑完一轮后右边出现「原料卡 / 营养档案」两个标签，数据全部来自草稿；
 * - 原料卡与营养格改动都 PATCH 草稿，人工改过的字段带标记，AI 不再覆盖；
 * - 底部提交先跑终检、有阻断就停；提交成功后才出现「确认可用」。
 */
interface AgentRunRecord {
  id: number
  text: string
  /** 边跑边追加：step_start 先落一行「执行中」，step_end 改成成功 / 失败 */
  steps: AgentStreamStep[]
  reply: string | null
  draftId: string | null
  meta: AgentStreamMeta | null
  /** 本轮运行报告：摘要行与展开区都靠它；旧后端为 null。 */
  report: AgentRunReport | null
  error: string | null
  running: boolean
  /** 本轮开始 / 结束时间：用于实时显示「已运行 N 秒」 */
  startedAt: number
  finishedAt: number | null
}

const router = useRouter()
const isAdmin = useIsAdmin()

const inputText = ref('')
const bodyRef = ref<HTMLElement | null>(null)
/** 点「都不对，我直接说」时把焦点放回输入框（自由输入，不把这句话当答案发出去）。 */
const composerRef = ref<{ focus?: () => void } | null>(null)
const state = reactive({
  running: false,
  /** 上一轮成功返回的草稿 id；为空表示下一轮会新建草稿。 */
  draftId: null as string | null,
  runs: [] as AgentRunRecord[],
  /**
   * AI 正在等你回答的问题。SSE `ask` 事件、草稿 payload（刷新恢复）、
   * 非流式 `runAgent` 返回值三个来源都归一到这个字段。
   */
  pendingQuestion: null as AgentPendingQuestion | null
})

/**
 * 选项按钮的展示视图：文本用后端给的 displayLabel（未收录时带后缀），
 * 右侧小标说明库里有没有；旧草稿没有 optionChecks 时不显示小标。
 *
 * 长文案在按钮里单行省略，完整文案（含候选全称）放进 title 供悬停查看。
 */
const askOptionViews = computed(() =>
  (state.pendingQuestion?.options ?? []).map((label, index) => {
    const check = state.pendingQuestion?.optionChecks?.[index]
    const displayLabel = check?.displayLabel || label
    return {
      label,
      displayLabel,
      badge: pendingOptionBadge(check),
      // AI 判断与「你的选择」分开：上面是 AI 的参考意见，下面的按钮才是人点选的。
      aiBadge: askOptionAiBadge(check),
      title: askOptionTitle(displayLabel, check?.matchedName ?? null)
    }
  })
)

/**
 * 每秒推进一次的时钟：页面上「已运行 N 秒 / 已收到 M 步」会跟着跳，
 * 用来证明步骤是边跑边到的，而不是等最后一次性出现。
 */
const clockNow = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null

function stopClock() {
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
}

watch(
  () => state.running,
  (running) => {
    stopClock()
    if (running) {
      clockNow.value = Date.now()
      clockTimer = setInterval(() => {
        clockNow.value = Date.now()
      }, 1000)
    }
  },
  { immediate: true }
)

onUnmounted(stopClock)

const draft = ref<IngredientCreationDraft | null>(null)
const draftLoading = ref(false)
const draftError = ref('')
const activeTab = ref<'ingredient' | 'profiles'>('ingredient')

const ingredientForm = reactive<IngredientCardForm>(toIngredientCard(null))
/** 最近一次从后端读到的原料卡：用来判断人到底改了没有。 */
const loadedCard = ref<IngredientCardForm | null>(null)

const checkResult = ref<FinalCheckResult | null>(null)
/** 终检出现阻断后禁止提交，直到人再改草稿（改动会把 checkResult 清空）。 */
const checkBlocked = ref(false)
const submitError = ref('')
const submitting = ref(false)
const commitResult = ref<CommitIngredientCreationResult | null>(null)

const verifyError = ref('')
const verifying = ref(false)
const verified = ref(false)

const saveError = ref('')
const saveFailed = ref(false)
const savingCount = ref(0)
const pendingCells = reactive(new Map<string, number | null>())
let saveQueue: Promise<void> = Promise.resolve()

let runSeq = 0

const saving = computed(() => savingCount.value > 0)

const canRun = computed(
  () =>
    !state.running &&
    !saving.value &&
    !commitResult.value &&
    inputText.value.trim().length > 0
)

const runButtonLabel = computed(() =>
  state.runs.length === 0 ? '开始' : '继续'
)

const reviewVisible = computed(
  () =>
    Boolean(state.draftId) &&
    Boolean(draft.value || draftLoading.value || draftError.value)
)

/**
 * 原料卡 30 个格子：值来自服务端草稿，人工标记来自当前表单。
 * 表单里的即时输入由各控件自己回显，保存成功后草稿更新，格子元数据跟着刷新。
 */
const ingredientCells = computed(() =>
  buildIngredientCardCells(
    draft.value?.payload.ingredient ?? null,
    ingredientForm.manualFields
  )
)

const ingredientCardGroups = computed(() =>
  INGREDIENT_CARD_FIELD_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    cells: ingredientCells.value.filter((cell) => cell.group === group.key)
  }))
)

/** 有没保存成功的原料卡改动：刷新 / 关页前提醒，避免输入框还没失焦就丢掉。 */
const hasUnsavedIngredientChanges = computed(() => {
  if (!loadedCard.value) {
    return false
  }
  return INGREDIENT_CARD_FIELDS.some((field) =>
    isIngredientCellChanged(field.key)
  )
})

const sourceNames = computed(() => {
  const map = new Map<string, string>()
  const candidates = draft.value?.payload.candidates ?? []
  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate.sourceRecordId === 'string' &&
      typeof candidate.foodName === 'string' &&
      candidate.foodName
    ) {
      map.set(candidate.sourceRecordId, candidate.foodName)
    }
  }
  return map
})

const profileGroups = computed<ProfileGroup[]>(() =>
  toProfileRows(draft.value?.payload, sourceNames.value)
)

const pendingCount = computed(() => countPendingRows(profileGroups.value))
const conflictCount = computed(() =>
  countPlanConflicts(draft.value?.payload)
)
const checkSummary = computed(() => toCheckSummary(checkResult.value))
const checkTagType = computed<'success' | 'danger' | 'info'>(() => {
  if (checkSummary.value.state === 'PASS') return 'success'
  if (checkSummary.value.state === 'BLOCK') return 'danger'
  return 'info'
})

const canSubmit = computed(
  () =>
    Boolean(draft.value) &&
    !commitResult.value &&
    !submitting.value &&
    !saving.value &&
    !checkBlocked.value &&
    ingredientTextValue('name').trim().length > 0 &&
    (draft.value?.payload.profiles?.length ?? 0) > 0
)

const submitHint = computed(() => {
  if (commitResult.value) {
    return verified.value
      ? '已确认可用，配方里现在能选到这些档案。'
      : '提交已完成；确认可用后才会进入配方链路。'
  }
  if (checkBlocked.value) {
    return '终检有阻断项，已禁止提交；按明细修改草稿后可再试。'
  }
  if (!ingredientTextValue('name').trim()) return '原料名称还没填。'
  if ((draft.value?.payload.profiles?.length ?? 0) === 0) {
    return '还没有营养档案，先让 AI 写入再提交。'
  }
  if (saving.value) return '正在保存草稿…'
  return '提交会先跑终检；有阻断项就停下，不会写正式数据。'
})

function stepTagType(
  step: AgentStreamStep
): 'info' | 'success' | 'warning' | 'danger' {
  if (step.status === 'running') return 'info'
  if (step.status === 'failed') return 'danger'
  return step.found === false ? 'warning' : 'success'
}

function stepTagLabel(step: AgentStreamStep): string {
  if (step.status === 'running') return '正在执行'
  if (step.status === 'failed') return '失败'
  return step.found === false ? '未找到' : '成功'
}

/** 后端 summary 已带中文动作（如「查本地库 西洋菜·生」），去掉与 label 重复的前缀。 */
function stepSummary(step: AgentStreamStep): string {
  const summary = step.summary.trim()
  for (const prefix of [`调用 ${step.label}`, step.label]) {
    if (prefix && summary.startsWith(prefix)) {
      return summary.slice(prefix.length).replace(/^[\s·:：-]+/, '')
    }
  }
  return summary
}

/** 本轮已运行秒数；结束后停在最终耗时，不再每秒重算。 */
function runElapsedSeconds(run: AgentRunRecord): number {
  const end = run.running ? clockNow.value : (run.finishedAt ?? clockNow.value)
  return Math.max(0, Math.floor((end - run.startedAt) / 1000))
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

async function scrollToBottom() {
  await nextTick()
  const element = bodyRef.value
  if (element) {
    element.scrollTop = element.scrollHeight
  }
}

watch(() => state.runs.length, scrollToBottom)
watch(() => state.running, scrollToBottom)

/** 关页 / 刷新时才拦（站内跳转靠失焦保存 + 保存队列兜底）。 */
function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedIngredientChanges.value) {
    return
  }
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  void scrollToBottom()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

/** 后端返回的草稿统一在这里落状态；`resetForm` 只在首次加载/新一轮后使用。 */
function applyDraft(
  updated: IngredientCreationDraft,
  options: { resetForm?: boolean } = {}
) {
  draft.value = updated
  loadedCard.value = toIngredientCard(updated.payload, updated.name)

  if (options.resetForm) {
    Object.assign(ingredientForm, loadedCard.value)
    checkResult.value = updated.payload.checks ?? null
    checkBlocked.value = false
    pendingCells.clear()
  }
}

async function loadDraft(draftId: string) {
  draftLoading.value = true
  draftError.value = ''
  try {
    const updated = await ingredientCreationApi.getDraft(draftId)
    applyDraft(updated, { resetForm: true })
    // 非流式路径：刷新 / 直接读草稿时，payload.pendingQuestion 也要恢复成
    // 「等你回答」，否则页面会像什么都没问过一样。
    state.draftId = updated.id
    state.pendingQuestion = readPendingQuestion(
      updated.payload.pendingQuestion
    )
  } catch (error) {
    draftError.value = getApiErrorMessage(error, '草稿加载失败，请稍后重试')
  } finally {
    draftLoading.value = false
  }
}

async function handleRun() {
  const text = inputText.value.trim()
  if (!text || state.running || saving.value || commitResult.value) {
    return
  }

  inputText.value = ''
  // 这一句要么是新指令，要么是在回答上一轮的问题；两种情况问题都已消费。
  state.pendingQuestion = null
  state.running = true
  const run = reactive<AgentRunRecord>({
    id: ++runSeq,
    text,
    steps: [],
    reply: null,
    draftId: null,
    meta: null,
    report: null,
    error: null,
    running: true,
    startedAt: Date.now(),
    finishedAt: null
  })
  state.runs.push(run)
  await scrollToBottom()

  const applyState = (next: AgentStreamState) => {
    run.steps = next.steps
    run.reply = next.reply
    run.draftId = next.draftId
    run.meta = next.meta
    run.report = next.report
    run.error = next.error
    state.pendingQuestion = next.pendingQuestion
    if (next.draftId) {
      state.draftId = next.draftId
    }
  }

  try {
    // 直接读 ReadableStream：step_start 一到就渲染「执行中」，
    // step_end 再改成成功 / 失败；断网时 next.steps 已经是收到的那几步。
    const finalState = await streamIngredientAgent(
      {
        ...(state.draftId ? { draftId: state.draftId } : {}),
        text
      },
      {
        onState: (next) => {
          applyState(next)
          void scrollToBottom()
        }
      }
    )
    applyState(finalState)
    if (finalState.draftId) {
      // 每跑完一轮都重新读草稿：右边两个标签永远显示服务端最新版本。
      await loadDraft(finalState.draftId)
    }
  } catch (error) {
    // 流式函数本身不抛错；这里是防御性兜底，且不清空已经收到的步骤。
    run.error = getApiErrorMessage(error, '流式请求失败，已保留收到的步骤。')
  } finally {
    run.finishedAt = Date.now()
    run.running = false
    state.running = false
    await scrollToBottom()
  }
}

/**
 * 点一个选项 = 把该选项原文发给同一个草稿。
 *
 * 不知道 draftId / 选项已经失效时什么都不发：宁可让人重新输入，
 * 也不能悄悄新建一份草稿，让答案落到别处。
 */
async function handleAnswerOption(option: string) {
  if (state.running || saving.value || commitResult.value) {
    return
  }
  const input = answerInputFromPendingQuestion(state, option)
  if (!input) {
    return
  }
  // 点之前按钮上已经有「未收录」小标和文案后缀；点之后再明确一次预期：
  // 这一轮会去线上找，线上也没有就留空，不会拿编造的数值凑。
  const check = state.pendingQuestion?.optionChecks?.find(
    (entry) => entry.label === option
  )
  if (check?.inLibrary === false) {
    ElMessage.info(
      '这个选项库里未收录：本轮会去线上检索；线上也没有就先留空待补。'
    )
  }
  // 兜底选项是「自由输入」入口：不把这句话当答案发给 AI，
  // 收起问题卡片、把光标放回输入框，让用户直接说自己的叫法。
  if (check?.kind === 'FREE') {
    state.pendingQuestion = null
    await nextTick()
    composerRef.value?.focus?.()
    ElMessage.info('直接输入你要用的名称即可。')
    return
  }
  state.pendingQuestion = null
  inputText.value = input.text
  await handleRun()
}

/**
 * 保存串行化：两个格子几乎同时改时，后一个必须在前一个返回后再读最新草稿，
 * 否则会用旧 profiles 覆盖掉前一次改动。
 */
function enqueueSave(task: () => Promise<void>): Promise<boolean> {
  const run = saveQueue.then(async () => {
    savingCount.value += 1
    saveError.value = ''
    saveFailed.value = false
    try {
      await task()
      return true
    } catch (error) {
      saveFailed.value = true
      saveError.value = getApiErrorMessage(error, '保存草稿失败，请稍后重试')
      return false
    } finally {
      savingCount.value -= 1
    }
  })

  saveQueue = run.then(() => undefined)
  return run
}

/** 一格在表单里的当前值（展示口径）。 */
function ingredientTextValue(key: IngredientCardFieldKey): string {
  const value = ingredientForm[key]
  return typeof value === 'string' ? value : ''
}

function ingredientCellText(cell: IngredientCardCell): string {
  return ingredientTextValue(cell.key)
}

function ingredientCellNumber(cell: IngredientCardCell): number | undefined {
  const value = ingredientForm[cell.key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function ingredientCellBoolean(cell: IngredientCardCell): boolean | null {
  const value = ingredientForm[cell.key]
  return typeof value === 'boolean' ? value : null
}

function ingredientCellTags(cell: IngredientCardCell): string[] {
  const value = ingredientForm[cell.key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function ingredientCellOptions(
  cell: IngredientCardCell
): { label: string; value: string }[] {
  return selectOptionsForValue(cell.options, ingredientForm[cell.key])
}

function ingredientCellMin(cell: IngredientCardCell): number {
  if (cell.key === 'purchaseToBaseRatio') {
    return 0.001
  }
  if (cell.key === 'productionLossRate') {
    return 1
  }
  return 0
}

function ingredientCellMax(cell: IngredientCardCell): number | undefined {
  if (cell.key === 'edibleYieldPercent') {
    return 100
  }
  if (cell.key === 'productionLossRate') {
    return 2
  }
  return undefined
}

function ingredientCellPrecision(cell: IngredientCardCell): number | undefined {
  if (
    cell.key === 'edibleYieldPercent' ||
    cell.key === 'productionLossRate'
  ) {
    return 2
  }
  if (cell.key === 'shelfLifeMonths' || cell.key === 'openedShelfLifeDays') {
    return 0
  }
  return undefined
}

/** 与后端 DTO 的长度上限一致，避免输入时就注定 400。 */
function ingredientCellMaxlength(cell: IngredientCardCell): number {
  switch (cell.key) {
    case 'name':
      return 100
    case 'nameEn':
      return 200
    case 'unitDisplayLabel':
    case 'purchaseUnit':
      return 50
    case 'brand':
    case 'productModel':
      return 100
    case 'purchaseChannel':
    case 'mainNutrientsDesc':
    case 'storageCondition':
      return 200
    default:
      return 500
  }
}

function isIngredientCellEmpty(cell: IngredientCardCell): boolean {
  return isEmptyIngredientCardValue(ingredientForm[cell.key])
}

function isIngredientCellClearable(cell: IngredientCardCell): boolean {
  // 类型与基准单位是建原料的必填项，不给清空；其余可选枚举允许清回空。
  return cell.kind === 'select' && cell.key !== 'type' && cell.key !== 'baseUnit'
}

/**
 * 一格的禁用状态：建完后补的 4 项始终禁用；保存中 / 提交中 / 已提交整卡禁用。
 *
 * 不能只写 `cell.isAfterCreate`：Element Plus 的 disabled 是
 * `props.disabled ?? form.disabled`，显式 false 会盖掉 el-form 的整卡禁用。
 */
function isIngredientCellDisabled(cell: IngredientCardCell): boolean {
  return (
    cell.isAfterCreate ||
    Boolean(commitResult.value) ||
    saving.value ||
    submitting.value
  )
}

/**
 * 表单值按控件的实际类型写入。
 *
 * 用一次窄化的下标写入：IngredientCardForm 是 30 个键的映射类型，
 * 逐个键写会让 TS 把联合键的写入类型收成 never。
 */
function setIngredientCellValue(
  key: IngredientCardFieldKey,
  value: IngredientCardFormValue
) {
  const target = ingredientForm as unknown as Record<
    string,
    IngredientCardFormValue
  >
  target[key] = value
}

function setIngredientCellTextValue(
  key: IngredientCardFieldKey,
  value: unknown
) {
  setIngredientCellValue(key, typeof value === 'string' ? value : '')
}

function setIngredientCellNumberValue(
  key: IngredientCardFieldKey,
  value: unknown
) {
  setIngredientCellValue(
    key,
    typeof value === 'number' && Number.isFinite(value) ? value : null
  )
}

function setIngredientCellBooleanValue(
  key: IngredientCardFieldKey,
  value: unknown
) {
  setIngredientCellValue(key, typeof value === 'boolean' ? value : null)
}

function isIngredientCellChanged(key: IngredientCardFieldKey): boolean {
  const before = loadedCard.value
  if (!before) {
    return true
  }
  return !ingredientCellValuesEqual(before[key], ingredientForm[key])
}

/**
 * 人改了原料卡的一格：先记人工标记，再把**整张 30 项卡**PATCH 回草稿。
 *
 * 后端 PATCH 是浅替换（`payload.ingredient` 会被整块覆盖），只发改动的那一格
 * 会把 AI 填的其它字段悄悄抹掉，所以每次保存都必须发完整原料卡。
 */
async function saveIngredientCell(key: IngredientCardFieldKey) {
  if (!draft.value || commitResult.value) {
    return
  }
  if (!isIngredientCellChanged(key)) {
    return
  }

  const marked = markIngredientFieldManual(ingredientForm, key)
  ingredientForm.manualFields = marked.manualFields
  const ingredient = toIngredientDraftFromCells(
    draft.value.payload.ingredient,
    ingredientForm
  )
  const draftId = draft.value.id
  const step = draft.value.step
  checkResult.value = null
  checkBlocked.value = false

  await enqueueSave(async () => {
    const updated = await ingredientCreationApi.patchDraft(draftId, step, {
      ingredient
    })
    draft.value = updated
    // 服务端会 trim 字符串、把目录外枚举收敛成空；把归一化结果回写表单，
    // 否则表单会长期「看起来有改动」，刷新提示也一直挂着。
    const nextCard = toIngredientCard(updated.payload, updated.name)
    loadedCard.value = nextCard
    Object.assign(ingredientForm, nextCard)
  })
}

function handleIngredientTextChange(
  key: IngredientCardFieldKey,
  value: unknown
) {
  setIngredientCellTextValue(key, value)
  void saveIngredientCell(key)
}

function handleIngredientSelectChange(
  key: IngredientCardFieldKey,
  value: unknown
) {
  setIngredientCellTextValue(key, value)
  void saveIngredientCell(key)
}

function handleIngredientNumberChange(
  key: IngredientCardFieldKey,
  value: unknown
) {
  setIngredientCellNumberValue(key, value)
  void saveIngredientCell(key)
}

function handleIngredientBooleanChange(
  key: IngredientCardFieldKey,
  value: unknown
) {
  setIngredientCellBooleanValue(key, value)
  void saveIngredientCell(key)
}

function cellKey(profileIndex: number, fieldPath: string): string {
  return `${profileIndex}:${fieldPath}`
}

/** 乐观显示刚输入的值；PATCH 成功后以服务端返回为准。 */
function cellValue(profileIndex: number, row: ProfileFieldRow): number | null {
  const key = cellKey(profileIndex, row.fieldPath)
  return pendingCells.has(key) ? pendingCells.get(key)! : row.value
}

async function handleCellChange(
  profileIndex: number,
  row: ProfileFieldRow,
  value: number | undefined
) {
  if (!draft.value || commitResult.value) {
    return
  }

  const nextValue =
    typeof value === 'number' && Number.isFinite(value) ? value : null
  const key = cellKey(profileIndex, row.fieldPath)
  if (row.value === nextValue && !pendingCells.has(key)) {
    return
  }

  pendingCells.set(key, nextValue)
  checkResult.value = null
  checkBlocked.value = false

  const draftId = draft.value.id
  const step = draft.value.step
  const ok = await enqueueSave(async () => {
    const profiles = applyProfileCellEdit(
      draft.value?.payload.profiles ?? [],
      profileIndex,
      row.fieldPath,
      nextValue
    )
    const updated = await ingredientCreationApi.patchDraft(draftId, step, {
      profiles
    })
    draft.value = updated
    pendingCells.delete(key)
  })

  if (!ok) {
    pendingCells.delete(key)
  }
}

function tabSections(group: ProfileGroup) {
  return INGREDIENT_NUTRITION_TAB_DEFINITIONS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    rows: group.rows.filter((row) => row.tabKey === tab.key)
  })).filter((section) => section.rows.length > 0)
}

/** 提交：先跑终检，有 blocking 就停在页面上；通过才调 commit。 */
async function handleSubmit() {
  if (!draft.value || submitting.value) {
    return
  }
  if (!canSubmit.value) {
    ElMessage.warning(submitHint.value)
    return
  }

  submitting.value = true
  submitError.value = ''
  verifyError.value = ''
  verified.value = false

  try {
    await saveQueue
    if (saveFailed.value) {
      submitError.value = saveError.value || '草稿还有没保存成功的改动，不能提交'
      return
    }

    const check = await ingredientCreationApi.runCheck(draft.value.id)
    checkResult.value = check
    if (check.blocking.length > 0) {
      checkBlocked.value = true
      submitError.value = `终检有 ${check.blocking.length} 项阻断，已阻止提交`
      return
    }
    checkBlocked.value = false

    const input = toCommitInput(
      draft.value.payload,
      // 以当前表单为准：刚改完还没离开输入框的字段也要一起提交。
      toIngredientDraft(ingredientForm)
    )
    if (!input) {
      submitError.value = '草稿还缺原料名或营养档案，不能提交'
      return
    }

    const result = await ingredientCreationApi.commit(draft.value.id, input)
    commitResult.value = result
    ElMessage.success('提交成功，营养档案已创建为「待验证」')
  } catch (error) {
    submitError.value = getApiErrorMessage(error, '提交失败，请稍后重试')
    const rawBlocking = (
      error as { response?: { data?: { blocking?: unknown } } }
    )?.response?.data?.blocking
    if (Array.isArray(rawBlocking)) {
      checkBlocked.value = true
      checkResult.value = {
        blocking: rawBlocking as FinalCheckResult['blocking'],
        exceptionable: [],
        warnings: []
      }
    }
  } finally {
    submitting.value = false
  }
}

/** 确认可用：对提交返回的每个 nutritionFoodId 一个一个验证，失败逐条留原文。 */
async function handleVerify() {
  if (!isAdmin.value) {
    ElMessage.warning(ADMIN_ONLY_TIP)
    return
  }

  const nutritionFoodIds = commitResult.value?.nutritionFoodIds ?? []
  if (nutritionFoodIds.length === 0) {
    verifyError.value = '这次提交没有返回营养档案，无法确认可用'
    return
  }

  verifying.value = true
  verifyError.value = ''

  const failures: string[] = []
  for (const nutritionFoodId of nutritionFoodIds) {
    try {
      await nutritionFoodApi.verify(nutritionFoodId)
    } catch (error) {
      failures.push(
        `${shortId(nutritionFoodId)}：${getApiErrorMessage(
          error,
          '确认可用失败，请稍后重试'
        )}`
      )
    }
  }

  verifying.value = false

  if (failures.length === 0) {
    verified.value = true
    ElMessage.success('已确认可用，配方里现在能选到这些档案')
    return
  }

  verifyError.value = failures.join('\n')
}

function goBackToList() {
  void router.push('/ingredients')
}
</script>

<style scoped>
.ai-agent-page {
  max-width: 1440px;
  margin: 0 auto;
}

.ai-agent-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.ai-agent-header__title {
  margin: 0;
  font-size: 24px;
  color: var(--el-text-color-primary);
}

.ai-agent-header__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.ai-agent-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 540px);
  gap: 16px;
  align-items: start;
}

.agent-panel,
.review-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 220px);
  min-height: 480px;
  max-height: 860px;
}

.agent-panel :deep(.el-card__body),
.review-panel :deep(.el-card__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.agent-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.agent-panel__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-success);
}

.agent-panel__draft {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.agent-panel__waiting {
  flex-shrink: 0;
}

.agent-panel__draft code {
  font-family: var(--el-font-family-mono, monospace);
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.agent-panel__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  background: var(--el-bg-color);
  scroll-behavior: smooth;
}

.agent-run {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-run__ask {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.agent-run__role {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  line-height: 26px;
  text-align: center;
}

.agent-run__role--me {
  background: var(--el-color-primary);
  color: #fff;
}

.agent-run__role--ai {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.agent-run__ask-text {
  margin: 0;
  padding: 8px 12px;
  border-radius: 10px;
  border-top-left-radius: 4px;
  background: var(--el-fill-color-light);
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.agent-run__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-left: 34px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agent-run__report-failures {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 34px;
  font-size: 12px;
  color: var(--el-color-danger);
}

.agent-steps__body .agent-run__report-failures {
  padding-left: 0;
}

.agent-run__report-failure {
  word-break: break-word;
}

.agent-steps {
  padding-left: 34px;
}

/* 执行步骤默认只占一行；展开后才显示每一步的工具与结果。 */
.agent-steps__summary {
  cursor: pointer;
  width: fit-content;
  padding: 2px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  user-select: none;
}

.agent-steps__summary:hover {
  color: var(--el-color-primary);
}

.agent-steps__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.agent-steps__body .agent-run__meta {
  padding-left: 0;
}

.agent-step {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.agent-step--failed {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}

.agent-step--empty {
  border-color: var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
}

.agent-step--running {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.agent-step--running .agent-step__index {
  animation: agent-step-pulse 1.2s ease-in-out infinite;
}

@keyframes agent-step-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.agent-step__index {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  font-size: 11px;
  line-height: 20px;
  text-align: center;
}

.agent-step--failed .agent-step__index {
  background: var(--el-color-danger-light-7);
  color: var(--el-color-danger);
}

.agent-step__body {
  flex: 1;
  min-width: 0;
}

.agent-step__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.agent-step__label {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.agent-step__summary {
  font-size: 13px;
  color: var(--el-text-color-regular);
  word-break: break-word;
}

.agent-step__result,
.agent-step__record {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-word;
}

.agent-step__head :deep(.el-tag) {
  margin-left: auto;
}

.agent-step__evidence {
  margin-top: 8px;
}

.agent-step__evidence-summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--el-color-primary);
  user-select: none;
}

.agent-step__evidence-body {
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  font-size: 12px;
}

.agent-step__groups {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.agent-step__groups-title {
  color: #6b7280;
  font-size: 12px;
}

.agent-step__group {
  max-width: 100%;
}

.agent-step__keywords {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  color: var(--el-text-color-secondary);
}

.agent-step__empty {
  margin: 0;
  font-weight: 600;
  color: var(--el-color-warning);
}

.agent-step__matches {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.agent-step__match {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.agent-step__match-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.agent-step__match-en,
.agent-step__match-meta,
.agent-step__match-more,
.agent-step__match-reason {
  color: var(--el-text-color-secondary);
}

/* AI 判断单独成组，与「匹配方式 / 关键词 / 分数」这些代码证据分开。 */
.agent-step__match-ai {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-left: 6px;
  border-left: 2px solid var(--el-border-color);
}

.agent-step__match-more {
  margin: 6px 0 0;
}

.agent-step__error {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-color-danger);
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-run__reply {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.agent-run__reply-text {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 10px;
  border-top-left-radius: 4px;
  background: var(--el-color-primary-light-9);
  font-size: 14px;
  line-height: 1.7;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 提问气泡下面的可点选项：一问一答，不让人自己再组织一遍措辞。 */
.agent-ask {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-ask__options {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding-left: 34px;
  box-sizing: border-box;
}

/* 先把「AI 判断」和「你的选择」说清楚：标签是参考，按钮才是决定。 */
.agent-ask__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agent-ask__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 选项纵向一列，一行一张卡片；宽度跟随面板，不设固定宽度。 */
.agent-ask__buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

/*
 * 卡片必须是自适应高度：历史上 el-button 的固定高度（小号 24px）装不下
 * 「名字 + 标签 + 理由」，内容溢出后会直接压到下一个选项上。
 */
.agent-ask__option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: auto;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.agent-ask__option:hover:not(:disabled) {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}

.agent-ask__option:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
}

.agent-ask__option:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* 第一行：名字占满剩余宽度，标签固定在右侧且不参与收缩。 */
.agent-ask__option-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

/* 长选项单行省略，避免 120 字文案把卡片撑破；完整文案在 title 里。 */
.agent-ask__option-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.agent-ask__option-meta {
  display: flex;
  flex-shrink: 0;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

/* 第二行：理由自动换行，不截断、不覆盖上面的名字。 */
.agent-ask__option-reason {
  display: block;
  width: 100%;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: normal;
  word-break: break-word;
  text-align: left;
}

.agent-ask__option-tag {
  flex-shrink: 0;
}

/* 窄屏：名字继续单行省略，标签整体换到下一行，不跟名字抢宽度。 */
@media (max-width: 640px) {
  .agent-ask__options {
    padding-left: 0;
  }

  .agent-ask__option-head {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .agent-ask__option-text {
    flex: 1 1 100%;
  }

  .agent-ask__option-meta {
    flex: 1 1 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}

.agent-run__failure {
  margin-left: 34px;
  padding: 10px 12px;
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 10px;
  background: var(--el-color-danger-light-9);
}

.agent-run__failure-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-color-danger);
}

.agent-run__failure-text {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-color-danger);
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-typing {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agent-typing__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
  animation: agent-pulse 1s ease-in-out infinite;
}

.agent-typing__elapsed {
  font-variant-numeric: tabular-nums;
}

@keyframes agent-pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.agent-composer {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-light);
}

.agent-composer :deep(.el-input) {
  flex: 1;
}

.agent-composer :deep(.el-input__wrapper) {
  border-radius: 8px;
}

.agent-composer :deep(.el-button) {
  border-radius: 8px;
}

/* ---------- 右侧审核面板 ---------- */

.review-panel__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.review-panel__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.review-panel__step {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.review-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.review-panel__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.review-loading {
  flex: 1;
  min-height: 120px;
}

.review-tabs {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.review-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
}

.review-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  padding: 12px 16px;
  overflow-y: auto;
}

.review-alert {
  margin: 12px 16px;
}

.review-error-text {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.ingredient-form {
  padding-top: 4px;
}

.ingredient-group + .ingredient-group {
  margin-top: 16px;
}

.ingredient-group__head {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.ingredient-form__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 10px;
}

.ingredient-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
}

/* 空格子不隐藏：虚线框 + 控件占位「空」，仍然是可点的输入位。 */
.ingredient-cell--empty {
  border: 1px dashed var(--el-border-color);
  background: var(--el-fill-color-lighter);
}

.ingredient-cell--empty :deep(.el-input__wrapper),
.ingredient-cell--empty :deep(.el-select__wrapper) {
  background: transparent;
  box-shadow: none;
}

.ingredient-cell--empty:focus-within {
  border-color: var(--el-color-primary);
  border-style: solid;
}

.ingredient-cell--empty:focus-within :deep(.el-input__wrapper),
.ingredient-cell--empty:focus-within :deep(.el-select__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

.ingredient-cell--after-create {
  background: var(--el-fill-color-light);
}

.ingredient-cell--after-create .ingredient-cell__label,
.ingredient-cell--after-create .ingredient-cell__unit {
  color: var(--el-text-color-placeholder);
}

.ingredient-cell__head {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.ingredient-cell__label {
  font-size: 12px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ingredient-cell__unit {
  flex: none;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.ingredient-cell__source {
  flex: none;
  margin-left: auto;
}

.ingredient-cell__note {
  flex: none;
  margin-left: auto;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
}

.ingredient-cell__control {
  width: 100%;
}

.ingredient-cell__control :deep(.el-input__wrapper),
.ingredient-cell__control :deep(.el-select__wrapper) {
  width: 100%;
}

.ingredient-cell__hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--el-color-warning);
}

.ingredient-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 24px;
}

.ingredient-cell__empty-text {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.review-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.profile-group {
  margin-bottom: 18px;
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-blank);
}

.profile-group__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.profile-group__source {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.profile-section + .profile-section {
  margin-top: 10px;
}

.profile-section__head {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.profile-rows {
  display: flex;
  flex-direction: column;
}

.profile-row {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) 86px 40px 52px minmax(60px, 1fr);
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  font-size: 12px;
}

.profile-row:last-child {
  border-bottom: none;
}

.profile-row__label {
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-row__input {
  width: 86px;
}

.profile-row__unit {
  color: var(--el-text-color-secondary);
  text-align: center;
}

.profile-row__status {
  justify-self: start;
}

.profile-row__source {
  color: var(--el-text-color-placeholder);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-feedback {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 8px;
}

.review-blocking {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
}

.review-blocking__path {
  color: var(--el-text-color-secondary);
}

.review-commit-result {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.review-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-light);
}

.review-footer__hint {
  flex: 1;
  min-width: 160px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 1200px) {
  .ai-agent-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .agent-panel,
  .review-panel {
    height: 620px;
    max-height: 720px;
  }
}

@media (max-width: 900px) {
  .agent-panel,
  .review-panel {
    height: 560px;
  }

  .agent-panel__draft {
    max-width: 55%;
    text-align: right;
  }

  .ingredient-form__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
