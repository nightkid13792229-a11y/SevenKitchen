import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 从 JWT 令牌中解码载荷（不依赖第三方库），失败返回 null */
function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = decodeURIComponent(escape(atob(padded)))
    const payload = JSON.parse(json)
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

/** 刷新页面后从令牌恢复用户信息（角色等），避免登录态丢失导致权限误判 */
function restoreUserInfoFromToken(): Record<string, unknown> | null {
  const token = localStorage.getItem('admin_token')
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  return {
    userId: payload.userId ?? null,
    role: payload.role ?? null
  }
}

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(localStorage.getItem('admin_token'))
  const userInfo = ref<any>(restoreUserInfoFromToken())

  function setToken(newToken: string) {
    token.value = newToken
    localStorage.setItem('admin_token', newToken)
  }

  function clearToken() {
    token.value = null
    localStorage.removeItem('admin_token')
  }

  function setUserInfo(info: any) {
    userInfo.value = info
  }

  function isAuthenticated(): boolean {
    return !!token.value
  }

  return {
    token,
    userInfo,
    setToken,
    clearToken,
    setUserInfo,
    isAuthenticated
  }
})
