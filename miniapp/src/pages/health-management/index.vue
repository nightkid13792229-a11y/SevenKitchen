<template>
  <view class="container">
    <!-- 步骤1：选择狗狗 -->
    <view class="section">
      <view class="section-title">📌 步骤1：选择狗狗</view>

      <view class="dog-selector" @tap="showDogPicker">
        <view class="selector-button">
          <text class="selector-text">
            {{ selectedDog ? selectedDog.name : '请选择狗狗' }}
          </text>
          <text class="selector-arrow">▼</text>
        </view>
      </view>

      <!-- 狗狗信息卡片 -->
      <view v-if="selectedDog" class="dog-info-card">
        <view class="dog-name-row">
          <text class="dog-name">{{ selectedDog.name }}</text>
          <text class="dog-gender" :class="selectedDog.gender === 'MALE' ? 'male' : 'female'">
            {{ selectedDog.gender === 'MALE' ? '♂' : '♀' }}
          </text>
        </view>
        <text class="dog-breed">{{ selectedDog.breedName || '未知品种' }}</text>
        <view class="dog-stats">
          <text class="stat-text">{{ selectedDog.currentWeightKg }}kg</text>
          <text class="stat-text">·</text>
          <text class="stat-text">{{ calculateAge(selectedDog.birthday) }}</text>
        </view>

        <!-- 健康档案统计 -->
        <view class="health-summary">
          <view class="summary-row">
            <text class="summary-label">💉 疫苗记录</text>
            <text class="summary-value">{{ healthSummary.vaccines }}</text>
          </view>
          <view class="summary-row">
            <text class="summary-label">🏥 体检记录</text>
            <text class="summary-value">{{ healthSummary.checkups }}</text>
          </view>
          <view class="summary-row">
            <text class="summary-label">📋 病历记录</text>
            <text class="summary-value">{{ healthSummary.medicalRecords }}</text>
          </view>
          <view class="summary-row">
            <text class="summary-label">⚠️ 过敏记录</text>
            <text class="summary-value">{{ healthSummary.allergies }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 疫苗记录提醒 -->
    <view v-if="selectedDog && upcomingVaccine" class="section alert-section">
      <view class="alert-header">
        <text class="alert-icon">💉</text>
        <text class="alert-title">下次接种提醒</text>
        <button class="subscribe-btn" @tap="subscribeVaccineReminders">订阅提醒</button>
      </view>
      <view class="alert-card" :class="upcomingVaccine.alertClass">
        <text class="alert-vaccine-name">{{ upcomingVaccine.vaccineName }}</text>
        <text class="alert-date">{{ upcomingVaccine.alertText }}</text>
      </view>
    </view>

    <!-- 疫苗记录 -->
    <view v-if="selectedDog && vaccines.length > 0" class="section">
      <view class="section-header">
        <text class="section-title">💉 疫苗记录（{{ vaccines.length }}）</text>
        <view class="section-more" @tap="goToVaccineList">
          <text>查看全部</text>
          <text class="arrow">›</text>
        </view>
      </view>
      <view class="record-list">
        <view
          v-for="vaccine in vaccines.slice(0, 2)"
          :key="vaccine.id"
          class="record-item"
          @tap="goToVaccineDetail(vaccine.id)"
        >
          <view class="record-main">
            <view class="record-name">{{ vaccine.vaccineName }}</view>
            <view class="record-date">{{ vaccine.vaccinationDate }}</view>
          </view>
          <view class="record-status" :class="getVaccineStatusClass(vaccine)">
            {{ getVaccineStatusText(vaccine) }}
          </view>
        </view>
      </view>
    </view>

    <!-- 体检记录 -->
    <view v-if="selectedDog && checkups.length > 0" class="section">
      <view class="section-header">
        <text class="section-title">🏥 体检记录（{{ checkups.length }}）</text>
        <view class="section-more" @tap="goToCheckupList">
          <text>查看全部</text>
          <text class="arrow">›</text>
        </view>
      </view>
      <view class="record-list">
        <view
          v-for="checkup in checkups.slice(0, 2)"
          :key="checkup.id"
          class="record-item"
          @tap="goToCheckupDetail(checkup.id)"
        >
          <view class="record-main">
            <view class="record-name">{{ checkup.checkupType }}</view>
            <view class="record-date">{{ checkup.checkupDate }}</view>
          </view>
          <view class="record-weight">
            {{ checkup.weightKg }}kg
          </view>
        </view>
      </view>
    </view>

    <!-- 病历记录 -->
    <view v-if="selectedDog && medicalRecords.length > 0" class="section">
      <view class="section-header">
        <text class="section-title">📋 病历记录（{{ medicalRecords.length }}）</text>
        <view class="section-more" @tap="goToMedicalRecordList">
          <text>查看全部</text>
          <text class="arrow">›</text>
        </view>
      </view>
      <view class="record-list">
        <view
          v-for="record in medicalRecords.slice(0, 2)"
          :key="record.id"
          class="record-item"
          @tap="goToMedicalRecordDetail(record.id)"
        >
          <view class="record-main">
            <view class="record-name">{{ record.diagnosis }}</view>
            <view class="record-date">{{ record.visitDate }}</view>
          </view>
          <view class="record-status" :class="getMedicalStatusClass(record.status)">
            {{ getMedicalStatusText(record.status) }}
          </view>
        </view>
      </view>
    </view>

    <!-- 过敏记录 -->
    <view v-if="selectedDog && allergies.length > 0" class="section">
      <view class="section-header">
        <text class="section-title">⚠️ 过敏记录（{{ allergies.length }}）</text>
        <view class="section-more" @tap="goToAllergyList">
          <text>查看全部</text>
          <text class="arrow">›</text>
        </view>
      </view>
      <view class="record-list">
        <view
          v-for="allergy in allergies.slice(0, 2)"
          :key="allergy.id"
          class="record-item"
          @tap="goToAllergyDetail(allergy.id)"
        >
          <view class="record-main">
            <view class="record-name">{{ allergy.allergen }}</view>
            <view class="record-date">发现于 {{ allergy.discoveryDate }}</view>
          </view>
          <view class="record-severity" :class="getAllergySeverityClass(allergy.severity)">
            {{ getAllergySeverityText(allergy.severity) }}
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作按钮 -->
    <view v-if="selectedDog" class="bottom-actions">
      <button class="action-btn" @tap="showAddMenu">
        <text class="btn-icon">+</text>
        <text>添加健康记录</text>
      </button>
      <button class="action-btn secondary" @tap="exportHealthData">
        <text class="btn-icon">📤</text>
        <text>导出健康数据</text>
      </button>
    </view>

    <!-- 无记录提示 -->
    <view v-if="selectedDog && !hasAnyRecords" class="empty-records">
      <view class="empty-icon">📋</view>
      <text class="empty-title">暂无健康记录</text>
      <text class="empty-desc">记录疫苗、体检、病历等信息，更好地守护爱犬健康</text>
      <button class="create-btn" @tap="showAddMenu">添加第一条记录</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request, getToken, healthApi, requestSubscriptionMessage } from '../../utils/api'

