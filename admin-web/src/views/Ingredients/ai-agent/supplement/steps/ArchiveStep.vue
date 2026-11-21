<template>
  <section class="archive-step">
    <header class="archive-step__head">
      <div>
        <h3>① 建档</h3>
        <p class="archive-step__desc">
          传两张图：正面（品牌/规格/剂型）和标签（Serving Size + 成分表）。
          图上的字由 AI 抄，字段与折算由系统算；认不出的格子留空，不猜。
        </p>
      </div>
      <div class="archive-step__actions">
        <el-button text data-action="copy-skill-hint" @click="helpTextVisible = !helpTextVisible">
          选品依据怎么填？
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="helpTextVisible"
      type="info"
      :closable="false"
      show-icon
      class="archive-step__help"
    >
      在 DSH 里跑「补剂选品」Skill，把它的形态结论与选中商品贴到下面；没有也可以直接建档。
    </el-alert>

    <div class="archive-step__block">
      <label class="wb-label">默认目标营养素（必填）</label>
      <el-select
        v-model="draft.defaultTargetFields"
        multiple
        filterable
        collapse-tags
        collapse-tags-tooltip
        placeholder="设计器里加这条补剂时默认勾选的营养素；AI 会先填"
        style="width: 100%"
      >
        <el-option
          v-for="option in targetOptions"
          :key="option.value"
          :label="`${option.label}（${option.unit}）`"
          :value="option.value"
        />
      </el-select>
      <em class="field__hint">
        只能选标签上读出来的营养素；没有它就加不成这条补剂
      </em>
    </div>

    <div class="archive-step__block">
      <label class="wb-label">选品依据（可不填）</label>
      <el-input
        v-model="selectionNote"
        type="textarea"
        :rows="3"
        data-evidence="selectionNote"
        placeholder="例如：形态=无机盐（SACN5 第 37 页）；选 Swanson Albion Copper 2mg×300 片 ¥80.76，每 1000mg ¥134.60"
      />
    </div>

    <div class="archive-step__uploads">
      <div
        class="upload-card"
        :class="{ 'upload-card--active': activeSlot === 'front' }"
        tabindex="0"
        data-slot="front"
        @click="activate('front')"
        @dragover.prevent
        @drop.prevent="onDrop('front', $event)"
      >
        <p class="upload-card__title">正面图</p>
        <el-image
          v-if="draft.evidence.frontImageUrl"
          :src="draft.evidence.frontImageUrl"
          :preview-src-list="[draft.evidence.frontImageUrl]"
          fit="cover"
          class="upload-card__thumb"
        />
        <el-button size="small" :loading="uploadingFront" @click.stop="pickFront">选择正面图</el-button>
        <input ref="frontInput" type="file" accept="image/*" hidden @change="onFrontFile" />
      </div>

      <div
        class="upload-card"
        :class="{ 'upload-card--active': activeSlot === 'label' }"
        tabindex="0"
        data-slot="label"
        @click="activate('label')"
        @dragover.prevent
        @drop.prevent="onDrop('label', $event)"
      >
        <p class="upload-card__title">标签图</p>
        <el-image
          v-if="draft.evidence.labelImageUrl"
          :src="draft.evidence.labelImageUrl"
          :preview-src-list="[draft.evidence.labelImageUrl]"
          fit="cover"
          class="upload-card__thumb"
        />
        <el-button size="small" :loading="uploadingLabel" @click.stop="pickLabel">选择标签图</el-button>
        <input ref="labelInput" type="file" accept="image/*" hidden @change="onLabelFile" />
      </div>

      <div class="upload-card upload-card--hint">
        <p class="upload-card__title">读出来了吗</p>
        <p v-if="reading" class="upload-card__note">正在读图…</p>
        <p v-else-if="readDone" class="upload-card__note">
          读到 {{ Object.keys(draft.servingNutrients).length }} 个营养素、每份
          {{ draft.servingUnitsPerDose ?? '?' }} {{ draft.unitDisplayLabel }}
        </p>
        <p v-else class="upload-card__note">
          点一下左边任一框，再按 ⌘V 直接粘贴截图（也可以拖图片进来）
        </p>
        <el-button
          size="small"
          :loading="reading"
          :disabled="!draft.evidence.frontImageUrl || !draft.evidence.labelImageUrl"
          @click="readImages"
        >
          重新读
        </el-button>
        <p v-for="note in diagnosticNotes" :key="note" class="upload-card__warn">{{ note }}</p>
        <p v-if="droppedHints.length > 0" class="upload-card__warn">
          有 {{ droppedHints.length }} 条判断没过校验，已留空：{{ droppedHints.map((item) => item.reason).join('；') }}
        </p>
        <p v-if="skipped.length > 0" class="upload-card__warn">
          这些没认出来，请照标签补：{{ skipped.join('、') }}
        </p>

        <el-collapse v-if="readDone" class="upload-card__ocr">
          <el-collapse-item title="看模型读到的原文（字段就是从这来的）" name="ocr">
            <p class="upload-card__ocr-title">正面图</p>
            <pre class="upload-card__ocr-text">{{ ocrText.front || '（空）' }}</pre>
            <p class="upload-card__ocr-title">标签图</p>
            <pre class="upload-card__ocr-text">{{ ocrText.label || '（空）' }}</pre>
            <p class="upload-card__ocr-note">
              名称 / 品牌 / 渠道 / 价格 / 基准单位 / 标签类型与名称 → 模型判断；
              营养素、每份多少、产品规格、价格兜底 → 代码从上面这段原文算。
            </p>
          </el-collapse-item>
        </el-collapse>
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
            <span>基准单位</span>
            <el-select v-model="draft.baseUnit" style="width: 100%">
              <el-option
                v-for="item in baseUnitOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <em class="field__hint">
              营养按每 1 {{ draft.unitDisplayLabel }} 记；胶囊/片剂按个，粉按克，液体按毫升
            </em>
          </label>
          <label class="field">
            <span>每份多少{{ draft.unitDisplayLabel }}</span>
            <el-input-number
              v-model="draft.servingUnitsPerDose"
              :min="0.01"
              :precision="2"
              controls-position="right"
              data-anchor="servingUnitsPerDose"
              style="width: 100%"
            />
            <em class="field__hint">
              标签上「Serving Size」是几{{ draft.unitDisplayLabel }}；粉剂填克数（如 3），不是 1
            </em>
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
            <span>商品链接</span>
            <el-input v-model="draft.evidence.productUrl" placeholder="iHerb 商品页链接（可空）" />
            <em class="field__hint">贴进来后，档案里能回查当时买的哪一瓶</em>
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
            <span>生产损耗率</span>
            <el-input-number
              v-model="draft.productionLossRate"
              :min="1"
              :max="2"
              :step="0.01"
              :precision="2"
              controls-position="right"
              style="width: 100%"
            />
            <em class="field__hint">默认 1.05（+5%），可覆盖</em>
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
          </label>
        </div>
      </div>

      <div class="group">
        <p class="group__title">用途开关</p>
        <div class="grid">
          <label class="field field--switch">
            <span>用于 DIY 推荐</span>
            <el-switch v-model="draft.diyEnabled" />
            <em class="field__hint">关掉后不出现在制作单候选里</em>
          </label>
          <label class="field field--switch">
            <span>用于生产采购</span>
            <el-switch v-model="draft.procurementEnabled" />
            <em class="field__hint">关掉后下单不会当作实际采购原料</em>
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
            <em v-if="catalogCandidates.length > 0 && draft.labelNames.length === 0" class="field__hint">
              目录里可能是：{{ catalogCandidates.map((item) => item.name).join('、') }}（点上面自己选，不自动填）
            </em>
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ingredientApi, nutritionFoodApi } from '@/api/ingredients'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { supplementNutrientGroups, supplementUsageUnitOptions } from '@/constants/supplementNutrients'
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
import type { SupplementLabelIntakeDto } from '@/types/ingredientCreation'

