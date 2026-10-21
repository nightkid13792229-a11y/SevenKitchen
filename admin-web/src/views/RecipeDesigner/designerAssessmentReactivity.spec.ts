import { describe, expect, it } from 'vitest'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'

function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('配方编辑 · 原料变更触发营养评估（2026-10-22）', () => {
  const source = stripComments(editorSource)

  it('关掉原料开关时必须触发一次评估', () => {
    expect(source).toContain('itemsRevision')
    expect(source).toContain('itemsRevision.value += 1')
    expect(source).toContain('itemsRevision.value] as const')
  })

  it('修改重量/撤销重做也不能只改对象属性而不触发评估', () => {
    const toggle = source.slice(
      source.indexOf('function onToggleInclude'),
      source.indexOf('function applyItemWeight')
    )
    expect(toggle).toContain('itemsRevision.value += 1')

    const weight = source.slice(
      source.indexOf('function onWeightChange'),
      source.indexOf('function onToggleInclude')
    )
    expect(weight).toContain('itemsRevision.value += 1')

    expect(source).toContain('function applyUpdateField')
    expect(source).toContain('itemsRevision.value += 1')
  })
})
