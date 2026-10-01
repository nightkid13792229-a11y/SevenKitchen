<template>
  <!-- 饮食偏好（2026-10-01，第五期）。
       老板第 9 条：饮食偏好的变化要能看到历史。

       过敏 ≠ 不爱吃：真过敏走上面的「过敏」板块，这里只是口味。 -->
  <view class="health-section diet-preference">
    <!-- ① 整理旧文本：给候选、顾客确认后才写库 -->
    <view v-if="hasSuggestions" class="health-card import-card">
      <text class="import-card__title">把以前填的整理成条目？</text>
      <text class="import-card__desc">
        你在爱犬档案里填过这些。整理成条目之后，就能看到它们什么时候变的了。
        <text class="import-card__note">原来的文字不会被改动。</text>
      </text>

      <view v-if="suggestions.liked.length > 0" class="import-group">
        <text class="import-group__label">爱吃的</text>
        <view class="chips">
          <text
            v-for="name in suggestions.liked"
            :key="`s-like-${name}`"
            class="chip"
            :class="{ 'chip--off': !picked.liked.includes(name) }"
            @tap="togglePick('liked', name)"
          >{{ name }}</text>
        </view>
      </view>

      <view v-if="suggestions.disliked.length > 0" class="import-group">
        <text class="import-group__label">不吃的</text>
        <view class="chips">
          <text
            v-for="name in suggestions.disliked"
            :key="`s-dislike-${name}`"
            class="chip chip--dislike"
            :class="{ 'chip--off': !picked.disliked.includes(name) }"
            @tap="togglePick('disliked', name)"
          >{{ name }}</text>
        </view>
      </view>

      <view class="import-actions">
        <text class="import-actions__skip" @tap="dismissSuggestions">先不整理</text>
        <text class="import-actions__go" @tap="confirmImport">
          整理这 {{ picked.liked.length + picked.disliked.length }} 项
        </text>
      </view>
    </view>

    <!-- ② 爱吃的 -->
    <view class="health-card">
      <view class="health-section__header">
        <view class="health-section__heading">
          <text class="health-section__title">爱吃的</text>
          <text class="health-section__desc">会进推荐与配方，越具体越准。</text>
        </view>
        <text class="health-section__count">{{ liked.length }} 项</text>
      </view>

      <view v-if="liked.length === 0" class="empty-line">
        <text class="empty-line__text">还没有记录爱吃的食材</text>
      </view>
      <view v-else class="chips chips--interactive">
        <text
          v-for="item in liked"
          :key="`like-${item.foodName}`"
          class="chip chip--removable"
          @tap="removeItem('LIKED', item.foodName)"
        >{{ item.foodName }} ×</text>
      </view>

      <view class="add-row">
        <input
          class="add-row__input"
          type="text"
          placeholder="例如：鸡胸肉"
          v-model="draftLiked"
          @confirm="addItem('LIKED')"
        />
        <text class="add-row__button" @tap="addItem('LIKED')">添加</text>
      </view>
    </view>

    <!-- ③ 不吃的 -->
    <view class="health-card">
      <view class="health-section__header">
        <view class="health-section__heading">
          <text class="health-section__title">不吃的 / 挑食</text>
          <!-- 过敏≠不爱吃，这句必须留着 -->
          <text class="health-section__desc">
            这里只是口味。真正的过敏请记在「过敏」板块 —— 那是安全底线，两件事不能混。
          </text>
        </view>
        <text class="health-section__count">{{ disliked.length }} 项</text>
      </view>

      <view v-if="disliked.length === 0" class="empty-line">
        <text class="empty-line__text">还没有记录不吃的食材</text>
      </view>
      <view v-else class="chips chips--interactive">
        <text
          v-for="item in disliked"
          :key="`dislike-${item.foodName}`"
          class="chip chip--dislike chip--removable"
          @tap="removeItem('DISLIKED', item.foodName)"
        >{{ item.foodName }} ×</text>
      </view>

      <view class="add-row">
        <input
          class="add-row__input"
          type="text"
          placeholder="例如：胡萝卜"
          v-model="draftDisliked"
          @confirm="addItem('DISLIKED')"
        />
        <text class="add-row__button" @tap="addItem('DISLIKED')">添加</text>
      </view>
    </view>

    <!-- ④ 变更历史（老板第 9 条） -->
    <view class="health-card">
      <view class="health-section__header">
        <view class="health-section__heading">
          <text class="health-section__title">偏好变化</text>
        </view>
        <text class="health-section__count">{{ history.length }} 条</text>
      </view>

      <view v-if="history.length === 0" class="empty-line">
        <text class="empty-line__text">还没有变化记录</text>
        <text class="empty-line__hint">{{ historyNote }}</text>
      </view>
      <view v-else class="history">
        <view v-for="(item, index) in history" :key="`${item.changedAt}-${item.foodName}-${index}`" class="history__row">
          <text class="history__date">{{ item.changedAt }}</text>
          <text class="history__action" :class="{ 'history__action--remove': item.action === 'REMOVED' }">
            {{ item.action === 'ADDED' ? '新增' : '去掉' }}
          </text>
          <text class="history__name">{{ item.foodName }}</text>
          <text class="history__kind">{{ item.kind === 'LIKED' ? '爱吃' : '不吃' }}</text>
        </view>
        <text class="history__note">{{ historyNote }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dogApi } from '../../api/dogs'

