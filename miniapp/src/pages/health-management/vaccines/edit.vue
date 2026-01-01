<template>
  <view class="container">
    <view class="form-section">
      <!-- 疫苗名称 -->
      <view class="form-item">
        <text class="form-label">疫苗名称 *</text>
        <picker :range="vaccineOptions" :value="vaccineIndex" @change="onVaccineChange">
          <view class="picker-button">
            {{ formData.vaccineName || '请选择疫苗' }} ▼
          </view>
        </picker>
        <text class="form-hint">{{ currentVaccineInterval }}</text>
      </view>

      <!-- 接种日期 -->
      <view class="form-item">
        <text class="form-label">接种日期 *</text>
        <picker mode="date" :value="formData.vaccinationDate" @change="onVaccinationDateChange">
          <view class="picker-button">
            {{ formData.vaccinationDate || '请选择日期' }} ▼
          </view>
        </picker>
      </view>

      <!-- 下次接种日期 -->
      <view class="form-item">
        <text class="form-label">下次接种日期</text>
        <picker mode="date" :value="formData.nextDueDate" @change="onNextDueDateChange">
          <view class="picker-button">
            {{ formData.nextDueDate || '请选择日期（可选）' }} ▼
          </view>
        </picker>
      </view>

      <!-- 备注 -->
      <view class="form-item">
        <text class="form-label">备注</text>
        <textarea
          class="form-textarea"
          v-model="formData.notes"
          placeholder="填写备注信息（可选）"
          :maxlength="200"
        />
        <text class="char-count">{{ formData.notes?.length || 0 }}/200</text>
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

interface VaccineFormData {
  vaccineName: string
  vaccinationDate: string
  nextDueDate?: string
  notes?: string
}

const vaccineOptions = [
  '狂犬疫苗',
  '犬八联疫苗',
  '犬四联疫苗',
  '犬二联疫苗',
  '副流感疫苗',
  '冠状病毒疫苗',
  '博德特氏菌疫苗',
  '莱姆病疫苗',
  '其他'
]

// 疫苗接种间隔时间说明（单位：月）
const vaccineIntervals: Record<string, string> = {
  '狂犬疫苗': '首次接种后，通常每1-3年加强一次（具体视疫苗类型而定）',
  '犬八联疫苗': '幼犬接种3针，每针间隔3-4周；之后每年加强一次',
  '犬四联疫苗': '幼犬接种3针，每针间隔3-4周；之后每年加强一次',
  '犬二联疫苗': '幼犬接种2-3针，每针间隔3-4周；之后每年加强一次',
  '副流感疫苗': '幼犬接种2-3针，每针间隔3-4周；之后每年加强一次',
  '冠状病毒疫苗': '幼犬接种2-3针，每针间隔3-4周；之后每年加强一次',
  '博德特氏菌疫苗': '幼犬接种1-2针，间隔3-4周；之后每年加强一次',
  '莱姆病疫苗': '幼犬接种2针，间隔3-4周；之后每年加强一次',
  '其他': '请根据兽医建议和疫苗说明进行接种'
}

const vaccineIndex = ref<number>(0)
const formData = ref<VaccineFormData>({
  vaccineName: '',
  vaccinationDate: '',
  nextDueDate: '',
  notes: ''
})

const dogId = ref<string>('')
const recordId = ref<string>('')

// 计算当前选中疫苗的接种间隔说明
const currentVaccineInterval = computed(() => {
  if (!formData.value.vaccineName) {
    return '请先选择疫苗类型'
  }
  return vaccineIntervals[formData.value.vaccineName] || vaccineIntervals['其他']
})

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

  // 获取参数
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  if (options.dogId) {
    dogId.value = options.dogId
  }

  if (options.id) {
    recordId.value = options.id
    await loadVaccine()
  } else {
    // 新增模式，设置默认日期为今天
    formData.value.vaccinationDate = new Date().toISOString().split('T')[0]
  }
})

async function loadVaccine() {
  try {
    const res = await healthApi.getVaccine(dogId.value, recordId.value)
    if (res.code === 0) {
      // 确保所有字段都有值（包括 null 转为空字符串）
      formData.value = {
        vaccineName: res.data.vaccineName || '',
        vaccinationDate: res.data.vaccinationDate || '',
        nextDueDate: res.data.nextDueDate || '',
        notes: res.data.notes || ''
      }
      // 设置vaccineIndex
      const index = vaccineOptions.indexOf(res.data.vaccineName)
      if (index !== -1) vaccineIndex.value = index
    }
  } catch (err) {
    console.error('[VaccineEdit] Failed to load vaccine:', err)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }
}

function onVaccineChange(e: any) {
  vaccineIndex.value = e.detail.value
  formData.value.vaccineName = vaccineOptions[e.detail.value]
}

function onVaccinationDateChange(e: any) {
  formData.value.vaccinationDate = e.detail.value

  // 自动计算下次接种日期（大部分疫苗是1年后）
  if (formData.value.vaccineName && !formData.value.nextDueDate) {
    const vaccDate = new Date(e.detail.value)
    const nextDate = new Date(vaccDate)
    nextDate.setFullYear(nextDate.getFullYear() + 1)

    // 狂犬疫苗通常是3年
    if (formData.value.vaccineName.includes('狂犬')) {
      nextDate.setFullYear(vaccDate.getFullYear() + 3)
    }

    formData.value.nextDueDate = nextDate.toISOString().split('T')[0]
  }
}

function onNextDueDateChange(e: any) {
  formData.value.nextDueDate = e.detail.value
}

async function save() {
  // 验证
  if (!formData.value.vaccineName) {
    uni.showToast({
      title: '请选择疫苗名称',
      icon: 'none'
    })
    return
  }

  if (!formData.value.vaccinationDate) {
    uni.showToast({
      title: '请选择接种日期',
      icon: 'none'
    })
    return
  }

  try {
    const isEdit = !!recordId.value
    const res = isEdit
      ? await healthApi.updateVaccine(dogId.value, recordId.value, formData.value)
      : await healthApi.createVaccine(dogId.value, formData.value)

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
    console.error('[VaccineEdit] Failed to save:', err)
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

/* 底部操作 */
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
