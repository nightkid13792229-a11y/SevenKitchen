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

  it('keeps the supplement import confirmation page wired for editable review', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/supplement-import-confirm.vue'),
      'utf-8',
    )

    expect(source).toContain('原料名称')
    expect(source).toContain('原料类型')
    expect(source).toContain('备注说明')
    expect(source).toContain('基准单位')
    expect(source).toContain('标准单位展示名')
    expect(source).toContain('单个重量')
    expect(source).toContain('产品品牌')
    expect(source).toContain('产品规格')
    expect(source).toContain('添加时机')
    expect(source).toContain('生产损耗率')
    expect(source).toContain('营养档案')
    expect(source).toContain('validationErrors')
    expect(source).toContain('duplicateCandidates')
    expect(source).toContain('CREATE_NEW')
    expect(source).toContain('UPDATE_EXISTING')
    expect(source).toContain('updateDraft')
    expect(source).toContain(':disabled="!canConfirm')
    expect(source).toContain('confirmDraft')
    expect(source).toContain('normalizedDraft.ingredient.weightG')
    expect(source).toContain('normalizedDraft.ingredient.productSpec')
    expect(source).not.toContain('normalizedDraft.ingredient.singleWeight')
    expect(source).not.toContain('normalizedDraft.ingredient.productModel')
    expect(source).toContain('allValidationErrors.value.length === 0')
    expect(source).toContain('hasValidDuplicateResolution.value')
    expect(source).toContain('const savedDraft = await saveDraftChanges')
    expect(source).toContain('canConfirmSavedDraft(savedDraft)')
    expect(source).toMatch(/riskFlags|照片模糊/)
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
    expect(importApiSource).toMatch(/getDraft\(draftId: string\)[\s\S]*suppressErrorToast: true/)
    expect(importApiSource).toMatch(/updateDraft\(draftId: string, normalizedDraft: any\)[\s\S]*suppressErrorToast: true/)
    expect(importApiSource).toMatch(/confirmDraft\(draftId: string\)[\s\S]*suppressErrorToast: true/)
  })
})
