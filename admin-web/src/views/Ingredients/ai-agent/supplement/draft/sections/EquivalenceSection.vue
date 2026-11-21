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

      <div v-if="selectedGroup" class="draft-equivalence__members" data-equivalence-members>
        <div class="draft-equivalence__members-head">
          <h5 class="draft-equivalence__members-title">成员与当前排序</h5>
          <el-button
            text
            size="small"
            :loading="groupDetailLoading"
            data-action="equivalence-refresh-members"
            @click="loadGroupDetail(equivalence.groupId ?? '')"
          >
            刷新成员
          </el-button>
        </div>

        <p v-if="groupDetailLoading" class="draft-section__empty">正在加载成员…</p>
        <p v-else-if="groupDetailError" class="draft-field__warn">
          {{ groupDetailError }}
        </p>
        <p v-else-if="membersSorted.length === 0" class="draft-section__empty">
          组里还没有成员。
        </p>
        <el-table v-else :data="membersSorted" size="small" border>
          <el-table-column label="顺序" width="64" align="center">
            <template #default="{ row }">{{ row.equivalencePriority }}</template>
          </el-table-column>
          <el-table-column label="原料" min-width="220">
            <template #default="{ row }">
              <span class="draft-equivalence__member-name">{{ row.name }}</span>
              <span v-if="row.brand" class="draft-equivalence__member-meta">
                {{ row.brand }}
              </span>
              <span v-if="row.productModel" class="draft-equivalence__member-meta">
                {{ row.productModel }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="浓度" width="120">
            <template #default="{ row }">
              <template v-if="row.concentration">
                {{ row.concentration.value }} {{ row.concentration.unit }}
              </template>
              <el-tag v-else size="small" type="warning" effect="plain">
                {{ concentrationStatusLabel(row.concentrationStatus) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="用途" width="150">
            <template #default="{ row }">
              <el-tag v-if="row.supplementRetailEnabled" size="small" effect="plain">上架</el-tag>
              <el-tag v-if="row.diyEnabled" size="small" type="success" effect="plain">DIY</el-tag>
              <el-tag v-if="row.procurementEnabled" size="small" type="info" effect="plain">采购</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <p class="draft-field__hint">
          新补剂写入时按你填的「组内优先级」排队：0 最前，数字越小越前。
          先看上面的现有顺序，再决定填最前、中间还是最后。
        </p>
      </div>

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

      <p class="draft-field__hint" style="margin-top: 0">
        推荐只是候选，不会自动改草稿；点「采用这个组」才写进草稿。
      </p>

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
          <div class="draft-equivalence__candidate-actions">
            <el-button
              size="small"
              data-action="equivalence-preview-candidate"
              @click="toggleCandidateMembers(candidate.groupId)"
            >
              {{ previewGroupId === candidate.groupId ? '收起成员' : '查看成员' }}
            </el-button>
            <el-button
              size="small"
              type="primary"
              :disabled="equivalence.groupId === candidate.groupId"
              data-action="equivalence-use-candidate"
              @click="useCandidate(candidate.groupId)"
            >
              {{ equivalence.groupId === candidate.groupId ? '已采用' : '采用这个组' }}
            </el-button>
          </div>

          <div
            v-if="previewGroupId === candidate.groupId"
            class="draft-equivalence__preview"
          >
            <p v-if="previewLoading" class="draft-section__empty">正在加载成员…</p>
            <p v-else-if="previewError" class="draft-field__warn">{{ previewError }}</p>
            <p v-else-if="previewMembers.length === 0" class="draft-section__empty">
              组里还没有成员。
            </p>
            <ol v-else class="draft-equivalence__preview-list">
              <li v-for="member in previewMembers" :key="member.id">
                <b>{{ member.equivalencePriority }}</b>
                · {{ member.name }}
                <span v-if="member.productModel" class="draft-equivalence__member-meta">
                  {{ member.productModel }}
                </span>
                <span class="draft-equivalence__member-meta">
                  {{ concentrationStatusLabel(member.concentrationStatus) }}
                </span>
              </li>
            </ol>
          </div>
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
import { computed, onMounted, ref, watch } from 'vue'
import {
  supplementEquivalenceApi,
  type EquivalenceGroupDetail,
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
import {
  concentrationStatusLabel,
  sortGroupMembers
} from '../equivalenceView'
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

const groupDetail = ref<EquivalenceGroupDetail | null>(null)
const groupDetailLoading = ref(false)
const groupDetailError = ref('')

const previewGroupId = ref('')
const previewDetail = ref<EquivalenceGroupDetail | null>(null)
const previewLoading = ref(false)
const previewError = ref('')

const selectedGroup = computed(
  () => groups.value.find((group) => group.id === equivalence.value.groupId) ?? null
)

const membersSorted = computed(() =>
  sortGroupMembers(groupDetail.value?.members ?? [])
)
const previewMembers = computed(() =>
  sortGroupMembers(previewDetail.value?.members ?? [])
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

async function loadGroupDetail(groupId: string): Promise<void> {
  if (!groupId || groupId === GROUP_SKIPPED) {
    groupDetail.value = null
    groupDetailError.value = ''
    return
  }
  groupDetailLoading.value = true
  groupDetailError.value = ''
  try {
    groupDetail.value = await supplementEquivalenceApi.getGroup(groupId)
  } catch (err) {
    groupDetail.value = null
    groupDetailError.value = getApiErrorMessage(err, '加载组成员失败')
  } finally {
    groupDetailLoading.value = false
  }
}

async function toggleCandidateMembers(groupId: string): Promise<void> {
  if (previewGroupId.value === groupId) {
    previewGroupId.value = ''
    previewDetail.value = null
    previewError.value = ''
    return
  }
  previewGroupId.value = groupId
  previewDetail.value = null
  previewError.value = ''
  previewLoading.value = true
  try {
    previewDetail.value = await supplementEquivalenceApi.getGroup(groupId)
  } catch (err) {
    previewError.value = getApiErrorMessage(err, '加载组成员失败')
  } finally {
    previewLoading.value = false
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

watch(
  () => equivalence.value.groupId,
  (groupId) => {
    void loadGroupDetail(groupId ?? '')
  },
  { immediate: true }
)

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
  flex-wrap: wrap;
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
  flex: 1 1 320px;
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

.draft-equivalence__candidate-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 0 0 auto;
}

.draft-equivalence__preview {
  flex-basis: 100%;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #dfe4ea;
}

.draft-equivalence__preview-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12.5px;
  line-height: 1.9;
  color: #5b6470;
}

.draft-equivalence__members {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid #eceff3;
  border-radius: 8px;
  background: #fff;
}

.draft-equivalence__members-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.draft-equivalence__members-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #38414d;
}

.draft-equivalence__member-name {
  margin-right: 6px;
  font-weight: 600;
}

.draft-equivalence__member-meta {
  margin-right: 6px;
  font-size: 12px;
  color: #98a1ad;
}
</style>