/**
 * 建档：图变档案。
 *
 * 两张图只做一件事：把字读回来。字段映射与单位换算复用已有的
 * `patchFromPreview`（有单测），折算仍由服务端在写入时算。
 */
const props = defineProps<{
  draft: SupplementDraftValue
  /** 选品依据：形态结论、出处、选中商品与单价（人从 Skill 结论里粘过来） */
  selectionNote: string
  /** 父级记着的写入结果：返回这一步时不要再让人重复写一遍 */
  savedResult?: { ingredientId: string; nutritionFoodId: string; evidenceId: string } | null
}>()

const emit = defineEmits<{
  (event: 'update:selectionNote', value: string): void
  (
    event: 'saved',
    value: { ingredientId: string; nutritionFoodId: string; evidenceId: string; name?: string },
  ): void
  (event: 'go-launch'): void
}>()

const draft = props.draft
const selectionNote = computed({
  get: () => props.selectionNote,
  set: (value: string) => emit('update:selectionNote', value)
})
const activeSlot = ref<'front' | 'label' | null>(null)
const frontInput = ref<HTMLInputElement | null>(null)
const labelInput = ref<HTMLInputElement | null>(null)
const uploadingFront = ref(false)
const uploadingLabel = ref(false)
const reading = ref(false)
const readDone = ref(false)
const skipped = ref<string[]>([])
const catalogCandidates = ref<{ name: string; dogAllowed: boolean }[]>([])
const droppedHints = ref<{ field: string; reason: string; value: string }[]>([])
const diagnosticNotes = ref<string[]>([])
/** 模型抄回来的原文：字段为什么空着，看这里最快 */
const ocrText = ref<{ front: string; label: string }>({ front: '', label: '' })
const showAll = ref(false)
const saving = ref(false)
const confirming = ref(false)
const confirmed = ref(false)
const errorText = ref('')
const helpTextVisible = ref(false)