interface DogProfile {
  id: string
  name: string
  gender?: string
  breedName?: string
  birthday: string
  currentWeightKg?: number
}

interface VaccineRecord {
  id: string
  vaccineName: string
  vaccinationDate: string
  nextDueDate?: string
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
}

interface CheckupRecord {
  id: string
  checkupType: string
  checkupDate: string
  weightKg: number
}

interface MedicalRecord {
  id: string
  diagnosis: string
  visitDate: string
  status: 'TREATING' | 'RECOVERED' | 'CHRONIC'
}

interface AllergyRecord {
  id: string
  allergen: string
  discoveryDate: string
  severity: 'MILD' | 'MODERATE' | 'SEVERE'
}

interface HealthSummary {
  vaccines: number
  checkups: number
  medicalRecords: number
  allergies: number
}

// 数据
const dogs = ref<DogProfile[]>([])
const selectedDog = ref<DogProfile | null>(null)
const selectedDogIndex = ref<number>(-1)

const vaccines = ref<VaccineRecord[]>([])
const checkups = ref<CheckupRecord[]>([])
const medicalRecords = ref<MedicalRecord[]>([])
const allergies = ref<AllergyRecord[]>([])

// 健康档案汇总
const healthSummary = computed<HealthSummary>(() => {
  return {
    vaccines: vaccines.value.length,
    checkups: checkups.value.length,
    medicalRecords: medicalRecords.value.length,
    allergies: allergies.value.length
  }
})

