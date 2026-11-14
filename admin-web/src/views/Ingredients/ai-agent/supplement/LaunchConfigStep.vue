<template>
  <section class="launch-step" data-testid="launch-config-step">
    <header class="launch-step__head">
      <div>
        <h3>第 4 步 · 落地配置</h3>
        <p class="launch-step__desc">
          四段都要明确（参与 / 不参与），不能空着。这里调用的是补剂商品目录、原料档案、
          等价组三个既有入口，规则与那些页面完全一致。
        </p>
      </div>
      <span class="launch-step__progress">
        {{ missing.length ? `还差：${missing.join('、')}` : '四段都已明确' }}
      </span>
    </header>

    <el-alert
      v-if="loadError"
      type="error"
      :closable="false"
      show-icon
      class="launch-step__alert"
    >
      <span>{{ loadError }}</span>
      <el-button text size="small" @click="load">重试</el-button>
    </el-alert>

    <div v-loading="loading" class="launch-step__body">
      <!-- ① 商品档案 / 商城上架 -->
      <div class="launch-seg" :class="{ 'launch-seg--done': decisions.retail !== null }">
        <div class="launch-seg__head">
          <b>① 商品档案 / 商城上架</b>
          <el-tag :type="decisions.retail === null ? 'info' : 'success'" size="small" effect="plain">
            {{ decisions.retail === null ? '待确认' : decisions.retail ? '已上架' : '仅生产' }}
          </el-tag>
        </div>

        <SupplementArchivePanel
          v-if="row"
          :item="row"
          :saving="savingArchive"
          @save="saveArchive"
        />

        <div v-if="referencePrice !== null" class="launch-seg__row">
          <span class="launch-seg__label">参考售价</span>
          <span class="launch-seg__value">
            ¥{{ referencePrice }} / {{ row?.displayUnit }}
          </span>
          <span class="launch-seg__hint">
            进货成本 × {{ markupMultiplier }}，不含运费与服务费；最终价以下单页为准
          </span>
        </div>

        <div v-if="decisions.retail === false" class="launch-seg__row">
          <span class="launch-seg__label">不上架原因</span>
          <el-select
            v-model="decisions.noSaleReason"
            placeholder="必须选一个"
            style="width: 300px"
            size="small"
            @change="saveNoSaleReason"
          >
            <el-option
              v-for="reason in NO_SALE_REASONS"
              :key="reason.value"
              :label="reason.label"
              :value="reason.value"
            />
          </el-select>
          <span class="launch-seg__hint">会记在这条原料档案里，别人能看到</span>
        </div>
      </div>

      <!-- ② DIY 推荐 -->
      <div class="launch-seg" :class="{ 'launch-seg--done': decisions.diy !== null }">
        <div class="launch-seg__head">
          <b>② DIY 推荐</b>
          <el-tag :type="decisions.diy === null ? 'info' : 'success'" size="small" effect="plain">
            {{ decisions.diy === null ? '待确认' : decisions.diy ? '参与' : '不参与' }}
          </el-tag>
        </div>

        <div class="launch-seg__row">
          <span class="launch-seg__label">用于 DIY 推荐</span>
          <el-switch v-model="diyForm.enabled" />
          <span class="launch-seg__hint">关闭后这条补剂不会出现在制作单候选里</span>
        </div>

        <template v-if="diyForm.enabled">
          <div class="launch-seg__row">
            <span class="launch-seg__label">购买链接</span>
            <el-select v-model="diyForm.platform" size="small" style="width: 140px">
              <el-option
                v-for="option in LINK_PLATFORMS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <el-input
              v-model="diyForm.linkUrl"
              size="small"
              placeholder="商品链接或口令"
              style="width: 360px"
            />
          </div>
          <div class="launch-seg__row">
            <span class="launch-seg__label">产品图片</span>
            <el-input
              v-model="diyForm.imageUrl"
              size="small"
              placeholder="图片地址（用于制作单弹窗展示，可不填）"
              style="width: 360px"
            />
            <el-button
              size="small"
              :loading="fetchingPreview"
              :disabled="!diyForm.linkUrl.trim() || !canFetchFromLink"
              @click="fetchFromLink"
            >
              从链接抓取
            </el-button>
            <span v-if="!canFetchFromLink" class="launch-seg__hint">
              目前只支持 iHerb 链接抓取
            </span>
          </div>

          <div v-if="fetchError" class="launch-seg__row">
            <span class="launch-seg__label">抓取结果</span>
            <span class="launch-seg__warn">{{ fetchError }}</span>
          </div>

          <div
            v-if="fetchedImage || fetchedBrand || fetchedModel"
            class="launch-seg__row launch-ai"
          >
            <span class="launch-seg__label">抓取结果</span>
            <div class="launch-ai__list">
              <div v-if="fetchedImage" class="launch-ai__line">
                <span>主图已抓到（采用后会转存到我们自己的图床）</span>
                <el-button text size="small" :loading="adoptingImage" @click="adoptImage">
                  采用
                </el-button>
                <el-button text size="small" @click="fetchedImage = null">忽略</el-button>
              </div>
              <div v-if="fetchedBrand" class="launch-ai__line">
                <span>品牌：{{ fetchedBrand }}</span>
                <el-button text size="small" @click="adoptBrand">采用</el-button>
                <el-button text size="small" @click="fetchedBrand = null">忽略</el-button>
              </div>
              <div v-if="fetchedModel" class="launch-ai__line">
                <span>规格：{{ fetchedModel }}</span>
                <el-button text size="small" @click="adoptModel">采用</el-button>
                <el-button text size="small" @click="fetchedModel = null">忽略</el-button>
              </div>
            </div>
          </div>

          <div v-if="previousImageUrl !== null" class="launch-seg__row">
            <span class="launch-seg__label"></span>
            <el-button text size="small" @click="undoImage">撤销上次采用的主图</el-button>
          </div>
        </template>

        <div class="launch-seg__actions">
          <el-button
            size="small"
            type="primary"
            :loading="savingDiy"
            :disabled="!dataReady"
            @click="saveDiy"
          >
            保存本段并确认
          </el-button>
        </div>
      </div>

      <!-- ③ 生产采购 -->
      <div class="launch-seg" :class="{ 'launch-seg--done': decisions.procurement !== null }">
        <div class="launch-seg__head">
          <b>③ 生产采购</b>
          <el-tag
            :type="decisions.procurement === null ? 'info' : 'success'"
            size="small"
            effect="plain"
          >
            {{ decisions.procurement === null ? '待确认' : decisions.procurement ? '参与' : '不参与' }}
          </el-tag>
        </div>

        <div class="launch-seg__row">
          <span class="launch-seg__label">用于采购 / 生产</span>
          <el-switch v-model="procForm.enabled" />
          <span class="launch-seg__hint">关闭后，下单时不会把它当作生产实际采购的原料</span>
        </div>

        <div v-if="row" class="launch-seg__row">
          <span class="launch-seg__label">采购口径</span>
          <span class="launch-seg__value">
            {{ row.purchaseUnit }} · 1 {{ row.purchaseUnit }} = {{ row.purchaseToBaseRatio }}
            {{ row.displayUnit }} · 进货价 ¥{{ row.pricePerPurchaseUnit }}
          </span>
        </div>

        <div class="launch-seg__actions">
          <el-button
            size="small"
            type="primary"
            :loading="savingProc"
            :disabled="!dataReady"
            @click="saveProcurement"
          >
            保存本段并确认
          </el-button>
        </div>
      </div>

      <!-- ④ 等价组 -->
      <div class="launch-seg" :class="{ 'launch-seg--done': decisions.group !== null }">
        <div class="launch-seg__head">
          <b>④ 等价组</b>
          <el-tag :type="decisions.group === null ? 'info' : 'success'" size="small" effect="plain">
            {{ decisions.group === null ? '待确认' : groupChip }}
          </el-tag>
        </div>

        <div v-if="recommendations.length" class="launch-seg__row launch-recos">
          <span class="launch-seg__label">AI 推荐</span>
          <div class="launch-recos__list">
            <div v-for="item in recommendations" :key="item.groupId" class="launch-reco">
              <b>{{ item.name }}</b>
              <span class="launch-reco__reason">{{ item.reason }}</span>
              <el-button text size="small" @click="applyRecommendation(item)">采用</el-button>
            </div>
          </div>
        </div>

        <div class="launch-seg__row">
          <span class="launch-seg__label">归组</span>
          <el-select
            :model-value="groupChoice"
            placeholder="选择等价组，或暂不归组"
            size="small"
            style="width: 420px"
            @update:model-value="(value: any) => (groupChoice = value)"
          >
            <el-option :value="GROUP_SKIPPED" label="暂不归组（缺货时无法替换）" />
            <el-option
              v-for="group in selectableGroups"
              :key="group.id"
              :value="group.id"
              :label="`${group.name}（${group.nutrientLabel} · ${statusLabel(group.status)} · ${group.memberCount} 个成员）`"
            />
          </el-select>
        </div>

        <p v-if="selectedGroupHint" class="launch-seg__warn">{{ selectedGroupHint }}</p>

        <div class="launch-seg__actions">
          <el-button
            size="small"
            type="primary"
            :loading="savingGroup"
            :disabled="!dataReady"
            @click="saveGroup"
          >
            保存本段并确认
          </el-button>
        </div>
      </div>

      <!-- 结论 -->
      <div class="launch-verdict" :class="`launch-verdict--${verdict.level.toLowerCase()}`">
        <div class="launch-verdict__head">
          <b>{{ verdictTitle }}</b>
          <span class="launch-verdict__note">依据：后端「数据体检」结果</span>
        </div>
        <ul v-if="verdict.reasons.length" class="launch-verdict__reasons">
          <li v-for="reason in verdict.reasons" :key="reason">{{ reason }}</li>
        </ul>

        <div class="launch-preview">
          <span class="launch-preview__label">制作单里会显示</span>
          <span class="launch-preview__value">{{ previewText }}</span>
          <span class="launch-preview__note">（按已保存的配置估算）</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  supplementShopApi,
  type SupplementCatalogItem,
  type UpdateSupplementCatalogItemDto,
} from '@/api/supplementShop'
import {
  supplementEquivalenceApi,
  type EquivalenceGroupSummary,
} from '@/api/supplementEquivalence'
import { ingredientApi } from '@/api/ingredients'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { getApiErrorMessage, toastApiError } from '@/utils/apiError'
import SupplementArchivePanel from './SupplementArchivePanel.vue'
import { mergeIngredientProperties } from './mergeIngredientProperties'
import {
  GROUP_SKIPPED,
  NO_SALE_REASON_PROPERTY_KEY,
  NO_SALE_REASONS,
  describeSheetPreview,
  evaluateLaunch,
  missingDecisions,
  type LaunchDecisions,
  type NoSaleReason,
} from './launchConfigState'