onMounted(() => {
  window.addEventListener('paste', onPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
})
const saved = ref<{ ingredientId: string; nutritionFoodId: string; evidenceId: string } | null>(
  props.savedResult ?? null
)

const unitOptions = supplementUsageUnitOptions
const tagSuggestions = ['矿物质', '维生素', '油脂类', '关节', '益生菌', '膳食纤维']

const baseUnitOptions = [
  { value: 'PCS', label: '个（粒/片/胶囊）', unit: '粒' },
  { value: 'G', label: '克（粉类）', unit: 'g' },
  { value: 'ML', label: '毫升（液体）', unit: 'ml' }
] as const

watch(
  () => draft.baseUnit,
  (value) => {
    const option = baseUnitOptions.find((item) => item.value === value)
    if (option) {
      draft.unitDisplayLabel = option.unit
    }
  }
)

const targetOptions = computed(() => {
  const options: Array<{ value: string; label: string; unit: string }> = []
  for (const group of supplementNutrientGroups) {
    for (const field of group.fields) {
      if (draft.servingNutrients[field.fieldPath] !== undefined) {
        options.push({
          value: field.fieldPath,
          label: `${group.title} · ${field.label}`,
          unit: field.unit
        })
      }
    }
  }
  return options
})

const hasAnyNutrient = computed(() => Object.keys(draft.servingNutrients).length > 0)

/**
 * 读出来之后只显示"真的有数"的字段，别让人在一屏空格子里找；
 * 一个都没读到时，退回显示常用字段，方便手填。
 */
const visibleGroups = computed(() => {
  const mode = showAll.value ? 'all' : hasAnyNutrient.value ? 'filled' : 'common'
  return supplementNutrientGroups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => {
        if (mode === 'all') return true
        if (mode === 'filled') return draft.servingNutrients[field.fieldPath] !== undefined
        return field.common
      })
    }))
    .filter((group) => group.fields.length > 0)
})

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

