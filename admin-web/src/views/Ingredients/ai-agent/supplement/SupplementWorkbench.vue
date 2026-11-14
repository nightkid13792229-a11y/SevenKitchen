<template>
  <div
    class="supplement-workbench"
    :class="{ 'supplement-workbench--with-launch': !!saved }"
  >
    <!-- 最左：对话。说的每一句都会真的落到右边表单上 -->
    <SupplementChat class="wb-chat" :draft="agentDraft" @apply-draft="applyAgentDraft" />

    <!-- 中栏：那瓶东西的真身。手动录入时这里是空的，但能贴链接、传图、抄原文 -->
    <aside class="wb-evidence">
      <div class="wb-evidence__head">
        <b>那瓶东西</b>
        <el-tag size="small" effect="plain" type="info">手动录入</el-tag>
      </div>

      <div class="wb-block">
        <label class="wb-label">商品链接</label>
        <div class="wb-link-row">
          <el-input
            v-model="draft.evidence.productUrl"
            placeholder="iHerb / 淘宝 / 京东，有就贴，没有也能填"
            clearable
          />
          <el-button
            :loading="reading"
            :disabled="!draft.evidence.productUrl.trim()"
            data-action="read-link"
            @click="readLink"
          >
            读这个链接
          </el-button>
        </div>
        <p v-if="previewSkipped.length > 0" class="wb-link-skipped">
          下面这些没自动填上，请照着标签手补：{{ previewSkipped.join('、') }}
        </p>
      </div>

      <div class="wb-block">
        <label class="wb-label">标签图片地址</label>
        <el-input
          v-model="draft.evidence.labelImageUrl"
          placeholder="上传后的图片地址"
          clearable
        />
      </div>

      <div class="wb-block wb-block--grow">
        <label class="wb-label">标签原文</label>
        <el-input
          v-model="draft.evidence.labelText"
          data-evidence="labelText"
          type="textarea"
          :rows="8"
          placeholder="把瓶子背面那段抄进来，尤其是 Serving Size 那一行"
        />
      </div>

      <p class="wb-hint">
        没有链接也能填。{{ draft.evidence.labelText ? '' : '标签原文空着也能存，但事后回查时只剩右边这些数字。' }}
      </p>
    </aside>

    <!-- 右栏：库里要记成的样子 -->
    <section class="wb-archive">
      <div class="wb-archive__head">
        <b>补剂档案</b>
        <el-button text size="small" data-action="open-compare" @click="compareOpen = true">
          比一比候选
        </el-button>
        <el-button
          v-if="pending.length > 0"
          text
          size="small"
          data-action="open-pending"
          @click="openPending"
        >
          待验证 {{ pending.length }} 条
        </el-button>
        <span class="wb-count">
          AI 会填 {{ aiFieldCount }} 项 · 待你定 {{ missingHuman.length }} 项
        </span>
      </div>

      <div class="wb-scroll">
        <div class="wb-group">
          <div class="wb-group__title">基本信息</div>
          <div class="wb-grid">
            <div class="wb-field">
              <label>原料名称</label>
              <el-input v-model="draft.name" placeholder="如：鱼油（Omega-3）" />
            </div>
            <div class="wb-field">
              <label>单位展示名</label>
              <el-select v-model="draft.unitDisplayLabel" data-anchor="baseUnit" style="width: 100%">
                <el-option
                  v-for="unit in supplementUsageUnitOptions"
                  :key="unit"
                  :label="unit"
                  :value="unit"
                />
              </el-select>
            </div>
            <div class="wb-field">
              <label>物理形态</label>
              <el-select v-model="draft.physicalForm" style="width: 100%">
                <el-option label="胶囊" value="CAPSULE" />
                <el-option label="片剂" value="TABLET" />
                <el-option label="粉剂" value="POWDER" />
                <el-option label="液体" value="LIQUID" />
              </el-select>
            </div>
            <div class="wb-field">
              <label>每份几粒</label>
              <el-input-number
                v-model="draft.servingUnitsPerDose"
                data-anchor="servingUnitsPerDose"
                :min="1"
                :precision="0"
                controls-position="right"
                style="width: 100%"
              />
            </div>
          </div>
        </div>

        <div class="wb-group">
          <div class="wb-group__title">商品与价格</div>
          <div class="wb-grid">
            <div class="wb-field">
              <label>产品品牌</label>
              <el-input v-model="draft.brand" placeholder="如：Nordic Naturals" />
            </div>
            <div class="wb-field">
              <label>产品规格</label>
              <el-input v-model="draft.productModel" placeholder="如：120 粒/瓶" />
            </div>
            <div class="wb-field">
              <label>采购渠道</label>
              <el-input v-model="draft.purchaseChannel" placeholder="iHerb / 淘宝 / 京东" />
            </div>
            <div class="wb-field">
              <label>采购单位</label>
              <el-input v-model="draft.purchaseUnit" placeholder="瓶" />
            </div>
            <div class="wb-field">
              <label>换算倍数</label>
              <el-input-number
                v-model="draft.purchaseToBaseRatio"
                :min="0.01"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
              <span class="wb-field__hint">1 个采购单位 = 多少{{ draft.unitDisplayLabel }}</span>
            </div>
            <div class="wb-field">
              <label>当前采购价</label>
              <p v-if="priceHint" class="wb-price-hint">{{ priceHint }}</p>
              <el-input-number
                v-model="draft.currentPricePerPurchaseUnit"
                data-anchor="purchasePricePerPurchaseUnit"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </div>
          </div>
        </div>

        <!-- 待你定：永远展开、标黄 -->
        <div class="wb-group wb-group--needs">
          <div class="wb-group__title">
            <span class="wb-need-dot"></span>这几项 AI 不替你定（标签类型与名称以后由 AI 查目录预填）
          </div>
          <div class="wb-grid">
            <div class="wb-field">
              <label>标签分类</label>
              <el-select
                v-model="draft.tagNames"
                multiple
                filterable
                allow-create
                default-first-option
                placeholder="选或直接输入"
                style="width: 100%"
              >
                <el-option
                  v-for="tag in tagSuggestions"
                  :key="tag"
                  :label="tag"
                  :value="tag"
                />
              </el-select>
            </div>
            <div class="wb-field">
              <label>添加时机</label>
              <el-select v-model="draft.addTiming" placeholder="请选择" style="width: 100%">
                <el-option label="制作中" value="BEFORE_MIXING" />
                <el-option label="随餐" value="BEFORE_MEAL" />
              </el-select>
            </div>
            <div class="wb-field">
              <label>标签类型</label>
              <el-select v-model="draft.labelCategory" placeholder="请选择" style="width: 100%">
                <el-option label="饲料原料" value="FEED_MATERIAL" />
                <el-option label="饲料添加剂" value="FEED_ADDITIVE" />
              </el-select>
            </div>
            <div class="wb-field">
              <label>标签名称</label>
              <el-select
                v-model="draft.labelNames"
                multiple
                filterable
                remote
                allow-create
                default-first-option
                :remote-method="searchCatalog"
                :loading="catalogLoading"
                placeholder="按目录规范名填，不带剂型"
                style="width: 100%"
              >
                <el-option
                  v-for="item in catalogOptions"
                  :key="item.name"
                  :label="item.name"
                  :value="item.name"
                >
                  <span>{{ item.name }}</span>
                  <span class="wb-option-note">
                    {{ item.dogAllowed ? '可用于犬' : '范围不含犬' }}
                  </span>
                </el-option>
              </el-select>
              <p v-if="catalogHint" class="wb-catalog-hint">{{ catalogHint }}</p>
            </div>
          </div>
        </div>

        <!-- 营养：人抄每份的值，系统折成每粒 -->
        <div class="wb-group">
          <div class="wb-group__title">
            营养档案（每 1 {{ draft.unitDisplayLabel }}）
            <el-checkbox v-model="showAllNutrients" style="margin-left: auto">显示全部字段</el-checkbox>
          </div>
          <div v-for="group in visibleNutrientGroups" :key="group.key" class="wb-nutrient-group">
            <div class="wb-nutrient-group__title">{{ group.title }}</div>
            <div class="wb-grid">
              <div v-for="field in group.fields" :key="field.fieldPath" class="wb-field">
                <label>{{ field.label }}</label>
                <div class="wb-split">
                  <el-input-number
                    :model-value="draft.servingNutrients[field.fieldPath]"
                    :min="0"
                    :precision="4"
                    :controls="false"
                    placeholder="每份"
                    style="width: 100%"
                    @update:model-value="(value: number | undefined) => setServing(field.fieldPath, value)"
                  />
                  <span class="wb-split__calc">
                    ÷ {{ draft.servingUnitsPerDose ?? '?' }} =
                    {{ perUnitPreview(field.fieldPath) }} {{ field.unit }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 门禁条 -->
      <div class="wb-gates">
        <div class="wb-gates__items">
          <span
            v-for="gate in gateReport.items"
            :key="gate.key"
            class="wb-gate"
            :class="gate.passed ? 'wb-gate--ok' : 'wb-gate--bad'"
            :title="gate.detail"
            @click="focusGate(gate.anchor)"
          >
            {{ gate.passed ? '✓' : '⚠' }} {{ gate.label }}
            <em v-if="!gate.passed" class="wb-gate__why">{{ gate.detail }}</em>
          </span>
        </div>
        <div class="wb-gates__actions">
          <span v-if="errorText" class="wb-error">{{ errorText }}</span>
          <el-button :disabled="!canSubmit" data-action="submit" :loading="saving" @click="submit">
            核验并写入
          </el-button>
        </div>
      </div>

      <!-- 写入后才出现 -->
      <div v-if="saved" class="wb-saved">
        <span>{{ confirmed ? '已确认，配方里现在能选到这条补剂' : '已写入，营养档案是「待验证」，配方里还选不到' }}</span>
        <el-button
          v-if="!confirmed"
          type="primary"
          size="small"
          data-action="confirm"
          :loading="confirming"
          @click="confirm"
        >
          确认可用
        </el-button>
      </div>
    </section>

    <!--
      第 4 步：落地配置（2026-11-14）——写完才展开，四段必须表态。
      刻意放在三栏之外、占满整行：三栏容器是固定高度 + overflow:hidden，
      塞进去会把右边档案栏压扁、下面内容被裁掉（2026-11-14 复审 Critical）。
    -->
    <LaunchConfigStep
      v-if="saved"
      class="wb-launch"
      :ingredient-id="saved.ingredientId"
    />

    <el-drawer v-model="compareOpen" title="比一比候选" size="760px">
      <SupplementCompare @use="adoptCandidate" />
    </el-drawer>

    <el-drawer v-model="pendingOpen" title="待验证的补剂档案" size="460px">
      <p class="wb-drawer__hint">
        这些档案已经写进库，但还没确认可用，所以配方里选不到。确认后才会进配方。
      </p>
      <div v-for="row in pending" :key="row.nutritionFoodId" class="wb-pending">
        <div class="wb-pending__main">
          <b>{{ row.name }}</b>
          <span class="wb-pending__time">{{ formatTime(row.createdAt) }}</span>
        </div>
        <div class="wb-pending__actions">
          <el-button
            v-if="row.ingredientId"
            text
            size="small"
            @click="loadEvidence(row.ingredientId)"
          >
            看标签
          </el-button>
          <el-button type="primary" size="small" @click="confirmRow(row)">确认可用</el-button>
        </div>
        <div v-if="evidence && evidence.ingredientId === row.ingredientId" class="wb-evidence">
          <div>每份 {{ evidence.servingUnitsPerDose }} {{ draft.unitDisplayLabel }}</div>
          <a v-if="evidence.productUrl" :href="evidence.productUrl" target="_blank" rel="noreferrer">
            商品链接
          </a>
          <pre v-if="evidence.labelText" class="wb-evidence__text">{{ evidence.labelText }}</pre>
          <el-image
            v-if="evidence.labelImageUrl"
            :src="evidence.labelImageUrl"
            :preview-src-list="[evidence.labelImageUrl]"
            fit="cover"
            style="width: 120px; height: 120px; border-radius: 6px"
          />
          <span v-if="!evidence.labelText && !evidence.labelImageUrl" class="wb-evidence__empty">
            这条没有留下标签
          </span>
        </div>
      </div>
      <el-empty v-if="pending.length === 0" description="没有待验证的补剂档案" :image-size="60" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import SupplementCompare from './SupplementCompare.vue'
import SupplementChat from './SupplementChat.vue'
import { ingredientCatalogApi, type FeedAdditiveMatch } from '@/api/ingredientCatalog'
import { nutritionFoodApi } from '@/api/ingredients'
import type {
  PendingSupplementArchiveDto,
  SupplementEvidenceDto
} from '@/types/ingredientCreation'
import { supplementUsageUnitOptions, supplementNutrientGroups } from '@/constants/supplementNutrients'
import { applyAgentDraft as applyAgentDraftPayload } from './agentDraftApply'
import { SUPPLEMENT_CARD_FIELDS } from '@/constants/supplementCardFields'
import { evaluateSupplementGates } from './supplementGates'
import LaunchConfigStep from './LaunchConfigStep.vue'
import {
  computePerUnit,
  emptySupplementDraft,
  findMissingHumanFields,
  patchFromPreview,
  toCreatePayload,
  toGateInput,
  type SupplementDraftValue
} from './supplementFormState'

const emit = defineEmits<{
  (event: 'saved', payload: { ingredientId: string; nutritionFoodId: string; evidenceId: string }): void
}>()

const draft = reactive<SupplementDraftValue>(emptySupplementDraft())
const showAllNutrients = ref(false)
const saving = ref(false)
const confirming = ref(false)
const errorText = ref('')
const saved = ref<{ ingredientId: string; nutritionFoodId: string; evidenceId: string } | null>(null)
const confirmed = ref(false)
const pending = ref<PendingSupplementArchiveDto[]>([])
const pendingOpen = ref(false)
const evidence = ref<SupplementEvidenceDto | null>(null)
const reading = ref(false)
const previewSkipped = ref<string[]>([])
const catalogOptions = ref<FeedAdditiveMatch[]>([])
const catalogLoading = ref(false)
const catalogHint = ref('')
const compareOpen = ref(false)
const priceHint = ref('')

const tagSuggestions = ['油脂类', '矿物质', '维生素', '益生菌', '关节', '膳食纤维']

const aiFieldCount = computed(
  () => SUPPLEMENT_CARD_FIELDS.filter((field) => field.owner === 'AI').length
)
const missingHuman = computed(() => findMissingHumanFields(draft))
const gateReport = computed(() => evaluateSupplementGates(toGateInput(draft)))
const canSubmit = computed(
  () => !!toCreatePayload(draft) && gateReport.value.passed && !saving.value && !saved.value
)

const visibleNutrientGroups = computed(() =>
  supplementNutrientGroups
    .map((group) => ({
      ...group,
      fields: showAllNutrients.value ? group.fields : group.fields.filter((field) => field.common)
    }))
    .filter((group) => group.fields.length > 0)
)

function focusGate(anchor: string): void {
  const el = document.querySelector(`[data-anchor="${anchor}"]`)
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

/** 后端把原因放在 body.message 里；axios 的 error.message 只有状态码。 */
function apiErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: { message?: unknown } } })?.response?.data
  const message = body?.message
  if (typeof message === 'string' && message.trim()) {
    return message
  }
  if (Array.isArray(message) && message.length > 0) {
    return message.join('；')
  }
  return fallback
}