// 是否有任何记录
const hasAnyRecords = computed(() => {
  return vaccines.value.length > 0 ||
         checkups.value.length > 0 ||
         medicalRecords.value.length > 0 ||
         allergies.value.length > 0
})

// 即将到期的疫苗提醒
const upcomingVaccine = computed(() => {
  const today = new Date()
  const upcoming = vaccines.value.find(v => {
    if (!v.nextDueDate) return false
    const dueDate = new Date(v.nextDueDate)
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntilDue <= 30 // 30天内到期
  })

  if (!upcoming) return null

  const dueDate = new Date(upcoming.nextDueDate!)
  const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let alertClass = 'alert-normal'
  let alertText = ''

  if (daysUntilDue < 0) {
    alertClass = 'alert-urgent'
    alertText = `已过期${Math.abs(daysUntilDue)}天`
  } else if (daysUntilDue <= 7) {
    alertClass = 'alert-urgent'
    alertText = `还有${daysUntilDue}天`
  } else {
    alertClass = 'alert-warning'
    alertText = `还有${daysUntilDue}天`
  }

  return {
    ...upcoming,
    alertClass,
    alertText
  }
})

// 页面加载
onMounted(async () => {
  const token = getToken()
  if (!token) {
    uni.showModal({
      title: '提示',
      content: '请先登录后使用健康管理功能',
      showCancel: false,
      success: () => {
        uni.navigateTo({
          url: '/pages/login/index'
        })
      }
    })
    return
  }

  await loadDogs()
})

// 加载狗狗列表
async function loadDogs() {
  try {
    const res = await request({
      url: '/dogs',
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      dogs.value = Array.isArray(res.data) ? res.data : []
      console.info('[HealthManagement] Loaded dogs:', dogs.value.length)
    }
  } catch (err) {
    console.error('[HealthManagement] Failed to load dogs:', err)
    uni.showToast({
      title: '加载狗狗列表失败',
      icon: 'none'
    })
  }
}

// 显示狗狗选择器
function showDogPicker() {
  if (dogs.value.length === 0) {
    uni.showToast({
      title: '请先创建狗狗档案',
      icon: 'none'
    })
    return
  }

  const dogNames = dogs.value.map(d => d.name)

  uni.showActionSheet({
    itemList: dogNames,
    success: (res) => {
      selectDog(res.tapIndex)
    }
  })
}

// 选择狗狗
async function selectDog(index: number) {
  selectedDogIndex.value = index
  selectedDog.value = dogs.value[index]

  console.log('[HealthManagement] Selected dog:', selectedDog.value?.name)

  // 加载健康记录数据（暂时使用模拟数据，等后端API准备好后替换）
  await loadHealthRecords()
}

// 加载健康记录
async function loadHealthRecords() {
  if (!selectedDog.value) return

  try {
    // 并行加载所有健康记录
    const [vaccinesRes, checkupsRes, medicalRecordsRes, allergiesRes] = await Promise.all([
      healthApi.getVaccines(selectedDog.value.id),
      healthApi.getCheckups(selectedDog.value.id),
      healthApi.getMedicalRecords(selectedDog.value.id),
      healthApi.getAllergies(selectedDog.value.id)
    ])

    if (vaccinesRes.code === 0) {
      vaccines.value = vaccinesRes.data.records || []
    }

    if (checkupsRes.code === 0) {
      checkups.value = checkupsRes.data.records || []
    }

    if (medicalRecordsRes.code === 0) {
      medicalRecords.value = medicalRecordsRes.data.records || []
    }

    if (allergiesRes.code === 0) {
      allergies.value = allergiesRes.data.records || []
    }

    console.log('[HealthManagement] Health records loaded successfully')
  } catch (err) {
    console.error('[HealthManagement] Failed to load health records:', err)
    uni.showToast({
      title: '加载健康记录失败',
      icon: 'none'
    })
  }
}

// 计算年龄
function calculateAge(birthday: string): string {
  const birth = new Date(birthday)
  const now = new Date()
  const months = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 30))

  if (months < 12) {
    return `${months}个月`
  }
  const years = Math.floor(months / 12)
  return `${years}岁`
}

