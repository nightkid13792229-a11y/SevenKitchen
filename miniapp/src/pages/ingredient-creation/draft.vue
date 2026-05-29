<template>
  <view class="ingredient-creation-draft-page">
    <view v-if="entryError" class="state-block">
      <text class="empty-title">{{ entryError }}</text>
      <button class="secondary-btn" @tap="goToJobList">返回任务列表</button>
    </view>

    <view v-else-if="loading && !draft" class="state-block">
      <text>加载中...</text>
    </view>

    <view v-else-if="!draft" class="state-block">
      <text class="empty-title">未找到食材草稿</text>
      <button class="secondary-btn" @tap="goBack">返回</button>
    </view>

    <view v-else>
      <view class="summary-panel">
        <view class="summary-header">
          <view class="summary-title-block">
            <text class="page-title">{{ draft.suggestedName || '未命名食材' }}</text>
            <text class="page-subtitle">{{ getDraftStatusLabel(draft.status) }}</text>
          </view>
          <text :class="['status-badge', getDraftStatusClass(draft.status)]">
            {{ getDraftStatusLabel(draft.status) }}
          </text>
        </view>

        <view class="metric-grid">
          <view class="metric-card">
            <text class="metric-label">完整性</text>
            <text class="metric-value">{{ completeness.filled }}/{{ completeness.total }}</text>
          </view>
          <view class="metric-card">
            <text class="metric-label">非零</text>
            <text class="metric-value">{{ completeness.nonZero }}</text>
          </view>
          <view class="metric-card">
            <text class="metric-label">零值</text>
            <text class="metric-value">{{ completeness.zero }}</text>
          </view>
          <view class="metric-card">
            <text class="metric-label">空值</text>
            <text class="metric-value">{{ completeness.empty }}</text>
          </view>
        </view>

        <text v-if="draft.agentSummary" class="agent-summary">{{ draft.agentSummary }}</text>

        <button
          v-if="isAdmin && draft?.status === 'READY_FOR_REVIEW'"
          class="primary-btn full-btn"
          :disabled="confirming"
          @tap="confirmDraft"
        >
          {{ confirming ? '确认中' : '确认创建正式原料' }}
        </button>
      </view>

      <view class="section">
        <text class="section-title">草稿信息</text>
        <text v-if="!isAdmin" class="readonly-note">仅管理员可编辑草稿信息，员工可查看完整性和档案。</text>
        <view v-if="isAdmin" class="admin-edit-section">
          <view class="field-row">
            <text class="field-label">食材名称</text>
            <input
              v-model="draftForm.suggestedName"
              class="text-input"
              maxlength="50"
              placeholder="输入正式食材名称"
            />
          </view>
          <view class="field-row">
            <text class="field-label">显示单位</text>
            <input
              v-model="draftForm.unitDisplayLabel"
              class="text-input"
              maxlength="20"
              placeholder="例如 g、ml、个"
            />
          </view>
          <view class="field-row stacked">
            <text class="field-label">采购策略</text>
            <view class="choice-row">
              <button
                v-for="option in procurementStrategyOptions"
                :key="option.value"
                class="choice-btn"
                :class="{ active: draftForm.procurementStrategy === option.value }"
                @tap="selectProcurementStrategy(option.value)"
              >
                {{ option.label }}
              </button>
            </view>
          </view>
          <view class="switch-row">
            <label class="switch-item">
              <switch
                :checked="draftForm.diyEnabled"
                color="#1890ff"
                @change="setDraftBoolean('diyEnabled', $event)"
              />
              <text>DIY 可用</text>
            </label>
            <label class="switch-item">
              <switch
                :checked="draftForm.procurementEnabled"
                color="#1890ff"
                @change="setDraftBoolean('procurementEnabled', $event)"
              />
              <text>采购可用</text>
            </label>
          </view>
          <view class="field-row stacked">
            <text class="field-label">审核备注</text>
            <textarea
              v-model="draftForm.notes"
              class="textarea-input"
              maxlength="300"
              placeholder="记录人工审核结论或后续处理要求"
            />
          </view>
          <button
            class="secondary-btn full-btn"
            :disabled="savingDraft"
            @tap="saveDraft"
          >
            {{ savingDraft ? '保存中' : '保存草稿信息' }}
          </button>
        </view>
        <view v-else class="readonly-field-list">
          <view class="readonly-row">
            <text class="readonly-label">显示单位</text>
            <text class="readonly-value">{{ draft.unitDisplayLabel || '-' }}</text>
          </view>
          <view class="readonly-row">
            <text class="readonly-label">采购策略</text>
            <text class="readonly-value">{{ getProcurementStrategyLabel(draft.procurementStrategy) }}</text>
          </view>
          <view class="readonly-row">
            <text class="readonly-label">DIY 可用</text>
            <text class="readonly-value">{{ draft.diyEnabled ? '是' : '否' }}</text>
          </view>
          <view class="readonly-row">
            <text class="readonly-label">采购可用</text>
            <text class="readonly-value">{{ draft.procurementEnabled ? '是' : '否' }}</text>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="section-header">
          <text class="section-title">营养档案审核</text>
          <text class="profile-count">{{ profiles.length }} 项</text>
        </view>
        <view v-if="profiles.length === 0" class="empty-message">
          <text>暂无营养档案</text>
        </view>
        <view v-else class="profile-list">
          <view
            v-for="profile in profiles"
            :key="profile.id"
            class="profile-card"
          >
            <view class="profile-header">
              <view class="profile-title-block">
                <text class="profile-title">{{ getProfileTitle(profile) }}</text>
                <text class="profile-source">{{ getProfileSource(profile) }}</text>
              </view>
              <text class="profile-role">{{ getProfileRoleLabel(profileForms[profile.id]?.role || profile.role) }}</text>
            </view>

            <view class="mini-metric-grid">
              <view class="mini-metric">
                <text>完整性</text>
                <text>{{ profile.completenessSummary?.filled || 0 }}/{{ profile.completenessSummary?.total || 0 }}</text>
              </view>
              <view class="mini-metric">
                <text>非零</text>
                <text>{{ profile.completenessSummary?.nonZero || 0 }}</text>
              </view>
              <view class="mini-metric">
                <text>零值</text>
                <text>{{ profile.completenessSummary?.zero || 0 }}</text>
              </view>
              <view class="mini-metric">
                <text>空值</text>
                <text>{{ profile.completenessSummary?.empty || 0 }}</text>
              </view>
            </view>

            <view v-if="isAdmin" class="profile-edit-section">
              <view class="choice-row profile-choice-row">
                <button
                  v-for="option in profileRoleOptions"
                  :key="option.value"
                  class="choice-btn"
                  :class="{ active: profileForms[profile.id]?.role === option.value }"
                  @tap="selectProfileRole(profile.id, option.value)"
                >
                  {{ option.label }}
                </button>
              </view>

              <view class="field-row">
                <text class="field-label">展示名</text>
                <input
                  v-model="profileForms[profile.id].suggestedDisplayNameZh"
                  class="text-input"
                  maxlength="60"
                  placeholder="例如 鸭胸肉 生"
                />
              </view>
              <view class="field-row">
                <text class="field-label">处理方式</text>
                <input
                  v-model="profileForms[profile.id].preparationStateLabel"
                  class="text-input"
                  maxlength="40"
                  placeholder="例如 生、熟、去皮"
                />
              </view>
              <view class="field-row stacked">
                <text class="field-label">审核理由</text>
                <textarea
                  v-model="profileForms[profile.id].agentRationale"
                  class="textarea-input compact"
                  maxlength="300"
                  placeholder="补充档案选择或调整原因"
                />
              </view>
            </view>

            <view v-if="getMissingFieldLabels(profile).length" class="missing-block">
              <text class="missing-title">空值字段</text>
              <text class="missing-text">{{ getMissingFieldLabels(profile).join('、') }}</text>
            </view>

            <button
              v-if="isAdmin"
              class="secondary-btn full-btn"
              :disabled="savingProfileId === profile.id"
              @tap="saveProfile(profile)"
            >
              {{ savingProfileId === profile.id ? '保存中' : '保存档案审核' }}
            </button>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import {
  ingredientCreationApi,
  type IngredientCreationDraft,
  type IngredientCreationDraftProfile,
  type IngredientCreationDraftProfileRole,
  type IngredientCreationDraftStatus,
  type IngredientCreationProcurementStrategy,
  type UpdateIngredientCreationDraftPayload,
  type UpdateIngredientCreationDraftProfilePayload,
} from '../../api/ingredient-creation'

