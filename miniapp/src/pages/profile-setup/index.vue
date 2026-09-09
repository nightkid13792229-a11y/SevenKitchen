<template>
  <view class="profile-setup-container">
    <view class="header">
      <text class="title">完善个人资料</text>
      <text class="subtitle">请选择头像和设置昵称</text>
    </view>

    <view class="form-section">
      <!-- 头像选择 -->
      <view class="form-item">
        <text class="label">头像</text>
        <button
          class="avatar-btn"
          open-type="chooseAvatar"
          @chooseavatar="onChooseAvatar"
        >
          <image
            class="avatar-image"
            :src="resolveUserAvatarSrc(avatarUrl)"
            mode="aspectFill"
          />
          <view class="avatar-overlay">
            <text class="avatar-text">点击选择</text>
          </view>
        </button>
      </view>

      <!-- 昵称输入 -->
      <view class="form-item">
        <text class="label">昵称</text>
        <input
          class="nickname-input"
          type="nickname"
          :value="nickname"
          @input="onNicknameInput"
          placeholder="请输入您的昵称"
          maxlength="20"
        />
        <text class="tip">{{ nickname.length }}/20</text>
      </view>
    </view>

    <!-- 提交按钮 -->
    <view class="submit-section">
      <button
        class="submit-btn"
        :disabled="!canSubmit"
        @tap="handleSubmit"
      >
        完成设置
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import { getBaseUrl } from '../../utils/config'
import {
  buildUserAvatarUploadUrl,
  parseAvatarUploadResponse,
  resolveUserAvatarSrc,
} from '../../utils/user-profile'

const avatarUrl = ref('')
const nickname = ref('')
const isNewAvatar = ref(false) // 标记是否是新选择的头像（需要上传）

// 是否可以提交
const canSubmit = computed(() => {
  return avatarUrl.value.length > 0 && nickname.value.trim().length > 0
})

onLoad(() => {
  // 从后端获取当前用户信息
  loadUserInfo()
})