function setServing(fieldPath: string, value: number | undefined): void {
  if (value === undefined || !Number.isFinite(value)) {
    delete draft.servingNutrients[fieldPath]
    return
  }
  draft.servingNutrients[fieldPath] = value
}

const perUnitPreview = (fieldPath: string): string => {
  const value = computePerUnit(
    draft.servingNutrients,
    draft.servingUnitsPerDose,
    draft.perUnitOverrides
  )[fieldPath]
  return value === undefined ? '—' : String(Math.round(value * 10000) / 10000)
}

onMounted(() => {
  void refreshPending()
})

async function refreshPending(): Promise<void> {
  try {
    pending.value = await ingredientCreationApi.listPendingSupplements()
  } catch {
    pending.value = []
  }
}

function openPending(): void {
  pendingOpen.value = true
  void refreshPending()
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN')
}

async function loadEvidence(ingredientId: string): Promise<void> {
  try {
    evidence.value = await ingredientCreationApi.getSupplementEvidence(ingredientId)
  } catch {
    evidence.value = null
  }
}

async function confirmRow(row: PendingSupplementArchiveDto): Promise<void> {
  try {
    await nutritionFoodApi.verify(row.nutritionFoodId)
    ElMessage.success('已确认可用，配方里现在能选到这条补剂')
    await refreshPending()
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, '确认失败，请稍后重试'))
  }
}

