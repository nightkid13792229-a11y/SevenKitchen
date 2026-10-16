import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripComments } from './source-text'

/**
 * 架构守卫 · 「页面上声明的 ref 类型」必须与「组件真正暴露的东西」对得上
 *
 * ⚠️ 为什么要有它（2026-10-16 清单 E5）：
 *
 *   我们没有给 `.vue` 做类型检查（本机装的 vue-tsc 与 TS 版本不兼容，跑不起来 ✗），
 *   于是"页面上写了 `ref.addFoo()`，可组件根本没暴露 addFoo"这类错误**没人拦** ✗。
 *
 *   这种错真发生过：页面上写的是 `startDocumentScan`（组件里早就不走那条路了），
 *   而真正在用的 `addAntibodyTest` **压根没写进类型声明** —— 类型和实现对不上，
 *   却一路绿到别人发现为止。
 *
 * 这个守卫**不编译器**，只做一件窄而有用的事：
 *   把 `defineExpose({...})` 里的名字抄出来，与页面 ref 类型里声明的方法名对一遍 ——
 *   **声明了但没暴露**（会崩：点了没反应）和**用了但没声明**（类型谎言）都报出来。
 *
 * 为什么不用 vue-tsc：见上。等哪天装上了，这条守卫可以退休 ✓。
 */
const ROOT = resolve(__dirname, '..')

function read(file: string): string {
  return stripComments(readFileSync(resolve(ROOT, file), 'utf-8'))
}

/** `defineExpose({ a, b: c, d() {} })` 里暴露出来的属性名 */
function exposedNames(source: string): string[] {
  const matched = source.match(/defineExpose\(\{([\s\S]*?)\}\)/)
  if (!matched) return []
  return matched[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'))
    .map((line) => {
      const key = line.split(':')[0].split('(')[0].trim().replace(/,$/, '')
      return key
    })
    .filter((key) => /^[A-Za-z_$][\w$]*$/.test(key))
}

/** 页面上给某个 ref 声明的类型里写的成员名（形如 `foo?: () => void` / `foo(): void`） */
function declaredMembers(source: string, marker: string): string[] {
  const at = source.indexOf(marker)
  if (at < 0) return []
  const block = source.slice(at, at + 900)
  const closed = block.indexOf('} | null>')
  const body = closed > 0 ? block.slice(0, closed) : block
  const names: string[] = []
  const re = /^\s{2}([A-Za-z_$][\w$]*)\s*[?:(]/gm
  let hit = re.exec(body)
  while (hit) {
    names.push(hit[1])
    hit = re.exec(body)
  }
  return names
}

describe('架构守卫 · 页面 ref 声明 vs 组件 defineExpose（清单 E5）', () => {
  it('🔴 声明了却没暴露的方法 = 点了没反应，必须拦下', () => {
    const page = read('pages/dog-profile-health/index.vue')
    const vaccine = read('components/vaccine/VaccineTab.vue')

    const exposed = exposedNames(vaccine)
    expect(exposed.length, 'VaccineTab 没有 defineExpose？').toBeGreaterThan(0)

    const declared = declaredMembers(page, 'const vaccineSectionRef = ref<{')
    expect(declared.length, '页面没有给 vaccineSectionRef 声明类型？').toBeGreaterThan(0)

    const missing = declared.filter((name) => exposed.indexOf(name) < 0)
    expect(missing, `页面声明了但 VaccineTab 没暴露：${missing.join('、')}`).toEqual([])

    const unused = exposed.filter((name) => declared.indexOf(name) < 0)
    expect(unused, `VaccineTab 暴露了但页面没声明：${unused.join('、')}`).toEqual([])
  })
})