const props = defineProps<{ ingredientId: string }>()

const LINK_PLATFORMS = [
  { value: 'TAOBAO', label: '淘宝/天猫' },
  { value: 'JD', label: '京东' },
  { value: 'PINDUODUO', label: '拼多多' },
  { value: 'IHERB', label: 'iHerb' },
  { value: 'OTHER', label: '其他链接' },
]

const loading = ref(false)
const loadError = ref('')
const row = ref<SupplementCatalogItem | null>(null)
const ingredient = ref<any>(null)
const groups = ref<EquivalenceGroupSummary[]>([])
// 商城配置没读到时按「关」处理：宁可少说能换，也不要高估
const equivalenceEnabled = ref(false)
const markupMultiplier = ref<number | null>(null)

const savingArchive = ref(false)
const savingDiy = ref(false)
const savingProc = ref(false)
const savingGroup = ref(false)
const fetchingPreview = ref(false)

const decisions = reactive<LaunchDecisions>({
  diy: null,
  procurement: null,
  retail: null,
  group: null,
  noSaleReason: null,
})

const groupChoice = ref<string>('')
const recommendations = ref<Array<{ groupId: string; name: string; reason: string }>>([])
const fetchingResult = reactive({
  image: null as string | null,
  brand: null as string | null,
  model: null as string | null,
  error: '',
})
const adoptingImage = ref(false)
const previousImageUrl = ref<string | null>(null)