// 获取疫苗状态样式
function getVaccineStatusClass(vaccine: VaccineRecord): string {
  if (vaccine.status === 'OVERDUE') return 'status-overdue'
  if (vaccine.status === 'SCHEDULED') return 'status-scheduled'
  return 'status-completed'
}

// 获取疫苗状态文字
function getVaccineStatusText(vaccine: VaccineRecord): string {
  if (vaccine.status === 'OVERDUE') return '已过期'
  if (vaccine.status === 'SCHEDULED') return '待接种'
  return '已接种'
}

// 获取病历状态样式
function getMedicalStatusClass(status: string): string {
  if (status === 'TREATING') return 'status-treating'
  if (status === 'CHRONIC') return 'status-chronic'
  return 'status-recovered'
}

// 获取病历状态文字
function getMedicalStatusText(status: string): string {
  if (status === 'TREATING') return '治疗中'
  if (status === 'CHRONIC') return '慢性病'
  return '已痊愈'
}

// 获取过敏严重程度样式
function getAllergySeverityClass(severity: string): string {
  if (severity === 'SEVERE') return 'severity-severe'
  if (severity === 'MODERATE') return 'severity-moderate'
  return 'severity-mild'
}

// 获取过敏严重程度文字
function getAllergySeverityText(severity: string): string {
  if (severity === 'SEVERE') return '重度'
  if (severity === 'MODERATE') return '中度'
  return '轻度'
}

// 导航到疫苗列表
function goToVaccineList() {
  if (!selectedDog.value) return
  uni.navigateTo({
    url: `/pages/health-management/vaccines/list?dogId=${selectedDog.value.id}`
  })
}

// 导航到疫苗详情
function goToVaccineDetail(id: string) {
  if (!selectedDog.value) return
  uni.navigateTo({
    url: `/pages/health-management/vaccines/edit?dogId=${selectedDog.value.id}&id=${id}`
  })
}

// 导航到体检列表
function goToCheckupList() {
  if (!selectedDog.value) return
  uni.navigateTo({
    url: `/pages/health-management/checkups/list?dogId=${selectedDog.value.id}`
  })
}

// 导航到体检详情
function goToCheckupDetail(id: string) {
  if (!selectedDog.value) return
  uni.navigateTo({
    url: `/pages/health-management/checkups/edit?dogId=${selectedDog.value.id}&id=${id}`
  })
}

// 导航到病历列表
function goToMedicalRecordList() {
  if (!selectedDog.value) return
  uni.navigateTo({
    url: `/pages/health-management/medical-records/list?dogId=${selectedDog.value.id}`
  })
}

// 导航到病历详情
function goToMedicalRecordDetail(id: string) {
  if (!selectedDog.value) return
  uni.navigateTo({
    url: `/pages/health-management/medical-records/edit?dogId=${selectedDog.value.id}&id=${id}`
  })
}

