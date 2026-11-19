<template>
  <section class="archive-step">
    <header class="archive-step__head">
      <div>
        <h3>③ 建档</h3>
        <p class="archive-step__desc">
          传两张图：正面（品牌/规格/剂型）和标签（Serving Size + 成分表）。
          图上的字由 AI 抄，字段与折算由系统算；认不出的格子留空，不猜。
        </p>
      </div>
      <div class="archive-step__actions">
        <el-button text data-action="back-to-compare" @click="emit('back')">← 回去比价</el-button>
      </div>
    </header>

    <div class="archive-step__uploads">
      <div class="upload-card">
        <p class="upload-card__title">正面图</p>
        <el-image
          v-if="draft.evidence.frontImageUrl"
          :src="draft.evidence.frontImageUrl"
          :preview-src-list="[draft.evidence.frontImageUrl]"
          fit="cover"
          class="upload-card__thumb"
        />
        <el-button size="small" :loading="uploadingFront" @click="pickFront">选择正面图</el-button>
        <input ref="frontInput" type="file" accept="image/*" hidden @change="onFrontFile" />
      </div>

      <div class="upload-card">
        <p class="upload-card__title">标签图</p>
        <el-image
          v-if="draft.evidence.labelImageUrl"
          :src="draft.evidence.labelImageUrl"
          :preview-src-list="[draft.evidence.labelImageUrl]"
          fit="cover"
          class="upload-card__thumb"
        />
        <el-button size="small" :loading="uploadingLabel" @click="pickLabel">选择标签图</el-button>
        <input ref="labelInput" type="file" accept="image/*" hidden @change="onLabelFile" />
      </div>

      <div class="upload-card upload-card--hint">
        <p class="upload-card__title">读出来了吗</p>
        <p v-if="reading" class="upload-card__note">正在读图…</p>
        <p v-else-if="readDone" class="upload-card__note">
          读到 {{ Object.keys(draft.servingNutrients).length }} 个营养素、每份
          {{ draft.servingUnitsPerDose ?? '?' }} {{ draft.unitDisplayLabel }}
        </p>
        <p v-else class="upload-card__note">两张都传好后会自动读，也可以点「重新读」</p>
        <el-button
          size="small"
          :loading="reading"
          :disabled="!draft.evidence.frontImageUrl || !draft.evidence.labelImageUrl"
          @click="readImages"
        >
          重新读
        </el-button>
        <p v-if="skipped.length > 0" class="upload-card__warn">
          这些没认出来，请照标签补：{{ skipped.join('、') }}
        </p>
      </div>
    </div>

    <div class="archive-step__body">
      <div class="group">
        <p class="group__title">基本信息</p>
        <div class="grid">
          <label class="field">
            <span>原料名称</span>
            <el-input v-model="draft.name" placeholder="只写物质名，如「铜」" />
            <em v-if="nameFormWord" class="field__warn">
              名称结尾的「{{ nameFormWord }}」是剂型，建议只写物质名
            </em>
          </label>
          <label class="field">
            <span>单位展示名</span>
            <el-select v-model="draft.unitDisplayLabel" style="width: 100%" data-anchor="baseUnit">
              <el-option v-for="unit in unitOptions" :key="unit" :label="unit" :value="unit" />
            </el-select>
          </label>
          <label class="field">
            <span>物理形态</span>
            <el-select v-model="draft.physicalForm" style="width: 100%">
              <el-option label="胶囊" value="CAPSULE" />
              <el-option label="片剂" value="TABLET" />
              <el-option label="粉剂" value="POWDER" />
              <el-option label="液体" value="LIQUID" />
            </el-select>
          </label>
          <label class="field">
            <span>每份几粒</span>
            <el-input-number
              v-model="draft.servingUnitsPerDose"
              :min="1"
              :precision="0"
              controls-position="right"
              data-anchor="servingUnitsPerDose"
              style="width: 100%"
            />
          </label>
        </div>
      </div>

      <div class="group">
        <p class="group__title">商品与价格</p>
        <div class="grid">
          <label class="field">
            <span>产品品牌</span>
            <el-input v-model="draft.brand" />
          </label>
          <label class="field">
            <span>产品规格</span>
            <el-input v-model="draft.productModel" placeholder="如 120 粒/瓶" />
          </label>
          <label class="field">
            <span>采购渠道</span>
            <el-input v-model="draft.purchaseChannel" placeholder="iHerb" />
          </label>
          <label class="field">
            <span>采购单位</span>
            <el-input v-model="draft.purchaseUnit" placeholder="瓶" />
          </label>
          <label class="field">
            <span>换算倍数</span>
            <el-input-number
              v-model="draft.purchaseToBaseRatio"
              :min="0.01"
              :precision="2"
              controls-position="right"
              style="width: 100%"
            />
            <em class="field__hint">1 个采购单位 = 多少{{ draft.unitDisplayLabel }}</em>
          </label>
          <label class="field">
            <span>当前采购价</span>
            <el-input-number
              v-model="draft.currentPricePerPurchaseUnit"
              :min="0"
              :precision="2"
              controls-position="right"
              data-anchor="purchasePricePerPurchaseUnit"
              style="width: 100%"
            />
            <em v-if="offer" class="field__hint">按比价选中那瓶带入的</em>
          </label>
        </div>
      </div>

      <div class="group group--needs">
        <p class="group__title">这几项你来定</p>
        <div class="grid">
          <label class="field">
            <span>标签分类</span>
            <el-select
              v-model="draft.tagNames"
              multiple
              filterable
              allow-create
              default-first-option
              style="width: 100%"
            >
              <el-option v-for="tag in tagSuggestions" :key="tag" :label="tag" :value="tag" />
            </el-select>
          </label>
          <label class="field">
            <span>添加时机</span>
            <el-select v-model="draft.addTiming" placeholder="请选择" style="width: 100%">
              <el-option label="制作中" value="BEFORE_MIXING" />
              <el-option label="随餐" value="BEFORE_MEAL" />
            </el-select>
          </label>
          <label class="field">
            <span>标签类型</span>
            <el-select v-model="draft.labelCategory" placeholder="请选择" style="width: 100%">
              <el-option label="饲料原料" value="FEED_MATERIAL" />
              <el-option label="饲料添加剂" value="FEED_ADDITIVE" />
            </el-select>
          </label>
          <label class="field">
            <span>标签名称</span>
            <el-select
              v-model="draft.labelNames"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="按目录规范名填，不带剂型"
              style="width: 100%"
            >
              <el-option v-for="name in draft.labelNames" :key="name" :label="name" :value="name" />
            </el-select>
          </label>
        </div>
      </div>

      <div class="group">
        <p class="group__title">
          营养档案（每 1 {{ draft.unitDisplayLabel }}）
          <el-checkbox v-model="showAll" class="group__toggle">显示全部字段</el-checkbox>
        </p>
        <div v-for="group in visibleGroups" :key="group.key" class="nutrient-group">
          <p class="nutrient-group__title">{{ group.title }}</p>
          <div class="grid">
            <label v-for="field in group.fields" :key="field.fieldPath" class="field">
              <span>{{ field.label }}</span>
              <div class="split">
                <el-input-number
                  :model-value="draft.servingNutrients[field.fieldPath]"
                  :min="0"
                  :precision="4"
                  :controls="false"
                  placeholder="每份"
                  style="width: 100%"
                  @update:model-value="(value: number | undefined) => setServing(field.fieldPath, value)"
                />
                <em class="split__calc">
                  ÷ {{ draft.servingUnitsPerDose ?? '?' }} =
                  {{ perUnitPreview(field.fieldPath) }} {{ field.unit }}
                </em>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>

    <footer class="archive-step__gates">
      <div class="gates">
        <span
          v-for="gate in gateReport.items"
          :key="gate.key"
          class="gate"
          :class="gate.passed ? 'gate--ok' : 'gate--bad'"
          :title="gate.detail"
        >
          {{ gate.passed ? '✓' : '⚠' }} {{ gate.label }}
          <em v-if="!gate.passed" class="gate__why">{{ gate.detail }}</em>
        </span>
      </div>
      <div class="gates__actions">
        <span v-if="errorText" class="gates__error">{{ errorText }}</span>
        <el-button
          type="primary"
          :disabled="!canSubmit"
          :loading="saving"
          data-action="submit-supplement"
          @click="submit"
        >
          核验并写入
        </el-button>
      </div>
    </footer>

    <div v-if="saved" class="archive-step__saved">
      <span>{{ confirmed ? '已确认可用，配方里现在能选到这条补剂' : '已写入，营养档案是「待验证」，配方里还选不到' }}</span>
      <el-button v-if="!confirmed" type="primary" size="small" :loading="confirming" @click="confirm">
        确认可用
      </el-button>
      <el-button v-if="confirmed" type="primary" size="small" @click="emit('go-launch')">
        去上架配置 →
      </el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ingredientApi, nutritionFoodApi } from '@/api/ingredients'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { supplementNutrientGroups, supplementUsageUnitOptions } from '@/constants/supplementNutrients'
