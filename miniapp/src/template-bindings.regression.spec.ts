import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 模板里调用的东西，脚本里必须存在（2026-10-04）。
 *
 * ── 为什么需要这条 ──────────────────────────────────────────────
 *
 * 老板报过一个 bug：疫苗板块点「手动加一条」**没有任何反应**。
 * 查下来是我自己在上一轮"去掉状态选择器"时，用脚本按位置删函数，
 * 连带把 `attachmentList` / `attachmentDisplay` / `previewAttachment`
 * 三个跟状态无关的函数一起删掉了。
 *
 * 三个东西全都漏过去了：
 *   · **构建不报错** —— vite/esbuild 只转译不做类型检查；
 *   · **回归测试照过** —— 现有 spec 全是源码 grep，只检查"某句话还在不在"，
 *     不会发现"模板调了个不存在的函数"；
 *   · **静态检查也没跑** —— 这个仓库的 tsc 本来就有历史报错，没人指望它。
 *
 * 结果就是：一有新记录卡片要渲染，模板求值 `attachmentList(record)` 直接抛
 * `t.attachmentList is not a function`，**整个组件重渲染失败**，
 * 界面停在原地 —— 用户看到的就是"点了没反应"。
 *
 * 所以补这条：**模板里被当函数调用的标识符，必须在 script 里出现过**。
 * 判据故意取得很宽（只要出现过就行），因为要挡的是"整个被删光"这种情况，
 * 而那种情况恰恰是出现次数为 0。
 */

/** 第三方示例代码、构建产物不算我们自己的代码 */
const SKIP_DIRS = [
  'src/utils/mini _program_3.0.4_release_20250925/',
  'dist/',
  'node_modules/',
]

/** 模板里长得像函数调用、但其实不是的（v-for 的 in / of 等） */
const NOT_FUNCTIONS = new Set([
  'in',
  'of',
  'if',
  'else',
  'return',
  'typeof',
  'new',
  'delete',
  'void',
  'instanceof',
])

/** JS/Vue/uni-app 内建，不需要在 script 里定义 */
const BUILTINS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'Math',
  'Date',
  'Number',
  'String',
  'Boolean',
  'Array',
  'Object',
  'JSON',
  'parseInt',
  'parseFloat',
  'isNaN',
  'setTimeout',
  'clearTimeout',
  '$set',
])

function ownVueFiles(): string[] {
  return globSync('src/**/*.vue')
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => !SKIP_DIRS.some((dir) => file.startsWith(dir)))
}

/** 模板里被当函数调用的标识符（去重、排序） */
function calledInTemplate(source: string): string[] {
  const match = source.match(/<template>([\s\S]*)<\/template>/)
  if (!match) {
    return []
  }

  const found = new Set<string>()
  // (?<![\w.$]) 排掉 obj.method( 和 foo_bar( 里的后半截
  for (const hit of match[1].matchAll(/(?<![\w.$])([a-zA-Z_$][\w$]*)\s*\(/g)) {
    const name = hit[1]
    if (NOT_FUNCTIONS.has(name) || BUILTINS.has(name)) {
      continue
    }
    found.add(name)
  }
  return [...found].sort()
}

function scriptOf(source: string): string {
  const match = source.match(/<template>[\s\S]*<\/template>/)
  return match ? source.slice(match[0].length) : source
}

/**
 * 这个名字在脚本里**有定义**吗（不是只被调用过）。
 *
 * ⚠️ 判据必须比"出现过"严：`attachmentList` 被删掉之后，
 * 脚本里还剩 `attachments: attachmentList(record)` 这一句**调用** ——
 * 只查"出现过"会放过它，而它恰恰就是崩的那个。
 * 所以这里只认四种"定义"：
 *   · `function NAME`
 *   · `const|let|var NAME`
 *   · import 进来的 `NAME`
 *   · 解构/简写位置上的 `NAME,` `NAME }`（比如 `defineExpose({ addRecord })`）
 *     以及 props 成员 `NAME?:`
 */
function isDefinedInScript(script: string, name: string): boolean {
  const patterns = [
    new RegExp(`\\bfunction\\s+${name}\\b`),
    new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`),
    new RegExp(`\\b${name}\\s*[,}]`),
    new RegExp(`\\b${name}\\s*[?:]\\s*[^,;)]*[,;}]`),
  ]
  if (patterns.some((pattern) => pattern.test(script))) {
    return true
  }

  // import { a, NAME, b as NAME } from '...' / import NAME from '...'
  for (const hit of script.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    const clause = hit[1]
    if (new RegExp(`\\b${name}\\b`).test(clause)) {
      return true
    }
  }

  return false
}

describe('模板绑定的完整性（2026-10-04 老板报的"点了没反应"）', () => {
  const files = ownVueFiles()

  it('至少扫到了一批组件（防止 glob 写错导致这条测试变成空转）', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('模板里调用的每个函数，script 里都有定义（不是只被调用过）', () => {
    const problems: string[] = []

    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf-8')
      const script = scriptOf(source)

      for (const name of calledInTemplate(source)) {
        if (!isDefinedInScript(script, name)) {
          problems.push(`${file} → ${name}()`)
        }
      }
    }

    expect(problems).toEqual([])
  })

  it('疫苗板块那三个附件函数必须在（就是这次被误删的那三个）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

    // 模板里用了、脚本里却没了 → 一渲染卡片就抛
    // TypeError: t.attachmentList is not a function，整个组件重渲染失败。
    for (const fn of ['attachmentList', 'attachmentDisplay', 'previewAttachment']) {
      expect(source).toContain(`function ${fn}`)
    }
    // 它们依赖的三个 import 也要在
    for (const imported of [
      'normalizeHealthAttachmentList',
      'buildHealthAttachmentDisplayMeta',
      'previewHealthAttachment',
    ]) {
      expect(source).toContain(imported)
    }
  })
})
