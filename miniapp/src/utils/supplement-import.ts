import { getBaseUrl } from './config'
import { getToken, request } from './api'

interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

type MiniappUser = {
  role?: string
  user?: {
    role?: string
  } | null
} | null | undefined

const SUPPLEMENT_IMPORT_DRAFTS_PATH = '/recipe-designer/supplement-import-drafts'

function parseStoredUser(value: unknown): MiniappUser {
  if (!value) {
    return null
  }

  if (typeof value !== 'string') {
    return value as MiniappUser
  }

  try {
    return JSON.parse(value) as MiniappUser
  } catch {
    return null
  }
}

function getUserRole(user: MiniappUser): string {
  return String(user?.role || user?.user?.role || '').toUpperCase()
}

export function isAdminUser(user: MiniappUser): boolean {
  return getUserRole(user) === 'ADMIN'
}

export function getStoredMiniappUser(): MiniappUser {
  try {
    return parseStoredUser(uni.getStorageSync('user')) ||
      parseStoredUser(uni.getStorageSync('userInfo'))
  } catch {
    return null
  }
}

export function canShowSupplementImportEntry(
  user: MiniappUser = getStoredMiniappUser(),
): boolean {
  return isAdminUser(user)
}

export function buildSupplementImportUploadUrl(baseUrl = getBaseUrl()): string {
  return `${baseUrl.replace(/\/$/, '')}${SUPPLEMENT_IMPORT_DRAFTS_PATH}/images`
}

function normalizeUploadData<T>(response: ApiResponse<T | T[]>): T {
  const data = response.data
  return (Array.isArray(data) ? data[0] : data) as T
}

export function uploadSupplementImportImage<T = any>(filePath: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const token = getToken()
    const header: Record<string, string> = {}

    if (token) {
      header.Authorization = `Bearer ${token}`
    }

    uni.uploadFile({
      url: buildSupplementImportUploadUrl(),
      filePath,
      name: 'files',
      header,
      success: (res: any) => {
        try {
          const response = typeof res.data === 'string'
            ? JSON.parse(res.data)
            : res.data

          if (response?.code === 0) {
            resolve(normalizeUploadData(response))
            return
          }

          reject(new Error(response?.message || '上传失败'))
        } catch (error) {
          reject(error)
        }
      },
      fail: (error: any) => {
        reject(error)
      },
    })
  })
}

export const supplementImportApi = {
  createDraft(data: any) {
    return request({
      url: SUPPLEMENT_IMPORT_DRAFTS_PATH,
      method: 'POST',
      data,
    })
  },

  getDraft(draftId: string) {
    return request({
      url: `${SUPPLEMENT_IMPORT_DRAFTS_PATH}/${draftId}`,
      method: 'GET',
    })
  },

  updateDraft(draftId: string, data: any) {
    return request({
      url: `${SUPPLEMENT_IMPORT_DRAFTS_PATH}/${draftId}`,
      method: 'PUT',
      data,
    })
  },

  confirmDraft(draftId: string) {
    return request({
      url: `${SUPPLEMENT_IMPORT_DRAFTS_PATH}/${draftId}/confirm`,
      method: 'POST',
    })
  },
}