import type {
  SupplementFormAdviceDto,
  SupplementOfferDto
} from '@/types/ingredientCreation'
import {
  computePerUnit,
  findMissingHumanFields,
  findSupplementFormWord,
  patchFromPreview,
  toCreatePayload,
  toGateInput,
  type SupplementDraftValue
} from '../supplementFormState'
import { evaluateSupplementGates } from '../supplementGates'

/**
 * 第 3 步：图变档案。
 *
 * 两张图只做一件事：把字读回来。字段映射与单位换算复用已有的
 * `patchFromPreview`（有单测），折算仍由服务端在写入时算。
 */
const props = defineProps<{
  draft: SupplementDraftValue
  offer: SupplementOfferDto | null
  formLevel: string | null
  formAdvice: SupplementFormAdviceDto | null
  /** 父级记着的写入结果：返回这一步时不要再让人重复写一遍 */
  savedResult?: { ingredientId: string; nutritionFoodId: string; evidenceId: string } | null
}>()

const emit = defineEmits<{
  (event: 'back'): void
  (event: 'saved', value: { ingredientId: string; nutritionFoodId: string; evidenceId: string }): void
  (event: 'go-launch'): void
}>()

const draft = props.draft
const frontInput = ref<HTMLInputElement | null>(null)
const labelInput = ref<HTMLInputElement | null>(null)
const uploadingFront = ref(false)
const uploadingLabel = ref(false)
const reading = ref(false)
const readDone = ref(false)
const skipped = ref<string[]>([])
const showAll = ref(false)
const saving = ref(false)
const confirming = ref(false)
const confirmed = ref(false)
const errorText = ref('')
const saved = ref<{ ingredientId: string; nutritionFoodId: string; evidenceId: string } | null>(
  props.savedResult ?? null
)

