<template>
  <section class="draft-section">
    <div class="draft-section__group">
      <h4 class="draft-section__title">上架意向</h4>
      <div class="draft-section__row">
        <span class="draft-field__label">
          <span>是否上架补剂商城</span>
          <AiFieldTag :tag="aiTag('retail.enabled')" />
          <span
            v-if="isManual('retail.enabled')"
            class="draft-field__manual"
            title="你手动改过，AI 不会覆盖"
          >
            人改
          </span>
        </span>
        <el-switch
          :model-value="retail.enabled"
          active-text="上架"
          inactive-text="不上架"
          @update:model-value="(value: boolean | string | number) => updateEnabled(value === true)"
        />
        <em class="draft-field__hint">
          这是草稿意向；最终写入时才落到原料档案的商城开关。
        </em>
      </div>

      <el-alert
        v-if="retail.enabled && shelfLifeMissing"
        type="warning"
        :closable="false"
        show-icon
        class="draft-section__alert"
        title="上架必须填原厂保质期（月），否则最终校验会阻断。"
      />
    </div>

    <div class="draft-section__group">
      <h4 class="draft-section__title">保质期与储存</h4>
      <div class="draft-section__grid">
        <label class="draft-field">
          <span class="draft-field__label">
            <span>原厂保质期（月）</span>
            <AiFieldTag :tag="aiTag('retail.shelfLifeMonths')" />
            <span
              v-if="isManual('retail.shelfLifeMonths')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-input-number
            :model-value="retail.shelfLifeMonths ?? undefined"
            :min="1"
            :precision="0"
            controls-position="right"
            style="width: 100%"
            @update:model-value="
              (value: number | undefined) =>
                update('shelfLifeMonths', value ?? null)
            "
          />
          <em v-if="!retail.shelfLifeMonths && missingReason('retail.shelfLifeMonths')" class="draft-field__missing" :title="missingReason('retail.shelfLifeMonths')">
            AI 没找到，请补
          </em>
          <em class="draft-field__hint">标签上写的未开封保质期，按整月填。</em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>开盖后保质期（天）</span>
            <span
              v-if="isManual('retail.openedShelfLifeDays')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-input-number
            :model-value="retail.openedShelfLifeDays ?? undefined"
            :min="1"
            :precision="0"
            controls-position="right"
            style="width: 100%"
            @update:model-value="
              (value: number | undefined) =>
                update('openedShelfLifeDays', value ?? null)
            "
          />
          <em class="draft-field__hint">标签写了才填；没写就留空。</em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>储存条件（选填）</span>
            <AiFieldTag :tag="aiTag('retail.storageCondition')" />
            <span
              v-if="isManual('retail.storageCondition')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-input
            :model-value="retail.storageCondition"
            placeholder="不填默认：避光、密封、阴凉干燥处保存"
            maxlength="200"
            @update:model-value="(value: string) => update('storageCondition', value)"
          />
          <em class="draft-field__hint">
            不填时订单标签用默认「避光、密封、阴凉干燥处保存」；有特殊要求再填。
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>内容物是否油性</span>
            <AiFieldTag :tag="aiTag('retail.isOilBased')" />
            <span
              v-if="isManual('retail.isOilBased')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-switch
            :model-value="retail.isOilBased"
            active-text="油性"
            inactive-text="非油性"
            @update:model-value="
              (value: boolean | string | number) =>
                update('isOilBased', value === true)
            "
          />
          <em class="draft-field__hint">油性内容物会影响包材匹配。</em>
        </label>
      </div>

      <div v-if="!retail.enabled" class="draft-section__row" style="margin-top: 14px">
        <label class="draft-field" style="flex: 1">
          <span class="draft-field__label">
            <span>不上架原因（选填）</span>
            <AiFieldTag :tag="aiTag('retail.noSaleReason')" />
            <span
              v-if="isManual('retail.noSaleReason')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-select
            :model-value="retail.noSaleReason ?? undefined"
            placeholder="四选一"
            style="width: 100%"
            @update:model-value="(value: string) => updateNoSaleReason(value)"
          >
            <el-option
              v-for="option in noSaleReasons"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <em class="draft-field__hint">
            选填；填了方便以后说明为什么没上架，不填不影响写入和配方使用。
          </em>
          <em class="draft-field__hint">
            不上架时必选；原因会写进原料 properties，制作单据此提示。
          </em>
        </label>
      </div>
    </div>

    <div class="draft-section__group">
      <h4 class="draft-section__title">参考成本（只读试算）</h4>
      <p class="draft-section__readonly">
        采购口径：1 {{ purchaseUnit || '个采购单位' }} =
        {{ purchaseToBaseRatio ?? '—' }} {{ unitLabel }}，进货价
        {{ priceText }}；折合每 1 {{ unitLabel }} 约
        <strong>{{ perUnitCostText }}</strong>
        （未含生产损耗，最终以商城配置试算为准）。
      </p>
      <em class="draft-field__hint">
        这里只做成本核对，不写价格；售价与包材费用由补剂商城配置统一试算。
      </em>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * ④ 上架与商城（spec §12.4）。
 *
 * 只编辑草稿意向；保质期/储存/油性/不上架原因是最终写入的字段。
 * 参考成本是只读试算，不调商城报价接口，避免一个编辑页里再叠一层
 * “配置改了价格跟着动”的不确定性。
 */
