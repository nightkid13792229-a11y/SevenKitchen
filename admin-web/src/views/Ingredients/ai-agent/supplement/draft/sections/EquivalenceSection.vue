<template>
  <section class="draft-section">
    <div class="draft-section__group">
      <h4 class="draft-section__title">归组意向</h4>
      <div class="draft-section__row">
        <label class="draft-field" style="flex: 1">
          <span class="draft-field__label">
            <span>等价组</span>
            <AiFieldTag :tag="aiTag('equivalence.groupId')" />
            <span
              v-if="isManual('equivalence.groupId')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-select
            :model-value="equivalence.groupId ?? undefined"
            placeholder="选择等价组，或明确暂不归组"
            filterable
            style="width: 100%"
            :loading="groupsLoading"
            @update:model-value="(value: string) => updateGroup(value)"
          >
            <el-option
              label="暂不归组（明确不参与缺货替换）"
              :value="GROUP_SKIPPED"
            />
            <el-option
              v-for="group in groups"
              :key="group.id"
              :label="groupOptionLabel(group)"
              :value="group.id"
            />
          </el-select>
          <em v-if="!equivalence.groupId && missingReason('equivalence.groupId')" class="draft-field__missing" :title="missingReason('equivalence.groupId')">
            AI 没找到，请补
          </em>
          <em class="draft-field__hint">
            「暂不归组」是明确表态，和「还没选」不同；最终校验会要求二者之一。
          </em>
          <em v-if="groupsError" class="draft-field__warn">
            {{ groupsError }}
            <el-button text size="small" data-action="equivalence-retry" @click="loadGroups">
              重试
            </el-button>
          </em>
        </label>

        <label class="draft-field" style="width: 200px">
          <span class="draft-field__label">
            <span>组内优先级</span>
            <AiFieldTag :tag="aiTag('equivalence.priority')" />
            <span
              v-if="isManual('equivalence.priority')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-input-number
            :model-value="equivalence.priority ?? undefined"
            :min="0"
            :precision="0"
            controls-position="right"
            style="width: 100%"
            @update:model-value="
              (value: number | undefined) => updatePriority(value ?? null)
            "
          />
          <em class="draft-field__hint">0 最前；可选，不填按组内默认排序。</em>
        </label>
      </div>

      <p v-if="selectedGroup" class="draft-section__readonly" style="margin-top: 14px">
        当前组：{{ selectedGroup.name }}（{{ selectedGroup.code }}） · 状态
        {{ statusLabel(selectedGroup.status) }} · 成员
        {{ selectedGroup.memberCount }} 个。
        <template v-if="selectedGroup.status === 'APPROVED'">
          加入已审核组会把组打回待审核。
        </template>
      </p>

      <div
        v-if="selectedGroup && selectedGroup.status === 'APPROVED'"
        class="draft-section__row"
        style="margin-top: 10px"
      >
        <el-checkbox
          :model-value="equivalence.reapproveGroup"
          data-action="equivalence-reapprove"
          @update:model-value="
            (value: boolean | string | number) => updateReapprove(value === true)
          "
        >
          本次一并审核通过
        </el-checkbox>
        <em v-if="!equivalence.reapproveGroup" class="draft-field__warn">
          组会留在待审核，缺货替换暂不生效
        </em>
        <em v-else class="draft-field__hint">
          默认勾选；取消后组会留在待审核，需要的话稍后到等价组页审核。
        </em>
      </div>

      <el-alert
        v-if="recommendations && !recommendations.equivalenceEnabled"
        type="warning"
        :closable="false"
        show-icon
        class="draft-section__alert"
        title="等价组总开关关着：加入组也不会参与缺货替换。"
      />
    </div>

    <div class="draft-section__group">
      <div class="draft-section__row" style="justify-content: space-between">
        <h4 class="draft-section__title" style="margin: 0">AI / 系统推荐组</h4>
        <el-button
          :loading="recommending"
          :disabled="!draftId"
          data-action="equivalence-recommend"
          @click="loadRecommendations"
        >
          推荐等价组
        </el-button>
      </div>

      <p v-if="recommendError" class="draft-field__warn">
        {{ recommendError }}
      </p>

      <p v-if="!recommendations && !recommending" class="draft-section__empty">
        还没有推荐结果；点「推荐等价组」会按草稿的营养、单位、形态算候选组。
      </p>
      <p
        v-else-if="recommendations && recommendations.candidates.length === 0"
        class="draft-section__empty"
      >
        没有合适的候选组。可以先选「暂不归组」，之后在等价组页再维护。
      </p>

      <div v-else-if="recommendations" class="draft-section__list">
        <div
          v-for="candidate in recommendations.candidates"
          :key="candidate.groupId"
          class="draft-equivalence__candidate"
        >
          <div class="draft-equivalence__candidate-main">
            <p class="draft-equivalence__candidate-title">
              {{ candidate.name }}（{{ candidate.code }}）
              <el-tag size="small" effect="plain">
                {{ statusLabel(candidate.status) }}
              </el-tag>
              <el-tag size="small" effect="plain" type="info">
                成员 {{ candidate.memberCount }}
              </el-tag>
            </p>
            <p class="draft-equivalence__candidate-reason">
              {{ candidate.reason }}
            </p>
            <p class="draft-equivalence__candidate-meta">
              参考营养素：{{ candidate.nutrientLabel }}（{{ candidate.nutrientUnit }}）
              <template v-if="candidate.actualUnit">
                · 本原料单位：{{ candidate.actualUnit }}
              </template>
            </p>
          </div>
          <el-button
            size="small"
            :disabled="equivalence.groupId === candidate.groupId"
            data-action="equivalence-use-candidate"
            @click="useCandidate(candidate.groupId)"
          >
            {{ equivalence.groupId === candidate.groupId ? '已选' : '用这个组' }}
          </el-button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * ⑦ 等价组（spec §12.7）。
 *
 * 组列表来自现有 `supplementEquivalenceApi.listGroups`；推荐用草稿态接口
 * `recommendGroups(draftId)`（没有 ingredientId）。推荐只是建议，点「用这个组」
 * 才写草稿并标人改；「暂不归组」用 `__SKIP__` 明确表态。
 */