const unitOptions = supplementUsageUnitOptions
const tagSuggestions = ['矿物质', '维生素', '油脂类', '关节', '益生菌', '膳食纤维']

const visibleGroups = computed(() =>
  supplementNutrientGroups
    .map((group) => ({
      ...group,
      fields: showAll.value ? group.fields : group.fields.filter((field) => field.common)
    }))
    .filter((group) => group.fields.length > 0)
)

const nameFormWord = computed(() => findSupplementFormWord(draft.name))
const gateReport = computed(() => evaluateSupplementGates(toGateInput(draft)))
const canSubmit = computed(
  () => !!toCreatePayload(draft) && gateReport.value.passed && !saving.value && !saved.value
)

function perUnitPreview(fieldPath: string): string {
  const value = computePerUnit(
    draft.servingNutrients,
    draft.servingUnitsPerDose,
    draft.perUnitOverrides
  )[fieldPath]
  return value === undefined ? '—' : String(Math.round(value * 10000) / 10000)
}

function setServing(fieldPath: string, value: number | undefined): void {
  if (value === undefined || !Number.isFinite(value)) {
    delete draft.servingNutrients[fieldPath]
    return
  }
  draft.servingNutrients[fieldPath] = value
}

function pickFront(): void {
  frontInput.value?.click()
}

function pickLabel(): void {
  labelInput.value?.click()
}

async function upload(file: File): Promise<string | null> {
  const uploaded = (await ingredientApi.uploadIngredientDiyImage(file)) as unknown as {
    url?: string
    data?: { url?: string }
  }
  return uploaded.url ?? uploaded.data?.url ?? null
}

