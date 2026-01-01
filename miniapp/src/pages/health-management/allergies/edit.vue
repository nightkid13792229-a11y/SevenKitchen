<template>
  <view class="container">
    <view class="form-section">
      <!-- 过敏原 -->
      <view class="form-item">
        <text class="form-label">过敏原 *</text>
        <input
          class="form-input"
          type="text"
          v-model="formData.allergen"
          placeholder="例如：鸡肉、牛肉、海鲜"
        />
      </view>

      <!-- 过敏类型 -->
      <view class="form-item">
        <text class="form-label">过敏类型 *</text>
        <picker :range="typeOptions" :value="typeIndex" @change="onTypeChange">
          <view class="picker-button">
            {{ typeText }} ▼
          </view>
        </picker>
      </view>

      <!-- 发现日期 -->
      <view class="form-item">
        <text class="form-label">发现日期 *</text>
        <picker mode="date" :value="formData.discoveryDate" @change="onDiscoveryDateChange">
          <view class="picker-button">
            {{ formData.discoveryDate || '请选择日期' }} ▼
          </view>
        </picker>
      </view>

      <!-- 症状表现 -->
      <view class="form-item">
        <text class="form-label">症状表现 *</text>
        <textarea
          class="form-textarea"
          v-model="formData.symptoms"
          placeholder="描述过敏症状，如：皮肤瘙痒、呕吐、腹泻等"
          :maxlength="500"
        />
        <text class="char-count">{{ formData.symptoms?.length || 0 }}/500</text>
      </view>

      <!-- 严重程度 -->
      <view class="form-item">
        <text class="form-label">严重程度 *</text>
        <picker :range="severityOptions" :value="severityIndex" @change="onSeverityChange">
          <view class="picker-button">
            {{ severityText }} ▼
          </view>
        </picker>
        <text class="form-hint">轻度：轻微症状；中度：需要治疗；重度：危及生命</text>
      </view>

      <!-- 确认方式 -->
      <view class="form-item">
        <text class="form-label">确认方式 *</text>
        <picker :range="confirmedByOptions" :value="confirmedByIndex" @change="onConfirmedByChange">
          <view class="picker-button">
            {{ confirmedByText }} ▼
          </view>
        </picker>
      </view>

      <!-- 处理方式 -->
      <view class="form-item">
        <text class="form-label">处理方式</text>
        <textarea
          class="form-textarea"
          v-model="formData.treatment"
          placeholder="描述如何处理过敏情况"
          :maxlength="500"
        />
        <text class="char-count">{{ formData.treatment?.length || 0 }}/500</text>
      </view>

      <!-- 备注 -->
      <view class="form-item">
        <text class="form-label">备注</text>
        <textarea
          class="form-textarea"
          v-model="formData.notes"
          placeholder="填写其他备注信息（可选）"
          :maxlength="500"
        />
        <text class="char-count">{{ formData.notes?.length || 0 }}/500</text>
      </view>
    </view>

    <!-- 保存按钮 -->
    <view class="bottom-actions">
      <button class="save-btn" @tap="save">保存记录</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getToken, healthApi } from '../../../utils/api'

interface AllergyFormData {
  allergen: string
  allergenType: 'FOOD' | 'ENVIRONMENTAL' | 'MEDICATION'
  discoveryDate: string
  symptoms: string
  severity: 'MILD' | 'MODERATE' | 'SEVERE'
  confirmedBy: 'VET' | 'OWNER'
  treatment?: string
  notes?: string
}

const typeOptions = ['食物过敏', '环境过敏', '药物过敏']
const typeIndex = ref<number>(0)
const typeText = computed(() => typeOptions[typeIndex.value])

const severityOptions = ['轻度', '中度', '重度']
const severityIndex = ref<number>(0)
const severityText = computed(() => severityOptions[severityIndex.value])

const confirmedByOptions = ['兽医诊断', '主人观察']
const confirmedByIndex = ref<number>(0)
const confirmedByText = computed(() => confirmedByOptions[confirmedByIndex.value])

const formData = ref<AllergyFormData>({
  allergen: '',
  allergenType: 'FOOD',
  discoveryDate: '',
  symptoms: '',
  severity: 'MILD',
  confirmedBy: 'VET',
  treatment: '',
  notes: ''
})

const dogId = ref<string>('')
const recordId = ref<string>('')

onMounted(async () => {
  const token = getToken()
  if (!token) {
    uni.showToast({
      title: '请先登录',
      icon: 'none'
    })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
    return
  }

  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  if (options.dogId) {
    dogId.value = options.dogId
  }

  if (options.id) {
    recordId.value = options.id
    await loadAllergy()
  } else {
    formData.value.discoveryDate = new Date().toISOString().split('T')[0]
  }
})

