/**
 * 化验数值的拆解（2026-10-04）。
 *
 * 老板实测提的三个排版问题：
 *   · "血细胞形态学检查这一块的排版，为什么会强行分割成两列？"
 *   · "并且将浓度一拆为二？"（`1.47 x` 和 `10^12/L` 被折到两行）
 *   · "并且字体大小也有区别呢？"
 *
 * 根因：形态学/分类这类报告，**一行并排三组数**（个数 / 浓度 / 百分比），
 * 却被当成"一个项目 + 一个数值"塞进左右两栏 —— 长数值只能折行，还把单位拆开。
 * 这里把一行里的几组数认出来，交给展示层按组排版；纯函数，方便单独测。
 */

export interface LabValuePart {
  /** 这一组数的标签（个数 / 浓度 / 百分比 / 参考值…）；没有标签时为空串 */
  label: string
  /** 这一组的值（已经做过"数字与单位不拆行"处理） */
  text: string
}

/**
 * 能出现在一行里的数值标签。
 *
 * 只认这几个词，不去猜别的 —— 猜错会把一个完整的数值从中间切开，
 * 那比不拆还糟（家长看到的是被腰斩的数字）。
 */
const LAB_VALUE_LABELS = [
  '个数',
  '浓度',
  '百分比',
  '参考范围',
  '参考值',
  '检测结果',
  '结果',
  '单位',
]

/**
 * 「1.47 x 10^12/L」中间的空格换成不换行空格。
 *
 * 老板原话"将浓度一拆为二"，就是 `1.47 x` 与 `10^12/L` 被折到了两行。
 * 数字和单位必须粘在一起才读得懂。
 */
export function glueLabUnits(text: string): string {
  return String(text || '')
    // 先收拢空白，再粘单位 —— 顺序反了的话，`\s+` 会把刚插进去的不换行空格
    // （\u00A0 也属于 \s）又换回普通空格，等于白做
    .replace(/\s+/g, ' ')
    .replace(/\s*[x×]\s*10\^/g, '\u00A0×10^')
    .trim()
}

/**
 * 把「个数:2292个/56张 浓度:1.47 x 10^12/L 百分比:26.62」
 * 拆成 [{个数,2292个/56张},{浓度,1.47 ×10^12/L},{百分比,26.62}]。
 *
 * 只认出一组（或一组都认不出）时返回空数组 —— 那种行走原来的两栏排版。
 */
export function splitLabValueParts(value: string): LabValuePart[] {
  const text = String(value || '').trim()
  if (!text) return []

  // 标签后面可能带冒号（个数:10个/377张），也可能是空格（个数 10个/377张）
  const pattern = new RegExp(`(${LAB_VALUE_LABELS.join('|')})\\s*[:：]?\\s*`, 'g')
  const hits: { label: string; start: number; end: number }[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    hits.push({ label: match[1], start: match.index, end: match.index + match[0].length })
  }

  if (hits.length < 2) return []

  const parts: LabValuePart[] = []

  // 第一个标签之前还有内容（例如「白细胞 个数 17个/HPF」里的"白细胞"）就并进第一组
  if (hits[0].start > 0) {
    parts.push({ label: '', text: text.slice(0, hits[0].start).trim() })
  }

  for (const [index, hit] of hits.entries()) {
    const next = hits[index + 1]
    const body = text.slice(hit.end, next ? next.start : text.length).trim()
    parts.push({ label: hit.label, text: body })
  }

  return parts
    .map(part => ({ label: part.label, text: glueLabUnits(part.text) }))
    .filter(part => part.label || part.text)
}
