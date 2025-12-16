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
  } catch (err) {
    console.error('Failed to clear token from storage:', err)
  }
}

// Login function that can be called from App.vue
let loginPromise: Promise<string> | null = null

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
        const response = res.data as ApiResponse<T>
        
        // Handle 401 Unauthorized - retry with fresh login
        if (res.statusCode === 401 && !options.retryOn401) {
          console.log('401 Unauthorized, attempting to re-login and retry')
          clearToken()
          
          // Attempt to re-login and retry the request once
          console.log('→ Attempting re-login after 401...')
          performLogin().then((newToken) => {
            console.log('✓ Re-login successful, retrying original request')
            // Retry the original request with new token
            request<T>({
              ...options,
              retryOn401: true // Prevent infinite retry loops
            }).then(resolve).catch(reject)
          }).catch((loginErr) => {
            console.error('✗ Re-login failed:', loginErr)
            // Show error but don't block - user can still navigate
            uni.showToast({
              title: normalizeMsg('登录已过期，部分功能可能不可用'),
              icon: 'none',
              duration: 3000
            })
            // Reject gracefully - caller can handle
            reject(new Error('Authentication failed'))
          })
          return
        }
        
        // Handle unified response format
        if (response.code !== 0) {
          // Show error toast (non-blocking)
          const errorMsg = normalizeMsg(response.message || '请求失败')
          console.warn('API error:', response.code, errorMsg)
          
          uni.showToast({
            title: errorMsg,
            icon: 'none',
            duration: 2000
          })
          
          // Reject but don't crash - caller can handle gracefully
          reject(new Error(errorMsg))
          return
        }
        
        resolve(response)
      },
      fail: (err: any) => {
        console.error('Request failed:', err)
        
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
        uni.showToast({
          title: normalizeMsg(errorTitle),
          icon: 'none',
          duration: 2000
        })
        
        // Reject with error but don't crash - caller handles gracefully
        reject(err)
      }
    })
  })
}