/** 标签名称：只查规范写法与适用范围，不做选品判断。 */
async function searchCatalog(keyword: string): Promise<void> {
  const q = keyword.trim()
  if (!q) {
    catalogOptions.value = []
    catalogHint.value = ''
    return
  }
  catalogLoading.value = true
  try {
    const result = await ingredientCatalogApi.lookupFeedAdditives(q)
    catalogOptions.value = result.matches
    if (result.matches.length === 0) {
      catalogHint.value = `目录（${result.summary.total} 个品种）里查不到「${q}」，请核对写法，或者先手填、事后补`
    } else if (!result.matches.some((item) => item.dogAllowed)) {
      catalogHint.value = '目录里查到了，但适用范围不含犬——印标签前先确认'
    } else {
      catalogHint.value = ''
    }
  } catch {
    catalogOptions.value = []
    catalogHint.value = '目录暂时查不了，可以手填'
  } finally {
    catalogLoading.value = false
  }
}

/** 对话里读到的那瓶：走和"读这个链接"同一条填表路径。 */
function applyPreview(preview: {
  productUrl: string
  pagePriceCny?: number | null
  productName: string | null
  servingUnitsPerDose: number | null
  nutrients: { fieldPath: string; value: number; unit: string; rawName: string }[]
  unrecognized: string[]
  labelText: string | null
}) {
  const { patch, skipped } = patchFromPreview({
    productUrl: preview.productUrl,
    productName: preview.productName,
    servingUnitsPerDose: preview.servingUnitsPerDose,
    nutrients: preview.nutrients,
    unrecognized: preview.unrecognized,
    labelText: preview.labelText
  })
  if (patch.name && !draft.name.trim()) {
    draft.name = patch.name
  }
  draft.evidence.productUrl = preview.productUrl
  // 和「读这个链接」同一套：换一瓶就整份替换，读不到就清空，不沿用上一瓶的除数
  draft.servingUnitsPerDose = patch.servingUnitsPerDose ?? null
  draft.servingNutrients = { ...(patch.servingNutrients ?? {}) }
  draft.perUnitOverrides = {}
  draft.evidence.labelText = patch.evidence?.labelText ?? ''
  previewSkipped.value = skipped
  applyPagePrice(preview.pagePriceCny)
}