async function loadAllergy() {
  try {
    const res = await healthApi.getAllergy(dogId.value, recordId.value)
    if (res.code === 0) {
      // 确保所有字段都有值（包括 null 转为空字符串）
      formData.value = {
        allergen: res.data.allergen || '',
        allergenType: res.data.allergenType || 'FOOD',
        discoveryDate: res.data.discoveryDate || '',
        symptoms: res.data.symptoms || '',
        severity: res.data.severity || 'MILD',
        confirmedBy: res.data.confirmedBy || 'VET',
        treatment: res.data.treatment || '',
        notes: res.data.notes || ''
      }
      // 设置index
      const typeIdx = ['FOOD', 'ENVIRONMENTAL', 'MEDICATION'].indexOf(res.data.allergenType)
      if (typeIdx !== -1) typeIndex.value = typeIdx

      const severityIdx = ['MILD', 'MODERATE', 'SEVERE'].indexOf(res.data.severity)
      if (severityIdx !== -1) severityIndex.value = severityIdx

      const confirmedIdx = ['VET', 'OWNER'].indexOf(res.data.confirmedBy)
      if (confirmedIdx !== -1) confirmedByIndex.value = confirmedIdx
    }
  } catch (err) {
    console.error('[AllergyEdit] Failed to load allergy:', err)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }
}

function onTypeChange(e: any) {
  typeIndex.value = e.detail.value
  const types = ['FOOD', 'ENVIRONMENTAL', 'MEDICATION']
  formData.value.allergenType = types[e.detail.value] as any
}

function onDiscoveryDateChange(e: any) {
  formData.value.discoveryDate = e.detail.value
}

function onSeverityChange(e: any) {
  severityIndex.value = e.detail.value
  const severities = ['MILD', 'MODERATE', 'SEVERE']
  formData.value.severity = severities[e.detail.value] as any
}

function onConfirmedByChange(e: any) {
  confirmedByIndex.value = e.detail.value
  const confirmedBy = ['VET', 'OWNER']
  formData.value.confirmedBy = confirmedBy[e.detail.value] as any
}

async function save() {
  if (!formData.value.allergen) {
    uni.showToast({
      title: '请填写过敏原',
      icon: 'none'
    })
    return
  }

  if (!formData.value.discoveryDate) {
    uni.showToast({
      title: '请选择发现日期',
      icon: 'none'
    })
    return
  }

  if (!formData.value.symptoms) {
    uni.showToast({
      title: '请描述症状表现',
      icon: 'none'
    })
    return
  }

  try {
    const isEdit = !!recordId.value
    const res = isEdit
      ? await healthApi.updateAllergy(dogId.value, recordId.value, formData.value)
      : await healthApi.createAllergy(dogId.value, formData.value)

    if (res.code === 0) {
      uni.showToast({
        title: isEdit ? '修改成功' : '添加成功',
        icon: 'success'
      })

      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    }
  } catch (err) {
    console.error('[AllergyEdit] Failed to save:', err)
    uni.showToast({
      title: '保存失败',
      icon: 'none'
    })
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120rpx;
}

.form-section {
  background: white;
  margin: 20rpx;
  border-radius: 12rpx;
  padding: 24rpx;
}

.form-item {
  margin-bottom: 30rpx;
}

.form-label {
  display: block;
  font-size: 28rpx;
  color: #333;
  font-weight: bold;
  margin-bottom: 16rpx;
}

.form-input {
  width: 100%;
  background: #f8f8f8;
  border: 1px solid #e0e0e0;
  border-radius: 8rpx;
  padding: 20rpx;
  font-size: 28rpx;
  color: #333;
  box-sizing: border-box;
}

.form-textarea {
  width: 100%;
  min-height: 150rpx;
  background: #f8f8f8;
  border: 1px solid #e0e0e0;
  border-radius: 8rpx;
  padding: 20rpx;
  font-size: 28rpx;
  color: #333;
  box-sizing: border-box;
}

.form-hint {
  display: block;
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
}

.char-count {
  display: block;
  text-align: right;
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
}

.picker-button {
  background: #f8f8f8;
  border: 1px solid #e0e0e0;
  border-radius: 8rpx;
  padding: 20rpx;
  font-size: 28rpx;
  color: #333;
}

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20rpx;
  background: white;
  box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.05);
}

.save-btn {
  width: 100%;
  height: 88rpx;
  background: linear-gradient(135deg, #d63031 0%, #ff7675 100%);
  color: white;
  border: none;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
}

.save-btn::after {
  border: none;
}
</style>