const fetchedImage = computed({
  get: () => fetchingResult.image,
  set: (value: string | null) => (fetchingResult.image = value),
})
const fetchedBrand = computed({
  get: () => fetchingResult.brand,
  set: (value: string | null) => (fetchingResult.brand = value),
})
const fetchedModel = computed({
  get: () => fetchingResult.model,
  set: (value: string | null) => (fetchingResult.model = value),
})
const fetchError = computed(() => fetchingResult.error)

const canFetchFromLink = computed(() => diyForm.platform === 'IHERB')
const diyForm = reactive({ enabled: true, platform: 'IHERB', linkUrl: '', imageUrl: '' })
const procForm = reactive({ enabled: true })

let disposed = false
onBeforeUnmount(() => {
  disposed = true
})

/** 档案和原料详情都到齐才允许保存（否则合并 properties 会清掉原值） */
const dataReady = computed(() => Boolean(row.value && ingredient.value))

function savedProperties(): Record<string, any> {
  return (ingredient.value?.properties || {}) as Record<string, any>
}

function currentGroupId(): string {
  return row.value?.equivalenceGroup?.id || ''
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [catalog, detail, groupList, config] = await Promise.all([
      supplementShopApi.catalog(),
      ingredientApi.getDetail(props.ingredientId),
      supplementEquivalenceApi.listGroups({ pageSize: 200 }),
      supplementShopApi.getConfig().catch(() => null),
    ])
    if (disposed) return

    row.value = catalog.items.find((item) => item.id === props.ingredientId) || null
    ingredient.value = detail
    groups.value = groupList.items || []
    equivalenceEnabled.value = config?.equivalenceEnabled !== false
    markupMultiplier.value =
      typeof config?.markupMultiplier === 'number' && config.markupMultiplier > 0
        ? config.markupMultiplier
        : null

    const properties = savedProperties()
    diyForm.enabled = detail?.diyEnabled !== false
    procForm.enabled = detail?.procurementEnabled !== false
    diyForm.platform = properties?.purchase_link?.platform || 'IHERB'
    diyForm.linkUrl = properties?.purchase_link?.url || ''
    diyForm.imageUrl = properties?.image_url || ''

    // 四段按**已落库的真实值**回填，不再从 null 开始假装「0/4 已确认」
    decisions.diy = detail?.diyEnabled !== false
    decisions.procurement = detail?.procurementEnabled !== false
    decisions.retail = row.value?.supplementRetailEnabled === true
    decisions.group = currentGroupId() || null
    decisions.noSaleReason =
      (properties?.[NO_SALE_REASON_PROPERTY_KEY] as NoSaleReason | undefined) || null
    groupChoice.value = currentGroupId()

    if (!row.value) {
      loadError.value = '在补剂上架清单里没找到这条补剂，请刷新后重试'
    }

    // AI 推荐只做建议；失败不影响页面（退化为手动选组）
    void supplementEquivalenceApi
      .recommend(props.ingredientId)
      .then((result) => {
        if (disposed) return
        if (typeof result?.equivalenceEnabled === 'boolean') {
          equivalenceEnabled.value = result.equivalenceEnabled
        }
        recommendations.value = (result?.candidates || []).map((item) => ({
          groupId: item.groupId,
          name: item.name,
          reason: item.reason,
        }))
      })
      .catch(() => {
        if (!disposed) recommendations.value = []
      })
  } catch (error) {
    if (!disposed) loadError.value = getApiErrorMessage(error, '落地配置加载失败')
  } finally {
    if (!disposed) loading.value = false
  }
}

