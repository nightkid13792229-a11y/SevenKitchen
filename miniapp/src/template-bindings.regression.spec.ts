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

  /**
   * 模板里**直接引用的变量**，脚本里也必须存在（2026-10-17 新增）。
   *
   * ## 为什么要补这一条
   *
   * 上面那条只查**函数调用**（`名字(`）。而 2026-10-17 修的一个真 bug
   * 恰恰不是函数、是变量：
   *
   * `custom-recipe/index.vue` 的模板里写着 `v-if="healthPrefillHint"`，
   * 而脚本里**从来没定义过这个变量**。后果不是报错，而是**静默**：
   * 「已从档案带出」那句提示永远不会显示，顾客看到过敏标签莫名其妙已经填好，
   * 不知道是系统给的。
   *
   * 它躲过了三道关：
   *   · **构建不报错** —— vite 只转译不做类型检查；
   *   · **tsc 不查模板** —— 模板是另一套编译；
   *   · **旧守卫只查函数** —— 变量引用不在范围内。
   *
   * ## 为什么只查「整个表达式就是一个名字」
   *
   * `{{ item.name }}`、`{{ a + b }}`、`{{ format(x) }}` 这些不查 ——
   * 它们的根名字可能是 v-for 局部变量、插槽参数，静态判断很容易误报。
   * 只查 `{{ 单个名字 }}` 这一种：它**要么是想显示一个本地值**，
   * 要么就是写漏了 —— 后者正是我们要抓的。
   *
   * v-for / v-slot 的局部名会先收集起来排除，避免误报。
   */
  it('模板里直接引用的变量，script 里也有定义', () => {
    const problems: string[] = []

    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf-8')
      const script = scriptOf(source)

      const propNames = propsDeclaredIn(script)

      for (const name of bareVarsInTemplate(source)) {
        if (propNames.has(name)) {
          continue
        }
        if (!isDefinedInScript(script, name)) {
          problems.push(`${file} → {{ ${name} }}`)
        }
      }
    }

    expect(problems).toEqual([])
  })

  /**
   * 组件 props 的名字。
   *
   * 为什么单独抽出来、而不是直接放宽 `isDefinedInScript`：
   * 那个判据同时被"函数"那条守卫用着，放宽它会**同时削弱**那一条
   * （比如 `{ foo: 1 }` 里的 `foo` 也会被当成"已定义"）。
   * 所以只在这条新守卫里单独认 props，两条各管各的。
   *
   * 认两种写法：
   *   · `defineProps<{ primaryText: string }>()` —— 内联类型字面量
   *   · `interface Props { primaryText?: string }` + `defineProps<Props>()`
   */
  function propsDeclaredIn(script: string): Set<string> {
    const names = new Set<string>()

    const collectFrom = (block: string) => {
      for (const hit of block.matchAll(/([a-zA-Z_$][\w$]*)\??\s*:/g)) {
        names.add(hit[1])
      }
    }

    for (const hit of script.matchAll(/defineProps\s*<\s*\{([\s\S]*?)\}\s*>/g)) {
      collectFrom(hit[1])
    }
    for (const hit of script.matchAll(/interface\s+(\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
      collectFrom(hit[2])
    }
    for (const hit of script.matchAll(/defineProps\(\s*\{([\s\S]*?)\}\s*\)/g)) {
      collectFrom(hit[1])
    }
    // `withDefaults(defineProps<Props>(), ...)`：Props 的名字由上面的 interface 收
    return names
  }

  /**
   * 模板里 `{{ 单个名字 }}` 形式引用的名字（已排除局部变量）。
   */
  function bareVarsInTemplate(source: string): string[] {
    const match = source.match(/<template>([\s\S]*)<\/template>/)
    if (!match) {
      return []
    }
    const tpl = match[1]
    const found = new Set<string>()

    // v-for / v-slot 的局部名，在模板里合法但不在 script 里
    const locals = new Set<string>()
    for (const v of tpl.matchAll(
      /v-for="\s*\(?\s*([\w$]+)\s*(?:,\s*([\w$]+))?\s*(?:,\s*([\w$]+))?\s*\)?\s+(?:in|of)\s/g,
    )) {
      for (const g of v.slice(1)) {
        if (g) locals.add(g)
      }
    }
    for (const v of tpl.matchAll(/(?:v-slot|#)[\w-]*="\s*\{([^}]*)\}/g)) {
      for (const n of v[1].split(',')) {
        const name = n.split(':').pop()!.trim()
        if (name) locals.add(name)
      }
    }

    for (const mu of tpl.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
      const expr = mu[1].trim()
      if (!/^[a-zA-Z_$][\w$]*$/.test(expr)) {
        continue
      }
      if (locals.has(expr) || BUILTINS.has(expr) || expr.startsWith('$')) {
        continue
      }
      found.add(expr)
    }
    return [...found].sort()
  }

  /*
   * 「疫苗板块那三个附件函数必须在」那一条随旧板块一起删除（2026-10-15）。
   *
   * 它钉的是 `VaccineManagementSection.vue` 里 attachmentList / attachmentDisplay /
   * previewAttachment 三个函数（2026-10-04 那次误删的现场）。那个板块已在疫苗
   * 重构里整块删掉，附件渲染搬进了 `components/vaccine/RecordList.vue`。
   * 这条守卫本身仍然有效：上面那条"模板里调用的每个函数，script 里都有定义"
   * 会继续盯住包括新组件在内的所有 .vue 文件。
   */
})
