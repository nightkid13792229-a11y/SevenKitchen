import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * `<script setup>` 里访问了 `X.value`，但 X 在所在作用域链上解析不到。
 *
 * 为什么值得单独守：这类写法在编译期完全不报错 —— Vite/esbuild 只转译不做
 * 类型检查，构建照样成功；而回归测试断言的是源码文本，也发现不了。结果就是
 * 构建全绿、测试全绿，真机上跑到那一行才抛 `ReferenceError`。
 *
 * 真实案例（同一个会话里连中两次）：
 *   1. `home/index.vue` 调用了 `getLifeStageLabel()`，但从没 import 过 ——
 *      那条由 `missing-imports.regression.spec.ts` 负责。
 *   2. `diy-sheet/index.vue` 的 `effectiveCycleDays` 里写了 `mealsPerDay.value`，
 *      可本文件根本没有这个绑定（同名的局部变量在**另一个函数**里）。
 *      后果是「一键购买补剂」点了没有任何反应。
 *
 * 为什么不能简单查"全文件有没有声明过"：`mealsPerDay` 在文件里确实声明了，
 * 只是在别的作用域。也正因为如此，`option => option.value` 这类回调参数
 * 会被误判。所以这里必须做作用域分析。
 */

const IDENT = /[A-Za-z_$][\w$]*/
const IDENT_RE = '[A-Za-z_$][\\w$]*'
const MODULE = -1

/** 取出所有 <script> 块，带上它在原文里的起始行，便于报错定位到真实行号 */
function scriptBlocks(src: string): Array<{ code: string; lineOffset: number }> {
  const blocks: Array<{ code: string; lineOffset: number }> = []
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    blocks.push({ code: m[1], lineOffset: src.slice(0, m.index).split('\n').length - 1 })
  }
  return blocks
}

/** 字符串 / 模板串 / 注释 → 等长空白，保证下标与原文一致 */
function stripLiterals(code: string): string {
  const out = code.split('')
  const n = code.length
  let i = 0
  while (i < n) {
    const c = code[i]
    if (c === '/' && code[i + 1] === '/') {
      while (i < n && code[i] !== '\n') out[i++] = ' '
    } else if (c === '/' && code[i + 1] === '*') {
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] !== '\n') out[i] = ' '
        i++
      }
      for (let j = i; j < Math.min(i + 2, n); j++) out[j] = ' '
      i += 2
    } else if (c === "'" || c === '"' || c === '`') {
      out[i++] = ' '
      while (i < n && code[i] !== c) {
        if (code[i] === '\\') {
          out[i++] = ' '
          if (i < n) out[i++] = ' '
          continue
        }
        if (code[i] !== '\n') out[i] = ' '
        i++
      }
      if (i < n) out[i++] = ' '
    } else {
      i++
    }
  }
  return out.join('')
}

/** owner[i] = 包含下标 i 的最内层 '{' 的下标；模块级为 -1 */
function buildOwner(code: string): number[] {
  const owner = new Array<number>(code.length).fill(MODULE)
  const stack: number[] = [MODULE]
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (c === '{') {
      owner[i] = stack[stack.length - 1]
      stack.push(i)
    } else if (c === '}') {
      if (stack.length > 1) stack.pop()
      owner[i] = stack[stack.length - 1]
    } else {
      owner[i] = stack[stack.length - 1]
    }
  }
  return owner
}

function matchParenBackward(code: string, closeIdx: number): number {
  let depth = 0
  for (let j = closeIdx; j >= 0; j--) {
    if (code[j] === ')') depth++
    else if (code[j] === '(') {
      depth--
      if (depth === 0) return j
    }
  }
  return -1
}

/** 从参数文本里取名字，兼容解构、默认值、类型标注 */
function paramNames(text: string): string[] {
  const names: string[] = []
  for (let part of text.split(',')) {
    part = part.trim()
    if (part.startsWith('{') || part.startsWith('[')) {
      const body = part.replace(/^[{[]/, '').replace(/[}\]]$/, '')
      for (const sub of body.split(',')) {
        const nm = sub.split(':').pop()!.split('=')[0].trim()
        if (IDENT.test(nm) && nm === IDENT.exec(nm)![0]) names.push(nm)
      }
      continue
    }
    const nm = part.split(':')[0].split('=')[0].trim().replace(/^\.+/, '')
    if (nm && IDENT.test(nm) && nm === IDENT.exec(nm)![0]) names.push(nm)
  }
  return names
}