// 导航到过敏列表
function goToAllergyList() {
  if (!selectedDog.value) return
  uni.navigateTo({
    url: `/pages/health-management/allergies/list?dogId=${selectedDog.value.id}`
  })
}

// 导航到过敏详情
function goToAllergyDetail(id: string) {
  if (!selectedDog.value) return
  uni.navigateTo({
    url: `/pages/health-management/allergies/edit?dogId=${selectedDog.value.id}&id=${id}`
  })
}

// 显示添加菜单
function showAddMenu() {
  const items = ['疫苗记录', '体检记录', '病历记录', '过敏记录']

  uni.showActionSheet({
    itemList: items,
    success: (res) => {
      if (!selectedDog.value) return

      switch (res.tapIndex) {
        case 0:
          // 疫苗记录
          uni.navigateTo({
            url: `/pages/health-management/vaccines/edit?dogId=${selectedDog.value.id}`
          })
          break
        case 1:
          // 体检记录
          uni.navigateTo({
            url: `/pages/health-management/checkups/edit?dogId=${selectedDog.value.id}`
          })
          break
        case 2:
          // 病历记录
          uni.navigateTo({
            url: `/pages/health-management/medical-records/edit?dogId=${selectedDog.value.id}`
          })
          break
        case 3:
          // 过敏记录
          uni.navigateTo({
            url: `/pages/health-management/allergies/edit?dogId=${selectedDog.value.id}`
          })
          break
      }
    }
  })
}

// 导出健康数据
async function exportHealthData() {
  if (!selectedDog.value) return

  uni.showModal({
    title: '导出健康数据',
    content: '导出后的数据可以分享给兽医，是否继续？',
    success: async (res) => {
      if (res.confirm) {
        try {
          uni.showLoading({ title: '导出中...' })

          const exportRes = await healthApi.exportHealthData(selectedDog.value.id)

          if (exportRes.code === 0) {
            // 将健康数据转换为文本格式
            const healthData = exportRes.data
            const text = formatHealthDataAsText(healthData)

            // 复制到剪贴板
            await uni.setClipboardData({
              data: text,
              success: () => {
                uni.hideLoading()
                uni.showModal({
                  title: '导出成功',
                  content: '健康数据已复制到剪贴板，您可以分享给兽医了',
                  showCancel: false,
                })
              },
              fail: () => {
                uni.hideLoading()
                uni.showToast({
                  title: '复制失败',
                  icon: 'none',
                })
              },
            })
          }
        } catch (err) {
          uni.hideLoading()
          console.error('[HealthManagement] Export failed:', err)
          uni.showToast({
            title: '导出失败',
            icon: 'none',
          })
        }
      }
    },
  })
}