function activate(slot: 'front' | 'label'): void {
  activeSlot.value = slot
}

/**
 * 上传一张图到指定位置。
 *
 * 三个入口共用：点按钮选文件、直接 ⌘V 粘贴截图、把图片拖进来。
 */
async function acceptImage(slot: 'front' | 'label', file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('这不是图片文件')
    return
  }
  if (slot === 'front') {
    uploadingFront.value = true
  } else {
    uploadingLabel.value = true
  }
  try {
    const url = await upload(file)
    if (!url) {
      throw new Error('no url')
    }
    if (slot === 'front') {
      draft.evidence.frontImageUrl = url
    } else {
      draft.evidence.labelImageUrl = url
    }
    activeSlot.value = null
    await maybeRead()
  } catch {
    ElMessage.error('这张图没传上去，重试一次')
  } finally {
    uploadingFront.value = false
    uploadingLabel.value = false
  }
}

/** 粘贴时贴到哪一格：刚点过的那格 → 空的正面 → 空的标签 → 正面 */
function pasteTarget(): 'front' | 'label' {
  if (activeSlot.value) {
    return activeSlot.value
  }
  if (!draft.evidence.frontImageUrl) {
    return 'front'
  }
  if (!draft.evidence.labelImageUrl) {
    return 'label'
  }
  return 'front'
}

/**
 * 粘贴截图。
 *
 * 在输入框里粘贴文字不受影响：只处理剪贴板里带图片、且焦点不在文本框上的情况。
 */
async function onPaste(event: ClipboardEvent): Promise<void> {
  const target = event.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  ) {
    return
  }
  const items = Array.from(event.clipboardData?.items ?? [])
  const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'))
  const file = imageItem?.getAsFile()
  if (!file) {
    return
  }
  event.preventDefault()
  await acceptImage(pasteTarget(), file)
}

async function onDrop(slot: 'front' | 'label', event: DragEvent): Promise<void> {
  const file = event.dataTransfer?.files?.[0]
  if (!file) {
    return
  }
  await acceptImage(slot, file)
}

async function onFrontFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) {
    await acceptImage('front', file)
  }
}

async function onLabelFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) {
    await acceptImage('label', file)
  }
}

async function maybeRead(): Promise<void> {
  if (draft.evidence.frontImageUrl && draft.evidence.labelImageUrl) {
    await readImages()
  }
}

/**
 * 模型给出的判断（名称写化学形态、基准单位看剂型、渠道/价格从图上找、
 * 标签类型按目录性质定）。有值就覆盖规则推断的结果——这是"人只做判断"的那一半。
 */
function applyAnalysis(result: SupplementLabelIntakeDto): void {
  const analysis = result.analysis
  if (!analysis) {
    return
  }
  const setIf = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K] | null) => {
    if (value !== null && value !== undefined && value !== '') {
      draft[key] = value as (typeof draft)[K]
    }
  }
  setIf('name', analysis.name)
  setIf('brand', analysis.brand)
  // 规格统一在下面用 packSpec 覆盖，这里不直接用模型抄的标题
  setIf('purchaseChannel', analysis.purchaseChannel)
  setIf('baseUnit', analysis.baseUnit)
  setIf('unitDisplayLabel', analysis.unitDisplayLabel)
  setIf('physicalForm', analysis.physicalForm)
  setIf('servingUnitsPerDose', analysis.servingUnitsPerDose)
  // 规格用人看的写法（180粒/瓶，18mg铁/粒），不用模型抄的页面标题
  if (result.packSpec) {
    draft.productModel = result.packSpec
  }
  const price = analysis.priceCny ?? result.detectedPriceCny
  if (price !== null) {
    draft.currentPricePerPurchaseUnit = price
  }
  if (analysis.labelCategory) {
    draft.labelCategory = analysis.labelCategory
  }
  if (analysis.labelNames.length > 0) {
    draft.labelNames = analysis.labelNames
  }
  if (analysis.tagNames.length > 0) {
    draft.tagNames = analysis.tagNames
  }
  if (analysis.addTiming) {
    draft.addTiming = analysis.addTiming
  }
  if ((analysis.defaultTargetFields ?? []).length > 0) {
    draft.defaultTargetFields = analysis.defaultTargetFields
  }
  droppedHints.value = result.diagnostics?.dropped ?? analysis.dropped ?? []
}

