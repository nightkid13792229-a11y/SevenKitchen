import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('supplement import page regressions', () => {
  it('keeps camera and album upload flows wired to draft creation', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/supplement-import.vue'),
      'utf-8',
    )

    expect(source).toContain("sourceType: ['camera']")
    expect(source).toContain("sourceType: ['album']")
    expect(source).toContain('uploadSupplementImportImage')
    expect(source).toContain('createDraft')
  })

  it('keeps the supplement library entry linked to photo import', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/supplement-library.vue'),
      'utf-8',
    )

    expect(source).toContain('/pages/recipe-diy/supplement-import')
    expect(source).toContain('拍照识别新增')
  })

  it('suppresses shared request toasts where pages show contextual errors', () => {
    const librarySource = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/supplement-library.vue'),
      'utf-8',
    )
    const importApiSource = readFileSync(
      resolve(process.cwd(), 'src/utils/supplement-import.ts'),
      'utf-8',
    )

    expect(librarySource).toMatch(/url: '\/admin\/ingredients'[\s\S]*suppressErrorToast: true/)
    expect(importApiSource).toMatch(/url: SUPPLEMENT_IMPORT_DRAFTS_PATH[\s\S]*data: \{ imageUrls \}[\s\S]*suppressErrorToast: true/)
  })
})