// 格式化健康数据为文本
function formatHealthDataAsText(data: any): string {
  const lines: string[] = []

  lines.push(`=== ${data.dog?.name || '狗狗'} 健康档案 ===`)
  lines.push(`导出日期: ${new Date(data.exportDate).toLocaleString()}`)
  lines.push('')

  // 疫苗记录
  if (data.vaccines?.length > 0) {
    lines.push('【疫苗记录】')
    data.vaccines.forEach((v: any, i: number) => {
      lines.push(`${i + 1}. ${v.vaccineName}`)
      lines.push(`   接种日期: ${v.vaccinationDate}`)
      if (v.nextDueDate) lines.push(`   下次接种: ${v.nextDueDate}`)
      if (v.veterinarian) lines.push(`   兽医: ${v.veterinarian}`)
      lines.push('')
    })
  }

  // 体检记录
  if (data.checkups?.length > 0) {
    lines.push('【体检记录】')
    data.checkups.forEach((c: any, i: number) => {
      lines.push(`${i + 1}. ${c.checkupType}`)
      lines.push(`   体检日期: ${c.checkupDate}`)
      if (c.weightKg) lines.push(`   体重: ${c.weightKg}kg`)
      if (c.bcsScore) lines.push(`   BCS评分: ${c.bcsScore}`)
      if (c.findings) lines.push(`   检查发现: ${c.findings}`)
      lines.push('')
    })
  }

  // 病历记录
  if (data.medicalRecords?.length > 0) {
    lines.push('【病历记录】')
    data.medicalRecords.forEach((m: any, i: number) => {
      lines.push(`${i + 1}. ${m.diagnosis}`)
      lines.push(`   就诊日期: ${m.visitDate}`)
      lines.push(`   主诉: ${m.chiefComplaint}`)
      if (m.treatment) lines.push(`   治疗: ${m.treatment}`)
      if (m.medications?.length > 0) lines.push(`   用药: ${m.medications.join(', ')}`)
      lines.push('')
    })
  }

  // 过敏记录
  if (data.allergies?.length > 0) {
    lines.push('【过敏记录】')
    data.allergies.forEach((a: any, i: number) => {
      lines.push(`${i + 1}. ${a.allergen}`)
      lines.push(`   过敏类型: ${getAllergenTypeText(a.allergenType)}`)
      lines.push(`   发现日期: ${a.discoveryDate}`)
      lines.push(`   症状: ${a.symptoms}`)
      lines.push(`   严重程度: ${getSeverityText(a.severity)}`)
      lines.push('')
    })
  }

  lines.push('=== 导出自七号厨房 ===')

  return lines.join('\n')
}

function getAllergenTypeText(type: string): string {
  const map: Record<string, string> = {
    FOOD: '食物过敏',
    ENVIRONMENTAL: '环境过敏',
    MEDICATION: '药物过敏',
  }
  return map[type] || type
}

function getSeverityText(severity: string): string {
  const map: Record<string, string> = {
    MILD: '轻度',
    MODERATE: '中度',
    SEVERE: '重度',
  }
  return map[severity] || severity
}

// 订阅疫苗提醒
async function subscribeVaccineReminders() {
  if (!selectedDog.value || vaccines.value.length === 0) {
    uni.showToast({
      title: '暂无疫苗记录',
      icon: 'none',
    })
    return
  }

  try {
    // TODO: 替换为实际的模板ID
    const templateId = 'YOUR_VACCINE_TEMPLATE_ID'

    // 请求订阅消息权限
    const subscribed = await requestSubscriptionMessage(templateId)

    if (subscribed) {
      // 获取所有疫苗ID
      const vaccineIds = vaccines.value.map(v => v.id)

      const res = await healthApi.subscribeVaccineReminder(
        selectedDog.value.id,
        vaccineIds,
        7 // 提前7天提醒
      )

      if (res.code === 0) {
        uni.showModal({
          title: '订阅成功',
          content: `已为${res.data.subscribedCount}条疫苗记录设置到期提醒`,
          showCancel: false,
        })
      }
    }
  } catch (err) {
    console.error('[HealthManagement] Subscribe failed:', err)
    uni.showToast({
      title: '订阅失败',
      icon: 'none',
    })
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding: 20rpx;
  padding-bottom: 40rpx;
}

.section {
  background: white;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.section-more {
  display: flex;
  align-items: center;
  color: #999;
  font-size: 26rpx;
}

.arrow {
  margin-left: 4rpx;
  font-size: 28rpx;
}

/* 狗狗选择器 */
.dog-selector {
  margin-bottom: 20rpx;
}

.selector-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8f8f8;
  border: 1px solid #e0e0e0;
  border-radius: 8rpx;
  padding: 24rpx;
}

.selector-text {
  font-size: 28rpx;
  color: #333;
}

.selector-arrow {
  font-size: 24rpx;
  color: #999;
}

/* 狗狗信息卡片 */
.dog-info-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12rpx;
  padding: 24rpx;
  color: white;
}