/** 页面标价是人民币，空着就带上；已经填了的不覆盖（人填的优先）。 */
function applyPagePrice(price: number | null | undefined): void {
  if (typeof price === 'number' && price > 0 && !draft.currentPricePerPurchaseUnit) {
    draft.currentPricePerPurchaseUnit = price
    priceHint.value = `采购价按页面标价 ¥${price} 填的，请核对（运费/汇率另算）`
  }
}

/** 交给模型的草稿快照：它可写的字段都在这里。 */
const agentDraft = computed<Record<string, unknown>>(() => ({
  name: draft.name,
  brand: draft.brand,
  productModel: draft.productModel,
  purchaseChannel: draft.purchaseChannel,
  unitDisplayLabel: draft.unitDisplayLabel,
  physicalForm: draft.physicalForm,
  servingUnitsPerDose: draft.servingUnitsPerDose,
  purchaseUnit: draft.purchaseUnit,
  purchaseToBaseRatio: draft.purchaseToBaseRatio,
  currentPricePerPurchaseUnit: draft.currentPricePerPurchaseUnit,
  addTiming: draft.addTiming,
  productionLossRate: draft.productionLossRate,
  tagNames: draft.tagNames,
  labelCategory: draft.labelCategory,
  labelNames: draft.labelNames,
  labelNameSource: draft.labelNameSource,
  servingNutrients: { ...draft.servingNutrients }
}))

