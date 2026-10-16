import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * ⚠️ 提交前拦住"名字用到了、但作用域里根本没有"这一类错（2026-10-16 加）。
 *
 * 真实事故：老板在手机上两次上传疫苗本都是"直接失败、连识别中都不显示"。
 * 根因是我一次补丁把 `for (let index = 0; ...)` 这一行**吃掉了**，
 * 循环体里却还在用 `index`：
 *
 *     isBusy = true
 *     try {
 *       {                                  ← 循环头没了，这里变成一个裸块
 *         uni.showLoading({ title: filePaths.length > 1
 *           ? `识别中 ${index + 1}/…`        ← index 未定义 → ReferenceError
 *           : '识别中…' })
 *
 * 三道关全没拦住 ✗：
 *   · `uni build` 只转译，**不做类型检查**；
 *   · `vitest` 走 esbuild，同样不做类型检查；
 *   · `no-undefined-identifiers.spec.ts` 只查**函数调用**（`名字(`）——
 *     它自己在注释里写明"变量引用误报太多，不查"，而这个 bug 正好是变量引用 ✗。
 *
 * 这里换成**真正的解析器**（TypeScript 编译器）来看作用域：
 * 把每个 .vue 的 `<script setup>` 抽出来，只挑 **TS2304 / TS2552**
 * （找不到这个名字）两类诊断 —— 这正是上面那类错，且不会掺进类型不匹配的噪音。
 */

const SRC_ROOT = resolve(process.cwd(), 'src')

/** 小程序全局对象（抽出来的脚本没有 uni-app 的类型环境，先声明掉） */
const AMBIENT = `
declare const uni: any
declare const wx: any
declare const getApp: any
declare const getCurrentPages: any
declare const App: any
declare const Page: any
declare const Component: any
declare const requirePlugin: any
declare const __wxConfig: any
// Vue 的编译宏（不需要 import，由 SFC 编译器处理）
declare function defineProps<T = any>(...args: any[]): any
declare function defineEmits<T = any>(...args: any[]): any
declare function withDefaults<T = any>(...args: any[]): any
declare function defineExpose<T = any>(...args: any[]): void
declare function defineOptions<T = any>(...args: any[]): void
declare function defineSlots<T = any>(...args: any[]): any
declare function defineModel<T = any>(...args: any[]): any
`

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      collectFiles(full, out)
      continue
    }
    if (/\.(vue|ts)$/.test(entry) && !/\.spec\.ts$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** 取 .vue 的 script 内容；.ts 就是整个文件 */
function scriptOf(source: string, file: string): string {
  if (!file.endsWith('.vue')) return source
  const start = source.indexOf('<script')
  if (start < 0) return ''
  const open = source.indexOf('>', start)
  const end = source.indexOf('</script>', open)
  return open < 0 || end < 0 ? '' : source.slice(open + 1, end)
}

describe('架构守卫 · 用了却没声明的名字（2026-10-16 真事故）', () => {
  it('🔴 每个 .vue / .ts 里都不许出现"找不到这个名字"', () => {
    const workdir = mkdtempSync(join(tmpdir(), 'dsh-scope-'))
    const files = collectFiles(SRC_ROOT)
    const entries: { path: string; tmp: string }[] = []

    files.forEach((file, i) => {
      const script = scriptOf(readFileSync(file, 'utf-8'), file)
      if (!script.trim()) return
      const tmp = join(workdir, `f${i}.ts`)
      writeFileSync(tmp, `${AMBIENT}\n${script}`, 'utf-8')
      entries.push({ path: file.replace(`${SRC_ROOT}/`, ''), tmp })
    })

    const program = ts.createProgram(
      entries.map((item) => item.tmp),
      {
        noEmit: true,
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        skipLibCheck: true,
        allowJs: true,
        noImplicitAny: false,
        strict: false,
        isolatedModules: true,
        types: [],
      },
    )

    /** 只留"找不到这个名字"两类；类型不匹配、找不到模块一律不管 */
    const SCOPE_ERROR_CODES = new Set([2304, 2552])
    const offenders: string[] = []
    for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
      if (!SCOPE_ERROR_CODES.has(diagnostic.code)) continue
      const file = diagnostic.file?.fileName || ''
      const entry = entries.find((item) => item.tmp === file)
      const { line } = diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : { line: 0 }
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
      offenders.push(`${entry?.path || file}:${line + 1} → ${message}`)
    }

    expect(
      offenders,
      `这些地方用了作用域里不存在的名字（真机上会直接崩）：\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