/**
 * 结构化饮食偏好 + 变更历史。
 *
 * ⚠️ 旧的两个自由文本框（偏好/挑食）**没有删除、也没有被改写** ——
 *    配方设计仍然在用它们。这个板块是**增量**的：
 *    把旧文本整理成条目这一步，必须顾客逐条确认后才会写库，
 *    不做自动分词（拆错了就把顾客原来的话改坏了）。
 */
interface PreferenceItem {
  kind: 'LIKED' | 'DISLIKED'
  foodName: string
  source: string
  createdAt: string
}

interface HistoryItem {
  kind: 'LIKED' | 'DISLIKED'
  foodName: string
  action: 'ADDED' | 'REMOVED'
  changedAt: string
}

const props = defineProps<{ dogId: string }>()

const liked = ref<PreferenceItem[]>([])
const disliked = ref<PreferenceItem[]>([])
const history = ref<HistoryItem[]>([])
const historyNote = ref('')
const suggestions = ref<{ liked: string[]; disliked: string[] }>({ liked: [], disliked: [] })
const suggestionsDismissed = ref(false)

const picked = ref<{ liked: string[]; disliked: string[] }>({ liked: [], disliked: [] })
const draftLiked = ref('')
const draftDisliked = ref('')
const isBusy = ref(false)

const hasSuggestions = computed(() => (
  !suggestionsDismissed.value &&
  (suggestions.value.liked.length > 0 || suggestions.value.disliked.length > 0)
))

async function load() {
  if (!props.dogId) {
    return
  }

  try {
    const res: any = await dogApi.dietPreferences(props.dogId)
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '加载饮食偏好失败')
    }

    liked.value = Array.isArray(res.data.liked) ? res.data.liked : []
    disliked.value = Array.isArray(res.data.disliked) ? res.data.disliked : []
    history.value = Array.isArray(res.data.history) ? res.data.history : []
    historyNote.value = String(res.data.historyNote || '')
    suggestions.value = {
      liked: Array.isArray(res.data.suggestions?.liked) ? res.data.suggestions.liked : [],
      disliked: Array.isArray(res.data.suggestions?.disliked) ? res.data.suggestions.disliked : [],
    }
    // 默认全选（顾客只需要取消不要的那几个）
    picked.value = {
      liked: [...suggestions.value.liked],
      disliked: [...suggestions.value.disliked],
    }
    suggestionsDismissed.value = false
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加载饮食偏好失败', icon: 'none' })
  }
}

function togglePick(group: 'liked' | 'disliked', name: string) {
  picked.value[group] = picked.value[group].includes(name)
    ? picked.value[group].filter((item) => item !== name)
    : [...picked.value[group], name]
}

function dismissSuggestions() {
  suggestionsDismissed.value = true
}

async function confirmImport() {
  const total = picked.value.liked.length + picked.value.disliked.length
  if (total === 0 || isBusy.value) {
    uni.showToast({ title: '至少选一项', icon: 'none' })
    return
  }

  isBusy.value = true
  try {
    const res: any = await dogApi.importDietPreferences(props.dogId, {
      liked: picked.value.liked,
      disliked: picked.value.disliked,
    })
    if (res.code !== 0) {
      throw new Error(res.message || '整理失败')
    }
    await load()
    uni.showToast({ title: `已整理 ${res.data?.added ?? total} 项`, icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '整理失败', icon: 'none' })
  } finally {
    isBusy.value = false
  }
}

