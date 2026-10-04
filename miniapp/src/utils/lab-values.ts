/**
 * 化验数值的解析（2026-10-04）。
 *
 * 老板实测提的三个排版问题：
 *   · "血细胞形态学检查这一块的排版，为什么会强行分割成两列？"
 *   · "并且将浓度一拆为二？"
 *   · "并且字体大小也有区别呢？"
 *
 * 根因不在排版，在**切分**：形态学/分类这类报告一行并排三组数
 * （个数 / 浓度 / 百分比），原来却按"第一个数字前面就是项目名"来切 ——
 * 于是切在了 `10^12/L` 前面：
 *
 *   项目名 = 正常红细胞 个数:2292个/56张 浓度:1.47 x     ← 浓度被腰斩
 *   数值   = 10^12/L 百分比:26.62
 *
 * 然后被塞进左右两栏，就成了老板截图里那个样子。
 *
 * 这里把整行的解析收成纯函数，方便单独测（组件里只留展示）。
 */

export interface LabValuePart {
  /** 这一组数的标签（个数 / 浓度 / 百分比 / 参考值…）；没有标签时为空串 */
  label: string
  /** 这一组的值（已做"数字与单位不拆行"处理） */
  text: string
}

export interface LabRow {
  name: string
  value: string
  flag: string
  /** 数值被拆成的几组「标签 + 数值」；只认出一组时为空数组 */
  parts: LabValuePart[]
}

export interface LabBlock {
  title: string
  rows: LabRow[]
  /** 这份报告一共几项 */
  total: number
}

/**
 * 能在一行里当"数值标签"的词。
 *
 * 只认这几个，不去猜别的 —— 猜错会把一个完整的数值从中间切开，
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
 * 能用来分「项目名 | 数值」的词。
 *
 * 比上面窄：`结果`/`单位` 这种太容易出现在项目名里（"…百分比(NEU%)"），
 * 拿它们切名字会把项目名切坏。
 */
const LAB_NAME_BOUNDARY_LABELS = ['个数', '浓度', '百分比', '参考范围', '参考值']

/**
 * 「1.47 x 10^12/L」中间的空格换成不换行空格。
 *
 * 老板原话"将浓度一拆为二"，就是 `1.47 x` 与 `10^12/L` 被折到了两行。
 * 数字和单位必须粘在一起才读得懂。
 */
export function glueLabUnits(text: string): string {
  return String(text || '')
    // 先收拢空白，再粘单位 —— 顺序反了的话 `\s+` 会把刚插进去的不换行空格
    // （\u00A0 也属于 \s）又换回普通空格，等于白做
    .replace(/\s+/g, ' ')
    .replace(/\s*[x×]\s*10\^/g, '\u00A0×10^')
    .trim()
}

/**
 * 「项目名」到哪结束：第一个**真的带数值**的标签出现在哪。
 *
 * 两个必要条件，缺一不可（2026-10-04 实测踩过的坑）：
 *   1. 标签前面是空白或行首 —— `中性分叶核粒细胞百分比(NEU%)` 里的"百分比"
 *      前面是"粒细胞"，那是项目名的一部分，不是数值标签；
 *   2. 标签后面（允许一个冒号/空格）**紧跟数值** —— `百分比(NEU%)` 后面是
 *      "("，那也不是数值标签。
 *
 * @returns 项目名结束的下标；找不到返回 -1
 */
export function findLabNameBoundary(text: string): number {
  const source = String(text || '')
  let boundary = -1

  for (const label of LAB_NAME_BOUNDARY_LABELS) {
    const pattern = new RegExp(`(^|\\s)${label}\\s*[:：]?\\s*(?=[<>≤≥]?[-+]?[\\d.])`, 'g')
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source)) !== null) {
      // 切在标签本身：把前面那个空白留给项目名
      const index = match.index + match[1].length
      if (boundary < 0 || index < boundary) {
        boundary = index
      }
      break
    }
  }

  return boundary
}

