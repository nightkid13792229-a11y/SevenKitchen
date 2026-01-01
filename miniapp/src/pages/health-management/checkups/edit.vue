<template>
  <view class="container">
    <view class="form-section">
      <!-- 体检类型 -->
      <view class="form-item">
        <text class="form-label">体检类型 *</text>
        <picker :range="checkupTypes" :value="checkupTypeIndex" @change="onCheckupTypeChange">
          <view class="picker-button">
            {{ formData.checkupType || '请选择体检类型' }} ▼
          </view>
        </picker>
      </view>

      <!-- 体检日期 -->
      <view class="form-item">
        <text class="form-label">体检日期 *</text>
        <picker mode="date" :value="formData.checkupDate" @change="onCheckupDateChange">
          <view class="picker-button">
            {{ formData.checkupDate || '请选择日期' }} ▼
          </view>
        </picker>
      </view>

      <!-- 检查发现 -->
      <view class="form-item">
        <text class="form-label">检查发现</text>
        <textarea
          class="form-textarea"
          v-model="formData.findings"
          placeholder="填写检查发现（可选）"
          :maxlength="500"
        />
        <text class="char-count">{{ formData.findings?.length || 0 }}/500</text>
      </view>

      <!-- 医生建议 -->
      <view class="form-item">
        <text class="form-label">医生建议</text>
        <textarea
          class="form-textarea"
          v-model="formData.recommendations"
          placeholder="填写医生建议（可选）"
          :maxlength="500"
        />
        <text class="char-count">{{ formData.recommendations?.length || 0 }}/500</text>
      </view>

      <!-- 接种机构 -->
      <view class="form-item">
        <text class="form-label">体检机构/兽医</text>
        <input
          class="form-input"
          type="text"
          v-model="formData.veterinarian"
          placeholder="例如：宠物之家医院"
        />
      </view>

      <!-- 附件上传 -->
      <view class="form-item">
        <text class="form-label">体检报告照片</text>
        <view class="upload-section">
          <view
            v-for="(img, index) in formData.attachments"
            :key="index"
            class="upload-item"
          >
            <image class="upload-image" :src="img" mode="aspectFill" />
            <view class="upload-delete" @tap="removeImage(index)">×</view>
          </view>
          <view v-if="formData.attachments.length < 3" class="upload-btn" @tap="chooseImage">
            <text class="upload-icon">+</text>
            <text class="upload-text">上传照片</text>
          </view>
        </view>
        <text class="form-hint">最多上传3张照片</text>
      </view>
    </view>

    <!-- 保存按钮 -->
    <view class="bottom-actions">
      <button class="save-btn" @tap="save">保存记录</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getToken, healthApi, uploadHealthImage } from '../../../utils/api'

interface CheckupFormData {
  checkupType: string
  checkupDate: string
  findings?: string
  recommendations?: string
  veterinarian?: string
  attachments: string[]
}

const checkupTypes = [
  '年度体检',
  '幼犬体检',
  '老年体检',
  '专项检查',
  '疫苗接种前体检',
  '其他'
]

const checkupTypeIndex = ref<number>(0)
const formData = ref<CheckupFormData>({
  checkupType: '',
  checkupDate: '',
  findings: '',
  recommendations: '',
  veterinarian: '',
  attachments: []
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
    await loadCheckup()
  } else {
    formData.value.checkupDate = new Date().toISOString().split('T')[0]
  }
})

async function loadCheckup() {
  try {
    const res = await healthApi.getCheckup(dogId.value, recordId.value)
    if (res.code === 0) {
      // 确保所有字段都有值（包括 null 转为空字符串或空数组）
      formData.value = {
        checkupType: res.data.checkupType || '',
        checkupDate: res.data.checkupDate || '',
        findings: res.data.findings || '',
        recommendations: res.data.recommendations || '',
        veterinarian: res.data.veterinarian || '',
        attachments: res.data.attachments || []
      }
      const index = checkupTypes.indexOf(res.data.checkupType)
      if (index !== -1) checkupTypeIndex.value = index
    }
  } catch (err) {
    console.error('[CheckupEdit] Failed to load checkup:', err)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }
}

function onCheckupTypeChange(e: any) {
  checkupTypeIndex.value = e.detail.value
  formData.value.checkupType = checkupTypes[e.detail.value]
}

function onCheckupDateChange(e: any) {
  formData.value.checkupDate = e.detail.value
}

function chooseImage() {
  const maxCount = 3 - formData.value.attachments.length

  uni.chooseImage({
    count: maxCount,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const tempFilePaths = res.tempFilePaths

      try {
        uni.showLoading({ title: '上传中...' })

        // 上传所有图片到COS
        const uploadPromises = tempFilePaths.map(filePath => uploadHealthImage(filePath))
        const uploadResults = await Promise.all(uploadPromises)

        // 获取上传后的URL
        const uploadedUrls = uploadResults.map(result => result.url)

        // 添加到附件列表
        formData.value.attachments.push(...uploadedUrls)

        uni.hideLoading()
        uni.showToast({
          title: '上传成功',
          icon: 'success'
        })
      } catch (err) {
        uni.hideLoading()
        console.error('[CheckupEdit] Upload failed:', err)
        uni.showToast({
          title: '上传失败',
          icon: 'none'
        })
      }
    }
  })
}

function removeImage(index: number) {
  formData.value.attachments.splice(index, 1)
}

async function save() {
  if (!formData.value.checkupType) {
    uni.showToast({
      title: '请选择体检类型',
      icon: 'none'
    })
    return
  }

  if (!formData.value.checkupDate) {
    uni.showToast({
      title: '请选择体检日期',
      icon: 'none'
    })
    return
  }

  try {
    const isEdit = !!recordId.value
    const requestData = {
      ...formData.value,
      weightKg: formData.value.weightKg ? parseFloat(formData.value.weightKg) : undefined,
      bcsScore: formData.value.bcsScore ? parseInt(formData.value.bcsScore) : undefined,
      heartRate: formData.value.heartRate ? parseInt(formData.value.heartRate) : undefined,
      temperature: formData.value.temperature ? parseFloat(formData.value.temperature) : undefined
    }

    const res = isEdit
      ? await healthApi.updateCheckup(dogId.value, recordId.value, requestData)
      : await healthApi.createCheckup(dogId.value, requestData)

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
    console.error('[CheckupEdit] Failed to save:', err)
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

.form-group-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin: 30rpx 0 20rpx 0;
  padding-top: 20rpx;
  border-top: 1px solid #f0f0f0;
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

.upload-section {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.upload-item {
  position: relative;
  width: 160rpx;
  height: 160rpx;
}

.upload-image {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}

.upload-delete {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 40rpx;
  height: 40rpx;
  background: #e74c3c;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  line-height: 1;
}

.upload-btn {
  width: 160rpx;
  height: 160rpx;
  background: #f8f8f8;
  border: 2rpx dashed #ddd;
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.upload-icon {
  font-size: 48rpx;
  color: #999;
}

.upload-text {
  font-size: 22rpx;
  color: #999;
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
  background: linear-gradient(135deg, #0984e3 0%, #74b9ff 100%);
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
