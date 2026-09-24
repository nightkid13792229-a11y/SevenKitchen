import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 页面调用了 utils / api 导出的函数，却没有 import、也没有本地定义。
 *
 * 为什么值得单独守一条：这个项目用 Vite + esbuild 构建小程序，
 * **只转译不做类型检查**，所以一个调不到的函数能顺利构建通过；
 * 而回归测试断言的是源码文本，也发现不了。结果就是代码全绿、
 * 到真机上跑到那一行才抛 `ReferenceError`。
 *
 * 真实案例：`home/index.vue` 里 `getLifeStageLabelForRecommend()` 调用了
 * `getLifeStageLabel()`，注释还写着「中文名统一由 label-mapping 提供」，
 * 但那一行 import 从来没被写进去。main 分支的同名函数是在文件里自己定义的，
 * 两边的差异在合并时才暴露出来。
 */

const MINIAPP_ROOT = process.cwd()
const EXPORT_DIRS = ['src/utils', 'src/api']
const PAGE_DIR = 'src/pages'

/** 收集 utils / api 里导出的函数名 -> 定义它的文件（便于报错时定位） */
function collectExportedFunctions(): Map<string, string> {
  const exported = new Map<string, string>()

  for (const dir of EXPORT_DIRS) {
    const absDir = resolve(MINIAPP_ROOT, dir)
    let entries: string[]
    try {
      entries = readdirSync(absDir)
    } catch {
      continue
    }

    for (const name of entries.sort()) {
      if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) continue

      const text = readFileSync(join(absDir, name), 'utf-8')
      for (const match of text.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
        if (!exported.has(match[1])) exported.set(match[1], `${dir}/${name}`)
      }
      for (const match of text.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/g)) {
        if (!exported.has(match[1])) exported.set(match[1], `${dir}/${name}`)
      }
    }
  }

  return exported
}

/** 列出 src/pages 下所有 .vue（含子目录） */
function listPageFiles(dir: string): string[] {
  const absDir = resolve(MINIAPP_ROOT, dir)
  const found: string[] = []

  for (const name of readdirSync(absDir)) {
    const abs = join(absDir, name)
    if (statSync(abs).isDirectory()) {
      found.push(...listPageFiles(join(dir, name)))
    } else if (name.endsWith('.vue')) {
      found.push(join(dir, name))
    }
  }

  return found
}

/** 注释里的函数名不算调用 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

describe('miniapp 跨模块调用完整性', () => {
  it('页面里调用的 utils/api 函数都必须被引入或本地定义', () => {
    const exported = collectExportedFunctions()
    expect(exported.size).toBeGreaterThan(0)

    const violations: string[] = []

    for (const pagePath of listPageFiles(PAGE_DIR).sort()) {
      const code = stripComments(readFileSync(resolve(MINIAPP_ROOT, pagePath), 'utf-8'))

      for (const [name, origin] of exported) {
        const called = new RegExp(`(?<![\\w.])${name}\\s*\\(`).test(code)
        if (!called) continue

        const imported = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(code)
        if (imported) continue

        const declaredLocally = new RegExp(`(?:function|const|let)\\s+${name}\\b`).test(code)
        if (declaredLocally) continue

        violations.push(`${pagePath} 调用了 ${name}()（由 ${origin} 导出）但既未 import 也未定义`)
      }
    }

    expect(violations).toEqual([])
  })
})
