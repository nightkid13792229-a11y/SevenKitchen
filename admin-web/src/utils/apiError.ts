/**
 * 从接口错误里取出**后端返回的具体原因**。
 *
 * 背景（2026-10-04 第 8 条）：页面里到处是"加载失败 / 操作失败 / 提交失败"
 * 这种笼统提示，而后端其实已经回了具体原因，例如
 * 「该订单还没确认收款，不能交付」「这道食谱不属于该订单的顾客 / 狗狗」。
 * 员工只能靠猜，或者来问开发。
 *
 * 调用姿势：
 *   ElMessage.error(getApiErrorMessage(error, '交付失败'))
 * 只有确实拿不到原因（网络断了、axios 的 "Request failed with status code 400"）
 * 才退回兜底文案。
 */

/** 这些是 HTTP/网络层的通用话术，说了等于没说，一律换成业务兜底文案 */
const GENERIC_MESSAGES = [
  /^Request failed with status code \d+$/i,
  /^Network Error$/i,
  /^timeout of \d+ms exceeded$/i,
  /^Bad Request$/i,
  /^Unauthorized$/i,
  /^Forbidden$/i,
  /^Not Found$/i,
  /^Internal Server Error$/i,
  /^Request aborted$/i,
]

function pickMessage(value: unknown): string {
  if (Array.isArray(value)) {
    // NestJS 的校验错误可能是字符串数组，取第一条（多是"名称不能为空"这类具体原因）
    for (const item of value) {
      const text = pickMessage(item)
      if (text) return text
    }
    return ''
  }
  if (typeof value === 'string') return value.trim()
  return ''
}

function readMessage(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error.trim()

  const raw = error as {
    message?: unknown
    response?: { data?: { message?: unknown; error?: unknown } }
  }

  // 优先用后端报文：业务错误在 body 的 message 里，axios 的 message 只是状态码
  const fromBody =
    pickMessage(raw.response?.data?.message) || pickMessage(raw.response?.data?.error)
  if (fromBody) return fromBody

  return pickMessage(raw.message)
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const message = readMessage(error)
  if (!message) return fallback
  if (GENERIC_MESSAGES.some((pattern) => pattern.test(message))) return fallback
  return message
}

/**
 * 是否用户主动取消（ElMessageBox 取消时 reject 的是 'cancel' / 'close'）。
 * 页面用它避免"点了取消却弹一个红色报错"。
 */
export function isUserCancel(error: unknown): boolean {
  return error === 'cancel' || error === 'close'
}

/**
 * axios 拦截器是否已经弹过这条错误的提示。
 *
 * 拦截器对所有失败请求都会 `ElMessage.error`（后端有 message 就用后端原话），
 * 页面 catch 再弹一次就是同一句话出现两遍。`api/index.ts` 在 reject 前打了标记。
 */
export function wasApiErrorToasted(error: unknown): boolean {
  return Boolean((error as { __apiErrorToasted?: boolean } | null)?.__apiErrorToasted)
}

/**
 * 判断页面还要不要再补一条提示。
 *
 *   · 不是接口错误（本地抛的错、上传返回体异常）→ 要补，否则用户什么都看不到；
 *   · 接口错误但**后端没给原因**（断网、500 通用话术）→ 要补，
 *     这时页面的"加载订单详情失败"比 "Network Error" 有用；
 *   · 接口错误且后端给了具体原因 → 不补，拦截器已经原话提示过了。
 */
export function shouldToastApiError(error: unknown, fallback: string): boolean {
  if (isUserCancel(error)) return false
  if (!wasApiErrorToasted(error)) return true
  return getApiErrorMessage(error, fallback) === fallback
}

/**
 * 页面统一的失败提示：显示后端返回的具体原因，且不重复弹同一句话。
 *
 * 调用姿势：
 *   catch (error) { toastApiError(error, '交付失败') }
 */
export function toastApiError(
  error: unknown,
  fallback: string,
  toast: (message: string) => void,
): void {
  if (!shouldToastApiError(error, fallback)) return
  toast(getApiErrorMessage(error, fallback))
}
