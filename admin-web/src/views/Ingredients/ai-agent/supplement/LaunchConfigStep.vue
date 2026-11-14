<template>
  <section class="launch-step" data-testid="launch-config-step">
    <header class="launch-step__head">
      <div>
        <h3>第 4 步 · 落地配置</h3>
        <p class="launch-step__desc">
          四段都要表态（参与 / 不参与），不能空着。这里调用的是补剂商品目录、原料档案、
          等价组三个既有入口，规则与那些页面完全一致。
        </p>
      </div>
      <span class="launch-step__progress">{{ confirmedCount }}/4 段已确认</span>
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

        <div v-if="decisions.retail === false" class="launch-seg__row">
          <span class="launch-seg__label">不上架原因</span>
          <el-select
            v-model="decisions.noSaleReason"
            placeholder="必须选一个"
            style="width: 300px"
            size="small"
          >
            <el-option
              v-for="reason in NO_SALE_REASONS"
              :key="reason.value"
              :label="reason.label"
              :value="reason.value"
            />
          </el-select>
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
          <span class="launch-seg__hint">
            关闭后这条补剂不会出现在制作单候选里
          </span>
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
            <span class="launch-seg__hint">
              P2 会支持从商品链接自动抓取
            </span>
          </div>
        </template>

        <div class="launch-seg__actions">
          <el-button size="small" type="primary" :loading="savingDiy" @click="saveDiy">
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
          <span class="launch-seg__hint">
            关闭后，下单时不会把它当作生产实际采购的原料
          </span>
        </div>

        <div v-if="row" class="launch-seg__row">
          <span class="launch-seg__label">采购口径</span>
          <span class="launch-seg__value">
            {{ row.purchaseUnit }} · 1 {{ row.purchaseUnit }} = {{ row.purchaseToBaseRatio }}
            {{ row.displayUnit }} · 进货价 ¥{{ row.pricePerPurchaseUnit }}
          </span>
        </div>

        <div class="launch-seg__actions">
          <el-button size="small" type="primary" :loading="savingProc" @click="saveProcurement">
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

        <div class="launch-seg__row">
          <span class="launch-seg__label">归组</span>
          <el-select
            :model-value="groupChoice"
            placeholder="选择等价组，或暂不归组"
            size="small"
            style="width: 360px"
            @update:model-value="(value: any) => (groupChoice = value)"
          >
            <el-option :value="GROUP_SKIPPED" label="暂不归组（缺货时无法替换）" />
            <el-option
              v-for="group in groups"
              :key="group.id"
              :value="group.id"
              :label="`${group.name}（${statusLabel(group.status)} · ${group.memberCount} 个成员）`"
            />
          </el-select>
        </div>

        <p v-if="selectedGroupHint" class="launch-seg__warn">{{ selectedGroupHint }}</p>

        <div class="launch-seg__actions">
          <el-button size="small" type="primary" :loading="savingGroup" @click="saveGroup">
            保存本段并确认
          </el-button>
        </div>
      </div>

      <!-- 结论 -->
      <div class="launch-verdict" :class="`launch-verdict--${verdict.level.toLowerCase()}`">
        <div class="launch-verdict__head">
          <b>{{ verdictTitle }}</b>
          <span v-if="missing.length" class="launch-verdict__missing">
            还差：{{ missing.join('、') }}
          </span>
        </div>
        <ul v-if="verdict.reasons.length" class="launch-verdict__reasons">
          <li v-for="reason in verdict.reasons" :key="reason">{{ reason }}</li>
        </ul>

        <div class="launch-preview">
          <span class="launch-preview__label">制作单里会显示</span>
          <span class="launch-preview__value">{{ previewText }}</span>
          <span class="launch-preview__note">（按当前配置估算）</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  supplementShopApi,
  type SupplementCatalogItem,
  type UpdateSupplementCatalogItemDto,
} from '@/api/supplementShop'
import { supplementEquivalenceApi, type EquivalenceGroupSummary } from '@/api/supplementEquivalence'
import { ingredientApi } from '@/api/ingredients'
import SupplementArchivePanel from './SupplementArchivePanel.vue'
import { mergeIngredientProperties } from './mergeIngredientProperties'
import {
  GROUP_SKIPPED,
  NO_SALE_REASONS,
  describeSheetPreview,
  evaluateLaunch,
  missingDecisions,
  type LaunchDecisions,
} from './launchConfigState'

type CatalogRow = SupplementCatalogItem & {
  equivalenceGroup?: {
    id: string
    code: string
    name: string
    status: string
    isActive: boolean
    memberCount: number
  } | null
}

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
const row = ref<CatalogRow | null>(null)
const ingredient = ref<any>(null)
const groups = ref<EquivalenceGroupSummary[]>([])

const savingArchive = ref(false)
const savingDiy = ref(false)
const savingProc = ref(false)
const savingGroup = ref(false)

const decisions = reactive<LaunchDecisions>({
  diy: null,
  procurement: null,
  retail: null,
  group: null,
  noSaleReason: null,
})

const groupChoice = ref<string>('')
const diyForm = reactive({
  enabled: true,
  platform: 'IHERB',
  linkUrl: '',
  imageUrl: '',
})
const procForm = reactive({ enabled: true })

