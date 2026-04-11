// utils/api.ts
import { getBaseUrl } from './config'

// UUID validation regex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Normalize error message for display in toast
 * Handles arrays, objects, and strings
 */
function normalizeMsg(msg: any): string {
  if (!msg) return 'Unknown error'
  if (Array.isArray(msg)) return msg.join('; ')
  if (typeof msg === 'object') {
    if (msg.message) return String(msg.message)
    return JSON.stringify(msg)
  }
  return String(msg)
}

/**
 * Normalize a value to UUID string
 * Handles arrays, objects, and strings
 */
export function normalizeToUuid(value: any, fieldName: string): string {
  let normalized: string
  
  if (Array.isArray(value)) {
    normalized = value[0]
  } else if (value && typeof value === 'object' && value.id) {
    normalized = value.id
  } else {
    normalized = value
  }
  
  const str = String(normalized || '').trim()
  
  if (!str) {
    throw new Error(`Missing ${fieldName}`)
  }
  
  if (!UUID_RE.test(str)) {
    throw new Error(`Invalid ${fieldName} format: ${str}`)
  }
  
  return str
}

interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  header?: Record<string, string>
  retryOn401?: boolean // Internal flag to prevent infinite retry loops
  quiet?: boolean
  suppressErrorToast?: boolean
}

// Token storage helpers - single source of truth
export function getToken(): string | null {
  try {
    return uni.getStorageSync('token') || null
  } catch (err) {
    console.error('Failed to get token from storage:', err)
    return null
  }
}

export function setToken(token: string): void {
  try {
    uni.setStorageSync('token', token)
  } catch (err) {
    console.error('Failed to save token to storage:', err)
  }
}

export function clearToken(): void {
  try {
    uni.removeStorageSync('token')
    // Reset token ready state when token is cleared
    resetTokenReady()
    // Clear dogs cache to prevent showing user data after logout
    uni.removeStorageSync('dogs_cache')
    console.info('[Auth] Cleared token and dogs cache')
  } catch (err) {
    console.error('Failed to clear token from storage:', err)
  }
}

// Login function that can be called from App.vue
let loginPromise: Promise<string> | null = null

// Token ready Promise - used by pages to wait for auto-login completion
let tokenReadyResolve: (() => void) | null = null
let tokenReadyPromise: Promise<void> | null = null
let isTokenReady = false // Cache token ready state to avoid creating duplicate promises

/**
 * Wait for token to be ready (either exists or auto-login completes)
 * Returns immediately if token already exists, otherwise waits for auto-login
 * This prevents 401 errors from race conditions between page load and auto-login
 */
export function waitForToken(): Promise<void> {
  // If token already exists, return immediately (most common case)
  if (getToken()) {
    return Promise.resolve()
  }

  // If token is already marked ready (from previous login), return immediately
  if (isTokenReady) {
    return Promise.resolve()
  }

  // Create token ready promise if not exists
  if (!tokenReadyPromise) {
    tokenReadyPromise = new Promise<void>((resolve) => {
      tokenReadyResolve = resolve
    })
  }

  return tokenReadyPromise
}

/**
 * Mark token as ready (called by App.vue after successful login)
 * Resolves all pending waitForToken() calls
 */
export function markTokenReady(): void {
  isTokenReady = true
  if (tokenReadyResolve) {
    tokenReadyResolve()
    tokenReadyResolve = null // Clear resolve function
  }
  tokenReadyPromise = null // Clear promise (next call will create new one if needed)
}

/**
 * Reset token ready state (called when token is cleared/401 occurs)
 * Next waitForToken() call will wait for new login
 */
export function resetTokenReady(): void {
  isTokenReady = false
  tokenReadyPromise = null
  tokenReadyResolve = null
}

