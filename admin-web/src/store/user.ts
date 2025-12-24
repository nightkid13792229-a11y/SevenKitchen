import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(localStorage.getItem('admin_token'))
  const userInfo = ref<any>(null)

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
