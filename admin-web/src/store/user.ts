import { defineStore } from 'pinia'
import { ref } from 'vue'

function loadStoredUserInfo() {
  const raw = localStorage.getItem('admin_user')
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem('admin_user')
    return null
  }
}

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(localStorage.getItem('admin_token'))
  const userInfo = ref<any>(loadStoredUserInfo())

  function setToken(newToken: string) {
    token.value = newToken
    localStorage.setItem('admin_token', newToken)
  }

  function clearToken() {
    token.value = null
    userInfo.value = null
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
  }

  function setUserInfo(info: any) {
    userInfo.value = info
    localStorage.setItem('admin_user', JSON.stringify(info))
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
