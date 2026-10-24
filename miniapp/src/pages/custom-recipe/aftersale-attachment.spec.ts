import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 食谱调整页 · 附件（2026-10-25 重写）
 *
 * 一个“添加附件”按钮 → 底部弹窗选照片/文档；
 * 每份食谱各自的附件；删除要连 COS 一起删。
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

describe('食谱调整页 · 附件', () => {
  const page = stripComments(
    readFileSync(
      resolve(process.cwd(), 'src/pages/custom-recipe/aftersale.vue'),
      'utf-8',
    ),
  )

  it('★ 照片走 chooseImage，文档走 chooseMessageFile', () => {
    expect(page).toContain('uni.chooseImage')
    expect(page).toContain('uni.chooseMessageFile')
    expect(page).toContain("extension: ['pdf', 'doc', 'docx']")
  })

  it('★ 合并成一个添加附件入口，用 ActionSheet 选照片/文档', () => {
    expect(page).toContain('pickAttachment')
    expect(page).toContain('uni.showActionSheet')
    expect(page).toContain("itemList: ['照片', '文档']")
    expect(page).toContain('添加附件')
  })

  it('★ 每份食谱的附件独立（activeDraft.attachments）', () => {
    expect(page).toContain('activeDraft')
    expect(page).toContain('attachments')
    expect(page).toContain('drafts[item.key]')
  })

  it('★ 预览与删除都在；删除调用后端接口（连 COS 一起删）', () => {
    expect(page).toContain('previewAttachment')
    expect(page).toContain('removeAttachment')
    expect(page).toContain('deleteAftersaleAttachment')
    expect(page).toContain('删除后文件也会从服务器删掉')
  })

  it('★ 上限生效', () => {
    expect(page).toContain('MAX_ATTACH')
    expect(page).toContain('attachments.length >= MAX_ATTACH')
  })

  it('★ 不再写“文件传输助手”这类底部提示（提示放弹窗选项里）', () => {
    expect(page).not.toContain('文件传输助手')
    expect(page).not.toContain('照片 / 文档（选填）')
  })
})