/**
 * 能确定的东西一律先填好，人只做判断：
 * 名称、渠道、换算倍数、标签分类/时机、目录规范名、标签分组。
 *
 * 只在**空着**的时候填，绝不覆盖人已经改过的值。
 */
function applySuggestions(result: SupplementLabelIntakeDto): void {
  if (!draft.purchaseChannel.trim()) {
    draft.purchaseChannel = 'iHerb'
  }
  if (!draft.purchaseToBaseRatio && result.perBottleUnits) {
    draft.purchaseToBaseRatio = result.perBottleUnits
  }
  if (!draft.addTiming) {
    draft.addTiming = 'BEFORE_MIXING'
  }

  // 标签分组（矿物质/维生素/脂肪酸…）按营养素所在分组补一个
  const firstNutrient = result.nutrients[0]?.fieldPath ?? ''
  const group = supplementNutrientGroups.find((item) =>
    item.fields.some((field) => field.fieldPath === firstNutrient)
  )
  if (draft.tagNames.length === 0 && group) {
    draft.tagNames = [group.title]
  }

  // 目录能确定就填规范名；只能给候选时先留空，界面上列出候选让人选
  if (draft.labelNames.length === 0 && result.catalog.suggestion) {
    draft.labelNames = [result.catalog.suggestion.name]
    draft.labelCategory = 'FEED_ADDITIVE'
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

    applySuggestions(result)
    applyAnalysis(result)
    // 模型没给目标时，用"读到的营养素"兜底——建档门禁要求至少一个
    if (draft.defaultTargetFields.length === 0) {
      draft.defaultTargetFields = result.nutrients.map((item) => item.fieldPath)
    }

    skipped.value = skippedRows
    catalogCandidates.value = (result.catalog?.matches ?? []).map((item) => ({
      name: item.name,
      dogAllowed: item.dogAllowed
    }))
    readDone.value = true
    diagnosticNotes.value = result.diagnostics?.notes ?? []
    ocrText.value = { front: result.frontText ?? '', label: result.labelText ?? '' }
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
  return {
    source: 'SKILL',
    note: props.selectionNote.trim() || null,
    recordedAt: new Date().toISOString()
  }
}

async function submit(): Promise<void> {
  if (draft.defaultTargetFields.length === 0) {
    ElMessage.error('还没有默认目标营养素：先把标签上的营养素读出来，或手填含量')
    return
  }
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
    emit('saved', { ...result, name: draft.name.trim() })
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
.archive-step__block {
  padding: 10px 0;
  border-bottom: 1px solid #f2f4f6;
}
.archive-step__help {
  margin-bottom: 4px;
}
.wb-label {
  display: block;
  font-size: 12px;
  color: #5b6470;
  margin-bottom: 6px;
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
.upload-card--active {
  border-color: #3370ff;
  box-shadow: 0 0 0 2px rgba(51, 112, 255, 0.12);
}
.upload-card:focus {
  outline: none;
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
.upload-card__ocr {
  margin-top: 8px;
}
.upload-card__ocr-title {
  margin: 6px 0 4px;
  font-size: 12px;
  color: #5b6470;
}
.upload-card__ocr-text {
  max-height: 180px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  border-radius: 4px;
  background: #f7f8fa;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.upload-card__ocr-note {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: #9aa2ab;
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
.field--switch {
  flex-direction: row;
  align-items: center;
  gap: 8px;
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