/** 真正干活的那一层：给定一段脚本源码，返回无法解析的 X.value */
export function findUnresolvedRefAccesses(code: string): string[] {
  const clean = stripLiterals(code)
  const owner = buildOwner(clean)
  const decls = new Map<number, Set<string>>()

  const add = (pos: number, names: string[]) => {
    if (names.length === 0) return
    const key = pos < owner.length ? owner[pos] : MODULE
    const set = decls.get(key) ?? new Set<string>()
    for (const n of names) set.add(n)
    decls.set(key, set)
  }

  for (const m of clean.matchAll(/(?:const|let|var)\s+/g)) {
    const start = m.index! + m[0].length
    const seg = clean.slice(start, start + 400)
    if (seg.trimStart().startsWith('{')) {
      const close = seg.indexOf('}')
      if (close !== -1) add(m.index!, paramNames(seg.slice(0, close + 1)))
      continue
    }
    add(m.index!, paramNames(seg.split('\n')[0].split('=')[0]))
  }

  for (const m of clean.matchAll(/(?:async\s+)?function\s*([A-Za-z_$][\w$]*)?/g)) {
    if (m[1]) add(m.index!, [m[1]])
  }

  for (const m of clean.matchAll(/import\s+([\s\S]*?)\s+from\s/g)) {
    for (const nm of m[1].match(/[A-Za-z_$][\w$]*/g) ?? []) {
      if (nm !== 'as' && nm !== 'type') add(m.index!, [nm])
    }
  }

  // 箭头函数参数：从每个 '=>' 往回找参数列表
  for (const m of clean.matchAll(/=>/g)) {
    let k = m.index! - 1
    while (k >= 0 && ' \t\n'.includes(clean[k])) k--
    if (k < 0) continue
    if (clean[k] === ')') {
      const op = matchParenBackward(clean, k)
      if (op !== -1) add(m.index!, paramNames(clean.slice(op + 1, k)))
    } else {
      const mm = /([A-Za-z_$][\w$]*)\s*$/.exec(clean.slice(0, k + 1))
      if (mm) add(m.index!, [mm[1]])
    }
  }

  for (const m of clean.matchAll(/catch\s*\(\s*([\w$]+)/g)) {
    add(m.index!, [m[1]])
  }

  const resolves = (name: string, pos: number): boolean => {
    let scope = pos < owner.length ? owner[pos] : MODULE
    for (;;) {
      if (decls.get(scope)?.has(name)) return true
      if (scope === MODULE) return false
      scope = owner[scope] < owner.length ? owner[scope] : MODULE
    }
  }

  const found: string[] = []
  for (const m of clean.matchAll(/(?<![\w.$])([A-Za-z_$][\w$]*)\.value\b/g)) {
    const name = m[1]
    if (['this', 'window', 'globalThis', 'process'].includes(name)) continue
    if (!resolves(name, m.index!)) {
      const line = clean.slice(0, m.index!).split('\n').length
      found.push(`第 ${line} 行 ${name}.value`)
    }
  }
  return found
}

function collectVueFiles(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) {
      if (name === 'node_modules' || name.startsWith('mini _program')) continue
      found.push(...collectVueFiles(abs))
    } else if (name.endsWith('.vue')) {
      found.push(abs)
    }
  }
  return found
}

describe('小程序 ref 作用域完整性', () => {
  it('检查器本身有效：解析不到的要报，回调参数要放过', () => {
    // 反例：模块里没有 foo，却访问 foo.value
    expect(findUnresolvedRefAccesses('const a = computed(() => foo.value)')).toEqual([
      '第 1 行 foo.value',
    ])
    // 正例：回调参数上的 .value 是属性访问，不是 ref
    expect(findUnresolvedRefAccesses('const xs = list.map((option) => option.value)')).toEqual([])
    // 正例：模块级 ref
    expect(findUnresolvedRefAccesses('const foo = ref(1)\nconst b = computed(() => foo.value)')).toEqual([])
    // 正例：import 进来的 ref
    expect(findUnresolvedRefAccesses("import { x } from './x'\nconst y = x.value")).toEqual([])
    // 反例：同名的局部变量在别的函数里，不算数
    expect(
      findUnresolvedRefAccesses('const a = computed(() => foo.value)\nfunction f() { const foo = ref(1); return foo.value }'),
    ).toEqual(['第 1 行 foo.value'])
  })

  it('所有页面的 X.value 都能在作用域链上解析到', () => {
    const root = process.cwd()
    const files = collectVueFiles(resolve(root, 'src'))
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files.sort()) {
      const src = readFileSync(file, 'utf-8')
      for (const block of scriptBlocks(src)) {
        for (const hit of findUnresolvedRefAccesses(block.code)) {
          const line = Number(/第 (\d+) 行/.exec(hit)?.[1] ?? 0) + block.lineOffset
          const name = hit.split(' ').pop()
          violations.push(
            `${file.replace(root + '/', '')}:${line} 访问了 ${name}，但它在作用域链上不存在`,
          )
        }
      }
    }

    expect(violations).toEqual([])
  })
})