.dog-name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.dog-name {
  font-size: 32rpx;
  font-weight: bold;
}

.dog-gender {
  font-size: 28rpx;
  font-weight: bold;
}

.dog-gender.male {
  color: #a0d8ff;
}

.dog-gender.female {
  color: #ffb3ba;
}

.dog-breed {
  font-size: 26rpx;
  opacity: 0.9;
  margin-bottom: 12rpx;
  display: block;
}

.dog-stats {
  display: flex;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.stat-text {
  font-size: 24rpx;
  opacity: 0.9;
}

/* 健康档案统计 */
.health-summary {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding-top: 20rpx;
  border-top: 1px solid rgba(255, 255, 255, 0.3);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-label {
  font-size: 26rpx;
  opacity: 0.9;
}

.summary-value {
  font-size: 32rpx;
  font-weight: bold;
}

/* 疫苗提醒 */
.alert-section {
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  border: none;
}

.alert-header {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 16rpx;
}

.alert-icon {
  font-size: 32rpx;
}

.alert-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.alert-card {
  background: white;
  border-radius: 8rpx;
  padding: 20rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.alert-vaccine-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.alert-date {
  font-size: 24rpx;
  font-weight: bold;
}

.alert-card.alert-urgent .alert-date {
  color: #d63031;
}

.alert-card.alert-warning .alert-date {
  color: #e17055;
}

.alert-card.alert-normal .alert-date {
  color: #00b894;
}

/* 记录列表 */
.record-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.record-item {
  background: #f8f8f8;
  border-radius: 8rpx;
  padding: 20rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.record-main {
  flex: 1;
}

.record-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 8rpx;
}

.record-date {
  font-size: 24rpx;
  color: #999;
}

.record-status,
.record-severity,
.record-weight {
  font-size: 24rpx;
  font-weight: bold;
  padding: 4rpx 12rpx;
  border-radius: 4rpx;
  flex-shrink: 0;
}

/* 疫苗状态 */
.status-completed {
  background: #e8f5e9;
  color: #27ae60;
}

.status-scheduled {
  background: #fff3e0;
  color: #ff9800;
}

.status-overdue {
  background: #ffebee;
  color: #e74c3c;
}

/* 病历状态 */
.status-recovered {
  background: #e8f5e9;
  color: #27ae60;
}

.status-treating {
  background: #e3f2fd;
  color: #2196f3;
}

.status-chronic {
  background: #f3e5f5;
  color: #9c27b0;
}

/* 过敏严重程度 */
.severity-mild {
  background: #e8f5e9;
  color: #27ae60;
}

.severity-moderate {
  background: #fff3e0;
  color: #ff9800;
}

.severity-severe {
  background: #ffebee;
  color: #e74c3c;
}

.record-weight {
  background: #f0f0f0;
  color: #666;
}

/* 底部操作按钮 */
.bottom-actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 20rpx;
}

.action-btn {
  width: 100%;
  height: 88rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.action-btn.secondary {
  background: white;
  color: #667eea;
  border: 2rpx solid #667eea;
}

.action-btn::after {
  border: none;
}

.btn-icon {
  font-size: 32rpx;
}

/* 空状态 */
.empty-records {
  background: white;
  border-radius: 12rpx;
  padding: 80rpx 40rpx;
  text-align: center;
  margin-top: 20rpx;
}

.empty-icon {
  font-size: 96rpx;
  margin-bottom: 24rpx;
}

.empty-title {
  display: block;
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 12rpx;
}

.empty-desc {
  display: block;
  font-size: 26rpx;
  color: #999;
  margin-bottom: 32rpx;
  line-height: 1.6;
}

.create-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 44rpx;
  padding: 20rpx 60rpx;
  font-size: 28rpx;
  font-weight: bold;
}

.create-btn::after {
  border: none;
}
</style>
