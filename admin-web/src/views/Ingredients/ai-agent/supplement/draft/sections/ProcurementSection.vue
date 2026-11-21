<template>
  <section class="draft-section">
    <div class="draft-section__group">
      <h4 class="draft-section__title">生产采购意向</h4>
      <div class="draft-section__row">
        <span class="draft-field__label">
          <span>是否用于生产/采购</span>
          <span
            v-if="isManual('procurement.enabled')"
            class="draft-field__manual"
            title="你手动改过，AI 不会覆盖"
          >
            人改
          </span>
        </span>
        <el-switch
          :model-value="procurement.enabled"
          active-text="用于生产/采购"
          inactive-text="不用于生产"
          @update:model-value="(value: boolean | string | number) => updateEnabled(value === true)"
        />
      </div>
      <p class="draft-section__readonly" style="margin-top: 14px">
        采购口径沿用「商品与基本信息」：1 {{ purchaseUnit || '个采购单位' }} =
        {{ purchaseToBaseRatio ?? '—' }} {{ unitLabel }}，进货价
        {{ priceText }}。要改单位/倍数/价格，回「商品与基本信息」修改，避免两处填出两套口径。
      </p>
    </div>

    <div class="draft-section__group">
      <h4 class="draft-section__title">采购 SKU</h4>
      <p class="draft-section__readonly">
        采购 SKU 可选，没建也能用原料档案兜底；这里不填不会阻塞最终写入。
      </p>
      <em class="draft-field__hint">
        生成采购需求时会优先匹配 SKU；没有 SKU 时按原料档案里的采购单位、倍数、价格下单。
      </em>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * ⑥ 生产采购（spec §12.6）。
 *
 * 草稿里只有 `procurement.enabled`；采购单位/倍数/价格都复用 basic，
 * 这里只读展示，避免同一份口径在两处被改出差异。
 */
import { computed } from 'vue'
import type { SupplementDraftProcurement } from '@/api/supplementDrafts'
import { isManualDraftPath } from '../supplementDraftState'

const props = defineProps<{
  /** 采购口径（来自「商品与基本信息」），只读 */
  purchaseUnit: string
  purchaseToBaseRatio: number | null
  currentPricePerPurchaseUnit: number | null
  unitDisplayLabel: string
  /** 人改过的字段路径；用于显示「人改」标记 */
  manualFields?: string[]
  /** 只有人的输入事件才调用它（初始加载/AI 回写都不调用） */
  markManual?: (path: string) => void
}>()

const procurement = defineModel<SupplementDraftProcurement>({ required: true })

const unitLabel = computed(
  () => props.unitDisplayLabel.trim() || '个基准单位'
)

const priceText = computed(() =>
  typeof props.currentPricePerPurchaseUnit === 'number'
    ? `¥${props.currentPricePerPurchaseUnit}`
    : '—'
)

function isManual(path: string): boolean {
  return isManualDraftPath(path, props.manualFields ?? [])
}

function updateEnabled(value: boolean): void {
  props.markManual?.('procurement.enabled')
  procurement.value.enabled = value
}
</script>

<style scoped src="./draftSection.css"></style>
