export const DEVTOOLS_BASE_URL = 'http://127.0.0.1:3011/api/v1'
export const LAN_DEBUG_BASE_URL = 'http://192.168.31.43:3011/api/v1'
const LEGACY_DEV_PORTS = new Set(['3001', '3004'])

export function migrateLegacyDevBaseUrl(
  value: string | null | undefined,
): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) {
    return null
  }

  try {
    const url = new URL(trimmed)
    const isLegacyLocalHost =
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      LEGACY_DEV_PORTS.has(url.port)
    const isLegacyLanHost =
      url.hostname === '192.168.31.43' && LEGACY_DEV_PORTS.has(url.port)

    if (!isLegacyLocalHost && !isLegacyLanHost) {
      return trimmed
    }

    url.hostname = isLegacyLocalHost ? '127.0.0.1' : url.hostname
    url.port = '3011'
    url.pathname = '/api/v1'
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return trimmed
  }
}