/** 只按后端给的 applied 清单回写：模型没写的字段（含用户刚手填的）一律不碰。 */
function applyAgentDraft(payload: {
  draft: Record<string, unknown>
  applied: string[]
}): void {
  applyAgentDraftPayload(draft as unknown as Record<string, unknown>, payload)
}

function setServingUnits(value: number): void {
  draft.servingUnitsPerDose = value
}

/** 从对比里挑中一个：把名字、采购价、换算倍数带回表单，其它还是人填。 */
function adoptCandidate(payload: { name: string; price: number | null; units: number | null }): void {
  if (payload.name && !draft.name.trim()) {
    draft.name = payload.name
  }
  if (payload.price && payload.price > 0) {
    draft.currentPricePerPurchaseUnit = payload.price
  }
  if (payload.units && payload.units > 0) {
    draft.purchaseToBaseRatio = payload.units
  }
  compareOpen.value = false
  ElMessage.success('已把选中的那个带进表单，剩下的照标签补')
}

async function readLink(): Promise<void> {
  const url = draft.evidence.productUrl.trim()
  if (!url) {
    return
  }
  reading.value = true
  previewSkipped.value = []
  errorText.value = ''
  try {
    const preview = await ingredientCreationApi.previewSupplementLink(url)
    const { patch, skipped } = patchFromPreview(preview)
    if (patch.name && !draft.name.trim()) {
      draft.name = patch.name
    }
    // 换一个链接就是换一瓶东西：整份替换，不和上一瓶的数字混在一起
    draft.servingUnitsPerDose = patch.servingUnitsPerDose ?? null
    draft.servingNutrients = { ...(patch.servingNutrients ?? {}) }
    draft.perUnitOverrides = {}
    draft.evidence.labelText = patch.evidence?.labelText ?? ''
    previewSkipped.value = skipped
    ElMessage.success(
      Object.keys(patch.servingNutrients ?? {}).length > 0
        ? '读到了，核对一下每份几粒和数字'
        : '页面读到了，但没认出成分表，请手动填',
    )
  } catch (error) {
    errorText.value = apiErrorMessage(error, '这个链接读不出来，请手动填')
  } finally {
    reading.value = false
  }
}