type RouteOptions = {
  id?: string
  jobId?: string
}

type DraftFormState = {
  suggestedName: string
  unitDisplayLabel: string
  procurementStrategy: IngredientCreationProcurementStrategy
  diyEnabled: boolean
  procurementEnabled: boolean
  notes: string
}

type ProfileFormState = {
  role: IngredientCreationDraftProfileRole
  suggestedDisplayNameZh: string
  preparationStateLabel: string
  agentRationale: string
}

const draftId = ref('')
const jobId = ref('')
const currentUserRole = ref('')
const entryError = ref('')
const draft = ref<IngredientCreationDraft | null>(null)
const loading = ref(false)
const savingDraft = ref(false)
const savingProfileId = ref('')
const confirming = ref(false)
const hasLoadedOnce = ref(false)
const profileForms = ref<Record<string, ProfileFormState>>({})
const draftForm = ref<DraftFormState>({
  suggestedName: '',
  unitDisplayLabel: '',
  procurementStrategy: 'DAILY_PURCHASE',
  diyEnabled: true,
  procurementEnabled: true,
  notes: '',
})

const procurementStrategyOptions: Array<{
  value: IngredientCreationProcurementStrategy
  label: string
}> = [
  { value: 'DAILY_PURCHASE', label: '每日采购' },
  { value: 'STOCK_REPLENISHMENT', label: '库存补货' },
  { value: 'HYBRID', label: '混合' },
]