async function onFrontFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  uploadingFront.value = true
  try {
    const url = await upload(file)
    if (!url) {
      throw new Error('no url')
    }
    draft.evidence.frontImageUrl = url
    await maybeRead()
  } catch {
    ElMessage.error('这张图没传上去，重试一次')
  } finally {
    uploadingFront.value = false
  }
}

async function onLabelFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  uploadingLabel.value = true
  try {
    const url = await upload(file)
    if (!url) {
      throw new Error('no url')
    }
    draft.evidence.labelImageUrl = url
    await maybeRead()
  } catch {
    ElMessage.error('这张图没传上去，重试一次')
  } finally {
    uploadingLabel.value = false
  }
}

async function maybeRead(): Promise<void> {
  if (draft.evidence.frontImageUrl && draft.evidence.labelImageUrl) {
    await readImages()
  }
}

async function readImages(): Promise<void> {
  if (!draft.evidence.frontImageUrl || !draft.evidence.labelImageUrl) {
    return
  }
  reading.value = true
  errorText.value = ''
  try {
    const result = await ingredientCreationApi.readSupplementLabelImages({
      frontImageUrl: draft.evidence.frontImageUrl,
      labelImageUrl: draft.evidence.labelImageUrl
    })

    const { patch, skipped: skippedRows } = patchFromPreview({
      productUrl: draft.evidence.productUrl,
      productName: null,
      servingUnitsPerDose: result.servingUnitsPerDose,
      nutrients: result.nutrients,
      unrecognized: result.unrecognized,
      labelText: result.labelText
    })

    draft.servingUnitsPerDose = patch.servingUnitsPerDose ?? null
    draft.servingNutrients = { ...(patch.servingNutrients ?? {}) }
    draft.perUnitOverrides = {}
    draft.evidence.labelText = result.labelText

    if (!draft.name.trim() && result.suggestedName) {
      draft.name = result.suggestedName
    }
    if (!draft.brand.trim() && result.front.brandCandidate) {
      draft.brand = result.front.brandCandidate
    }
    if (!draft.productModel.trim() && result.front.productModel) {
      draft.productModel = result.front.productModel
    }
    if (result.front.physicalForm) {
      draft.physicalForm = result.front.physicalForm
    }
    if (result.front.unitDisplayLabel) {
      draft.unitDisplayLabel = result.front.unitDisplayLabel
    }

    skipped.value = skippedRows
    readDone.value = true
    ElMessage.success('读完了，核对一下数字')
  } catch (error) {
    errorText.value = apiErrorMessage(error, '这两张图没读成，可以重试或手填')
  } finally {
    reading.value = false
  }
}

/**
 * 选品快照：为什么选这一档、为什么买这一瓶。
 *
 * 只存"当时看到的"，不存推断；事后复核时能一路对回原文与比价表。
 */
function buildSelection(): Record<string, unknown> {
  const option = props.formAdvice?.options.find((item) => item.level === props.formLevel) ?? null
  return {
    formLevel: props.formLevel,
    nutrientKey: props.formAdvice?.nutrientKey ?? null,
    nutrientLabel: props.formAdvice?.nutrientLabel ?? null,
    recommendationReason: props.formAdvice?.recommendationReason ?? null,
    gaps: props.formAdvice?.gaps ?? [],
    formOption: option,
    // 选的是「没有原文支撑/被判不推荐」的档位时，这里为 true：这是人拍的板
    humanOverride:
      !!option && option.verdict !== 'RECOMMENDED' && option.verdict !== 'ACCEPTABLE',
    offer: props.offer,
    chosenAt: new Date().toISOString()
  }
}