async function submit(): Promise<void> {
  const payload = toCreatePayload(draft)
  if (!payload) {
    return
  }
  saving.value = true
  errorText.value = ''
  try {
    const result = await ingredientCreationApi.createSupplement(payload)
    saved.value = result
    emit('saved', {
      ingredientId: result.ingredientId,
      nutritionFoodId: result.nutritionFoodId,
      evidenceId: result.evidenceId
    })
    await refreshPending()
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
  errorText.value = ''
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
</script>

<style scoped>
.supplement-workbench {
  display: grid;
  grid-template-columns: 300px 320px minmax(0, 1fr);
  gap: 12px;
  /* 必须给一个确定高度：否则三栏会被右边档案撑开，
     对话输入框被顶到页面最底下，正文也滚不动 */
  height: calc(100vh - 220px);
  min-height: 620px;
}

/*
  第 4 步占满整行（2026-11-14 复审修复）。
  容器本身改成 auto 才能长出第四行；三栏各自保留原来的高度，
  否则它们会被拉伸到与第 4 步同高、出现大片空白。
*/
.supplement-workbench--with-launch {
  height: auto;
}
.supplement-workbench--with-launch .wb-chat,
.supplement-workbench--with-launch .wb-evidence,
.supplement-workbench--with-launch .wb-archive {
  height: calc(100vh - 220px);
  min-height: 620px;
}
.wb-launch {
  grid-column: 1 / -1;
  min-width: 0;
}

@media (max-width: 1280px) {
  .supplement-workbench {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }
  .supplement-workbench--with-launch .wb-chat,
  .supplement-workbench--with-launch .wb-evidence,
  .supplement-workbench--with-launch .wb-archive {
    height: auto;
    min-height: 0;
  }
}
.wb-chat {
  min-height: 0;
}
.wb-evidence,
.wb-archive {
  background: #fff;
  border: 1px solid #e3e6ea;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.wb-evidence__head,
.wb-archive__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #eef0f3;
  font-size: 13px;
}
.wb-count {
  margin-left: auto;
  font-size: 12px;
  color: #8a9099;
}
.wb-block {
  padding: 10px 12px 0;
}
.wb-link-row{display:flex;gap:8px;align-items:center}
.wb-option-note{float:right;font-size:11px;color:#9aa2ab}
.wb-price-hint{margin:0 0 4px;font-size:11px;color:#8a9099}
.wb-catalog-hint{margin:4px 0 0;font-size:11px;color:#b26a00;line-height:1.5}
.wb-link-skipped{margin:6px 0 0;font-size:11px;color:#b26a00;line-height:1.5}
.wb-block--grow {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.wb-label {
  display: block;
  font-size: 12px;
  color: #5b6470;
  margin-bottom: 6px;
}
.wb-hint {
  padding: 10px 12px;
  font-size: 12px;
  color: #8a9099;
  line-height: 1.6;
}
.wb-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 12px 12px;
  min-height: 0;
}
.wb-group {
  padding: 10px 0;
  border-bottom: 1px solid #f2f4f6;
}
.wb-group--needs {
  background: #fffdf8;
  border: 1px solid #f0d9a8;
  border-radius: 8px;
  padding: 10px;
  margin: 10px 0;
}
.wb-group__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 8px;
}
.wb-need-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e8a33d;
}
.wb-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}
.wb-field label {
  display: block;
  font-size: 12px;
  color: #5b6470;
  margin-bottom: 4px;
}
.wb-field__hint {
  font-size: 11px;
  color: #9aa2ab;
}
.wb-split {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wb-split__calc {
  flex: 0 0 auto;
  font-size: 11px;
  color: #8a9099;
  min-width: 78px;
}
.wb-nutrient-group__title {
  font-size: 12px;
  color: #8a9099;
  margin: 8px 0 6px;
}
.wb-gates {
  border-top: 1px solid #eef0f3;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fafbfc;
}
.wb-gates__items {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.wb-gate {
  font-size: 11.5px;
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid #cfe7db;
  background: #f6fdfa;
  color: #0f7a54;
}
.wb-gate__why{display:block;font-size:10.5px;margin-top:2px;opacity:.85}
.wb-gate--bad {
  border-color: #f0d9a8;
  background: #fff6e8;
  color: #b26a00;
}
.wb-gates__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.wb-error {
  font-size: 12px;
  color: #b4232a;
  max-width: 320px;
}
.wb-drawer__hint{font-size:12px;color:#8a9099;line-height:1.6;margin-bottom:10px}
.wb-pending{border-bottom:1px solid #f2f4f6;padding:10px 0}
.wb-pending__main{display:flex;align-items:baseline;gap:8px}
.wb-pending__time{margin-left:auto;font-size:11px;color:#9aa2ab}
.wb-pending__actions{display:flex;justify-content:flex-end;gap:6px;margin-top:6px}
.wb-evidence{margin-top:8px;background:#fafbfc;border:1px solid #eef0f3;border-radius:6px;padding:8px;font-size:12px;color:#5b6470;display:flex;flex-direction:column;gap:6px}
.wb-evidence__text{margin:0;white-space:pre-wrap;font-family:inherit;font-size:11.5px;color:#6b7280;max-height:120px;overflow:auto}
.wb-evidence__empty{color:#9aa2ab}
.wb-saved {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f6fdfa;
  border-top: 1px solid #cfe7db;
  font-size: 12.5px;
  color: #0f7a54;
}
</style>