const profileRoleOptions: Array<{
  value: IngredientCreationDraftProfileRole
  label: string
}> = [
  { value: 'PRIMARY', label: '主档案' },
  { value: 'SECONDARY', label: '备用' },
]

const isAdmin = computed(() => currentUserRole.value === 'ADMIN')
const profiles = computed(() => draft.value?.profiles || [])

const completeness = computed(() => {
  return profiles.value.reduce(
    (sum, profile) => {
      const item = profile.completenessSummary
      return {
        total: sum.total + Number(item?.total || 0),
        filled: sum.filled + Number(item?.filled || 0),
        nonZero: sum.nonZero + Number(item?.nonZero || 0),
        zero: sum.zero + Number(item?.zero || 0),
        empty: sum.empty + Number(item?.empty || 0),
      }
    },
    { total: 0, filled: 0, nonZero: 0, zero: 0, empty: 0 },
  )
})

onLoad((options: RouteOptions) => {
  draftId.value = String(options?.id || '')
  jobId.value = String(options?.jobId || '')
  currentUserRole.value = getCurrentUserRole()
  void refreshCurrentUserRole()
  if (!jobId.value) {
    entryError.value = '请从任务详情页进入草稿审核'
    uni.showToast({ title: '请从任务详情页进入草稿审核', icon: 'none' })
    return
  }
  void loadDraft()
})

onShow(() => {
  void refreshCurrentUserRole()
  if (jobId.value && hasLoadedOnce.value) {
    void loadDraft()
  }
})

async function loadDraft() {
  if (!jobId.value) {
    entryError.value = '请从任务详情页进入草稿审核'
    return
  }

  loading.value = true
  try {
    const res = await ingredientCreationApi.getJob(jobId.value)
    const loadedDraft = res.data?.draft || null
    if (!loadedDraft) {
      draft.value = null
      entryError.value = '任务尚未生成食材草稿'
      return
    }
    if (draftId.value && loadedDraft.id !== draftId.value) {
      draft.value = null
      entryError.value = '草稿与任务不匹配，请从任务详情页进入草稿审核'
      return
    }
    entryError.value = ''
    draft.value = loadedDraft
    if (draft.value?.id) {
      draftId.value = draft.value.id
      syncDraftForm(draft.value)
      syncProfileForms(draft.value.profiles || [])
    }
  } catch (error) {
    console.error('[IngredientCreationDraft] Failed to load draft:', error)
    uni.showToast({ title: '加载草稿失败', icon: 'none' })
  } finally {
    hasLoadedOnce.value = true
    loading.value = false
  }
}