async function submit(): Promise<void> {
  const payload = toCreatePayload(draft)
  if (!payload) {
    return
  }
  const formWord = findSupplementFormWord(payload.name)
  if (formWord) {
    try {
      await ElMessageBox.confirm(
        `名称结尾的「${formWord}」是产品剂型，建议改成「${payload.name.trim().slice(0, -formWord.length)}」。`,
        '名称里带了剂型词',
        { confirmButtonText: '仍然保存', cancelButtonText: '返回修改', type: 'warning' }
      )
    } catch {
      return
    }
  }
  payload.evidence.selection = buildSelection()

  saving.value = true
  errorText.value = ''
  try {
    const result = await ingredientCreationApi.createSupplement(payload)
    saved.value = result
    emit('saved', result)
    ElMessage.success('已写入，等确认可用')
  } catch (error) {
    errorText.value = apiErrorMessage(error, '写入失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

async function confirm(): Promise<void> {
  if (!saved.value) {
    return
  }
  confirming.value = true
  try {
    await nutritionFoodApi.verify(saved.value.nutritionFoodId)
    confirmed.value = true
    ElMessage.success('已确认可用，配方里现在能选到这条补剂')
  } catch (error) {
    errorText.value = apiErrorMessage(error, '确认失败，请稍后重试')
  } finally {
    confirming.value = false
  }
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: { message?: unknown } } })?.response?.data
  const message = body?.message
  if (typeof message === 'string' && message.trim()) {
    return message
  }
  return fallback
}

// 第 2 步选中的那瓶，价格与规格先带进来（人改了就不再覆盖）
if (props.offer) {
  if (!draft.currentPricePerPurchaseUnit && props.offer.priceCny) {
    draft.currentPricePerPurchaseUnit = props.offer.priceCny
  }
  if (!draft.purchaseToBaseRatio && props.offer.unitsPerBottle) {
    draft.purchaseToBaseRatio = props.offer.unitsPerBottle
  }
  if (!draft.purchaseChannel.trim()) {
    draft.purchaseChannel = 'iHerb'
  }
}
</script>

<style scoped>
.archive-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fff;
  border: 1px solid #e3e6ea;
  border-radius: 8px;
  padding: 16px;
}
.archive-step__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.archive-step__head h3 {
  margin: 0 0 4px;
  font-size: 15px;
}
.archive-step__desc {
  margin: 0;
  font-size: 12px;
  color: #8a9099;
  line-height: 1.6;
}
.archive-step__uploads {
  display: grid;
  grid-template-columns: 200px 200px minmax(0, 1fr);
  gap: 12px;
}
.upload-card {
  border: 1px dashed #dfe3e8;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.upload-card__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}
.upload-card__thumb {
  width: 100%;
  height: 110px;
  border-radius: 6px;
  background: #fafbfc;
}
.upload-card__note {
  margin: 0;
  font-size: 11.5px;
  color: #8a9099;
  line-height: 1.6;
}
.upload-card__warn {
  margin: 0;
  font-size: 11.5px;
  color: #b26a00;
  line-height: 1.6;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #5b6470;
}
.field__hint {
  font-size: 11px;
  color: #9aa2ab;
  font-style: normal;
}
.field__warn {
  font-size: 11px;
  color: #e6a23c;
  font-style: normal;
}
.group {
  border-bottom: 1px solid #f2f4f6;
  padding: 10px 0;
}
.group--needs {
  background: #fffdf8;
  border: 1px solid #f0d9a8;
  border-radius: 8px;
  padding: 10px;
}
.group__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 12.5px;
  font-weight: 600;
}
.group__toggle {
  margin-left: auto;
}
.nutrient-group__title {
  margin: 8px 0 6px;
  font-size: 12px;
  color: #8a9099;
}
.split {
  display: flex;
  align-items: center;
  gap: 8px;
}
.split__calc {
  flex: 0 0 auto;
  min-width: 82px;
  font-size: 11px;
  color: #8a9099;
  font-style: normal;
}
.archive-step__gates {
  display: flex;
  align-items: center;
  gap: 10px;
  border-top: 1px solid #eef0f3;
  padding-top: 10px;
}
.gates {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.gate {
  font-size: 11.5px;
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid #cfe7db;
  background: #f6fdfa;
  color: #0f7a54;
}
.gate--bad {
  border-color: #f0d9a8;
  background: #fff6e8;
  color: #b26a00;
}
.gate__why {
  display: block;
  font-size: 10.5px;
  margin-top: 2px;
  opacity: 0.85;
}
.gates__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gates__error {
  font-size: 12px;
  color: #b4232a;
  max-width: 360px;
}
.archive-step__saved {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f6fdfa;
  border: 1px solid #cfe7db;
  border-radius: 6px;
  font-size: 12.5px;
  color: #0f7a54;
}
@media (max-width: 1100px) {
  .archive-step__uploads {
    grid-template-columns: 1fr;
  }
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