// 加载用户信息
async function loadUserInfo() {
  try {
    const res = await request({
      url: '/users/me',
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      avatarUrl.value = res.data.avatarUrl || ''
      nickname.value = res.data.nickname || ''
      isNewAvatar.value = false // 从服务器加载的头像不需要上传
    }
  } catch (error) {
    console.error('加载用户信息失败:', error)
  }
}

// 选择头像
function onChooseAvatar(e: any) {
  const { avatarUrl: tempAvatarUrl } = e.detail
  avatarUrl.value = tempAvatarUrl
  isNewAvatar.value = true // 标记为新选择的头像，需要上传
  console.log('[Profile Setup] Avatar selected:', tempAvatarUrl)
}

// 输入昵称
function onNicknameInput(e: any) {
  nickname.value = e.detail.value
}

// 提交
async function handleSubmit() {
  if (!canSubmit.value) {
    return
  }

  // 验证昵称长度
  const trimmedNickname = nickname.value.trim()
  if (trimmedNickname.length < 1 || trimmedNickname.length > 20) {
    uni.showToast({
      title: '昵称长度必须在1-20个字符之间',
      icon: 'none'
    })
    return
  }

  try {
    uni.showLoading({ title: '保存中...' })

    // 上传头像到服务器（如果是新选择的头像）
    let uploadedAvatarUrl = avatarUrl.value
    let avatarUploadFailed = false

    if (isNewAvatar.value) {
      try {
        console.log('[Profile Setup] Uploading new avatar:', avatarUrl.value)
        uploadedAvatarUrl = await uploadAvatar(avatarUrl.value)
      } catch (uploadError: any) {
        console.error('头像上传失败:', uploadError)
        avatarUploadFailed = true

        // 如果是 COS 未配置错误，提供友好提示
        if (uploadError.message && uploadError.message.includes('COS credentials not configured')) {
          uni.hideLoading()
          uni.showModal({
            title: '提示',
            content: '头像上传功能暂未配置，是否只保存昵称？您可以稍后在"我的"页面重新设置头像。',
            success: (modalRes) => {
              if (modalRes.confirm) {
                // 只保存昵称，跳过头像
                saveUserInfo(trimmedNickname, null)
              }
            }
          })
          return
        }

        // 其他上传错误，继续保存但不更新头像
        uploadedAvatarUrl = ''
      }
    }

    // 更新用户信息
    const res = await request({
      url: '/users/me',
      method: 'PUT',
      data: {
        nickname: trimmedNickname,
        avatarUrl: avatarUploadFailed ? undefined : uploadedAvatarUrl
      }
    })

    uni.hideLoading()

    if (res.code === 0) {
      uni.showToast({
        title: avatarUploadFailed ? '昵称保存成功，头像上传失败' : '设置成功',
        icon: avatarUploadFailed ? 'none' : 'success',
        duration: avatarUploadFailed ? 3000 : 1500
      })

      // 更新本地存储的用户信息
      const user = uni.getStorageSync('user')
      if (user) {
        user.nickname = trimmedNickname
        if (!avatarUploadFailed) {
          user.avatarUrl = uploadedAvatarUrl
        }
        uni.setStorageSync('user', user)
      }

      // 延迟跳转到"我的"页面
      setTimeout(() => {
        uni.switchTab({
          url: '/pages/me/index'
        })
      }, 1500)
    } else {
      uni.showToast({
        title: res.message || '保存失败',
        icon: 'none'
      })
    }
  } catch (error: any) {
    uni.hideLoading()
    console.error('保存失败:', error)
    uni.showToast({
      title: error.message || '保存失败，请重试',
      icon: 'none'
    })
  }
}

// 保存用户信息的辅助函数
async function saveUserInfo(nickname: string, avatarUrl: string | null) {
  try {
    uni.showLoading({ title: '保存中...' })

    const res = await request({
      url: '/users/me',
      method: 'PUT',
      data: {
        nickname,
        ...(avatarUrl && { avatarUrl })
      }
    })

    uni.hideLoading()

    if (res.code === 0) {
      uni.showToast({
        title: '保存成功',
        icon: 'success'
      })

      // 更新本地存储的用户信息
      const user = uni.getStorageSync('user')
      if (user) {
        user.nickname = nickname
        if (avatarUrl) {
          user.avatarUrl = avatarUrl
        }
        uni.setStorageSync('user', user)
      }

      // 延迟跳转到"我的"页面
      setTimeout(() => {
        uni.switchTab({
          url: '/pages/me/index'
        })
      }, 1500)
    } else {
      uni.showToast({
        title: res.message || '保存失败',
        icon: 'none'
      })
    }
  } catch (error: any) {
    uni.hideLoading()
    console.error('保存失败:', error)
    uni.showToast({
      title: error.message || '保存失败，请重试',
      icon: 'none'
    })
  }
}

// 上传头像到服务器
async function uploadAvatar(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: buildUserAvatarUploadUrl(getBaseUrl()),
      filePath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${uni.getStorageSync('token')}`
      },
      success: (uploadRes: any) => {
        try {
          resolve(parseAvatarUploadResponse(uploadRes))
        } catch (err) {
          reject(err instanceof Error ? err : new Error('解析响应失败'))
        }
      },
      fail: (err) => {
        console.error('[Upload] Upload failed:', err)
        reject(err)
      }
    })
  })
}

</script>

<style scoped>
.profile-setup-container {
  min-height: 100vh;
  background: #f0f3e9;
  padding: 40rpx 32rpx;
}

.header {
  text-align: center;
  margin-bottom: 60rpx;
}

.title {
  display: block;
  font-size: 48rpx;
  font-weight: bold;
  color: #26261f;
  margin-bottom: 16rpx;
}

.subtitle {
  display: block;
  font-size: 28rpx;
  color: #968f6d;
}

.form-section {
  background: #fbfcf7;
  border: 1rpx solid #e5e8d4;
  border-radius: 28rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 40rpx;
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
}

.form-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 48rpx;
}

.form-item:last-child {
  margin-bottom: 0;
}

.label {
  font-size: 28rpx;
  color: #6b6653;
  margin-bottom: 24rpx;
  align-self: flex-start;
}

/* 头像按钮 */
.avatar-btn {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  padding: 0;
  border: none;
  background: transparent;
}

.avatar-btn::after {
  border: none;
}

.avatar-image {
  width: 200rpx;
  height: 200rpx;
  border-radius: 100rpx;
  background-color: #24493a;
  border: 3rpx solid rgba(216, 188, 133, 0.85);
  box-sizing: border-box;
}

.avatar-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60rpx;
  background: rgba(20, 41, 31, 0.55);
  border-bottom-left-radius: 100rpx;
  border-bottom-right-radius: 100rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-text {
  font-size: 24rpx;
  color: #f3eddd;
}

/* 昵称输入 */
.nickname-input {
  width: 100%;
  height: 88rpx;
  background: #f2f4ea;
  border: 1rpx solid #dde3cd;
  border-radius: 12rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #26261f;
  box-sizing: border-box;
}

.tip {
  align-self: flex-end;
  font-size: 24rpx;
  color: #968f6d;
  margin-top: 12rpx;
}

/* 提交按钮 */
.submit-section {
  padding: 0 32rpx;
}

.submit-btn {
  width: 100%;
  height: 88rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  color: #f3eddd;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: 600;
  border: none;
  box-shadow: 0 12rpx 32rpx rgba(30, 58, 47, 0.22);
}

.submit-btn[disabled] {
  background: #c9c9b8;
}
</style>