async function addItem(kind: 'LIKED' | 'DISLIKED') {
  const draft = kind === 'LIKED' ? draftLiked : draftDisliked
  const name = draft.value.trim()
  if (!name || isBusy.value) {
    return
  }

  isBusy.value = true
  try {
    const res: any = await dogApi.addDietPreference(props.dogId, kind, name)
    if (res.code !== 0) {
      throw new Error(res.message || '添加失败')
    }
    if (kind === 'LIKED') {
      draftLiked.value = ''
    } else {
      draftDisliked.value = ''
    }
    await load()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '添加失败', icon: 'none' })
  } finally {
    isBusy.value = false
  }
}

async function removeItem(kind: 'LIKED' | 'DISLIKED', foodName: string) {
  if (isBusy.value) {
    return
  }

  isBusy.value = true
  try {
    const res: any = await dogApi.removeDietPreference(props.dogId, kind, foodName)
    if (res.code !== 0) {
      throw new Error(res.message || '删除失败')
    }
    await load()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '删除失败', icon: 'none' })
  } finally {
    isBusy.value = false
  }
}

watch(() => props.dogId, load, { immediate: true })
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.diet-preference {
  gap: 24rpx;
}

/* 整理旧文本的提示卡 */
.import-card {
  border-left: 8rpx solid var(--health-accent, #b07a1e);
}

.import-card__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.import-card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
}

.import-card__note {
  color: #0f7b49;
}

.import-group {
  margin-top: 18rpx;
}

.import-group__label {
  display: block;
  font-size: 23rpx;
  color: #8a968a;
}

.import-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24rpx;
}

.import-actions__skip {
  font-size: 26rpx;
  color: #8a968a;
  padding: 14rpx 20rpx;
}

.import-actions__go {
  font-size: 26rpx;
  font-weight: 600;
  color: #ffffff;
  background: var(--health-accent, #b07a1e);
  padding: 14rpx 28rpx;
  border-radius: 999rpx;
}

/* 标签 */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.chips--interactive {
  margin-top: 18rpx;
}

.chip {
  font-size: 26rpx;
  line-height: 1;
  padding: 16rpx 22rpx;
  border-radius: 999rpx;
  background: var(--health-accent-soft, #f7eedd);
  color: #1e3a2f;
}

.chip--dislike {
  background: #f2f5ec;
}

.chip--off {
  opacity: 0.35;
}

.chip--removable {
  background: #eef2e4;
  color: #4a5a4a;
}

/* 空态一行 */
.empty-line {
  margin-top: 16rpx;
}

.empty-line__text {
  display: block;
  font-size: 24rpx;
  color: #8a968a;
}

.empty-line__hint {
  display: block;
  margin-top: 8rpx;
  font-size: 21rpx;
  line-height: 1.6;
  color: #a8b2a8;
}

/* 添加一行 */
.add-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 20rpx;
}

.add-row__input {
  flex: 1;
  min-width: 0;
  height: 76rpx;
  padding: 0 22rpx;
  font-size: 27rpx;
  color: #26261f;
  background: #fafbf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 14rpx;
}

.add-row__button {
  flex-shrink: 0;
  font-size: 26rpx;
  color: #ffffff;
  background: var(--health-accent, #b07a1e);
  padding: 18rpx 28rpx;
  border-radius: 14rpx;
}

/* 历史 */
.history {
  margin-top: 8rpx;
}

.history__row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #eef1e8;
}

.history__date {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #8a968a;
}

.history__action {
  flex-shrink: 0;
  font-size: 20rpx;
  line-height: 1;
  padding: 8rpx 12rpx;
  border-radius: 8rpx;
  color: #ffffff;
  background: #0f7b49;
}

.history__action--remove {
  background: #a8b2a8;
}

.history__name {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: #26261f;
}

.history__kind {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #8a968a;
}

.history__note {
  display: block;
  margin-top: 18rpx;
  font-size: 21rpx;
  line-height: 1.6;
  color: #a8b2a8;
}
</style>
