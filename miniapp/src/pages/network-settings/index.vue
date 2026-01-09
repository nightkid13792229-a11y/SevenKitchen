<template>
  <view class="container">
    <view class="section">
      <view class="section-title">API 服务器地址</view>
      <view class="section-desc">配置后端 API 的基础地址，用于开发调试</view>
      
      <view class="input-group">
        <input
          v-model="baseUrl"
          class="input"
          placeholder="例如: https://api.sevenkitchen.cloud/api/v1"
          type="text"
        />
      </view>
      
      <view class="hint">
        <text class="hint-text">默认值: {{ defaultBaseUrl }}</text>
      </view>
    </view>
    
    <view class="section">
      <view class="section-title">连接测试</view>
      <view class="test-group">
        <button class="btn btn-primary" @click="testConnection">测试连接</button>
        <view v-if="testStatus" class="test-result" :class="testStatus === 'success' ? 'success' : 'error'">
          <text v-if="testStatus === 'success'">✓ 连接成功</text>
          <text v-else-if="testStatus === 'error'">✗ 连接失败: {{ testError }}</text>
          <text v-else-if="testStatus === 'testing'">测试中...</text>
        </view>
      </view>
    </view>
    
    <view class="button-group">
      <button class="btn btn-primary" @click="saveSettings">保存设置</button>
      <button class="btn btn-secondary" @click="resetToDefault">重置为默认值</button>
    </view>
    
    <view class="section">
      <view class="section-title">使用说明</view>
      <view class="help-text">
        <text>• 默认使用生产环境: https://api.sevenkitchen.cloud/api/v1</text>
        <text>• 开发环境可切换为: http://127.0.0.1:3000/api/v1</text>
        <text>• 修改后需要重启应用才能生效</text>
        <text>• 如果连接失败，请检查后端服务是否运行</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getBaseUrl, setBaseUrl, resetBaseUrl, getDefaultBaseUrl } from '../../utils/config'
import { request } from '../../utils/api'

const baseUrl = ref('')
const defaultBaseUrl = ref('')
const testStatus = ref<'success' | 'error' | 'testing' | null>(null)
const testError = ref('')

onMounted(() => {
  // Load current BASE_URL from storage
  baseUrl.value = getBaseUrl()
  defaultBaseUrl.value = getDefaultBaseUrl()
})

function saveSettings() {
  if (!baseUrl.value.trim()) {
    uni.showToast({
      title: '请输入有效的 URL',
      icon: 'none'
    })
    return
  }
  
  // Basic URL validation
  try {
    new URL(baseUrl.value.trim())
  } catch (e) {
    uni.showToast({
      title: 'URL 格式不正确',
      icon: 'none'
    })
    return
  }
  
  setBaseUrl(baseUrl.value.trim())
  uni.showToast({
    title: '设置已保存',
    icon: 'success'
  })
  
  // Clear test status
  testStatus.value = null
}

function resetToDefault() {
  baseUrl.value = defaultBaseUrl.value
  resetBaseUrl()
  uni.showToast({
    title: '已重置为默认值',
    icon: 'success'
  })
  testStatus.value = null
}

async function testConnection() {
  testStatus.value = 'testing'
  testError.value = ''
  
  // Validate URL format first
  let testUrl: string
  try {
    testUrl = baseUrl.value.trim()
    new URL(testUrl)
  } catch (e) {
    testStatus.value = 'error'
    testError.value = 'URL 格式不正确'
    return
  }
  
  // Save current value temporarily for testing
  const originalUrl = getBaseUrl()
  setBaseUrl(testUrl)
  
  try {
    // Try to make a simple request to test connectivity
    // We'll use a low-level uni.request to avoid token/auth issues
    await new Promise<void>((resolve, reject) => {
      uni.request({
        url: testUrl.replace(/\/api\/v1$/, '') + '/health', // Try /health endpoint
        method: 'GET',
        timeout: 5000, // 5 second timeout
        success: (res) => {
          // Any response (even 404) means server is reachable
          testStatus.value = 'success'
          resolve()
        },
        fail: (err: any) => {
          // Check if it's a connection error vs other error
          const errMsg = err?.errMsg || String(err)
          if (errMsg.includes('timeout') || errMsg.includes('连接') || errMsg.includes('CONNECTION')) {
            testStatus.value = 'error'
            testError.value = '无法连接到服务器，请检查后端是否运行'
            reject(err)
          } else {
            // Other errors (like 404) mean server is reachable
            testStatus.value = 'success'
            resolve()
          }
        }
      })
    })
  } catch (err: any) {
    // Error already handled in fail callback
    if (testStatus.value === 'testing') {
      testStatus.value = 'error'
      testError.value = err?.message || '连接测试失败'
    }
    // Restore original URL on failure
    setBaseUrl(originalUrl)
  }
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  background-color: #f5f5f5;
  min-height: 100vh;
}

.section {
  background-color: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 10rpx;
}

.section-desc {
  font-size: 26rpx;
  color: #666;
  margin-bottom: 20rpx;
}

.input-group {
  margin-bottom: 20rpx;
}

.input {
  width: 100%;
  height: 80rpx;
  padding: 0 20rpx;
  border: 2rpx solid #e0e0e0;
  border-radius: 8rpx;
  font-size: 28rpx;
  background-color: #fff;
}

.input:focus {
  border-color: #007aff;
}

.hint {
  margin-top: 10rpx;
}

.hint-text {
  font-size: 24rpx;
  color: #999;
}

.test-group {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.test-result {
  padding: 20rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
}

.test-result.success {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.test-result.error {
  background-color: #ffebee;
  color: #c62828;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-bottom: 20rpx;
}

.btn {
  height: 88rpx;
  border-radius: 8rpx;
  font-size: 32rpx;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-primary {
  background-color: #007aff;
  color: #fff;
}

.btn-primary:active {
  background-color: #0051d5;
}

.btn-secondary {
  background-color: #f0f0f0;
  color: #333;
}

.btn-secondary:active {
  background-color: #e0e0e0;
}

.help-text {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
}
</style>