function errorMessage(error: unknown, fallback: string): string {
  const anyError = error as any
  return anyError?.response?.data?.message || anyError?.message || fallback
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [catalog, detail, groupList] = await Promise.all([
      supplementShopApi.catalog(),
      ingredientApi.getDetail(props.ingredientId),
      supplementEquivalenceApi.listGroups({ pageSize: 200 }),
    ])

    row.value = (catalog.items.find((item) => item.id === props.ingredientId) as CatalogRow) || null
    ingredient.value = detail
    groups.value = groupList.items || []

    const properties = (detail?.properties || {}) as Record<string, any>
    diyForm.enabled = detail?.diyEnabled !== false
    procForm.enabled = detail?.procurementEnabled !== false
    diyForm.platform = properties?.purchase_link?.platform || 'IHERB'
    diyForm.linkUrl = properties?.purchase_link?.url || ''
    diyForm.imageUrl = properties?.image_url || ''

    const currentGroupId = row.value?.equivalenceGroup?.id || ''
    groupChoice.value = currentGroupId

    if (!row.value) {
      loadError.value = '在补剂上架清单里没找到这条补剂，请刷新后重试'
    }
  } catch (error) {
    loadError.value = errorMessage(error, '落地配置加载失败')
  } finally {
    loading.value = false
  }
}

async function saveArchive(patch: UpdateSupplementCatalogItemDto) {
  if (!row.value) return
  savingArchive.value = true
  try {
    const updated = await supplementShopApi.updateItem(row.value.id, patch)
    row.value = updated as CatalogRow
    decisions.retail = updated.supplementRetailEnabled === true
    if (decisions.retail) decisions.noSaleReason = null
    ElMessage.success(decisions.retail ? '已上架' : '已保存（未上架）')
  } catch (error) {
    // 后端会回滚上架开关：把行状态刷新成真实值
    await load()
    ElMessage.error(errorMessage(error, '保存失败'))
  } finally {
    savingArchive.value = false
  }
}

async function saveDiy() {
  savingDiy.value = true
  try {
    const existing = (ingredient.value?.properties || {}) as Record<string, unknown>
    const purchaseLink = diyForm.linkUrl.trim()
      ? { platform: diyForm.platform, url: diyForm.linkUrl.trim() }
      : null
    const properties = mergeIngredientProperties(existing, {
      purchase_link: purchaseLink,
      image_url: diyForm.imageUrl.trim() || null,
    })

    await ingredientApi.update(props.ingredientId, {
      diyEnabled: diyForm.enabled,
      properties,
    } as any)

    decisions.diy = diyForm.enabled
    ingredient.value = { ...(ingredient.value || {}), diyEnabled: diyForm.enabled, properties }
    ElMessage.success('DIY 配置已保存')
  } catch (error) {
    ElMessage.error(errorMessage(error, '保存失败'))
  } finally {
    savingDiy.value = false
  }
}

async function saveProcurement() {
  savingProc.value = true
  try {
    await ingredientApi.update(props.ingredientId, {
      procurementEnabled: procForm.enabled,
    } as any)
    decisions.procurement = procForm.enabled
    ingredient.value = { ...(ingredient.value || {}), procurementEnabled: procForm.enabled }
    ElMessage.success('采购配置已保存')
  } catch (error) {
    ElMessage.error(errorMessage(error, '保存失败'))
  } finally {
    savingProc.value = false
  }
}

async function saveGroup() {
  if (!groupChoice.value) {
    ElMessage.warning('请选择等价组，或选「暂不归组」')
    return
  }
  savingGroup.value = true
  try {
    const currentGroupId = row.value?.equivalenceGroup?.id || ''
    if (groupChoice.value === GROUP_SKIPPED) {
      if (currentGroupId) {
        await supplementEquivalenceApi.removeMember(currentGroupId, props.ingredientId)
      }
      decisions.group = GROUP_SKIPPED
    } else {
      await supplementEquivalenceApi.assign([props.ingredientId], groupChoice.value)
      decisions.group = groupChoice.value
    }
    await load()
    ElMessage.success('等价组已保存')
  } catch (error) {
    ElMessage.error(errorMessage(error, '保存失败'))
  } finally {
    savingGroup.value = false
  }
}

const confirmedCount = computed(() => 4 - missingDecisions(decisions).filter((key) => key !== '不上架原因').length)

const missing = computed(() => missingDecisions(decisions))

const verdict = computed(() =>
  evaluateLaunch({
    retailEnabled: row.value?.supplementRetailEnabled === true,
    issues: row.value?.issues || [],
    hasPurchaseLink: Boolean(diyForm.linkUrl.trim()),
    diyEnabled: diyForm.enabled,
    groupStatus: row.value?.equivalenceGroup?.status ?? null,
    groupMembers: row.value?.equivalenceGroup?.memberCount ?? 0,
  }),
)

const verdictTitle = computed(() => {
  if (verdict.value.level === 'READY') return '✅ 顾客可以买'
  if (verdict.value.level === 'WARN') return '⚠️ 能买，但有需要补的'
  return '❌ 现在买不到'
})

const previewText = computed(() => {
  const hasError = (row.value?.issues || []).some((issue) => issue.level === 'ERROR')
  const retail = row.value?.supplementRetailEnabled === true
  const group = row.value?.equivalenceGroup
  const candidateCount =
    !retail || hasError
      ? 0
      : group && group.status === 'APPROVED' && group.memberCount >= 2
        ? group.memberCount
        : 1
  return describeSheetPreview({ retailEnabled: retail, hasError, candidateCount })
})

const groupChip = computed(() => {
  if (decisions.group === GROUP_SKIPPED) return '暂不归组'
  const group = groups.value.find((item) => item.id === decisions.group)
  return group ? group.name : '已归组'
})

const selectedGroupHint = computed(() => {
  if (groupChoice.value === GROUP_SKIPPED || !groupChoice.value) return ''
  const group = groups.value.find((item) => item.id === groupChoice.value)
  if (!group) return ''
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
.launch-verdict__missing {
  font-size: 12px;
  color: #e6a23c;
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
</style>