async function persistNoSaleReason(reason: NoSaleReason | null) {
  if (!dataReady.value) return
  const properties = mergeIngredientProperties(savedProperties(), {
    [NO_SALE_REASON_PROPERTY_KEY]: reason,
  })
  await ingredientApi.update(props.ingredientId, { properties } as any)
  ingredient.value = { ...(ingredient.value || {}), properties }
}

async function saveNoSaleReason() {
  try {
    await persistNoSaleReason(decisions.noSaleReason)
    ElMessage.success('不上架原因已保存')
  } catch (error) {
    toastApiError(error, '原因保存失败', (message) => ElMessage.error(message))
  }
}

async function saveArchive(patch: UpdateSupplementCatalogItemDto) {
  if (!row.value) {
    ElMessage.warning('数据还没加载成功，先点重试')
    return
  }
  savingArchive.value = true
  try {
    const updated = await supplementShopApi.updateItem(row.value.id, patch)
    if (disposed) return
    row.value = updated
    decisions.retail = updated.supplementRetailEnabled === true
    if (decisions.retail) {
      decisions.noSaleReason = null
      await persistNoSaleReason(null)
    }
    ElMessage.success(decisions.retail ? '已上架' : '已保存（未上架）')
  } catch (error) {
    // 后端在「上架但档案有 ERROR」时会回滚开关：必须把界面刷新成真实值
    await load()
    if (disposed) return
    toastApiError(error, '保存失败', (message) => ElMessage.error(message))
  } finally {
    savingArchive.value = false
  }
}

