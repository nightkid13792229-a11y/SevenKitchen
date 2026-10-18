import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 售后附件类型守卫（2026-10-18 · 需求 2.5.7）
 *
 * 需求：「附件 = **照片 + PDF + Word**，每条可预览 / 删除，可继续新增」
 *
 * 此前只做了图片 —— 老板问过"PDF和Word能不能上传呢？"
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

describe('售后页 · 附件', () => {
  const page = stripComments(
    readFileSync(
      resolve(process.cwd(), 'src/pages/custom-recipe/aftersale.vue'),
      'utf-8',
    ),
  )

  it('★ 照片走 chooseImage', () => {
    expect(page).toContain('uni.chooseImage')
  })

  it('★ PDF / Word 走 chooseMessageFile（微信的相册选择器只能选图片）', () => {
    expect(page).toContain('uni.chooseMessageFile')
    expect(page).toContain("extension: ['pdf', 'doc', 'docx']")
  })

  it('★ 两个入口分开，不是把扩展名塞进同一个选择器', () => {
    expect(page).toContain('pickAttach')
    expect(page).toContain('pickDocument')
  })

  it('★ 预览与删除都在（需求：每条可预览 / 删除）', () => {
    expect(page).toContain('previewAttach')
    expect(page).toContain('removeAttach')
  })

  it('★ 上限仍然生效（照片和文档共用同一个上限）', () => {
    expect(page).toContain('MAX_ATTACH')
    expect(page).toContain('attachments.value.length >= MAX_ATTACH')
  })

  it('提示里说清"文档要先发到微信"（不说顾客会以为坏了）', () => {
    expect(page).toContain('文件传输助手')
  })
})