import { computed } from 'vue'
import type {
  SupplementDraftAiSnapshot,
  SupplementDraftRetail
} from '@/api/supplementDrafts'
import { NO_SALE_REASONS, type NoSaleReason } from '../../launchConfigState'
import { isManualDraftPath } from '../supplementDraftState'
import AiFieldTag from './AiFieldTag.vue'
import { aiFieldTag, aiMissingReason } from './aiFieldMeta'

const props = defineProps<{
  aiSnapshot?: SupplementDraftAiSnapshot | null
  /** 采购单位 / 换算倍数 / 进货价 / 展示单位：来自「商品与基本信息」，只读展示 */
  purchaseUnit: string
  purchaseToBaseRatio: number | null
  currentPricePerPurchaseUnit: number | null
  unitDisplayLabel: string
  /** 人改过的字段路径；用于显示「人改」标记 */
  manualFields?: string[]
  /** 只有人的输入事件才调用它（初始加载/AI 回写都不调用） */
  markManual?: (path: string) => void
}>()

const retail = defineModel<SupplementDraftRetail>({ required: true })

const noSaleReasons = NO_SALE_REASONS

const unitLabel = computed(
  () => props.unitDisplayLabel.trim() || '个基准单位'
)

const shelfLifeMissing = computed(
  () =>
    !(
      typeof retail.value.shelfLifeMonths === 'number' &&
      Number.isFinite(retail.value.shelfLifeMonths) &&
      retail.value.shelfLifeMonths > 0
    )
)

const priceText = computed(() =>
  typeof props.currentPricePerPurchaseUnit === 'number'
    ? `¥${props.currentPricePerPurchaseUnit}`
    : '—'
)

/** 每 1 个基准单位的粗略成本；只用于让人核对量级，不做定价。 */
const perUnitCostText = computed(() => {
  const price = props.currentPricePerPurchaseUnit
  const ratio = props.purchaseToBaseRatio
  if (
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price <= 0 ||
    typeof ratio !== 'number' ||
    !Number.isFinite(ratio) ||
    ratio <= 0
  ) {
    return '—'
  }
  return `¥${Number((price / ratio).toFixed(4))}`
})

function isManual(path: string): boolean {
  return isManualDraftPath(path, props.manualFields ?? [])
}

const aiTag = (path: string) =>
  aiFieldTag(props.aiSnapshot, path, props.manualFields ?? [])
const missingReason = (path: string) => aiMissingReason(props.aiSnapshot, path)

function update<K extends keyof SupplementDraftRetail>(
  key: K,
  value: SupplementDraftRetail[K]
): void {
  props.markManual?.(`retail.${String(key)}`)
  retail.value[key] = value
}

function updateEnabled(value: boolean): void {
  props.markManual?.('retail.enabled')
  retail.value.enabled = value
}

function updateNoSaleReason(value: string): void {
  props.markManual?.('retail.noSaleReason')
  retail.value.noSaleReason = value as NoSaleReason
}
</script>

<style scoped src="./draftSection.css"></style>

<style scoped>
.draft-section__alert {
  margin-top: 12px;
}
</style>
