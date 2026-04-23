import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const readSource = (relativePath) =>
  readFileSync(resolve(__dirname, '..', relativePath), 'utf8')

const listSource = readSource('src/views/Purchasing/ReimbursementList.vue')
const detailSource = readSource('src/views/Purchasing/ReimbursementDetail.vue')
const routerSource = readSource('src/router/index.ts')
const layoutSource = readSource('src/layouts/MainLayout.vue')

test('reimbursement admin pages use reimbursement wording instead of approval wording', () => {
  assert.match(listSource, /报销管理/)
  assert.match(listSource, /待报销/)
  assert.doesNotMatch(listSource, /报销审核管理|审核对话框|审核报销单|提交审核|>审核</)

  assert.match(detailSource, /报销信息/)
  assert.match(detailSource, /待报销/)
  assert.match(detailSource, /上传报销凭证后将完成报销并确认本次价格变更/)
  assert.doesNotMatch(detailSource, /审核操作|审核决定|提交审核|待老板审核|人工审核/)

  assert.match(routerSource, /报销管理/)
  assert.match(layoutSource, /报销管理/)
  assert.doesNotMatch(routerSource, /报销审核/)
  assert.doesNotMatch(layoutSource, /报销审核/)
})
