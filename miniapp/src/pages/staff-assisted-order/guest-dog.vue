<template>
  <view class="page">
    <view class="hero">
      <text class="title">新建狗狗档案</text>
      <text class="sub">{{ customerName }} · 电话里问到的 8 项，先录上就能下单</text>
    </view>

    <view class="section">
      <view class="field-group">
        <text class="field-label">狗狗名字</text>
        <input class="field-input" v-model="form.name" placeholder="例如：布丁" />
      </view>

      <view class="field-group">
        <text class="field-label">品种</text>
        <picker :range="breedLabels" :value="breedIndex" @change="onBreedChange">
          <view class="picker-box">{{ selectedBreed?.name || '请选择品种' }}</view>
        </picker>
      </view>

      <view class="field-group">
        <text class="field-label">生日</text>
        <picker mode="date" :value="form.birthday" :end="today" @change="onBirthdayChange">
          <view class="picker-box">{{ form.birthday || '请选择生日' }}</view>
        </picker>
      </view>

      <view class="field-row">
        <view class="field-group half">
          <text class="field-label">性别</text>
          <picker :range="genderLabels" :value="genderIndex" @change="onGenderChange">
            <view class="picker-box">{{ genderLabels[genderIndex] }}</view>
          </picker>
        </view>
        <view class="field-group half">
          <text class="field-label">是否绝育</text>
          <picker :range="neuteredLabels" :value="neuteredIndex" @change="onNeuteredChange">
            <view class="picker-box">{{ neuteredLabels[neuteredIndex] }}</view>
          </picker>
        </view>
      </view>

      <view class="field-row">
        <view class="field-group half">
          <text class="field-label">当前体重（kg）</text>
          <input class="field-input" type="digit" v-model="form.currentWeightKg" placeholder="例如：12.4" />
        </view>
        <view class="field-group half">
          <text class="field-label">体况评分（1-9）</text>
          <picker :range="bcsLabels" :value="bcsIndex" @change="onBcsChange">
            <view class="picker-box">{{ bcsLabels[bcsIndex] }}</view>
          </picker>
        </view>
      </view>

      <view class="field-group">
        <text class="field-label">活动量</text>
        <picker :range="activityLabels" :value="activityIndex" @change="onActivityChange">
          <view class="picker-box">{{ activityLabels[activityIndex] }}</view>
        </picker>
      </view>
    </view>

    <text class="field-hint">
      体重和体况直接决定这单算多少克，尽量问准；录错了可以回后台改档案。
    </text>

    <button class="primary-btn" :disabled="submitting" @tap="submit">
      {{ submitting ? '创建中…' : '创建狗狗' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { dogApi } from '../../api/dogs'
import { createGuestDog } from '../../api/staffAssistedOrder'

const customerId = ref('')
const customerName = ref('顾客')
const breeds = ref<any[]>([])
const submitting = ref(false)

const genderLabels = ['公', '母']
const genderValues = ['MALE', 'FEMALE']
const genderIndex = ref(0)

const neuteredLabels = ['已绝育', '未绝育']
const neuteredValues = [true, false]
const neuteredIndex = ref(0)

const activityLabels = ['很少动', '偏少', '正常', '活跃', '工作犬']
const activityValues = ['RESTING', 'LOW', 'NORMAL', 'HIGH', 'WORKING']
const activityIndex = ref(2)

const bcsLabels = ['1 分 · 极瘦', '2 分', '3 分 · 偏瘦', '4 分', '5 分 · 标准', '6 分', '7 分 · 偏胖', '8 分', '9 分 · 肥胖']
const bcsIndex = ref(4)

const form = reactive({
  name: '',
  birthday: '',
  currentWeightKg: '',
})

const today = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
})

const breedIndex = ref(0)
const selectedBreed = computed(() => breeds.value[breedIndex.value])
const breedLabels = computed(() => breeds.value.map((item) => item.name))