async function saveDraft() {
  if (!isAdmin.value || !draft.value || savingDraft.value) return

  savingDraft.value = true
  try {
    const payload: UpdateIngredientCreationDraftPayload = {
      suggestedName: draftForm.value.suggestedName.trim(),
      unitDisplayLabel: emptyToNull(draftForm.value.unitDisplayLabel),
      procurementStrategy: draftForm.value.procurementStrategy,
      diyEnabled: draftForm.value.diyEnabled,
      procurementEnabled: draftForm.value.procurementEnabled,
      notes: emptyToNull(draftForm.value.notes),
    }
    const res = await ingredientCreationApi.updateDraft(draft.value.id, payload)
    draft.value = {
      ...draft.value,
      ...res.data,
      profiles: res.data.profiles || draft.value.profiles,
    }
    syncDraftForm(draft.value)
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch (error) {
    console.error('[IngredientCreationDraft] Failed to save draft:', error)
    uni.showToast({ title: '保存草稿失败', icon: 'none' })
  } finally {
    savingDraft.value = false
  }
}

async function saveProfile(profile: IngredientCreationDraftProfile) {
  const form = profileForms.value[profile.id]
  if (!isAdmin.value || !draft.value || !form || savingProfileId.value) return

  savingProfileId.value = profile.id
  try {
    const payload: UpdateIngredientCreationDraftProfilePayload = {
      role: form.role,
      suggestedDisplayNameZh: emptyToNull(form.suggestedDisplayNameZh),
      preparationStateLabel: emptyToNull(form.preparationStateLabel),
      agentRationale: emptyToNull(form.agentRationale),
    }
    const res = await ingredientCreationApi.updateDraftProfile(profile.id, payload)
    draft.value = {
      ...draft.value,
      profiles: profiles.value.map((item) => (item.id === profile.id ? res.data : item)),
    }
    syncProfileForms(draft.value.profiles || [])
    uni.showToast({ title: '档案已保存', icon: 'success' })
  } catch (error) {
    console.error('[IngredientCreationDraft] Failed to save profile:', error)
    uni.showToast({ title: '保存档案失败', icon: 'none' })
  } finally {
    savingProfileId.value = ''
  }
}

async function confirmDraft() {
  if (!isAdmin.value || draft?.value?.status !== 'READY_FOR_REVIEW' || !draft.value || confirming.value) return

  confirming.value = true
  try {
    const res = await ingredientCreationApi.confirmDraft(draft.value.id)
    draft.value = {
      ...draft.value,
      ...res.data,
      profiles: res.data.profiles || draft.value.profiles,
    }
    syncDraftForm(draft.value)
    uni.showToast({ title: '已创建正式原料', icon: 'success' })
  } catch (error) {
    console.error('[IngredientCreationDraft] Failed to confirm draft:', error)
    uni.showToast({ title: '确认创建失败', icon: 'none' })
  } finally {
    confirming.value = false
  }
}

function syncDraftForm(source: IngredientCreationDraft) {
  draftForm.value = {
    suggestedName: source.suggestedName || '',
    unitDisplayLabel: source.unitDisplayLabel || '',
    procurementStrategy: source.procurementStrategy || 'DAILY_PURCHASE',
    diyEnabled: Boolean(source.diyEnabled),
    procurementEnabled: Boolean(source.procurementEnabled),
    notes: source.notes || '',
  }
}

function syncProfileForms(sourceProfiles: IngredientCreationDraftProfile[]) {
  profileForms.value = Object.fromEntries(
    sourceProfiles.map((profile) => [
      profile.id,
      {
        role: profile.role,
        suggestedDisplayNameZh: profile.suggestedDisplayNameZh || '',
        preparationStateLabel: profile.preparationStateLabel || '',
        agentRationale: profile.agentRationale || '',
      },
    ]),
  )
}

function selectProcurementStrategy(value: IngredientCreationProcurementStrategy) {
  if (!isAdmin.value) return
  draftForm.value.procurementStrategy = value
}

function selectProfileRole(profileId: string, value: IngredientCreationDraftProfileRole) {
  if (!isAdmin.value || !profileForms.value[profileId]) return
  profileForms.value[profileId].role = value
}

function setDraftBoolean(field: 'diyEnabled' | 'procurementEnabled', event: { detail?: { value?: boolean } }) {
  if (!isAdmin.value) return
  draftForm.value[field] = Boolean(event.detail?.value)
}

function getDraftStatusLabel(status: IngredientCreationDraftStatus) {
  const map: Record<IngredientCreationDraftStatus, string> = {
    DRAFT: '草稿',
    READY_FOR_REVIEW: '待审核',
    CONFIRMED: '已确认',
    REJECTED: '已拒绝',
  }
  return map[status] || status
}

function getDraftStatusClass(status: IngredientCreationDraftStatus) {
  if (status === 'READY_FOR_REVIEW') return 'status-review'
  if (status === 'CONFIRMED') return 'status-confirmed'
  if (status === 'REJECTED') return 'status-rejected'
  return ''
}

function getProfileRoleLabel(role: IngredientCreationDraftProfileRole) {
  return role === 'PRIMARY' ? '主档案' : '备用'
}

function getProfileTitle(profile: IngredientCreationDraftProfile) {
  return profile.suggestedDisplayNameZh || profile.sourceFoodName || '未命名档案'
}

function getProfileSource(profile: IngredientCreationDraftProfile) {
  const source = [profile.sourceType, profile.sourceKey].filter(Boolean).join(' · ')
  return source || '未记录来源'
}

function getMissingFieldLabels(profile: IngredientCreationDraftProfile) {
  return (profile.completenessSummary?.missingFields || []).map((field) => field.label).slice(0, 8)
}

async function refreshCurrentUserRole() {
  const localRole = getCurrentUserRole()
  currentUserRole.value = localRole

  const token = uni.getStorageSync('token')
  if (!token && localRole) return

  try {
    const res = await request({
      url: '/users/me',
      method: 'GET',
      suppressErrorToast: true,
    })
    if (res.code === 0 && res.data) {
      uni.setStorageSync('user', res.data)
      currentUserRole.value = normalizeUserRole(res.data) || localRole
    }
  } catch (error) {
    console.warn('[IngredientCreationDraft] Failed to refresh current user role:', error)
  }
}

function getCurrentUserRole() {
  try {
    return normalizeUserRole(readStoredUserInfo())
  } catch (error) {
    console.warn('[IngredientCreationDraft] Failed to read current user role:', error)
    return ''
  }
}

function readStoredUserInfo() {
  const user = parseStoredUserInfo(uni.getStorageSync('user'))
  if (user) return user
  return parseStoredUserInfo(uni.getStorageSync('userInfo'))
}

function parseStoredUserInfo(rawUserInfo: unknown) {
  if (!rawUserInfo || rawUserInfo === '{}' || rawUserInfo === '') return null
  if (typeof rawUserInfo !== 'string') return rawUserInfo as Record<string, unknown>
  try {
    return JSON.parse(rawUserInfo)
  } catch (error) {
    console.warn('[IngredientCreationDraft] Failed to parse stored user info:', error)
    return null
  }
}

function normalizeUserRole(userInfo: any) {
  return String(userInfo?.role || userInfo?.user?.role || '').toUpperCase()
}

function getProcurementStrategyLabel(value?: IngredientCreationProcurementStrategy) {
  return procurementStrategyOptions.find((option) => option.value === value)?.label || '-'
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function goToJobList() {
  uni.redirectTo({ url: '/pages/ingredient-creation/list' })
}

function goBack() {
  uni.navigateBack()
}
</script>

<style scoped lang="scss">
.ingredient-creation-draft-page {
  min-height: 100vh;
  padding: 24rpx 32rpx 56rpx;
  background: #f5f5f5;
  box-sizing: border-box;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 420rpx;
  gap: 18rpx;
  color: #888;
  font-size: 28rpx;
}

.empty-title {
  color: #333;
  font-size: 30rpx;
}

.summary-panel,
.section,
.profile-card {
  margin-bottom: 22rpx;
  padding: 28rpx;
  border-radius: 12rpx;
  background: #fff;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.summary-header,
.section-header,
.profile-header,
.field-row,
.switch-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
}

.summary-title-block,
.profile-title-block {
  flex: 1;
  min-width: 0;
}

.page-title,
.profile-title {
  display: block;
  overflow: hidden;
  color: #222;
  font-size: 34rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-subtitle,
.profile-source {
  display: block;
  margin-top: 8rpx;
  color: #777;
  font-size: 24rpx;
}

.status-badge,
.profile-role {
  flex-shrink: 0;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
  background: #edf4ff;
  color: #1677ff;
  font-size: 22rpx;
}

.status-review {
  background: #f6ffed;
  color: #389e0d;
}

.status-confirmed {
  background: #ecfdf5;
  color: #047857;
}

.status-rejected {
  background: #fff1f0;
  color: #cf1322;
}

.metric-grid,
.mini-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 24rpx;
}

.metric-card,
.mini-metric {
  padding: 16rpx 10rpx;
  border-radius: 10rpx;
  background: #f8fafc;
  text-align: center;
}

.metric-label,
.metric-value,
.mini-metric text {
  display: block;
}

.metric-label,
.mini-metric text:first-child {
  color: #777;
  font-size: 22rpx;
}

.metric-value,
.mini-metric text:last-child {
  margin-top: 6rpx;
  color: #222;
  font-size: 27rpx;
  font-weight: 700;
}

.agent-summary {
  display: block;
  margin-top: 20rpx;
  color: #555;
  font-size: 25rpx;
  line-height: 1.5;
}

.section-title {
  display: block;
  color: #222;
  font-size: 30rpx;
  font-weight: 700;
}

.field-row {
  min-height: 84rpx;
  margin-top: 18rpx;
}

.readonly-note {
  display: block;
  margin-top: 16rpx;
  padding: 16rpx;
  border-radius: 10rpx;
  background: #f8fafc;
  color: #555;
  font-size: 24rpx;
  line-height: 1.45;
}

.readonly-field-list {
  margin-top: 16rpx;
}

.readonly-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  min-height: 64rpx;
  border-top: 1rpx solid #f0f0f0;
}

.readonly-label {
  flex-shrink: 0;
  color: #777;
  font-size: 24rpx;
}

.readonly-value {
  flex: 1;
  min-width: 0;
  color: #222;
  font-size: 25rpx;
  font-weight: 600;
  text-align: right;
  word-break: break-all;
}

.field-row.stacked {
  display: block;
}

.field-label {
  flex-shrink: 0;
  width: 150rpx;
  padding-top: 16rpx;
  color: #666;
  font-size: 25rpx;
}

.text-input,
.textarea-input {
  flex: 1;
  width: 100%;
  padding: 16rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 10rpx;
  background: #fbfcfe;
  box-sizing: border-box;
  color: #222;
  font-size: 26rpx;
}

.textarea-input {
  min-height: 150rpx;
  margin-top: 14rpx;
  line-height: 1.45;
}

.textarea-input.compact {
  min-height: 120rpx;
}

.choice-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.choice-btn {
  height: 58rpx;
  margin: 0;
  padding: 0 18rpx;
  border: 1rpx solid #d9e8ff;
  border-radius: 8rpx;
  background: #fff;
  color: #1677ff;
  font-size: 24rpx;
  line-height: 58rpx;
}

.choice-btn.active {
  border-color: #91caff;
  background: #eef8ff;
  color: #0958d9;
  font-weight: 700;
}

.switch-row {
  justify-content: flex-start;
  margin-top: 18rpx;
}

.switch-item {
  display: flex;
  align-items: center;
  gap: 10rpx;
  color: #555;
  font-size: 25rpx;
}

.primary-btn,
.secondary-btn {
  height: 72rpx;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 10rpx;
  font-size: 26rpx;
  line-height: 72rpx;
}

.primary-btn {
  background: #1890ff;
  color: #fff;
}

.secondary-btn {
  background: #fff;
  color: #1677ff;
  border: 1rpx solid #b7d9ff;
}

.full-btn {
  width: 100%;
  margin-top: 20rpx;
}

.profile-count {
  flex-shrink: 0;
  color: #888;
  font-size: 24rpx;
}

.empty-message {
  margin-top: 18rpx;
  color: #999;
  font-size: 25rpx;
}

.profile-list {
  margin-top: 18rpx;
}

.profile-card {
  padding: 22rpx;
  border: 1rpx solid #edf0f5;
  box-shadow: none;
}

.profile-choice-row {
  margin-top: 18rpx;
}

.missing-block {
  margin-top: 18rpx;
  padding: 16rpx;
  border-radius: 10rpx;
  background: #fff7ed;
}

.missing-title,
.missing-text {
  display: block;
}

.missing-title {
  color: #9a3412;
  font-size: 24rpx;
  font-weight: 700;
}

.missing-text {
  margin-top: 8rpx;
  color: #9a3412;
  font-size: 23rpx;
  line-height: 1.45;
}
</style>
