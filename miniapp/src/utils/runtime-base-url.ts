export const DEVTOOLS_BASE_URL = 'http://127.0.0.1:3011/api/v1'
export const LAN_DEBUG_BASE_URL = 'http://192.168.31.64:3011/api/v1'
const LEGACY_DEV_PORTS = new Set(['3001', '3004'])
const LEGACY_LAN_HOSTS = new Set(['192.168.31.43'])

function applyLanDebugBase(url: URL): string {
  const lanUrl = new URL(LAN_DEBUG_BASE_URL)
  url.hostname = lanUrl.hostname
  url.port = lanUrl.port
  url.pathname = lanUrl.pathname
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

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
    const isLegacyLanHost = LEGACY_LAN_HOSTS.has(url.hostname)

    if (!isLegacyLocalHost && !isLegacyLanHost) {
      return trimmed
    }

    if (isLegacyLanHost) {
      return applyLanDebugBase(url)
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
