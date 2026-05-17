<template>
  <view class="page">
    <view class="hero-card">
      <text class="hero-card__eyebrow">品种资料</text>
      <text class="hero-card__title">品种疾病风险查询</text>
      <text class="hero-card__subtitle">
        按标准品种查看有资料来源支持的健康关注项，帮助提前了解常见筛查与照护重点。
      </text>
    </view>

    <view class="search-card">
      <text class="search-card__title">选择标准品种</text>
      <text class="search-card__desc">输入品种名称、别名或常见简称后，从结果中选择一个标准品种。</text>

      <view class="search-box">
        <input
          class="search-box__input"
          v-model="breedSearchKeyword"
          placeholder="搜索品种，如金毛、拉布拉多"
          placeholder-class="search-box__placeholder"
          confirm-type="search"
        />
      </view>

      <view v-if="isBreedListLoading" class="breed-state">
        <text class="breed-state__title">正在加载品种列表</text>
        <text class="breed-state__desc">请稍候，正在获取可查询的标准品种。</text>
      </view>

      <view v-else-if="breedListError" class="breed-state breed-state--error">
        <text class="breed-state__title">品种列表加载失败</text>
        <text class="breed-state__desc">{{ breedListError }}</text>
        <button class="breed-state__button" @tap="loadBreeds">重试</button>
      </view>

      <view v-else-if="hasBreedKeyword && displayedBreeds.length === 0" class="breed-state">
        <text class="breed-state__title">没有匹配的标准品种</text>
        <text class="breed-state__desc">请尝试输入更完整的品种名或其他常见别名。</text>
      </view>

      <view v-else-if="hasBreedKeyword" class="breed-list">
        <view
          v-for="breed in displayedBreeds"
          :key="breed.id"
          :class="['breed-option', selectedBreed?.id === breed.id ? 'breed-option--active' : '']"
          @tap="selectBreed(breed)"
        >
          <view class="breed-option__main">
            <text class="breed-option__name">{{ breed.name }}</text>
            <text v-if="breed.aliases?.length" class="breed-option__aliases">
              {{ breed.aliases.slice(0, 3).join(' / ') }}
            </text>
          </view>
          <text v-if="selectedBreed?.id === breed.id" class="breed-option__selected">已选择</text>
        </view>
      </view>

      <view v-else class="breed-state">
        <text class="breed-state__title">搜索标准品种</text>
        <text class="breed-state__desc">选择品种后，下方会展示本品种健康关注项和资料来源。</text>
      </view>
    </view>

    <BreedHealthRiskSection
      :breed-name="breedHealthRiskLookup.breedName || selectedBreed?.name || ''"
      :risks="breedHealthRiskLookup.risks"
      :loading="isBreedHealthRiskLoading"
      :error="breedHealthRiskError"
      :empty-text="breedHealthRiskEmptyText"
      @retry="retryLoadBreedHealthRisks"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import BreedHealthRiskSection from '../../components/dog-profile/BreedHealthRiskSection.vue'
import { dogApi } from '../../api/dogs'
import { filterBreedsByKeyword } from '../../utils/dog-breed-search'
import {
  isBreedHealthRiskEndpointUnavailable,
  normalizeBreedHealthRiskResponse,
  resolveBreedHealthRiskEmptyText,
  type BreedHealthRiskLookup,
} from '../../utils/breed-health-risks'

interface BreedOption {
  id: string
  name: string
  aliases?: string[]
  isCommon?: boolean
}

const BREED_RESULT_LIMIT = 16

const breeds = ref<BreedOption[]>([])
const selectedBreed = ref<BreedOption | null>(null)
const breedSearchKeyword = ref('')
const isBreedListLoading = ref(false)
const breedListError = ref('')
const isBreedHealthRiskLoading = ref(false)
const breedHealthRiskError = ref('')
const breedHealthRiskEndpointUnavailable = ref(false)
const latestRequestedBreedId = ref('')
const breedHealthRiskLookup = reactive<BreedHealthRiskLookup>({
  breedId: '',
  breedName: '',
  risks: [],
})

const hasBreedKeyword = computed(() => breedSearchKeyword.value.trim().length > 0)
const displayedBreeds = computed(() => (
  hasBreedKeyword.value
    ? filterBreedsByKeyword(breeds.value, breedSearchKeyword.value).slice(0, BREED_RESULT_LIMIT)
    : []
))
const breedHealthRiskEmptyText = computed(() => (
  breedHealthRiskEndpointUnavailable.value
    ? resolveBreedHealthRiskEmptyText('unavailable')
    : selectedBreed.value
    ? resolveBreedHealthRiskEmptyText('no-data')
    : '请选择一个标准品种后查看健康关注项。'
))

onLoad(() => {
  void loadBreeds()
})

