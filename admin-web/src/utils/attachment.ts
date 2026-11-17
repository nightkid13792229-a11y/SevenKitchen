/**
 * 报告附件的展示类型（2026-11-17）
 *
 * 过敏检测报告/体检报告允许上传 PDF、Word（后端 `health-upload` 白名单），
 * 但后台原来一律用图片预览组件渲染 —— PDF 打开是空白，员工以为"没传上来"。
 *
 * 敏感附件走媒体代理时 URL 是 `/api/v1/media/sensitive/<token>?ext=pdf`：
 * 路径里没有扩展名，扩展名只在 query 上。所以判断必须**先看 ext 参数**，
 * 再看路径后缀。
 */

export type AttachmentKind = 'image' | 'pdf' | 'doc' | 'file'

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'heic',
  'heif',
])

function readExtension(url: string): string {
  const value = String(url || '').trim()
  if (!value) return ''

  // 优先 ext 参数：媒体代理地址的扩展名只在这里
  const queryIndex = value.indexOf('?')
  if (queryIndex >= 0) {
    const query = value.slice(queryIndex + 1)
    for (const pair of query.split('&')) {
      const [rawKey, rawValue] = pair.split('=')
      if (decodeURIComponent(rawKey || '').toLowerCase() === 'ext') {
        return decodeURIComponent(rawValue || '').toLowerCase()
      }
    }
  }

  const path = (queryIndex >= 0 ? value.slice(0, queryIndex) : value).replace(
    /#.*$/,
    '',
  )
  const lastSegment = path.split('/').pop() || ''
  const dotIndex = lastSegment.lastIndexOf('.')
  if (dotIndex <= 0) return ''
  return lastSegment.slice(dotIndex + 1).toLowerCase()
}

export function attachmentKind(url: unknown): AttachmentKind {
  const ext = readExtension(String(url || ''))
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'doc' || ext === 'docx') return 'doc'
  return 'file'
}

/** 能不能用图片预览组件；PDF / Word / 未知类型一律走"打开原件"链接 */
export function isImageAttachment(url: unknown): boolean {
  return attachmentKind(url) === 'image'
}

/** 附件类型 → 中文（按钮文案用） */
export function attachmentKindLabel(kind: AttachmentKind): string {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'doc') return 'Word'
  if (kind === 'image') return '图片'
  return '文件'
}

/**
 * 给"打开原件"用的文件名。
 *
 * 媒体代理地址是随机 token，直接显示 URL 对员工没意义，
 * 所以统一显示成「过敏报告.pdf」这种可读名字。
 */
export function attachmentFileName(
  url: unknown,
  fallbackBase = '报告原件',
): string {
  const value = String(url || '').trim()
  const ext = readExtension(value)
  const kind = attachmentKind(value)
  if (kind !== 'image' && kind !== 'pdf' && kind !== 'doc') {
    return ext ? `${fallbackBase}.${ext}` : fallbackBase
  }
  return ext ? `${fallbackBase}.${ext}` : fallbackBase
}
