export const DEFAULT_USER_AVATAR_SRC = '/static/logo.png'

export function resolveUserAvatarSrc(avatarUrl?: string | null): string {
  const normalized = typeof avatarUrl === 'string' ? avatarUrl.trim() : ''
  return normalized || DEFAULT_USER_AVATAR_SRC
}

export function buildUserAvatarUploadUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  return `${normalizedBaseUrl}/users/me/avatar`
}

export function parseAvatarUploadResponse(uploadRes: {
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