export function performLogin(customerId: string = 'mvp-user-001'): Promise<string> {
  // Prevent concurrent login requests
  if (loginPromise) {
    return loginPromise
  }

  loginPromise = new Promise((resolve, reject) => {
    const baseUrl = getBaseUrl()
    uni.request({
      url: `${baseUrl}/auth/login`,
      method: 'POST',
      data: { customerId },
      header: {
        'Content-Type': 'application/json'
      },
      success: (res: any) => {
        const response = res.data as ApiResponse<{ token: string }>
        if (response.code === 0 && response.data?.token) {
          setToken(response.data.token)
          console.log('Login successful, token stored')
          resolve(response.data.token)
        } else {
          const error = new Error(response.message || '登录失败')
          reject(error)
        }
      },
      fail: (err: any) => {
        console.error('Login request failed:', err)
        reject(new Error('网络错误，登录失败'))
      },
      complete: () => {
        loginPromise = null
      }
    })
  })

  return loginPromise
}

export function request<T = any>(options: RequestOptions): Promise<ApiResponse<T>> {
  return new Promise((resolve, reject) => {
    // Get token from storage only (single source of truth)
    const token = getToken()
    
    // Build full URL (use runtime config from storage)
    const baseUrl = getBaseUrl()
    const url = options.url.startsWith('http') 
      ? options.url 
      : `${baseUrl}${options.url.startsWith('/') ? options.url : '/' + options.url}`
    
    // Prepare headers
    const header: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.header || {})
    }
    
    // Add Authorization header if token exists
    if (token) {
      header['Authorization'] = `Bearer ${token}`
    }
    
    uni.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      header,
      success: (res: any) => {
        // Handle 204 No Content (DELETE responses)
        if (res.statusCode === 204) {
          resolve({ code: 0, message: 'Success', data: null } as ApiResponse<T>)
          return
        }

        // Check if response data exists
        if (!res.data) {
          const errorMsg = `服务器响应格式错误`
          if (!options.quiet) {
            console.error('[API] No response data - res.keys:', Object.keys(res), 'statusCode:', res.statusCode)
          }
          if (!options.suppressErrorToast) {
            uni.showToast({
              title: normalizeMsg(errorMsg),
              icon: 'none',
              duration: 2000,
            })
          }
          reject(new Error(errorMsg))
          return
        }
        const response = res.data as ApiResponse<T>

        // Handle 401 Unauthorized - don't auto-login with test account
        if (res.statusCode === 401) {
          if (!options.quiet) {
            console.warn('401 Unauthorized - User needs to login')
          }
          clearToken()
          resetTokenReady()

          // Show toast提示用户登录
          if (!options.suppressErrorToast) {
            uni.showToast({
              title: '请先登录',
              icon: 'none',
              duration: 2000,
            })
          }

          // Reject with auth error - caller can handle (e.g., redirect to login)
          reject(new Error('Authentication required'))
          return
        }

        // Handle unified response format
        if (response.code !== 0) {
          // Show error toast (non-blocking)
          const errorMsg = normalizeMsg(response.message || '请求失败')
          if (!options.quiet) {
            console.warn('API error:', response.code, errorMsg)
          }

          if (!options.suppressErrorToast) {
            uni.showToast({
              title: errorMsg,
              icon: 'none',
              duration: 2000,
            })
          }

          // Reject but don't crash - caller can handle gracefully
          reject(new Error(errorMsg))
          return
        }

        resolve(response)
      },
      fail: (err: any) => {
        if (!options.quiet) {
          console.error('Request failed:', err)
        }
        
        // Determine error type for better user feedback
        const errMsg = err?.errMsg || String(err) || ''
        let errorTitle = '网络错误'
        
        if (errMsg.includes('timeout') || errMsg.includes('超时')) {
          errorTitle = '请求超时，请检查网络'
        } else if (errMsg.includes('CONNECTION') || errMsg.includes('连接')) {
          errorTitle = '无法连接到服务器'
        } else if (errMsg.includes('fail')) {
          errorTitle = '请求失败，请稍后重试'
        }
        
        // Show non-blocking toast - app continues to function
        if (!options.suppressErrorToast) {
          uni.showToast({
            title: normalizeMsg(errorTitle),
            icon: 'none',
            duration: 2000,
          })
        }
        
        // Reject with error but don't crash - caller handles gracefully
        reject(err)
      }
    })
  })
}