async function saveDiy() {
  if (!dataReady.value) {
    ElMessage.warning('数据还没加载成功，先点重试')
    return
  }
  savingDiy.value = true
  try {
    const purchaseLink = diyForm.linkUrl.trim()
      ? { platform: diyForm.platform, url: diyForm.linkUrl.trim() }
      : null
    const properties = mergeIngredientProperties(savedProperties(), {
      purchase_link: purchaseLink,
      image_url: diyForm.imageUrl.trim() || null,
    })

    await ingredientApi.update(props.ingredientId, {
      diyEnabled: diyForm.enabled,
      properties,
    } as any)

    if (disposed) return
    decisions.diy = diyForm.enabled
    ingredient.value = {
      ...(ingredient.value || {}),
      diyEnabled: diyForm.enabled,
      properties,
    }
    ElMessage.success('DIY 配置已保存')
  } catch (error) {
    toastApiError(error, '保存失败', (message) => ElMessage.error(message))
  } finally {
    savingDiy.value = false
  }
}

async function saveProcurement() {
  if (!dataReady.value) {
    ElMessage.warning('数据还没加载成功，先点重试')
    return
  }
  savingProc.value = true
  try {
    await ingredientApi.update(props.ingredientId, {
      procurementEnabled: procForm.enabled,
    })
    if (disposed) return
    decisions.procurement = procForm.enabled
    ingredient.value = { ...(ingredient.value || {}), procurementEnabled: procForm.enabled }
    ElMessage.success('采购配置已保存')
  } catch (error) {
    toastApiError(error, '保存失败', (message) => ElMessage.error(message))
  } finally {
    savingProc.value = false
  }
}

async function fetchFromLink() {
  const url = diyForm.linkUrl.trim()
  if (!url) {
    ElMessage.warning('先在上一行填商品链接')
    return
  }
  if (!canFetchFromLink.value) {
    ElMessage.warning('目前只支持 iHerb 链接自动抓取，其他平台请手动填')
    return
  }
  fetchingPreview.value = true
  fetchingResult.image = null
  fetchingResult.brand = null
  fetchingResult.model = null
  fetchingResult.error = ''
  try {
    const preview = await ingredientCreationApi.previewSupplementLink(url)
    if (disposed) return
    fetchingResult.image = preview.imageUrl || null
    fetchingResult.brand = preview.brand || null
    fetchingResult.model = preview.productModel || null
    if (!preview.imageUrl && !preview.brand && !preview.productModel) {
      fetchingResult.error = '这个链接没读出可用的品牌/规格/主图，请手动填'
    }
  } catch (error) {
    if (!disposed) {
      fetchingResult.error = getApiErrorMessage(error, '这个链接读不出来，可以手动填')
    }
  } finally {
    if (!disposed) fetchingPreview.value = false
  }
}

/** 采用抓到的图：先转存到我们自己的图床，再写进表单（可撤销） */
async function adoptImage() {
  if (!fetchedImage.value) return
  adoptingImage.value = true
  try {
    const response = await fetch(fetchedImage.value)
    if (!response.ok) throw new Error('download failed')
    const blob = await response.blob()
    const file = new File([blob], 'ai-diy-image.jpg', {
      type: blob.type || 'image/jpeg',
    })
    const uploaded: any = await ingredientApi.uploadIngredientDiyImage(file)
    const url = uploaded?.url || uploaded?.data?.url || ''
    if (!url) throw new Error('upload failed')
    previousImageUrl.value = diyForm.imageUrl
    diyForm.imageUrl = url
    fetchedImage.value = null
    ElMessage.success('主图已转存并填入，保存本段后生效')
  } catch {
    ElMessage.error('这张图没法自动转存，请手动上传')
  } finally {
    adoptingImage.value = false
  }
}

