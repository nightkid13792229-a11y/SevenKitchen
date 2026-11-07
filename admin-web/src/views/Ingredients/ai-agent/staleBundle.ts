/**
 * 旧页面检测（2026-11-08）。
 *
 * 为什么要有：后台是「打开一次、一直不刷新」的用法——有人从下午开着页面，
 * 到半夜后端已经上了新的写入门禁，页面却还按老契约发请求。结果后端报一句
 * 「采购商品的「一箱几件」（件数）必须是正整数」，而页面上根本没有那块表单。
 *
 * 判据只看一件事：**最新发布的 index.html 指向的入口脚本，和当前页面加载的
 * 是不是同一个文件**。构建产物带内容哈希，发一次新版就换一个文件名，所以
 * 这个名字一变，就说明当前页面是被替换掉的那一版。
 *
 * 拿不到（断网、接口异常、解析不出）一律当「不是旧页面」：宁可放过，
 * 也不能因为拉不到 index.html 就把人挡在写入之外。
 */

const SCRIPT_TAG_RE = /<script\b[^>]*>/gi
const SRC_ATTR_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const TYPE_MODULE_RE = /\btype\s*=\s*(?:"module"|'module'|module)\b/i

/** 从 index.html 里取出入口脚本地址；取不到返回 null。 */
export function extractEntryScriptSrc(html: string): string | null {
  if (typeof html !== 'string' || html.length === 0) {
    return null
  }

  let fallback: string | null = null
  for (const tag of html.match(SCRIPT_TAG_RE) ?? []) {
    const matched = SRC_ATTR_RE.exec(tag)
    const src = (matched?.[1] ?? matched?.[2] ?? '').trim()
    if (!src) continue

    // 入口永远是那个 type="module" 的脚本；其它脚本只在没找到时兜底。
    if (TYPE_MODULE_RE.test(tag)) {
      return src
    }
    if (!fallback) {
      fallback = src
    }
  }

  return fallback
}

/** 只留路径：域名、查询串、描点都不参与比较（同一份文件带了什么参数都一样）。 */
export function normalizeEntryPath(src: string | null | undefined): string | null {
  if (!src) return null

  const stripped = String(src).trim().replace(/[?#].*$/, '')
  if (!stripped) return null

  let path: string
  try {
    path = new URL(stripped, 'http://bundle.invalid').pathname
  } catch {
    path = stripped
  }
  if (!path) return null

  return path.startsWith('/') ? path : `/${path}`
}

/**
 * 当前页面是不是旧版本。
 *
 * `loadedEntrySrc` 是**页面自己**加载的那个入口脚本（`document` 里那个
 * `type="module"` 的 `<script src>`），`html` 是刚拉到的最新 `index.html`。
 */
export function isStaleBundle(
  loadedEntrySrc: string | null | undefined,
  html: string,
): boolean {
  const loaded = normalizeEntryPath(loadedEntrySrc)
  const latest = normalizeEntryPath(extractEntryScriptSrc(html))

  if (!loaded || !latest) {
    return false
  }

  return loaded !== latest
}

/**
 * 入口脚本所在目录的上一级，就是 index.html 的位置。
 *
 * 不能拿 `document.baseURI` 拼 `index.html`：SPA 路由下 baseURI 是当前页地址
 * （如 `/ingredients/ai-agent`），拼出来会去拉一个根本不存在的路径。
 */
export function indexHtmlPathOf(
  entrySrc: string | null | undefined,
): string | null {
  const entry = normalizeEntryPath(entrySrc)
  if (!entry) return null

  const dir = entry.slice(0, entry.lastIndexOf('/'))
  if (!dir) return '/index.html'

  // 借助 URL 把 `..` 规范化掉（'/assets/../index.html' → '/index.html'）。
  return new URL(`${dir}/../index.html`, 'http://bundle.invalid').pathname
}

