export const DEFAULT_DOG_AVATAR_SRC = '/static/logo.png'

export function resolveDogAvatarSrc(avatarUrl?: string | null): string {
  const normalized = typeof avatarUrl === 'string' ? avatarUrl.trim() : ''
  return normalized || DEFAULT_DOG_AVATAR_SRC
}

export function buildDogAvatarUploadUrl(baseUrl: string, dogId: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  return `${normalizedBaseUrl}/dogs/${dogId}/avatar`
}

export function parseDogAvatarUploadResponse(uploadRes: {
  statusCode: number
  data: string | Record<string, any>
}): string {
  const payload =
    typeof uploadRes.data === 'string' ? JSON.parse(uploadRes.data) : uploadRes.data

  if (
    (uploadRes.statusCode === 200 || uploadRes.statusCode === 201) &&
    payload?.code === 0 &&
    payload?.data?.url
  ) {
    return payload.data.url
  }

  throw new Error(payload?.message || `上传失败: ${uploadRes.statusCode}`)
}

export function resolveDogAvatarUploadErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message.trim() : ''

  if (!rawMessage) {
    return '头像上传失败，请稍后再试'
  }

  if (
    rawMessage.includes('COS credentials not configured') ||
    rawMessage.includes('Failed to upload avatar') ||
    rawMessage.includes('Failed to upload image to COS')
  ) {
    return '头像上传功能暂未配置，请稍后再试'
  }

  return rawMessage
}