function undoImage() {
  diyForm.imageUrl = previousImageUrl.value ?? ''
  previousImageUrl.value = null
}

async function adoptBrand() {
  if (!fetchedBrand.value) return
  try {
    await ingredientApi.update(props.ingredientId, { brand: fetchedBrand.value })
    if (disposed) return
    if (row.value) row.value = { ...row.value, brand: fetchedBrand.value }
    ingredient.value = { ...(ingredient.value || {}), brand: fetchedBrand.value }
    fetchedBrand.value = null
    ElMessage.success('品牌已写入档案')
  } catch (error) {
    toastApiError(error, '品牌写入失败', (message) => ElMessage.error(message))
  }
}

async function adoptModel() {
  if (!fetchedModel.value) return
  try {
    await ingredientApi.update(props.ingredientId, { productModel: fetchedModel.value })
    if (disposed) return
    if (row.value) row.value = { ...row.value, productModel: fetchedModel.value }
    ingredient.value = { ...(ingredient.value || {}), productModel: fetchedModel.value }
    fetchedModel.value = null
    ElMessage.success('规格已写入档案')
  } catch (error) {
    toastApiError(error, '规格写入失败', (message) => ElMessage.error(message))
  }
}

/** 采用 AI 推荐的组：先确认它真的在可选列表里（列表可能被截断/已停用） */
function applyRecommendation(item: { groupId: string; name: string }) {
  if (!selectableGroups.value.some((group) => group.id === item.groupId)) {
    ElMessage.warning('这个组当前不可选（可能已停用或列表已截断），请手动选组')
    return
  }
  groupChoice.value = item.groupId
}

async function saveGroup() {
  if (!dataReady.value) {
    ElMessage.warning('数据还没加载成功，先点重试')
    return
  }
  if (!groupChoice.value) {
    ElMessage.warning('请选择等价组，或选「暂不归组」')
    return
  }

  const target = groups.value.find((item) => item.id === groupChoice.value)
  if (groupChoice.value !== GROUP_SKIPPED && target) {
    if (target.status === 'APPROVED') {
      try {
        await ElMessageBox.confirm(
          `「${target.name}」现在已经审核通过。加入新成员会把它打回「待审核」，` +
            '组内其他补剂也会暂时不参与替换，需要重新审核。确定加入吗？',
          '加入已审核的组',
          { type: 'warning', confirmButtonText: '仍然加入', cancelButtonText: '取消' },
        )
      } catch {
        return
      }
    }
  }

  savingGroup.value = true
  try {
    const previousGroupId = currentGroupId()
    if (groupChoice.value === GROUP_SKIPPED) {
      if (previousGroupId) {
        await supplementEquivalenceApi.removeMember(previousGroupId, props.ingredientId)
      }
      decisions.group = GROUP_SKIPPED
    } else {
      await supplementEquivalenceApi.assign([props.ingredientId], groupChoice.value)
      decisions.group = groupChoice.value
    }
    await load()
    if (disposed) return
    ElMessage.success('等价组已保存')
  } catch (error) {
    toastApiError(error, '保存失败', (message) => ElMessage.error(message))
  } finally {
    savingGroup.value = false
  }
}

const missing = computed(() => missingDecisions(decisions))

const issues = computed(() => row.value?.issues || [])

const selectableGroups = computed(() =>
  groups.value.filter((group) => group.status !== 'DISABLED'),
)

const verdict = computed(() =>
  evaluateLaunch({
    retailEnabled: row.value?.supplementRetailEnabled === true,
    issues: issues.value,
    // 用**已保存**的值，避免「输入框里刚敲了链接」就把结论改成没问题
    hasPurchaseLink: Boolean(savedProperties()?.purchase_link?.url),
    diyEnabled: ingredient.value?.diyEnabled !== false,
  }),
)

const verdictTitle = computed(() => {
  if (verdict.value.level === 'READY') return '✅ 顾客可以买'
  if (verdict.value.level === 'WARN') return '⚠️ 能买，但有需要补的'
  return '❌ 现在买不到'
})

/** 参考售价：只用「单位成本 × 加价倍率」，不含运费/服务费（P3） */
const referencePrice = computed(() => {
  const cost = row.value?.unitCost
  const markup = markupMultiplier.value
  if (typeof cost !== 'number' || !Number.isFinite(cost) || !markup) return null
  return Math.round(cost * markup * 100) / 100
})

