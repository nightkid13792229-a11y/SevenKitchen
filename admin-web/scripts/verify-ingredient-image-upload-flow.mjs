import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const adminRoot = resolve(scriptDir, '..')

const indexVue = readFileSync(resolve(adminRoot, 'src/views/Ingredients/index.vue'), 'utf8')
const formVue = readFileSync(resolve(adminRoot, 'src/views/Ingredients/IngredientForm.vue'), 'utf8')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(
  indexVue.includes('createdIngredient.type === IngredientType.SUPPLEMENT'),
  '新增补剂保存后应保持弹窗打开并回填 createdIngredient，方便继续上传产品图片'
)

assert(
  !formVue.includes('supplementImageUploading || !props.ingredient?.id'),
  '上传组件不能因为新增态没有 ingredient id 而静默禁用，否则点击上传图片没有反馈'
)

assert(
  formVue.includes('notifySupplementImageRequiresSavedIngredient'),
  '新增态点击上传图片需要给出“先保存再上传”的明确反馈'
)

console.log('Ingredient image upload flow checks passed')
