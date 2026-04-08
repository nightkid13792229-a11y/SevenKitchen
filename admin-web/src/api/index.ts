import axios from 'axios'
import type {
  InternalAxiosRequestConfig,
  AxiosRequestConfig,
  AxiosResponse
} from 'axios'
import { ElMessage } from 'element-plus'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

// Create axios instance
const http = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  },
  paramsSerializer: {
    serialize: (params) => {
      const parts: string[] = []
      Object.keys(params).forEach(key => {
        const value = params[key]
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            // Serialize arrays as multiple same-key parameters: status=PAID&status=IN_PRODUCTION
            value.forEach(v => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`))
          } else {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          }
        }
      })
      return parts.join('&')
    }
  }
})

// Request interceptor
http.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Priority 1: Use Bearer token if available
    const token = localStorage.getItem('admin_token')
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`
    }

    // Priority 2: Fallback to X-Customer-Id (backward compatibility)
    if (!token && config.headers) {
      config.headers['X-Customer-Id'] = 'admin-system'
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor - extract data directly
http.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    // Handle 204 No Content (successful DELETE, etc.)
    if (response.status === 204) {
      return null
    }

    const res = response.data

    if (res.code === 0) {
      return res.data
    } else {
      ElMessage.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message || '请求失败'))
    }
  },
  (error) => {
    // Don't show error message for 401 (already handled by auth interceptor)
    if (error.response?.status !== 401) {
      ElMessage.error(error.response?.data?.message || error.message || '网络错误')
    }

    if (error.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录')
      localStorage.removeItem('admin_token')
      window.location.href = '/login'
    }

    return Promise.reject(error)
  }
)

type RequestConfig = AxiosRequestConfig

const api = {
  request<T = any>(config: RequestConfig): Promise<T> {
    return http.request<any, T>(config)
  },
  get<T = any>(url: string, config?: RequestConfig): Promise<T> {
    return http.get<any, T>(url, config)
  },
  post<T = any>(url: string, data?: any, config?: RequestConfig): Promise<T> {
    return http.post<any, T>(url, data, config)
  },
  put<T = any>(url: string, data?: any, config?: RequestConfig): Promise<T> {
    return http.put<any, T>(url, data, config)
  },
  patch<T = any>(url: string, data?: any, config?: RequestConfig): Promise<T> {
    return http.patch<any, T>(url, data, config)
  },
  delete<T = any>(url: string, config?: RequestConfig): Promise<T> {
    return http.delete<any, T>(url, config)
  }
}

// Export API methods with proper typing
// Note: Response interceptor already extracts data, so we don't need .then(res => res.data)
export const authApi = {
  login: (username: string, password: string): Promise<{ token: string; username: string }> =>
    api.post('/auth/login', { username, password })
}

export const dashboardApi = {
  getStats: (): Promise<any> =>
    api.get('/admin/stats')
}

export const recipeApi = {
  list: (): Promise<any[]> =>
    api.get('/recipes'),
  getDetail: (id: string): Promise<any> =>
    api.get(`/recipes/${id}`)
}

// Re-export order API
export { orderApi } from './orders'

export const inventoryApi = {
  list: (): Promise<any[]> =>
    api.get('/admin/ingredients'),
  overview: (): Promise<any[]> =>
    api.get('/admin/inventory'),
  ledger: (params?: { ingredientId?: string; limit?: number }): Promise<any[]> =>
    api.get('/admin/inventory/ledger', { params }),
  createAdjustment: (data: any): Promise<any> =>
    api.post('/admin/inventory/adjustments', data),
  stocktakes: (params?: { limit?: number }): Promise<any[]> =>
    api.get('/admin/inventory/stocktakes', { params }),
  createStocktake: (data: any): Promise<any> =>
    api.post('/admin/inventory/stocktakes', data),
  applyStocktake: (id: string): Promise<any> =>
    api.post(`/admin/inventory/stocktakes/${id}/apply`),
  updatePrice: (id: string, price: number): Promise<any> =>
    api.put(`/admin/ingredients/${id}/price`, { currentPricePerPurchaseUnit: price })
}

export const productionApi = {
  createBatch: (data: any): Promise<any> =>
    api.post('/admin/production-batches', data),
  getBatches: (): Promise<any[]> =>
    api.get('/admin/production-batches'),
  getBatchDetail: (id: string): Promise<any> =>
    api.get(`/admin/production-batches/${id}`)
}

// Re-export breed API
export { breedApi } from './breeds'

// Re-export ingredient tag API
export { ingredientTagApi } from './ingredientTags'

// Re-export user API
export { userApi } from './users'

// Re-export purchasing API
export { purchasingApi } from './purchasing'

export default api
