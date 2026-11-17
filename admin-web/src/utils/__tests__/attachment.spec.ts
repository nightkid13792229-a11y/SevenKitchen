import { describe, expect, it } from 'vitest'

import {
  attachmentFileName,
  attachmentKind,
  attachmentKindLabel,
  isImageAttachment,
} from '@/utils/attachment'

/**
 * 报告附件类型判断（2026-11-17）
 *
 * 背景：后台报告原件原来一律用图片预览组件；
 * 顾客能上传 PDF / Word，于是 PDF 打开是空白 —— 员工以为"没传上来"。
 *
 * 关键坑：敏感附件走媒体代理，URL 是
 * `/api/v1/media/sensitive/<token>?ext=pdf`，**路径里没有扩展名**，
 * 只看 path 会把 PDF 当成图片。
 */
describe('报告附件 · 类型判断', () => {
  it('★ 媒体代理地址要看 ext 参数，不能只看路径', () => {
    expect(
      attachmentKind(
        'https://api.example.com/api/v1/media/sensitive/abc123?ext=pdf',
      ),
    ).toBe('pdf')
    expect(
      attachmentKind(
        'https://api.example.com/api/v1/media/sensitive/abc123?ext=jpg',
      ),
    ).toBe('image')
  })

  it('普通 CDN 地址按路径后缀判断', () => {
    expect(attachmentKind('https://cdn.example.com/a/report.PNG')).toBe('image')
    expect(attachmentKind('https://cdn.example.com/a/report.pdf')).toBe('pdf')
    expect(attachmentKind('https://cdn.example.com/a/report.docx')).toBe('doc')
  })

  it('没扩展名/空值按未知文件处理（走下载链接，不硬塞图片组件）', () => {
    expect(attachmentKind('')).toBe('file')
    expect(attachmentKind('https://cdn.example.com/a/abcdef')).toBe('file')
    expect(isImageAttachment('https://cdn.example.com/a/abcdef')).toBe(false)
  })

  it('只有图片才用图片预览', () => {
    expect(isImageAttachment('https://cdn.example.com/a/x.jpeg')).toBe(true)
    expect(isImageAttachment('https://x/y?ext=pdf')).toBe(false)
    expect(isImageAttachment('https://x/y?ext=docx')).toBe(false)
  })

  it('打开原件的按钮文案', () => {
    expect(attachmentKindLabel('pdf')).toBe('PDF')
    expect(attachmentKindLabel('doc')).toBe('Word')
    expect(attachmentKindLabel('image')).toBe('图片')
    expect(attachmentKindLabel('file')).toBe('文件')
  })

  it('文件名可读，不把随机 token 甩给员工', () => {
    expect(attachmentFileName('https://x/y?ext=pdf', '过敏报告')).toBe(
      '过敏报告.pdf',
    )
    expect(attachmentFileName('https://x/y', '过敏报告')).toBe('过敏报告')
  })
})