// Auth API
export const authApi = {
  /**
   * 微信授权登录
   */
  wechatLogin: (code: string, userInfo: { nickname?: string; avatarUrl?: string }) => {
    return request<{
      token: string;
      userId: string;
      role: string;
      isNewUser: boolean;
      user: {
        id: string;
        nickname?: string;
        avatarUrl?: string;
        role: string;
      };
    }>({
      url: '/auth/wechat-login',
      method: 'POST',
      data: { code, userInfo },
    });
  },

  /**
   * 发送短信验证码
   */
  sendSmsCode: (phone: string) => {
    return request<{
      success: boolean;
      expireIn?: number;
    }>({
      url: '/auth/send-sms',
      method: 'POST',
      data: { phone },
    });
  },

  /**
   * 手机号验证码登录（员工登录）
   */
  phoneLogin: (phone: string, code: string) => {
    return request<{
      token: string;
      userId: string;
      role: string;
      user: {
        id: string;
        phone: string;
        nickname?: string;
        role: string;
      };
    }>({
      url: '/auth/phone-login',
      method: 'POST',
      data: { phone, code },
    });
  },
};

// Health Records API
export const healthApi = {
  // ==================== Vaccine Records ====================

  /**
   * 获取狗狗的所有疫苗记录
   */
  getVaccines: (dogId: string) => {
    return request<{
      total: number;
      records: Array<{
        id: string;
        dogId: string;
        vaccineName: string;
        vaccinationDate: string;
        nextDueDate: string | null;
        notes: string | null;
        status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE';
        createdAt: string;
        updatedAt: string;
      }>;
    }>({
      url: `/dogs/${dogId}/vaccines`,
      method: 'GET',
    });
  },

  /**
   * 获取单个疫苗记录（用于编辑页面）
   */
  getVaccine: (dogId: string, vaccineId: string) => {
    return request<{
      id: string;
      dogId: string;
      vaccineName: string;
      vaccinationDate: string;
      nextDueDate: string | null;
      notes: string | null;
      status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE';
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/vaccines/${vaccineId}`,
      method: 'GET',
    });
  },

  /**
   * 获取即将到期的疫苗
   */
  getUpcomingVaccines: (dogId: string, days: number = 30) => {
    return request<{
      total: number;
      records: Array<{
        id: string;
        dogId: string;
        vaccineName: string;
        vaccinationDate: string;
        nextDueDate: string | null;
        notes: string | null;
        status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE';
        createdAt: string;
        updatedAt: string;
      }>;
    }>({
      url: `/dogs/${dogId}/vaccines/upcoming?days=${days}`,
      method: 'GET',
    });
  },

  /**
   * 创建疫苗记录
   */
  createVaccine: (dogId: string, data: {
    vaccineName: string;
    vaccinationDate: string;
    nextDueDate?: string;
    notes?: string;
    status?: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE';
  }) => {
    return request<{
      id: string;
      dogId: string;
      vaccineName: string;
      vaccinationDate: string;
      nextDueDate: string | null;
      notes: string | null;
      status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE';
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/vaccines`,
      method: 'POST',
      data,
    });
  },

  /**
   * 更新疫苗记录
   */
  updateVaccine: (dogId: string, vaccineId: string, data: {
    vaccineName?: string;
    vaccinationDate?: string;
    nextDueDate?: string;
    notes?: string;
    status?: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE';
  }) => {
    return request<{
      id: string;
      dogId: string;
      vaccineName: string;
      vaccinationDate: string;
      nextDueDate: string | null;
      notes: string | null;
      status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE';
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/vaccines/${vaccineId}`,
      method: 'PUT',
      data,
    });
  },

  /**
   * 删除疫苗记录
   */
  deleteVaccine: (dogId: string, vaccineId: string) => {
    return request<null>({
      url: `/dogs/${dogId}/vaccines/${vaccineId}`,
      method: 'DELETE',
    });
  },

  // ==================== Checkup Records ====================

  /**
   * 获取狗狗的所有体检记录
   */
  getCheckups: (dogId: string) => {
    return request<{
      total: number;
      records: Array<{
        id: string;
        dogId: string;
        checkupType: string;
        checkupDate: string;
        findings: string | null;
        recommendations: string | null;
        veterinarian: string | null;
        attachments: string[];
        createdAt: string;
        updatedAt: string;
      }>;
    }>({
      url: `/dogs/${dogId}/checkups`,
      method: 'GET',
    });
  },

  /**
   * 获取单个体检记录（用于编辑页面）
   */
  getCheckup: (dogId: string, checkupId: string) => {
    return request<{
      id: string;
      dogId: string;
      checkupType: string;
      checkupDate: string;
      findings: string | null;
      recommendations: string | null;
      veterinarian: string | null;
      attachments: string[];
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/checkups/${checkupId}`,
      method: 'GET',
    });
  },

  /**
   * 创建体检记录
   */
  createCheckup: (dogId: string, data: {
    checkupType: string;
    checkupDate: string;
    findings?: string;
    recommendations?: string;
    veterinarian?: string;
    attachments?: string[];
  }) => {
    return request<{
      id: string;
      dogId: string;
      checkupType: string;
      checkupDate: string;
      findings: string | null;
      recommendations: string | null;
      veterinarian: string | null;
      attachments: string[];
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/checkups`,
      method: 'POST',
      data,
    });
  },

  /**
   * 更新体检记录
   */
  updateCheckup: (dogId: string, checkupId: string, data: {
    checkupType?: string;
    checkupDate?: string;
    findings?: string;
    recommendations?: string;
    veterinarian?: string;
    attachments?: string[];
  }) => {
    return request<{
      id: string;
      dogId: string;
      checkupType: string;
      checkupDate: string;
      findings: string | null;
      recommendations: string | null;
      veterinarian: string | null;
      attachments: string[];
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/checkups/${checkupId}`,
      method: 'PUT',
      data,
    });
  },

  /**
   * 删除体检记录
   */
  deleteCheckup: (dogId: string, checkupId: string) => {
    return request<null>({
      url: `/dogs/${dogId}/checkups/${checkupId}`,
      method: 'DELETE',
    });
  },

  // ==================== Medical Records ====================

  /**
   * 获取狗狗的所有病历记录
   */
  getMedicalRecords: (dogId: string, status?: string) => {
    const url = status
      ? `/dogs/${dogId}/medical-records?status=${status}`
      : `/dogs/${dogId}/medical-records`;

    return request<{
      total: number;
      records: Array<{
        id: string;
        dogId: string;
        visitDate: string;
        chiefComplaint: string;
        diagnosis: string;
        treatment: string | null;
        medications: string[];
        status: 'TREATING' | 'RECOVERED' | 'CHRONIC';
        followUpDate: string | null;
        veterinarian: string | null;
        notes: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
    }>({
      url,
      method: 'GET',
    });
  },

  /**
   * 获取单个病历记录（用于编辑页面）
   */
  getMedicalRecord: (dogId: string, recordId: string) => {
    return request<{
      id: string;
      dogId: string;
      visitDate: string;
      chiefComplaint: string;
      diagnosis: string;
      treatment: string | null;
      medications: string[];
      status: 'TREATING' | 'RECOVERED' | 'CHRONIC';
      followUpDate: string | null;
      veterinarian: string | null;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/medical-records/${recordId}`,
      method: 'GET',
    });
  },

  /**
   * 创建病历记录
   */
  createMedicalRecord: (dogId: string, data: {
    visitDate: string;
    chiefComplaint: string;
    diagnosis: string;
    treatment?: string;
    medications?: string[];
    status?: 'TREATING' | 'RECOVERED' | 'CHRONIC';
    followUpDate?: string;
    veterinarian?: string;
    notes?: string;
  }) => {
    return request<{
      id: string;
      dogId: string;
      visitDate: string;
      chiefComplaint: string;
      diagnosis: string;
      treatment: string | null;
      medications: string[];
      status: 'TREATING' | 'RECOVERED' | 'CHRONIC';
      followUpDate: string | null;
      veterinarian: string | null;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/medical-records`,
      method: 'POST',
      data,
    });
  },

  /**
   * 更新病历记录
   */
  updateMedicalRecord: (dogId: string, recordId: string, data: {
    visitDate?: string;
    chiefComplaint?: string;
    diagnosis?: string;
    treatment?: string;
    medications?: string[];
    status?: 'TREATING' | 'RECOVERED' | 'CHRONIC';
    followUpDate?: string;
    veterinarian?: string;
    notes?: string;
  }) => {
    return request<{
      id: string;
      dogId: string;
      visitDate: string;
      chiefComplaint: string;
      diagnosis: string;
      treatment: string | null;
      medications: string[];
      status: 'TREATING' | 'RECOVERED' | 'CHRONIC';
      followUpDate: string | null;
      veterinarian: string | null;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/medical-records/${recordId}`,
      method: 'PUT',
      data,
    });
  },

  /**
   * 删除病历记录
   */
  deleteMedicalRecord: (dogId: string, recordId: string) => {
    return request<null>({
      url: `/dogs/${dogId}/medical-records/${recordId}`,
      method: 'DELETE',
    });
  },

  // ==================== Allergy Records ====================

  /**
   * 获取狗狗的所有过敏记录
   */
  getAllergies: (dogId: string) => {
    return request<{
      total: number;
      records: Array<{
        id: string;
        dogId: string;
        allergen: string;
        allergenType: 'FOOD' | 'ENVIRONMENTAL' | 'MEDICATION';
        discoveryDate: string;
        symptoms: string;
        severity: 'MILD' | 'MODERATE' | 'SEVERE';
        confirmedBy: 'VET' | 'OWNER';
        treatment: string | null;
        notes: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
    }>({
      url: `/dogs/${dogId}/allergies`,
      method: 'GET',
    });
  },

  /**
   * 获取单个过敏记录（用于编辑页面）
   */
  getAllergy: (dogId: string, allergyId: string) => {
    return request<{
      id: string;
      dogId: string;
      allergen: string;
      allergenType: 'FOOD' | 'ENVIRONMENTAL' | 'MEDICATION';
      discoveryDate: string;
      symptoms: string;
      severity: 'MILD' | 'MODERATE' | 'SEVERE';
      confirmedBy: 'VET' | 'OWNER';
      treatment: string | null;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/allergies/${allergyId}`,
      method: 'GET',
    });
  },

  /**
   * 创建过敏记录
   */
  createAllergy: (dogId: string, data: {
    allergen: string;
    allergenType: 'FOOD' | 'ENVIRONMENTAL' | 'MEDICATION';
    discoveryDate: string;
    symptoms: string;
    severity?: 'MILD' | 'MODERATE' | 'SEVERE';
    confirmedBy?: 'VET' | 'OWNER';
    treatment?: string;
    notes?: string;
  }) => {
    return request<{
      id: string;
      dogId: string;
      allergen: string;
      allergenType: 'FOOD' | 'ENVIRONMENTAL' | 'MEDICATION';
      discoveryDate: string;
      symptoms: string;
      severity: 'MILD' | 'MODERATE' | 'SEVERE';
      confirmedBy: 'VET' | 'OWNER';
      treatment: string | null;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/allergies`,
      method: 'POST',
      data,
    });
  },

  /**
   * 更新过敏记录
   */
  updateAllergy: (dogId: string, allergyId: string, data: {
    allergen?: string;
    allergenType?: 'FOOD' | 'ENVIRONMENTAL' | 'MEDICATION';
    discoveryDate?: string;
    symptoms?: string;
    severity?: 'MILD' | 'MODERATE' | 'SEVERE';
    confirmedBy?: 'VET' | 'OWNER';
    treatment?: string;
    notes?: string;
  }) => {
    return request<{
      id: string;
      dogId: string;
      allergen: string;
      allergenType: 'FOOD' | 'ENVIRONMENTAL' | 'MEDICATION';
      discoveryDate: string;
      symptoms: string;
      severity: 'MILD' | 'MODERATE' | 'SEVERE';
      confirmedBy: 'VET' | 'OWNER';
      treatment: string | null;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
    }>({
      url: `/dogs/${dogId}/allergies/${allergyId}`,
      method: 'PUT',
      data,
    });
  },

  /**
   * 删除过敏记录
   */
  deleteAllergy: (dogId: string, allergyId: string) => {
    return request<null>({
      url: `/dogs/${dogId}/allergies/${allergyId}`,
      method: 'DELETE',
    });
  },

  // ==================== Health Summary ====================

  /**
   * 获取健康数据汇总（用于导出）
   */
  exportHealthData: (dogId: string) => {
    return request<{
      dog: {
        id: string;
        name: string;
        breed: string;
        birthday: string;
        gender: string;
      };
      vaccines: Array<any>;
      checkups: Array<any>;
      medicalRecords: Array<any>;
      allergies: Array<any>;
      exportDate: string;
    }>({
      url: `/dogs/${dogId}/health/export`,
      method: 'GET',
    });
  },

  /**
   * 订阅疫苗到期提醒
   */
  subscribeVaccineReminder: (dogId: string, vaccineIds: string[], daysBefore?: number) => {
    return request<{
      subscribedCount: number;
    }>({
      url: `/dogs/${dogId}/vaccines/subscribe-reminder`,
      method: 'POST',
      data: { vaccineIds, daysBefore: daysBefore || 7 },
    });
  },

  /**
   * 发送即将到期疫苗通知
   */
  notifyUpcomingVaccines: (dogId: string) => {
    return request<{
      notifiedCount: number;
    }>({
      url: `/dogs/${dogId}/vaccines/upcoming/notify`,
      method: 'GET',
    });
  },
};

/**
 * 上传健康记录图片到COS
 * @param filePath 本地文件路径
 */
export function uploadHealthImage(filePath: string): Promise<{ url: string; key: string }> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${getBaseUrl()}/health/upload-image`,
      filePath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${getToken()}`,
      },
      success: (uploadRes: any) => {
        if (uploadRes.statusCode === 200 || uploadRes.statusCode === 201) {
          try {
            const response = JSON.parse(uploadRes.data)
            if (response.code === 0 && response.data) {
              resolve(response.data)
            } else {
              reject(new Error(response.message || '上传失败'))
            }
          } catch (err) {
            reject(new Error('解析响应失败'))
          }
        } else {
          reject(new Error(`上传失败: ${uploadRes.statusCode}`))
        }
      },
      fail: (err) => {
        console.error('[Upload] Upload failed:', err)
        reject(err)
      },
    })
  })
}

// ==================== WeChat Subscription Message ====================

/**
 * 请求订阅消息权限
 * @param templateId 模板ID
 * @param scene 订阅场景值
 */
export function requestSubscriptionMessage(templateId: string, scene: number = 1): Promise<boolean> {
  return new Promise((resolve) => {
    uni.requestSubscribeMessage({
      tmplIds: [templateId],
      scene,
      success: (res: any) => {
        console.log('[Subscription] Request success:', res)
        if (res[templateId] === 'accept') {
          resolve(true)
        } else if (res[templateId] === 'reject') {
          uni.showToast({
            title: '您已拒绝订阅消息',
            icon: 'none',
          })
          resolve(false)
        } else {
          // 用户点击了关闭或其他操作
          resolve(false)
        }
      },
      fail: (err: any) => {
        console.error('[Subscription] Request failed:', err)
        uni.showToast({
          title: '订阅失败',
          icon: 'none',
        })
        resolve(false)
      },
    })
  })
}

// ==================== Favorites API ====================

/**
 * 收藏食谱
 * @param recipeId 食谱ID
 */
export function addFavorite(recipeId: string): Promise<void> {
  return request({
    url: `/favorites/${recipeId}`,
    method: 'POST',
  }).then((res) => {
    if (res.code !== 0) {
      throw new Error(res.message || '收藏失败')
    }
  })
}

/**
 * 取消收藏食谱
 * @param recipeId 食谱ID
 */
export function removeFavorite(recipeId: string): Promise<void> {
  return request({
    url: `/favorites/${recipeId}`,
    method: 'DELETE',
  }).then((res) => {
    if (res.code !== 0) {
      throw new Error(res.message || '取消收藏失败')
    }
  })
}

/**
 * 检查是否收藏食谱
 * @param recipeId 食谱ID
 */
export function checkFavorite(recipeId: string): Promise<{ isFavorite: boolean }> {
  return request({
    url: `/favorites/check/${recipeId}`,
    method: 'GET',
  }).then((res) => {
    if (res.code !== 0) {
      throw new Error(res.message || '检查失败')
    }
    return res.data
  })
}

/**
 * 上报食谱浏览量
 * @param recipeId 食谱ID
 * @param shareToken 非公开食谱分享令牌
 */
export function trackRecipeView(recipeId: string, shareToken?: string): Promise<void> {
  return request({
    url: `/recipes/${recipeId}/view`,
    method: 'POST',
    data: shareToken ? { shareToken } : undefined,
  }).then((res) => {
    if (res.code !== 0) {
      throw new Error(res.message || '浏览上报失败')
    }
  })
}

/**
 * 获取收藏列表
 * @param page 页码
 * @param pageSize 每页数量
 */
export function getFavorites(page: number = 1, pageSize: number = 20): Promise<{
  list: Array<{
    id: string
    recipeId: string
    recipe: any | null
    createdAt: string
  }>
  total: number
  page: number
  pageSize: number
  totalPages: number
}> {
  return request({
    url: '/favorites',
    method: 'GET',
    data: { page, pageSize },
  }).then((res) => {
    if (res.code !== 0) {
      throw new Error(res.message || '获取收藏列表失败')
    }
    return res.data
  })
}

// ==================== Staff Recipes API ====================

/**
 * 获取员工可见的所有食谱列表（含非公开状态）
 * @param status 按状态筛选（可选）
 */
export function getStaffRecipes(status?: string): Promise<Array<{
  id: string
  version: number
  name: string
  status: string
  coverImageUrl?: string
  applicableLifeStages: string[]
  targetHealthTags: string[]
  createdAt: string
}>> {
  const data: any = {}
  if (status) data.status = status
  return request({
    url: '/recipes/staff/all',
    method: 'GET',
    data,
  }).then((res) => {
    if (res.code !== 0) {
      throw new Error(res.message || '获取食谱列表失败')
    }
    return res.data
  })
}

/**
 * 为食谱生成分享令牌
 * @param recipeId 食谱ID
 */
export function createRecipeShareToken(recipeId: string): Promise<{
  token: string
  expiresAt: string
}> {
  return request({
    url: `/recipes/${recipeId}/share-token`,
    method: 'POST',
  }).then((res) => {
    if (res.code !== 0) {
      throw new Error(res.message || '生成分享令牌失败')
    }
    return res.data
  })
}

// ==================== Reviews API ====================

export const reviewApi = {
  /**
   * 检查评价权限
   */
  checkEligibility: (recipeId: string) => {
    return request<{
      eligible: boolean
      source: 'PURCHASED' | 'DIY' | null
    }>({
      url: `/recipes/${recipeId}/reviews/eligibility`,
      method: 'GET',
    }).then((res) => {
      if (res.code !== 0) {
        throw new Error(res.message || '检查评价权限失败')
      }
      return res.data
    })
  },

  /**
   * 获取食谱评论列表
   */
  getReviews: (recipeId: string, page: number = 1, pageSize: number = 10) => {
    return request<{
      avgRating: { ease: number; value: number; taste: number }
      totalCount: number
      list: Array<{
        id: string
        userId: string
        recipeId: string
        ratingEase: number
        ratingValue: number
        ratingTaste: number
        content: string
        photos: string[]
        createdAt: string
        updatedAt: string
        user: {
          id: string
          nickname: string | null
          avatarUrl: string | null
        }
      }>
      page: number
      pageSize: number
      totalPages: number
    }>({
      url: `/recipes/${recipeId}/reviews`,
      method: 'GET',
      data: { page, pageSize },
    }).then((res) => {
      if (res.code !== 0) {
        throw new Error(res.message || '获取评论失败')
      }
      return res.data
    })
  },

  /**
   * 发表评论
   */
  createReview: (recipeId: string, data: {
    ratingEase: number
    ratingValue: number
    ratingTaste: number
    content: string
    photos?: string[]
  }) => {
    return request({
      url: `/recipes/${recipeId}/reviews`,
      method: 'POST',
      data,
    }).then((res) => {
      if (res.code !== 0) {
        throw new Error(res.message || '发表评论失败')
      }
      return res.data
    })
  },

  /**
   * 删除评论
   */
  deleteReview: (reviewId: string) => {
    return request({
      url: `/reviews/${reviewId}`,
      method: 'DELETE',
    }).then((res) => {
      if (res.code !== 0) {
        throw new Error(res.message || '删除评论失败')
      }
    })
  },

  /**
   * 上传评论图片
   */
  uploadReviewPhoto: (filePath: string): Promise<{ url: string; key: string }> => {
    return new Promise((resolve, reject) => {
      const token = getToken()
      uni.uploadFile({
        url: `${getBaseUrl()}/reviews/upload-photos`,
        filePath,
        name: 'files',
        header: {
          'Authorization': `Bearer ${token}`,
        },
        success: (uploadRes: any) => {
          if (uploadRes.statusCode === 200 || uploadRes.statusCode === 201) {
            try {
              const response = JSON.parse(uploadRes.data)
              if (response.code === 0 && response.data?.photos?.length > 0) {
                resolve(response.data.photos[0])
              } else {
                reject(new Error(response.message || '上传失败'))
              }
            } catch (e) {
              reject(new Error('解析响应失败'))
            }
          } else {
            reject(new Error(`上传失败: ${uploadRes.statusCode}`))
          }
        },
        fail: (err) => {
          console.error('[ReviewUpload] Upload failed:', err)
          reject(err)
        },
      })
    })
  },
}

// ==================== Feedback ====================

/**
 * 上传反馈图片
 */
export function uploadFeedbackImage(filePath: string): Promise<{ url: string; key: string }> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${getBaseUrl()}/feedback/upload-image`,
      filePath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${getToken()}`,
      },
      success: (uploadRes: any) => {
        if (uploadRes.statusCode === 200 || uploadRes.statusCode === 201) {
          try {
            const response = JSON.parse(uploadRes.data)
            if (response.code === 0 && response.data) {
              resolve(response.data)
            } else {
              reject(new Error(response.message || '上传失败'))
            }
          } catch (err) {
            reject(new Error('解析响应失败'))
          }
        } else {
          reject(new Error(`上传失败: ${uploadRes.statusCode}`))
        }
      },
      fail: (err) => {
        console.error('[FeedbackUpload] Upload failed:', err)
        reject(err)
      },
    })
  })
}

/**
 * 删除反馈图片（提交前移除）
 */
export function deleteFeedbackImage(key: string): Promise<void> {
  return request({
    url: '/feedback/upload-image',
    method: 'DELETE',
    data: { key },
  }).then(() => {})
}

/**
 * 提交反馈
 */
export function createFeedback(data: {
  type: string
  content: string
  imageUrls?: string[]
  imageKeys?: string[]
}): Promise<any> {
  return request({
    url: '/feedback',
    method: 'POST',
    data,
  }).then(res => res.data)
}

/**
 * 获取反馈列表
 */
export function getFeedbackList(params: { page?: number; pageSize?: number } = {}): Promise<{
  items: any[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}> {
  return request({
    url: '/feedback',
    method: 'GET',
    data: params,
  }).then(res => res.data)
}

/**
 * 删除反馈
 */
export function deleteFeedback(id: string): Promise<void> {
  return request({
    url: `/feedback/${id}`,
    method: 'DELETE',
  }).then(() => {})
}

/**
 * 创建反馈回复
 */
export function createFeedbackReply(
  feedbackId: string,
  data: { content: string; replyToId?: string; imageUrls?: string[]; imageKeys?: string[] },
): Promise<any> {
  return request({
    url: `/feedback/${feedbackId}/replies`,
    method: 'POST',
    data,
  }).then((res) => res.data)
}

/**
 * 获取反馈回复列表
 */
export function getFeedbackReplies(feedbackId: string): Promise<any[]> {
  return request({
    url: `/feedback/${feedbackId}/replies`,
    method: 'GET',
  }).then((res) => res.data)
}

/**
 * 删除反馈回复
 */
export function deleteFeedbackReply(
  feedbackId: string,
  replyId: string,
): Promise<void> {
  return request({
    url: `/feedback/${feedbackId}/replies/${replyId}`,
    method: 'DELETE',
  }).then(() => {})
}