const groupEffective = computed(() => {
  if (!equivalenceEnabled.value || !row.value?.equivalenceGroup) return false
  // 后端只要组不生效就会写 EQUIVALENCE_* 的 WARN，这里不另判一套
  return !issues.value.some(
    (issue) => issue.level === 'WARN' && issue.code.startsWith('EQUIVALENCE_'),
  )
})

const previewText = computed(() =>
  describeSheetPreview({
    diyEnabled: ingredient.value?.diyEnabled !== false,
    retailEnabled: row.value?.supplementRetailEnabled === true,
    hasError: issues.value.some((issue) => issue.level === 'ERROR'),
    groupEffective: groupEffective.value,
  }),
)

const groupChip = computed(() => {
  if (decisions.group === GROUP_SKIPPED) return '暂不归组'
  const group = groups.value.find((item) => item.id === decisions.group)
  return group ? group.name : '已归组'
})

const selectedGroupHint = computed(() => {
  if (groupChoice.value === GROUP_SKIPPED || !groupChoice.value) return ''
  const group = groups.value.find((item) => item.id === groupChoice.value)
  if (!group) return ''
  const recommended = recommendations.value.find((item) => item.groupId === group.id)
  if (recommended && /单位不一致|不参与替换/.test(recommended.reason)) {
    return recommended.reason
  }
  if (group.status !== 'APPROVED') {
    return `「${group.name}」还没审核通过：已归组，但暂不参与替换`
  }
  if (group.memberCount <= 1) {
    return `「${group.name}」只有 1 个成员：已归组，但暂不参与替换`
  }
  return ''
})

function statusLabel(status: string): string {
  if (status === 'APPROVED') return '已审核'
  if (status === 'PENDING_REVIEW') return '待审核'
  if (status === 'DISABLED') return '已停用'
  return '草稿'
}

onMounted(load)
</script>

<style scoped>
.launch-step {
  margin-top: 28px;
  padding: 20px 24px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
}
.launch-step__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.launch-step__head h3 {
  margin: 0 0 4px;
  font-size: 16px;
}
.launch-step__desc {
  margin: 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}
.launch-step__progress {
  flex: none;
  font-size: 12px;
  color: #606266;
  background: #f5f7fa;
  border-radius: 12px;
  padding: 4px 10px;
}
.launch-step__alert {
  margin-top: 12px;
}
.launch-step__body {
  margin-top: 16px;
}
.launch-seg {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 14px 16px;
  margin-bottom: 14px;
}
.launch-seg--done {
  border-color: #b3e19d;
}
.launch-seg__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.launch-seg__row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.launch-seg__label {
  width: 120px;
  flex: none;
  font-size: 13px;
  color: #606266;
}
.launch-seg__hint {
  font-size: 12px;
  color: #909399;
}
.launch-seg__value {
  font-size: 13px;
  color: #303133;
}
.launch-seg__warn {
  margin: 0 0 10px;
  font-size: 12px;
  color: #e6a23c;
}
.launch-seg__actions {
  display: flex;
  justify-content: flex-end;
}
.launch-verdict {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 6px;
  border: 1px solid #ebeef5;
  background: #fafafa;
}
.launch-verdict--ready {
  border-color: #b3e19d;
  background: #f0f9eb;
}
.launch-verdict--warn {
  border-color: #f3d19e;
  background: #fdf6ec;
}
.launch-verdict--blocked {
  border-color: #fab6b6;
  background: #fef0f0;
}
.launch-verdict__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.launch-verdict__note {
  font-size: 12px;
  color: #909399;
}
.launch-verdict__reasons {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #606266;
}
.launch-preview {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #dcdfe6;
  font-size: 13px;
}
.launch-preview__label {
  color: #909399;
  margin-right: 8px;
}
.launch-preview__value {
  font-weight: 600;
}
.launch-preview__note {
  margin-left: 8px;
  font-size: 12px;
  color: #c0c4cc;
}
.launch-seg__ai {
  font-size: 12px;
  color: #409eff;
}
.launch-ai__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.launch-ai__line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.launch-recos__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.launch-reco {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
.launch-reco__reason {
  color: #909399;
}
</style>