import { computed, onMounted, ref } from 'vue'
import {
  supplementEquivalenceApi,
  type EquivalenceGroupStatus,
  type EquivalenceGroupSummary
} from '@/api/supplementEquivalence'
import {
  supplementDraftsApi,
  type SupplementDraftAiSnapshot,
  type SupplementDraftEquivalence,
  type SupplementDraftGroupRecommendations
} from '@/api/supplementDrafts'
import { getApiErrorMessage } from '@/utils/apiError'
import { GROUP_SKIPPED } from '../../launchConfigState'
import { isManualDraftPath } from '../supplementDraftState'
import AiFieldTag from './AiFieldTag.vue'
import { aiFieldTag, aiMissingReason } from './aiFieldMeta'

const props = defineProps<{
  aiSnapshot?: SupplementDraftAiSnapshot | null
  /** 当前草稿 id：推荐接口按草稿态算候选 */
  draftId: string
  /** 人改过的字段路径；用于显示「人改」标记 */
  manualFields?: string[]
  /** 只有人的输入事件才调用它（初始加载/AI 回写都不调用） */
  markManual?: (path: string) => void
}>()

const equivalence = defineModel<SupplementDraftEquivalence>({ required: true })

const STATUS_LABELS: Record<EquivalenceGroupStatus, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审核',
  APPROVED: '已审核',
  DISABLED: '已停用'
}

const groups = ref<EquivalenceGroupSummary[]>([])
const groupsLoading = ref(false)
const groupsError = ref('')

const recommendations = ref<SupplementDraftGroupRecommendations | null>(null)
const recommending = ref(false)
const recommendError = ref('')

const selectedGroup = computed(
  () => groups.value.find((group) => group.id === equivalence.value.groupId) ?? null
)

function statusLabel(status: string): string {
  return STATUS_LABELS[status as EquivalenceGroupStatus] ?? status
}

function groupOptionLabel(group: EquivalenceGroupSummary): string {
  return `${group.name}（${group.code}） · ${statusLabel(group.status)} · ${group.memberCount} 个成员`
}

function isManual(path: string): boolean {
  return isManualDraftPath(path, props.manualFields ?? [])
}

const aiTag = (path: string) => aiFieldTag(props.aiSnapshot, path)
const missingReason = (path: string) => aiMissingReason(props.aiSnapshot, path)

async function loadGroups(): Promise<void> {
  groupsLoading.value = true
  groupsError.value = ''
  try {
    const result = await supplementEquivalenceApi.listGroups({
      page: 1,
      pageSize: 200
    })
    groups.value = result.items
  } catch (err) {
    groupsError.value = getApiErrorMessage(err, '加载等价组失败')
  } finally {
    groupsLoading.value = false
  }
}

async function loadRecommendations(): Promise<void> {
  if (!props.draftId || recommending.value) return
  recommending.value = true
  recommendError.value = ''
  try {
    recommendations.value = await supplementDraftsApi.recommendGroups(props.draftId)
  } catch (err) {
    recommendError.value = getApiErrorMessage(err, '推荐等价组失败')
  } finally {
    recommending.value = false
  }
}

function updateGroup(value: string): void {
  props.markManual?.('equivalence.groupId')
  equivalence.value.groupId = value
}

function useCandidate(groupId: string): void {
  updateGroup(groupId)
}

function updatePriority(value: number | null): void {
  props.markManual?.('equivalence.priority')
  equivalence.value.priority = value
}

function updateReapprove(value: boolean): void {
  props.markManual?.('equivalence.reapproveGroup')
  equivalence.value.reapproveGroup = value
}

onMounted(() => {
  void loadGroups()
})
</script>

<style scoped src="./draftSection.css"></style>

<style scoped>
.draft-section__alert {
  margin-top: 12px;
}

.draft-equivalence__candidate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid #eceff3;
  border-radius: 8px;
  background: #fafbfc;
}

.draft-equivalence__candidate-main {
  min-width: 0;
}

.draft-equivalence__candidate-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #38414d;
}

.draft-equivalence__candidate-reason {
  margin: 0 0 4px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #5b6470;
}

.draft-equivalence__candidate-meta {
  margin: 0;
  font-size: 11.5px;
  color: #98a1ad;
}
</style>