onLoad((options: any) => {
  customerId.value = String(options?.customerId || '')
  customerName.value = decodeURIComponent(String(options?.customerName || '顾客'))
  if (!customerId.value) {
    uni.showToast({ title: '缺少顾客信息', icon: 'none' })
  }
  void loadBreeds()
})

async function loadBreeds() {
  try {
    const response = await dogApi.breeds()
    const list = Array.isArray((response as any).data) ? (response as any).data : []
    breeds.value = list
  } catch (error: any) {
    uni.showToast({ title: error?.message || '品种加载失败', icon: 'none' })
  }
}

function onBreedChange(event: any) {
  breedIndex.value = Number(event?.detail?.value || 0)
}
function onBirthdayChange(event: any) {
  form.birthday = String(event?.detail?.value || '')
}
function onGenderChange(event: any) {
  genderIndex.value = Number(event?.detail?.value || 0)
}
function onNeuteredChange(event: any) {
  neuteredIndex.value = Number(event?.detail?.value || 0)
}
function onBcsChange(event: any) {
  bcsIndex.value = Number(event?.detail?.value || 0)
}
function onActivityChange(event: any) {
  activityIndex.value = Number(event?.detail?.value || 0)
}

async function submit() {
  if (submitting.value) return
  const name = form.name.trim()
  const weight = Number(form.currentWeightKg)
  if (!name) {
    uni.showToast({ title: '请填狗狗名字', icon: 'none' })
    return
  }
  if (!selectedBreed.value?.id) {
    uni.showToast({ title: '请选择品种', icon: 'none' })
    return
  }
  if (!form.birthday) {
    uni.showToast({ title: '请选择生日', icon: 'none' })
    return
  }
  if (!Number.isFinite(weight) || weight <= 0) {
    uni.showToast({ title: '请填正确的体重', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    const response = await createGuestDog(customerId.value, {
      name,
      breedId: selectedBreed.value.id,
      birthday: form.birthday,
      gender: genderValues[genderIndex.value],
      isNeutered: neuteredValues[neuteredIndex.value],
      currentWeightKg: weight,
      bcsScore: bcsIndex.value + 1,
      activityLevel: activityValues[activityIndex.value],
      mealsPerDay: 2,
    })
    const dogId = (response.data as any)?.dogId
    uni.showToast({ title: '狗狗已创建', icon: 'success' })
    if (dogId) {
      uni.redirectTo({
        url: `/pages/staff-assisted-order/recipe?customerId=${encodeURIComponent(
          customerId.value,
        )}&dogId=${encodeURIComponent(dogId)}`,
      })
      return
    }
    uni.navigateBack()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '创建失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: #eef2e4; padding: 24rpx; box-sizing: border-box; color: #26261f; }
.hero { padding: 8rpx 4rpx 20rpx; }
.title { display: block; font-size: 38rpx; font-weight: 800; color: #1e3a2f; }
.sub { display: block; margin-top: 8rpx; font-size: 23rpx; color: #6b6653; }
.section { background: #fff; border: 1rpx solid #e5e8d4; border-radius: 12rpx; padding: 24rpx; }
.field-row { display: flex; gap: 16rpx; }
.field-group { margin-bottom: 20rpx; }
.field-group.half { flex: 1; }
.field-label { display: block; margin-bottom: 8rpx; font-size: 24rpx; font-weight: 700; }
.field-input, .picker-box { width: 100%; height: 84rpx; padding: 0 20rpx; border: 1rpx solid #e5e8d4; border-radius: 8rpx; background: #fbfcf7; box-sizing: border-box; font-size: 28rpx; }
.picker-box { line-height: 84rpx; }
.field-hint { display: block; margin: 18rpx 4rpx; font-size: 22rpx; color: #8a6a2f; line-height: 1.6; }
.primary-btn { width: 100%; height: 88rpx; line-height: 88rpx; border-radius: 10rpx; background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%); color: #f3eddd; font-size: 30rpx; font-weight: 800; }
</style>
