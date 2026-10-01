import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 自定义组件的 wxss 选择器限制（2026-10-01）。
 *
 * 微信小程序规定：**自定义组件的 wxss 里不允许使用标签名选择器、ID 选择器
 * 和属性选择器**（页面不受这条限制）。违反时开发者工具会刷一片黄字警告：
 *
 *   Some selectors are not allowed in component wxss, including tag name
 *   selectors, ID selectors, and attribute selectors.
 *
 * 健康管理这几个组件此前用 `[disabled]` 写禁用态，正是踩了这一条。
 * 这条测试直接扫构建产物，防止改样式时又写回去。
 *
 * 注意：只在 components/ 下检查 —— 页面用标签选择器是允许的。
 */
const DIST_DIR = resolve(process.cwd(), 'dist/build/mp-weixin')
const COMPONENTS_DIR = resolve(DIST_DIR, 'components')

const TAG_NAMES = [
  'view', 'text', 'button', 'image', 'input', 'textarea', 'scroll-view',
  'picker', 'navigator', 'swiper', 'swiper-item', 'form', 'label', 'checkbox',
  'radio', 'canvas', 'video', 'map', 'web-view', 'cover-view', 'rich-text',
  'progress', 'slider', 'switch', 'icon', 'movable-view', 'movable-area',
  'open-data', 'ad', 'official-account', 'functional-page-navigator',
  'live-player', 'live-pusher', 'audio', 'page-container', 'share-element',
  'keyboard-accessory', 'match-media', 'page-meta', 'navigation-bar',
  'root-portal', 'picker-view', 'picker-view-column',
]

function collectWxssFiles(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) {
      files.push(...collectWxssFiles(full))
    } else if (name.endsWith('.wxss')) {
      files.push(full)
    }
  }
  return files
}

/** 取出 wxss 里的每一段选择器 */
function selectorsOf(source: string): string[] {
  const selectors: string[] = []
  const matcher = /(?:^|\})\s*([^{}@]+)\{/g
  let match: RegExpExecArray | null
  while ((match = matcher.exec(source)) !== null) {
    for (const part of match[1].split(',')) {
      const trimmed = part.trim()
      if (trimmed) {
        selectors.push(trimmed)
      }
    }
  }
  return selectors
}

function findOffenders(source: string): string[] {
  const tagPattern = new RegExp(`(?:^|[\\s>+~])(${TAG_NAMES.join('|')})(?![\\w-])`)
  return selectorsOf(source).filter((selector) => (
    tagPattern.test(selector)
    || /#[A-Za-z]/.test(selector)
    || /\[[^\]]+\]/.test(selector)
  ))
}

describe('自定义组件的 wxss 选择器限制', () => {
  it('构建产物存在（先 npm run build:mp-weixin）', () => {
    expect(existsSync(DIST_DIR)).toBe(true)
    expect(existsSync(COMPONENTS_DIR)).toBe(true)
  })

  it('健康管理相关组件的 wxss 不再有违规选择器（回归）', () => {
    const healthComponents = [
      'HealthRecordsSection',
      'VaccineManagementSection',
      'WeightManagementSection',
      'AllergyQuickAddSection',
      'StickyActionBar',
    ]

    const problems: string[] = []
    for (const name of healthComponents) {
      const file = resolve(COMPONENTS_DIR, 'dog-profile', `${name}.wxss`)
      if (!existsSync(file)) {
        continue
      }
      for (const selector of findOffenders(readFileSync(file, 'utf-8'))) {
        problems.push(`${name}.wxss → ${selector}`)
      }
    }

    expect(problems).toEqual([])
  })

  it('所有自定义组件都没有违规选择器', () => {
    const problems: string[] = []
    for (const file of collectWxssFiles(COMPONENTS_DIR)) {
      for (const selector of findOffenders(readFileSync(file, 'utf-8'))) {
        problems.push(`${file.slice(DIST_DIR.length + 1)} → ${selector}`)
      }
    }

    expect(problems).toEqual([])
  })

  it('禁用态一律用修饰类，不用 [disabled] 属性选择器', () => {
    const offenders: string[] = []
    for (const file of collectWxssFiles(COMPONENTS_DIR)) {
      const source = readFileSync(file, 'utf-8')
      if (/\[disabled\]/.test(source)) {
        offenders.push(file.slice(DIST_DIR.length + 1))
      }
    }

    expect(offenders).toEqual([])
  })
})
