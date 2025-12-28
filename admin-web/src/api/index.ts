import axios from 'axios'
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import { ElMessage } from 'element-plus'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

// Create axios instance
const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // For admin system, use X-Customer-Id instead of Bearer token
    // This allows admin to access all customer data
    if (config.headers) {
      config.headers['X-Customer-Id'] = 'admin-system'
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor - extract data directly
api.interceptors.response.use(
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
    if (error.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录')
      localStorage.removeItem('admin_token')
      window.location.href = '/login'
    } else {
      ElMessage.error(error.message || '网络错误')
    }
    return Promise.reject(error)
  }
)

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

export const orderApi = {
  list: (params?: any): Promise<any[]> =>
    api.get('/orders', { params }),
  getDetail: (id: string): Promise<any> =>
    api.get(`/orders/${id}`),
  cancel: (id: string, reason: string): Promise<any> =>
    api.post(`/admin/orders/${id}/cancel`, { reason }),
  complete: (id: string): Promise<any> =>
    api.post(`/admin/orders/${id}/complete`)
}

export const inventoryApi = {
  list: (): Promise<any[]> =>
    api.get('/admin/ingredients'),
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

export default api