/**
 * 把「个数:2292个/56张 浓度:1.47 x 10^12/L 百分比:26.62」
 * 拆成 [{个数,2292个/56张},{浓度,1.47 ×10^12/L},{百分比,26.62}]。
 *
 * 只认出一组（或一组都认不出）时返回空数组 —— 那种行走普通的两栏排版。
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

/**
 * 报告名判定。
 *
 * 老板 2026-10-04 问："白细胞分类的统计项，为什么总数是 57 项呢？"
 *
 * 原因：原来按"整行有数字就不是报告名"来判，于是**名字里带数字的报告名**
 * （「血液形态学检测报告·九分类52项」「血常规（五分类52项）」）被判成了数值行 ——
 * 它自己变成一个"项目"，后面那份报告几十项又全并进了上一份报告里，
 * 于是「白细胞分类」这一块的项数被撑到五六十，两个报告也糊成一块。
 *
 * 正确的判据不是"有没有数字"，而是"**有没有一个独立的数值**"：
 *   · 「血液形态学检测报告·九分类52项」→ 数字长在词里面（52项），没有独立数值 → 报告名
 *   · 「1.白细胞数(WBC) 8.78 10^9/L」   → 空格后面跟着 8.78        → 数值行
 */
export function isLabTitleLine(line: string): boolean {
  const text = String(line || '').trim()
  if (!text) return false
  if (text.length > 30) return false

  // 空格后面直接跟数字（可带正负号/不等号）：这是"项目 数值"的形状
  if (/\s(?=[<>≤≥]?[-+]?[\d.])/.test(text)) return false

  // 带数值标签（个数:… / 浓度:… / 参考值 …）的也是数值行
  if (findLabNameBoundary(text) >= 0) return false

  return true
}

/** 把「项目 数值 单位（偏高）」拆成一段 */
export function parseLabRow(line: string): LabRow {
  const text = String(line || '').trim()
  const flagMatch = text.match(/[（(](偏高|偏低|高|低|正常)[）)]\s*$/)
  const flag = flagMatch ? flagMatch[1] : ''
  const body = flagMatch ? text.slice(0, flagMatch.index).trim() : text

  // ① 先按"数值标签"找项目名到哪结束
  const boundary = findLabNameBoundary(body)
  if (boundary > 0) {
    const name = body.slice(0, boundary).trim()
    const value = body.slice(boundary).trim()
    if (name && value) {
      return { name, value: glueLabUnits(value), flag, parts: splitLabValueParts(value) }
    }
  }

  // ② 老路：项目名与数值之间用空白分隔，第一个"数字/符号开头"的片段起算数值。
  //    排除 `10^9/L` 这种"单位的后半截"被当成数值起点。
  const valueMatch = body.match(/\s(?=[<>≤≥]?[-+]?[\d.])(?!10\^)/)
  if (!valueMatch || valueMatch.index === undefined) {
    return { name: '', value: body, flag, parts: [] }
  }

  const name = body.slice(0, valueMatch.index).trim()
  const value = body.slice(valueMatch.index).trim()
  if (!name) {
    return { name: '', value: body, flag, parts: [] }
  }

  return { name, value: glueLabUnits(value), flag, parts: splitLabValueParts(value) }
}

/**
 * 把整段化验数据解析成分块结构（报告名 + 逐项）。
 *
 * @param text AI 抄下来的原文（逐项一行，每张单子以报告名开头）
 */
export function parseLabBlocks(text: string): LabBlock[] {
  const lines = String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const result: LabBlock[] = []
  let current: LabBlock = { title: '', rows: [], total: 0 }

  for (const line of lines) {
    if (isLabTitleLine(line)) {
      if (current.title || current.rows.length > 0) {
        result.push({ ...current, total: current.rows.length })
      }
      current = { title: line, rows: [], total: 0 }
      continue
    }
    current.rows.push(parseLabRow(line))
  }

  if (current.title || current.rows.length > 0) {
    result.push({ ...current, total: current.rows.length })
  }

  return result
}
