/**
 * 把文案里的 `**加粗**` 解析成可直接渲染的分段（老板 2026-10-14 选定方案 B）。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────
 * 依据文案是在后端写的，里面用 markdown 的 `**` 标出了**最关键的一句** ——
 * 比如"**一针核心疫苗即可**"。可小程序的 `<text>` 不认这种写法 ✗，
 * 于是星号**原样显示**在顾客面前 ✗：
 *
 *     依据   WSAVA 2024：26 周龄或更大、接种史不明的犬，
 *            **一针核心疫苗即可**提供足够保护     ← 星号露出来了
 *
 * 老板给了两个选项，他选了 B：**把关键那句真的加粗显示** ✓
 * （A 是"干脆去掉星号、变普通文字"。）
 *
 * ── 怎么用 ────────────────────────────────────────────────────
 * 模板里用**嵌套 `<text>`** 渲染（小程序支持内层单独设样式）：
 *
 *     <text>
 *       <text v-for="(seg, i) in parseBold(文案)" :key="i"
 *             :class="{ 'rich-bold': seg.bold }">{{ seg.text }}</text>
 *     </text>
 *
 * ⚠️ 后端**照旧保留 `**`** ✓ —— 它是"这里要突出"的标记，
 *    由界面决定怎么呈现（加粗 / 变色都行）✓。
 *    所以**不要**在后端把星号删掉，那会丢掉"哪句最重要"的信息 ✗。
 */
export interface RichSegment {
  text: string
  bold: boolean
}

/**
 * 切分 `**加粗**`。没有标记时返回**单段**（调用方不用特判）✓。
 *
 * 容错：
 *   · 落单的 `**`（只出现一次）→ 当普通文字 ✓，不吞字符
 *   · 空标记 `****` → 忽略 ✓
 */
export function parseBold(input: unknown): RichSegment[] {
  const text = String(input ?? '')
  if (!text.includes('**')) {
    return [{ text, bold: false }]
  }

  const out: RichSegment[] = []
  const re = /\*\*([^*]+)\*\*/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      out.push({ text: text.slice(last, match.index), bold: false })
    }
    out.push({ text: match[1], bold: true })
    last = match.index + match[0].length
  }

  if (last < text.length) {
    out.push({ text: text.slice(last), bold: false })
  }
  // 一段都没有（比如只有落单的 `**`）→ 原样返回，至少不丢字
  return out.length > 0 ? out : [{ text, bold: false }]
}
