<template>
  <view class="container">
    <view class="form-section">
      <!-- 就诊日期 -->
      <view class="form-item">
        <text class="form-label">就诊日期 *</text>
        <picker mode="date" :value="formData.visitDate" @change="onVisitDateChange">
          <view class="picker-button">
            {{ formData.visitDate || '请选择日期' }} ▼
          </view>
        </picker>
      </view>

      <!-- 主诉症状 -->
      <view class="form-item">
        <text class="form-label">主诉症状 *</text>
        <textarea
          class="form-textarea"
          v-model="formData.chiefComplaint"
          placeholder="描述狗狗的症状表现"
          :maxlength="500"
        />
        <text class="char-count">{{ formData.chiefComplaint?.length || 0 }}/500</text>
      </view>

      <!-- 诊断结果 -->
      <view class="form-item">
        <text class="form-label">诊断结果 *</text>
        <input
          class="form-input"
          type="text"
          v-model="formData.diagnosis"
          placeholder="例如：急性肠胃炎"
        />
      </view>

      <!-- 治疗方案 -->
      <view class="form-item">
        <text class="form-label">治疗方案</text>
        <textarea
          class="form-textarea"
          v-model="formData.treatment"
          placeholder="描述治疗方案和用药情况"
          :maxlength="500"
        />
        <text class="char-count">{{ formData.treatment?.length || 0 }}/500</text>
      </view>

      <!-- 用药清单 -->
      <view class="form-item">
        <text class="form-label">用药清单</text>
        <textarea
          class="form-textarea"
          v-model="formData.medications"
          placeholder="记录使用的药物（可选）"
          :maxlength="500"
        />
        <text class="char-count">{{ formData.medications?.length || 0 }}/500</text>
      </view>

      <!-- 治疗状态 -->
      <view class="form-item">
        <text class="form-label">治疗状态 *</text>
        <picker :range="statusOptions" :value="statusIndex" @change="onStatusChange">
          <view class="picker-button">
            {{ statusText }} ▼
          </view>
        </picker>
      </view>

      <!-- 复查日期 -->
      <view class="form-item">
        <text class="form-label">复查日期</text>
        <picker mode="date" :value="formData.followUpDate" @change="onFollowUpDateChange">
          <view class="picker-button">
            {{ formData.followUpDate || '请选择日期（可选）' }} ▼
          </view>
        </picker>
        <text class="form-hint">如需复查，请设置复查日期</text>
      </view>

      <!-- 就诊机构 -->
      <view class="form-item">
        <text class="form-label">就诊机构/兽医</text>
        <input
          class="form-input"
          type="text"
          v-model="formData.veterinarian"
          placeholder="例如：宠物之家医院"
        />
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

interface MedicalRecordFormData {
  visitDate: string
  chiefComplaint: string
  diagnosis: string
  treatment?: string
  medications?: string
  status: 'TREATING' | 'RECOVERED' | 'CHRONIC'
  followUpDate?: string
  veterinarian?: string
  notes?: string
}

const statusOptions = [
  { label: '治疗中', value: 'TREATING' },
  { label: '已痊愈', value: 'RECOVERED' },
  { label: '慢性病', value: 'CHRONIC' }
]

const statusIndex = ref<number>(0)
const formData = ref<MedicalRecordFormData>({
  visitDate: '',
  chiefComplaint: '',
  diagnosis: '',
  treatment: '',
  medications: '',
  status: 'TREATING',
  followUpDate: '',
  veterinarian: '',
  notes: ''
})

const statusText = computed(() => statusOptions[statusIndex.value].label)

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
    await loadRecord()
  } else {
    formData.value.visitDate = new Date().toISOString().split('T')[0]
  }
})

async function loadRecord() {
  try {
    const res = await healthApi.getMedicalRecord(dogId.value, recordId.value)
    if (res.code === 0) {
      // 确保所有字段都有值（包括 null 转为空字符串或空数组）
      formData.value = {
        visitDate: res.data.visitDate || '',
        chiefComplaint: res.data.chiefComplaint || '',
        diagnosis: res.data.diagnosis || '',
        treatment: res.data.treatment || '',
        medications: res.data.medications || [],
        status: res.data.status || 'TREATING',
        followUpDate: res.data.followUpDate || '',
        veterinarian: res.data.veterinarian || '',
        notes: res.data.notes || ''
      }
      const index = statusOptions.findIndex(s => s.value === res.data.status)
      if (index !== -1) statusIndex.value = index
    }
  } catch (err) {
    console.error('[MedicalRecordEdit] Failed to load record:', err)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }
}

function onVisitDateChange(e: any) {
  formData.value.visitDate = e.detail.value
}

function onStatusChange(e: any) {
  statusIndex.value = e.detail.value
  formData.value.status = statusOptions[e.detail.value].value as any
}

function onFollowUpDateChange(e: any) {
  formData.value.followUpDate = e.detail.value
}

async function save() {
  if (!formData.value.visitDate) {
    uni.showToast({
      title: '请选择就诊日期',
      icon: 'none'
    })
    return
  }

  if (!formData.value.chiefComplaint) {
    uni.showToast({
      title: '请填写主诉症状',
      icon: 'none'
    })
    return
  }

  if (!formData.value.diagnosis) {
    uni.showToast({
      title: '请填写诊断结果',
      icon: 'none'
    })
    return
  }

  try {
    const isEdit = !!recordId.value
    const res = isEdit
      ? await healthApi.updateMedicalRecord(dogId.value, recordId.value, formData.value)
      : await healthApi.createMedicalRecord(dogId.value, formData.value)

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
    console.error('[MedicalRecordEdit] Failed to save:', err)
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
  background: linear-gradient(135deg, #e17055 0%, #fab1a0 100%);
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