async function loadBreeds() {
  isBreedListLoading.value = true
  breedListError.value = ''

  try {
    const res: any = await dogApi.breeds()
    if (res.code !== 0 || !Array.isArray(res.data)) {
      throw new Error(res.message || '加载品种列表失败')
    }

    breeds.value = res.data
  } catch (error: any) {
    breeds.value = []
    breedListError.value = error?.message || '加载品种列表失败'
  } finally {
    isBreedListLoading.value = false
  }
}

function selectBreed(breed: BreedOption) {
  selectedBreed.value = breed
  breedSearchKeyword.value = breed.name
  breedHealthRiskLookup.breedId = breed.id
  breedHealthRiskLookup.breedName = breed.name
  breedHealthRiskLookup.risks = []
  void loadBreedHealthRisks(breed)
}

async function loadBreedHealthRisks(breed: BreedOption) {
  const targetBreedId = breed.id
  latestRequestedBreedId.value = targetBreedId
  isBreedHealthRiskLoading.value = true
  breedHealthRiskError.value = ''
  breedHealthRiskEndpointUnavailable.value = false

  try {
    const res: any = await dogApi.breedHealthRisks(targetBreedId)
    if (latestRequestedBreedId.value !== targetBreedId) {
      return
    }

    if (res.code !== 0) {
      throw new Error(res.message || '加载品种健康关注项失败')
    }

    const normalized = normalizeBreedHealthRiskResponse(res)
    breedHealthRiskLookup.breedId = normalized.breedId || breed.id
    breedHealthRiskLookup.breedName = normalized.breedName || breed.name
    breedHealthRiskLookup.risks = normalized.risks
  } catch (error: any) {
    if (latestRequestedBreedId.value !== targetBreedId) {
      return
    }

    breedHealthRiskLookup.breedId = breed.id
    breedHealthRiskLookup.breedName = breed.name
    breedHealthRiskLookup.risks = []
    if (isBreedHealthRiskEndpointUnavailable(error)) {
      breedHealthRiskError.value = ''
      breedHealthRiskEndpointUnavailable.value = true
      return
    }

    breedHealthRiskError.value = error?.message || '加载品种健康关注项失败'
  } finally {
    if (latestRequestedBreedId.value === targetBreedId) {
      isBreedHealthRiskLoading.value = false
    }
  }
}

function retryLoadBreedHealthRisks() {
  if (!selectedBreed.value) {
    return
  }

  void loadBreedHealthRisks(selectedBreed.value)
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 28rpx;
  background: #f4f8f6;
  box-sizing: border-box;
}

.hero-card,
.search-card {
  padding: 30rpx;
  border-radius: 30rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12rpx 32rpx rgba(24, 40, 60, 0.08);
}

.hero-card {
  margin-bottom: 24rpx;
}

.hero-card__eyebrow,
.hero-card__title,
.hero-card__subtitle,
.search-card__title,
.search-card__desc,
.breed-state__title,
.breed-state__desc,
.breed-option__name,
.breed-option__aliases,
.breed-option__selected {
  display: block;
}

.hero-card__eyebrow {
  font-size: 23rpx;
  font-weight: 700;
  color: #0d6b43;
}

.hero-card__title {
  margin-top: 10rpx;
  font-size: 42rpx;
  font-weight: 800;
  color: #17313f;
}

.hero-card__subtitle {
  margin-top: 14rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: #60727c;
}

.search-card {
  margin-bottom: 24rpx;
}

.search-card__title {
  font-size: 32rpx;
  font-weight: 700;
  color: #17313f;
}

.search-card__desc {
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b7d86;
}

.search-box {
  margin-top: 22rpx;
  padding: 0 24rpx;
  border-radius: 22rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.1);
}

.search-box__input {
  width: 100%;
  height: 78rpx;
  font-size: 27rpx;
  color: #17313f;
}

.search-box__placeholder {
  color: #a0adb3;
}

.breed-state {
  margin-top: 22rpx;
  padding: 24rpx;
  border-radius: 22rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.breed-state--error {
  background: #fff8f6;
  border-color: rgba(196, 80, 42, 0.16);
}

.breed-state__title {
  font-size: 26rpx;
  font-weight: 700;
  color: #17313f;
}

.breed-state__desc {
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b7d86;
}

.breed-state__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 64rpx;
  margin: 18rpx 0 0;
  padding: 0 28rpx;
  border-radius: 999rpx;
  background: #0d6b43;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 64rpx;
}

.breed-state__button::after {
  border: 0;
}

.breed-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 22rpx;
}

.breed-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  border-radius: 22rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.breed-option--active {
  background: rgba(13, 107, 67, 0.08);
  border-color: rgba(13, 107, 67, 0.3);
}

.breed-option__main {
  min-width: 0;
  flex: 1;
}

.breed-option__name {
  font-size: 27rpx;
  font-weight: 700;
  color: #17313f;
}

.breed-option__aliases {
  margin-top: 6rpx;
  font-size: 23rpx;
  line-height: 1.45;
  color: #6b7d86;
}

.breed-option__selected {
  flex-shrink: 0;
  font-size: 23rpx;
  font-weight: 700;
  color: #0d6b43;
}
</style>
