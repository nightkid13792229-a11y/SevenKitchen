import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 编辑卡：**模板里调用的每个函数，脚本里都真的有**（2026-10-12）。
 *
 * ── 这条是怎么来的 ──────────────────────────────────────────────────
 *
 * 抽卡片那一步是纯搬家 ✓，搬完我拿"原模板 vs 新模板"做结构比对核了一遍 ✓，
 * 结果抓到一个**遗留 bug** ✗：
 *
 *   模板里还写着 `hasComponentSelection(record, index)` / `isNoneOfThem(record, index)` ✓，
 *   而这两个函数在新卡片里已经**不收参数**了 ✓ —— 参数是搬过来时手写签名时去掉的 ✓。
 *
 * 为什么它没被别的东西拦住 ✗：
 *   · 构建能过 ✓（多传两个实参不报错 ✓）
 *   · 页面**照样能跑** ✓（函数体只读 `draft` ✓，多传的参数被忽略 ✓）
 *   · 但它是**假的接线** ✗：哪天有人把函数签名改回"用参数"，
 *     传进来的 `record` / `index` 就是错的来源 ✗，而且这类错真机才炸 ✗。
 *
 * 所以留下这条**小而准**的检查 ✓（不搞"逐字比对整个模板"那套 ✗ ——
 * 那种检查会被注释措辞、缩进、分词规则牵着走 ✓，很容易变成噪音或被误改 ✗）。
 */

const CARD = 'src/components/dog-profile/VaccineRecordCard.vue'

function templateOf(source: string): string {
  const start = source.indexOf('<template>')
  // ⚠️ 必须 lastIndexOf ✗ —— 卡片里有 `<template v-if>` 嵌套 ✓，
  //    indexOf 会停在第一个内层标签上 ✗，于是只看到半截 ✓（检查会变成空转 ✗）。
  const end = source.lastIndexOf('</template>')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return source.slice(start + '<template>'.length, end)
}

function scriptOf(source: string): string {
  const start = source.indexOf('<script setup')
  const end = source.lastIndexOf('</script>')
  return source.slice(start, end)
}

/** 脚本里"定义过"的函数名（function 声明 + const 箭头函数 ✓）*/
function definedFunctions(script: string): Set<string> {
  const names = new Set<string>()
  for (const m of script.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1])
  }
  for (const m of script.matchAll(/(?:^|\n)\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?\(/g)) {
    names.add(m[1])
  }
  // 别名也算定义 ✓ —— 例如 `const getTodayDateString = todayDateText`
  // （模板里能调它 ✓）。第一版漏了这条 ✗，于是它被当成"没定义"报了出来 ✓ ——
  // 说明这条检查真的在干活 ✓。
  for (const m of script.matchAll(/(?:^|\n)\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*[A-Za-z_$][\w$]*\s*$/gm)) {
    names.add(m[1])
  }
  return names
}

/** 模板里被当函数调用的名字（排除 Vue 指令与内建 ✓）*/
const NOT_A_CALL = new Set([
  'emit',
  'if',
  'else',
  'in',
  'of',
  'true',
  'false',
  'null',
  'undefined',
])

function calledInTemplate(template: string): string[] {
  const found = new Set<string>()
  for (const m of template.matchAll(/(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!NOT_A_CALL.has(m[1])) found.add(m[1])
  }
  return [...found].sort()
}

describe('编辑卡 · 模板调用的函数必须真的有（2026-10-12 搬家时抓到的遗留 bug）', () => {
  const source = readFileSync(resolve(process.cwd(), CARD), 'utf-8')
  const template = templateOf(source)
  const script = scriptOf(source)

  it('取到的模板与脚本都不为空（防止解析写错导致这条空转）', () => {
    expect(template).toContain('vaccine-card__header')
    expect(template.length).toBeGreaterThan(2000)
    expect(script).toContain('defineProps')
  })

  it('🔴 模板里调用的函数，脚本里都有定义', () => {
    const defined = definedFunctions(script)
    // 自检：真的解析出了一批函数 ✓（否则下面的差集必然为空 ✓ = 白测 ✗）
    expect(defined.size).toBeGreaterThan(10)
    expect(defined.has('confirmVaccineName')).toBe(true)
    expect(defined.has('hasComponentSelection')).toBe(true)

    const missing = calledInTemplate(template).filter((name) => !defined.has(name))
    expect(missing).toEqual([])
  })

  it('🔴 这两个函数已经不收参数了，模板也不许再传（就是那次抓到的 bug）', () => {
    // 函数体只读 draft ✓ —— 参数是搬家时去掉的 ✓；
    // 模板若还传 record / index ✓，就是"假接线" ✗（能跑，但接线是错的 ✓）
    expect(script).toContain('function hasComponentSelection(): boolean')
    expect(script).toContain('function isNoneOfThem(): boolean')
    expect(template).toContain('hasComponentSelection()')
    expect(template).toContain('isNoneOfThem()')
    expect(template).not.toContain('hasComponentSelection(record')
    expect(template).not.toContain('isNoneOfThem(record')
  })

  it('kindPickerOpen 是卡片自己的布尔 ref，模板里按 ref 的规矩读', () => {
    expect(script).toContain('const kindPickerOpen = ref(false)')
    // ⚠️ 模板里 ref **不会自动解包** ✓ —— 写 `!kindPickerOpen` 永远是 false ✗
    //    （第一版我差点这么写 ✓，那样病种选择器会永远展开不了 ✗）
    expect(template).toContain('!kindPickerOpen.value')
    expect(template).not.toMatch(/!\s*kindPickerOpen\s*&&/)
  })
})
